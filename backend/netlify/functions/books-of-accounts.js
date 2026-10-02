import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { verifyRequestToken } from "./utils/auth.js";
import { normalizeTransactionSnapshot } from "./utils/transactions.js";

const toNumber = (value) => {
  const num = parseFloat(value);
  return Number.isNaN(num) ? 0 : num;
};

const round2 = (value) => Math.round(toNumber(value) * 100) / 100;

const escapeRegExp = (value) =>
  String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseDateValue = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const raw = String(value || "").trim();
  if (!raw) return null;

  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;

  const dashMatch = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashMatch) {
    const parsed = new Date(
      Number(dashMatch[3]),
      Number(dashMatch[2]) - 1,
      Number(dashMatch[1]),
    );
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const parsed = new Date(
      Number(slashMatch[3]),
      Number(slashMatch[2]) - 1,
      Number(slashMatch[1]),
    );
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
};

const getOpeningBalance = (yearRecord, keys) => {
  if (!yearRecord) return 0;

  const value = keys.reduce((found, key) => {
    if (found !== null) return found;
    const candidate = yearRecord?.[key];
    return candidate !== undefined && candidate !== null ? candidate : null;
  }, null);

  return value !== null ? toNumber(value) : 0;
};

const getTaxAmount = (record = {}) => {
  const taxData = record?.taxData || {};
  const cgst = toNumber(taxData.cgst || 0);
  const sgst = toNumber(taxData.sgst || 0);
  const igst = toNumber(taxData.igst || 0);
  const explicitTax = cgst + sgst + igst;

  if (explicitTax > 0) return round2(explicitTax);

  const totalAmount = toNumber(taxData.totalAmount || record?.amount || 0);
  const taxableAmount = toNumber(
    taxData.taxableAmount || taxData.subtotal || record?.amount || 0,
  );

  return round2(Math.max(totalAmount - taxableAmount, 0));
};

const getStandardSourceType = (sourceType = "") => {
  switch (
    String(sourceType || "")
      .trim()
      .toLowerCase()
  ) {
    case "invoice":
      return "sales";
    case "purchase":
      return "purchase";
    case "company-expense":
      return "companyExpense";
    case "rcm":
      return "rcm";
    case "credit_note":
    case "debit_note":
    case "credit-note":
    case "debit-note":
    case "credit-debit-note":
      return "creditDebitNote";
    case "project":
      return "project";
    default:
      return String(sourceType || "").trim();
  }
};

const inferNoteTypeFromNumber = (value = "") => {
  const raw = String(value || "")
    .trim()
    .toUpperCase();
  if (!raw) return "";
  if (raw.startsWith("CN")) return "Credit Note";
  if (raw.startsWith("DN")) return "Debit Note";
  return "";
};

const getRecordType = (sourceType = "") => {
  switch (sourceType) {
    case "sales":
      return "Sales";
    case "purchase":
      return "Purchase";
    case "companyExpense":
      return "Company Expense";
    case "rcm":
      return "RCM";
    case "creditDebitNote":
      return "Credit / Debit Note";
    case "project":
      return "Developer Payout";
    default:
      return sourceType;
  }
};

const getCreditDebitRecordType = (sourceRecord = {}) => {
  const rawNoteType =
    String(sourceRecord?.noteType || "").trim() ||
    inferNoteTypeFromNumber(
      sourceRecord?.noteNumber || sourceRecord?.invoiceNumber,
    );
  const normalized = rawNoteType.toLowerCase();

  if (normalized === "credit note") return "Credit Note";
  if (normalized === "debit note") return "Debit Note";
  return "Credit / Debit Note";
};

const resolveCreditDebitTaxPercentage = (
  sourceRecord = {},
  sourceTaxData = {},
) => {
  const taxRate = toNumber(sourceRecord?.taxRate);
  if (taxRate > 0) return round2(taxRate);

  const taxPercentage = toNumber(sourceTaxData?.taxPercentage);
  if (taxPercentage > 0) return round2(taxPercentage);

  const amount = toNumber(sourceRecord?.amount);
  const taxAmount = toNumber(sourceRecord?.taxAmount);
  if (amount > 0 && taxAmount > 0) {
    return round2((taxAmount / amount) * 100);
  }

  return 0;
};

