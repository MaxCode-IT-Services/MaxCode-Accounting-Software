import React, { useEffect, useMemo, useState } from "react";
import ReusableTable from "../Components/ReusableTable";
import CreateTeamMember from "../Components/CreateTeamMember";
import ConfirmationModal from "../Components/ConfirmationModal";
import {
  showError,
  showInfo,
  showSuccess,
} from "../Components/ToastNotification";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { apiGet, apiPut } from "../utils/api";
import { hasActionPermission } from "../utils/permissions";

const TeamManagement = () => {
  const moduleKey = "teamManagement";
  const canCreate = hasActionPermission(moduleKey, "create");

  useEffect(() => {
    document.title = "Team Management | MaxCode IT Services";
  }, []);

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [activeCardFilter, setActiveCardFilter] = useState("total");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [teamToDelete, setTeamToDelete] = useState(null);
  const [statistics, setStatistics] = useState({
    total: 0,
    active: 0,
    inactive: 0,
    admins: 0,
    teams: 0,
  });

  useEffect(() => {
    fetchTeamMembers();
  }, []);

  const fetchTeamMembers = async () => {
    setLoading(true);
    try {
      const response = await apiGet(API_ENDPOINTS.TEAM_MEMBERS.LIST);
      const data = Array.isArray(response.data)
        ? response.data
        : response.data?.teamMembers || [];

      const mapped = data.map((record) => ({
        ...record,
        id: record._id || record.id,
        createdDate: record.createdAt || record.createdDate,
      }));

      setRecords(mapped);
      updateStatistics(mapped);
    } catch (error) {
      showError("Failed to fetch team users");
      setRecords([]);
      updateStatistics([]);
    } finally {
      setLoading(false);
    }
  };

  const updateStatistics = (list) => {
    const activeRecords = list.filter((record) => record.isDeleted !== true);
    setStatistics({
      total: activeRecords.length,
      active: activeRecords.filter((record) => record.status === "Active")
        .length,
      inactive: activeRecords.filter((record) => record.status === "Inactive")
        .length,
      admins: activeRecords.filter((record) =>
        ["Admin", "Master Admin"].includes(record.role),
      ).length,
      teams: activeRecords.filter((record) => record.role === "Team").length,
    });
  };

  const cards = [
    {
      icon: "fa-solid fa-users",
      title: "Total Users",
      key: "total",
    },
    {
      icon: "fas fa-user-check",
      title: "Active Users",
      key: "active",
    },
    {
      icon: "fa-solid fa-user-slash",
      title: "Inactive Users",
      key: "inactive",
    },
    {
      icon: "fa-solid fa-user-gear",
      title: "Admin Users",
      key: "admins",
    },
    {
      icon: "fa-solid fa-user-group",
      title: "Team Users",
      key: "teams",
    },
    {
      icon: "fas fa-plus-circle",
      title: "Add Team User",
      key: "addNew",
    },
  ];

  const getCardNumber = (index) => (index % 8) + 1;

  const formatDateTime = (dateString) => {
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

    return `${day}/${month}/${year} | ${String(hours).padStart(2, "0")}:${minutes}:${seconds} ${ampm}`;
  };

  const prepareTableData = () =>
    records.map((record, index) => ({
      ...record,
      sn: index + 1,
      phoneNumber: record.phone,
      moduleAccessCount: Object.values(record.permissions || {}).filter(
        (module) => module?.active === true,
      ).length,
      createdDateTime: formatDateTime(record.createdDate),
      createdDateFilter: record.createdDate,
    }));

  const columns = useMemo(
    () => [
      { key: "sn", label: "S.No", width: 70 },
      { key: "name", label: "Name", width: 180 },
      { key: "phoneNumber", label: "Phone", width: 130 },
      { key: "email", label: "Email", width: 220 },
      { key: "address", label: "Address", width: 220 },
      { key: "role", label: "Role", width: 130 },
      {
        key: "moduleAccessCount",
        label: "Module Access",
        width: 140,
        render: (value) => <span className="badge bg-info">{value || 0}</span>,
      },
      { key: "status", label: "Status", width: 110 },
      { key: "createdDateTime", label: "Created Date & Time", width: 200 },
      { key: "action", label: "Actions", width: 150 },
    ],
    [],
  );

  const fixedColumns = ["sn"];
  const defaultVisibleColumns = [
    "sn",
    "name",
    "phoneNumber",
    "email",
    "role",
    "moduleAccessCount",
    "status",
    "createdDateTime",
    "action",
  ];
  const columnsWithDropdownFilter = ["status", "role"];
  const columnsWithDateFilter = ["createdDateTime"];

  const filterOptions = {
    status: ["All", "Active", "Inactive"],
    role: ["All", "Team", "Admin", "Master Admin"],
  };

  const handleCardClick = (cardKey) => {
    if (cardKey === "addNew") {
      if (!canCreate) {
        showError("You don't have permission to add team users");
        return;
      }
      setEditingRecord(null);
      setShowCreateForm(true);
      return;
    }
    setActiveCardFilter(cardKey);
  };

  const handleFormSubmit = () => {
    setShowCreateForm(false);
    setEditingRecord(null);
    fetchTeamMembers();
  };

  const handleEdit = (record) => {
    setEditingRecord(record);
    setShowCreateForm(true);
    showInfo(`Editing user: ${record.name}`);
  };

  const handleView = (record) => {
    setEditingRecord({ ...record, isViewMode: true });
    setShowCreateForm(true);
    showInfo(`Viewing user: ${record.name}`);
  };

  const handleDelete = (id) => {
    setTeamToDelete(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!teamToDelete) return;

    try {
      await apiPut(API_ENDPOINTS.TEAM_MEMBERS.UPDATE(teamToDelete), {
        isDeleted: true,
        deletedAt: new Date().toISOString(),
      });

      const updated = records.map((record) =>
        record.id === teamToDelete || record._id === teamToDelete
          ? { ...record, isDeleted: true }
          : record,
      );

      setRecords(updated);
      updateStatistics(updated);
      showSuccess("Team user deleted successfully");
      setShowDeleteConfirm(false);
      setTeamToDelete(null);
    } catch (error) {
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to delete team user",
      );
    }
  };

  const handleStatusToggle = async (id) => {
    const record = records.find((item) => item.id === id || item._id === id);
    if (!record) return;

    const newStatus = record.status === "Active" ? "Inactive" : "Active";

    try {
      const payload = {
        name: record.name,
        phone: record.phone,
        email: record.email,
        address: record.address,
        role: record.role,
        sendEmail: record.sendEmail === true,
        status: newStatus,
        permissions: record.permissions || {},
      };

      await apiPut(API_ENDPOINTS.TEAM_MEMBERS.UPDATE(id), payload);

      const updated = records.map((item) =>
        item.id === id || item._id === id
          ? { ...item, status: newStatus }
          : item,
      );
      setRecords(updated);
      updateStatistics(updated);
      showSuccess("Status updated successfully");
    } catch (error) {
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to update status",
      );
    }
  };

  const handleRefresh = () => {
    fetchTeamMembers();
    showInfo("Data refreshed");
  };

  return (
    <>
      <div className="container-fluid">
        <div
          className="py-3 d-flex align-items-sm-center flex-sm-row flex-column"
          style={{ marginTop: "70px" }}
        >
          <div className="flex-grow-1">
            <h4 className="fs-18 fw-semibold m-0">Team Management</h4>
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
              <div key={card.key} className="col-md-6 col-xl-2 mb-4">
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
                  onMouseEnter={(event) => {
                    if (card.key === "addNew" && !isAddNewDisabled) {
                      event.currentTarget.style.transform = "translateY(-5px)";
                      event.currentTarget.style.boxShadow =
                        "0 10px 20px rgba(0,0,0,0.1)";
                    }
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.transform = "translateY(0)";
                    event.currentTarget.style.boxShadow =
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
          moduleKey={moduleKey}
          columns={columns}
          data={prepareTableData().filter(
            (record) => record.isDeleted !== true,
          )}
          loading={loading}
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
          filterOptions={filterOptions}
          tableTitle="Team User Record"
          showColumnSelector={true}
          showExport={true}
          showRefresh={true}
          showAdvancedFilter={true}
          showSearch={true}
          exportFileName="Team_Management"
          exportTitle="Team Management Report"
          activeCardFilter={activeCardFilter}
          cards={cards}
          getBadgeClass={(value) => {
            if (value === "Active") return "bg-success";
            if (value === "Inactive") return "bg-danger";
            if (value === "Admin" || value === "Master Admin")
              return "bg-primary";
            if (value === "Team") return "bg-info";
            return "bg-secondary";
          }}
        />

        <CreateTeamMember
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
            setTeamToDelete(null);
          }}
          onConfirm={confirmDelete}
          title="Delete Team User"
          message={
            <>
              Are you sure you want to delete user{" "}
              <strong>
                "
                {records.find(
                  (record) =>
                    record.id === teamToDelete || record._id === teamToDelete,
                )?.name || ""}
                "
              </strong>
              ? This action marks the user as deleted.
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

export default TeamManagement;
