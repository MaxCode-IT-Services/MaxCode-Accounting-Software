import React, { useEffect, useMemo, useState } from "react";
import ReusableTable from "../Components/ReusableTable";
import { showError, showInfo } from "../Components/ToastNotification";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { fetchAllPaginatedEntities } from "../utils/fetchAllEntities";

const BalanceSheet = () => {
  useEffect(() => {
    document.title = "Balance Sheet | MaxCode IT Services";
  }, []);

  const [financialYears, setFinancialYears] = useState([]);
  const [selectedFinancialYear, setSelectedFinancialYear] = useState(
    localStorage.getItem("selectedFinancialYear") || "ALL",
  );
  const [salesRecords, setSalesRecords] = useState([]);
  const [creditDebitNoteRecords, setCreditDebitNoteRecords] = useState([]);
  const [purchaseRecords, setPurchaseRecords] = useState([]);
  const [companyExpenseRecords, setCompanyExpenseRecords] = useState([]);
  const [rcmRecords, setRcmRecords] = useState([]);
  const [projectRecords, setProjectRecords] = useState([]);
  const [personalFundRecords, setPersonalFundRecords] = useState([]);
  const [paymentReceiptRecords, setPaymentReceiptRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeCardFilter, setActiveCardFilter] = useState("all");

  const toNumber = (value) => {
    const num = parseFloat(value);
    return Number.isNaN(num) ? 0 : num;
  };

  const formatCurrency = (value) => {
    return `₹ ${toNumber(value).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const getDateOnly = (value) => {
    if (!value) return null;
    const parseDate = (rawValue) => {
      const direct = new Date(rawValue);
      if (!Number.isNaN(direct.getTime())) return direct;

      const raw = String(rawValue || "").trim();
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

    const date = parseDate(value);
    if (!date) return null;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
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

  const getSelectedYearRange = () => {
    if (!selectedFinancialYear || selectedFinancialYear === "ALL") {
      return null;
    }

    const matchedYear = financialYears.find(
      (year) => year.value === selectedFinancialYear,
    );

    if (!matchedYear?.startDate || !matchedYear?.endDate) {
      return null;
    }

    const startDate = getDateOnly(matchedYear.startDate);
    const endDate = getDateOnly(matchedYear.endDate);
    if (!startDate || !endDate) return null;

    return { startDate, endDate };
  };

  const getSelectedYearRecord = () => {
    if (!selectedFinancialYear || selectedFinancialYear === "ALL") {
      return null;
    }

    return (
      financialYears.find((year) => year.value === selectedFinancialYear) ||
      null
    );
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

  const sumOptionalValues = (records, keys) => {
    if (!Array.isArray(records)) return 0;
    return records.reduce((sum, record) => {
      const recordTotal = keys.reduce((acc, key) => {
        const value = record?.[key];
        if (value === undefined || value === null) return acc;
        return acc + toNumber(value);
      }, 0);
      return sum + recordTotal;
    }, 0);
  };

  const filterByFinancialYear = (records) => {
    if (!Array.isArray(records)) return [];

    const selectedRange = getSelectedYearRange();
    if (!selectedRange) return records;

    // For accounting purposes, include all transactions up to the end date
    // This ensures cumulative balances are calculated correctly
    return records.filter((record) => {
      const invoiceDate = getDateOnly(getRecordDate(record));
      if (!invoiceDate) return false;
      return invoiceDate <= selectedRange.endDate;
    });
  };

  const filterByFinancialYearStrict = (records) => {
    if (!Array.isArray(records)) return [];

    const selectedRange = getSelectedYearRange();
    if (!selectedRange) return records;

    // Strict filtering for period-based reports (only transactions within the year)
    return records.filter((record) => {
      const invoiceDate = getDateOnly(getRecordDate(record));
      if (!invoiceDate) return false;
      return (
        invoiceDate >= selectedRange.startDate &&
        invoiceDate <= selectedRange.endDate
      );
    });
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

  const getTaxableAmount = (record) => {
    const taxData = record?.taxData || {};
    const taxableFromRecord = toNumber(
      taxData.taxableAmount || taxData.subtotal || 0,
    );
    if (taxableFromRecord > 0) return taxableFromRecord;

    const totalAmount = toNumber(taxData.totalAmount || 0);
    const taxAmount = getTaxAmount(record);
    return Math.max(totalAmount - taxAmount, 0);
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

  const loadAllData = async (options = {}) => {
    const { forceRefresh = false } = options;
    setLoading(true);
    try {
      const fetchSafe = async (config) => {
        try {
          const value = await fetchAllPaginatedEntities({
            ...config,
            forceRefresh,
          });
          return { status: "fulfilled", value };
        } catch (reason) {
          return { status: "rejected", reason };
        }
      };

      const [
        yearsResult,
        salesResult,
        creditDebitResult,
        purchaseResult,
        companyExpenseResult,
        rcmResult,
        projectsResult,
        personalFundsResult,
        paymentReceiptsResult,
      ] = await Promise.all([
        fetchSafe({
          endpoint: API_ENDPOINTS.YEARS.LIST,
          fallbackKeys: ["years"],
        }),
        fetchSafe({
          endpoint: API_ENDPOINTS.INVOICES.LIST,
          fallbackKeys: ["invoices"],
        }),
        fetchSafe({
          endpoint: API_ENDPOINTS.CREDIT_DEBIT_NOTES.LIST,
          fallbackKeys: ["notes", "data"],
        }),
        fetchSafe({
          endpoint: API_ENDPOINTS.PURCHASES.LIST,
          fallbackKeys: ["purchases"],
        }),
        fetchSafe({
          endpoint: API_ENDPOINTS.COMPANY_EXPENSES.LIST,
          fallbackKeys: ["companyExpenses", "expenses"],
        }),
        fetchSafe({
          endpoint: API_ENDPOINTS.RCM.LIST,
          fallbackKeys: ["records", "rcm"],
        }),
        fetchSafe({
          endpoint: API_ENDPOINTS.PROJECTS.LIST,
          fallbackKeys: ["projects"],
        }),
        fetchSafe({
          endpoint: API_ENDPOINTS.OWNER_INVESTMENTS.LIST,
          fallbackKeys: ["data", "personalFunds"],
        }),
        fetchSafe({
          endpoint: API_ENDPOINTS.PAYMENT_RECEIPTS.LIST,
          fallbackKeys: ["records", "receipts", "data"],
          fetchAll: true,
        }),
      ]);

      const yearsData =
        yearsResult.status === "fulfilled" ? yearsResult.value : [];

      const normalizedYears = yearsData
        .filter((yearRecord) => yearRecord?.isDeleted !== true)
        .map((yearRecord) => ({
          ...yearRecord,
          id: yearRecord.id || yearRecord._id,
          value: yearRecord.financialYear || yearRecord.year,
        }));

      const invoicesData =
        salesResult.status === "fulfilled" ? salesResult.value : [];

      const purchasesData =
        purchaseResult.status === "fulfilled" ? purchaseResult.value : [];

      const creditDebitData =
        creditDebitResult.status === "fulfilled" ? creditDebitResult.value : [];

      const companyExpensesData =
        companyExpenseResult.status === "fulfilled"
          ? companyExpenseResult.value
          : [];

      const rcmData = rcmResult.status === "fulfilled" ? rcmResult.value : [];

      const projectsData =
        projectsResult.status === "fulfilled" ? projectsResult.value : [];

      const personalFundsData =
        personalFundsResult.status === "fulfilled"
          ? personalFundsResult.value
          : [];
      const paymentReceiptsData =
        paymentReceiptsResult.status === "fulfilled"
          ? paymentReceiptsResult.value
          : [];

      setFinancialYears(normalizedYears);
      setSalesRecords(
        invoicesData.map((record) => ({
          ...record,
          id: record._id || record.id,
        })),
      );
      setCreditDebitNoteRecords(
        creditDebitData.map((record) => ({
          ...record,
          id: record._id || record.id,
          invoiceDate:
            record.noteDate || record.noteDateTime || record.createdAt,
        })),
      );
      setPurchaseRecords(
        purchasesData.map((record) => ({
          ...record,
          id: record._id || record.id,
        })),
      );
      setCompanyExpenseRecords(
        companyExpensesData.map((record) => ({
          ...record,
          id: record._id || record.id,
          invoiceDate: record.invoiceDate || record.expenseDate,
        })),
      );
      setRcmRecords(
        rcmData.map((record) => ({
          ...record,
          id: record._id || record.id,
        })),
      );
      setProjectRecords(
        projectsData.map((record) => ({
          ...record,
          id: record._id || record.id,
        })),
      );

      setPersonalFundRecords(
        personalFundsData.map((record) => ({
          ...record,
          id: record._id || record.id,
        })),
      );
      setPaymentReceiptRecords(
        paymentReceiptsData.map((record) => ({
          ...record,
          id: record._id || record.id,
          invoiceDate: record.receiptDate || record.invoiceDate,
        })),
      );

      if (
        yearsResult.status === "rejected" ||
        salesResult.status === "rejected" ||
        creditDebitResult.status === "rejected" ||
        purchaseResult.status === "rejected" ||
        companyExpenseResult.status === "rejected" ||
        rcmResult.status === "rejected" ||
        projectsResult.status === "rejected" ||
        personalFundsResult.status === "rejected" ||
        paymentReceiptsResult.status === "rejected"
      ) {
        showInfo("Some balance sheet data could not be loaded.");
      }
    } catch (error) {
      console.error("Failed to load balance sheet data:", error);
      showError("Failed to fetch balance sheet data");
      setFinancialYears([]);
      setSalesRecords([]);
      setCreditDebitNoteRecords([]);
      setPurchaseRecords([]);
      setCompanyExpenseRecords([]);
      setRcmRecords([]);
      setProjectRecords([]);
      setPersonalFundRecords([]);
      setPaymentReceiptRecords([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();

    const handleFinancialYearSelectionChanged = (event) => {
      const selectedYear =
        event?.detail?.selectedFinancialYear ||
        localStorage.getItem("selectedFinancialYear") ||
        "ALL";
      setSelectedFinancialYear(selectedYear);
    };

    window.addEventListener(
      "financialYearSelectionChanged",
      handleFinancialYearSelectionChanged,
    );

    return () => {
      window.removeEventListener(
        "financialYearSelectionChanged",
        handleFinancialYearSelectionChanged,
      );
    };
  }, []);

  const balanceSummary = useMemo(() => {
    const sales = filterByFinancialYear(salesRecords);
    const creditDebitNotes = filterByFinancialYear(
      creditDebitNoteRecords,
    ).filter(
      (record) =>
        record?.isDeleted !== true &&
        String(record?.status || "").toLowerCase() !== "cancelled",
    );
    const purchases = filterByFinancialYear(purchaseRecords);
    const companyExpenses = filterByFinancialYear(companyExpenseRecords);
    const rcm = filterByFinancialYear(rcmRecords);
    const personalFunds = filterByFinancialYear(
      personalFundRecords.map((r) => ({
        ...r,
        invoiceDate: r.fundDate || r.invoiceDate,
      })),
    );
    const paymentReceipts = filterByFinancialYear(paymentReceiptRecords);
    const selectedRange = getSelectedYearRange();

    const projectPayoutEntries = projectRecords.flatMap((project) => {
      const transactions = Array.isArray(project.developerTransactions)
        ? project.developerTransactions
        : [];

      return transactions
        .map((transaction) => {
          const payoutDate =
            transaction.payoutDate ||
            transaction.paymentDate ||
            project.projectDate ||
            project.createdDate;
          const payoutDateOnly = getDateOnly(payoutDate);
          const amount = toNumber(transaction.payoutAmount || 0);

          if (!payoutDateOnly || amount <= 0) return null;

          if (selectedRange) {
            const isWithinYear =
              payoutDateOnly >= selectedRange.startDate &&
              payoutDateOnly <= selectedRange.endDate;
            if (!isWithinYear) return null;
          }

          return {
            amount,
            paymentMethod: transaction.payoutMethod || "Bank Transfer",
            payoutSource: transaction.payoutSource || "Business Account",
          };
        })
        .filter(Boolean);
    });

    const totals = {
      cashDebit: 0,
      cashCredit: 0,
      bankDebit: 0,
      bankCredit: 0,
      salesCredit: 0,
      salesReturnDebit: 0,
      creditNotePayableCredit: 0,
      purchaseDebit: 0,
      gstOutputCredit: 0,
      gstOutputDebit: 0,
      gstInputDebit: 0,
      sundryDebtorsDebit: 0,
      sundryCreditorsCredit: 0,
      ownerFundingCredit: 0,
      customerOverpaymentCredit: 0,
    };

    sales.forEach((record) => {
      const totalAmount = getTotalAmount(record);
      const taxAmount = getTaxAmount(record);
      const taxableAmount = getTaxableAmount(record);
      const paidAmount = getPaidAmount(record, totalAmount);

      totals.salesCredit += taxableAmount;
      totals.gstOutputCredit += taxAmount;
      totals.sundryDebtorsDebit += Math.max(totalAmount - paidAmount, 0);

      if (isCashPayment(record.paymentMethod)) {
        totals.cashDebit += paidAmount;
      } else if (isBankPayment(record.paymentMethod)) {
        totals.bankDebit += paidAmount;
      }
    });

    creditDebitNotes.forEach((record) => {
      const taxableAmount = toNumber(record?.amount || record?.subtotal || 0);
      const taxAmount = toNumber(record?.taxAmount || 0);
      const totalAmount = toNumber(
        record?.totalAmount || taxableAmount + taxAmount,
      );
      const isCreditNote = String(record?.noteType || "") === "Credit Note";
      if (isCreditNote) {
        const refundAmount = Math.min(
          toNumber(record?.refundAmount || 0),
          Math.max(totalAmount, 0),
        );
        const creditOutstanding = Math.max(totalAmount - refundAmount, 0);

        totals.salesReturnDebit += taxableAmount;
        totals.gstOutputDebit += taxAmount;
        totals.creditNotePayableCredit += creditOutstanding;

        if (refundAmount > 0) {
          if (isCashPayment(record?.refundMethod)) {
            totals.cashCredit += refundAmount;
          } else if (isBankPayment(record?.refundMethod)) {
            totals.bankCredit += refundAmount;
          }
        }
      } else {
        const receivedAmount = Math.min(
          toNumber(record?.receivedAmount || 0),
          Math.max(totalAmount, 0),
        );
        const debitOutstanding = Math.max(totalAmount - receivedAmount, 0);

        totals.salesCredit += taxableAmount;
        totals.gstOutputCredit += taxAmount;
        totals.sundryDebtorsDebit += debitOutstanding;

        if (receivedAmount > 0) {
          if (isCashPayment(record?.paymentMethod)) {
            totals.cashDebit += receivedAmount;
          } else if (isBankPayment(record?.paymentMethod)) {
            totals.bankDebit += receivedAmount;
          }
        }
      }
    });

    purchases.forEach((record) => {
      const totalAmount = getTotalAmount(record);
      const taxAmount = getTaxAmount(record);
      const taxableAmount = getTaxableAmount(record);
      const paidAmount = getPaidAmount(record, totalAmount);

      totals.purchaseDebit += taxableAmount;
      totals.sundryCreditorsCredit += Math.max(totalAmount - paidAmount, 0);

      if (isCashPayment(record.paymentMethod)) {
        if (isOwnerPersonalPayment(record)) {
          totals.ownerFundingCredit += paidAmount;
        } else {
          totals.cashCredit += paidAmount;
        }
      } else if (isBankPayment(record.paymentMethod)) {
        if (isOwnerPersonalPayment(record)) {
          totals.ownerFundingCredit += paidAmount;
        } else {
          totals.bankCredit += paidAmount;
        }
      } else if (isOwnerPersonalPayment(record) && paidAmount > 0) {
        totals.ownerFundingCredit += paidAmount;
      }

      if (isPurchaseItcEligible(record.invoiceType)) {
        totals.gstInputDebit += taxAmount;
      }
    });

    companyExpenses.forEach((record) => {
      const totalAmount = getTotalAmount(record);
      const paidAmount = getPaidAmount(record, totalAmount);

      totals.sundryCreditorsCredit += Math.max(totalAmount - paidAmount, 0);

      if (isCashPayment(record.paymentMethod)) {
        totals.cashCredit += paidAmount;
      } else if (isBankPayment(record.paymentMethod)) {
        totals.bankCredit += paidAmount;
      }
    });

    rcm.forEach((record) => {
      const totalAmount = getTotalAmount(record);
      const taxAmount = getTaxAmount(record);
      const taxableAmount = getTaxableAmount(record);
      const paidAmount = Math.min(
        getPaidAmount(record, totalAmount),
        Math.max(taxableAmount, 0),
      );

      totals.purchaseDebit += taxableAmount;
      totals.gstOutputCredit += taxAmount;
      totals.gstInputDebit += taxAmount;
      totals.sundryCreditorsCredit += Math.max(taxableAmount - paidAmount, 0);

      if (isCashPayment(record.paymentMethod)) {
        totals.cashCredit += paidAmount;
      } else if (isBankPayment(record.paymentMethod)) {
        totals.bankCredit += paidAmount;
      }
    });

    projectPayoutEntries.forEach((entry) => {
      const isPersonalPayout =
        String(entry.payoutSource || "")
          .toLowerCase()
          .includes("personal") ||
        String(entry.payoutSource || "")
          .toLowerCase()
          .includes("owner");

      if (isPersonalPayout) {
        totals.ownerFundingCredit += entry.amount;
      } else if (isCashPayment(entry.paymentMethod)) {
        totals.cashCredit += entry.amount;
      } else {
        totals.bankCredit += entry.amount;
      }
    });

    personalFunds.forEach((fund) => {
      const amount = toNumber(fund.amount || 0);
      if (amount <= 0) return;
      if (
        String(fund.transferredTo || "")
          .toLowerCase()
          .includes("cash")
      ) {
        totals.cashDebit += amount;
      } else {
        totals.bankDebit += amount;
      }
    });

    const unappliedAdvanceReceipts = paymentReceipts.reduce((sum, receipt) => {
      const isAdvance =
        String(receipt.paymentType || "")
          .trim()
          .toLowerCase() === "advance";
      if (!isAdvance) return sum;
      const unappliedAmount = Math.max(
        toNumber(receipt.amount || 0) - toNumber(receipt.adjustedAmount || 0),
        0,
      );
      return sum + unappliedAmount;
    }, 0);

    if (totals.sundryDebtorsDebit < 0) {
      totals.customerOverpaymentCredit = Math.abs(totals.sundryDebtorsDebit);
      totals.sundryDebtorsDebit = 0;
    }

    const selectedYear = getSelectedYearRecord();
    const openingCash = getOpeningBalance(selectedYear, [
      "openingCash",
      "openingCashBalance",
    ]);
    const openingBank = getOpeningBalance(selectedYear, [
      "openingBank",
      "openingBankBalance",
      "openingBankAmount",
    ]);
    const openingCapital = getOpeningBalance(selectedYear, [
      "openingCapital",
      "capitalAmount",
      "ownerCapital",
    ]);
    const openingGstInput =
      getOpeningBalance(selectedYear, ["openingCgstItc", "openingItcCgst"]) +
      getOpeningBalance(selectedYear, ["openingSgstItc", "openingItcSgst"]) +
      getOpeningBalance(selectedYear, ["openingIgstItc", "openingItcIgst"]) +
      getOpeningBalance(selectedYear, ["openingItc", "openingGstInput"]);

    totals.gstInputDebit += openingGstInput;

    const cashBalance = totals.cashDebit - totals.cashCredit;
    const bankBalance = totals.bankDebit - totals.bankCredit;
    const gstNet = totals.gstOutputCredit - totals.gstInputDebit;

    const cashClosing = openingCash + cashBalance;
    const bankClosing = openingBank + bankBalance;
    const cashOverdraft = Math.max(-cashClosing, 0);
    const bankOverdraft = Math.max(-bankClosing, 0);

    const inventoryValue = Math.max(
      sumOptionalValues(purchases, [
        "inventoryValue",
        "stockValue",
        "closingStock",
        "inventoryAmount",
      ]),
      0,
    );

    const assets = {
      cashOpening: openingCash,
      cashClosing: cashClosing,
      bankOpening: openingBank,
      bankClosing: bankClosing,
      cash: Math.max(cashClosing, 0),
      bank: Math.max(bankClosing, 0),
      receivables: totals.sundryDebtorsDebit,
      gstReceivable: Math.max(-gstNet, 0),
      inventory: inventoryValue,
      openingGstInput,
    };

    const liabilities = {
      payables: totals.sundryCreditorsCredit,
      gstPayable: Math.max(gstNet, 0),
      overdraft: cashOverdraft + bankOverdraft,
      ownerFunding: totals.ownerFundingCredit,
      customerAdvance: unappliedAdvanceReceipts,
      creditNotePayable: totals.creditNotePayableCredit,
      customerOverpayment: totals.customerOverpaymentCredit,
    };

    const totalAssets =
      assets.cash +
      assets.bank +
      assets.receivables +
      assets.gstReceivable +
      assets.inventory;
    const totalLiabilities =
      liabilities.payables +
      liabilities.gstPayable +
      liabilities.overdraft +
      liabilities.ownerFunding +
      liabilities.creditNotePayable +
      liabilities.customerOverpayment +
      liabilities.customerAdvance;
    const equity = totalAssets - totalLiabilities - openingCapital;

    return {
      assets,
      liabilities,
      totalAssets,
      totalLiabilities,
      equity,
      openingCapital,
    };
  }, [
    salesRecords,
    creditDebitNoteRecords,
    purchaseRecords,
    companyExpenseRecords,
    rcmRecords,
    projectRecords,
    personalFundRecords,
    paymentReceiptRecords,
    selectedFinancialYear,
    financialYears,
  ]);

  const rows = useMemo(() => {
    const getDescription = (account, section, isTotal) => {
      if (isTotal) {
        if (section === "Assets") {
          return "Total value of all assets";
        }
        if (section === "Liabilities & Equity") {
          return "Total of liabilities and owner’s equity";
        }
        return `Total of ${section}`;
      }

      switch (account) {
        case "Cash (Opening)":
          return "Cash balance at start of financial year";
        case "Cash (Closing)":
          return "Cash balance at the end of the financial period";
        case "Bank (Opening)":
          return "Bank balance at start of financial year";
        case "Bank (Closing)":
          return "Bank balance at the end of the financial period";
        case "Accounts Receivable (Sundry Debtors)":
          return "Amount receivable from customers (positive balance only)";
        case "Customer Advance Payment (Customer Credit)":
          return "Advance payments received from customers (unadjusted)";
        case "Credit Note / Customer Refund Payable":
          return "Separate liability from issued credit notes payable/adjustable to customer";
        case "Customer Credit Balance (Overpayment)":
          return "Customer overpayment liability excluding advance receipts and credit notes";
        case "GST Receivable":
          return "Input GST available for claim or refund";
        case "Inventory":
          return "Closing stock value";
        case "Accounts Payable (Sundry Creditors)":
          return "Amount payable to suppliers for unpaid purchases";
        case "GST Payable":
          return "Net GST liability payable to the government";
        case "Bank/Cash Overdraft":
          return "Negative cash/bank closing balance shown as liability";
        case "Owner Funding (Personal Payments)":
          return "Amount paid directly from owner's personal account for business purchases/RCM/developer payouts";
        case "Owner Capital Contribution (Personal Fund In)":
          return "Personal money transferred by owner into business current account or cash box";
        case "Capital (Opening)":
          return "Owner capital brought at year start";
        case "Owner's Equity (Calculated)":
          return "Owner’s net investment after assets minus liabilities";
        case "Total Liabilities & Equity":
          return "Liabilities plus equity total";
        default:
          return "";
      }
    };

    const assetRows = [
      {
        section: "Assets",
        account: "Cash (Opening)",
        amount: balanceSummary.assets.cashOpening,
      },
      {
        section: "Assets",
        account: "Cash (Closing)",
        amount: balanceSummary.assets.cash,
      },
      {
        section: "Assets",
        account: "Bank (Opening)",
        amount: balanceSummary.assets.bankOpening,
      },
      {
        section: "Assets",
        account: "Bank (Closing)",
        amount: balanceSummary.assets.bank,
      },
      {
        section: "Assets",
        account: "Accounts Receivable (Sundry Debtors)",
        amount: balanceSummary.assets.receivables,
      },
      {
        section: "Assets",
        account: "GST Receivable",
        amount: balanceSummary.assets.gstReceivable,
      },
    ];

    if (balanceSummary.assets.inventory > 0) {
      assetRows.push({
        section: "Assets",
        account: "Inventory",
        amount: balanceSummary.assets.inventory,
      });
    }

    assetRows.push({
      section: "Assets",
      account: "Total Assets",
      amount: balanceSummary.totalAssets,
      isTotal: true,
    });

    const liabilityRows = [
      {
        section: "Liabilities",
        account: "Accounts Payable (Sundry Creditors)",
        amount: balanceSummary.liabilities.payables,
      },
      {
        section: "Liabilities",
        account: "GST Payable",
        amount: balanceSummary.liabilities.gstPayable,
      },
    ];

    if (balanceSummary.liabilities.overdraft > 0) {
      liabilityRows.push({
        section: "Liabilities",
        account: "Bank/Cash Overdraft",
        amount: balanceSummary.liabilities.overdraft,
      });
    }

    if (balanceSummary.liabilities.customerAdvance > 0) {
      liabilityRows.push({
        section: "Liabilities",
        account: "Customer Advance Payment (Customer Credit)",
        amount: balanceSummary.liabilities.customerAdvance,
      });
    }

    if (balanceSummary.liabilities.creditNotePayable > 0) {
      liabilityRows.push({
        section: "Liabilities",
        account: "Credit Note / Customer Refund Payable",
        amount: balanceSummary.liabilities.creditNotePayable,
      });
    }

    if (balanceSummary.liabilities.customerOverpayment > 0) {
      liabilityRows.push({
        section: "Liabilities",
        account: "Customer Credit Balance (Overpayment)",
        amount: balanceSummary.liabilities.customerOverpayment,
      });
    }

    if (balanceSummary.liabilities.ownerFunding > 0) {
      liabilityRows.push({
        section: "Liabilities",
        account: "Owner Funding (Personal Payments)",
        amount: balanceSummary.liabilities.ownerFunding,
      });
    }

    const equityRows = [];

    if (balanceSummary.openingCapital > 0) {
      equityRows.push({
        section: "Liabilities & Equity",
        account: "Capital (Opening)",
        amount: balanceSummary.openingCapital,
      });
    }

    equityRows.push({
      section: "Liabilities & Equity",
      account: "Owner's Equity (Calculated)",
      amount: balanceSummary.equity,
    });

    equityRows.push({
      section: "Liabilities & Equity",
      account: "Total Liabilities & Equity",
      amount: balanceSummary.totalLiabilities + balanceSummary.equity,
      isTotal: true,
    });

    return [...assetRows, ...liabilityRows, ...equityRows].map((row) => ({
      ...row,
      description: getDescription(row.account, row.section, row.isTotal),
    }));
  }, [balanceSummary]);

  const filteredRows = useMemo(() => {
    if (activeCardFilter === "all") return rows;

    const filterMap = {
      cashOpen: "Cash (Opening)",
      cashClose: "Cash (Closing)",
      bankOpen: "Bank (Opening)",
      bankClose: "Bank (Closing)",
    };

    if (filterMap[activeCardFilter]) {
      return rows.filter((row) => row.account === filterMap[activeCardFilter]);
    }

    if (activeCardFilter === "totalAssets") {
      return rows.filter((row) => row.section === "Assets");
    }

    if (activeCardFilter === "totalLiabilities") {
      return rows.filter(
        (row) =>
          row.section === "Liabilities" ||
          row.section === "Liabilities & Equity",
      );
    }

    return rows;
  }, [rows, activeCardFilter]);

  const handleCardClick = (cardKey) => {
    setActiveCardFilter(activeCardFilter === cardKey ? "all" : cardKey);
  };

  const cards = [
    {
      key: "cashOpen",
      title: "Cash Opening",
      value: formatCurrency(balanceSummary.assets.cashOpening),
      icon: "fa-solid fa-wallet",
    },
    {
      key: "cashClose",
      title: "Cash Closing",
      value: formatCurrency(balanceSummary.assets.cash),
      icon: "fa-solid fa-wallet",
    },
    {
      key: "bankOpen",
      title: "Bank Opening",
      value: formatCurrency(balanceSummary.assets.bankOpening),
      icon: "fa-solid fa-building-columns",
    },
    {
      key: "bankClose",
      title: "Bank Closing",
      value: formatCurrency(balanceSummary.assets.bank),
      icon: "fa-solid fa-building-columns",
    },
    {
      key: "totalAssets",
      title: "Total Assets",
      value: formatCurrency(balanceSummary.totalAssets),
      icon: "fa-solid fa-scale-balanced",
    },
    {
      key: "totalLiabilities",
      title: "Total Liabilities",
      value: formatCurrency(balanceSummary.totalLiabilities),
      icon: "fa-solid fa-scale-unbalanced",
    },
  ];

  const balanceDifference =
    balanceSummary.totalAssets -
    (balanceSummary.totalLiabilities + balanceSummary.equity);
  const isBalanceMatched = Math.abs(balanceDifference) < 0.01;

  const getCardNumber = (index) => {
    return (index % 8) + 1;
  };

  const columns = [
    { key: "section", label: "Section", width: 220 },
    { key: "account", label: "Account", width: 260 },
    { key: "description", label: "Description", width: 320 },
    {
      key: "amount",
      label: "Amount",
      width: 160,
      render: (value, row) => (
        <span className={row?.isTotal ? "fw-bold" : "fw-semibold"}>
          {formatCurrency(value)}
        </span>
      ),
    },
  ];

  const handleRefresh = async () => {
    await loadAllData({ forceRefresh: true });
    showInfo("Balance sheet refreshed!");
  };

  return (
    <div className="container-fluid">
      <div
        className="py-3 d-flex justify-content-between align-items-center"
        style={{ marginTop: "70px" }}
      >
        {/* Left */}
        <div>
          <h4 className="fs-18 fw-semibold m-0">Balance Sheet</h4>
          <small className="text-muted">
            Assets, liabilities, and equity as of selected financial year
          </small>
        </div>

        {/* Right */}
        <div className="d-flex align-items-center gap-2">
          <span className="badge bg-light text-dark border">
            Financial Year:{" "}
            {selectedFinancialYear === "ALL"
              ? "All Year"
              : selectedFinancialYear}
          </span>

          <span
            className={`badge ${isBalanceMatched ? "bg-success" : "bg-danger"}`}
            title={
              isBalanceMatched
                ? "Assets and Liabilities + Equity are matched"
                : "Assets and Liabilities + Equity are not matched"
            }
          >
            {isBalanceMatched
              ? "Balanced"
              : `Mismatch ${formatCurrency(Math.abs(balanceDifference))}`}
          </span>

          {loading && (
            <span className="badge bg-warning text-dark">Loading...</span>
          )}
        </div>
      </div>

      <div className="row">
        {cards.map((card, index) => {
          const cardNumber = getCardNumber(index);
          const cardClass = `card${cardNumber}`;
          const cardIconBgClass = `card-icon-bg${cardNumber}`;

          return (
            <div key={card.key} className="col-md-6 col-xl-2 mb-4">
              <div
                className={`card border-0 shadow-sm overflow-hidden ${cardClass}`}
                style={{
                  transition: "all 0.3s ease",
                  cursor: "pointer",
                  height: "100%",
                  borderRadius: "12px",
                  border:
                    activeCardFilter === card.key
                      ? "2px solid #0d6efd"
                      : "1px solid #dee2e6",
                  boxShadow:
                    activeCardFilter === card.key
                      ? "0 6px 15px rgba(13, 110, 253, 0.3)"
                      : "0 0.125rem 0.25rem rgba(0, 0, 0, 0.075)",
                }}
                onClick={() => handleCardClick(card.key)}
              >
                <div className="card-body text-center p-2">
                  <div className="mb-3 mt-2 d-flex justify-content-center">
                    <span
                      className={`avatar-md rounded-circle ${cardIconBgClass} d-inline-flex justify-content-center align-items-center`}
                      style={{
                        boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
                        width: "60px",
                        height: "60px",
                      }}
                    >
                      <i className={`${card.icon} fs-3 text-white`}></i>
                    </span>
                  </div>
                  <div>
                    <h5 className="mb-2 fw-bold">{card.title}</h5>
                    <h6
                      className="mb-0 text-muted fs-6 fw-bold"
                      style={{ marginBottom: "-10px" }}
                    >
                      {card.value}
                    </h6>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <ReusableTable
        ensureCreatedByColumn={true}
        createdByLabel="Created By"
        moduleKey="balanceSheet"
        columns={columns}
        data={filteredRows}
        loading={loading}
        showActions={false}
        fixedColumns={["section"]}
        defaultVisibleColumns={["section", "account", "description", "amount"]}
        tableTitle="Balance Sheet"
        showColumnSelector={true}
        showExport={true}
        showRefresh={true}
        showAdvancedFilter={false}
        showSearch={true}
        onRefresh={handleRefresh}
        exportFileName="Balance_Sheet"
        exportTitle="Balance Sheet Report"
      />
    </div>
  );
};

export default BalanceSheet;
