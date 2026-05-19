import React, { useState, useEffect, useMemo, useRef } from "react";
import ReusableTable from "../Components/ReusableTable";
import AddWithdrawal from "../Components/AddWithdrawal";
import ConfirmationModal from "../Components/ConfirmationModal";
import {
  showSuccess,
  showError,
  showInfo,
} from "../Components/ToastNotification";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { apiGet, apiDelete, apiPost } from "../utils/api";
import { hasActionPermission } from "../utils/permissions";

const OwnerWithdrawal = () => {
  const moduleKey = "ownerWithdrawal";
  const canCreate = hasActionPermission(moduleKey, "create");
  const [selectedFinancialYear, setSelectedFinancialYear] = useState(
    localStorage.getItem("selectedFinancialYear") || "ALL",
  );
  const [financialPeriodMode, setFinancialPeriodMode] = useState("yearly");

  const [serverSide, setServerSide] = useState(true);
  const [prefLoading, setPrefLoading] = useState(true);
  const [dynamicFilterOptions, setDynamicFilterOptions] = useState({});

  useEffect(() => {
    document.title = "Owner Withdrawal | MaxCode IT Services";

    const fetchPreference = async () => {
      try {
        const res = await apiGet("/user-preferences");
        const prefValue =
          res.data?.ownerWithdrawalServerSide ??
          res.data?.personalFundManagementServerSide;
        if (typeof prefValue === "boolean") {
          setServerSide(prefValue);
        }
      } catch {
        // Keep default value on fallback
      } finally {
        setPrefLoading(false);
      }
    };

    fetchPreference();
  }, []);

  useEffect(() => {
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

  useEffect(() => {
    if (prefLoading) return;

    const savePreference = async () => {
      try {
        await apiPost("/user-preferences", {
          ownerWithdrawalServerSide: serverSide,
          personalFundManagementServerSide: serverSide,
        });
      } catch {
        // Ignore preference save errors
      }
    };

    savePreference();
  }, [serverSide, prefLoading]);

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);
  const [showAddWithdrawalForm, setShowAddWithdrawalForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState(null);
  const [activeCardFilter, setActiveCardFilter] = useState("total");

  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(10);
  const [filters, setFilters] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState(null);
  const [sortDirection, setSortDirection] = useState("normal");

  const debounceTimeoutRef = useRef(null);
  const debounceColumnTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null);

  const [statistics, setStatistics] = useState({
    total: 0,
    totalAmount: 0,
    currentAccount: 0,
    cashBox: 0,
  });

  const columnsWithDateFilter = ["withdrawalDate"];

  const fetchWithdrawals = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (prefLoading) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      let url = API_ENDPOINTS.OWNER_WITHDRAWALS.LIST;

      if (serverSide) {
        params.append("page", currentPage);
        params.append("limit", recordsPerPage);

        if (searchTerm) params.append("search", searchTerm);

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
                params.append(`${key}_start`, value.startDate);
              }
              if (value.endDate) {
                params.append(`${key}_end`, value.endDate);
              }
            }
            return;
          }

          if (Array.isArray(value) && value.length > 0) {
            params.append(key, value.join(","));
            return;
          }

          params.append(key, value);
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
          activeCardFilter !== "amount" &&
          activeCardFilter !== "period" &&
          activeCardFilter !== "addNew"
        ) {
          params.append("filter", activeCardFilter);
        }

        url = `${url}?${params.toString()}`;
      }

      const response = await apiGet(url, {
        signal: controller.signal,
      });

      let data;
      let total;

      if (serverSide) {
        data = response.data?.data || [];
        total = response.data?.pagination?.totalRecords ?? data.length;

        if (response.data?.statistics) {
          setStatistics(response.data.statistics);
        }

        if (response.data?.filterOptions) {
          setDynamicFilterOptions(response.data.filterOptions);
        }
      } else {
        data =
          response.data?.data ||
          (Array.isArray(response.data) ? response.data : []);
        total = data.length;
      }

      const mapped = data.map((r) => ({
        ...r,
        id: r._id || r.id,
      }));

      setRecords(mapped);
      setTotalRecords(total);

      if (!serverSide) {
        updateStatistics(mapped);
      }
    } catch (err) {
      if (err.name === "CanceledError" || err.name === "AbortError") return;
      console.error("Failed to fetch owner withdrawals:", err);
      showError("Failed to fetch owner withdrawal records");
      setRecords([]);
      setTotalRecords(0);
      updateStatistics([]);
    } finally {
      setLoading(false);
    }
  };

  const updateStatistics = (data) => {
    const activeRecords = data.filter((r) => r.isDeleted !== true);
    const totalAmount = activeRecords.reduce(
      (sum, r) => sum + (parseFloat(r.amount) || 0),
      0,
    );

    setStatistics({
      total: activeRecords.length,
      totalAmount,
      currentAccount: activeRecords.filter(
        (r) => r.withdrawnFrom === "Current Account",
      ).length,
      cashBox: activeRecords.filter((r) => r.withdrawnFrom === "Cash Box")
        .length,
    });
  };

  useEffect(() => {
    if (prefLoading) return;

    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
    debounceTimeoutRef.current = setTimeout(
      () => {
        fetchWithdrawals();
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

  const formatDate = (dateString) => {
    if (!dateString) return "";
    try {
      const d = new Date(dateString);
      if (isNaN(d.getTime())) return dateString;
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      return `${day}/${month}/${d.getFullYear()}`;
    } catch {
      return dateString;
    }
  };

  const formatCurrency = (value) => {
    const num = parseFloat(value) || 0;
    return `₹ ${num.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const cards = [
    {
      icon: "fas fa-list",
      title: "Total Records",
      key: "total",
      color: "primary",
      count: statistics.total,
    },
    {
      icon: "fas fa-rupee-sign",
      title: "Total Amount",
      key: "amount",
      color: "success",
      count: formatCurrency(statistics.totalAmount),
    },
    {
      icon: "fas fa-university",
      title: "From Current A/C",
      key: "currentAccount",
      color: "info",
      count: statistics.currentAccount,
    },
    {
      icon: "fas fa-money-bill-wave",
      title: "From Cash Box",
      key: "cashBox",
      color: "warning",
      count: statistics.cashBox,
    },
    {
      icon: "fa-regular fa-calendar-days",
      title: "Financial Period",
      key: "period",
      color: "warning",
    },
    {
      icon: "fas fa-plus-circle",
      title: "Add Withdrawal",
      key: "addNew",
      color: "danger",
    },
  ];

  const getCardNumber = (index) => (index % 8) + 1;

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

  const handleCardClick = (key) => {
    if (key === "addNew") {
      if (!canCreate) {
        showError("You don't have permission to add withdrawal entries");
        return;
      }
      setEditingRecord(null);
      setShowAddWithdrawalForm(true);
    } else if (key === "period") {
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
        return periodCycle[(currentIndex + 1) % periodCycle.length];
      });
    } else {
      setActiveCardFilter(key);
      if (serverSide) {
        setCurrentPage(1);
      }
    }
  };

  const handleFormSubmit = () => {
    setShowAddWithdrawalForm(false);
    setEditingRecord(null);
    fetchWithdrawals();
  };

  const handleEdit = (record) => {
    setEditingRecord(record);
    setShowAddWithdrawalForm(true);
    showInfo(`Editing withdrawal entry: ${formatDate(record.withdrawalDate)}`);
  };

  const handleView = (record) => {
    setEditingRecord({ ...record, isViewMode: true });
    setShowAddWithdrawalForm(true);
    showInfo(`Viewing withdrawal entry: ${formatDate(record.withdrawalDate)}`);
  };

  const handleDelete = (id) => {
    const record = records.find((r) => r.id === id || r._id === id);
    if (!record) return;
    setRecordToDelete(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!recordToDelete) return;
    try {
      await apiDelete(API_ENDPOINTS.OWNER_WITHDRAWALS.DELETE(recordToDelete));
      showSuccess("Withdrawal entry deleted successfully!");
      await fetchWithdrawals();
      setShowDeleteConfirm(false);
      setRecordToDelete(null);
    } catch (error) {
      showError(
        error.response?.data?.error ||
          error.response?.data?.message ||
          "Failed to delete record",
      );
    }
  };

  const handleRefresh = () => {
    if (serverSide) {
      setFilters({});
      setSearchTerm("");
      setSortField(null);
      setSortDirection("normal");
      setCurrentPage(1);
      setActiveCardFilter("total");
    }
    fetchWithdrawals();
    showInfo("Data refreshed!");
  };

  const preparedData = useMemo(() => {
    return records.map((r, index) => ({
      ...r,
      sn: (currentPage - 1) * recordsPerPage + index + 1,
      amountFormatted: formatCurrency(r.amount),
    }));
  }, [records, currentPage, recordsPerPage]);

  const filteredClientSideData = useMemo(() => {
    let data = preparedData.filter((r) => r.isDeleted !== true);

    if (serverSide) {
      return data;
    }

    if (activeCardFilter === "currentAccount") {
      data = data.filter((r) => r.withdrawnFrom === "Current Account");
    } else if (activeCardFilter === "cashBox") {
      data = data.filter((r) => r.withdrawnFrom === "Cash Box");
    }

    Object.entries(filters).forEach(([key, value]) => {
      if (
        value === undefined ||
        value === null ||
        value === "" ||
        value === "All"
      ) {
        return;
      }

      if (columnsWithDateFilter.includes(key)) {
        const startDate = value?.startDate ? new Date(value.startDate) : null;
        const endDate = value?.endDate ? new Date(value.endDate) : null;

        data = data.filter((row) => {
          const rowDate = row[key] ? new Date(row[key]) : null;
          if (!rowDate || Number.isNaN(rowDate.getTime())) return false;
          if (startDate && rowDate < startDate) return false;
          if (endDate) {
            const normalizedEndDate = new Date(endDate);
            normalizedEndDate.setHours(23, 59, 59, 999);
            if (rowDate > normalizedEndDate) return false;
          }
          return true;
        });
        return;
      }

      data = data.filter((row) =>
        String(row[key] || "")
          .toLowerCase()
          .includes(String(value).toLowerCase()),
      );
    });

    return data;
  }, [preparedData, serverSide, activeCardFilter, filters]);

  const handleDebouncedColumnFilterChange = (key, value) => {
    if (serverSide) {
      if (debounceColumnTimeoutRef.current) {
        clearTimeout(debounceColumnTimeoutRef.current);
      }

      debounceColumnTimeoutRef.current = setTimeout(() => {
        setFilters((prev) => ({ ...prev, [key]: value }));
        setCurrentPage(1);
      }, 500);
      return;
    }

    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const columns = [
    { key: "sn", label: "S.No", width: 70 },
    {
      key: "withdrawalDate",
      label: "Withdrawal Date",
      width: 130,
      render: (value) => formatDate(value),
    },
    { key: "amountFormatted", label: "Amount (₹)", width: 150 },
    { key: "withdrawnFrom", label: "Withdraw From", width: 150 },
    { key: "withdrawnTo", label: "Withdraw To", width: 180 },
    { key: "paymentMethod", label: "Payment Method", width: 150 },
    { key: "referenceNumber", label: "Reference No.", width: 150 },
    { key: "description", label: "Description", width: 250 },
    { key: "action", label: "Actions", width: 150 },
  ];

  const fixedColumns = ["sn"];
  const defaultVisibleColumns = [
    "sn",
    "withdrawalDate",
    "amountFormatted",
    "withdrawnFrom",
    "withdrawnTo",
    "paymentMethod",
    "action",
  ];
  const columnsWithDropdownFilter = [
    "withdrawnTo",
    "withdrawnFrom",
    "paymentMethod",
  ];

  const getFilterOptions = () => {
    const withdrawnToOptions = [
      ...new Set(
        records
          .map((record) => record.withdrawnTo)
          .filter((value) => value && value !== ""),
      ),
    ].sort();

    const withdrawnFromOptions = [
      ...new Set(
        records
          .map((record) => record.withdrawnFrom)
          .filter((value) => value && value !== ""),
      ),
    ].sort();

    const paymentMethodOptions = [
      ...new Set(
        records
          .map((record) => record.paymentMethod)
          .filter((value) => value && value !== ""),
      ),
    ].sort();

    return {
      withdrawnTo: ["All", ...withdrawnToOptions],
      withdrawnFrom: ["All", ...withdrawnFromOptions],
      paymentMethod: ["All", ...paymentMethodOptions],
    };
  };

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
          <h4 className="fs-18 fw-semibold m-0">Owner Withdrawal</h4>

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
              id="ownerWithdrawalServerSideToggle"
            />
            <label
              className="form-check-label ms-2"
              htmlFor="ownerWithdrawalServerSideToggle"
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
            } else {
              displayValue = card.count !== undefined ? card.count : 0;
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
                      ? "2px solid #dc3545"
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
          tableTitle="Owner Withdrawal Records"
          showColumnSelector={true}
          showExport={true}
          showRefresh={true}
          showAdvancedFilter={true}
          showSearch={true}
          exportFileName="Owner_Withdrawal"
          exportTitle="Owner Withdrawal Report"
          activeCardFilter={activeCardFilter}
          cards={cards}
          getBadgeClass={(value) => {
            if (value === "Current Account") return "bg-info";
            if (value === "Cash Box") return "bg-warning";
            if (value === "Bank Transfer") return "bg-primary";
            if (value === "Cash") return "bg-success";
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
          exportApi={API_ENDPOINTS.OWNER_WITHDRAWALS.LIST}
        />

        {/* Add/Edit Withdrawal Modal */}
        <AddWithdrawal
          show={{ show: showAddWithdrawalForm }}
          onClose={() => {
            setShowAddWithdrawalForm(false);
            setEditingRecord(null);
          }}
          onSubmit={handleFormSubmit}
          editingRecord={editingRecord}
        />

        {/* Delete Confirmation */}
        <ConfirmationModal
          show={showDeleteConfirm}
          onHide={() => {
            setShowDeleteConfirm(false);
            setRecordToDelete(null);
          }}
          onConfirm={confirmDelete}
          title="Delete Withdrawal Entry"
          message="Are you sure you want to delete this withdrawal entry? This action cannot be undone."
          confirmText="Delete"
          confirmVariant="danger"
        />
      </div>
    </>
  );
};

export default OwnerWithdrawal;