import React, { useEffect, useMemo, useRef, useState } from "react";
import ReusableTable from "../Components/ReusableTable";
import CreateStaff from "../Components/CreateStaff";
import ConfirmationModal from "../Components/ConfirmationModal";
import {
  showSuccess,
  showError,
  showInfo,
} from "../Components/ToastNotification";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { apiGet, apiPost, apiPut } from "../utils/api";
import { hasActionPermission } from "../utils/permissions";

const StaffManagement = () => {
  const moduleKey = "staffManagement";
  const canCreate = hasActionPermission(moduleKey, "create");

  const [serverSide, setServerSide] = useState(true);
  const [prefLoading, setPrefLoading] = useState(true);
  const [dynamicFilterOptions, setDynamicFilterOptions] = useState({});

  useEffect(() => {
    document.title = "Staff Management | MaxCode IT Services";

    const fetchPreference = async () => {
      try {
        const res = await apiGet(API_ENDPOINTS.USER_PREFERENCES.GET);
        if (typeof res.data?.staffManagementServerSide === "boolean") {
          setServerSide(res.data.staffManagementServerSide);
        }
      } catch (error) {
        console.error("Failed to fetch staff preferences:", error);
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
          staffManagementServerSide: serverSide,
        });
      } catch (error) {
        console.error("Failed to save staff preferences:", error);
      }
    };

    savePreference();
  }, [serverSide, prefLoading]);

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);
  const [showCreateStaffForm, setShowCreateStaffForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [activeCardFilter, setActiveCardFilter] = useState("total");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [staffToDelete, setStaffToDelete] = useState(null);

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
    active: 0,
    inactive: 0,
    withPhoto: 0,
    withoutPhoto: 0,
  });

  const columnsWithDateFilter = ["createdDateTime"];

  const fetchStaff = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (prefLoading) return;
    setLoading(true);

    try {
      let url = API_ENDPOINTS.STAFF.LIST;
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
          )
            return;

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

      let staffData;
      let total;

      if (serverSide) {
        staffData = response.data?.data || response.data?.staff || [];
        total =
          response.data?.pagination?.totalRecords ||
          response.data?.total ||
          staffData.length;

        if (response.data?.statistics) {
          setStatistics(response.data.statistics);
        }

        if (response.data?.filterOptions) {
          setDynamicFilterOptions(response.data.filterOptions);
        }
      } else {
        staffData =
          response.data?.data ||
          response.data?.staff ||
          (Array.isArray(response.data) ? response.data : []);
        total = staffData.length;
      }

      const mappedData = staffData.map((staff, index) => {
        const createdDate =
          staff.createdDate || staff.createdAt || staff.created_on;

        return {
          ...staff,
          id: staff._id || staff.id,
          createdDate,
          serialNo:
            staff.serialNo ||
            `STF-${String((serverSide ? (currentPage - 1) * recordsPerPage : 0) + index + 1).padStart(3, "0")}`,
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

      console.error("Failed to fetch staff:", err);
      showError("Failed to fetch staff");
      setRecords([]);
      setTotalRecords(0);
      updateStatistics([]);
    } finally {
      setLoading(false);
    }
  };

  const updateStatistics = (data) => {
    const activeRecords = data.filter((r) => r.isDeleted !== true);
    const stats = {
      total: activeRecords.length,
      active: activeRecords.filter((r) => r.status === "Active").length,
      inactive: activeRecords.filter((r) => r.status === "Inactive").length,
      withPhoto: activeRecords.filter((r) => Boolean(r.profilePhotoUrl)).length,
      withoutPhoto: activeRecords.filter((r) => !r.profilePhotoUrl).length,
    };
    setStatistics(stats);
  };

  useEffect(() => {
    if (prefLoading) return;

    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);

    debounceTimeoutRef.current = setTimeout(
      () => {
        fetchStaff();
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

  const cards = [
    {
      icon: "fa-solid fa-users",
      title: "Total Staff",
      key: "total",
      color: "primary",
    },
    {
      icon: "fas fa-user-check",
      title: "Active Staff",
      key: "active",
      color: "success",
    },
    {
      icon: "fa-solid fa-user-slash",
      title: "Inactive Staff",
      key: "inactive",
      color: "danger",
    },
    {
      icon: "fas fa-image",
      title: "With Photo",
      key: "withPhoto",
      color: "info",
    },
    {
      icon: "fa-brands fa-pix",
      title: "Without Photo",
      key: "withoutPhoto",
      color: "warning",
    },
    {
      icon: "fas fa-plus-circle",
      title: "Add New Staff",
      key: "addNew",
      color: "success",
    },
  ];

  const preparedData = useMemo(() => {
    return records.map((record, index) => ({
      ...record,
      sn: serverSide
        ? (currentPage - 1) * recordsPerPage + index + 1
        : index + 1,
      pnaNumber: record.pnaNumber || record.panNumber || "-",
      createdDateTime:
        record.createdDateTime || formatDateTimeForDisplay(record.createdDate),
      createdDateFilter: record.createdDate,
      photoStatus: record.profilePhotoUrl ? "Available" : "Not Available",
      dateOfBirthDisplay: record.dateOfBirth
        ? formatDateTimeForDisplay(record.dateOfBirth).split(" |")[0]
        : "-",
    }));
  }, [records, serverSide, currentPage, recordsPerPage]);

  const filteredClientSideData = useMemo(() => {
    if (serverSide) {
      return preparedData.filter((record) => record.isDeleted !== true);
    }

    let data = preparedData.filter((record) => record.isDeleted !== true);

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

  const columns = [
    { key: "sn", label: "S.No", width: 70 },
    {
      key: "profilePhotoUrl",
      label: "Photo",
      width: 90,
      render: (value) =>
        value ? (
          <img
            src={value}
            alt="Staff"
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              objectFit: "cover",
            }}
          />
        ) : (
          <span className="badge bg-secondary">N/A</span>
        ),
    },
    { key: "developerName", label: "Developer Name", width: 180 },
    { key: "fatherName", label: "Father's Name", width: 170 },
    { key: "phoneNumber", label: "Phone", width: 120 },
    { key: "emergencyContact", label: "Emergency Contact", width: 150 },
    { key: "email", label: "Email", width: 220 },
    { key: "githubUsername", label: "Github", width: 160 },
    { key: "designation", label: "Designation", width: 160 },
    { key: "department", label: "Department", width: 150 },
    { key: "dateOfBirthDisplay", label: "Date of Birth", width: 130 },
    { key: "aadharNumber", label: "Aadhar", width: 150 },
    { key: "pnaNumber", label: "PNA/PAN", width: 140 },
    { key: "bankName", label: "Bank Name", width: 170 },
    { key: "accountHolderName", label: "Account Holder", width: 180 },
    { key: "bankAccountNumber", label: "A/C Number", width: 160 },
    { key: "ifscCode", label: "IFSC Code", width: 140 },
    { key: "branch", label: "Branch", width: 150 },
    {
      key: "googleDriveLink",
      label: "Google Drive",
      width: 150,
      render: (value) =>
        value ? (
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="text-center text-danger"
          >
            <i className="fa-solid fa-up-right-from-square"></i> View Now
          </a>
        ) : (
          "-"
        ),
    },
    {
      key: "aadharGoogleDriveLink",
      label: "Aadhar Drive",
      width: 150,
      render: (value) =>
        value ? (
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="text-center text-danger"
          >
            <i className="fa-solid fa-up-right-from-square"></i> View Now
          </a>
        ) : (
          "-"
        ),
    },
    {
      key: "panCardGoogleDriveLink",
      label: "PAN Drive",
      width: 150,
      render: (value) =>
        value ? (
          <a
            href={value}
            target="_blank"
            rel="noopener noreferrer"
            className="text-center text-danger"
          >
            <i className="fa-solid fa-up-right-from-square"></i> View Now
          </a>
        ) : (
          "-"
        ),
    },
    {
      key: "status",
      label: "Status",
      width: 100,
    },
    { key: "createdDateTime", label: "Created Date & Time", width: 200 },
    { key: "action", label: "Actions", width: 150 },
  ];

  const fixedColumns = ["sn"];
  const defaultVisibleColumns = [
    "sn",
    "profilePhotoUrl",
    "developerName",
    "phoneNumber",
    "email",
    "status",
    "action",
  ];

  const columnsWithDropdownFilter = ["status", "photoStatus"];

  const getFilterOptions = () => {
    if (serverSide && Object.keys(dynamicFilterOptions).length > 0) {
      return dynamicFilterOptions;
    }

    return {
      status: ["All", "Active", "Inactive"],
      photoStatus: ["All", "Available", "Not Available"],
    };
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

  const handleCardClick = (cardKey) => {
    if (cardKey === "addNew") {
      if (!canCreate) {
        showError("You don't have permission to add staff records");
        return;
      }
      setEditingRecord(null);
      setShowCreateStaffForm(true);
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

  const handleFormSubmit = async () => {
    setShowCreateStaffForm(false);
    setEditingRecord(null);
    await fetchStaff();
  };

  const handleEdit = (record) => {
    setEditingRecord(record);
    setShowCreateStaffForm(true);
    showInfo(`Editing staff: ${record.developerName}`);
  };

  const handleView = (record) => {
    setEditingRecord({ ...record, isViewMode: true });
    setShowCreateStaffForm(true);
    showInfo(`Viewing staff: ${record.developerName}`);
  };

  const handleDelete = (id) => {
    const record = records.find((r) => r.id === id || r._id === id);
    if (!record) return;

    setStaffToDelete(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!staffToDelete) return;

    try {
      await apiPut(API_ENDPOINTS.STAFF.UPDATE(staffToDelete), {
        isDeleted: true,
        deletedAt: new Date().toISOString(),
      });

      showSuccess("Staff deleted successfully!");
      await fetchStaff();
      setShowDeleteConfirm(false);
      setStaffToDelete(null);
    } catch (error) {
      console.error("Error deleting staff:", error);
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to delete staff",
      );
    }
  };

  const handleStatusToggle = async (id) => {
    const record = records.find((r) => r.id === id || r._id === id);
    if (!record) return;

    const newStatus = record.status === "Active" ? "Inactive" : "Active";
    try {
      const { _id, id: recordId, ...updateData } = record;
      updateData.status = newStatus;

      await apiPut(API_ENDPOINTS.STAFF.UPDATE(id), updateData);
      showSuccess("Status updated successfully!");
      await fetchStaff();
    } catch (error) {
      console.error("Error updating status:", error);
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to update status",
      );
    }
  };

  const handleRefresh = async () => {
    if (serverSide) {
      setFilters({});
      setSearchTerm("");
      setSortField(null);
      setSortDirection("normal");
      setCurrentPage(1);
      setActiveCardFilter("total");
    }

    await fetchStaff();
    showInfo("Data refreshed!");
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
          <h4 className="fs-18 fw-semibold m-0">Staff Management</h4>

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
              id="staffServerSideToggle"
            />
            <label
              className="form-check-label ms-2"
              htmlFor="staffServerSideToggle"
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
          filterOptions={getFilterOptions()}
          tableTitle="Staff Record"
          showColumnSelector={true}
          showExport={true}
          showRefresh={true}
          showAdvancedFilter={true}
          showSearch={true}
          exportFileName="Staff_Management"
          exportTitle="Staff Management Report"
          activeCardFilter={activeCardFilter}
          cards={cards}
          getBadgeClass={(value) => {
            if (value === "Active") return "bg-success";
            if (value === "Inactive") return "bg-danger";
            if (value === "Available") return "bg-success";
            if (value === "Not Available") return "bg-secondary";
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
          exportApi={API_ENDPOINTS.STAFF.LIST}
        />

        <CreateStaff
          show={showCreateStaffForm}
          onClose={() => {
            setShowCreateStaffForm(false);
            setEditingRecord(null);
          }}
          onSubmit={handleFormSubmit}
          editingRecord={editingRecord}
        />

        <ConfirmationModal
          show={showDeleteConfirm}
          onHide={() => {
            setShowDeleteConfirm(false);
            setStaffToDelete(null);
          }}
          onConfirm={confirmDelete}
          title="Delete Staff"
          message={
            <>
              Are you sure you want to delete staff{" "}
              <strong>
                "
                {records.find(
                  (r) => r.id === staffToDelete || r._id === staffToDelete,
                )?.developerName || ""}
                "
              </strong>
              ? This action marks the staff as deleted.
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

export default StaffManagement;
