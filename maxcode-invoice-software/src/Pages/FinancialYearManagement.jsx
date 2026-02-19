import React, { useState, useEffect } from "react";
import ReusableTable from "../Components/ReusableTable";
import CreateYear from "../Components/CreateYear";
import ConfirmationModal from "../Components/ConfirmationModal";
import {
  showSuccess,
  showError,
  showInfo,
} from "../Components/ToastNotification";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { apiGet, apiPut } from "../utils/api";

const FinancialYearManagement = () => {
  useEffect(() => {
    document.title = "Financial Year Management | MaxCode IT Services";
  }, []);

  // State for records and loading
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreateYearForm, setShowCreateYearForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [activeCardFilter, setActiveCardFilter] = useState("total");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [yearToDelete, setYearToDelete] = useState(null);

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

        return `${day}/${month}/${year} | ${formattedHours}:${minutes}:${seconds} ${ampm}`;
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
  const formatDateForDisplay = (dateString) => {
    if (!dateString) return "";

    try {
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        const day = String(date.getDate()).padStart(2, "0");
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
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

  useEffect(() => {
    fetchFinancialYears();
  }, []);

  const fetchFinancialYears = async () => {
    setLoading(true);
    try {
      const response = await apiGet(API_ENDPOINTS.YEARS.LIST);
      const yearsData = Array.isArray(response.data)
        ? response.data
        : response.data?.years || [];

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
      updateStatistics(mappedData);
    } catch (err) {
      console.error("Failed to fetch financial years:", err);
      showError("Failed to fetch financial years");
      setRecords([]);
      updateStatistics([]);
    } finally {
      setLoading(false);
    }
  };

  // Update statistics
  const updateStatistics = (data) => {
    const activeRecords = data.filter((r) => r.isDeleted !== true);
    const stats = {
      total: activeRecords.length,
      active: activeRecords.filter((r) => r.status === "Active").length,
      inactive: activeRecords.filter((r) => r.status === "Inactive").length,
      currentYear: activeRecords.filter((r) =>
        isCurrentFinancialYear(r.financialYear),
      ).length,
      upcomingYear: activeRecords.filter((r) =>
        isUpcomingFinancialYear(r.financialYear),
      ).length,
    };
    setStatistics(stats);
  };

  // Prepare data for table (add serial number and formatted dates)
  const prepareTableData = () => {
    return records.map((record, index) => ({
      ...record,
      sn: index + 1,
      startDateFormatted: formatDateForDisplay(record.startDate),
      endDateFormatted: formatDateForDisplay(record.endDate),
      createdDateTime: formatDateTimeForDisplay(record.createdDate),
      createdDateForFilter: record.createdDate,
      isDefaultDisplay: record.isDefault ? "Yes" : "No",
      isCurrent: isCurrentFinancialYear(record.financialYear),
      isUpcoming: isUpcomingFinancialYear(record.financialYear),
      openingCashFormatted: formatCurrency(record.openingCash),
      openingBankFormatted: formatCurrency(record.openingBank),
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
      key: "invoiceFormat",
      label: "Invoice Format",
      width: 200,
    },
    {
      key: "selfInvoiceFormat",
      label: "Self Invoice Format",
      width: 220,
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

  const fixedColumns = ["sn", "action"];
  const defaultVisibleColumns = [
    "sn",
    "financialYear",
    "startDateFormatted",
    "endDateFormatted",
    "taxPercentage",
    "openingCashFormatted",
    "openingBankFormatted",
    "invoiceFormat",
    "selfInvoiceFormat",
    "status",
    "isDefaultDisplay",
    "createdDateTime",
    "action",
  ];

  // Columns with dropdown filter
  const columnsWithDropdownFilter = ["status", "isDefaultDisplay"];

  // Columns with date range filter
  const columnsWithDateFilter = ["createdDateTime"];

  // Filter options
  const filterOptions = {
    status: ["All", "Active", "Inactive"],
    isDefaultDisplay: ["All", "Yes", "No"],
  };

  // Handle card click
  const handleCardClick = (cardKey) => {
    if (cardKey === "addNew") {
      setEditingRecord(null);
      setShowCreateYearForm(true);
    } else {
      setActiveCardFilter(cardKey);
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
    fetchFinancialYears();
  };

  // Handle edit
  const handleEdit = (record) => {
    setEditingRecord(record);
    setShowCreateYearForm(true);
    showInfo(`Editing financial year: ${record.financialYear}`);
  };

  // Handle view
  const handleView = (record) => {
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

      setRecords(updatedRecords);
      updateStatistics(updatedRecords);
      showSuccess("Financial Year marked as deleted successfully!");
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

      setRecords(updatedRecords);
      updateStatistics(updatedRecords);
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

      setRecords(updatedRecords);
      updateStatistics(updatedRecords);

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
    fetchFinancialYears();
    setActiveCardFilter("total");
    showInfo("Data refreshed!");
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

  return (
    <>
      <div className="container-fluid">
        <div
          className="py-3 d-flex align-items-sm-center flex-sm-row flex-column"
          style={{ marginTop: "70px" }}
        >
          <div className="flex-grow-1">
            <h4 className="fs-18 fw-semibold m-0">Financial Year Management</h4>
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

            return (
              <div key={index} className="col-md-6 col-xl-2 mb-4">
                <div
                  className={`card border-0 shadow-sm overflow-hidden ${cardClass} ${isActive ? "border-primary" : ""}`}
                  style={{
                    transition: "all 0.3s ease",
                    cursor: "pointer",
                    height: "100%",
                    borderRadius: "12px",
                    border: isActive
                      ? "2px solid #0d6efd"
                      : "1px solid #dee2e6",
                  }}
                  onMouseEnter={(e) => {
                    if (card.key === "addNew") {
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
                  onClick={() => handleCardClick(card.key)}
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
          columns={columns}
          data={prepareTableData().filter((r) => r.isDeleted !== true)}
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
          existingYears={records
            .filter((r) => r.isDeleted !== true)
            .map((r) => r.financialYear)}
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
