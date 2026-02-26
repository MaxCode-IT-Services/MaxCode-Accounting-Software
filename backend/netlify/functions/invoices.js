import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { ObjectId } from "mongodb";
import { verifyRequestToken } from "./utils/auth.js";

/**
 * Invoice Management API
 * Handles CRUD operations for invoices
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
    const invoicesCollection = db.collection("invoices");
    const yearsCollection = db.collection("financialYears");

    const escapeRegExp = (value) => {
      return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    };

    const getNextInvoiceNumber = async (format) => {
      if (!format) return "";
      const match = String(format).match(/^(.*?)(\d+)$/);
      if (!match) return String(format);

      const prefix = match[1];
      const seed = match[2];
      const width = seed.length;
      const seedNumber = parseInt(seed, 10) || 1;
      const pattern = new RegExp(`^${escapeRegExp(prefix)}(\\d+)$`);

      const existingInvoices = await invoicesCollection
        .find(
          { invoiceNumber: { $regex: pattern } },
          { projection: { invoiceNumber: 1 } },
        )
        .toArray();

      let maxNumber = 0;
      existingInvoices.forEach((invoice) => {
        const invoiceNumber = String(invoice?.invoiceNumber || "");
        const invoiceMatch = invoiceNumber.match(pattern);
        if (!invoiceMatch) return;
        const current = parseInt(invoiceMatch[1], 10);
        if (!Number.isNaN(current) && current > maxNumber) {
          maxNumber = current;
        }
      });

      const nextNumber = Math.max(seedNumber, maxNumber + 1);
      return `${prefix}${String(nextNumber).padStart(width, "0")}`;
    };

    // GET - Fetch all invoices or specific invoice by ID
    if (event.httpMethod === "GET") {
      const { id, clientId } = event.queryStringParameters || {};

      if (id) {
        if (!ObjectId.isValid(id)) {
          return createResponse(400, { error: "Invalid invoice ID" }, origin);
        }

        const invoice = await invoicesCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!invoice) {
          return createResponse(404, { error: "Invoice not found" }, origin);
        }
        return createResponse(200, invoice, origin);
      }

      // Filter by client if clientId is provided
      const query = clientId ? { clientId } : {};
      const invoices = await invoicesCollection
        .find(query)
        .sort({ createdAt: -1 })
        .toArray();

      return createResponse(200, invoices, origin);
    }

    // POST - Create new invoice
    if (event.httpMethod === "POST") {
      const invoiceData = JSON.parse(event.body || "{}");

      const defaultYear = await yearsCollection.findOne({
        isDeleted: { $ne: true },
        isDefault: true,
      });

      if (!invoiceData.invoiceNumber) {
        const invoiceFormat =
          invoiceData.invoiceFormat || defaultYear?.invoiceFormat || "";

        if (!invoiceFormat) {
          return createResponse(
            400,
            {
              error:
                "Invoice number is required. Default financial year invoice format not found.",
            },
            origin,
          );
        }

        invoiceData.invoiceNumber = await getNextInvoiceNumber(invoiceFormat);
      }

      if (!invoiceData.financialYear && defaultYear?.financialYear) {
        invoiceData.financialYear = defaultYear.financialYear;
      }

      const existingInvoice = await invoicesCollection.findOne({
        invoiceNumber: invoiceData.invoiceNumber,
      });

      if (existingInvoice) {
        return createResponse(
          409,
          { error: "Invoice number already exists" },
          origin,
        );
      }

      const result = await invoicesCollection.insertOne({
        ...invoiceData,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return createResponse(
        201,
        {
          message: "Invoice created successfully",
          id: result.insertedId,
        },
        origin,
      );
    }

    // PUT - Update existing invoice
    if (event.httpMethod === "PUT") {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(400, { error: "Invoice ID is required" }, origin);
      }

      if (!ObjectId.isValid(id)) {
        return createResponse(400, { error: "Invalid invoice ID" }, origin);
      }

      const invoiceData = JSON.parse(event.body);

      if (invoiceData.invoiceNumber) {
        // Only block if another invoice (not this one) has same invoiceNumber
        const existingInvoice = await invoicesCollection.findOne({
          invoiceNumber: invoiceData.invoiceNumber,
        });
        if (existingInvoice && String(existingInvoice._id) !== String(id)) {
          return createResponse(
            409,
            { error: "Invoice number already exists" },
            origin,
          );
        }
      }

      const result = await invoicesCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            ...invoiceData,
            updatedAt: new Date(),
          },
        },
      );

      if (result.matchedCount === 0) {
        return createResponse(404, { error: "Invoice not found" }, origin);
      }

      return createResponse(
        200,
        { message: "Invoice updated successfully" },
        origin,
      );
    }

    // DELETE - Soft delete invoice (set isDeleted: true)
    if (event.httpMethod === "DELETE") {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(400, { error: "Invoice ID is required" }, origin);
      }

      if (!ObjectId.isValid(id)) {
        return createResponse(400, { error: "Invalid invoice ID" }, origin);
      }

      const result = await invoicesCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            isDeleted: true,
            deletedAt: new Date(),
          },
        },
      );

      if (result.matchedCount === 0) {
        return createResponse(404, { error: "Invoice not found" }, origin);
      }

      return createResponse(
        200,
        { message: "Invoice deleted successfully" },
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
