import API_ENDPOINTS from "./apiEndpoints";
import { fetchAllPaginatedEntities } from "./fetchAllEntities";
import {
  getPreviousFinancialYearValue,
  normalizeFinancialYearValue,
} from "./financialYearUtils";

const toNumber = (value) => {
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const getDateOnly = (value) => {
  if (!value) return null;

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

  const raw = String(value || "").trim();
  const dashMatch = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dashMatch) {
    const parsedDash = new Date(
      Number(dashMatch[3]),
      Number(dashMatch[2]) - 1,
      Number(dashMatch[1]),
    );
    if (!Number.isNaN(parsedDash.getTime())) {
      return parsedDash;
    }
  }

  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const parsedSlash = new Date(
      Number(slashMatch[3]),
      Number(slashMatch[2]) - 1,
      Number(slashMatch[1]),
    );
    if (!Number.isNaN(parsedSlash.getTime())) {
      return parsedSlash;
    }
  }

  return null;
};

const getRecordDate = (record) => {
  return (
    record?.invoiceDate ||
    record?.noteDate ||
    record?.expenseDate ||
    record?.date ||
    record?.createdDate ||
    record?.createdAt ||
    null
  );
};

const filterByYear = (records, yearRecord) => {
  if (!Array.isArray(records) || !yearRecord) return [];

  const startDate = getDateOnly(yearRecord?.startDate);
  const endDate = getDateOnly(yearRecord?.endDate);
  if (!startDate || !endDate) return [];

  return records.filter((record) => {
    const recordDate = getDateOnly(getRecordDate(record));
    if (!recordDate) return false;
    return recordDate >= startDate && recordDate <= endDate;
  });
};

const getOpeningBalance = (yearRecord, keys) => {
  if (!yearRecord) return 0;

  const candidate = keys.reduce((found, key) => {
    if (found !== null) return found;
    const value = yearRecord?.[key];
    return value !== undefined && value !== null && value !== "" ? value : null;
  }, null);

  return candidate !== null ? toNumber(candidate) : 0;
};

const getTaxAmount = (record) => {
  const taxData = record?.taxData || {};
  const cgst = toNumber(taxData.cgst || 0);
  const sgst = toNumber(taxData.sgst || 0);
  const igst = toNumber(taxData.igst || 0);
  const explicitTax = cgst + sgst + igst;

  if (explicitTax > 0) return explicitTax;

  const totalAmount = toNumber(taxData.totalAmount || 0);
  const taxableAmount = toNumber(
    taxData.taxableAmount || taxData.subtotal || 0,
  );

  return Math.max(totalAmount - taxableAmount, 0);
};

const getTaxComponents = (record) => {
  const taxData = record?.taxData || {};
  const cgst = toNumber(taxData.cgst || 0);
  const sgst = toNumber(taxData.sgst || 0);
  const igst = toNumber(taxData.igst || 0);
  const total = cgst + sgst + igst;

  if (total > 0) {
    return { cgst, sgst, igst };
  }

  return { cgst: 0, sgst: 0, igst: 0 };
};

const getTotalAmount = (record) => {
  return toNumber(record?.taxData?.totalAmount || record?.amount || 0);
};

const getPaidAmount = (record, totalAmount) => {
  const isSalesInvoice = Boolean(
    record?.invoiceNumber ||
    record?.invoiceDate ||
    record?.taxData ||
    record?.clientRefId,
  );
  const appliedAdvanceFromInvoice = Math.max(
    toNumber(record?.advanceAdjustedTotal || 0),
    Array.isArray(record?.appliedAdvances)
      ? record.appliedAdvances.reduce(
          (sum, advance) => sum + toNumber(advance?.appliedAmount || 0),
          0,
        )
      : 0,
  );
  const explicitPaid = Math.max(
    toNumber(record?.amountReceived || 0),
    toNumber(record?.paidAmount || 0),
    toNumber(record?.amountPaid || 0),
  );

  const effectivePaid = isSalesInvoice
    ? Math.max(0, explicitPaid - appliedAdvanceFromInvoice)
    : explicitPaid;

  if (effectivePaid > 0) {
    return Math.min(effectivePaid, totalAmount);
  }

  if (record?.paymentStatus === "Paid") {
    const paidByAdvanceOnly = isSalesInvoice && appliedAdvanceFromInvoice > 0;
    if (paidByAdvanceOnly) return 0;
    return totalAmount;
  }

  return 0;
};

