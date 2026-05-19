import React, { useState, useEffect } from "react";
import { showSuccess, showError } from "./ToastNotification";
import { apiGet, apiPost, apiPut } from "../utils/api";
import API_ENDPOINTS from "../utils/apiEndpoints";

const RequiredStar = () => <span className="text-danger ms-1">*</span>;

const getDateOnly = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const isDateWithinRange = (value, startDate, endDate) => {
  const targetDate = getDateOnly(value);
  const start = getDateOnly(startDate);
  const end = getDateOnly(endDate);

  if (!targetDate || !start || !end) return false;
  return targetDate >= start && targetDate <= end;
};

const getReferenceFieldMeta = (paymentMethod) => {
  if (paymentMethod === "Cash") {
    return {
      label: "Reference (Optional)",
      placeholder: "Leave blank if payment is made in cash",
    };
  }

  if (paymentMethod === "UPI") {
    return {
      label: "UPI Ref No. (Optional)",
      placeholder: "e.g. UPI/UTR ID",
    };
  }

  if (paymentMethod === "Cheque") {
    return {
      label: "Cheque No. (Optional)",
      placeholder: "e.g. 123456",
    };
  }

  return {
    label: "Transaction Ref No. (Optional)",
    placeholder: "e.g. UTR / TXN ID",
  };
};

