import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { ObjectId } from "mongodb";
import { verifyRequestToken } from "./utils/auth.js";

/**
 * Client Management API
 * Handles CRUD operations for clients
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
    const clientsCollection = db.collection("clients");

    // GET - Fetch all clients or specific client by ID

    if (event.httpMethod === "GET") {
      const { id } = event.queryStringParameters || {};

      if (id) {
        const client = await clientsCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!client) {
          return createResponse(404, { error: "Client not found" }, origin);
        }
        return createResponse(200, client, origin);
      }

      // Filter out soft-deleted records
      const clients = await clientsCollection
        .find({ isDeleted: { $ne: true } })
        .toArray();
      return createResponse(200, clients, origin);
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
          return createResponse(
            409,
            {
              error:
                "Client ID already exists. Please use a different Client ID.",
            },
            origin,
          );
        }
      }

      // Check for duplicate phoneNumber
      if (clientData.phoneNumber) {
        const existingPhone = await clientsCollection.findOne({
          phoneNumber: clientData.phoneNumber,
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
      if (clientData.gstin && !clientData.noGSTIN) {
        const existingGSTIN = await clientsCollection.findOne({
          gstin: clientData.gstin,
          isDeleted: { $ne: true },
        });
        if (existingGSTIN) {
          return createResponse(
            409,
            { error: "GSTIN already registered with another client." },
            origin,
          );
        }
      }

      const result = await clientsCollection.insertOne({
        ...clientData,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return createResponse(
        201,
        {
          message: "Client created successfully",
          id: result.insertedId,
        },
        origin,
      );
    }

    // PUT - Update existing client
    if (event.httpMethod === "PUT") {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(400, { error: "Client ID is required" }, origin);
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
          return createResponse(
            409,
            {
              error:
                "Client ID already exists. Please use a different Client ID.",
            },
            origin,
          );
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
          return createResponse(
            409,
            { error: "Phone Number already registered with another client." },
            origin,
          );
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
          return createResponse(
            409,
            { error: "GSTIN already registered with another client." },
            origin,
          );
        }
      }

      const result = await clientsCollection.updateOne(
        { _id: clientObjectId },
        {
          $set: {
            ...clientData,
            updatedAt: new Date(),
          },
        },
      );

      if (result.matchedCount === 0) {
        return createResponse(404, { error: "Client not found" }, origin);
      }

      return createResponse(
        200,
        { message: "Client updated successfully" },
        origin,
      );
    }

    // DELETE - Soft delete client (mark as deleted instead of removing)
    if (event.httpMethod === "DELETE") {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(400, { error: "Client ID is required" }, origin);
      }

      const result = await clientsCollection.updateOne(
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
        return createResponse(404, { error: "Client not found" }, origin);
      }

      return createResponse(
        200,
        { message: "Client deleted successfully" },
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
