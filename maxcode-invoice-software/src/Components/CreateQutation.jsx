import React, { useEffect, useState } from "react";
import { showError, showSuccess } from "./ToastNotification";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { apiPost, apiPut } from "../utils/api";

const PROJECT_TYPE_OPTIONS = ["Website", "App", "Website + App"];
const QUTATION_TYPE_OPTIONS = ["One Time Development", "Subscription Software"];
const QUTATION_STATUS_OPTIONS = [
  "Send",
  "Approve",
  "Reject",
  "Send + Approve",
  "Expired",
  "Pending",
];
const QUTATION_SEND_VIA_OPTIONS = ["WhatsApp", "Email", "WhatsApp + Email"];

const initialFormData = {
  clientName: "",
  phoneNumber: "",
  address: "",
  email: "",
  projectName: "",
  projectType: "Website",
  qutationType: "One Time Development",
  qutationDate: "",
  qutationValidity: "",
  qutationTotalAmount: "",
  developmentTime: "",
  qutationGoogleDriveLink: "",
  agreementGoogleDriveLink: "",
  qutationSendVia: "WhatsApp",
  qutationStatus: "Send",
  qutationSendDate: "",
  qutationApproveDate: "",
  qutationRejectDate: "",
  description: "",
};

const CreateQutation = ({ show, onClose, onSubmit, editingRecord = null }) => {
  const [formData, setFormData] = useState(initialFormData);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

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

  useEffect(() => {
    if (editingRecord) {
      setFormData({
        ...initialFormData,
        ...editingRecord,
      });
      setErrors({});
      return;
    }

    setFormData(initialFormData);
    setErrors({});
  }, [editingRecord, show]);

  const isViewMode = editingRecord?.isViewMode;

  const validateForm = () => {
    const newErrors = {};

    const requiredFields = [
      "clientName",
      "phoneNumber",
      "address",
      "projectName",
      "projectType",
      "qutationType",
      "qutationDate",
      "qutationValidity",
      "qutationTotalAmount",
      "developmentTime",
      "qutationSendVia",
      "qutationStatus",
    ];

    requiredFields.forEach((field) => {
      if (!formData[field] || formData[field].toString().trim() === "") {
        newErrors[field] = "This field is required";
      }
    });

    if (formData.phoneNumber && !/^\d{10}$/.test(formData.phoneNumber)) {
      newErrors.phoneNumber = "Phone number must be exactly 10 digits";
    }

    if (
      formData.email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())
    ) {
      newErrors.email = "Please enter a valid email address";
    }

    if (
      formData.qutationGoogleDriveLink &&
      !/^https?:\/\//i.test(formData.qutationGoogleDriveLink)
    ) {
      newErrors.qutationGoogleDriveLink = "Please enter a valid URL";
    }

    if (
      formData.agreementGoogleDriveLink &&
      !/^https?:\/\//i.test(formData.agreementGoogleDriveLink)
    ) {
      newErrors.agreementGoogleDriveLink = "Please enter a valid URL";
    }

    if (
      formData.qutationTotalAmount &&
      Number(formData.qutationTotalAmount) <= 0
    ) {
      newErrors.qutationTotalAmount = "Amount must be greater than 0";
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      showError("Please fill all required quotation fields correctly");
      return false;
    }

    return true;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    if (name === "phoneNumber") {
      const numericValue = value.replace(/\D/g, "").slice(0, 10);
      setFormData((prev) => ({ ...prev, [name]: numericValue }));
    } else if (name === "qutationTotalAmount") {
      const numericValue = value.replace(/[^0-9.]/g, "");
      setFormData((prev) => ({ ...prev, [name]: numericValue }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const openGoogleDriveLink = () => {
    const link = formData.qutationGoogleDriveLink?.trim();
    if (!link) {
      showError("Please enter quotation Google Drive link first");
      return;
    }

    if (!/^https?:\/\//i.test(link)) {
      showError("Please enter a valid URL starting with http:// or https://");
      return;
    }

    window.open(link, "_blank", "noopener,noreferrer");
  };

  const openAgreementGoogleDriveLink = () => {
    const link = formData.agreementGoogleDriveLink?.trim();
    if (!link) {
      showError("Please enter agreement Google Drive link first");
      return;
    }

    if (!/^https?:\/\//i.test(link)) {
      showError("Please enter a valid URL starting with http:// or https://");
      return;
    }

    window.open(link, "_blank", "noopener,noreferrer");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    try {
      setSubmitting(true);

      const payload = {
        ...formData,
        qutationTotalAmount: Number(formData.qutationTotalAmount || 0),
      };

      if (editingRecord && !editingRecord.isViewMode) {
        const qutationId = editingRecord._id || editingRecord.id;
        const { _id, id, ...cleanData } = payload;
        await apiPut(API_ENDPOINTS.QUTATIONS.UPDATE(qutationId), cleanData);
        showSuccess("Qutation updated successfully!");
      } else {
        await apiPost(API_ENDPOINTS.QUTATIONS.CREATE, payload);
        showSuccess("Qutation created successfully!");
      }

      onSubmit(payload);
    } catch (error) {
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to save qutation",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const RequiredStar = () => <span className="text-danger">*</span>;

  if (!show) return null;

  const modalTitle = editingRecord
    ? editingRecord.isViewMode
      ? `View Qutation - ${editingRecord.projectName || ""}`
      : `Edit Qutation - ${editingRecord.projectName || ""}`
    : "Add New Qutation";

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
            <form id="qutationForm" onSubmit={handleSubmit} noValidate>
              <div className="row">
                <div className="col-md-4 mb-3">
                  <label htmlFor="clientName" className="form-label">
                    <i className="fas fa-user me-2 text-primary"></i>
                    Client Name <RequiredStar />
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.clientName ? "is-invalid" : ""}`}
                    id="clientName"
                    name="clientName"
                    value={formData.clientName}
                    onChange={handleInputChange}
                    placeholder="Enter Client Name"
                    readOnly={isViewMode}
                  />
                  {errors.clientName && (
                    <div className="invalid-feedback d-block">
                      {errors.clientName}
                    </div>
                  )}
                </div>

                <div className="col-md-4 mb-3">
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
                      placeholder="10-digit mobile number"
                      readOnly={isViewMode}
                      maxLength="10"
                    />
                  </div>
                  {errors.phoneNumber && (
                    <div className="invalid-feedback d-block mt-1">
                      {errors.phoneNumber}
                    </div>
                  )}
                </div>

                <div className="col-md-4 mb-3">
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
                    placeholder="Enter Address"
                    readOnly={isViewMode}
                  />
                  {errors.address && (
                    <div className="invalid-feedback d-block">
                      {errors.address}
                    </div>
                  )}
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="email" className="form-label">
                    <i className="fas fa-envelope me-2 text-primary"></i>
                    Email
                  </label>
                  <input
                    type="email"
                    className={`form-control modern-input ${errors.email ? "is-invalid" : ""}`}
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    placeholder="Enter Email"
                    readOnly={isViewMode}
                  />
                  {errors.email && (
                    <div className="invalid-feedback d-block">
                      {errors.email}
                    </div>
                  )}
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="projectName" className="form-label">
                    <i className="fas fa-diagram-project me-2 text-primary"></i>
                    Project Name <RequiredStar />
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.projectName ? "is-invalid" : ""}`}
                    id="projectName"
                    name="projectName"
                    value={formData.projectName}
                    onChange={handleInputChange}
                    placeholder="Enter Project Name"
                    readOnly={isViewMode}
                  />
                  {errors.projectName && (
                    <div className="invalid-feedback d-block">
                      {errors.projectName}
                    </div>
                  )}
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="projectType" className="form-label">
                    <i className="fas fa-layer-group me-2 text-primary"></i>
                    Project Type <RequiredStar />
                  </label>
                  <select
                    id="projectType"
                    name="projectType"
                    className={`form-select modern-input ${errors.projectType ? "is-invalid" : ""}`}
                    value={formData.projectType}
                    onChange={handleInputChange}
                    disabled={isViewMode}
                  >
                    {PROJECT_TYPE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  {errors.projectType && (
                    <div className="invalid-feedback d-block">
                      {errors.projectType}
                    </div>
                  )}
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="qutationType" className="form-label">
                    <i className="fas fa-file-signature me-2 text-primary"></i>
                    Qutation Type <RequiredStar />
                  </label>
                  <select
                    id="qutationType"
                    name="qutationType"
                    className={`form-select modern-input ${errors.qutationType ? "is-invalid" : ""}`}
                    value={formData.qutationType}
                    onChange={handleInputChange}
                    disabled={isViewMode}
                  >
                    {QUTATION_TYPE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  {errors.qutationType && (
                    <div className="invalid-feedback d-block">
                      {errors.qutationType}
                    </div>
                  )}
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="qutationDate" className="form-label">
                    <i className="fas fa-calendar-day me-2 text-primary"></i>
                    Qutation Date <RequiredStar />
                  </label>
                  <input
                    type="date"
                    className={`form-control modern-input ${errors.qutationDate ? "is-invalid" : ""}`}
                    id="qutationDate"
                    name="qutationDate"
                    value={formData.qutationDate}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                  />
                  {errors.qutationDate && (
                    <div className="invalid-feedback d-block">
                      {errors.qutationDate}
                    </div>
                  )}
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="qutationValidity" className="form-label">
                    <i className="fas fa-calendar-check me-2 text-primary"></i>
                    Qutation Validity <RequiredStar />
                  </label>
                  <input
                    type="date"
                    className={`form-control modern-input ${errors.qutationValidity ? "is-invalid" : ""}`}
                    id="qutationValidity"
                    name="qutationValidity"
                    value={formData.qutationValidity}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                  />
                  {errors.qutationValidity && (
                    <div className="invalid-feedback d-block">
                      {errors.qutationValidity}
                    </div>
                  )}
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="qutationTotalAmount" className="form-label">
                    <i className="fas fa-indian-rupee-sign me-2 text-primary"></i>
                    Qutation Total Amount <RequiredStar />
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.qutationTotalAmount ? "is-invalid" : ""}`}
                    id="qutationTotalAmount"
                    name="qutationTotalAmount"
                    value={formData.qutationTotalAmount}
                    onChange={handleInputChange}
                    placeholder="Enter total amount"
                    readOnly={isViewMode}
                  />
                  {errors.qutationTotalAmount && (
                    <div className="invalid-feedback d-block">
                      {errors.qutationTotalAmount}
                    </div>
                  )}
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="developmentTime" className="form-label">
                    <i className="fas fa-clock me-2 text-primary"></i>
                    Development Time <RequiredStar />
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.developmentTime ? "is-invalid" : ""}`}
                    id="developmentTime"
                    name="developmentTime"
                    value={formData.developmentTime}
                    onChange={handleInputChange}
                    placeholder="Example: 30 Days"
                    readOnly={isViewMode}
                  />
                  {errors.developmentTime && (
                    <div className="invalid-feedback d-block">
                      {errors.developmentTime}
                    </div>
                  )}
                </div>

                <div className="col-md-4 mb-3">
                  <label
                    htmlFor="qutationGoogleDriveLink"
                    className="form-label"
                  >
                    <i className="fab fa-google-drive me-2 text-primary"></i>
                    Qutation Google Drive Link
                  </label>
                  <div className="input-group">
                    <input
                      type="url"
                      className={`form-control modern-input ${errors.qutationGoogleDriveLink ? "is-invalid" : ""}`}
                      id="qutationGoogleDriveLink"
                      name="qutationGoogleDriveLink"
                      value={formData.qutationGoogleDriveLink}
                      onChange={handleInputChange}
                      placeholder="Paste Google Drive document URL"
                      readOnly={isViewMode}
                    />
                    <button
                      className="btn btn-outline-primary"
                      type="button"
                      onClick={openGoogleDriveLink}
                      title="Open document"
                    >
                      <i className="fas fa-eye"></i>
                    </button>
                  </div>
                  {errors.qutationGoogleDriveLink && (
                    <div className="invalid-feedback d-block">
                      {errors.qutationGoogleDriveLink}
                    </div>
                  )}
                </div>

                <div className="col-md-4 mb-3">
                  <label
                    htmlFor="agreementGoogleDriveLink"
                    className="form-label"
                  >
                    <i className="fab fa-google-drive me-2 text-primary"></i>
                    Agreement Google Drive Link
                  </label>
                  <div className="input-group">
                    <input
                      type="url"
                      className={`form-control modern-input ${errors.agreementGoogleDriveLink ? "is-invalid" : ""}`}
                      id="agreementGoogleDriveLink"
                      name="agreementGoogleDriveLink"
                      value={formData.agreementGoogleDriveLink}
                      onChange={handleInputChange}
                      placeholder="Paste Agreement document URL"
                      readOnly={isViewMode}
                    />
                    <button
                      className="btn btn-outline-primary"
                      type="button"
                      onClick={openAgreementGoogleDriveLink}
                      title="Open agreement document"
                    >
                      <i className="fas fa-eye"></i>
                    </button>
                  </div>
                  {errors.agreementGoogleDriveLink && (
                    <div className="invalid-feedback d-block">
                      {errors.agreementGoogleDriveLink}
                    </div>
                  )}
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="qutationStatus" className="form-label">
                    <i className="fas fa-list-check me-2 text-primary"></i>
                    Qutation Status <RequiredStar />
                  </label>
                  <select
                    id="qutationStatus"
                    name="qutationStatus"
                    className={`form-select modern-input ${errors.qutationStatus ? "is-invalid" : ""}`}
                    value={formData.qutationStatus}
                    onChange={handleInputChange}
                    disabled={isViewMode}
                  >
                    {QUTATION_STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  {errors.qutationStatus && (
                    <div className="invalid-feedback d-block">
                      {errors.qutationStatus}
                    </div>
                  )}
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="qutationSendVia" className="form-label">
                    <i className="fas fa-share-nodes me-2 text-primary"></i>
                    Qutation Send Via <RequiredStar />
                  </label>
                  <select
                    id="qutationSendVia"
                    name="qutationSendVia"
                    className={`form-select modern-input ${errors.qutationSendVia ? "is-invalid" : ""}`}
                    value={formData.qutationSendVia}
                    onChange={handleInputChange}
                    disabled={isViewMode}
                  >
                    {QUTATION_SEND_VIA_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  {errors.qutationSendVia && (
                    <div className="invalid-feedback d-block">
                      {errors.qutationSendVia}
                    </div>
                  )}
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="qutationSendDate" className="form-label">
                    <i className="fas fa-paper-plane me-2 text-primary"></i>
                    Qutation Send Date
                  </label>
                  <input
                    type="date"
                    className="form-control modern-input"
                    id="qutationSendDate"
                    name="qutationSendDate"
                    value={formData.qutationSendDate}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                  />
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="qutationApproveDate" className="form-label">
                    <i className="fas fa-circle-check me-2 text-primary"></i>
                    Qutation Approve Date
                  </label>
                  <input
                    type="date"
                    className="form-control modern-input"
                    id="qutationApproveDate"
                    name="qutationApproveDate"
                    value={formData.qutationApproveDate}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                  />
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="qutationRejectDate" className="form-label">
                    <i className="fas fa-circle-xmark me-2 text-primary"></i>
                    Qutation Reject Date
                  </label>
                  <input
                    type="date"
                    className="form-control modern-input"
                    id="qutationRejectDate"
                    name="qutationRejectDate"
                    value={formData.qutationRejectDate}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                  />
                </div>

                <div className="col-12 mb-3">
                  <label htmlFor="description" className="form-label">
                    <i className="fas fa-align-left me-2 text-primary"></i>
                    Description
                  </label>
                  <textarea
                    className="form-control modern-input"
                    id="description"
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    rows="1"
                    placeholder="Enter additional notes..."
                    readOnly={isViewMode}
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
                form="qutationForm"
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
                    {editingRecord ? "Update Qutation" : "Save Qutation"}
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
      `}</style>
    </div>
  );
};

export default CreateQutation;
