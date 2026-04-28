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

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const derivePaymentStatus = (totalAmount, receivedAmount) => {
  const total = toNumber(totalAmount);
  const received = toNumber(receivedAmount);

  if (received <= 0) return "Unpaid";
  if (total > 0 && received >= total) return "Paid";
  return "Partial";
};

const deriveDebitNotePaymentStatus = (totalAmount, receivedAmount) => {
  const total = toNumber(totalAmount);
  const received = toNumber(receivedAmount);
  if (received <= 0) return "Unpaid";
  if (total > 0 && received >= total) return "Paid";
  return "Partial";
};

const getLatestAdvanceMeta = (appliedAdvances = []) => {
  const candidates = (appliedAdvances || [])
    .filter((adv) => toNumber(adv.appliedAmount) > 0)
    .map((adv) => ({
      receiptDate: adv.receiptDate || adv.receipt_date || adv.date || "",
      paymentMethod: adv.paymentMethod || "",
    }));

  if (candidates.length === 0) {
    return { receiptDate: "", paymentMethod: "" };
  }

  const withDate = candidates.filter((c) => c.receiptDate);
  if (withDate.length === 0) {
    return candidates[candidates.length - 1];
  }

  withDate.sort((a, b) => {
    const aTime = parseDateValue(a.receiptDate)?.getTime() || 0;
    const bTime = parseDateValue(b.receiptDate)?.getTime() || 0;
    return aTime - bTime;
  });

  return withDate[withDate.length - 1];
};

const getReceiptEventTime = (receipt) => {
  const created = parseDateValue(receipt?.createdAt)?.getTime() || 0;
  const updated = parseDateValue(receipt?.updatedAt)?.getTime() || 0;
  const receiptDate = parseDateValue(receipt?.receiptDate)?.getTime() || 0;
  let objectIdTime = 0;

  if (receipt?._id instanceof ObjectId) {
    objectIdTime = receipt._id.getTimestamp().getTime();
  }

  return Math.max(created, updated, receiptDate, objectIdTime);
};

const normalizeInvoiceRef = (ref = {}) => {
  const invoiceId = String(ref.invoiceId || ref.id || "").trim();
  const invoiceNumber = String(ref.invoiceNumber || ref.number || "").trim();
  if (!invoiceId && !invoiceNumber) return null;
  return { invoiceId, invoiceNumber };
};

const collectInvoiceRefsFromReceipt = (receipt = {}) => {
  const refsMap = new Map();

  const addRef = (ref) => {
    const normalized = normalizeInvoiceRef(ref);
    if (!normalized) return;
    const key = `${normalized.invoiceId}::${normalized.invoiceNumber}`;
    refsMap.set(key, normalized);
  };

  addRef({
    invoiceId: receipt.invoiceId,
    invoiceNumber: receipt.invoiceNumber,
  });

  if (Array.isArray(receipt.invoiceIds)) {
    receipt.invoiceIds.forEach((id) => addRef({ invoiceId: id }));
  }

  if (Array.isArray(receipt.invoiceNumbers)) {
    receipt.invoiceNumbers.forEach((number) =>
      addRef({ invoiceNumber: number }),
    );
  }

  if (Array.isArray(receipt.invoiceAllocations)) {
    receipt.invoiceAllocations.forEach((allocation) => addRef(allocation));
  }

  return Array.from(refsMap.values());
};

const allocationAmountForInvoice = (
  receipt = {},
  resolvedInvoiceId,
  resolvedInvoiceNumber,
) => {
  const allocations = Array.isArray(receipt.invoiceAllocations)
    ? receipt.invoiceAllocations
    : [];

  if (allocations.length === 0) {
    return toNumber(receipt.amount);
  }

  return allocations.reduce((sum, allocation) => {
    const allocationId = String(allocation?.invoiceId || "");
    const allocationNumber = String(allocation?.invoiceNumber || "");
    const matches =
      (allocationId && allocationId === resolvedInvoiceId) ||
      (allocationNumber && allocationNumber === resolvedInvoiceNumber);

    if (!matches) return sum;
    return (
      sum + toNumber(allocation?.allocatedAmount || allocation?.amount || 0)
    );
  }, 0);
};

