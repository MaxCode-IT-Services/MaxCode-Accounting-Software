import { ObjectId } from "mongodb";
import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { verifyRequestToken } from "./utils/auth.js";
import {
  normalizeTransactionSnapshot,
  syncTransactionSnapshot,
} from "./utils/transactions.js";

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
    return createResponse(200, {}, origin, event);
  }

  try {
    verifyRequestToken(event);

    const { db } = await connectToDatabase();
    const transactionsCollection = db.collection("transactions");

    const params = event.queryStringParameters || {};

    if (event.httpMethod === "POST") {
      const action = String(params.action || "")
        .trim()
        .toLowerCase();

      if (action !== "resync-credit-debit-notes") {
        return createResponse(400, { error: "Invalid action" }, origin, event);
      }

      const notesCollection = db.collection("creditDebitNotes");
      const includeDeleted =
        String(params.includeDeleted || "false").toLowerCase() === "true";
      const financialYear = String(params.financialYear || "ALL").trim();
      const noteId = String(params.noteId || "").trim();

      const noteQuery = {};
      if (!includeDeleted) {
        noteQuery.isDeleted = { $ne: true };
      }
      if (financialYear && financialYear !== "ALL") {
        noteQuery.financialYear = financialYear;
      }
      if (noteId) {
        if (!ObjectId.isValid(noteId)) {
          return createResponse(400, { error: "Invalid noteId" }, origin, event);
        }
        noteQuery._id = new ObjectId(noteId);
      }

      const notes = await notesCollection.find(noteQuery).toArray();
      let synced = 0;
      let deleted = 0;

      for (const note of notes) {
        await syncTransactionSnapshot({
          db,
          sourceCollection: "creditDebitNotes",
          sourceType: "credit_note",
          sourceRecord: note,
          sourceLabel: note.noteNumber || "",
          deleted: note.isDeleted === true,
        });

        if (note.isDeleted === true) {
          deleted += 1;
        } else {
          synced += 1;
        }
      }

      return createResponse(200,
        {
          message: "Credit/Debit Note transactions resynced successfully",
          totalNotes: notes.length,
          synced,
          deleted,
        },
        origin, event);
    }

    if (event.httpMethod !== "GET") {
      return createResponse(405, { error: "Method not allowed" }, origin, event);
    }

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
        return createResponse(400, { error: "Invalid transaction ID" }, origin, event);
      }

      const transaction = await transactionsCollection.findOne({
        _id: new ObjectId(id),
      });
      if (!transaction) {
        return createResponse(404, { error: "Transaction not found" }, origin, event);
      }

      return createResponse(200, flattenTransaction(transaction), origin, event);
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

    return createResponse(200,
      {
        data: rows.map(flattenTransaction),
        pagination: {
          page: pageNum,
          limit: limitNum,
          totalRecords,
          totalPages: Math.ceil(totalRecords / limitNum),
        },
      },
      origin, event);
  } catch (error) {
    console.error("Transactions API Error:", error);
    return createResponse(500,
      {
        error: "Internal server error",
        message: error.message,
      },
      origin, event);
  }
}