const normalizeCreditDebitStatus = (status = "", noteType = "") => {
  const normalizedStatus = String(status || "")
    .trim()
    .toLowerCase();
  const normalizedType = String(noteType || "")
    .trim()
    .toLowerCase();

  if (normalizedType === "credit note") {
    if (["full refund", "refunded"].includes(normalizedStatus)) {
      return "Refunded";
    }
    if (["partial refund", "partel refund"].includes(normalizedStatus)) {
      return "Partial Refund";
    }
    return "Pending";
  }

  if (normalizedType === "debit note") {
    if (normalizedStatus === "paid") return "Paid";
    if (
      ["partial", "partial payment", "partal payment"].includes(
        normalizedStatus,
      )
    ) {
      return "Partial Payment";
    }
    return "Pending";
  }

  return String(status || "").trim() || "Pending";
};

const getNotePaymentStatus = (sourceRecord = {}) => {
  const resolvedNoteType =
    String(sourceRecord?.noteType || "").trim() ||
    inferNoteTypeFromNumber(
      sourceRecord?.noteNumber || sourceRecord?.invoiceNumber,
    );
  const normalizedNoteType = resolvedNoteType.toLowerCase();

  if (normalizedNoteType === "debit note") {
    const explicit = String(sourceRecord?.paymentStatus || "").trim();
    if (explicit) {
      return normalizeCreditDebitStatus(explicit, resolvedNoteType);
    }

    const total = round2(
      sourceRecord?.totalAmount ||
        sourceRecord?.taxData?.totalAmount ||
        sourceRecord?.amount ||
        0,
    );
    const received = round2(sourceRecord?.receivedAmount || 0);

    if (received <= 0) return "Pending";
    if (received >= total && total > 0) return "Paid";
    return "Partial Payment";
  }

  if (normalizedNoteType === "credit note") {
    const refundStatus = String(sourceRecord?.refundStatus || "").trim();
    if (refundStatus) {
      return normalizeCreditDebitStatus(refundStatus, resolvedNoteType);
    }

    const total = round2(
      sourceRecord?.totalAmount ||
        sourceRecord?.taxData?.totalAmount ||
        sourceRecord?.amount ||
        0,
    );
    const refunded = round2(
      sourceRecord?.refundAmount ||
        sourceRecord?.amountPaid ||
        sourceRecord?.paidAmount ||
        sourceRecord?.amountReceived ||
        sourceRecord?.receivedAmount ||
        0,
    );

    if (refunded > 0 && total > 0) {
      if (refunded >= total) return "Refunded";
      return "Partial Refund";
    }
  }

  const fallbackStatus =
    String(sourceRecord?.paymentStatus || "").trim() ||
    String(sourceRecord?.status || "").trim();
  return normalizeCreditDebitStatus(fallbackStatus, resolvedNoteType);
};

