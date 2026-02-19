import React, { useState, useEffect } from "react";
import { showSuccess, showError } from "./ToastNotification";
import { apiPost, apiPut } from "../utils/api";
import API_ENDPOINTS from "../utils/apiEndpoints";

const CreateYear = ({
  show,
  onClose,
  onSubmit,
  editingRecord = null,
  existingYears = [],
}) => {
  const [formData, setFormData] = useState({
    financialYear: "",
    startDate: "",
    endDate: "",
    taxPercentage: 18,
    invoiceFormat: "",
    selfInvoiceFormat: "",
    description: "",
    isDefault: false,
    status: "Active",
    openingCash: "",
    openingBank: "",
  });

  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (show) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }

    // Cleanup function
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [show]);

  // Initialize form with editing record data or empty form for new year
  useEffect(() => {
    if (editingRecord) {
      setFormData({
        financialYear: editingRecord.financialYear || "",
        startDate: editingRecord.startDate || "",
        endDate: editingRecord.endDate || "",
        taxPercentage: editingRecord.taxPercentage || 18,
        invoiceFormat: editingRecord.invoiceFormat || "",
        selfInvoiceFormat: editingRecord.selfInvoiceFormat || "",
        description: editingRecord.description || "",
        isDefault: editingRecord.isDefault || false,
        status: editingRecord.status || "Active",
        openingCash: editingRecord.openingCash || "",
        openingBank: editingRecord.openingBank || "",
      });
    } else {
      // Reset form with empty values for new year
      setFormData({
        financialYear: "",
        startDate: "",
        endDate: "",
        taxPercentage: 18,
        invoiceFormat: "",
        selfInvoiceFormat: "",
        description: "",
        isDefault: false,
        status: "Active",
        openingCash: "",
        openingBank: "",
      });
      setErrors({});
    }
  }, [editingRecord, show]);

  // Auto-calculate financial year based on start date
  useEffect(() => {
    if (formData.startDate && !editingRecord) {
      const startDate = new Date(formData.startDate);
      const startYear = startDate.getFullYear();
      const endYear = startYear + 1;
      const financialYear = `${startYear}-${endYear.toString().slice(-2)}`;

      setFormData((prev) => ({
        ...prev,
        financialYear: financialYear,
      }));

      // Auto-suggest invoice format based on financial year
      if (!formData.invoiceFormat) {
        setFormData((prev) => ({
          ...prev,
          invoiceFormat: `MC/${financialYear.replace("-", "-")}/0001`,
        }));
      }
    }
  }, [formData.startDate, editingRecord]);

  // Auto-set end date based on start date (March 31 of next year)
  useEffect(() => {
    if (formData.startDate && !formData.endDate && !editingRecord) {
      const startDate = new Date(formData.startDate);
      const endYear = startDate.getFullYear() + 1;
      setFormData((prev) => ({
        ...prev,
        endDate: `${endYear}-03-31`,
      }));
    }
  }, [formData.startDate, formData.endDate, editingRecord]);

  // Field names mapping for display
  const fieldNames = {
    financialYear: "Financial Year",
    startDate: "Start Date",
    endDate: "End Date",
    taxPercentage: "Tax Percentage",
    invoiceFormat: "Invoice Format",
    selfInvoiceFormat: "Self Invoice Format",
    description: "Description",
    status: "Status",
    openingCash: "Opening Cash Balance",
    openingBank: "Opening Bank Balance",
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;

    if (type === "checkbox") {
      setFormData((prev) => ({
        ...prev,
        [name]: checked,
      }));
    } else if (name === "taxPercentage") {
      // Allow only numbers and decimal point
      const numericValue = value.replace(/[^0-9.]/g, "");
      setFormData((prev) => ({
        ...prev,
        [name]: numericValue === "" ? "" : parseFloat(numericValue) || 0,
      }));
    } else if (name === "openingCash" || name === "openingBank") {
      // Allow only numbers and decimal point for balance fields
      const numericValue = value.replace(/[^0-9.]/g, "");
      setFormData((prev) => ({
        ...prev,
        [name]: numericValue === "" ? "" : numericValue,
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

    // Required fields
    const requiredFields = [
      "financialYear",
      "startDate",
      "endDate",
      "taxPercentage",
      "invoiceFormat",
      "selfInvoiceFormat",
    ];

    requiredFields.forEach((field) => {
      if (!formData[field] && formData[field] !== 0) {
        newErrors[field] = `${fieldNames[field]} is required`;
      }
    });

    // Validate financial year format (YYYY-YY)
    if (
      formData.financialYear &&
      !/^\d{4}-\d{2}$/.test(formData.financialYear)
    ) {
      newErrors.financialYear =
        "Financial Year must be in format YYYY-YY (e.g., 2024-25)";
    }

    // Check for duplicate financial year
    if (formData.financialYear && !editingRecord) {
      if (existingYears.includes(formData.financialYear)) {
        newErrors.financialYear = "This financial year already exists";
      }
    } else if (formData.financialYear && editingRecord) {
      // When editing, check if the new financial year is different and already exists
      if (
        formData.financialYear !== editingRecord.financialYear &&
        existingYears.includes(formData.financialYear)
      ) {
        newErrors.financialYear = "This financial year already exists";
      }
    }

    // Validate dates
    if (formData.startDate && formData.endDate) {
      const start = new Date(formData.startDate);
      const end = new Date(formData.endDate);

      if (start >= end) {
        newErrors.endDate = "End date must be after start date";
      }

      // Check if financial year is exactly 1 year (approximately)
      const diffTime = Math.abs(end - start);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays < 360 || diffDays > 370) {
        newErrors.endDate =
          "Financial year should be approximately 365 days (Apr 1 to Mar 31)";
      }

      // Check if start date is April 1
      if (start.getMonth() !== 3 || start.getDate() !== 1) {
        newErrors.startDate = "Financial year should start from April 1";
      }

      // Check if end date is March 31
      if (end.getMonth() !== 2 || end.getDate() !== 31) {
        newErrors.endDate = "Financial year should end on March 31";
      }
    }

    // Validate tax percentage - now as input field
    if (formData.taxPercentage === "" || formData.taxPercentage === null) {
      newErrors.taxPercentage = "Tax percentage is required";
    } else {
      const taxValue = parseFloat(formData.taxPercentage);
      if (isNaN(taxValue)) {
        newErrors.taxPercentage = "Please enter a valid number";
      } else if (taxValue < 0 || taxValue > 100) {
        newErrors.taxPercentage = "Tax percentage must be between 0 and 100";
      }
    }

    // Validate invoice format - optional validation
    if (formData.invoiceFormat && formData.invoiceFormat.length < 3) {
      newErrors.invoiceFormat = "Invoice format must be at least 3 characters";
    }

    if (formData.selfInvoiceFormat && formData.selfInvoiceFormat.length < 3) {
      newErrors.selfInvoiceFormat =
        "Self invoice format must be at least 3 characters";
    }

    setErrors(newErrors);

    // Find first error field and scroll to it
    if (Object.keys(newErrors).length > 0) {
      const firstErrorField = Object.keys(newErrors)[0];
      setTimeout(() => {
        scrollToField(firstErrorField);
      }, 100);

      // Show error message for first field only
      const firstFieldName = fieldNames[firstErrorField] || firstErrorField;
      showError(`Please fill ${firstFieldName} field correctly`);

      return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (editingRecord?.isViewMode) return;

    if (validateForm()) {
      setSubmitting(true);
      try {
        const submitData = {
          ...formData,
          taxPercentage: Number(formData.taxPercentage),
        };

        if (editingRecord && !editingRecord.isViewMode) {
          const yearId = editingRecord._id || editingRecord.id;
          const { _id, id, ...cleanData } = submitData;
          await apiPut(API_ENDPOINTS.YEARS.UPDATE(yearId), cleanData);
          showSuccess("Financial Year updated successfully!");
        } else {
          await apiPost(API_ENDPOINTS.YEARS.CREATE, submitData);
          showSuccess("Financial Year added successfully!");
        }

        onSubmit(submitData);
      } catch (error) {
        console.error("Error saving financial year:", error);

        if (error.response?.status === 409) {
          const errorMessage =
            error.response?.data?.error || "Duplicate entry found";

          if (errorMessage.includes("Financial Year")) {
            setErrors((prev) => ({ ...prev, financialYear: errorMessage }));
            scrollToField("financialYear");
          } else if (errorMessage.includes("Invoice Format")) {
            setErrors((prev) => ({ ...prev, invoiceFormat: errorMessage }));
            scrollToField("invoiceFormat");
          } else if (errorMessage.includes("Self Invoice Format")) {
            setErrors((prev) => ({ ...prev, selfInvoiceFormat: errorMessage }));
            scrollToField("selfInvoiceFormat");
          }

          showError(errorMessage);
        } else {
          showError(
            error.response?.data?.message ||
              error.response?.data?.error ||
              "Failed to save financial year. Please try again.",
          );
        }
      } finally {
        setSubmitting(false);
      }
    }
  };

  // Add red star for required fields
  const RequiredStar = () => <span className="text-danger">*</span>;

  if (!show) return null;

  // Determine modal title and mode
  const modalTitle = editingRecord
    ? editingRecord.isViewMode
      ? `View Financial Year - ${editingRecord.financialYear}`
      : `Edit Financial Year - ${editingRecord.financialYear}`
    : "Add New Financial Year";

  const isViewMode = editingRecord?.isViewMode;

  // Example invoice formats for placeholder
  const invoiceFormatExamples = [
    "MC/25-26/0001",
    "INV/2024-25/001",
    "FY-2024-25/{number}",
    "RAJS/24-25/INV-001",
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
            <form id="yearForm" onSubmit={handleSubmit} noValidate>
              <div className="row">
                {/* Financial Year */}
                <div className="col-md-6 mb-3">
                  <label htmlFor="financialYear" className="form-label">
                    <i className="fas fa-calendar-alt me-2 text-primary"></i>
                    Financial Year <RequiredStar />
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.financialYear ? "is-invalid" : ""} ${!editingRecord && formData.startDate ? "bg-light" : ""}`}
                    id="financialYear"
                    name="financialYear"
                    value={formData.financialYear}
                    onChange={handleInputChange}
                    placeholder="YYYY-YY (e.g., 2024-25)"
                    readOnly={
                      isViewMode || (!editingRecord && formData.startDate)
                    }
                    maxLength="7"
                  />
                  {!editingRecord && formData.startDate && (
                    <small className="text-muted">
                      Auto-generated from start date
                    </small>
                  )}
                  {errors.financialYear && (
                    <div className="invalid-feedback d-block">
                      {errors.financialYear}
                    </div>
                  )}
                </div>

                {/* Status */}
                <div className="col-md-6 mb-3">
                  <label htmlFor="status" className="form-label">
                    <i className="fas fa-toggle-on me-2 text-primary"></i>
                    Status
                  </label>
                  <select
                    className={`form-control modern-input ${errors.status ? "is-invalid" : ""}`}
                    id="status"
                    name="status"
                    value={formData.status}
                    onChange={handleInputChange}
                    disabled={isViewMode}
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>

                {/* Start Date */}
                <div className="col-md-6 mb-3">
                  <label htmlFor="startDate" className="form-label">
                    <i className="fas fa-play me-2 text-primary"></i>
                    Start Date <RequiredStar />
                  </label>
                  <input
                    type="date"
                    className={`form-control modern-input ${errors.startDate ? "is-invalid" : ""}`}
                    id="startDate"
                    name="startDate"
                    value={formData.startDate}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                  />
                  {errors.startDate && (
                    <div className="invalid-feedback d-block">
                      {errors.startDate}
                    </div>
                  )}
                </div>

                {/* End Date */}
                <div className="col-md-6 mb-3">
                  <label htmlFor="endDate" className="form-label">
                    <i className="fas fa-stop me-2 text-primary"></i>
                    End Date <RequiredStar />
                  </label>
                  <input
                    type="date"
                    className={`form-control modern-input ${errors.endDate ? "is-invalid" : ""}`}
                    id="endDate"
                    name="endDate"
                    value={formData.endDate}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                  />
                  {errors.endDate && (
                    <div className="invalid-feedback d-block">
                      {errors.endDate}
                    </div>
                  )}
                </div>

                {/* Tax Percentage - Input Field */}
                <div className="col-md-6 mb-3">
                  <label htmlFor="taxPercentage" className="form-label">
                    <i className="fas fa-percent me-2 text-primary"></i>
                    Tax Percentage (%) <RequiredStar />
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.taxPercentage ? "is-invalid" : ""}`}
                    id="taxPercentage"
                    name="taxPercentage"
                    value={formData.taxPercentage}
                    onChange={handleInputChange}
                    placeholder="Enter tax percentage (0-100)"
                    readOnly={isViewMode}
                  />
                  <small className="text-muted">
                    Enter any value between 0 and 100
                  </small>
                  {errors.taxPercentage && (
                    <div className="invalid-feedback d-block">
                      {errors.taxPercentage}
                    </div>
                  )}
                </div>

                {/* Invoice Format - Input Field */}
                <div className="col-md-6 mb-3">
                  <label htmlFor="invoiceFormat" className="form-label">
                    <i className="fas fa-file-invoice me-2 text-primary"></i>
                    Invoice Format <RequiredStar />
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.invoiceFormat ? "is-invalid" : ""}`}
                    id="invoiceFormat"
                    name="invoiceFormat"
                    value={formData.invoiceFormat}
                    onChange={handleInputChange}
                    placeholder="e.g., MC/25-26/0001"
                    readOnly={isViewMode}
                  />
                  {errors.invoiceFormat && (
                    <div className="invalid-feedback d-block">
                      {errors.invoiceFormat}
                    </div>
                  )}
                </div>

                {/* Self Invoice Format - Input Field */}
                <div className="col-md-6 mb-3">
                  <label htmlFor="selfInvoiceFormat" className="form-label">
                    <i className="fas fa-file-invoice me-2 text-primary"></i>
                    Self Invoice Format <RequiredStar />
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.selfInvoiceFormat ? "is-invalid" : ""}`}
                    id="selfInvoiceFormat"
                    name="selfInvoiceFormat"
                    value={formData.selfInvoiceFormat}
                    onChange={handleInputChange}
                    placeholder="e.g., MC/RCM/25-26/0001"
                    readOnly={isViewMode}
                  />
                  {errors.selfInvoiceFormat && (
                    <div className="invalid-feedback d-block">
                      {errors.selfInvoiceFormat}
                    </div>
                  )}
                </div>

                {/* Opening Cash Balance */}
                <div className="col-md-6 mb-3">
                  <label htmlFor="openingCash" className="form-label">
                    <i className="fas fa-hand-holding-usd me-2 text-success"></i>
                    Opening Cash Balance
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.openingCash ? "is-invalid" : ""}`}
                    id="openingCash"
                    name="openingCash"
                    value={formData.openingCash}
                    onChange={handleInputChange}
                    placeholder="Enter opening cash (optional)"
                    readOnly={isViewMode}
                  />
                  <small className="text-muted">
                    Cash balance at start of financial year
                  </small>
                  {errors.openingCash && (
                    <div className="invalid-feedback d-block">
                      {errors.openingCash}
                    </div>
                  )}
                </div>

                {/* Opening Bank Balance */}
                <div className="col-md-6 mb-3">
                  <label htmlFor="openingBank" className="form-label">
                    <i className="fas fa-building-columns me-2 text-primary"></i>
                    Opening Bank Balance
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.openingBank ? "is-invalid" : ""}`}
                    id="openingBank"
                    name="openingBank"
                    value={formData.openingBank}
                    onChange={handleInputChange}
                    placeholder="Enter opening bank amount (optional)"
                    readOnly={isViewMode}
                  />
                  <small className="text-muted">
                    Bank balance at start of financial year
                  </small>
                  {errors.openingBank && (
                    <div className="invalid-feedback d-block">
                      {errors.openingBank}
                    </div>
                  )}
                </div>

                {/* Description */}
                <div className="col-12 mb-3">
                  <label htmlFor="description" className="form-label">
                    <i className="fas fa-align-left me-2 text-primary"></i>
                    Description
                  </label>
                  <textarea
                    className="form-control modern-input"
                    id="description"
                    name="description"
                    rows="1"
                    value={formData.description}
                    onChange={handleInputChange}
                    placeholder="Enter description (optional)"
                    readOnly={isViewMode}
                  ></textarea>
                </div>

                {/* Default Year Checkbox */}
                <div className="col-12 mb-3">
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="isDefault"
                      name="isDefault"
                      checked={formData.isDefault}
                      onChange={handleInputChange}
                      disabled={isViewMode}
                    />
                    <label className="form-check-label" htmlFor="isDefault">
                      <i className="fas fa-star text-warning me-2"></i>
                      Set as Default Financial Year
                    </label>
                  </div>
                  <small className="text-muted">
                    The default financial year will be used for all new
                    transactions and invoices
                  </small>
                </div>

                {/* Info Alert */}
                <div className="col-12">
                  <div className="alert alert-info" role="alert">
                    <i className="fas fa-info-circle me-2"></i>
                    <strong>Note:</strong> You can enter any invoice format you
                    want and any tax percentage between 0-100.
                  </div>
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
                form="yearForm"
                className="btn btn-success"
                disabled={submitting}
              >
                <i className="fas fa-check me-2"></i>
                {submitting
                  ? "Saving..."
                  : editingRecord
                    ? "Update Financial Year"
                    : "Save Financial Year"}
              </button>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .form-check-input {
          width: 18px;
          height: 18px;
          cursor: pointer;
        }

        .form-check-input:checked {
          background-color: #ffc107;
          border-color: #ffc107;
        }

        .form-check-label {
          font-weight: 500;
          color: #495057;
          cursor: pointer;
        }

        .invalid-feedback.d-block {
          display: block !important;
          margin-top: 5px;
        }

        /* Responsive adjustments */
        @media (max-width: 576px) {
          .modal-dialog {
            margin: 0.5rem;
          }
        }
      `}</style>
    </div>
  );
};

export default CreateYear;
