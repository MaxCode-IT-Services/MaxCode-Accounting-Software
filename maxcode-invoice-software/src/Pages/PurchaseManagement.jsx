import React, { useState, useEffect, useMemo, useRef } from "react";
import ReusableTable from "../Components/ReusableTable";
import CreatePurchase from "../Components/CreatePurchase";
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
import { fetchAllVendors } from "../utils/fetchAllEntities";
import { normalizePaymentMethodOptions } from "../utils/paymentMethods";

const PurchaseManagement = () => {
  const moduleKey = "purchaseManagement";
  const canCreate = hasActionPermission(moduleKey, "create");

  // Server-side mode state, fetched from backend user preferences
  const [serverSide, setServerSide] = useState(true);
  const [prefLoading, setPrefLoading] = useState(true);
  const [dynamicFilterOptions, setDynamicFilterOptions] = useState({});

  // Fetch user preference on mount
  useEffect(() => {
    document.title = "Purchase Management | MaxCode IT Services";
    const fetchPreference = async () => {
      try {
        const res = await apiGet("/user-preferences");
        if (typeof res.data?.purchaseManagementServerSide === "boolean") {
          setServerSide(res.data.purchaseManagementServerSide);
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
          purchaseManagementServerSide: serverSide,
        });
      } catch (e) {
        // ignore
      }
    };
    savePreference();
  }, [serverSide, prefLoading]);

  // State for records and loading
  const [records, setRecords] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [financialYears, setFinancialYears] = useState([]);
  const [selectedFinancialYear, setSelectedFinancialYear] = useState(
    localStorage.getItem("selectedFinancialYear") || "ALL",
  );
  const [financialPeriodMode, setFinancialPeriodMode] = useState("yearly");
  const [loading, setLoading] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);
  const [showCreatePurchaseForm, setShowCreatePurchaseForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [activeCardFilter, setActiveCardFilter] = useState("total");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [purchaseToDelete, setPurchaseToDelete] = useState(null);

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

  const buildPaymentMethodFilterOptions = (values = []) => {
    const normalized = normalizePaymentMethodOptions(values).sort((a, b) =>
      a.localeCompare(b),
    );
    return ["All", ...normalized];
  };

  // Fetch vendors
  const fetchVendors = async (options = {}) => {
    try {
      const vendorsData = await fetchAllVendors(options);

      const activeVendors = vendorsData
        .filter((v) => v?.isDeleted !== true)
        .map((vendor) => ({
          ...vendor,
          id: vendor.id || vendor._id,
        }));
      setVendors(activeVendors);
    } catch (err) {
      console.error("Vendors API fetch error:", err);
      setVendors([]);
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

  // Fetch purchases from API with server-side parameters
  const fetchPurchases = async () => {
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
      let url = API_ENDPOINTS.PURCHASES.LIST;
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

      let purchasesData;
      let total;

      if (serverSide) {
        // Server-side response format with pagination
        purchasesData = response.data?.data || response.data?.purchases || [];
        total =
          response.data?.pagination?.totalRecords ||
          response.data?.total ||
          purchasesData.length;

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
        if (response.data?.vendors) {
          setVendors(response.data.vendors);
        }
      } else {
        // Client-side response format
        purchasesData =
          response.data?.data ||
          response.data?.purchases ||
          (Array.isArray(response.data) ? response.data : []);
        total = purchasesData.length;
      }

      const mappedData = purchasesData.map((purchase) => {
        const createdDate = purchase.createdDate || purchase.createdAt;
        const invoiceFileLink =
          purchase.invoiceFileURL ||
          (purchase.invoiceFilePath ? purchase.invoiceURL || "" : "");
        const invoiceManualLink =
          purchase.invoiceFilePath && !purchase.invoiceFileURL
            ? ""
            : purchase.invoiceURL || "";

        return {
          ...purchase,
          id: purchase._id || purchase.id,
          createdDate,
          invoiceDateFormatted: formatDateForDisplay(purchase.invoiceDate),
          paymentDateFormatted: purchase.paymentDate
            ? formatDateForDisplay(purchase.paymentDate)
            : "-",
          createdDateTime: formatDateTimeForDisplay(createdDate),
          totalAmount: purchase.taxData?.totalAmount || 0,
          roundingAmount: purchase.roundingAmount || 0,
          itemCount: purchase.items?.length || 0,
          vendorName: getVendorName(purchase),
          invoiceFileLink,
          invoiceManualLink,
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

      console.error("Failed to fetch purchases:", err);
      showError("Failed to fetch purchases");
      setRecords([]);
      setTotalRecords(0);
      updateStatistics([]);
    } finally {
      setLoading(false);
    }
  };

  // Helper to get vendor name
  const getVendorName = (purchase) => {
    if (purchase.vendorName) return purchase.vendorName;
    if (purchase.vendorId && vendors.length > 0) {
      const vendor = vendors.find((v) => v.id === purchase.vendorId);
      return vendor?.vendorName || "";
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
        fetchPurchases();
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

  // Fetch vendors and financial years on mount
  useEffect(() => {
    fetchFinancialYears();
    fetchVendors();
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

  // Card data array
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
    { key: "vendorName", label: "Vendor Name", width: 150 },
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
    {
      key: "invoiceType",
      label: "Invoice Type",
      width: 130,
      render: (value) => {
        let badgeClass = "bg-secondary";
        if (value === "ITC") badgeClass = "bg-success";
        else if (value === "Not ITC") badgeClass = "bg-warning";
        else if (value === "RCM") badgeClass = "bg-info";
        else if (value === "RCM + ITC") badgeClass = "bg-primary";
        return <span className={`badge ${badgeClass}`}>{value}</span>;
      },
    },
    {
      key: "invoiceFile",
      label: "Invoice File",
      width: 120,
      disableSort: true,
      disableFilter: true,
      render: (_, record) =>
        record.invoiceFileLink ? (
          <div onClick={(event) => event.stopPropagation()}>
            <UploadedFilePreviewBox
              fileUrl={record.invoiceFileLink}
              title="Open uploaded invoice file"
              iconClassName="fa-solid fa-file-contract"
            />
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            title="No uploaded invoice file"
            disabled
          >
            <i class="fa-solid fa-file-contract"></i>
          </button>
        ),
    },
    {
      key: "invoiceLink",
      label: "Invoice Link",
      width: 120,
      disableSort: true,
      disableFilter: true,
      render: (_, record) =>
        record?.invoiceManualLink ? (
          <button
            type="button"
            className="btn btn-sm btn-outline-info"
            onClick={(event) => {
              event.stopPropagation();
              window.open(
                record.invoiceManualLink,
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
    { key: "action", label: "Actions", width: 150 },
  ];

  const fixedColumns = ["sn"];
  const defaultVisibleColumns = [
    "sn",
    "invoiceNumber",
    "invoiceDateFormatted",
    "vendorName",
    "businessName",
    "totalAmount",
    "action",
  ];

  // Columns with dropdown filter
  const columnsWithDropdownFilter = [
    "paymentStatus",
    "paymentMethod",
    "invoiceType",
    "placeOfSupply",
  ];

  // Filter options
  const getFilterOptions = () => {
    const paymentMethodValues = buildPaymentMethodFilterOptions(
      records.map((record) => record.paymentMethod),
    );

    const options = {
      paymentStatus: ["All", "Paid", "Unpaid", "Partial"],
      paymentMethod: paymentMethodValues,
      invoiceType: ["All", "Not ITC", "ITC", "RCM", "RCM + ITC"],
    };

    // Get unique placeOfSupply values from records
    if (records.length > 0) {
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
        showError("You don't have permission to add purchase records");
        return;
      }
      setEditingRecord(null);
      setShowCreatePurchaseForm(true);
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
          `Please select default financial year ${defaultFinancialYear.value} in navbar before creating purchase.`,
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

    const selectedVendor = vendors.find(
      (v) => v.id == formData.vendorId || v._id == formData.vendorId,
    );

    const vendorName =
      selectedVendor?.vendorName || editingRecord?.vendorName || "";

    try {
      if (editingRecord && !editingRecord.isViewMode) {
        const purchaseId = editingRecord._id || editingRecord.id;
        const payload = {
          ...formData,
          vendorName,
          createdDate: editingRecord.createdDate,
        };

        await apiPut(API_ENDPOINTS.PURCHASES.UPDATE(purchaseId), payload);
        showSuccess("Purchase updated successfully!");
      } else {
        const payload = {
          ...formData,
          vendorName,
          createdDate: new Date().toISOString(),
        };

        await apiPost(API_ENDPOINTS.PURCHASES.CREATE, payload);
        showSuccess("Purchase added successfully!");
      }

      await fetchPurchases();
      setShowCreatePurchaseForm(false);
      setEditingRecord(null);
    } catch (error) {
      console.error("Error saving purchase:", error);
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to save purchase",
      );
      throw error;
    }
  };

  // Handle edit
  const handleEdit = (record) => {
    setEditingRecord(record);
    setShowCreatePurchaseForm(true);
    showInfo(`Editing purchase: ${record.invoiceNumber}`);
  };

  // Handle view
  const handleView = (record) => {
    setEditingRecord({ ...record, isViewMode: true });
    setShowCreatePurchaseForm(true);
    showInfo(`Viewing purchase: ${record.invoiceNumber}`);
  };

  // Handle delete
  const handleDelete = (id) => {
    const record = records.find((r) => r.id === id || r._id === id);
    if (!record) return;

    setPurchaseToDelete(id);
    setShowDeleteConfirm(true);
  };

  // Confirm delete
  const confirmDelete = async () => {
    if (!purchaseToDelete) return;

    try {
      await apiDelete(API_ENDPOINTS.PURCHASES.DELETE(purchaseToDelete));
      showSuccess("Purchase deleted successfully!");
      await fetchPurchases();
      setShowDeleteConfirm(false);
      setPurchaseToDelete(null);
    } catch (error) {
      console.error("Error deleting purchase:", error);
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to delete purchase",
      );
    }
  };

  // Handle status toggle (not applicable for purchases, but kept for compatibility)
  const handleStatusToggle = async (id) => {
    showInfo("Status toggle not applicable for purchases");
  };

  // Handle refresh
  const handleRefresh = () => {
    fetchFinancialYears();
    fetchVendors({ forceRefresh: true });
    if (serverSide) {
      setFilters({});
      setSearchTerm("");
      setSortField(null);
      setSortDirection("normal");
      setCurrentPage(1);
      setActiveCardFilter("total");
      setFinancialPeriodMode("yearly");
    }
    fetchPurchases();
    showInfo("Data refreshed!");
  };

  // Handle export with items
  const handleExportItemWiseExcel = () => {
    const dataToExport = serverSide ? records : filteredClientSideData;
    if (!dataToExport.length) {
      showError("No purchase invoices found for the selected filters.");
      return;
    }

    try {
      exportItemWiseExcel({
        records: dataToExport,
        exportFileName: "Purchase_Management",
        sheetName: "Purchase Item Wise",
        reportTitle: "Purchase_Item_Wise",
        invoiceNumberKey: "invoiceNumber",
        partyNameKey: "vendorName",
        partyLabel: "Vendor Name",
        dateKey: "invoiceDate",
        partyDetails: {
          gstinKey: "gstin",
          addressKey: "address",
          placeOfSupplyKey: "placeOfSupply",
        },
      });
      showSuccess("Purchase item-wise Excel exported successfully!");
    } catch (error) {
      console.error("Purchase item-wise Excel export error:", error);
      showError("Failed to export Purchase item-wise Excel.");
    }
  };

  const handleExportItemWisePDF = () => {
    const dataToExport = serverSide ? records : filteredClientSideData;
    if (!dataToExport.length) {
      showError("No purchase invoices found for the selected filters.");
      return;
    }

    try {
      exportItemWisePDF({
        records: dataToExport,
        exportFileName: "Purchase_Management",
        reportTitle: "Purchase Report",
        invoiceNumberKey: "invoiceNumber",
        partyNameKey: "vendorName",
        partyLabel: "Vendor Name",
        dateKey: "invoiceDate",
        partyDetails: {
          gstinKey: "gstin",
          addressKey: "address",
          placeOfSupplyKey: "placeOfSupply",
        },
      });
      showSuccess("Purchase item-wise PDF exported successfully!");
    } catch (error) {
      console.error("Purchase item-wise PDF export error:", error);
      showError("Failed to export Purchase item-wise PDF.");
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
          <h4 className="fs-18 fw-semibold m-0">Purchase Management</h4>

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
          onStatusToggle={handleStatusToggle}
          onRefresh={handleRefresh}
          showActions={true}
          actions={["view", "edit", "delete"]}
          skipDeleteConfirmation={true}
          fixedColumns={fixedColumns}
          defaultVisibleColumns={defaultVisibleColumns}
          columnsWithDropdownFilter={columnsWithDropdownFilter}
          columnsWithDateFilter={columnsWithDateFilter}
          filterOptions={serverSide ? dynamicFilterOptions : getFilterOptions()}
          tableTitle="Purchase Records"
          showColumnSelector={true}
          showExport={true}
          showRefresh={true}
          showAdvancedFilter={true}
          showSearch={true}
          exportFileName="Purchase_Management"
          exportTitle="Purchase Management Report"
          extraExportItems={[
            {
              label: "Export Excel with Items",
              onClick: handleExportItemWiseExcel,
            },
            {
              label: "Export PDF with Items",
              onClick: handleExportItemWisePDF,
            },
          ]}
          activeCardFilter={activeCardFilter}
          cards={cards}
          getBadgeClass={(value) => {
            if (value === "Paid") return "bg-success";
            if (value === "Unpaid") return "bg-danger";
            if (value === "Partial") return "bg-warning";
            if (value === "ITC") return "bg-success";
            if (value === "Not ITC") return "bg-warning";
            if (value === "RCM") return "bg-info";
            if (value === "RCM + ITC") return "bg-primary";
            return "bg-secondary";
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
          exportApi={API_ENDPOINTS.PURCHASES.LIST}
        />

        {/* Create/Edit Purchase Modal */}
        <CreatePurchase
          show={showCreatePurchaseForm}
          onClose={() => {
            setShowCreatePurchaseForm(false);
            setEditingRecord(null);
          }}
          onSubmit={handleFormSubmit}
          editingRecord={editingRecord}
          vendors={vendors}
        />

        {/* Delete Confirmation Modal */}
        <ConfirmationModal
          show={showDeleteConfirm}
          onHide={() => {
            setShowDeleteConfirm(false);
            setPurchaseToDelete(null);
          }}
          onConfirm={confirmDelete}
          title="Delete Purchase"
          message={
            <>
              Are you sure you want to delete purchase{" "}
              <strong>
                "
                {records.find(
                  (r) =>
                    r.id === purchaseToDelete || r._id === purchaseToDelete,
                )?.invoiceNumber || ""}
                "
              </strong>
              ? This action marks the purchase as deleted.
            </>
          }
          confirmText="Delete"
          cancelText="Cancel"
          variant="danger"
        />
      </div>
    </>
  );
};

export default PurchaseManagement;