const computeInvoiceDue = (invoice = {}) => {
  const totalAmount = toNumber(
    invoice?.taxData?.totalAmount || invoice?.totalAmount,
  );
  const receivedAmount = toNumber(invoice?.amountReceived || 0);
  return {
    totalAmount,
    receivedAmount,
    dueAmount: Math.max(0, totalAmount - receivedAmount),
  };
};

const resolveInvoicesForAllocation = async (
  db,
  { clientRefId, invoiceRefs = [] },
) => {
  const invoicesCol = db.collection("invoices");
  const normalizedRefs = (invoiceRefs || [])
    .map((ref) => normalizeInvoiceRef(ref))
    .filter(Boolean);

  if (normalizedRefs.length === 0) return [];

  const objectIdRefs = normalizedRefs
    .map((ref) => ref.invoiceId)
    .filter((id) => ObjectId.isValid(id))
    .map((id) => new ObjectId(id));

  const numericIdRefs = normalizedRefs
    .map((ref) => ref.invoiceId)
    .filter((id) => id && !ObjectId.isValid(id));

  const invoiceNumberRefs = normalizedRefs
    .map((ref) => ref.invoiceNumber)
    .filter(Boolean);

  const query = {
    isDeleted: { $ne: true },
    ...(clientRefId ? { clientRefId } : {}),
    $or: [
      ...(objectIdRefs.length ? [{ _id: { $in: objectIdRefs } }] : []),
      ...(numericIdRefs.length ? [{ id: { $in: numericIdRefs } }] : []),
      ...(invoiceNumberRefs.length
        ? [{ invoiceNumber: { $in: invoiceNumberRefs } }]
        : []),
    ],
  };

  if (!query.$or.length) return [];

  const invoices = await invoicesCol.find(query).toArray();

  const indexed = invoices
    .map((invoice) => ({
      ...invoice,
      __invoiceId: String(invoice?._id || invoice?.id || ""),
      __invoiceNumber: String(invoice?.invoiceNumber || ""),
      __due: computeInvoiceDue(invoice).dueAmount,
      __invoiceDateTime:
        parseDateValue(
          invoice?.invoiceDate || invoice?.createdAt || invoice?.createdDate,
        )?.getTime() || 0,
    }))
    .filter((invoice) => invoice.__invoiceId || invoice.__invoiceNumber)
    .sort((a, b) => {
      if (a.__invoiceDateTime !== b.__invoiceDateTime) {
        return a.__invoiceDateTime - b.__invoiceDateTime;
      }
      return String(a.__invoiceNumber).localeCompare(String(b.__invoiceNumber));
    });

  return indexed;
};

const buildInvoiceAllocations = (invoices = [], totalReceiptAmount = 0) => {
  let remaining = toNumber(totalReceiptAmount);
  const allocations = [];

  for (const invoice of invoices) {
    if (remaining <= 0) break;
    const dueAmount = toNumber(invoice.__due);
    if (dueAmount <= 0) continue;

    const allocatedAmount = Math.min(remaining, dueAmount);
    if (allocatedAmount <= 0) continue;

    allocations.push({
      invoiceId: invoice.__invoiceId,
      invoiceNumber: invoice.__invoiceNumber,
      allocatedAmount,
      previousDueAmount: dueAmount,
      dueAfterAllocation: Math.max(0, dueAmount - allocatedAmount),
    });

    remaining -= allocatedAmount;
  }

  return {
    allocations,
    allocatedTotal: allocations.reduce(
      (sum, allocation) => sum + toNumber(allocation.allocatedAmount),
      0,
    ),
    remainingAmount: Math.max(0, remaining),
  };
};

