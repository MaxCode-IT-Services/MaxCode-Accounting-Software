import React, { useEffect, useMemo, useRef, useState } from "react";
import ReusableTable from "../Components/ReusableTable";
import CreateYear from "../Components/CreateYear";
import ConfirmationModal from "../Components/ConfirmationModal";
import {
  showSuccess,
  showError,
  showInfo,
} from "../Components/ToastNotification";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { apiGet, apiPost, apiPut } from "../utils/api";
import { hasActionPermission } from "../utils/permissions";

const FinancialYearManagement = () => {
  const moduleKey = "financialYearManagement";
  const canCreate = hasActionPermission(moduleKey, "create");

  const [serverSide, setServerSide] = useState(true);
  const [prefLoading, setPrefLoading] = useState(true);
  const [dynamicFilterOptions, setDynamicFilterOptions] = useState({});

  useEffect(() => {
    document.title = "Financial Year Management | MaxCode IT Services";

    const fetchPreference = async () => {
      try {
        const res = await apiGet(API_ENDPOINTS.USER_PREFERENCES.GET);
        if (typeof res.data?.financialYearManagementServerSide === "boolean") {
          setServerSide(res.data.financialYearManagementServerSide);
        }
      } catch (error) {
        console.error("Failed to fetch financial year preferences:", error);
      } finally {
        setPrefLoading(false);
      }
    };

    fetchPreference();
  }, []);

  useEffect(() => {
    if (prefLoading) return;

    const savePreference = async () => {
      try {
        await apiPost(API_ENDPOINTS.USER_PREFERENCES.UPDATE, {
          financialYearManagementServerSide: serverSide,
        });
      } catch (error) {
        console.error("Failed to save financial year preferences:", error);
      }
    };

    savePreference();
  }, [serverSide, prefLoading]);

  // State for records and loading
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);
  const [showCreateYearForm, setShowCreateYearForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [allExistingYears, setAllExistingYears] = useState([]);
  const [createYearInitial, setCreateYearInitial] = useState({});
  const [activeCardFilter, setActiveCardFilter] = useState("total");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [yearToDelete, setYearToDelete] = useState(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(10);
  const [filters, setFilters] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState(null);
  const [sortDirection, setSortDirection] = useState("normal");

  const debounceTimeoutRef = useRef(null);
  const debounceColumnTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Statistics state
  const [statistics, setStatistics] = useState({
    total: 0,
    active: 0,
    inactive: 0,
    currentYear: 0,
    upcomingYear: 0,
  });

  // Card data array
  const cards = [
    {
      icon: "fa-solid fa-calendar",
      title: "Total Years",
      key: "total",
      color: "primary",
    },
    {
      icon: "fas fa-calendar-check",
      title: "Active Years",
      key: "active",
      color: "success",
    },
    {
      icon: "fa-solid fa-calendar-times",
      title: "Inactive Years",
      key: "inactive",
      color: "danger",
    },
    {
      icon: "fas fa-calendar-alt",
      title: "Current Year",
      key: "currentYear",
      color: "info",
    },
    {
      icon: "fas fa-calendar-plus",
      title: "Upcoming Years",
      key: "upcomingYear",
      color: "warning",
    },
    {
      icon: "fas fa-plus-circle",
      title: "Add New Year",
      key: "addNew",
      color: "success",
    },
  ];

  // Format date for display with time (DD/MM/YYYY | HH:MM:SS AM/PM)
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

  // Format currency
  const formatCurrency = (value) => {
    if (!value || value === "") return "₹ 0.00";
    const num = parseFloat(value);
    if (Number.isNaN(num)) return "₹ 0.00";
    return `₹ ${num.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const getOpeningItcTotal = (record) => {
    const toNumber = (input) => {
      const value = parseFloat(input);
      return Number.isNaN(value) ? 0 : value;
    };

    return (
      toNumber(record?.openingCgstItc || record?.openingItcCgst || 0) +
      toNumber(record?.openingSgstItc || record?.openingItcSgst || 0) +
      toNumber(record?.openingIgstItc || record?.openingItcIgst || 0) +
      toNumber(record?.openingItc || record?.openingGstInput || 0)
    );
  };
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

  // Get current financial year
  const getCurrentFinancialYear = () => {
    const today = new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth() + 1;

    // Financial year in India starts from April
    if (currentMonth >= 4) {
      return `${currentYear}-${(currentYear + 1).toString().slice(-2)}`;
    } else {
      return `${currentYear - 1}-${currentYear.toString().slice(-2)}`;
    }
  };

  // Check if a financial year is current
  const isCurrentFinancialYear = (financialYear) => {
    const currentFY = getCurrentFinancialYear();
    return financialYear === currentFY;
  };

  // Check if financial year is upcoming (future)
  const isUpcomingFinancialYear = (financialYear) => {
    const currentFY = getCurrentFinancialYear();
    const [startYear] = financialYear.split("-").map(Number);
    const [currentStartYear] = currentFY.split("-").map(Number);

    return startYear > currentStartYear;
  };

  const columnsWithDateFilter = ["createdDateTime"];

  const fetchFinancialYears = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (prefLoading) return;
    setLoading(true);

    try {
      let url = API_ENDPOINTS.YEARS.LIST;
      const params = new URLSearchParams();

      if (serverSide) {
        params.append("page", currentPage);
        params.append("limit", recordsPerPage);

        if (searchTerm) {
          params.append("search", searchTerm);
        }

        Object.entries(filters).forEach(([key, value]) => {
          if (["sn", "action"].includes(key)) return;
          if (
            value === undefined ||
            value === null ||
            value === "" ||
            value === "All"
          ) {
            return;
          }

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

      const response = await apiGet(url, {
        signal: controller.signal,
      });

      let yearsData;
      let total;

      if (serverSide) {
        yearsData = response.data?.data || response.data?.years || [];
        total =
          response.data?.pagination?.totalRecords ||
          response.data?.total ||
          yearsData.length;

        if (response.data?.statistics) {
          setStatistics(response.data.statistics);
        }

        if (response.data?.filterOptions) {
          setDynamicFilterOptions(response.data.filterOptions);
        }
      } else {
        yearsData =
          response.data?.data ||
          response.data?.years ||
          (Array.isArray(response.data) ? response.data : []);
        total = yearsData.length;
      }

      const mappedData = yearsData.map((yearRecord) => {
        const createdDate =
          yearRecord.createdDate ||
          yearRecord.createdAt ||
          yearRecord.created_on;

        return {
          ...yearRecord,
          id: yearRecord._id || yearRecord.id,
          createdDate,
        };
      });

      setRecords(mappedData);
      setTotalRecords(total);

      if (!serverSide) {
        updateStatistics(mappedData);
      }
    } catch (err) {
      if (err.name === "CanceledError" || err.name === "AbortError") {
        return;
      }

      console.error("Failed to fetch financial years:", err);
      showError("Failed to fetch financial years");
      setRecords([]);
      setTotalRecords(0);
      updateStatistics([]);
    } finally {
      setLoading(false);
    }
  };

  const updateStatistics = (data) => {
    const activeRecords = data.filter((r) => r.isDeleted !== true);
    setStatistics({
      total: activeRecords.length,
      active: activeRecords.filter((r) => r.status === "Active").length,
      inactive: activeRecords.filter((r) => r.status === "Inactive").length,
      currentYear: activeRecords.filter((r) =>
        isCurrentFinancialYear(r.financialYear),
      ).length,
      upcomingYear: activeRecords.filter((r) =>
        isUpcomingFinancialYear(r.financialYear),
      ).length,
    });
  };

  const fetchAllExistingYears = async () => {
    try {
      const response = await apiGet(API_ENDPOINTS.YEARS.LIST);
      const data = Array.isArray(response.data)
        ? response.data
        : response.data?.years || response.data?.data || [];

      const yearList = data
        .filter((item) => item?.isDeleted !== true)
        .map((item) => item.financialYear)
        .filter(Boolean);

      setAllExistingYears(yearList);
    } catch (error) {
      console.error("Failed to fetch full financial year list:", error);
    }
  };

  useEffect(() => {
    if (prefLoading) return;

    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);

    debounceTimeoutRef.current = setTimeout(
      () => {
        fetchFinancialYears();
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
    prefLoading,
  ]);

  // Prepare data for table (add serial number and formatted dates)
  const prepareTableData = () => {
    return records.map((record, index) => ({
      ...record,
      sn: (serverSide ? (currentPage - 1) * recordsPerPage : 0) + index + 1,
      startDateFormatted: formatDateForDisplay(record.startDate),
      endDateFormatted: formatDateForDisplay(record.endDate),
      createdDateTime: formatDateTimeForDisplay(record.createdDate),
      createdDateForFilter: record.createdDate,
      isDefaultDisplay: record.isDefault ? "Yes" : "No",
      isCurrent: isCurrentFinancialYear(record.financialYear),
      isUpcoming: isUpcomingFinancialYear(record.financialYear),
      openingCashFormatted: formatCurrency(record.openingCash),
      openingBankFormatted: formatCurrency(record.openingBank),
      openingItcFormatted: formatCurrency(getOpeningItcTotal(record)),
    }));
  };

  // Columns configuration
  const columns = [
    { key: "sn", label: "S.No", width: 70 },
    { key: "financialYear", label: "Financial Year", width: 130 },
    { key: "startDateFormatted", label: "Start Date", width: 120 },
    { key: "endDateFormatted", label: "End Date", width: 120 },
    {
      key: "taxPercentage",
      label: "Tax (%)",
      width: 100,
      render: (value) => <span>{value}%</span>,
    },
    {
      key: "openingCashFormatted",
      label: "Opening Cash",
      width: 130,
      render: (value) => (
        <span className="fw-semibold text-success">{value}</span>
      ),
    },
    {
      key: "openingBankFormatted",
      label: "Opening Bank",
      width: 130,
      render: (value) => (
        <span className="fw-semibold text-primary">{value}</span>
      ),
    },
    {
      key: "openingItcFormatted",
      label: "Opening ITC",
      width: 130,
      render: (value) => (
        <span className="fw-semibold text-warning">{value}</span>
      ),
    },
    {
      key: "invoiceFormat",
      label: "Invoice Format",
      width: 200,
    },
    {
      key: "selfInvoiceFormat",
      label: "Self Invoice Format",
      width: 220,
    },
    {
      key: "qutationFormat",
      label: "Qutation Format",
      width: 220,
    },
    {
      key: "serviceFormat",
      label: "Service Format",
      width: 220,
    },
    {
      key: "projectFormat",
      label: "Project Format",
      width: 220,
    },
    {
      key: "companyExpenseFormat",
      label: "Company Expense Format",
      width: 240,
    },
    {
      key: "paymentReceiptFormat",
      label: "Payment Receipt Format",
      width: 240,
    },
    { key: "description", label: "Description", width: 200 },
    {
      key: "isDefaultDisplay",
      label: "Default",
      width: 100,
      render: (value) => (
        <span
          className={`badge ${value === "Yes" ? "bg-success" : "bg-secondary"}`}
        >
          {value}
        </span>
      ),
    },
    {
      key: "status",
      label: "Status",
      width: 100,
    },
    { key: "createdDateTime", label: "Created Date & Time", width: 200 },
    { key: "action", label: "Actions", width: 200 },
  ];

  const fixedColumns = ["sn"];
  const defaultVisibleColumns = [
    "sn",
    "financialYear",
    "taxPercentage",
    "invoiceFormat",
    "selfInvoiceFormat",
    "status",
    "action",
  ];

  // Columns with dropdown filter
  const columnsWithDropdownFilter = ["status", "isDefaultDisplay"];

  // Filter options
  const filterOptions = {
    status: ["All", "Active", "Inactive"],
    isDefaultDisplay: ["All", "Yes", "No"],
  };

  const tableData = useMemo(
    () => prepareTableData().filter((record) => record.isDeleted !== true),
    [records, serverSide, currentPage, recordsPerPage],
  );

  const finalFilterOptions = useMemo(() => {
    if (serverSide && Object.keys(dynamicFilterOptions).length > 0) {
      return {
        ...filterOptions,
        ...dynamicFilterOptions,
      };
    }

    return filterOptions;
  }, [serverSide, dynamicFilterOptions]);

  // Handle card click
  const handleCardClick = (cardKey) => {
    if (cardKey === "addNew") {
      if (!canCreate) {
        showError("You don't have permission to add financial years");
        return;
      }
      setEditingRecord(null);
      fetchAllExistingYears();
      // Suggest a start date (next financial year start) and financial year string
      const today = new Date();
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth() + 1;
      const nextStartYear = currentMonth >= 4 ? currentYear + 1 : currentYear;
      const suggestedStartDate = `${nextStartYear}-04-01`;
      const suggestedFinancialYear = `${nextStartYear}-${(nextStartYear + 1)
        .toString()
        .slice(-2)}`;
      setCreateYearInitial({
        startDate: suggestedStartDate,
        financialYear: suggestedFinancialYear,
      });
      setShowCreateYearForm(true);
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

  // Handle form submit
  const handleFormSubmit = () => {
    setShowCreateYearForm(false);
    setEditingRecord(null);
    if (serverSide) {
      setCurrentPage(1);
    }
    fetchFinancialYears();
  };

  // Handle edit
  const handleEdit = (record) => {
    fetchAllExistingYears();
    setEditingRecord(record);
    setShowCreateYearForm(true);
    showInfo(`Editing financial year: ${record.financialYear}`);
  };

  // Handle view
  const handleView = (record) => {
    fetchAllExistingYears();
    setEditingRecord({ ...record, isViewMode: true });
    setShowCreateYearForm(true);
    showInfo(`Viewing financial year: ${record.financialYear}`);
  };

  // Handle delete - Show confirmation modal
  const handleDelete = (id) => {
    const record = records.find((r) => r.id === id || r._id === id);
    if (!record) return;

    if (record.isDefault) {
      showError(
        "Cannot delete the default financial year. Please set another year as default first.",
      );
      return;
    }

    setYearToDelete(id);
    setShowDeleteConfirm(true);
  };

  // Confirm delete - mark as deleted using isDeleted flag
  const confirmDelete = async () => {
    if (!yearToDelete) return;

    try {
      const record = records.find(
        (r) => r.id === yearToDelete || r._id === yearToDelete,
      );
      if (!record) return;

      if (record.isDefault) {
        showError(
          "Cannot delete the default financial year. Please set another year as default first.",
        );
        return;
      }

      await apiPut(API_ENDPOINTS.YEARS.UPDATE(yearToDelete), {
        isDeleted: true,
        deletedAt: new Date().toISOString(),
      });

      const updatedRecords = records.map((r) =>
        r.id === yearToDelete || r._id === yearToDelete
          ? { ...r, isDeleted: true, deletedAt: new Date().toISOString() }
          : r,
      );

      if (serverSide) {
        fetchFinancialYears();
      } else {
        setRecords(updatedRecords);
        updateStatistics(updatedRecords);
      }
      showSuccess("Financial Year deleted successfully!");
      setShowDeleteConfirm(false);
      setYearToDelete(null);
    } catch (error) {
      console.error("Error deleting financial year:", error);
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to delete financial year",
      );
    }
  };

  // Handle status toggle
  const handleStatusToggle = async (id) => {
    const recordToToggle = records.find((r) => r.id === id || r._id === id);
    if (!recordToToggle) return;

    if (recordToToggle?.isDefault && recordToToggle.status === "Active") {
      showError(
        "Cannot deactivate the default financial year. Please set another year as default first.",
      );
      return;
    }

    const newStatus =
      recordToToggle.status === "Active" ? "Inactive" : "Active";

    try {
      const { _id, id: recordId, ...updateData } = recordToToggle;
      updateData.status = newStatus;
      await apiPut(API_ENDPOINTS.YEARS.UPDATE(id), updateData);

      const updatedRecords = records.map((record) =>
        record.id === id || record._id === id
          ? {
              ...record,
              status: newStatus,
            }
          : record,
      );

      if (serverSide) {
        fetchFinancialYears();
      } else {
        setRecords(updatedRecords);
        updateStatistics(updatedRecords);
      }
      showSuccess("Status updated successfully!");
    } catch (error) {
      console.error("Error updating status:", error);
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to update status",
      );
    }
  };

  // Handle set as default
  const handleSetDefault = async (id) => {
    try {
      const {
        _id,
        id: recordId,
        ...baseData
      } = records.find((record) => record.id === id || record._id === id) || {};

      if (!baseData.financialYear) {
        showError("Financial year record not found");
        return;
      }

      await apiPut(API_ENDPOINTS.YEARS.UPDATE(id), {
        ...baseData,
        isDefault: true,
      });

      const updatedRecords = records.map((record) => ({
        ...record,
        isDefault: record.id === id || record._id === id,
      }));

      if (serverSide) {
        fetchFinancialYears();
      } else {
        setRecords(updatedRecords);
        updateStatistics(updatedRecords);
      }

      window.dispatchEvent(
        new CustomEvent("financialYearDefaultUpdated", {
          detail: {
            id,
            financialYear: baseData.financialYear,
          },
        }),
      );

      showSuccess("Default financial year updated successfully!");
    } catch (error) {
      console.error("Error updating default financial year:", error);
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to update default financial year",
      );
    }
  };

  // Handle refresh
  const handleRefresh = () => {
    if (serverSide) {
      setFilters({});
      setSearchTerm("");
      setSortField(null);
      setSortDirection("normal");
      setCurrentPage(1);
    }

    fetchFinancialYears();
    setActiveCardFilter("total");
    showInfo("Data refreshed!");
  };

  const handleServerSideSearch = (search) => {
    setSearchTerm(search);
    setCurrentPage(1);
  };

  const handleServerSideFilter = (newFilters) => {
    setFilters(newFilters);
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

  const handleDebouncedColumnFilterChange = (columnKey, value) => {
    if (debounceColumnTimeoutRef.current) {
      clearTimeout(debounceColumnTimeoutRef.current);
    }

    debounceColumnTimeoutRef.current = setTimeout(() => {
      setFilters((prev) => ({
        ...prev,
        [columnKey]: value,
      }));
      setCurrentPage(1);
    }, 500);
  };

  // Custom actions render
  const renderCustomActions = (record) => (
    <>
      {!record.isDefault && record.status === "Active" && (
        <button
          className="btn btn-sm btn-outline-primary me-1"
          onClick={() => handleSetDefault(record.id)}
          title="Set as Default"
        >
          <i className="fas fa-star"></i>
        </button>
      )}
      {record.isDefault && (
        <span className="badge bg-success me-1 py-2" title="Default Year">
          <i className="fas fa-star me-1"></i> Default
        </span>
      )}
    </>
  );

  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
      if (debounceColumnTimeoutRef.current)
        clearTimeout(debounceColumnTimeoutRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  return (
    <>
      <div className="container-fluid">
        <div
          className="py-3 d-flex justify-content-between align-items-center flex-wrap"
          style={{ marginTop: "70px" }}
        >
          <div>
            <h4 className="fs-18 fw-semibold m-0">Financial Year Management</h4>
          </div>

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
              }}
              id="financialYearServerSideToggle"
            />
            <label
              className="form-check-label ms-2"
              htmlFor="financialYearServerSideToggle"
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
              activeCardFilter === card.key && card.key !== "addNew";
            const isAddNewDisabled = card.key === "addNew" && !canCreate;

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
                    if (card.key === "addNew" && !isAddNewDisabled) {
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
                        {card.key === "addNew"
                          ? "+ Add New"
                          : statistics[card.key]}
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
          data={tableData}
          loading={loading}
          totalRecords={totalRecords}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onView={handleView}
          onStatusToggle={handleStatusToggle}
          onRefresh={handleRefresh}
          showActions={true}
          actions={["view", "edit", "delete", "status"]}
          skipDeleteConfirmation={true}
          fixedColumns={fixedColumns}
          defaultVisibleColumns={defaultVisibleColumns}
          columnsWithDropdownFilter={columnsWithDropdownFilter}
          columnsWithDateFilter={columnsWithDateFilter}
          filterOptions={finalFilterOptions}
          tableTitle="Financial Years Record"
          showColumnSelector={true}
          showExport={true}
          showRefresh={true}
          showAdvancedFilter={true}
          showSearch={true}
          exportFileName="Financial_Year_Management"
          exportTitle="Financial Year Management Report"
          activeCardFilter={activeCardFilter}
          cards={cards}
          getBadgeClass={(value) => {
            if (value === "Active") return "bg-success";
            if (value === "Inactive") return "bg-danger";
            if (value === "Yes") return "bg-success";
            if (value === "No") return "bg-secondary";
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
          exportApi={API_ENDPOINTS.YEARS.LIST}
          customActions={renderCustomActions}
        />

        {/* Create/Edit Year Modal */}
        <CreateYear
          show={showCreateYearForm}
          onClose={() => {
            setShowCreateYearForm(false);
            setEditingRecord(null);
          }}
          onSubmit={handleFormSubmit}
          editingRecord={editingRecord}
          existingYears={
            allExistingYears.length > 0
              ? allExistingYears
              : records
                  .filter((r) => r.isDeleted !== true)
                  .map((r) => r.financialYear)
          }
          initialData={createYearInitial}
        />

        <ConfirmationModal
          show={showDeleteConfirm}
          onHide={() => {
            setShowDeleteConfirm(false);
            setYearToDelete(null);
          }}
          onConfirm={confirmDelete}
          title="Delete Financial Year"
          message={
            <>
              Are you sure you want to delete financial year{" "}
              <strong>
                "
                {records.find(
                  (r) => r.id === yearToDelete || r._id === yearToDelete,
                )?.financialYear || ""}
                "
              </strong>
              ? This action marks the financial year as deleted.
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

export default FinancialYearManagement;