const buildBaseRecord = (transaction = {}, overrides = {}) => {
  const sourceRecord =
    transaction?.sourceRecord && typeof transaction.sourceRecord === "object"
      ? transaction.sourceRecord
      : {};
  const sourceTaxData =
    sourceRecord?.taxData && typeof sourceRecord.taxData === "object"
      ? sourceRecord.taxData
      : {};
  const sourceType =
    overrides.sourceType || getStandardSourceType(transaction.sourceType);
  const notePaymentStatus =
    sourceType === "creditDebitNote"
      ? getNotePaymentStatus(sourceRecord)
      : sourceRecord.paymentStatus;
  const creditDebitTaxPercentage =
    sourceType === "creditDebitNote"
      ? resolveCreditDebitTaxPercentage(sourceRecord, sourceTaxData)
      : 0;

  return {
    id: overrides.id || transaction.sourceId,
    sourceType,
    recordType:
      overrides.recordType ||
      (sourceType === "creditDebitNote"
        ? getCreditDebitRecordType(sourceRecord)
        : getRecordType(sourceType)),
    noteType:
      sourceType === "creditDebitNote"
        ? getCreditDebitRecordType(sourceRecord)
        : String(sourceRecord?.noteType || "").trim(),
    invoiceNumber:
      overrides.invoiceNumber ||
      sourceRecord.noteNumber ||
      sourceRecord.invoiceNumber ||
      sourceRecord.receiptNumber ||
      sourceRecord.projectId ||
      transaction.sourceLabel ||
      "",
    expenseNumber: overrides.expenseNumber || sourceRecord.expenseNumber || "",
    selfInvoiceNumber:
      overrides.selfInvoiceNumber || sourceRecord.selfInvoiceNumber || "",
    originalRefNo: overrides.originalRefNo || sourceRecord.originalRefNo || "",
    businessName: overrides.businessName || sourceRecord.businessName || "",
    partyName: overrides.partyName || sourceRecord.partyName || "",
    vendorName: overrides.vendorName || sourceRecord.vendorName || "",
    serviceProviderBusinessName:
      overrides.serviceProviderBusinessName ||
      sourceRecord.serviceProviderBusinessName ||
      "",
    staffName: overrides.staffName || sourceRecord.staffName || "",
    gstin: overrides.gstin || sourceRecord.gstin || "-",
    invoiceDate:
      overrides.invoiceDate ||
      sourceRecord.invoiceDate ||
      sourceRecord.noteDate ||
      sourceRecord.expenseDate ||
      sourceRecord.receiptDate ||
      sourceRecord.projectDate ||
      sourceRecord.fundDate ||
      transaction.transactionDate ||
      "",
    paymentMethod:
      overrides.paymentMethod ||
      sourceRecord.paymentMethod ||
      transaction.paymentMethod ||
      "",
    paymentStatus: overrides.paymentStatus || notePaymentStatus || "Unpaid",
    invoiceType: overrides.invoiceType || sourceRecord.invoiceType || "-",
    amount:
      overrides.amount !== undefined
        ? round2(overrides.amount)
        : round2(sourceTaxData.totalAmount || transaction.amount || 0),
    amountPaid:
      overrides.amountPaid !== undefined
        ? round2(overrides.amountPaid)
        : round2(
            sourceRecord.amountPaid ||
              sourceRecord.paidAmount ||
              sourceRecord.refundAmount ||
              sourceRecord.amountReceived ||
              sourceRecord.receivedAmount ||
              0,
          ),
    amountReceived:
      overrides.amountReceived !== undefined
        ? round2(overrides.amountReceived)
        : round2(
            sourceRecord.amountReceived ||
              sourceRecord.receivedAmount ||
              sourceRecord.refundAmount ||
              sourceRecord.amountPaid ||
              sourceRecord.paidAmount ||
              0,
          ),
    createdBy:
      overrides.createdBy ||
      sourceRecord.createdBy ||
      sourceRecord.updatedBy ||
      transaction.createdBy ||
      "",
    taxData: {
      taxableAmount: round2(
        overrides.taxableAmount ??
          sourceTaxData.taxableAmount ??
          sourceTaxData.subtotal ??
          sourceRecord.amount ??
          0,
      ),
      subtotal: round2(
        overrides.subtotal ??
          sourceTaxData.subtotal ??
          sourceTaxData.taxableAmount ??
          sourceRecord.amount ??
          0,
      ),
      totalAmount: round2(
        overrides.totalAmount ??
          sourceTaxData.totalAmount ??
          sourceRecord.totalAmount ??
          transaction.amount ??
          0,
      ),
      cgst: round2(
        overrides.cgst ?? sourceTaxData.cgst ?? transaction.taxData?.cgst ?? 0,
      ),
      sgst: round2(
        overrides.sgst ?? sourceTaxData.sgst ?? transaction.taxData?.sgst ?? 0,
      ),
      igst: round2(
        overrides.igst ?? sourceTaxData.igst ?? transaction.taxData?.igst ?? 0,
      ),
      taxPercentage: round2(
        overrides.taxPercentage ??
          (sourceType === "creditDebitNote"
            ? creditDebitTaxPercentage
            : (sourceTaxData.taxPercentage ?? sourceRecord.taxRate)) ??
          0,
      ),
    },
  };
};

