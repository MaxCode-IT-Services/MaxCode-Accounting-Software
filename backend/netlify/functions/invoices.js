import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { ObjectId } from "mongodb";
import { verifyRequestToken, getAuditFieldsFromEvent } from "./utils/auth.js";
import { normalizePaymentMethodsInRecord } from "./utils/payment-methods.js";
import {
  applyTermsBindingToDocument,
  getTermsBindingFromDatabase,
} from "./utils/terms-versioning.js";

const META_CACHE_TTL_MS = 30 * 1000;
const invoiceMetaCache = {
  value: null,
  expiresAt: 0,
};

/**
 * Invoice Management API
 * Handles CRUD operations for invoices with pagination support
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
    let invoiceTermsBindingPromise = null;

    const getInvoiceTermsBinding = async () => {
      if (!invoiceTermsBindingPromise) {
        invoiceTermsBindingPromise = getTermsBindingFromDatabase(db, "invoice");
      }
      return invoiceTermsBindingPromise;
    };

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

    const parseDateValue = (value) => {
      if (!value) return null;
      if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
      const raw = String(value || "").trim();
      if (!raw) return null;
      const direct = new Date(raw);
      if (!Number.isNaN(direct.getTime())) return direct;
      const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (m) {
        const parsed = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
        if (!Number.isNaN(parsed.getTime())) return parsed;
      }
      return null;
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

    const computeInvoicePaymentSnapshot = async ({
      invoiceId,
      invoiceNumber,
      totalAmount,
      appliedAdvances,
      fallbackPaymentDate,
      fallbackPaymentMethod,
      manualAmountReceived = 0,
    }) => {
      const resolvedInvoiceId = String(invoiceId || "");
      const resolvedInvoiceNumber = String(invoiceNumber || "");
      const paymentReceiptsCol = db.collection("payment_receipts");

      const receiptFilter = {
        isDeleted: { $ne: true },
        paymentType: { $ne: "advance" },
        $or: [
          ...(resolvedInvoiceId
            ? [
                { invoiceId: resolvedInvoiceId },
                { invoiceNumber: resolvedInvoiceId },
              ]
            : []),
          ...(resolvedInvoiceNumber
            ? [
                { invoiceId: resolvedInvoiceNumber },
                { invoiceNumber: resolvedInvoiceNumber },
              ]
            : []),
        ],
      };

      const regularReceipts = receiptFilter.$or.length
        ? await paymentReceiptsCol.find(receiptFilter).toArray()
        : [];

      const regularReceivedAmount = regularReceipts.reduce(
        (sum, receipt) => sum + toNumber(receipt.amount),
        0,
      );

      const latestRegularReceipt =
        regularReceipts.length > 0
          ? regularReceipts.reduce((latest, current) => {
              const latestTime = getReceiptEventTime(latest);
              const currentTime = getReceiptEventTime(current);
              return currentTime >= latestTime ? current : latest;
            })
          : null;

      const normalizedAppliedAdvances = Array.isArray(appliedAdvances)
        ? appliedAdvances
        : [];
      const advanceAdjustedTotal = normalizedAppliedAdvances.reduce(
        (sum, advance) => sum + toNumber(advance.appliedAmount),
        0,
      );

      // IMPORTANT: Include both payment receipts AND manually entered payment amounts from CreateSales
      const manualPaymentAmount = toNumber(manualAmountReceived);
      const amountReceived =
        regularReceivedAmount + advanceAdjustedTotal + manualPaymentAmount;
      const dueAmount = Math.max(0, toNumber(totalAmount) - amountReceived);
      const paymentStatus = derivePaymentStatus(totalAmount, amountReceived);
      const latestAdvanceMeta = getLatestAdvanceMeta(normalizedAppliedAdvances);
      const paymentDate =
        latestRegularReceipt?.receiptDate ||
        latestAdvanceMeta.receiptDate ||
        fallbackPaymentDate ||
        "";
      const paymentMethod =
        latestRegularReceipt?.paymentMethod ||
        latestAdvanceMeta.paymentMethod ||
        fallbackPaymentMethod ||
        "";

      return {
        amountReceived: amountReceived > 0 ? String(amountReceived) : "",
        paymentStatus,
        paymentDate,
        paymentMethod,
        dueAmount: dueAmount.toFixed(2),
        advanceAdjustedTotal,
      };
    };

    // GET - Fetch all invoices or specific invoice by ID with pagination support
    if (event.httpMethod === "GET") {
      const {
        action,
        id,
        page = 1,
        limit = 10,
        search,
        paymentStatus,
        paymentMethod,
        financialYear,
        period,
        createdDateTime_start,
        createdDateTime_end,
        invoiceDateFormatted_start,
        invoiceDateFormatted_end,
        paymentDateFormatted_start,
        paymentDateFormatted_end,
        sortBy = "createdAt",
        sortOrder = "desc",
        filter, // For card filters
        includeDebug = "false",
      } = event.queryStringParameters || {};

      if (action === "next-number") {
        const requestedFinancialYear = String(
          event.queryStringParameters?.financialYear || "",
        ).trim();

        let yearRecord = null;
        if (requestedFinancialYear) {
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

        const invoiceFormat = String(
          event.queryStringParameters?.invoiceFormat ||
            yearRecord?.invoiceFormat ||
            "",
        ).trim();

        if (!invoiceFormat) {
          return createResponse(
            400,
            {
              error:
                "Invoice number format is not configured for the selected financial year.",
            },
            origin,
          );
        }

        const nextNumber = await getNextInvoiceNumber(invoiceFormat);

        return createResponse(
          200,
          {
            nextNumber,
            invoiceNumber: nextNumber,
            financialYear:
              requestedFinancialYear || String(yearRecord?.financialYear || ""),
            format: invoiceFormat,
          },
          origin,
        );
      }

      // If ID is provided, return single invoice
      if (id) {
        if (!ObjectId.isValid(id)) {
          return createResponse(400, { error: "Invalid invoice ID" }, origin);
        }

        const invoice = await invoicesCollection.findOne({
          _id: new ObjectId(id),
          isDeleted: { $ne: true },
        });

        if (!invoice) {
          return createResponse(404, { error: "Invoice not found" }, origin);
        }

        const paymentReceiptsCol = db.collection("payment_receipts");
        const currentAppliedAdvances = Array.isArray(invoice.appliedAdvances)
          ? invoice.appliedAdvances
          : [];

        const hydratedAppliedAdvances = await Promise.all(
          currentAppliedAdvances.map(async (advance) => {
            const hasDate = Boolean(
              advance?.receiptDate || advance?.receipt_date || advance?.date,
            );
            const hasMethod = Boolean(advance?.paymentMethod);
            if (hasDate && hasMethod) return advance;

            const advanceId = String(advance?.advanceId || "");
            if (!ObjectId.isValid(advanceId)) return advance;

            const receiptDoc = await paymentReceiptsCol.findOne(
              {
                _id: new ObjectId(advanceId),
                isDeleted: { $ne: true },
              },
              {
                projection: {
                  receiptDate: 1,
                  paymentMethod: 1,
                  receiptNumber: 1,
                },
              },
            );

            if (!receiptDoc) return advance;

            return {
              ...advance,
              receiptDate:
                advance?.receiptDate ||
                advance?.receipt_date ||
                advance?.date ||
                receiptDoc.receiptDate ||
                null,
              paymentMethod:
                advance?.paymentMethod || receiptDoc.paymentMethod || "",
              receiptNumber:
                advance?.receiptNumber || receiptDoc.receiptNumber || "",
            };
          }),
        );

        const paymentSnapshot = await computeInvoicePaymentSnapshot({
          invoiceId: String(invoice._id),
          invoiceNumber: invoice.invoiceNumber,
          totalAmount: invoice?.taxData?.totalAmount,
          appliedAdvances: hydratedAppliedAdvances,
          fallbackPaymentDate: invoice.paymentDate,
          fallbackPaymentMethod: invoice.paymentMethod,
          manualAmountReceived: invoice.amountReceived,
        });

        const binding = await getInvoiceTermsBinding();
        const { document: hydratedInvoice, patch } =
          applyTermsBindingToDocument(invoice, binding);

        const needsAdvanceMetaPatch =
          JSON.stringify(hydratedAppliedAdvances) !==
          JSON.stringify(currentAppliedAdvances);
        const needsPaymentPatch =
          String(hydratedInvoice.amountReceived || "") !==
            String(paymentSnapshot.amountReceived || "") ||
          String(hydratedInvoice.paymentStatus || "") !==
            String(paymentSnapshot.paymentStatus || "") ||
          String(hydratedInvoice.paymentDate || "") !==
            String(paymentSnapshot.paymentDate || "") ||
          String(hydratedInvoice.paymentMethod || "") !==
            String(paymentSnapshot.paymentMethod || "") ||
          String(hydratedInvoice.dueAmount || "") !==
            String(paymentSnapshot.dueAmount || "") ||
          Number(hydratedInvoice.advanceAdjustedTotal || 0) !==
            Number(paymentSnapshot.advanceAdjustedTotal || 0);

        const updatePayload = {
          ...(patch || {}),
          ...(needsAdvanceMetaPatch
            ? { appliedAdvances: hydratedAppliedAdvances }
            : {}),
          ...(needsPaymentPatch
            ? {
                amountReceived: paymentSnapshot.amountReceived,
                paymentStatus: paymentSnapshot.paymentStatus,
                paymentDate: paymentSnapshot.paymentDate,
                paymentMethod: paymentSnapshot.paymentMethod,
                dueAmount: paymentSnapshot.dueAmount,
                advanceAdjustedTotal: paymentSnapshot.advanceAdjustedTotal,
              }
            : {}),
        };

        const hasUpdate = Object.keys(updatePayload).length > 0;

        if (hasUpdate) {
          await invoicesCollection.updateOne(
            { _id: invoice._id },
            {
              $set: {
                ...updatePayload,
                updatedAt: new Date(),
              },
            },
          );
        }

        const responseInvoice = {
          ...hydratedInvoice,
          ...(needsAdvanceMetaPatch
            ? { appliedAdvances: hydratedAppliedAdvances }
            : {}),
          ...(needsPaymentPatch
            ? {
                amountReceived: paymentSnapshot.amountReceived,
                paymentStatus: paymentSnapshot.paymentStatus,
                paymentDate: paymentSnapshot.paymentDate,
                paymentMethod: paymentSnapshot.paymentMethod,
                dueAmount: paymentSnapshot.dueAmount,
                advanceAdjustedTotal: paymentSnapshot.advanceAdjustedTotal,
              }
            : {}),
        };

        return createResponse(200, responseInvoice, origin);
      }

      // Build filter query
      const filterQuery = { isDeleted: { $ne: true } };
      const params = event.queryStringParameters || {};

      // Financial year filter
      if (financialYear && financialYear !== "ALL") {
        const yearRecord = await yearsCollection.findOne({
          financialYear: financialYear,
          isDeleted: { $ne: true },
        });

        if (yearRecord?.startDate && yearRecord?.endDate) {
          filterQuery.invoiceDate = {
            $gte: yearRecord.startDate,
            $lte: yearRecord.endDate,
          };
        }
      }

      // Period filter (daily, monthly, quarterly, halfYearly, yearly)
      if (period && period !== "yearly") {
        const today = new Date();
        let startDate, endDate;

        if (period === "daily") {
          startDate = new Date(today.setHours(0, 0, 0, 0));
          endDate = new Date(today.setHours(23, 59, 59, 999));
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
          const quarter = Math.floor(today.getMonth() / 3);
          startDate = new Date(today.getFullYear(), quarter * 3, 1);
          endDate = new Date(
            today.getFullYear(),
            (quarter + 1) * 3,
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
          // If invoiceDate is string in DB, use YYYY-MM-DD string for range
          const pad = (n) => String(n).padStart(2, "0");
          const startStr = `${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-${pad(startDate.getDate())}`;
          const endStr = `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-${pad(endDate.getDate())}`;
          filterQuery.invoiceDate = {
            $gte: startStr,
            $lte: endStr,
          };
        }
      }

      Object.entries(params).forEach(([key, value]) => {
        if (!value || value === "" || value === "All") return;
        if (key === "filter") return;
        if (key === "financialYear" || key === "period") return;
        if (
          [
            "page",
            "limit",
            "sortBy",
            "sortOrder",
            "search",
            "id",
            "includeDebug",
          ].includes(key)
        )
          return;

        if (key.endsWith("_start") || key.endsWith("_end")) return;

        // Handle filter keys
        if (key === "paymentStatus") {
          filterQuery.paymentStatus = value;
          return;
        }

        if (key === "paymentMethod") {
          filterQuery.paymentMethod = value;
          return;
        }

        // If value is comma-separated, treat as array
        if (typeof value === "string" && value.includes(",")) {
          filterQuery[key] = {
            $in: value.split(",").map((v) => v.trim()),
          };
        } else if (typeof value === "string") {
          // Exact match for dropdown columns
          if (
            ["paymentStatus", "paymentMethod", "placeOfSupply"].includes(key)
          ) {
            filterQuery[key] = value.trim();
          } else {
            // Text search fields
            filterQuery[key] = {
              $regex: value.trim(),
              $options: "i",
            };
          }
        } else {
          filterQuery[key] = value;
        }
      });

      // Handle date range filters dynamically
      const dateRanges = {};

      Object.entries(params).forEach(([key, value]) => {
        if (!value) return;

        if (key.endsWith("_start")) {
          let baseKey = key.replace(/_start$/, "");
          if (baseKey === "createdDateTime") baseKey = "createdAt";
          if (baseKey === "invoiceDateFormatted") baseKey = "invoiceDate";
          if (baseKey === "paymentDateFormatted") baseKey = "paymentDate";

          if (!dateRanges[baseKey]) dateRanges[baseKey] = {};

          const dateParts = value.split("-");
          if (dateParts.length === 3) {
            // For paymentDate and invoiceDate (string fields), use string comparison (YYYY-MM-DD)
            if (baseKey === "paymentDate" || baseKey === "invoiceDate") {
              const year = dateParts[0];
              const month = dateParts[1].padStart(2, "0");
              const day = dateParts[2].padStart(2, "0");
              dateRanges[baseKey].$gte = `${year}-${month}-${day}`;
            } else {
              const year = parseInt(dateParts[0]);
              const month = parseInt(dateParts[1]) - 1;
              const day = parseInt(dateParts[2]);
              const startDate = new Date(
                Date.UTC(year, month, day, 0, 0, 0, 0),
              );
              dateRanges[baseKey].$gte = startDate;
            }
          }
        }

        if (key.endsWith("_end")) {
          let baseKey = key.replace(/_end$/, "");
          if (baseKey === "createdDateTime") baseKey = "createdAt";
          if (baseKey === "invoiceDateFormatted") baseKey = "invoiceDate";
          if (baseKey === "paymentDateFormatted") baseKey = "paymentDate";

          if (!dateRanges[baseKey]) dateRanges[baseKey] = {};

          const dateParts = value.split("-");
          if (dateParts.length === 3) {
            if (baseKey === "paymentDate" || baseKey === "invoiceDate") {
              const year = dateParts[0];
              const month = dateParts[1].padStart(2, "0");
              const day = dateParts[2].padStart(2, "0");
              dateRanges[baseKey].$lte = `${year}-${month}-${day}`;
            } else {
              const year = parseInt(dateParts[0]);
              const month = parseInt(dateParts[1]) - 1;
              const day = parseInt(dateParts[2]);
              const endDate = new Date(
                Date.UTC(year, month, day, 23, 59, 59, 999),
              );
              dateRanges[baseKey].$lte = endDate;
            }
          }
        }
      });

      Object.entries(dateRanges).forEach(([key, range]) => {
        filterQuery[key] = range;
      });

      // Card filter (activeCardFilter)
      if (filter) {
        switch (filter) {
          case "paid":
            filterQuery.paymentStatus = "Paid";
            break;
          case "unpaid":
            filterQuery.paymentStatus = "Unpaid";
            break;
          case "partial":
            filterQuery.paymentStatus = "Partial";
            break;
          default:
            break;
        }
      }

      // Global search (multi-field)
      if (search) {
        filterQuery.$or = [
          { invoiceNumber: { $regex: search, $options: "i" } },
          { clientName: { $regex: search, $options: "i" } },
          { businessName: { $regex: search, $options: "i" } },
          { placeOfSupply: { $regex: search, $options: "i" } },
          { paymentMethod: { $regex: search, $options: "i" } },
          { clientId: { $regex: search, $options: "i" } },
        ];
      }

      // Parse pagination parameters
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      // Build sort object
      const sortObject = {};
      sortObject[sortBy] = sortOrder === "asc" ? 1 : -1;

      // Get total count for pagination
      const totalRecords = await invoicesCollection.countDocuments(filterQuery);

      // Get paginated results
      const invoices = await invoicesCollection
        .find(filterQuery)
        .sort(sortObject)
        .skip(skip)
        .limit(limitNum)
        .toArray();

      const binding = await getInvoiceTermsBinding();
      const patchedInvoices = [];
      const backfillUpdates = [];

      invoices.forEach((invoice) => {
        const { document: hydratedInvoice, patch } =
          applyTermsBindingToDocument(invoice, binding);
        patchedInvoices.push(hydratedInvoice);

        if (patch) {
          backfillUpdates.push({
            updateOne: {
              filter: { _id: invoice._id },
              update: {
                $set: patch,
              },
            },
          });
        }
      });

      if (backfillUpdates.length > 0) {
        await invoicesCollection.bulkWrite(backfillUpdates, {
          ordered: false,
        });
      }

      const now = Date.now();
      let cachedMeta =
        invoiceMetaCache.value && invoiceMetaCache.expiresAt > now
          ? invoiceMetaCache.value
          : null;

      if (!cachedMeta) {
        const statsPipeline = [
          { $match: { isDeleted: { $ne: true } } },
          {
            $addFields: {
              normalizedTotalAmount: {
                $convert: {
                  input: "$taxData.totalAmount",
                  to: "double",
                  onError: 0,
                  onNull: 0,
                },
              },
              normalizedAmountReceived: {
                $convert: {
                  input: "$amountReceived",
                  to: "double",
                  onError: 0,
                  onNull: 0,
                },
              },
            },
          },
          {
            $addFields: {
              resolvedPaidAmount: {
                $switch: {
                  branches: [
                    {
                      case: {
                        $and: [
                          { $in: ["$paymentStatus", ["Paid", "Partial"]] },
                          { $gt: ["$normalizedAmountReceived", 0] },
                        ],
                      },
                      then: "$normalizedAmountReceived",
                    },
                    {
                      case: { $eq: ["$paymentStatus", "Paid"] },
                      then: "$normalizedTotalAmount",
                    },
                    {
                      case: { $eq: ["$paymentStatus", "Partial"] },
                      then: { $divide: ["$normalizedTotalAmount", 2] },
                    },
                  ],
                  default: 0,
                },
              },
            },
          },
          {
            $group: {
              _id: null,
              totalRecords: { $sum: 1 },
              partialCount: {
                $sum: {
                  $cond: [{ $eq: ["$paymentStatus", "Partial"] }, 1, 0],
                },
              },
              totalAmount: { $sum: "$normalizedTotalAmount" },
              paidAmount: { $sum: "$resolvedPaidAmount" },
            },
          },
        ];

        const [
          statsAggregate,
          placeOfSupplyValues,
          paymentStatusValues,
          paymentMethodValues,
        ] = await Promise.all([
          invoicesCollection.aggregate(statsPipeline).next(),
          invoicesCollection.distinct("placeOfSupply", {
            isDeleted: { $ne: true },
            placeOfSupply: { $exists: true, $ne: "" },
          }),
          invoicesCollection.distinct("paymentStatus", {
            isDeleted: { $ne: true },
            paymentStatus: { $exists: true, $ne: "" },
          }),
          invoicesCollection.distinct("paymentMethod", {
            isDeleted: { $ne: true },
            paymentMethod: { $exists: true, $ne: "" },
          }),
        ]);

        const totalAmount = Number(statsAggregate?.totalAmount || 0);
        const paidAmount = Number(statsAggregate?.paidAmount || 0);

        cachedMeta = {
          totalRecordsCount: Number(statsAggregate?.totalRecords || 0),
          partialCount: Number(statsAggregate?.partialCount || 0),
          totalAmount,
          paidAmount,
          unpaidAmount: totalAmount - paidAmount,
          placeOfSupplyValues: [...placeOfSupplyValues].sort(),
          paymentStatusValues: [...paymentStatusValues].sort(),
          paymentMethodValues: [...paymentMethodValues].sort(),
        };

        invoiceMetaCache.value = cachedMeta;
        invoiceMetaCache.expiresAt = now + META_CACHE_TTL_MS;
      }

      // Return paginated response with metadata
      return createResponse(
        200,
        {
          data: patchedInvoices,
          pagination: {
            page: pageNum,
            limit: limitNum,
            totalRecords,
            totalPages: Math.ceil(totalRecords / limitNum),
          },
          statistics: {
            total: cachedMeta.totalRecordsCount,
            paid: Number(cachedMeta.paidAmount || 0).toFixed(2),
            unpaid: Number(cachedMeta.unpaidAmount || 0).toFixed(2),
            partial: cachedMeta.partialCount,
            totalAmount: Number(cachedMeta.totalAmount || 0).toFixed(2),
          },
          filterOptions: {
            placeOfSupply: ["All", ...cachedMeta.placeOfSupplyValues],
            paymentStatus: ["All", ...cachedMeta.paymentStatusValues],
            paymentMethod: ["All", ...cachedMeta.paymentMethodValues],
          },
          ...(includeDebug === "true"
            ? {
                debug: {
                  filterQuery,
                  params,
                  dateRanges,
                },
              }
            : {}),
        },
        origin,
      );
    }

    // POST - Create new invoice
    if (event.httpMethod === "POST") {
      const invoiceData = normalizePaymentMethodsInRecord(
        JSON.parse(event.body || "{}"),
      );

      delete invoiceData.invoiceTermsVersion;
      delete invoiceData.invoiceTermsConditionsSnapshot;

      let defaultYear = null;
      if (invoiceData.financialYear) {
        defaultYear = await yearsCollection.findOne({
          isDeleted: { $ne: true },
          financialYear: String(invoiceData.financialYear).trim(),
        });
      }

      if (!defaultYear) {
        defaultYear = await yearsCollection.findOne({
          isDeleted: { $ne: true },
          isDefault: true,
        });
      }

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

      // Check for duplicate invoice number (including soft-deleted records)
      const existingInvoice = await invoicesCollection.findOne({
        invoiceNumber: invoiceData.invoiceNumber,
      });

      if (existingInvoice && !existingInvoice.isDeleted) {
        return createResponse(
          409,
          { error: "Invoice number already exists" },
          origin,
        );
      }

      const binding = await getInvoiceTermsBinding();

      // Patch: Always save appliedAdvances with correct linkage for Invoice Preview and autofill
      const appliedAdvances = Array.isArray(invoiceData.appliedAdvances)
        ? invoiceData.appliedAdvances.map((a) => ({
            ...a,
            advanceId: String(a.advanceId || ""),
            receiptNumber: a.receiptNumber,
            receiptDate: a.receiptDate || a.receipt_date || a.date || null,
            paymentMethod: a.paymentMethod || "",
            appliedAmount: Number(a.appliedAmount || 0),
            maxAmount: Number(a.maxAmount || a.appliedAmount || 0),
          }))
        : [];
      delete invoiceData.appliedAdvances;

      // Compute total advance adjusted
      const advanceAdjustedTotal = appliedAdvances.reduce(
        (sum, a) => sum + Number(a.appliedAmount || 0),
        0,
      );

      const newInvoiceId = new ObjectId();

      const paymentSnapshot = await computeInvoicePaymentSnapshot({
        invoiceId: String(newInvoiceId),
        invoiceNumber: invoiceData.invoiceNumber,
        totalAmount: invoiceData?.taxData?.totalAmount,
        appliedAdvances,
        fallbackPaymentDate: invoiceData.paymentDate,
        fallbackPaymentMethod: invoiceData.paymentMethod,
        manualAmountReceived: invoiceData.amountReceived,
      });

      const result = await invoicesCollection.insertOne({
        _id: newInvoiceId,
        ...invoiceData,
        appliedAdvances,
        advanceAdjustedTotal:
          paymentSnapshot.advanceAdjustedTotal ?? advanceAdjustedTotal,
        amountReceived: paymentSnapshot.amountReceived,
        paymentStatus: paymentSnapshot.paymentStatus,
        paymentDate: paymentSnapshot.paymentDate,
        paymentMethod: paymentSnapshot.paymentMethod,
        dueAmount: paymentSnapshot.dueAmount,
        invoiceTermsVersion: binding?.version || "V1.0.0",
        createdAt: new Date(),
        updatedAt: new Date(),
        ...getAuditFieldsFromEvent(event, "create"),
      });

      // Update advance payment receipts with linked invoice info
      if (appliedAdvances.length > 0) {
        const paymentReceiptsCol = db.collection("payment_receipts");
        for (const adv of appliedAdvances) {
          if (!adv.advanceId || !ObjectId.isValid(adv.advanceId)) continue;
          const advDoc = await paymentReceiptsCol.findOne({
            _id: new ObjectId(adv.advanceId),
            isDeleted: { $ne: true },
          });
          if (!advDoc) continue;
          const newAdjusted =
            Number(advDoc.adjustedAmount || 0) + Number(adv.appliedAmount || 0);
          await paymentReceiptsCol.updateOne(
            { _id: new ObjectId(adv.advanceId) },
            {
              $set: {
                adjustedAmount: newAdjusted,
                linkedInvoiceId: String(newInvoiceId),
                linkedInvoiceNumber: invoiceData.invoiceNumber || "",
                updatedAt: new Date(),
              },
            },
          );
        }
      }

      invoiceMetaCache.value = null;
      invoiceMetaCache.expiresAt = 0;

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

      const invoiceData = normalizePaymentMethodsInRecord(
        JSON.parse(event.body),
      );
      delete invoiceData.invoiceTermsVersion;
      delete invoiceData.invoiceTermsConditionsSnapshot;
      const invoiceObjectId = new ObjectId(id);
      const currentInvoice = await invoicesCollection.findOne({
        _id: invoiceObjectId,
        isDeleted: { $ne: true },
      });

      if (!currentInvoice) {
        return createResponse(404, { error: "Invoice not found" }, origin);
      }

      // Check for duplicate invoice number (excluding current record)
      if (invoiceData.invoiceNumber) {
        const existingInvoice = await invoicesCollection.findOne({
          _id: { $ne: invoiceObjectId },
          invoiceNumber: invoiceData.invoiceNumber,
        });

        if (existingInvoice) {
          return createResponse(
            409,
            { error: "Invoice number already exists" },
            origin,
          );
        }
      }

      // Extract and handle appliedAdvances for update
      const updatedAppliedAdvances = Array.isArray(invoiceData.appliedAdvances)
        ? invoiceData.appliedAdvances.map((a) => ({
            ...a,
            advanceId: String(a.advanceId || ""),
            receiptNumber: a.receiptNumber || "",
            receiptDate: a.receiptDate || a.receipt_date || a.date || null,
            paymentMethod: a.paymentMethod || "",
            appliedAmount: Number(a.appliedAmount || 0),
            maxAmount: Number(a.maxAmount || a.appliedAmount || 0),
          }))
        : null;
      if (updatedAppliedAdvances !== null) {
        delete invoiceData.appliedAdvances;
      }

      // If appliedAdvances changed, recalculate and sync advance records
      if (updatedAppliedAdvances !== null) {
        const paymentReceiptsCol = db.collection("payment_receipts");
        const prevAdvances = Array.isArray(currentInvoice?.appliedAdvances)
          ? currentInvoice.appliedAdvances
          : [];

        // Reverse previous adjustments for this invoice
        for (const adv of prevAdvances) {
          if (!adv.advanceId || !ObjectId.isValid(adv.advanceId)) continue;
          const advDoc = await paymentReceiptsCol.findOne({
            _id: new ObjectId(adv.advanceId),
          });
          if (!advDoc) continue;
          const reversedAdjusted = Math.max(
            0,
            Number(advDoc.adjustedAmount || 0) - Number(adv.appliedAmount || 0),
          );
          await paymentReceiptsCol.updateOne(
            { _id: new ObjectId(adv.advanceId) },
            {
              $set: { adjustedAmount: reversedAdjusted, updatedAt: new Date() },
            },
          );
        }

        // Apply new adjustments
        for (const adv of updatedAppliedAdvances) {
          if (!adv.advanceId || !ObjectId.isValid(adv.advanceId)) continue;
          const advDoc = await paymentReceiptsCol.findOne({
            _id: new ObjectId(adv.advanceId),
            isDeleted: { $ne: true },
          });
          if (!advDoc) continue;
          const newAdjusted =
            Number(advDoc.adjustedAmount || 0) + Number(adv.appliedAmount || 0);
          await paymentReceiptsCol.updateOne(
            { _id: new ObjectId(adv.advanceId) },
            {
              $set: {
                adjustedAmount: newAdjusted,
                linkedInvoiceId: id,
                linkedInvoiceNumber:
                  invoiceData.invoiceNumber ||
                  currentInvoice?.invoiceNumber ||
                  "",
                updatedAt: new Date(),
              },
            },
          );
        }

        const advanceAdjustedTotal = updatedAppliedAdvances.reduce(
          (sum, a) => sum + Number(a.appliedAmount || 0),
          0,
        );
        invoiceData.appliedAdvances = updatedAppliedAdvances;
        invoiceData.advanceAdjustedTotal = advanceAdjustedTotal;
      }

      const resolvedInvoiceNumber =
        invoiceData.invoiceNumber || currentInvoice.invoiceNumber || "";
      const effectiveAppliedAdvances =
        updatedAppliedAdvances !== null
          ? updatedAppliedAdvances
          : Array.isArray(currentInvoice.appliedAdvances)
            ? currentInvoice.appliedAdvances
            : [];
      const totalAmountForSnapshot =
        invoiceData?.taxData?.totalAmount ??
        currentInvoice?.taxData?.totalAmount;

      const paymentSnapshot = await computeInvoicePaymentSnapshot({
        invoiceId: id,
        invoiceNumber: resolvedInvoiceNumber,
        totalAmount: totalAmountForSnapshot,
        appliedAdvances: effectiveAppliedAdvances,
        // If the incoming payload explicitly contains the field (even empty), use it.
        // Otherwise, fall back to the existing invoice value.
        fallbackPaymentDate: Object.prototype.hasOwnProperty.call(
          invoiceData,
          "paymentDate",
        )
          ? invoiceData.paymentDate
          : currentInvoice.paymentDate,
        fallbackPaymentMethod: Object.prototype.hasOwnProperty.call(
          invoiceData,
          "paymentMethod",
        )
          ? invoiceData.paymentMethod
          : currentInvoice.paymentMethod,
        manualAmountReceived: Object.prototype.hasOwnProperty.call(
          invoiceData,
          "amountReceived",
        )
          ? invoiceData.amountReceived
          : currentInvoice.amountReceived,
      });

      invoiceData.amountReceived = paymentSnapshot.amountReceived;
      invoiceData.paymentStatus = paymentSnapshot.paymentStatus;
      invoiceData.paymentDate = paymentSnapshot.paymentDate;
      invoiceData.paymentMethod = paymentSnapshot.paymentMethod;
      invoiceData.dueAmount = paymentSnapshot.dueAmount;
      if (updatedAppliedAdvances === null) {
        invoiceData.advanceAdjustedTotal = paymentSnapshot.advanceAdjustedTotal;
      }

      const result = await invoicesCollection.updateOne(
        { _id: invoiceObjectId, isDeleted: { $ne: true } },
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

      invoiceMetaCache.value = null;
      invoiceMetaCache.expiresAt = 0;

      return createResponse(
        200,
        { message: "Invoice updated successfully" },
        origin,
      );
    }

    // DELETE - Soft delete invoice
    if (event.httpMethod === "DELETE") {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(400, { error: "Invoice ID is required" }, origin);
      }

      if (!ObjectId.isValid(id)) {
        return createResponse(400, { error: "Invalid invoice ID" }, origin);
      }

      const result = await invoicesCollection.updateOne(
        { _id: new ObjectId(id), isDeleted: { $ne: true } },
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
        return createResponse(404, { error: "Invoice not found" }, origin);
      }

      invoiceMetaCache.value = null;
      invoiceMetaCache.expiresAt = 0;

      return createResponse(
        200,
        { message: "Invoice deleted successfully" },
        origin,
      );
    }

    return createResponse(405, { error: "Method not allowed" }, origin);
  } catch (error) {
    console.error("Invoice API Error:", error);

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
