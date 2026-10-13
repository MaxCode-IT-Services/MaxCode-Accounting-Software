import React from "react";
import ConfirmationModal from "../ConfirmationModal";
import MasterTabStyle from "./MasterTabStyle";

const HsnTab = ({
  serviceSearch,
  setServiceSearch,
  selectedServices,
  setConfirmDeleteServices,
  openAddServiceModal,
  isSuperAdmin,
  filteredServices,
  toggleSelectAll,
  toggleSelectRow,
  getServiceStatus,
  toggleServiceStatus,
  openEditServiceModal,
  removeService,
  isServiceModalOpen,
  editingServiceId,
  closeServiceModal,
  serviceFormData,
  handleServiceFormChange,
  saveService,
  confirmDeleteServices,
  handleBulkDeleteServices,
}) => {
  const totalServices = filteredServices.length;
  const activeServices = filteredServices.filter(
    (service) => getServiceStatus(service) === "active",
  ).length;
  const inactiveServices = totalServices - activeServices;
  const selectedCount = selectedServices.length;

  return (
    <div className="business-details-container">
      <MasterTabStyle />

      <div className="row g-4">
        <div className="col-12">
          <div className="is2-shell">
            <div className="is2-topband">
              <div className="d-flex flex-column flex-lg-row justify-content-between align-items-start align-items-lg-center gap-3">
                <div className="is2-title-wrap">
                  <span className="is2-icon">
                    <i className="fas fa-tags"></i>
                  </span>
                  <div>
                    <h5 className="is2-title">Service Master & HSN Codes</h5>
                    <p className="is2-subtitle">
                      Global inventory of services and tax codes
                    </p>
                  </div>
                </div>

                <div className="is2-pills">
                  <span className="is2-pill">Total: {totalServices}</span>
                  <span className="is2-pill">Active: {activeServices}</span>
                  <span className="is2-pill">Inactive: {inactiveServices}</span>
                  {selectedCount > 0 && (
                    <span className="is2-pill">Selected: {selectedCount}</span>
                  )}
                </div>
              </div>
            </div>

            <div className="is2-controls">
              <div className="d-flex flex-column flex-md-row gap-2 gap-md-3 align-items-stretch align-items-md-center">
                <div className="is2-search flex-grow-1">
                  <i className="fas fa-search"></i>
                  <input
                    type="text"
                    placeholder="Search services..."
                    value={serviceSearch}
                    onChange={(e) => setServiceSearch(e.target.value)}
                  />
                </div>

                <div className="d-flex gap-2">
                  {selectedServices.length > 0 && (
                    <button
                      onClick={() => setConfirmDeleteServices(selectedServices)}
                      className="p-btn btn-lg p-btn-danger is2-btn"
                    >
                      <i className="fas fa-trash"></i> Delete Selected (
                      {selectedServices.length})
                    </button>
                  )}
                  <button
                    onClick={openAddServiceModal}
                    disabled={!isSuperAdmin}
                    className="btn btn-lg btn-success is2-btn is2-add-btn"
                  >
                    <i className="fas fa-plus-circle"></i> Add New Row
                  </button>
                </div>
              </div>
            </div>

            <div className="is2-table">
              <div className="table-responsive">
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th style={{ width: "40px" }} className="text-center">
                        <input
                          type="checkbox"
                          className="custom-checkbox"
                          checked={
                            selectedServices.length === filteredServices.length &&
                            filteredServices.length > 0
                          }
                          onChange={toggleSelectAll}
                        />
                      </th>
                      <th>Service Name</th>
                      <th>HSN / SAC Code</th>
                      <th>Status</th>
                      <th style={{ textAlign: "center" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredServices.map((service) => {
                      const isActive = getServiceStatus(service) === "active";

                      return (
                        <tr
                          key={service.id}
                          className={
                            selectedServices.includes(service.id)
                              ? "bg-indigo-50"
                              : ""
                          }
                        >
                          <td className="text-center">
                            <input
                              type="checkbox"
                              className="custom-checkbox"
                              checked={selectedServices.includes(service.id)}
                              onChange={() => toggleSelectRow(service.id)}
                            />
                          </td>
                          <td className="fw-bold text-dark">{service.name}</td>
                          <td className="fw-bold">{service.hsnCode}</td>
                          <td>
                            <div className="status-toggle-wrap">
                              <label className="status-switch">
                                <input
                                  type="checkbox"
                                  checked={isActive}
                                  onChange={() =>
                                    toggleServiceStatus(service.id)
                                  }
                                  disabled={!isSuperAdmin}
                                />
                                <span className="status-slider"></span>
                              </label>
                              <span
                                className={`status-text ${isActive ? "active" : "inactive"}`}
                              >
                                {isActive ? "Active" : "Inactive"}
                              </span>
                            </div>
                          </td>
                          <td>
                            <div className="d-flex justify-content-center gap-1">
                              <button
                                onClick={() => openEditServiceModal(service)}
                                disabled={!isSuperAdmin}
                                className="btn btn-sm btn-outline-success me-1"
                                title="Edit"
                              >
                                <i className="fas fa-edit"></i>
                              </button>
                              <button
                                onClick={() =>
                                  setConfirmDeleteServices([service.id])
                                }
                                disabled={!isSuperAdmin}
                                className="btn btn-sm btn-outline-danger me-1"
                                title="Delete"
                              >
                                <i className="fas fa-trash-alt"></i>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filteredServices.length === 0 && (
                  <div className="is2-empty">
                    <i className="fas fa-inbox"></i>
                    <h3>No Services Found</h3>
                    <p>Add your standard billing items above.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {isServiceModalOpen && (
        <div
          className="modal fade show d-block"
          style={{ backgroundColor: "rgba(0,0,0,0.7)", zIndex: 1100 }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content rounded-4 border-0 shadow-lg">
              <div className="modal-header is2-modal-head">
                <h5 className="modal-title fw-bold">
                  {editingServiceId ? "Edit Service" : "Add New Service"}
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={closeServiceModal}
                ></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label fw-bold text-success">
                    Service Name
                  </label>
                  <input
                    className="form-control modern-input"
                    value={serviceFormData.name}
                    onChange={(e) =>
                      handleServiceFormChange("name", e.target.value)
                    }
                    placeholder="Enter service name"
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold text-success">
                    HSN / SAC Code
                  </label>
                  <input
                    className="form-control modern-input"
                    value={serviceFormData.hsnCode}
                    onChange={(e) =>
                      handleServiceFormChange("hsnCode", e.target.value)
                    }
                    placeholder="Enter HSN code"
                  />
                </div>
              </div>
              <div className="modal-footer is2-modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={closeServiceModal}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-success is2-add-btn"
                  onClick={saveService}
                >
                  {editingServiceId ? "Update" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmationModal
        show={confirmDeleteServices.length > 0}
        onHide={() => setConfirmDeleteServices([])}
        onConfirm={handleBulkDeleteServices}
        title="Delete Services"
        message={`Are you sure you want to remove ${confirmDeleteServices.length} service(s) from the master database?`}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        confirmationText="delete"
      />
    </div>
  );
};

export default HsnTab;
