import React from "react";
import Select from "react-select";
import ConfirmationModal from "../ConfirmationModal";
import MasterTabStyle from "./MasterTabStyle";
import { getUnifiedSelectStyles } from "../../utils/reactSelectStyles";

const formatAmount = (value) =>
  `₹${Number(value || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatPercent = (value) => {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed)) return "0";
  return String(parsed);
};

// A fee is "Nil" whenever it is switched off or has no percentage.
const isFeeNil = (enabled, percent) => !enabled || !(Number(percent) > 0);

const describeFee = (enabled, percent, cap, minAmount) => {
  if (isFeeNil(enabled, percent)) return "Nil";
  const percentLabel = `${formatPercent(percent)}%`;
  const capLabel = Number(cap) > 0 ? ` (max ${formatAmount(cap)})` : "";
  const thresholdLabel =
    Number(minAmount) > 0 ? ` above ${formatAmount(minAmount)}` : "";
  return `${percentLabel}${capLabel}${thresholdLabel}`;
};
// Keeps only digits and at most one decimal point, so the field behaves as a
// numeric entry without the spinner/scroll quirks of input[type=number].
const sanitizeNumericInput = (value) => {
  const cleaned = String(value ?? "").replace(/[^0-9.]/g, "");
  const parts = cleaned.split(".");
  return parts.length > 1 ? `${parts[0]}.${parts.slice(1).join("")}` : cleaned;
};

const CHARGE_MODE_OPTIONS = [
  {
    value: "extra",
    label: "Extra from Customer (charged on top of the amount)",
  },
  {
    value: "included",
    label: "Included in Amount (deducted from the amount received)",
  },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const PaymentMethodsTab = ({
  paymentMethodSearch,
  setPaymentMethodSearch,
  selectedPaymentMethods,
  setConfirmDeletePaymentMethods,
  openAddPaymentMethodModal,
  isSuperAdmin,
  filteredPaymentMethods,
  toggleSelectAllPaymentMethods,
  toggleSelectPaymentMethodRow,
  getPaymentMethodStatus,
  togglePaymentMethodStatus,
  openEditPaymentMethodModal,
  isPaymentMethodModalOpen,
  editingPaymentMethodId,
  closePaymentMethodModal,
  paymentMethodFormData,
  handlePaymentMethodFormChange,
  savePaymentMethod,
  confirmDeletePaymentMethods,
  handleBulkDeletePaymentMethods,
  chargeVersion,
  openChargeHistoryModal,
  isChargeHistoryOpen,
  chargeHistory,
  isChargeHistoryLoading,
  onCloseChargeHistory,
  onSelectChargeVersion,
  viewedChargeVersion,
  viewedChargeRows,
  onReturnToCurrentVersion,
}) => {
  // While an old version is selected the table shows that version's rates and
  // every editing action is disabled, so history can never be mistaken for the
  // live configuration.
  const isViewingHistory = Boolean(viewedChargeVersion);
  const tableRows = isViewingHistory ? viewedChargeRows : filteredPaymentMethods;
  const tableIsReadOnly = isViewingHistory || !isSuperAdmin;

  const totalMethods = tableRows.length;
  const activeMethods = tableRows.filter(
    (method) => getPaymentMethodStatus(method) === "active",
  ).length;
  const inactiveMethods = totalMethods - activeMethods;
  const selectedCount = selectedPaymentMethods.length;

  const selectedDetails = confirmDeletePaymentMethods
    .map((id) => (filteredPaymentMethods || []).find((item) => item.id === id))
    .filter(Boolean);

  const deleteConfirmationMessage = (
    <>
      <span>
        Are you sure you want to delete {confirmDeletePaymentMethods.length}{" "}
        payment method(s)
        {selectedDetails.length > 0 ? ": " : "?"}
      </span>
      {selectedDetails.length > 0 && (
        <span>
          {selectedDetails.map((item, index) => (
            <React.Fragment key={item.id || `method-${index}`}>
              {index > 0 ? ", " : ""}
              <span className="fw-bold text-dark">{item.name || "Unnamed"}</span>
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
                    <i className="fas fa-credit-card"></i>
                  </span>
                  <div>
                    <h5 className="is2-title">Payment Methods Charge Master</h5>
                    <p className="is2-subtitle">
                      Gateway processing fee & MDR per payment method
                    </p>
                  </div>
                </div>

                <div className="is2-pills">
                  {isViewingHistory ? (
                    <>
                      <span className="is2-pill is2-pill-warn">
                        Viewing: {viewedChargeVersion}
                      </span>
                      <button
                        type="button"
                        className="is2-pill is2-pill-btn"
                        onClick={onReturnToCurrentVersion}
                      >
                        <i className="fas fa-undo me-1"></i> Back to Current
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="is2-pill">
                        Version: {chargeVersion || "V1.0.0"}
                      </span>
                      <button
                        type="button"
                        className="is2-pill is2-pill-btn"
                        onClick={openChargeHistoryModal}
                        title="View past pricing versions"
                      >
                        <i className="fas fa-history me-1"></i> History
                      </button>
                    </>
                  )}
                  <span className="is2-pill">Total: {totalMethods}</span>
                  <span className="is2-pill">Active: {activeMethods}</span>
                  <span className="is2-pill">Inactive: {inactiveMethods}</span>
                  {!isViewingHistory && selectedCount > 0 && (
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
                    placeholder="Search payment methods..."
                    value={paymentMethodSearch}
                    disabled={isViewingHistory}
                    onChange={(e) => setPaymentMethodSearch(e.target.value)}
                  />
                </div>

                <div className="d-flex gap-2">
                  {!isViewingHistory && selectedPaymentMethods.length > 0 && (
                    <button
                      onClick={() =>
                        setConfirmDeletePaymentMethods(selectedPaymentMethods)
                      }
                      className="p-btn btn-lg p-btn-danger is2-btn"
                    >
                      <i className="fas fa-trash"></i> Delete Selected (
                      {selectedPaymentMethods.length})
                    </button>
                  )}
                  <button
                    onClick={openAddPaymentMethodModal}
                    disabled={tableIsReadOnly}
                    className="btn btn-lg btn-success is2-btn is2-add-btn"
                  >
                    <i className="fas fa-plus-circle"></i> Add Payment Method
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
                            !isViewingHistory &&
                            selectedPaymentMethods.length ===
                              filteredPaymentMethods.length &&
                            filteredPaymentMethods.length > 0
                          }
                          disabled={isViewingHistory}
                          onChange={toggleSelectAllPaymentMethods}
                        />
                      </th>
                      <th>Payment Method</th>
                      <th>Processing Fee</th>
                      <th>MDR</th>
                      <th>Charge Mode</th>
                      <th>Status</th>
                      <th style={{ textAlign: "center" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((method) => {
                      const isActive =
                        getPaymentMethodStatus(method) === "active";
                      const processingNil = isFeeNil(
                        method.processingFeeEnabled,
                        method.processingFeePercent,
                      );
                      const mdrNil = isFeeNil(
                        method.mdrEnabled,
                        method.mdrPercent,
                      );

                      return (
                        <tr
                          key={method.id}
                          className={
                            selectedPaymentMethods.includes(method.id)
                              ? "bg-indigo-50"
                              : ""
                          }
                        >
                          <td className="text-center">
                            <input
                              type="checkbox"
                              className="custom-checkbox"
                              checked={
                                !isViewingHistory &&
                                selectedPaymentMethods.includes(method.id)
                              }
                              disabled={isViewingHistory}
                              onChange={() =>
                                toggleSelectPaymentMethodRow(method.id)
                              }
                            />
                          </td>
                          <td className="fw-bold text-dark">{method.name}</td>
                          <td>
                            <span
                              className={
                                processingNil
                                  ? "text-muted"
                                  : "fw-bold text-dark"
                              }
                            >
                              {describeFee(
                                method.processingFeeEnabled,
                                method.processingFeePercent,
                                method.processingFeeCap,
                                method.processingFeeMinAmount,
                              )}
                            </span>
                          </td>
                          <td>
                            <span
                              className={
                                mdrNil ? "text-muted" : "fw-bold text-dark"
                              }
                            >
                              {describeFee(
                                method.mdrEnabled,
                                method.mdrPercent,
                                method.mdrCap,
                                method.mdrMinAmount,
                              )}
                            </span>
                          </td>
                          <td>
                            <span
                              className={`badge ${
                                method.chargeMode === "included"
                                  ? "bg-info-subtle text-info-emphasis"
                                  : "bg-warning-subtle text-warning-emphasis"
                              }`}
                            >
                              {method.chargeMode === "included"
                                ? "Included in Amount"
                                : "Extra from Customer"}
                            </span>
                          </td>
                          <td>
                            <div className="status-toggle-wrap">
                              <label className="status-switch">
                                <input
                                  type="checkbox"
                                  checked={isActive}
                                  onChange={() =>
                                    togglePaymentMethodStatus(method.id)
                                  }
                                  disabled={tableIsReadOnly}
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
                                  openEditPaymentMethodModal(method)
                                }
                                disabled={tableIsReadOnly}
                                className="btn btn-sm btn-outline-success me-1"
                                title="Edit"
                              >
                                <i className="fas fa-edit"></i>
                              </button>
                              <button
                                onClick={() =>
                                  setConfirmDeletePaymentMethods([method.id])
                                }
                                disabled={tableIsReadOnly}
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
                {tableRows.length === 0 && (
                  <div className="is2-empty">
                    <i className="fas fa-inbox"></i>
                    <h3>No Payment Methods Found</h3>
                    <p>
                      {isViewingHistory
                        ? `No methods recorded in ${viewedChargeVersion}.`
                        : "Add a payment method and its charges above."}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {isPaymentMethodModalOpen && (
        <div
          className="modal fade show d-block"
          style={{ backgroundColor: "rgba(0,0,0,0.7)", zIndex: 1100 }}
        >
          <div className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
            <div className="modal-content rounded-4 border-0 shadow-lg">
              <div className="modal-header is2-modal-head">
                <h5 className="modal-title fw-bold">
                  {editingPaymentMethodId
                    ? "Edit Payment Method"
                    : "Add Payment Method"}
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={closePaymentMethodModal}
                ></button>
              </div>
              <div className="modal-body">
                <div className="row g-3 mb-3">
                  <div className="col-md-6">
                    <label className="form-label fw-bold">
                      Payment Method Name
                    </label>
                    <input
                      className="form-control modern-input"
                      value={paymentMethodFormData.name}
                      onChange={(e) =>
                        handlePaymentMethodFormChange("name", e.target.value)
                      }
                      placeholder="e.g. UPI, Credit Card, Debit Card"
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-bold">Charge Mode</label>
                    <Select
                      classNamePrefix="react-select"
                      styles={getUnifiedSelectStyles()}
                      value={
                        CHARGE_MODE_OPTIONS.find(
                          (option) =>
                            option.value ===
                            paymentMethodFormData.chargeMode,
                        ) || null
                      }
                      onChange={(option) =>
                        handlePaymentMethodFormChange(
                          "chargeMode",
                          option?.value || "extra",
                        )
                      }
                      options={CHARGE_MODE_OPTIONS}
                      isClearable={false}
                      isSearchable
                      placeholder="Select charge mode"
                    />
                  </div>
                </div>

                {/* Processing Fee */}
                <div
                  className={`pm-fee-card ${paymentMethodFormData.processingFeeEnabled ? "is-on" : "is-off"}`}
                >
                  <div className="pm-fee-head">
                    <span className="pm-fee-icon">
                      <i className="fas fa-percent"></i>
                    </span>
                    <span className="pm-fee-title">Processing Fee</span>
                    <div className="form-check form-switch mb-0 pm-fee-switch">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        role="switch"
                        id="processingFeeEnabled"
                        checked={paymentMethodFormData.processingFeeEnabled}
                        onChange={(e) =>
                          handlePaymentMethodFormChange(
                            "processingFeeEnabled",
                            e.target.checked,
                          )
                        }
                      />
                      <label
                        className="form-check-label pm-fee-state"
                        htmlFor="processingFeeEnabled"
                      >
                        {paymentMethodFormData.processingFeeEnabled
                          ? "Applied"
                          : "Nil"}
                      </label>
                    </div>
                  </div>
                  <div className="row g-2">
                    <div className="col-md-4">
                      <div className="input-group">
                        <input
                          type="text"
                          inputMode="decimal"
                          className="form-control modern-input"
                          value={paymentMethodFormData.processingFeePercent}
                          disabled={!paymentMethodFormData.processingFeeEnabled}
                          onChange={(e) =>
                            handlePaymentMethodFormChange(
                              "processingFeePercent",
                              sanitizeNumericInput(e.target.value),
                            )
                          }
                          placeholder="Percentage"
                        />
                        <span className="input-group-text px-3">%</span>
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="input-group">
                        <span className="input-group-text px-3">₹</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          className="form-control modern-input"
                          value={paymentMethodFormData.processingFeeCap}
                          disabled={!paymentMethodFormData.processingFeeEnabled}
                          onChange={(e) =>
                            handlePaymentMethodFormChange(
                              "processingFeeCap",
                              sanitizeNumericInput(e.target.value),
                            )
                          }
                          placeholder="Max cap"
                        />
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="input-group">
                        <span className="input-group-text px-3">₹</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          className="form-control modern-input"
                          value={paymentMethodFormData.processingFeeMinAmount}
                          disabled={!paymentMethodFormData.processingFeeEnabled}
                          onChange={(e) =>
                            handlePaymentMethodFormChange(
                              "processingFeeMinAmount",
                              sanitizeNumericInput(e.target.value),
                            )
                          }
                          placeholder="Apply above"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* MDR */}
                <div
                  className={`pm-fee-card ${paymentMethodFormData.mdrEnabled ? "is-on" : "is-off"}`}
                >
                  <div className="pm-fee-head">
                    <span className="pm-fee-icon">
                      <i className="fas fa-university"></i>
                    </span>
                    <span className="pm-fee-title">MDR (Merchant Discount Rate)</span>
                    <div className="form-check form-switch mb-0 pm-fee-switch">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        role="switch"
                        id="mdrEnabled"
                        checked={paymentMethodFormData.mdrEnabled}
                        onChange={(e) =>
                          handlePaymentMethodFormChange(
                            "mdrEnabled",
                            e.target.checked,
                          )
                        }
                      />
                      <label
                        className="form-check-label pm-fee-state"
                        htmlFor="mdrEnabled"
                      >
                        {paymentMethodFormData.mdrEnabled ? "Applied" : "Nil"}
                      </label>
                    </div>
                  </div>
                  <div className="row g-2">
                    <div className="col-md-4">
                      <div className="input-group">
                        <input
                          type="text"
                          inputMode="decimal"
                          className="form-control modern-input"
                          value={paymentMethodFormData.mdrPercent}
                          disabled={!paymentMethodFormData.mdrEnabled}
                          onChange={(e) =>
                            handlePaymentMethodFormChange(
                              "mdrPercent",
                              sanitizeNumericInput(e.target.value),
                            )
                          }
                          placeholder="Percentage"
                        />
                        <span className="input-group-text px-3">%</span>
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="input-group">
                        <span className="input-group-text px-3">₹</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          className="form-control modern-input"
                          value={paymentMethodFormData.mdrCap}
                          disabled={!paymentMethodFormData.mdrEnabled}
                          onChange={(e) =>
                            handlePaymentMethodFormChange(
                              "mdrCap",
                              sanitizeNumericInput(e.target.value),
                            )
                          }
                          placeholder="Max cap"
                        />
                      </div>
                    </div>
                    <div className="col-md-4">
                      <div className="input-group">
                        <span className="input-group-text px-3">₹</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          className="form-control modern-input"
                          value={paymentMethodFormData.mdrMinAmount}
                          disabled={!paymentMethodFormData.mdrEnabled}
                          onChange={(e) =>
                            handlePaymentMethodFormChange(
                              "mdrMinAmount",
                              sanitizeNumericInput(e.target.value),
                            )
                          }
                          placeholder="Apply above"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mb-0">
                  <label className="form-label fw-bold">Status</label>
                  <Select
                    classNamePrefix="react-select"
                    styles={getUnifiedSelectStyles()}
                    value={
                      STATUS_OPTIONS.find(
                        (option) =>
                          option.value === paymentMethodFormData.status,
                      ) || null
                    }
                    onChange={(option) =>
                      handlePaymentMethodFormChange(
                        "status",
                        option?.value || "active",
                      )
                    }
                    options={STATUS_OPTIONS}
                    isClearable={false}
                    isSearchable
                    placeholder="Select status"
                  />
                </div>
              </div>
              <div className="modal-footer is2-modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={closePaymentMethodModal}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-success is2-add-btn"
                  onClick={savePaymentMethod}
                >
                  {editingPaymentMethodId ? "Update" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmationModal
        show={confirmDeletePaymentMethods.length > 0}
        onHide={() => setConfirmDeletePaymentMethods([])}
        onConfirm={handleBulkDeletePaymentMethods}
        title="Delete Payment Methods"
        message={deleteConfirmationMessage}
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
        confirmationText="delete"
      />

      {isChargeHistoryOpen && (
        <div
          className="modal fade show d-block"
          style={{ backgroundColor: "rgba(0,0,0,0.7)", zIndex: 1100 }}
        >
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content rounded-4 border-0 shadow-lg">
              <div className="modal-header is2-modal-head">
                <h5 className="modal-title fw-bold">
                  <i className="fas fa-history me-2"></i>
                  Payment Charges — Version History
                </h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={onCloseChargeHistory}
                ></button>
              </div>
              <div className="modal-body">
                {isChargeHistoryLoading ? (
                  <p className="text-muted mb-0">Loading versions…</p>
                ) : chargeHistory.length === 0 ? (
                  <p className="text-muted mb-0">
                    No version history yet. A new version is created whenever
                    the charges change.
                  </p>
                ) : (
                  <>
                    <p className="text-muted small mb-3">
                      Select a version to view its charges in the table.
                    </p>
                    <div className="pm-version-list">
                      {chargeHistory.map((entry) => {
                        const isCurrent = entry.version === chargeVersion;
                        const isSelected =
                          entry.version === viewedChargeVersion;

                        return (
                          <button
                            type="button"
                            key={entry.version}
                            className={`pm-version-item ${isSelected ? "is-selected" : ""}`}
                            onClick={() => onSelectChargeVersion(entry.version)}
                          >
                            <span className="pm-version-main">
                              <span className="pm-version-tag">
                                {entry.version}
                              </span>
                              {isCurrent && (
                                <span className="badge bg-success">
                                  Current
                                </span>
                              )}
                            </span>
                            <span className="pm-version-meta">
                              {(entry.charges || []).length} method
                              {(entry.charges || []).length === 1 ? "" : "s"}
                              {entry.createdAt
                                ? ` · ${new Date(entry.createdAt).toLocaleDateString("en-IN")}`
                                : ""}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
              <div className="modal-footer is2-modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={onCloseChargeHistory}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentMethodsTab;
