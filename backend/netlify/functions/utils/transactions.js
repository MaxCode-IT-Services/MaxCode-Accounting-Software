// D:\MaxCode Accounting Software\backend\netlify\functions\utils\transactions.js
import { ObjectId } from "mongodb";

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const roundAmount = (value) => {
  const num = toNumber(value);
  return Math.round(num * 100) / 100;
};

const toFiniteOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const pickFirstAmount = (...values) => {
  for (const value of values) {
    const parsed = toFiniteOrNull(value);
    if (parsed !== null) return roundAmount(parsed);
  }
  return null;
};

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

const getDateOnlyString = (value) => {
  const parsed = parseDateValue(value);
  if (!parsed) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getFinancialYear = (dateValue) => {
  const parsed = parseDateValue(dateValue) || new Date();
  const year = parsed.getFullYear();
  const month = parsed.getMonth() + 1;
  const startYear = month >= 4 ? year : year - 1;
  const endYearShort = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}-${endYearShort}`;
};

const normalizePaymentMethod = (value) => String(value || "").trim();

const normalizeSourceType = (sourceType = "") => {
  const normalized = String(sourceType || "")
    .trim()
    .toLowerCase()
    .replace(/[ _]+/g, "-");

  switch (normalized) {
    case "sales":
      return "invoice";
    case "expense":
    case "companyexpense":
      return "company-expense";
    case "payment-receipts":
      return "payment-receipt";
    case "payment-refund":
    case "payment-refunds":
      return "payment-refund";
    case "owner-investment":
      return "owner-investment";
    case "owner-withdrawal":
      return "owner-withdrawal";
    case "credit-note":
    case "debit-note":
      return "credit-debit-note";
    default:
      return normalized;
  }
};

const isCashLike = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .includes("cash");

const isBankMethod = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return (
    normalized.includes("bank") ||
    normalized.includes("upi") ||
    normalized.includes("imps") ||
    normalized.includes("rtgs") ||
    normalized.includes("neft") ||
    normalized.includes("transfer") ||
    normalized.includes("card") ||
    normalized.includes("cheque") ||
    normalized.includes("check")
  );
};

const getPaymentAccountHead = (paymentMethod, fallback = "Bank Account") => {
  if (isCashLike(paymentMethod)) return "Cash Account";
  if (isBankMethod(paymentMethod)) return "Bank Account";
  return fallback;
};

const isOwnerPersonal = (record = {}, fallback = "") => {
  const source = String(
    record?.paymentSource || record?.payoutSource || fallback || "",
  )
    .trim()
    .toLowerCase();
  return source.includes("owner") || source.includes("personal");
};

const isPurchaseItcEligible = (invoiceType) => {
  const normalized = String(invoiceType || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  return normalized === "itc" || normalized === "rcm + itc";
};

const getAppliedAdvanceAmount = (record = {}) => {
  const direct = toNumber(record?.advanceAdjustedTotal || 0);
  const mapped = Array.isArray(record?.appliedAdvances)
    ? record.appliedAdvances.reduce(
        (sum, row) => sum + toNumber(row?.appliedAmount || 0),
        0,
      )
    : 0;
  return Math.max(direct, mapped);
};

const inferCreditDebitNoteType = (record = {}) => {
  const explicitType = String(record?.noteType || "")
    .trim()
    .toLowerCase();
  if (explicitType === "credit note") return "Credit Note";
  if (explicitType === "debit note") return "Debit Note";

  const noteToken = String(record?.noteNumber || record?.invoiceNumber || "")
    .trim()
    .toUpperCase();
  if (noteToken.startsWith("CN") || noteToken.includes("/CN/")) {
    return "Credit Note";
  }
  if (noteToken.startsWith("DN") || noteToken.includes("/DN/")) {
    return "Debit Note";
  }

  return "Debit Note";
};

const getExplicitPaidAmount = (record = {}) =>
  Math.max(
    toNumber(record?.amountReceived || 0),
    toNumber(record?.amountPaid || 0),
    toNumber(record?.paidAmount || 0),
    toNumber(record?.receivedAmount || 0),
    toNumber(record?.refundAmount || 0),
  );

const getTaxComponents = (record = {}) => {
  const taxData = record?.taxData || {};
  const cgst = roundAmount(toNumber(taxData.cgst ?? record?.cgst ?? 0));
  const sgst = roundAmount(toNumber(taxData.sgst ?? record?.sgst ?? 0));
  const igst = roundAmount(toNumber(taxData.igst ?? record?.igst ?? 0));
  const explicit = cgst + sgst + igst;
  const totalTax =
    explicit > 0
      ? explicit
      : roundAmount(toNumber(taxData.totalTax ?? record?.taxAmount ?? 0));
  return { cgst, sgst, igst, totalTax };
};

const deriveTaxComponentsFromPlace = (placeOfSupply, totalTax) => {
  if (totalTax <= 0) return { cgst: 0, sgst: 0, igst: 0 };

  const place = String(placeOfSupply || "").toLowerCase();
  const isRajasthan =
    place.includes("rajasthan") ||
    place.includes("(08)") ||
    /\b08\b/.test(place);

  if (isRajasthan) {
    // CGST + SGST split
    const half = roundAmount(totalTax / 2);
    return { cgst: half, sgst: half, igst: 0 };
  } else {
    // IGST only
    return { cgst: 0, sgst: 0, igst: totalTax };
  }
};

const ensureTaxComponents = (record = {}) => {
  const { cgst, sgst, igst, totalTax } = getTaxComponents(record);

  // If we have explicit breakdown, use it
  if (cgst > 0 || sgst > 0 || igst > 0) {
    return { cgst, sgst, igst, totalTax };
  }

  // Otherwise, derive from place of supply
  if (totalTax > 0) {
    const derived = deriveTaxComponentsFromPlace(
      record?.placeOfSupply,
      totalTax,
    );
    return {
      cgst: derived.cgst,
      sgst: derived.sgst,
      igst: derived.igst,
      totalTax,
    };
  }

  return { cgst: 0, sgst: 0, igst: 0, totalTax: 0 };
};

const buildGstInputLines = ({ cgst = 0, sgst = 0, igst = 0 } = {}) => {
  const lines = [];
  if (cgst > 0) {
    lines.push({
      accountHead: "GST Input CGST",
      accountType: "Asset",
      debit: roundAmount(cgst),
      credit: 0,
    });
  }
  if (sgst > 0) {
    lines.push({
      accountHead: "GST Input SGST",
      accountType: "Asset",
      debit: roundAmount(sgst),
      credit: 0,
    });
  }
  if (igst > 0) {
    lines.push({
      accountHead: "GST Input IGST",
      accountType: "Asset",
      debit: roundAmount(igst),
      credit: 0,
    });
  }
  return lines;
};

const buildGstOutputLines = (
  { cgst = 0, sgst = 0, igst = 0 } = {},
  side = "credit",
) => {
  const line = (head, amount) => ({
    accountHead: head,
    accountType: "Liability",
    debit: side === "debit" ? roundAmount(amount) : 0,
    credit: side === "credit" ? roundAmount(amount) : 0,
  });

  const lines = [];
  if (cgst > 0) lines.push(line("GST Output CGST", cgst));
  if (sgst > 0) lines.push(line("GST Output SGST", sgst));
  if (igst > 0) lines.push(line("GST Output IGST", igst));
  return lines;
};

const balanceLines = (lines = [], preferredAccountHeads = []) => {
  if (!Array.isArray(lines) || lines.length === 0) return lines;

  const debitTotal = roundAmount(
    lines.reduce((sum, line) => sum + toNumber(line?.debit || 0), 0),
  );
  const creditTotal = roundAmount(
    lines.reduce((sum, line) => sum + toNumber(line?.credit || 0), 0),
  );
  const diff = roundAmount(debitTotal - creditTotal);

  if (Math.abs(diff) < 0.01 || Math.abs(diff) > 0.05) {
    return lines;
  }

  const sideToAdjust = diff > 0 ? "credit" : "debit";
  const adjustment = roundAmount(Math.abs(diff));
  const candidates = lines.filter(
    (line) => toNumber(line?.[sideToAdjust] || 0) > 0,
  );

  if (candidates.length === 0) return lines;

  const preferredLine = preferredAccountHeads
    .map((accountHead) =>
      candidates.find(
        (line) => String(line?.accountHead || "") === accountHead,
      ),
    )
    .find(Boolean);

  const targetLine =
    preferredLine ||
    candidates.reduce((largest, current) => {
      const currentAmount = toNumber(current?.[sideToAdjust] || 0);
      const largestAmount = toNumber(largest?.[sideToAdjust] || 0);
      return currentAmount >= largestAmount ? current : largest;
    });

  if (!targetLine) return lines;

  targetLine[sideToAdjust] = roundAmount(
    toNumber(targetLine?.[sideToAdjust] || 0) + adjustment,
  );

  return lines;
};

const pickFields = (record = {}, fields = []) => {
  const out = {};
  for (const field of fields) {
    const value = record?.[field];
    if (value !== undefined) out[field] = value;
  }
  return out;
};

const normalizeDeveloperTransactions = (rows = []) => {
  if (!Array.isArray(rows)) return [];
  return rows.map((row = {}) => ({
    payoutAmount: roundAmount(row?.payoutAmount || 0),
    payoutMethod: row?.payoutMethod || "",
    payoutSource: row?.payoutSource || "",
    payoutDate: row?.payoutDate || row?.paymentDate || "",
    staffName: row?.staffName || "",
  }));
};

const buildSourceRecordForFeatures = (sourceType, sourceRecord = {}) => {
  const type = normalizeSourceType(sourceType);
  const base = pickFields(sourceRecord, [
    "invoiceDate",
    "noteDate",
    "expenseDate",
    "date",
    "createdDate",
    "createdAt",
    "businessName",
    "partyName",
    "vendorName",
    "serviceProviderBusinessName",
    "staffName",
    "clientName",
    "gstin",
    "createdBy",
    "updatedBy",
    "deletedBy",
    "paymentMethod",
    "paymentStatus",
    "paymentSource",
    "invoiceType",
    "amount",
    "amountPaid",
    "amountReceived",
    "paidAmount",
    "receivedAmount",
    "advanceAdjustedTotal",
    "appliedAdvances",
    "financialYear",
    "fiscalYear",
    "inventoryValue",
    "stockValue",
    "closingStock",
    "inventoryAmount",
  ]);

  if (sourceRecord?.taxData && typeof sourceRecord.taxData === "object") {
    base.taxData = {
      cgst: roundAmount(toNumber(sourceRecord.taxData.cgst || 0)),
      sgst: roundAmount(toNumber(sourceRecord.taxData.sgst || 0)),
      igst: roundAmount(toNumber(sourceRecord.taxData.igst || 0)),
      taxableAmount: roundAmount(
        toNumber(
          sourceRecord.taxData.taxableAmount ||
            sourceRecord.taxData.subtotal ||
            0,
        ),
      ),
      totalAmount: roundAmount(
        toNumber(sourceRecord.taxData.totalAmount || sourceRecord.amount || 0),
      ),
      subtotal: roundAmount(toNumber(sourceRecord.taxData.subtotal || 0)),
      taxPercentage: roundAmount(
        toNumber(sourceRecord.taxData.taxPercentage || 0),
      ),
    };
  }

  if (type === "credit-debit-note") {
    Object.assign(
      base,
      pickFields(sourceRecord, [
        "noteNumber",
        "noteType",
        "status",
        "refundStatus",
        "subtotal",
        "taxAmount",
        "totalAmount",
        "refundAmount",
        "refundMethod",
      ]),
    );
  }

  if (type === "payment-receipt") {
    Object.assign(
      base,
      pickFields(sourceRecord, [
        "receiptDate",
        "paymentType",
        "adjustedAmount",
        "receiptNumber",
      ]),
    );
  }

  if (type === "payment-refund") {
    Object.assign(
      base,
      pickFields(sourceRecord, [
        "refundDate",
        "refundNumber",
        "amount",
        "refundMethod",
        "advanceReceiptNumber",
      ]),
    );
  }

  if (type === "owner-investment") {
    Object.assign(
      base,
      pickFields(sourceRecord, ["fundDate", "transferredTo", "fundNumber"]),
    );
  }

  if (type === "owner-withdrawal") {
    Object.assign(
      base,
      pickFields(sourceRecord, [
        "withdrawalDate",
        "withdrawnTo",
        "withdrawnFrom",
        "withdrawalNumber",
      ]),
    );
  }

  if (type === "project") {
    Object.assign(
      base,
      pickFields(sourceRecord, ["projectDate", "projectName", "projectId"]),
    );
    base.developerTransactions = normalizeDeveloperTransactions(
      sourceRecord?.developerTransactions,
    );
  }

  return base;
};

const getDocumentId = (sourceRecord = {}) => {
  const rawId = sourceRecord?._id;
  if (rawId instanceof ObjectId) return rawId.toString();
  return String(rawId || sourceRecord?.id || "").trim();
};

const getSourceDate = (sourceRecord = {}, sourceType = "") => {
  const type = normalizeSourceType(sourceType);
  switch (type) {
    case "invoice":
      return sourceRecord.invoiceDate || sourceRecord.createdAt;
    case "purchase":
      return sourceRecord.invoiceDate || sourceRecord.createdAt;
    case "company-expense":
      return sourceRecord.expenseDate || sourceRecord.createdAt;
    case "credit-debit-note":
      return (
        sourceRecord.noteDate ||
        sourceRecord.invoiceDate ||
        sourceRecord.createdAt
      );
    case "payment-receipt":
      return sourceRecord.receiptDate || sourceRecord.createdAt;
    case "payment-refund":
      return sourceRecord.refundDate || sourceRecord.createdAt;
    case "rcm":
      return sourceRecord.invoiceDate || sourceRecord.createdAt;
    case "owner-investment":
      return sourceRecord.fundDate || sourceRecord.createdAt;
    case "owner-withdrawal":
      return sourceRecord.withdrawalDate || sourceRecord.createdAt;
    case "project":
      return sourceRecord.projectDate || sourceRecord.createdAt;
    default:
      return sourceRecord.invoiceDate || sourceRecord.createdAt;
  }
};

const buildLinesForInvoice = (record = {}) => {
  const totalAmount = roundAmount(
    toNumber(record?.taxData?.totalAmount || record?.amount || 0),
  );
  const { cgst, sgst, igst, totalTax } = getTaxComponents(record);
  const taxableAmount = roundAmount(
    Math.max(
      pickFirstAmount(
        record?.taxData?.taxableAmount,
        record?.taxData?.subtotal,
        record?.subtotal,
      ) ?? totalAmount - totalTax,
      0,
    ),
  );
  const appliedAdvance = roundAmount(getAppliedAdvanceAmount(record));
  const explicitPaid = roundAmount(
    Math.max(
      toNumber(record?.amountReceived || 0),
      toNumber(record?.amountPaid || 0),
      toNumber(record?.paidAmount || 0),
    ),
  );

  let paidAmount = 0;
  if (explicitPaid > 0) {
    paidAmount = roundAmount(Math.max(explicitPaid - appliedAdvance, 0));
  } else if (
    String(record?.paymentStatus || "")
      .trim()
      .toLowerCase() === "paid" &&
    appliedAdvance <= 0
  ) {
    paidAmount = totalAmount;
  }

  const receivedAmount = roundAmount(Math.min(paidAmount, totalAmount));
  const outstanding = roundAmount(Math.max(totalAmount - receivedAmount, 0));

  const lines = [];

  if (receivedAmount > 0) {
    lines.push({
      accountHead: getPaymentAccountHead(record?.paymentMethod, "Bank Account"),
      accountType: "Asset",
      debit: receivedAmount,
      credit: 0,
    });
  }

  if (outstanding > 0) {
    lines.push({
      accountHead: "Sundry Debtors Account",
      accountType: "Asset",
      debit: outstanding,
      credit: 0,
    });
  }

  lines.push({
    accountHead: "Sales Account",
    accountType: "Income",
    debit: 0,
    credit: taxableAmount,
  });

  lines.push(...buildGstOutputLines({ cgst, sgst, igst }));

  return balanceLines(lines, ["Sales Account", "Sundry Debtors Account"]);
};

const buildLinesForPurchase = (record = {}) => {
  const totalAmount = roundAmount(
    toNumber(record?.taxData?.totalAmount || record?.amount || 0),
  );
  const { cgst, sgst, igst, totalTax } = getTaxComponents(record);
  const isItc = isPurchaseItcEligible(record?.invoiceType);
  const paidRaw = roundAmount(getExplicitPaidAmount(record));

  let paidAmount = 0;
  if (paidRaw > 0) {
    paidAmount = roundAmount(Math.min(paidRaw, totalAmount));
  } else if (
    String(record?.paymentStatus || "")
      .trim()
      .toLowerCase() === "paid"
  ) {
    paidAmount = totalAmount;
  }

  const outstanding = roundAmount(Math.max(totalAmount - paidAmount, 0));
  const ownerPersonal = isOwnerPersonal(record);
  const explicitTaxable = pickFirstAmount(
    record?.taxData?.taxableAmount,
    record?.taxData?.subtotal,
    record?.subtotal,
  );
  const purchaseAmount = isItc
    ? roundAmount(Math.max(explicitTaxable ?? totalAmount - totalTax, 0))
    : totalAmount;

  const lines = [
    {
      accountHead: "Purchase Account",
      accountType: "Expense",
      debit: purchaseAmount,
      credit: 0,
    },
  ];

  if (isItc) {
    lines.push(...buildGstInputLines({ cgst, sgst, igst }));
  }

  if (paidAmount > 0) {
    lines.push({
      accountHead: ownerPersonal
        ? "Owner Funding Account"
        : getPaymentAccountHead(record?.paymentMethod, "Bank Account"),
      accountType: ownerPersonal ? "Equity" : "Asset",
      debit: 0,
      credit: paidAmount,
    });
  }

  if (outstanding > 0) {
    lines.push({
      accountHead: "Sundry Creditors Account",
      accountType: "Liability",
      debit: 0,
      credit: outstanding,
    });
  }

  return balanceLines(lines, ["Purchase Account", "Sundry Creditors Account"]);
};

const buildLinesForExpense = (record = {}) => {
  const totalAmount = roundAmount(
    toNumber(record?.taxData?.totalAmount || record?.amount || 0),
  );
  const paidRaw = roundAmount(getExplicitPaidAmount(record));

  let paidAmount = 0;
  if (paidRaw > 0) {
    paidAmount = roundAmount(Math.min(paidRaw, totalAmount));
  } else if (
    String(record?.paymentStatus || "")
      .trim()
      .toLowerCase() === "paid"
  ) {
    paidAmount = totalAmount;
  }

  const outstanding = roundAmount(Math.max(totalAmount - paidAmount, 0));

  const lines = [
    {
      accountHead: "Company Expense Account",
      accountType: "Expense",
      debit: totalAmount,
      credit: 0,
    },
  ];

  if (paidAmount > 0) {
    lines.push({
      accountHead: getPaymentAccountHead(record?.paymentMethod, "Bank Account"),
      accountType: "Asset",
      debit: 0,
      credit: paidAmount,
    });
  }

  if (outstanding > 0) {
    lines.push({
      accountHead: "Sundry Creditors Account",
      accountType: "Liability",
      debit: 0,
      credit: outstanding,
    });
  }

  return balanceLines(lines, [
    "Company Expense Account",
    "Sundry Creditors Account",
  ]);
};

const buildLinesForReceipt = (record = {}) => {
  const totalAmount = roundAmount(toNumber(record?.amount || 0));
  const adjustedAmount = roundAmount(toNumber(record?.adjustedAmount || 0));
  const isAdvance =
    String(record?.paymentType || "")
      .trim()
      .toLowerCase() === "advance";

  if (!isAdvance || totalAmount <= 0) {
    return [];
  }

  const unappliedAdvance = roundAmount(
    Math.max(totalAmount - adjustedAmount, 0),
  );
  const debtorSettlement = roundAmount(
    Math.max(totalAmount - unappliedAdvance, 0),
  );

  const lines = [
    {
      accountHead: getPaymentAccountHead(record?.paymentMethod, "Cash Account"),
      accountType: "Asset",
      debit: totalAmount,
      credit: 0,
    },
  ];

  if (debtorSettlement > 0) {
    lines.push({
      accountHead: "Sundry Debtors Account",
      accountType: "Asset",
      debit: 0,
      credit: debtorSettlement,
    });
  }

  if (unappliedAdvance > 0) {
    lines.push({
      accountHead: "Advance from Customer",
      accountType: "Liability",
      debit: 0,
      credit: unappliedAdvance,
    });
  }

  return balanceLines(lines, [
    "Advance from Customer",
    "Sundry Debtors Account",
  ]);
};

const buildLinesForPaymentRefund = (record = {}) => {
  const refundAmount = roundAmount(toNumber(record?.amount || 0));
  if (refundAmount <= 0) return [];

  const paymentAccount = getPaymentAccountHead(
    record?.refundMethod || record?.paymentMethod,
    "Bank Account",
  );

  return balanceLines(
    [
      {
        accountHead: "Advance from Customer",
        accountType: "Liability",
        debit: refundAmount,
        credit: 0,
      },
      {
        accountHead: paymentAccount,
        accountType: "Asset",
        debit: 0,
        credit: refundAmount,
      },
    ],
    ["Advance from Customer"],
  );
};

const buildLinesForCreditDebitNote = (record = {}) => {
  const taxableAmount = roundAmount(
    toNumber(
      pickFirstAmount(
        record?.taxData?.taxableAmount,
        record?.taxData?.subtotal,
        record?.subtotal,
        record?.amount,
      ) ?? 0,
    ),
  );
  const { cgst, sgst, igst, totalTax } = ensureTaxComponents(record);
  const fallbackTax = roundAmount(toNumber(record?.taxAmount || 0));
  const taxAmount = totalTax > 0 ? totalTax : fallbackTax;
  const totalAmount = roundAmount(
    toNumber(record?.totalAmount || taxableAmount + taxAmount),
  );
  const noteType = inferCreditDebitNoteType(record);
  const isCreditNote = noteType === "Credit Note";
  const normalizedStatus = String(
    record?.refundStatus || record?.paymentStatus || record?.status || "",
  )
    .trim()
    .toLowerCase();

  // Separate paid-amount by note type to prevent cross-contamination:
  // Credit Note uses refundAmount; Debit Note uses receivedAmount.
  let paidAmount;
  if (isCreditNote) {
    paidAmount = roundAmount(
      Math.max(
        toNumber(record?.refundAmount || 0),
        toNumber(record?.amountPaid || 0),
        toNumber(record?.paidAmount || 0),
      ),
    );
  } else {
    paidAmount = roundAmount(
      Math.max(
        toNumber(record?.receivedAmount || 0),
        toNumber(record?.amountReceived || 0),
        toNumber(record?.amountPaid || 0),
        toNumber(record?.paidAmount || 0),
      ),
    );
  }

  if (paidAmount <= 0) {
    if (
      isCreditNote &&
      ["full refund", "refunded", "paid", "settled", "applied"].includes(
        normalizedStatus,
      )
    ) {
      paidAmount = totalAmount;
    } else if (!isCreditNote && normalizedStatus === "paid") {
      paidAmount = totalAmount;
    }
  }

  paidAmount = roundAmount(Math.min(Math.max(paidAmount, 0), totalAmount));
  const paymentAccount = getPaymentAccountHead(
    record?.refundMethod || record?.paymentMethod,
    "Bank Account",
  );

  if (isCreditNote) {
    const payableOutstanding = roundAmount(
      Math.max(totalAmount - paidAmount, 0),
    );
    const lines = [
      {
        accountHead: "Sales Return / Adjustment Account",
        accountType: "Income",
        debit: taxableAmount,
        credit: 0,
      },
    ];

    if (taxAmount > 0) {
      lines.push(...buildGstOutputLines({ cgst, sgst, igst }, "debit"));
    }

    if (paidAmount > 0) {
      lines.push({
        accountHead: paymentAccount,
        accountType: "Asset",
        debit: 0,
        credit: paidAmount,
      });
    }

    if (payableOutstanding > 0) {
      lines.push({
        accountHead: "Credit Note Payable",
        accountType: "Liability",
        debit: 0,
        credit: payableOutstanding,
      });
    }

    return balanceLines(lines, [
      "Sales Return / Adjustment Account",
      "Credit Note Payable",
    ]);
  }

  const receivedAmount = roundAmount(Math.min(paidAmount, totalAmount));
  const outstanding = roundAmount(Math.max(totalAmount - receivedAmount, 0));

  const lines = [];

  if (receivedAmount > 0) {
    lines.push({
      accountHead: paymentAccount,
      accountType: "Asset",
      debit: receivedAmount,
      credit: 0,
    });
  }

  if (outstanding > 0) {
    lines.push({
      accountHead: "Sundry Debtors Account",
      accountType: "Asset",
      debit: outstanding,
      credit: 0,
    });
  }

  lines.push({
    accountHead: "Sales Account",
    accountType: "Income",
    debit: 0,
    credit: taxableAmount,
  });

  if (taxAmount > 0) {
    lines.push(...buildGstOutputLines({ cgst, sgst, igst }));
  }

  return balanceLines(lines, ["Sales Account", "Sundry Debtors Account"]);
};

const buildLinesForRcm = (record = {}) => {
  const taxableAmount = roundAmount(
    Math.max(
      pickFirstAmount(
        record?.taxData?.taxableAmount,
        record?.taxData?.subtotal,
        record?.subtotal,
        record?.amount,
      ) ??
        pickFirstAmount(
          record?.taxData?.totalAmount,
          record?.totalAmount,
          record?.amount,
        ) ??
        0,
      0,
    ),
  );

  let { cgst, sgst, igst, totalTax } = getTaxComponents(record);
  const explicitTotalWithTax = roundAmount(
    Math.max(
      pickFirstAmount(record?.taxData?.totalAmount, record?.totalAmount) ??
        taxableAmount + totalTax,
      0,
    ),
  );

  if (totalTax <= 0 && explicitTotalWithTax > taxableAmount) {
    totalTax = roundAmount(explicitTotalWithTax - taxableAmount);
  }

  if (cgst + sgst + igst <= 0 && totalTax > 0) {
    igst = totalTax;
  }

  if (totalTax === 0 && explicitTotalWithTax > 0 && taxableAmount > 0) {
    const gstRate = 0.18;
    totalTax = roundAmount(taxableAmount * gstRate);
    cgst = roundAmount(totalTax / 2);
    sgst = roundAmount(totalTax / 2);
    igst = 0;
  }

  const vendorPayableAmount = taxableAmount;

  let paidRaw = roundAmount(getExplicitPaidAmount(record));
  let paidAmount = 0;

  if (paidRaw > 0) {
    paidAmount = roundAmount(Math.min(paidRaw, vendorPayableAmount));
  } else if (
    String(record?.paymentStatus || "")
      .trim()
      .toLowerCase() === "paid"
  ) {
    paidAmount = vendorPayableAmount;
  }

  const outstanding = roundAmount(
    Math.max(vendorPayableAmount - paidAmount, 0),
  );
  const ownerPersonal = isOwnerPersonal(record);

  const lines = [
    {
      accountHead: "Purchase Account",
      accountType: "Expense",
      debit: taxableAmount,
      credit: 0,
    },
  ];

  // Add GST Input lines (ITC eligible)
  if (cgst > 0) {
    lines.push({
      accountHead: "GST Input CGST",
      accountType: "Asset",
      debit: cgst,
      credit: 0,
    });
  }
  if (sgst > 0) {
    lines.push({
      accountHead: "GST Input SGST",
      accountType: "Asset",
      debit: sgst,
      credit: 0,
    });
  }
  if (igst > 0) {
    lines.push({
      accountHead: "GST Input IGST",
      accountType: "Asset",
      debit: igst,
      credit: 0,
    });
  }

  // Add GST Output lines (RCM liability)
  if (cgst > 0) {
    lines.push({
      accountHead: "GST Output CGST",
      accountType: "Liability",
      debit: 0,
      credit: cgst,
    });
  }
  if (sgst > 0) {
    lines.push({
      accountHead: "GST Output SGST",
      accountType: "Liability",
      debit: 0,
      credit: sgst,
    });
  }
  if (igst > 0) {
    lines.push({
      accountHead: "GST Output IGST",
      accountType: "Liability",
      debit: 0,
      credit: igst,
    });
  }

  // Add payment line (total amount including GST)
  if (paidAmount > 0) {
    lines.push({
      accountHead: ownerPersonal
        ? "Owner Funding Account"
        : getPaymentAccountHead(record?.paymentMethod, "Bank Account"),
      accountType: ownerPersonal ? "Equity" : "Asset",
      debit: 0,
      credit: paidAmount,
    });
  }

  // Add outstanding creditor line
  if (outstanding > 0) {
    lines.push({
      accountHead: "Sundry Creditors Account",
      accountType: "Liability",
      debit: 0,
      credit: outstanding,
    });
  }

  return balanceLines(lines, ["Purchase Account", "Sundry Creditors Account"]);
};

const buildLinesForOwnerInvestment = (record = {}) => {
  const amount = roundAmount(
    toNumber(record?.amount || record?.investmentAmount || 0),
  );
  const receivedAmount = roundAmount(
    toNumber(record?.amountReceived || amount || 0),
  );
  const accountHead = getPaymentAccountHead(
    record?.transferredTo || record?.paymentMethod,
    "Bank Account",
  );

  return balanceLines([
    {
      accountHead,
      accountType: "Asset",
      debit: receivedAmount,
      credit: 0,
    },
    {
      accountHead: "Owner Investment Account",
      accountType: "Equity",
      debit: 0,
      credit: receivedAmount,
    },
  ]);
};

const buildLinesForOwnerWithdrawal = (record = {}) => {
  const amount = roundAmount(
    toNumber(record?.amount || record?.withdrawalAmount || 0),
  );
  const paidAmount = roundAmount(
    toNumber(record?.amountPaid || amount || 0),
  );
  const accountHead = getPaymentAccountHead(
    record?.withdrawnFrom || record?.paymentMethod,
    "Bank Account",
  );

  // Owner Withdrawal: Debit Owner Withdrawal Account, Credit Asset (Bank/Cash)
  // Money going OUT of business to owner
  return balanceLines([
    {
      accountHead: "Owner Withdrawal Account",
      accountType: "Equity",
      debit: paidAmount,
      credit: 0,
    },
    {
      accountHead,
      accountType: "Asset",
      debit: 0,
      credit: paidAmount,
    },
  ]);
};

const buildLinesForProject = (record = {}) => {
  const transactions = Array.isArray(record?.developerTransactions)
    ? record.developerTransactions
    : [];
  const paymentBuckets = transactions.reduce((accumulator, tx) => {
    const amount = roundAmount(toNumber(tx?.payoutAmount || 0));
    if (amount <= 0) return accumulator;

    const ownerPersonal = isOwnerPersonal(record, tx?.payoutSource);
    const accountHead = ownerPersonal
      ? "Owner Funding Account"
      : getPaymentAccountHead(
          tx?.payoutMethod || record?.payoutMethod,
          "Bank Account",
        );
    const accountType = ownerPersonal ? "Equity" : "Asset";
    const key = `${accountHead}:${accountType}`;

    accumulator[key] = accumulator[key] || {
      accountHead,
      accountType,
      amount: 0,
    };
    accumulator[key].amount = roundAmount(accumulator[key].amount + amount);
    return accumulator;
  }, {});

  const totalAmount = roundAmount(
    Object.values(paymentBuckets).reduce((sum, row) => sum + row.amount, 0),
  );

  return balanceLines(
    [
      {
        accountHead: "Project Cost Account",
        accountType: "Expense",
        debit: totalAmount,
        credit: 0,
      },
      ...Object.values(paymentBuckets).map((row) => ({
        accountHead: row.accountHead,
        accountType: row.accountType,
        debit: 0,
        credit: row.amount,
      })),
    ],
    ["Project Cost Account"],
  );
};

const buildLines = (sourceType, sourceRecord) => {
  const normalizedType = normalizeSourceType(sourceType);

  switch (normalizedType) {
    case "invoice":
      return buildLinesForInvoice(sourceRecord);
    case "purchase":
      return buildLinesForPurchase(sourceRecord);
    case "company-expense":
      return buildLinesForExpense(sourceRecord);
    case "payment-receipt":
      return buildLinesForReceipt(sourceRecord);
    case "payment-refund":
      return buildLinesForPaymentRefund(sourceRecord);
    case "credit-debit-note":
      return buildLinesForCreditDebitNote(sourceRecord);
    case "rcm":
      return buildLinesForRcm(sourceRecord);
    case "owner-investment":
      return buildLinesForOwnerInvestment(sourceRecord);
    case "owner-withdrawal":
      return buildLinesForOwnerWithdrawal(sourceRecord);
    case "project":
      return buildLinesForProject(sourceRecord);
    default:
      return [];
  }
};

const getRecordAmount = (sourceType, sourceRecord) => {
  const normalizedType = normalizeSourceType(sourceType);

  switch (normalizedType) {
    case "invoice":
    case "purchase":
    case "company-expense":
      return roundAmount(
        toNumber(
          sourceRecord?.taxData?.totalAmount || sourceRecord?.amount || 0,
        ),
      );
    case "rcm":
      return roundAmount(
        toNumber(
          pickFirstAmount(
            sourceRecord?.taxData?.taxableAmount,
            sourceRecord?.taxData?.subtotal,
            sourceRecord?.subtotal,
            sourceRecord?.amount,
            sourceRecord?.taxData?.totalAmount,
            sourceRecord?.totalAmount,
          ) ?? 0,
        ),
      );
    case "payment-receipt":
      return roundAmount(toNumber(sourceRecord?.amount || 0));
    case "payment-refund":
      return roundAmount(toNumber(sourceRecord?.amount || 0));
    case "credit-debit-note":
      return roundAmount(
        toNumber(sourceRecord?.totalAmount || sourceRecord?.amount || 0),
      );
    case "owner-investment":
      return roundAmount(
        toNumber(sourceRecord?.amount || sourceRecord?.investmentAmount || 0),
      );
    case "owner-withdrawal":
      return roundAmount(
        toNumber(sourceRecord?.amount || sourceRecord?.withdrawalAmount || 0),
      );
    case "project":
      return Array.isArray(sourceRecord?.developerTransactions)
        ? roundAmount(
            sourceRecord.developerTransactions.reduce(
              (sum, tx) => sum + toNumber(tx?.payoutAmount || 0),
              0,
            ),
          )
        : 0;
    default:
      return roundAmount(toNumber(sourceRecord?.amount || 0));
  }
};

export const buildTransactionSnapshot = ({
  sourceType,
  sourceCollection,
  sourceRecord,
  operation = "upsert",
  sourceLabel = "",
}) => {
  const sourceId = getDocumentId(sourceRecord);
  const normalizedType = normalizeSourceType(sourceType);
  const sourceDate = getDateOnlyString(
    getSourceDate(sourceRecord, normalizedType),
  );
  const financialYear =
    sourceRecord?.financialYear ||
    sourceRecord?.fiscalYear ||
    getFinancialYear(sourceDate);
  const lines = buildLines(normalizedType, sourceRecord);

  const debitTotal = roundAmount(
    lines.reduce((sum, line) => sum + toNumber(line?.debit || 0), 0),
  );
  const creditTotal = roundAmount(
    lines.reduce((sum, line) => sum + toNumber(line?.credit || 0), 0),
  );
  const amount = getRecordAmount(normalizedType, sourceRecord);
  const sourceKey = `${sourceCollection}:${sourceId}`;
  const sourceRecordForFeatures = buildSourceRecordForFeatures(
    normalizedType,
    sourceRecord,
  );

  const _taxCgst = roundAmount(
    toNumber(sourceRecord?.taxData?.cgst ?? sourceRecord?.cgst ?? 0),
  );
  const _taxSgst = roundAmount(
    toNumber(sourceRecord?.taxData?.sgst ?? sourceRecord?.sgst ?? 0),
  );
  const _taxIgst = roundAmount(
    toNumber(sourceRecord?.taxData?.igst ?? sourceRecord?.igst ?? 0),
  );
  const _explicitTax = _taxCgst + _taxSgst + _taxIgst;
  const _totalTax = roundAmount(
    _explicitTax > 0
      ? _explicitTax
      : toNumber(
          sourceRecord?.taxData?.totalTax ?? sourceRecord?.taxAmount ?? 0,
        ),
  );

  // Derive CGST/SGST vs IGST split when only totalTax is available
  let derivedCgst = _taxCgst;
  let derivedSgst = _taxSgst;
  let derivedIgst = _taxIgst;
  if (_explicitTax === 0 && _totalTax > 0) {
    const placeOfSupply = String(
      sourceRecord?.placeOfSupply ||
        sourceRecord?.supplyState ||
        sourceRecord?.state ||
        "",
    ).toLowerCase();
    const isRajasthan = placeOfSupply.includes("rajasthan");
    if (isRajasthan) {
      derivedCgst = roundAmount(_totalTax / 2);
      derivedSgst = roundAmount(_totalTax / 2);
    } else {
      derivedIgst = _totalTax;
    }
  }

  const taxData = {
    cgst: derivedCgst,
    sgst: derivedSgst,
    igst: derivedIgst,
    totalTax: _totalTax,
  };

  const inventoryValue = roundAmount(
    sourceRecord?.inventoryValue ||
      sourceRecord?.stockValue ||
      sourceRecord?.closingStock ||
      sourceRecord?.inventoryAmount ||
      0,
  );

  return {
    sourceKey,
    sourceCollection,
    sourceType: normalizedType,
    sourceId,
    sourceLabel:
      sourceLabel ||
      sourceRecord?.invoiceNumber ||
      sourceRecord?.receiptNumber ||
      sourceRecord?.expenseNumber ||
      sourceRecord?.selfInvoiceNumber ||
      sourceRecord?.projectId ||
      sourceRecord?.fundNumber ||
      "",
    transactionDate: sourceDate || getDateOnlyString(new Date()),
    financialYear,
    amount: roundAmount(amount),
    debitTotal: debitTotal,
    creditTotal: creditTotal,
    balanced: Math.abs(debitTotal - creditTotal) < 0.01,
    lines,
    sourceRecord: sourceRecordForFeatures,
    partyName:
      sourceRecord?.businessName ||
      sourceRecord?.partyName ||
      sourceRecord?.vendorName ||
      sourceRecord?.serviceProviderBusinessName ||
      sourceRecord?.staffName ||
      sourceRecord?.clientName ||
      "",
    createdBy:
      String(sourceRecord?.createdBy || "").trim() ||
      String(sourceRecord?.updatedBy || "").trim() ||
      "",
    paymentMethod: normalizePaymentMethod(
      sourceRecord?.paymentMethod ||
        sourceRecord?.refundMethod ||
        sourceRecord?.payoutMethod ||
        sourceRecord?.transferredTo,
    ),
    taxData,
    inventoryValue,
    operation,
    isDeleted: false,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
};

export const syncTransactionSnapshot = async ({
  db,
  sourceCollection,
  sourceType,
  sourceRecord,
  sourceLabel = "",
  deleted = false,
}) => {
  const transactionsCollection = db.collection("transactions");
  const sourceId = getDocumentId(sourceRecord);
  if (!sourceId) return null;

  const sourceKey = `${sourceCollection}:${sourceId}`;

  if (deleted) {
    // Soft delete: mark existing active record(s) as deleted
    await transactionsCollection.updateMany(
      { sourceKey, isDeleted: { $ne: true } },
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date(),
          updatedAt: new Date(),
        },
      },
    );
    return null;
  }

  const snapshot = buildTransactionSnapshot({
    sourceType,
    sourceCollection,
    sourceRecord,
    sourceLabel,
    operation: "upsert",
  });

  // Exclude createdAt from $set so it is only written on insert, not overwritten on update
  const { createdAt, isDeleted, deletedAt, ...updateFields } = snapshot;

  const result = await transactionsCollection.updateOne(
    { sourceKey, isDeleted: { $ne: true } },
    {
      $set: { ...updateFields, updatedAt: new Date() },
      $setOnInsert: {
        createdAt: new Date(),
        isDeleted: false,
        deletedAt: null,
      },
    },
    { upsert: true },
  );

  return result.upsertedId ?? (result.modifiedCount > 0 ? sourceKey : null);
};

export const parseTransactionLine = (line = {}) => ({
  accountHead: String(line?.accountHead || "").trim(),
  accountType: String(line?.accountType || "").trim(),
  debit: roundAmount(toNumber(line?.debit || 0)),
  credit: roundAmount(toNumber(line?.credit || 0)),
});

export const normalizeTransactionSnapshot = (transaction = {}) => {
  if (!transaction || typeof transaction !== "object") return transaction;

  const normalizedLines = Array.isArray(transaction.lines)
    ? transaction.lines.map(parseTransactionLine)
    : [];
  const normalizedSourceType = normalizeSourceType(
    transaction.sourceType || "",
  );
  const normalizedSourceRecord =
    transaction?.sourceRecord && typeof transaction.sourceRecord === "object"
      ? transaction.sourceRecord
      : {};

  const canRebuildFromSource =
    normalizedSourceType === "credit-debit-note" &&
    Object.keys(normalizedSourceRecord).length > 0;

  const rebuiltLines = canRebuildFromSource
    ? buildLines(normalizedSourceType, normalizedSourceRecord).map(
        parseTransactionLine,
      )
    : normalizedLines;

  const effectiveLines = rebuiltLines;
  const effectiveDebitTotal = roundAmount(
    effectiveLines.reduce((sum, line) => sum + toNumber(line?.debit || 0), 0),
  );
  const effectiveCreditTotal = roundAmount(
    effectiveLines.reduce((sum, line) => sum + toNumber(line?.credit || 0), 0),
  );

  return {
    ...transaction,
    sourceKey: String(transaction.sourceKey || "").trim(),
    sourceCollection: String(transaction.sourceCollection || "").trim(),
    sourceType: normalizedSourceType,
    sourceId: String(transaction.sourceId || "").trim(),
    sourceLabel: String(transaction.sourceLabel || "").trim(),
    transactionDate: getDateOnlyString(transaction.transactionDate),
    financialYear: String(transaction.financialYear || "").trim(),
    paymentMethod: normalizePaymentMethod(transaction.paymentMethod),
    amount: canRebuildFromSource
      ? getRecordAmount(normalizedSourceType, normalizedSourceRecord)
      : roundAmount(transaction.amount || 0),
    debitTotal: canRebuildFromSource
      ? effectiveDebitTotal
      : roundAmount(transaction.debitTotal || 0),
    creditTotal: canRebuildFromSource
      ? effectiveCreditTotal
      : roundAmount(transaction.creditTotal || 0),
    balanced: canRebuildFromSource
      ? Math.abs(effectiveDebitTotal - effectiveCreditTotal) < 0.01
      : Boolean(transaction.balanced),
    lines: effectiveLines,
    sourceRecord: normalizedSourceRecord,
    inventoryValue: roundAmount(transaction.inventoryValue || 0),
    isDeleted: transaction.isDeleted === true,
  };
};
