import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { ObjectId } from "mongodb";
import { verifyRequestToken } from "./utils/auth.js";

const IMAGE_FIELDS = ["profilePhotoUrl"];

const getBaseUrl = (event) => {
  const host =
    event.headers["x-forwarded-host"] || event.headers.host || "localhost:8888";

  const forwardedProto = event.headers["x-forwarded-proto"];
  const isLocalHost = host.includes("localhost") || host.includes("127.0.0.1");

  const protocol = forwardedProto || (isLocalHost ? "http" : "https");
  return `${protocol}://${host}`;
};

const normalizeHttpsUrl = (value) => {
  if (!value || typeof value !== "string") return "";
  if (value.startsWith("https://")) return value;
  if (value.startsWith("http://")) {
    return value.replace("http://", "https://");
  }
  return value;
};

const isManagedStaffAssetUrl = (value) =>
  typeof value === "string" &&
  value.includes("/api/staff") &&
  !value.startsWith("data:image/");

const parseDataUrl = (dataUrl) => {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;

  return {
    mimeType: match[1],
    data: match[2],
  };
};

const mapStaffForClient = (document, event) => {
  if (!document) return null;

  const mapped = { ...document };

  for (const field of IMAGE_FIELDS) {
    const value = document[field];
    if (!value || typeof value !== "string") {
      mapped[field] = "";
      continue;
    }

    if (value.startsWith("data:image/") || isManagedStaffAssetUrl(value)) {
      const staffId = document?._id?.toString();
      const version = document?.updatedAt
        ? new Date(document.updatedAt).getTime()
        : document?.createdAt
          ? new Date(document.createdAt).getTime()
          : Date.now();

      mapped[field] = staffId
        ? `${getBaseUrl(event)}/api/staff?id=${staffId}&asset=${field}&v=${version}`
        : "";
      continue;
    }

    mapped[field] = normalizeHttpsUrl(value);
  }

  return mapped;
};

/**
 * Staff Management API
 * Handles CRUD operations for staff
 * Requires JWT authentication
 */
