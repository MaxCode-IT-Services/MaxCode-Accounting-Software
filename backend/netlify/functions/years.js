import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { ObjectId } from "mongodb";
import { verifyRequestToken } from "./utils/auth.js";

/**
 * Financial Year Management API
 * Handles CRUD operations for financial years
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
    const yearsCollection = db.collection("financialYears");

    if (event.httpMethod === "GET") {
      const { id } = event.queryStringParameters || {};

      if (id) {
        const yearRecord = await yearsCollection.findOne({
          _id: new ObjectId(id),
        });

        if (!yearRecord) {
          return createResponse(
            404,
            { error: "Financial year not found" },
            origin,
          );
        }

        return createResponse(200, yearRecord, origin);
      }

      const years = await yearsCollection
        .find({ isDeleted: { $ne: true } })
        .sort({ startDate: -1, createdAt: -1 })
        .toArray();

      return createResponse(200, years, origin);
    }

    if (event.httpMethod === "POST") {
      const payload = JSON.parse(event.body || "{}");

      const duplicateChecks = [
        {
          field: "financialYear",
          value: payload.financialYear,
          message:
            "Financial Year already exists. Please use a different year.",
        },
        {
          field: "invoiceFormat",
          value: payload.invoiceFormat,
          message: "Invoice Format already exists. Please use a unique format.",
        },
        {
          field: "selfInvoiceFormat",
          value: payload.selfInvoiceFormat,
          message:
            "Self Invoice Format already exists. Please use a unique format.",
        },
      ];

      for (const check of duplicateChecks) {
        if (!check.value) continue;
        const existing = await yearsCollection.findOne({
          [check.field]: check.value,
          isDeleted: { $ne: true },
        });

        if (existing) {
          return createResponse(409, { error: check.message }, origin);
        }
      }

      if (payload.isDefault === true) {
        await yearsCollection.updateMany(
          { isDeleted: { $ne: true }, isDefault: true },
          {
            $set: {
              isDefault: false,
              updatedAt: new Date(),
            },
          },
        );
      }

      const result = await yearsCollection.insertOne({
        ...payload,
        taxPercentage: Number(payload.taxPercentage),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return createResponse(
        201,
        {
          message: "Financial year created successfully",
          id: result.insertedId,
        },
        origin,
      );
    }

    if (event.httpMethod === "PUT") {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(
          400,
          { error: "Financial Year ID is required" },
          origin,
        );
      }

      const payload = JSON.parse(event.body || "{}");
      const yearObjectId = new ObjectId(id);

      const duplicateChecks = [
        {
          field: "financialYear",
          value: payload.financialYear,
          message:
            "Financial Year already exists. Please use a different year.",
        },
        {
          field: "invoiceFormat",
          value: payload.invoiceFormat,
          message: "Invoice Format already exists. Please use a unique format.",
        },
        {
          field: "selfInvoiceFormat",
          value: payload.selfInvoiceFormat,
          message:
            "Self Invoice Format already exists. Please use a unique format.",
        },
      ];

      for (const check of duplicateChecks) {
        if (!check.value) continue;
        const existing = await yearsCollection.findOne({
          _id: { $ne: yearObjectId },
          [check.field]: check.value,
          isDeleted: { $ne: true },
        });

        if (existing) {
          return createResponse(409, { error: check.message }, origin);
        }
      }

      if (payload.isDefault === true) {
        await yearsCollection.updateMany(
          {
            _id: { $ne: yearObjectId },
            isDeleted: { $ne: true },
            isDefault: true,
          },
          {
            $set: {
              isDefault: false,
              updatedAt: new Date(),
            },
          },
        );
      }

      const updateData = {
        ...payload,
        updatedAt: new Date(),
      };

      if (payload.taxPercentage !== undefined) {
        updateData.taxPercentage = Number(payload.taxPercentage);
      }

      const result = await yearsCollection.updateOne(
        { _id: yearObjectId },
        {
          $set: updateData,
        },
      );

      if (result.matchedCount === 0) {
        return createResponse(
          404,
          { error: "Financial year not found" },
          origin,
        );
      }

      return createResponse(
        200,
        { message: "Financial year updated successfully" },
        origin,
      );
    }

    if (event.httpMethod === "DELETE") {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(
          400,
          { error: "Financial Year ID is required" },
          origin,
        );
      }

      const result = await yearsCollection.updateOne(
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
        return createResponse(
          404,
          { error: "Financial year not found" },
          origin,
        );
      }

      return createResponse(
        200,
        { message: "Financial year deleted successfully" },
        origin,
      );
    }

    return createResponse(405, { error: "Method not allowed" }, origin);
  } catch (error) {
    console.error("Financial Year API Error:", error);

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
