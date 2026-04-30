import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { ObjectId } from "mongodb";
import { verifyRequestToken, getAuditFieldsFromEvent } from "./utils/auth.js";

const VENDORS_META_CACHE_TTL_MS = 60000;
let vendorsMetaCache = {
  value: null,
  expiresAt: 0,
};

/**
 * Vendor Management API
 * Handles CRUD operations for vendors with pagination support
 * Requires JWT authentication
 */
export async function handler(event) {
  // Extract origin for CORS
  const origin = event.headers.origin || event.headers.Origin;

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return createResponse(200, {}, origin);
  }

  try {
    // Verify JWT token
    const user = verifyRequestToken(event);

    const { db } = await connectToDatabase();
    const vendorsCollection = db.collection("vendors");

    // GET - Fetch all vendors or specific vendor by ID with pagination support
    if (event.httpMethod === "GET") {
      const {
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

      // If ID is provided, return single vendor
      if (id) {
        if (!ObjectId.isValid(id)) {
          return createResponse(400, { error: "Invalid vendor ID" }, origin);
        }
        const vendor = await vendorsCollection.findOne({
          _id: new ObjectId(id),
          isDeleted: { $ne: true },
        });
        if (!vendor) {
          return createResponse(404, { error: "Vendor not found" }, origin);
        }
        return createResponse(200, vendor, origin);
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

        // Special handling for status dropdown
        if (key === "status") {
          filterQuery.status = value;
          return;
        }

        // Special handling for placeOfSupply dropdown
        if (key === "placeOfSupply") {
          filterQuery.placeOfSupply = value;
          return;
        }

        // If value is comma-separated, treat as array
        if (typeof value === "string" && value.includes(",")) {
          filterQuery[key] = { $in: value.split(",") };
        } else if (typeof value === "string") {
          // For string filters, use regex for partial match (case-insensitive)
          filterQuery[key] = { $regex: value, $options: "i" };
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
          { vendorName: { $regex: search, $options: "i" } },
          { businessName: { $regex: search, $options: "i" } },
          { phoneNumber: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { gstin: { $regex: search, $options: "i" } },
          { placeOfSupply: { $regex: search, $options: "i" } },
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
      const totalRecords = await vendorsCollection.countDocuments(filterQuery);

      // Get paginated results
      const vendors = await vendorsCollection
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
        if (vendorsMetaCache.value && vendorsMetaCache.expiresAt > Date.now()) {
          ({
            placeOfSupplyValues,
            statusValues,
            gstStatusValues,
            totalActive,
            totalInactive,
            totalWithGST,
            totalWithoutGST,
          } = vendorsMetaCache.value);
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
            vendorsCollection.distinct("placeOfSupply", {
              isDeleted: { $ne: true },
              placeOfSupply: { $exists: true, $ne: "" },
            }),
            vendorsCollection.distinct("status", {
              isDeleted: { $ne: true },
              status: { $exists: true, $ne: "" },
            }),
            vendorsCollection.distinct("hasGSTIN", {
              isDeleted: { $ne: true },
              hasGSTIN: { $exists: true },
            }),
            vendorsCollection.countDocuments({
              isDeleted: { $ne: true },
              status: "Active",
            }),
            vendorsCollection.countDocuments({
              isDeleted: { $ne: true },
              status: "Inactive",
            }),
            vendorsCollection.countDocuments({
              isDeleted: { $ne: true },
              hasGSTIN: true,
            }),
            vendorsCollection.countDocuments({
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

          vendorsMetaCache = {
            value: {
              placeOfSupplyValues,
              statusValues,
              gstStatusValues,
              totalActive,
              totalInactive,
              totalWithGST,
              totalWithoutGST,
            },
            expiresAt: Date.now() + VENDORS_META_CACHE_TTL_MS,
          };
        }
      }

      // Return paginated response with metadata
      return createResponse(
        200,
        {
          data: vendors,
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
        origin,
      );
    }

    // GET - Statistics endpoint
    if (event.httpMethod === "GET" && event.path?.includes("/statistics")) {
      const totalActive = await vendorsCollection.countDocuments({
        isDeleted: { $ne: true },
        status: "Active",
      });

      const totalInactive = await vendorsCollection.countDocuments({
        isDeleted: { $ne: true },
        status: "Inactive",
      });

      const totalWithGST = await vendorsCollection.countDocuments({
        isDeleted: { $ne: true },
        hasGSTIN: true,
      });

      const totalWithoutGST = await vendorsCollection.countDocuments({
        isDeleted: { $ne: true },
        hasGSTIN: false,
      });

      const totalRecords = await vendorsCollection.countDocuments({
        isDeleted: { $ne: true },
      });

      return createResponse(
        200,
        {
          total: totalRecords,
          active: totalActive,
          inactive: totalInactive,
          withGST: totalWithGST,
          withoutGST: totalWithoutGST,
        },
        origin,
      );
    }

    // POST - Create new vendor
    if (event.httpMethod === "POST") {
      const vendorData = JSON.parse(event.body);

      // Check for duplicate phoneNumber
      if (vendorData.phoneNumber) {
        const existingPhone = await vendorsCollection.findOne({
          phoneNumber: vendorData.phoneNumber,
          isDeleted: { $ne: true },
        });
        if (existingPhone) {
          return createResponse(
            409,
            {
              error:
                "Phone Number already registered. Please use a different number.",
            },
            origin,
          );
        }
      }

      // Check for duplicate GSTIN
      if (vendorData.gstin && !vendorData.noGSTIN) {
        const existingGSTIN = await vendorsCollection.findOne({
          gstin: vendorData.gstin,
          isDeleted: { $ne: true },
        });
        if (existingGSTIN) {
          return createResponse(
            409,
            { error: "GSTIN already registered with another vendor." },
            origin,
          );
        }
      }

      // Check for duplicate email
      if (vendorData.email) {
        const existingEmail = await vendorsCollection.findOne({
          email: vendorData.email,
          isDeleted: { $ne: true },
        });
        if (existingEmail) {
          return createResponse(
            409,
            {
              error:
                "Email already registered. Please use a different email address.",
            },
            origin,
          );
        }
      }

      // Always assign _id as ObjectId
      const docToInsert = {
        ...vendorData,
        _id: new ObjectId(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...getAuditFieldsFromEvent(event, "create"),
      };
      const result = await vendorsCollection.insertOne(docToInsert);

      return createResponse(
        201,
        {
          message: "Vendor created successfully",
          id: result.insertedId,
        },
        origin,
      );
    }

    // PUT - Update existing vendor
    if (event.httpMethod === "PUT") {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(400, { error: "Vendor ID is required" }, origin);
      }
      if (!ObjectId.isValid(id)) {
        return createResponse(400, { error: "Invalid vendor ID" }, origin);
      }
      const vendorData = JSON.parse(event.body);
      const vendorObjectId = new ObjectId(id);

      // Check for duplicate phoneNumber (excluding current record)
      if (vendorData.phoneNumber) {
        const existingPhone = await vendorsCollection.findOne({
          _id: { $ne: vendorObjectId },
          phoneNumber: vendorData.phoneNumber,
          isDeleted: { $ne: true },
        });
        if (existingPhone) {
          return createResponse(
            409,
            { error: "Phone Number already registered with another vendor." },
            origin,
          );
        }
      }

      // Check for duplicate GSTIN (excluding current record)
      if (vendorData.gstin && !vendorData.noGSTIN) {
        const existingGSTIN = await vendorsCollection.findOne({
          _id: { $ne: vendorObjectId },
          gstin: vendorData.gstin,
          isDeleted: { $ne: true },
        });
        if (existingGSTIN) {
          return createResponse(
            409,
            { error: "GSTIN already registered with another vendor." },
            origin,
          );
        }
      }

      // Check for duplicate email (excluding current record)
      if (vendorData.email) {
        const existingEmail = await vendorsCollection.findOne({
          _id: { $ne: vendorObjectId },
          email: vendorData.email,
          isDeleted: { $ne: true },
        });
        if (existingEmail) {
          return createResponse(
            409,
            { error: "Email already registered with another vendor." },
            origin,
          );
        }
      }

      const result = await vendorsCollection.updateOne(
        { _id: vendorObjectId },
        {
          $set: {
            ...vendorData,
            updatedAt: new Date(),
            ...getAuditFieldsFromEvent(event, "update"),
          },
        },
      );

      if (result.matchedCount === 0) {
        return createResponse(404, { error: "Vendor not found" }, origin);
      }

      return createResponse(
        200,
        { message: "Vendor updated successfully" },
        origin,
      );
    }

    // DELETE - Soft delete vendor (mark as deleted instead of removing)
    if (event.httpMethod === "DELETE") {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(400, { error: "Vendor ID is required" }, origin);
      }
      if (!ObjectId.isValid(id)) {
        return createResponse(400, { error: "Invalid vendor ID" }, origin);
      }
      const result = await vendorsCollection.updateOne(
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
        return createResponse(404, { error: "Vendor not found" }, origin);
      }

      return createResponse(
        200,
        { message: "Vendor deleted successfully" },
        origin,
      );
    }

    return createResponse(405, { error: "Method not allowed" }, origin);
  } catch (error) {
    console.error("API Error:", error);

    // Handle authentication errors
    if (error.message.includes("token") || error.message.includes("Token")) {
      return createResponse(
        401,
        {
          error: "Unauthorized",
          message: error.message,
        },
        origin,
      );
    }

    return createResponse(
      500,
      {
        error: "Internal server error",
        message: error.message,
      },
      origin,
    );
  }
}
