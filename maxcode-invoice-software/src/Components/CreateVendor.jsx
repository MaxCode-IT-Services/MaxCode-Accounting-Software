import React, { useState, useEffect } from "react";
import Select from "react-select";
import { showSuccess, showError } from "./ToastNotification";
import { apiPost, apiPut } from "../utils/api";
import API_ENDPOINTS from "../utils/apiEndpoints";

const CreateVendor = ({ show, onClose, onSubmit, editingRecord = null }) => {
  const [formData, setFormData] = useState({
    vendorName: "",
    businessName: "",
    address: "",
    placeOfSupply: "",
    phoneNumber: "",
    email: "",
    gstin: "",
    noGSTIN: false,
  });

  const [errors, setErrors] = useState({});

  // GSTIN validation function (same pattern as Laravel code)
  const validateGSTIN = (gstin) => {
    if (!gstin || formData.noGSTIN) return true;

    // GSTIN format: 2 digits state code + 5 letters + 4 digits + 1 letter + 1 alphanumeric + Z + 1 alphanumeric
    const gstinPattern =
      /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[Z]{1}[0-9A-Z]{1}$/;

    if (!gstinPattern.test(gstin)) {
      return false;
    }

    // Validate checksum (optional but recommended)
    return validateGSTINChecksum(gstin);
  };

  // GSTIN checksum validation function
  const validateGSTINChecksum = (gstin) => {
    if (gstin.length !== 15) return false;

    const GSTIN_CODEPOINT_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let factor = 2;
    let sum = 0;

    for (let i = gstin.length - 2; i >= 0; i--) {
      let codePoint = GSTIN_CODEPOINT_CHARS.indexOf(gstin[i]);
      if (codePoint === -1) return false;

      let digit = factor * codePoint;
      factor = factor === 2 ? 1 : 2;
      digit = Math.floor(digit / 36) + (digit % 36);
      sum += digit;
    }

    sum = sum % 36;
    let checkCodePoint = (36 - sum) % 36;

    return gstin[gstin.length - 1] === GSTIN_CODEPOINT_CHARS[checkCodePoint];
  };

  useEffect(() => {
    if (show.show) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }

    // Cleanup function
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [show.show]);

  // Initialize form with editing record data or empty form for new vendor
  useEffect(() => {
    if (editingRecord) {
      setFormData({
        vendorName: editingRecord.vendorName || "",
        businessName: editingRecord.businessName || "",
        address: editingRecord.address || "",
        placeOfSupply: editingRecord.placeOfSupply || "",
        phoneNumber: editingRecord.phoneNumber || "",
        email: editingRecord.email || "",
        gstin: editingRecord.gstin || "",
        noGSTIN: editingRecord.noGSTIN || false,
      });
    } else {
      // Reset form with empty values for new vendor
      setFormData({
        vendorName: "",
        businessName: "",
        address: "",
        placeOfSupply: "",
        phoneNumber: "",
        email: "",
        gstin: "",
        noGSTIN: false,
      });
      setErrors({});
    }
  }, [editingRecord, show]);

  // Field names mapping for display
  const fieldNames = {
    vendorName: "Vendor Name",
    businessName: "Business Name",
    address: "Address",
    placeOfSupply: "Place of Supply",
    phoneNumber: "Phone Number",
    email: "Email ID",
    gstin: "GSTIN Number",
  };

  // Indian states list for Place of Supply dropdown
  const INDIAN_STATES = [
    { code: "01", name: "Jammu & Kashmir" },
    { code: "02", name: "Himachal Pradesh" },
    { code: "03", name: "Punjab" },
    { code: "04", name: "Chandigarh" },
    { code: "05", name: "Uttarakhand" },
    { code: "06", name: "Haryana" },
    { code: "07", name: "NCT of Delhi" },
    { code: "08", name: "Rajasthan" },
    { code: "09", name: "Uttar Pradesh" },
    { code: "10", name: "Bihar" },
    { code: "11", name: "Sikkim" },
    { code: "12", name: "Arunachal Pradesh" },
    { code: "13", name: "Nagaland" },
    { code: "14", name: "Manipur" },
    { code: "15", name: "Mizoram" },
    { code: "16", name: "Tripura" },
    { code: "17", name: "Meghalaya" },
    { code: "18", name: "Assam" },
    { code: "19", name: "West Bengal" },
    { code: "20", name: "Jharkhand" },
    { code: "21", name: "Odisha" },
    { code: "22", name: "Chhattisgarh" },
    { code: "23", name: "Madhya Pradesh" },
    { code: "24", name: "Gujarat" },
    { code: "25", name: "Daman and Diu" },
    { code: "26", name: "Dadra and Nagar Haveli" },
    { code: "27", name: "Maharashtra" },
    { code: "28", name: "Andhra Pradesh" },
    { code: "29", name: "Karnataka" },
    { code: "30", name: "Goa" },
    { code: "31", name: "Lakshadweep" },
    { code: "32", name: "Kerala" },
    { code: "33", name: "Tamil Nadu" },
    { code: "34", name: "Puducherry" },
    { code: "35", name: "Andaman and Nicobar Islands" },
    { code: "36", name: "Telangana" },
    { code: "37", name: "Andhra Pradesh" },
    { code: "38", name: "Ladakh" },
    { code: "97", name: "Other Territory" },
    { code: "99", name: "Other Country" },
  ];

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;

    if (name === "phoneNumber") {
      const numericValue = value.replace(/\D/g, "").slice(0, 10);
      setFormData((prev) => ({
        ...prev,
        [name]: numericValue,
      }));
    } else if (name === "gstin") {
      // Auto convert to uppercase like Laravel code
      const upperValue = value.toUpperCase();
      setFormData((prev) => ({
        ...prev,
        [name]: upperValue,
      }));

      // Real-time validation like Laravel code
      if (upperValue && !validateGSTIN(upperValue) && !formData.noGSTIN) {
        setErrors((prev) => ({
          ...prev,
          gstin: "Invalid GSTIN format. Example: 08KIBTK1234A1ZU",
        }));
      } else {
        setErrors((prev) => ({
          ...prev,
          gstin: "",
        }));
      }
    } else if (name === "noGSTIN") {
      setFormData((prev) => ({
        ...prev,
        [name]: checked,
        gstin: checked ? "" : prev.gstin,
      }));

      // Clear GSTIN error when checkbox is checked
      if (checked) {
        setErrors((prev) => ({
          ...prev,
          gstin: "",
        }));
      }
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

    // All fields are required except clientId which is removed
    const requiredFields = [
      "vendorName",
      "businessName",
      "address",
      "placeOfSupply",
      "phoneNumber",
      "email",
    ];

    // Add GSTIN to required fields only if noGSTIN is false
    if (!formData.noGSTIN) {
      requiredFields.push("gstin");
    }

    requiredFields.forEach((field) => {
      if (!formData[field] || formData[field].toString().trim() === "") {
        newErrors[field] = `${fieldNames[field]} is required`;
      }
    });

    // Email validation
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    // Phone number validation
    if (formData.phoneNumber) {
      if (!/^\d{10}$/.test(formData.phoneNumber)) {
        newErrors.phoneNumber = "Phone number must be exactly 10 digits";
      }
    }

    // GSTIN validation (if noGSTIN is false and GSTIN is provided)
    if (!formData.noGSTIN && formData.gstin && !validateGSTIN(formData.gstin)) {
      newErrors.gstin = "Please enter a valid GSTIN number";
    }

    setErrors(newErrors);

    // Find first error field and scroll to it
    if (Object.keys(newErrors).length > 0) {
      const firstErrorField = Object.keys(newErrors)[0];
      setTimeout(() => {
        scrollToField(firstErrorField);
      }, 100);

      // Show error message for first field only
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
          hasGSTIN: !formData.noGSTIN,
          status: editingRecord?.status || "Active",
        };

        if (editingRecord && !editingRecord.isViewMode) {
          // Update existing vendor via API
          const vendorId = editingRecord._id || editingRecord.id;
          // Exclude _id and id from update data to avoid MongoDB immutable field error
          const { _id, id, ...cleanData } = submitData;
          await apiPut(API_ENDPOINTS.VENDORS.UPDATE(vendorId), cleanData);
          showSuccess("Vendor updated successfully!");
        } else {
          // Create new vendor via API
          await apiPost(API_ENDPOINTS.VENDORS.CREATE, submitData);
          showSuccess("Vendor added successfully!");
        }

        onSubmit(submitData);
      } catch (error) {
        console.error("Error saving vendor:", error);

        // Handle uniqueness constraint errors (409 Conflict)
        if (error.response?.status === 409) {
          const errorMessage =
            error.response?.data?.error || "Duplicate entry found";

          // Map error messages to specific fields
          if (errorMessage.includes("Phone Number")) {
            setErrors((prev) => ({ ...prev, phoneNumber: errorMessage }));
            scrollToField("phoneNumber");
          } else if (errorMessage.includes("GSTIN")) {
            setErrors((prev) => ({ ...prev, gstin: errorMessage }));
            scrollToField("gstin");
          } else if (errorMessage.includes("Email")) {
            setErrors((prev) => ({ ...prev, email: errorMessage }));
            scrollToField("email");
          }

          showError(errorMessage);
        } else {
          showError(
            error.response?.data?.message ||
              error.response?.data?.error ||
              "Failed to save vendor. Please try again.",
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
      ? `View Vendor - ${editingRecord.vendorName}`
      : `Edit Vendor - ${editingRecord.vendorName}`
    : "Add New Vendor";

  const isViewMode = editingRecord?.isViewMode;

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
            <form id="vendorForm" onSubmit={handleSubmit} noValidate>
              <div className="row">
                {/* Vendor Name */}
                <div className="col-md-6 mb-3">
                  <label htmlFor="vendorName" className="form-label">
                    <i className="fas fa-user me-2 text-primary"></i>
                    Vendor Name <RequiredStar />
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.vendorName ? "is-invalid" : ""}`}
                    id="vendorName"
                    name="vendorName"
                    value={formData.vendorName}
                    onChange={handleInputChange}
                    placeholder="Enter Vendor Name"
                    readOnly={isViewMode}
                    onInput={(e) => {
                      e.target.value = e.target.value.replace(/\b\w/g, (char) =>
                        char.toUpperCase(),
                      );
                      handleInputChange(e);
                    }}
                  />
                  {errors.vendorName && (
                    <div className="invalid-feedback d-block">
                      {errors.vendorName}
                    </div>
                  )}
                </div>

                {/* Business Name */}
                <div className="col-md-6 mb-3">
                  <label htmlFor="businessName" className="form-label">
                    <i className="fas fa-building me-2 text-primary"></i>
                    Business Name <RequiredStar />
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.businessName ? "is-invalid" : ""}`}
                    id="businessName"
                    name="businessName"
                    value={formData.businessName}
                    onChange={handleInputChange}
                    placeholder="Enter Business Name"
                    readOnly={isViewMode}
                    onInput={(e) => {
                      e.target.value = e.target.value.replace(/\b\w/g, (char) =>
                        char.toUpperCase(),
                      );
                      handleInputChange(e);
                    }}
                  />
                  {errors.businessName && (
                    <div className="invalid-feedback d-block">
                      {errors.businessName}
                    </div>
                  )}
                </div>

                {/* Phone Number */}
                <div className="col-md-6 mb-3">
                  <label htmlFor="phoneNumber" className="form-label">
                    <i className="fas fa-phone me-2 text-primary"></i>
                    Phone Number <RequiredStar />
                  </label>
                  <div className="input-group">
                    <span className="input-group-text flag-india">
                      <img
                        src="https://flagcdn.com/w40/in.png"
                        alt="India"
                        className="flag-icon"
                      />
                      +91
                    </span>
                    <input
                      type="tel"
                      className={`form-control modern-input ${errors.phoneNumber ? "is-invalid" : ""}`}
                      id="phoneNumber"
                      name="phoneNumber"
                      value={formData.phoneNumber}
                      onChange={handleInputChange}
                      minLength="10"
                      maxLength="10"
                      placeholder="10-digit mobile number"
                      readOnly={isViewMode}
                    />
                  </div>
                  {errors.phoneNumber && (
                    <div className="invalid-feedback d-block mt-1">
                      {errors.phoneNumber}
                    </div>
                  )}
                </div>

                {/* Email ID */}
                <div className="col-md-6 mb-3">
                  <label htmlFor="email" className="form-label">
                    <i className="fas fa-envelope me-2 text-primary"></i>
                    Email ID <RequiredStar />
                  </label>
                  <input
                    type="email"
                    className={`form-control modern-input ${errors.email ? "is-invalid" : ""}`}
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="Enter Email Address"
                    readOnly={isViewMode}
                  />
                  {errors.email && (
                    <div className="invalid-feedback d-block">
                      {errors.email}
                    </div>
                  )}
                </div>

                {/* Address */}
                <div className="col-md-6 mb-3">
                  <label htmlFor="address" className="form-label">
                    <i className="fas fa-map-marker-alt me-2 text-primary"></i>
                    Address <RequiredStar />
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.address ? "is-invalid" : ""}`}
                    id="address"
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    placeholder="Enter Complete Address"
                    readOnly={isViewMode}
                    onInput={(e) => {
                      e.target.value = e.target.value.replace(/\b\w/g, (char) =>
                        char.toUpperCase(),
                      );
                      handleInputChange(e);
                    }}
                  />
                  {errors.address && (
                    <div className="invalid-feedback d-block">
                      {errors.address}
                    </div>
                  )}
                </div>

                {/* Place of Supply */}
                <div className="col-md-6 mb-3">
                  <label htmlFor="placeOfSupply" className="form-label">
                    <i className="fas fa-map-marked-alt me-2 text-primary"></i>
                    Place of Supply <RequiredStar />
                  </label>
                  <Select
                    inputId="placeOfSupply"
                    name="placeOfSupply"
                    classNamePrefix="react-select"
                    value={
                      INDIAN_STATES.map((s) => ({
                        value: `${s.name} (${s.code})`,
                        label: `${s.name} (${s.code})`,
                      })).find((opt) => opt.value === formData.placeOfSupply) ||
                      null
                    }
                    onChange={(selectedOption) => {
                      setFormData((prev) => ({
                        ...prev,
                        placeOfSupply: selectedOption
                          ? selectedOption.value
                          : "",
                      }));
                    }}
                    options={INDIAN_STATES.map((s) => ({
                      value: `${s.name} (${s.code})`,
                      label: `${s.name} (${s.code})`,
                    }))}
                    isDisabled={isViewMode}
                    isClearable
                    isSearchable
                    placeholder="Select Place of Supply"
                  />
                  {errors.placeOfSupply && (
                    <div className="invalid-feedback d-block">
                      {errors.placeOfSupply}
                    </div>
                  )}
                </div>

                {/* GSTIN Section - Updated with same design but proper validation */}
                <div className="col-md-6 mb-3">
                  <label htmlFor="gstin" className="form-label">
                    <i className="fas fa-file-invoice me-2 text-primary"></i>
                    GSTIN Number&nbsp;
                    {!formData.noGSTIN && <RequiredStar />}
                    {formData.noGSTIN && (
                      <span className="text-muted ms-2">(Not Applicable)</span>
                    )}
                  </label>

                  <div className="input-group">
                    {/* Left side - Simple Validation Icon */}
                    <span className="input-group-text gstin-icon-left">
                      {!formData.noGSTIN && formData.gstin && (
                        <>
                          {validateGSTIN(formData.gstin) ? (
                            <i className="fas fa-check-circle text-success"></i>
                          ) : (
                            <i className="fas fa-times-circle text-danger"></i>
                          )}
                        </>
                      )}
                      {formData.noGSTIN && (
                        <i className="fas fa-ban text-secondary"></i>
                      )}
                      {!formData.gstin && !formData.noGSTIN && (
                        <i className="fas fa-file-invoice text-muted"></i>
                      )}
                    </span>

                    {/* Middle - Input Field */}
                    <input
                      type="text"
                      className={`form-control modern-input ${errors.gstin ? "is-invalid" : ""} ${formData.noGSTIN ? "disabled-input" : ""}`}
                      id="gstin"
                      name="gstin"
                      value={formData.gstin}
                      onChange={handleInputChange}
                      placeholder={
                        formData.noGSTIN
                          ? "GSTIN not required"
                          : "22AAAAA0000A1Z5"
                      }
                      maxLength="15"
                      readOnly={isViewMode || formData.noGSTIN}
                      disabled={formData.noGSTIN}
                      style={{
                        textTransform: "uppercase",
                      }}
                    />

                    {/* Right side - No GST Checkbox */}
                    <span className="input-group-text no-gst-checkbox">
                      <input
                        className="form-check-input mt-0"
                        type="checkbox"
                        id="no_gstin"
                        name="noGSTIN"
                        checked={formData.noGSTIN}
                        onChange={handleInputChange}
                        disabled={isViewMode}
                        aria-label="No GST"
                      />
                      <label
                        htmlFor="no_gstin"
                        className="ms-1 mb-0 no-gst-label"
                      >
                        No GST
                      </label>
                    </span>
                  </div>

                  {/* Error message */}
                  {errors.gstin && (
                    <div className="invalid-feedback d-block">
                      {errors.gstin}
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
                form="vendorForm"
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
                    {editingRecord ? "Update Vendor" : "Save Vendor"}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .flag-india {
          background: linear-gradient(135deg, #ff9933, #ffffff, #138808);
          border: 2px solid #e9ecef;
          border-right: none;
          border-radius: 10px 0 0 10px;
          font-weight: 600;
          color: #333;
        }

        .flag-icon {
          width: 20px;
          height: 15px;
          margin-right: 8px;
          border-radius: 2px;
        }

        /* Simple GSTIN Icon Left */
        .gstin-icon-left {
          background-color: #f8f9fa;
          border: 2px solid #e9ecef;
          border-radius: 10px 0 0 10px;
          color: #6c757d;
        }

        .gstin-icon-left i {
          font-size: 1.1rem;
        }

        /* No GST Checkbox */
        .no-gst-checkbox {
          background-color: #f8f9fa;
          border: 2px solid #e9ecef;
          border-radius: 0 10px 10px 0;
          cursor: pointer;
        }

        .no-gst-checkbox .form-check-input {
          width: 18px;
          height: 18px;
          cursor: pointer;
        }

        .no-gst-checkbox .form-check-input:checked {
          background-color: #dc3545;
          border-color: #dc3545;
        }

        .no-gst-label {
          font-weight: 500;
          color: #495057;
          cursor: pointer;
          white-space: nowrap;
          font-size: 0.9rem;
        }

        .invalid-feedback.d-block {
          display: block !important;
          margin-top: 5px;
        }

        /* Override input group styles */
        .input-group > .form-control {
          border-radius: 0;
        }

        .input-group > .form-control:focus {
          z-index: 0;
        }

        /* Responsive adjustments */
        @media (max-width: 576px) {
          .no-gst-label {
            font-size: 0.8rem;
          }
        }
      `}</style>
    </div>
  );
};

export default CreateVendor;
