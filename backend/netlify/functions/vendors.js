import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { ObjectId } from "mongodb";
import { verifyRequestToken } from "./utils/auth.js";

/**
 * Vendor Management API
 * Handles CRUD operations for vendors
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

    // GET - Fetch all vendors or specific vendor by ID
    if (event.httpMethod === "GET") {
      const { id } = event.queryStringParameters || {};

      if (id) {
        const vendor = await vendorsCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!vendor) {
          return createResponse(404, { error: "Vendor not found" }, origin);
        }
        return createResponse(200, vendor, origin);
      }

      // Filter out soft-deleted records
      const vendors = await vendorsCollection
        .find({ isDeleted: { $ne: true } })
        .toArray();
      return createResponse(200, vendors, origin);
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

      const result = await vendorsCollection.insertOne({
        ...vendorData,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

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

      const result = await vendorsCollection.updateOne(
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
