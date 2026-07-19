import React, { useState, useEffect } from "react";
import { showSuccess, showError } from "./ToastNotification";
import { apiGet, apiPost, apiPut } from "../utils/api";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { getUnifiedSelectStyles } from "../utils/reactSelectStyles";

const CreateCashBankEntry = ({
  show,
  onClose,
  onSubmit,
  editingRecord = null,
}) => {
  const [formData, setFormData] = useState({
    entryType: "",
    entryDate: "",
    sourceName: "",
    amount: "",
    description: "",
    referenceNumber: "",
    paymentMethod: "",
  });

  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (show) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [show]);

  // Initialize form with editing record data
  useEffect(() => {
    if (editingRecord) {
      setFormData({
        entryType: editingRecord.entryType || "",
        entryDate: editingRecord.entryDate || "",
        sourceName: editingRecord.sourceName || "",
        amount: editingRecord.amount || "",
        description: editingRecord.description || "",
        referenceNumber: editingRecord.referenceNumber || "",
        paymentMethod: editingRecord.paymentMethod || "",
      });
    } else {
      // Set today's date for new entries
      const today = new Date().toISOString().split("T")[0];
      setFormData({
        entryType: "",
        entryDate: today,
        sourceName: "",
        amount: "",
        description: "",
        referenceNumber: "",
        paymentMethod: "",
      });
      setErrors({});
    }
  }, [editingRecord, show]);

  // Field names mapping for display
  const fieldNames = {
    entryType: "Entry Type",
    entryDate: "Entry Date",
    sourceName: "Source / Entry Name",
    amount: "Amount",
    description: "Description",
    referenceNumber: "Reference Number",
    paymentMethod: "Payment Method",
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    if (name === "amount") {
      // Allow only numbers and decimal
      const numericValue = value.replace(/[^0-9.]/g, "");
      // Ensure only one decimal point
      const parts = numericValue.split(".");
      const sanitized =
        parts.length > 2
          ? parts[0] + "." + parts.slice(1).join("")
          : numericValue;
      setFormData((prev) => ({
        ...prev,
        [name]: sanitized,
      }));
    } else if (name === "sourceName") {
      setFormData((prev) => ({
        ...prev,
        [name]: value.replace(/\b\w/g, (char) => char.toUpperCase()),
      }));
    } else if (name === "referenceNumber") {
      setFormData((prev) => ({
        ...prev,
        [name]: value.toUpperCase(),
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
    }

    // Clear error when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: "",
      }));
    }
  };

  const scrollToField = (fieldId) => {
    const fieldElement = document.getElementById(fieldId);
    if (fieldElement) {
      fieldElement.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      fieldElement.focus();
    }
  };

  const validateForm = () => {
    const newErrors = {};

    const requiredFields = ["entryType", "entryDate", "sourceName", "amount"];

    requiredFields.forEach((field) => {
      if (!formData[field] || formData[field].toString().trim() === "") {
        newErrors[field] = `${fieldNames[field]} is required`;
      }
    });

    // Amount validation
    if (formData.amount) {
      const amountNum = parseFloat(formData.amount);
      if (isNaN(amountNum) || amountNum <= 0) {
        newErrors.amount = "Amount must be greater than 0";
      }
    }

    // Date validation
    if (formData.entryDate) {
      const dateObj = new Date(formData.entryDate);
      if (isNaN(dateObj.getTime())) {
        newErrors.entryDate = "Please enter a valid date";
      }
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      const firstErrorField = Object.keys(newErrors)[0];
      setTimeout(() => {
        scrollToField(firstErrorField);
      }, 100);
      const firstFieldName = fieldNames[firstErrorField];
      showError(`Please fill ${firstFieldName} field correctly`);
      return false;
    }

    return true;
  };

  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (validateForm()) {
      setSubmitting(true);
      try {
        const submitData = {
          ...formData,
          amount: parseFloat(formData.amount) || 0,
        };

        if (editingRecord && !editingRecord.isViewMode) {
          const entryId = editingRecord._id || editingRecord.id;
          const { _id, id, ...cleanData } = submitData;
          await apiPut(API_ENDPOINTS.CASH_BANK_BOOK.UPDATE(entryId), cleanData);
          showSuccess("Cash & Bank entry updated successfully!");
        } else {
          await apiPost(API_ENDPOINTS.CASH_BANK_BOOK.CREATE, submitData);
          showSuccess("Cash & Bank entry created successfully!");
        }

        onSubmit(submitData);
      } catch (error) {
        console.error("Error saving cash & bank entry:", error);

        if (error.response?.status === 409) {
          const errorMessage =
            error.response?.data?.error || "Duplicate entry found";
          showError(errorMessage);
        } else {
          showError(
            error.response?.data?.message ||
              error.response?.data?.error ||
              "Failed to save entry. Please try again.",
          );
        }
      } finally {
        setSubmitting(false);
      }
    }
  };

  const RequiredStar = () => <span className="text-danger">*</span>;

  if (!show) return null;

  const modalTitle = editingRecord
    ? editingRecord.isViewMode
      ? `View Cash & Bank Entry - ${editingRecord.entryNumber || ""}`
      : `Edit Cash & Bank Entry - ${editingRecord.entryNumber || ""}`
    : "Add New Cash & Bank Entry";

  const isViewMode = editingRecord?.isViewMode;

  const entryTypeSelectStyles = getUnifiedSelectStyles({
    hasError: Boolean(errors.entryType),
  });

  const paymentMethodSelectStyles = getUnifiedSelectStyles({
    hasError: Boolean(errors.paymentMethod),
  });

  const ENTRY_TYPE_OPTIONS = [
    { value: "Cash", label: "Cash" },
    { value: "Bank", label: "Bank" },
  ];

  const PAYMENT_METHOD_OPTIONS = [
    { value: "Cash", label: "Cash" },
    { value: "Bank Transfer", label: "Bank Transfer" },
    { value: "UPI", label: "UPI" },
    { value: "Cheque", label: "Cheque" },
    { value: "NEFT", label: "NEFT" },
    { value: "RTGS", label: "RTGS" },
    { value: "IMPS", label: "IMPS" },
    { value: "Card", label: "Card" },
  ];

  return (
    <div
      className={`modal ${show ? "show d-block" : "d-none"}`}
      tabIndex="-1"
      role="dialog"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <div className="modal-dialog modal-lg" role="document">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{modalTitle}</h5>
            <button
              type="button"
              className="btn-close"
              onClick={onClose}
            ></button>
          </div>

          <div className="modal-body">
            <form id="cashBankForm" onSubmit={handleSubmit} noValidate>
              <div className="row">
                {/* Entry Type */}
                <div className="col-md-6 mb-3">
                  <label htmlFor="entryType" className="form-label">
                    <i className="fas fa-exchange-alt me-2 text-primary"></i>
                    Entry Type <RequiredStar />
                  </label>
                  <select
                    id="entryType"
                    name="entryType"
                    className={`form-select modern-input ${errors.entryType ? "is-invalid" : ""}`}
                    value={formData.entryType}
                    onChange={handleInputChange}
                    disabled={isViewMode}
                  >
                    <option value="">Select Type</option>
                    <option value="Cash">Cash</option>
                    <option value="Bank">Bank</option>
                  </select>
                  {errors.entryType && (
                    <div className="invalid-feedback d-block">
                      {errors.entryType}
                    </div>
                  )}
                </div>

                {/* Entry Date */}
                <div className="col-md-6 mb-3">
                  <label htmlFor="entryDate" className="form-label">
                    <i className="fas fa-calendar-alt me-2 text-primary"></i>
                    Entry Date <RequiredStar />
                  </label>
                  <input
                    type="date"
                    className={`form-control modern-input ${errors.entryDate ? "is-invalid" : ""}`}
                    id="entryDate"
                    name="entryDate"
                    value={formData.entryDate}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                  />
                  {errors.entryDate && (
                    <div className="invalid-feedback d-block">
                      {errors.entryDate}
                    </div>
                  )}
                </div>

                {/* Source / Entry Name */}
                <div className="col-md-6 mb-3">
                  <label htmlFor="sourceName" className="form-label">
                    <i className="fas fa-tag me-2 text-primary"></i>
                    Source / Entry Name <RequiredStar />
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.sourceName ? "is-invalid" : ""}`}
                    id="sourceName"
                    name="sourceName"
                    value={formData.sourceName}
                    onChange={handleInputChange}
                    placeholder="e.g. Laptop Sale, Commission Received"
                    readOnly={isViewMode}
                  />
                  {errors.sourceName && (
                    <div className="invalid-feedback d-block">
                      {errors.sourceName}
                    </div>
                  )}
                </div>

                {/* Amount */}
                <div className="col-md-6 mb-3">
                  <label htmlFor="amount" className="form-label">
                    <i className="fas fa-rupee-sign me-2 text-primary"></i>
                    Amount (₹) <RequiredStar />
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.amount ? "is-invalid" : ""}`}
                    id="amount"
                    name="amount"
                    value={formData.amount}
                    onChange={handleInputChange}
                    placeholder="0.00"
                    readOnly={isViewMode}
                  />
                  {errors.amount && (
                    <div className="invalid-feedback d-block">
                      {errors.amount}
                    </div>
                  )}
                </div>

                {/* Payment Method */}
                <div className="col-md-6 mb-3">
                  <label htmlFor="paymentMethod" className="form-label">
                    <i className="fas fa-money-check me-2 text-primary"></i>
                    Payment Method
                  </label>
                  <select
                    id="paymentMethod"
                    name="paymentMethod"
                    className={`form-select modern-input ${errors.paymentMethod ? "is-invalid" : ""}`}
                    value={formData.paymentMethod}
                    onChange={handleInputChange}
                    disabled={isViewMode}
                  >
                    <option value="">Select Payment Method</option>
                    <option value="Cash">Cash</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="UPI">UPI</option>
                    <option value="Cheque">Cheque</option>
                    <option value="NEFT">NEFT</option>
                    <option value="RTGS">RTGS</option>
                    <option value="IMPS">IMPS</option>
                    <option value="Card">Card</option>
                  </select>
                  {errors.paymentMethod && (
                    <div className="invalid-feedback d-block">
                      {errors.paymentMethod}
                    </div>
                  )}
                </div>

                {/* Reference Number */}
                <div className="col-md-6 mb-3">
                  <label htmlFor="referenceNumber" className="form-label">
                    <i className="fas fa-hashtag me-2 text-primary"></i>
                    Reference Number
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.referenceNumber ? "is-invalid" : ""}`}
                    id="referenceNumber"
                    name="referenceNumber"
                    value={formData.referenceNumber}
                    onChange={handleInputChange}
                    placeholder="e.g. Cheque No, UPI Ref No"
                    readOnly={isViewMode}
                  />
                  {errors.referenceNumber && (
                    <div className="invalid-feedback d-block">
                      {errors.referenceNumber}
                    </div>
                  )}
                </div>

                {/* Description */}
                <div className="col-md-12 mb-3">
                  <label htmlFor="description" className="form-label">
                    <i className="fas fa-align-left me-2 text-primary"></i>
                    Description
                  </label>
                  <textarea
                    className={`form-control modern-input ${errors.description ? "is-invalid" : ""}`}
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    placeholder="Enter description or remarks"
                    rows="2"
                    readOnly={isViewMode}
                    style={{ resize: "vertical" }}
                  />
                  {errors.description && (
                    <div className="invalid-feedback d-block">
                      {errors.description}
                    </div>
                  )}
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
                form="cashBankForm"
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
                    {editingRecord ? "Update Entry" : "Save Entry"}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .invalid-feedback.d-block {
          display: block !important;
          margin-top: 5px;
        }
      `}</style>
    </div>
  );
};

export default CreateCashBankEntry;
