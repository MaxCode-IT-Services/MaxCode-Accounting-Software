import React, { useState, useEffect, useMemo, useRef } from "react";
import ReusableTable from "../Components/ReusableTable";
import CreateRcm from "../Components/CreateRcm";
import SelfInvoicePreview from "../Components/SelfInvoicePreview";
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

const RcmManagement = () => {
  const moduleKey = "rcmManagement";
  const canCreate = hasActionPermission(moduleKey, "create");

  // Server-side mode state, fetched from backend user preferences
  const [serverSide, setServerSide] = useState(true);
  const [prefLoading, setPrefLoading] = useState(true);
  const [dynamicFilterOptions, setDynamicFilterOptions] = useState({});

  // Fetch user preference on mount
  useEffect(() => {
    document.title = "RCM Management | MaxCode IT Services";
    const fetchPreference = async () => {
      try {
        const res = await apiGet("/user-preferences");
        if (typeof res.data?.rcmManagementServerSide === "boolean") {
          setServerSide(res.data.rcmManagementServerSide);
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
          rcmManagementServerSide: serverSide,
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
  const [showCreateRcmForm, setShowCreateRcmForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [activeCardFilter, setActiveCardFilter] = useState("total");
  const [showSelfInvoicePreview, setShowSelfInvoicePreview] = useState(false);
  const [previewRecord, setPreviewRecord] = useState(null);
  const [exportingInvoices, setExportingInvoices] = useState(false);
  const [businessSettings, setBusinessSettings] = useState({
    companyName: "",
    companyAddress: "",
    gstin: "",
    accountName: "",
    accountNumber: "",
    bankName: "",
    ifscCode: "",
    branchAddress: "",
    email: "",
    phone: "",
    website: "",
  });

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
    "invoiceDateFormatted",
    "paymentDateFormatted",
  ];

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

  // Fetch business settings
  const fetchBusinessSettings = async () => {
    const cached = localStorage.getItem("business_settings");

    if (cached) {
      try {
        const parsedCache = JSON.parse(cached);
        setBusinessSettings((prev) => ({
          ...prev,
          ...parsedCache,
        }));
      } catch (error) {
        console.error("Failed to parse cached business settings:", error);
      }
    }

    try {
      const response = await apiGet(API_ENDPOINTS.BUSINESS_SETTINGS.GET);
      const remoteSettings = response?.data?.settings;

      if (remoteSettings && typeof remoteSettings === "object") {
        setBusinessSettings((prev) => ({
          ...prev,
          ...remoteSettings,
        }));
      }
    } catch (error) {
      console.error("Failed to fetch business settings:", error);
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

  // Fetch RCM from API with server-side parameters
  const fetchRcm = async () => {
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
      let url = API_ENDPOINTS.RCM.LIST;
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

      let rcmData;
      let total;

      if (serverSide) {
        // Server-side response format with pagination
        rcmData = response.data?.data || response.data?.rcm || [];
        total =
          response.data?.pagination?.totalRecords ||
          response.data?.total ||
          rcmData.length;

        // Update statistics from response if available
        if (response.data?.statistics) {
          setStatistics(response.data.statistics);
        }
        if (response.data?.filterOptions) {
          setDynamicFilterOptions(response.data.filterOptions);
        }
      } else {
        // Client-side response format
        rcmData =
          response.data?.data ||
          response.data?.rcm ||
          (Array.isArray(response.data) ? response.data : []);
        total = rcmData.length;
      }

      const mappedData = rcmData.map((rcm) => {
        const createdDate = rcm.createdDate || rcm.createdAt;

        return {
          ...rcm,
          id: rcm._id || rcm.id,
          createdDate,
          invoiceDateFormatted: formatDateForDisplay(rcm.invoiceDate),
          paymentDateFormatted: rcm.paymentDate
            ? formatDateForDisplay(rcm.paymentDate)
            : "-",
          createdDateTime: formatDateTimeForDisplay(createdDate),
          totalAmount: rcm.taxData?.totalAmount || 0,
          roundingAmount: rcm.roundingAmount || 0,
          itemCount: rcm.items?.length || 0,
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

      console.error("Failed to fetch RCM:", err);
      showError("Failed to fetch RCM");
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
      (sum, r) => sum + parseFloat(r.taxData?.totalAmount || 0),
      0,
    );

    const paidAmount = data
      .filter(
        (r) => r.paymentStatus === "Paid" || r.paymentStatus === "Partial",
      )
      .reduce((sum, r) => {
        if (r.paidAmount !== undefined && r.paidAmount !== null) {
          return sum + parseFloat(r.paidAmount || 0);
        } else if (r.paymentStatus === "Paid") {
          return sum + parseFloat(r.taxData?.totalAmount || 0);
        } else if (r.paymentStatus === "Partial") {
          return sum + parseFloat(r.taxData?.totalAmount || 0) / 2;
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
        fetchRcm();
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

  // Fetch financial years and business settings on mount
  useEffect(() => {
    fetchFinancialYears();
    fetchBusinessSettings();
  }, []);

  // Update preview record when records change
  useEffect(() => {
    if (!showSelfInvoicePreview || !previewRecord) return;

    const previewId = previewRecord._id || previewRecord.id;
    if (!previewId) return;

    const latestRecord = records.find(
      (record) => (record._id || record.id) === previewId,
    );

    if (latestRecord) {
      setPreviewRecord(latestRecord);
    }
  }, [records, showSelfInvoicePreview, previewRecord]);

  // Format date for display (DD/MM/YYYY)
  const formatDateForDisplay = (dateString) => {
    if (!dateString) return "";

    try {
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        const day = String(date.getDate()).padStart(2, "0");
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
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

        return `${day}/${month}/${year} | ${formattedHours}:${minutes}:${seconds} ${ampm}`;
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
          const invoiceDate = new Date(record.invoiceDate);
          return invoiceDate >= startDate && invoiceDate <= endDate;
        });
      }
    }

    // Apply period filter for client-side
    if (financialPeriodMode !== "yearly") {
      const today = new Date();
      data = data.filter((record) => {
        const invoiceDate = new Date(record.invoiceDate);
        if (!invoiceDate) return false;

        if (financialPeriodMode === "daily") {
          return (
            invoiceDate.getDate() === today.getDate() &&
            invoiceDate.getMonth() === today.getMonth() &&
            invoiceDate.getFullYear() === today.getFullYear()
          );
        }
        if (financialPeriodMode === "monthly") {
          return (
            invoiceDate.getMonth() === today.getMonth() &&
            invoiceDate.getFullYear() === today.getFullYear()
          );
        }
        if (financialPeriodMode === "quarterly") {
          const getQuarter = (date) => Math.floor(date.getMonth() / 3) + 1;
          return (
            invoiceDate.getFullYear() === today.getFullYear() &&
            getQuarter(invoiceDate) === getQuarter(today)
          );
        }
        if (financialPeriodMode === "halfYearly") {
          const getHalf = (date) => (date.getMonth() < 6 ? 1 : 2);
          return (
            invoiceDate.getFullYear() === today.getFullYear() &&
            getHalf(invoiceDate) === getHalf(today)
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
    { key: "selfInvoiceNumber", label: "Self Invoice No.", width: 150 },
    {
      key: "invoiceDateFormatted",
      label: "Invoice Date",
      width: 130,
    },
    { key: "originalRefNo", label: "Original Ref. No", width: 150 },
    {
      key: "serviceProviderBusinessName",
      label: "Service Provider",
      width: 200,
    },
    { key: "gstin", label: "GSTIN", width: 150 },
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
      key: "totalAmount",
      label: "Total Amount",
      width: 130,
      render: (value) => (
        <span className="fw-bold text-success">
          ₹{" "}
          {parseFloat(value).toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      ),
    },
    {
      key: "roundingAmount",
      label: "Rounding Amount",
      width: 130,
      render: (value) => (
        <span className="fw-bold text-info">
          ₹{" "}
          {parseFloat(value).toLocaleString("en-IN", {
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
    { key: "createdDateTime", label: "Created Date & Time", width: 200 },
    { key: "action", label: "Actions", width: 180 },
  ];

  const fixedColumns = ["sn"];
  const defaultVisibleColumns = [
    "sn",
    "selfInvoiceNumber",
    "invoiceDateFormatted",
    "originalRefNo",
    "serviceProviderBusinessName",
    "gstin",
    "itemCount",
    "totalAmount",
    "roundingAmount",
    "paymentStatus",
    "paymentMethod",
    "createdDateTime",
    "action",
  ];

  // Columns with dropdown filter
  const columnsWithDropdownFilter = ["paymentStatus", "paymentMethod", "gstin"];

  // Filter options - dynamic for GSTIN
  const getFilterOptions = () => {
    const options = {
      paymentStatus: ["All", "Paid", "Unpaid", "Partial"],
      paymentMethod: [
        "All",
        "Cash",
        "Bank Transfer",
        "Credit Card",
        "Debit Card",
        "UPI",
        "Cheque",
      ],
    };

    // Dynamic GSTIN options from records (client-side) or from dynamicFilterOptions (server-side)
    if (serverSide && dynamicFilterOptions?.gstin) {
      options.gstin = dynamicFilterOptions.gstin;
    } else if (records.length > 0) {
      const uniqueGstin = [
        ...new Set(
          records.map((r) => r.gstin).filter((gstin) => gstin && gstin !== ""),
        ),
      ].sort();
      options.gstin = ["All", ...uniqueGstin];
    } else {
      options.gstin = ["All"];
    }

    return options;
  };

  // Handle card click
  const handleCardClick = (cardKey) => {
    if (cardKey === "addNew") {
      if (!canCreate) {
        showError("You don't have permission to add RCM invoices");
        return;
      }
      setEditingRecord(null);
      setShowCreateRcmForm(true);
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

  // Check if invoice date is within financial year
  const isInvoiceDateWithinFinancialYear = (
    invoiceDate,
    financialYearRecord,
  ) => {
    if (
      !invoiceDate ||
      !financialYearRecord?.startDate ||
      !financialYearRecord?.endDate
    ) {
      return true;
    }

    const invoiceDateObj = new Date(invoiceDate);
    const startDate = new Date(financialYearRecord.startDate);
    const endDate = new Date(financialYearRecord.endDate);

    return invoiceDateObj >= startDate && invoiceDateObj <= endDate;
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
          `Please select default financial year ${defaultFinancialYear.value} in navbar before creating RCM invoice.`,
        );
        return;
      }

      const isValidInvoiceDate = isInvoiceDateWithinFinancialYear(
        formData.invoiceDate,
        defaultFinancialYear,
      );

      if (!isValidInvoiceDate) {
        showError(
          `Invoice Date must be between ${formatDateForDisplay(defaultFinancialYear.startDate)} and ${formatDateForDisplay(defaultFinancialYear.endDate)} for financial year ${defaultFinancialYear.value}.`,
        );
        return;
      }
    }

    try {
      if (editingRecord && !editingRecord.isViewMode) {
        const rcmId = editingRecord._id || editingRecord.id;
        const payload = {
          ...formData,
          createdDate: editingRecord.createdDate,
          placeOfSupply: "Rajasthan (08)",
        };

        await apiPut(API_ENDPOINTS.RCM.UPDATE(rcmId), payload);
        showSuccess("RCM updated successfully!");
      } else {
        const payload = {
          ...formData,
          createdDate: new Date().toISOString(),
          placeOfSupply: "Rajasthan (08)",
        };

        await apiPost(API_ENDPOINTS.RCM.CREATE, payload);
        showSuccess("RCM added successfully!");
      }

      await fetchRcm();
      setShowCreateRcmForm(false);
      setEditingRecord(null);
    } catch (error) {
      console.error("Error saving RCM:", error);
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to save RCM",
      );
      throw error;
    }
  };

  // Handle edit
  const handleEdit = (record) => {
    setEditingRecord(record);
    setShowCreateRcmForm(true);
    showInfo(`Editing RCM: ${record.selfInvoiceNumber}`);
  };

  // Handle view
  const handleView = (record) => {
    setEditingRecord({ ...record, isViewMode: true });
    setShowCreateRcmForm(true);
    showInfo(`Viewing RCM: ${record.selfInvoiceNumber}`);
  };

  // Handle delete
  const handleDelete = (id) => {
    handleDeleteRcm(id);
  };

  const handleDeleteRcm = async (id) => {
    try {
      await apiDelete(API_ENDPOINTS.RCM.DELETE(id));
      showSuccess("RCM deleted successfully!");
      await fetchRcm();
    } catch (error) {
      console.error("Error deleting RCM:", error);
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to delete RCM",
      );
    }
  };

  // Handle refresh
  const handleRefresh = () => {
    fetchFinancialYears();
    fetchBusinessSettings();
    if (serverSide) {
      setFilters({});
      setSearchTerm("");
      setSortField(null);
      setSortDirection("normal");
      setCurrentPage(1);
      setActiveCardFilter("total");
      setFinancialPeriodMode("yearly");
    }
    fetchRcm();
    showInfo("Data refreshed!");
  };

  // Open self invoice preview
  const openSelfInvoicePreview = (record) => {
    setPreviewRecord(record);
    setShowSelfInvoicePreview(true);
  };

  // Close self invoice preview
  const closeSelfInvoicePreview = () => {
    setShowSelfInvoicePreview(false);
    setPreviewRecord(null);
  };

  // Get invoice element ID for printing
  const getSelfInvoiceElementId = (record, index) => {
    return `self-invoice-print-${record.id || record.selfInvoiceNumber || index}`;
  };

  // Export multiple self invoices as PDF
  const exportSelfInvoicesPdf = async () => {
    const dataToExport = serverSide ? records : filteredClientSideData;
    if (!dataToExport.length) {
      showError("No self invoices found for the selected filters.");
      return;
    }

    setExportingInvoices(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const jsPDF = (await import("jspdf")).default;

      await new Promise((resolve) => requestAnimationFrame(resolve));

      const pdf = new jsPDF({
        orientation: "p",
        unit: "mm",
        format: "a4",
        compress: true,
      });

      for (let i = 0; i < dataToExport.length; i += 1) {
        const record = dataToExport[i];
        const elementId = getSelfInvoiceElementId(record, i);
        const element = document.getElementById(elementId);

        if (!element) {
          throw new Error(`Self invoice element not found: ${elementId}`);
        }

        const canvas = await html2canvas(element, {
          scale: 3,
          useCORS: true,
          allowTaint: true,
          width: element.offsetWidth,
          height: element.offsetHeight,
          logging: false,
          backgroundColor: "#ffffff",
        });

        const imgData = canvas.toDataURL("image/jpeg", 1.0);
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, 0, 210, 297);
      }

      const now = new Date();
      const day = String(now.getDate()).padStart(2, "0");
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const year = now.getFullYear();
      const fileDate = `${day}-${month}-${year}`;
      pdf.save(`Self_Invoices_${fileDate}.pdf`);
      showSuccess("Self invoices PDF downloaded successfully!");
    } catch (error) {
      console.error("Multi self-invoice PDF error:", error);
      showError("Failed to generate self invoices PDF.");
    } finally {
      setExportingInvoices(false);
    }
  };

  // Handle export with items (Excel)
  const handleExportItemWiseExcel = () => {
    const dataToExport = serverSide ? records : filteredClientSideData;
    if (!dataToExport.length) {
      showError("No RCM invoices found for the selected filters.");
      return;
    }

    try {
      exportItemWiseExcel({
        records: dataToExport,
        exportFileName: "RCM_Management",
        sheetName: "RCM Item Wise",
        reportTitle: "RCM_Item_Wise",
        invoiceNumberKey: "selfInvoiceNumber",
        partyNameKey: "serviceProviderBusinessName",
        partyLabel: "Service Provider",
        dateKey: "invoiceDate",
        partyDetails: {
          gstinKey: "gstin",
          addressKey: "address",
          placeOfSupplyKey: "placeOfSupply",
        },
      });
      showSuccess("RCM item-wise Excel exported successfully!");
    } catch (error) {
      console.error("RCM item-wise Excel export error:", error);
      showError("Failed to export RCM item-wise Excel.");
    }
  };

  // Handle export with items (PDF)
  const handleExportItemWisePDF = () => {
    const dataToExport = serverSide ? records : filteredClientSideData;
    if (!dataToExport.length) {
      showError("No RCM invoices found for the selected filters.");
      return;
    }

    try {
      exportItemWisePDF({
        records: dataToExport,
        exportFileName: "RCM_Management",
        reportTitle: "RCM Report",
        invoiceNumberKey: "selfInvoiceNumber",
        partyNameKey: "serviceProviderBusinessName",
        partyLabel: "Service Provider",
        dateKey: "invoiceDate",
        partyDetails: {
          gstinKey: "gstin",
          addressKey: "address",
          placeOfSupplyKey: "placeOfSupply",
        },
      });
      showSuccess("RCM item-wise PDF exported successfully!");
    } catch (error) {
      console.error("RCM item-wise PDF export error:", error);
      showError("Failed to export RCM item-wise PDF.");
    }
  };

  // Get status label for self invoice
  const getStatusLabel = (status) => {
    if (status === "Paid") return "PAID";
    if (status === "Partial") return "PARTIAL";
    return "UNPAID";
  };

  // Build self invoice data for preview
  const buildSelfInvoiceData = (record) => {
    if (!record) return null;

    const toNumber = (value) => {
      const num = parseFloat(value);
      return Number.isNaN(num) ? 0 : num;
    };

    const subtotal = toNumber(record.taxData?.subtotal || 0);
    const discountPercent = toNumber(record.discountPercent || 0);
    const discountAmount =
      toNumber(record.discountAmount || 0) ||
      (discountPercent > 0 ? (subtotal * discountPercent) / 100 : 0);
    const taxableAmount =
      toNumber(record.taxData?.taxableAmount || 0) || subtotal - discountAmount;
    const taxPercent = toNumber(record.taxData?.taxPercentage || 0);
    const cgst = toNumber(record.taxData?.cgst || 0);
    const sgst = toNumber(record.taxData?.sgst || 0);
    const igst = toNumber(record.taxData?.igst || 0);
    const roundingAmount = toNumber(record.roundingAmount || 0);
    const totalAmountFromRecord = toNumber(record.taxData?.totalAmount || 0);
    const computedTotalAmount =
      taxableAmount + cgst + sgst + igst + roundingAmount;
    const totalAmount = totalAmountFromRecord || computedTotalAmount;
    const tdsPercent = toNumber(record.tdsPercent || 0);
    const tdsAmount =
      toNumber(record.tdsAmount || 0) ||
      (tdsPercent > 0 ? (totalAmount * tdsPercent) / 100 : 0);
    const cgstPercent = 0;
    const sgstPercent = 0;
    const igstPercent = taxPercent;

    return {
      companyName: businessSettings.companyName || "",
      companyAddress: businessSettings.companyAddress || "",
      companyEmail: businessSettings.email || "",
      companyPhone: businessSettings.phone || "",
      companyWebsite: businessSettings.website || "",
      companyGstin: businessSettings.gstin || "",
      accountName: businessSettings.accountName || "",
      bankName: businessSettings.bankName || "",
      accountNumber: businessSettings.accountNumber || "",
      ifscCode: businessSettings.ifscCode || "",
      branchAddress: businessSettings.branchAddress || "",
      selfInvoiceNumber: record.selfInvoiceNumber || "",
      invoiceNumber: record.selfInvoiceNumber || "",
      invoiceDate: formatDateForDisplay(record.invoiceDate),
      createdDateTime:
        record.createdDateTime || formatDateTimeForDisplay(record.createdDate),
      originalRefNo: record.originalRefNo || "",
      orderNumber: record.originalRefNo || "",
      placeOfSupply: record.placeOfSupply || "Rajasthan (08)",
      clientName: record.serviceProviderBusinessName || "",
      clientAddress: record.address || "",
      clientPhone: record.phoneNumber || "",
      clientEmail: record.email || "",
      clientGstin: record.gstin || "",
      paymentDate: record.paymentDate
        ? formatDateForDisplay(record.paymentDate)
        : "",
      paymentMethod: record.paymentMethod || "",
      discountPercent,
      discountAmount,
      taxableAmount,
      taxPercent,
      cgst,
      sgst,
      igst,
      cgstPercent,
      sgstPercent,
      igstPercent,
      subtotal,
      totalAmount,
      roundingAmount,
      amountReceived: toNumber(record.paidAmount || 0),
      hasTds: tdsPercent > 0,
      tdsPercent,
      tdsAmount,
      status: getStatusLabel(record.paymentStatus),
      items: (record.items || []).map((item) => ({
        serviceName: item.itemName || "",
        description: item.itemDescription || "",
        hsnCode: item.hsnCode || "",
        qty: toNumber(item.qty || 0),
        price: toNumber(item.price || 0),
        amount: toNumber(item.amount || (item.qty || 0) * (item.price || 0)),
      })),
    };
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
          <h4 className="fs-18 fw-semibold m-0">RCM Management</h4>

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
                  className={`card border-0 shadow-sm overflow-hidden ${cardClass} ${isActive ? "border-primary" : ""}`}
                  style={{
                    transition: "all 0.3s ease",
                    cursor: isAddNewDisabled ? "not-allowed" : "pointer",
                    opacity: isAddNewDisabled ? 0.6 : 1,
                    height: "100%",
                    borderRadius: "12px",
                    border: isActive
                      ? "2px solid #0d6efd"
                      : "1px solid #dee2e6",
                  }}
                  onMouseEnter={(e) => {
                    if (
                      (card.key === "addNew" && !isAddNewDisabled) ||
                      card.key === "period"
                    ) {
                      e.currentTarget.style.transform = "translateY(-5px)";
                      e.currentTarget.style.boxShadow =
                        "0 10px 20px rgba(0,0,0,0.1)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow =
                      "0 2px 4px rgba(0,0,0,0.1)";
                  }}
                  onClick={() => !isAddNewDisabled && handleCardClick(card.key)}
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
                        {displayValue}
                      </h6>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Reusable Table */}
        <ReusableTable
          moduleKey={moduleKey}
          columns={columns}
          data={serverSide ? preparedData : filteredClientSideData}
          loading={loading}
          totalRecords={totalRecords}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onView={handleView}
          onRefresh={handleRefresh}
          showActions={true}
          actions={["view", "edit", "delete"]}
          skipDeleteConfirmation={true}
          fixedColumns={fixedColumns}
          defaultVisibleColumns={defaultVisibleColumns}
          columnsWithDropdownFilter={columnsWithDropdownFilter}
          columnsWithDateFilter={columnsWithDateFilter}
          filterOptions={serverSide ? dynamicFilterOptions : getFilterOptions()}
          tableTitle="RCM Records"
          showColumnSelector={true}
          showExport={true}
          showRefresh={true}
          showAdvancedFilter={true}
          showSearch={true}
          exportFileName="RCM_Management"
          exportTitle="RCM Management Report"
          extraExportItems={[
            {
              label: "Export Excel with Items",
              onClick: handleExportItemWiseExcel,
            },
            {
              label: "Export PDF with Items",
              onClick: handleExportItemWisePDF,
            },
            {
              label: exportingInvoices
                ? "Generating Self Invoices PDF..."
                : "Self Invoices PDF",
              onClick: exportSelfInvoicesPdf,
            },
          ]}
          activeCardFilter={activeCardFilter}
          cards={cards}
          getBadgeClass={(value) => {
            if (value === "Paid") return "bg-success";
            if (value === "Unpaid") return "bg-danger";
            if (value === "Partial") return "bg-warning";
            return "bg-primary";
          }}
          customActions={(record) => (
            <button
              type="button"
              className="btn btn-sm btn-outline-dark me-1"
              onClick={() => openSelfInvoicePreview(record)}
              title="Self Invoice Preview"
            >
              <i className="far fa-file-alt"></i>
            </button>
          )}
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
          exportApi={API_ENDPOINTS.RCM.LIST}
        />

        {/* Create/Edit RCM Modal */}
        <CreateRcm
          show={showCreateRcmForm}
          onClose={() => {
            setShowCreateRcmForm(false);
            setEditingRecord(null);
          }}
          onSubmit={handleFormSubmit}
          editingRecord={editingRecord}
          defaultFinancialYear={getDefaultFinancialYearRecord()}
          existingInvoices={records}
        />
      </div>

      {/* Self Invoice Preview Modal */}
      <SelfInvoicePreview
        show={showSelfInvoicePreview}
        onClose={closeSelfInvoicePreview}
        invoiceData={buildSelfInvoiceData(previewRecord)}
      />

      {/* Hidden divs for printing multiple self invoices */}
      <div
        style={{
          position: "absolute",
          left: "-10000px",
          top: 0,
          width: 0,
          height: 0,
          overflow: "hidden",
        }}
      >
        {(serverSide ? records : filteredClientSideData).map(
          (record, index) => (
            <SelfInvoicePreview
              key={record.id || record.selfInvoiceNumber || index}
              id={getSelfInvoiceElementId(record, index)}
              show={true}
              renderMode="print"
              invoiceData={buildSelfInvoiceData(record)}
            />
          ),
        )}
      </div>
    </>
  );
};

export default RcmManagement;