export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === "OPTIONS") {
    return createResponse(200, {}, origin);
  }

  try {
    const { db } = await connectToDatabase();
    const staffCollection = db.collection("staff");

    if (event.httpMethod === "GET") {
      const {
        id,
        asset,
        page = 1,
        limit = 10,
        includeMeta = "true",
        search,
        sortBy = "createdAt",
        sortOrder = "desc",
        filter,
      } = event.queryStringParameters || {};

      // Allow public access to staff assets (images)
      if (id && asset) {
        if (!IMAGE_FIELDS.includes(asset)) {
          return createResponse(400, { error: "Invalid asset field" }, origin);
        }
        if (!ObjectId.isValid(id)) {
          return createResponse(400, { error: "Invalid staff ID" }, origin);
        }
        const staff = await staffCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!staff) {
          return createResponse(404, { error: "Staff not found" }, origin);
        }

        const assetValue = staff[asset];
        if (!assetValue || typeof assetValue !== "string") {
          return createResponse(404, { error: "Asset not found" }, origin);
        }

        if (assetValue.startsWith("data:image/")) {
          const parsedAsset = parseDataUrl(assetValue);
          if (!parsedAsset) {
            return createResponse(
              400,
              { error: "Invalid asset data format" },
              origin,
            );
          }

          return {
            statusCode: 200,
            isBase64Encoded: true,
            headers: {
              "Content-Type": parsedAsset.mimeType,
              "Cache-Control": "public, max-age=31536000, immutable",
            },
            body: parsedAsset.data,
          };
        }

        const redirectUrl = normalizeHttpsUrl(assetValue);
        if (
          redirectUrl.startsWith("https://") ||
          redirectUrl.startsWith("http://")
        ) {
          return {
            statusCode: 302,
            headers: {
              Location: redirectUrl,
              "Cache-Control": "public, max-age=3600",
            },
            body: "",
          };
        }

        return createResponse(400, { error: "Asset data not found" }, origin);
      }

      // Require authentication for data requests (non-asset GET requests)
      verifyRequestToken(event);

      if (id) {
        if (!ObjectId.isValid(id)) {
          return createResponse(400, { error: "Invalid staff ID" }, origin);
        }
        const staff = await staffCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!staff) {
          return createResponse(404, { error: "Staff not found" }, origin);
        }
        return createResponse(200, mapStaffForClient(staff, event), origin);
      }

      const params = event.queryStringParameters || {};
      const filterQuery = { isDeleted: { $ne: true } };

      Object.entries(params).forEach(([key, value]) => {
        if (!value || value === "" || value === "All") return;
        if (key === "filter") return;

        if (
          [
            "id",
            "asset",
            "page",
            "limit",
            "search",
            "sortBy",
            "sortOrder",
          ].includes(key)
        ) {
          return;
        }

        if (key.endsWith("_start") || key.endsWith("_end")) return;

        if (key === "photoStatus") {
          if (value === "Available") {
            filterQuery.profilePhotoUrl = {
              $exists: true,
              $nin: ["", null],
            };
          } else if (value === "Not Available") {
            filterQuery.$or = [
              { profilePhotoUrl: { $exists: false } },
              { profilePhotoUrl: "" },
              { profilePhotoUrl: null },
            ];
          }
          return;
        }

        if (typeof value === "string" && value.includes(",")) {
          filterQuery[key] = {
            $in: value
              .split(",")
              .map((row) => row.trim())
              .filter(Boolean),
          };
          return;
        }

        if (["status", "department", "designation"].includes(key)) {
          filterQuery[key] = String(value).trim();
          return;
        }

        filterQuery[key] = { $regex: String(value).trim(), $options: "i" };
      });

      const dateRanges = {};
      Object.entries(params).forEach(([key, value]) => {
        if (!value) return;

        if (key.endsWith("_start")) {
          let baseKey = key.replace(/_start$/, "");
          if (baseKey === "createdDateTime") baseKey = "createdAt";

          if (!dateRanges[baseKey]) dateRanges[baseKey] = {};

          const dateParts = String(value).split("-");
          if (dateParts.length === 3) {
            const year = parseInt(dateParts[0], 10);
            const month = parseInt(dateParts[1], 10) - 1;
            const day = parseInt(dateParts[2], 10);
            dateRanges[baseKey].$gte = new Date(
              Date.UTC(year, month, day, 0, 0, 0, 0),
            );
          }
        }

        if (key.endsWith("_end")) {
          let baseKey = key.replace(/_end$/, "");
          if (baseKey === "createdDateTime") baseKey = "createdAt";

          if (!dateRanges[baseKey]) dateRanges[baseKey] = {};

          const dateParts = String(value).split("-");
          if (dateParts.length === 3) {
            const year = parseInt(dateParts[0], 10);
            const month = parseInt(dateParts[1], 10) - 1;
            const day = parseInt(dateParts[2], 10);
            dateRanges[baseKey].$lte = new Date(
              Date.UTC(year, month, day, 23, 59, 59, 999),
            );
          }
        }
      });

      Object.entries(dateRanges).forEach(([key, range]) => {
        filterQuery[key] = range;
      });

      if (filter) {
        if (filter === "active") {
          filterQuery.status = "Active";
        }
        if (filter === "inactive") {
          filterQuery.status = "Inactive";
        }
        if (filter === "withPhoto") {
          filterQuery.profilePhotoUrl = {
            $exists: true,
            $nin: ["", null],
          };
        }
        if (filter === "withoutPhoto") {
          filterQuery.$or = [
            { profilePhotoUrl: { $exists: false } },
            { profilePhotoUrl: "" },
            { profilePhotoUrl: null },
          ];
        }
      }

      if (search) {
        filterQuery.$and = [
          ...(Array.isArray(filterQuery.$and) ? filterQuery.$and : []),
          {
            $or: [
              { developerName: { $regex: search, $options: "i" } },
              { fatherName: { $regex: search, $options: "i" } },
              { phoneNumber: { $regex: search, $options: "i" } },
              { emergencyContact: { $regex: search, $options: "i" } },
              { email: { $regex: search, $options: "i" } },
              { githubUsername: { $regex: search, $options: "i" } },
              { designation: { $regex: search, $options: "i" } },
              { department: { $regex: search, $options: "i" } },
              { pnaNumber: { $regex: search, $options: "i" } },
              { panNumber: { $regex: search, $options: "i" } },
            ],
          },
        ];
      }

      const pageNum = Math.max(parseInt(page, 10) || 1, 1);
      const limitNum = Math.max(parseInt(limit, 10) || 10, 1);
      const skip = (pageNum - 1) * limitNum;

      const sortFieldMapping = {
        createdDateTime: "createdAt",
      };

      const sortObject = {};
      sortObject[sortFieldMapping[sortBy] || sortBy] =
        sortOrder === "asc" ? 1 : -1;
      const shouldIncludeMeta = includeMeta !== "false";

      const totalRecords = await staffCollection.countDocuments(filterQuery);

      const staffList = await staffCollection
        .find(filterQuery)
        .sort(sortObject)
        .skip(skip)
        .limit(limitNum)
        .toArray();

      let statusValues = [];
      let totalActive = 0;
      let totalInactive = 0;
      let totalWithPhoto = 0;
      let totalWithoutPhoto = 0;

      if (shouldIncludeMeta) {
        [
          statusValues,
          totalActive,
          totalInactive,
          totalWithPhoto,
          totalWithoutPhoto,
        ] = await Promise.all([
          staffCollection.distinct("status", {
            isDeleted: { $ne: true },
            status: { $exists: true, $ne: "" },
          }),
          staffCollection.countDocuments({
            isDeleted: { $ne: true },
            status: "Active",
          }),
          staffCollection.countDocuments({
            isDeleted: { $ne: true },
            status: "Inactive",
          }),
          staffCollection.countDocuments({
            isDeleted: { $ne: true },
            profilePhotoUrl: { $exists: true, $nin: ["", null] },
          }),
          staffCollection.countDocuments({
            isDeleted: { $ne: true },
            $or: [
              { profilePhotoUrl: { $exists: false } },
              { profilePhotoUrl: "" },
              { profilePhotoUrl: null },
            ],
          }),
        ]);
      }

      const mappedStaff = staffList.map((staff) =>
        mapStaffForClient(staff, event),
      );

      return createResponse(
        200,
        {
          data: mappedStaff,
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
                  withPhoto: totalWithPhoto,
                  withoutPhoto: totalWithoutPhoto,
                },
                filterOptions: {
                  status: ["All", ...statusValues.sort()],
                  photoStatus: ["All", "Available", "Not Available"],
                },
              }
            : {}),
        },
        origin,
      );
    }

    // All non-GET requests require authentication
    verifyRequestToken(event);

    if (event.httpMethod === "POST") {
      const staffData = JSON.parse(event.body);

      if (isManagedStaffAssetUrl(staffData.profilePhotoUrl)) {
        delete staffData.profilePhotoUrl;
      }

      if (staffData.phoneNumber) {
        const existingPhone = await staffCollection.findOne({
          phoneNumber: staffData.phoneNumber,
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

      if (staffData.email) {
        const existingEmail = await staffCollection.findOne({
          email: staffData.email,
          isDeleted: { $ne: true },
        });
        if (existingEmail) {
          return createResponse(
            409,
            {
              error: "Email already registered. Please use a different email.",
            },
            origin,
          );
        }
      }

      if (staffData.aadharNumber) {
        const existingAadhar = await staffCollection.findOne({
          aadharNumber: staffData.aadharNumber,
          isDeleted: { $ne: true },
        });
        if (existingAadhar) {
          return createResponse(
            409,
            {
              error:
                "Aadhar Number already registered. Please use a different Aadhar Number.",
            },
            origin,
          );
        }
      }

      if (staffData.pnaNumber || staffData.panNumber) {
        const panValue = staffData.pnaNumber || staffData.panNumber;
        const existingPan = await staffCollection.findOne({
          $or: [{ pnaNumber: panValue }, { panNumber: panValue }],
          isDeleted: { $ne: true },
        });
        if (existingPan) {
          return createResponse(
            409,
            {
              error:
                "PNA/PAN Number already registered. Please use a different PNA/PAN Number.",
            },
            origin,
          );
        }
      }

      // Always assign _id as ObjectId
      const docToInsert = {
        ...staffData,
        _id: new ObjectId(),
        status: staffData.status || "Active",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const result = await staffCollection.insertOne(docToInsert);

      return createResponse(
        201,
        {
          message: "Staff created successfully",
          id: result.insertedId,
        },
        origin,
      );
    }

    if (event.httpMethod === "PUT") {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(400, { error: "Staff ID is required" }, origin);
      }
      if (!ObjectId.isValid(id)) {
        return createResponse(400, { error: "Invalid staff ID" }, origin);
      }
      const staffData = JSON.parse(event.body);
      const staffObjectId = new ObjectId(id);

      if (isManagedStaffAssetUrl(staffData.profilePhotoUrl)) {
        delete staffData.profilePhotoUrl;
      }

      if (staffData.phoneNumber) {
        const existingPhone = await staffCollection.findOne({
          _id: { $ne: staffObjectId },
          phoneNumber: staffData.phoneNumber,
          isDeleted: { $ne: true },
        });
        if (existingPhone) {
          return createResponse(
            409,
            {
              error:
                "Phone Number already registered with another staff member.",
            },
            origin,
          );
        }
      }

      if (staffData.email) {
        const existingEmail = await staffCollection.findOne({
          _id: { $ne: staffObjectId },
          email: staffData.email,
          isDeleted: { $ne: true },
        });
        if (existingEmail) {
          return createResponse(
            409,
            { error: "Email already registered with another staff member." },
            origin,
          );
        }
      }

      if (staffData.aadharNumber) {
        const existingAadhar = await staffCollection.findOne({
          _id: { $ne: staffObjectId },
          aadharNumber: staffData.aadharNumber,
          isDeleted: { $ne: true },
        });
        if (existingAadhar) {
          return createResponse(
            409,
            {
              error:
                "Aadhar Number already registered with another staff member.",
            },
            origin,
          );
        }
      }

      if (staffData.pnaNumber || staffData.panNumber) {
        const panValue = staffData.pnaNumber || staffData.panNumber;
        const existingPan = await staffCollection.findOne({
          _id: { $ne: staffObjectId },
          $or: [{ pnaNumber: panValue }, { panNumber: panValue }],
          isDeleted: { $ne: true },
        });
        if (existingPan) {
          return createResponse(
            409,
            {
              error:
                "PNA/PAN Number already registered with another staff member.",
            },
            origin,
          );
        }
      }

      const result = await staffCollection.updateOne(
        { _id: staffObjectId },
        {
          $set: {
            ...staffData,
            updatedAt: new Date(),
          },
        },
      );

      if (result.matchedCount === 0) {
        return createResponse(404, { error: "Staff not found" }, origin);
      }

      return createResponse(
        200,
        { message: "Staff updated successfully" },
        origin,
      );
    }

    if (event.httpMethod === "DELETE") {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(400, { error: "Staff ID is required" }, origin);
      }

      if (!ObjectId.isValid(id)) {
        return createResponse(400, { error: "Invalid staff ID" }, origin);
      }
      const result = await staffCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            isDeleted: true,
            deletedAt: new Date(),
            updatedAt: new Date(),
          },
        },
      );

      if (result.matchedCount === 0) {
        return createResponse(404, { error: "Staff not found" }, origin);
      }

      return createResponse(
        200,
        { message: "Staff deleted successfully" },
        origin,
      );
    }

    return createResponse(405, { error: "Method not allowed" }, origin);
  } catch (error) {
    console.error("API Error:", error);

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
