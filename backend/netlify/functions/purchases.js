import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { ObjectId } from "mongodb";
import { verifyRequestToken } from "./utils/auth.js";

/**
 * Purchase Management API
 * Handles CRUD operations for purchases
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
    const purchasesCollection = db.collection("purchases");

    if (event.httpMethod === "GET") {
      const { id, vendorId, financialYear } = event.queryStringParameters || {};

      if (id) {
        if (!ObjectId.isValid(id)) {
          return createResponse(400, { error: "Invalid purchase ID" }, origin);
        }

        const purchase = await purchasesCollection.findOne({
          _id: new ObjectId(id),
          isDeleted: { $ne: true },
        });

        if (!purchase) {
          return createResponse(404, { error: "Purchase not found" }, origin);
        }

        return createResponse(200, purchase, origin);
      }

      const query = { isDeleted: { $ne: true } };
      if (vendorId) {
        query.vendorId = vendorId;
      }
      if (financialYear) {
        query.financialYear = financialYear;
      }

      const purchases = await purchasesCollection
        .find(query)
        .sort({ createdAt: -1 })
        .toArray();

      return createResponse(200, purchases, origin);
    }

    if (event.httpMethod === "POST") {
      const purchaseData = JSON.parse(event.body || "{}");

      if (!purchaseData.invoiceNumber) {
        return createResponse(
          400,
          { error: "Invoice number is required" },
          origin,
        );
      }

      const existingInvoice = await purchasesCollection.findOne({
        invoiceNumber: purchaseData.invoiceNumber,
        isDeleted: { $ne: true },
      });

      if (existingInvoice) {
        return createResponse(
          409,
          { error: "Invoice number already exists" },
          origin,
        );
      }

      const result = await purchasesCollection.insertOne({
        ...purchaseData,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return createResponse(
        201,
        {
          message: "Purchase created successfully",
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
          { error: "Purchase ID is required" },
          origin,
        );
      }

      if (!ObjectId.isValid(id)) {
        return createResponse(400, { error: "Invalid purchase ID" }, origin);
      }

      const purchaseData = JSON.parse(event.body || "{}");
      const purchaseObjectId = new ObjectId(id);

      if (purchaseData.invoiceNumber) {
        // Only block if another purchase (not this one) has same invoiceNumber
        const existingInvoice = await purchasesCollection.findOne({
          invoiceNumber: purchaseData.invoiceNumber,
          isDeleted: { $ne: true },
        });
        if (existingInvoice && String(existingInvoice._id) !== String(id)) {
          return createResponse(
            409,
            { error: "Invoice number already exists" },
            origin,
          );
        }
      }

      const result = await purchasesCollection.updateOne(
        { _id: purchaseObjectId, isDeleted: { $ne: true } },
        {
          $set: {
            ...purchaseData,
            updatedAt: new Date(),
          },
        },
      );

      if (result.matchedCount === 0) {
        return createResponse(404, { error: "Purchase not found" }, origin);
      }

      return createResponse(
        200,
        { message: "Purchase updated successfully" },
        origin,
      );
    }

    if (event.httpMethod === "DELETE") {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(
          400,
          { error: "Purchase ID is required" },
          origin,
        );
      }

      if (!ObjectId.isValid(id)) {
        return createResponse(400, { error: "Invalid purchase ID" }, origin);
      }

      const result = await purchasesCollection.updateOne(
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
        return createResponse(404, { error: "Purchase not found" }, origin);
      }

      return createResponse(
        200,
        { message: "Purchase deleted successfully" },
        origin,
      );
    }

    return createResponse(405, { error: "Method not allowed" }, origin);
  } catch (error) {
    console.error("Purchase API Error:", error);

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
