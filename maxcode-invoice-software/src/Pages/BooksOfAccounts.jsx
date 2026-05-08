import React, { useEffect, useMemo, useState, useRef } from "react";
import ReusableTable from "../Components/ReusableTable";
import {
  showError,
  showInfo,
  showSuccess,
} from "../Components/ToastNotification";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { apiGet, apiPost } from "../utils/api";
import { hasActionPermission } from "../utils/permissions";

const BooksOfAccounts = () => {
  const moduleKey = "booksOfAccounts";

  useEffect(() => {
    document.title = "Books of Accounts | MaxCode IT Services";
  }, []);

  // Server-side mode state, fetched from backend user preferences
  const [serverSide, setServerSide] = useState(true);
  const [prefLoading, setPrefLoading] = useState(true);

  // Fetch user preference on mount
  useEffect(() => {
    const fetchPreference = async () => {
      try {
        const res = await apiGet("/user-preferences");
        const prefValue =
          res.data?.booksOfAccountsServerSide ??
          res.data?.detailedLedgerManagementServerSide;
        if (typeof prefValue === "boolean") {
          setServerSide(prefValue);
        }
      } catch (e) {
        // fallback: do nothing, keep default
      } finally {
        setPrefLoading(false);
      }
    };
    fetchPreference();
  }, []);

  // Save preference to backend when toggled
  useEffect(() => {
    if (prefLoading) return;
    const savePreference = async () => {
      try {
        await apiPost("/user-preferences", {
          booksOfAccountsServerSide: serverSide,
          detailedLedgerManagementServerSide: serverSide,
        });
      } catch (e) {
        // ignore
      }
    };
    savePreference();
  }, [serverSide, prefLoading]);

  const [financialYears, setFinancialYears] = useState([]);
  const [selectedFinancialYear, setSelectedFinancialYear] = useState(
    localStorage.getItem("selectedFinancialYear") || "ALL",
  );

  // Client-side records
  const [salesRecords, setSalesRecords] = useState([]);
  const [purchaseRecords, setPurchaseRecords] = useState([]);
  const [companyExpenseRecords, setCompanyExpenseRecords] = useState([]);
  const [rcmRecords, setRcmRecords] = useState([]);
  const [projectRecords, setProjectRecords] = useState([]);

  // Server-side records
  const [serverSideLedgerRecords, setServerSideLedgerRecords] = useState([]);

  const [loading, setLoading] = useState(false);
  const [financialPeriodMode, setFinancialPeriodMode] = useState("yearly");
  const [recordTypeMode, setRecordTypeMode] = useState("all");
  const [totalRecords, setTotalRecords] = useState(0);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(10);

  // Filter state for server-side
  const [filters, setFilters] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState(null);
  const [sortDirection, setSortDirection] = useState("normal");
  const [dynamicFilterOptions, setDynamicFilterOptions] = useState({});

  // Debounce refs
  const debounceTimeoutRef = useRef(null);
  const debounceColumnTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Statistics state
  const [statistics, setStatistics] = useState({
    outputGst: 0,
    inputGst: 0,
    rcmTax: 0,
    totalPayable: 0,
  });

  // Columns with date range filter
  const columnsWithDateFilter = ["date"];

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

  const formatDateForDisplay = (dateString) => {
    if (!dateString) return "-";

    try {
      const date = new Date(dateString);
      if (!Number.isNaN(date.getTime())) {
        const day = String(date.getDate()).padStart(2, "0");
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
      }
      return dateString;
    } catch (e) {
      return dateString;
    }
  };

  const formatDateTimeForDisplay = (dateString) => {
    if (!dateString) return "";

    try {
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        const day = String(date.getDate()).padStart(2, "0");
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const year = date.getFullYear();

        let hours = date.getHours();
        const minutes = String(date.getMinutes()).padStart(2, "0");
        const seconds = String(date.getSeconds()).padStart(2, "0");
        const ampm = hours >= 12 ? "PM" : "AM";

        hours = hours % 12;
        hours = hours ? hours : 12;
        const formattedHours = String(hours).padStart(2, "0");

        return `${day}-${month}-${year} | ${formattedHours}:${minutes}:${seconds} ${ampm}`;
      }

      return dateString;
    } catch (e) {
      return dateString;
    }
  };

  const getDateOnly = (value) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
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
    const taxable = toNumber(taxData.taxableAmount || taxData.subtotal || 0);
    if (taxable > 0) return taxable;

    const totalAmount = toNumber(taxData.totalAmount || 0);
    const taxAmount = getTaxAmount(record);
    return Math.max(totalAmount - taxAmount, 0);
  };

  const getTotalAmount = (record) =>
    toNumber(record?.taxData?.totalAmount || record?.amount || 0);

  const getReceivedAmount = (record, totalAmount) => {
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

  const getPeriodDisplay = (invoiceDate, mode) => {
    const date = getDateOnly(invoiceDate);
    if (!date) return "-";

    if (mode === "daily") {
      return formatDateForDisplay(invoiceDate);
    }

    if (mode === "monthly") {
      const month = String(date.getMonth() + 1).padStart(2, "0");
      return `${month}/${date.getFullYear()}`;
    }

    if (mode === "quarterly") {
      const quarter = Math.floor(date.getMonth() / 3) + 1;
      return `Q${quarter}/${date.getFullYear()}`;
    }

    if (mode === "halfYearly") {
      const half = date.getMonth() < 6 ? "H1" : "H2";
      return `${half}/${date.getFullYear()}`;
    }

    return String(date.getFullYear());
  };

  const getPeriodDisplayValue = () => {
    return financialPeriodMode === "daily"
      ? "Daily"
      : financialPeriodMode === "monthly"
        ? "Monthly"
        : financialPeriodMode === "quarterly"
          ? "Quarterly"
          : financialPeriodMode === "halfYearly"
            ? "Half Yearly"
            : "Yearly";
  };

  // Fetch financial years
  const fetchFinancialYears = async () => {
    try {
      const response = await apiGet(API_ENDPOINTS.YEARS.LIST);
      const yearsData = Array.isArray(response.data)
        ? response.data
        : response.data?.years || [];

      const normalizedYears = yearsData
        .filter((yearRecord) => yearRecord?.isDeleted !== true)
        .map((yearRecord) => ({
          ...yearRecord,
          id: yearRecord.id || yearRecord._id,
          value: yearRecord.financialYear || yearRecord.year,
        }));

      setFinancialYears(normalizedYears);
    } catch (error) {
      console.error("Financial years API fetch error:", error);
      setFinancialYears([]);
    }
  };

  // Listen for financial year changes
  useEffect(() => {
    const handleFinancialYearSelectionChanged = (event) => {
      const selectedYear =
        event?.detail?.selectedFinancialYear ||
        localStorage.getItem("selectedFinancialYear") ||
        "ALL";
      setSelectedFinancialYear(selectedYear);
      if (serverSide) {
        setCurrentPage(1);
      }
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
  }, [serverSide]);

  // Fetch all data from APIs
  const fetchAllData = async () => {
    // Cancel previous request if running
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new controller
    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (prefLoading) return;
    setLoading(true);

    try {
      if (serverSide) {
        // Server-side mode - fetch paginated data from combined endpoint
        await fetchServerSideLedgerData(controller.signal);
      } else {
        // Client-side mode - fetch all data
        await fetchClientSideAllData(controller.signal);
      }
    } catch (err) {
      if (err.name === "CanceledError" || err.name === "AbortError") {
        return;
      }
      console.error("Failed to fetch books of accounts data:", err);
      showError("Failed to fetch books of accounts data");
    } finally {
      setLoading(false);
    }
  };

  // Server-side data fetching
  const fetchServerSideLedgerData = async (signal) => {
    try {
      let url = API_ENDPOINTS.BOOKS_OF_ACCOUNTS.LIST;
      const params = new URLSearchParams();

      // Add pagination params
      params.append("page", currentPage);
      params.append("limit", recordsPerPage);

      // Add search term
      if (searchTerm) {
        params.append("search", searchTerm);
      }

      // Add financial year filter
      if (selectedFinancialYear && selectedFinancialYear !== "ALL") {
        params.append("financialYear", selectedFinancialYear);
      }

      // Add period filter
      if (financialPeriodMode && financialPeriodMode !== "yearly") {
        params.append("period", financialPeriodMode);
      }

      // Add record type filter
      if (recordTypeMode && recordTypeMode !== "all") {
        params.append("recordType", recordTypeMode);
      }

      // Only send valid filters
      Object.entries(filters).forEach(([key, value]) => {
        if (["sn", "action"].includes(key)) return;
        if (
          value === undefined ||
          value === null ||
          value === "" ||
          value === "All"
        )
          return;

        // Handle date range filters
        if (columnsWithDateFilter.includes(key)) {
          if (value && typeof value === "object") {
            if (value.startDate) {
              params.append(`${key}_start`, value.startDate);
            }
            if (value.endDate) {
              params.append(`${key}_end`, value.endDate);
            }
          }
        } else {
          if (Array.isArray(value) && value.length > 0) {
            params.append(key, value.join(","));
          } else if (!Array.isArray(value)) {
            params.append(key, value);
          }
        }
      });

      // Add sorting
      if (sortField && sortDirection !== "normal") {
        params.append("sortBy", sortField);
        params.append(
          "sortOrder",
          sortDirection === "ascending" ? "asc" : "desc",
        );
      }

      url = `${url}?${params.toString()}`;

      const response = await apiGet(url, { signal });

      // Process server response
      const ledgerData = response.data?.data || [];
      const total =
        response.data?.pagination?.totalRecords || ledgerData.length;

      // Update statistics from response
      if (response.data?.statistics) {
        setStatistics(response.data.statistics);
      }

      // Update filter options
      if (response.data?.filterOptions) {
        setDynamicFilterOptions(response.data.filterOptions);
      }

      // Map the data for display
      const mappedData = mapLedgerData(ledgerData);
      setServerSideLedgerRecords(mappedData);
      setTotalRecords(total);
    } catch (err) {
      if (err.name === "CanceledError" || err.name === "AbortError") {
        return;
      }
      throw err;
    }
  };

  // Client-side data fetching - load all data
  const fetchClientSideAllData = async (signal) => {
    try {
      const [
        yearsResult,
        salesResult,
        purchaseResult,
        companyExpenseResult,
        rcmResult,
        projectsResult,
      ] = await Promise.allSettled([
        apiGet(API_ENDPOINTS.YEARS.LIST, { signal }),
        apiGet(API_ENDPOINTS.INVOICES.LIST, { signal }),
        apiGet(API_ENDPOINTS.PURCHASES.LIST, { signal }),
        apiGet(API_ENDPOINTS.COMPANY_EXPENSES.LIST, { signal }),
        apiGet(API_ENDPOINTS.RCM.LIST, { signal }),
        apiGet(API_ENDPOINTS.PROJECTS.LIST, { signal }),
      ]);

      const yearsData =
        yearsResult.status === "fulfilled"
          ? Array.isArray(yearsResult.value.data)
            ? yearsResult.value.data
            : yearsResult.value.data?.years || []
          : [];

      const normalizedYears = yearsData
        .filter((yearRecord) => yearRecord?.isDeleted !== true)
        .map((yearRecord) => ({
          ...yearRecord,
          id: yearRecord.id || yearRecord._id,
          value: yearRecord.financialYear || yearRecord.year,
        }));

      const invoicesData =
        salesResult.status === "fulfilled"
          ? Array.isArray(salesResult.value.data)
            ? salesResult.value.data
            : salesResult.value.data?.data ||
              salesResult.value.data?.invoices ||
              []
          : [];

      const purchasesData =
        purchaseResult.status === "fulfilled"
          ? Array.isArray(purchaseResult.value.data)
            ? purchaseResult.value.data
            : purchaseResult.value.data?.data ||
              purchaseResult.value.data?.purchases ||
              []
          : [];

      const companyExpensesData =
        companyExpenseResult.status === "fulfilled"
          ? Array.isArray(companyExpenseResult.value.data)
            ? companyExpenseResult.value.data
            : companyExpenseResult.value.data?.data ||
              companyExpenseResult.value.data?.companyExpenses ||
              companyExpenseResult.value.data?.expenses ||
              []
          : [];

      const rcmData =
        rcmResult.status === "fulfilled"
          ? Array.isArray(rcmResult.value.data)
            ? rcmResult.value.data
            : rcmResult.value.data?.data ||
              rcmResult.value.data?.records ||
              rcmResult.value.data?.rcm ||
              []
          : [];

      const projectsData =
        projectsResult.status === "fulfilled"
          ? Array.isArray(projectsResult.value.data)
            ? projectsResult.value.data
            : projectsResult.value.data?.data ||
              projectsResult.value.data?.projects ||
              []
          : [];

      setFinancialYears(normalizedYears);
      setSalesRecords(
        invoicesData.map((record) => ({
          ...record,
          id: record._id || record.id,
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

      // Clear server-side records
      setServerSideLedgerRecords([]);

      if (
        yearsResult.status === "rejected" ||
        salesResult.status === "rejected" ||
        purchaseResult.status === "rejected" ||
        companyExpenseResult.status === "rejected" ||
        rcmResult.status === "rejected" ||
        projectsResult.status === "rejected"
      ) {
        showInfo(
          "Some books of accounts data could not be loaded. Please refresh.",
        );
      }
    } catch (err) {
      if (err.name === "CanceledError" || err.name === "AbortError") {
        return;
      }
      throw err;
    }
  };

  // Map ledger data for display
  const mapLedgerData = (data) => {
    return data.map((item) => {
      const totalAmount = getTotalAmount(item);
      const taxableAmount = getTaxableAmount(item);
      const gstAmount = getTaxAmount(item);
      const receivedAmount = getReceivedAmount(item, totalAmount);
      const pendingAmount = Math.max(totalAmount - receivedAmount, 0);

      return {
        id: item.id || item._id,
        type: item.recordType || item.type,
        createdBy:
          item.createdBy ||
          item.createdByName ||
          item.creatorName ||
          item.createdByUserName ||
          "-",
        period: getPeriodDisplay(item.invoiceDate, financialPeriodMode),
        date: formatDateForDisplay(item.invoiceDate),
        dateTime: formatDateTimeForDisplay(item.invoiceDate),
        invoiceNo:
          item.invoiceNumber ||
          item.expenseNumber ||
          item.selfInvoiceNumber ||
          item.originalRefNo ||
          item.referenceNo ||
          "-",
        clientSecondary:
          item.businessName ||
          item.partyName ||
          item.vendorName ||
          item.serviceProviderBusinessName ||
          item.staffName ||
          "-",
        gstin: item.gstin || "-",
        gstPercent: `${toNumber(item?.taxData?.taxPercentage || 0)}%`,
        taxable: taxableAmount,
        gstAmount,
        cgst: toNumber(item?.taxData?.cgst || 0),
        sgct: toNumber(item?.taxData?.sgst || 0),
        igst: toNumber(item?.taxData?.igst || 0),
        total: totalAmount,
        invoiceType: item.invoiceType || "-",
        paymentMode: item.paymentMethod || "-",
        received: receivedAmount,
        pending: pendingAmount,
        paid: item.paymentStatus || "-",
        sourceType: item.sourceType,
        raw: item,
      };
    });
  };

  // Debounced fetch for server-side mode
  useEffect(() => {
    if (prefLoading) return;

    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);

    debounceTimeoutRef.current = setTimeout(
      () => {
        fetchAllData();
      },
      serverSide ? 500 : 0,
    );

    return () => clearTimeout(debounceTimeoutRef.current);
  }, [
    serverSide,
    currentPage,
    recordsPerPage,
    searchTerm,
    filters,
    sortField,
    sortDirection,
    selectedFinancialYear,
    financialPeriodMode,
    recordTypeMode,
    prefLoading,
  ]);

  // Fetch financial years on mount
  useEffect(() => {
    fetchFinancialYears();
  }, []);

  // Client-side all ledger records
  const clientSideAllLedgerRecords = useMemo(() => {
    if (serverSide) return [];

    const mapToStandardFormat = (records, sourceType, type, getFields) => {
      return records.map((record) => {
        const fields = getFields(record);
        return {
          sourceType,
          type,
          invoiceNo: fields.invoiceNo,
          partySecondary: fields.partySecondary,
          raw: fields.raw || record,
        };
      });
    };

    const sales = mapToStandardFormat(salesRecords, "sales", "Sales", (r) => ({
      invoiceNo: r.invoiceNumber || "-",
      partySecondary: r.businessName || "-",
      raw: r,
    }));

    const purchases = mapToStandardFormat(
      purchaseRecords,
      "purchase",
      "Purchase",
      (r) => ({
        invoiceNo: r.invoiceNumber || "-",
        partySecondary: r.businessName || "-",
        raw: r,
      }),
    );

    const companyExpenses = mapToStandardFormat(
      companyExpenseRecords,
      "companyExpense",
      "Company Expense",
      (r) => ({
        invoiceNo: r.expenseNumber || "-",
        partySecondary: r.partyName || r.businessName || r.vendorName || "-",
        raw: {
          ...r,
          invoiceDate: r.expenseDate || r.invoiceDate,
        },
      }),
    );

    const rcm = mapToStandardFormat(rcmRecords, "rcm", "RCM", (r) => ({
      invoiceNo: r.selfInvoiceNumber || r.originalRefNo || "-",
      partySecondary: r.serviceProviderBusinessName || "-",
      raw: r,
    }));

    const project = projectRecords.flatMap((record) => {
      const transactions = Array.isArray(record.developerTransactions)
        ? record.developerTransactions
        : [];

      return transactions.map((transaction, index) => {
        const payoutAmount = toNumber(transaction.payoutAmount || 0);
        const payoutDate =
          transaction.payoutDate ||
          transaction.paymentDate ||
          record.projectDate ||
          record.createdDate ||
          "";

        return {
          sourceType: "project",
          type: "Developer Payout",
          invoiceNo: record.projectId || `PRJ-${record.id || index + 1}`,
          partySecondary: transaction.staffName || record.projectName || "-",
          raw: {
            id: `${record.id || record._id || "project"}-${transaction.id || index + 1}`,
            invoiceDate: payoutDate,
            gstin: "-",
            invoiceType: "Developer Payout",
            paymentMethod: transaction.payoutMethod || "Bank Transfer",
            paymentStatus: "Paid",
            amountPaid: payoutAmount,
            taxData: {
              taxableAmount: payoutAmount,
              subtotal: payoutAmount,
              totalAmount: payoutAmount,
              cgst: 0,
              sgst: 0,
              igst: 0,
              taxPercentage: 0,
            },
          },
        };
      });
    });

    return [...sales, ...purchases, ...companyExpenses, ...rcm, ...project];
  }, [
    salesRecords,
    purchaseRecords,
    companyExpenseRecords,
    rcmRecords,
    projectRecords,
    serverSide,
  ]);

  // Client-side filtered records
  const clientSideFilteredRecords = useMemo(() => {
    if (serverSide) return [];

    const selectedRange = getSelectedYearRange();
    const today = getDateOnly(new Date());

    let filtered = clientSideAllLedgerRecords.filter((entry) => {
      const record = entry.raw;
      const invoiceDate = getDateOnly(record.invoiceDate);
      if (!invoiceDate) return false;

      if (selectedRange) {
        const isWithinYear =
          invoiceDate >= selectedRange.startDate &&
          invoiceDate <= selectedRange.endDate;
        if (!isWithinYear) return false;
      }

      if (financialPeriodMode === "daily") {
        if (!today || invoiceDate.getTime() !== today.getTime()) return false;
      } else if (financialPeriodMode === "monthly") {
        if (
          !today ||
          invoiceDate.getFullYear() !== today.getFullYear() ||
          invoiceDate.getMonth() !== today.getMonth()
        ) {
          return false;
        }
      } else if (financialPeriodMode === "quarterly") {
        if (!today) return false;
        const getQuarter = (date) => Math.floor(date.getMonth() / 3) + 1;
        if (
          invoiceDate.getFullYear() !== today.getFullYear() ||
          getQuarter(invoiceDate) !== getQuarter(today)
        ) {
          return false;
        }
      } else if (financialPeriodMode === "halfYearly") {
        if (!today) return false;
        const getHalf = (date) => (date.getMonth() < 6 ? 1 : 2);
        if (
          invoiceDate.getFullYear() !== today.getFullYear() ||
          getHalf(invoiceDate) !== getHalf(today)
        ) {
          return false;
        }
      }

      if (recordTypeMode === "sales" && entry.sourceType !== "sales") {
        return false;
      }

      if (recordTypeMode === "purchase" && entry.sourceType !== "purchase") {
        return false;
      }

      if (
        recordTypeMode === "companyExpense" &&
        entry.sourceType !== "companyExpense"
      ) {
        return false;
      }

      if (recordTypeMode === "rcm" && entry.sourceType !== "rcm") {
        return false;
      }

      if (recordTypeMode === "project" && entry.sourceType !== "project") {
        return false;
      }

      return true;
    });

    return filtered;
  }, [
    clientSideAllLedgerRecords,
    selectedFinancialYear,
    financialYears,
    financialPeriodMode,
    recordTypeMode,
    serverSide,
  ]);

  // Map single ledger entry to row format
  const mapSingleLedgerEntry = (entry) => {
    const record = entry.raw;
    const totalAmount = getTotalAmount(record);
    const taxableAmount = getTaxableAmount(record);
    const gstAmount = getTaxAmount(record);
    const receivedAmount = getReceivedAmount(record, totalAmount);
    const pendingAmount = Math.max(totalAmount - receivedAmount, 0);

    return {
      id: `${entry.sourceType}-${record.id || record._id}`,
      type: entry.type,
      createdBy:
        record?.createdBy ||
        record?.createdByName ||
        record?.creatorName ||
        record?.createdByUserName ||
        "-",
      period: getPeriodDisplay(record.invoiceDate, financialPeriodMode),
      date: formatDateForDisplay(record.invoiceDate),
      dateTime: formatDateTimeForDisplay(record.invoiceDate),
      invoiceNo: entry.invoiceNo,
      clientSecondary: entry.partySecondary,
      gstin: record.gstin || "-",
      gstPercent: `${toNumber(record?.taxData?.taxPercentage || 0)}%`,
      taxable: taxableAmount,
      gstAmount,
      cgst: toNumber(record?.taxData?.cgst || 0),
      sgct: toNumber(record?.taxData?.sgst || 0),
      igst: toNumber(record?.taxData?.igst || 0),
      total: totalAmount,
      invoiceType: record.invoiceType || "-",
      paymentMode: record.paymentMethod || "-",
      received: receivedAmount,
      pending: pendingAmount,
      paid: record.paymentStatus || "-",
      sourceType: entry.sourceType,
    };
  };

  // Opening ITC data for client-side
  const clientSideOpeningItcData = useMemo(() => {
    const selectedYear = getSelectedYearRecord();
    if (!selectedYear) {
      return {
        cgst: 0,
        sgst: 0,
        igst: 0,
        total: 0,
        date: null,
      };
    }

    const cgst = getOpeningBalance(selectedYear, [
      "openingCgstItc",
      "openingItcCgst",
    ]);
    const sgst = getOpeningBalance(selectedYear, [
      "openingSgstItc",
      "openingItcSgst",
    ]);
    const igst = getOpeningBalance(selectedYear, [
      "openingIgstItc",
      "openingItcIgst",
    ]);
    const extra = getOpeningBalance(selectedYear, [
      "openingItc",
      "openingGstInput",
    ]);

    return {
      cgst,
      sgst,
      igst,
      total: cgst + sgst + igst + extra,
      date: selectedYear.startDate || selectedYear.createdAt || null,
    };
  }, [selectedFinancialYear, financialYears]);

  // Client-side statistics
  const clientSideStatistics = useMemo(() => {
    let salesOutput = 0;
    let purchaseInput = clientSideOpeningItcData.total;
    let rcmTax = 0;

    clientSideFilteredRecords.forEach((entry) => {
      const taxAmount = getTaxAmount(entry.raw);

      if (entry.sourceType === "sales") {
        salesOutput += taxAmount;
      } else if (entry.sourceType === "purchase") {
        purchaseInput += taxAmount;
      } else if (entry.sourceType === "rcm") {
        rcmTax += taxAmount;
      }
    });

    const outputGst = salesOutput + rcmTax;
    const inputGst = purchaseInput;

    return {
      outputGst,
      inputGst,
      rcmTax,
      totalPayable: outputGst - inputGst,
    };
  }, [clientSideFilteredRecords, clientSideOpeningItcData]);

  // Table data for display
  const tableData = useMemo(() => {
    let sourceData;
    let openingItcData;
    let stats;

    if (serverSide) {
      sourceData = serverSideLedgerRecords;
      openingItcData = { total: 0 }; // Opening ITC handled by server
      stats = statistics;
    } else {
      sourceData = clientSideFilteredRecords.map(mapSingleLedgerEntry);
      openingItcData = clientSideOpeningItcData;
      stats = clientSideStatistics;

      // Update statistics for client-side
      if (JSON.stringify(stats) !== JSON.stringify(statistics)) {
        setStatistics(stats);
      }
    }

    const mappedRows = [...sourceData];

    const shouldAddOpeningRow =
      !serverSide &&
      selectedFinancialYear !== "ALL" &&
      openingItcData.total > 0 &&
      ["all", "purchase", "rcm"].includes(recordTypeMode);

    if (shouldAddOpeningRow) {
      mappedRows.unshift({
        id: `opening-itc-${selectedFinancialYear}`,
        type: "Opening ITC",
        period: getPeriodDisplay(openingItcData.date, "yearly"),
        date: formatDateForDisplay(openingItcData.date),
        dateTime: formatDateTimeForDisplay(openingItcData.date),
        invoiceNo: "Opening Balance",
        clientSecondary: "Brought Forward from Previous FY",
        gstin: "-",
        gstPercent: "-",
        taxable: 0,
        gstAmount: openingItcData.total,
        cgst: openingItcData.cgst || 0,
        sgct: openingItcData.sgst || 0,
        igst: openingItcData.igst || 0,
        total: openingItcData.total,
        invoiceType: "Opening ITC",
        paymentMode: "-",
        received: 0,
        pending: 0,
        paid: "Paid",
      });
    }

    // Add serial numbers (pagination and sorting handled by ReusableTable in client-side mode)
    if (serverSide) {
      return mappedRows.map((row, index) => ({
        ...row,
        sn: (currentPage - 1) * recordsPerPage + index + 1,
      }));
    } else {
      return mappedRows.map((row, index) => ({
        ...row,
        sn: index + 1,
      }));
    }
  }, [
    serverSide,
    serverSideLedgerRecords,
    clientSideFilteredRecords,
    clientSideOpeningItcData,
    selectedFinancialYear,
    recordTypeMode,
    financialPeriodMode,
    statistics,
    currentPage,
    recordsPerPage,
    sortField,
    sortDirection,
  ]);

  const getCardNumber = (index) => {
    return (index % 8) + 1;
  };

  const handleCardClick = (cardKey) => {
    if (cardKey === "period") {
      const periodCycle = [
        "daily",
        "monthly",
        "quarterly",
        "halfYearly",
        "yearly",
      ];
      setFinancialPeriodMode((prev) => {
        const currentIndex = periodCycle.indexOf(prev);
        if (currentIndex === -1) return "daily";
        const newMode = periodCycle[(currentIndex + 1) % periodCycle.length];
        if (serverSide) {
          setCurrentPage(1);
        }
        return newMode;
      });
      return;
    }

    if (cardKey === "recordType") {
      const typeCycle = [
        "sales",
        "purchase",
        "companyExpense",
        "rcm",
        "project",
        "all",
      ];
      setRecordTypeMode((prev) => {
        const currentIndex = typeCycle.indexOf(prev);
        if (currentIndex === -1) return "sales";
        const newMode = typeCycle[(currentIndex + 1) % typeCycle.length];
        if (serverSide) {
          setCurrentPage(1);
        }
        return newMode;
      });
    }
  };

  const cards = [
    {
      key: "outputGst",
      title: "Output GST",
      value: formatCurrency(statistics.outputGst || 0),
      icon: "fa-solid fa-receipt",
    },
    {
      key: "inputGst",
      title: "Input GST",
      value: formatCurrency(statistics.inputGst || 0),
      icon: "fa-solid fa-file-circle-check",
    },
    {
      key: "rcmGst",
      title: "RCM GST",
      value: formatCurrency(statistics.rcmTax || 0),
      icon: "fa-solid fa-arrows-rotate",
    },
    {
      key: "totalPayable",
      title: "Total Payable",
      value: formatCurrency(statistics.totalPayable || 0),
      icon: "fa-solid fa-scale-balanced",
    },
    {
      key: "recordType",
      title: "Record Type",
      value:
        recordTypeMode === "sales"
          ? "Clients (Sales)"
          : recordTypeMode === "purchase"
            ? "Purchases (Vendor)"
            : recordTypeMode === "companyExpense"
              ? "Company Expense"
              : recordTypeMode === "rcm"
                ? "RCM"
                : recordTypeMode === "project"
                  ? "Developer Payout"
                  : "All",
      icon: "fa-solid fa-layer-group",
    },
    {
      key: "period",
      title: "Financial Period",
      value: `${
        selectedFinancialYear === "ALL" ? "All Year" : selectedFinancialYear
      } • ${getPeriodDisplayValue()}`,
      icon: "fa-regular fa-calendar-days",
    },
  ];

  const columns = [
    { key: "sn", label: "S.No", width: 70 },
    { key: "type", label: "Type", width: 120 },
    { key: "period", label: "Period", width: 120 },
    { key: "date", label: "Date", width: 120 },
    { key: "invoiceNo", label: "Invoice No/Payout ID", width: 150 },
    { key: "clientSecondary", label: "Client/Vendor Business", width: 220 },
    { key: "gstin", label: "GSTIN", width: 160 },
    { key: "gstPercent", label: "GST %", width: 90 },
    {
      key: "taxable",
      label: "Taxable",
      width: 130,
      render: (value) => (
        <span className="fw-semibold">{formatCurrency(value)}</span>
      ),
    },
    {
      key: "gstAmount",
      label: "GST Amount",
      width: 130,
      render: (value) => (
        <span className="fw-semibold">{formatCurrency(value)}</span>
      ),
    },
    {
      key: "cgst",
      label: "CGST",
      width: 120,
      render: (value) => (
        <span className="fw-semibold">{formatCurrency(value)}</span>
      ),
    },
    {
      key: "sgct",
      label: "SGCT",
      width: 120,
      render: (value) => (
        <span className="fw-semibold">{formatCurrency(value)}</span>
      ),
    },
    {
      key: "igst",
      label: "IGST",
      width: 120,
      render: (value) => (
        <span className="fw-semibold">{formatCurrency(value)}</span>
      ),
    },
    {
      key: "total",
      label: "Total",
      width: 130,
      render: (value) => (
        <span className="fw-semibold">{formatCurrency(value)}</span>
      ),
    },
    { key: "paymentMode", label: "Payment Mode", width: 140 },
    {
      key: "received",
      label: "Received/Payout",
      width: 130,
      render: (value) => (
        <span className="text-success fw-semibold">
          {formatCurrency(value)}
        </span>
      ),
    },
    {
      key: "pending",
      label: "Pending",
      width: 130,
      render: (value) => (
        <span className="text-danger fw-semibold">{formatCurrency(value)}</span>
      ),
    },
    {
      key: "paid",
      label: "Paid",
      width: 100,
      render: (value) => {
        let badgeClass = "bg-secondary";
        if (value === "Paid") badgeClass = "bg-success";
        else if (value === "Unpaid") badgeClass = "bg-danger";
        else if (value === "Partial") badgeClass = "bg-warning";
        return <span className={`badge ${badgeClass}`}>{value}</span>;
      },
    },
  ];

  const handleRefresh = async () => {
    // Reset to first page
    setCurrentPage(1);
    await fetchAllData();
    showInfo("Books of accounts refreshed!");
  };

  // Server-side handlers
  const handleServerSideSearch = (term) => {
    setSearchTerm(term);
    setCurrentPage(1);
  };

  const handleServerSideFilter = (filterParams) => {
    setFilters(filterParams);
    setCurrentPage(1);
  };

  const handleServerSideSort = (field, direction) => {
    setSortField(field);
    setSortDirection(direction);
    setCurrentPage(1);
  };

  const handleServerSidePageChange = (page) => {
    setCurrentPage(page);
  };

  const handleServerSideRecordsPerPageChange = (limit) => {
    setRecordsPerPage(limit);
    setCurrentPage(1);
  };

  const handleDebouncedColumnFilterChange = (key, value) => {
    if (serverSide) {
      if (debounceColumnTimeoutRef.current)
        clearTimeout(debounceColumnTimeoutRef.current);
      debounceColumnTimeoutRef.current = setTimeout(() => {
        setFilters((prev) => ({ ...prev, [key]: value }));
        setCurrentPage(1);
      }, 500);
    }
  };

  const columnsWithDropdownFilter = ["type", "paymentMode", "paid", "gstin"];

  const getFilterOptions = () => {
    if (serverSide) {
      // Use dynamic filter options from API
      return {
        type: ["All", ...(dynamicFilterOptions.type || [])],
        paymentMode: ["All", ...(dynamicFilterOptions.paymentMode || [])],
        paid: ["All", ...(dynamicFilterOptions.paid || [])],
        gstin: ["All", ...(dynamicFilterOptions.gstin || [])],
      };
    }

    // Client-side filter options based on actual data
    const types = [
      ...new Set(clientSideAllLedgerRecords.map((r) => r.type)),
    ].sort();
    const paymentModes = [
      ...new Set(
        clientSideAllLedgerRecords
          .map((r) => r.raw?.paymentMethod)
          .filter((m) => m && m !== ""),
      ),
    ].sort();
    const paidStatuses = [
      ...new Set(
        clientSideAllLedgerRecords
          .map((r) => r.raw?.paymentStatus)
          .filter((status) => status && status !== ""),
      ),
    ].sort();
    const gstins = [
      ...new Set(
        clientSideAllLedgerRecords
          .map((r) => r.raw?.gstin)
          .filter((gstin) => gstin && gstin !== "" && gstin !== "-"),
      ),
    ].sort();

    return {
      type: ["All", ...types],
      paymentMode: ["All", ...paymentModes],
      paid: [
        "All",
        ...(paidStatuses.length ? paidStatuses : ["Paid", "Unpaid", "Partial"]),
      ],
      gstin: ["All", ...gstins],
    };
  };

  const fixedColumns = ["sn"];
  const defaultVisibleColumns = [
    "sn",
    "type",
    "date",
    "invoiceNo",
    "clientSecondary",
    "total",
  ];

  return (
    <div className="container-fluid">
      <div
        className="py-3 d-flex justify-content-between align-items-center flex-wrap"
        style={{ marginTop: "70px" }}
      >
        {/* Left Side - Heading */}
        <div className="flex-grow-1">
          <h4 className="fs-18 fw-semibold m-0">Books of Accounts Register</h4>
          <small className="text-muted">
            Combined Sales, Purchase, Company Expense, RCM and Developer payout
            ledger records
          </small>
        </div>

        {/* Right Side - Toggle */}
        <div className="form-check form-switch m-0 mt-2 mt-sm-0">
          <input
            className="form-check-input"
            type="checkbox"
            checked={serverSide}
            onChange={(e) => {
              setServerSide(e.target.checked);
              setCurrentPage(1);
              setFilters({});
              setSearchTerm("");
              setSortField(null);
              setSortDirection("normal");
              setRecordTypeMode("all");
              setFinancialPeriodMode("yearly");
              // Clear server-side records when switching to client-side
              if (!e.target.checked) {
                setServerSideLedgerRecords([]);
              }
            }}
            id="serverSideToggle"
          />
          <label className="form-check-label ms-2" htmlFor="serverSideToggle">
            Server-side Mode {serverSide ? "(Enabled)" : "(Disabled)"}
          </label>
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
                  border: "1px solid #dee2e6",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-5px)";
                  e.currentTarget.style.boxShadow =
                    "0 10px 20px rgba(0,0,0,0.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)";
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
        moduleKey={moduleKey}
        columns={columns}
        data={tableData}
        loading={loading}
        totalRecords={
          serverSide ? totalRecords : clientSideFilteredRecords.length
        }
        showActions={false}
        fixedColumns={fixedColumns}
        defaultVisibleColumns={defaultVisibleColumns}
        columnsWithDropdownFilter={columnsWithDropdownFilter}
        columnsWithDateFilter={columnsWithDateFilter}
        filterOptions={getFilterOptions()}
        tableTitle="Books of Accounts"
        showColumnSelector={true}
        showExport={true}
        showRefresh={true}
        showAdvancedFilter={true}
        showSearch={true}
        onRefresh={handleRefresh}
        exportFileName="Books_Of_Accounts"
        exportTitle="Books of Accounts Report"
        serverSide={serverSide}
        onServerSideSearch={handleServerSideSearch}
        onServerSideFilter={handleServerSideFilter}
        onServerSideSort={handleServerSideSort}
        onServerSidePageChange={handleServerSidePageChange}
        onServerSideRecordsPerPageChange={handleServerSideRecordsPerPageChange}
        currentPage={currentPage}
        recordsPerPage={recordsPerPage}
        onPageChange={setCurrentPage}
        onRecordsPerPageChange={setRecordsPerPage}
        onColumnFilterChange={handleDebouncedColumnFilterChange}
        exportApi={API_ENDPOINTS.BOOKS_OF_ACCOUNTS?.LIST}
        getBadgeClass={(value) => {
          if (value === "Paid") return "bg-success";
          if (value === "Unpaid") return "bg-danger";
          if (value === "Partial") return "bg-warning";
          return "bg-primary";
        }}
      />
    </div>
  );
};

export default BooksOfAccounts;
