import React, { useState, useEffect, useMemo, useRef } from "react";
import ReusableTable from "../Components/ReusableTable";
import CreateClient from "../Components/CreateClient";
import ConfirmationModal from "../Components/ConfirmationModal";
import {
  showSuccess,
  showError,
  showInfo,
} from "../Components/ToastNotification";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { apiGet, apiDelete, apiPut, apiPost } from "../utils/api";
import { hasActionPermission } from "../utils/permissions";

const ClientManagement = () => {
  const moduleKey = "clientManagement";
  const canCreate = hasActionPermission(moduleKey, "create");

  // Server-side mode state, fetched from backend user preferences
  const [serverSide, setServerSide] = useState(true);
  const [prefLoading, setPrefLoading] = useState(true);
  const [dynamicFilterOptions, setDynamicFilterOptions] = useState({});

  // Fetch user preference on mount
  useEffect(() => {
    document.title = "Client Management | MaxCode IT Services";
    const fetchPreference = async () => {
      try {
        const res = await apiGet("/user-preferences");
        if (typeof res.data?.clientManagementServerSide === "boolean") {
          setServerSide(res.data.clientManagementServerSide);
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
          clientManagementServerSide: serverSide,
        });
      } catch (e) {
        // ignore
      }
    };
    savePreference();
  }, [serverSide, prefLoading]);

  // State for records and loading
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);
  const [showCreateClientForm, setShowCreateClientForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [activeCardFilter, setActiveCardFilter] = useState("total");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [clientToDelete, setClientToDelete] = useState(null);

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
    active: 0,
    inactive: 0,
    withGST: 0,
    withoutGST: 0,
  });

  // Columns with date range filter (move above fetchClients)
  const columnsWithDateFilter = ["createdDateTime"];

  // Fetch clients from API with server-side parameters
  const fetchClients = async () => {
    // 🔥 Cancel previous request if running
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Create new controller
    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (prefLoading) return;
    setLoading(true);
    try {
      let url = API_ENDPOINTS.CLIENTS.LIST;
      const params = new URLSearchParams();

      if (serverSide) {
        // Add pagination params
        params.append("page", currentPage);
        params.append("limit", recordsPerPage);

        // Add search term
        if (searchTerm) {
          params.append("search", searchTerm);
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
          activeCardFilter !== "addNew"
        ) {
          params.append("filter", activeCardFilter);
        }

        url = `${url}?${params.toString()}`;
      }

      const response = await apiGet(url, {
        signal: controller.signal,
      });

      let clientsData;
      let total;

      if (serverSide) {
        // Server-side response format with pagination
        clientsData = response.data?.data || response.data?.clients || [];
        total =
          response.data?.pagination?.totalRecords ||
          response.data?.total ||
          clientsData.length;

        // Update statistics from response if available
        if (response.data?.statistics) {
          setStatistics(response.data.statistics);
        }
        if (response.data?.filterOptions) {
          setDynamicFilterOptions(response.data.filterOptions);
        }
      } else {
        // Client-side response format
        clientsData =
          response.data?.data ||
          response.data?.clients ||
          (Array.isArray(response.data) ? response.data : []);
        total = clientsData.length;
      }

      const mappedData = clientsData.map((client) => {
        const createdDate =
          client.createdDate || client.createdAt || client.created_on;

        return {
          ...client,
          id: client._id || client.id,
          createdDate,
          gstStatus: client.hasGSTIN ? "Registered" : "Unregistered",
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

      console.error("Failed to fetch clients:", err);
      showError("Failed to fetch clients");
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
      active: activeRecords.filter((r) => r.status === "Active").length,
      inactive: activeRecords.filter((r) => r.status === "Inactive").length,
      withGST: activeRecords.filter((r) => r.hasGSTIN).length,
      withoutGST: activeRecords.filter((r) => !r.hasGSTIN).length,
    };
    setStatistics(stats);
  };

  // Debounced fetch for server-side mode, Fetch for client-side mode and on serverSide toggle, Initial fetch only after prefLoading is false
  useEffect(() => {
    if (prefLoading) return;

    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);

    debounceTimeoutRef.current = setTimeout(
      () => {
        fetchClients();
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

  // Card data array - WITH DYNAMIC COUNTS
  const cards = [
    {
      icon: "fa-solid fa-users",
      title: "Total Clients",
      key: "total",
      color: "primary",
      count: statistics.total,
    },
    {
      icon: "fas fa-user-check",
      title: "Active Clients",
      key: "active",
      color: "success",
      count: statistics.active,
    },
    {
      icon: "fa-solid fa-user-slash",
      title: "Inactive Clients",
      key: "inactive",
      color: "danger",
      count: statistics.inactive,
    },
    {
      icon: "fas fa-file-invoice",
      title: "With GST",
      key: "withGST",
      color: "info",
      count: statistics.withGST,
    },
    {
      icon: "fas fa-file-excel",
      title: "Without GST",
      key: "withoutGST",
      color: "warning",
      count: statistics.withoutGST,
    },
    {
      icon: "fas fa-plus-circle",
      title: "Add New Client",
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
        record.createdDateTime || formatDateTimeForDisplay(record.createdDate),
    }));
  }, [records, currentPage, recordsPerPage]);

  // Client-side per-column filtering logic (useMemo)
  const columnFilters = filters; // For clarity
  const filteredClientSideData = useMemo(() => {
    // 🔥 If server-side → don't re-process
    if (serverSide) {
      return preparedData.filter((r) => !r.isDeleted);
    }

    // Client-side processing
    let data = preparedData.filter((r) => r.isDeleted !== true);

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

    return data;
  }, [preparedData, filters, serverSide]);

  // Debounced per-column filter change handler for server-side
  const handleDebouncedColumnFilterChange = (key, value) => {
    if (serverSide) {
      if (debounceColumnTimeoutRef.current)
        clearTimeout(debounceColumnTimeoutRef.current);
      debounceColumnTimeoutRef.current = setTimeout(() => {
        setFilters((prev) => ({ ...prev, [key]: value }));
        setCurrentPage(1);
      }, 500); // 500ms debounce
    } else {
      setFilters((prev) => ({ ...prev, [key]: value }));
    }
  };

  // Columns configuration
  const columns = [
    { key: "sn", label: "S.No", width: 70 },
    { key: "clientId", label: "Client ID", width: 130 },
    { key: "clientName", label: "Client Name", width: 150 },
    { key: "businessName", label: "Business Name", width: 180 },
    { key: "phoneNumber", label: "Phone", width: 120 },
    { key: "email", label: "Email", width: 200 },
    { key: "address", label: "Address", width: 250 },
    { key: "placeOfSupply", label: "Place of Supply", width: 180 },
    {
      key: "gstin",
      label: "GSTIN",
      width: 180,
      render: (value, record) => <span>{record.hasGSTIN ? value : "-"}</span>,
    },
    {
      key: "gstStatus",
      label: "GST Status",
      width: 120,
      render: (value, record) => (
        <span
          className={`badge ${record.hasGSTIN ? "bg-success" : "bg-secondary"}`}
        >
          {record.hasGSTIN ? "Registered" : "Unregistered"}
        </span>
      ),
    },
    {
      key: "status",
      label: "Status",
      width: 100,
    },
    {
      key: "sendAutoInvoice",
      label: "Auto Invoice",
      width: 120,
      render: (value, record) => (
        <span
          className={`badge ${value === "Yes" ? "bg-success" : "bg-danger"}`}
        >
          {value}
        </span>
      ),
    },
    { key: "createdDateTime", label: "Created Date & Time", width: 200 },
    { key: "action", label: "Actions", width: 150 },
  ];

  const fixedColumns = ["sn"];
  const defaultVisibleColumns = [
    "sn",
    "clientName",
    "businessName",
    "phoneNumber",
    "status",
    "action",
  ];

  // Columns with dropdown filter
  const columnsWithDropdownFilter = ["status", "gstStatus", "placeOfSupply"];

  // Filter options - FIXED: Now dynamic based on actual data
  const getFilterOptions = () => {
    const options = {
      status: ["All", "Active", "Inactive"],
      gstStatus: ["All", "Registered", "Unregistered"],
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
        showError("You don't have permission to add client records");
        return;
      }
      setEditingRecord(null);
      setShowCreateClientForm(true);
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
  const handleFormSubmit = (formData) => {
    setShowCreateClientForm(false);
    setEditingRecord(null);
    fetchClients();
  };

  // Handle edit
  const handleEdit = (record) => {
    setEditingRecord(record);
    setShowCreateClientForm(true);
    showInfo(`Editing client: ${record.clientName}`);
  };

  // Handle view
  const handleView = (record) => {
    setEditingRecord({ ...record, isViewMode: true });
    setShowCreateClientForm(true);
    showInfo(`Viewing client: ${record.clientName}`);
  };

  // Handle delete
  const handleDelete = (id) => {
    const record = records.find((r) => r.id === id || r._id === id);
    if (!record) return;

    setClientToDelete(id);
    setShowDeleteConfirm(true);
  };

  // Confirm delete
  const confirmDelete = async () => {
    if (!clientToDelete) return;

    try {
      await apiDelete(API_ENDPOINTS.CLIENTS.DELETE(clientToDelete));
      showSuccess("Client deleted successfully!");
      await fetchClients();
      setShowDeleteConfirm(false);
      setClientToDelete(null);
    } catch (error) {
      console.error("Error deleting client:", error);
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to delete client",
      );
    }
  };

  // Handle status toggle
  const handleStatusToggle = async (id) => {
    const record = records.find((r) => r.id === id || r._id === id);
    if (!record) return;

    const newStatus = record.status === "Active" ? "Inactive" : "Active";
    try {
      const { _id, id: recordId, ...updateData } = record;
      updateData.status = newStatus;

      await apiPut(API_ENDPOINTS.CLIENTS.UPDATE(id), updateData);
      showSuccess("Status updated successfully!");
      await fetchClients();
    } catch (error) {
      console.error("Error updating status:", error);
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to update status",
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
    }
    fetchClients();
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
          <h4 className="fs-18 fw-semibold m-0">Client Management</h4>

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
                          : card.count !== undefined
                            ? card.count
                            : 0}
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
          data={filteredClientSideData}
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
          filterOptions={serverSide ? dynamicFilterOptions : getFilterOptions()}
          tableTitle="Clients Record"
          showColumnSelector={true}
          showExport={true}
          showRefresh={true}
          showAdvancedFilter={true}
          showSearch={true}
          exportFileName="Client_Management"
          exportTitle="Client Management Report"
          activeCardFilter={activeCardFilter}
          cards={cards}
          getBadgeClass={(value) => {
            if (value === "Active") return "bg-success";
            if (value === "Inactive") return "bg-danger";
            if (value === "Registered") return "bg-success";
            if (value === "Unregistered") return "bg-secondary";
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
          exportApi={API_ENDPOINTS.CLIENTS.LIST}
        />

        {/* Create/Edit Client Modal */}
        <CreateClient
          show={showCreateClientForm}
          onClose={() => {
            setShowCreateClientForm(false);
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
            setClientToDelete(null);
          }}
          onConfirm={confirmDelete}
          title="Delete Client"
          message={
            <>
              Are you sure you want to delete client{" "}
              <strong>
                "
                {records.find(
                  (r) => r.id === clientToDelete || r._id === clientToDelete,
                )?.clientName || ""}
                "
              </strong>
              ? This action marks the client as deleted.
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

export default ClientManagement;
