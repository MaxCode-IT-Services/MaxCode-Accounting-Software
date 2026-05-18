import React, { useState, useEffect, useMemo, useRef } from "react";
import ReusableTable from "../Components/ReusableTable";
import CreateCompanyExpense from "../Components/CreateCompanyExpense";
import ConfirmationModal from "../Components/ConfirmationModal";
import UploadedFilePreviewBox from "../Components/UploadedFilePreviewBox";
import {
  showSuccess,
  showError,
  showInfo,
} from "../Components/ToastNotification";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { apiGet, apiDelete, apiPut, apiPost } from "../utils/api";
import { hasActionPermission } from "../utils/permissions";
import {
  exportItemWiseExcel,
  exportItemWisePDF,
} from "../utils/itemWiseExport";
import { normalizePaymentMethodOptions } from "../utils/paymentMethods";

const CompanyExpenseManagement = () => {
  const moduleKey = "companyExpenseManagement";
  const canCreate = hasActionPermission(moduleKey, "create");

  // Server-side mode state, fetched from backend user preferences
  const [serverSide, setServerSide] = useState(true);
  const [prefLoading, setPrefLoading] = useState(true);
  const [dynamicFilterOptions, setDynamicFilterOptions] = useState({});

  // Fetch user preference on mount
  useEffect(() => {
    document.title = "Company Expense Management | MaxCode IT Services";
    const fetchPreference = async () => {
      try {
        const res = await apiGet("/user-preferences");
        if (typeof res.data?.companyExpenseManagementServerSide === "boolean") {
          setServerSide(res.data.companyExpenseManagementServerSide);
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
          companyExpenseManagementServerSide: serverSide,
        });
      } catch (e) {
        // ignore
      }
    };
    savePreference();
  }, [serverSide, prefLoading]);

  // State for records and loading
  const [records, setRecords] = useState([]);
  const [financialYears, setFinancialYears] = useState([]);
  const [selectedFinancialYear, setSelectedFinancialYear] = useState(
    localStorage.getItem("selectedFinancialYear") || "ALL",
  );
  const [financialPeriodMode, setFinancialPeriodMode] = useState("yearly");
  const [loading, setLoading] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);
  const [showCreateExpenseForm, setShowCreateExpenseForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState(null);
  const [activeCardFilter, setActiveCardFilter] = useState("total");
  const [exportingExpenses, setExportingExpenses] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(10);

  // Filter state for server-side
  const [filters, setFilters] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState(null);
  const [sortDirection, setSortDirection] = useState("normal");

  // Debounce refs
  const debounceTimeoutRef = useRef(null);
  const debounceColumnTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Statistics state
  const [statistics, setStatistics] = useState({
    total: 0,
    paid: 0,
    unpaid: 0,
    partial: 0,
    totalAmount: 0,
  });

  // Columns with date range filter
  const columnsWithDateFilter = [
    "createdDateTime",
    "expenseDateFormatted",
    "paymentDateFormatted",
  ];

  const buildPaymentMethodFilterOptions = (values = []) => {
    const normalized = normalizePaymentMethodOptions(values).sort((a, b) =>
      a.localeCompare(b),
    );
    return ["All", ...normalized];
  };

  // Cards array
  const cards = [
    {
      icon: "fas fa-rupee-sign",
      title: "Total Amount",
      key: "totalAmount",
      color: "info",
      count: statistics.totalAmount,
    },
    {
      icon: "fas fa-check-circle",
      title: "Paid",
      key: "paid",
      color: "success",
      count: statistics.paid,
    },
    {
      icon: "fa-solid fa-times-circle",
      title: "Unpaid",
      key: "unpaid",
      color: "danger",
      count: statistics.unpaid,
    },
    {
      icon: "fas fa-hourglass-half",
      title: "Partial",
      key: "partial",
      color: "warning",
      count: statistics.partial,
    },
    {
      icon: "fa-regular fa-calendar-days",
      title: "Financial Period",
      key: "period",
      color: "warning",
    },
    {
      icon: "fas fa-plus-circle",
      title: "Add New",
      key: "addNew",
      color: "success",
    },
  ];

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

  // Fetch company expenses from API with server-side parameters
  const fetchCompanyExpenses = async () => {
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
      let url = API_ENDPOINTS.COMPANY_EXPENSES.LIST;
      const params = new URLSearchParams();

      if (serverSide) {
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

        // Only send valid filters (skip sn, action, empty, null, undefined, 'All')
        Object.entries(filters).forEach(([key, value]) => {
          if (["sn", "action"].includes(key)) return;
          if (
            value === undefined ||
            value === null ||
            value === "" ||
            value === "All"
          )
            return;

          // Handle date range filters for columnsWithDateFilter
          if (columnsWithDateFilter.includes(key)) {
            if (value && typeof value === "object") {
              if (value.startDate) {
                const backendKey =
                  key === "createdDateTime" ? "createdAt" : key;
                params.append(`${backendKey}_start`, value.startDate);
              }
              if (value.endDate) {
                const backendKey =
                  key === "createdDateTime" ? "createdAt" : key;
                params.append(`${backendKey}_end`, value.endDate);
              }
            }
          } else {
            // Only send if not 'All'
            if (
              Array.isArray(value) &&
              value.length > 0 &&
              !value.includes("All")
            ) {
              params.append(key, value.join(","));
            } else if (!Array.isArray(value) && value !== "All") {
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

        // Add card filter
        if (
          activeCardFilter &&
          activeCardFilter !== "total" &&
          activeCardFilter !== "addNew" &&
          activeCardFilter !== "period"
        ) {
          params.append("filter", activeCardFilter);
        }

        url = `${url}?${params.toString()}`;
      }

      const response = await apiGet(url, {
        signal: controller.signal,
      });

      let expensesData;
      let total;

      if (serverSide) {
        // Server-side response format with pagination
        expensesData = response.data?.data || response.data?.expenses || [];
        total =
          response.data?.pagination?.totalRecords ||
          response.data?.total ||
          expensesData.length;

        // Update statistics from response if available
        if (response.data?.statistics) {
          setStatistics(response.data.statistics);
        }
        if (response.data?.filterOptions) {
          const backendPaymentMethods = Array.isArray(
            response.data.filterOptions.paymentMethod,
          )
            ? response.data.filterOptions.paymentMethod.filter(
                (method) => String(method) !== "All",
              )
            : [];

          setDynamicFilterOptions({
            ...response.data.filterOptions,
            paymentMethod: buildPaymentMethodFilterOptions(
              backendPaymentMethods,
            ),
          });
        }
      } else {
        // Client-side response format
        expensesData =
          response.data?.data ||
          response.data?.expenses ||
          (Array.isArray(response.data) ? response.data : []);
        total = expensesData.length;
      }

      const mappedData = expensesData.map((expense) => {
        const createdDate = expense.createdDate || expense.createdAt;
        const amount = parseFloat(
          expense?.taxData?.totalAmount || expense?.amount || 0,
        );
        const expenseFileLink = expense.expenseFileURL || "";
        const expenseUrlLink = expense.expenseURL || expense.invoiceURL || "";

        return {
          ...expense,
          id: expense._id || expense.id,
          createdDate,
          expenseDateFormatted: formatDateForDisplay(expense.expenseDate),
          paymentDateFormatted: expense.paymentDate
            ? formatDateForDisplay(expense.paymentDate)
            : "-",
          createdDateTime: formatDateTimeForDisplay(createdDate),
          amount,
          totalAmount: amount,
          itemCount: expense.items?.length || 0,
          expenseFileLink,
          expenseUrlLink,
        };
      });

      setRecords(mappedData);
      setTotalRecords(total);

      // Update statistics for client-side mode
      if (!serverSide) {
        updateStatistics(mappedData);
      }
    } catch (err) {
      if (err.name === "CanceledError" || err.name === "AbortError") {
        return;
      }

      console.error("Failed to fetch company expenses:", err);
      showError("Failed to fetch company expenses");
      setRecords([]);
      setTotalRecords(0);
      updateStatistics([]);
    } finally {
      setLoading(false);
    }
  };

  // Update statistics (client-side)
  const updateStatistics = (data) => {
    const totalAmount = data.reduce(
      (sum, r) => sum + parseFloat(r.amount || 0),
      0,
    );

    const paidAmount = data
      .filter(
        (r) => r.paymentStatus === "Paid" || r.paymentStatus === "Partial",
      )
      .reduce((sum, r) => {
        if (r.amountReceived !== undefined && r.amountReceived !== null) {
          return sum + parseFloat(r.amountReceived || 0);
        } else if (r.paymentStatus === "Paid") {
          return sum + parseFloat(r.amount || 0);
        } else if (r.paymentStatus === "Partial") {
          return sum + parseFloat(r.amount || 0) / 2;
        }
        return sum;
      }, 0);

    const unpaidAmount = totalAmount - paidAmount;

    const stats = {
      total: data.length,
      paid: paidAmount.toFixed(2),
      unpaid: unpaidAmount.toFixed(2),
      partial: data.filter((r) => r.paymentStatus === "Partial").length,
      totalAmount: totalAmount.toFixed(2),
    };
    setStatistics(stats);
  };

  // Debounced fetch for server-side mode
  useEffect(() => {
    if (prefLoading) return;

    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);

    debounceTimeoutRef.current = setTimeout(
      () => {
        fetchCompanyExpenses();
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
    activeCardFilter,
    selectedFinancialYear,
    financialPeriodMode,
    prefLoading,
  ]);

  // Fetch financial years on mount
  useEffect(() => {
    fetchFinancialYears();
  }, []);

  // Format date for display (DD/MM/YYYY)
  const formatDateForDisplay = (dateString) => {
    if (!dateString) return "";

    try {
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
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

  // Format date for display (DD/MM/YYYY | HH:MM:SS AM/PM)
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

  // Prepare data for table
  const preparedData = useMemo(() => {
    return records.map((record, index) => ({
      ...record,
      sn: (currentPage - 1) * recordsPerPage + index + 1,
    }));
  }, [records, currentPage, recordsPerPage]);

  // Client-side per-column filtering logic
  const filteredClientSideData = useMemo(() => {
    if (serverSide) {
      return preparedData;
    }

    let data = preparedData;

    Object.entries(filters).forEach(([key, value]) => {
      if (value && typeof value === "string" && value.trim() !== "") {
        data = data.filter((row) =>
          (row[key] || "")
            .toString()
            .toLowerCase()
            .includes(value.toLowerCase()),
        );
      }
    });

    // Apply financial year filter for client-side
    if (selectedFinancialYear && selectedFinancialYear !== "ALL") {
      const yearRecord = financialYears.find(
        (y) => y.value === selectedFinancialYear,
      );
      if (yearRecord?.startDate && yearRecord?.endDate) {
        const startDate = new Date(yearRecord.startDate);
        const endDate = new Date(yearRecord.endDate);
        data = data.filter((record) => {
          const expenseDate = new Date(record.expenseDate);
          return expenseDate >= startDate && expenseDate <= endDate;
        });
      }
    }

    // Apply period filter for client-side
    if (financialPeriodMode !== "yearly") {
      const today = new Date();
      data = data.filter((record) => {
        const expenseDate = new Date(record.expenseDate);
        if (!expenseDate) return false;

        if (financialPeriodMode === "daily") {
          return (
            expenseDate.getDate() === today.getDate() &&
            expenseDate.getMonth() === today.getMonth() &&
            expenseDate.getFullYear() === today.getFullYear()
          );
        }
        if (financialPeriodMode === "monthly") {
          return (
            expenseDate.getMonth() === today.getMonth() &&
            expenseDate.getFullYear() === today.getFullYear()
          );
        }
        if (financialPeriodMode === "quarterly") {
          const getQuarter = (date) => Math.floor(date.getMonth() / 3) + 1;
          return (
            expenseDate.getFullYear() === today.getFullYear() &&
            getQuarter(expenseDate) === getQuarter(today)
          );
        }
        if (financialPeriodMode === "halfYearly") {
          const getHalf = (date) => (date.getMonth() < 6 ? 1 : 2);
          return (
            expenseDate.getFullYear() === today.getFullYear() &&
            getHalf(expenseDate) === getHalf(today)
          );
        }
        return true;
      });
    }

    return data;
  }, [
    preparedData,
    filters,
    serverSide,
    selectedFinancialYear,
    financialYears,
    financialPeriodMode,
  ]);

  // Debounced per-column filter change handler for server-side
  const handleDebouncedColumnFilterChange = (key, value) => {
    if (serverSide) {
      if (debounceColumnTimeoutRef.current)
        clearTimeout(debounceColumnTimeoutRef.current);
      debounceColumnTimeoutRef.current = setTimeout(() => {
        setFilters((prev) => ({ ...prev, [key]: value }));
        setCurrentPage(1);
      }, 500);
    } else {
      setFilters((prev) => ({ ...prev, [key]: value }));
    }
  };

  // Columns configuration
  const columns = [
    { key: "sn", label: "S.No", width: 70 },
    { key: "expenseNumber", label: "Expense No.", width: 140 },
    {
      key: "expenseDateFormatted",
      label: "Expense Date",
      width: 130,
    },
    { key: "expenseTitle", label: "Expense Title", width: 180 },
    { key: "expenseFor", label: "Expense For", width: 180 },
    { key: "referenceNumber", label: "Reference No.", width: 150 },
    { key: "partyName", label: "Party/Vendor", width: 180 },
    { key: "description", label: "Description", width: 200 },
    {
      key: "itemCount",
      label: "Items",
      width: 80,
      render: (value) => (
        <span className="badge bg-info">
          {value} item{value !== 1 ? "s" : ""}
        </span>
      ),
    },
    {
      key: "amount",
      label: "Amount",
      width: 130,
      render: (value) => (
        <span className="fw-bold text-success">
          ₹{" "}
          {parseFloat(value || 0).toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      ),
    },
    {
      key: "paymentStatus",
      label: "Payment Status",
      width: 130,
      render: (value) => {
        let badgeClass = "bg-secondary";
        if (value === "Paid") badgeClass = "bg-success";
        else if (value === "Unpaid") badgeClass = "bg-danger";
        else if (value === "Partial") badgeClass = "bg-warning";
        return <span className={`badge ${badgeClass}`}>{value}</span>;
      },
    },
    { key: "paymentMethod", label: "Payment Method", width: 130 },
    {
      key: "paymentDateFormatted",
      label: "Payment Date",
      width: 130,
    },
    { key: "entrySource", label: "Entry Source", width: 130 },
    { key: "paymentProof", label: "Payment Proof/UTR", width: 150 },
    {
      key: "expenseFile",
      label: "Expense File",
      width: 120,
      disableSort: true,
      disableFilter: true,
      render: (_, record) =>
        record.expenseFileLink ? (
          <div onClick={(event) => event.stopPropagation()}>
            <UploadedFilePreviewBox
              fileUrl={record.expenseFileLink}
              title="Open uploaded expense file"
              iconClassName="fa-solid fa-file-contract"
            />
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            title="No uploaded expense file"
            disabled
          >
            <i class="fa-solid fa-file-contract"></i>
          </button>
        ),
    },
    {
      key: "expenseLink",
      label: "Expense Link",
      width: 120,
      disableSort: true,
      disableFilter: true,
      render: (_, record) =>
        record?.expenseUrlLink ? (
          <button
            type="button"
            className="btn btn-sm btn-outline-info"
            onClick={(event) => {
              event.stopPropagation();
              window.open(
                record.expenseUrlLink,
                "_blank",
                "noopener,noreferrer",
              );
            }}
            title="Open Google Drive link"
          >
            <i className="fab fa-google-drive"></i>
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            title="No Google Drive link"
            disabled
          >
            <i className="fab fa-google-drive"></i>
          </button>
        ),
    },
    { key: "createdDateTime", label: "Created Date & Time", width: 200 },
    { key: "action", label: "Actions", width: 180 },
  ];

  const fixedColumns = ["sn"];
  const defaultVisibleColumns = [
    "sn",
    "expenseNumber",
    "expenseDateFormatted",
    "partyName",
    "amount",
    "paymentStatus",
    "action",
  ];

  // Columns with dropdown filter
  const columnsWithDropdownFilter = [
    "paymentStatus",
    "paymentMethod",
    "entrySource",
  ];

  // Filter options - dynamic for entrySource
  const getFilterOptions = () => {
    const paymentMethodValues = buildPaymentMethodFilterOptions(
      records.map((record) => record.paymentMethod),
    );

    const options = {
      paymentStatus: ["All", "Paid", "Unpaid", "Partial"],
      paymentMethod: paymentMethodValues,
    };

    // Dynamic entrySource options from records (client-side) or from dynamicFilterOptions (server-side)
    if (serverSide && dynamicFilterOptions?.entrySource) {
      options.entrySource = dynamicFilterOptions.entrySource;
    } else if (records.length > 0) {
      const uniqueSources = [
        ...new Set(
          records
            .map((r) => r.entrySource)
            .filter((source) => source && source !== ""),
        ),
      ].sort();
      options.entrySource = ["All", ...uniqueSources];
    } else {
      options.entrySource = ["All"];
    }

    return options;
  };

  // Handle card click
  const handleCardClick = (cardKey) => {
    if (cardKey === "addNew") {
      if (!canCreate) {
        showError("You don't have permission to add company expenses");
        return;
      }
      setEditingRecord(null);
      setShowCreateExpenseForm(true);
    } else if (cardKey === "period") {
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
    } else {
      setActiveCardFilter(cardKey);
      if (serverSide) {
        setCurrentPage(1);
      }
    }
  };

  // Get card number for styling
  const getCardNumber = (index) => {
    return (index % 8) + 1;
  };

  // Get default financial year record
  const getDefaultFinancialYearRecord = () => {
    return financialYears.find((year) => year?.isDefault === true) || null;
  };

  // Check if expense date is within financial year
  const isExpenseDateWithinFinancialYear = (
    expenseDate,
    financialYearRecord,
  ) => {
    if (
      !expenseDate ||
      !financialYearRecord?.startDate ||
      !financialYearRecord?.endDate
    ) {
      return true;
    }

    const expenseDateObj = new Date(expenseDate);
    const startDate = new Date(financialYearRecord.startDate);
    const endDate = new Date(financialYearRecord.endDate);

    return expenseDateObj >= startDate && expenseDateObj <= endDate;
  };

  // Get current period display value
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

  // Handle form submit
  const handleFormSubmit = async (formData) => {
    if (!editingRecord) {
      const defaultFinancialYear = getDefaultFinancialYearRecord();

      if (!defaultFinancialYear?.value) {
        showError(
          "Default financial year is not configured. Please set default financial year first.",
        );
        return;
      }

      if (selectedFinancialYear !== defaultFinancialYear.value) {
        showError(
          `Please select default financial year ${defaultFinancialYear.value} in navbar before creating company expense.`,
        );
        return;
      }

      const isValidExpenseDate = isExpenseDateWithinFinancialYear(
        formData.expenseDate,
        defaultFinancialYear,
      );

      if (!isValidExpenseDate) {
        showError(
          `Expense Date must be between ${formatDateForDisplay(defaultFinancialYear.startDate)} and ${formatDateForDisplay(defaultFinancialYear.endDate)} for financial year ${defaultFinancialYear.value}.`,
        );
        return;
      }
    }

    try {
      if (editingRecord && !editingRecord.isViewMode) {
        const expenseId = editingRecord._id || editingRecord.id;
        const payload = {
          ...formData,
          createdDate: editingRecord.createdDate,
        };

        await apiPut(API_ENDPOINTS.COMPANY_EXPENSES.UPDATE(expenseId), payload);
        showSuccess("Company expense updated successfully!");
      } else {
        const payload = {
          ...formData,
          createdDate: new Date().toISOString(),
        };

        await apiPost(API_ENDPOINTS.COMPANY_EXPENSES.CREATE, payload);
        showSuccess("Company expense added successfully!");
      }

      await fetchCompanyExpenses();
      setShowCreateExpenseForm(false);
      setEditingRecord(null);
    } catch (error) {
      console.error("Error saving company expense:", error);
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to save company expense",
      );
      throw error;
    }
  };

  // Handle edit
  const handleEdit = (record) => {
    setEditingRecord(record);
    setShowCreateExpenseForm(true);
    showInfo(`Editing expense: ${record.expenseNumber}`);
  };

  // Handle view
  const handleView = (record) => {
    setEditingRecord({ ...record, isViewMode: true });
    setShowCreateExpenseForm(true);
    showInfo(`Viewing expense: ${record.expenseNumber}`);
  };

  // Handle delete
  const handleDelete = (id) => {
    setExpenseToDelete(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!expenseToDelete) return;
    await handleDeleteExpense(expenseToDelete);
    setShowDeleteConfirm(false);
    setExpenseToDelete(null);
  };

  const handleDeleteExpense = async (id) => {
    try {
      await apiDelete(API_ENDPOINTS.COMPANY_EXPENSES.DELETE(id));
      showSuccess("Company expense deleted successfully!");
      await fetchCompanyExpenses();
    } catch (error) {
      console.error("Error deleting expense:", error);
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to delete expense",
      );
    }
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

  return (
    <>
      <div className="container-fluid">
        <div
          className="py-3 d-flex justify-content-between align-items-center flex-wrap"
          style={{ marginTop: "70px" }}
        >
          {/* Left Side - Heading */}
          <h4 className="fs-18 fw-semibold m-0">Company Expense Management</h4>

          {/* Right Side - Toggle */}
          <div className="form-check form-switch m-0">
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
                setActiveCardFilter("total");
                setFinancialPeriodMode("yearly");
              }}
              id="serverSideToggle"
            />
            <label className="form-check-label ms-2" htmlFor="serverSideToggle">
              Server-side Mode {serverSide ? "(Enabled)" : "(Disabled)"}
            </label>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="row">
          {cards.map((card, index) => {
            const cardNumber = getCardNumber(index);
            const cardClass = `card${cardNumber}`;
            const cardIconBgClass = `card-icon-bg${cardNumber}`;
            const isActive =
              activeCardFilter === card.key &&
              card.key !== "addNew" &&
              card.key !== "period";
            const isAddNewDisabled = card.key === "addNew" && !canCreate;

            let displayValue;
            if (card.key === "addNew") {
              displayValue = "+ Add New";
            } else if (card.key === "period") {
              displayValue = `${
                selectedFinancialYear === "ALL"
                  ? "All Year"
                  : selectedFinancialYear
              } • ${getPeriodDisplayValue()}`;
            } else if (
              card.key === "totalAmount" ||
              card.key === "paid" ||
              card.key === "unpaid"
            ) {
              displayValue = `₹ ${parseFloat(card.count || 0).toLocaleString(
                "en-IN",
                {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                },
              )}`;
            } else {
              displayValue = card.count || 0;
            }

            return (
              <div key={index} className="col-md-6 col-xl-2 mb-4">
                <div
                  className={`card border-0 overflow-hidden ${cardClass} modern-card hover-elevate`}
                  style={{
                    cursor: isAddNewDisabled ? "not-allowed" : "pointer",
                    opacity: isAddNewDisabled ? 0.6 : 1,
                    borderRadius: "12px",
                    height: "100%",
                    border: isActive
                      ? "2px solid #0d6efd"
                      : undefined,
                  }}
                  onClick={() => !isAddNewDisabled && handleCardClick(card.key)}
                >
                  <div className="card-body text-center p-2">
                    <div className="mb-3 mt-2 d-flex justify-content-center">
                      <span
                        className={`avatar-md rounded-circle ${cardIconBgClass} d-inline-flex justify-content-center align-items-center kpi-icon`}
                        style={{ width: "56px", height: "56px" }}
                      >
                        <i className={`${card.icon} fs-4 text-white`} />
                      </span>
                    </div>
                    <h5 className="mb-2 fw-bold">{card.title}</h5>
                    <h6 className="mb-0 text-muted fw-bold">
                      {displayValue}
                    </h6>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Reusable Table */}
        <ReusableTable
          ensureCreatedByColumn={true}
          createdByLabel="Created By"
          moduleKey={moduleKey}
          columns={columns}
          data={serverSide ? preparedData : filteredClientSideData}
          loading={loading}
          totalRecords={totalRecords}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onView={handleView}
          // onRefresh removed
          showActions={true}
          actions={["view", "edit", "delete"]}
          skipDeleteConfirmation={true}
          fixedColumns={fixedColumns}
          defaultVisibleColumns={defaultVisibleColumns}
          columnsWithDropdownFilter={columnsWithDropdownFilter}
          columnsWithDateFilter={columnsWithDateFilter}
          filterOptions={serverSide ? dynamicFilterOptions : getFilterOptions()}
          tableTitle="Company Expense Records"
          showColumnSelector={true}
          showExport={true}
          showRefresh={true}
          showAdvancedFilter={true}
          showSearch={true}
          exportFileName="Company_Expense_Management"
          exportTitle="Company Expense Management Report"
          activeCardFilter={activeCardFilter}
          cards={cards}
          getBadgeClass={(value) => {
            if (value === "Paid") return "bg-success";
            if (value === "Unpaid") return "bg-danger";
            if (value === "Partial") return "bg-warning";
            return "bg-primary";
          }}
          serverSide={serverSide}
          onServerSideSearch={handleServerSideSearch}
          onServerSideFilter={handleServerSideFilter}
          onServerSideSort={handleServerSideSort}
          onServerSidePageChange={handleServerSidePageChange}
          onServerSideRecordsPerPageChange={
            handleServerSideRecordsPerPageChange
          }
          currentPage={currentPage}
          recordsPerPage={recordsPerPage}
          onPageChange={setCurrentPage}
          onRecordsPerPageChange={setRecordsPerPage}
          onColumnFilterChange={handleDebouncedColumnFilterChange}
          exportApi={API_ENDPOINTS.COMPANY_EXPENSES.LIST}
        />

        {/* Create/Edit Expense Modal */}
        <CreateCompanyExpense
          show={showCreateExpenseForm}
          onClose={() => {
            setShowCreateExpenseForm(false);
            setEditingRecord(null);
          }}
          onSubmit={handleFormSubmit}
          editingRecord={editingRecord}
          defaultFinancialYear={getDefaultFinancialYearRecord()}
          financialYears={financialYears}
          selectedFinancialYear={selectedFinancialYear}
        />

        <ConfirmationModal
          show={showDeleteConfirm}
          onHide={() => {
            setShowDeleteConfirm(false);
            setExpenseToDelete(null);
          }}
          onConfirm={confirmDelete}
          title="Delete Company Expense"
          message="Are you sure you want to delete this company expense record?"
          confirmText="Delete"
          variant="danger"
          confirmationText="delete"
        />
      </div>
    </>
  );
};

export default CompanyExpenseManagement;
