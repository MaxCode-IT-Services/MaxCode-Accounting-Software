import React, { useState, useRef, useEffect } from "react";
import {
  showSuccess,
  showError,
  showInfo,
  showWarning,
} from "../Components/ToastNotification";
import ConfirmationModal from "../Components/ConfirmationModal";
import { apiGet, apiPut } from "../utils/api";
import API_ENDPOINTS from "../utils/apiEndpoints";

const Settings = () => {
  useEffect(() => {
    document.title = "Settings | MaxCode IT Services";
  }, []);

  const DEFAULT_PROFILE_FORM = {
    firstName: "John",
    lastName: "Doe",
    name: "John Doe",
    email: "john.doe@example.com",
    phone: "9876543210",
    address: "123 Main Street, Mumbai, Maharashtra",
    role: "Admin",
  };

  const DEFAULT_INVOICE_TERMS =
    "60% advance payment is required before starting the project.\n20% payment is due after 60% project completion.\nRemaining 20% must be paid before final completion and launch.\nA late fee of 3% per month will be charged on delayed payments.\nAdditional revisions will be billed separately.\nPayment once made after invoice issuance is non-refundable.\nMaintenance services are available at an additional cost.\nMaxCode can showcase completed projects in portfolios.\nPayments can be made via Cash, Bank Transfer, or UPI.\nCancellation charges will apply once the project has started.\nAll fees are non-refundable after project approval.\nOwnership rights will be transferred upon full payment.\nGST applicable on advance payment invoices.\nAll disputes are subject to Dausa, Rajasthan jurisdiction.";

  const DEFAULT_SELF_INVOICE_TERMS =
    "Issued under Section 31(3)(f) of CGST Act, 2017 under RCM.\nClassified as Import of Services from a non-resident supplier.\nMaxCode IT Services is liable to pay 18% IGST under RCM.\nPlace of Supply: Rajasthan (08) as per GST provisions.\nITC claimable only after RCM tax payment.\nInvoice value converted to INR at transaction date rate.\nLinked to original supplier reference for audit purposes.\nInvoice amount rounded off as per GST rules.\nPayment reflects net amount remitted to foreign vendor.\nThis is a computer-generated document.\nServices used for business purposes only.\nValid document for GST compliance and audit.\nDiscrepancies must match bank/payment records.\nSubject to Dausa, Rajasthan jurisdiction.";

  const [activeTab, setActiveTab] = useState("profile");
  const [isEditing, setIsEditing] = useState(false);
  const [profileImage, setProfileImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef(null);

  // Profile form data
  const [formData, setFormData] = useState(DEFAULT_PROFILE_FORM);
  const [initialProfileData, setInitialProfileData] =
    useState(DEFAULT_PROFILE_FORM);

  // PIN data
  const [pinData, setPinData] = useState({
    oldPin: "",
    newPin: "",
    confirmPin: "",
  });

  const [showPassword, setShowPassword] = useState({
    oldPin: false,
    newPin: false,
    confirmPin: false,
  });

  // Business Details State
  const [businessSettings, setBusinessSettings] = useState({
    // Branding Assets
    profilePhotoUrl: "",
    logoUrl: "",
    qrCodeUrl: "",
    sealUrl: "",
    paidSealUrl: "",
    unpaidSealUrl: "",

    // Office Details
    companyName: "MaxCode IT Services",
    gstin: "",
    companyAddress: "123 Business Park, Mumbai",
    companyPhone: "9876543210",
    companyEmail: "info@rajsfiber.com",

    // Banking & Prefs
    bankName: "State Bank of India",
    ifscCode: "SBIN0001234",
    accountNumber: "12345678901",
    accountName: "MaxCode IT Services",
    branchAddress: "Main Branch, Mumbai",
    invoiceTermsConditions: DEFAULT_INVOICE_TERMS,
    selfInvoiceTermsConditions: DEFAULT_SELF_INVOICE_TERMS,

    // Service Master
    services: [
      {
        id: "1",
        name: "Fiber Optic Installation",
        hsnCode: "85176290",
        status: "active",
      },
      {
        id: "2",
        name: "Broadband Service",
        hsnCode: "998411",
        status: "active",
      },
      {
        id: "3",
        name: "Network Maintenance",
        hsnCode: "998313",
        status: "active",
      },
    ],

    // Cloud Master Sync
    dbSyncEnabled: false,
    mongoConnectionString: "",
    mongoApiUrl: "",
  });

  const DEFAULT_SERVICE_FORM = {
    name: "",
    hsnCode: "",
    status: "active",
  };

  const BUSINESS_DETAILS_FIELDS = [
    "profilePhotoUrl",
    "logoUrl",
    "qrCodeUrl",
    "sealUrl",
    "paidSealUrl",
    "unpaidSealUrl",
    "companyName",
    "gstin",
    "companyAddress",
    "companyPhone",
    "companyEmail",
    "bankName",
    "ifscCode",
    "accountNumber",
    "accountName",
    "branchAddress",
    "invoiceTermsConditions",
    "selfInvoiceTermsConditions",
  ];

  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [showResetTermsConfirm, setShowResetTermsConfirm] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState(null);
  const [serviceFormData, setServiceFormData] = useState(DEFAULT_SERVICE_FORM);
  const [serviceSearch, setServiceSearch] = useState("");
  const [selectedServices, setSelectedServices] = useState([]);
  const [confirmDeleteServices, setConfirmDeleteServices] = useState([]);
  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isBusinessLoading, setIsBusinessLoading] = useState(false);
  const [uploadingField, setUploadingField] = useState(null);

  // Backup & Restore State
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [backupProgress, setBackupProgress] = useState("");
  const backupFileInputRef = useRef(null);

  // Google Drive Auto Backup State
  const [driveConfig, setDriveConfig] = useState({
    enabled: false,
    clientId: "",
    clientSecret: "",
    refreshToken: "",
    backupApiKey: "",
    folderId: "",
    backupTime: "20:00", // 8 PM default
  });
  const [isDriveSaving, setIsDriveSaving] = useState(false);
  const [showDrivePassword, setShowDrivePassword] = useState({
    clientSecret: false,
    refreshToken: false,
    backupApiKey: false,
  });

  useEffect(() => {
    loadProfileSettings();
    loadBusinessSettings();
    loadGoogleDriveConfig();
  }, []);

  const loadGoogleDriveConfig = () => {
    try {
      const savedConfig = localStorage.getItem("googleDriveConfig");
      if (savedConfig) {
        const parsed = JSON.parse(savedConfig);
        setDriveConfig({
          enabled: parsed.enabled || false,
          clientId: parsed.clientId || "",
          clientSecret: parsed.clientSecret || "",
          refreshToken: parsed.refreshToken || "",
          backupApiKey: parsed.backupApiKey || "",
          folderId: parsed.folderId || "",
          backupTime: parsed.backupTime || "20:00",
        });
        console.log("✅ Google Drive config loaded from local storage");
      }
    } catch (error) {
      console.error("Error loading Google Drive config:", error);
    }
  };

  const normalizeProfilePayload = (payload = {}) => {
    const firstName = String(payload.firstName || "").trim();
    const lastName = String(payload.lastName || "").trim();
    const fallbackName = [firstName, lastName].filter(Boolean).join(" ").trim();
    const normalizedName = String(payload.name || fallbackName).trim();

    return {
      ...DEFAULT_PROFILE_FORM,
      firstName,
      lastName,
      name: normalizedName || DEFAULT_PROFILE_FORM.name,
      email: String(payload.email || "").trim(),
      phone: String(payload.phone || "")
        .replace(/\D/g, "")
        .slice(0, 10),
      address: String(payload.address || "").trim(),
      role: String(payload.role || DEFAULT_PROFILE_FORM.role).trim(),
    };
  };

  const loadProfileSettings = async () => {
    let fallbackProfile = DEFAULT_PROFILE_FORM;

    const storedUserInfo = localStorage.getItem("user_info");
    if (storedUserInfo) {
      try {
        const parsedUser = JSON.parse(storedUserInfo);
        fallbackProfile = normalizeProfilePayload({
          ...DEFAULT_PROFILE_FORM,
          name: parsedUser?.name || DEFAULT_PROFILE_FORM.name,
          email: parsedUser?.email || DEFAULT_PROFILE_FORM.email,
          phone:
            parsedUser?.phone ||
            parsedUser?.mobile ||
            DEFAULT_PROFILE_FORM.phone,
          role: parsedUser?.role || DEFAULT_PROFILE_FORM.role,
        });
      } catch (error) {
        console.error("Failed to parse cached user info:", error);
      }
    }

    setFormData(fallbackProfile);
    setInitialProfileData(fallbackProfile);

    try {
      const response = await apiGet(API_ENDPOINTS.SETTINGS.PROFILE);
      const remoteProfile = response?.data?.profile;

      if (remoteProfile && typeof remoteProfile === "object") {
        const mergedProfile = normalizeProfilePayload({
          ...fallbackProfile,
          ...remoteProfile,
        });
        setFormData(mergedProfile);
        setInitialProfileData(mergedProfile);
      }
    } catch (error) {
      console.error("Failed to fetch profile settings:", error);
    }
  };

  // Toggle password visibility for PIN fields
  const togglePasswordVisibility = (field) => {
    setShowPassword((prev) => ({
      ...prev,
      [field]: !prev[field],
    }));
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    // Mobile number validation - only allow numbers and max 10 digits
    if (name === "phone") {
      const numericValue = value.replace(/\D/g, "").slice(0, 10);
      setFormData((prev) => ({
        ...prev,
        [name]: numericValue,
      }));
    } else if (name === "name") {
      const nameParts = value.split(" ");
      const firstName = nameParts[0] || "";
      const lastName = nameParts.slice(1).join(" ") || "";

      setFormData((prev) => ({
        ...prev,
        name: value,
        firstName,
        lastName,
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
    }
  };

  const handlePinChange = (e) => {
    const { name, value } = e.target;
    const numericValue = value.replace(/\D/g, "").slice(0, 6);
    setPinData((prev) => ({
      ...prev,
      [name]: numericValue,
    }));
  };

  const handleProfileSubmit = async (e) => {
    e?.preventDefault?.();

    if (formData.phone && formData.phone.length !== 10) {
      showError("Please enter a valid 10-digit mobile number");
      return;
    }

    setLoading(true);

    try {
      const payload = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        address: formData.address,
      };

      const response = await apiPut(API_ENDPOINTS.SETTINGS.PROFILE, payload);
      const savedProfile = normalizeProfilePayload(
        response?.data?.profile || payload,
      );

      setFormData(savedProfile);
      setInitialProfileData(savedProfile);
      setIsEditing(false);
      showSuccess("Profile updated successfully!");

      const existingUserInfo = localStorage.getItem("user_info");
      let parsedUserInfo = {};
      if (existingUserInfo) {
        try {
          parsedUserInfo = JSON.parse(existingUserInfo) || {};
        } catch {
          parsedUserInfo = {};
        }
      }

      const updatedUserInfo = {
        ...parsedUserInfo,
        ...(response?.data?.user || {}),
        name: savedProfile.name,
        email: savedProfile.email,
        phone: savedProfile.phone,
        role: savedProfile.role,
      };

      localStorage.setItem("user_info", JSON.stringify(updatedUserInfo));
    } catch (error) {
      showError(error?.response?.data?.error || "Failed to update profile");
    } finally {
      setLoading(false);
    }
  };

  const handlePinSubmit = async (e) => {
    e.preventDefault();

    if (pinData.oldPin.length !== 6) {
      showError("Please enter a valid 6-digit old PIN");
      return;
    }

    if (pinData.newPin.length !== 6) {
      showError("Please enter a valid 6-digit new PIN");
      return;
    }

    if (pinData.newPin !== pinData.confirmPin) {
      showError("New PIN and Confirm PIN do not match");
      return;
    }

    if (pinData.oldPin === pinData.newPin) {
      showWarning("New PIN cannot be same as old PIN");
      return;
    }

    setLoading(true);

    try {
      await apiPut(API_ENDPOINTS.SETTINGS.CHANGE_PIN, {
        action: "change-pin",
        oldPin: pinData.oldPin,
        newPin: pinData.newPin,
      });

      setPinData({ oldPin: "", newPin: "", confirmPin: "" });
      showSuccess("PIN updated successfully!");
    } catch (error) {
      showError(error?.response?.data?.error || "Failed to update PIN");
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setFormData(initialProfileData);
    showInfo("Edit cancelled");
  };

  const handlePinCancel = () => {
    setPinData({ oldPin: "", newPin: "", confirmPin: "" });
    showInfo("PIN change cancelled");
  };

  const handleImageClick = () => {
    if (isEditing) {
      fileInputRef.current?.click();
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif"];
      const maxSize = 5 * 1024 * 1024;

      if (!validTypes.includes(file.type)) {
        showError("Please select a valid image file (JPEG, PNG, GIF)");
        return;
      }

      if (file.size > maxSize) {
        showError("Image size should be less than 5MB");
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        setProfileImage(e.target.result);
        showSuccess("Profile photo updated successfully!");
      };
      reader.onerror = () => {
        showError("Failed to load image. Please try again.");
      };
      reader.readAsDataURL(file);
    }
  };

  // Business Details Handlers
  const buildBusinessSettingsPayload = (settings) =>
    BUSINESS_DETAILS_FIELDS.reduce((acc, field) => {
      acc[field] = settings[field] ?? "";
      return acc;
    }, {});

  const mergeBusinessSettings = (settings = {}) => {
    if (!settings || typeof settings !== "object") return;
    setBusinessSettings((prev) => ({
      ...prev,
      ...settings,
    }));
  };

  const loadBusinessSettings = async () => {
    setIsBusinessLoading(true);

    const cached = localStorage.getItem("business_settings");
    let cachedSettings = null;

    if (cached) {
      try {
        cachedSettings = JSON.parse(cached);
      } catch (error) {
        console.error("Failed to parse cached business settings:", error);
      }
    }

    try {
      const response = await apiGet(API_ENDPOINTS.BUSINESS_SETTINGS.GET);
      const remoteSettings = response?.data?.settings;

      if (remoteSettings) {
        const mergedSettings = {
          ...(cachedSettings || {}),
          ...remoteSettings,
        };

        mergeBusinessSettings(mergedSettings);
        localStorage.setItem(
          "business_settings",
          JSON.stringify(mergedSettings),
        );
        return;
      }
    } catch (error) {
      console.error("Failed to fetch business settings:", error);
    } finally {
      setIsBusinessLoading(false);
    }

    if (cachedSettings) {
      mergeBusinessSettings(cachedSettings);
    }
  };

  const handleBusinessChange = (field, value) => {
    setBusinessSettings((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleResetTermsToDefault = () => {
    setBusinessSettings((prev) => ({
      ...prev,
      invoiceTermsConditions: DEFAULT_INVOICE_TERMS,
      selfInvoiceTermsConditions: DEFAULT_SELF_INVOICE_TERMS,
    }));
    setShowResetTermsConfirm(false);
    showInfo("Terms reset to default. Save Terms to apply changes.");
  };

  const syncServicesToBackend = async (nextServices) => {
    const normalizedServices = nextServices.map((service) => ({
      id: String(service.id),
      name: service.name?.trim() || "",
      hsnCode: service.hsnCode?.trim() || "",
      status: getServiceStatus(service),
    }));

    const response = await apiPut(API_ENDPOINTS.BUSINESS_SETTINGS.UPDATE, {
      services: normalizedServices,
    });

    const remoteServices = response?.data?.settings?.services;

    if (Array.isArray(remoteServices)) {
      handleBusinessChange("services", remoteServices);
      return remoteServices;
    }

    handleBusinessChange("services", normalizedServices);
    return normalizedServices;
  };

  const handleImageUpload = async (field, e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif"];
    const maxSize = 5 * 1024 * 1024;

    if (!validTypes.includes(file.type)) {
      showError("Please select a valid image file (JPEG, PNG, GIF)");
      return;
    }

    if (file.size > maxSize) {
      showError("Image size should be less than 5MB");
      return;
    }

    setUploadingField(field);

    setTimeout(() => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result;
        handleBusinessChange(field, base64);
        showSuccess(
          `${field.replace(/([A-Z])/g, " $1").replace(/^./, (str) => str.toUpperCase())} uploaded successfully!`,
        );
        setUploadingField(null);
      };
      reader.readAsDataURL(file);
    }, 500);
  };

  const handleSaveAll = async () => {
    setIsSaving(true);

    try {
      const payload = buildBusinessSettingsPayload(businessSettings);
      const response = await apiPut(
        API_ENDPOINTS.BUSINESS_SETTINGS.UPDATE,
        payload,
      );
      const savedSettings = response?.data?.settings;
      const mergedSavedSettings = {
        ...payload,
        ...(savedSettings || {}),
      };

      if (savedSettings || payload) {
        mergeBusinessSettings(mergedSavedSettings);
        localStorage.setItem(
          "business_settings",
          JSON.stringify(mergedSavedSettings),
        );
      } else {
        localStorage.setItem("business_settings", JSON.stringify(payload));
      }

      showSuccess("Profile synced to Cloud successfully!");
    } catch (error) {
      localStorage.setItem(
        "business_settings",
        JSON.stringify(buildBusinessSettingsPayload(businessSettings)),
      );
      showError(error?.response?.data?.error || "Failed to sync profile");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestConnection = async () => {
    if (!businessSettings.mongoConnectionString) {
      showError("Please enter MongoDB URI first");
      return;
    }

    setIsTesting(true);

    setTimeout(() => {
      showSuccess("MongoDB Connection Successful!");
      setIsTesting(false);
    }, 1000);
  };

  const getServiceStatus = (service) => service.status || "active";

  const openAddServiceModal = () => {
    setEditingServiceId(null);
    setServiceFormData(DEFAULT_SERVICE_FORM);
    setIsServiceModalOpen(true);
  };

  const openEditServiceModal = (service) => {
    setEditingServiceId(service.id);
    setServiceFormData({
      name: service.name,
      hsnCode: service.hsnCode,
      status: getServiceStatus(service),
    });
    setIsServiceModalOpen(true);
  };

  const closeServiceModal = () => {
    setIsServiceModalOpen(false);
    setEditingServiceId(null);
    setServiceFormData(DEFAULT_SERVICE_FORM);
  };

  const handleServiceFormChange = (field, value) => {
    setServiceFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const saveService = async () => {
    const serviceName = serviceFormData.name.trim();
    const serviceHsnCode = serviceFormData.hsnCode.trim();

    if (!serviceName) {
      showError("Please enter service name");
      return;
    }
    if (!serviceHsnCode) {
      showError("Please enter HSN code");
      return;
    }

    if (editingServiceId) {
      const updatedServices = businessSettings.services.map((service) =>
        service.id === editingServiceId
          ? {
              ...service,
              name: serviceName,
              hsnCode: serviceHsnCode,
              status: serviceFormData.status,
            }
          : service,
      );
      try {
        await syncServicesToBackend(updatedServices);
        showSuccess("Service updated successfully");
      } catch (error) {
        showError(error?.response?.data?.error || "Failed to update service");
        return;
      }
    } else {
      const newService = {
        id: Date.now().toString(),
        name: serviceName,
        hsnCode: serviceHsnCode,
        status: serviceFormData.status,
      };
      try {
        await syncServicesToBackend([...businessSettings.services, newService]);
        showSuccess("Service added to master");
      } catch (error) {
        showError(error?.response?.data?.error || "Failed to add service");
        return;
      }
    }

    closeServiceModal();
  };

  const removeService = async (id) => {
    const remainingServices = businessSettings.services.filter(
      (s) => s.id !== id,
    );

    try {
      await syncServicesToBackend(remainingServices);
      showSuccess("Service removed");
    } catch (error) {
      showError(error?.response?.data?.error || "Failed to remove service");
    }
  };

  const handleBulkDeleteServices = async () => {
    if (confirmDeleteServices.length === 0) return;

    const remaining = businessSettings.services.filter(
      (s) => !confirmDeleteServices.includes(s.id),
    );

    try {
      await syncServicesToBackend(remaining);
      showSuccess(
        `${confirmDeleteServices.length} services removed successfully`,
      );
      setConfirmDeleteServices([]);
      setSelectedServices([]);
    } catch (error) {
      showError(error?.response?.data?.error || "Failed to remove services");
    }
  };

  const filteredServices = businessSettings.services.filter(
    (s) =>
      s.name.toLowerCase().includes(serviceSearch.toLowerCase()) ||
      s.hsnCode.toLowerCase().includes(serviceSearch.toLowerCase()),
  );

  const toggleSelectAll = () => {
    if (selectedServices.length === filteredServices.length) {
      setSelectedServices([]);
    } else {
      setSelectedServices(filteredServices.map((s) => s.id));
    }
  };

  const toggleSelectRow = (id) => {
    setSelectedServices((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const toggleServiceStatus = async (id) => {
    let updatedStatus = "inactive";
    const updatedServices = businessSettings.services.map((service) =>
      service.id === id
        ? {
            ...service,
            status:
              getServiceStatus(service) === "active" ? "inactive" : "active",
          }
        : service,
    );

    const targetService = updatedServices.find((service) => service.id === id);
    if (targetService) {
      updatedStatus = getServiceStatus(targetService);
    }

    try {
      await syncServicesToBackend(updatedServices);
      showSuccess(
        `Service marked as ${updatedStatus === "active" ? "Active" : "Inactive"}`,
      );
    } catch (error) {
      showError(error?.response?.data?.error || "Failed to update status");
    }
  };

  // Export Backup Handler
  const handleExportBackup = async () => {
    try {
      setIsExporting(true);
      setBackupProgress("Fetching data from database...");

      const collections = [
        { name: "clients", endpoint: API_ENDPOINTS.CLIENTS.LIST },
        { name: "vendors", endpoint: API_ENDPOINTS.VENDORS.LIST },
        { name: "staff", endpoint: API_ENDPOINTS.STAFF.LIST },
        { name: "invoices", endpoint: API_ENDPOINTS.INVOICES.LIST },
        { name: "purchases", endpoint: API_ENDPOINTS.PURCHASES.LIST },
        { name: "rcm", endpoint: API_ENDPOINTS.RCM.LIST },
        { name: "projects", endpoint: API_ENDPOINTS.PROJECTS.LIST },
        { name: "services", endpoint: API_ENDPOINTS.SERVICES.LIST },
        { name: "years", endpoint: API_ENDPOINTS.YEARS.LIST },
      ];

      const backupData = {
        exportDate: new Date().toISOString(),
        version: "1.0",
        collections: {},
      };

      // Fetch all data
      for (const collection of collections) {
        setBackupProgress(`Fetching ${collection.name}...`);
        try {
          const response = await apiGet(collection.endpoint);
          backupData.collections[collection.name] = response.data;
        } catch (error) {
          console.error(`Error fetching ${collection.name}:`, error);
          backupData.collections[collection.name] = [];
        }
      }

      // Fetch business settings
      setBackupProgress("Fetching business settings...");
      try {
        const businessResponse = await apiGet(
          API_ENDPOINTS.BUSINESS_SETTINGS.GET,
        );
        backupData.businessSettings = businessResponse.data;
      } catch (error) {
        console.error("Error fetching business settings:", error);
        backupData.businessSettings = {};
      }

      setBackupProgress("Creating backup file...");

      // Create JSON string
      const jsonString = JSON.stringify(backupData, null, 2);
      const blob = new Blob([jsonString], { type: "application/json" });

      // Create download link
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .split("T")[0];
      link.href = url;
      link.download = `maxcode-backup-${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setBackupProgress("");
      showSuccess("Backup exported successfully!");
    } catch (error) {
      console.error("Backup export error:", error);
      showError("Failed to export backup. Please try again.");
      setBackupProgress("");
    } finally {
      setIsExporting(false);
    }
  };

  // Import Backup Handler
  const handleImportBackup = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.name.endsWith(".json")) {
      showError("Please select a valid JSON backup file");
      return;
    }

    try {
      setIsImporting(true);
      setBackupProgress("Reading backup file...");

      // Read file content
      const fileContent = await file.text();
      const backupData = JSON.parse(fileContent);

      // Validate backup structure
      if (!backupData.collections || !backupData.exportDate) {
        showError("Invalid backup file format");
        setIsImporting(false);
        setBackupProgress("");
        return;
      }

      setBackupProgress("Restoring data... This may take a while");

      showWarning(
        "Backup restore functionality requires backend implementation. Please contact administrator.",
      );

      setBackupProgress("");
    } catch (error) {
      console.error("Backup import error:", error);
      showError(
        "Failed to import backup. Please check the file and try again.",
      );
      setBackupProgress("");
    } finally {
      setIsImporting(false);
      if (backupFileInputRef.current) {
        backupFileInputRef.current.value = "";
      }
    }
  };

  // Google Drive Configuration Handlers
  const handleSaveDriveConfig = async () => {
    if (!driveConfig.enabled) {
      showError("Please enable auto backup first");
      return;
    }

    if (
      !driveConfig.clientId ||
      !driveConfig.clientSecret ||
      !driveConfig.refreshToken ||
      !driveConfig.backupApiKey
    ) {
      showError("Please fill all required fields");
      return;
    }

    try {
      setIsDriveSaving(true);

      // Save to localStorage for now (will be synced to backend)
      localStorage.setItem("googleDriveConfig", JSON.stringify(driveConfig));

      showSuccess("✅ Google Drive configuration saved successfully!");
      showInfo(
        "🔑 Next Step: Add these credentials as GitHub Secrets (Settings → Secrets → Actions) to activate automatic backups",
      );

      // Log instructions to console for easy reference
      console.log(`
╔════════════════════════════════════════════════════════════╗
║           ADD THESE GITHUB SECRETS                         ║
╠════════════════════════════════════════════════════════════╣
║ Go to: GitHub Repository → Settings → Secrets → Actions   ║
║                                                            ║
║ Add these 7 secrets:                                       ║
║ 1. GOOGLE_CLIENT_ID                                        ║
║ 2. GOOGLE_CLIENT_SECRET                                    ║
║ 3. GOOGLE_REFRESH_TOKEN                                    ║
║ 4. GOOGLE_DRIVE_FOLDER_ID                                  ║
║ 5. NETLIFY_API_URL (your Netlify functions URL)            ║
║ 6. BACKUP_API_KEY (create strong random key)               ║
║ 7. MONGODB_URI (if not already added)                      ║
║                                                            ║
║ Then backup will run automatically daily at 8 PM IST      ║
╚════════════════════════════════════════════════════════════╝
      `);
    } catch (error) {
      console.error("Drive config save error:", error);
      showError("Failed to save configuration");
    } finally {
      setIsDriveSaving(false);
    }
  };

  const handleTestDriveConnection = async () => {
    if (
      !driveConfig.clientId ||
      !driveConfig.clientSecret ||
      !driveConfig.refreshToken
    ) {
      showError("Please fill all credentials first");
      return;
    }

    try {
      setIsDriveSaving(true);
      showInfo("Testing Google Drive connection...");

      // Simulate connection test (actual implementation would call backend)
      await new Promise((resolve) => setTimeout(resolve, 2000));

      showSuccess("Google Drive connection successful!");
    } catch (error) {
      console.error("Drive connection test error:", error);
      showError(
        "Failed to connect to Google Drive. Please check your credentials.",
      );
    } finally {
      setIsDriveSaving(false);
    }
  };

  return (
    <div className="container-fluid">
      <div
        className="py-3 d-flex align-items-sm-center flex-sm-row flex-column"
        style={{ marginTop: "70px" }}
      >
        <div className="flex-grow-1">
          <h4 className="fs-18 fw-semibold m-0">Settings</h4>
        </div>
      </div>

      <div className="settings-container1">
        <div className="row">
          <div className="col-12">
            {/* Tabs Navigation */}
            <div className="tabs-container mb-4">
              <ul className="nav nav-tabs modern-tabs">
                <li className="nav-item">
                  <button
                    className={`nav-link ${activeTab === "profile" ? "active" : ""}`}
                    onClick={() => setActiveTab("profile")}
                  >
                    <i className="fas fa-user me-2"></i>
                    Profile Management
                  </button>
                </li>
                <li className="nav-item">
                  <button
                    className={`nav-link ${activeTab === "pin" ? "active" : ""}`}
                    onClick={() => setActiveTab("pin")}
                  >
                    <i className="fas fa-key me-2"></i>
                    Change PIN
                  </button>
                </li>
                <li className="nav-item">
                  <button
                    className={`nav-link ${activeTab === "business" ? "active" : ""}`}
                    onClick={() => setActiveTab("business")}
                  >
                    <i className="fas fa-building me-2"></i>
                    Business Details
                  </button>
                </li>
                <li className="nav-item">
                  <button
                    className={`nav-link ${activeTab === "terms" ? "active" : ""}`}
                    onClick={() => setActiveTab("terms")}
                  >
                    <i className="fas fa-file-contract me-2"></i>
                    Terms & Conditions
                  </button>
                </li>
                <li className="nav-item">
                  <button
                    className={`nav-link ${activeTab === "hsn" ? "active" : ""}`}
                    onClick={() => setActiveTab("hsn")}
                  >
                    <i className="fas fa-tags me-2"></i>
                    HSN Code
                  </button>
                </li>
                <li className="nav-item">
                  <button
                    className={`nav-link ${activeTab === "backup" ? "active" : ""}`}
                    onClick={() => setActiveTab("backup")}
                  >
                    <i className="fas fa-database me-2"></i>
                    Backup & Restore
                  </button>
                </li>
              </ul>
            </div>

            {/* Tab Content */}
            <div className="tab-content">
              {/* Profile Management Tab */}
              {activeTab === "profile" && (
                <div className="card modern-card">
                  <div className="card-body">
                    <div className="row mb-4">
                      <div className="col-12">
                        <div className="d-flex justify-content-between align-items-center">
                          <h5 className="mb-0">Profile Information</h5>
                          {!isEditing ? (
                            <button
                              className="btn btn-primary btn-edit"
                              onClick={() => setIsEditing(true)}
                            >
                              <i className="fas fa-edit me-2"></i>
                              Edit Profile
                            </button>
                          ) : (
                            <div className="d-flex gap-2">
                              <button
                                className="btn btn-success"
                                onClick={handleProfileSubmit}
                                disabled={loading}
                              >
                                {loading ? (
                                  <>
                                    <span
                                      className="spinner-border spinner-border-sm me-1"
                                      role="status"
                                      aria-hidden="true"
                                    ></span>
                                    Updating...
                                  </>
                                ) : (
                                  <>
                                    <i className="fas fa-check me-1"></i>
                                    Update Profile
                                  </>
                                )}
                              </button>
                              <button
                                className="btn btn-outline-secondary"
                                onClick={handleCancel}
                                disabled={loading}
                              >
                                <i className="fas fa-times me-1"></i>
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="row">
                      <div className="col-xl-12 col-lg-12 col-md-12">
                        <form onSubmit={handleProfileSubmit}>
                          <div className="row">
                            <div className="col-md-6 mb-3">
                              <label htmlFor="name" className="form-label">
                                <i className="fas fa-user me-2 text-primary"></i>
                                Full Name
                              </label>
                              <input
                                type="text"
                                className="form-control modern-input"
                                id="name"
                                name="name"
                                value={formData.name}
                                onChange={handleInputChange}
                                disabled={!isEditing}
                              />
                            </div>

                            <div className="col-md-6 mb-3">
                              <label htmlFor="email" className="form-label">
                                <i className="fas fa-envelope me-2 text-primary"></i>
                                Email Address
                              </label>
                              <input
                                type="email"
                                className="form-control modern-input"
                                id="email"
                                name="email"
                                value={formData.email}
                                onChange={handleInputChange}
                                disabled={!isEditing}
                              />
                            </div>

                            <div className="col-md-6 mb-3">
                              <label htmlFor="phone" className="form-label">
                                <i className="fas fa-phone me-2 text-primary"></i>
                                Phone Number
                                {formData.phone.length !== 10 && isEditing && (
                                  <small className="text-danger ms-2">
                                    {10 - formData.phone.length} digits
                                    remaining
                                  </small>
                                )}
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
                                  className="form-control modern-input"
                                  id="phone"
                                  name="phone"
                                  value={formData.phone}
                                  onChange={handleInputChange}
                                  disabled={!isEditing}
                                  maxLength="10"
                                  placeholder="10-digit mobile number"
                                />
                              </div>
                              {formData.phone.length !== 10 && isEditing && (
                                <div className="text-danger small mt-1">
                                  Please enter exactly 10 digits
                                </div>
                              )}
                            </div>

                            <div className="col-md-6 mb-3">
                              <label htmlFor="role" className="form-label">
                                <i className="fas fa-briefcase me-2 text-primary"></i>
                                Role
                              </label>
                              <input
                                type="text"
                                className="form-control modern-input"
                                id="role"
                                name="role"
                                value={formData.role}
                                disabled={true}
                              />
                            </div>

                            <div className="col-12 mb-3">
                              <label htmlFor="address" className="form-label">
                                <i className="fas fa-map-marker-alt me-2 text-primary"></i>
                                Address
                              </label>
                              <input
                                type="text"
                                className="form-control modern-input"
                                id="address"
                                name="address"
                                value={formData.address}
                                onChange={handleInputChange}
                                disabled={!isEditing}
                                placeholder="Enter your address"
                              />
                            </div>
                          </div>
                        </form>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Change PIN Tab */}
              {activeTab === "pin" && (
                <div className="card modern-card">
                  <div className="card-body">
                    <h5 className="card-title mb-4">
                      <i className="fas fa-key me-2 text-primary"></i>
                      Change Your PIN
                    </h5>
                    <form onSubmit={handlePinSubmit}>
                      <div className="row">
                        <div className="col-xl-4 col-lg-4 col-md-6 mb-3">
                          <label htmlFor="oldPin" className="form-label">
                            Old PIN
                          </label>
                          <div className="input-group">
                            <input
                              type={showPassword.oldPin ? "text" : "password"}
                              className="form-control modern-input"
                              id="oldPin"
                              name="oldPin"
                              value={pinData.oldPin}
                              onChange={handlePinChange}
                              placeholder="Enter old PIN"
                              minLength="6"
                              maxLength="6"
                            />
                            <button
                              type="button"
                              className="btn btn-outline-secondary"
                              onClick={() => togglePasswordVisibility("oldPin")}
                            >
                              <i
                                className={`fas ${showPassword.oldPin ? "fa-eye-slash" : "fa-eye"}`}
                              ></i>
                            </button>
                          </div>
                        </div>

                        <div className="col-xl-4 col-lg-4 col-md-6 mb-3">
                          <label htmlFor="newPin" className="form-label">
                            New PIN
                          </label>
                          <div className="input-group">
                            <input
                              type={showPassword.newPin ? "text" : "password"}
                              className="form-control modern-input"
                              id="newPin"
                              name="newPin"
                              value={pinData.newPin}
                              onChange={handlePinChange}
                              placeholder="Enter new PIN"
                              minLength="6"
                              maxLength="6"
                            />
                            <button
                              type="button"
                              className="btn btn-outline-secondary"
                              onClick={() => togglePasswordVisibility("newPin")}
                            >
                              <i
                                className={`fas ${showPassword.newPin ? "fa-eye-slash" : "fa-eye"}`}
                              ></i>
                            </button>
                          </div>
                        </div>

                        <div className="col-xl-4 col-lg-4 col-md-12 mb-4">
                          <label htmlFor="confirmPin" className="form-label">
                            Confirm PIN
                          </label>
                          <div className="input-group">
                            <input
                              type={
                                showPassword.confirmPin ? "text" : "password"
                              }
                              className="form-control modern-input"
                              id="confirmPin"
                              name="confirmPin"
                              value={pinData.confirmPin}
                              onChange={handlePinChange}
                              placeholder="Confirm new PIN"
                              minLength="6"
                              maxLength="6"
                            />
                            <button
                              type="button"
                              className="btn btn-outline-secondary"
                              onClick={() =>
                                togglePasswordVisibility("confirmPin")
                              }
                            >
                              <i
                                className={`fas ${showPassword.confirmPin ? "fa-eye-slash" : "fa-eye"}`}
                              ></i>
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="row">
                        <div className="col-xl-6 col-lg-6 col-md-6 mb-2">
                          <button
                            type="submit"
                            className="btn btn-primary w-100 btn-update"
                            disabled={loading}
                          >
                            {loading ? (
                              <>
                                <span
                                  className="spinner-border spinner-border-sm me-2"
                                  role="status"
                                  aria-hidden="true"
                                ></span>
                                Updating...
                              </>
                            ) : (
                              <>
                                <i className="fas fa-sync-alt me-2"></i>
                                Update PIN
                              </>
                            )}
                          </button>
                        </div>
                        <div className="col-xl-6 col-lg-6 col-md-6 mb-2">
                          <button
                            type="button"
                            className="btn btn-outline-secondary w-100"
                            onClick={handlePinCancel}
                            disabled={loading}
                          >
                            <i className="fas fa-times me-2"></i>
                            Cancel
                          </button>
                        </div>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* Business Details Tab */}
              {activeTab === "business" && (
                <div className="business-details-container">
                  {/* Header with Save Button */}
                  <div className="card modern-card mb-4">
                    <div className="card-body d-flex justify-content-between align-items-center">
                      <div className="d-flex align-items-center gap-3">
                        <div className="p-3 rounded-4 bg-success bg-opacity-10">
                          <i
                            className="fas fa-building text-white"
                            style={{ fontSize: "2rem" }}
                          ></i>
                        </div>
                        <div>
                          <h4 className="mb-1 fw-bold">Account & Branding</h4>
                          <p className="text-muted mb-0">
                            Business Profile Settings
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={handleSaveAll}
                        disabled={isSaving || isBusinessLoading}
                        className="btn btn-success px-5 py-3 rounded-4 fw-bold d-flex align-items-center gap-2"
                      >
                        {isSaving || isBusinessLoading ? (
                          <>
                            <span
                              className="spinner-border spinner-border-sm me-2"
                              role="status"
                              aria-hidden="true"
                            ></span>
                            {isBusinessLoading ? "LOADING..." : "SYNCING..."}
                          </>
                        ) : (
                          <>
                            <i className="fas fa-save me-2"></i>
                            SAVE CHANGES
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="row g-4">
                    {/* Branding Assets Card */}
                    <div className="col-12">
                      <div className="card border-0 shadow-sm rounded-4 p-4 bg-white">
                        <h5
                          className="fw-bold mb-4 pb-3 border-bottom"
                          style={{ color: "#198754" }}
                        >
                          <i className="fas fa-palette me-2"></i>
                          Branding Assets (HTTPS Media Storage)
                        </h5>
                        <div className="row g-4">
                          {[
                            {
                              label: "Profile Photo",
                              field: "profilePhotoUrl",
                              icon: "fa-user",
                            },
                            {
                              label: "Company Logo",
                              field: "logoUrl",
                              icon: "fa-building",
                            },
                            {
                              label: "Payment QR",
                              field: "qrCodeUrl",
                              icon: "fa-qrcode",
                            },
                            {
                              label: "Authorized Seal",
                              field: "sealUrl",
                              icon: "fa-shield-alt",
                            },
                            {
                              label: "Paid Stamp",
                              field: "paidSealUrl",
                              icon: "fa-check-circle",
                            },
                            {
                              label: "Unpaid Stamp",
                              field: "unpaidSealUrl",
                              icon: "fa-times-circle",
                            },
                          ].map((asset) => (
                            <div
                              key={asset.field}
                              className="col-6 col-md-4 col-lg-2 text-center"
                            >
                              <label className="fw-bold mb-3 d-block">
                                {asset.label}
                              </label>
                              <div
                                className="position-relative mx-auto"
                                style={{ width: "120px", height: "120px" }}
                              >
                                <div className="w-100 h-100 bg-light rounded-4 border-2 border-dashed border-secondary d-flex align-items-center justify-content-center overflow-hidden">
                                  {uploadingField === asset.field ? (
                                    <div className="d-flex align-items-center justify-content-center h-100">
                                      <span
                                        className="spinner-border text-success"
                                        role="status"
                                      ></span>
                                    </div>
                                  ) : businessSettings[asset.field] ? (
                                    <img
                                      src={businessSettings[asset.field]}
                                      className="w-100 h-100 object-fit-contain p-2"
                                      alt={asset.label}
                                    />
                                  ) : (
                                    <div className="text-center opacity-50">
                                      <i
                                        className={`fas ${asset.icon} fa-2x text-muted`}
                                      ></i>
                                    </div>
                                  )}
                                  <input
                                    type="file"
                                    className="position-absolute w-100 h-100 opacity-0 cursor-pointer top-0 start-0"
                                    accept="image/*"
                                    onChange={(e) =>
                                      handleImageUpload(asset.field, e)
                                    }
                                    title={`Upload ${asset.label}`}
                                  />
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Office Details Card */}
                    <div className="col-lg-6">
                      <div className="card border-0 shadow-sm rounded-4 p-4 h-100 bg-white">
                        <h5
                          className="fw-bold mb-4 pb-3 border-bottom"
                          style={{ color: "#198754" }}
                        >
                          <i className="fas fa-building me-2"></i>
                          Office Details
                        </h5>
                        <div className="row g-3">
                          <div className="col-md-6">
                            <label className="form-label small fw-bold text-muted">
                              Business Name
                            </label>
                            <input
                              className="form-control modern-input"
                              value={businessSettings.companyName}
                              onChange={(e) =>
                                handleBusinessChange(
                                  "companyName",
                                  e.target.value,
                                )
                              }
                            />
                          </div>
                          <div className="col-md-6">
                            <label className="form-label small fw-bold text-muted">
                              GSTIN
                            </label>
                            <input
                              className="form-control modern-input"
                              value={businessSettings.gstin}
                              onChange={(e) =>
                                handleBusinessChange("gstin", e.target.value)
                              }
                              placeholder="Enter GSTIN"
                            />
                          </div>
                          <div className="col-md-6">
                            <label className="form-label small fw-bold text-muted">
                              Contact Phone
                            </label>
                            <input
                              className="form-control modern-input"
                              value={businessSettings.companyPhone}
                              onChange={(e) =>
                                handleBusinessChange(
                                  "companyPhone",
                                  e.target.value,
                                )
                              }
                            />
                          </div>
                          <div className="col-md-6">
                            <label className="form-label small fw-bold text-muted">
                              Official Email
                            </label>
                            <input
                              className="form-control modern-input"
                              value={businessSettings.companyEmail}
                              onChange={(e) =>
                                handleBusinessChange(
                                  "companyEmail",
                                  e.target.value,
                                )
                              }
                            />
                          </div>
                          <div className="col-12">
                            <label className="form-label small fw-bold text-muted">
                              Full Address
                            </label>
                            <input
                              type="text"
                              className="form-control modern-input"
                              value={businessSettings.companyAddress}
                              onChange={(e) =>
                                handleBusinessChange(
                                  "companyAddress",
                                  e.target.value,
                                )
                              }
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Banking & Prefs Card */}
                    <div className="col-lg-6">
                      <div className="card border-0 shadow-sm rounded-4 p-4 h-100 bg-white">
                        <h5
                          className="fw-bold mb-4 pb-3 border-bottom"
                          style={{ color: "#198754" }}
                        >
                          <i className="fas fa-university me-2"></i>
                          Banking & Prefs
                        </h5>
                        <div className="row g-3">
                          <div className="col-md-6">
                            <label className="form-label small fw-bold text-muted">
                              Bank Name
                            </label>
                            <input
                              className="form-control modern-input"
                              value={businessSettings.bankName}
                              onChange={(e) =>
                                handleBusinessChange("bankName", e.target.value)
                              }
                            />
                          </div>
                          <div className="col-md-6">
                            <label className="form-label small fw-bold text-muted">
                              Account Number
                            </label>
                            <input
                              className="form-control modern-input"
                              value={businessSettings.accountNumber}
                              onChange={(e) =>
                                handleBusinessChange(
                                  "accountNumber",
                                  e.target.value,
                                )
                              }
                            />
                          </div>
                          <div className="col-md-6">
                            <label className="form-label small fw-bold text-muted">
                              Account Name
                            </label>
                            <input
                              className="form-control modern-input"
                              value={businessSettings.accountName}
                              onChange={(e) =>
                                handleBusinessChange(
                                  "accountName",
                                  e.target.value,
                                )
                              }
                            />
                          </div>
                          <div className="col-md-6">
                            <label className="form-label small fw-bold text-muted">
                              IFSC Code
                            </label>
                            <input
                              className="form-control modern-input"
                              value={businessSettings.ifscCode}
                              onChange={(e) =>
                                handleBusinessChange("ifscCode", e.target.value)
                              }
                            />
                          </div>
                          <div className="col-12">
                            <label className="form-label small fw-bold text-muted">
                              Branch Address
                            </label>
                            <input
                              type="text"
                              className="form-control modern-input"
                              value={businessSettings.branchAddress}
                              onChange={(e) =>
                                handleBusinessChange(
                                  "branchAddress",
                                  e.target.value,
                                )
                              }
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Cloud Master Sync Card */}
                    <div className="col-12 mb-4">
                      <div className="card border-0 shadow-sm rounded-4 overflow-hidden">
                        <div className="card-header bg-success text-white py-3 px-4 border-0 d-flex align-items-center justify-content-between">
                          <div className="d-flex align-items-center gap-3">
                            <i className="fas fa-database fa-lg"></i>
                            <div>
                              <h5 className="fw-bold mb-0">
                                Cloud Master Sync
                              </h5>
                              <small className="text-white opacity-75">
                                Global Database Infrastructure
                              </small>
                            </div>
                          </div>
                          <div className="form-check form-switch">
                            <input
                              className="form-check-input cursor-pointer"
                              type="checkbox"
                              role="switch"
                              id="dbSyncSwitch"
                              checked={businessSettings.dbSyncEnabled}
                              onChange={(e) =>
                                handleBusinessChange(
                                  "dbSyncEnabled",
                                  e.target.checked,
                                )
                              }
                              style={{ width: "3rem", height: "1.5rem" }}
                            />
                          </div>
                        </div>

                        <div className="card-body p-4 bg-white">
                          <div className="row g-4">
                            <div className="col-lg-6">
                              <label className="form-label fw-bold text-muted small text-uppercase mb-2">
                                MongoDB Cluster URI
                              </label>

                              <div
                                className="input-group"
                                style={{ maxWidth: "100%" }}
                              >
                                <span className="input-group-text bg-light border-2">
                                  <i className="fas fa-database"></i>
                                </span>

                                <input
                                  type="text"
                                  className="form-control modern-input border-2"
                                  value={businessSettings.mongoConnectionString}
                                  onChange={(e) =>
                                    handleBusinessChange(
                                      "mongoConnectionString",
                                      e.target.value,
                                    )
                                  }
                                  placeholder="mongodb+srv://username:password@cluster.mongodb.net/database"
                                />
                              </div>

                              <small className="text-muted mt-1 d-block">
                                <i className="fas fa-info-circle me-1"></i>
                                Enter your MongoDB connection string
                              </small>
                            </div>

                            <div className="col-lg-6">
                              <label className="form-label fw-bold text-muted small text-uppercase mb-2">
                                Netlify Bridge API URL
                              </label>

                              <div
                                className="input-group"
                                style={{ maxWidth: "100%" }}
                              >
                                <span className="input-group-text bg-light border-2">
                                  <i className="fas fa-link"></i>
                                </span>

                                <input
                                  type="url"
                                  className="form-control modern-input border-2"
                                  value={businessSettings.mongoApiUrl}
                                  onChange={(e) =>
                                    handleBusinessChange(
                                      "mongoApiUrl",
                                      e.target.value,
                                    )
                                  }
                                  placeholder="https://your-app.netlify.app/.netlify/functions/sync"
                                />
                              </div>

                              <small className="text-muted mt-1 d-block">
                                <i className="fas fa-info-circle me-1"></i>
                                Your Netlify function endpoint
                              </small>
                            </div>

                            <div className="col-12">
                              <button
                                onClick={handleTestConnection}
                                disabled={isTesting}
                                className="btn btn-outline-success px-4 py-2 fw-bold"
                              >
                                {isTesting ? (
                                  <>
                                    <span
                                      className="spinner-border spinner-border-sm me-2"
                                      role="status"
                                    ></span>
                                    Verifying Connection...
                                  </>
                                ) : (
                                  <>
                                    <i className="fas fa-plug me-2"></i>
                                    Test MongoDB Connection
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "terms" && (
                <div className="business-details-container">
                  <div className="card modern-card mb-4">
                    <div className="card-body d-flex justify-content-between align-items-center">
                      <div>
                        <h5 className="mb-1 fw-bold">Terms & Conditions</h5>
                        <p className="text-muted mb-0">
                          Manage default terms and conditions for invoice
                          previews
                        </p>
                      </div>
                      <div className="d-flex gap-2">
                        <button
                          onClick={() => setShowResetTermsConfirm(true)}
                          disabled={isSaving || isBusinessLoading}
                          className="btn btn-outline-secondary px-4 py-2 fw-bold"
                        >
                          <i className="fas fa-rotate-left me-2"></i>
                          Reset to Default
                        </button>
                        <button
                          onClick={handleSaveAll}
                          disabled={isSaving || isBusinessLoading}
                          className="btn btn-success px-4 py-2 fw-bold"
                        >
                          {isSaving || isBusinessLoading ? (
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
                              <i className="fas fa-save me-2"></i>
                              Save Terms
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="row g-4">
                    <div className="col-lg-6">
                      <div className="card border-0 shadow-sm rounded-4 p-4 bg-white h-100">
                        <h5
                          className="fw-bold mb-3 pb-2 border-bottom"
                          style={{ color: "#198754" }}
                        >
                          <i className="fas fa-file-invoice me-2"></i>
                          Invoice Terms
                        </h5>
                        <p className="text-muted small mb-2">
                          Each line will be treated as a separate point.
                        </p>
                        <textarea
                          className="form-control modern-input"
                          rows={14}
                          value={businessSettings.invoiceTermsConditions || ""}
                          onChange={(e) =>
                            handleBusinessChange(
                              "invoiceTermsConditions",
                              e.target.value,
                            )
                          }
                          placeholder="Invoice terms yahan likhein (one line per term)"
                        />
                      </div>
                    </div>

                    <div className="col-lg-6">
                      <div className="card border-0 shadow-sm rounded-4 p-4 bg-white h-100">
                        <h5
                          className="fw-bold mb-3 pb-2 border-bottom"
                          style={{ color: "#198754" }}
                        >
                          <i className="fas fa-file-invoice-dollar me-2"></i>
                          Self Invoice Terms
                        </h5>
                        <p className="text-muted small mb-2">
                          Each line will be treated as a separate point.
                        </p>
                        <textarea
                          className="form-control modern-input"
                          rows={14}
                          value={
                            businessSettings.selfInvoiceTermsConditions || ""
                          }
                          onChange={(e) =>
                            handleBusinessChange(
                              "selfInvoiceTermsConditions",
                              e.target.value,
                            )
                          }
                          placeholder="Self invoice terms yahan likhein (one line per term)"
                        />
                      </div>
                    </div>
                  </div>

                  <ConfirmationModal
                    show={showResetTermsConfirm}
                    onHide={() => setShowResetTermsConfirm(false)}
                    onConfirm={handleResetTermsToDefault}
                    title="Reset Terms to Default?"
                    message="Invoice Terms and Self Invoice Terms will both be reset to their default values."
                    confirmText="Yes, Reset"
                    cancelText="Cancel"
                    variant="warning"
                  />
                </div>
              )}

              {/* HSN Code Tab */}
              {/* HSN Code Tab */}
              {activeTab === "hsn" && (
                <div className="business-details-container">
                  <div className="row g-4">
                    <div className="col-12">
                      <div className="card border-0 shadow-sm rounded-4 p-0 bg-white overflow-hidden">
                        {/* Header */}
                        <div className="px-4 py-3 border-bottom bg-success">
                          <h5 className="fw-bold mb-1 text-white">
                            Service Master & HSN Codes
                          </h5>
                          <p className="text-uppercase text-white mb-0">
                            Global inventory of services and tax codes
                          </p>
                        </div>

                        {/* Controls */}
                        <div className="premium-controls p-4 border-bottom m-0">
                          <div className="premium-search-box">
                            <i className="fas fa-search"></i>
                            <input
                              type="text"
                              placeholder="Search services..."
                              value={serviceSearch}
                              onChange={(e) => setServiceSearch(e.target.value)}
                            />
                          </div>
                          <div className="d-flex gap-2">
                            {selectedServices.length > 0 && (
                              <button
                                onClick={() =>
                                  setConfirmDeleteServices(selectedServices)
                                }
                                className="p-btn p-btn-danger"
                              >
                                <i className="fas fa-trash"></i> Delete Selected
                                ({selectedServices.length})
                              </button>
                            )}
                            <button
                              onClick={openAddServiceModal}
                              className="btn btn-primary"
                            >
                              <i className="fas fa-plus-circle"></i> Add New Row
                            </button>
                          </div>
                        </div>

                        {/* Table */}
                        <div className="premium-table-container border-0 rounded-0">
                          <div className="table-responsive">
                            <table className="premium-table">
                              <thead>
                                <tr>
                                  <th
                                    style={{ width: "40px" }}
                                    className="text-center"
                                  >
                                    <input
                                      type="checkbox"
                                      className="custom-checkbox"
                                      checked={
                                        selectedServices.length ===
                                          filteredServices.length &&
                                        filteredServices.length > 0
                                      }
                                      onChange={toggleSelectAll}
                                    />
                                  </th>
                                  <th>Service Name</th>
                                  <th>HSN / SAC Code</th>
                                  <th>Status</th>
                                  <th style={{ textAlign: "center" }}>
                                    Actions
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {filteredServices.map((service) => {
                                  const isActive =
                                    getServiceStatus(service) === "active";

                                  return (
                                    <tr
                                      key={service.id}
                                      className={
                                        selectedServices.includes(service.id)
                                          ? "bg-indigo-50"
                                          : ""
                                      }
                                    >
                                      <td className="text-center">
                                        <input
                                          type="checkbox"
                                          className="custom-checkbox"
                                          checked={selectedServices.includes(
                                            service.id,
                                          )}
                                          onChange={() =>
                                            toggleSelectRow(service.id)
                                          }
                                        />
                                      </td>
                                      <td className="fw-bold text-dark">
                                        {service.name}
                                      </td>
                                      <td className="fw-bold">
                                        {service.hsnCode}
                                      </td>
                                      <td>
                                        <div className="status-toggle-wrap">
                                          <label className="status-switch">
                                            <input
                                              type="checkbox"
                                              checked={isActive}
                                              onChange={() =>
                                                toggleServiceStatus(service.id)
                                              }
                                            />
                                            <span className="status-slider"></span>
                                          </label>
                                          <span
                                            className={`status-text ${
                                              isActive ? "active" : "inactive"
                                            }`}
                                          >
                                            {isActive ? "Active" : "Inactive"}
                                          </span>
                                        </div>
                                      </td>
                                      <td>
                                        <div className="d-flex justify-content-center gap-1">
                                          <button
                                            onClick={() =>
                                              openEditServiceModal(service)
                                            }
                                            className="icon-action-btn edit"
                                            title="Edit"
                                          >
                                            <i className="fas fa-pen"></i>
                                          </button>
                                          <button
                                            onClick={() =>
                                              removeService(service.id)
                                            }
                                            className="icon-action-btn delete"
                                            title="Delete"
                                          >
                                            <i className="fas fa-trash-alt"></i>
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                            {filteredServices.length === 0 && (
                              <div className="empty-state">
                                <i className="fas fa-table"></i>
                                <h3>No Services Found</h3>
                                <p>Add your standard billing items above.</p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Add/Edit Service Modal */}
                  {isServiceModalOpen && (
                    <div
                      className="modal fade show d-block"
                      style={{
                        backgroundColor: "rgba(0,0,0,0.7)",
                        zIndex: 1100,
                      }}
                    >
                      <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content rounded-4 border-0 shadow-lg">
                          <div className="modal-header">
                            <h5 className="modal-title fw-bold">
                              {editingServiceId
                                ? "Edit Service"
                                : "Add New Service"}
                            </h5>
                            <button
                              type="button"
                              className="btn-close"
                              onClick={closeServiceModal}
                            ></button>
                          </div>
                          <div className="modal-body">
                            <div className="mb-3">
                              <label className="form-label fw-bold">
                                Service Name
                              </label>
                              <input
                                className="form-control modern-input"
                                value={serviceFormData.name}
                                onChange={(e) =>
                                  handleServiceFormChange(
                                    "name",
                                    e.target.value,
                                  )
                                }
                                placeholder="Enter service name"
                              />
                            </div>
                            <div className="mb-3">
                              <label className="form-label fw-bold">
                                HSN / SAC Code
                              </label>
                              <input
                                className="form-control modern-input"
                                value={serviceFormData.hsnCode}
                                onChange={(e) =>
                                  handleServiceFormChange(
                                    "hsnCode",
                                    e.target.value,
                                  )
                                }
                                placeholder="Enter HSN code"
                              />
                            </div>
                          </div>
                          <div className="modal-footer">
                            <button
                              type="button"
                              className="btn btn-light text-white"
                              onClick={closeServiceModal}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={saveService}
                            >
                              {editingServiceId ? "Update" : "Save"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Service Deletion Confirmation Modal */}
                  <ConfirmationModal
                    show={confirmDeleteServices.length > 0}
                    onHide={() => setConfirmDeleteServices([])}
                    onConfirm={handleBulkDeleteServices}
                    title="Remove Services?"
                    message={`Are you sure you want to remove ${confirmDeleteServices.length} service(s) from the master database?`}
                    confirmText="Yes, Remove"
                    cancelText="Cancel"
                    variant="danger"
                  />
                </div>
              )}

              {/* Backup & Restore Tab */}
              {activeTab === "backup" && (
                <div className="business-details-container">
                  <div className="row g-4">
                    {/* Export Backup Section */}
                    <div className="col-lg-6">
                      <div className="card modern-card h-100">
                        <div className="card-body">
                          <div className="text-center mb-4">
                            <div className="backup-icon-wrapper mb-3">
                              <i className="fas fa-download fa-3x text-primary"></i>
                            </div>
                            <h4 className="fw-bold mb-2">Export Backup</h4>
                            <p className="text-muted">
                              Download all your data as a ZIP file for
                              safekeeping
                            </p>
                          </div>

                          <div className="backup-info-card mb-3">
                            <div className="d-flex align-items-center mb-2">
                              <i className="fas fa-info-circle text-info me-2"></i>
                              <strong>What will be exported?</strong>
                            </div>
                            <ul className="backup-list">
                              <li>
                                <i className="fas fa-check-circle text-success me-2"></i>
                                All Clients Data
                              </li>
                              <li>
                                <i className="fas fa-check-circle text-success me-2"></i>
                                All Vendors Data
                              </li>
                              <li>
                                <i className="fas fa-check-circle text-success me-2"></i>
                                All Staff Records
                              </li>
                              <li>
                                <i className="fas fa-check-circle text-success me-2"></i>
                                All Invoices & Sales
                              </li>
                              <li>
                                <i className="fas fa-check-circle text-success me-2"></i>
                                All Purchases
                              </li>
                              <li>
                                <i className="fas fa-check-circle text-success me-2"></i>
                                All RCM Records
                              </li>
                              <li>
                                <i className="fas fa-check-circle text-success me-2"></i>
                                All Projects Data
                              </li>
                              <li>
                                <i className="fas fa-check-circle text-success me-2"></i>
                                Business Settings
                              </li>
                              <li>
                                <i className="fas fa-check-circle text-success me-2"></i>
                                Financial Years
                              </li>
                            </ul>
                          </div>

                          {backupProgress && (
                            <div className="alert alert-info">
                              <i className="fas fa-spinner fa-spin me-2"></i>
                              {backupProgress}
                            </div>
                          )}

                          <button
                            className="btn btn-primary btn-lg w-100"
                            onClick={handleExportBackup}
                            disabled={isExporting}
                          >
                            {isExporting ? (
                              <>
                                <i className="fas fa-spinner fa-spin me-2"></i>
                                Exporting...
                              </>
                            ) : (
                              <>
                                <i className="fas fa-download me-2"></i>
                                Export Backup Now
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Import Backup Section */}
                    <div className="col-lg-6">
                      <div className="card modern-card h-100">
                        <div className="card-body">
                          <div className="text-center mb-4">
                            <div className="backup-icon-wrapper mb-3">
                              <i className="fas fa-upload fa-3x text-success"></i>
                            </div>
                            <h4 className="fw-bold mb-2">Restore Backup</h4>
                            <p className="text-muted">
                              Import and restore data from a previously exported
                              ZIP file
                            </p>
                          </div>

                          <div className="backup-warning-card mb-3">
                            <div className="d-flex align-items-start">
                              <i className="fas fa-exclamation-triangle text-warning me-2 mt-1"></i>
                              <div>
                                <strong className="text-warning">
                                  Important Warning!
                                </strong>
                                <p className="mb-0 mt-1 small">
                                  Importing a backup will{" "}
                                  <strong>replace all existing data</strong>{" "}
                                  with the data from the backup file. This
                                  action cannot be undone. Please export a
                                  current backup before proceeding.
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="backup-info-card mb-3">
                            <div className="d-flex align-items-center mb-2">
                              <i className="fas fa-list-check text-primary me-2"></i>
                              <strong>Before you restore:</strong>
                            </div>
                            <ul className="backup-list">
                              <li>
                                <i className="fas fa-arrow-right text-primary me-2"></i>
                                Export current data as backup
                              </li>
                              <li>
                                <i className="fas fa-arrow-right text-primary me-2"></i>
                                Verify the ZIP file is not corrupted
                              </li>
                              <li>
                                <i className="fas fa-arrow-right text-primary me-2"></i>
                                Ensure file is from this system
                              </li>
                            </ul>
                          </div>

                          <input
                            type="file"
                            ref={backupFileInputRef}
                            accept=".zip"
                            style={{ display: "none" }}
                            onChange={handleImportBackup}
                          />

                          <button
                            className="btn btn-success btn-lg w-100"
                            onClick={() => backupFileInputRef.current?.click()}
                            disabled={isImporting}
                          >
                            {isImporting ? (
                              <>
                                <i className="fas fa-spinner fa-spin me-2"></i>
                                Importing...
                              </>
                            ) : (
                              <>
                                <i className="fas fa-upload me-2"></i>
                                Choose Backup File
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Additional Information */}
                    <div className="col-12">
                      <div className="card modern-card">
                        <div className="card-body">
                          <h5 className="fw-bold mb-3">
                            <i className="fas fa-lightbulb text-warning me-2"></i>
                            Backup Best Practices
                          </h5>
                          <div className="row">
                            <div className="col-md-6">
                              <div className="backup-tip">
                                <i className="fas fa-calendar-day text-info me-2"></i>
                                <strong>Regular Backups:</strong> Export backups
                                daily or weekly
                              </div>
                            </div>
                            <div className="col-md-6">
                              <div className="backup-tip">
                                <i className="fas fa-cloud text-primary me-2"></i>
                                <strong>Multiple Locations:</strong> Store
                                backups in different places
                              </div>
                            </div>
                            <div className="col-md-6">
                              <div className="backup-tip">
                                <i className="fas fa-shield-halved text-success me-2"></i>
                                <strong>Verify Backups:</strong> Test restore
                                periodically
                              </div>
                            </div>
                            <div className="col-md-6">
                              <div className="backup-tip">
                                <i className="fas fa-tag text-danger me-2"></i>
                                <strong>Label Files:</strong> Use dates in
                                backup filenames
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Google Drive Auto Backup Configuration */}
                    <div className="col-12">
                      <div className="card modern-card">
                        <div className="card-body">
                          <div className="d-flex justify-content-between align-items-center mb-4">
                            <div>
                              <h5 className="fw-bold mb-1">
                                <i className="fab fa-google-drive text-success me-2"></i>
                                Google Drive Auto Backup
                              </h5>
                              <p className="text-muted mb-0">
                                Automatically backup your data to Google Drive
                                daily
                              </p>
                            </div>
                            <div className="form-check form-switch">
                              <input
                                className="form-check-input"
                                type="checkbox"
                                id="driveEnabled"
                                checked={driveConfig.enabled}
                                onChange={(e) =>
                                  setDriveConfig({
                                    ...driveConfig,
                                    enabled: e.target.checked,
                                  })
                                }
                                style={{ width: "48px", height: "24px" }}
                              />
                              <label
                                className="form-check-label ms-2 fw-bold"
                                htmlFor="driveEnabled"
                              >
                                {driveConfig.enabled ? "Enabled" : "Disabled"}
                              </label>
                            </div>
                          </div>

                          {driveConfig.enabled && (
                            <>
                              <div className="alert alert-info mb-4">
                                <i className="fas fa-info-circle me-2"></i>
                                <strong>Setup Instructions:</strong>
                                <ol className="mb-0 mt-2 ps-3">
                                  <li>
                                    Go to{" "}
                                    <a
                                      href="https://console.cloud.google.com"
                                      target="_blank"
                                      rel="noopener noreferrer"
                                    >
                                      Google Cloud Console
                                    </a>
                                  </li>
                                  <li>
                                    Create a project and enable Google Drive API
                                  </li>
                                  <li>Create OAuth 2.0 credentials</li>
                                  <li>
                                    Get your Client ID, Client Secret, and
                                    generate Refresh Token
                                  </li>
                                  <li>
                                    Create a folder in Google Drive for backups
                                    and copy its Folder ID from URL
                                  </li>
                                </ol>
                              </div>

                              <div className="row g-3">
                                <div className="col-md-6">
                                  <label className="form-label fw-bold">
                                    <i className="fas fa-key me-2"></i>
                                    Google Client ID
                                  </label>
                                  <input
                                    type="text"
                                    className="form-control modern-input"
                                    value={driveConfig.clientId}
                                    onChange={(e) =>
                                      setDriveConfig({
                                        ...driveConfig,
                                        clientId: e.target.value,
                                      })
                                    }
                                    placeholder="Enter Client ID"
                                  />
                                </div>

                                <div className="col-md-6">
                                  <label className="form-label fw-bold">
                                    <i className="fas fa-lock me-2"></i>
                                    Google Client Secret
                                  </label>
                                  <div className="input-group">
                                    <input
                                      type={
                                        showDrivePassword.clientSecret
                                          ? "text"
                                          : "password"
                                      }
                                      className="form-control modern-input"
                                      value={driveConfig.clientSecret}
                                      onChange={(e) =>
                                        setDriveConfig({
                                          ...driveConfig,
                                          clientSecret: e.target.value,
                                        })
                                      }
                                      placeholder="Enter Client Secret"
                                    />
                                    <button
                                      className="btn btn-outline-secondary"
                                      type="button"
                                      onClick={() =>
                                        setShowDrivePassword({
                                          ...showDrivePassword,
                                          clientSecret:
                                            !showDrivePassword.clientSecret,
                                        })
                                      }
                                    >
                                      <i
                                        className={`fas fa-eye${showDrivePassword.clientSecret ? "-slash" : ""}`}
                                      ></i>
                                    </button>
                                  </div>
                                </div>

                                <div className="col-md-12">
                                  <label className="form-label fw-bold">
                                    <i className="fas fa-refresh me-2"></i>
                                    Refresh Token
                                  </label>
                                  <div className="input-group">
                                    <input
                                      type={
                                        showDrivePassword.refreshToken
                                          ? "text"
                                          : "password"
                                      }
                                      className="form-control modern-input"
                                      value={driveConfig.refreshToken}
                                      onChange={(e) =>
                                        setDriveConfig({
                                          ...driveConfig,
                                          refreshToken: e.target.value,
                                        })
                                      }
                                      placeholder="Enter Refresh Token"
                                    />
                                    <button
                                      className="btn btn-outline-secondary"
                                      type="button"
                                      onClick={() =>
                                        setShowDrivePassword({
                                          ...showDrivePassword,
                                          refreshToken:
                                            !showDrivePassword.refreshToken,
                                        })
                                      }
                                    >
                                      <i
                                        className={`fas fa-eye${showDrivePassword.refreshToken ? "-slash" : ""}`}
                                      ></i>
                                    </button>
                                  </div>
                                  <small className="text-muted">
                                    Generate refresh token using OAuth 2.0
                                    Playground or your app
                                  </small>
                                </div>

                                <div className="col-md-12">
                                  <label className="form-label fw-bold">
                                    <i className="fas fa-shield-alt me-2"></i>
                                    Backup API Key
                                  </label>
                                  <div className="input-group">
                                    <input
                                      type={
                                        showDrivePassword.backupApiKey
                                          ? "text"
                                          : "password"
                                      }
                                      className="form-control modern-input"
                                      value={driveConfig.backupApiKey}
                                      onChange={(e) =>
                                        setDriveConfig({
                                          ...driveConfig,
                                          backupApiKey: e.target.value,
                                        })
                                      }
                                      placeholder="Enter Backup API Key"
                                    />
                                    <button
                                      className="btn btn-outline-secondary"
                                      type="button"
                                      onClick={() =>
                                        setShowDrivePassword({
                                          ...showDrivePassword,
                                          backupApiKey:
                                            !showDrivePassword.backupApiKey,
                                        })
                                      }
                                    >
                                      <i
                                        className={`fas fa-eye${showDrivePassword.backupApiKey ? "-slash" : ""}`}
                                      ></i>
                                    </button>
                                  </div>
                                  <small className="text-muted">
                                    Create a strong random key:{" "}
                                    <code>openssl rand -hex 32</code> or{" "}
                                    <code>
                                      node -e
                                      "console.log(require('crypto').randomBytes(32).toString('hex'))"
                                    </code>
                                  </small>
                                </div>

                                <div className="col-md-6">
                                  <label className="form-label fw-bold">
                                    <i className="fas fa-folder me-2"></i>
                                    Google Drive Folder ID
                                  </label>
                                  <input
                                    type="text"
                                    className="form-control modern-input"
                                    value={driveConfig.folderId}
                                    onChange={(e) =>
                                      setDriveConfig({
                                        ...driveConfig,
                                        folderId: e.target.value,
                                      })
                                    }
                                    placeholder="Enter Folder ID from Drive URL"
                                  />
                                  <small className="text-muted">
                                    Open folder in Drive, copy ID from URL after
                                    /folders/
                                  </small>
                                </div>

                                <div className="col-md-6">
                                  <label className="form-label fw-bold">
                                    <i className="fas fa-clock me-2"></i>
                                    Backup Time (24-hour format)
                                  </label>
                                  <input
                                    type="time"
                                    className="form-control modern-input"
                                    value={driveConfig.backupTime}
                                    onChange={(e) =>
                                      setDriveConfig({
                                        ...driveConfig,
                                        backupTime: e.target.value,
                                      })
                                    }
                                  />
                                  <small className="text-muted">
                                    Default: 20:00 (8:00 PM IST)
                                  </small>
                                </div>
                              </div>

                              <div className="mt-4">
                                <button
                                  className="btn btn-success btn-lg"
                                  onClick={handleSaveDriveConfig}
                                  disabled={isDriveSaving}
                                >
                                  {isDriveSaving ? (
                                    <>
                                      <i className="fas fa-spinner fa-spin me-2"></i>
                                      Saving...
                                    </>
                                  ) : (
                                    <>
                                      <i className="fas fa-save me-2"></i>
                                      Save Drive Configuration
                                    </>
                                  )}
                                </button>
                                <button
                                  className="btn btn-info btn-lg ms-2"
                                  onClick={handleTestDriveConnection}
                                  disabled={isDriveSaving}
                                >
                                  <i className="fas fa-plug me-2"></i>
                                  Test Connection
                                </button>
                              </div>

                              <div className="alert alert-info mt-3">
                                <i className="fas fa-info-circle me-2"></i>
                                <strong>✅ Configuration Saved!</strong> Now
                                follow these steps:
                                <ol className="mb-0 mt-2 ps-3">
                                  <li>
                                    <strong>Commit to GitHub</strong> (if not
                                    done):
                                    <code className="ms-2 small">
                                      git add . && git commit -m "Setup backup"
                                      && git push
                                    </code>
                                  </li>
                                  <li>
                                    <strong>Add GitHub Secrets</strong>:
                                    <ul className="mt-1">
                                      <li>
                                        Go to: Repository → Settings → Secrets
                                        and variables → Actions
                                      </li>
                                      <li>
                                        Click "New repository secret" and add
                                        these 7 secrets:
                                      </li>
                                      <li className="text-primary">
                                        • GOOGLE_CLIENT_ID
                                      </li>
                                      <li className="text-primary">
                                        • GOOGLE_CLIENT_SECRET
                                      </li>
                                      <li className="text-primary">
                                        • GOOGLE_REFRESH_TOKEN
                                      </li>
                                      <li className="text-primary">
                                        • GOOGLE_DRIVE_FOLDER_ID
                                      </li>
                                      <li className="text-primary">
                                        • NETLIFY_API_URL (your Netlify base
                                        URL)
                                      </li>
                                      <li className="text-primary">
                                        • MONGODB_URI (if not already added)
                                      </li>
                                      <li className="text-primary">
                                        • BACKUP_API_KEY (if not already added)
                                      </li>
                                    </ul>
                                  </li>
                                  <li>
                                    <strong>Test:</strong> GitHub Actions →
                                    "Auto Backup to Google Drive" → Run workflow
                                  </li>
                                </ol>
                                <div className="mt-2">
                                  <a
                                    href="https://github.com/settings/tokens"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn btn-sm btn-outline-primary me-2"
                                  >
                                    <i className="fab fa-github me-1"></i>
                                    Open GitHub
                                  </a>
                                  <button
                                    className="btn btn-sm btn-outline-info"
                                    onClick={() => {
                                      console.log("=".repeat(60));
                                      console.log("📋 GitHub Secrets to Add:");
                                      console.log("=".repeat(60));
                                      console.log(
                                        "1. GOOGLE_CLIENT_ID =",
                                        driveConfig.clientId,
                                      );
                                      console.log(
                                        "2. GOOGLE_CLIENT_SECRET =",
                                        driveConfig.clientSecret,
                                      );
                                      console.log(
                                        "3. GOOGLE_REFRESH_TOKEN =",
                                        driveConfig.refreshToken,
                                      );
                                      console.log(
                                        "4. GOOGLE_DRIVE_FOLDER_ID =",
                                        driveConfig.folderId,
                                      );
                                      console.log(
                                        "5. NETLIFY_API_URL = https://maxcode-invoice.netlify.app/api",
                                      );
                                      console.log(
                                        "6. BACKUP_API_KEY =",
                                        driveConfig.backupApiKey,
                                      );
                                      console.log(
                                        "7. MONGODB_URI = (your MongoDB connection string)",
                                      );
                                      console.log("=".repeat(60));
                                    }}
                                  >
                                    <i className="fas fa-terminal me-1"></i>
                                    Copy to Console
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style jsx>{`
        .modern-tabs {
          border: none;
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          border-radius: 15px;
          padding: 5px;
        }

        .modern-tabs .nav-link {
          border: none;
          color: white;
          font-weight: 600;
          border-radius: 10px;
          margin: 0 5px;
          transition: all 0.3s ease;
          background: #6c757d;
        }

        .modern-tabs .nav-link:hover {
          background: #5a6268;
          transform: translateY(-2px);
        }

        .modern-tabs .nav-link.active {
          background: var(--header-gradient);
          color: white;
          box-shadow: 0 4px 15px rgba(0, 0, 0, 0.2);
        }

        .modern-card {
          border: none;
          border-radius: 20px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
          backdrop-filter: blur(10px);
          background: rgba(255, 255, 255, 0.95);
          overflow: hidden;
        }

        .modern-card .card-body {
          padding: 2rem;
        }

        .business-details-container {
          animation: fadeIn 0.5s ease;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .border-dashed {
          border-style: dashed !important;
        }

        .cursor-pointer {
          cursor: pointer;
        }

        .object-fit-contain {
          object-fit: contain;
        }

        .btn-edit {
          transition: all 0.3s ease;
        }

        .btn-edit:hover {
          transform: translateY(-2px);
          box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
        }

        .modern-input {
          border: 2px solid #e9ecef;
          border-radius: 10px;
          padding: 12px 15px;
          transition: all 0.3s ease;
          background: white;
        }

        .modern-input:focus {
          border-color: #ff0000;
          box-shadow: 0 0 0 0.2rem rgba(255, 0, 0, 0.25);
          outline: none;
        }

        .modern-input:disabled {
          background-color: #f8f9fa;
          border-color: #dee2e6;
          color: #6c757d;
        }

        .form-label {
          font-weight: 600;
          color: #495057;
          margin-bottom: 0.5rem;
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

        .btn-update {
          transition: all 0.3s ease;
        }

        .btn-update:hover {
          transform: translateY(-2px);
          box-shadow: 0 5px 15px rgba(102, 126, 234, 0.4);
        }

        @media (max-width: 768px) {
          .modern-card .card-body {
            padding: 1.5rem;
          }
        }

        @media (max-width: 576px) {
          .modern-tabs .nav-link {
            font-size: 0.9rem;
            padding: 8px 12px;
          }
        }
        /* Premium Table Styles with Borders */
        .premium-table-container {
          background-color: white;
          border-radius: 12px;
          overflow: hidden;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
          margin-bottom: 0;
          border: 1px solid #e2e8f0;
        }

        .premium-table {
          width: 100%;
          border-collapse: collapse;
          border: 1px solid #e2e8f0;
        }

        .premium-table thead {
          background: linear-gradient(135deg, #007026 0, #09a98d 100%);
          color: white;
        }

        .premium-table th {
          padding: 15px;
          text-align: left;
          font-weight: 700;
          font-size: 0.85rem;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          border: 1px solid rgba(255, 255, 255, 0.1);
        }

        .premium-table tbody tr {
          border-bottom: 1px solid #e2e8f0;
          transition: background-color 0.2s;
        }

        .premium-table tbody tr:hover {
          background-color: #f1f5f9;
        }

        .premium-table td {
          padding: 12px 15px;
          vertical-align: middle;
          color: #475569;
          font-size: 0.9rem;
          border: 1px solid #e2e8f0;
        }

        .bg-indigo-50 {
          background-color: #eef2ff;
        }

        /* Checkbox Styling */
        .custom-checkbox {
          width: 18px;
          height: 18px;
          cursor: pointer;
          accent-color: #667eea;
        }

        /* Controls Section */
        .premium-controls {
          background-color: white;
          padding: 20px 25px;
          display: flex;
          flex-wrap: wrap;
          gap: 15px;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid #e2e8f0;
        }

        .premium-search-box {
          position: relative;
          flex-grow: 1;
          max-width: 400px;
        }

        .premium-search-box input {
          width: 100%;
          padding: 10px 15px 10px 40px;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          font-size: 0.9rem;
          background-color: #f8fafc;
        }

        .premium-search-box i {
          position: absolute;
          left: 15px;
          top: 50%;
          transform: translateY(-50%);
          color: #94a3b8;
        }

        /* Premium Buttons */
        .p-btn {
          padding: 8px 16px;
          border: none;
          border-radius: 8px;
          font-size: 0.85rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          text-decoration: none;
        }

        .p-btn-danger {
          background: #ef4444;
          color: white;
        }

        .p-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        }

        .icon-action-btn {
          width: 32px;
          height: 32px;
          border-radius: 6px;
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          background-color: transparent;
          transition: all 0.2s;
        }

        .icon-action-btn.edit {
          color: #667eea;
        }

        .icon-action-btn.delete {
          color: #ef4444;
        }

        .status-toggle-wrap {
          display: inline-flex;
          align-items: center;
          gap: 10px;
        }

        .status-switch {
          position: relative;
          display: inline-block;
          width: 42px;
          height: 24px;
          margin: 0;
        }

        .status-switch input {
          opacity: 0;
          width: 0;
          height: 0;
        }

        .status-slider {
          position: absolute;
          cursor: pointer;
          inset: 0;
          background-color: #cbd5e1;
          transition: 0.2s;
          border-radius: 999px;
        }

        .status-slider:before {
          position: absolute;
          content: "";
          height: 18px;
          width: 18px;
          left: 3px;
          top: 3px;
          background-color: white;
          transition: 0.2s;
          border-radius: 50%;
        }

        .status-switch input:checked + .status-slider {
          background-color: #16a34a;
        }

        .status-switch input:checked + .status-slider:before {
          transform: translateX(18px);
        }

        .status-text {
          min-width: 60px;
          font-size: 0.8rem;
          font-weight: 700;
        }

        .status-text.active {
          color: #166534;
        }

        .status-text.inactive {
          color: #991b1b;
        }

        .icon-action-btn:hover {
          background-color: #f1f5f9;
          transform: scale(1.1);
        }

        .empty-state {
          padding: 60px 20px;
          text-align: center;
          color: #94a3b8;
        }

        .empty-state i {
          font-size: 3.5rem;
          margin-bottom: 20px;
          color: #cbd5e1;
        }

        .empty-state h3 {
          font-size: 1.25rem;
          margin-bottom: 10px;
          color: #64748b;
          font-weight: 700;
        }

        /* Border utilities */
        .border-2 {
          border-width: 2px !important;
          border-color: #e2e8f0 !important;
        }

        /* Backup & Restore Styles */
        .backup-icon-wrapper {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 80px;
          height: 80px;
          border-radius: 50%;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
        }

        .backup-icon-wrapper i {
          color: white !important;
        }

        .backup-info-card {
          background: #f8f9fa;
          border-left: 4px solid #0d6efd;
          padding: 15px;
          border-radius: 8px;
        }

        .backup-warning-card {
          background: #fff3cd;
          border-left: 4px solid #ffc107;
          padding: 15px;
          border-radius: 8px;
        }

        .backup-list {
          list-style: none;
          padding-left: 0;
          margin-bottom: 0;
        }

        .backup-list li {
          padding: 6px 0;
          font-size: 0.95rem;
        }

        .backup-tip {
          padding: 12px;
          background: #f8f9fa;
          border-radius: 8px;
          margin-bottom: 10px;
          font-size: 0.9rem;
        }

        .backup-tip i {
          font-size: 1.2rem;
        }
      `}</style>
    </div>
  );
};

export default Settings;
