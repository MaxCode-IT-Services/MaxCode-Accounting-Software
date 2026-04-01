import React, { useEffect, useMemo, useState } from "react";
import ReusableTable from "../Components/ReusableTable";
import { showError, showInfo } from "../Components/ToastNotification";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { fetchAllPaginatedEntities } from "../utils/fetchAllEntities";

const LedgerManagement = () => {
  useEffect(() => {
    document.title = "Ledger Management | MaxCode IT Services";
  }, []);

  const [financialYears, setFinancialYears] = useState([]);
  const [selectedFinancialYear, setSelectedFinancialYear] = useState(
    localStorage.getItem("selectedFinancialYear") || "ALL",
  );
  const [salesRecords, setSalesRecords] = useState([]);
  const [purchaseRecords, setPurchaseRecords] = useState([]);
  const [companyExpenseRecords, setCompanyExpenseRecords] = useState([]);
  const [rcmRecords, setRcmRecords] = useState([]);
  const [projectRecords, setProjectRecords] = useState([]);
  const [personalFundRecords, setPersonalFundRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeCardFilter, setActiveCardFilter] = useState("total");
  const [financialPeriodMode, setFinancialPeriodMode] = useState("yearly");
  const [apiStatus, setApiStatus] = useState({
    years: "idle",
    invoices: "idle",
    purchases: "idle",
    companyExpenses: "idle",
    rcm: "idle",
    projects: "idle",
    personalFunds: "idle",
  });

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
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  };

  const getRecordDate = (record) => {
    return (
      record?.invoiceDate ||
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

  const filterByFinancialYear = (records) => {
    if (!Array.isArray(records)) return [];

    const selectedRange = getSelectedYearRange();
    if (!selectedRange) return records;

    return records.filter((record) => {
      const invoiceDate = getDateOnly(getRecordDate(record));
      if (!invoiceDate) return false;
      return (
        invoiceDate >= selectedRange.startDate &&
        invoiceDate <= selectedRange.endDate
      );
    });
  };

  const filterByPeriodMode = (records) => {
    if (!Array.isArray(records)) return [];
    if (financialPeriodMode === "yearly") return records;

    const today = getDateOnly(new Date());
    if (!today) return records;

    return records.filter((record) => {
      const invoiceDate = getDateOnly(getRecordDate(record));
      if (!invoiceDate) return false;

      if (financialPeriodMode === "daily") {
        return invoiceDate.getTime() === today.getTime();
      }

      if (financialPeriodMode === "monthly") {
        return (
          invoiceDate.getFullYear() === today.getFullYear() &&
          invoiceDate.getMonth() === today.getMonth()
        );
      }

      return true;
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
    const explicitPaid = Math.max(
      toNumber(record?.amountReceived || 0),
      toNumber(record?.paidAmount || 0),
      toNumber(record?.amountPaid || 0),
    );

    if (explicitPaid > 0) {
      return Math.min(explicitPaid, totalAmount);
    }

    if (record?.paymentStatus === "Paid") {
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
    setApiStatus({
      years: "loading",
      invoices: "loading",
      purchases: "loading",
      companyExpenses: "loading",
      rcm: "loading",
      projects: "loading",
      personalFunds: "loading",
    });
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

      const yearsResult = await fetchSafe({
        endpoint: API_ENDPOINTS.YEARS.LIST,
        fallbackKeys: ["years"],
      });
      const salesResult = await fetchSafe({
        endpoint: API_ENDPOINTS.INVOICES.LIST,
        fallbackKeys: ["invoices"],
      });
      const purchaseResult = await fetchSafe({
        endpoint: API_ENDPOINTS.PURCHASES.LIST,
        fallbackKeys: ["purchases"],
      });
      const companyExpenseResult = await fetchSafe({
        endpoint: API_ENDPOINTS.COMPANY_EXPENSES.LIST,
        fallbackKeys: ["companyExpenses", "expenses"],
      });
      const rcmResult = await fetchSafe({
        endpoint: API_ENDPOINTS.RCM.LIST,
        fallbackKeys: ["records", "rcm"],
      });
      const projectsResult = await fetchSafe({
        endpoint: API_ENDPOINTS.PROJECTS.LIST,
        fallbackKeys: ["projects"],
      });

      const personalFundsResult = await fetchSafe({
        endpoint: API_ENDPOINTS.OWNER_INVESTMENTS.LIST,
        fallbackKeys: ["data", "personalFunds"],
      });

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

      if (yearsResult.status === "rejected") {
        console.error("Failed to fetch financial years:", yearsResult.reason);
      }
      if (salesResult.status === "rejected") {
        console.error("Failed to fetch invoices:", salesResult.reason);
      }
      if (purchaseResult.status === "rejected") {
        console.error("Failed to fetch purchases:", purchaseResult.reason);
      }
      if (companyExpenseResult.status === "rejected") {
        console.error(
          "Failed to fetch company expenses:",
          companyExpenseResult.reason,
        );
      }
      if (rcmResult.status === "rejected") {
        console.error("Failed to fetch RCM:", rcmResult.reason);
      }
      if (projectsResult.status === "rejected") {
        console.error("Failed to fetch projects:", projectsResult.reason);
      }
      if (personalFundsResult.status === "rejected") {
        console.error(
          "Failed to fetch personal funds:",
          personalFundsResult.reason,
        );
      }

      setFinancialYears(normalizedYears);
      setSalesRecords(
        invoicesData.map((invoice) => ({
          ...invoice,
          id: invoice._id || invoice.id,
        })),
      );
      setPurchaseRecords(
        purchasesData.map((purchase) => ({
          ...purchase,
          id: purchase._id || purchase.id,
        })),
      );
      setCompanyExpenseRecords(
        companyExpensesData.map((expense) => ({
          ...expense,
          id: expense._id || expense.id,
          invoiceDate: expense.invoiceDate || expense.expenseDate,
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
          invoiceDate: record.fundDate,
        })),
      );

      setApiStatus({
        years: yearsResult.status === "fulfilled" ? "loaded" : "failed",
        invoices: salesResult.status === "fulfilled" ? "loaded" : "failed",
        purchases: purchaseResult.status === "fulfilled" ? "loaded" : "failed",
        companyExpenses:
          companyExpenseResult.status === "fulfilled" ? "loaded" : "failed",
        rcm: rcmResult.status === "fulfilled" ? "loaded" : "failed",
        projects: projectsResult.status === "fulfilled" ? "loaded" : "failed",
        personalFunds:
          personalFundsResult.status === "fulfilled" ? "loaded" : "failed",
      });

      if (
        yearsResult.status === "rejected" ||
        salesResult.status === "rejected" ||
        purchaseResult.status === "rejected" ||
        companyExpenseResult.status === "rejected" ||
        rcmResult.status === "rejected" ||
        projectsResult.status === "rejected" ||
        personalFundsResult.status === "rejected"
      ) {
        showInfo("Some ledger data could not be loaded. Please refresh again.");
      }
    } catch (error) {
      console.error("Failed to load ledger data:", error);
      showError("Failed to fetch ledger data");
      setFinancialYears([]);
      setSalesRecords([]);
      setPurchaseRecords([]);
      setCompanyExpenseRecords([]);
      setRcmRecords([]);
      setProjectRecords([]);
      setPersonalFundRecords([]);
      setApiStatus({
        years: "failed",
        invoices: "failed",
        purchases: "failed",
        companyExpenses: "failed",
        rcm: "failed",
        projects: "failed",
        personalFunds: "failed",
      });
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadgeClass = (status) => {
    if (status === "loaded") return "bg-success";
    if (status === "failed") return "bg-danger";
    if (status === "loading") return "bg-warning";
    return "bg-secondary";
  };

  const getStatusLabel = (status) => {
    if (status === "loaded") return "Loaded";
    if (status === "failed") return "Failed";
    if (status === "loading") return "Loading";
    return "Idle";
  };

  const renderStatusContent = (name, status) => {
    return (
      <>
        {name}:{" "}
        {status === "loading" && (
          <i className="fa-solid fa-spinner fa-spin me-1" />
        )}
        {getStatusLabel(status)}
      </>
    );
  };

  const retrySingleApi = async (apiKey, options = {}) => {
    if (!apiKey) return;

    const { silent = false } = options;

    setApiStatus((prev) => ({
      ...prev,
      [apiKey]: "loading",
    }));

    try {
      if (apiKey === "years") {
        const yearsData = await fetchAllPaginatedEntities({
          endpoint: API_ENDPOINTS.YEARS.LIST,
          fallbackKeys: ["years"],
          forceRefresh: true,
        });

        const normalizedYears = yearsData
          .filter((yearRecord) => yearRecord?.isDeleted !== true)
          .map((yearRecord) => ({
            ...yearRecord,
            id: yearRecord.id || yearRecord._id,
            value: yearRecord.financialYear || yearRecord.year,
          }));

        setFinancialYears(normalizedYears);
      }

      if (apiKey === "invoices") {
        const invoicesData = await fetchAllPaginatedEntities({
          endpoint: API_ENDPOINTS.INVOICES.LIST,
          fallbackKeys: ["invoices"],
          forceRefresh: true,
        });

        setSalesRecords(
          invoicesData.map((invoice) => ({
            ...invoice,
            id: invoice._id || invoice.id,
          })),
        );
      }

      if (apiKey === "purchases") {
        const purchasesData = await fetchAllPaginatedEntities({
          endpoint: API_ENDPOINTS.PURCHASES.LIST,
          fallbackKeys: ["purchases"],
          forceRefresh: true,
        });

        setPurchaseRecords(
          purchasesData.map((purchase) => ({
            ...purchase,
            id: purchase._id || purchase.id,
          })),
        );
      }

      if (apiKey === "companyExpenses") {
        const expensesData = await fetchAllPaginatedEntities({
          endpoint: API_ENDPOINTS.COMPANY_EXPENSES.LIST,
          fallbackKeys: ["companyExpenses", "expenses"],
          forceRefresh: true,
        });

        setCompanyExpenseRecords(
          expensesData.map((expense) => ({
            ...expense,
            id: expense._id || expense.id,
            invoiceDate: expense.invoiceDate || expense.expenseDate,
          })),
        );
      }

      if (apiKey === "rcm") {
        const rcmData = await fetchAllPaginatedEntities({
          endpoint: API_ENDPOINTS.RCM.LIST,
          fallbackKeys: ["records", "rcm"],
          forceRefresh: true,
        });

        setRcmRecords(
          rcmData.map((record) => ({
            ...record,
            id: record._id || record.id,
          })),
        );
      }

      if (apiKey === "projects") {
        const projectsData = await fetchAllPaginatedEntities({
          endpoint: API_ENDPOINTS.PROJECTS.LIST,
          fallbackKeys: ["projects"],
          forceRefresh: true,
        });

        setProjectRecords(
          projectsData.map((record) => ({
            ...record,
            id: record._id || record.id,
          })),
        );
      }

      if (apiKey === "personalFunds") {
        const fundsData = await fetchAllPaginatedEntities({
          endpoint: API_ENDPOINTS.OWNER_INVESTMENTS.LIST,
          fallbackKeys: ["data", "personalFunds"],
          forceRefresh: true,
        });
        setPersonalFundRecords(
          fundsData.map((record) => ({
            ...record,
            id: record._id || record.id,
            invoiceDate: record.fundDate,
          })),
        );
      }

      setApiStatus((prev) => ({
        ...prev,
        [apiKey]: "loaded",
      }));
      if (!silent) {
        showInfo(`${apiKey.toUpperCase()} API retried successfully.`);
      }
      return true;
    } catch (error) {
      console.error(`Failed to retry ${apiKey} API:`, error);
      setApiStatus((prev) => ({
        ...prev,
        [apiKey]: "failed",
      }));
      if (!silent) {
        showError(`Failed to retry ${apiKey} API.`);
      }
      return false;
    }
  };

  const failedApiKeys = useMemo(() => {
    return Object.entries(apiStatus)
      .filter(([, status]) => status === "failed")
      .map(([key]) => key);
  }, [apiStatus]);

  const isAnyApiLoading = useMemo(() => {
    return Object.values(apiStatus).some((status) => status === "loading");
  }, [apiStatus]);

  const retryAllFailedApis = async () => {
    if (!failedApiKeys.length) return;

    const results = await Promise.all(
      failedApiKeys.map((apiKey) => retrySingleApi(apiKey, { silent: true })),
    );

    const successCount = results.filter(Boolean).length;
    const failedCount = results.length - successCount;

    if (failedCount === 0) {
      showInfo("All failed APIs retried successfully.");
      return;
    }

    showError(
      `${failedCount} API retry failed. ${successCount} API retried successfully.`,
    );
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

  const filteredSales = useMemo(() => {
    return filterByPeriodMode(filterByFinancialYear(salesRecords));
  }, [
    salesRecords,
    selectedFinancialYear,
    financialYears,
    financialPeriodMode,
  ]);

  const filteredPurchases = useMemo(() => {
    return filterByPeriodMode(filterByFinancialYear(purchaseRecords));
  }, [
    purchaseRecords,
    selectedFinancialYear,
    financialYears,
    financialPeriodMode,
  ]);

  const filteredCompanyExpenses = useMemo(() => {
    return filterByPeriodMode(filterByFinancialYear(companyExpenseRecords));
  }, [
    companyExpenseRecords,
    selectedFinancialYear,
    financialYears,
    financialPeriodMode,
  ]);

  const filteredRcm = useMemo(() => {
    return filterByPeriodMode(filterByFinancialYear(rcmRecords));
  }, [rcmRecords, selectedFinancialYear, financialYears, financialPeriodMode]);

  const filteredPersonalFunds = useMemo(() => {
    return filterByPeriodMode(filterByFinancialYear(personalFundRecords));
  }, [
    personalFundRecords,
    selectedFinancialYear,
    financialYears,
    financialPeriodMode,
  ]);

  const projectPayoutEntries = useMemo(() => {
    const selectedRange = getSelectedYearRange();
    const today = getDateOnly(new Date());

    return projectRecords.flatMap((project) => {
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
          const payoutAmount = toNumber(transaction.payoutAmount || 0);

          if (!payoutDateOnly || payoutAmount <= 0) {
            return null;
          }

          if (selectedRange) {
            const isWithinYear =
              payoutDateOnly >= selectedRange.startDate &&
              payoutDateOnly <= selectedRange.endDate;
            if (!isWithinYear) return null;
          }

          if (financialPeriodMode === "daily") {
            if (!today || payoutDateOnly.getTime() !== today.getTime()) {
              return null;
            }
          } else if (financialPeriodMode === "monthly") {
            if (
              !today ||
              payoutDateOnly.getFullYear() !== today.getFullYear() ||
              payoutDateOnly.getMonth() !== today.getMonth()
            ) {
              return null;
            }
          }

          return {
            amount: payoutAmount,
            paymentMethod: transaction.payoutMethod || "Bank Transfer",
            payoutSource: transaction.payoutSource || "Business Account",
          };
        })
        .filter(Boolean);
    });
  }, [
    projectRecords,
    selectedFinancialYear,
    financialYears,
    financialPeriodMode,
  ]);

  const ledgerSummary = useMemo(() => {
    const totals = {
      cashDebit: 0,
      cashCredit: 0,
      bankDebit: 0,
      bankCredit: 0,
      salesCredit: 0,
      purchaseDebit: 0,
      companyExpenseDebit: 0,
      gstOutputCredit: 0,
      gstInputDebit: 0,
      sundryDebtorsDebit: 0,
      sundryCreditorsCredit: 0,
      ownerFundingCredit: 0,
      personalFundCredit: 0,
      salesTaxOutput: 0,
      purchaseItcInput: 0,
      rcmTaxOutput: 0,
      rcmTaxInput: 0,
      projectPayoutDebit: 0,
      openingGstInput: 0,
      totalDebit: 0,
      totalCredit: 0,
    };

    const selectedYear = getSelectedYearRecord();
    const openingGstInput =
      getOpeningBalance(selectedYear, ["openingCgstItc", "openingItcCgst"]) +
      getOpeningBalance(selectedYear, ["openingSgstItc", "openingItcSgst"]) +
      getOpeningBalance(selectedYear, ["openingIgstItc", "openingItcIgst"]) +
      getOpeningBalance(selectedYear, ["openingItc", "openingGstInput"]);

    totals.openingGstInput = openingGstInput;
    totals.gstInputDebit += openingGstInput;
    totals.purchaseItcInput += openingGstInput;

    filteredSales.forEach((record) => {
      const totalAmount = getTotalAmount(record);
      const taxAmount = getTaxAmount(record);
      const taxableAmount = getTaxableAmount(record);
      const paidAmount = getPaidAmount(record, totalAmount);

      totals.salesCredit += taxableAmount;
      totals.gstOutputCredit += taxAmount;
      totals.salesTaxOutput += taxAmount;
      totals.sundryDebtorsDebit += Math.max(totalAmount - paidAmount, 0);

      if (isCashPayment(record.paymentMethod)) {
        totals.cashDebit += paidAmount;
      } else if (isBankPayment(record.paymentMethod)) {
        totals.bankDebit += paidAmount;
      }
    });

    filteredCompanyExpenses.forEach((record) => {
      const totalAmount = getTotalAmount(record);
      const paidAmount = getPaidAmount(record, totalAmount);

      totals.companyExpenseDebit += totalAmount;
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
    });

    filteredPurchases.forEach((record) => {
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
        totals.purchaseItcInput += taxAmount;
      } else {
        totals.purchaseDebit += taxAmount;
      }
    });

    filteredRcm.forEach((record) => {
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
      totals.rcmTaxOutput += taxAmount;
      totals.rcmTaxInput += taxAmount;
      totals.sundryCreditorsCredit += Math.max(taxableAmount - paidAmount, 0);

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
    });

    projectPayoutEntries.forEach((entry) => {
      totals.projectPayoutDebit += entry.amount;

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

    filteredPersonalFunds.forEach((fund) => {
      const amount = toNumber(fund.amount || 0);
      if (amount <= 0) return;
      totals.personalFundCredit += amount;
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

    totals.totalDebit =
      totals.cashDebit +
      totals.bankDebit +
      totals.purchaseDebit +
      totals.companyExpenseDebit +
      totals.projectPayoutDebit +
      totals.gstInputDebit +
      totals.sundryDebtorsDebit;

    totals.totalCredit =
      totals.cashCredit +
      totals.bankCredit +
      totals.salesCredit +
      totals.gstOutputCredit +
      totals.sundryCreditorsCredit +
      totals.ownerFundingCredit +
      totals.personalFundCredit;

    return totals;
  }, [
    filteredPurchases,
    filteredCompanyExpenses,
    filteredRcm,
    filteredSales,
    projectPayoutEntries,
    filteredPersonalFunds,
  ]);

  const getBalanceMeta = (debit, credit) => {
    const diff = toNumber(debit) - toNumber(credit);

    if (diff > 0) {
      return {
        text: `+ ${formatCurrency(diff)} Dr`,
        className: "text-success",
      };
    }

    if (diff < 0) {
      return {
        text: `- ${formatCurrency(Math.abs(diff))} Cr`,
        className: "text-danger",
      };
    }

    return {
      text: formatCurrency(0),
      className: "text-muted",
    };
  };

  const buildBalanceCell = (debit, credit) => {
    return getBalanceMeta(debit, credit).text;
  };

  const buildLedgerDescription = (accountName) => {
    const balanceMeaning =
      "Balance = Debit - Credit. + (Dr) ka matlab amount aana/receivable, - (Cr) ka matlab amount dena/payable.";

    if (accountName === "Cash Account") {
      return `Debit: cash receive hua. Credit: cash payment gaya. ${balanceMeaning}`;
    }

    if (accountName === "Bank Account") {
      return `Debit: bank/UPI me paisa aaya. Credit: bank/UPI se payment gaya. ${balanceMeaning}`;
    }

    if (accountName === "Sales Account") {
      return `Debit: sales return/adjustment hota hai (normally 0). Credit: sales value book hoti hai. ${balanceMeaning}`;
    }

    if (accountName === "Purchase Account") {
      return `Debit: purchase value book hoti hai. Credit: purchase return/adjustment hota hai (normally 0). ${balanceMeaning}`;
    }

    if (accountName === "Company Expense Account") {
      return `Debit: bina GST ya bina invoice wale business expenses book hote hain. Credit: expense reversal/adjustment hota hai (normally 0). ${balanceMeaning}`;
    }

    if (accountName === "Project Cost Account") {
      return `Debit: project ke developer/third-party payouts book hote hain. Credit: project cost reversal/adjustment hota hai (normally 0). ${balanceMeaning}`;
    }

    if (accountName === "GST Output Account") {
      return `Debit: output GST adjustment/reversal ho sakta hai. Credit: bechi hui supply par GST payable banta hai. ${balanceMeaning}`;
    }

    if (accountName === "GST Input Account") {
      return `Debit: input GST (ITC) milta hai. Credit: ITC reversal/adjustment hota hai. ${balanceMeaning}`;
    }

    if (accountName === "Sundry Debtors Account") {
      return `Debit: customer se lena baki hai. Credit: debtor ne payment kar diya. ${balanceMeaning}`;
    }

    if (accountName === "Sundry Creditors Account") {
      return `Debit: creditor ko payment/adjustment kiya. Credit: supplier ko dena baki hai. ${balanceMeaning}`;
    }

    if (accountName === "GST Payable/(Receivable)") {
      return `Debit: GST receivable/refund side. Credit: net GST payable side. ${balanceMeaning}`;
    }

    if (accountName === "Owner Funding Account") {
      return `Credit: owner/personal account se ki gayi business payment. Debit: owner settlement ya reversal. ${balanceMeaning}`;
    }

    if (accountName === "Owner Investment Account") {
      return `Credit: owner capital/investment jo business bank/cash account me transfer hua. Debit: reversal/adjustment (normally 0). ${balanceMeaning}`;
    }

    return `Debit: left side posting. Credit: right side posting. ${balanceMeaning}`;
  };

  const ledgerRows = useMemo(() => {
    const rows = [
      {
        accountName: "Cash Account",
        debit: ledgerSummary.cashDebit,
        credit: ledgerSummary.cashCredit,
        notes: "Cash receipt from sales and cash payment in purchase/RCM",
      },
      {
        accountName: "Bank Account",
        debit: ledgerSummary.bankDebit,
        credit: ledgerSummary.bankCredit,
        notes: "Bank/UPI/Card/Cheque receipt and payment",
      },
      {
        accountName: "Sales Account",
        debit: 0,
        credit: ledgerSummary.salesCredit,
        notes: "Sales taxable value credited",
      },
      {
        accountName: "Purchase Account",
        debit: ledgerSummary.purchaseDebit,
        credit: 0,
        notes: "Purchase and RCM taxable value debited",
      },
      {
        accountName: "Company Expense Account",
        debit: ledgerSummary.companyExpenseDebit,
        credit: 0,
        notes: "No-GST or bill-less business expenses debited",
      },
      {
        accountName: "Project Cost Account",
        debit: ledgerSummary.projectPayoutDebit,
        credit: 0,
        notes: "Developer and third-party project payouts from Project Details",
      },
      {
        accountName: "GST Output Account",
        debit: 0,
        credit: ledgerSummary.gstOutputCredit,
        notes: "Sales tax + RCM tax payable to government",
      },
      {
        accountName: "GST Input Account",
        debit: ledgerSummary.gstInputDebit,
        credit: 0,
        notes: "Opening ITC + Purchase ITC tax + RCM tax reclaimable",
      },
      {
        accountName: "Sundry Debtors Account",
        debit: ledgerSummary.sundryDebtorsDebit,
        credit: 0,
        notes: "Sales invoices not yet fully received",
      },
      {
        accountName: "Sundry Creditors Account",
        debit: 0,
        credit: ledgerSummary.sundryCreditorsCredit,
        notes: "Purchase/RCM invoices not yet fully paid",
        selectedFinancialYear,
        financialYears,
      },
      {
        accountName: "Owner Funding Account",
        debit: 0,
        credit: ledgerSummary.ownerFundingCredit,
        notes: "Purchases/RCM/payouts paid from owner personal account",
      },
      {
        accountName: "Owner Investment Account",
        debit: 0,
        credit: ledgerSummary.personalFundCredit,
        notes: "Owner capital transferred to business bank/cash",
      },
      {
        accountName: "GST Payable/(Receivable)",
        debit: Math.max(
          ledgerSummary.gstInputDebit - ledgerSummary.gstOutputCredit,
          0,
        ),
        credit: Math.max(
          ledgerSummary.gstOutputCredit - ledgerSummary.gstInputDebit,
          0,
        ),
        notes: "Net GST position after input set-off",
      },
    ];

    return rows.map((row, index) => {
      const balanceMeta = getBalanceMeta(row.debit, row.credit);

      return {
        ...row,
        sn: index + 1,
        balance: balanceMeta.text,
        balanceClass: balanceMeta.className,
        description: buildLedgerDescription(row.accountName),
      };
    });
  }, [ledgerSummary]);

  const cards = [
    {
      key: "total",
      title: "Total Debit",
      value: formatCurrency(ledgerSummary.totalDebit),
      icon: "fa-solid fa-arrow-trend-up",
      colorClass: "text-success",
    },
    {
      key: "credit",
      title: "Total Credit",
      value: formatCurrency(ledgerSummary.totalCredit),
      icon: "fa-solid fa-arrow-trend-down",
      colorClass: "text-danger",
    },
    {
      key: "cash",
      title: "Cash Closing",
      value: buildBalanceCell(
        ledgerSummary.cashDebit,
        ledgerSummary.cashCredit,
      ),
      icon: "fa-solid fa-wallet",
      colorClass: "text-primary",
    },
    {
      key: "bank",
      title: "Bank Closing",
      value: buildBalanceCell(
        ledgerSummary.bankDebit,
        ledgerSummary.bankCredit,
      ),
      icon: "fa-solid fa-building-columns",
      colorClass: "text-info",
    },
    {
      key: "gst",
      title: "GST Net",
      value: buildBalanceCell(
        ledgerSummary.gstInputDebit,
        ledgerSummary.gstOutputCredit,
      ),
      icon: "fa-solid fa-receipt",
      colorClass: "text-warning",
    },
    {
      key: "year",
      title: "Financial Year",
      value: `${
        selectedFinancialYear === "ALL" ? "All Year" : selectedFinancialYear
      } • ${
        financialPeriodMode.charAt(0).toUpperCase() +
        financialPeriodMode.slice(1)
      }`,
      icon: "fa-regular fa-calendar-days",
      colorClass: "text-secondary",
    },
  ];

  const getCardNumber = (index) => {
    return (index % 8) + 1;
  };

  const handleCardClick = (cardKey) => {
    if (cardKey === "year") {
      const periodCycle = ["daily", "monthly", "yearly"];
      setFinancialPeriodMode((prev) => {
        const currentIndex = periodCycle.indexOf(prev);
        if (currentIndex === -1) return "daily";
        return periodCycle[(currentIndex + 1) % periodCycle.length];
      });
    }
    setActiveCardFilter(cardKey);
  };

  const filteredLedgerRows = useMemo(() => {
    if (activeCardFilter === "total") {
      return ledgerRows;
    }

    if (activeCardFilter === "credit") {
      return ledgerRows.filter((row) =>
        [
          "Sales Account",
          "GST Output Account",
          "Sundry Creditors Account",
          "Owner Funding Account",
          "Personal Fund Account",
          "GST Payable/(Receivable)",
        ].includes(row.accountName),
      );
    }

    if (activeCardFilter === "cash") {
      return ledgerRows.filter((row) => row.accountName === "Cash Account");
    }

    if (activeCardFilter === "bank") {
      return ledgerRows.filter((row) => row.accountName === "Bank Account");
    }

    if (activeCardFilter === "gst") {
      return ledgerRows.filter((row) =>
        [
          "GST Output Account",
          "GST Input Account",
          "GST Payable/(Receivable)",
        ].includes(row.accountName),
      );
    }

    if (activeCardFilter === "year") {
      return ledgerRows;
    }

    return ledgerRows;
  }, [activeCardFilter, ledgerRows]);

  const columns = [
    { key: "sn", label: "S.No", width: 70 },
    { key: "accountName", label: "Ledger Account", width: 220 },
    {
      key: "debit",
      label: "Debit",
      width: 140,
      render: (value) => (
        <span className="fw-semibold">{formatCurrency(value)}</span>
      ),
    },
    {
      key: "credit",
      label: "Credit",
      width: 140,
      render: (value) => (
        <span className="fw-semibold">{formatCurrency(value)}</span>
      ),
    },
    {
      key: "balance",
      label: "Balance",
      width: 160,
      render: (value, row) => (
        <span className={`fw-semibold ${row?.balanceClass || "text-muted"}`}>
          {value}
        </span>
      ),
    },
    { key: "notes", label: "Ledger Logic", width: 340 },
    { key: "description", label: "Description", width: 420 },
  ];

  const handleRefresh = async () => {
    await loadAllData({ forceRefresh: true });
    showInfo("Ledger refreshed!");
  };

  return (
    <div className="container-fluid">
      <div
        className="py-3 d-flex justify-content-between align-items-start flex-wrap"
        style={{ marginTop: "70px" }}
      >
        {/* LEFT SIDE - Heading */}
        <div>
          <h4 className="fs-18 fw-semibold m-0">Ledger Management</h4>
          <small className="text-muted">
            Sales, Purchase, RCM and Project payout based ledger summary
          </small>
        </div>

        {/* RIGHT SIDE - Badges + Button */}
        <div className="d-flex flex-wrap gap-2 mt-2 mt-sm-0 justify-content-end">
          <span className="badge bg-light text-dark border d-inline-flex align-items-center">
            API Status
          </span>

          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            onClick={retryAllFailedApis}
            disabled={!failedApiKeys.length || isAnyApiLoading}
            title={
              failedApiKeys.length
                ? "Retry all failed APIs"
                : "No failed APIs to retry"
            }
          >
            <i className="fa-solid fa-rotate me-1"></i>
            Retry All Failed
          </button>

          <span
            className={`badge ${getStatusBadgeClass(apiStatus.years)} d-inline-flex align-items-center`}
            style={{
              cursor: apiStatus.years === "failed" ? "pointer" : "default",
            }}
            onClick={() =>
              apiStatus.years === "failed" && retrySingleApi("years")
            }
          >
            {renderStatusContent("Years", apiStatus.years)}
          </span>

          <span
            className={`badge ${getStatusBadgeClass(apiStatus.invoices)} d-inline-flex align-items-center`}
            style={{
              cursor: apiStatus.invoices === "failed" ? "pointer" : "default",
            }}
            onClick={() =>
              apiStatus.invoices === "failed" && retrySingleApi("invoices")
            }
          >
            {renderStatusContent("Invoices", apiStatus.invoices)}
          </span>

          <span
            className={`badge ${getStatusBadgeClass(apiStatus.purchases)} d-inline-flex align-items-center`}
            style={{
              cursor: apiStatus.purchases === "failed" ? "pointer" : "default",
            }}
            onClick={() =>
              apiStatus.purchases === "failed" && retrySingleApi("purchases")
            }
          >
            {renderStatusContent("Purchases", apiStatus.purchases)}
          </span>

          <span
            className={`badge ${getStatusBadgeClass(apiStatus.rcm)} d-inline-flex align-items-center`}
            style={{
              cursor: apiStatus.rcm === "failed" ? "pointer" : "default",
            }}
            onClick={() => apiStatus.rcm === "failed" && retrySingleApi("rcm")}
          >
            {renderStatusContent("RCM", apiStatus.rcm)}
          </span>

          <span
            className={`badge ${getStatusBadgeClass(apiStatus.projects)} d-inline-flex align-items-center`}
            style={{
              cursor: apiStatus.projects === "failed" ? "pointer" : "default",
            }}
            onClick={() =>
              apiStatus.projects === "failed" && retrySingleApi("projects")
            }
          >
            {renderStatusContent("Projects", apiStatus.projects)}
          </span>
        </div>
      </div>

      <div className="row">
        {cards.map((card, index) => {
          const cardNumber = getCardNumber(index);
          const cardClass = `card${cardNumber}`;
          const cardIconBgClass = `card-icon-bg${cardNumber}`;
          const isActive = activeCardFilter === card.key;

          return (
            <div key={card.title} className="col-md-6 col-xl-2 mb-4">
              <div
                className={`card border-0 shadow-sm overflow-hidden ${cardClass}`}
                style={{
                  transition: "all 0.3s ease",
                  cursor: "pointer",
                  height: "100%",
                  borderRadius: "12px",
                  border: isActive ? "2px solid #0d6efd" : "1px solid #dee2e6",
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
        columns={columns}
        data={filteredLedgerRows}
        loading={loading}
        showActions={false}
        fixedColumns={["sn"]}
        defaultVisibleColumns={[
          "sn",
          "accountName",
          "debit",
          "credit",
          "balance",
          "notes",
        ]}
        tableTitle="Ledger Register"
        showColumnSelector={true}
        showExport={true}
        showRefresh={true}
        showAdvancedFilter={true}
        showSearch={true}
        onRefresh={handleRefresh}
        exportFileName="Ledger_Management"
        exportTitle="Ledger Management Report"
      />
    </div>
  );
};

export default LedgerManagement;