const buildProjectRecords = (transaction = {}) => {
  const sourceRecord =
    transaction?.sourceRecord && typeof transaction.sourceRecord === "object"
      ? transaction.sourceRecord
      : {};
  const projectName = sourceRecord.projectName || transaction.partyName || "";
  const projectId = sourceRecord.projectId || transaction.sourceLabel || "";
  const createdBy =
    sourceRecord.createdBy ||
    sourceRecord.updatedBy ||
    transaction.createdBy ||
    "";
  const developerTransactions = Array.isArray(
    sourceRecord.developerTransactions,
  )
    ? sourceRecord.developerTransactions
    : [];

  if (developerTransactions.length === 0) {
    return [
      buildBaseRecord(transaction, {
        sourceType: "project",
        recordType: "Developer Payout",
        invoiceNumber: projectId,
        businessName: projectName,
        invoiceDate: sourceRecord.projectDate || transaction.transactionDate,
        paymentMethod: sourceRecord.paymentMethod || transaction.paymentMethod,
        paymentStatus: "Paid",
        amount: transaction.amount,
        amountPaid: transaction.amount,
        amountReceived: transaction.amount,
        totalAmount: transaction.amount,
        taxableAmount: transaction.amount,
        subtotal: transaction.amount,
        createdBy,
      }),
    ];
  }

  return developerTransactions.map((row = {}, index) => {
    const payoutAmount = round2(row.payoutAmount || 0);
    return buildBaseRecord(transaction, {
      id: `${transaction.sourceId}-${index + 1}`,
      sourceType: "project",
      recordType: "Developer Payout",
      invoiceNumber: projectId,
      businessName: row.staffName || projectName,
      staffName: row.staffName || "",
      invoiceDate:
        row.payoutDate ||
        row.paymentDate ||
        sourceRecord.projectDate ||
        transaction.transactionDate,
      paymentMethod:
        row.payoutMethod || transaction.paymentMethod || "Bank Transfer",
      paymentStatus: "Paid",
      amount: payoutAmount,
      amountPaid: payoutAmount,
      amountReceived: payoutAmount,
      totalAmount: payoutAmount,
      taxableAmount: payoutAmount,
      subtotal: payoutAmount,
      cgst: 0,
      sgst: 0,
      igst: 0,
      taxPercentage: 0,
      createdBy,
    });
  });
};

const buildRecordsFromTransactions = (transactions = []) => {
  return transactions.flatMap((transaction) => {
    const sourceType = getStandardSourceType(transaction.sourceType);

    if (sourceType === "project") {
      return buildProjectRecords(transaction);
    }

    return [
      buildBaseRecord(transaction, {
        sourceType,
        recordType: getRecordType(sourceType),
        invoiceNumber:
          sourceType === "sales" || sourceType === "purchase"
            ? transaction.sourceLabel
            : undefined,
        expenseNumber:
          sourceType === "companyExpense" ? transaction.sourceLabel : undefined,
        selfInvoiceNumber:
          sourceType === "rcm" ? transaction.sourceLabel : undefined,
        invoiceDate:
          sourceType === "companyExpense"
            ? transaction.sourceRecord?.expenseDate ||
              transaction.transactionDate
            : undefined,
        amount:
          sourceType === "rcm"
            ? transaction.sourceRecord?.taxData?.totalAmount ||
              transaction.sourceRecord?.amount ||
              transaction.amount
            : undefined,
      }),
    ];
  });
};

const getComparableFieldValue = (record, key) => {
  switch (key) {
    case "type":
      return record.recordType || "";
    case "paymentMode":
      return record.paymentMethod || "";
    case "paid":
      return record.paymentStatus || "";
    case "invoiceNo":
      return (
        record.invoiceNumber ||
        record.expenseNumber ||
        record.selfInvoiceNumber ||
        record.originalRefNo ||
        ""
      );
    case "clientSecondary":
      return (
        record.businessName ||
        record.partyName ||
        record.vendorName ||
        record.serviceProviderBusinessName ||
        record.staffName ||
        ""
      );
    case "date":
    case "dateTime":
    case "invoiceDate":
      return record.invoiceDate || "";
    default:
      return record[key];
  }
};

const getCreditDebitNoteEffect = (record = {}) => {
  const normalizedType = String(record?.noteType || record?.recordType || "")
    .trim()
    .toLowerCase();

  if (normalizedType === "credit note") return "credit-note";
  if (normalizedType === "debit note") return "debit-note";

  const inferred = String(record?.invoiceNumber || record?.noteNumber || "")
    .trim()
    .toUpperCase();
  if (inferred.startsWith("CN")) return "credit-note";
  if (inferred.startsWith("DN")) return "debit-note";

  return "unknown";
};

const applyPeriodFilter = (records, period) => {
  if (!period || period === "yearly") return records;

  const today = new Date();
  let rangeStart = null;
  let rangeEnd = null;

  if (period === "daily") {
    rangeStart = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
    );
    rangeEnd = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate(),
      23,
      59,
      59,
      999,
    );
  } else if (period === "monthly") {
    rangeStart = new Date(today.getFullYear(), today.getMonth(), 1);
    rangeEnd = new Date(
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
    rangeStart = new Date(today.getFullYear(), quarter * 3, 1);
    rangeEnd = new Date(
      today.getFullYear(),
      quarter * 3 + 3,
      0,
      23,
      59,
      59,
      999,
    );
  } else if (period === "halfYearly") {
    const halfStartMonth = today.getMonth() < 6 ? 0 : 6;
    rangeStart = new Date(today.getFullYear(), halfStartMonth, 1);
    rangeEnd = new Date(
      today.getFullYear(),
      halfStartMonth + 6,
      0,
      23,
      59,
      59,
      999,
    );
  }

  if (!rangeStart || !rangeEnd) return records;

  return records.filter((record) => {
    const recordDate = parseDateValue(record.invoiceDate);
    return Boolean(
      recordDate && recordDate >= rangeStart && recordDate <= rangeEnd,
    );
  });
};