const isCashPayment = (paymentMethod) => {
  const method = String(paymentMethod || "")
    .trim()
    .toLowerCase();
  return method.includes("cash");
};

const isBankPayment = (paymentMethod) => {
  const method = String(paymentMethod || "")
    .trim()
    .toLowerCase();
  if (!method) return false;
  return !isCashPayment(method);
};

const isPurchaseItcEligible = (invoiceType) => {
  const normalizedType = String(invoiceType || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

  return normalizedType === "itc" || normalizedType === "rcm + itc";
};

const isOwnerPersonalPayment = (record) => {
  const source = String(record?.paymentSource || "")
    .trim()
    .toLowerCase();
  return source.includes("owner") || source.includes("personal");
};

const calculateTotals = ({
  salesRecords = [],
  creditDebitNoteRecords = [],
  purchaseRecords = [],
  companyExpenseRecords = [],
  rcmRecords = [],
  projectRecords = [],
  personalFundRecords = [],
}) => {
  const totals = {
    cashDebit: 0,
    cashCredit: 0,
    bankDebit: 0,
    bankCredit: 0,
    gstOutputCredit: 0,
    gstOutputDebit: 0,
    gstOutputCgst: 0,
    gstOutputSgst: 0,
    gstOutputIgst: 0,
    gstInputDebit: 0,
    gstInputCgst: 0,
    gstInputSgst: 0,
    gstInputIgst: 0,
  };

  salesRecords.forEach((record) => {
    const totalAmount = getTotalAmount(record);
    const taxAmount = getTaxAmount(record);
    const taxComponents = getTaxComponents(record);
    const paidAmount = getPaidAmount(record, totalAmount);

    totals.gstOutputCredit += taxAmount;
    totals.gstOutputCgst += taxComponents.cgst;
    totals.gstOutputSgst += taxComponents.sgst;
    totals.gstOutputIgst += taxComponents.igst;

    if (isCashPayment(record.paymentMethod)) {
      totals.cashDebit += paidAmount;
    } else if (isBankPayment(record.paymentMethod)) {
      totals.bankDebit += paidAmount;
    }
  });

  creditDebitNoteRecords.forEach((record) => {
    const taxAmount = getTaxAmount(record);
    const taxComponents = getTaxComponents(record);
    const totalAmount = getTotalAmount(record);
    const isCreditNote = String(record?.noteType || "") === "Credit Note";

    if (isCreditNote) {
      const refundAmount = Math.min(
        toNumber(record?.refundAmount || 0),
        Math.max(totalAmount, 0),
      );

      totals.gstOutputDebit += taxAmount;
      totals.gstOutputCgst += taxComponents.cgst;
      totals.gstOutputSgst += taxComponents.sgst;
      totals.gstOutputIgst += taxComponents.igst;

      if (refundAmount > 0) {
        if (isCashPayment(record?.refundMethod)) {
          totals.cashCredit += refundAmount;
        } else if (isBankPayment(record?.refundMethod)) {
          totals.bankCredit += refundAmount;
        }
      }
      return;
    }

    const receivedAmount = Math.min(
      toNumber(record?.receivedAmount || 0),
      Math.max(totalAmount, 0),
    );

    totals.gstOutputCredit += taxAmount;
    totals.gstOutputCgst += taxComponents.cgst;
    totals.gstOutputSgst += taxComponents.sgst;
    totals.gstOutputIgst += taxComponents.igst;

    if (receivedAmount > 0) {
      if (isCashPayment(record?.paymentMethod)) {
        totals.cashDebit += receivedAmount;
      } else if (isBankPayment(record?.paymentMethod)) {
        totals.bankDebit += receivedAmount;
      }
    }
  });

  purchaseRecords.forEach((record) => {
    const totalAmount = getTotalAmount(record);
    const taxAmount = getTaxAmount(record);
    const paidAmount = getPaidAmount(record, totalAmount);
    const taxData = record?.taxData || {};

    if (isPurchaseItcEligible(record.invoiceType)) {
      totals.gstInputDebit += taxAmount;
      totals.gstInputCgst += toNumber(taxData.cgst || 0);
      totals.gstInputSgst += toNumber(taxData.sgst || 0);
      totals.gstInputIgst += toNumber(taxData.igst || 0);
    }

    if (isCashPayment(record.paymentMethod)) {
      if (!isOwnerPersonalPayment(record)) {
        totals.cashCredit += paidAmount;
      }
    } else if (isBankPayment(record.paymentMethod)) {
      if (!isOwnerPersonalPayment(record)) {
        totals.bankCredit += paidAmount;
      }
    }
  });

  companyExpenseRecords.forEach((record) => {
    const totalAmount = getTotalAmount(record);
    const paidAmount = getPaidAmount(record, totalAmount);

    if (isCashPayment(record.paymentMethod)) {
      totals.cashCredit += paidAmount;
    } else if (isBankPayment(record.paymentMethod)) {
      totals.bankCredit += paidAmount;
    }
  });

  rcmRecords.forEach((record) => {
    const taxAmount = getTaxAmount(record);
    const totalAmount = getTotalAmount(record);
    const paidAmount = Math.min(
      getPaidAmount(record, totalAmount),
      Math.max(totalAmount, 0),
    );
    const taxData = record?.taxData || {};
    const taxComponents = getTaxComponents(record);

    totals.gstInputDebit += taxAmount;
    totals.gstInputCgst += toNumber(taxData.cgst || 0);
    totals.gstInputSgst += toNumber(taxData.sgst || 0);
    totals.gstInputIgst += toNumber(taxData.igst || 0);
    totals.gstOutputCredit += taxAmount;
    totals.gstOutputCgst += taxComponents.cgst;
    totals.gstOutputSgst += taxComponents.sgst;
    totals.gstOutputIgst += taxComponents.igst;

    if (isCashPayment(record.paymentMethod)) {
      totals.cashCredit += paidAmount;
    } else if (isBankPayment(record.paymentMethod)) {
      totals.bankCredit += paidAmount;
    }
  });

  projectRecords.forEach((project) => {
    const transactions = Array.isArray(project?.developerTransactions)
      ? project.developerTransactions
      : [];

    transactions.forEach((transaction) => {
      const payoutAmount = toNumber(transaction?.payoutAmount || 0);
      if (payoutAmount <= 0) return;

      const payoutSource = String(transaction?.payoutSource || "")
        .trim()
        .toLowerCase();
      if (payoutSource.includes("personal") || payoutSource.includes("owner")) {
        return;
      }

      if (isCashPayment(transaction?.payoutMethod)) {
        totals.cashCredit += payoutAmount;
      } else {
        totals.bankCredit += payoutAmount;
      }
    });
  });

  personalFundRecords.forEach((fund) => {
    const amount = toNumber(fund?.amount || 0);
    if (amount <= 0) return;

    if (
      String(fund?.transferredTo || "")
        .toLowerCase()
        .includes("cash")
    ) {
      totals.cashDebit += amount;
    } else {
      totals.bankDebit += amount;
    }
  });

  return totals;
};

export const loadCarryForwardDefaults = async ({
  financialYearValue,
  forceRefresh = false,
} = {}) => {
  const targetValue = String(financialYearValue || "").trim();
  const previousFinancialYearValue = getPreviousFinancialYearValue(targetValue);

  if (!targetValue || !previousFinancialYearValue) {
    return {
      sourceFinancialYear: "",
      openingCash: "",
      openingBank: "",
      openingCgstItc: "",
      openingSgstItc: "",
      openingIgstItc: "",
      openingItcTotal: 0,
    };
  }

  const [
    years,
    salesRecords,
    creditDebitNoteRecords,
    purchaseRecords,
    companyExpenseRecords,
    rcmRecords,
    projectRecords,
    personalFundRecords,
  ] = await Promise.all([
    fetchAllPaginatedEntities({
      endpoint: API_ENDPOINTS.YEARS.LIST,
      fallbackKeys: ["years", "data"],
      fetchAll: true,
      forceRefresh,
    }),
    fetchAllPaginatedEntities({
      endpoint: API_ENDPOINTS.INVOICES.LIST,
      fallbackKeys: ["invoices", "data"],
      fetchAll: true,
      forceRefresh,
    }),
    fetchAllPaginatedEntities({
      endpoint: API_ENDPOINTS.CREDIT_DEBIT_NOTES.LIST,
      fallbackKeys: ["notes", "data"],
      fetchAll: true,
      forceRefresh,
    }),
    fetchAllPaginatedEntities({
      endpoint: API_ENDPOINTS.PURCHASES.LIST,
      fallbackKeys: ["purchases", "data"],
      fetchAll: true,
      forceRefresh,
    }),
    fetchAllPaginatedEntities({
      endpoint: API_ENDPOINTS.COMPANY_EXPENSES.LIST,
      fallbackKeys: ["companyExpenses", "expenses", "data"],
      fetchAll: true,
      forceRefresh,
    }),
    fetchAllPaginatedEntities({
      endpoint: API_ENDPOINTS.RCM.LIST,
      fallbackKeys: ["rcm", "records", "data"],
      fetchAll: true,
      forceRefresh,
    }),
    fetchAllPaginatedEntities({
      endpoint: API_ENDPOINTS.PROJECTS.LIST,
      fallbackKeys: ["projects", "data"],
      fetchAll: true,
      forceRefresh,
    }),
    fetchAllPaginatedEntities({
      endpoint: API_ENDPOINTS.OWNER_INVESTMENTS.LIST,
      fallbackKeys: ["personalFunds", "data"],
      fetchAll: true,
      forceRefresh,
    }),
  ]);

  const previousYear =
    (Array.isArray(years) ? years : []).find(
      (year) =>
        normalizeFinancialYearValue(year) === previousFinancialYearValue,
    ) || null;

  if (!previousYear) {
    return {
      sourceFinancialYear: previousFinancialYearValue,
      openingCash: "",
      openingBank: "",
      openingCgstItc: "",
      openingSgstItc: "",
      openingIgstItc: "",
      openingItcTotal: 0,
    };
  }

  const openingCashBase = getOpeningBalance(previousYear, [
    "openingCash",
    "openingCashBalance",
  ]);
  const openingBankBase = getOpeningBalance(previousYear, [
    "openingBank",
    "openingBankBalance",
    "openingBankAmount",
  ]);
  const openingCgstBase = getOpeningBalance(previousYear, [
    "openingCgstItc",
    "openingItcCgst",
  ]);
  const openingSgstBase = getOpeningBalance(previousYear, [
    "openingSgstItc",
    "openingItcSgst",
  ]);
  const openingIgstBase = getOpeningBalance(previousYear, [
    "openingIgstItc",
    "openingItcIgst",
  ]);

  const previousYearSales = filterByYear(salesRecords, previousYear);
  const previousYearCreditDebitNotes = filterByYear(
    creditDebitNoteRecords,
    previousYear,
  );
  const previousYearPurchases = filterByYear(purchaseRecords, previousYear);
  const previousYearExpenses = filterByYear(
    companyExpenseRecords,
    previousYear,
  );
  const previousYearRcm = filterByYear(rcmRecords, previousYear);
  const previousYearProjects = filterByYear(projectRecords, previousYear);
  const previousYearFunds = filterByYear(personalFundRecords, previousYear);

  const totals = calculateTotals({
    salesRecords: previousYearSales,
    creditDebitNoteRecords: previousYearCreditDebitNotes,
    purchaseRecords: previousYearPurchases,
    companyExpenseRecords: previousYearExpenses,
    rcmRecords: previousYearRcm,
    projectRecords: previousYearProjects,
    personalFundRecords: previousYearFunds,
  });

  const closingCash = Math.max(
    openingCashBase + totals.cashDebit - totals.cashCredit,
    0,
  );
  const closingBank = Math.max(
    openingBankBase + totals.bankDebit - totals.bankCredit,
    0,
  );
  const closingCgstItc = Math.max(
    openingCgstBase + totals.gstInputCgst - totals.gstOutputCgst,
    0,
  );
  const closingSgstItc = Math.max(
    openingSgstBase + totals.gstInputSgst - totals.gstOutputSgst,
    0,
  );
  const closingIgstItc = Math.max(
    openingIgstBase + totals.gstInputIgst - totals.gstOutputIgst,
    0,
  );

  return {
    sourceFinancialYear: normalizeFinancialYearValue(previousYear),
    openingCash: Number(closingCash.toFixed(2)),
    openingBank: Number(closingBank.toFixed(2)),
    openingCgstItc: Number(closingCgstItc.toFixed(2)),
    openingSgstItc: Number(closingSgstItc.toFixed(2)),
    openingIgstItc: Number(closingIgstItc.toFixed(2)),
    openingItcTotal: Number(
      (closingCgstItc + closingSgstItc + closingIgstItc).toFixed(2),
    ),
  };
};
