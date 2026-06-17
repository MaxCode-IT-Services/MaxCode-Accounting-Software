import React, { useEffect, useState } from "react";
import UploadedFilePreviewBox from "./UploadedFilePreviewBox";
import { showError, showSuccess } from "./ToastNotification";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { apiGet, apiPost, apiPut } from "../utils/api";
import {
  isDateWithinFinancialYear,
  normalizeFinancialYearValue,
  resolveFinancialYearRecord,
} from "../utils/financialYearUtils";

const toBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : "";
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });

const PROJECT_TYPE_OPTIONS = [
  "Website",
  "App",
  "Website + App",
  "Social Media",
  "Website + Social Media",
  "App + Social Media",
  "Website + App + Social Media",
  "Other",
];
const QUOTATION_TYPE_OPTIONS = ["One Time Development", "Subscription Software", "Subscription Services"];
const QUOTATION_STATUS_OPTIONS = [
  "Send",
  "Approve",
  "Reject",
  "Send + Approve",
  "Expired",
  "Pending",
];
const QUOTATION_SEND_VIA_OPTIONS = ["WhatsApp", "Email", "WhatsApp + Email"];

const initialFormData = {
  quotationNumber: "",
  clientName: "",
  phoneNumber: "",
  address: "",
  email: "",
  projectName: "",
  projectType: "Website",
  quotationType: "One Time Development",
  quotationDate: "",
  quotationExpiryDate: "",
  quotationTotalAmount: "",
  developmentTime: "",
  quotationGoogleDriveLink: "",
  quotationSendVia: "WhatsApp",
  quotationStatus: "Send",
  quotationSendDate: "",
  quotationApproveDate: "",
  quotationRejectDate: "",
  financialYear: "",
  description: "",
};