const recalculateInvoicePaymentSummary = async (
  db,
  { invoiceId, invoiceNumber },
) => {
  if (!invoiceId && !invoiceNumber) return;

  const invoicesCol = db.collection("invoices");

  const invoiceFilter = { isDeleted: { $ne: true } };
  if (invoiceId && ObjectId.isValid(invoiceId)) {
    invoiceFilter._id = new ObjectId(invoiceId);
  } else if (invoiceNumber) {
    invoiceFilter.invoiceNumber = invoiceNumber;
  } else {
    return;
  }

  const invoice = await invoicesCol.findOne(invoiceFilter);
  if (!invoice) return;

  const resolvedInvoiceId = String(invoice._id);
  const resolvedInvoiceNumber = String(invoice.invoiceNumber || "");
  const receiptFilter = {
    isDeleted: { $ne: true },
    paymentType: { $ne: "advance" },
    $or: [
      { invoiceId: resolvedInvoiceId },
      { invoiceId: resolvedInvoiceNumber },
      { invoiceNumber: resolvedInvoiceNumber },
      { invoiceIds: resolvedInvoiceId },
      { invoiceNumbers: resolvedInvoiceNumber },
      { "invoiceAllocations.invoiceId": resolvedInvoiceId },
      { "invoiceAllocations.invoiceNumber": resolvedInvoiceNumber },
    ],
  };

  const regularReceipts = await db
    .collection("payment_receipts")
    .find(receiptFilter)
    .toArray();

  const regularReceivedAmount = regularReceipts.reduce((sum, receipt) => {
    return (
      sum +
      allocationAmountForInvoice(
        receipt,
        resolvedInvoiceId,
        resolvedInvoiceNumber,
      )
    );
  }, 0);
  const latestRegularReceipt =
    regularReceipts.length > 0
      ? regularReceipts.reduce((latest, current) => {
          const latestTime = getReceiptEventTime(latest);
          const currentTime = getReceiptEventTime(current);
          return currentTime >= latestTime ? current : latest;
        })
      : null;

  const advanceAdjustedTotal = toNumber(invoice.advanceAdjustedTotal);
  const amountReceived = regularReceivedAmount + advanceAdjustedTotal;
  const totalAmount = toNumber(invoice?.taxData?.totalAmount);
  const dueAmount = Math.max(0, totalAmount - amountReceived);
  const paymentStatus = derivePaymentStatus(totalAmount, amountReceived);

  const latestAdvanceMeta = getLatestAdvanceMeta(invoice.appliedAdvances);
  const paymentDate =
    latestRegularReceipt?.receiptDate || latestAdvanceMeta.receiptDate || "";
  const paymentMethod =
    latestRegularReceipt?.paymentMethod ||
    latestAdvanceMeta.paymentMethod ||
    "";

  await invoicesCol.updateOne(
    { _id: invoice._id },
    {
      $set: {
        amountReceived: amountReceived > 0 ? String(amountReceived) : "",
        paymentStatus,
        paymentDate,
        paymentMethod,
        dueAmount: dueAmount.toFixed(2),
        updatedAt: new Date(),
      },
    },
  );
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
        clientId,
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
        const normalizedClientRefId = String(clientRefId || "").trim();
        const normalizedClientId = String(clientId || "").trim();
        if (!normalizedClientRefId && !normalizedClientId) {
          return createResponse(
            400,
            { error: "clientRefId or clientId is required" },
            origin,
          );
        }
        const clientMatch = [
          ...(normalizedClientRefId
            ? [{ clientRefId: normalizedClientRefId }, { clientId: normalizedClientRefId }]
            : []),
          ...(normalizedClientId
            ? [{ clientRefId: normalizedClientId }, { clientId: normalizedClientId }]
            : []),
        ];
        const advances = await col
          .find({
            $or: clientMatch,
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
          financialYear: a.financialYear || "",
          note: a.note || "",
        }));
        return createResponse(
          200,
          { advances: result, total: result.length },
          origin,
        );
      }

      if (action === "available-debit-notes") {
        if (!clientRefId) {
          return createResponse(
            400,
            { error: "clientRefId is required" },
            origin,
          );
        }

        const notes = await db
          .collection("creditDebitNotes")
          .find({
            isDeleted: { $ne: true },
            noteType: "Debit Note",
            $or: [{ clientId: clientRefId }, { clientRefId }],
            status: { $ne: "Cancelled" },
          })
          .sort({ noteDate: 1, createdAt: 1 })
          .toArray();

        const records = notes
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
                deriveDebitNotePaymentStatus(totalAmount, receivedAmount),
              paymentDate: note.paymentDate || "",
              paymentMethod: note.paymentMethod || "",
            };
          })
          .filter((note) => note.dueAmount > 0);

        return createResponse(
          200,
          { records, total: records.length },
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
          { debitNoteNumber: searchRegex },
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
        appliedInvoiceNumber: r.linkedInvoiceNumber || "",
        appliedDateTime: r.updatedAt || "",
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
        againstType = "invoice",
        invoiceId,
        invoiceNumber,
        invoiceIds,
        invoiceNumbers,
        debitNoteId,
        debitNoteNumber,
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

      let auditFields = getAuditFieldsFromEvent(event, user);
      const now = new Date();

      // Normalize payment methods
      let normalizedRecord = normalizePaymentMethodsInRecord({
        paymentMethod,
      });

      const normalizedPaymentType = ["advance", "regular"].includes(paymentType)
        ? paymentType
        : "regular";

      const invoiceRefs = [
        ...(Array.isArray(invoiceIds)
          ? invoiceIds.map((id) => ({ invoiceId: id }))
          : []),
        ...(Array.isArray(invoiceNumbers)
          ? invoiceNumbers.map((number) => ({ invoiceNumber: number }))
          : []),
        ...(invoiceId || invoiceNumber ? [{ invoiceId, invoiceNumber }] : []),
      ];

      const normalizedAgainstType =
        String(againstType || "").toLowerCase() === "debit_note"
          ? "debit_note"
          : "invoice";

      let regularDocAmount = numAmount;
      let regularInvoiceAllocations = [];
      let overflowAdvanceAmount = 0;
      let selectedDebitNote = null;
      let debitNoteAppliedAmount = 0;

      if (
        normalizedPaymentType === "regular" &&
        normalizedAgainstType === "invoice" &&
        invoiceRefs.length > 0
      ) {
        const allocationInvoices = await resolveInvoicesForAllocation(db, {
          clientRefId,
          invoiceRefs,
        });

        const allocationResult = buildInvoiceAllocations(
          allocationInvoices,
          numAmount,
        );

        regularInvoiceAllocations = allocationResult.allocations;
        regularDocAmount = allocationResult.allocatedTotal;
        overflowAdvanceAmount = allocationResult.remainingAmount;

        if (regularDocAmount <= 0) {
          return createResponse(
            400,
            {
              error:
                "Selected invoice(s) already paid or no due amount available for allocation.",
            },
            origin,
          );
        }
      }

      if (normalizedPaymentType === "regular" && normalizedAgainstType === "debit_note") {
        if (!debitNoteId && !debitNoteNumber) {
          return createResponse(
            400,
            { error: "Debit note selection is required for debit note receipts." },
            origin,
          );
        }

        const debitNotesCol = db.collection("creditDebitNotes");
        const debitNoteQuery = {
          isDeleted: { $ne: true },
          noteType: "Debit Note",
          $or: [{ clientId: clientRefId }, { clientRefId }],
        };
        if (debitNoteId && ObjectId.isValid(debitNoteId)) {
          debitNoteQuery._id = new ObjectId(debitNoteId);
        } else if (debitNoteNumber) {
          debitNoteQuery.noteNumber = debitNoteNumber;
        } else {
          return createResponse(400, { error: "Invalid debit note reference" }, origin);
        }

        selectedDebitNote = await debitNotesCol.findOne(debitNoteQuery);
        if (!selectedDebitNote) {
          return createResponse(404, { error: "Debit note not found for this client" }, origin);
        }

        const debitNoteTotal = toNumber(
          selectedDebitNote.totalAmount || selectedDebitNote.amount,
        );
        const debitNoteReceived = toNumber(selectedDebitNote.receivedAmount || 0);
        const debitNoteDue = Math.max(0, debitNoteTotal - debitNoteReceived);
        if (debitNoteDue <= 0) {
          return createResponse(
            400,
            { error: "Selected debit note is already fully paid." },
            origin,
          );
        }

        debitNoteAppliedAmount = Math.min(numAmount, debitNoteDue);
        regularDocAmount = debitNoteAppliedAmount;
        overflowAdvanceAmount = Math.max(0, numAmount - debitNoteAppliedAmount);
      }

      const regularDoc = {
        receiptNumber,
        receiptDate,
        clientRefId: clientRefId || "",
        clientId: clientId || "",
        clientName: clientName || "",
        businessName: businessName || "",
        phoneNumber: phoneNumber || "",
        email: email || "",
        address: address || "",
        amount: regularDocAmount,
        enteredAmount: numAmount,
        adjustedAmount: 0, // tracks how much of advance has been applied to invoices
        paymentMethod: normalizedRecord.paymentMethod || paymentMethod,
        bankName: bankName || "",
        chequeNumber: chequeNumber || "",
        purpose:
          purpose ||
          (normalizedPaymentType === "advance"
            ? "Advance Payment"
            : normalizedAgainstType === "debit_note"
              ? "Debit Note Payment"
              : "Sales Invoice"),
        note: note || "",
        paymentType: normalizedPaymentType,
        invoiceId:
          regularInvoiceAllocations.length > 0
            ? regularInvoiceAllocations[0].invoiceId
            : invoiceId || null,
        invoiceNumber:
          regularInvoiceAllocations.length > 0
            ? regularInvoiceAllocations[0].invoiceNumber
            : invoiceNumber || null,
        invoiceIds:
          regularInvoiceAllocations.length > 0
            ? regularInvoiceAllocations.map((item) => item.invoiceId)
            : Array.isArray(invoiceIds)
              ? invoiceIds
              : invoiceId
                ? [invoiceId]
                : [],
        invoiceNumbers:
          regularInvoiceAllocations.length > 0
            ? regularInvoiceAllocations.map((item) => item.invoiceNumber)
            : Array.isArray(invoiceNumbers)
              ? invoiceNumbers
              : invoiceNumber
                ? [invoiceNumber]
                : [],
        invoiceAllocations: regularInvoiceAllocations,
        againstType: normalizedAgainstType,
        debitNoteId:
          normalizedAgainstType === "debit_note" && selectedDebitNote
            ? String(selectedDebitNote._id)
            : debitNoteId || "",
        debitNoteNumber:
          normalizedAgainstType === "debit_note" && selectedDebitNote
            ? selectedDebitNote.noteNumber || ""
            : debitNoteNumber || "",
        debitNoteAllocatedAmount:
          normalizedAgainstType === "debit_note" ? debitNoteAppliedAmount : 0,
        financialYear,
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
        ...auditFields,
      };

      const insertResult = await col.insertOne(regularDoc);
      const createdDocs = [
        {
          ...regularDoc,
          id: String(insertResult.insertedId),
          _id: insertResult.insertedId,
        },
      ];

      if (normalizedPaymentType === "regular" && overflowAdvanceAmount > 0) {
        const nextAdvanceReceiptNumber = await getNextReceiptNumber(
          col,
          receiptNumberPrefix,
        );

        const advanceDoc = {
          receiptNumber: nextAdvanceReceiptNumber,
          receiptDate,
          clientRefId: clientRefId || "",
          clientId: clientId || "",
          clientName: clientName || "",
          businessName: businessName || "",
          phoneNumber: phoneNumber || "",
          email: email || "",
          address: address || "",
          amount: overflowAdvanceAmount,
          adjustedAmount: 0,
          paymentMethod: normalizedRecord.paymentMethod || paymentMethod,
          bankName: bankName || "",
          chequeNumber: chequeNumber || "",
          purpose: `Auto advance from regular receipt ${receiptNumber}`,
          note: note || "Auto generated from overflow amount",
          paymentType: "advance",
          linkedRegularReceiptId: String(insertResult.insertedId),
          linkedRegularReceiptNumber: receiptNumber,
          financialYear,
          isDeleted: false,
          createdAt: now,
          updatedAt: now,
          ...auditFields,
        };

        const advanceInsertResult = await col.insertOne(advanceDoc);
        createdDocs.push({
          ...advanceDoc,
          id: String(advanceInsertResult.insertedId),
          _id: advanceInsertResult.insertedId,
        });
      }

      if (
        normalizedPaymentType === "regular" &&
        normalizedAgainstType === "debit_note" &&
        selectedDebitNote
      ) {
        const debitNotesCol = db.collection("creditDebitNotes");
        const debitNoteTotal = toNumber(
          selectedDebitNote.totalAmount || selectedDebitNote.amount,
        );
        const previousReceived = toNumber(selectedDebitNote.receivedAmount || 0);
        const nextReceived = Math.min(
          debitNoteTotal,
          previousReceived + debitNoteAppliedAmount,
        );
        const nextPaymentStatus = deriveDebitNotePaymentStatus(
          debitNoteTotal,
          nextReceived,
        );

        await debitNotesCol.updateOne(
          { _id: selectedDebitNote._id },
          {
            $set: {
              paymentStatus: nextPaymentStatus,
              paymentDate: receiptDate ? new Date(receiptDate) : now,
              receivedAmount: nextReceived,
              paymentMethod: normalizedRecord.paymentMethod || paymentMethod,
              updatedAt: now,
            },
          },
        );
      }

      receiptMetaCache.expiresAt = 0;

      const refsToRecalc = collectInvoiceRefsFromReceipt(regularDoc);
      for (const ref of refsToRecalc) {
        await recalculateInvoicePaymentSummary(db, ref);
      }

      return createResponse(
        201,
        {
          ...createdDocs[0],
          createdRecords: createdDocs,
          autoAdvanceCreated: createdDocs.length > 1,
        },
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
        ...(body.againstType !== undefined && { againstType: body.againstType }),
        ...(body.invoiceId !== undefined && { invoiceId: body.invoiceId }),
        ...(body.invoiceNumber !== undefined && {
          invoiceNumber: body.invoiceNumber,
        }),
        ...(body.debitNoteId !== undefined && { debitNoteId: body.debitNoteId }),
        ...(body.debitNoteNumber !== undefined && {
          debitNoteNumber: body.debitNoteNumber,
        }),
        ...(body.debitNoteAllocatedAmount !== undefined && {
          debitNoteAllocatedAmount: toNumber(body.debitNoteAllocatedAmount),
        }),
        ...(body.invoiceIds !== undefined && { invoiceIds: body.invoiceIds }),
        ...(body.invoiceNumbers !== undefined && {
          invoiceNumbers: body.invoiceNumbers,
        }),
        ...(body.invoiceAllocations !== undefined && {
          invoiceAllocations: body.invoiceAllocations,
        }),
        updatedAt: new Date(),
        ...auditFields,
      };

      await col.updateOne({ _id: new ObjectId(id) }, { $set: updateFields });
      receiptMetaCache.expiresAt = 0;

      const updated = await col.findOne({ _id: new ObjectId(id) });

      const refsToRecalc = [
        ...(existing.paymentType !== "advance"
          ? collectInvoiceRefsFromReceipt(existing)
          : []),
        ...(updated?.paymentType !== "advance"
          ? collectInvoiceRefsFromReceipt(updated)
          : []),
      ];

      for (const ref of refsToRecalc) {
        await recalculateInvoicePaymentSummary(db, ref);
      }

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

      if (existing.paymentType !== "advance") {
        const refsToRecalc = collectInvoiceRefsFromReceipt(existing);
        for (const ref of refsToRecalc) {
          await recalculateInvoicePaymentSummary(db, ref);
        }
      }

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