export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === "OPTIONS") {
    return createResponse(200, {}, origin, event);
  }

  try {
    verifyRequestToken(event);

    if (event.httpMethod !== "GET") {
      return createResponse(405, { error: "Method not allowed" }, origin, event);
    }

    const { db } = await connectToDatabase();
    const transactionsCollection = db.collection("transactions");
    const yearsCollection = db.collection("financialYears");
    const params = event.queryStringParameters || {};
    const {
      page = 1,
      limit = 10,
      search,
      financialYear = "ALL",
      period,
      recordType,
      date_start,
      date_end,
      sortBy = "invoiceDate",
      sortOrder = "desc",
    } = params;

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.max(parseInt(limit, 10) || 10, 1);
    const skip = (pageNum - 1) * limitNum;

    const query = {
      isDeleted: { $ne: true },
      sourceType: {
        $in: [
          "invoice",
          "purchase",
          "company-expense",
          "rcm",
          "credit_note",
          "debit_note",
          "credit-note",
          "debit-note",
          "credit-debit-note",
          "project",
        ],
      },
    };

    if (financialYear && financialYear !== "ALL") {
      query.financialYear = String(financialYear).trim();
    }

    const transactions = await transactionsCollection.find(query).toArray();
    const normalizedTransactions = transactions.map(
      normalizeTransactionSnapshot,
    );
    const allRecords = buildRecordsFromTransactions(normalizedTransactions);

    let filteredRecords = [...allRecords];

    if (recordType && recordType !== "all") {
      filteredRecords = filteredRecords.filter(
        (record) => record.sourceType === recordType,
      );
    }

    filteredRecords = applyPeriodFilter(filteredRecords, period);

    if (date_start || date_end) {
      const startDate = parseDateValue(date_start);
      const endDate = parseDateValue(date_end);
      if (endDate) endDate.setHours(23, 59, 59, 999);

      filteredRecords = filteredRecords.filter((record) => {
        const recordDate = parseDateValue(record.invoiceDate);
        if (!recordDate) return false;
        if (startDate && recordDate < startDate) return false;
        if (endDate && recordDate > endDate) return false;
        return true;
      });
    }

    if (search) {
      const searchRegex = new RegExp(escapeRegExp(String(search).trim()), "i");
      filteredRecords = filteredRecords.filter((record) => {
        const searchableValues = [
          getComparableFieldValue(record, "invoiceNo"),
          getComparableFieldValue(record, "clientSecondary"),
          getComparableFieldValue(record, "type"),
          getComparableFieldValue(record, "paymentMode"),
          getComparableFieldValue(record, "paid"),
          record.gstin || "",
          record.createdBy || "",
          record.sourceType || "",
        ];

        return searchableValues.some((value) =>
          searchRegex.test(String(value || "")),
        );
      });
    }

    const reservedParamKeys = new Set([
      "page",
      "limit",
      "sortBy",
      "sortOrder",
      "search",
      "financialYear",
      "period",
      "recordType",
    ]);
    const dropdownFilterKeys = new Set([
      "type",
      "paymentMode",
      "paid",
      "gstin",
      "createdByDisplay",
    ]);

    Object.entries(params)
      .filter(([key, value]) => {
        if (reservedParamKeys.has(key)) return false;
        if (key.endsWith("_start") || key.endsWith("_end")) return false;
        return !(
          value === undefined ||
          value === null ||
          value === "" ||
          value === "All"
        );
      })
      .forEach(([key, rawValue]) => {
        const filterValues = String(rawValue)
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);

        if (filterValues.length === 0) return;

        filteredRecords = filteredRecords.filter((record) => {
          const comparableValue =
            key === "createdByDisplay"
              ? record.createdBy || ""
              : getComparableFieldValue(record, key);
          if (comparableValue === undefined || comparableValue === null)
            return false;

          const recordValue = String(comparableValue).toLowerCase();
          if (dropdownFilterKeys.has(key)) {
            return filterValues.some(
              (value) => recordValue === String(value).toLowerCase(),
            );
          }

          return filterValues.some((value) =>
            recordValue.includes(String(value).toLowerCase()),
          );
        });
      });

    let openingItcTotal = 0;
    if (financialYear && financialYear !== "ALL") {
      const yearRecord = await yearsCollection.findOne({
        financialYear: String(financialYear).trim(),
        isDeleted: { $ne: true },
      });

      if (yearRecord) {
        const cgst = getOpeningBalance(yearRecord, [
          "openingCgstItc",
          "openingItcCgst",
        ]);
        const sgst = getOpeningBalance(yearRecord, [
          "openingSgstItc",
          "openingItcSgst",
        ]);
        const igst = getOpeningBalance(yearRecord, [
          "openingIgstItc",
          "openingItcIgst",
        ]);
        const extra = getOpeningBalance(yearRecord, [
          "openingItc",
          "openingGstInput",
        ]);
        openingItcTotal = round2(cgst + sgst + igst + extra);
      }
    }

    let outputGst = 0;
    let inputGst = openingItcTotal;
    let rcmTax = 0;

    filteredRecords.forEach((record) => {
      const taxAmount = getTaxAmount(record);
      if (record.sourceType === "sales") {
        outputGst = round2(outputGst + taxAmount);
      } else if (record.sourceType === "purchase") {
        inputGst = round2(inputGst + taxAmount);
      } else if (record.sourceType === "rcm") {
        rcmTax = round2(rcmTax + taxAmount);
        inputGst = round2(inputGst + taxAmount);
        outputGst = round2(outputGst + taxAmount);
      } else if (record.sourceType === "creditDebitNote") {
        const noteEffect = getCreditDebitNoteEffect(record);
        if (noteEffect === "credit-note") {
          outputGst = round2(outputGst - taxAmount);
        } else if (noteEffect === "debit-note") {
          outputGst = round2(outputGst + taxAmount);
        }
      }
    });

    const sortField = sortBy || "invoiceDate";
    const sortMultiplier = sortOrder === "asc" ? 1 : -1;

    filteredRecords.sort((a, b) => {
      let valA = getComparableFieldValue(a, sortField);
      let valB = getComparableFieldValue(b, sortField);

      if (["invoiceDate", "date", "dateTime"].includes(sortField)) {
        valA = parseDateValue(valA)?.getTime() || 0;
        valB = parseDateValue(valB)?.getTime() || 0;
      } else if (typeof valA === "string" && typeof valB === "string") {
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();
      } else {
        valA = valA ?? 0;
        valB = valB ?? 0;
      }

      if (valA < valB) return -1 * sortMultiplier;
      if (valA > valB) return 1 * sortMultiplier;
      return 0;
    });

    const types = [...new Set(allRecords.map((record) => record.recordType))]
      .filter(Boolean)
      .sort();
    const paymentModes = [
      ...new Set(allRecords.map((record) => record.paymentMethod)),
    ]
      .filter((value) => value && value !== "" && value !== "-")
      .sort();
    const paidStatuses = [
      ...new Set(allRecords.map((record) => record.paymentStatus)),
    ]
      .filter(Boolean)
      .sort();
    const gstins = [...new Set(allRecords.map((record) => record.gstin))]
      .filter((value) => value && value !== "" && value !== "-")
      .sort();

    const paginatedRecords = filteredRecords.slice(skip, skip + limitNum);

    return createResponse(200,
      {
        data: paginatedRecords,
        pagination: {
          page: pageNum,
          limit: limitNum,
          totalRecords: filteredRecords.length,
          totalPages: Math.ceil(filteredRecords.length / limitNum),
        },
        statistics: {
          outputGst: round2(outputGst),
          inputGst: round2(inputGst),
          rcmTax: round2(rcmTax),
          totalPayable: round2(outputGst - inputGst),
        },
        filterOptions: {
          type: types,
          paymentMode: paymentModes,
          paid: paidStatuses,
          gstin: gstins,
        },
      },
      origin, event);
  } catch (error) {
    console.error("Books of Accounts API Error:", error);

    if (error.message.includes("token") || error.message.includes("Token")) {
      return createResponse(401,
        {
          error: "Unauthorized",
          message: error.message,
        },
        origin, event);
    }

    return createResponse(500,
      {
        error: "Internal server error",
        message: error.message,
      },
      origin, event);
  }
}