const AddWithdrawal = ({ show, onClose, onSubmit, editingRecord = null }) => {
  const [selectedFinancialYear, setSelectedFinancialYear] = useState(
    localStorage.getItem("selectedFinancialYear") || "ALL",
  );
  const [financialYearRange, setFinancialYearRange] = useState(null);
  const [financialYearLoading, setFinancialYearLoading] = useState(false);
  const [formData, setFormData] = useState({
    withdrawalDate: "",
    amount: "",
    description: "",
    withdrawnTo: "Personal Account",
    withdrawnFrom: "Current Account",
    paymentMethod: "Bank Transfer",
    referenceNumber: "",
  });

  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (show?.show) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [show?.show]);

  useEffect(() => {
    if (editingRecord) {
      setFormData({
        withdrawalDate: editingRecord.withdrawalDate || "",
        amount:
          editingRecord.amount !== undefined
            ? String(editingRecord.amount)
            : "",
        description: editingRecord.description || "",
        withdrawnTo: editingRecord.withdrawnTo || "Personal Account",
        withdrawnFrom: editingRecord.withdrawnFrom || "Current Account",
        paymentMethod: editingRecord.paymentMethod || "Bank Transfer",
        referenceNumber: editingRecord.referenceNumber || "",
      });
    } else {
      setFormData({
        withdrawalDate: "",
        amount: "",
        description: "",
        withdrawnTo: "Personal Account",
        withdrawnFrom: "Current Account",
        paymentMethod: "Bank Transfer",
        referenceNumber: "",
      });
      setErrors({});
    }
  }, [editingRecord, show]);

  useEffect(() => {
    const handleFinancialYearSelectionChanged = (event) => {
      const selectedYear =
        event?.detail?.selectedFinancialYear ||
        localStorage.getItem("selectedFinancialYear") ||
        "ALL";
      setSelectedFinancialYear(selectedYear);
    };

    window.addEventListener(
      "financialYearSelectionChanged",
      handleFinancialYearSelectionChanged,
    );

    return () => {
      window.removeEventListener(
        "financialYearSelectionChanged",
        handleFinancialYearSelectionChanged,
      );
    };
  }, []);

  useEffect(() => {
    if (!show?.show) {
      setFinancialYearRange(null);
      setFinancialYearLoading(false);
      return;
    }

    if (!selectedFinancialYear || selectedFinancialYear === "ALL") {
      setFinancialYearRange(null);
      setFinancialYearLoading(false);
      return;
    }

    let mounted = true;

    const fetchFinancialYearRange = async () => {
      setFinancialYearLoading(true);
      try {
        const response = await apiGet(API_ENDPOINTS.YEARS.LIST);
        const yearsData = Array.isArray(response.data)
          ? response.data
          : response.data?.years || [];

        const matchedYear = yearsData.find((yearRecord) => {
          const value = yearRecord?.financialYear || yearRecord?.year || "";
          return value === selectedFinancialYear;
        });

        if (!mounted) return;

        if (matchedYear?.startDate && matchedYear?.endDate) {
          setFinancialYearRange({
            startDate: matchedYear.startDate,
            endDate: matchedYear.endDate,
          });
        } else {
          setFinancialYearRange(null);
        }
      } catch {
        if (mounted) {
          setFinancialYearRange(null);
        }
      } finally {
        if (mounted) {
          setFinancialYearLoading(false);
        }
      }
    };

    fetchFinancialYearRange();

    return () => {
      mounted = false;
    };
  }, [show?.show, selectedFinancialYear]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name === "amount") {
      const numericValue = value.replace(/[^0-9.]/g, "");
      setFormData((prev) => ({ ...prev, [name]: numericValue }));
    } else if (name === "paymentMethod") {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
        referenceNumber: value === "Cash" ? "" : prev.referenceNumber,
      }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!selectedFinancialYear || selectedFinancialYear === "ALL") {
      newErrors.withdrawalDate =
        "Please select a specific Financial Year before adding withdrawal";
    } else if (financialYearLoading) {
      newErrors.withdrawalDate = "Financial Year range is loading. Please wait.";
    } else if (!financialYearRange?.startDate || !financialYearRange?.endDate) {
      newErrors.withdrawalDate =
        "Selected Financial Year date range could not be verified";
    } else if (
      !formData.withdrawalDate ||
      formData.withdrawalDate.trim() === ""
    ) {
      newErrors.withdrawalDate = "Withdrawal Date is required";
    } else if (
      !isDateWithinRange(
        formData.withdrawalDate,
        financialYearRange.startDate,
        financialYearRange.endDate,
      )
    ) {
      newErrors.withdrawalDate = "Withdrawal date outside financial year";
    }
    if (!formData.amount || formData.amount.toString().trim() === "") {
      newErrors.amount = "Amount is required";
    } else if (parseFloat(formData.amount) <= 0) {
      newErrors.amount = "Amount must be greater than 0";
    }
    if (!formData.withdrawnTo || formData.withdrawnTo.trim() === "") {
      newErrors.withdrawnTo = "Withdraw Destination is required";
    }
    if (!formData.withdrawnFrom || formData.withdrawnFrom.trim() === "") {
      newErrors.withdrawnFrom = "Withdraw From is required";
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      const firstKey = Object.keys(newErrors)[0];
      showError(newErrors[firstKey] || "Please fix form errors before saving");
      return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!validateForm()) return;

    setSubmitting(true);
    try {
      const submitData = {
        ...formData,
        financialYear: editingRecord?.financialYear || selectedFinancialYear,
        amount: parseFloat(formData.amount) || 0,
      };

      if (editingRecord && !editingRecord.isViewMode) {
        const recordId = editingRecord._id || editingRecord.id;
        const { _id, id, ...cleanData } = submitData;
        await apiPut(
          API_ENDPOINTS.OWNER_WITHDRAWALS.UPDATE(recordId),
          cleanData,
        );
        showSuccess("Withdrawal entry updated successfully!");
      } else {
        await apiPost(API_ENDPOINTS.OWNER_WITHDRAWALS.CREATE, submitData);
        showSuccess("Withdrawal entry added successfully!");
      }

      onSubmit(submitData);
    } catch (error) {
      console.error("Error saving withdrawal entry:", error);
      showError(
        error.response?.data?.error ||
          error.response?.data?.message ||
          "Failed to save withdrawal entry",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!show?.show) return null;

  const referenceMeta = getReferenceFieldMeta(formData.paymentMethod);

  const isViewMode = editingRecord?.isViewMode === true;
  const modalTitle = isViewMode
    ? `View Withdrawal - ${formData.withdrawalDate || ""}`
    : editingRecord
      ? `Edit Withdrawal - ${formData.withdrawalDate || ""}`
      : "Add Withdrawal";

  return (
    <div
      className={`modal ${show?.show ? "show d-block" : "d-none"}`}
      tabIndex="-1"
      role="dialog"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <div className="modal-dialog modal-lg" role="document">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">
              <i className="fas fa-money-bill-transfer me-2 text-primary"></i>
              {modalTitle}
            </h5>
            <button
              type="button"
              className="btn-close"
              onClick={onClose}
            ></button>
          </div>

          <div className="modal-body">
            <form id="withdrawalForm" onSubmit={handleSubmit} noValidate>
              <div className="row">
                {/* Withdrawal Date */}
                <div className="col-md-6 mb-3">
                  <label htmlFor="withdrawalDate" className="form-label">
                    <i className="fas fa-calendar me-2 text-primary"></i>
                    Withdrawal Date<RequiredStar />
                  </label>
                  <input
                    type="date"
                    className={`form-control modern-input ${errors.withdrawalDate ? "is-invalid" : ""}`}
                    id="withdrawalDate"
                    name="withdrawalDate"
                    value={formData.withdrawalDate}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                  />
                  {errors.withdrawalDate && (
                    <div className="invalid-feedback d-block">
                      {errors.withdrawalDate}
                    </div>
                  )}
                </div>

                {/* Amount */}
                <div className="col-md-6 mb-3">
                  <label htmlFor="amount" className="form-label">
                    <i className="fas fa-rupee-sign me-2 text-primary"></i>
                    Amount<RequiredStar />
                  </label>
                  <div className="input-group">
                    <span className="input-group-text px-3">₹</span>
                    <input
                      type="text"
                      className={`form-control modern-input ${errors.amount ? "is-invalid" : ""}`}
                      id="amount"
                      name="amount"
                      value={formData.amount}
                      onChange={handleInputChange}
                      readOnly={isViewMode}
                      placeholder="0.00"
                    />
                  </div>
                  {errors.amount && (
                    <div className="invalid-feedback d-block">
                      {errors.amount}
                    </div>
                  )}
                </div>

                {/* Withdraw From (Source) */}
                <div className="col-md-6 mb-3">
                  <label htmlFor="withdrawnFrom" className="form-label">
                    <i className="fas fa-building me-2 text-primary"></i>
                    Withdraw From<RequiredStar />
                  </label>
                  <select
                    id="withdrawnFrom"
                    name="withdrawnFrom"
                    className={`form-select modern-input ${errors.withdrawnFrom ? "is-invalid" : ""}`}
                    value={formData.withdrawnFrom}
                    onChange={handleInputChange}
                    disabled={isViewMode}
                  >
                    <option value="Current Account">Current Account</option>
                    <option value="Cash Box">Cash Box</option>
                  </select>
                  {errors.withdrawnFrom && (
                    <div className="invalid-feedback d-block">
                      {errors.withdrawnFrom}
                    </div>
                  )}
                </div>

                {/* Withdraw To (Destination) */}
                <div className="col-md-6 mb-3">
                  <label htmlFor="withdrawnTo" className="form-label">
                    <i className="fas fa-user me-2 text-primary"></i>
                    Withdraw To<RequiredStar />
                  </label>
                  <select
                    id="withdrawnTo"
                    name="withdrawnTo"
                    className={`form-select modern-input ${errors.withdrawnTo ? "is-invalid" : ""}`}
                    value={formData.withdrawnTo}
                    onChange={handleInputChange}
                    disabled={isViewMode}
                  >
                    <option value="Personal Account">Personal Account</option>
                    <option value="Personal Savings">Personal Savings</option>
                    <option value="Family / Relative">Family / Relative</option>
                    <option value="Other">Other</option>
                  </select>
                  {errors.withdrawnTo && (
                    <div className="invalid-feedback d-block">
                      {errors.withdrawnTo}
                    </div>
                  )}
                </div>

                {/* Payment Method */}
                <div className="col-md-6 mb-3">
                  <label htmlFor="paymentMethod" className="form-label">
                    <i className="fas fa-credit-card me-2 text-primary"></i>
                    Payment Method
                  </label>
                  <select
                    id="paymentMethod"
                    name="paymentMethod"
                    className="form-select modern-input"
                    value={formData.paymentMethod}
                    onChange={handleInputChange}
                    disabled={isViewMode}
                  >
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cash">Cash</option>
                    <option value="UPI">UPI</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Card">Card</option>
                    <option value="IMPS">IMPS</option>
                    <option value="NEFT">NEFT</option>
                    <option value="RTGS">RTGS</option>
                    <option value="Zoho Payment Gateway">
                      Zoho Payment Gateway
                    </option>
                    <option value="Cashfree Payment Gateway">
                      Cashfree Payment Gateway
                    </option>
                    <option value="PayU Payment Gateway">
                      PayU Payment Gateway
                    </option>
                  </select>
                </div>

                {/* Reference Number */}
                <div className="col-md-6 mb-3">
                  <label htmlFor="referenceNumber" className="form-label">
                    <i className="fas fa-hashtag me-2 text-primary"></i>
                    {referenceMeta.label}
                  </label>
                  <input
                    type="text"
                    className="form-control modern-input"
                    id="referenceNumber"
                    name="referenceNumber"
                    value={formData.referenceNumber}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                    placeholder={referenceMeta.placeholder}
                  />
                </div>

                {/* Description */}
                <div className="col-md-12 mb-3">
                  <label htmlFor="description" className="form-label">
                    <i className="fas fa-align-left me-2 text-primary"></i>
                    Description / Notes
                  </label>
                  <textarea
                    className="form-control modern-input"
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                    rows={2}
                    placeholder="e.g. Withdrawn for personal expenses, family needs..."
                  />
                </div>
              </div>
            </form>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
            >
              <i className="fas fa-times me-2"></i>
              {isViewMode ? "Close" : "Cancel"}
            </button>
            {!isViewMode && (
              <button
                type="submit"
                form="withdrawalForm"
                className="btn btn-success"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <span
                      className="spinner-border spinner-border-sm me-2"
                      role="status"
                      aria-hidden="true"
                    ></span>
                    Saving...
                  </>
                ) : (
                  <>
                    <i className="fas fa-check me-2"></i>
                    {editingRecord ? "Update Withdrawal" : "Save Withdrawal"}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddWithdrawal;