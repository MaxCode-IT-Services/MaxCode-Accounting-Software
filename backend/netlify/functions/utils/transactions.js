import { ObjectId } from "mongodb";

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
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

const normalizePaymentMethod = (value) => {
  return String(value || "").trim();
};

const getDocumentId = (sourceRecord = {}) => {
  const rawId = sourceRecord?._id;
  if (rawId instanceof ObjectId) return rawId.toString();
  return String(rawId || sourceRecord?.id || "").trim();
};

const getSourceDate = (sourceRecord = {}, sourceType = "") => {
  switch (sourceType) {
    case "invoice":
    case "sales":
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
  const totalAmount = toNumber(
    record?.taxData?.totalAmount || record?.amount || 0,
  );
  const taxCgst = toNumber(record?.taxData?.cgst || 0);
  const taxSgst = toNumber(record?.taxData?.sgst || 0);
  const taxIgst = toNumber(record?.taxData?.igst || 0);
  const taxTotal = taxCgst + taxSgst + taxIgst;
  const receivedAmount = Math.max(
    toNumber(record.amountReceived || 0),
    toNumber(record.amountPaid || 0),
  );
  const remainingAmount = Math.max(totalAmount - receivedAmount, 0);
  const debitAmount = receivedAmount > 0 ? receivedAmount : totalAmount;

  return [
    {
      accountHead:
        receivedAmount > 0
          ? normalizePaymentMethod(record.paymentMethod) || "Receivables"
          : "Sundry Debtors Account",
      accountType: "Asset",
      debit: Number(debitAmount.toFixed(2)),
      credit: 0,
    },
    {
      accountHead: "Sales Account",
      accountType: "Income",
      debit: 0,
      credit: Number((totalAmount - taxTotal).toFixed(2)),
    },
    ...(taxCgst > 0
      ? [
          {
            accountHead: "GST Output CGST",
            accountType: "Liability",
            debit: 0,
            credit: Number(taxCgst.toFixed(2)),
          },
        ]
      : []),
    ...(taxSgst > 0
      ? [
          {
            accountHead: "GST Output SGST",
            accountType: "Liability",
            debit: 0,
            credit: Number(taxSgst.toFixed(2)),
          },
        ]
      : []),
    ...(taxIgst > 0
      ? [
          {
            accountHead: "GST Output IGST",
            accountType: "Liability",
            debit: 0,
            credit: Number(taxIgst.toFixed(2)),
          },
        ]
      : []),
    ...(remainingAmount > 0
      ? [
          {
            accountHead: "Sundry Debtors Account",
            accountType: "Asset",
            debit: Number(remainingAmount.toFixed(2)),
            credit: 0,
          },
        ]
      : []),
  ];
};

const buildLinesForPurchase = (record = {}) => {
  const totalAmount = toNumber(
    record?.taxData?.totalAmount || record?.amount || 0,
  );
  const taxCgst = toNumber(record?.taxData?.cgst || 0);
  const taxSgst = toNumber(record?.taxData?.sgst || 0);
  const taxIgst = toNumber(record?.taxData?.igst || 0);
  const taxTotal = taxCgst + taxSgst + taxIgst;
  const paidAmount = Math.max(
    toNumber(record.amountPaid || 0),
    toNumber(record.paidAmount || 0),
  );
  const creditAmount = Math.max(totalAmount - paidAmount, 0);

  return [
    {
      accountHead: "Purchase Account",
      accountType: "Expense",
      debit: Number((totalAmount - taxTotal).toFixed(2)),
      credit: 0,
    },
    ...(taxCgst > 0
      ? [
          {
            accountHead: "GST Input CGST",
            accountType: "Asset",
            debit: Number(taxCgst.toFixed(2)),
            credit: 0,
          },
        ]
      : []),
    ...(taxSgst > 0
      ? [
          {
            accountHead: "GST Input SGST",
            accountType: "Asset",
            debit: Number(taxSgst.toFixed(2)),
            credit: 0,
          },
        ]
      : []),
    ...(taxIgst > 0
      ? [
          {
            accountHead: "GST Input IGST",
            accountType: "Asset",
            debit: Number(taxIgst.toFixed(2)),
            credit: 0,
          },
        ]
      : []),
    {
      accountHead: "Sundry Creditors Account",
      accountType: "Liability",
      debit: 0,
      credit: Number(creditAmount.toFixed(2)),
    },
  ];
};

const buildLinesForExpense = (record = {}) => {
  const totalAmount = toNumber(
    record?.taxData?.totalAmount || record?.amount || 0,
  );
  const taxCgst = toNumber(record?.taxData?.cgst || 0);
  const taxSgst = toNumber(record?.taxData?.sgst || 0);
  const taxIgst = toNumber(record?.taxData?.igst || 0);
  const taxTotal = taxCgst + taxSgst + taxIgst;
  const paidAmount = Math.max(
    toNumber(record.amountReceived || 0),
    toNumber(record.amountPaid || 0),
  );
  const creditAmount = Math.max(totalAmount - paidAmount, 0);

  return [
    {
      accountHead: record?.expenseHead || "Company Expense",
      accountType: "Expense",
      debit: Number((totalAmount - taxTotal).toFixed(2)),
      credit: 0,
    },
    ...(taxCgst > 0
      ? [
          {
            accountHead: "GST Input CGST",
            accountType: "Asset",
            debit: Number(taxCgst.toFixed(2)),
            credit: 0,
          },
        ]
      : []),
    ...(taxSgst > 0
      ? [
          {
            accountHead: "GST Input SGST",
            accountType: "Asset",
            debit: Number(taxSgst.toFixed(2)),
            credit: 0,
          },
        ]
      : []),
    ...(taxIgst > 0
      ? [
          {
            accountHead: "GST Input IGST",
            accountType: "Asset",
            debit: Number(taxIgst.toFixed(2)),
            credit: 0,
          },
        ]
      : []),
    {
      accountHead: "Sundry Creditors Account",
      accountType: "Liability",
      debit: 0,
      credit: Number(creditAmount.toFixed(2)),
    },
  ];
};

const buildLinesForReceipt = (record = {}) => {
  const totalAmount = toNumber(record?.amount || 0);
  const appliedAmount = toNumber(record?.adjustedAmount || 0);
  const advanceAmount =
    String(record?.paymentType || "").toLowerCase() === "advance"
      ? totalAmount
      : 0;
  const creditAmount = Math.max(totalAmount - (appliedAmount || 0), 0);

  return [
    {
      accountHead:
        normalizePaymentMethod(record?.paymentMethod) || "Cash Account",
      accountType: "Asset",
      debit: Number(totalAmount.toFixed(2)),
      credit: 0,
    },
    {
      accountHead:
        advanceAmount > 0 ? "Advance from Customer" : "Sundry Debtors Account",
      accountType: "Liability",
      debit: 0,
      credit: Number(
        (advanceAmount > 0 ? totalAmount : creditAmount).toFixed(2),
      ),
    },
  ];
};

const buildLinesForCreditDebitNote = (record = {}) => {
  const totalAmount = toNumber(record?.totalAmount || record?.amount || 0);
  const taxAmount = toNumber(record?.taxAmount || 0);
  const noteType = String(record?.noteType || "").toLowerCase();
  const refundAmount = toNumber(record?.refundAmount || 0);
  const receivedAmount = toNumber(record?.receivedAmount || 0);
  const paymentAmount = Math.max(refundAmount || receivedAmount, 0);

  if (noteType.includes("credit")) {
    return [
      {
        accountHead: "Sales Return / Adjustment",
        accountType: "Income",
        debit: Number((totalAmount - taxAmount).toFixed(2)),
        credit: 0,
      },
      ...(taxAmount > 0
        ? [
            {
              accountHead: "GST Output Adjustment",
              accountType: "Liability",
              debit: Number(taxAmount.toFixed(2)),
              credit: 0,
            },
          ]
        : []),
      {
        accountHead:
          normalizePaymentMethod(record?.refundMethod) || "Cash Account",
        accountType: "Asset",
        debit: 0,
        credit: Number(paymentAmount.toFixed(2)),
      },
    ];
  }

  return [
    {
      accountHead: "Sundry Debtors Account",
      accountType: "Asset",
      debit: Number(totalAmount.toFixed(2)),
      credit: 0,
    },
    {
      accountHead: "Purchase Return / Adjustment",
      accountType: "Expense",
      debit: 0,
      credit: Number((totalAmount - taxAmount).toFixed(2)),
    },
    ...(taxAmount > 0
      ? [
          {
            accountHead: "GST Output Adjustment",
            accountType: "Liability",
            debit: 0,
            credit: Number(taxAmount.toFixed(2)),
          },
        ]
      : []),
  ];
};

const buildLinesForRcm = (record = {}) => {
  const totalAmount = toNumber(
    record?.taxData?.totalAmount || record?.amount || 0,
  );
  const taxCgst = toNumber(record?.taxData?.cgst || 0);
  const taxSgst = toNumber(record?.taxData?.sgst || 0);
  const taxIgst = toNumber(record?.taxData?.igst || 0);
  const taxTotal = taxCgst + taxSgst + taxIgst;
  const paidAmount = Math.max(
    toNumber(record.amountPaid || 0),
    toNumber(record.paidAmount || 0),
  );
  const creditAmount = Math.max(totalAmount - paidAmount, 0);

  return [
    {
      accountHead: "RCM Purchase / Expense",
      accountType: "Expense",
      debit: Number((totalAmount - taxTotal).toFixed(2)),
      credit: 0,
    },
    ...(taxCgst > 0
      ? [
          {
            accountHead: "GST Input CGST",
            accountType: "Asset",
            debit: Number(taxCgst.toFixed(2)),
            credit: 0,
          },
        ]
      : []),
    ...(taxSgst > 0
      ? [
          {
            accountHead: "GST Input SGST",
            accountType: "Asset",
            debit: Number(taxSgst.toFixed(2)),
            credit: 0,
          },
        ]
      : []),
    ...(taxIgst > 0
      ? [
          {
            accountHead: "GST Input IGST",
            accountType: "Asset",
            debit: Number(taxIgst.toFixed(2)),
            credit: 0,
          },
        ]
      : []),
    {
      accountHead: "GST Output RCM",
      accountType: "Liability",
      debit: 0,
      credit: Number(taxTotal.toFixed(2)),
    },
    {
      accountHead: "Sundry Creditors Account",
      accountType: "Liability",
      debit: 0,
      credit: Number(creditAmount.toFixed(2)),
    },
  ];
};

const buildLinesForOwnerInvestment = (record = {}) => {
  const amount = toNumber(record?.amount || record?.investmentAmount || 0);
  const receivedAmount = toNumber(record?.amountReceived || amount || 0);
  const source = String(
    record?.transferredTo || record?.paymentMethod || "Bank",
  ).toLowerCase();
  const accountHead = source.includes("cash") ? "Cash Account" : "Bank Account";

  return [
    {
      accountHead,
      accountType: "Asset",
      debit: Number(receivedAmount.toFixed(2)),
      credit: 0,
    },
    {
      accountHead: "Owner Funding / Investment",
      accountType: "Equity",
      debit: 0,
      credit: Number(receivedAmount.toFixed(2)),
    },
  ];
};

const buildLinesForProject = (record = {}) => {
  const transactions = Array.isArray(record?.developerTransactions)
    ? record.developerTransactions
    : [];
  const paymentBuckets = transactions.reduce((accumulator, tx) => {
    const amount = toNumber(tx?.payoutAmount || 0);
    if (amount <= 0) return accumulator;

    const paymentMethod = String(
      tx?.payoutMethod || record?.payoutMethod || "Bank Transfer",
    ).toLowerCase();
    const accountHead = paymentMethod.includes("cash")
      ? "Cash Account"
      : "Bank Account";

    accumulator[accountHead] = (accumulator[accountHead] || 0) + amount;
    return accumulator;
  }, {});

  const totalAmount = Object.values(paymentBuckets).reduce(
    (sum, amount) => sum + amount,
    0,
  );
  const counterLines = Object.entries(paymentBuckets).map(
    ([accountHead, amount]) => ({
      accountHead,
      accountType: "Asset",
      debit: 0,
      credit: Number(amount.toFixed(2)),
    }),
  );

  return [
    {
      accountHead: "Project Developer Payout",
      accountType: "Expense",
      debit: Number(totalAmount.toFixed(2)),
      credit: 0,
    },
    ...counterLines,
  ];
};

const buildLines = (sourceType, sourceRecord) => {
  switch (sourceType) {
    case "invoice":
    case "sales":
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
  switch (sourceType) {
    case "invoice":
    case "sales":
    case "purchase":
    case "company-expense":
    case "rcm":
      return toNumber(
        sourceRecord?.taxData?.totalAmount || sourceRecord?.amount || 0,
      );
    case "payment-receipt":
      return toNumber(sourceRecord?.amount || 0);
    case "credit-debit-note":
      return toNumber(sourceRecord?.totalAmount || sourceRecord?.amount || 0);
    case "owner-investment":
      return toNumber(
        sourceRecord?.amount || sourceRecord?.investmentAmount || 0,
      );
    case "project":
      return Array.isArray(sourceRecord?.developerTransactions)
        ? sourceRecord.developerTransactions.reduce(
            (sum, tx) => sum + toNumber(tx?.payoutAmount || 0),
            0,
          )
        : 0;
    default:
      return toNumber(sourceRecord?.amount || 0);
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
  const sourceDate = getDateOnlyString(getSourceDate(sourceRecord, sourceType));
  const financialYear =
    sourceRecord?.financialYear ||
    sourceRecord?.fiscalYear ||
    getFinancialYear(sourceDate);
  const lines = buildLines(sourceType, sourceRecord);
  const debitTotal = lines.reduce(
    (sum, line) => sum + toNumber(line?.debit || 0),
    0,
  );
  const creditTotal = lines.reduce(
    (sum, line) => sum + toNumber(line?.credit || 0),
    0,
  );
  const amount = getRecordAmount(sourceType, sourceRecord);
  const sourceKey = `${sourceCollection}:${sourceId}`;

  // Extract ONLY essential fields needed for Ledger/Balance Sheet/Books of Account
  // Do NOT store full sourceRecord (wasteful storage)
  return {
    // Identifiers
    sourceKey,
    sourceCollection,
    sourceType,
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

    // Core accounting data (essential)
    transactionDate: sourceDate || getDateOnlyString(new Date()),
    financialYear,
    amount: Number(amount.toFixed(2)),
    debitTotal: Number(debitTotal.toFixed(2)),
    creditTotal: Number(creditTotal.toFixed(2)),
    balanced: Math.abs(debitTotal - creditTotal) < 0.01,

    // Transaction lines (essential for Ledger/Balance Sheet)
    lines,

    // Party information (minimal - needed for description/filtering)
    partyName:
      sourceRecord?.businessName ||
      sourceRecord?.partyName ||
      sourceRecord?.vendorName ||
      sourceRecord?.serviceProviderBusinessName ||
      sourceRecord?.staffName ||
      sourceRecord?.clientName ||
      "",

    // Payment info (essential for cash/bank tracking)
    paymentMethod: normalizePaymentMethod(
      sourceRecord?.paymentMethod ||
        sourceRecord?.refundMethod ||
        sourceRecord?.payoutMethod ||
        sourceRecord?.transferredTo,
    ),
    paymentStatus: sourceRecord?.paymentStatus || "",

    // Tax data (essential for tax reporting, but minimal)
    taxData: sourceRecord?.taxData
      ? {
          cgst: toNumber(sourceRecord.taxData.cgst),
          sgst: toNumber(sourceRecord.taxData.sgst),
          igst: toNumber(sourceRecord.taxData.igst),
          totalTax:
            toNumber(sourceRecord.taxData.cgst) +
            toNumber(sourceRecord.taxData.sgst) +
            toNumber(sourceRecord.taxData.igst),
        }
      : { cgst: 0, sgst: 0, igst: 0, totalTax: 0 },

    // Metadata
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
  debit: toNumber(line?.debit || 0),
  credit: toNumber(line?.credit || 0),
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
    sourceType: String(transaction.sourceType || "").trim(),
    sourceId: String(transaction.sourceId || "").trim(),
    sourceLabel: String(transaction.sourceLabel || "").trim(),
    transactionDate: getDateOnlyString(transaction.transactionDate),
    financialYear: String(transaction.financialYear || "").trim(),
    paymentMethod: normalizePaymentMethod(transaction.paymentMethod),
    amount: toNumber(transaction.amount || 0),
    debitTotal: toNumber(transaction.debitTotal || 0),
    creditTotal: toNumber(transaction.creditTotal || 0),
    balanced: Boolean(transaction.balanced),
    lines: normalizedLines,
    isDeleted: transaction.isDeleted === true,
  };
};
