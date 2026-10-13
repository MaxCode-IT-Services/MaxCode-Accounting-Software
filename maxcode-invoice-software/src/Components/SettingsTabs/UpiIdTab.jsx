import React from "react";
import ConfirmationModal from "../ConfirmationModal";
import MasterTabStyle from "./MasterTabStyle";

const UpiIdTab = ({
  upiIds,
  upiSearch,
  setUpiSearch,
  selectedUpiIds,
  setConfirmDeleteUpiIds,
  openAddUpiModal,
  isSuperAdmin,
  filteredUpiIds,
  toggleSelectAllUpi,
  toggleSelectUpiRow,
  getUpiStatus,
  toggleUpiStatus,
  openEditUpiModal,
  isUpiModalOpen,
  editingUpiId,
  closeUpiModal,
  upiFormData,
  handleUpiFormChange,
  saveUpi,
  confirmDeleteUpiIds,
  handleBulkDeleteUpiIds,
}) => {
  const totalUpiIds = filteredUpiIds.length;
  const activeUpiIds = filteredUpiIds.filter(
    (upi) => getUpiStatus(upi) === "active",
  ).length;
  const inactiveUpiIds = totalUpiIds - activeUpiIds;
  const selectedCount = selectedUpiIds.length;

  const selectedUpiDetails = confirmDeleteUpiIds
    .map((id) => (upiIds || []).find((item) => item.id === id))
    .filter(Boolean);

  const deleteConfirmationMessage = (
    <>
      <span>
        Are you sure you want to delete {confirmDeleteUpiIds.length} UPI
        account(s)
        {selectedUpiDetails.length > 0 ? ": " : "?"}
      </span>
      {selectedUpiDetails.length > 0 && (
        <span>
          {selectedUpiDetails.map((item, index) => (
            <React.Fragment key={item.id || `${item.accountName}-${index}`}>
              {index > 0 ? ", " : ""}
              <span className="fw-bold text-dark">
                {item.accountName || "Unknown Account"} ({item.upiId || "N/A"})
              </span>
            </React.Fragment>
          ))}
          ?
        </span>
      )}
    </>
  );

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
                    <i className="fas fa-qrcode"></i>
                  </span>
                  <div>
                    <h5 className="is2-title">UPI ID Master</h5>
                    <p className="is2-subtitle">
                      Global list of payment UPI accounts
                    </p>
                  </div>
                </div>

                <div className="is2-pills">
                  <span className="is2-pill">Total: {totalUpiIds}</span>
                  <span className="is2-pill">Active: {activeUpiIds}</span>
                  <span className="is2-pill">Inactive: {inactiveUpiIds}</span>
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
                    placeholder="Search UPI accounts..."
                    value={upiSearch}
                    onChange={(e) => setUpiSearch(e.target.value)}
                  />
                </div>

                <div className="d-flex gap-2">
                  {selectedUpiIds.length > 0 && (
                    <button
                      onClick={() => setConfirmDeleteUpiIds(selectedUpiIds)}
                      className="p-btn btn-lg p-btn-danger is2-btn"
                    >
                      <i className="fas fa-trash"></i> Delete Selected (
                      {selectedUpiIds.length})
                    </button>
                  )}
                  <button
                    onClick={openAddUpiModal}
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
                            selectedUpiIds.length === filteredUpiIds.length &&
                            filteredUpiIds.length > 0
                          }
                          onChange={toggleSelectAllUpi}
                        />
                      </th>
                      <th>Account Name</th>
                      <th>UPI ID</th>
                      <th>Status</th>
                      <th style={{ textAlign: "center" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUpiIds.map((upi) => {
                      const isActive = getUpiStatus(upi) === "active";

                      return (
                        <tr
                          key={upi.id}
                          className={
                            selectedUpiIds.includes(upi.id)
                              ? "bg-indigo-50"
                              : ""
                          }
                        >
                          <td className="text-center">
                            <input
                              type="checkbox"
                              className="custom-checkbox"
                              checked={selectedUpiIds.includes(upi.id)}
                              onChange={() => toggleSelectUpiRow(upi.id)}
                            />
                          </td>
                          <td className="fw-bold text-dark">
                            {upi.accountName}
                          </td>
                          <td className="fw-bold">{upi.upiId}</td>
                          <td>
                            <div className="status-toggle-wrap">
                              <label className="status-switch">
                                <input
                                  type="checkbox"
                                  checked={isActive}
                                  onChange={() => toggleUpiStatus(upi.id)}
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
                                onClick={() => openEditUpiModal(upi)}
                                disabled={!isSuperAdmin}
                                className="btn btn-sm btn-outline-success me-1"
                                title="Edit"
                              >
                                <i className="fas fa-edit"></i>
                              </button>
                              <button
                                onClick={() => setConfirmDeleteUpiIds([upi.id])}
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
                {filteredUpiIds.length === 0 && (
                  <div className="is2-empty">
                    <i className="fas fa-inbox"></i>
                    <h3>No UPI Accounts Found</h3>
                    <p>Add UPI account details above.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {isUpiModalOpen && (
        <div
          className="modal fade show d-block"
          style={{ backgroundColor: "rgba(0,0,0,0.7)", zIndex: 1100 }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content rounded-4 border-0 shadow-lg">
              <div className="modal-header is2-modal-head">
                <h5 className="modal-title fw-bold">
                  {editingUpiId ? "Edit UPI Account" : "Add New UPI Account"}
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={closeUpiModal}
                ></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label fw-bold text-success">
                    Account Name
                  </label>
                  <input
                    className="form-control modern-input"
                    value={upiFormData.accountName}
                    onChange={(e) =>
                      handleUpiFormChange("accountName", e.target.value)
                    }
                    placeholder="Enter account name"
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold text-success">
                    UPI ID
                  </label>
                  <input
                    className="form-control modern-input"
                    value={upiFormData.upiId}
                    onChange={(e) =>
                      handleUpiFormChange("upiId", e.target.value)
                    }
                    placeholder="Enter UPI ID"
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold text-success">
                    Status
                  </label>
                  <select
                    className="form-select modern-input"
                    value={upiFormData.status}
                    onChange={(e) =>
                      handleUpiFormChange("status", e.target.value)
                    }
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer is2-modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={closeUpiModal}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-success is2-add-btn"
                  onClick={saveUpi}
                >
                  {editingUpiId ? "Update" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmationModal
        show={confirmDeleteUpiIds.length > 0}
        onHide={() => setConfirmDeleteUpiIds([])}
        onConfirm={handleBulkDeleteUpiIds}
        title="Delete UPI Accounts"
        message={deleteConfirmationMessage}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        confirmationText="delete"
      />
    </div>
  );
};

export default UpiIdTab;
