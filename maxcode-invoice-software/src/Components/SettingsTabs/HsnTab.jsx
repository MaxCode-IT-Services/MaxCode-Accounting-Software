import React from "react";
import ConfirmationModal from "../ConfirmationModal";

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
  return (
    <div className="business-details-container">
      <div className="row g-4">
        <div className="col-12">
          <div className="card border-0 shadow-sm rounded-4 p-0 bg-white overflow-hidden">
            <div className="px-4 py-3 border-bottom bg-success">
              <h5 className="fw-bold mb-1 text-white">
                Service Master & HSN Codes
              </h5>
              <p className="text-uppercase text-white mb-0">
                Global inventory of services and tax codes
              </p>
            </div>

            <div className="premium-controls p-4 border-bottom m-0">
              <div className="premium-search-box">
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
                    className="p-btn p-btn-danger"
                  >
                    <i className="fas fa-trash"></i> Delete Selected (
                    {selectedServices.length})
                  </button>
                )}
                <button
                  onClick={openAddServiceModal}
                  disabled={!isSuperAdmin}
                  className="btn btn-primary"
                >
                  <i className="fas fa-plus-circle"></i> Add New Row
                </button>
              </div>
            </div>

            <div className="premium-table-container border-0 rounded-0">
              <div className="table-responsive">
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th style={{ width: "40px" }} className="text-center">
                        <input
                          type="checkbox"
                          className="custom-checkbox"
                          checked={
                            selectedServices.length ===
                              filteredServices.length &&
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
                                <i class="fas fa-edit"></i>
                              </button>
                              <button
                                onClick={() => removeService(service.id)}
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
                  <div className="empty-state">
                    <i className="fas fa-table"></i>
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
              <div className="modal-header">
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
                  <label className="form-label fw-bold">Service Name</label>
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
                  <label className="form-label fw-bold">HSN / SAC Code</label>
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
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-light text-white"
                  onClick={closeServiceModal}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
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
        title="Remove Services?"
        message={`Are you sure you want to remove ${confirmDeleteServices.length} service(s) from the master database?`}
        confirmText="Yes, Remove"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
};

export default HsnTab;
