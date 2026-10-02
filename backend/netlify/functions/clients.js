import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { ObjectId } from "mongodb";
import { verifyRequestToken, getAuditFieldsFromEvent } from "./utils/auth.js";

const CLIENTS_META_CACHE_TTL_MS = 60000;
let clientsMetaCache = {
  value: null,
  expiresAt: 0,
};

const buildClientIdFromNameAndMobile = ({ name = "", phoneNumber = "" }) => {
  const normalizedPhone = String(phoneNumber).replace(/\D/g, "");
  const normalizedName = String(name)
    .replace(/[^a-zA-Z]/g, "")
    .toUpperCase();

  if (normalizedPhone.length !== 10 || normalizedName.length < 2) {
    return null;
  }

  return `MC${normalizedPhone.slice(0, 2)}${normalizedName.slice(0, 2)}${normalizedPhone.slice(-6)}`;
};

/**
 * Client Management API
 * Handles CRUD operations for clients with pagination support
 * Requires JWT authentication
 */
export async function handler(event) {
  // Extract origin for CORS
  const origin = event.headers.origin || event.headers.Origin;

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return createResponse(200, {}, origin, event);
  }

  try {
    // Verify JWT token
    const user = verifyRequestToken(event);

    const { db } = await connectToDatabase();
    const clientsCollection = db.collection("clients");

    // GET - Fetch all clients or specific client by ID with pagination support
    if (event.httpMethod === "GET") {
      const {
        action,
        id,
        page = 1,
        limit = 10,
        includeMeta = "true",
        search,
        status,
        gstStatus,
        placeOfSupply,
        createdDateTime_start,
        createdDateTime_end,
        sortBy = "createdAt",
        sortOrder = "desc",
        filter, // For card filters
      } = event.queryStringParameters || {};

      if (action === "generate-client-id") {
        const generatedClientId = buildClientIdFromNameAndMobile({
          name: event.queryStringParameters?.name,
          phoneNumber: event.queryStringParameters?.phoneNumber,
        });

        if (!generatedClientId) {
          return createResponse(400,
            {
              error:
                "A valid 10-digit phone number and minimum 2-letter client name are required.",
            },
            origin, event);
        }

        const existingClient = await clientsCollection.findOne({
          clientId: generatedClientId,
          isDeleted: { $ne: true },
        });

        return createResponse(200,
          {
            clientId: generatedClientId,
            exists: Boolean(existingClient),
          },
          origin, event);
      }

      // If ID is provided, return single client
      if (id) {
        const client = await clientsCollection.findOne({
          _id: new ObjectId(id),
          isDeleted: { $ne: true },
        });
        if (!client) {
          return createResponse(404, { error: "Client not found" }, origin, event);
        }
        return createResponse(200, client, origin, event);
      }

      // Build filter query
      const filterQuery = { isDeleted: { $ne: true } };
      const params = event.queryStringParameters || {};

      Object.entries(params).forEach(([key, value]) => {
        if (!value || value === "" || value === "All") return;
        // Card filter (handled below)
        if (key === "filter") return;
        // Pagination/sort/search keys
        if (
          ["page", "limit", "sortBy", "sortOrder", "search", "id"].includes(key)
        )
          return;

        // Handle date range filter: look for *_start and *_end
        if (key.endsWith("_start") || key.endsWith("_end")) return;

        // Special mapping for gstStatus dropdown
        if (key === "gstStatus") {
          if (value === "Registered") filterQuery.hasGSTIN = true;
          else if (value === "Unregistered") filterQuery.hasGSTIN = false;
          return;
        }

        // If value is comma-separated, treat as array
        if (typeof value === "string" && value.includes(",")) {
          filterQuery[key] = {
            $in: value.split(",").map((v) => v.trim()),
          };
        } else if (typeof value === "string") {
          // Exact match for dropdown columns
          if (["status", "placeOfSupply"].includes(key)) {
            filterQuery[key] = value.trim();
          } else {
            // Text search fields
            filterQuery[key] = { $regex: value.trim(), $options: "i" };
          }
        } else {
          filterQuery[key] = value;
        }
      });

      // Handle date range filters dynamically
      // Process date ranges from query parameters
      const dateRanges = {};

      Object.entries(params).forEach(([key, value]) => {
        if (!value) return;

        if (key.endsWith("_start")) {
          let baseKey = key.replace(/_start$/, "");
          // Map createdDateTime to createdAt for backend query
          if (baseKey === "createdDateTime") baseKey = "createdAt";

          if (!dateRanges[baseKey]) dateRanges[baseKey] = {};

          // Parse date from YYYY-MM-DD format
          const dateParts = value.split("-");
          if (dateParts.length === 3) {
            const year = parseInt(dateParts[0]);
            const month = parseInt(dateParts[1]) - 1; // Month is 0-indexed
            const day = parseInt(dateParts[2]);
            const startDate = new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
            dateRanges[baseKey].$gte = startDate;
          }
        }

        if (key.endsWith("_end")) {
          let baseKey = key.replace(/_end$/, "");
          if (baseKey === "createdDateTime") baseKey = "createdAt";

          if (!dateRanges[baseKey]) dateRanges[baseKey] = {};

          // Parse date from YYYY-MM-DD format
          const dateParts = value.split("-");
          if (dateParts.length === 3) {
            const year = parseInt(dateParts[0]);
            const month = parseInt(dateParts[1]) - 1; // Month is 0-indexed
            const day = parseInt(dateParts[2]);
            const endDate = new Date(
              Date.UTC(year, month, day, 23, 59, 59, 999),
            );
            dateRanges[baseKey].$lte = endDate;
          }
        }
      });

      // Merge date ranges into filterQuery
      Object.entries(dateRanges).forEach(([key, range]) => {
        filterQuery[key] = range;
      });

      // Card filter (activeCardFilter)
      if (filter) {
        switch (filter) {
          case "active":
            filterQuery.status = "Active";
            break;
          case "inactive":
            filterQuery.status = "Inactive";
            break;
          case "withGST":
            filterQuery.hasGSTIN = true;
            break;
          case "withoutGST":
            filterQuery.hasGSTIN = false;
            break;
          default:
            break;
        }
      }

      // Global search (multi-field)
      if (search) {
        filterQuery.$or = [
          { clientName: { $regex: search, $options: "i" } },
          { businessName: { $regex: search, $options: "i" } },
          { clientId: { $regex: search, $options: "i" } },
          { phoneNumber: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { gstin: { $regex: search, $options: "i" } },
        ];
      }

      // Parse pagination parameters
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      // Build sort object
      const sortObject = {};
      sortObject[sortBy] = sortOrder === "asc" ? 1 : -1;
      const shouldIncludeMeta = includeMeta !== "false";

      // Get total count for pagination
      const totalRecords = await clientsCollection.countDocuments(filterQuery);

      // Get paginated results
      const clients = await clientsCollection
        .find(filterQuery)
        .sort(sortObject)
        .skip(skip)
        .limit(limitNum)
        .toArray();

      let placeOfSupplyValues = [];
      let statusValues = [];
      let gstStatusValues = [];
      let totalActive = 0;
      let totalInactive = 0;
      let totalWithGST = 0;
      let totalWithoutGST = 0;

      if (shouldIncludeMeta) {
        if (clientsMetaCache.value && clientsMetaCache.expiresAt > Date.now()) {
          ({
            placeOfSupplyValues,
            statusValues,
            gstStatusValues,
            totalActive,
            totalInactive,
            totalWithGST,
            totalWithoutGST,
          } = clientsMetaCache.value);
        } else {
          const [
            distinctPlaceValues,
            distinctStatusValues,
            gstStatusRaw,
            activeCount,
            inactiveCount,
            withGstCount,
            withoutGstCount,
          ] = await Promise.all([
            clientsCollection.distinct("placeOfSupply", {
              isDeleted: { $ne: true },
              placeOfSupply: { $exists: true, $ne: "" },
            }),
            clientsCollection.distinct("status", {
              isDeleted: { $ne: true },
              status: { $exists: true, $ne: "" },
            }),
            clientsCollection.distinct("hasGSTIN", {
              isDeleted: { $ne: true },
              hasGSTIN: { $exists: true },
            }),
            clientsCollection.countDocuments({
              isDeleted: { $ne: true },
              status: "Active",
            }),
            clientsCollection.countDocuments({
              isDeleted: { $ne: true },
              status: "Inactive",
            }),
            clientsCollection.countDocuments({
              isDeleted: { $ne: true },
              hasGSTIN: true,
            }),
            clientsCollection.countDocuments({
              isDeleted: { $ne: true },
              hasGSTIN: false,
            }),
          ]);

          placeOfSupplyValues = distinctPlaceValues;
          statusValues = distinctStatusValues;
          gstStatusValues = gstStatusRaw.map((val) =>
            val ? "Registered" : "Unregistered",
          );
          totalActive = activeCount;
          totalInactive = inactiveCount;
          totalWithGST = withGstCount;
          totalWithoutGST = withoutGstCount;

          clientsMetaCache = {
            value: {
              placeOfSupplyValues,
              statusValues,
              gstStatusValues,
              totalActive,
              totalInactive,
              totalWithGST,
              totalWithoutGST,
            },
            expiresAt: Date.now() + CLIENTS_META_CACHE_TTL_MS,
          };
        }
      }

      // Return paginated response with metadata
      return createResponse(200,
        {
          data: clients,
          pagination: {
            page: pageNum,
            limit: limitNum,
            totalRecords,
            totalPages: Math.ceil(totalRecords / limitNum),
          },
          ...(shouldIncludeMeta
            ? {
                statistics: {
                  total: totalRecords,
                  active: totalActive,
                  inactive: totalInactive,
                  withGST: totalWithGST,
                  withoutGST: totalWithoutGST,
                },
                filterOptions: {
                  placeOfSupply: ["All", ...placeOfSupplyValues.sort()],
                  status: ["All", ...statusValues.sort()],
                  gstStatus: ["All", ...gstStatusValues],
                },
              }
            : {}),
        },
        origin, event);
    }

    // GET - Statistics endpoint
    if (event.httpMethod === "GET" && event.path?.includes("/statistics")) {
      const totalActive = await clientsCollection.countDocuments({
        isDeleted: { $ne: true },
        status: "Active",
      });

      const totalInactive = await clientsCollection.countDocuments({
        isDeleted: { $ne: true },
        status: "Inactive",
      });

      const totalWithGST = await clientsCollection.countDocuments({
        isDeleted: { $ne: true },
        hasGSTIN: true,
      });

      const totalWithoutGST = await clientsCollection.countDocuments({
        isDeleted: { $ne: true },
        hasGSTIN: false,
      });

      const totalRecords = await clientsCollection.countDocuments({
        isDeleted: { $ne: true },
      });

      return createResponse(200,
        {
          total: totalRecords,
          active: totalActive,
          inactive: totalInactive,
          withGST: totalWithGST,
          withoutGST: totalWithoutGST,
        },
        origin, event);
    }

    // POST - Create new client
    if (event.httpMethod === "POST") {
      const clientData = JSON.parse(event.body);

      // Check for duplicate clientId
      if (clientData.clientId) {
        const existingClientId = await clientsCollection.findOne({
          clientId: clientData.clientId,
          isDeleted: { $ne: true },
        });
        if (existingClientId) {
          return createResponse(409,
            {
              error:
                "Client ID already exists. Please use a different Client ID.",
            },
            origin, event);
        }
      }

      // Check for duplicate phoneNumber
      if (clientData.phoneNumber) {
        const existingPhone = await clientsCollection.findOne({
          phoneNumber: clientData.phoneNumber,
          isDeleted: { $ne: true },
        });
        if (existingPhone) {
          return createResponse(409,
            {
              error:
                "Phone Number already registered. Please use a different number.",
            },
            origin, event);
        }
      }

      // Check for duplicate GSTIN
      if (clientData.gstin && !clientData.noGSTIN) {
        const existingGSTIN = await clientsCollection.findOne({
          gstin: clientData.gstin,
          isDeleted: { $ne: true },
        });
        if (existingGSTIN) {
          return createResponse(409,
            { error: "GSTIN already registered with another client." },
            origin, event);
        }
      }

      const result = await clientsCollection.insertOne({
        ...clientData,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...getAuditFieldsFromEvent(event, "create"),
      });

      return createResponse(201,
        {
          message: "Client created successfully",
          id: result.insertedId,
        },
        origin, event);
    }

    // PUT - Update existing client
    if (event.httpMethod === "PUT") {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(400, { error: "Client ID is required" }, origin, event);
      }

      const clientData = JSON.parse(event.body);
      const clientObjectId = new ObjectId(id);

      // Check for duplicate clientId (excluding current record)
      if (clientData.clientId) {
        const existingClientId = await clientsCollection.findOne({
          _id: { $ne: clientObjectId },
          clientId: clientData.clientId,
          isDeleted: { $ne: true },
        });
        if (existingClientId) {
          return createResponse(409,
            {
              error:
                "Client ID already exists. Please use a different Client ID.",
            },
            origin, event);
        }
      }

      // Check for duplicate phoneNumber (excluding current record)
      if (clientData.phoneNumber) {
        const existingPhone = await clientsCollection.findOne({
          _id: { $ne: clientObjectId },
          phoneNumber: clientData.phoneNumber,
          isDeleted: { $ne: true },
        });
        if (existingPhone) {
          return createResponse(409,
            { error: "Phone Number already registered with another client." },
            origin, event);
        }
      }

      // Check for duplicate GSTIN (excluding current record)
      if (clientData.gstin && !clientData.noGSTIN) {
        const existingGSTIN = await clientsCollection.findOne({
          _id: { $ne: clientObjectId },
          gstin: clientData.gstin,
          isDeleted: { $ne: true },
        });
        if (existingGSTIN) {
          return createResponse(409,
            { error: "GSTIN already registered with another client." },
            origin, event);
        }
      }

      const result = await clientsCollection.updateOne(
        { _id: clientObjectId },
        {
          $set: {
            ...clientData,
            updatedAt: new Date(),
            ...getAuditFieldsFromEvent(event, "update"),
          },
        },
      );

      if (result.matchedCount === 0) {
        return createResponse(404, { error: "Client not found" }, origin, event);
      }

      return createResponse(200,
        { message: "Client updated successfully" },
        origin, event);
    }

    // DELETE - Soft delete client (mark as deleted instead of removing)
    if (event.httpMethod === "DELETE") {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(400, { error: "Client ID is required" }, origin, event);
      }

      const result = await clientsCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            isDeleted: true,
            deletedAt: new Date(),
            updatedAt: new Date(),
            ...getAuditFieldsFromEvent(event, "delete"),
          },
        },
      );

      if (result.matchedCount === 0) {
        return createResponse(404, { error: "Client not found" }, origin, event);
      }

      return createResponse(200,
        { message: "Client deleted successfully" },
        origin, event);
    }

    return createResponse(405, { error: "Method not allowed" }, origin, event);
  } catch (error) {
    console.error("API Error:", error);

    // Handle authentication errors
    if (error.message.includes("token") || error.message.includes("Token")) {
      return createResponse(401,
        {
          error: "Unauthorized",
          message: error.message,
        },
        origin, event);
    }

    return createResponse(500,
      {
        error: "Internal server error",
        message: error.message,
      },
      origin, event);
  }
}
