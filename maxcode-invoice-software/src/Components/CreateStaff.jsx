import React, { useState, useEffect } from "react";
import { showSuccess, showError } from "./ToastNotification";
import { apiPost, apiPut } from "../utils/api";
import API_ENDPOINTS from "../utils/apiEndpoints";

const initialFormState = {
  developerName: "",
  designation: "",
  department: "",
  phoneNumber: "",
  emergencyContact: "",
  email: "",
  dateOfBirth: "",
  joiningDate: "",
  aadharNumber: "",
  pnaNumber: "",
  bankName: "",
  accountHolderName: "",
  bankAccountNumber: "",
  branch: "",
  fatherName: "",
  bloodGroup: "",
  address: "",
  googleDriveLink: "",
  aadharGoogleDriveLink: "",
  panCardGoogleDriveLink: "",
  profilePhotoUrl: "",
};

const CreateStaff = ({ show, onClose, onSubmit, editingRecord = null }) => {
  const [formData, setFormData] = useState(initialFormState);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

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
        developerName: editingRecord.developerName || "",
        designation: editingRecord.designation || "",
        department: editingRecord.department || "",
        phoneNumber: editingRecord.phoneNumber || "",
        emergencyContact: editingRecord.emergencyContact || "",
        email: editingRecord.email || "",
        dateOfBirth: editingRecord.dateOfBirth || "",
        joiningDate: editingRecord.joiningDate || "",
        aadharNumber: editingRecord.aadharNumber || "",
        pnaNumber: editingRecord.pnaNumber || editingRecord.panNumber || "",
        bankName: editingRecord.bankName || "",
        accountHolderName: editingRecord.accountHolderName || "",
        bankAccountNumber: editingRecord.bankAccountNumber || "",
        branch: editingRecord.branch || "",
        fatherName: editingRecord.fatherName || "",
        bloodGroup: editingRecord.bloodGroup || "",
        address: editingRecord.address || "",
        googleDriveLink: editingRecord.googleDriveLink || "",
        aadharGoogleDriveLink: editingRecord.aadharGoogleDriveLink || "",
        panCardGoogleDriveLink: editingRecord.panCardGoogleDriveLink || "",
        profilePhotoUrl: editingRecord.profilePhotoUrl || "",
      });
    } else {
      setFormData(initialFormState);
      setErrors({});
    }
  }, [editingRecord, show]);

  const fieldNames = {
    developerName: "Developer Name",
    designation: "Designation",
    department: "Department",
    phoneNumber: "Phone Number",
    emergencyContact: "Emergency Contact",
    email: "Email ID",
    dateOfBirth: "Date of Birth",
    joiningDate: "Joining Date",
    aadharNumber: "Aadhar Number",
    pnaNumber: "PNA/PAN Number",
    bankName: "Bank Name",
    accountHolderName: "Account Holder Name",
    bankAccountNumber: "Bank Account Number",
    branch: "Branch",
    fatherName: "Father's Name",
    bloodGroup: "Blood Group",
    address: "Address",
    googleDriveLink: "Google Drive Link",
    aadharGoogleDriveLink: "Aadhar Google Drive Link",
    panCardGoogleDriveLink: "Pan Card Google Drive Link",
    profilePhotoUrl: "Profile Photo",
  };

  const DEPARTMENT_OPTIONS = [
    "Full Stack Development",
    "Website Development",
    "App Development",
    "Digital Marketing",
    "UI/UX Design",
    "SEO",
    "Content Writing",
    "Graphic Design",
    "Other",
  ];

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    if (name === "phoneNumber" || name === "emergencyContact") {
      const numericValue = value.replace(/\D/g, "").slice(0, 10);
      setFormData((prev) => ({ ...prev, [name]: numericValue }));
    } else if (name === "aadharNumber") {
      const numericValue = value.replace(/\D/g, "").slice(0, 12);
      setFormData((prev) => ({ ...prev, [name]: numericValue }));
    } else if (name === "pnaNumber") {
      const upperValue = value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
      setFormData((prev) => ({ ...prev, [name]: upperValue }));
    } else if (name === "bankAccountNumber") {
      const numericValue = value.replace(/\D/g, "").slice(0, 18);
      setFormData((prev) => ({ ...prev, [name]: numericValue }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handlePhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    const maxSize = 5 * 1024 * 1024;

    if (!validTypes.includes(file.type)) {
      showError("Please select a valid image file (JPEG, PNG, WEBP)");
      return;
    }

    if (file.size > maxSize) {
      showError("Image size should be less than 5MB");
      return;
    }

    setUploadingPhoto(true);
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData((prev) => ({
        ...prev,
        profilePhotoUrl: reader.result,
      }));
      setUploadingPhoto(false);
      showSuccess("Profile photo uploaded successfully!");
      if (errors.profilePhotoUrl) {
        setErrors((prev) => ({ ...prev, profilePhotoUrl: "" }));
      }
    };
    reader.readAsDataURL(file);
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

    const requiredFields = [
      "developerName",
      "phoneNumber",
      "email",
      "dateOfBirth",
      "aadharNumber",
      "pnaNumber",
      "fatherName",
      "address",
      "profilePhotoUrl",
    ];

    requiredFields.forEach((field) => {
      if (!formData[field] || formData[field].toString().trim() === "") {
        newErrors[field] = `${fieldNames[field]} is required`;
      }
    });

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    if (formData.phoneNumber && !/^\d{10}$/.test(formData.phoneNumber)) {
      newErrors.phoneNumber = "Phone number must be exactly 10 digits";
    }

    if (
      formData.emergencyContact &&
      !/^\d{10}$/.test(formData.emergencyContact)
    ) {
      newErrors.emergencyContact =
        "Emergency contact number must be exactly 10 digits";
    }

    if (formData.aadharNumber && !/^\d{12}$/.test(formData.aadharNumber)) {
      newErrors.aadharNumber = "Aadhar number must be exactly 12 digits";
    }

    if (
      formData.pnaNumber &&
      !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(formData.pnaNumber)
    ) {
      newErrors.pnaNumber =
        "Please enter a valid PNA/PAN number (e.g. ABCDE1234F)";
    }

    if (formData.dateOfBirth) {
      const dob = new Date(formData.dateOfBirth);
      const today = new Date();
      const minAdultDate = new Date(
        today.getFullYear() - 18,
        today.getMonth(),
        today.getDate(),
      );

      if (dob > today) {
        newErrors.dateOfBirth = "Date of birth cannot be in the future";
      } else if (dob > minAdultDate) {
        newErrors.dateOfBirth = "Staff age must be at least 18 years";
      }
    }

    if (formData.joiningDate && formData.dateOfBirth) {
      const joining = new Date(formData.joiningDate);
      const dob = new Date(formData.dateOfBirth);
      if (joining <= dob) {
        newErrors.joiningDate = "Joining date must be after date of birth";
      }
    }

    if (formData.googleDriveLink) {
      const isDriveLink =
        /^https?:\/\/(drive\.google\.com|docs\.google\.com)\/.+$/i.test(
          formData.googleDriveLink,
        );
      if (!isDriveLink) {
        newErrors.googleDriveLink =
          "Please enter a valid Google Drive or Google Docs link";
      }
    }

    if (formData.aadharGoogleDriveLink) {
      const isDriveLink =
        /^https?:\/\/(drive\.google\.com|docs\.google\.com)\/.+$/i.test(
          formData.aadharGoogleDriveLink,
        );
      if (!isDriveLink) {
        newErrors.aadharGoogleDriveLink =
          "Please enter a valid Google Drive or Google Docs link";
      }
    }

    if (formData.panCardGoogleDriveLink) {
      const isDriveLink =
        /^https?:\/\/(drive\.google\.com|docs\.google\.com)\/.+$/i.test(
          formData.panCardGoogleDriveLink,
        );
      if (!isDriveLink) {
        newErrors.panCardGoogleDriveLink =
          "Please enter a valid Google Drive or Google Docs link";
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!validateForm()) return;

    setSubmitting(true);
    try {
      const submitData = {
        ...formData,
        panNumber: formData.pnaNumber,
        status: editingRecord?.status || "Active",
      };

      if (editingRecord && !editingRecord.isViewMode) {
        const staffId = editingRecord._id || editingRecord.id;
        const { _id, id, ...cleanData } = submitData;
        await apiPut(API_ENDPOINTS.STAFF.UPDATE(staffId), cleanData);
        showSuccess("Staff updated successfully!");
      } else {
        await apiPost(API_ENDPOINTS.STAFF.CREATE, submitData);
        showSuccess("Staff added successfully!");
      }

      onSubmit(submitData);
    } catch (error) {
      console.error("Error saving staff:", error);

      if (error.response?.status === 409) {
        const errorMessage =
          error.response?.data?.error || "Duplicate entry found";

        if (errorMessage.includes("Phone Number")) {
          setErrors((prev) => ({ ...prev, phoneNumber: errorMessage }));
          scrollToField("phoneNumber");
        } else if (errorMessage.includes("Aadhar")) {
          setErrors((prev) => ({ ...prev, aadharNumber: errorMessage }));
          scrollToField("aadharNumber");
        } else if (
          errorMessage.includes("PNA") ||
          errorMessage.includes("PAN")
        ) {
          setErrors((prev) => ({ ...prev, pnaNumber: errorMessage }));
          scrollToField("pnaNumber");
        } else if (errorMessage.includes("Email")) {
          setErrors((prev) => ({ ...prev, email: errorMessage }));
          scrollToField("email");
        }

        showError(errorMessage);
      } else {
        showError(
          error.response?.data?.message ||
            error.response?.data?.error ||
            "Failed to save staff. Please try again.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const RequiredStar = () => <span className="text-danger">*</span>;

  if (!show) return null;

  const modalTitle = editingRecord
    ? editingRecord.isViewMode
      ? `View Staff - ${editingRecord.developerName}`
      : `Edit Staff - ${editingRecord.developerName}`
    : "Add New Staff";

  const isViewMode = editingRecord?.isViewMode;

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
            <form id="staffForm" onSubmit={handleSubmit} noValidate>
              <div className="row g-3">
                <div className="staff-photo-col">
                  <label className="form-label d-block">
                    <i className="fas fa-camera me-2 text-primary"></i>
                    Profile Photo <RequiredStar />
                  </label>
                  <div className="staff-photo-wrapper">
                    <div className="staff-photo-box border border-2 border-dashed d-flex align-items-center justify-content-center overflow-hidden position-relative">
                      {uploadingPhoto ? (
                        <span
                          className="spinner-border text-success"
                          role="status"
                        ></span>
                      ) : formData.profilePhotoUrl ? (
                        <div
                          className="staff-preview-image"
                          style={{
                            backgroundImage: `url(${formData.profilePhotoUrl})`,
                          }}
                        ></div>
                      ) : (
                        <div className="text-center text-muted">
                          <i className="fas fa-user fa-2x mb-2"></i>
                          <p className="mb-0 small">Upload Photo</p>
                        </div>
                      )}

                      {!isViewMode && (
                        <input
                          id="profilePhotoUrl"
                          type="file"
                          className="position-absolute top-0 start-0 w-100 h-100 opacity-0"
                          accept="image/*"
                          onChange={handlePhotoUpload}
                          title="Upload profile photo"
                        />
                      )}
                    </div>
                  </div>
                  {errors.profilePhotoUrl && (
                    <div className="invalid-feedback d-block mt-2">
                      {errors.profilePhotoUrl}
                    </div>
                  )}
                </div>

                <div className="staff-inputs-col">
                  <div className="row g-3">
                    <div className="col-md-3">
                      <label htmlFor="developerName" className="form-label">
                        <i className="fas fa-user me-2 text-primary"></i>
                        Developer Name <RequiredStar />
                      </label>
                      <input
                        type="text"
                        className={`form-control modern-input ${errors.developerName ? "is-invalid" : ""}`}
                        id="developerName"
                        name="developerName"
                        value={formData.developerName}
                        onChange={handleInputChange}
                        placeholder="Enter Developer Name"
                        readOnly={isViewMode}
                      />
                      {errors.developerName && (
                        <div className="invalid-feedback d-block">
                          {errors.developerName}
                        </div>
                      )}
                    </div>

                    <div className="col-md-3">
                      <label htmlFor="fatherName" className="form-label">
                        <i className="fas fa-user-friends me-2 text-primary"></i>
                        Father's Name <RequiredStar />
                      </label>
                      <input
                        type="text"
                        className={`form-control modern-input ${errors.fatherName ? "is-invalid" : ""}`}
                        id="fatherName"
                        name="fatherName"
                        value={formData.fatherName}
                        onChange={handleInputChange}
                        placeholder="Enter Father's Name"
                        readOnly={isViewMode}
                      />
                      {errors.fatherName && (
                        <div className="invalid-feedback d-block">
                          {errors.fatherName}
                        </div>
                      )}
                    </div>

                    <div className="col-md-3">
                      <label htmlFor="designation" className="form-label">
                        <i className="fas fa-briefcase me-2 text-primary"></i>
                        Designation
                      </label>
                      <input
                        type="text"
                        className={`form-control modern-input ${errors.designation ? "is-invalid" : ""}`}
                        id="designation"
                        name="designation"
                        value={formData.designation}
                        onChange={handleInputChange}
                        placeholder="Enter Designation"
                        readOnly={isViewMode}
                      />
                      {errors.designation && (
                        <div className="invalid-feedback d-block">
                          {errors.designation}
                        </div>
                      )}
                    </div>

                    <div className="col-md-3">
                      <label htmlFor="department" className="form-label">
                        <i className="fas fa-sitemap me-2 text-primary"></i>
                        Department
                      </label>
                      <select
                        className={`form-control modern-input ${errors.department ? "is-invalid" : ""}`}
                        id="department"
                        name="department"
                        value={formData.department}
                        onChange={handleInputChange}
                        disabled={isViewMode}
                      >
                        <option value="">Select Department</option>
                        {DEPARTMENT_OPTIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                        {formData.department &&
                          !DEPARTMENT_OPTIONS.includes(formData.department) && (
                            <option value={formData.department}>
                              {formData.department}
                            </option>
                          )}
                      </select>
                      {errors.department && (
                        <div className="invalid-feedback d-block">
                          {errors.department}
                        </div>
                      )}
                    </div>

                    <div className="col-md-3">
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
                          minLength="10"
                          maxLength="10"
                          readOnly={isViewMode}
                        />
                      </div>
                      {errors.phoneNumber && (
                        <div className="invalid-feedback d-block mt-1">
                          {errors.phoneNumber}
                        </div>
                      )}
                    </div>

                    <div className="col-md-3">
                      <label htmlFor="emergencyContact" className="form-label">
                        <i className="fas fa-phone-square-alt me-2 text-primary"></i>
                        Emergency Contact
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
                          className={`form-control modern-input ${errors.emergencyContact ? "is-invalid" : ""}`}
                          id="emergencyContact"
                          name="emergencyContact"
                          value={formData.emergencyContact}
                          onChange={handleInputChange}
                          placeholder="10-digit emergency number"
                          minLength="10"
                          maxLength="10"
                          readOnly={isViewMode}
                        />
                      </div>
                      {errors.emergencyContact && (
                        <div className="invalid-feedback d-block mt-1">
                          {errors.emergencyContact}
                        </div>
                      )}
                    </div>

                    <div className="col-md-3">
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

                    <div className="col-md-3">
                      <label htmlFor="bloodGroup" className="form-label">
                        <i className="fas fa-tint me-2 text-primary"></i>
                        Blood Group
                      </label>
                      <select
                        id="bloodGroup"
                        name="bloodGroup"
                        className={`form-select modern-input ${errors.bloodGroup ? "is-invalid" : ""}`}
                        value={formData.bloodGroup}
                        onChange={handleInputChange}
                        disabled={isViewMode}
                      >
                        <option value="">Select Blood Group</option>
                        <option value="A+">A+</option>
                        <option value="A-">A-</option>
                        <option value="B+">B+</option>
                        <option value="B-">B-</option>
                        <option value="AB+">AB+</option>
                        <option value="AB-">AB-</option>
                        <option value="O+">O+</option>
                        <option value="O-">O-</option>
                      </select>
                      {errors.bloodGroup && (
                        <div className="invalid-feedback d-block">
                          {errors.bloodGroup}
                        </div>
                      )}
                    </div>

                    <div className="col-md-3">
                      <label htmlFor="dateOfBirth" className="form-label">
                        <i className="fas fa-calendar-alt me-2 text-primary"></i>
                        Date of Birth <RequiredStar />
                      </label>
                      <input
                        type="date"
                        className={`form-control modern-input ${errors.dateOfBirth ? "is-invalid" : ""}`}
                        id="dateOfBirth"
                        name="dateOfBirth"
                        value={formData.dateOfBirth}
                        onChange={handleInputChange}
                        readOnly={isViewMode}
                      />
                      {errors.dateOfBirth && (
                        <div className="invalid-feedback d-block">
                          {errors.dateOfBirth}
                        </div>
                      )}
                    </div>

                    <div className="col-md-3">
                      <label htmlFor="joiningDate" className="form-label">
                        <i className="fas fa-calendar-check me-2 text-primary"></i>
                        Joining Date
                      </label>
                      <input
                        type="date"
                        className={`form-control modern-input ${errors.joiningDate ? "is-invalid" : ""}`}
                        id="joiningDate"
                        name="joiningDate"
                        value={formData.joiningDate}
                        onChange={handleInputChange}
                        readOnly={isViewMode}
                      />
                      {errors.joiningDate && (
                        <div className="invalid-feedback d-block">
                          {errors.joiningDate}
                        </div>
                      )}
                    </div>

                    <div className="col-md-3">
                      <label htmlFor="aadharNumber" className="form-label">
                        <i className="fas fa-id-card me-2 text-primary"></i>
                        Aadhar Number <RequiredStar />
                      </label>
                      <input
                        type="text"
                        className={`form-control modern-input ${errors.aadharNumber ? "is-invalid" : ""}`}
                        id="aadharNumber"
                        name="aadharNumber"
                        value={formData.aadharNumber}
                        onChange={handleInputChange}
                        placeholder="Enter 12-digit Aadhar Number"
                        maxLength="12"
                        readOnly={isViewMode}
                      />
                      {errors.aadharNumber && (
                        <div className="invalid-feedback d-block">
                          {errors.aadharNumber}
                        </div>
                      )}
                    </div>

                    <div className="col-md-3">
                      <label htmlFor="pnaNumber" className="form-label">
                        <i className="fas fa-address-card me-2 text-primary"></i>
                        PNA Number (PAN) <RequiredStar />
                      </label>
                      <input
                        type="text"
                        className={`form-control modern-input ${errors.pnaNumber ? "is-invalid" : ""}`}
                        id="pnaNumber"
                        name="pnaNumber"
                        value={formData.pnaNumber}
                        onChange={handleInputChange}
                        placeholder="Enter PAN format (ABCDE1234F)"
                        maxLength="10"
                        readOnly={isViewMode}
                      />
                      {errors.pnaNumber && (
                        <div className="invalid-feedback d-block">
                          {errors.pnaNumber}
                        </div>
                      )}
                    </div>

                    <div className="col-md-3">
                      <label htmlFor="bankName" className="form-label">
                        <i className="fas fa-building-columns me-2 text-primary"></i>
                        Bank Name
                      </label>
                      <input
                        type="text"
                        className={`form-control modern-input ${errors.bankName ? "is-invalid" : ""}`}
                        id="bankName"
                        name="bankName"
                        value={formData.bankName}
                        onChange={handleInputChange}
                        placeholder="Enter Bank Name"
                        readOnly={isViewMode}
                      />
                      {errors.bankName && (
                        <div className="invalid-feedback d-block">
                          {errors.bankName}
                        </div>
                      )}
                    </div>

                    <div className="col-md-3">
                      <label htmlFor="accountHolderName" className="form-label">
                        <i className="fas fa-user-circle me-2 text-primary"></i>
                        Account Holder Name
                      </label>
                      <input
                        type="text"
                        className={`form-control modern-input ${errors.accountHolderName ? "is-invalid" : ""}`}
                        id="accountHolderName"
                        name="accountHolderName"
                        value={formData.accountHolderName}
                        onChange={handleInputChange}
                        placeholder="Enter Account Holder Name"
                        readOnly={isViewMode}
                      />
                      {errors.accountHolderName && (
                        <div className="invalid-feedback d-block">
                          {errors.accountHolderName}
                        </div>
                      )}
                    </div>

                    <div className="col-md-3">
                      <label htmlFor="bankAccountNumber" className="form-label">
                        <i className="fas fa-money-check-dollar me-2 text-primary"></i>
                        Bank Account Number
                      </label>
                      <input
                        type="text"
                        className={`form-control modern-input ${errors.bankAccountNumber ? "is-invalid" : ""}`}
                        id="bankAccountNumber"
                        name="bankAccountNumber"
                        value={formData.bankAccountNumber}
                        onChange={handleInputChange}
                        placeholder="Enter Account Number"
                        maxLength="18"
                        readOnly={isViewMode}
                      />
                      {errors.bankAccountNumber && (
                        <div className="invalid-feedback d-block">
                          {errors.bankAccountNumber}
                        </div>
                      )}
                    </div>

                    <div className="col-md-3">
                      <label htmlFor="branch" className="form-label">
                        <i className="fas fa-code-branch me-2 text-primary"></i>
                        Branch
                      </label>
                      <input
                        type="text"
                        className={`form-control modern-input ${errors.branch ? "is-invalid" : ""}`}
                        id="branch"
                        name="branch"
                        value={formData.branch}
                        onChange={handleInputChange}
                        placeholder="Enter Branch"
                        readOnly={isViewMode}
                      />
                      {errors.branch && (
                        <div className="invalid-feedback d-block">
                          {errors.branch}
                        </div>
                      )}
                    </div>

                    <div className="col-md-3">
                      <label htmlFor="googleDriveLink" className="form-label">
                        <i className="fab fa-google-drive me-2 text-primary"></i>
                        Google Drive Link
                      </label>
                      <input
                        type="url"
                        className={`form-control modern-input ${errors.googleDriveLink ? "is-invalid" : ""}`}
                        id="googleDriveLink"
                        name="googleDriveLink"
                        value={formData.googleDriveLink}
                        onChange={handleInputChange}
                        placeholder="https://drive.google.com/..."
                        readOnly={isViewMode}
                      />
                      {errors.googleDriveLink && (
                        <div className="invalid-feedback d-block">
                          {errors.googleDriveLink}
                        </div>
                      )}
                    </div>

                    <div className="col-md-3">
                      <label
                        htmlFor="aadharGoogleDriveLink"
                        className="form-label"
                      >
                        <i className="fab fa-google-drive me-2 text-primary"></i>
                        Aadhar Google Drive Link
                      </label>
                      <input
                        type="url"
                        className={`form-control modern-input ${errors.aadharGoogleDriveLink ? "is-invalid" : ""}`}
                        id="aadharGoogleDriveLink"
                        name="aadharGoogleDriveLink"
                        value={formData.aadharGoogleDriveLink}
                        onChange={handleInputChange}
                        placeholder="https://drive.google.com/..."
                        readOnly={isViewMode}
                      />
                      {errors.aadharGoogleDriveLink && (
                        <div className="invalid-feedback d-block">
                          {errors.aadharGoogleDriveLink}
                        </div>
                      )}
                    </div>

                    <div className="col-md-3">
                      <label
                        htmlFor="panCardGoogleDriveLink"
                        className="form-label"
                      >
                        <i className="fab fa-google-drive me-2 text-primary"></i>
                        Pan Card Google Drive Link
                      </label>
                      <input
                        type="url"
                        className={`form-control modern-input ${errors.panCardGoogleDriveLink ? "is-invalid" : ""}`}
                        id="panCardGoogleDriveLink"
                        name="panCardGoogleDriveLink"
                        value={formData.panCardGoogleDriveLink}
                        onChange={handleInputChange}
                        placeholder="https://drive.google.com/..."
                        readOnly={isViewMode}
                      />
                      {errors.panCardGoogleDriveLink && (
                        <div className="invalid-feedback d-block">
                          {errors.panCardGoogleDriveLink}
                        </div>
                      )}
                    </div>

                    <div className="col-md-3">
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
                      />
                      {errors.address && (
                        <div className="invalid-feedback d-block">
                          {errors.address}
                        </div>
                      )}
                    </div>
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
                form="staffForm"
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
                    {editingRecord ? "Update Staff" : "Save Staff"}
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

        .staff-photo-wrapper {
          width: 150px;
        }

        .staff-photo-col {
          flex: 0 0 12.5%;
          max-width: 12.5%;
        }

        .staff-inputs-col {
          flex: 0 0 87.5%;
          max-width: 87.5%;
        }

        .staff-photo-box {
          width: 150px;
          height: 150px;
          border-radius: 10px;
          background: #f8f9fa;
          line-height: 0;
        }

        .staff-preview-image {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
          display: block;
        }

        .invalid-feedback.d-block {
          display: block !important;
          margin-top: 5px;
        }

        @media (max-width: 768px) {
          .staff-photo-col,
          .staff-inputs-col {
            flex: 0 0 100%;
            max-width: 100%;
          }

          .staff-photo-wrapper {
            width: 150px;
          }
        }
      `}</style>
    </div>
  );
};

export default CreateStaff;
