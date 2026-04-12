import React, { useEffect, useMemo, useRef, useState } from "react";
import Select from "react-select";
import SelectRightLoader from "./SelectRightLoader";
import ConfirmationModal from "./ConfirmationModal";
import { showError, showSuccess } from "./ToastNotification";
import { apiGet } from "../utils/api";
import API_ENDPOINTS from "../utils/apiEndpoints";
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
  websiteLink: "",
  appGithubRepoName: "",
  appGithubUrl: "",
  androidAppLink: "",
  iosRepoName: "",
  iosRepoUrl: "",
  iosAppLink: "",
  serverName: "",
  serverRootUsername: "",
  serverRootPassword: "",
  serverPortNumber: "",
  databaseName: "",
  databaseRootUsername: "",
  databaseRootPassword: "",
  databasePortNumber: "",
  appUsername: "",
  appPassword: "",
  customFields: [],
};

const SECRET_MASK = "********";
const SECRET_AUTO_HIDE_MS = 45 * 1000;
const getHiddenSecretInputStyle = (value = "") => {
  if (!String(value || "").trim()) return undefined;
  return {
    color: "transparent",
    textShadow: "0 0 6px rgba(33, 37, 41, 0.75)",
    transition: "text-shadow 0.2s ease",
  };
};
const SECRET_CUSTOM_FIELD_TYPES = [
  "password",
  "env-variable",
  "api-key",
  "client-id",
  "client-secret",
  "refresh-token",
  "access-token",
  "secret",
  "bearer-token",
  "user-id",
];

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
  { value: "env-variable", label: "Environment Variable" },
  { value: "api-key", label: "API Key" },
  { value: "client-id", label: "Client ID" },
  { value: "client-secret", label: "Client Secret" },
  { value: "user-id", label: "User/ID" },
  { value: "refresh-token", label: "Refresh Token" },
  { value: "access-token", label: "Access Token" },
  { value: "secret", label: "Secret" },
  { value: "bearer-token", label: "Bearer Token" },
  { value: "phone", label: "Phone Number" },
  { value: "text", label: "Text" },
  { value: "textarea", label: "Textarea" },
  { value: "time", label: "Time" },
  { value: "url", label: "URL" },
  { value: "week", label: "Week" },
].sort((a, b) =>
  a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
);

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

const isSecretCustomFieldType = (type = "") =>
  SECRET_CUSTOM_FIELD_TYPES.includes(
    String(type || "")
      .trim()
      .toLowerCase(),
  );

