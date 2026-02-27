import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { ObjectId } from "mongodb";
import { verifyRequestToken } from "./utils/auth.js";

export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === "OPTIONS") {
    return createResponse(200, {}, origin);
  }

  try {
    verifyRequestToken(event);

    const { db } = await connectToDatabase();
    const rcmCollection = db.collection("rcm");
    const yearsCollection = db.collection("financialYears");

    const toNumber = (value) => {
      const parsed = parseFloat(value);
      return Number.isNaN(parsed) ? 0 : parsed;
    };

    const getDateOnly = (value) => {
      if (!value) return null;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return null;
      return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    };

    const isDateWithinFinancialYear = (invoiceDate, financialYearRecord) => {
      const invoiceDateOnly = getDateOnly(invoiceDate);
      const startDate = getDateOnly(financialYearRecord?.startDate);
      const endDate = getDateOnly(financialYearRecord?.endDate);

      if (!invoiceDateOnly || !startDate || !endDate) return false;
      return invoiceDateOnly >= startDate && invoiceDateOnly <= endDate;
    };

    const escapeRegExp = (value) => {
      return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    };

    const getNextSelfInvoiceNumber = async (format) => {
      if (!format) return "";
      const match = String(format).match(/^(.*?)(\d+)$/);
      if (!match) return String(format);

      const prefix = match[1];
      const seed = match[2];
      const width = seed.length;
      const seedNumber = parseInt(seed, 10) || 1;
      const pattern = new RegExp(`^${escapeRegExp(prefix)}(\\d+)$`);

      const existingRecords = await rcmCollection
        .find(
          {
            selfInvoiceNumber: { $regex: pattern },
            isDeleted: { $ne: true },
          },
          { projection: { selfInvoiceNumber: 1 } },
        )
        .toArray();

      let maxNumber = 0;
      existingRecords.forEach((record) => {
        const invoiceNumber = String(record?.selfInvoiceNumber || "");
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

    const normalizeTaxData = (taxData = {}) => {
      const subtotal = toNumber(taxData.subtotal);
      const taxPercentage = toNumber(taxData.taxPercentage);
      const igst = (subtotal * taxPercentage) / 100;
      const roundingAmount = toNumber(taxData.roundingAmount);
      const totalAmount = subtotal + igst + roundingAmount;

      return {
        ...taxData,
        subtotal: subtotal.toFixed(2),
        taxPercentage,
        cgst: "0.00",
        sgst: "0.00",
        igst: igst.toFixed(2),
        totalAmount: toNumber(taxData.totalAmount || totalAmount).toFixed(2),
      };
    };

    if (event.httpMethod === "GET") {
      const { id } = event.queryStringParameters || {};

      if (id) {
        if (!ObjectId.isValid(id)) {
          return createResponse(400, { error: "Invalid RCM ID" }, origin);
        }
        const record = await rcmCollection.findOne({
          _id: new ObjectId(id),
          isDeleted: { $ne: true },
        });
        if (!record) {
          return createResponse(404, { error: "RCM not found" }, origin);
        }
        return createResponse(200, record, origin);
      }

      const records = await rcmCollection
        .find({ isDeleted: { $ne: true } })
        .sort({ createdAt: -1 })
        .toArray();

      return createResponse(200, records, origin);
    }

    if (event.httpMethod === "POST") {
      const payload = JSON.parse(event.body || "{}");

      const defaultYear = await yearsCollection.findOne({
        isDeleted: { $ne: true },
        isDefault: true,
      });

      if (!defaultYear) {
        return createResponse(
          400,
          {
            error:
              "Default financial year is not configured. Please set default financial year first.",
          },
          origin,
        );
      }

      if (!isDateWithinFinancialYear(payload.invoiceDate, defaultYear)) {
        return createResponse(
          400,
          {
            error: `Invoice Date must be between ${defaultYear.startDate} and ${defaultYear.endDate} for financial year ${defaultYear.financialYear}.`,
          },
          origin,
        );
      }

      if (!payload.selfInvoiceNumber) {
        const selfInvoiceFormat =
          payload.selfInvoiceFormat || defaultYear?.selfInvoiceFormat || "";

        if (!selfInvoiceFormat) {
          return createResponse(
            400,
            {
              error:
                "Self invoice number is required. Default financial year self invoice format not found.",
            },
            origin,
          );
        }

        payload.selfInvoiceNumber =
          await getNextSelfInvoiceNumber(selfInvoiceFormat);
      }

      const existingRecord = await rcmCollection.findOne({
        selfInvoiceNumber: payload.selfInvoiceNumber,
      });

      if (existingRecord) {
        return createResponse(
          409,
          { error: "Self invoice number already exists" },
          origin,
        );
      }

      const normalizedTaxData = normalizeTaxData({
        ...payload.taxData,
        roundingAmount: payload.roundingAmount,
      });

      const docToInsert = {
        ...payload,
        _id: new ObjectId(),
        placeOfSupply: "Rajasthan (08)",
        financialYear: defaultYear.financialYear || payload.financialYear || "",
        taxData: normalizedTaxData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const result = await rcmCollection.insertOne(docToInsert);

      return createResponse(
        201,
        {
          message: "RCM created successfully",
          id: result.insertedId,
        },
        origin,
      );
    }

    if (event.httpMethod === "PUT") {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(400, { error: "RCM ID is required" }, origin);
      }

      if (!ObjectId.isValid(id)) {
        return createResponse(400, { error: "Invalid RCM ID" }, origin);
      }

      const payload = JSON.parse(event.body || "{}");
      if (!ObjectId.isValid(id)) {
        return createResponse(400, { error: "Invalid RCM ID" }, origin);
      }
      if (payload.selfInvoiceNumber) {
        // Only block if another RCM (not this one) has same selfInvoiceNumber
        const existingRecord = await rcmCollection.findOne({
          selfInvoiceNumber: payload.selfInvoiceNumber,
        });
        if (existingRecord && String(existingRecord._id) !== String(id)) {
          return createResponse(
            409,
            { error: "Self invoice number already exists" },
            origin,
          );
        }
      }
      const defaultYear = await yearsCollection.findOne({
        isDeleted: { $ne: true },
        isDefault: true,
      });
      if (
        defaultYear?.startDate &&
        defaultYear?.endDate &&
        payload.invoiceDate
      ) {
        if (!isDateWithinFinancialYear(payload.invoiceDate, defaultYear)) {
          return createResponse(
            400,
            {
              error: `Invoice Date must be between ${defaultYear.startDate} and ${defaultYear.endDate} for financial year ${defaultYear.financialYear}.`,
            },
            origin,
          );
        }
      }
      const normalizedTaxData = normalizeTaxData({
        ...payload.taxData,
        roundingAmount: payload.roundingAmount,
      });
      const result = await rcmCollection.updateOne(
        { _id: new ObjectId(id), isDeleted: { $ne: true } },
        {
          $set: {
            ...payload,
            placeOfSupply: "Rajasthan (08)",
            taxData: normalizedTaxData,
            updatedAt: new Date(),
          },
        },
      );
      if (result.matchedCount === 0) {
        return createResponse(404, { error: "RCM not found" }, origin);
      }
      return createResponse(
        200,
        { message: "RCM updated successfully" },
        origin,
      );
    }

    if (event.httpMethod === "DELETE") {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(400, { error: "RCM ID is required" }, origin);
      }

      if (!ObjectId.isValid(id)) {
        return createResponse(400, { error: "Invalid RCM ID" }, origin);
      }

      if (!ObjectId.isValid(id)) {
        return createResponse(400, { error: "Invalid RCM ID" }, origin);
      }
      const result = await rcmCollection.updateOne(
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
        return createResponse(404, { error: "RCM not found" }, origin);
      }
      return createResponse(
        200,
        { message: "RCM deleted successfully" },
        origin,
      );
    }

    return createResponse(405, { error: "Method not allowed" }, origin);
  } catch (error) {
    console.error("RCM API Error:", error);

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
