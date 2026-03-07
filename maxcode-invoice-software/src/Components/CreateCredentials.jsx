import React, { useEffect, useMemo, useState } from "react";
import Select from "react-select";
import { showError, showSuccess } from "./ToastNotification";

const INITIAL_FORM = {
  clientRefId: "",
  projectName: "",
  websiteGithubRepoName: "",
  websiteGithubUrl: "",
  appGithubRepoName: "",
  appGithubUrl: "",
  serverName: "",
  serverUsername: "",
  serverPassword: "",
  databaseName: "",
  databaseId: "",
  databasePassword: "",
  appUsername: "",
  appPassword: "",
};

const CreateCredentials = ({
  show,
  onClose,
  onSubmit,
  editingRecord = null,
  clientOptions = [],
}) => {
  const isVisible =
    typeof show === "object" ? Boolean(show?.show) : Boolean(show);
  const isViewMode = Boolean(editingRecord?.isViewMode);

  const [formData, setFormData] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState({});
  const [showPasswords, setShowPasswords] = useState({
    serverPassword: false,
    databasePassword: false,
    appPassword: false,
  });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!isVisible) return;

    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible) return;

    if (editingRecord) {
      setFormData({
        clientRefId: editingRecord.clientRefId || "",
        projectName: editingRecord.projectName || "",
        websiteGithubRepoName: editingRecord.websiteGithubRepoName || "",
        websiteGithubUrl: editingRecord.websiteGithubUrl || "",
        appGithubRepoName: editingRecord.appGithubRepoName || "",
        appGithubUrl: editingRecord.appGithubUrl || "",
        serverName: editingRecord.serverName || "",
        serverUsername: editingRecord.serverUsername || "",
        serverPassword: editingRecord.serverPassword || "",
        databaseName: editingRecord.databaseName || "",
        databaseId: editingRecord.databaseId || "",
        databasePassword: editingRecord.databasePassword || "",
        appUsername: editingRecord.appUsername || "",
        appPassword: editingRecord.appPassword || "",
      });
    } else {
      setFormData(INITIAL_FORM);
    }

    setErrors({});
    setShowPasswords({
      serverPassword: false,
      databasePassword: false,
      appPassword: false,
    });
  }, [editingRecord, isVisible]);

  const selectMenuPortalTarget =
    typeof document !== "undefined" ? document.body : null;

  const clientSelectStyles = useMemo(
    () => ({
      control: (base, state) => ({
        ...base,
        minHeight: "38px",
        border: errors.clientRefId
          ? "2px solid #dc3545"
          : state.isFocused
            ? "2px solid #667eea"
            : "2px solid #e9ecef",
        borderRadius: "10px",
        boxShadow: state.isFocused
          ? "0 0 0 .25rem rgba(102, 126, 234, 0.15)"
          : "none",
      }),
      menu: (base) => ({ ...base, zIndex: 20 }),
      menuPortal: (base) => ({ ...base, zIndex: 9999 }),
      option: (base, state) => ({
        ...base,
        backgroundColor: state.isSelected
          ? "#007026"
          : state.isFocused
            ? "rgba(0, 112, 38, 0.15)"
            : base.backgroundColor,
        color: state.isSelected ? "#fff" : "#212529",
      }),
    }),
    [errors.clientRefId],
  );

  const selectValue =
    clientOptions.find(
      (option) => String(option.value) === String(formData.clientRefId),
    ) || null;

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleClientChange = (option) => {
    setFormData((prev) => ({
      ...prev,
      clientRefId: option?.value || "",
    }));

    if (errors.clientRefId) {
      setErrors((prev) => ({ ...prev, clientRefId: "" }));
    }
  };

  const togglePasswordVisibility = (field) => {
    setShowPasswords((prev) => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  const handleCopyValue = async (field) => {
    try {
      const value = String(formData[field] || "");
      if (!value) {
        showError("Nothing to copy");
        return;
      }

      await navigator.clipboard.writeText(value);
      showSuccess("Copied to clipboard");
    } catch (error) {
      showError("Copy failed. Please try again.");
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!String(formData.clientRefId || "").trim()) {
      newErrors.clientRefId = "Please select client";
    }

    if (!String(formData.projectName || "").trim()) {
      newErrors.projectName = "Project name is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const buildPayload = () => {
    const selectedClient = clientOptions.find(
      (option) => String(option.value) === String(formData.clientRefId),
    );

    const payload = {
      ...formData,
      clientName: selectedClient?.clientName || "",
      businessName: selectedClient?.businessName || "",
    };

    if (editingRecord?.id) {
      payload.id = editingRecord.id;
      payload.createdDateTime = editingRecord.createdDateTime;
    }

    return payload;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isViewMode) {
      onClose();
      return;
    }

    if (!validateForm()) {
      showError("Please fix required fields");
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit(buildPayload());
    } finally {
      setSubmitting(false);
    }
  };

  if (!isVisible) return null;

  const modalTitle = editingRecord
    ? isViewMode
      ? `View Credentials - ${editingRecord.projectName || ""}`
      : `Edit Credentials - ${editingRecord.projectName || ""}`
    : "Add Project Credentials";

  const renderTextInput = (name, label, placeholder, required = false) => (
    <div className="col-md-4 mb-3">
      <label htmlFor={name} className="form-label">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      <input
        id={name}
        name={name}
        type="text"
        className={`form-control modern-input ${errors[name] ? "is-invalid" : ""}`}
        value={formData[name] || ""}
        onChange={handleInputChange}
        readOnly={isViewMode}
        placeholder={placeholder}
      />
      {errors[name] && (
        <div className="invalid-feedback d-block">{errors[name]}</div>
      )}
    </div>
  );

  const renderPasswordInput = (name, label, placeholder) => (
    <div className="col-md-4 mb-3" key={name}>
      <label htmlFor={name} className="form-label">
        {label}
      </label>
      <div className="input-group">
        <input
          id={name}
          name={name}
          type={showPasswords[name] ? "text" : "password"}
          className="form-control modern-input"
          value={formData[name] || ""}
          onChange={handleInputChange}
          readOnly={isViewMode}
          placeholder={placeholder}
          autoComplete="new-password"
        />
        <button
          type="button"
          className="btn btn-outline-secondary"
          onClick={() => togglePasswordVisibility(name)}
        >
          <i
            className={`fas ${showPasswords[name] ? "fa-eye-slash" : "fa-eye"}`}
          ></i>
        </button>
        <button
          type="button"
          className="btn btn-outline-primary"
          onClick={() => handleCopyValue(name)}
        >
          <i className="fas fa-copy"></i>
        </button>
      </div>
    </div>
  );

  return (
    <div
      className={`modal ${isVisible ? "show d-block" : "d-none"}`}
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

          <div
            className="modal-body"
            style={{ maxHeight: "78vh", overflowY: "auto" }}
          >
            <form id="credentialsForm" onSubmit={handleSubmit} noValidate>
              <div className="row mb-2">
                <div className="col-12">
                  <h6 className="border-bottom pb-2 mb-3">
                    <i className="fas fa-key me-2 text-primary"></i>
                    Project Credentials Details
                  </h6>
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="clientRefId" className="form-label">
                    Select Client <span className="text-danger">*</span>
                  </label>
                  <Select
                    inputId="clientRefId"
                    classNamePrefix="react-select"
                    styles={clientSelectStyles}
                    menuPortalTarget={selectMenuPortalTarget}
                    menuPosition="fixed"
                    value={selectValue}
                    onChange={handleClientChange}
                    isDisabled={isViewMode}
                    isSearchable
                    isClearable
                    placeholder="Select Client"
                    options={clientOptions}
                  />
                  {errors.clientRefId && (
                    <div className="invalid-feedback d-block">
                      {errors.clientRefId}
                    </div>
                  )}
                </div>

                {renderTextInput(
                  "projectName",
                  "Project Name",
                  "Enter project name",
                  true,
                )}
                {renderTextInput(
                  "websiteGithubRepoName",
                  "Website Github Repo Name",
                  "Enter website repo name",
                )}
                {renderTextInput(
                  "websiteGithubUrl",
                  "Website Github URL",
                  "https://github.com/...",
                )}
                {renderTextInput(
                  "appGithubRepoName",
                  "App Github Repo Name",
                  "Enter app repo name",
                )}
                {renderTextInput(
                  "appGithubUrl",
                  "App Github URL",
                  "https://github.com/...",
                )}
                {renderTextInput(
                  "serverName",
                  "Server Name",
                  "Enter server name",
                )}
                {renderTextInput(
                  "serverUsername",
                  "Server UserName",
                  "Enter server username",
                )}
                {renderPasswordInput(
                  "serverPassword",
                  "Server Password",
                  "Enter server password",
                )}
                {renderTextInput(
                  "databaseName",
                  "Database Name",
                  "Enter database name",
                )}
                {renderTextInput(
                  "databaseId",
                  "Database ID",
                  "Enter database ID",
                )}
                {renderPasswordInput(
                  "databasePassword",
                  "Database Password",
                  "Enter database password",
                )}
                {renderTextInput(
                  "appUsername",
                  "App User Name",
                  "Enter app username",
                )}
                {renderPasswordInput(
                  "appPassword",
                  "App Password",
                  "Enter app password",
                )}
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
                form="credentialsForm"
                className="btn btn-primary"
                disabled={submitting}
              >
                {submitting
                  ? "Saving..."
                  : editingRecord
                    ? "Update Credentials"
                    : "Save Credentials"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateCredentials;
