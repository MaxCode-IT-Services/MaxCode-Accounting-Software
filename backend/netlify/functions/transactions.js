import { ObjectId } from "mongodb";
import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { verifyRequestToken } from "./utils/auth.js";
import { normalizeTransactionSnapshot } from "./utils/transactions.js";

const escapeRegExp = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const flattenTransaction = (transaction = {}) => {
  const normalized = normalizeTransactionSnapshot(transaction);
  return {
    ...normalized,
    ...(normalized.sourceRecord || {}),
    sourceRecord: normalized.sourceRecord || {},
  };
};

export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === "OPTIONS") {
    return createResponse(200, {}, origin);
  }

  try {
    verifyRequestToken(event);

    const { db } = await connectToDatabase();
    const transactionsCollection = db.collection("transactions");

    if (event.httpMethod !== "GET") {
      return createResponse(405, { error: "Method not allowed" }, origin);
    }

    const params = event.queryStringParameters || {};
    const {
      id,
      page = 1,
      limit = 50,
      search,
      sourceType,
      sourceCollection,
      financialYear,
      includeDeleted = "false",
    } = params;

    if (id) {
      if (!ObjectId.isValid(id)) {
        return createResponse(400, { error: "Invalid transaction ID" }, origin);
      }

      const transaction = await transactionsCollection.findOne({
        _id: new ObjectId(id),
      });
      if (!transaction) {
        return createResponse(404, { error: "Transaction not found" }, origin);
      }

      return createResponse(200, flattenTransaction(transaction), origin);
    }

    const query = {};
    if (String(includeDeleted).toLowerCase() !== "true") {
      query.isDeleted = { $ne: true };
    }

    if (sourceType) {
      query.sourceType = sourceType;
    }

    if (sourceCollection) {
      query.sourceCollection = sourceCollection;
    }

    if (financialYear && financialYear !== "ALL") {
      query.financialYear = financialYear;
    }

    if (search) {
      const searchRegex = { $regex: escapeRegExp(search), $options: "i" };
      query.$or = [
        { sourceLabel: searchRegex },
        { partyName: searchRegex },
        { paymentMethod: searchRegex },
        { sourceType: searchRegex },
        { financialYear: searchRegex },
        { sourceCollection: searchRegex },
      ];
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.max(parseInt(limit, 10) || 50, 1);
    const skip = (pageNum - 1) * limitNum;

    const totalRecords = await transactionsCollection.countDocuments(query);
    const rows = await transactionsCollection
      .find(query)
      .sort({ transactionDate: -1, createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .toArray();

    return createResponse(
      200,
      {
        data: rows.map(flattenTransaction),
        pagination: {
          page: pageNum,
          limit: limitNum,
          totalRecords,
          totalPages: Math.ceil(totalRecords / limitNum),
        },
      },
      origin,
    );
  } catch (error) {
    console.error("Transactions API Error:", error);
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
