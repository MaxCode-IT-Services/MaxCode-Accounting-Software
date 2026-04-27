import React, { useState, useEffect, useMemo, useRef } from "react";
import numToWords from "../utils/numberToWords";
import ReusableTable from "../Components/ReusableTable";
import CreatePaymentReceipt from "../Components/CreatePaymentReceipt";
import PaymentReceiptPreview from "../Components/PaymentReceiptPreview";
import ConfirmationModal from "../Components/ConfirmationModal";
import { showSuccess, showError } from "../Components/ToastNotification";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { apiGet, apiDelete, apiPost } from "../utils/api";
import { hasActionPermission } from "../utils/permissions";

const PaymentReceiptManagement = () => {
  const moduleKey = "paymentReceiptManagement";
  const canCreate = hasActionPermission(moduleKey, "create");

  const [serverSide, setServerSide] = useState(true);
  const [prefLoading, setPrefLoading] = useState(true);
  const [dynamicFilterOptions, setDynamicFilterOptions] = useState({});

  useEffect(() => {
    document.title = "Payment Receipts | MaxCode IT Services";
    const fetchPreference = async () => {
      try {
        const res = await apiGet("/user-preferences");
        if (typeof res.data?.paymentReceiptManagementServerSide === "boolean") {
          setServerSide(res.data.paymentReceiptManagementServerSide);
        }
      } catch {
      } finally {
        setPrefLoading(false);
      }
    };
    fetchPreference();
  }, []);

  useEffect(() => {
    if (prefLoading) return;
    const save = async () => {
      try {
        await apiPost("/user-preferences", {
          paymentReceiptManagementServerSide: serverSide,
        });
      } catch {}
    };
    save();
  }, [serverSide, prefLoading]);

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [activeCardFilter, setActiveCardFilter] = useState("total");
  const [showPreview, setShowPreview] = useState(false);
  const [previewRecord, setPreviewRecord] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState(null);
  const [financialYears, setFinancialYears] = useState([]);
  const [defaultFinancialYear, setDefaultFinancialYear] = useState(null);

  const [selectedFinancialYear, setSelectedFinancialYear] = useState(
    localStorage.getItem("selectedFinancialYear") || "ALL",
  );
  const [financialPeriodMode, setFinancialPeriodMode] = useState("yearly");

  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(10);
  const [filters, setFilters] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState("receiptNumber");
  const [sortDirection, setSortDirection] = useState("descending");

  const debounceTimeoutRef = useRef(null);
  const debounceColumnTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null);

  const [statistics, setStatistics] = useState({
    total: 0,
    advance: 0,
    regular: 0,
    totalAmount: 0,
  });

  const columnsWithDateFilter = ["createdDateTime", "receiptDateFormatted"];

  // Add dropdown filter columns (dynamic like ClientManagement)
  const columnsWithDropdownFilter = [
    "clientName",
    "businessName",
    "paymentTypeBadge",
    "adjustmentStatus",
    "paymentMethod",
  ];

  // Utility for canonical payment method options (if available)
  function buildPaymentMethodFilterOptions(methods) {
    // Canonicalize, dedupe, sort, and add "All"
    const canonical = (methods || [])
      .map((m) => (m || "").trim())
      .filter(Boolean);
    const unique = Array.from(new Set(canonical));
    unique.sort((a, b) => a.localeCompare(b));
    return ["All", ...unique];
  }

  // Dynamic filter options for dropdown columns (always from records, deduped, sorted)
  const getFilterOptions = () => {
    const options = {};
    // Client Name
    const clientNames = Array.from(
      new Set(records.map((r) => r.clientName).filter(Boolean)),
    );
    options.clientName = [
      "All",
      ...clientNames.sort((a, b) => a.localeCompare(b)),
    ];
    // Business Name
    const businessNames = Array.from(
      new Set(records.map((r) => r.businessName).filter(Boolean)),
    );
    options.businessName = [
      "All",
      ...businessNames.sort((a, b) => a.localeCompare(b)),
    ];
    // Type (paymentTypeBadge)
    const types = Array.from(
      new Set(records.map((r) => r.paymentTypeBadge).filter(Boolean)),
    );
    options.paymentTypeBadge = [
      "All",
      ...types.sort((a, b) => a.localeCompare(b)),
    ];
    // Advance Status (adjustmentStatus)
    const statuses = Array.from(
      new Set(records.map((r) => r.adjustmentStatus).filter(Boolean)),
    );
    options.adjustmentStatus = [
      "All",
      ...statuses.sort((a, b) => a.localeCompare(b)),
    ];
    // Payment Method (canonical, sorted)
    options.paymentMethod = buildPaymentMethodFilterOptions(
      records.map((r) => r.paymentMethod),
    );
    return options;
  };

  useEffect(() => {
    const handler = (event) => {
      const selectedYear =
        event?.detail?.selectedFinancialYear ||
        localStorage.getItem("selectedFinancialYear") ||
        "ALL";
      setSelectedFinancialYear(selectedYear);
      if (serverSide) setCurrentPage(1);
    };
    window.addEventListener("financialYearSelectionChanged", handler);
    return () =>
      window.removeEventListener("financialYearSelectionChanged", handler);
  }, [serverSide]);

  // Fetch financial years
  useEffect(() => {
    const fetchYears = async () => {
      try {
        const res = await apiGet(API_ENDPOINTS.YEARS.LIST);
        const years = Array.isArray(res.data) ? res.data : res.data?.data || [];
        setFinancialYears(years);

        // Find the default financial year
        const defaultYear =
          years.find((year) => year?.isDefault === true) || null;
        setDefaultFinancialYear(defaultYear);
      } catch (error) {
        console.error("Failed to fetch financial years:", error);
      }
    };
    fetchYears();
  }, []);

  const fetchReceipts = async () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    if (prefLoading) return;
    setLoading(true);

    try {
      let url = API_ENDPOINTS.PAYMENT_RECEIPTS.LIST;
      const params = new URLSearchParams();

      if (serverSide) {
        params.append("page", currentPage);
        params.append("limit", recordsPerPage);
        if (searchTerm) params.append("search", searchTerm);
        if (selectedFinancialYear && selectedFinancialYear !== "ALL")
          params.append("financialYear", selectedFinancialYear);
        if (financialPeriodMode && financialPeriodMode !== "yearly")
          params.append("period", financialPeriodMode);

        Object.entries(filters).forEach(([key, value]) => {
          if (["sn", "action"].includes(key)) return;
          if (
            value === undefined ||
            value === null ||
            value === "" ||
            value === "All"
          )
            return;
          if (columnsWithDateFilter.includes(key)) {
            if (value && typeof value === "object") {
              const backendKey =
                key === "createdDateTime"
                  ? "createdAt"
                  : key === "receiptDateFormatted"
                    ? "receiptDate"
                    : key;
              if (value.startDate)
                params.append(`${backendKey}_start`, value.startDate);
              if (value.endDate)
                params.append(`${backendKey}_end`, value.endDate);
            }
          } else {
            if (Array.isArray(value) && value.length > 0)
              params.append(key, value.join(","));
            else if (!Array.isArray(value)) params.append(key, value);
          }
        });

        if (sortField && sortDirection !== "normal") {
          params.append("sortBy", sortField);
          params.append(
            "sortOrder",
            sortDirection === "ascending" ? "asc" : "desc",
          );
        }
        if (
          activeCardFilter &&
          activeCardFilter !== "total" &&
          activeCardFilter !== "addNew"
        ) {
          params.append("filter", activeCardFilter);
        }
        url = `${url}?${params.toString()}`;
      }

      const response = await apiGet(url, { signal: controller.signal });
      let data, total;

      if (serverSide) {
        data = response.data?.records || [];
        total = response.data?.total || data.length;
        if (response.data?.statistics) setStatistics(response.data.statistics);
        if (response.data?.meta) {
          const meta = response.data.meta;
          setDynamicFilterOptions({
            paymentMethod: meta.paymentMethods
              ? ["All", ...meta.paymentMethods]
              : [],
            paymentType: meta.paymentTypes ? ["All", ...meta.paymentTypes] : [],
          });
        }
      } else {
        data = Array.isArray(response.data?.records)
          ? response.data.records
          : [];
        total = data.length;
      }

      const mapped = data.map((r, idx) => ({
        ...r,
        id: r._id || r.id,
        sn: (currentPage - 1) * recordsPerPage + idx + 1,
        receiptDateFormatted: r.receiptDate || "",
        amountFormatted: `₹${Number(r.amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
        availableAmountFormatted:
          r.paymentType === "advance"
            ? `₹${Number(r.availableAmount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`
            : "—",
        // Expose applied invoice number if backend provides it (or fallback to invoiceNumber)
        appliedInvoiceNumber:
          r.appliedInvoiceNumber || r.appliedToInvoice || r.invoiceNumber || "",
        paymentTypeBadge: r.paymentType === "advance" ? "Advance" : "Regular",
      }));

      setRecords(mapped);
      setTotalRecords(total);
    } catch (err) {
      if (err.name === "CanceledError" || err.name === "AbortError") return;
      console.error("Failed to fetch payment receipts:", err);
      showError("Failed to fetch payment receipts");
      setRecords([]);
      setTotalRecords(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (prefLoading) return;
    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
    debounceTimeoutRef.current = setTimeout(
      fetchReceipts,
      serverSide ? 400 : 0,
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

  const handleDelete = async () => {
    if (!recordToDelete) return;
    try {
      await apiDelete(
        API_ENDPOINTS.PAYMENT_RECEIPTS.DELETE(
          recordToDelete.id || recordToDelete._id,
        ),
      );
      showSuccess("Receipt deleted successfully");
      setShowDeleteConfirm(false);
      setRecordToDelete(null);
      fetchReceipts();
    } catch (err) {
      showError(err?.response?.data?.error || "Failed to delete receipt");
    }
  };

  const handleCardClick = (key) => {
    if (key === "addNew") {
      if (canCreate) setShowCreateForm(true);
      return;
    }
    setActiveCardFilter(key);
    setCurrentPage(1);
  };

  const cards = [
    {
      icon: "fas fa-receipt",
      title: "Total Receipts",
      key: "total",
      color: "primary",
      count: statistics.total,
    },
    {
      icon: "fas fa-rupee-sign",
      title: "Total Amount",
      key: "totalAmount",
      color: "info",
      count: statistics.totalAmount,
      isCurrency: true,
    },
    {
      icon: "fas fa-file-invoice-dollar",
      title: "Regular Receipts",
      key: "regular",
      color: "success",
      count: statistics.regular,
    },
    {
      icon: "fa-solid fa-hand-holding-dollar",
      title: "Advance Receipts",
      key: "advance",
      color: "warning",
      count: statistics.advance,
    },
    {
      icon: "fa-regular fa-calendar-days",
      title: "Financial Period",
      key: "period",
      color: "warning",
    },
    {
      icon: "fas fa-plus-circle",
      title: "New Receipt",
      key: "addNew",
      color: "success",
    },
  ];

  const filterOptions = getFilterOptions();
  const columns = [
    {
      key: "sn",
      label: "S.No",
      sortable: false,
      filterable: false,
      width: 70,
      resizable: true,
    },
    {
      key: "receiptNumber",
      label: "Receipt No.",
      sortable: true,
      filterable: true,
      width: 130,
      resizable: true,
    },
    {
      key: "receiptDateFormatted",
      label: "Date",
      sortable: true,
      filterable: true,
      filterType: "dateRange",
      width: 120,
      resizable: true,
    },
    {
      key: "clientName",
      label: "Client Name",
      sortable: true,
      filterable: true,
      filterType: "search",
      width: 150,
      resizable: true,
    },
    {
      key: "businessName",
      label: "Business Name",
      sortable: true,
      filterable: true,
      filterType: "search",
      width: 150,
      resizable: true,
    },
    {
      key: "paymentTypeBadge",
      label: "Type",
      sortable: true,
      filterable: true,
      filterType: "dropdown",
      filterOptions: filterOptions.paymentTypeBadge,
      width: 120,
      resizable: true,
      render: (value) =>
        value ? (
          <span
            className={`badge bg-${value === "Advance" ? "success" : "danger"}`}
          >
            {value}
          </span>
        ) : (
          "-"
        ),
    },
    {
      key: "amountFormatted",
      label: "Amount",
      sortable: true,
      filterable: true,
      filterType: "search",
      width: 120,
      resizable: true,
    },
    {
      key: "availableAmountFormatted",
      label: "Advance Balance",
      sortable: false,
      filterable: true,
      filterType: "search",
      width: 140,
      resizable: true,
    },
    {
      key: "adjustmentStatus",
      label: "Advance Status",
      sortable: false,
      filterable: true,
      filterType: "dropdown",
      filterOptions: filterOptions.adjustmentStatus,
      width: 150,
      resizable: true,
      render: (value) => {
        let color = "secondary";
        if (value === "Fully Applied") color = "success";
        else if (value === "Partially Applied") color = "warning";
        else if (value === "Unapplied") color = "warning";
        return value ? (
          <span
            className={`badge bg-${color} ${value === "Unapplied" ? "text-dark" : ""}`}
          >
            {value}
          </span>
        ) : (
          "-"
        );
      },
    },
    {
      key: "paymentMethod",
      label: "Payment Method",
      sortable: true,
      filterable: true,
      filterType: "dropdown",
      filterOptions: filterOptions.paymentMethod,
      width: 150,
      resizable: true,
    },
    {
      key: "invoiceNumber",
      label: "Invoice No.",
      sortable: true,
      filterable: true,
      width: 120,
      resizable: true,
    },
    {
      key: "debitNoteNumber",
      label: "Debit Note No.",
      sortable: true,
      filterable: true,
      width: 140,
      resizable: true,
      render: (value) => (value ? value : "-"),
    },
    {
      key: "appliedInvoiceNumber",
      label: "Applied Invoice",
      sortable: true,
      filterable: true,
      width: 140,
      resizable: true,
      render: (value) => (value ? value : "-"),
    },
    {
      key: "purpose",
      label: "Purpose",
      sortable: false,
      filterable: true,
      filterType: "search",
      width: 200,
      resizable: true,
    },
    {
      key: "action",
      label: "Actions",
      sortable: false,
      filterable: false,
      width: 150,
      resizable: true,
    },
  ];

  const preparedData = useMemo(() => records, [records]);

  const getCardNumber = (index) => (index % 8) + 1;

  const getPeriodDisplayValue = () => {
    if (financialPeriodMode === "daily") return "Daily";
    if (financialPeriodMode === "monthly") return "Monthly";
    if (financialPeriodMode === "quarterly") return "Quarterly";
    if (financialPeriodMode === "halfYearly") return "Half Yearly";
    return "Yearly";
  };

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

  // Helper: format date as DD-MM-YYYY
  const formatDateDDMMYYYY = (dateString) => {
    if (!dateString) return "-";
    try {
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        const day = String(date.getDate()).padStart(2, "0");
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
      }
      return dateString;
    } catch {
      return dateString;
    }
  };

  // Helper: format date & time as DD-MM-YYYY | hh:mm:ss AM/PM
  const formatDateTime = (dateString) => {
    if (!dateString) return "-";
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
    } catch {
      return dateString;
    }
  };

  const buildReceiptPreviewData = (record, businessSettings = {}) => {
    const amount = Number(record.amount || 0);
    const receiptNumber = record.receiptNumber || "0001";
    const formattedDate = formatDateDDMMYYYY(record.receiptDate);
    // Use createdAt for signature date & time
    const signatureDateTime = formatDateTime(record.createdAt);
    // Prefer applied invoice reference if backend provides it
    let referenceInvoiceNumber =
      record.appliedInvoiceNumber || record.invoiceNumber || "";
    if (record.paymentType === "advance" && !referenceInvoiceNumber) {
      referenceInvoiceNumber = "Advance Payment (Invoice Pending)";
    }
    return {
      companyName: businessSettings.companyName || "MaxCode IT Services",
      companyAddress: businessSettings.companyAddress || "Jaipur, Rajasthan",
      companyPhone:
        businessSettings.companyPhone || businessSettings.phone || "",
      companyEmail:
        businessSettings.companyEmail || businessSettings.email || "",
      companyWebsite:
        businessSettings.companyWebsite ||
        businessSettings.website ||
        "www.maxcode.in",
      receiptNo: receiptNumber,
      memoNo: receiptNumber,
      receiptDate: formattedDate,
      clientName: record.clientName || "",
      businessName: record.businessName || "",
      contactNo: record.phoneNumber || "",
      address:
        record.address || record.clientAddress || record.businessAddress || "",
      paymentMethod: record.paymentMethod || "",
      bankName: record.bankName || "",
      purpose:
        record.purpose ||
        (record.paymentType === "advance"
          ? "Advance Payment"
          : "Sales Invoice"),
      amount,
      amountInWords: numToWords(amount),
      referenceInvoiceNumber,
      note: record.note || "",
      receivedBy: businessSettings.companyName || "MaxCode IT Services",
      signatureDateTime,
    };
  };

  const [businessSettings, setBusinessSettings] = useState({});
  useEffect(() => {
    const fetchBizSettings = async () => {
      try {
        const res = await apiGet(API_ENDPOINTS.BUSINESS_SETTINGS.GET);
        if (res?.data?.settings) setBusinessSettings(res.data.settings);
      } catch {}
    };
    fetchBizSettings();
  }, []);

  return (
    <div className="container-fluid">
      <div
        className="py-3 d-flex justify-content-between align-items-center flex-wrap"
        style={{ marginTop: "70px" }}
      >
        <h4 className="fs-18 fw-semibold m-0">Payment Receipt Management</h4>
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
              setSortField("receiptNumber");
              setSortDirection("descending");
              setActiveCardFilter("total");
              setFinancialPeriodMode("yearly");
            }}
            id="paymentReceiptServerSideToggle"
          />
          <label
            className="form-check-label ms-2"
            htmlFor="paymentReceiptServerSideToggle"
          >
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
          } else if (card.isCurrency) {
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
                  border: isActive ? "2px solid #0d6efd" : "1px solid #dee2e6",
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
                  e.currentTarget.style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)";
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

      {/* Table */}
      <ReusableTable
        moduleKey={moduleKey}
        columns={columns}
        data={preparedData}
        loading={loading}
        totalRecords={totalRecords}
        tableTitle="Payment Receipts"
        showColumnSelector={true}
        showExport={true}
        showRefresh={true}
        showAdvancedFilter={true}
        enableColumnResizing={true}
        showSearch={true}
        exportFileName="Payment_Receipts"
        exportTitle="Payment Receipt Report"
        fixedColumns={["sn"]}
        defaultVisibleColumns={[
          "sn",
          "receiptNumber",
          "receiptDateFormatted",
          "clientName",
          "paymentTypeBadge",
          "amountFormatted",
          "action",
        ]}
        serverSide={serverSide}
        onServerSideSearch={(term) => {
          setSearchTerm(term);
          setCurrentPage(1);
        }}
        onServerSideFilter={(f) => {
          setFilters(f);
          setCurrentPage(1);
        }}
        onServerSideSort={(field, dir) => {
          setSortField(field);
          setSortDirection(dir);
          setCurrentPage(1);
        }}
        onServerSidePageChange={setCurrentPage}
        onServerSideRecordsPerPageChange={(val) => {
          setRecordsPerPage(val);
          setCurrentPage(1);
        }}
        onColumnFilterChange={handleDebouncedColumnFilterChange}
        currentPage={currentPage}
        recordsPerPage={recordsPerPage}
        onPageChange={setCurrentPage}
        onRecordsPerPageChange={(val) => {
          setRecordsPerPage(val);
          setCurrentPage(1);
        }}
        columnsWithDateFilter={columnsWithDateFilter}
        columnsWithDropdownFilter={columnsWithDropdownFilter.filter(
          (col) => col !== "clientName" && col !== "businessName",
        )}
        filterOptions={filterOptions}
        onRefresh={() => {
          setFilters({});
          setSearchTerm("");
          setSortField("receiptNumber");
          setSortDirection("descending");
          setCurrentPage(1);
          setActiveCardFilter("total");
          setFinancialPeriodMode("yearly");
          fetchReceipts();
        }}
        skipDeleteConfirmation={true}
        onDelete={(record) => {
          setRecordToDelete(record);
          setShowDeleteConfirm(true);
        }}
        onEdit={(record) => {
          setEditingRecord(record);
          setShowCreateForm(true);
        }}
        showActions={true}
        actions={[]}
        customActions={(record) => (
          <>
            {/* Eye button: opens read-only form modal */}
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary me-1"
              title="View Details (Read Only)"
              onClick={() => {
                setEditingRecord({ ...record, isViewMode: true });
                setShowCreateForm(true);
              }}
            >
              <i className="fa-solid fa-eye"></i>
            </button>
            {/* Edit button */}
            <button
              type="button"
              className="btn btn-sm btn-outline-primary me-1"
              title="Edit"
              data-bs-toggle="tooltip"
              data-bs-placement="top"
              onClick={() => {
                setEditingRecord(record);
                setShowCreateForm(true);
              }}
            >
              <i className="fa-solid fa-pen-to-square"></i>
            </button>
            {/* Delete button */}
            <button
              type="button"
              className="btn btn-sm btn-outline-danger me-1"
              title="Delete"
              onClick={() => {
                setRecordToDelete(record);
                setShowDeleteConfirm(true);
              }}
            >
              <i className="fa-solid fa-trash"></i>
            </button>
            {/* Receipt preview button */}
            <button
              type="button"
              className="btn btn-sm btn-outline-info"
              title="Receipt Preview"
              onClick={() => {
                setPreviewRecord(
                  buildReceiptPreviewData(record, businessSettings),
                );
                setShowPreview(true);
              }}
            >
              <i class="fas fa-receipt"></i>
            </button>
          </>
        )}
        rowClassName={(record) => {
          if (record.paymentType === "advance") {
            if (record.adjustmentStatus === "Fully Applied")
              return "table-success";
            if (record.adjustmentStatus === "Partially Applied")
              return "table-warning";
            if (record.adjustmentStatus === "Unapplied") return "table-info";
          }
          return "";
        }}
        exportApi={API_ENDPOINTS.PAYMENT_RECEIPTS.LIST}
      />

      {/* Create / Edit Form */}
      {showCreateForm && (
        <CreatePaymentReceipt
          show={!!showCreateForm}
          onClose={() => {
            setShowCreateForm(false);
            setEditingRecord(null);
          }}
          onSubmit={() => fetchReceipts()}
          editingRecord={editingRecord}
          defaultFinancialYear={defaultFinancialYear}
          readOnly={!!editingRecord?.isViewMode}
        />
      )}

      {/* Preview Modal */}
      {showPreview && previewRecord && (
        <PaymentReceiptPreview
          id="payment-receipt-preview-main"
          receiptData={previewRecord}
          show={showPreview}
          onClose={() => {
            setShowPreview(false);
            setPreviewRecord(null);
          }}
          renderMode="modal"
        />
      )}

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <ConfirmationModal
          show={showDeleteConfirm}
          title="Delete Receipt"
          message={`Are you sure you want to delete receipt "${recordToDelete?.receiptNumber}"? This action cannot be undone.`}
          confirmText="Delete"
          confirmVariant="danger"
          onConfirm={handleDelete}
          onCancel={() => {
            setShowDeleteConfirm(false);
            setRecordToDelete(null);
          }}
        />
      )}
    </div>
  );
};

export default PaymentReceiptManagement;
