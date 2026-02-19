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
      const { id, asset } = event.queryStringParameters || {};

      // Allow public access to staff assets (images)
      if (id && asset) {
        if (!IMAGE_FIELDS.includes(asset)) {
          return createResponse(400, { error: "Invalid asset field" }, origin);
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
        const staff = await staffCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!staff) {
          return createResponse(404, { error: "Staff not found" }, origin);
        }
        return createResponse(200, mapStaffForClient(staff, event), origin);
      }

      const staffList = await staffCollection
        .find({ isDeleted: { $ne: true } })
        .toArray();
      const mappedStaff = staffList.map((staff) =>
        mapStaffForClient(staff, event),
      );
      return createResponse(200, mappedStaff, origin);
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

      const result = await staffCollection.insertOne({
        ...staffData,
        status: staffData.status || "Active",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

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
