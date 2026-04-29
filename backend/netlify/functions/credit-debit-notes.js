import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { ObjectId } from "mongodb";
import { verifyRequestToken, getAuditFieldsFromEvent } from "./utils/auth.js";
import {
  applyTermsBindingToDocument,
  getTermsBindingFromDatabase,
} from "./utils/terms-versioning.js";

const NOTES_META_CACHE_TTL_MS = 60000;
let notesMetaCache = {
  value: null,
  expiresAt: 0,
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const sanitizeNoteItems = (rawItems) => {
  if (!Array.isArray(rawItems)) return [];

  return rawItems
    .map((item, index) => {
      const itemName = String(item?.itemName || "").trim();
      const itemDescription = String(item?.itemDescription || "").trim();
      const hsnCode = String(item?.hsnCode || "").trim();
      const qty = toNumber(item?.qty);
      const price = toNumber(item?.price);
      const amount = Number((qty * price).toFixed(2));

      if (!itemName || qty <= 0 || price < 0 || amount <= 0) {
        return null;
      }

      return {
        id: toNumber(item?.id) || index + 1,
        itemName,
        itemDescription,
        hsnCode,
        qty,
        price,
        amount,
      };
    })
    .filter(Boolean);
};

const sumItemsAmount = (items = []) =>
  Number(
    items.reduce((sum, item) => sum + toNumber(item?.amount), 0).toFixed(2),
  );

const getDebitNotePaymentStatus = (totalAmount, receivedAmount) => {
  const total = toNumber(totalAmount);
  const received = toNumber(receivedAmount);
  if (received <= 0) return "Unpaid";
  if (total > 0 && received >= total) return "Paid";
  return "Partial";
};

const normalizeAppliedAdvances = (appliedAdvances) => {
  if (!Array.isArray(appliedAdvances)) return [];
  return appliedAdvances
    .map((advance) => {
      const advanceId = String(
        advance?.advanceId || advance?.id || advance?._id || "",
      ).trim();
      const appliedAmount = toNumber(advance?.appliedAmount);
      if (!advanceId || appliedAmount <= 0) return null;
      return {
        advanceId,
        receiptNumber: String(advance?.receiptNumber || "").trim(),
        appliedAmount,
        maxAmount: toNumber(advance?.maxAmount || appliedAmount),
        paymentMethod: String(advance?.paymentMethod || "").trim(),
        receiptDate: advance?.receiptDate
          ? new Date(advance.receiptDate)
          : null,
      };
    })
    .filter(Boolean);
};

export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === "OPTIONS") {
    return createResponse(200, {}, origin);
  }

  try {
    verifyRequestToken(event);

    const { db } = await connectToDatabase();
    const notesCollection = db.collection("creditDebitNotes");
    const yearsCollection = db.collection("financialYears");
    let noteTermsBindingPromise = null;

    const getNoteTermsBinding = async () => {
      if (!noteTermsBindingPromise) {
        noteTermsBindingPromise = getTermsBindingFromDatabase(
          db,
          "creditDebitNote",
        );
      }
      return noteTermsBindingPromise;
    };

    const escapeRegExp = (value) => {
      return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    };

    const getFinancialYearToken = (financialYearValue) => {
      const value = String(financialYearValue || "").trim();
      if (/^\d{4}-\d{4}$/.test(value)) {
        return `${value.slice(2, 4)}-${value.slice(-2)}`;
      }
      if (/^\d{4}-\d{2}$/.test(value)) {
        return `${value.slice(2, 4)}-${value.slice(-2)}`;
      }
      if (/^\d{2}-\d{2}$/.test(value)) {
        return value;
      }
      return "";
    };

    const buildFallbackFinancialYear = () => {
      const now = new Date();
      const month = now.getMonth() + 1;
      const startYear = month >= 4 ? now.getFullYear() : now.getFullYear() - 1;
      const endYearShort = String((startYear + 1) % 100).padStart(2, "0");
      return `${startYear}-${endYearShort}`;
    };

    const getNextNoteNumber = async (
      financialYearValue,
      noteType = "Credit Note",
    ) => {
      const yearToken = getFinancialYearToken(financialYearValue);
      if (!yearToken) return "";

      // Fetch the financial year record to get the specific format
      const yearRecord = await yearsCollection.findOne({
        financialYear: financialYearValue,
        isDeleted: { $ne: true },
      });

      let prefix = "";
      if (yearRecord) {
        // Use the format from the financial year configuration
        if (noteType === "Debit Note" && yearRecord.debitNoteFormat) {
          prefix = yearRecord.debitNoteFormat.replace(/\d+$/, "");
        } else if (noteType === "Credit Note" && yearRecord.creditNoteFormat) {
          prefix = yearRecord.creditNoteFormat.replace(/\d+$/, "");
        } else {
          // Fallback to default format
          const notePrefix = noteType === "Debit Note" ? "DN" : "CN";
          prefix = `MC/${notePrefix}/${yearToken}/`;
        }
      } else {
        // Fallback to default format if year not found
        const notePrefix = noteType === "Debit Note" ? "DN" : "CN";
        prefix = `MC/${notePrefix}/${yearToken}/`;
      }

      const pattern = new RegExp(`^${escapeRegExp(prefix)}(\\d+)$`, "i");

      const existingNotes = await notesCollection
        .find(
          {
            noteNumber: { $regex: pattern },
            isDeleted: { $ne: true },
          },
          { projection: { noteNumber: 1 } },
        )
        .toArray();

      let maxSerial = 0;
      existingNotes.forEach((note) => {
        const noteNumber = String(note?.noteNumber || "").trim();
        const match = noteNumber.match(pattern);
        if (!match) return;

        const current = parseInt(match[1], 10);
        if (!Number.isNaN(current) && current > maxSerial) {
          maxSerial = current;
        }
      });

      const nextSerial = String(maxSerial + 1).padStart(3, "0");
      return `${prefix}${nextSerial}`;
    };

    if (event.httpMethod === "GET") {
      const {
        action,
        id,
        page = 1,
        limit = 10,
        includeMeta = "true",
        search,
        noteType,
        status,
        noteDate_start,
        noteDate_end,
        createdDateTime_start,
        createdDateTime_end,
        sortBy = "createdAt",
        sortOrder = "desc",
        filter,
      } = event.queryStringParameters || {};

      if (action === "available-debit-notes") {
        const clientRefId = String(
          event.queryStringParameters?.clientRefId || "",
        ).trim();
        if (!clientRefId) {
          return createResponse(
            400,
            { error: "clientRefId is required" },
            origin,
          );
        }

        const debitNotes = await notesCollection
          .find({
            isDeleted: { $ne: true },
            noteType: "Debit Note",
            $or: [{ clientId: clientRefId }, { clientRefId }],
            status: { $ne: "Cancelled" },
          })
          .sort({ noteDate: 1, createdAt: 1 })
          .toArray();

        const records = debitNotes
          .map((note) => {
            const totalAmount = toNumber(note.totalAmount || note.amount);
            const receivedAmount = toNumber(note.receivedAmount || 0);
            const dueAmount = Math.max(0, totalAmount - receivedAmount);
            return {
              id: String(note._id),
              noteId: String(note._id),
              noteNumber: note.noteNumber || "",
              noteDate: note.noteDate || "",
              totalAmount,
              receivedAmount,
              dueAmount,
              paymentStatus:
                note.paymentStatus ||
                getDebitNotePaymentStatus(totalAmount, receivedAmount),
              paymentDate: note.paymentDate || "",
              paymentMethod: note.paymentMethod || "",
            };
          })
          .filter((note) => note.dueAmount > 0);

        return createResponse(200, { records, total: records.length }, origin);
      }

      if (action === "next-number") {
        const requestedFinancialYear = String(
          event.queryStringParameters?.financialYear || "",
        ).trim();
        const requestedNoteType = String(
          event.queryStringParameters?.noteType || "Credit Note",
        ).trim();

        let yearRecord = null;
        if (requestedFinancialYear && requestedFinancialYear !== "ALL") {
          yearRecord = await yearsCollection.findOne({
            financialYear: requestedFinancialYear,
            isDeleted: { $ne: true },
          });
        }

        if (!yearRecord) {
          yearRecord = await yearsCollection.findOne({
            isDeleted: { $ne: true },
            isDefault: true,
          });
        }

        const resolvedFinancialYear =
          (requestedFinancialYear && requestedFinancialYear !== "ALL"
            ? requestedFinancialYear
            : String(yearRecord?.financialYear || "").trim()) ||
          buildFallbackFinancialYear();

        const nextNumber = await getNextNoteNumber(
          resolvedFinancialYear,
          requestedNoteType,
        );
        if (!nextNumber) {
          return createResponse(
            400,
            {
              error:
                "Unable to generate note number for the selected financial year.",
            },
            origin,
          );
        }

        return createResponse(
          200,
          {
            nextNumber,
            noteNumber: nextNumber,
            financialYear: resolvedFinancialYear,
            noteType: requestedNoteType,
            format: nextNumber.replace(/\d+$/, "001"),
          },
          origin,
        );
      }

      if (action === "check-duplicate") {
        const requestedNoteNumber = String(
          event.queryStringParameters?.noteNumber || "",
        ).trim();

        if (!requestedNoteNumber) {
          return createResponse(
            400,
            { error: "Note number is required for duplicate check" },
            origin,
          );
        }

        const existingNote = await notesCollection.findOne({
          noteNumber: requestedNoteNumber,
          isDeleted: { $ne: true },
        });

        return createResponse(
          200,
          {
            exists: Boolean(existingNote),
            noteNumber: requestedNoteNumber,
          },
          origin,
        );
      }

      if (id) {
        const note = await notesCollection.findOne({
          _id: new ObjectId(id),
          isDeleted: { $ne: true },
        });

        if (!note) {
          return createResponse(404, { error: "Note not found" }, origin);
        }

        const binding = await getNoteTermsBinding();
        const { document: hydratedNote, patch } = applyTermsBindingToDocument(
          note,
          binding,
        );

        if (patch) {
          await notesCollection.updateOne(
            { _id: note._id },
            {
              $set: patch,
            },
          );
        }

        return createResponse(200, hydratedNote, origin);
      }

      const filterQuery = { isDeleted: { $ne: true } };
      const params = event.queryStringParameters || {};

      Object.entries(params).forEach(([key, value]) => {
        if (!value || value === "" || value === "All") return;
        if (
          ["page", "limit", "sortBy", "sortOrder", "search", "id"].includes(key)
        ) {
          return;
        }
        if (key === "filter") return;
        if (key.endsWith("_start") || key.endsWith("_end")) return;

        if (["noteType", "status"].includes(key)) {
          filterQuery[key] = value.trim();
          return;
        }

        if (typeof value === "string" && value.includes(",")) {
          filterQuery[key] = {
            $in: value.split(",").map((item) => item.trim()),
          };
          return;
        }

        if (typeof value === "string") {
          filterQuery[key] = { $regex: value.trim(), $options: "i" };
          return;
        }

        filterQuery[key] = value;
      });

      const dateRanges = {};

      Object.entries(params).forEach(([key, value]) => {
        if (!value) return;

        const mapDateKey = (rawKey) => {
          const baseKey = rawKey.replace(/_(start|end)$/, "");
          if (baseKey === "noteDateTime") return "noteDate";
          if (baseKey === "createdDateTime") return "createdAt";
          return baseKey;
        };

        if (key.endsWith("_start")) {
          const baseKey = mapDateKey(key);
          if (!dateRanges[baseKey]) dateRanges[baseKey] = {};

          const dateParts = value.split("-");
          if (dateParts.length === 3) {
            const year = parseInt(dateParts[0], 10);
            const month = parseInt(dateParts[1], 10) - 1;
            const day = parseInt(dateParts[2], 10);
            dateRanges[baseKey].$gte = new Date(
              Date.UTC(year, month, day, 0, 0, 0, 0),
            );
          }
        }

        if (key.endsWith("_end")) {
          const baseKey = mapDateKey(key);
          if (!dateRanges[baseKey]) dateRanges[baseKey] = {};

          const dateParts = value.split("-");
          if (dateParts.length === 3) {
            const year = parseInt(dateParts[0], 10);
            const month = parseInt(dateParts[1], 10) - 1;
            const day = parseInt(dateParts[2], 10);
            dateRanges[baseKey].$lte = new Date(
              Date.UTC(year, month, day, 23, 59, 59, 999),
            );
          }
        }
      });

      Object.entries(dateRanges).forEach(([key, range]) => {
        filterQuery[key] = range;
      });

      if (filter) {
        switch (filter) {
          case "credit":
            filterQuery.noteType = "Credit Note";
            break;
          case "debit":
            filterQuery.noteType = "Debit Note";
            break;
          case "pending":
            filterQuery.status = "Pending";
            break;
          case "approved":
            filterQuery.status = "Approved";
            break;
          default:
            break;
        }
      }

      if (search) {
        filterQuery.$or = [
          { noteNumber: { $regex: search, $options: "i" } },
          { clientName: { $regex: search, $options: "i" } },
          { businessName: { $regex: search, $options: "i" } },
          { referenceNumber: { $regex: search, $options: "i" } },
          { remarks: { $regex: search, $options: "i" } },
        ];
      }

      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);
      const skip = (pageNum - 1) * limitNum;
      const sortObject = {};
      sortObject[sortBy] = sortOrder === "asc" ? 1 : -1;
      const shouldIncludeMeta = includeMeta !== "false";

      const totalRecords = await notesCollection.countDocuments(filterQuery);

      const notes = await notesCollection
        .find(filterQuery)
        .sort(sortObject)
        .skip(skip)
        .limit(limitNum)
        .toArray();

      const binding = await getNoteTermsBinding();
      const patchedNotes = [];
      const backfillUpdates = [];

      notes.forEach((note) => {
        const { document: hydratedNote, patch } = applyTermsBindingToDocument(
          note,
          binding,
        );
        patchedNotes.push(hydratedNote);

        if (patch) {
          backfillUpdates.push({
            updateOne: {
              filter: { _id: note._id },
              update: {
                $set: patch,
              },
            },
          });
        }
      });

      if (backfillUpdates.length > 0) {
        await notesCollection.bulkWrite(backfillUpdates, {
          ordered: false,
        });
      }

      let noteTypeValues = [];
      let statusValues = [];
      let totalCredit = 0;
      let totalDebit = 0;
      let totalPending = 0;
      let totalApproved = 0;

      if (shouldIncludeMeta) {
        if (notesMetaCache.value && notesMetaCache.expiresAt > Date.now()) {
          ({
            noteTypeValues,
            statusValues,
            totalCredit,
            totalDebit,
            totalPending,
            totalApproved,
          } = notesMetaCache.value);
        } else {
          const [
            distinctNoteTypes,
            distinctStatuses,
            creditCount,
            debitCount,
            pendingCount,
            approvedCount,
          ] = await Promise.all([
            notesCollection.distinct("noteType", {
              isDeleted: { $ne: true },
              noteType: { $exists: true, $ne: "" },
            }),
            notesCollection.distinct("status", {
              isDeleted: { $ne: true },
              status: { $exists: true, $ne: "" },
            }),
            notesCollection.countDocuments({
              isDeleted: { $ne: true },
              noteType: "Credit Note",
            }),
            notesCollection.countDocuments({
              isDeleted: { $ne: true },
              noteType: "Debit Note",
            }),
            notesCollection.countDocuments({
              isDeleted: { $ne: true },
              status: "Pending",
            }),
            notesCollection.countDocuments({
              isDeleted: { $ne: true },
              status: "Approved",
            }),
          ]);

          noteTypeValues = distinctNoteTypes;
          statusValues = distinctStatuses;
          totalCredit = creditCount;
          totalDebit = debitCount;
          totalPending = pendingCount;
          totalApproved = approvedCount;

          notesMetaCache = {
            value: {
              noteTypeValues,
              statusValues,
              totalCredit,
              totalDebit,
              totalPending,
              totalApproved,
            },
            expiresAt: Date.now() + NOTES_META_CACHE_TTL_MS,
          };
        }
      }

      return createResponse(
        200,
        {
          data: patchedNotes,
          pagination: {
            page: pageNum,
            limit: limitNum,
            totalRecords,
            totalPages: Math.ceil(totalRecords / limitNum),
          },
          ...(shouldIncludeMeta
            ? {
                statistics: {
                  total: totalRecords,
                  creditNotes: totalCredit,
                  debitNotes: totalDebit,
                  pending: totalPending,
                  approved: totalApproved,
                },
                filterOptions: {
                  noteType: ["All", ...noteTypeValues.sort()],
                  status: ["All", ...statusValues.sort()],
                },
              }
            : {}),
        },
        origin,
      );
    }

    if (event.httpMethod === "POST") {
      const noteData = JSON.parse(event.body || "{}");
      delete noteData.creditDebitNoteTermsVersion;
      delete noteData.creditDebitNoteTermsConditionsSnapshot;
      const noteNumber = String(noteData.noteNumber || "").trim();
      const noteType = String(noteData.noteType || "").trim();
      const clientName = String(noteData.clientName || "").trim();
      const noteDate = noteData.noteDate ? new Date(noteData.noteDate) : null;
      const normalizedItems = sanitizeNoteItems(noteData.items);
      const normalizedAppliedAdvances = normalizeAppliedAdvances(
        noteData.appliedAdvances,
      );

      if (
        !noteNumber ||
        !noteType ||
        !clientName ||
        !noteDate ||
        Number.isNaN(noteDate.getTime())
      ) {
        return createResponse(
          400,
          {
            error:
              "Note Number, Note Type, Client Name, and Note Date are required.",
          },
          origin,
        );
      }

      if (normalizedItems.length === 0) {
        return createResponse(
          400,
          {
            error:
              "At least one valid item with name, quantity and price is required.",
          },
          origin,
        );
      }

      const duplicateNote = await notesCollection.findOne({
        noteNumber,
        isDeleted: { $ne: true },
      });

      if (duplicateNote) {
        return createResponse(
          409,
          {
            error: "Note Number already exists. Please use a different number.",
          },
          origin,
        );
      }

      const itemsAmount = sumItemsAmount(normalizedItems);
      const amount = itemsAmount > 0 ? itemsAmount : toNumber(noteData.amount);
      const taxRate = toNumber(noteData.taxRate);
      const taxAmount =
        Number.isFinite(toNumber(noteData.taxAmount)) &&
        toNumber(noteData.taxAmount) > 0
          ? toNumber(noteData.taxAmount)
          : Number(((amount * taxRate) / 100).toFixed(2));
      const totalAmount =
        Number.isFinite(toNumber(noteData.totalAmount)) &&
        toNumber(noteData.totalAmount) > 0
          ? toNumber(noteData.totalAmount)
          : Number((amount + taxAmount).toFixed(2));

      const binding = await getNoteTermsBinding();

      const result = await notesCollection.insertOne({
        ...noteData,
        items: normalizedItems,
        noteNumber,
        noteType,
        clientName,
        businessName: String(noteData.businessName || "").trim(),
        referenceNumber: String(noteData.referenceNumber || "").trim(),
        noteDate,
        amount,
        taxRate,
        taxAmount,
        totalAmount,
        status: String(noteData.status || "Pending").trim() || "Pending",
        remarks: String(noteData.remarks || "").trim(),
        // Credit note fields
        refundStatus: String(noteData.refundStatus || "").trim(),
        refundDate: noteData.refundDate ? new Date(noteData.refundDate) : null,
        refundAmount: toNumber(noteData.refundAmount),
        refundMethod: String(noteData.refundMethod || "").trim(),
        // Debit note fields
        paymentStatus:
          String(noteData.paymentStatus || "").trim() ||
          getDebitNotePaymentStatus(
            totalAmount,
            toNumber(noteData.receivedAmount),
          ),
        paymentDate: noteData.paymentDate
          ? new Date(noteData.paymentDate)
          : null,
        receivedAmount: toNumber(noteData.receivedAmount),
        paymentMethod: String(noteData.paymentMethod || "").trim(),
        appliedAdvances: normalizedAppliedAdvances,
        creditDebitNoteTermsVersion: binding?.version || "V1.0.0",
        createdAt: new Date(),
        updatedAt: new Date(),
        ...getAuditFieldsFromEvent(event, "create"),
      });

      if (noteType === "Debit Note" && normalizedAppliedAdvances.length > 0) {
        const receiptsCollection = db.collection("payment_receipts");
        for (const advance of normalizedAppliedAdvances) {
          if (!ObjectId.isValid(advance.advanceId)) continue;
          const receipt = await receiptsCollection.findOne({
            _id: new ObjectId(advance.advanceId),
            isDeleted: { $ne: true },
            paymentType: "advance",
          });
          if (!receipt) continue;

          const nextAdjusted = Math.min(
            toNumber(receipt.amount || 0),
            toNumber(receipt.adjustedAmount || 0) +
              toNumber(advance.appliedAmount),
          );
          await receiptsCollection.updateOne(
            { _id: receipt._id },
            {
              $set: {
                adjustedAmount: nextAdjusted,
                updatedAt: new Date(),
              },
            },
          );
        }
      }

      return createResponse(
        201,
        {
          message: "Note created successfully",
          id: result.insertedId,
        },
        origin,
      );
    }

    if (event.httpMethod === "PUT") {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(400, { error: "Note ID is required" }, origin);
      }

      const noteData = JSON.parse(event.body || "{}");
      delete noteData.creditDebitNoteTermsVersion;
      delete noteData.creditDebitNoteTermsConditionsSnapshot;
      const noteObjectId = new ObjectId(id);
      const noteNumber = String(noteData.noteNumber || "").trim();
      const noteType = String(noteData.noteType || "").trim();
      const clientName = String(noteData.clientName || "").trim();
      const noteDate = noteData.noteDate ? new Date(noteData.noteDate) : null;
      const normalizedItems = sanitizeNoteItems(noteData.items);
      const normalizedAppliedAdvances = normalizeAppliedAdvances(
        noteData.appliedAdvances,
      );

      if (
        !noteNumber ||
        !noteType ||
        !clientName ||
        !noteDate ||
        Number.isNaN(noteDate.getTime())
      ) {
        return createResponse(
          400,
          {
            error:
              "Note Number, Note Type, Client Name, and Note Date are required.",
          },
          origin,
        );
      }

      if (normalizedItems.length === 0) {
        return createResponse(
          400,
          {
            error:
              "At least one valid item with name, quantity and price is required.",
          },
          origin,
        );
      }

      const duplicateNote = await notesCollection.findOne({
        _id: { $ne: noteObjectId },
        noteNumber,
        isDeleted: { $ne: true },
      });

      if (duplicateNote) {
        return createResponse(
          409,
          {
            error: "Note Number already exists. Please use a different number.",
          },
          origin,
        );
      }

      const currentNote = await notesCollection.findOne({
        _id: noteObjectId,
        isDeleted: { $ne: true },
      });
      const previousAppliedAdvances = normalizeAppliedAdvances(
        currentNote?.appliedAdvances,
      );

      const itemsAmount = sumItemsAmount(normalizedItems);
      const amount = itemsAmount > 0 ? itemsAmount : toNumber(noteData.amount);
      const taxRate = toNumber(noteData.taxRate);
      const taxAmount =
        Number.isFinite(toNumber(noteData.taxAmount)) &&
        toNumber(noteData.taxAmount) > 0
          ? toNumber(noteData.taxAmount)
          : Number(((amount * taxRate) / 100).toFixed(2));
      const totalAmount =
        Number.isFinite(toNumber(noteData.totalAmount)) &&
        toNumber(noteData.totalAmount) > 0
          ? toNumber(noteData.totalAmount)
          : Number((amount + taxAmount).toFixed(2));

      const result = await notesCollection.updateOne(
        { _id: noteObjectId },
        {
          $set: {
            ...noteData,
            items: normalizedItems,
            noteNumber,
            noteType,
            clientName,
            businessName: String(noteData.businessName || "").trim(),
            referenceNumber: String(noteData.referenceNumber || "").trim(),
            noteDate,
            amount,
            taxRate,
            taxAmount,
            totalAmount,
            status: String(noteData.status || "Pending").trim() || "Pending",
            remarks: String(noteData.remarks || "").trim(),
            // Credit note fields
            refundStatus: String(noteData.refundStatus || "").trim(),
            refundDate: noteData.refundDate
              ? new Date(noteData.refundDate)
              : null,
            refundAmount: toNumber(noteData.refundAmount),
            refundMethod: String(noteData.refundMethod || "").trim(),
            // Debit note fields
            paymentStatus:
              String(noteData.paymentStatus || "").trim() ||
              getDebitNotePaymentStatus(
                totalAmount,
                toNumber(noteData.receivedAmount),
              ),
            paymentDate: noteData.paymentDate
              ? new Date(noteData.paymentDate)
              : null,
            receivedAmount: toNumber(noteData.receivedAmount),
            paymentMethod: String(noteData.paymentMethod || "").trim(),
            appliedAdvances: normalizedAppliedAdvances,
            updatedAt: new Date(),
          },
        },
      );

      if (result.matchedCount === 0) {
        return createResponse(404, { error: "Note not found" }, origin);
      }

      if (
        String(currentNote?.noteType || "") === "Debit Note" ||
        noteType === "Debit Note"
      ) {
        const receiptsCollection = db.collection("payment_receipts");
        for (const advance of previousAppliedAdvances) {
          if (!ObjectId.isValid(advance.advanceId)) continue;
          const receipt = await receiptsCollection.findOne({
            _id: new ObjectId(advance.advanceId),
            isDeleted: { $ne: true },
            paymentType: "advance",
          });
          if (!receipt) continue;
          const reversedAdjusted = Math.max(
            0,
            toNumber(receipt.adjustedAmount || 0) -
              toNumber(advance.appliedAmount),
          );
          await receiptsCollection.updateOne(
            { _id: receipt._id },
            {
              $set: {
                adjustedAmount: reversedAdjusted,
                updatedAt: new Date(),
              },
            },
          );
        }

        const shouldApplyNewAdvances = noteType === "Debit Note";
        if (!shouldApplyNewAdvances) {
          return createResponse(
            200,
            { message: "Note updated successfully" },
            origin,
          );
        }

        for (const advance of normalizedAppliedAdvances) {
          if (!ObjectId.isValid(advance.advanceId)) continue;
          const receipt = await receiptsCollection.findOne({
            _id: new ObjectId(advance.advanceId),
            isDeleted: { $ne: true },
            paymentType: "advance",
          });
          if (!receipt) continue;
          const nextAdjusted = Math.min(
            toNumber(receipt.amount || 0),
            toNumber(receipt.adjustedAmount || 0) +
              toNumber(advance.appliedAmount),
          );
          await receiptsCollection.updateOne(
            { _id: receipt._id },
            {
              $set: {
                adjustedAmount: nextAdjusted,
                updatedAt: new Date(),
              },
            },
          );
        }
      }

      return createResponse(
        200,
        { message: "Note updated successfully" },
        origin,
      );
    }

    if (event.httpMethod === "DELETE") {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(400, { error: "Note ID is required" }, origin);
      }

      const result = await notesCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            isDeleted: true,
            deletedAt: new Date(),
            updatedAt: new Date(),
            ...getAuditFieldsFromEvent(event, "delete"),
          },
        },
      );

      if (result.matchedCount === 0) {
        return createResponse(404, { error: "Note not found" }, origin);
      }

      return createResponse(
        200,
        { message: "Note deleted successfully" },
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