const CreateMaxcodeCredential = ({
  show,
  onClose,
  onSubmit,
  editingRecord = null,
  clientOptions = [],
}) => {
  const isVisible =
    typeof show === "object" ? Boolean(show?.show) : Boolean(show);
  const isViewMode = Boolean(editingRecord?.isViewMode);
  const hasPersistedRecord = Boolean(editingRecord?.id || editingRecord?._id);

  const getCustomFieldSignature = (name = "", type = "") =>
    `${String(type || "")
      .trim()
      .toLowerCase()}::${String(name || "")
      .trim()
      .toLowerCase()}`;

  const persistedCustomFieldIds = useMemo(() => {
    const existingFields = Array.isArray(editingRecord?.customFields)
      ? editingRecord.customFields
      : [];

    return new Set(
      existingFields
        .map((field) => String(field?.id || "").trim())
        .filter(Boolean),
    );
  }, [editingRecord]);

  const persistedCustomFieldSignatures = useMemo(() => {
    const existingFields = Array.isArray(editingRecord?.customFields)
      ? editingRecord.customFields
      : [];

    return new Set(
      existingFields
        .map((field) =>
          getCustomFieldSignature(
            String(field?.name || ""),
            String(field?.type || ""),
          ),
        )
        .filter((signature) => signature !== "::"),
    );
  }, [editingRecord]);

  const [formData, setFormData] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState({});
  const [showPasswords, setShowPasswords] = useState({
    serverRootUsername: false,
    serverRootPassword: false,
    databaseRootUsername: false,
    databaseRootPassword: false,
    appUsername: false,
    appPassword: false,
  });
  const [customPasswordVisibility, setCustomPasswordVisibility] = useState({});
  const [internalClientOptions, setInternalClientOptions] = useState([]);
  const [isClientLoading, setIsClientLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [secretLoading, setSecretLoading] = useState({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [customFieldToDelete, setCustomFieldToDelete] = useState(null);
  const clientSearchDebounceRef = useRef(null);
  const clientAbortControllerRef = useRef(null);
  const clientLoadingResetRef = useRef(null);
  const knownClientRowsRef = useRef([]);
  const secretAutoHideTimersRef = useRef({});

  const clearSecretAutoHideTimer = (key) => {
    if (!key) return;
    const existingTimer = secretAutoHideTimersRef.current[key];
    if (existingTimer) {
      clearTimeout(existingTimer);
      delete secretAutoHideTimersRef.current[key];
    }
  };

  const clearAllSecretAutoHideTimers = () => {
    Object.keys(secretAutoHideTimersRef.current).forEach((key) => {
      clearSecretAutoHideTimer(key);
    });
  };

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
        websiteLink: editingRecord.websiteLink || "",
        appGithubRepoName: editingRecord.appGithubRepoName || "",
        appGithubUrl: editingRecord.appGithubUrl || "",
        androidAppLink: editingRecord.androidAppLink || "",
        iosRepoName: editingRecord.iosRepoName || "",
        iosRepoUrl: editingRecord.iosRepoUrl || "",
        iosAppLink: editingRecord.iosAppLink || "",
        serverName: editingRecord.serverName || "",
        serverRootUsername:
          editingRecord.serverRootUsername ||
          editingRecord.serverUsername ||
          "",
        serverRootPassword:
          editingRecord.serverRootPassword ||
          editingRecord.serverPassword ||
          "",
        serverPortNumber: editingRecord.serverPortNumber || "",
        databaseName: editingRecord.databaseName || "",
        databaseRootUsername:
          editingRecord.databaseRootUsername || editingRecord.databaseId || "",
        databaseRootPassword:
          editingRecord.databaseRootPassword ||
          editingRecord.databasePassword ||
          "",
        databasePortNumber: editingRecord.databasePortNumber || "",
        appUsername: editingRecord.appUsername || "",
        appPassword: editingRecord.appPassword || "",
        customFields: normalizeCustomFieldsForForm(editingRecord.customFields),
      });
    } else {
      setFormData(INITIAL_FORM);
    }

    setErrors({});
    setShowPasswords({
      serverRootUsername: false,
      serverRootPassword: false,
      databaseRootUsername: false,
      databaseRootPassword: false,
      appUsername: false,
      appPassword: false,
    });
    setCustomPasswordVisibility({});
  }, [editingRecord, isVisible]);

  useEffect(() => {
    if (isVisible) return;

    clearAllSecretAutoHideTimers();
    setShowPasswords({
      serverRootUsername: false,
      serverRootPassword: false,
      databaseRootUsername: false,
      databaseRootPassword: false,
      appUsername: false,
      appPassword: false,
    });
    setCustomPasswordVisibility({});
  }, [isVisible]);

  useEffect(() => {
    return () => {
      clearAllSecretAutoHideTimers();
    };
  }, []);

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

    if (showPasswords[name]) {
      const key = getSecretStateKey(name);
      clearSecretAutoHideTimer(key);
      secretAutoHideTimersRef.current[key] = setTimeout(() => {
        setShowPasswords((prev) => ({ ...prev, [name]: false }));
        clearSecretAutoHideTimer(key);
      }, SECRET_AUTO_HIDE_MS);
    }

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

  const requestRemoveCustomField = (fieldId) => {
    const targetField = (formData.customFields || []).find(
      (field) => field.id === fieldId,
    );
    const hasLockedValue = Boolean(String(targetField?.value || "").trim());

    if (hasLockedValue) {
      showError("Value filled field cannot be deleted");
      return;
    }

    setCustomFieldToDelete(fieldId);
    setShowDeleteConfirm(true);
  };

  const confirmRemoveCustomField = () => {
    if (!customFieldToDelete) return;
    removeCustomField(customFieldToDelete);
    setCustomFieldToDelete(null);
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

        const updatedField = { ...field, [key]: value };

        if (
          key === "value" &&
          isSecretCustomFieldType(field?.type) &&
          customPasswordVisibility[fieldId]
        ) {
          const timerKey = getSecretStateKey(field.type, fieldId);
          clearSecretAutoHideTimer(timerKey);
          secretAutoHideTimersRef.current[timerKey] = setTimeout(() => {
            setCustomPasswordVisibility((prevVisibility) => ({
              ...prevVisibility,
              [fieldId]: false,
            }));
            clearSecretAutoHideTimer(timerKey);
          }, SECRET_AUTO_HIDE_MS);
        }

        return updatedField;
      }),
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

  const getSecretStateKey = (field, customFieldId = "") =>
    customFieldId ? `custom:${customFieldId}` : field;

  const isPersistedCustomField = (field = {}) => {
    const fieldId = String(field?.id || "").trim();
    if (fieldId && persistedCustomFieldIds.has(fieldId)) {
      return true;
    }

    const signature = getCustomFieldSignature(field?.name, field?.type);
    if (signature !== "::" && persistedCustomFieldSignatures.has(signature)) {
      return true;
    }

    return false;
  };

  const getHiddenSecretValueForState = (value = "", customFieldMeta = null) => {
    const normalized = String(value || "").trim();
    if (!normalized) return "";

    // For new records keep original state value and only hide via UI style.
    if (!hasPersistedRecord) {
      return String(value || "");
    }

    // In edit mode, do not mask newly added custom fields before first save.
    if (customFieldMeta && !isPersistedCustomField(customFieldMeta)) {
      return String(value || "");
    }

    return SECRET_MASK;
  };

  const fetchDecryptedSecret = async (field, customFieldId = "") => {
    const id = String(editingRecord?.id || editingRecord?._id || "").trim();
    if (!id) {
      throw new Error("Record ID not found");
    }

    const query = new URLSearchParams({
      action: "reveal-secret",
      field,
    });

    if (customFieldId) {
      query.append("customFieldId", customFieldId);
    }

    const requestUrl = `${API_ENDPOINTS.MAXCODE_CREDENTIALS.GET(id)}&${query.toString()}`;
    const stateKey = getSecretStateKey(field, customFieldId);

    setSecretLoading((prev) => ({ ...prev, [stateKey]: true }));
    try {
      const response = await apiGet(requestUrl);
      return String(response?.data?.value || "");
    } finally {
      setSecretLoading((prev) => ({ ...prev, [stateKey]: false }));
    }
  };

  const ensureSecretVisibleValue = async (field, customFieldId = "") => {
    if (customFieldId) {
      const targetField = (formData.customFields || []).find(
        (item) => String(item.id || "") === String(customFieldId),
      );
      const currentValue = String(targetField?.value || "");
      if (currentValue.trim() !== SECRET_MASK) {
        return currentValue;
      }

      const decrypted = await fetchDecryptedSecret(field, customFieldId);
      setFormData((prev) => ({
        ...prev,
        customFields: (prev.customFields || []).map((item) =>
          String(item.id || "") === String(customFieldId)
            ? { ...item, value: decrypted }
            : item,
        ),
      }));
      return decrypted;
    }

    const currentValue = String(formData[field] || "");
    if (currentValue.trim() !== SECRET_MASK) {
      return currentValue;
    }

    const decrypted = await fetchDecryptedSecret(field);
    setFormData((prev) => ({ ...prev, [field]: decrypted }));
    return decrypted;
  };

  const handleToggleMainSecretVisibility = async (field) => {
    const key = getSecretStateKey(field);
    const willShow = !Boolean(showPasswords[field]);
    if (willShow) {
      try {
        await ensureSecretVisibleValue(field);
      } catch (error) {
        showError(error?.response?.data?.error || "Unable to reveal value");
        return;
      }

      clearSecretAutoHideTimer(key);
      setShowPasswords((prev) => ({ ...prev, [field]: true }));
      secretAutoHideTimersRef.current[key] = setTimeout(() => {
        setFormData((prev) => ({
          ...prev,
          [field]: getHiddenSecretValueForState(prev?.[field]),
        }));
        setShowPasswords((prev) => ({ ...prev, [field]: false }));
        clearSecretAutoHideTimer(key);
      }, SECRET_AUTO_HIDE_MS);
      return;
    }

    clearSecretAutoHideTimer(key);
    setFormData((prev) => ({
      ...prev,
      [field]: getHiddenSecretValueForState(prev?.[field]),
    }));
    setShowPasswords((prev) => ({ ...prev, [field]: false }));
  };

  const handleToggleCustomSecretVisibility = async (fieldId, fieldType) => {
    const key = getSecretStateKey(fieldType, fieldId);
    const willShow = !Boolean(customPasswordVisibility[fieldId]);
    if (willShow) {
      try {
        await ensureSecretVisibleValue(
          String(fieldType || "customField"),
          fieldId,
        );
      } catch (error) {
        showError(error?.response?.data?.error || "Unable to reveal value");
        return;
      }

      clearSecretAutoHideTimer(key);
      setCustomPasswordVisibility((prev) => ({
        ...prev,
        [fieldId]: true,
      }));
      secretAutoHideTimersRef.current[key] = setTimeout(() => {
        setFormData((prev) => ({
          ...prev,
          customFields: (prev.customFields || []).map((item) =>
            String(item.id || "") === String(fieldId)
              ? {
                  ...item,
                  value: getHiddenSecretValueForState(item?.value, item),
                }
              : item,
          ),
        }));
        setCustomPasswordVisibility((prev) => ({
          ...prev,
          [fieldId]: false,
        }));
        clearSecretAutoHideTimer(key);
      }, SECRET_AUTO_HIDE_MS);
      return;
    }

    clearSecretAutoHideTimer(key);
    setFormData((prev) => ({
      ...prev,
      customFields: (prev.customFields || []).map((item) =>
        String(item.id || "") === String(fieldId)
          ? {
              ...item,
              value: getHiddenSecretValueForState(item?.value, item),
            }
          : item,
      ),
    }));
    setCustomPasswordVisibility((prev) => ({
      ...prev,
      [fieldId]: false,
    }));
  };

  const handleCopyValue = async (field, customFieldId = "") => {
    try {
      const value = await ensureSecretVisibleValue(field, customFieldId);
      if (!value || !String(value).trim()) {
        showError("Nothing to copy");
        return;
      }

      await navigator.clipboard.writeText(String(value));
      showSuccess("Copied to clipboard");
    } catch (error) {
      showError(
        error?.response?.data?.error || "Copy failed. Please try again.",
      );
    }
  };

  const validateForm = () => {
    const newErrors = {};

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
    const payload = {
      ...formData,
      clientRefId: "",
      clientName: "",
      businessName: "",
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
    : "Add My Software Credential";

  const orderedCustomFields = Array.isArray(formData.customFields)
    ? formData.customFields
    : [];

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

    if (isSecretCustomFieldType(field.type)) {
      const loadingKey = getSecretStateKey(field.type, field.id);
      const isBusy = secretLoading[loadingKey] === true;
      return (
        <div className="input-group">
          <input
            type="text"
            className={inputClass}
            value={field.value || ""}
            onChange={(e) =>
              updateCustomField(field.id, "value", e.target.value)
            }
            readOnly={isViewMode}
            placeholder="Enter value"
            autoComplete="new-password"
            style={
              customPasswordVisibility[field.id]
                ? undefined
                : getHiddenSecretInputStyle(field.value)
            }
          />
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={() =>
              handleToggleCustomSecretVisibility(field.id, field.type)
            }
            disabled={isBusy}
          >
            <i
              className={`fas ${
                customPasswordVisibility[field.id] ? "fa-eye-slash" : "fa-eye"
              }`}
            ></i>
          </button>
          <button
            type="button"
            className="btn btn-outline-primary rounded-end-3"
            onClick={() => handleCopyValue(field.type, field.id)}
            disabled={isBusy || !String(field.value || "").trim()}
          >
            <i className="fas fa-copy"></i>
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
    <div className="col-md-3 mb-3">
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
    <div className="col-md-3 mb-3" key={name}>
      <label htmlFor={name} className="form-label">
        {label}
      </label>
      <div className="input-group">
        <input
          id={name}
          name={name}
          type="text"
          className="form-control modern-input"
          value={formData[name] || ""}
          onChange={handleInputChange}
          readOnly={isViewMode}
          placeholder={placeholder}
          autoComplete="new-password"
          style={
            showPasswords[name]
              ? undefined
              : getHiddenSecretInputStyle(formData[name])
          }
        />
        <button
          type="button"
          className="btn btn-outline-secondary"
          onClick={() => handleToggleMainSecretVisibility(name)}
          disabled={secretLoading[name] === true}
        >
          <i
            className={`fas ${showPasswords[name] ? "fa-eye-slash" : "fa-eye"}`}
          ></i>
        </button>
        <button
          type="button"
          className="btn btn-outline-primary rounded-end-3"
          onClick={() => handleCopyValue(name)}
          disabled={!String(formData[name] || "").trim()}
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
                  "websiteLink",
                  "Website Link",
                  "https://example.com",
                )}

                {renderTextInput(
                  "appGithubRepoName",
                  "Android Repo Name",
                  "Enter android repo name",
                )}
                {renderTextInput(
                  "appGithubUrl",
                  "Android Repo URL",
                  "https://github.com/...",
                )}
                {renderTextInput(
                  "androidAppLink",
                  "Android App Link",
                  "https://play.google.com/...",
                )}
                {renderPasswordInput(
                  "appUsername",
                  "App User Name",
                  "Enter app username",
                )}
                {renderPasswordInput(
                  "appPassword",
                  "App Password",
                  "Enter app password",
                )}

                {renderTextInput(
                  "iosRepoName",
                  "IOS Repo Name",
                  "Enter ios repo name",
                )}
                {renderTextInput(
                  "iosRepoUrl",
                  "IOS Repo URL",
                  "https://github.com/...",
                )}
                {renderTextInput(
                  "iosAppLink",
                  "IOS App Link",
                  "https://apps.apple.com/...",
                )}

                {renderTextInput(
                  "serverName",
                  "Server Name",
                  "Enter server name",
                )}
                {renderPasswordInput(
                  "serverRootUsername",
                  "Server Root UserName",
                  "Enter server root username",
                )}
                {renderPasswordInput(
                  "serverRootPassword",
                  "Server Root Password",
                  "Enter server root password",
                )}
                {renderTextInput(
                  "databaseName",
                  "Database Name",
                  "Enter database name",
                )}
                {renderPasswordInput(
                  "databaseRootUsername",
                  "Database Root User Name",
                  "Enter database root user name",
                )}
                {renderPasswordInput(
                  "databaseRootPassword",
                  "Database Root User Password",
                  "Enter database root user password",
                )}
                {renderTextInput(
                  "serverPortNumber",
                  "Server Port Number",
                  "Enter server port number",
                )}
                {renderTextInput(
                  "databasePortNumber",
                  "Database Port Number",
                  "Enter database port number",
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
                            {orderedCustomFields.map((field, index) => (
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
                                        requestRemoveCustomField(field.id)
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
                        {orderedCustomFields.map((field, index) => (
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
                                  onClick={() =>
                                    requestRemoveCustomField(field.id)
                                  }
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

          <ConfirmationModal
            show={showDeleteConfirm}
            onHide={() => {
              setShowDeleteConfirm(false);
              setCustomFieldToDelete(null);
            }}
            onConfirm={confirmRemoveCustomField}
            title="Delete Custom Field"
            message="Are you sure you want to delete this custom field?"
            confirmText="Delete"
            variant="danger"
            confirmationText="delete"
          />

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

export default CreateMaxcodeCredential;