const CreateQuotation = ({
  show,
  onClose,
  onSubmit,
  editingRecord = null,
  financialYears = [],
  selectedFinancialYear = "ALL",
  defaultFinancialYear = null,
}) => {
  const [formData, setFormData] = useState(initialFormData);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [selectedQuotationFile, setSelectedQuotationFile] = useState(null);

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
        quotationExpiryDate:
          editingRecord.quotationExpiryDate ||
          editingRecord.quotationValidity ||
          "",
      });
      setSelectedQuotationFile(null);
      setErrors({});
      return;
    }

    setFormData(initialFormData);
    setSelectedQuotationFile(null);
    setErrors({});
  }, [editingRecord, show]);

  const getActiveFinancialYearRecord = () => {
    return resolveFinancialYearRecord({
      financialYears,
      selectedFinancialYear,
      defaultFinancialYear,
    });
  };

  useEffect(() => {
    if (!show || editingRecord) return;

    const activeFinancialYear = getActiveFinancialYearRecord();
    const activeFinancialYearValue =
      normalizeFinancialYearValue(activeFinancialYear);

    let cancelled = false;

    const fetchNextQuotationNumber = async () => {
      try {
        const response = await apiGet(API_ENDPOINTS.QUOTATIONS.NEXT_NUMBER, {
          params: activeFinancialYearValue
            ? { financialYear: activeFinancialYearValue }
            : {},
        });

        if (cancelled) return;

        const nextQuotationNumber =
          response?.data?.quotationNumber || response?.data?.nextNumber || "";

        setFormData((prev) => ({
          ...prev,
          quotationNumber: nextQuotationNumber || prev.quotationNumber,
          financialYear: activeFinancialYearValue,
        }));
      } catch (error) {
        if (cancelled) return;
        setFormData((prev) => ({
          ...prev,
          financialYear: activeFinancialYearValue,
        }));
      }
    };

    fetchNextQuotationNumber();

    return () => {
      cancelled = true;
    };
  }, [
    show,
    editingRecord,
    financialYears,
    selectedFinancialYear,
    defaultFinancialYear,
  ]);

  const isViewMode = editingRecord?.isViewMode;
  const uploadedQuotationViewUrl =
    formData.quotationFileURL ||
    (formData.quotationFilePath ? formData.quotationGoogleDriveLink : "") ||
    "";

  const validateForm = () => {
    const newErrors = {};

    const requiredFields = [
      "clientName",
      "phoneNumber",
      "address",
      "projectName",
      "projectType",
      "quotationType",
      "quotationDate",
      "quotationExpiryDate",
      "quotationTotalAmount",
      "developmentTime",
      "quotationSendVia",
      "quotationStatus",
    ];

    if (!editingRecord) {
      requiredFields.unshift("quotationNumber");
    }

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
      formData.quotationGoogleDriveLink &&
      !/^https?:\/\//i.test(formData.quotationGoogleDriveLink)
    ) {
      newErrors.quotationGoogleDriveLink = "Please enter a valid URL";
    }

    if (
      formData.quotationTotalAmount &&
      Number(formData.quotationTotalAmount) <= 0
    ) {
      newErrors.quotationTotalAmount = "Amount must be greater than 0";
    }

    const activeFinancialYear = getActiveFinancialYearRecord();
    const activeFinancialYearValue =
      normalizeFinancialYearValue(activeFinancialYear);

    if (!activeFinancialYear?.startDate || !activeFinancialYear?.endDate) {
      newErrors.quotationDate =
        "Selected/default financial year is not configured. Please set financial year first";
    } else if (
      !isDateWithinFinancialYear(formData.quotationDate, activeFinancialYear)
    ) {
      newErrors.quotationDate = `Quotation Date must be between ${activeFinancialYear.startDate} and ${activeFinancialYear.endDate} for financial year ${activeFinancialYearValue}.`;
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
    } else if (name === "quotationTotalAmount") {
      const numericValue = value.replace(/[^0-9.]/g, "");
      setFormData((prev) => ({ ...prev, [name]: numericValue }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleQuotationFileChange = (e) => {
    const file = e.target.files?.[0] || null;
    if (!file) {
      setSelectedQuotationFile(null);
      return;
    }

    const isAllowedType =
      file.type === "application/pdf" || file.type.startsWith("image/");

    if (!isAllowedType) {
      showError("Please upload only image or PDF quotation file");
      e.target.value = "";
      setSelectedQuotationFile(null);
      return;
    }

    setSelectedQuotationFile(file);
  };

  const openGoogleDriveLink = () => {
    const link = formData.quotationGoogleDriveLink?.trim();
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

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    try {
      setSubmitting(true);

      const payload = {
        ...formData,
        financialYear:
          formData.financialYear ||
          normalizeFinancialYearValue(getActiveFinancialYearRecord()) ||
          "",
        quotationTotalAmount: Number(formData.quotationTotalAmount || 0),
      };

      delete payload.agreementGoogleDriveLink;

      const quotationUpload = selectedQuotationFile
        ? {
            fileName: selectedQuotationFile.name,
            fileType: selectedQuotationFile.type || "application/octet-stream",
            fileDataBase64: await toBase64(selectedQuotationFile),
          }
        : null;

      if (quotationUpload) {
        payload.quotationUpload = quotationUpload;
      }

      if (editingRecord && !editingRecord.isViewMode) {
        const quotationId = editingRecord._id || editingRecord.id;
        const { _id, id, ...cleanData } = payload;
        await apiPut(API_ENDPOINTS.QUOTATIONS.UPDATE(quotationId), cleanData);
        showSuccess("Quotation updated successfully!");
      } else {
        await apiPost(API_ENDPOINTS.QUOTATIONS.CREATE, payload);
        showSuccess("Quotation created successfully!");
      }

      onSubmit(payload);
    } catch (error) {
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to save quotation",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const RequiredStar = () => <span className="text-danger">*</span>;

  if (!show) return null;

  const modalTitle = editingRecord
    ? editingRecord.isViewMode
      ? `View Quotation - ${editingRecord.projectName || ""}`
      : `Edit Quotation - ${editingRecord.projectName || ""}`
    : "Add New Quotation";

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
            <form id="quotationForm" onSubmit={handleSubmit} noValidate>
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

                <div className="col-md-2 mb-3">
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

                <div className="col-md-2 mb-3">
                  <label htmlFor="quotationNumber" className="form-label">
                    <i className="fas fa-hashtag me-2 text-primary"></i>
                    Quotation Number <RequiredStar />
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.quotationNumber ? "is-invalid" : ""}`}
                    id="quotationNumber"
                    name="quotationNumber"
                    value={formData.quotationNumber}
                    readOnly
                  />
                  {errors.quotationNumber && (
                    <div className="invalid-feedback d-block">
                      {errors.quotationNumber}
                    </div>
                  )}
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="quotationType" className="form-label">
                    <i className="fas fa-file-signature me-2 text-primary"></i>
                    Quotation Type <RequiredStar />
                  </label>
                  <select
                    id="quotationType"
                    name="quotationType"
                    className={`form-select modern-input ${errors.quotationType ? "is-invalid" : ""}`}
                    value={formData.quotationType}
                    onChange={handleInputChange}
                    disabled={isViewMode}
                  >
                    {QUOTATION_TYPE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  {errors.quotationType && (
                    <div className="invalid-feedback d-block">
                      {errors.quotationType}
                    </div>
                  )}
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="quotationDate" className="form-label">
                    <i className="fas fa-calendar-day me-2 text-primary"></i>
                    Quotation Date <RequiredStar />
                  </label>
                  <input
                    type="date"
                    className={`form-control modern-input ${errors.quotationDate ? "is-invalid" : ""}`}
                    id="quotationDate"
                    name="quotationDate"
                    value={formData.quotationDate}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                  />
                  {errors.quotationDate && (
                    <div className="invalid-feedback d-block">
                      {errors.quotationDate}
                    </div>
                  )}
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="quotationExpiryDate" className="form-label">
                    <i className="fas fa-calendar-check me-2 text-primary"></i>
                    Quotation Expiry Date <RequiredStar />
                  </label>
                  <input
                    type="date"
                    className={`form-control modern-input ${errors.quotationExpiryDate ? "is-invalid" : ""}`}
                    id="quotationExpiryDate"
                    name="quotationExpiryDate"
                    value={formData.quotationExpiryDate}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                  />
                  {errors.quotationExpiryDate && (
                    <div className="invalid-feedback d-block">
                      {errors.quotationExpiryDate}
                    </div>
                  )}
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="quotationTotalAmount" className="form-label">
                    <i className="fas fa-indian-rupee-sign me-2 text-primary"></i>
                    Quotation Total Amount <RequiredStar />
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.quotationTotalAmount ? "is-invalid" : ""}`}
                    id="quotationTotalAmount"
                    name="quotationTotalAmount"
                    value={formData.quotationTotalAmount}
                    onChange={handleInputChange}
                    placeholder="Enter total amount"
                    readOnly={isViewMode}
                  />
                  {errors.quotationTotalAmount && (
                    <div className="invalid-feedback d-block">
                      {errors.quotationTotalAmount}
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
                    htmlFor="quotationGoogleDriveLink"
                    className="form-label"
                  >
                    <i className="fab fa-google-drive me-2 text-primary"></i>
                    Quotation Google Drive Link
                  </label>
                  <div className="input-group">
                    <input
                      type="url"
                      className={`form-control modern-input ${errors.quotationGoogleDriveLink ? "is-invalid" : ""}`}
                      id="quotationGoogleDriveLink"
                      name="quotationGoogleDriveLink"
                      value={formData.quotationGoogleDriveLink}
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
                  {errors.quotationGoogleDriveLink && (
                    <div className="invalid-feedback d-block">
                      {errors.quotationGoogleDriveLink}
                    </div>
                  )}
                </div>

                <div className="col-md-4 mb-3">
                  <label className="form-label fw-semibold">
                    <i className="fas fa-file-upload me-2 text-warning"></i>
                    Upload Quotation (Image/PDF)
                  </label>

                  {!isViewMode ? (
                    <input
                      type="file"
                      className="form-control modern-input file-picker-input"
                      accept="image/*,application/pdf"
                      onChange={handleQuotationFileChange}
                    />
                  ) : uploadedQuotationViewUrl ? (
                    <UploadedFilePreviewBox
                      fileUrl={uploadedQuotationViewUrl}
                      fileType={selectedQuotationFile?.type}
                      title="Open uploaded quotation in new tab"
                      iconClassName="fa-solid fa-file-contract"
                    />
                  ) : (
                    <span className="text-muted small">
                      No uploaded quotation file
                    </span>
                  )}
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="quotationStatus" className="form-label">
                    <i className="fas fa-list-check me-2 text-primary"></i>
                    Quotation Status <RequiredStar />
                  </label>
                  <select
                    id="quotationStatus"
                    name="quotationStatus"
                    className={`form-select modern-input ${errors.quotationStatus ? "is-invalid" : ""}`}
                    value={formData.quotationStatus}
                    onChange={handleInputChange}
                    disabled={isViewMode}
                  >
                    {QUOTATION_STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  {errors.quotationStatus && (
                    <div className="invalid-feedback d-block">
                      {errors.quotationStatus}
                    </div>
                  )}
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="quotationSendVia" className="form-label">
                    <i className="fas fa-share-nodes me-2 text-primary"></i>
                    Quotation Send Via <RequiredStar />
                  </label>
                  <select
                    id="quotationSendVia"
                    name="quotationSendVia"
                    className={`form-select modern-input ${errors.quotationSendVia ? "is-invalid" : ""}`}
                    value={formData.quotationSendVia}
                    onChange={handleInputChange}
                    disabled={isViewMode}
                  >
                    {QUOTATION_SEND_VIA_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  {errors.quotationSendVia && (
                    <div className="invalid-feedback d-block">
                      {errors.quotationSendVia}
                    </div>
                  )}
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="quotationSendDate" className="form-label">
                    <i className="fas fa-paper-plane me-2 text-primary"></i>
                    Quotation Send Date
                  </label>
                  <input
                    type="date"
                    className="form-control modern-input"
                    id="quotationSendDate"
                    name="quotationSendDate"
                    value={formData.quotationSendDate}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                  />
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="quotationApproveDate" className="form-label">
                    <i className="fas fa-circle-check me-2 text-primary"></i>
                    Quotation Approve Date
                  </label>
                  <input
                    type="date"
                    className="form-control modern-input"
                    id="quotationApproveDate"
                    name="quotationApproveDate"
                    value={formData.quotationApproveDate}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                  />
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="quotationRejectDate" className="form-label">
                    <i className="fas fa-circle-xmark me-2 text-primary"></i>
                    Quotation Reject Date
                  </label>
                  <input
                    type="date"
                    className="form-control modern-input"
                    id="quotationRejectDate"
                    name="quotationRejectDate"
                    value={formData.quotationRejectDate}
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
                form="quotationForm"
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
                    {editingRecord ? "Update Quotation" : "Save Quotation"}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .file-picker-input::file-selector-button,
        .file-picker-input::-webkit-file-upload-button {
          margin-right: 10px;
          border: 0;
          border-radius: 8px;
          background: linear-gradient(135deg, #007026 0, #09a98d 100%);
          color: #fff;
          padding: 8px 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .file-picker-input::file-selector-button:hover,
        .file-picker-input::-webkit-file-upload-button:hover {
          filter: brightness(1.08);
        }

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

export default CreateQuotation;
