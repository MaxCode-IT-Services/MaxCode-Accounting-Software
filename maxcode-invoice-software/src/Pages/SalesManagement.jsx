import React, { useState, useEffect, useMemo, useRef } from "react";
import ReusableTable from "../Components/ReusableTable";
import CreateSales from "../Components/CreateSales";
import InvoicePreview from "../Components/InvoicePreview";
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
import { fetchAllClients } from "../utils/fetchAllEntities";

const SalesManagement = () => {
  const moduleKey = "salesManagement";
  const canCreate = hasActionPermission(moduleKey, "create");

  // Server-side mode state, fetched from backend user preferences
  const [serverSide, setServerSide] = useState(true);
  const [prefLoading, setPrefLoading] = useState(true);
  const [dynamicFilterOptions, setDynamicFilterOptions] = useState({});

  // Fetch user preference on mount
  useEffect(() => {
    document.title = "Sales Management | MaxCode IT Services";
    const fetchPreference = async () => {
      try {
        const res = await apiGet("/user-preferences");
        if (typeof res.data?.salesManagementServerSide === "boolean") {
          setServerSide(res.data.salesManagementServerSide);
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
          salesManagementServerSide: serverSide,
        });
      } catch (e) {
        // ignore
      }
    };
    savePreference();
  }, [serverSide, prefLoading]);

  // State for records and loading
  const [records, setRecords] = useState([]);
  const [clients, setClients] = useState([]);
  const [financialYears, setFinancialYears] = useState([]);
  const [selectedFinancialYear, setSelectedFinancialYear] = useState(
    localStorage.getItem("selectedFinancialYear") || "ALL",
  );
  const [financialPeriodMode, setFinancialPeriodMode] = useState("yearly");
  const [loading, setLoading] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);
  const [showCreateSalesForm, setShowCreateSalesForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [activeCardFilter, setActiveCardFilter] = useState("total");
  const [showInvoicePreview, setShowInvoicePreview] = useState(false);
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

  // Fetch clients
  const fetchClients = async (options = {}) => {
    try {
      const clientsData = await fetchAllClients(options);

      const activeClients = clientsData
        .filter((c) => c?.isDeleted !== true)
        .map((client) => ({
          ...client,
          id: client.id || client._id,
        }));
      setClients(activeClients);
    } catch (err) {
      console.error("Clients API fetch error:", err);
      setClients([]);
    }
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

  // Fetch sales from API with server-side parameters
  const fetchSales = async () => {
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
      let url = API_ENDPOINTS.INVOICES.LIST;
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

      let response;
      try {
        response = await apiGet(url, {
          signal: controller.signal,
        });
      } catch (primaryError) {
        const canRetryWithMinimalQuery =
          serverSide && url !== API_ENDPOINTS.INVOICES.LIST;

        if (!canRetryWithMinimalQuery) {
          throw primaryError;
        }

        const fallbackUrl = `${API_ENDPOINTS.INVOICES.LIST}?page=${currentPage}&limit=${recordsPerPage}`;
        response = await apiGet(fallbackUrl, {
          signal: controller.signal,
        });
      }

      let salesData;
      let total;

      if (serverSide) {
        // Server-side response format with pagination
        salesData = response.data?.data || response.data?.invoices || [];
        total =
          response.data?.pagination?.totalRecords ||
          response.data?.total ||
          salesData.length;

        // Update statistics from response if available
        if (response.data?.statistics) {
          setStatistics(response.data.statistics);
        }
        if (response.data?.filterOptions) {
          setDynamicFilterOptions(response.data.filterOptions);
        }
        if (response.data?.clients) {
          setClients(response.data.clients);
        }
      } else {
        // Client-side response format
        salesData =
          response.data?.data ||
          response.data?.invoices ||
          (Array.isArray(response.data) ? response.data : []);
        total = salesData.length;
      }

      const mappedData = salesData.map((sale) => {
        const createdDate = sale.createdDate || sale.createdAt;

        return {
          ...sale,
          id: sale._id || sale.id,
          createdDate,
          invoiceDateFormatted: formatDateForDisplay(sale.invoiceDate),
          paymentDateFormatted: sale.paymentDate
            ? formatDateForDisplay(sale.paymentDate)
            : "-",
          createdDateTime: formatDateTimeForDisplay(createdDate),
          totalAmount: sale.taxData?.totalAmount || 0,
          roundingAmount: sale.roundingAmount || 0,
          itemCount: sale.items?.length || 0,
          clientName: getClientName(sale),
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

      console.error("Failed to fetch sales:", err);
      showError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Failed to fetch sales",
      );
      setRecords([]);
      setTotalRecords(0);
      updateStatistics([]);
    } finally {
      setLoading(false);
    }
  };

  // Helper to get client name
  const getClientName = (sale) => {
    if (sale.clientName) return sale.clientName;
    if (sale.clientRefId && clients.length > 0) {
      const client = clients.find((c) => c.id === sale.clientRefId);
      return client?.clientName || "";
    }
    return "";
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
        if (r.amountReceived !== undefined && r.amountReceived !== null) {
          return sum + parseFloat(r.amountReceived || 0);
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
        fetchSales();
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

  // Fetch clients, financial years, and business settings on mount
  useEffect(() => {
    fetchFinancialYears();
    fetchClients();
    fetchBusinessSettings();
  }, []);

  // Update preview record when records change
  useEffect(() => {
    if (!showInvoicePreview || !previewRecord) return;

    const previewId = previewRecord._id || previewRecord.id;
    if (!previewId) return;

    const latestRecord = records.find(
      (record) => (record._id || record.id) === previewId,
    );

    if (latestRecord) {
      setPreviewRecord(latestRecord);
    }
  }, [records, showInvoicePreview, previewRecord]);

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
    { key: "invoiceNumber", label: "Invoice No.", width: 130 },
    {
      key: "invoiceDateFormatted",
      label: "Invoice Date",
      width: 130,
    },
    { key: "clientName", label: "Client Name", width: 160 },
    { key: "clientId", label: "Client ID", width: 120 },
    { key: "businessName", label: "Business Name", width: 180 },
    { key: "placeOfSupply", label: "Place of Supply", width: 180 },
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
    "invoiceNumber",
    "invoiceDateFormatted",
    "businessName",
    "totalAmount",
    "paymentStatus",
    "action",
  ];

  // Columns with dropdown filter
  const columnsWithDropdownFilter = [
    "paymentStatus",
    "paymentMethod",
    "placeOfSupply",
  ];

  // Filter options - dynamic for placeOfSupply
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

    // Dynamic placeOfSupply options from records (client-side) or from dynamicFilterOptions (server-side)
    if (serverSide && dynamicFilterOptions?.placeOfSupply) {
      options.placeOfSupply = dynamicFilterOptions.placeOfSupply;
    } else if (records.length > 0) {
      const uniquePlaces = [
        ...new Set(
          records
            .map((r) => r.placeOfSupply)
            .filter((place) => place && place !== ""),
        ),
      ].sort();
      options.placeOfSupply = ["All", ...uniquePlaces];
    } else {
      options.placeOfSupply = ["All"];
    }

    return options;
  };

  // Handle card click
  const handleCardClick = (cardKey) => {
    if (cardKey === "addNew") {
      if (!canCreate) {
        showError("You don't have permission to add sales invoices");
        return;
      }
      setEditingRecord(null);
      setShowCreateSalesForm(true);
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
          `Please select default financial year ${defaultFinancialYear.value} in navbar before creating sales invoice.`,
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

    const selectedClient = clients.find(
      (c) =>
        c.id == formData.clientRefId ||
        c._id == formData.clientRefId ||
        c.clientId == formData.clientRefId,
    );

    const clientName =
      selectedClient?.clientName || editingRecord?.clientName || "";

    try {
      if (editingRecord && !editingRecord.isViewMode) {
        const invoiceId = editingRecord._id || editingRecord.id;
        const payload = {
          ...formData,
          clientName,
          createdDate: editingRecord.createdDate,
        };

        await apiPut(API_ENDPOINTS.INVOICES.UPDATE(invoiceId), payload);
        showSuccess("Sales updated successfully!");
      } else {
        const payload = {
          ...formData,
          clientName,
          createdDate: new Date().toISOString(),
        };

        await apiPost(API_ENDPOINTS.INVOICES.CREATE, payload);
        showSuccess("Sales added successfully!");
      }

      await fetchSales();
      setShowCreateSalesForm(false);
      setEditingRecord(null);
    } catch (error) {
      console.error("Error saving sales:", error);
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to save sales",
      );
      throw error;
    }
  };

  // Handle edit
  const handleEdit = (record) => {
    setEditingRecord(record);
    setShowCreateSalesForm(true);
    showInfo(`Editing sales: ${record.invoiceNumber}`);
  };

  // Handle view
  const handleView = (record) => {
    setEditingRecord({ ...record, isViewMode: true });
    setShowCreateSalesForm(true);
    showInfo(`Viewing sales: ${record.invoiceNumber}`);
  };

  // Handle delete
  const handleDelete = (id) => {
    handleDeleteInvoice(id);
  };

  const handleDeleteInvoice = async (id) => {
    try {
      await apiDelete(API_ENDPOINTS.INVOICES.DELETE(id));
      showSuccess("Sales deleted successfully!");
      await fetchSales();
    } catch (error) {
      console.error("Error deleting invoice:", error);
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to delete invoice",
      );
    }
  };

  // Handle refresh
  const handleRefresh = () => {
    fetchFinancialYears();
    fetchClients({ forceRefresh: true });
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
    fetchSales();
    showInfo("Data refreshed!");
  };

  // Open invoice preview
  const openInvoicePreview = (record) => {
    setPreviewRecord(record);
    setShowInvoicePreview(true);
  };

  // Close invoice preview
  const closeInvoicePreview = () => {
    setShowInvoicePreview(false);
    setPreviewRecord(null);
  };

  // Get invoice element ID for printing
  const getInvoiceElementId = (record, index) => {
    return `invoice-print-${record.id || record.invoiceNumber || index}`;
  };

  // Export multiple invoices as PDF
  const exportInvoicesPdf = async () => {
    const dataToExport = serverSide ? records : filteredClientSideData;
    if (!dataToExport.length) {
      showError("No invoices found for the selected filters.");
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
        const elementId = getInvoiceElementId(record, i);
        const element = document.getElementById(elementId);

        if (!element) {
          throw new Error(`Invoice element not found: ${elementId}`);
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
      pdf.save(`Invoices_${fileDate}.pdf`);
      showSuccess("Invoices PDF downloaded successfully!");
    } catch (error) {
      console.error("Multi-invoice PDF error:", error);
      showError("Failed to generate invoices PDF.");
    } finally {
      setExportingInvoices(false);
    }
  };

  // Handle export with items (Excel)
  const handleExportItemWiseExcel = () => {
    const dataToExport = serverSide ? records : filteredClientSideData;
    if (!dataToExport.length) {
      showError("No sales invoices found for the selected filters.");
      return;
    }

    try {
      exportItemWiseExcel({
        records: dataToExport,
        exportFileName: "Sales_Management",
        sheetName: "Sales Item Wise",
        reportTitle: "Sales_Item_Wise",
        invoiceNumberKey: "invoiceNumber",
        partyNameKey: ["clientName", "businessName"],
        partyLabel: "Client Name",
        dateKey: "invoiceDate",
        partyDetails: {
          gstinKey: "gstin",
          addressKey: "address",
          placeOfSupplyKey: "placeOfSupply",
        },
      });
      showSuccess("Sales item-wise Excel exported successfully!");
    } catch (error) {
      console.error("Sales item-wise Excel export error:", error);
      showError("Failed to export Sales item-wise Excel.");
    }
  };

  // Handle export with items (PDF)
  const handleExportItemWisePDF = () => {
    const dataToExport = serverSide ? records : filteredClientSideData;
    if (!dataToExport.length) {
      showError("No sales invoices found for the selected filters.");
      return;
    }

    try {
      exportItemWisePDF({
        records: dataToExport,
        exportFileName: "Sales_Management",
        reportTitle: "Sales Report",
        invoiceNumberKey: "invoiceNumber",
        partyNameKey: ["clientName", "businessName"],
        partyLabel: "Client Name",
        dateKey: "invoiceDate",
        partyDetails: {
          gstinKey: "gstin",
          addressKey: "address",
          placeOfSupplyKey: "placeOfSupply",
        },
      });
      showSuccess("Sales item-wise PDF exported successfully!");
    } catch (error) {
      console.error("Sales item-wise PDF export error:", error);
      showError("Failed to export Sales item-wise PDF.");
    }
  };

  // Get status label for invoice
  const getStatusLabel = (status) => {
    if (status === "Paid") return "PAID";
    if (status === "Partial") return "PARTIAL";
    return "UNPAID";
  };

  // Build invoice data for preview
  const buildInvoiceData = (record) => {
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
    const isRajasthan = (record.placeOfSupply || "")
      .toLowerCase()
      .includes("rajasthan");
    const cgstPercent = isRajasthan ? taxPercent / 2 : 0;
    const sgstPercent = isRajasthan ? taxPercent / 2 : 0;
    const igstPercent = !isRajasthan ? taxPercent : 0;

    return {
      companyName: businessSettings.companyName || "",
      companyAddress: businessSettings.companyAddress || "",
      companyGstin: businessSettings.gstin || "",
      accountName: businessSettings.accountName || "",
      bankName: businessSettings.bankName || "",
      accountNumber: businessSettings.accountNumber || "",
      ifscCode: businessSettings.ifscCode || "",
      branchAddress: businessSettings.branchAddress || "",
      invoiceNumber: record.invoiceNumber || "",
      invoiceDate: formatDateForDisplay(record.invoiceDate),
      createdDateTime:
        record.createdDateTime || formatDateTimeForDisplay(record.createdDate),
      orderNumber: record.clientId || record.clientRefId || "",
      clientId: record.clientId || record.clientRefId || "",
      placeOfSupply: record.placeOfSupply || "",
      clientName: record.clientName || record.businessName || "",
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
      amountReceived: toNumber(record.amountReceived || 0),
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
          <h4 className="fs-18 fw-semibold m-0">Sales Management</h4>

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
          onRefresh={handleRefresh}
          showActions={true}
          actions={["view", "edit", "delete"]}
          skipDeleteConfirmation={true}
          fixedColumns={fixedColumns}
          defaultVisibleColumns={defaultVisibleColumns}
          columnsWithDropdownFilter={columnsWithDropdownFilter}
          columnsWithDateFilter={columnsWithDateFilter}
          filterOptions={serverSide ? dynamicFilterOptions : getFilterOptions()}
          tableTitle="Sales Records"
          showColumnSelector={true}
          showExport={true}
          showRefresh={true}
          showAdvancedFilter={true}
          showSearch={true}
          exportFileName="Sales_Management"
          exportTitle="Sales Management Report"
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
                ? "Generating Invoices PDF..."
                : "Invoices PDF",
              onClick: exportInvoicesPdf,
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
              onClick={() => openInvoicePreview(record)}
              title="Invoice Preview"
            >
              <i className="fas fa-file-invoice"></i>
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
          exportApi={API_ENDPOINTS.INVOICES.LIST}
        />

        {/* Create/Edit Sales Modal */}
        <CreateSales
          show={showCreateSalesForm}
          onClose={() => {
            setShowCreateSalesForm(false);
            setEditingRecord(null);
          }}
          onSubmit={handleFormSubmit}
          editingRecord={editingRecord}
          clients={clients}
          defaultFinancialYear={getDefaultFinancialYearRecord()}
          existingInvoices={records}
        />
      </div>

      {/* Invoice Preview Modal */}
      <InvoicePreview
        show={showInvoicePreview}
        onClose={closeInvoicePreview}
        invoiceData={buildInvoiceData(previewRecord)}
      />

      {/* Hidden divs for printing multiple invoices */}
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
            <InvoicePreview
              key={record.id || record.invoiceNumber || index}
              id={getInvoiceElementId(record, index)}
              show={true}
              renderMode="print"
              invoiceData={buildInvoiceData(record)}
            />
          ),
        )}
      </div>
    </>
  );
};

export default SalesManagement;
