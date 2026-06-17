import React, { useEffect, useMemo, useRef, useState } from "react";
import ReusableTable from "../Components/ReusableTable";
import CreateFixedDeposit from "../Components/CreateFixedDeposit";
import ConfirmationModal from "../Components/ConfirmationModal";
import { showSuccess, showError, showInfo } from "../Components/ToastNotification";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { apiGet, apiDelete, apiPost } from "../utils/api";
import { hasActionPermission } from "../utils/permissions";

const FixedDepositManagement = () => {
  const moduleKey = "fixedDepositManagement";
  const canCreate = hasActionPermission(moduleKey, "create");

  const [serverSide, setServerSide] = useState(true);
  const [prefLoading, setPrefLoading] = useState(true);
  const [dynamicFilterOptions, setDynamicFilterOptions] = useState({});
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [activeCardFilter, setActiveCardFilter] = useState("total");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(10);
  const [filters, setFilters] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState(null);
  const [sortDirection, setSortDirection] = useState("normal");
  const [statistics, setStatistics] = useState({
    total: 0,
    totalPrincipal: 0,
    active: 0,
    totalInterestEarned: 0,
    totalPenalty: 0,
  });

  const debounceTimeoutRef = useRef(null);
  const debounceColumnTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null);

  const columnsWithDateFilter = ["startDate", "maturityDate", "closureDateFormatted", "createdDateTime"];

  useEffect(() => {
    document.title = "Fixed Deposit Management | MaxCode IT Services";

    const fetchPreference = async () => {
      try {
        const response = await apiGet(API_ENDPOINTS.USER_PREFERENCES.GET);
        if (typeof response.data?.fixedDepositManagementServerSide === "boolean") {
          setServerSide(response.data.fixedDepositManagementServerSide);
        }
      } catch (error) {
        console.error("Failed to fetch FD preferences:", error);
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
          fixedDepositManagementServerSide: serverSide,
        });
      } catch (error) {
        console.error("Failed to save FD preferences:", error);
      }
    };

    savePreference();
  }, [serverSide, prefLoading]);

  const formatCurrency = (value) => {
    const amount = Number(value || 0);
    return `₹${amount.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const formatDateTimeForDisplay = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
  };

  const formatDateTimeWithTime = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;
    const formattedHours = String(hours).padStart(2, "0");

    return `${day}-${month}-${year} | ${formattedHours}:${minutes}:${seconds} ${ampm}`;
  };

  const fetchRecords = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (prefLoading) return;

    setLoading(true);
    try {
      let url = API_ENDPOINTS.FIXED_DEPOSITS.LIST;
      const params = new URLSearchParams();

      if (serverSide) {
        params.append("page", currentPage);
        params.append("limit", recordsPerPage);

        if (searchTerm) params.append("search", searchTerm);

        Object.entries(filters).forEach(([key, value]) => {
          if (["sn", "action"].includes(key)) return;
          if (value === undefined || value === null || value === "" || value === "All") return;

          if (columnsWithDateFilter.includes(key) && value && typeof value === "object") {
            if (value.startDate) params.append(`${key}_start`, value.startDate);
            if (value.endDate) params.append(`${key}_end`, value.endDate);
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
          params.append("sortOrder", sortDirection === "ascending" ? "asc" : "desc");
        }

        if (activeCardFilter && activeCardFilter !== "total" && activeCardFilter !== "addNew") {
          params.append("filter", activeCardFilter);
        }

        url = `${url}?${params.toString()}`;
      }

      const response = await apiGet(url, { signal: controller.signal });
      const fdsData = response.data?.data || response.data?.fds || (Array.isArray(response.data) ? response.data : []);
      const total = response.data?.pagination?.totalRecords || response.data?.total || fdsData.length;

      if (response.data?.statistics) {
        setStatistics(response.data.statistics);
      }
      if (response.data?.filterOptions) {
        setDynamicFilterOptions(response.data.filterOptions);
      }

      const mappedData = fdsData.map((fd) => ({
        ...fd,
        id: fd._id || fd.id,
        createdDateTime: formatDateTimeWithTime(fd.createdAt || fd.createdDate || fd.created_on),
        closureDateFormatted: formatDateTimeForDisplay(fd.closureDate),
      }));

      setRecords(mappedData);
      setTotalRecords(total);

      if (!serverSide) {
        updateStatistics(mappedData);
      }
    } catch (error) {
      if (error.name === "AbortError" || error.name === "CanceledError") return;
      console.error("Failed to fetch FDs:", error);
      showError("Failed to fetch Fixed Deposits");
      setRecords([]);
      setTotalRecords(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (prefLoading) return;
    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);

    debounceTimeoutRef.current = setTimeout(() => {
      fetchRecords();
    }, serverSide ? 500 : 0);

    return () => clearTimeout(debounceTimeoutRef.current);
  }, [serverSide, currentPage, recordsPerPage, searchTerm, filters, sortField, sortDirection, activeCardFilter, prefLoading]);

  const updateStatistics = (data) => {
    const activeRecords = data.filter((record) => record.isDeleted !== true);
    const totalPrincipal = activeRecords.reduce((sum, record) => sum + Number(record.principalAmount || record.amount || 0), 0);
    const totalInterestEarned = activeRecords.reduce((sum, record) => sum + Number(record.totalInterestEarned || 0), 0);
    const totalPenalty = activeRecords.reduce((sum, record) => sum + Number(record.penaltyAmount || 0), 0);

    setStatistics({
      total: activeRecords.length,
      totalPrincipal,
      active: activeRecords.filter((record) => record.fdStatus === "Active").length,
      totalInterestEarned,
      totalPenalty,
    });
  };

  const preparedData = useMemo(
    () =>
      records.map((record, index) => ({
        ...record,
        sn: (currentPage - 1) * recordsPerPage + index + 1,
      })),
    [records, currentPage, recordsPerPage],
  );

  const filteredData = useMemo(() => {
    if (serverSide) {
      return preparedData.filter((record) => record.isDeleted !== true);
    }

    let data = preparedData.filter((record) => record.isDeleted !== true);
    Object.entries(filters).forEach(([key, value]) => {
      if (value && typeof value === "string" && value.trim()) {
        data = data.filter((row) => String(row[key] || "").toLowerCase().includes(value.toLowerCase()));
      }
    });

    return data;
  }, [preparedData, filters, serverSide]);

  const cards = [
    { icon: "fa-solid fa-piggy-bank", title: "Total FDs", key: "total", color: "primary", count: statistics.total },
    { icon: "fas fa-indian-rupee-sign", title: "Total Principal", key: "totalPrincipal", color: "success", count: formatCurrency(statistics.totalPrincipal) },
    { icon: "fas fa-check-circle", title: "Active FDs", key: "active", color: "info", count: statistics.active },
    { icon: "fas fa-coins", title: "Interest Earned", key: "totalInterestEarned", color: "success", count: formatCurrency(statistics.totalInterestEarned) },
    { icon: "fas fa-exclamation-triangle", title: "Penalty", key: "totalPenalty", color: "danger", count: formatCurrency(statistics.totalPenalty) },
    { icon: "fas fa-plus-circle", title: "Add New FD", key: "addNew", color: "success" },
  ];

  const columns = [
    { key: "sn", label: "S.No", width: 70 },
    { key: "fdNumber", label: "FD Number", width: 140 },
    { key: "bankName", label: "Bank Name", width: 150 },
    { key: "transferredFromAccountType", label: "Source Type", width: 120 },
    { key: "transferredFromAccount", label: "Source Account", width: 150 },
    { key: "principalAmount", label: "Principal (₹)", width: 130, render: (value) => formatCurrency(value) },
    { key: "rateOfInterest", label: "Interest Rate (%)", width: 120 },
    { key: "tenure", label: "Tenure (Days)", width: 120 },
    { key: "startDate", label: "Start Date", width: 120 },
    { key: "maturityDate", label: "Maturity Date", width: 120 },
    { key: "totalInterestEarned", label: "Interest Earned (₹)", width: 150, render: (value) => (value ? formatCurrency(value) : "—") },
    { key: "penaltyAmount", label: "Penalty (₹)", width: 120, render: (value) => (value ? formatCurrency(value) : "—") },
    { key: "closureDateFormatted", label: "Closure Date", width: 120 },
    { key: "closurePaymentMethod", label: "Closure Payment Method", width: 160 },
    {
      key: "fdStatus",
      label: "Status",
      width: 110,
      render: (value) => {
        const statusClass = value === "Active" ? "bg-success" : value === "Matured" ? "bg-info" : value === "Closed" ? "bg-danger" : "bg-secondary";
        return <span className={`badge ${statusClass}`}>{value}</span>;
      },
    },
    { key: "interestPayoutMode", label: "Interest Payout", width: 140 },
    {
      key: "fdAdviceLink",
      label: "FD Advice Link",
      width: 150,
      render: (value) => {
        if (!value || value.trim() === "") {
          return <span className="text-muted">—</span>;
        }
        return (
          <div className="d-flex gap-2">
            <button
              className="btn btn-sm btn-info d-inline-flex align-items-center justify-content-center"
              style={{ width: "32px", height: "32px", padding: "4px" }}
              title="Open in Google Drive"
              onClick={() => window.open(value, "_blank")}
            >
              <i className="fab fa-google-drive" style={{ fontSize: "14px" }} />
            </button>
            <button
              className="btn btn-sm btn-secondary d-inline-flex align-items-center justify-content-center"
              style={{ width: "32px", height: "32px", padding: "4px" }}
              title="Copy Link"
              onClick={() => {
                navigator.clipboard.writeText(value);
                showSuccess("Link copied to clipboard!");
              }}
            >
              <i className="fas fa-copy" style={{ fontSize: "14px" }} />
            </button>
          </div>
        );
      },
    },
    { key: "remarks", label: "Remarks", width: 180 },
    { key: "closureRemarks", label: "Closure Remarks", width: 180 },
    { key: "createdDateTime", label: "Created Date & Time", width: 200 },
    { key: "action", label: "Actions", width: 150 },
  ];

  const fixedColumns = ["sn"];
  const defaultVisibleColumns = ["sn", "fdNumber", "bankName", "principalAmount", "fdStatus", "action"];
  const columnsWithDropdownFilter = ["fdStatus", "transferredFromAccountType", "bankName", "interestPayoutMode", "closurePaymentMethod"];

  const getFilterOptions = () => ({
    fdStatus: ["All", "Active", "Matured", "Closed"],
    transferredFromAccountType: ["All", "Bank Account", "Cash Account"],
    bankName: [],
    interestPayoutMode: ["All", "At Maturity", "Quarterly", "Half-yearly", "Annually"],
    closurePaymentMethod: ["All", "Bank Transfer", "Cash", "Check", "Online"],
  });

  const finalFilterOptions = useMemo(() => {
    if (serverSide && Object.keys(dynamicFilterOptions).length > 0) {
      return { ...getFilterOptions(), ...dynamicFilterOptions };
    }
    return getFilterOptions();
  }, [serverSide, dynamicFilterOptions]);

  const handleCardClick = (cardKey) => {
    if (cardKey === "addNew") {
      if (!canCreate) {
        showError("You don't have permission to add Fixed Deposits");
        return;
      }
      setEditingRecord(null);
      setShowCreateForm(true);
      return;
    }

    if (cardKey !== "totalPrincipal") {
      setActiveCardFilter(cardKey);
      if (serverSide) setCurrentPage(1);
    }
  };

  const handleFormSubmit = () => {
    setShowCreateForm(false);
    setEditingRecord(null);
    fetchRecords();
  };

  const handleEdit = (record) => {
    setEditingRecord(record);
    setShowCreateForm(true);
    showInfo(`Editing FD: ${record.fdNumber}`);
  };

  const handleView = (record) => {
    setEditingRecord({ ...record, isViewMode: true });
    setShowCreateForm(true);
    showInfo(`Viewing FD: ${record.fdNumber}`);
  };

  const handleDelete = (id) => {
    const record = records.find((row) => row.id === id || row._id === id);
    if (!record) return;
    setRecordToDelete(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!recordToDelete) return;

    try {
      await apiDelete(API_ENDPOINTS.FIXED_DEPOSITS.DELETE(recordToDelete));
      showSuccess("Fixed Deposit deleted successfully!");
      setShowDeleteConfirm(false);
      setRecordToDelete(null);
      fetchRecords();
    } catch (error) {
      console.error("Error deleting FD:", error);
      showError(error.response?.data?.message || error.response?.data?.error || "Failed to delete Fixed Deposit");
    }
  };

  const handleStatusToggle = (id) => {
    const record = records.find((row) => row.id === id || row._id === id);
    if (!record) return;

    if (record.fdStatus === "Closed") {
      showInfo(`FD ${record.fdNumber} is already closed`);
      return;
    }

    setEditingRecord({ ...record, fdStatus: record.fdStatus === "Active" ? "Matured" : "Closed" });
    setShowCreateForm(true);
    showInfo(`Close FD: ${record.fdNumber}`);
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
    fetchRecords();
    showInfo("Data refreshed!");
  };

  const handleDebouncedColumnFilterChange = (key, value) => {
    if (serverSide) {
      if (debounceColumnTimeoutRef.current) clearTimeout(debounceColumnTimeoutRef.current);
      debounceColumnTimeoutRef.current = setTimeout(() => {
        setFilters((prev) => ({ ...prev, [key]: value }));
        setCurrentPage(1);
      }, 500);
      return;
    }

    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handleServerSideSearch = (term) => {
    setSearchTerm(term);
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

  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
      if (debounceColumnTimeoutRef.current) clearTimeout(debounceColumnTimeoutRef.current);
      if (abortControllerRef.current) abortControllerRef.current.abort();
    };
  }, []);

  return (
    <div className="container-fluid">
      <div className="py-3 d-flex justify-content-between align-items-center flex-wrap" style={{ marginTop: "70px" }}>
        <h4 className="fs-18 fw-semibold m-0">Fixed Deposit Management</h4>
        <div className="form-check form-switch m-0">
          <input
            className="form-check-input"
            type="checkbox"
            checked={serverSide}
            onChange={(event) => {
              setServerSide(event.target.checked);
              setCurrentPage(1);
              setFilters({});
              setSearchTerm("");
              setSortField(null);
              setSortDirection("normal");
              setActiveCardFilter("total");
            }}
            id="fdServerSideToggle"
          />
          <label className="form-check-label ms-2" htmlFor="fdServerSideToggle">
            Server-side Mode {serverSide ? "(Enabled)" : "(Disabled)"}
          </label>
        </div>
      </div>

      <div className="row">
        {cards.map((card, index) => {
          const isActive = activeCardFilter === card.key && card.key !== "addNew";
          const isAddNewDisabled = card.key === "addNew" && !canCreate;
          const cardNumber = (index % 8) + 1;
          const cardClass = `card${cardNumber}`;
          const cardIconBgClass = `card-icon-bg${cardNumber}`;

          return (
            <div key={card.key} className="col-md-6 col-xl-2 mb-4">
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
                    <span className={`avatar-md rounded-circle ${cardIconBgClass} d-inline-flex justify-content-center align-items-center`} style={{ width: "56px", height: "56px" }}>
                      <i className={`${card.icon} fs-4 text-white`} />
                    </span>
                  </div>
                  <h5 className="mb-2 fw-bold" style={{ fontSize: "16px" }}>{card.title}</h5>
                  <h6 className="mb-0 text-muted fw-bold">
                    {card.key === "addNew" ? "+ Add New" : card.count}
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
        data={filteredData}
        loading={loading}
        totalRecords={totalRecords}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onView={handleView}
        onStatusToggle={handleStatusToggle}
        onRefresh={handleRefresh}
        showActions={true}
        actions={["view", "edit", "delete", "status"]}
        statusToggleLabel="Close FD"
        skipDeleteConfirmation={true}
        fixedColumns={fixedColumns}
        defaultVisibleColumns={defaultVisibleColumns}
        columnsWithDropdownFilter={columnsWithDropdownFilter}
        columnsWithDateFilter={columnsWithDateFilter}
        filterOptions={finalFilterOptions}
        tableTitle="Fixed Deposit Records"
        showColumnSelector={true}
        showExport={true}
        showRefresh={true}
        showAdvancedFilter={true}
        showSearch={true}
        exportFileName="Fixed_Deposit_Management"
        exportTitle="Fixed Deposit Management Report"
        activeCardFilter={activeCardFilter}
        cards={cards}
        getBadgeClass={(value) => {
          if (value === "Active") return "bg-success";
          if (value === "Matured") return "bg-info";
          if (value === "Closed") return "bg-danger";
          return "bg-secondary";
        }}
        serverSide={serverSide}
        onServerSideSearch={handleServerSideSearch}
        onServerSideFilter={handleServerSideFilter}
        onServerSideSort={handleServerSideSort}
        currentPage={currentPage}
        recordsPerPage={recordsPerPage}
        onPageChange={setCurrentPage}
        onRecordsPerPageChange={setRecordsPerPage}
        onDebouncedColumnFilterChange={handleDebouncedColumnFilterChange}
      />

      <CreateFixedDeposit
        show={showCreateForm}
        onClose={() => {
          setShowCreateForm(false);
          setEditingRecord(null);
        }}
        onSubmit={handleFormSubmit}
        editingRecord={editingRecord}
      />

      <ConfirmationModal
        show={showDeleteConfirm}
        title="Delete Fixed Deposit"
        message="Are you sure you want to delete this Fixed Deposit? This action cannot be undone."
        onConfirm={confirmDelete}
        onHide={() => {
          setShowDeleteConfirm(false);
          setRecordToDelete(null);
        }}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
};

export default FixedDepositManagement;
