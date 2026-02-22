import React, { useState, useEffect } from "react";
import ReusableTable from "../Components/ReusableTable";
import CreateVendor from "../Components/CreateVendor";
import ConfirmationModal from "../Components/ConfirmationModal";
import {
  showSuccess,
  showError,
  showInfo,
} from "../Components/ToastNotification";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { apiGet, apiDelete, apiPut } from "../utils/api";
import { hasActionPermission } from "../utils/permissions";

const VendorManagement = () => {
  const moduleKey = "vendorManagement";
  const canCreate = hasActionPermission(moduleKey, "create");

  useEffect(() => {
    document.title = "Vendor Management | MaxCode IT Services";
  }, []);

  // State for records and loading
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreateVendorForm, setShowCreateVendorForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [activeCardFilter, setActiveCardFilter] = useState("total");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [vendorToDelete, setVendorToDelete] = useState(null);

  // Statistics state
  const [statistics, setStatistics] = useState({
    total: 0,
    active: 0,
    inactive: 0,
    withGST: 0,
    withoutGST: 0,
  });

  // Fetch vendors from API
  useEffect(() => {
    fetchVendors();
  }, []);

  const fetchVendors = async () => {
    setLoading(true);
    try {
      const response = await apiGet(API_ENDPOINTS.VENDORS.LIST);

      const vendorsData = Array.isArray(response.data)
        ? response.data
        : response.data?.vendors || [];

      const mappedData = vendorsData.map((vendor) => {
        const createdDate =
          vendor.createdDate || vendor.createdAt || vendor.created_on;

        return {
          ...vendor,
          id: vendor._id || vendor.id,
          createdDate,
        };
      });
      setRecords(mappedData);
      updateStatistics(mappedData);
    } catch (err) {
      console.error("Failed to fetch vendors:", err);
      showError("Failed to fetch vendors");
      setRecords([]);
      updateStatistics([]);
    } finally {
      setLoading(false);
    }
  };

  // Update statistics
  const updateStatistics = (data) => {
    // Filter out deleted records from statistics
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

        return `${day}/${month}/${year} | ${formattedHours}:${minutes}:${seconds} ${ampm}`;
      }

      return dateString;
    } catch (e) {
      return dateString;
    }
  };

  // Card data array
  const cards = [
    {
      icon: "fa-solid fa-truck",
      title: "Total Vendors",
      key: "total",
      color: "primary",
    },
    {
      icon: "fas fa-user-check",
      title: "Active Vendors",
      key: "active",
      color: "success",
    },
    {
      icon: "fa-solid fa-user-slash",
      title: "Inactive Vendors",
      key: "inactive",
      color: "danger",
    },
    {
      icon: "fas fa-file-invoice",
      title: "With GST",
      key: "withGST",
      color: "info",
    },
    {
      icon: "fas fa-file-excel",
      title: "Without GST",
      key: "withoutGST",
      color: "warning",
    },
    {
      icon: "fas fa-plus-circle",
      title: "Add New Vendor",
      key: "addNew",
      color: "success",
    },
  ];

  // Prepare data for table (add serial number and formatted dates)
  const prepareTableData = () => {
    return records.map((record, index) => ({
      ...record,
      sn: index + 1,
      createdDateTime:
        record.createdDateTime || formatDateTimeForDisplay(record.createdDate),
      createdDateFilter: record.createdDate,
    }));
  };

  // Columns configuration
  const columns = [
    { key: "sn", label: "S.No", width: 70 },
    { key: "vendorName", label: "Vendor Name", width: 150 },
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
    { key: "createdDateTime", label: "Created Date & Time", width: 200 },
    { key: "action", label: "Actions", width: 150 },
  ];

  const fixedColumns = ["sn"];
  const defaultVisibleColumns = [
    "sn",
    "vendorName",
    "businessName",
    "phoneNumber",
    "placeOfSupply",
    "status",
    "gstStatus",
    "createdDateTime",
    "action",
  ];

  // Columns with dropdown filter
  const columnsWithDropdownFilter = ["status", "gstStatus"];

  // Columns with date range filter
  const columnsWithDateFilter = ["createdDateTime"];

  // Filter options
  const filterOptions = {
    status: ["All", "Active", "Inactive"],
    gstStatus: ["All", "Registered", "Unregistered"],
  };

  // Handle card click
  const handleCardClick = (cardKey) => {
    if (cardKey === "addNew") {
      if (!canCreate) {
        showError("You don't have permission to add vendor records");
        return;
      }
      setEditingRecord(null);
      setShowCreateVendorForm(true);
    } else {
      setActiveCardFilter(cardKey);
    }
  };

  // Get card number for styling
  const getCardNumber = (index) => {
    return (index % 8) + 1;
  };

  // Handle form submit
  const handleFormSubmit = (formData) => {
    // Close the form and reset editing record
    setShowCreateVendorForm(false);
    setEditingRecord(null);

    // Refresh data from API to get the latest updates
    // This ensures any data saved to the database is reflected in the table
    fetchVendors();
  };

  // Handle edit
  const handleEdit = (record) => {
    setEditingRecord(record);
    setShowCreateVendorForm(true);
    showInfo(`Editing vendor: ${record.vendorName}`);
  };

  // Handle view
  const handleView = (record) => {
    setEditingRecord({ ...record, isViewMode: true });
    setShowCreateVendorForm(true);
    showInfo(`Viewing vendor: ${record.vendorName}`);
  };

  // Handle delete - Show confirmation modal
  const handleDelete = (id) => {
    const record = records.find((r) => r.id === id || r._id === id);
    if (!record) return;

    setVendorToDelete(id);
    setShowDeleteConfirm(true);
  };

  // Confirm delete - Mark record as deleted by setting isDeleted: true
  const confirmDelete = async () => {
    if (!vendorToDelete) return;

    try {
      const record = records.find(
        (r) => r.id === vendorToDelete || r._id === vendorToDelete,
      );
      if (!record) return;

      // Send only isDeleted flag, don't touch status or other fields
      const updateData = {
        isDeleted: true,
        deletedAt: new Date().toISOString(),
      };

      // Mark as deleted by setting isDeleted flag
      await apiPut(API_ENDPOINTS.VENDORS.UPDATE(vendorToDelete), updateData);

      // Update local state - mark record as deleted
      const updatedRecords = records.map((r) =>
        r.id === vendorToDelete || r._id === vendorToDelete
          ? { ...r, isDeleted: true, deletedAt: new Date().toISOString() }
          : r,
      );
      setRecords(updatedRecords);
      updateStatistics(updatedRecords);
      showSuccess("Vendor deleted successfully!");
      setShowDeleteConfirm(false);
      setVendorToDelete(null);
    } catch (error) {
      console.error("Error deleting vendor:", error);
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to delete vendor",
      );
    }
  };

  // Handle status toggle
  const handleStatusToggle = async (id) => {
    const record = records.find((r) => r.id === id || r._id === id);
    if (!record) return;

    const newStatus = record.status === "Active" ? "Inactive" : "Active";
    try {
      // Extract fields excluding _id and id (immutable fields)
      const { _id, id: recordId, ...updateData } = record;
      updateData.status = newStatus;

      await apiPut(API_ENDPOINTS.VENDORS.UPDATE(id), updateData);
      const updatedRecords = records.map((r) =>
        r.id === id || r._id === id ? { ...r, status: newStatus } : r,
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

  // Handle refresh
  const handleRefresh = () => {
    fetchVendors();
    showInfo("Data refreshed!");
  };

  return (
    <>
      <div className="container-fluid">
        <div
          className="py-3 d-flex align-items-sm-center flex-sm-row flex-column"
          style={{ marginTop: "70px" }}
        >
          <div className="flex-grow-1">
            <h4 className="fs-18 fw-semibold m-0">Vendor Management</h4>
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

        {/* Reusable Table - Now with API data */}
        <ReusableTable
          moduleKey={moduleKey}
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
          tableTitle="Vendors Record"
          showColumnSelector={true}
          showExport={true}
          showRefresh={true}
          showAdvancedFilter={true}
          showSearch={true}
          exportFileName="Vendor_Management"
          exportTitle="Vendor Management Report"
          activeCardFilter={activeCardFilter}
          cards={cards}
          getBadgeClass={(value) => {
            if (value === "Active") return "bg-success";
            if (value === "Inactive") return "bg-danger";
            if (value === "Registered") return "bg-success";
            if (value === "Unregistered") return "bg-secondary";
            return "bg-primary";
          }}
        />

        {/* Create/Edit Vendor Modal */}
        <CreateVendor
          show={showCreateVendorForm}
          onClose={() => {
            setShowCreateVendorForm(false);
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
            setVendorToDelete(null);
          }}
          onConfirm={confirmDelete}
          title="Delete Vendor"
          message={
            <>
              Are you sure you want to delete vendor{" "}
              <strong>
                "
                {records.find(
                  (r) => r.id === vendorToDelete || r._id === vendorToDelete,
                )?.vendorName || ""}
                "
              </strong>
              ? This action marks the vendor as deleted.
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

export default VendorManagement;
