import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { ObjectId } from "mongodb";
import { verifyRequestToken, getAuditFieldsFromEvent } from "./utils/auth.js";
import { normalizePaymentMethodsInRecord } from "./utils/payment-methods.js";

const RECEIPT_META_CACHE_TTL_MS = 30 * 1000;
const receiptMetaCache = { value: null, expiresAt: 0 };

const escapeRegExp = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseDateValue = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const raw = String(value || "").trim();
  if (!raw) return null;
  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const p = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
    if (!Number.isNaN(p.getTime())) return p;
  }
  return null;
};

const getFinancialYearLabel = (dateValue) => {
  const d = parseDateValue(dateValue) || new Date();
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const startYear = month >= 4 ? year : year - 1;
  const endYearShort = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}-${endYearShort}`;
};

const getNextReceiptNumber = async (collection, prefixOrFormat = "RCPT") => {
  // If it contains slashes, it's a format like "MC/RCPT/26-27", extract the prefix
  const isFormat = prefixOrFormat.includes("/");
  let prefix = prefixOrFormat;

  if (isFormat) {
    // Remove the /0001 suffix if present to get the base format
    prefix = prefixOrFormat.replace(/\/\d{4}$/, "");
  }

  const pattern = new RegExp(`^${escapeRegExp(prefix)}/(\\d+)$`);
  const existing = await collection
    .find(
      { receiptNumber: { $regex: pattern } },
      { projection: { receiptNumber: 1 } },
    )
    .toArray();

  let maxNum = 0;
  existing.forEach((doc) => {
    const m = String(doc.receiptNumber || "").match(pattern);
    if (m) {
      const n = parseInt(m[1], 10);
      if (!Number.isNaN(n) && n > maxNum) maxNum = n;
    }
  });
  return `${prefix}/${String(maxNum + 1).padStart(4, "0")}`;
};

/**
 * Payment Receipts API
 * Handles CRUD for both regular and advance payment receipts.
 * Collection: payment_receipts
 */
export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === "OPTIONS") {
    return createResponse(200, {}, origin);
  }

  try {
    const user = verifyRequestToken(event);
    const { db } = await connectToDatabase();
    const col = db.collection("payment_receipts");
    const yearsCol = db.collection("financialYears");

    // ── GET ──────────────────────────────────────────────────────────────────
    if (event.httpMethod === "GET") {
      const {
        action,
        id,
        page = 1,
        limit = 10,
        search,
        financialYear,
        period,
        paymentType,
        paymentMethod,
        clientRefId,
        sortBy = "createdAt",
        sortOrder = "desc",
        filter,
        receiptDate_start,
        receiptDate_end,
        createdDateTime_start,
        createdDateTime_end,
      } = event.queryStringParameters || {};

      // ── next-number ──────────────────────────────────────────────────────
      if (action === "next-number") {
        let receiptNumberPrefix = "RCPT"; // fallback prefix

        // If financialYear is provided, fetch the format from the year record
        if (financialYear) {
          const yearRecord = await yearsCol.findOne(
            { financialYear, isDeleted: { $ne: true } },
            { projection: { paymentReceiptFormat: 1 } },
          );

          if (yearRecord?.paymentReceiptFormat) {
            // Extract the prefix part (everything before /0001 or /0000)
            receiptNumberPrefix = yearRecord.paymentReceiptFormat.replace(
              /\/\d{4}$/,
              "",
            );
          }
        }

        const nextNumber = await getNextReceiptNumber(col, receiptNumberPrefix);
        return createResponse(
          200,
          { nextNumber, receiptNumber: nextNumber },
          origin,
        );
      }

      // ── available-advances: unapplied/partial advances for a client ──────
      if (action === "available-advances") {
        if (!clientRefId) {
          return createResponse(
            400,
            { error: "clientRefId is required" },
            origin,
          );
        }
        const advances = await col
          .find({
            clientRefId,
            paymentType: "advance",
            isDeleted: { $ne: true },
            $expr: { $gt: ["$amount", { $ifNull: ["$adjustedAmount", 0] }] },
          })
          .sort({ receiptDate: 1 })
          .toArray();

        const result = advances.map((a) => ({
          id: String(a._id),
          receiptNumber: a.receiptNumber,
          receiptDate: a.receiptDate,
          amount: Number(a.amount || 0),
          adjustedAmount: Number(a.adjustedAmount || 0),
          availableAmount:
            Number(a.amount || 0) - Number(a.adjustedAmount || 0),
          paymentMethod: a.paymentMethod,
          note: a.note || "",
        }));
        return createResponse(
          200,
          { advances: result, total: result.length },
          origin,
        );
      }

      // ── single record ────────────────────────────────────────────────────
      if (id) {
        if (!ObjectId.isValid(id)) {
          return createResponse(400, { error: "Invalid ID" }, origin);
        }
        const doc = await col.findOne({
          _id: new ObjectId(id),
          isDeleted: { $ne: true },
        });
        if (!doc)
          return createResponse(404, { error: "Receipt not found" }, origin);
        return createResponse(200, doc, origin);
      }

      // ── list ─────────────────────────────────────────────────────────────
      const filterQuery = { isDeleted: { $ne: true } };

      // Financial year filter
      if (financialYear && financialYear !== "ALL") {
        const yearRecord = await yearsCol.findOne({
          financialYear,
          isDeleted: { $ne: true },
        });
        if (yearRecord?.startDate && yearRecord?.endDate) {
          filterQuery.receiptDate = {
            $gte: yearRecord.startDate,
            $lte: yearRecord.endDate,
          };
        }
      }

      // Period filter
      if (period && period !== "yearly") {
        const today = new Date();
        let startDate, endDate;
        const pad = (n) => String(n).padStart(2, "0");

        if (period === "daily") {
          startDate = new Date(
            today.getFullYear(),
            today.getMonth(),
            today.getDate(),
          );
          endDate = new Date(
            today.getFullYear(),
            today.getMonth(),
            today.getDate(),
            23,
            59,
            59,
            999,
          );
        } else if (period === "monthly") {
          startDate = new Date(today.getFullYear(), today.getMonth(), 1);
          endDate = new Date(
            today.getFullYear(),
            today.getMonth() + 1,
            0,
            23,
            59,
            59,
            999,
          );
        } else if (period === "quarterly") {
          const q = Math.floor(today.getMonth() / 3);
          startDate = new Date(today.getFullYear(), q * 3, 1);
          endDate = new Date(
            today.getFullYear(),
            (q + 1) * 3,
            0,
            23,
            59,
            59,
            999,
          );
        } else if (period === "halfYearly") {
          const half = today.getMonth() < 6 ? 0 : 6;
          startDate = new Date(today.getFullYear(), half, 1);
          endDate = new Date(today.getFullYear(), half + 6, 0, 23, 59, 59, 999);
        }

        if (startDate && endDate) {
          const startStr = `${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-${pad(startDate.getDate())}`;
          const endStr = `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-${pad(endDate.getDate())}`;
          filterQuery.receiptDate = { $gte: startStr, $lte: endStr };
        }
      }

      // Type filter (advance / regular)
      if (paymentType && paymentType !== "All") {
        filterQuery.paymentType = paymentType;
      }

      // Payment method filter
      if (paymentMethod && paymentMethod !== "All") {
        filterQuery.paymentMethod = paymentMethod;
      }

      // Client filter
      if (clientRefId) {
        filterQuery.clientRefId = clientRefId;
      }

      // Date range filters
      if (receiptDate_start || receiptDate_end) {
        filterQuery.receiptDate = filterQuery.receiptDate || {};
        if (receiptDate_start) filterQuery.receiptDate.$gte = receiptDate_start;
        if (receiptDate_end) filterQuery.receiptDate.$lte = receiptDate_end;
      }

      if (createdDateTime_start || createdDateTime_end) {
        filterQuery.createdAt = {};
        if (createdDateTime_start)
          filterQuery.createdAt.$gte = new Date(createdDateTime_start);
        if (createdDateTime_end)
          filterQuery.createdAt.$lte = new Date(createdDateTime_end);
      }

      // Card filter
      if (filter && filter !== "total") {
        if (filter === "advance") filterQuery.paymentType = "advance";
        else if (filter === "regular") filterQuery.paymentType = "regular";
      }

      // Search
      if (search) {
        const searchRegex = { $regex: escapeRegExp(search), $options: "i" };
        filterQuery.$or = [
          { receiptNumber: searchRegex },
          { clientName: searchRegex },
          { businessName: searchRegex },
          { paymentMethod: searchRegex },
          { note: searchRegex },
          { purpose: searchRegex },
        ];
      }

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 10));
      const skip = (pageNum - 1) * limitNum;

      const validSortFields = [
        "receiptDate",
        "amount",
        "clientName",
        "receiptNumber",
        "createdAt",
      ];
      const sortField = validSortFields.includes(sortBy) ? sortBy : "createdAt";
      const sortDir = sortOrder === "asc" ? 1 : -1;

      const [records, totalCount] = await Promise.all([
        col
          .find(filterQuery)
          .sort({ [sortField]: sortDir })
          .skip(skip)
          .limit(limitNum)
          .toArray(),
        col.countDocuments(filterQuery),
      ]);

      // Statistics
      const allForStats = await col
        .find({ isDeleted: { $ne: true } })
        .project({ paymentType: 1, amount: 1, adjustedAmount: 1 })
        .toArray();

      const statistics = {
        total: allForStats.length,
        advance: allForStats.filter((r) => r.paymentType === "advance").length,
        regular: allForStats.filter((r) => r.paymentType !== "advance").length,
        totalAmount: allForStats.reduce((s, r) => s + Number(r.amount || 0), 0),
        advancePending: allForStats
          .filter((r) => r.paymentType === "advance")
          .reduce(
            (s, r) =>
              s + (Number(r.amount || 0) - Number(r.adjustedAmount || 0)),
            0,
          ),
      };

      // Meta for filter options
      let meta = null;
      const now = Date.now();
      if (!receiptMetaCache.value || receiptMetaCache.expiresAt < now) {
        const allDocs = await col
          .find({ isDeleted: { $ne: true } })
          .project({ paymentMethod: 1, paymentType: 1 })
          .toArray();
        const paymentMethods = [
          ...new Set(allDocs.map((d) => d.paymentMethod).filter(Boolean)),
        ];
        const paymentTypes = [
          ...new Set(allDocs.map((d) => d.paymentType).filter(Boolean)),
        ];
        meta = { paymentMethods, paymentTypes };
        receiptMetaCache.value = meta;
        receiptMetaCache.expiresAt = now + RECEIPT_META_CACHE_TTL_MS;
      } else {
        meta = receiptMetaCache.value;
      }

      const mappedRecords = records.map((r) => ({
        ...r,
        id: String(r._id),
        availableAmount: Number(r.amount || 0) - Number(r.adjustedAmount || 0),
        adjustmentStatus:
          r.paymentType !== "advance"
            ? "N/A"
            : Number(r.adjustedAmount || 0) >= Number(r.amount || 0)
              ? "Fully Applied"
              : Number(r.adjustedAmount || 0) > 0
                ? "Partially Applied"
                : "Unapplied",
      }));

      return createResponse(
        200,
        {
          records: mappedRecords,
          total: totalCount,
          page: pageNum,
          limit: limitNum,
          statistics,
          meta,
        },
        origin,
      );
    }

    // ── POST ─────────────────────────────────────────────────────────────────
    if (event.httpMethod === "POST") {
      let body;
      try {
        body = JSON.parse(event.body || "{}");
      } catch {
        return createResponse(400, { error: "Invalid JSON body" }, origin);
      }

      const {
        receiptNumber: suppliedReceiptNumber,
        receiptDate,
        clientRefId,
        clientId,
        clientName,
        businessName,
        phoneNumber,
        email,
        address,
        amount,
        paymentMethod,
        bankName,
        chequeNumber,
        purpose,
        note,
        paymentType = "regular", // "regular" | "advance"
        invoiceId,
        invoiceNumber,
        financialYear: suppliedFY,
      } = body;

      // Validation
      if (!clientRefId && !clientName) {
        return createResponse(400, { error: "Client is required" }, origin);
      }
      if (!receiptDate) {
        return createResponse(
          400,
          { error: "Receipt date is required" },
          origin,
        );
      }
      const numAmount = Number(amount);
      if (!amount || isNaN(numAmount) || numAmount <= 0) {
        return createResponse(
          400,
          { error: "Amount must be a positive number" },
          origin,
        );
      }
      if (!paymentMethod) {
        return createResponse(
          400,
          { error: "Payment method is required" },
          origin,
        );
      }

      // Get financial year
      const financialYear = suppliedFY || getFinancialYearLabel(receiptDate);

      // Fetch year record to get paymentReceiptFormat
      let receiptNumberPrefix = "RCPT"; // fallback prefix
      const yearRecord = await yearsCol.findOne(
        { financialYear, isDeleted: { $ne: true } },
        { projection: { paymentReceiptFormat: 1 } },
      );

      if (yearRecord?.paymentReceiptFormat) {
        // Extract the prefix part (everything before /0001 or /0000)
        receiptNumberPrefix = yearRecord.paymentReceiptFormat.replace(
          /\/\d{4}$/,
          "",
        );
      }

      const receiptNumber =
        suppliedReceiptNumber ||
        (await getNextReceiptNumber(col, receiptNumberPrefix));

      const auditFields = getAuditFieldsFromEvent(event, user);
      const now = new Date();

      // Normalize payment methods
      let normalizedRecord = normalizePaymentMethodsInRecord({
        paymentMethod,
      });

      const newDoc = {
        receiptNumber,
        receiptDate,
        clientRefId: clientRefId || "",
        clientId: clientId || "",
        clientName: clientName || "",
        businessName: businessName || "",
        phoneNumber: phoneNumber || "",
        email: email || "",
        address: address || "",
        amount: numAmount,
        adjustedAmount: 0, // tracks how much of advance has been applied to invoices
        paymentMethod: normalizedRecord.paymentMethod || paymentMethod,
        bankName: bankName || "",
        chequeNumber: chequeNumber || "",
        purpose:
          purpose ||
          (paymentType === "advance" ? "Advance Payment" : "Sales Invoice"),
        note: note || "",
        paymentType: ["advance", "regular"].includes(paymentType)
          ? paymentType
          : "regular",
        invoiceId: invoiceId || null,
        invoiceNumber: invoiceNumber || null,
        financialYear,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
        ...auditFields,
      };

      const result = await col.insertOne(newDoc);
      receiptMetaCache.expiresAt = 0;

      return createResponse(
        201,
        { ...newDoc, id: String(result.insertedId), _id: result.insertedId },
        origin,
      );
    }

    // ── PUT ──────────────────────────────────────────────────────────────────
    if (event.httpMethod === "PUT") {
      const { id } = event.queryStringParameters || {};
      if (!id || !ObjectId.isValid(id)) {
        return createResponse(400, { error: "Valid ID is required" }, origin);
      }

      let body;
      try {
        body = JSON.parse(event.body || "{}");
      } catch {
        return createResponse(400, { error: "Invalid JSON body" }, origin);
      }

      const existing = await col.findOne({
        _id: new ObjectId(id),
        isDeleted: { $ne: true },
      });
      if (!existing) {
        return createResponse(404, { error: "Receipt not found" }, origin);
      }

      const auditFields = getAuditFieldsFromEvent(event, user);
      const numAmount =
        body.amount !== undefined ? Number(body.amount) : existing.amount;

      let normalizedRecord = normalizePaymentMethodsInRecord({
        paymentMethod: body.paymentMethod || existing.paymentMethod,
      });

      const updateFields = {
        ...(body.receiptDate !== undefined && {
          receiptDate: body.receiptDate,
        }),
        ...(body.clientRefId !== undefined && {
          clientRefId: body.clientRefId,
        }),
        ...(body.clientId !== undefined && { clientId: body.clientId }),
        ...(body.clientName !== undefined && { clientName: body.clientName }),
        ...(body.businessName !== undefined && {
          businessName: body.businessName,
        }),
        ...(body.phoneNumber !== undefined && {
          phoneNumber: body.phoneNumber,
        }),
        ...(body.email !== undefined && { email: body.email }),
        ...(body.address !== undefined && { address: body.address }),
        ...(body.amount !== undefined && { amount: numAmount }),
        ...(body.paymentMethod !== undefined && {
          paymentMethod: normalizedRecord.paymentMethod,
        }),
        ...(body.bankName !== undefined && { bankName: body.bankName }),
        ...(body.chequeNumber !== undefined && {
          chequeNumber: body.chequeNumber,
        }),
        ...(body.purpose !== undefined && { purpose: body.purpose }),
        ...(body.note !== undefined && { note: body.note }),
        ...(body.invoiceId !== undefined && { invoiceId: body.invoiceId }),
        ...(body.invoiceNumber !== undefined && {
          invoiceNumber: body.invoiceNumber,
        }),
        updatedAt: new Date(),
        ...auditFields,
      };

      await col.updateOne({ _id: new ObjectId(id) }, { $set: updateFields });
      receiptMetaCache.expiresAt = 0;

      const updated = await col.findOne({ _id: new ObjectId(id) });
      return createResponse(
        200,
        { ...updated, id: String(updated._id) },
        origin,
      );
    }

    // ── DELETE ───────────────────────────────────────────────────────────────
    if (event.httpMethod === "DELETE") {
      const { id } = event.queryStringParameters || {};
      if (!id || !ObjectId.isValid(id)) {
        return createResponse(400, { error: "Valid ID is required" }, origin);
      }

      const existing = await col.findOne({
        _id: new ObjectId(id),
        isDeleted: { $ne: true },
      });
      if (!existing) {
        return createResponse(404, { error: "Receipt not found" }, origin);
      }

      // Prevent deletion of advance receipts that have already been applied to invoices
      if (
        existing.paymentType === "advance" &&
        Number(existing.adjustedAmount || 0) > 0
      ) {
        return createResponse(
          400,
          {
            error:
              "Cannot delete an advance payment that has already been applied to an invoice. Please reverse the adjustment first.",
          },
          origin,
        );
      }

      const auditFields = getAuditFieldsFromEvent(event, user);
      await col.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            isDeleted: true,
            deletedAt: new Date(),
            updatedAt: new Date(),
            ...auditFields,
          },
        },
      );
      receiptMetaCache.expiresAt = 0;

      return createResponse(
        200,
        { message: "Receipt deleted successfully" },
        origin,
      );
    }

    return createResponse(405, { error: "Method not allowed" }, origin);
  } catch (error) {
    console.error("Payment receipts handler error:", error);
    if (
      error?.message?.includes("Unauthorized") ||
      error?.message?.includes("JWT")
    ) {
      return createResponse(
        401,
        { error: "Unauthorized" },
        error?.origin || "",
      );
    }
    return createResponse(500, { error: "Internal server error" }, "");
  }
}
