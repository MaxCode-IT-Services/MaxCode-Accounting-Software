import React, { useEffect, useMemo, useRef, useState } from "react";
import Select from "react-select";
import SelectRightLoader from "./SelectRightLoader";
import { showError, showSuccess } from "./ToastNotification";
import {
  fetchSelectableClients,
  filterRowsBySearch,
} from "../utils/fetchAllEntities";
import { getUnifiedSelectStyles } from "../utils/reactSelectStyles";

const INITIAL_FORM = {
  clientRefId: "",
  clientName: "",
  businessName: "",
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
  const [internalClientOptions, setInternalClientOptions] = useState([]);
  const [isClientLoading, setIsClientLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const clientSearchDebounceRef = useRef(null);
  const clientAbortControllerRef = useRef(null);
  const clientLoadingResetRef = useRef(null);
  const knownClientRowsRef = useRef([]);

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
        clientName: editingRecord.clientName || "",
        businessName: editingRecord.businessName || "",
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

  useEffect(() => {
    const normalizedOptions = Array.isArray(clientOptions) ? clientOptions : [];
    if (normalizedOptions.length > 0) {
      knownClientRowsRef.current = normalizedOptions;
      setInternalClientOptions(normalizedOptions);
    }
  }, [clientOptions]);

  useEffect(() => {
    if (!isVisible) return;

    const loadClients = async () => {
      if (clientAbortControllerRef.current) {
        clientAbortControllerRef.current.abort();
      }

      const controller = new AbortController();
      clientAbortControllerRef.current = controller;
      setIsClientLoading(true);

      try {
        const rows = await fetchSelectableClients({
          limit: 50,
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        const mappedRows = rows
          .filter((item) => item?.isDeleted !== true)
          .map((client) => ({
            value: client._id || client.id || client.clientId,
            label: `${client.clientName || ""} - ${client.businessName || ""}`,
            clientName: client.clientName || "",
            businessName: client.businessName || "",
          }));

        knownClientRowsRef.current = mappedRows;
        setInternalClientOptions(mappedRows);
      } catch (error) {
        if (error?.name !== "CanceledError" && error?.code !== "ERR_CANCELED") {
          console.error("Failed to fetch clients:", error);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsClientLoading(false);
        }
      }
    };

    loadClients();

    return () => {
      if (clientSearchDebounceRef.current) {
        clearTimeout(clientSearchDebounceRef.current);
      }
      if (clientLoadingResetRef.current) {
        clearTimeout(clientLoadingResetRef.current);
      }
      if (clientAbortControllerRef.current) {
        clientAbortControllerRef.current.abort();
      }
    };
  }, [isVisible]);

  const selectMenuPortalTarget =
    typeof document !== "undefined" ? document.body : null;

  const clientSelectStyles = useMemo(
    () =>
      getUnifiedSelectStyles({
        hasError: Boolean(errors.clientRefId),
      }),
    [errors.clientRefId],
  );

  const selectComponents = useMemo(
    () => ({
      LoadingIndicator: SelectRightLoader,
      IndicatorSeparator: null,
    }),
    [],
  );

  const selectValue =
    internalClientOptions.find(
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
    const selected =
      internalClientOptions.find(
        (item) => String(item.value) === String(option?.value || ""),
      ) || null;

    // Normalize and safely extract fields
    const clientName = selected ? String(selected.clientName || "").trim() : "";
    const businessName = selected
      ? String(selected.businessName || "").trim()
      : "";

    setFormData((prev) => ({
      ...prev,
      clientRefId: option?.value || "",
      clientName: clientName,
      businessName: businessName,
    }));

    if (errors.clientRefId) {
      setErrors((prev) => ({ ...prev, clientRefId: "" }));
    }

    if (errors.clientName || errors.businessName) {
      setErrors((prev) => ({
        ...prev,
        clientName: "",
        businessName: "",
      }));
    }
  };

  const handleClientSearchInput = (inputValue, meta) => {
    if (meta?.action !== "input-change") {
      return inputValue;
    }

    const searchText = String(inputValue || "").trim();

    if (clientLoadingResetRef.current) {
      clearTimeout(clientLoadingResetRef.current);
    }

    setIsClientLoading(Boolean(searchText));

    if (clientSearchDebounceRef.current) {
      clearTimeout(clientSearchDebounceRef.current);
    }

    if (!searchText) {
      setInternalClientOptions(knownClientRowsRef.current.slice(0, 50));
      setIsClientLoading(false);
      if (clientAbortControllerRef.current) {
        clientAbortControllerRef.current.abort();
      }
      return inputValue;
    }

    const localMatches = filterRowsBySearch(
      knownClientRowsRef.current,
      searchText,
      ["label", "clientName", "businessName"],
    );

    if (localMatches.length > 0) {
      setInternalClientOptions(localMatches);
      if (clientAbortControllerRef.current) {
        clientAbortControllerRef.current.abort();
      }
      clientLoadingResetRef.current = setTimeout(() => {
        setIsClientLoading(false);
      }, 180);
      return inputValue;
    }

    clientSearchDebounceRef.current = setTimeout(async () => {
      if (clientAbortControllerRef.current) {
        clientAbortControllerRef.current.abort();
      }

      const controller = new AbortController();
      clientAbortControllerRef.current = controller;
      setIsClientLoading(true);

      try {
        const rows = await fetchSelectableClients({
          search: searchText,
          limit: 50,
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        const mappedRows = rows
          .filter((item) => item?.isDeleted !== true)
          .map((client) => ({
            value: client._id || client.id || client.clientId,
            label: `${client.clientName || ""} - ${client.businessName || ""}`,
            clientName: client.clientName || "",
            businessName: client.businessName || "",
          }));

        knownClientRowsRef.current = [
          ...knownClientRowsRef.current,
          ...mappedRows,
        ].filter((item, index, arr) => {
          const id = String(item?.value || "");
          if (!id) return false;
          return (
            arr.findIndex(
              (candidate) => String(candidate?.value || "") === id,
            ) === index
          );
        });

        setInternalClientOptions(mappedRows);
      } catch (error) {
        if (error?.name !== "CanceledError" && error?.code !== "ERR_CANCELED") {
          console.error("Failed to search clients:", error);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsClientLoading(false);
        }
      }
    }, 350);

    return inputValue;
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

    if (!String(formData.clientName || "").trim()) {
      newErrors.clientName = "Client name is required";
    }

    if (!String(formData.businessName || "").trim()) {
      newErrors.businessName = "Business name is required";
    }

    if (!String(formData.projectName || "").trim()) {
      newErrors.projectName = "Project name is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const buildPayload = () => {
    const selectedClient = internalClientOptions.find(
      (option) => String(option.value) === String(formData.clientRefId),
    );

    const payload = {
      ...formData,
      clientName: formData.clientName || selectedClient?.clientName || "",
      businessName: formData.businessName || selectedClient?.businessName || "",
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

  const renderTextInput = (
    name,
    label,
    placeholder,
    required = false,
    forceReadOnly = false,
  ) => (
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
        readOnly={isViewMode || forceReadOnly}
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
                <div className="col-md-4 mb-3">
                  <label htmlFor="clientRefId" className="form-label">
                    Select Client <span className="text-danger">*</span>
                  </label>
                  <Select
                    inputId="clientRefId"
                    classNamePrefix="react-select"
                    styles={clientSelectStyles}
                    components={selectComponents}
                    isLoading={isClientLoading}
                    menuPortalTarget={selectMenuPortalTarget}
                    menuPosition="fixed"
                    value={selectValue}
                    onChange={handleClientChange}
                    onInputChange={handleClientSearchInput}
                    isDisabled={isViewMode}
                    isSearchable
                    isClearable
                    placeholder="Select Client"
                    options={internalClientOptions}
                  />
                  {errors.clientRefId && (
                    <div className="invalid-feedback d-block">
                      {errors.clientRefId}
                    </div>
                  )}
                </div>

                {renderTextInput(
                  "clientName",
                  "Client Name",
                  "Auto-filled client name",
                  true,
                  true,
                )}

                {renderTextInput(
                  "businessName",
                  "Business Name",
                  "Auto-filled business name",
                  true,
                  true,
                )}

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
