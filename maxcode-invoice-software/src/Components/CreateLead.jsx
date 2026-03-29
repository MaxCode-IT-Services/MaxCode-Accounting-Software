import React, { useMemo, useState, useEffect } from "react";
import Select from "react-select";
import { showError } from "./ToastNotification";
import { getUnifiedSelectStyles } from "../utils/reactSelectStyles";
import { apiGet } from "../utils/api";
import API_ENDPOINTS from "../utils/apiEndpoints";

const LEAD_STATUS_OPTIONS = [
  "New",
  "Contacted",
  "Qualified",
  "Proposal Sent",
  "Success",
  "Lost",
];

const PRIORITY_OPTIONS = ["High", "Medium", "Low"];

const LEAD_SOURCE_OPTIONS = [
  "Call",
  "WhatsApp",
  "Website",
  "Instagram",
  "Facebook",
  "Reference",
  "Google",
  "Walk-In",
  "Other",
];

const CONTACT_BY_OPTIONS = [
  "Call",
  "WhatsApp",
  "Email",
  "Call + WhatsApp",
  "Call + Email",
  "WhatsApp + Email",
  "Call + WhatsApp + Email",
];

const CreateLead = ({ show, onClose, onSubmit, editingRecord = null }) => {
  const [formData, setFormData] = useState({
    leadName: "",
    businessName: "",
    phoneNumber: "",
    whatsappNumber: "",
    interestedService: "",
    leadSource: "",
    contactBy: "",
    priority: "Medium",
    leadStatus: "New",
    email: "",
    address: "",
    lastContactedDate: "",
    followUpDate: "",
    expectedBudget: "",
    notes: "",
    status: "Active",
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [interestedServices, setInterestedServices] = useState([]);
  const [loadingServices, setLoadingServices] = useState(false);

  // Load interested services from backend
  useEffect(() => {
    const loadInterestedServices = async () => {
      try {
        setLoadingServices(true);
        const response = await apiGet(API_ENDPOINTS.BUSINESS_SETTINGS.GET);
        const services = response?.data?.settings?.interestedServices || [];

        // Keep only active services with valid names from backend
        const activeServices = services
          .filter((s) => s.status === "active" && s?.name)
          .map((s) => String(s.name).trim())
          .filter(Boolean);

        setInterestedServices(activeServices);
      } catch (error) {
        console.error("Failed to load interested services:", error);
        setInterestedServices([]);
      } finally {
        setLoadingServices(false);
      }
    };

    loadInterestedServices();
  }, []);

  const isViewMode = editingRecord?.isViewMode;

  const modalTitle = editingRecord
    ? editingRecord.isViewMode
      ? `View Lead - ${editingRecord.leadName || "Lead"}`
      : `Edit Lead - ${editingRecord.leadName || "Lead"}`
    : "Add New Lead";

  const fieldNames = {
    leadName: "Name",
    businessName: "Business Name",
    phoneNumber: "Phone Number",
    interestedService: "Interested Service / Product",
    leadSource: "Lead Source",
    priority: "Priority",
    leadStatus: "Lead Status",
    contactBy: "Contact By",
  };

  const selectStyles = useMemo(
    () => ({
      interestedService: getUnifiedSelectStyles({
        hasError: Boolean(errors.interestedService),
      }),
      leadSource: getUnifiedSelectStyles({
        hasError: Boolean(errors.leadSource),
      }),
      contactBy: getUnifiedSelectStyles({
        hasError: Boolean(errors.contactBy),
      }),
      priority: getUnifiedSelectStyles({ hasError: Boolean(errors.priority) }),
      leadStatus: getUnifiedSelectStyles({
        hasError: Boolean(errors.leadStatus),
      }),
    }),
    [errors],
  );

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    const nextValue =
      name === "phoneNumber" || name === "whatsappNumber"
        ? value.replace(/\D/g, "").slice(0, 10)
        : value;

    setFormData((prev) => ({ ...prev, [name]: nextValue }));

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const validateForm = () => {
    const required = [
      "leadName",
      "businessName",
      "phoneNumber",
      "interestedService",
      "leadSource",
      "priority",
      "leadStatus",
    ];

    const nextErrors = {};

    required.forEach((field) => {
      if (!String(formData[field] || "").trim()) {
        nextErrors[field] = `${fieldNames[field]} is required`;
      }
    });

    if (formData.phoneNumber && !/^\d{10}$/.test(formData.phoneNumber)) {
      nextErrors.phoneNumber = "Phone number must be exactly 10 digits";
    }

    if (formData.whatsappNumber && !/^\d{10}$/.test(formData.whatsappNumber)) {
      nextErrors.whatsappNumber = "WhatsApp number must be exactly 10 digits";
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      nextErrors.email = "Please enter a valid email address";
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      const firstField = Object.keys(nextErrors)[0];
      showError(
        `Please fill ${fieldNames[firstField] || firstField} correctly`,
      );
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
      await onSubmit({
        ...formData,
        id: editingRecord?.id || Date.now(),
        createdDate: editingRecord?.createdDate || new Date().toISOString(),
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!show) return null;

  const RequiredStar = () => <span className="text-danger">*</span>;

  return (
    <div
      className={`modal ${show ? "show d-block" : "d-none"}`}
      tabIndex="-1"
      role="dialog"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <div className="modal-dialog modal-fullscreen" role="document">
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
            <form id="leadForm" onSubmit={handleSubmit} noValidate>
              <div className="row">
                <div className="col-md-4 mb-3">
                  <label htmlFor="leadName" className="form-label">
                    Name <RequiredStar />
                  </label>
                  <input
                    id="leadName"
                    name="leadName"
                    className={`form-control modern-input ${errors.leadName ? "is-invalid" : ""}`}
                    value={formData.leadName}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                    placeholder="Lead Name"
                  />
                  {errors.leadName && (
                    <div className="invalid-feedback d-block">
                      {errors.leadName}
                    </div>
                  )}
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="businessName" className="form-label">
                    Business Name <RequiredStar />
                  </label>
                  <input
                    id="businessName"
                    name="businessName"
                    className={`form-control modern-input ${errors.businessName ? "is-invalid" : ""}`}
                    value={formData.businessName}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                    placeholder="Business Name"
                  />
                  {errors.businessName && (
                    <div className="invalid-feedback d-block">
                      {errors.businessName}
                    </div>
                  )}
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="phoneNumber" className="form-label">
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
                      id="phoneNumber"
                      name="phoneNumber"
                      className={`form-control modern-input rounded-end-3 ${errors.phoneNumber ? "is-invalid" : ""}`}
                      value={formData.phoneNumber}
                      onChange={handleInputChange}
                      minLength="10"
                      maxLength="10"
                      readOnly={isViewMode}
                      placeholder="10-digit mobile number"
                    />
                  </div>
                  {errors.phoneNumber && (
                    <div className="invalid-feedback d-block mt-1">
                      {errors.phoneNumber}
                    </div>
                  )}
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="whatsappNumber" className="form-label">
                    WhatsApp Number
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
                      id="whatsappNumber"
                      name="whatsappNumber"
                      className={`form-control modern-input rounded-end-3 ${errors.whatsappNumber ? "is-invalid" : ""}`}
                      value={formData.whatsappNumber}
                      onChange={handleInputChange}
                      minLength="10"
                      maxLength="10"
                      readOnly={isViewMode}
                      placeholder="10-digit WhatsApp number"
                    />
                  </div>
                  {errors.whatsappNumber && (
                    <div className="invalid-feedback d-block mt-1">
                      {errors.whatsappNumber}
                    </div>
                  )}
                </div>

                <div className="col-md-4 mb-3">
                  <label className="form-label">
                    Interested Service / Product <RequiredStar />
                  </label>
                  <Select
                    classNamePrefix="react-select"
                    styles={selectStyles.interestedService}
                    isDisabled={isViewMode}
                    value={
                      formData.interestedService
                        ? {
                            value: formData.interestedService,
                            label: formData.interestedService,
                          }
                        : null
                    }
                    onChange={(option) =>
                      setFormData((prev) => ({
                        ...prev,
                        interestedService: option?.value || "",
                      }))
                    }
                    options={interestedServices.map((item) => ({
                      value: item,
                      label: item,
                    }))}
                    isClearable={false}
                    isSearchable
                    isLoading={loadingServices}
                    placeholder="Select interested service"
                  />
                  {errors.interestedService && (
                    <div className="invalid-feedback d-block">
                      {errors.interestedService}
                    </div>
                  )}
                </div>

                <div className="col-md-4 mb-3">
                  <label className="form-label">
                    Lead Source <RequiredStar />
                  </label>
                  <Select
                    classNamePrefix="react-select"
                    styles={selectStyles.leadSource}
                    isDisabled={isViewMode}
                    value={
                      formData.leadSource
                        ? {
                            value: formData.leadSource,
                            label: formData.leadSource,
                          }
                        : null
                    }
                    onChange={(option) =>
                      setFormData((prev) => ({
                        ...prev,
                        leadSource: option?.value || "",
                      }))
                    }
                    options={LEAD_SOURCE_OPTIONS.map((item) => ({
                      value: item,
                      label: item,
                    }))}
                    isClearable={false}
                    isSearchable
                    placeholder="Select lead source"
                  />
                  {errors.leadSource && (
                    <div className="invalid-feedback d-block">
                      {errors.leadSource}
                    </div>
                  )}
                </div>

                <div className="col-md-4 mb-3">
                  <label className="form-label">Contact By</label>
                  <Select
                    classNamePrefix="react-select"
                    styles={selectStyles.contactBy}
                    isDisabled={isViewMode}
                    value={
                      formData.contactBy
                        ? {
                            value: formData.contactBy,
                            label: formData.contactBy,
                          }
                        : null
                    }
                    onChange={(option) =>
                      setFormData((prev) => ({
                        ...prev,
                        contactBy: option?.value || "",
                      }))
                    }
                    options={CONTACT_BY_OPTIONS.map((item) => ({
                      value: item,
                      label: item,
                    }))}
                    isClearable={false}
                    isSearchable={false}
                    placeholder="Select contact by"
                  />
                  {errors.contactBy && (
                    <div className="invalid-feedback d-block">
                      {errors.contactBy}
                    </div>
                  )}
                </div>

                <div className="col-md-4 mb-3">
                  <label className="form-label">
                    Priority <RequiredStar />
                  </label>
                  <Select
                    classNamePrefix="react-select"
                    styles={selectStyles.priority}
                    isDisabled={isViewMode}
                    value={
                      formData.priority
                        ? { value: formData.priority, label: formData.priority }
                        : null
                    }
                    onChange={(option) =>
                      setFormData((prev) => ({
                        ...prev,
                        priority: option?.value || "",
                      }))
                    }
                    options={PRIORITY_OPTIONS.map((item) => ({
                      value: item,
                      label: item,
                    }))}
                    isClearable={false}
                    isSearchable={false}
                    placeholder="Select priority"
                  />
                  {errors.priority && (
                    <div className="invalid-feedback d-block">
                      {errors.priority}
                    </div>
                  )}
                </div>

                <div className="col-md-4 mb-3">
                  <label className="form-label">
                    Lead Status <RequiredStar />
                  </label>
                  <Select
                    classNamePrefix="react-select"
                    styles={selectStyles.leadStatus}
                    isDisabled={isViewMode}
                    value={
                      formData.leadStatus
                        ? {
                            value: formData.leadStatus,
                            label: formData.leadStatus,
                          }
                        : null
                    }
                    onChange={(option) =>
                      setFormData((prev) => ({
                        ...prev,
                        leadStatus: option?.value || "",
                      }))
                    }
                    options={LEAD_STATUS_OPTIONS.map((item) => ({
                      value: item,
                      label: item,
                    }))}
                    isClearable={false}
                    isSearchable={false}
                    placeholder="Select lead status"
                  />
                  {errors.leadStatus && (
                    <div className="invalid-feedback d-block">
                      {errors.leadStatus}
                    </div>
                  )}
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="email" className="form-label">
                    Email
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    className={`form-control modern-input ${errors.email ? "is-invalid" : ""}`}
                    value={formData.email}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                    placeholder="Email address"
                  />
                  {errors.email && (
                    <div className="invalid-feedback d-block">
                      {errors.email}
                    </div>
                  )}
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="lastContactedDate" className="form-label">
                    Last Contacted Date
                  </label>
                  <input
                    id="lastContactedDate"
                    name="lastContactedDate"
                    type="date"
                    className="form-control modern-input"
                    value={formData.lastContactedDate}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                  />
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="followUpDate" className="form-label">
                    Next Follow-Up Date
                  </label>
                  <input
                    id="followUpDate"
                    name="followUpDate"
                    type="date"
                    className="form-control modern-input"
                    value={formData.followUpDate}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                  />
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="expectedBudget" className="form-label">
                    Expected Budget
                  </label>
                  <input
                    id="expectedBudget"
                    name="expectedBudget"
                    className="form-control modern-input"
                    value={formData.expectedBudget}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                    placeholder="Expected budget"
                  />
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="status" className="form-label">
                    Record Status
                  </label>
                  <select
                    id="status"
                    name="status"
                    className="form-select modern-input"
                    value={formData.status}
                    onChange={handleInputChange}
                    disabled={isViewMode}
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="address" className="form-label">
                    Address
                  </label>
                  <input
                    id="address"
                    name="address"
                    className="form-control modern-input"
                    value={formData.address}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                    placeholder="Address"
                  />
                </div>

                <div className="col-md-12 mb-3">
                  <label htmlFor="notes" className="form-label">
                    Notes
                  </label>
                  <textarea
                    id="notes"
                    name="notes"
                    rows="1"
                    className="form-control modern-input"
                    value={formData.notes}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                    placeholder="Additional notes"
                  ></textarea>
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
              {isViewMode ? "Close" : "Cancel"}
            </button>
            {!isViewMode && (
              <button
                type="submit"
                form="leadForm"
                className="btn btn-success"
                disabled={submitting}
              >
                {submitting
                  ? "Saving..."
                  : editingRecord
                    ? "Update Lead"
                    : "Save Lead"}
              </button>
            )}
          </div>
        </div>
      </div>

      <style>{`
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

        .invalid-feedback.d-block {
          display: block !important;
          margin-top: 5px;
        }

        .input-group > .form-control {
          border-radius: 0;
        }
      `}</style>
    </div>
  );
};

export default CreateLead;
