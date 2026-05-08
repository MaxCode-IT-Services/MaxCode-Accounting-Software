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
    case "owner-investment":
      return "owner-investment";
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

const getPaymentAccountHead = (paymentMethod, fallback = "Bank Account") =>
  isCashLike(paymentMethod) ? "Cash Account" : fallback;

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
    };
  }

  if (type === "credit-debit-note") {
    Object.assign(
      base,
      pickFields(sourceRecord, [
        "noteType",
        "status",
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

  if (type === "owner-investment") {
    Object.assign(
      base,
      pickFields(sourceRecord, ["fundDate", "transferredTo", "fundNumber"]),
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
    case "rcm":
      return sourceRecord.invoiceDate || sourceRecord.createdAt;
    case "owner-investment":
      return sourceRecord.fundDate || sourceRecord.createdAt;
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

  return lines;
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

  return lines;
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

  return lines;
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

  return lines;
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
  const { cgst, sgst, igst, totalTax } = getTaxComponents(record);
  const fallbackTax = roundAmount(toNumber(record?.taxAmount || 0));
  const taxAmount = totalTax > 0 ? totalTax : fallbackTax;
  const totalAmount = roundAmount(
    toNumber(record?.totalAmount || taxableAmount + taxAmount),
  );
  const isCreditNote =
    String(record?.noteType || "")
      .trim()
      .toLowerCase() === "credit note";
  const paidAmount = roundAmount(
    Math.max(
      toNumber(record?.refundAmount || 0),
      toNumber(record?.receivedAmount || 0),
    ),
  );
  const paymentAccount = getPaymentAccountHead(
    record?.refundMethod || record?.paymentMethod,
    "Cash Account",
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

    return lines;
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

  return lines;
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

  return lines;
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

  return [
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
  ];
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

  return [
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
  ];
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
    case "credit-debit-note":
      return buildLinesForCreditDebitNote(sourceRecord);
    case "rcm":
      return buildLinesForRcm(sourceRecord);
    case "owner-investment":
      return buildLinesForOwnerInvestment(sourceRecord);
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
    case "credit-debit-note":
      return roundAmount(
        toNumber(sourceRecord?.totalAmount || sourceRecord?.amount || 0),
      );
    case "owner-investment":
      return roundAmount(
        toNumber(sourceRecord?.amount || sourceRecord?.investmentAmount || 0),
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

  const taxData = {
    cgst: roundAmount(
      toNumber(sourceRecord?.taxData?.cgst || sourceRecord?.cgst || 0),
    ),
    sgst: roundAmount(
      toNumber(sourceRecord?.taxData?.sgst || sourceRecord?.sgst || 0),
    ),
    igst: roundAmount(
      toNumber(sourceRecord?.taxData?.igst || sourceRecord?.igst || 0),
    ),
    totalTax: roundAmount(
      toNumber(
        sourceRecord?.taxData?.totalTax ||
          sourceRecord?.taxAmount ||
          roundAmount(
            toNumber(sourceRecord?.taxData?.cgst || sourceRecord?.cgst || 0),
          ) +
            roundAmount(
              toNumber(sourceRecord?.taxData?.sgst || sourceRecord?.sgst || 0),
            ) +
            roundAmount(
              toNumber(sourceRecord?.taxData?.igst || sourceRecord?.igst || 0),
            ),
      ),
    ),
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

  if (deleted) {
    return null;
  }

  const snapshot = buildTransactionSnapshot({
    sourceType,
    sourceCollection,
    sourceRecord,
    sourceLabel,
    operation: "upsert",
  });

  const result = await transactionsCollection.insertOne(snapshot);
  return result.insertedId;
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

  return {
    ...transaction,
    sourceKey: String(transaction.sourceKey || "").trim(),
    sourceCollection: String(transaction.sourceCollection || "").trim(),
    sourceType: normalizeSourceType(transaction.sourceType || ""),
    sourceId: String(transaction.sourceId || "").trim(),
    sourceLabel: String(transaction.sourceLabel || "").trim(),
    transactionDate: getDateOnlyString(transaction.transactionDate),
    financialYear: String(transaction.financialYear || "").trim(),
    paymentMethod: normalizePaymentMethod(transaction.paymentMethod),
    amount: roundAmount(transaction.amount || 0),
    debitTotal: roundAmount(transaction.debitTotal || 0),
    creditTotal: roundAmount(transaction.creditTotal || 0),
    balanced: Boolean(transaction.balanced),
    lines: normalizedLines,
    sourceRecord:
      transaction?.sourceRecord && typeof transaction.sourceRecord === "object"
        ? transaction.sourceRecord
        : {},
    inventoryValue: roundAmount(transaction.inventoryValue || 0),
    isDeleted: transaction.isDeleted === true,
  };
};
