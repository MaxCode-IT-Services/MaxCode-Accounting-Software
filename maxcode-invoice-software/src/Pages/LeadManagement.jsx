import React, { useEffect, useMemo, useRef, useState } from "react";
import ReusableTable from "../Components/ReusableTable";
import CreateLead from "../Components/CreateLead";
import ConfirmationModal from "../Components/ConfirmationModal";
import {
  showSuccess,
  showError,
  showInfo,
} from "../Components/ToastNotification";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { apiDelete, apiGet, apiPut, apiPost } from "../utils/api";
import { hasActionPermission } from "../utils/permissions";

const LeadManagement = () => {
  const moduleKey = "leadManagement";
  const canCreate = hasActionPermission(moduleKey, "create");

  const [serverSide, setServerSide] = useState(true);
  const [prefLoading, setPrefLoading] = useState(true);
  const [dynamicFilterOptions, setDynamicFilterOptions] = useState({});

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);
  const [showCreateForm, setShowCreateForm] = useState(false);
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
    new: 0,
    contacted: 0,
    qualified: 0,
    proposalSent: 0,
    success: 0,
    lost: 0,
  });

  const columnsWithDateFilter = [
    "createdDateTime",
    "followUpDate",
    "lastContactedDate",
  ];

  useEffect(() => {
    document.title = "Lead Management | MaxCode IT Services";

    const fetchPreference = async () => {
      try {
        const res = await apiGet(API_ENDPOINTS.USER_PREFERENCES.GET);
        if (typeof res.data?.leadManagementServerSide === "boolean") {
          setServerSide(res.data.leadManagementServerSide);
        }
      } catch (error) {
        // keep default
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
          leadManagementServerSide: serverSide,
        });
      } catch (error) {
        // ignore
      }
    };

    savePreference();
  }, [serverSide, prefLoading]);

  const updateStatistics = (data) => {
    const activeData = data.filter((item) => item.isDeleted !== true);
    setStatistics({
      total: activeData.length,
      new: activeData.filter((item) => item.leadStatus === "New").length,
      contacted: activeData.filter((item) => item.leadStatus === "Contacted")
        .length,
      qualified: activeData.filter((item) => item.leadStatus === "Qualified")
        .length,
      proposalSent: activeData.filter(
        (item) => item.leadStatus === "Proposal Sent",
      ).length,
      success: activeData.filter((item) => item.leadStatus === "Success")
        .length,
      lost: activeData.filter((item) => item.leadStatus === "Lost").length,
    });
  };

  const fetchLeads = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (prefLoading) return;

    setLoading(true);

    try {
      let url = API_ENDPOINTS.LEADS.LIST;
      const params = new URLSearchParams();

      if (serverSide) {
        params.append("page", currentPage);
        params.append("limit", recordsPerPage);

        if (searchTerm) params.append("search", searchTerm);

        Object.entries(filters).forEach(([key, value]) => {
          if (
            value === undefined ||
            value === null ||
            value === "" ||
            value === "All"
          )
            return;
          if (["sn", "action"].includes(key)) return;

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
          activeCardFilter !== "addNew"
        ) {
          params.append("filter", activeCardFilter);
        }

        url = `${url}?${params.toString()}`;
      }

      const response = await apiGet(url, { signal: controller.signal });

      let leadsData;
      let total;

      if (serverSide) {
        leadsData = response.data?.data || [];
        total =
          response.data?.pagination?.totalRecords ||
          response.data?.total ||
          leadsData.length;

        if (response.data?.statistics) {
          setStatistics(response.data.statistics);
        }

        if (response.data?.filterOptions) {
          setDynamicFilterOptions(response.data.filterOptions);
        }
      } else {
        leadsData =
          response.data?.data ||
          (Array.isArray(response.data) ? response.data : []);
        total = leadsData.length;
      }

      const mappedData = leadsData.map((lead) => ({
        ...lead,
        id: lead._id || lead.id,
        createdDate: lead.createdDate || lead.createdAt,
      }));

      setRecords(mappedData);
      setTotalRecords(total);

      if (!serverSide) {
        updateStatistics(mappedData);
      }
    } catch (error) {
      if (error.name === "CanceledError" || error.name === "AbortError") return;
      console.error("Failed to fetch leads:", error);
      showError("Failed to fetch leads");
      setRecords([]);
      setTotalRecords(0);
      updateStatistics([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (prefLoading) return;

    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);

    debounceTimeoutRef.current = setTimeout(
      () => {
        fetchLeads();
      },
      serverSide ? 500 : 0,
    );

    return () => clearTimeout(debounceTimeoutRef.current);
  }, [
    prefLoading,
    serverSide,
    currentPage,
    recordsPerPage,
    searchTerm,
    filters,
    sortField,
    sortDirection,
    activeCardFilter,
  ]);

  const formatDateTimeForDisplay = (value) => {
    if (!value) return "";

    try {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return value;

      const day = String(date.getDate()).padStart(2, "0");
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const year = date.getFullYear();

      let hours = date.getHours();
      const minutes = String(date.getMinutes()).padStart(2, "0");
      const seconds = String(date.getSeconds()).padStart(2, "0");
      const ampm = hours >= 12 ? "PM" : "AM";
      hours = hours % 12 || 12;

      return `${day}-${month}-${year} | ${String(hours).padStart(2, "0")}:${minutes}:${seconds} ${ampm}`;
    } catch {
      return value;
    }
  };

  const preparedData = useMemo(
    () =>
      records.map((record, index) => ({
        ...record,
        sn: (currentPage - 1) * recordsPerPage + index + 1,
        createdDateTime:
          record.createdDateTime ||
          formatDateTimeForDisplay(record.createdDate),
      })),
    [records, currentPage, recordsPerPage],
  );

  const filteredClientSideData = useMemo(() => {
    if (serverSide) {
      return preparedData.filter((record) => !record.isDeleted);
    }

    let data = preparedData.filter((record) => record.isDeleted !== true);

    Object.entries(filters).forEach(([key, value]) => {
      if (columnsWithDateFilter.includes(key)) {
        if (value && typeof value === "object") {
          data = data.filter((row) => {
            const dateValue =
              row[key] || (key === "createdDateTime" ? row.createdDate : "");
            if (!dateValue) return false;

            const targetDate = new Date(dateValue);
            if (Number.isNaN(targetDate.getTime())) return false;

            const normalizedTarget = new Date(targetDate);
            normalizedTarget.setHours(0, 0, 0, 0);

            if (value.startDate) {
              const startDate = new Date(value.startDate);
              startDate.setHours(0, 0, 0, 0);
              if (normalizedTarget < startDate) return false;
            }

            if (value.endDate) {
              const endDate = new Date(value.endDate);
              endDate.setHours(0, 0, 0, 0);
              if (normalizedTarget > endDate) return false;
            }

            return true;
          });
        }
        return;
      }

      if (Array.isArray(value) && value.length > 0) {
        data = data.filter((row) => value.includes(String(row[key] || "")));
        return;
      }

      if (value && typeof value === "string" && value.trim() !== "") {
        data = data.filter((row) =>
          String(row[key] || "")
            .toLowerCase()
            .includes(value.toLowerCase()),
        );
      }
    });

    return data;
  }, [preparedData, filters, serverSide, columnsWithDateFilter]);

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
    { key: "leadName", label: "Name", width: 160 },
    { key: "businessName", label: "Business Name", width: 180 },
    { key: "phoneNumber", label: "Phone", width: 140 },
    { key: "whatsappNumber", label: "WhatsApp", width: 140 },
    { key: "email", label: "Email", width: 190 },
    {
      key: "interestedService",
      label: "Interested Services",
      width: 220,
    },
    { key: "leadSource", label: "Lead Source", width: 140 },
    {
      key: "priority",
      label: "Priority",
      width: 110,
      render: (value) => (
        <span
          className={`badge ${
            value === "High"
              ? "bg-danger"
              : value === "Medium"
                ? "bg-warning text-dark"
                : "bg-success"
          }`}
        >
          {value || "-"}
        </span>
      ),
    },
    {
      key: "leadStatus",
      label: "Lead Status",
      width: 150,
    },
    { key: "contactBy", label: "Contact By", width: 170 },
    { key: "lastContactedDate", label: "Last Contacted Date", width: 160 },
    { key: "followUpDate", label: "Follow-up Date", width: 130 },
    { key: "createdDateTime", label: "Created Date & Time", width: 200 },
    { key: "action", label: "Actions", width: 150 },
  ];

  const fixedColumns = ["sn"];
  const defaultVisibleColumns = [
    "sn",
    "leadName",
    "phoneNumber",
    "priority",
    "leadStatus",
    "interestedService",
    "action",
  ];

  const columnsWithDropdownFilter = [
    "leadStatus",
    "priority",
    "leadSource",
    "interestedService",
    "contactBy",
    "status",
  ];

  const getFilterOptions = () => {
    const extractUnique = (key) =>
      [...new Set(records.map((row) => row[key]).filter(Boolean))].sort();

    return {
      leadStatus: ["All", ...extractUnique("leadStatus")],
      priority: ["All", ...extractUnique("priority")],
      leadSource: ["All", ...extractUnique("leadSource")],
      interestedService: ["All", ...extractUnique("interestedService")],
      contactBy: ["All", ...extractUnique("contactBy")],
      status: ["All", ...extractUnique("status")],
    };
  };

  const cards = [
    {
      icon: "fa-solid fa-address-book",
      title: "Total Leads",
      key: "total",
      color: "primary",
      count: statistics.total,
    },
    {
      icon: "fa-solid fa-user-plus",
      title: "New",
      key: "new",
      color: "info",
      count: statistics.new,
    },
    {
      icon: "fa-solid fa-trophy",
      title: "Success",
      key: "success",
      color: "success",
      count: statistics.success,
    },
    {
      icon: "fa-solid fa-circle-xmark",
      title: "Lost",
      key: "lost",
      color: "danger",
      count: statistics.lost,
    },
    {
      icon: "fa-solid fa-phone",
      title: "Contacted",
      key: "contacted",
      color: "warning",
      count: statistics.contacted,
    },
    {
      icon: "fa-solid fa-plus-circle",
      title: "Add New Lead",
      key: "addNew",
      color: "success",
    },
  ];

  const handleCardClick = (cardKey) => {
    if (cardKey === "addNew") {
      if (!canCreate) {
        showError("You don't have permission to add lead records");
        return;
      }
      setEditingRecord(null);
      setShowCreateForm(true);
      return;
    }

    setActiveCardFilter(cardKey);
    if (serverSide) {
      setCurrentPage(1);
    }
  };

  const getCardNumber = (index) => (index % 8) + 1;

  const handleFormSubmit = async (formData) => {
    try {
      if (editingRecord && !editingRecord.isViewMode) {
        await apiPut(
          API_ENDPOINTS.LEADS.UPDATE(editingRecord.id || editingRecord._id),
          formData,
        );
        showSuccess("Lead updated successfully!");
      } else {
        await apiPost(API_ENDPOINTS.LEADS.CREATE, formData);
        showSuccess("Lead added successfully!");
      }

      setShowCreateForm(false);
      setEditingRecord(null);
      fetchLeads();
    } catch (error) {
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to save lead",
      );
    }
  };

  const handleEdit = (record) => {
    setEditingRecord(record);
    setShowCreateForm(true);
    showInfo(`Editing lead: ${record.leadName}`);
  };

  const handleView = (record) => {
    setEditingRecord({ ...record, isViewMode: true });
    setShowCreateForm(true);
    showInfo(`Viewing lead: ${record.leadName}`);
  };

  const handleDelete = (id) => {
    setRecordToDelete(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!recordToDelete) return;

    try {
      await apiDelete(API_ENDPOINTS.LEADS.DELETE(recordToDelete));
      showSuccess("Lead deleted successfully!");
      await fetchLeads();
      setShowDeleteConfirm(false);
      setRecordToDelete(null);
    } catch (error) {
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to delete lead",
      );
    }
  };

  const handleStatusToggle = async (id) => {
    const record = records.find((row) => row.id === id || row._id === id);
    if (!record) return;

    const nextStatus = record.status === "Active" ? "Inactive" : "Active";

    try {
      const { _id, id: rowId, ...payload } = record;
      payload.status = nextStatus;
      await apiPut(API_ENDPOINTS.LEADS.UPDATE(id), payload);
      showSuccess("Status updated successfully!");
      await fetchLeads();
    } catch (error) {
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to update status",
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

    fetchLeads();
    showInfo("Data refreshed!");
  };

  return (
    <>
      <div className="container-fluid">
        <div
          className="py-3 d-flex justify-content-between align-items-center flex-wrap"
          style={{ marginTop: "70px" }}
        >
          <h4 className="fs-18 fw-semibold m-0">Lead Management</h4>

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
              id="leadServerSideToggle"
            />
            <label
              className="form-check-label ms-2"
              htmlFor="leadServerSideToggle"
            >
              Server-side Mode {serverSide ? "(Enabled)" : "(Disabled)"}
            </label>
          </div>
        </div>

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
                      {card.key === "addNew" ? "+ Add New" : card.count || 0}
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
          tableTitle="Lead Record"
          showColumnSelector={true}
          showExport={true}
          showRefresh={true}
          showAdvancedFilter={true}
          showSearch={true}
          exportFileName="Lead_Management"
          exportTitle="Lead Management Report"
          activeCardFilter={activeCardFilter}
          cards={cards}
          serverSide={serverSide}
          onServerSideSearch={(term) => {
            setSearchTerm(term);
            setCurrentPage(1);
          }}
          onServerSideFilter={(filterParams) => {
            setFilters(filterParams);
            setCurrentPage(1);
          }}
          onServerSideSort={(field, direction) => {
            setSortField(field);
            setSortDirection(direction);
            setCurrentPage(1);
          }}
          onServerSidePageChange={setCurrentPage}
          onServerSideRecordsPerPageChange={(limit) => {
            setRecordsPerPage(limit);
            setCurrentPage(1);
          }}
          currentPage={currentPage}
          recordsPerPage={recordsPerPage}
          onPageChange={setCurrentPage}
          onRecordsPerPageChange={setRecordsPerPage}
          onColumnFilterChange={handleDebouncedColumnFilterChange}
          exportApi={API_ENDPOINTS.LEADS.LIST}
        />

        <CreateLead
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
          onHide={() => {
            setShowDeleteConfirm(false);
            setRecordToDelete(null);
          }}
          onConfirm={confirmDelete}
          title="Delete Lead"
          message={
            <>
              Are you sure you want to delete lead{" "}
              <strong>
                "
                {records.find(
                  (row) =>
                    row.id === recordToDelete || row._id === recordToDelete,
                )?.leadName || ""}
                "
              </strong>
              ? This action marks the lead as deleted.
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

export default LeadManagement;
