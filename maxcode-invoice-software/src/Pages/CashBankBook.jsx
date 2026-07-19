import React, { useState, useEffect, useMemo, useRef } from "react";
import ReusableTable from "../Components/ReusableTable";
import CreateCashBankEntry from "../Components/CreateCashBankEntry";
import ConfirmationModal from "../Components/ConfirmationModal";
import {
  showSuccess,
  showError,
  showInfo,
} from "../Components/ToastNotification";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { apiGet, apiDelete, apiPut, apiPost } from "../utils/api";
import { hasActionPermission } from "../utils/permissions";

const CashBankBook = () => {
  const moduleKey = "cashBankBook";
  const canCreate = hasActionPermission(moduleKey, "create");

  // Server-side mode state, fetched from backend user preferences
  const [serverSide, setServerSide] = useState(true);
  const [prefLoading, setPrefLoading] = useState(true);
  const [dynamicFilterOptions, setDynamicFilterOptions] = useState({});

  // Fetch user preference on mount
  useEffect(() => {
    document.title = "Cash & Bank Book | MaxCode IT Services";
    const fetchPreference = async () => {
      try {
        const res = await apiGet("/user-preferences");
        if (typeof res.data?.cashBankBookServerSide === "boolean") {
          setServerSide(res.data.cashBankBookServerSide);
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
          cashBankBookServerSide: serverSide,
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
  const [loading, setLoading] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [activeCardFilter, setActiveCardFilter] = useState("total");
  const [financialPeriodMode, setFinancialPeriodMode] = useState("yearly");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState(null);

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
    totalAmount: 0,
    cashEntries: 0,
    bankEntries: 0,
    cashAmount: 0,
    bankAmount: 0,
  });

  // Columns with date range filter
  const columnsWithDateFilter = ["entryDate", "createdDateTime"];

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

  // Fetch entries from API
  const fetchEntries = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (prefLoading) return;
    setLoading(true);

    try {
      let url = API_ENDPOINTS.CASH_BANK_BOOK.LIST;
      const params = new URLSearchParams();

      if (serverSide) {
        params.append("page", currentPage);
        params.append("limit", recordsPerPage);

        if (searchTerm) {
          params.append("search", searchTerm);
        }

        // Financial year filter
        if (selectedFinancialYear && selectedFinancialYear !== "ALL") {
          params.append("financialYear", selectedFinancialYear);
        }

        // Financial period mode filter
        if (financialPeriodMode && financialPeriodMode !== "yearly") {
          params.append("period", financialPeriodMode);
        }

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
              // Map frontend column key to backend field name
              const backendKey = key === "createdDateTime" ? "createdAt" : key;
              if (value.startDate) {
                params.append(`${backendKey}_start`, value.startDate);
              }
              if (value.endDate) {
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

        // Card filter
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

      let entriesData;
      let total;

      if (serverSide) {
        entriesData = response.data?.data || response.data?.entries || [];
        total =
          response.data?.pagination?.totalRecords ||
          response.data?.total ||
          entriesData.length;

        if (response.data?.statistics) {
          setStatistics(response.data.statistics);
        }
        if (response.data?.filterOptions) {
          setDynamicFilterOptions(response.data.filterOptions);
        }
      } else {
        entriesData =
          response.data?.data ||
          response.data?.entries ||
          (Array.isArray(response.data) ? response.data : []);
        total = entriesData.length;
      }

      const mappedData = entriesData.map((entry) => ({
        ...entry,
        id: entry._id || entry.id,
      }));

      setRecords(mappedData);
      setTotalRecords(total);

      // Client-side statistics
      if (!serverSide) {
        updateStatistics(mappedData);
      }
    } catch (err) {
      if (err.name === "CanceledError" || err.name === "AbortError") {
        return;
      }

      console.error("Failed to fetch cash & bank entries:", err);
      showError("Failed to fetch cash & bank entries");
      setRecords([]);
      setTotalRecords(0);
      updateStatistics([]);
    } finally {
      setLoading(false);
    }
  };

  // Update statistics (client-side)
  const updateStatistics = (data) => {
    const activeRecords = data.filter((r) => r.isDeleted !== true);
    const stats = {
      total: activeRecords.length,
      totalAmount: activeRecords.reduce(
        (sum, r) => sum + parseFloat(r.amount || 0),
        0,
      ),
      cashEntries: activeRecords.filter((r) => r.entryType === "Cash").length,
      bankEntries: activeRecords.filter((r) => r.entryType === "Bank").length,
      cashAmount: activeRecords
        .filter((r) => r.entryType === "Cash")
        .reduce((sum, r) => sum + parseFloat(r.amount || 0), 0),
      bankAmount: activeRecords
        .filter((r) => r.entryType === "Bank")
        .reduce((sum, r) => sum + parseFloat(r.amount || 0), 0),
    };
    setStatistics(stats);
  };

  // Debounced fetch
  useEffect(() => {
    if (prefLoading) return;

    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);

    debounceTimeoutRef.current = setTimeout(
      () => {
        fetchEntries();
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
    selectedFinancialYear,
    financialPeriodMode,
  ]);

  // Fetch financial years on mount
  useEffect(() => {
    fetchFinancialYears();
  }, []);

  // Format currency
  const formatCurrency = (value) => {
    const num = parseFloat(value) || 0;
    return `₹${num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Format date-time for display
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
    } catch {
      return dateString;
    }
  };

  // Cards array
  const cards = [
    {
      icon: "fas fa-list",
      title: "Total Entries",
      key: "total",
      color: "primary",
      count: statistics.total,
    },
    {
      icon: "fas fa-rupee-sign",
      title: "Total Amount",
      key: "totalAmount",
      color: "info",
      count: formatCurrency(statistics.totalAmount),
    },
    {
      icon: "fas fa-money-bill-wave",
      title: "Cash Entries",
      key: "cash",
      color: "success",
      count: statistics.cashEntries,
    },
    {
      icon: "fas fa-university",
      title: "Bank Entries",
      key: "bank",
      color: "warning",
      count: statistics.bankEntries,
    },
    {
      icon: "fa-regular fa-calendar-days",
      title: "Financial Period",
      key: "period",
      color: "warning",
    },
    {
      icon: "fas fa-plus-circle",
      title: "Add New Entry",
      key: "addNew",
      color: "success",
    },
  ];

  // Prepare data for table
  const preparedData = useMemo(() => {
    return records.map((record, index) => ({
      ...record,
      sn: (currentPage - 1) * recordsPerPage + index + 1,
      createdDateTime:
        record.createdDateTime || formatDateTimeForDisplay(record.createdAt),
    }));
  }, [records, currentPage, recordsPerPage]);

  // Client-side filtering
  const filteredClientSideData = useMemo(() => {
    if (serverSide) {
      return preparedData.filter((r) => !r.isDeleted);
    }

    let data = preparedData.filter((r) => r.isDeleted !== true);

    // Financial year filter (client-side)
    if (selectedFinancialYear && selectedFinancialYear !== "ALL") {
      data = data.filter((r) => r.financialYear === selectedFinancialYear);
    }

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

    // Sort by createdAt descending (latest first) for client-side
    data.sort((a, b) => {
      const dateA = new Date(a.createdAt || 0);
      const dateB = new Date(b.createdAt || 0);
      return dateB - dateA;
    });

    // Update statistics after filtering
    if (!serverSide) {
      updateStatistics(data);
    }

    return data;
  }, [preparedData, filters, serverSide, selectedFinancialYear]);

  // Debounced per-column filter change handler
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
    { key: "entryNumber", label: "Entry No", width: 150 },
    {
      key: "entryType",
      label: "Type",
      width: 100,
      render: (value) => (
        <span
          className={`badge ${value === "Cash" ? "bg-success" : "bg-primary"}`}
        >
          {value}
        </span>
      ),
    },
    { key: "entryDate", label: "Date", width: 120 },
    { key: "sourceName", label: "Source / Entry Name", width: 200 },
    {
      key: "amount",
      label: "Amount",
      width: 140,
      render: (value) => (
        <span className="fw-semibold">
          {formatCurrency(value)}
        </span>
      ),
    },
    { key: "paymentMethod", label: "Payment Method", width: 140 },
    { key: "referenceNumber", label: "Reference No", width: 140 },
    { key: "description", label: "Description", width: 220 },
    {
      key: "createdDateTime",
      label: "Created Date & Time",
      width: 200,
    },
    { key: "action", label: "Actions", width: 150 },
  ];

  const fixedColumns = ["sn"];
  const defaultVisibleColumns = [
    "sn",
    "entryNumber",
    "entryType",
    "entryDate",
    "sourceName",
    "amount",
    "action",
  ];

  const columnsWithDropdownFilter = ["entryType"];

  const getFilterOptions = () => {
    const options = {
      entryType: ["All", "Cash", "Bank"],
    };

    if (records.length > 0) {
      const uniqueSources = [
        ...new Set(
          records
            .map((r) => r.sourceName)
            .filter((s) => s && s !== ""),
        ),
      ].sort();
      options.sourceName = ["All", ...uniqueSources];
    } else {
      options.sourceName = ["All"];
    }

    return options;
  };

  // Handle card click
  const handleCardClick = (cardKey) => {
    if (cardKey === "addNew") {
      if (!canCreate) {
        showError("You don't have permission to add entries");
        return;
      }
      setEditingRecord(null);
      setShowCreateForm(true);
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

  const getCardNumber = (index) => {
    return (index % 8) + 1;
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

  // Handle form submit
  const handleFormSubmit = (formData) => {
    setShowCreateForm(false);
    setEditingRecord(null);
    fetchEntries();
  };

  // Handle edit
  const handleEdit = (record) => {
    setEditingRecord(record);
    setShowCreateForm(true);
    showInfo(`Editing entry: ${record.entryNumber}`);
  };

  // Handle view
  const handleView = (record) => {
    setEditingRecord({ ...record, isViewMode: true });
    setShowCreateForm(true);
    showInfo(`Viewing entry: ${record.entryNumber}`);
  };

  // Handle delete
  const handleDelete = (id) => {
    const record = records.find((r) => r.id === id || r._id === id);
    if (!record) return;
    setEntryToDelete(id);
    setShowDeleteConfirm(true);
  };

  // Confirm delete
  const confirmDelete = async () => {
    if (!entryToDelete) return;

    try {
      await apiDelete(API_ENDPOINTS.CASH_BANK_BOOK.DELETE(entryToDelete));
      showSuccess("Entry deleted successfully!");
      await fetchEntries();
      setShowDeleteConfirm(false);
      setEntryToDelete(null);
    } catch (error) {
      console.error("Error deleting entry:", error);
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to delete entry",
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
      setActiveCardFilter("total");
      setFinancialPeriodMode("yearly");
    }
    fetchEntries();
    showInfo("Data refreshed!");
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
          <h4 className="fs-18 fw-semibold m-0">Cash & Bank Book</h4>

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
              activeCardFilter === card.key && card.key !== "addNew";
            const isAddNewDisabled = card.key === "addNew" && !canCreate;

            return (
              <div key={index} className="col-md-6 col-xl-2 mb-4">
                <div
                  className={`card border-0 overflow-hidden ${cardClass} modern-card hover-elevate`}
                  style={{
                    cursor: isAddNewDisabled ? "not-allowed" : "pointer",
                    opacity: isAddNewDisabled ? 0.6 : 1,
                    borderRadius: "12px",
                    height: "100%",
                    border: isActive ? "2px solid #0d6efd" : undefined,
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
                    <h5
                      className="mb-2 fw-bold"
                      style={{ fontSize: "16px" }}
                    >
                      {card.title}
                    </h5>
                    <h6 className="mb-0 text-muted fw-bold">
                      {card.key === "addNew"
                        ? "+ Add New"
                        : card.key === "period"
                          ? `${selectedFinancialYear === "ALL" ? "All Year" : selectedFinancialYear} • ${getPeriodDisplayValue()}`
                          : card.count !== undefined
                            ? card.count
                            : 0}
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
          data={filteredClientSideData}
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
          tableTitle="Cash & Bank Book Record"
          showColumnSelector={true}
          showExport={true}
          showRefresh={true}
          showAdvancedFilter={true}
          showSearch={true}
          exportFileName="Cash_Bank_Book"
          exportTitle="Cash & Bank Book Report"
          activeCardFilter={activeCardFilter}
          cards={cards}
          getBadgeClass={(value) => {
            if (value === "Cash") return "bg-success";
            if (value === "Bank") return "bg-primary";
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
          exportApi={API_ENDPOINTS.CASH_BANK_BOOK.LIST}
        />

        {/* Create/Edit Modal */}
        <CreateCashBankEntry
          show={showCreateForm}
          onClose={() => {
            setShowCreateForm(false);
            setEditingRecord(null);
          }}
          onSubmit={handleFormSubmit}
          editingRecord={editingRecord}
        />

        {/* Delete Confirmation Modal */}
        <ConfirmationModal
          show={showDeleteConfirm}
          onHide={() => {
            setShowDeleteConfirm(false);
            setEntryToDelete(null);
          }}
          onConfirm={confirmDelete}
          title="Delete Cash & Bank Entry"
          message={
            <>
              Are you sure you want to delete entry{" "}
              <strong>
                "
                {records.find(
                  (r) =>
                    r.id === entryToDelete || r._id === entryToDelete,
                )?.entryNumber || ""}
                "
              </strong>
              ? This action marks the entry as deleted.
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

export default CashBankBook;
