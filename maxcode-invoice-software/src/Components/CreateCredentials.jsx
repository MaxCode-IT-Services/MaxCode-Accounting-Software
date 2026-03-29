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
  customFields: [],
};

const CUSTOM_FIELD_TYPES = [
  { value: "color", label: "Color" },
  { value: "date", label: "Date" },
  { value: "datetime", label: "Date & Time" },
  { value: "email", label: "Email" },
  { value: "month", label: "Month" },
  { value: "number", label: "Number" },
  { value: "numeric", label: "Numeric Value" },
  { value: "option", label: "Option" },
  { value: "password", label: "Password" },
  { value: "phone", label: "Phone Number" },
  { value: "text", label: "Text" },
  { value: "textarea", label: "Textarea" },
  { value: "time", label: "Time" },
  { value: "url", label: "URL" },
  { value: "week", label: "Week" },
];

const createCustomFieldRow = (seed = Date.now()) => ({
  id: `${seed}-${Math.random().toString(36).slice(2, 8)}`,
  type: "text",
  name: "",
  value: "",
  required: false,
  optionsText: "",
});

const normalizeCustomFieldsForForm = (fields) => {
  if (!Array.isArray(fields)) return [];

  return fields.map((field, index) => ({
    id:
      String(field?.id || "").trim() ||
      `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
    type:
      String(field?.type || "text")
        .trim()
        .toLowerCase() || "text",
    name: String(field?.name || "").trim(),
    value: String(field?.value || ""),
    required: field?.required === true,
    optionsText: Array.isArray(field?.options)
      ? field.options
          .map((item) => String(item || "").trim())
          .filter(Boolean)
          .join(", ")
      : String(field?.optionsText || "").trim(),
  }));
};

const normalizeCustomFieldsForPayload = (fields) => {
  if (!Array.isArray(fields)) return [];

  return fields
    .map((field, index) => {
      const type =
        String(field?.type || "text")
          .trim()
          .toLowerCase() || "text";
      const options =
        type === "option"
          ? String(field?.optionsText || "")
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean)
          : [];

      return {
        id:
          String(field?.id || "").trim() ||
          `${Date.now()}-${index}-${Math.random().toString(36).slice(2, 6)}`,
        type,
        name: String(field?.name || "").trim(),
        value: String(field?.value || "").trim(),
        required: field?.required === true,
        options,
      };
    })
    .filter((field) => field.name || field.value || field.options.length > 0);
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
  const [customPasswordVisibility, setCustomPasswordVisibility] = useState({});
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
        customFields: normalizeCustomFieldsForForm(editingRecord.customFields),
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
    setCustomPasswordVisibility({});
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

  const customFieldTypeSelectStyles = useMemo(
    () => getUnifiedSelectStyles({ hasError: false }),
    [],
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

  const addCustomField = () => {
    setFormData((prev) => ({
      ...prev,
      customFields: [...(prev.customFields || []), createCustomFieldRow()],
    }));
  };

  const removeCustomField = (fieldId) => {
    const targetField = (formData.customFields || []).find(
      (field) => field.id === fieldId,
    );
    const hasLockedValue = Boolean(String(targetField?.value || "").trim());

    if (hasLockedValue) {
      showError("Value filled field cannot be deleted");
      return;
    }

    setFormData((prev) => ({
      ...prev,
      customFields: (prev.customFields || []).filter(
        (field) => field.id !== fieldId,
      ),
    }));

    setCustomPasswordVisibility((prev) => {
      const next = { ...prev };
      delete next[fieldId];
      return next;
    });
  };

  const updateCustomField = (fieldId, key, value) => {
    setFormData((prev) => ({
      ...prev,
      customFields: (prev.customFields || []).map((field) => {
        if (field.id !== fieldId) return field;

        if (key === "type") {
          const nextType = String(value || "text").toLowerCase();
          return {
            ...field,
            type: nextType,
            value: nextType === "option" ? "" : field.value,
            optionsText: nextType === "option" ? field.optionsText : "",
          };
        }

        if (key === "value" && field.type === "phone") {
          return {
            ...field,
            value: String(value || "")
              .replace(/\D/g, "")
              .slice(0, 10),
          };
        }

        return { ...field, [key]: value };
      }),
    }));
  };

  const toggleCustomPasswordVisibility = (fieldId) => {
    setCustomPasswordVisibility((prev) => ({
      ...prev,
      [fieldId]: !prev[fieldId],
    }));
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

    const customFields = Array.isArray(formData.customFields)
      ? formData.customFields
      : [];

    const hasInvalidCustomField = customFields.some((field) => {
      const hasName = Boolean(String(field?.name || "").trim());
      const hasValue = Boolean(String(field?.value || "").trim());
      const hasOptions = Boolean(String(field?.optionsText || "").trim());
      const isRequired = field?.required === true;

      if (!hasName && (hasValue || hasOptions)) return true;
      if (field?.type === "option" && hasName && !hasOptions) return true;
      if (isRequired && !hasValue) return true;
      return false;
    });

    if (hasInvalidCustomField) {
      newErrors.customFields = "Field Name, options, and value are required.";
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
      customFields: normalizeCustomFieldsForPayload(formData.customFields),
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

  const sortedCustomFields = (() => {
    const fields = Array.isArray(formData.customFields)
      ? formData.customFields
      : [];
    return [...fields].sort((a, b) => {
      const nameA = String(a?.name || "")
        .trim()
        .toLowerCase();
      const nameB = String(b?.name || "")
        .trim()
        .toLowerCase();

      if (!nameA && !nameB) return 0;
      if (!nameA) return 1;
      if (!nameB) return -1;
      return nameA.localeCompare(nameB);
    });
  })();

  const getCustomFieldInputType = (type) => {
    if (type === "number" || type === "numeric") return "number";
    if (type === "date") return "date";
    if (type === "time") return "time";
    if (type === "datetime") return "datetime-local";
    if (type === "month") return "month";
    if (type === "week") return "week";
    if (type === "email") return "email";
    if (type === "phone") return "tel";
    if (type === "url") return "url";
    if (type === "color") return "color";
    return "text";
  };

  const renderCustomFieldValueInput = (field, compact = false) => {
    const inputClass = compact
      ? "form-control modern-input form-control-sm"
      : "form-control modern-input";

    if (field.type === "password") {
      return (
        <div className="input-group">
          <input
            type={customPasswordVisibility[field.id] ? "text" : "password"}
            className={inputClass}
            value={field.value || ""}
            onChange={(e) =>
              updateCustomField(field.id, "value", e.target.value)
            }
            readOnly={isViewMode}
            placeholder="Enter value"
            autoComplete="new-password"
          />
          <button
            type="button"
            className={`btn btn-outline-secondary ${compact ? "rounded-end-3" : ""}`}
            onClick={() => toggleCustomPasswordVisibility(field.id)}
            disabled={isViewMode}
          >
            <i
              className={`fas ${
                customPasswordVisibility[field.id] ? "fa-eye-slash" : "fa-eye"
              }`}
            ></i>
          </button>
        </div>
      );
    }

    if (field.type === "phone") {
      return (
        <div className="input-group">
          <span
            className="input-group-text"
            style={{
              background: "linear-gradient(135deg, #ff9933, #ffffff, #138808)",
              border: "2px solid #e9ecef",
              borderRight: "none",
              borderRadius: "10px 0 0 10px",
              fontWeight: 600,
              color: "#333",
            }}
          >
            <img
              src="https://flagcdn.com/w40/in.png"
              alt="India"
              style={{
                width: "20px",
                height: "15px",
                marginRight: "8px",
                borderRadius: "2px",
              }}
            />
            +91
          </span>
          <input
            type="tel"
            className={inputClass}
            value={field.value || ""}
            onChange={(e) =>
              updateCustomField(field.id, "value", e.target.value)
            }
            readOnly={isViewMode}
            minLength={10}
            maxLength={10}
            placeholder="10-digit mobile number"
          />
        </div>
      );
    }

    if (field.type === "option") {
      const dynamicOptionValues = String(field.optionsText || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map((optionValue) => ({
          value: optionValue,
          label: optionValue,
        }));

      const optionValueOptions = [
        { value: "", label: "Select Option" },
        ...dynamicOptionValues,
      ];

      const selectedOptionValue =
        optionValueOptions.find(
          (option) => String(option.value) === String(field.value || ""),
        ) || optionValueOptions[0];

      return (
        <Select
          classNamePrefix="react-select"
          styles={customFieldTypeSelectStyles}
          components={selectComponents}
          menuPortalTarget={selectMenuPortalTarget}
          menuPosition="fixed"
          menuPlacement="auto"
          isSearchable
          isClearable={false}
          isDisabled={isViewMode || dynamicOptionValues.length === 0}
          value={selectedOptionValue}
          onChange={(selectedOption) =>
            updateCustomField(field.id, "value", selectedOption?.value || "")
          }
          options={optionValueOptions}
          placeholder={
            dynamicOptionValues.length > 0
              ? "Select option"
              : "First add options in Options field"
          }
        />
      );
    }

    if (field.type === "textarea") {
      return (
        <textarea
          className={inputClass}
          rows={compact ? 1 : 3}
          value={field.value || ""}
          onChange={(e) => updateCustomField(field.id, "value", e.target.value)}
          readOnly={isViewMode}
          placeholder="Enter value"
        />
      );
    }

    return (
      <input
        type={getCustomFieldInputType(field.type)}
        className={inputClass}
        value={field.value || ""}
        onChange={(e) => updateCustomField(field.id, "value", e.target.value)}
        readOnly={isViewMode}
        placeholder="Enter value"
      />
    );
  };

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
          className="btn btn-outline-primary rounded-end-3"
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
                    menuPlacement="auto"
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

                <div className="col-12 mb-2 mt-2">
                  <div className="d-flex justify-content-between align-items-center border-bottom pb-2 mb-3">
                    <h6 className="mb-0">
                      <i className="fas fa-sliders-h me-2 text-info"></i>
                      Custom Fields Details
                    </h6>
                  </div>

                  {errors.customFields && (
                    <div className="alert alert-danger">
                      {errors.customFields}
                    </div>
                  )}

                  {(formData.customFields || []).length === 0 ? (
                    <div className="border rounded-3 p-4 text-center bg-light-subtle">
                      <div
                        className="mx-auto mb-2 d-inline-flex align-items-center justify-content-center rounded-circle"
                        style={{
                          width: "54px",
                          height: "54px",
                          background: "#e8f5ee",
                        }}
                      >
                        <i className="fas fa-layer-group text-success fs-5"></i>
                      </div>
                      <h6 className="mb-1 fw-bold text-dark">
                        No Custom Fields Added
                      </h6>
                      <p className="mb-0 text-muted small">
                        Add custom metadata like Port, API Key, Launch Date,
                        Billing Cycle, and more.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="table-responsive d-none d-lg-block">
                        <table className="table table-bordered table-hover">
                          <thead className="table-success">
                            <tr>
                              <th style={{ width: "50px" }}>S.N</th>
                              <th style={{ width: "150px" }}>Field Type</th>
                              <th style={{ width: "220px" }}>Field Name</th>
                              <th style={{ width: "240px" }}>Field Value</th>
                              <th style={{ width: "220px" }}>Options</th>
                              <th
                                style={{ width: "90px" }}
                                className="text-center"
                              >
                                Required
                              </th>
                              <th
                                style={{ width: "80px" }}
                                className="text-center"
                              >
                                Action
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {sortedCustomFields.map((field, index) => (
                              <tr key={field.id}>
                                <td className="text-center align-middle">
                                  <strong>{index + 1}</strong>
                                </td>
                                <td>
                                  <Select
                                    classNamePrefix="react-select"
                                    styles={customFieldTypeSelectStyles}
                                    components={selectComponents}
                                    menuPortalTarget={selectMenuPortalTarget}
                                    menuPosition="fixed"
                                    menuPlacement="auto"
                                    isSearchable
                                    isDisabled={isViewMode}
                                    value={
                                      CUSTOM_FIELD_TYPES.find(
                                        (option) => option.value === field.type,
                                      ) || CUSTOM_FIELD_TYPES[0]
                                    }
                                    onChange={(selectedOption) =>
                                      updateCustomField(
                                        field.id,
                                        "type",
                                        selectedOption?.value || "text",
                                      )
                                    }
                                    options={CUSTOM_FIELD_TYPES}
                                  />
                                </td>
                                <td>
                                  <input
                                    type="text"
                                    className="form-control modern-input form-control-sm"
                                    placeholder="e.g. SMTP Port"
                                    value={field.name || ""}
                                    onChange={(e) =>
                                      updateCustomField(
                                        field.id,
                                        "name",
                                        e.target.value,
                                      )
                                    }
                                    readOnly={isViewMode}
                                  />
                                </td>
                                <td>
                                  {renderCustomFieldValueInput(field, true)}
                                </td>
                                <td>
                                  <input
                                    type="text"
                                    className="form-control modern-input form-control-sm"
                                    placeholder="Option A, Option B"
                                    value={field.optionsText || ""}
                                    onChange={(e) =>
                                      updateCustomField(
                                        field.id,
                                        "optionsText",
                                        e.target.value,
                                      )
                                    }
                                    readOnly={
                                      isViewMode || field.type !== "option"
                                    }
                                  />
                                </td>
                                <td className="text-center align-middle">
                                  <div className="form-check d-flex justify-content-center m-0">
                                    <input
                                      type="checkbox"
                                      className="form-check-input"
                                      checked={field.required === true}
                                      onChange={(e) =>
                                        updateCustomField(
                                          field.id,
                                          "required",
                                          e.target.checked,
                                        )
                                      }
                                      disabled={isViewMode}
                                    />
                                  </div>
                                </td>
                                <td className="text-center align-middle">
                                  {!isViewMode && (
                                    <button
                                      type="button"
                                      className="btn btn-danger btn-sm"
                                      onClick={() =>
                                        removeCustomField(field.id)
                                      }
                                      disabled={Boolean(
                                        String(field.value || "").trim(),
                                      )}
                                      title={
                                        Boolean(
                                          String(field.value || "").trim(),
                                        )
                                          ? "Filled value field cannot be deleted"
                                          : "Delete"
                                      }
                                    >
                                      <i className="fas fa-trash"></i>
                                    </button>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <div className="d-lg-none">
                        {sortedCustomFields.map((field, index) => (
                          <div
                            key={field.id}
                            className="card border mb-3 shadow-sm"
                          >
                            <div className="card-header d-flex justify-content-between align-items-center bg-light">
                              <strong>Field {index + 1}</strong>
                              {!isViewMode && (
                                <button
                                  type="button"
                                  className="btn btn-danger btn-sm"
                                  onClick={() => removeCustomField(field.id)}
                                  disabled={Boolean(
                                    String(field.value || "").trim(),
                                  )}
                                  title={
                                    Boolean(String(field.value || "").trim())
                                      ? "Filled value field cannot be deleted"
                                      : "Delete"
                                  }
                                >
                                  <i className="fas fa-trash"></i>
                                </button>
                              )}
                            </div>
                            <div className="card-body">
                              <div className="row">
                                <div className="col-12 mb-3">
                                  <label className="form-label fw-semibold">
                                    Field Type
                                  </label>
                                  <Select
                                    classNamePrefix="react-select"
                                    styles={customFieldTypeSelectStyles}
                                    components={selectComponents}
                                    menuPortalTarget={selectMenuPortalTarget}
                                    menuPosition="fixed"
                                    menuPlacement="auto"
                                    isSearchable
                                    isDisabled={isViewMode}
                                    value={
                                      CUSTOM_FIELD_TYPES.find(
                                        (option) => option.value === field.type,
                                      ) || CUSTOM_FIELD_TYPES[0]
                                    }
                                    onChange={(selectedOption) =>
                                      updateCustomField(
                                        field.id,
                                        "type",
                                        selectedOption?.value || "text",
                                      )
                                    }
                                    options={CUSTOM_FIELD_TYPES}
                                  />
                                </div>

                                <div className="col-12 mb-3">
                                  <label className="form-label fw-semibold">
                                    Field Name
                                  </label>
                                  <input
                                    type="text"
                                    className="form-control modern-input"
                                    placeholder="e.g. SMTP Port"
                                    value={field.name || ""}
                                    onChange={(e) =>
                                      updateCustomField(
                                        field.id,
                                        "name",
                                        e.target.value,
                                      )
                                    }
                                    readOnly={isViewMode}
                                  />
                                </div>

                                <div className="col-12 mb-3">
                                  <label className="form-label fw-semibold">
                                    Field Value
                                  </label>
                                  {renderCustomFieldValueInput(field)}
                                </div>

                                <div className="col-12 mb-3">
                                  <label className="form-label fw-semibold">
                                    Options
                                  </label>
                                  <input
                                    type="text"
                                    className="form-control modern-input"
                                    placeholder="Option A, Option B"
                                    value={field.optionsText || ""}
                                    onChange={(e) =>
                                      updateCustomField(
                                        field.id,
                                        "optionsText",
                                        e.target.value,
                                      )
                                    }
                                    readOnly={
                                      isViewMode || field.type !== "option"
                                    }
                                  />
                                </div>

                                <div className="col-12">
                                  <div className="form-check form-switch d-flex align-items-center gap-2">
                                    <input
                                      className="form-check-input"
                                      type="checkbox"
                                      checked={field.required === true}
                                      onChange={(e) =>
                                        updateCustomField(
                                          field.id,
                                          "required",
                                          e.target.checked,
                                        )
                                      }
                                      disabled={isViewMode}
                                    />
                                    <label className="form-check-label fw-semibold">
                                      Required
                                    </label>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}

                  {!isViewMode && (
                    <button
                      type="button"
                      className="btn btn-success btn-sm mt-2"
                      onClick={addCustomField}
                    >
                      <i className="fas fa-plus me-2"></i>
                      Add More
                    </button>
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
