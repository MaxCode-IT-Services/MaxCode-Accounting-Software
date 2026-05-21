import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { ObjectId } from "mongodb";
import { verifyRequestToken, getAuditFieldsFromEvent } from "./utils/auth.js";
import { syncTransactionSnapshot } from "./utils/transactions.js";

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const escapeRegExp = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseDateValue = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const raw = String(value || "").trim();
  if (!raw) return null;

  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;

  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const parsed = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getFinancialYearToken = (financialYearValue) => {
  const value = String(financialYearValue || "").trim();
  if (/^\d{4}-\d{4}$/.test(value)) return `${value.slice(2, 4)}-${value.slice(-2)}`;
  if (/^\d{4}-\d{2}$/.test(value)) return `${value.slice(2, 4)}-${value.slice(-2)}`;
  if (/^\d{2}-\d{2}$/.test(value)) return value;
  return "";
};

const buildFallbackFinancialYear = () => {
  const now = new Date();
  const month = now.getMonth() + 1;
  const startYear = month >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  const endYearShort = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}-${endYearShort}`;
};

const getAdvanceRemainingAmount = (receipt = {}) => {
  const amount = toNumber(receipt.amount || 0);
  const adjustedAmount = toNumber(receipt.adjustedAmount || 0);
  const refundedAmount = toNumber(receipt.refundedAmount || 0);
  return Math.max(amount - adjustedAmount - refundedAmount, 0);
};

const getRefundStatus = (refundAmount, sourceReceipt) => {
  const totalAdvance = toNumber(sourceReceipt?.amount || 0);
  const totalRefunded = toNumber(sourceReceipt?.refundedAmount || 0) + refundAmount;
  if (totalAdvance > 0 && totalRefunded >= totalAdvance) return "Full Refund";
  if (refundAmount > 0) return "Partial Refund";
  return "Pending";
};

const loadAdvanceReceipt = async (receiptsCollection, advanceReceiptId) => {
  if (!ObjectId.isValid(advanceReceiptId)) return null;
  return receiptsCollection.findOne({
    _id: new ObjectId(advanceReceiptId),
    isDeleted: { $ne: true },
    paymentType: "advance",
  });
};

const snapshotClientFields = (receipt = {}, body = {}) => ({
  clientRefId: String(receipt.clientRefId || receipt.clientId || body.clientRefId || body.clientId || "").trim(),
  clientId: String(receipt.clientId || receipt.clientRefId || body.clientId || body.clientRefId || "").trim(),
  clientName: String(receipt.clientName || body.clientName || "").trim(),
  businessName: String(receipt.businessName || body.businessName || "").trim(),
  gstin: String(receipt.gstin || body.gstin || "").trim(),
  phoneNumber: String(receipt.phoneNumber || body.phoneNumber || "").trim(),
  email: String(receipt.email || body.email || "").trim(),
  address: String(receipt.address || body.address || "").trim(),
});

const getNextRefundNumber = async (
  refundsCollection,
  yearsCollection,
  financialYearValue,
) => {
  const yearToken = getFinancialYearToken(financialYearValue);
  if (!yearToken) return "";

  const yearRecord = await yearsCollection.findOne({
    financialYear: financialYearValue,
    isDeleted: { $ne: true },
  });

  let prefix = "";
  if (yearRecord?.refundNumberFormat) {
    prefix = String(yearRecord.refundNumberFormat).replace(/\d+$/, "");
  } else {
    prefix = `MC/RFND/${yearToken}/`;
  }

  const pattern = new RegExp(`^${escapeRegExp(prefix)}(\\d+)$`, "i");
  const existingRefunds = await refundsCollection
    .find(
      {
        refundNumber: { $regex: pattern },
        isDeleted: { $ne: true },
      },
      { projection: { refundNumber: 1 } },
    )
    .toArray();

  let maxSerial = 0;
  existingRefunds.forEach((refund) => {
    const refundNumber = String(refund?.refundNumber || "").trim();
    const match = refundNumber.match(pattern);
    if (!match) return;
    const current = parseInt(match[1], 10);
    if (!Number.isNaN(current) && current > maxSerial) {
      maxSerial = current;
    }
  });

  const nextSerial = String(maxSerial + 1).padStart(3, "0");
  return `${prefix}${nextSerial}`;
};

export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === "OPTIONS") {
    return createResponse(200, {}, origin);
  }

  try {
    verifyRequestToken(event);

    const { db } = await connectToDatabase();
    const refundsCollection = db.collection("payment_refunds");
    const receiptsCollection = db.collection("payment_receipts");
    const yearsCollection = db.collection("financialYears");

    if (event.httpMethod === "GET") {
      const {
        action,
        id,
        page = 1,
        limit = 10,
        includeMeta = "true",
        search,
        financialYear,
        paymentMethod,
        status,
        filter,
        refundDate_start,
        refundDate_end,
        createdDateTime_start,
        createdDateTime_end,
        sortBy = "createdAt",
        sortOrder = "desc",
      } = event.queryStringParameters || {};

      if (action === "next-number") {
        let resolvedFinancialYear = String(financialYear || "").trim();
        if (!resolvedFinancialYear || resolvedFinancialYear === "ALL") {
          const yearRecord = await yearsCollection.findOne({
            isDeleted: { $ne: true },
            isDefault: true,
          });
          resolvedFinancialYear =
            String(yearRecord?.financialYear || "").trim() ||
            buildFallbackFinancialYear();
        }

        const nextNumber = await getNextRefundNumber(
          refundsCollection,
          yearsCollection,
          resolvedFinancialYear,
        );

        if (!nextNumber) {
          return createResponse(
            400,
            { error: "Unable to generate refund number." },
            origin,
          );
        }

        return createResponse(
          200,
          {
            nextNumber,
            refundNumber: nextNumber,
            financialYear: resolvedFinancialYear,
          },
          origin,
        );
      }

      if (id) {
        if (!ObjectId.isValid(id)) {
          return createResponse(400, { error: "Invalid refund ID" }, origin);
        }

        const refund = await refundsCollection.findOne({
          _id: new ObjectId(id),
          isDeleted: { $ne: true },
        });

        if (!refund) {
          return createResponse(404, { error: "Refund not found" }, origin);
        }

        return createResponse(200, refund, origin);
      }

      const filterQuery = { isDeleted: { $ne: true } };

      if (financialYear && financialYear !== "ALL") {
        const normalizedFinancialYear = String(financialYear).trim();
        const yearRecord = await yearsCollection.findOne({
          financialYear: normalizedFinancialYear,
          isDeleted: { $ne: true },
        });

        const startDate = parseDateValue(yearRecord?.startDate);
        const endDate = parseDateValue(yearRecord?.endDate);
        const yearConditions = [];

        if (normalizedFinancialYear) {
          yearConditions.push({ financialYear: normalizedFinancialYear });
        }

        if (startDate && endDate) {
          yearConditions.push({
            refundDate: {
              $gte: startDate,
              $lte: endDate,
            },
          });
        }

        if (yearConditions.length === 1) {
          Object.assign(filterQuery, yearConditions[0]);
        } else if (yearConditions.length > 1) {
          filterQuery.$and = filterQuery.$and || [];
          filterQuery.$and.push({ $or: yearConditions });
        } else if (normalizedFinancialYear) {
          filterQuery.financialYear = normalizedFinancialYear;
        }
      }

      if (paymentMethod && paymentMethod !== "All") {
        filterQuery.refundMethod = paymentMethod;
      }

      if (status && status !== "All") {
        filterQuery.status = status;
      }

      if (filter) {
        switch (String(filter).trim()) {
          case "full":
            filterQuery.status = "Full Refund";
            break;
          case "partial":
            filterQuery.status = "Partial Refund";
            break;
          case "cash":
            filterQuery.refundMethod = "Cash";
            break;
          case "bank":
            filterQuery.refundMethod = "Bank Transfer";
            break;
          default:
            break;
        }
      }

      if (refundDate_start || refundDate_end) {
        filterQuery.refundDate = filterQuery.refundDate || {};
        if (refundDate_start) {
          filterQuery.refundDate.$gte = parseDateValue(refundDate_start);
        }
        if (refundDate_end) {
          filterQuery.refundDate.$lte = parseDateValue(refundDate_end);
        }
      }

      if (createdDateTime_start || createdDateTime_end) {
        filterQuery.createdAt = {};
        if (createdDateTime_start) {
          filterQuery.createdAt.$gte = new Date(createdDateTime_start);
        }
        if (createdDateTime_end) {
          filterQuery.createdAt.$lte = new Date(createdDateTime_end);
        }
      }

      if (search) {
        const searchRegex = { $regex: escapeRegExp(search), $options: "i" };
        filterQuery.$or = [
          { refundNumber: searchRegex },
          { clientName: searchRegex },
          { businessName: searchRegex },
          { advanceReceiptNumber: searchRegex },
          { note: searchRegex },
          { refundMethod: searchRegex },
        ];
      }

      const isAllLimit = String(limit || "").trim().toLowerCase() === "all";
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = isAllLimit
        ? null
        : Math.min(200, Math.max(1, parseInt(limit, 10) || 10));
      const skip = isAllLimit ? 0 : (pageNum - 1) * limitNum;
      const sortField = ["refundDate", "amount", "refundNumber", "createdAt"].includes(sortBy)
        ? sortBy
        : "createdAt";
      const sortDir = sortOrder === "asc" ? 1 : -1;

      // Debug: log filterQuery for troubleshooting (remove in production)
      try {
        console.debug("[payment-refunds] filterQuery:", JSON.stringify(filterQuery));
      } catch (e) {
        /* ignore logging errors */
      }

      const recordsCursor = refundsCollection
        .find(filterQuery)
        .sort({ [sortField]: sortDir });

      if (!isAllLimit) {
        recordsCursor.skip(skip).limit(limitNum);
      }

      const [records, totalCount] = await Promise.all([
        recordsCursor.toArray(),
        refundsCollection.countDocuments(filterQuery),
      ]);

      const refundMethods = Array.from(
        new Set(
          records
            .map((record) => String(record.refundMethod || "").trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b));

      const totalsAggregation = await refundsCollection
        .aggregate([
          { $match: filterQuery },
          {
            $group: {
              _id: null,
              totalCount: { $sum: 1 },
              totalAmount: { $sum: { $ifNull: ["$amount", 0] } },
              fullCount: {
                $sum: { $cond: [{ $eq: ["$status", "Full Refund"] }, 1, 0] },
              },
              fullAmount: {
                $sum: {
                  $cond: [
                    { $eq: ["$status", "Full Refund"] },
                    { $ifNull: ["$amount", 0] },
                    0,
                  ],
                },
              },
              partialCount: {
                $sum: { $cond: [{ $eq: ["$status", "Partial Refund"] }, 1, 0] },
              },
              partialAmount: {
                $sum: {
                  $cond: [
                    { $eq: ["$status", "Partial Refund"] },
                    { $ifNull: ["$amount", 0] },
                    0,
                  ],
                },
              },
              cashCount: {
                $sum: { $cond: [{ $eq: ["$refundMethod", "Cash"] }, 1, 0] },
              },
              cashAmount: {
                $sum: {
                  $cond: [
                    { $eq: ["$refundMethod", "Cash"] },
                    { $ifNull: ["$amount", 0] },
                    0,
                  ],
                },
              },
              bankCount: {
                $sum: { $cond: [{ $eq: ["$refundMethod", "Bank Transfer"] }, 1, 0] },
              },
              bankAmount: {
                $sum: {
                  $cond: [
                    { $eq: ["$refundMethod", "Bank Transfer"] },
                    { $ifNull: ["$amount", 0] },
                    0,
                  ],
                },
              },
            },
          },
        ])
        .toArray();

      const totals = totalsAggregation?.[0] || {};

      return createResponse(
        200,
        {
          records,
          total: totalCount,
          ...(includeMeta !== "false"
            ? {
                meta: { refundMethods },
                statistics: {
                  total: totals.totalCount || totalCount,
                  full: totals.fullCount || 0,
                  partial: totals.partialCount || 0,
                  cash: totals.cashCount || 0,
                  bank: totals.bankCount || 0,
                  totalAmount: totals.totalAmount || 0,
                  fullAmount: totals.fullAmount || 0,
                  partialAmount: totals.partialAmount || 0,
                  cashAmount: totals.cashAmount || 0,
                  bankAmount: totals.bankAmount || 0,
                },
              }
            : {}),
        },
        origin,
      );
    }

    if (event.httpMethod === "POST") {
      let body;
      try {
        body = JSON.parse(event.body || "{}");
      } catch {
        return createResponse(400, { error: "Invalid JSON body" }, origin);
      }

      const refundNumber = String(body.refundNumber || "").trim();
      const refundDate = body.refundDate ? parseDateValue(body.refundDate) : null;
      const advanceReceiptId = String(body.advanceReceiptId || "").trim();
      const refundAmount = toNumber(body.amount);
      const refundMethod = String(body.refundMethod || "").trim();
      const clientName = String(body.clientName || "").trim();

      if (
        !refundNumber ||
        !refundDate ||
        !advanceReceiptId ||
        !clientName ||
        refundAmount <= 0 ||
        !refundMethod
      ) {
        return createResponse(
          400,
          {
            error:
              "Refund Number, Refund Date, Client Name, Advance Receipt and Refund Amount are required.",
          },
          origin,
        );
      }

      const duplicateRefund = await refundsCollection.findOne({
        refundNumber,
        isDeleted: { $ne: true },
      });

      if (duplicateRefund) {
        return createResponse(
          409,
          {
            error:
              "Refund Number already exists. Please use a different number.",
          },
          origin,
        );
      }

      const sourceReceipt = await loadAdvanceReceipt(
        receiptsCollection,
        advanceReceiptId,
      );

      if (!sourceReceipt) {
        return createResponse(
          404,
          { error: "Advance receipt not found" },
          origin,
        );
      }

      const availableAmount = getAdvanceRemainingAmount(sourceReceipt);
      if (refundAmount > availableAmount) {
        return createResponse(
          400,
          {
            error: `Refund amount cannot exceed the remaining advance balance of ₹${availableAmount.toFixed(2)}.`,
          },
          origin,
        );
      }

      const now = new Date();
      const auditFields = getAuditFieldsFromEvent(event, "create");
      const refundDoc = {
        _id: new ObjectId(),
        refundNumber,
        refundDate,
        financialYear: String(sourceReceipt.financialYear || body.financialYear || "").trim(),
        ...snapshotClientFields(sourceReceipt, body),
        advanceReceiptId: String(sourceReceipt._id),
        advanceReceiptNumber: String(sourceReceipt.receiptNumber || "").trim(),
        advanceReceiptDate: sourceReceipt.receiptDate || null,
        advanceAmount: toNumber(sourceReceipt.amount || 0),
        advanceAdjustedAmount: toNumber(sourceReceipt.adjustedAmount || 0),
        advanceRefundedAmount: toNumber(sourceReceipt.refundedAmount || 0),
        advanceAvailableAmount: getAdvanceRemainingAmount(sourceReceipt),
        amount: refundAmount,
        refundMethod,
        bankName: String(body.bankName || "").trim(),
        chequeNumber: String(body.chequeNumber || "").trim(),
        referenceNumber: String(body.referenceNumber || "").trim(),
        note: String(body.note || "").trim(),
        status: getRefundStatus(refundAmount, sourceReceipt),
        isDeleted: false,
        createdAt: now,
        updatedAt: now,
        ...auditFields,
      };

      const insertResult = await refundsCollection.insertOne(refundDoc);

      await receiptsCollection.updateOne(
        { _id: sourceReceipt._id },
        {
          $set: {
            refundedAmount: toNumber(sourceReceipt.refundedAmount || 0) + refundAmount,
            updatedAt: now,
          },
        },
      );

      await syncTransactionSnapshot({
        db,
        sourceCollection: "payment_refunds",
        sourceType: "payment-refund",
        sourceRecord: refundDoc,
        sourceLabel: refundDoc.refundNumber || "",
      });

      return createResponse(
        201,
        {
          message: "Refund created successfully",
          id: insertResult.insertedId,
        },
        origin,
      );
    }

    if (event.httpMethod === "PUT") {
      const { id } = event.queryStringParameters || {};
      if (!id || !ObjectId.isValid(id)) {
        return createResponse(400, { error: "Valid refund ID is required" }, origin);
      }

      let body;
      try {
        body = JSON.parse(event.body || "{}");
      } catch {
        return createResponse(400, { error: "Invalid JSON body" }, origin);
      }

      const existing = await refundsCollection.findOne({
        _id: new ObjectId(id),
        isDeleted: { $ne: true },
      });

      if (!existing) {
        return createResponse(404, { error: "Refund not found" }, origin);
      }

      const sourceReceipt = await loadAdvanceReceipt(
        receiptsCollection,
        existing.advanceReceiptId,
      );

      if (!sourceReceipt) {
        return createResponse(
          404,
          { error: "Source advance receipt not found" },
          origin,
        );
      }

      const nextRefundAmount =
        body.amount !== undefined ? toNumber(body.amount) : toNumber(existing.amount || 0);
      const nextRefundDate = body.refundDate
        ? parseDateValue(body.refundDate)
        : existing.refundDate || null;
      const nextRefundMethod =
        body.refundMethod !== undefined
          ? String(body.refundMethod || "").trim()
          : String(existing.refundMethod || "").trim();
      const nextRefundNumber = String(
        body.refundNumber || existing.refundNumber || "",
      ).trim();

      if (!nextRefundNumber || !nextRefundDate || nextRefundAmount <= 0 || !nextRefundMethod) {
        return createResponse(
          400,
          { error: "Refund Number, Refund Date, Refund Method and Amount are required." },
          origin,
        );
      }

      const duplicateRefund = await refundsCollection.findOne({
        _id: { $ne: new ObjectId(id) },
        refundNumber: nextRefundNumber,
        isDeleted: { $ne: true },
      });

      if (duplicateRefund) {
        return createResponse(
          409,
          {
            error:
              "Refund Number already exists. Please use a different number.",
          },
          origin,
        );
      }

      const currentRefundTotal = toNumber(sourceReceipt.refundedAmount || 0);
      const releasedRefundTotal = Math.max(
        currentRefundTotal - toNumber(existing.amount || 0),
        0,
      );
      const availableAfterRelease = Math.max(
        toNumber(sourceReceipt.amount || 0) -
          toNumber(sourceReceipt.adjustedAmount || 0) -
          releasedRefundTotal,
        0,
      );

      if (nextRefundAmount > availableAfterRelease) {
        return createResponse(
          400,
          {
            error: `Refund amount cannot exceed the remaining advance balance of ₹${availableAfterRelease.toFixed(2)}.`,
          },
          origin,
        );
      }

      const now = new Date();
      const auditFields = getAuditFieldsFromEvent(event, "update");
      const updatedRecord = {
        ...existing,
        refundNumber: nextRefundNumber,
        refundDate: nextRefundDate,
        amount: nextRefundAmount,
        refundMethod: nextRefundMethod,
        ...snapshotClientFields(sourceReceipt, body),
        bankName:
          body.bankName !== undefined
            ? String(body.bankName || "").trim()
            : String(existing.bankName || "").trim(),
        chequeNumber:
          body.chequeNumber !== undefined
            ? String(body.chequeNumber || "").trim()
            : String(existing.chequeNumber || "").trim(),
        referenceNumber:
          body.referenceNumber !== undefined
            ? String(body.referenceNumber || "").trim()
            : String(existing.referenceNumber || "").trim(),
        note:
          body.note !== undefined
            ? String(body.note || "").trim()
            : String(existing.note || "").trim(),
        status: getRefundStatus(nextRefundAmount, {
          ...sourceReceipt,
          refundedAmount: releasedRefundTotal,
        }),
        advanceReceiptDate: sourceReceipt.receiptDate || existing.advanceReceiptDate || null,
        advanceAmount: toNumber(sourceReceipt.amount || existing.advanceAmount || 0),
        advanceAdjustedAmount: toNumber(sourceReceipt.adjustedAmount || existing.advanceAdjustedAmount || 0),
        advanceRefundedAmount: toNumber(sourceReceipt.refundedAmount || existing.advanceRefundedAmount || 0),
        advanceAvailableAmount: getAdvanceRemainingAmount(sourceReceipt),
        updatedAt: now,
        ...auditFields,
      };

      await refundsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedRecord },
      );

      await receiptsCollection.updateOne(
        { _id: sourceReceipt._id },
        {
          $set: {
            refundedAmount: releasedRefundTotal + nextRefundAmount,
            updatedAt: now,
          },
        },
      );

      await syncTransactionSnapshot({
        db,
        sourceCollection: "payment_refunds",
        sourceType: "payment-refund",
        sourceRecord: updatedRecord,
        sourceLabel: updatedRecord.refundNumber || "",
      });

      const refreshed = await refundsCollection.findOne({
        _id: new ObjectId(id),
        isDeleted: { $ne: true },
      });

      return createResponse(
        200,
        {
          message: "Refund updated successfully",
          ...refreshed,
        },
        origin,
      );
    }

    if (event.httpMethod === "DELETE") {
      const { id } = event.queryStringParameters || {};
      if (!id || !ObjectId.isValid(id)) {
        return createResponse(400, { error: "Valid refund ID is required" }, origin);
      }

      const existing = await refundsCollection.findOne({
        _id: new ObjectId(id),
        isDeleted: { $ne: true },
      });

      if (!existing) {
        return createResponse(404, { error: "Refund not found" }, origin);
      }

      const sourceReceipt = await loadAdvanceReceipt(
        receiptsCollection,
        existing.advanceReceiptId,
      );

      if (!sourceReceipt) {
        return createResponse(
          404,
          { error: "Source advance receipt not found" },
          origin,
        );
      }

      const refundAmount = toNumber(existing.amount || 0);
      const nextRefundedAmount = Math.max(
        toNumber(sourceReceipt.refundedAmount || 0) - refundAmount,
        0,
      );

      await syncTransactionSnapshot({
        db,
        sourceCollection: "payment_refunds",
        sourceType: "payment-refund",
        sourceRecord: existing,
        sourceLabel: existing.refundNumber || "",
        deleted: true,
      });

      await refundsCollection.updateOne(
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

      await receiptsCollection.updateOne(
        { _id: sourceReceipt._id },
        {
          $set: {
            refundedAmount: nextRefundedAmount,
            updatedAt: new Date(),
          },
        },
      );

      return createResponse(
        200,
        { message: "Refund deleted successfully" },
        origin,
      );
    }

    return createResponse(405, { error: "Method not allowed" }, origin);
  } catch (error) {
    console.error("Refund API Error:", error);

    if (error.message.includes("token") || error.message.includes("Token")) {
      return createResponse(
        401,
        { error: "Unauthorized", message: error.message },
        origin,
      );
    }

    return createResponse(
      500,
      { error: "Internal server error", message: error.message },
      origin,
    );
  }
}