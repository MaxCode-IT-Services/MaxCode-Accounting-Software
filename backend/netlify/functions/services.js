import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { ObjectId } from "mongodb";
import { verifyRequestToken } from "./utils/auth.js";

/**
 * Services Management API
 * Handles CRUD operations for client services and renew transactions
 * Requires JWT authentication
 */
export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === "OPTIONS") {
    return createResponse(200, {}, origin);
  }

  try {
    verifyRequestToken(event);

    const { db } = await connectToDatabase();
    const servicesCollection = db.collection("services");

    if (event.httpMethod === "GET") {
      const { id, clientId, status } = event.queryStringParameters || {};

      if (id) {
        if (!ObjectId.isValid(id)) {
          return createResponse(400, { error: "Invalid service ID" }, origin);
        }

        const serviceRecord = await servicesCollection.findOne({
          _id: new ObjectId(id),
          isDeleted: { $ne: true },
        });

        if (!serviceRecord) {
          return createResponse(
            404,
            { error: "Service record not found" },
            origin,
          );
        }

        return createResponse(200, serviceRecord, origin);
      }

      const query = { isDeleted: { $ne: true } };

      if (clientId) {
        query.clientId = clientId;
      }

      if (status) {
        query.status = status;
      }

      const serviceRecords = await servicesCollection
        .find(query)
        .sort({ createdAt: -1 })
        .toArray();

      return createResponse(200, serviceRecords, origin);
    }

    if (event.httpMethod === "POST") {
      const serviceData = JSON.parse(event.body || "{}");

      if (!serviceData.serviceNumber) {
        return createResponse(
          400,
          { error: "Service number is required" },
          origin,
        );
      }

      const existing = await servicesCollection.findOne({
        serviceNumber: serviceData.serviceNumber,
      });

      if (existing) {
        return createResponse(
          409,
          { error: "Service number already exists" },
          origin,
        );
      }

      // Always assign _id as ObjectId
      const docToInsert = {
        ...serviceData,
        _id: new ObjectId(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const result = await servicesCollection.insertOne(docToInsert);

      return createResponse(
        201,
        {
          message: "Services record created successfully",
          id: result.insertedId,
        },
        origin,
      );
    }

    if (event.httpMethod === "PUT") {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(400, { error: "Service ID is required" }, origin);
      }

      if (!ObjectId.isValid(id)) {
        return createResponse(400, { error: "Invalid service ID" }, origin);
      }

      const serviceData = JSON.parse(event.body || "{}");
      const serviceObjectId = new ObjectId(id);

      if (serviceData.serviceNumber) {
        const existing = await servicesCollection.findOne({
          serviceNumber: serviceData.serviceNumber,
        });

        if (existing && String(existing._id) !== String(id)) {
          return createResponse(
            409,
            { error: "Service number already exists" },
            origin,
          );
        }
      }

      const result = await servicesCollection.updateOne(
        { _id: serviceObjectId, isDeleted: { $ne: true } },
        {
          $set: {
            ...serviceData,
            updatedAt: new Date(),
          },
        },
      );

      if (result.matchedCount === 0) {
        return createResponse(
          404,
          { error: "Service record not found" },
          origin,
        );
      }

      return createResponse(
        200,
        { message: "Services record updated successfully" },
        origin,
      );
    }

    if (event.httpMethod === "DELETE") {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(400, { error: "Service ID is required" }, origin);
      }

      if (!ObjectId.isValid(id)) {
        return createResponse(400, { error: "Invalid service ID" }, origin);
      }

      const result = await servicesCollection.updateOne(
        { _id: new ObjectId(id), isDeleted: { $ne: true } },
        {
          $set: {
            isDeleted: true,
            deletedAt: new Date(),
            updatedAt: new Date(),
          },
        },
      );

      if (result.matchedCount === 0) {
        return createResponse(
          404,
          { error: "Service record not found" },
          origin,
        );
      }

      return createResponse(
        200,
        { message: "Services record deleted successfully" },
        origin,
      );
    }

    return createResponse(405, { error: "Method not allowed" }, origin);
  } catch (error) {
    console.error("Services API Error:", error);

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
