import React from "react";
import ConfirmationModal from "../ConfirmationModal";

const InterestedServiceTab = ({
  interestedServiceSearch,
  setInterestedServiceSearch,
  selectedInterestedServices,
  setConfirmDeleteInterestedServices,
  openAddInterestedServiceModal,
  isSuperAdmin,
  filteredInterestedServices,
  toggleSelectAll,
  toggleSelectRow,
  getInterestedServiceStatus,
  toggleInterestedServiceStatus,
  openEditInterestedServiceModal,
  removeInterestedService,
  isInterestedServiceModalOpen,
  editingInterestedServiceId,
  closeInterestedServiceModal,
  interestedServiceFormData,
  handleInterestedServiceFormChange,
  saveInterestedService,
  confirmDeleteInterestedServices,
  handleBulkDeleteInterestedServices,
}) => {
  const totalServices = filteredInterestedServices.length;
  const activeServices = filteredInterestedServices.filter(
    (service) => getInterestedServiceStatus(service) === "active",
  ).length;
  const inactiveServices = totalServices - activeServices;
  const selectedCount = selectedInterestedServices.length;

  return (
    <div className="business-details-container">
      <style>{`
        .is2-shell {
          border-radius: 24px;
          border: 1px solid #dcf2e5;
          background: linear-gradient(180deg, #fbfefc 0%, #ffffff 26%);
          box-shadow: 0 18px 36px rgba(25, 135, 84, 0.08);
          overflow: hidden;
        }

        .is2-topband {
          padding: 1.1rem 1.2rem;
          background: linear-gradient(135deg, #198754 0%, #146c43 100%);
          position: relative;
          isolation: isolate;
        }

        .is2-topband::after {
          content: "";
          position: absolute;
          inset: auto -45px -45px auto;
          width: 170px;
          height: 170px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.08);
          z-index: -1;
        }

        .is2-title-wrap {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .is2-icon {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.2);
          color: #fff;
          font-size: 1.05rem;
        }

        .is2-title {
          color: #fff;
          margin: 0;
          font-size: 1.08rem;
          font-weight: 800;
          letter-spacing: 0.2px;
        }

        .is2-subtitle {
          margin: 0.1rem 0 0;
          color: rgba(255, 255, 255, 0.88);
          font-size: 0.74rem;
          text-transform: uppercase;
          letter-spacing: 0.7px;
        }

        .is2-pills {
          display: flex;
          gap: 0.45rem;
          flex-wrap: wrap;
        }

        .is2-pill {
          background: #fff;
          border: 1px solid #d7efe1;
          color: #146c43;
          border-radius: 999px;
          padding: 0.35rem 0.75rem;
          font-weight: 700;
          font-size: 0.74rem;
        }

        .is2-controls {
          padding: 1rem 1.2rem;
          border-bottom: 1px solid #eaf6ef;
          background: #ffffff;
        }

        .is2-search {
          position: relative;
        }

        .is2-search i {
          position: absolute;
          top: 50%;
          left: 13px;
          transform: translateY(-50%);
          color: #198754;
          font-size: 0.9rem;
          pointer-events: none;
        }

         .is2-search input {
          width: 100%;
          border-radius: 12px;
          border: 2px solid #027231;
          background: #f9fdfa;
          padding: 0.64rem 0.8rem 0.64rem 2.15rem;
          font-size: 0.93rem;
          color: #1f3a2b;
          transition: all 0.2s ease;
        }

        .is2-search input:focus {
          outline: none;
          border-color: #fa0000;
          background: #ffffff;
        }

        .is2-btn {
          border-radius: 10px;
          font-weight: 700;
          white-space: nowrap;
        }

        .is2-add-btn {
          box-shadow: 0 10px 18px rgba(25, 135, 84, 0.22);
        }

        .is2-table .premium-table thead {
          background: linear-gradient(135deg, #007026 0, #09a98d 100%);
          border-bottom: 1px solid #e1f1e7;
          color: #fff;
          font-weight: 700;
        }

        .is2-table .premium-table tbody tr {
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }

        .is2-table .premium-table tbody tr:hover {
          background-color: #f1f5f9;
          box-shadow: inset 0 0 0 1px #edf8f1;
        }

        .is2-empty {
          margin: 1rem 0 0.5rem;
          border: 1px dashed #cae8d7;
          border-radius: 14px;
          background: #fbfefc;
          padding: 2rem 1rem;
          text-align: center;
        }

        .is2-empty i {
          font-size: 1.9rem;
          color: #8abf9f;
          margin-bottom: 0.5rem;
        }

        .is2-empty h3 {
          font-size: 1rem;
          margin-bottom: 0.3rem;
          color: #1f4632;
        }

        .is2-empty p {
          margin: 0;
          color: #6a8f79;
          font-size: 0.88rem;
        }

        .is2-modal-head {
          background: linear-gradient(135deg, #198754 0%, #146c43 100%);
          color: #fff;
          border-top-left-radius: 1rem;
          border-top-right-radius: 1rem;
          border-bottom: none;
        }

        .is2-modal-head .btn-close {
          filter: invert(1);
          opacity: 0.95;
        }

        .is2-modal-footer {
          border-top: 1px solid #edf7f1;
        }

        @media (max-width: 991.98px) {
          .is2-pills {
            margin-top: 0.35rem;
          }
        }

        @media (max-width: 767.98px) {
          .is2-topband,
          .is2-controls,
          .is2-table {
            padding-left: 0.85rem;
            padding-right: 0.85rem;
          }

          .is2-title {
            font-size: 1rem;
          }
        }
      `}</style>

      <div className="row g-4">
        <div className="col-12">
          <div className="is2-shell">
            <div className="is2-topband">
              <div className="d-flex flex-column flex-lg-row justify-content-between align-items-start align-items-lg-center gap-3">
                <div className="is2-title-wrap">
                  <span className="is2-icon">
                    <i className="fas fa-star"></i>
                  </span>
                  <div>
                    <h5 className="is2-title">Interested Services Manager</h5>
                    <p className="is2-subtitle">
                      Manage services for lead interested service dropdown
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
                    value={interestedServiceSearch}
                    onChange={(e) => setInterestedServiceSearch(e.target.value)}
                  />
                </div>

                <div className="d-flex gap-2">
                  {selectedInterestedServices.length > 0 && (
                    <button
                      onClick={() =>
                        setConfirmDeleteInterestedServices(
                          selectedInterestedServices,
                        )
                      }
                      className="p-btn btn-lg p-btn-danger is2-btn"
                    >
                      <i className="fas fa-trash"></i> Delete Selected (
                      {selectedInterestedServices.length})
                    </button>
                  )}
                  <button
                    onClick={openAddInterestedServiceModal}
                    disabled={!isSuperAdmin}
                    className="btn  btn-lg btn-success is2-btn is2-add-btn"
                  >
                    <i className="fas fa-plus-circle"></i> Add New Service
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
                            selectedInterestedServices.length ===
                              filteredInterestedServices.length &&
                            filteredInterestedServices.length > 0
                          }
                          onChange={toggleSelectAll}
                        />
                      </th>
                      <th>Service Name</th>
                      <th>Status</th>
                      <th style={{ textAlign: "center" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInterestedServices.map((service) => {
                      const isActive =
                        getInterestedServiceStatus(service) === "active";

                      return (
                        <tr
                          key={service.id}
                          className={
                            selectedInterestedServices.includes(service.id)
                              ? "bg-indigo-50"
                              : ""
                          }
                        >
                          <td className="text-center">
                            <input
                              type="checkbox"
                              className="custom-checkbox"
                              checked={selectedInterestedServices.includes(
                                service.id,
                              )}
                              onChange={() => toggleSelectRow(service.id)}
                            />
                          </td>
                          <td className="fw-bold text-dark">{service.name}</td>
                          <td>
                            <div className="status-toggle-wrap">
                              <label className="status-switch">
                                <input
                                  type="checkbox"
                                  checked={isActive}
                                  onChange={() =>
                                    toggleInterestedServiceStatus(service.id)
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
                                onClick={() =>
                                  openEditInterestedServiceModal(service)
                                }
                                disabled={!isSuperAdmin}
                                className="btn btn-sm btn-outline-success me-1"
                                title="Edit"
                              >
                                <i class="fas fa-edit"></i>
                              </button>
                              <button
                                onClick={() =>
                                  removeInterestedService(service.id)
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
                {filteredInterestedServices.length === 0 && (
                  <div className="is2-empty">
                    <i className="fas fa-inbox"></i>
                    <h3>No Services Found</h3>
                    <p>Add interested services to get started.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {isInterestedServiceModalOpen && (
        <div
          className="modal fade show d-block"
          style={{ backgroundColor: "rgba(0,0,0,0.7)", zIndex: 1100 }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content rounded-4 border-0 shadow-lg">
              <div className="modal-header is2-modal-head">
                <h5 className="modal-title fw-bold">
                  {editingInterestedServiceId
                    ? "Edit Service"
                    : "Add New Service"}
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={closeInterestedServiceModal}
                ></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label fw-bold text-success">
                    Service Name
                  </label>
                  <input
                    className="form-control modern-input"
                    placeholder="e.g., Website Development"
                    value={interestedServiceFormData.name}
                    onChange={(e) =>
                      handleInterestedServiceFormChange("name", e.target.value)
                    }
                  />
                </div>
              </div>
              <div className="modal-footer is2-modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={closeInterestedServiceModal}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-success is2-add-btn"
                  onClick={saveInterestedService}
                >
                  {editingInterestedServiceId ? "Update" : "Add"} Service
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmDeleteInterestedServices.length > 0 && (
        <ConfirmationModal
          title="Delete Services"
          message={`Are you sure you want to delete ${confirmDeleteInterestedServices.length} service(s)? This action cannot be undone.`}
          onConfirm={handleBulkDeleteInterestedServices}
          onCancel={() => setConfirmDeleteInterestedServices([])}
          isDangerous={true}
        />
      )}
    </div>
  );
};

export default InterestedServiceTab;
