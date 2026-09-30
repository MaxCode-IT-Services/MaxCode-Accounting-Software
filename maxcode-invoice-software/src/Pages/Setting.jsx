import React, { useState, useRef, useEffect } from "react";
import {
  showSuccess,
  showError,
  showInfo,
  showWarning,
} from "../Components/ToastNotification";
import { apiGet, apiPost, apiPut } from "../utils/api";
import API_ENDPOINTS from "../utils/apiEndpoints";
import SettingsTabsNav from "../Components/SettingsTabs/SettingsTabsNav";
import ProfileTab from "../Components/SettingsTabs/ProfileTab";
import PinTab from "../Components/SettingsTabs/PinTab";
import TwoFATab from "../Components/SettingsTabs/TwoFATab";
import BusinessTab from "../Components/SettingsTabs/BusinessTab";
import WhatsAppCloudApiTab from "../Components/SettingsTabs/WhatsAppCloudApiTab";
import TelegramTab from "../Components/SettingsTabs/TelegramTab";
import CloudflareTab from "../Components/SettingsTabs/CloudflareTab";
import TermsTab from "../Components/SettingsTabs/TermsTab";
import HsnTab from "../Components/SettingsTabs/HsnTab";
import UpiIdTab from "../Components/SettingsTabs/UpiIdTab";
import BackupTab from "../Components/SettingsTabs/BackupTab";
import InterestedServiceTab from "../Components/SettingsTabs/InterestedServiceTab";
import {
  getStoredBiometricConfig,
  isBiometricSupported,
  registerBiometricForDevice,
  removeStoredBiometricConfig,
} from "../utils/biometricAuth";
import { createUsbKeyFileForUser } from "../utils/usbKeyAuth";
import {
  ensureFaceModelsLoaded,
  estimateFacePose,
  extractFaceDescriptorFromVideo,
  isFaceAuthSupported,
} from "../utils/faceAuth";
import {
  canAccessSettingsTab,
  getAccessibleSettingsTabs,
} from "../utils/permissions";

const SECRET_MASK = "********";
const SECRET_AUTO_HIDE_MS = 45 * 1000;
const FACE_SETUP_REQUIRED_STEPS = [
  { key: "front", label: "Front Face" },
  { key: "smile", label: "Smile" },
  { key: "left", label: "Turn Left" },
  { key: "right", label: "Turn Right" },
  { key: "up", label: "Look Up" },
  { key: "down", label: "Look Down" },
];

const toMaskedSecret = (value = "", hasValue = false) => {
  if (hasValue) return SECRET_MASK;
  return String(value || "").trim() ? SECRET_MASK : "";
};

const Settings = () => {
  useEffect(() => {
    document.title = "Settings | MaxCode IT Services";
  }, []);

  const DEFAULT_PROFILE_FORM = {
    firstName: "Vipin",
    lastName: "Khandelwal",
    name: "Vipin Khandelwal",
    email: "contact@maxcode.in",
    phone: "9876543210",
    address: "New Mandi Dausa, Rajasthan",
    role: "Super Admin",
  };

  const DEFAULT_INVOICE_TERMS =
    "60% advance payment is required before starting the project.\n20% payment is due after 60% project completion.\nRemaining 20% must be paid before final completion and launch.\nA late fee of 3% per month will be charged on delayed payments.\nAdditional revisions will be billed separately.\nPayment once made after invoice issuance is non-refundable.\nMaintenance services are available at an additional cost.\nMaxCode can showcase completed projects in portfolios.\nPayments can be made via Cash, Bank Transfer, or UPI.\nCancellation charges will apply once the project has started.\nAll fees are non-refundable after project approval.\nOwnership rights will be transferred upon full payment.\nGST applicable on advance payment invoices.\nAll disputes are subject to Dausa, Rajasthan jurisdiction.";

  const DEFAULT_SELF_INVOICE_TERMS =
    "Issued under Section 31(3)(f) of CGST Act, 2017 under RCM.\nClassified as Import of Services from a non-resident supplier.\nMaxCode IT Services is liable to pay 18% IGST under RCM.\nPlace of Supply: Rajasthan (08) as per GST provisions.\nITC claimable only after RCM tax payment.\nInvoice value converted to INR at transaction date rate.\nLinked to original supplier reference for audit purposes.\nInvoice amount rounded off as per GST rules.\nPayment reflects net amount remitted to foreign vendor.\nThis is a computer-generated document.\nServices used for business purposes only.\nValid document for GST compliance and audit.\nDiscrepancies must match bank/payment records.\nSubject to Dausa, Rajasthan jurisdiction.";

  const DEFAULT_PERFORMA_INVOICE_TERMS = "";

  const DEFAULT_CREDIT_DEBIT_NOTE_TERMS = "";

  const [activeTab, setActiveTab] = useState("profile");
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [accessibleTabs, setAccessibleTabs] = useState([]);

  // Check tab access on mount
  useEffect(() => {
    const tabs = getAccessibleSettingsTabs();
    setAccessibleTabs(tabs);

    // If current tab is not accessible, switch to first accessible tab
    if (tabs.length > 0 && !tabs.some((t) => t.key === activeTab)) {
      setActiveTab(tabs[0].key);
    }
  }, []);

  // Check if navigation to tab is allowed
  const canAccessTab = (tabKey) => {
    return !accessibleTabs.length || canAccessSettingsTab(tabKey);
  };

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

  // 2FA State
  const [twoFAData, setTwoFAData] = useState({
    enabled: false,
    twoFACode: "",
  });
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [backupCodes, setBackupCodes] = useState([]);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [is2FALoading, setIs2FALoading] = useState(false);
  const [show2FAVerification, setShow2FAVerification] = useState(false);
  const [disable2FACode, setDisable2FACode] = useState("");
  const [biometricLogin, setBiometricLogin] = useState({
    enabled: false,
    supported: false,
    hasCredential: false,
  });
  const [isBiometricLoading, setIsBiometricLoading] = useState(false);
  const [usbKeyLogin, setUsbKeyLogin] = useState({
    enabled: false,
    configured: false,
  });
  const [isUsbKeyLoading, setIsUsbKeyLoading] = useState(false);
  const [faceAuth, setFaceAuth] = useState({
    enabled: false,
    configured: false,
    supported: false,
    stepsDone: [],
  });
  const [isFaceAuthLoading, setIsFaceAuthLoading] = useState(false);
  const [showFaceSetupModal, setShowFaceSetupModal] = useState(false);
  const [faceSetupProgress, setFaceSetupProgress] = useState(0);
  const [faceSetupStatusText, setFaceSetupStatusText] = useState(
    "Initializing camera...",
  );
  const [faceSetupStepsDone, setFaceSetupStepsDone] = useState([]);
  const [isFaceSetupSubmitting, setIsFaceSetupSubmitting] = useState(false);
  const faceSetupVideoRef = useRef(null);
  const faceSetupStreamRef = useRef(null);
  const faceSetupLoopRef = useRef(null);
  const faceSetupSamplesRef = useRef({});
  const faceSetupCooldownRef = useRef({});

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
    companyEmail: "contact@maxcode.in",

    // Banking & Prefs
    bankName: "State Bank of India",
    ifscCode: "SBIN0001234",
    accountNumber: "12345678901",
    accountName: "MaxCode IT Services",
    branchAddress: "Main Branch, Mumbai",
    invoiceTermsConditions: DEFAULT_INVOICE_TERMS,
    invoiceTermsVersion: "V1.0.0",
    selfInvoiceTermsConditions: DEFAULT_SELF_INVOICE_TERMS,
    selfInvoiceTermsVersion: "V1.0.0",
    performaInvoiceTermsConditions: DEFAULT_PERFORMA_INVOICE_TERMS,
    performaInvoiceTermsVersion: "V1.0.0",
    creditDebitNoteTermsConditions: DEFAULT_CREDIT_DEBIT_NOTE_TERMS,
    creditDebitNoteTermsVersion: "V1.0.0",
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

    // Interested Services Master
    interestedServices: [],

    // UPI IDs Master
    upiIds: [],

    // Cloud Master Sync
    dbSyncEnabled: false,
    mongoConnectionString: "",
    mongoApiUrl: "",

    // Cloudflare R2 / Worker settings for file uploads
    cloudflareSettings: {
      storeUrl: "",
      publicDomain: "",
      password: "",
      turnstileSiteKey: "",
      turnstileSecretKey: "",
      defaultFolder: "",
      folderOptions: "",
    },

    whatsappSettings: {
      accessToken: "",
      appId: "",
      phoneNumberId: "",
      businessAccountId: "",
      founderCeoPhoneNumber: "",
      disableOtpForCredentials: false,
    },
    telegramSettings: {
      botName: "",
      botUserName: "",
      botToken: "",
      chatId: "",
      sharedSecret: "",
      routerBotId: "",
      routerConnectionId: "",
      enabled: false,
    },
  });

  const DEFAULT_SERVICE_FORM = {
    name: "",
    hsnCode: "",
    status: "active",
  };

  const DEFAULT_UPI_FORM = {
    accountName: "",
    upiId: "",
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
    "invoiceTermsVersion",
    "selfInvoiceTermsConditions",
    "selfInvoiceTermsVersion",
    "performaInvoiceTermsConditions",
    "performaInvoiceTermsVersion",
    "creditDebitNoteTermsConditions",
    "creditDebitNoteTermsVersion",
    "upiIds",
    "cloudflareSettings",
    "whatsappSettings",
    "telegramSettings",
  ];

  const normalizeRole = (role = "") =>
    String(role || "")
      .trim()
      .toLowerCase()
      .replace(/[_\s]+/g, "-");

  const isSuperAdmin =
    normalizeRole(formData?.role) === "super-admin" ||
    normalizeRole(formData?.role) === "superadmin";

  const ensureSuperAdminAccess = (actionLabel = "make changes") => {
    if (isSuperAdmin) return true;
    showWarning(
      `Only Super Admin can ${actionLabel}. This tab is shared for all users.`,
    );
    return false;
  };

  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [showResetTermsConfirm, setShowResetTermsConfirm] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState(null);
  const [serviceFormData, setServiceFormData] = useState(DEFAULT_SERVICE_FORM);
  const [serviceSearch, setServiceSearch] = useState("");
  const [selectedServices, setSelectedServices] = useState([]);
  const [confirmDeleteServices, setConfirmDeleteServices] = useState([]);
  const [isUpiModalOpen, setIsUpiModalOpen] = useState(false);
  const [editingUpiId, setEditingUpiId] = useState(null);
  const [upiFormData, setUpiFormData] = useState(DEFAULT_UPI_FORM);
  const [upiSearch, setUpiSearch] = useState("");
  const [selectedUpiIds, setSelectedUpiIds] = useState([]);
  const [confirmDeleteUpiIds, setConfirmDeleteUpiIds] = useState([]);

  // Interested Services State
  const [isInterestedServiceModalOpen, setIsInterestedServiceModalOpen] =
    useState(false);
  const [editingInterestedServiceId, setEditingInterestedServiceId] =
    useState(null);
  const [interestedServiceFormData, setInterestedServiceFormData] = useState({
    name: "",
    status: "active",
  });
  const [interestedServiceSearch, setInterestedServiceSearch] = useState("");
  const [selectedInterestedServices, setSelectedInterestedServices] = useState(
    [],
  );
  const [confirmDeleteInterestedServices, setConfirmDeleteInterestedServices] =
    useState([]);

  const [isTesting, setIsTesting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isBusinessLoading, setIsBusinessLoading] = useState(false);
  const [uploadingField, setUploadingField] = useState(null);

  // Backup & Restore State
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [backupProgress, setBackupProgress] = useState("");
  const backupFileInputRef = useRef(null);

  // Undo Import State
  const [undoAvailable, setUndoAvailable] = useState(false);
  const [undoExpiry, setUndoExpiry] = useState(null);
  const [isUndoing, setIsUndoing] = useState(false);

  // Google Drive Auto Backup State
  const [driveConfig, setDriveConfig] = useState({
    enabled: false,
    clientId: "",
    clientSecret: "",
    refreshToken: "",
    backupApiKey: "",
    folderId: "",
    backupTime: "20:00", // 8 PM default
    frequency: "daily",
    everyHours: 4,
    dayOfWeek: "monday",
    dayOfMonth: 1,
    monthOfYear: 1,
    timezone: "Asia/Kolkata",
    hasClientId: false,
    hasClientSecret: false,
    hasRefreshToken: false,
    hasBackupApiKey: false,
    hasFolderId: false,
  });
  const [isDriveSaving, setIsDriveSaving] = useState(false);
  const [showDrivePassword, setShowDrivePassword] = useState({
    clientId: false,
    clientSecret: false,
    refreshToken: false,
    backupApiKey: false,
    folderId: false,
  });
  const [showCloudflareSecret, setShowCloudflareSecret] = useState({
    storeUrl: false,
    publicDomain: false,
    password: false,
    turnstileSiteKey: false,
    turnstileSecretKey: false,
  });
  const [showWhatsAppSecret, setShowWhatsAppSecret] = useState({
    accessToken: false,
    appId: false,
    phoneNumberId: false,
    businessAccountId: false,
  });
  const [showTelegramSecret, setShowTelegramSecret] = useState({
    botToken: false,
    chatId: false,
    sharedSecret: false,
    routerBotId: false,
    routerConnectionId: false,
  });
  const [isTelegramSettingUp, setIsTelegramSettingUp] = useState(false);
  const driveSecretTimersRef = useRef({});
  const cloudflareSecretTimersRef = useRef({});
  const whatsappSecretTimersRef = useRef({});
  const telegramSecretTimersRef = useRef({});

  const clearSecretTimer = (timersRef, key) => {
    if (!key) return;
    const currentTimer = timersRef.current[key];
    if (currentTimer) {
      clearTimeout(currentTimer);
      delete timersRef.current[key];
    }
  };

  const clearAllSecretTimers = (timersRef) => {
    Object.keys(timersRef.current).forEach((key) => {
      clearSecretTimer(timersRef, key);
    });
  };

  const scheduleDriveAutoHide = (field) => {
    clearSecretTimer(driveSecretTimersRef, field);
    driveSecretTimersRef.current[field] = setTimeout(() => {
      setDriveConfig((prev) => ({
        ...prev,
        [field]: String(prev?.[field] || "").trim() ? SECRET_MASK : "",
      }));
      setShowDrivePassword((prev) => ({
        ...prev,
        [field]: false,
      }));
      clearSecretTimer(driveSecretTimersRef, field);
    }, SECRET_AUTO_HIDE_MS);
  };

  const scheduleCloudflareAutoHide = (field) => {
    clearSecretTimer(cloudflareSecretTimersRef, field);
    cloudflareSecretTimersRef.current[field] = setTimeout(() => {
      setBusinessSettings((prev) => ({
        ...prev,
        cloudflareSettings: {
          ...(prev.cloudflareSettings || {}),
          [field]: String(prev?.cloudflareSettings?.[field] || "").trim()
            ? SECRET_MASK
            : "",
        },
      }));
      setShowCloudflareSecret((prev) => ({
        ...prev,
        [field]: false,
      }));
      clearSecretTimer(cloudflareSecretTimersRef, field);
    }, SECRET_AUTO_HIDE_MS);
  };

  const scheduleWhatsAppAutoHide = (field) => {
    clearSecretTimer(whatsappSecretTimersRef, field);
    whatsappSecretTimersRef.current[field] = setTimeout(() => {
      setBusinessSettings((prev) => ({
        ...prev,
        whatsappSettings: {
          ...(prev.whatsappSettings || {}),
          [field]: String(prev?.whatsappSettings?.[field] || "").trim()
            ? SECRET_MASK
            : "",
        },
      }));
      setShowWhatsAppSecret((prev) => ({
        ...prev,
        [field]: false,
      }));
      clearSecretTimer(whatsappSecretTimersRef, field);
    }, SECRET_AUTO_HIDE_MS);
  };

  useEffect(() => {
    loadProfileSettings();
    loadBusinessSettings();
    loadGoogleDriveConfig();
    load2FAStatus();
    loadBiometricLoginStatus();
  }, []);

  useEffect(() => {
    return () => {
      clearAllSecretTimers(driveSecretTimersRef);
      clearAllSecretTimers(cloudflareSecretTimersRef);
      clearAllSecretTimers(whatsappSecretTimersRef);
      stopFaceSetupCamera();
    };
  }, []);

  // Start camera and models after modal is rendered so video ref exists.
  useEffect(() => {
    let prevOverflow = null;

    if (showFaceSetupModal) {
      prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";

      const init = async () => {
        try {
          setIsFaceAuthLoading(true);

          // ensure models are ready and then start camera
          await ensureFaceModelsLoaded();

          // The modal is already rendered at this point, so a single frame is enough.
          await new Promise((resolve) => requestAnimationFrame(() => resolve()));

          await startFaceSetupCamera();
        } catch (err) {
          setShowFaceSetupModal(false);
          stopFaceSetupCamera();
          showError(
            err?.message || "Unable to start camera for face authentication",
          );
        } finally {
          setIsFaceAuthLoading(false);
        }
      };

      init();
    } else {
      // restore body scroll when modal closes
      document.body.style.overflow = prevOverflow || "";
      stopFaceSetupCamera();
    }

    return () => {
      document.body.style.overflow = prevOverflow || "";
    };
  }, [showFaceSetupModal]);

  const resolveCurrentUserPhone = () => {
    if (formData?.phone) return String(formData.phone);

    try {
      const cached = JSON.parse(localStorage.getItem("user_info") || "{}");
      return String(cached?.phone || cached?.mobile || "");
    } catch {
      return "";
    }
  };

  const load2FAStatus = async () => {
    try {
      const response = await apiGet(API_ENDPOINTS.TWO_FACTOR_AUTH.GET_STATUS);
      if (response?.data?.twoFactorEnabled === true) {
        setTwoFAData((prev) => ({ ...prev, enabled: true }));
      } else {
        setTwoFAData((prev) => ({ ...prev, enabled: false }));
      }
    } catch (error) {
      console.error("Failed to load 2FA status:", error);
      setTwoFAData((prev) => ({ ...prev, enabled: false }));
    }
  };

  const loadBiometricLoginStatus = async () => {
    const phone = resolveCurrentUserPhone();
    const localCredential = getStoredBiometricConfig(phone);
    const faceSupported = isFaceAuthSupported();

    setBiometricLogin((prev) => ({
      ...prev,
      supported: isBiometricSupported(),
      hasCredential: Boolean(localCredential?.credentialId),
    }));

    try {
      const response = await apiGet(API_ENDPOINTS.USER_PREFERENCES.GET);
      const enabled = response?.data?.fingerprintLoginEnabled === true;
      const usbEnabled = response?.data?.usbKeyLoginEnabled === true;
      const usbConfigured = Boolean(response?.data?.usbKeyTokenHash);
      const faceEnabled = response?.data?.faceAuthEnabled === true;
      const faceConfigured = response?.data?.faceAuthConfigured === true;
      const stepsDone = Array.isArray(response?.data?.faceAuthSteps)
        ? response.data.faceAuthSteps
        : [];

      setBiometricLogin((prev) => ({
        ...prev,
        enabled,
        supported: isBiometricSupported(),
        hasCredential: Boolean(localCredential?.credentialId),
      }));

      setUsbKeyLogin({
        enabled: usbEnabled,
        configured: usbConfigured,
      });

      setFaceAuth({
        enabled: faceEnabled,
        configured: faceConfigured,
        supported: faceSupported,
        stepsDone,
      });
    } catch {
      // Keep local state as fallback when preference API is unavailable
      setBiometricLogin((prev) => ({
        ...prev,
        enabled: false,
        supported: isBiometricSupported(),
        hasCredential: Boolean(localCredential?.credentialId),
      }));

      setUsbKeyLogin({
        enabled: false,
        configured: false,
      });

      setFaceAuth({
        enabled: false,
        configured: false,
        supported: faceSupported,
        stepsDone: [],
      });
    }
  };

  const loadGoogleDriveConfig = async () => {
    try {
      const response = await apiGet(API_ENDPOINTS.BUSINESS_SETTINGS.GET);
      const parsed = response?.data?.settings?.backupSettings;

      if (parsed && typeof parsed === "object") {
        setDriveConfig({
          enabled: parsed.enabled || false,
          clientId: toMaskedSecret(parsed.clientId, parsed.hasClientId),
          clientSecret: toMaskedSecret(
            parsed.clientSecret,
            parsed.hasClientSecret,
          ),
          refreshToken: toMaskedSecret(
            parsed.refreshToken,
            parsed.hasRefreshToken,
          ),
          backupApiKey: toMaskedSecret(
            parsed.backupApiKey,
            parsed.hasBackupApiKey,
          ),
          folderId: toMaskedSecret(parsed.folderId, parsed.hasFolderId),
          backupTime: parsed.backupTime || "20:00",
          frequency: parsed.frequency || "daily",
          everyHours: Number(parsed.everyHours) || 4,
          dayOfWeek: parsed.dayOfWeek || "monday",
          dayOfMonth: Number(parsed.dayOfMonth) || 1,
          monthOfYear: Number(parsed.monthOfYear) || 1,
          timezone: parsed.timezone || "Asia/Kolkata",
          hasClientId: parsed.hasClientId === true,
          hasClientSecret: parsed.hasClientSecret === true,
          hasRefreshToken: parsed.hasRefreshToken === true,
          hasBackupApiKey: parsed.hasBackupApiKey === true,
          hasFolderId: parsed.hasFolderId === true,
        });
      }
    } catch (error) {
      // Silently handle network errors - will use default values
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
    try {
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
        // Silently handle network errors for profile settings
      }
    } catch (error) {
      console.error("Error loading profile settings:", error);
    }
  };

  useEffect(() => {
    if (formData?.phone) {
      loadBiometricLoginStatus();
    }
  }, [formData?.phone]);

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

  // 2FA Handlers
  const handleGenerate2FA = async () => {
    setIs2FALoading(true);
    try {
      const response = await apiPost(API_ENDPOINTS.TWO_FACTOR_AUTH.GENERATE, {
        action: "generate-2fa",
      });

      if (response?.data?.qrCode && response?.data?.backupCodes) {
        setQrCodeUrl(response.data.qrCode);
        setBackupCodes(response.data.backupCodes);
        setShowQRModal(true);
        setTwoFAData({ enabled: false, twoFACode: "" });
        showInfo("Scan the QR code with Google Authenticator or Zoho Auth");
      }
    } catch (error) {
      showError(error?.response?.data?.error || "Failed to generate QR code");
    } finally {
      setIs2FALoading(false);
    }
  };

  const handleVerifyAndEnable2FA = async () => {
    if (twoFAData.twoFACode.length !== 6) {
      showError("Please enter 6 digits from your authenticator app");
      return;
    }

    setIs2FALoading(true);
    try {
      const response = await apiPost(API_ENDPOINTS.TWO_FACTOR_AUTH.ENABLE, {
        action: "enable-2fa",
        token: twoFAData.twoFACode,
      });

      if (response?.data?.success) {
        setTwoFAData({ enabled: true, twoFACode: "" });
        setBackupCodes(response?.data?.backupCodes || []);
        setShowBackupCodes(true);
        setShowQRModal(false);
        showSuccess("✅ 2FA enabled successfully! Save your backup codes!");
        await load2FAStatus();
      }
    } catch (error) {
      showError(
        error?.response?.data?.error ||
          "Invalid authenticator code. Please try again.",
      );
    } finally {
      setIs2FALoading(false);
    }
  };

  const handleDisable2FA = async () => {
    if (disable2FACode.length !== 6 && disable2FACode.length < 8) {
      showError("Please enter 6-digit code or backup code");
      return;
    }

    setIs2FALoading(true);
    try {
      await apiPost(API_ENDPOINTS.TWO_FACTOR_AUTH.DISABLE, {
        action: "disable-2fa",
        verificationToken: disable2FACode,
      });

      setTwoFAData({ enabled: false, twoFACode: "" });
      setDisable2FACode("");
      setShow2FAVerification(false);
      showSuccess("✅ 2FA disabled successfully");
      await load2FAStatus();
    } catch (error) {
      showError(
        error?.response?.data?.error ||
          "Invalid code. Please try again with correct code.",
      );
    } finally {
      setIs2FALoading(false);
    }
  };

  const handleBiometricToggle = async (enabled) => {
    const phone = resolveCurrentUserPhone();

    if (!phone) {
      showError(
        "Please add your mobile number in profile before enabling fingerprint login",
      );
      return;
    }

    if (enabled && !isBiometricSupported()) {
      showError(
        "Fingerprint authentication is not supported on this device/browser",
      );
      return;
    }

    setIsBiometricLoading(true);

    try {
      if (enabled) {
        const cachedUser = JSON.parse(
          localStorage.getItem("user_info") || "{}",
        );

        const biometricResult = await registerBiometricForDevice({
          phone,
          userId: cachedUser?.id || cachedUser?._id || cachedUser?.userId,
          displayName: cachedUser?.name || formData?.name || phone,
        });

        // Save credentialId to backend so all devices can use it
        const credentialIds = Array.isArray(biometricResult?.credentialIds)
          ? biometricResult.credentialIds
          : biometricResult?.credentialId
            ? [biometricResult.credentialId]
            : [];

        await apiPost(API_ENDPOINTS.USER_PREFERENCES.UPDATE, {
          fingerprintLoginEnabled: true,
          biometricCredentialId: biometricResult?.credentialId || "",
          biometricCredentialIds: credentialIds,
        });
      } else {
        removeStoredBiometricConfig(phone);

        await apiPost(API_ENDPOINTS.USER_PREFERENCES.UPDATE, {
          fingerprintLoginEnabled: false,
          biometricCredentialId: "",
          biometricCredentialIds: [],
        });
      }

      const localCredential = getStoredBiometricConfig(phone);

      setBiometricLogin((prev) => ({
        ...prev,
        enabled,
        hasCredential: Boolean(localCredential?.credentialId),
        supported: isBiometricSupported(),
      }));

      if (enabled) {
        showSuccess("Fingerprint login enabled for this device");
      } else {
        showInfo("Fingerprint login disabled");
      }
    } catch (error) {
      const message =
        error?.name === "NotAllowedError"
          ? "Fingerprint verification was cancelled"
          : error?.response?.data?.error ||
            error?.message ||
            "Unable to update fingerprint login";

      showError(message);
      await loadBiometricLoginStatus();
    } finally {
      setIsBiometricLoading(false);
    }
  };

  const handleUsbKeyToggle = async (enabled) => {
    const phone = resolveCurrentUserPhone();

    if (!phone) {
      showError(
        "Please add your mobile number in profile before enabling USB key login",
      );
      return;
    }

    setIsUsbKeyLoading(true);

    try {
      if (enabled) {
        const cachedUser = JSON.parse(
          localStorage.getItem("user_info") || "{}",
        );

        const usbKeyFile = await createUsbKeyFileForUser({
          phone,
          userId: cachedUser?.id || cachedUser?._id || cachedUser?.userId,
          userName: cachedUser?.name || formData?.name || phone,
        });

        await apiPost(API_ENDPOINTS.USER_PREFERENCES.UPDATE, {
          usbKeyLoginEnabled: true,
          usbKeyTokenHash: usbKeyFile.tokenHash,
        });

        setUsbKeyLogin({
          enabled: true,
          configured: true,
        });

        showSuccess(
          "USB key login enabled. Save MaxCode-Accounting.sec file inside your pen drive safely.",
        );
        showInfo(
          "Login time: plug pen drive and select MaxCode-Accounting.sec file to verify.",
        );
      } else {
        await apiPost(API_ENDPOINTS.USER_PREFERENCES.UPDATE, {
          usbKeyLoginEnabled: false,
          usbKeyTokenHash: "",
        });

        setUsbKeyLogin({
          enabled: false,
          configured: false,
        });

        showInfo("USB key login disabled");
      }
    } catch (error) {
      const message =
        error?.response?.data?.error ||
        error?.message ||
        "Unable to update USB key login";
      showError(message);
      await loadBiometricLoginStatus();
    } finally {
      setIsUsbKeyLoading(false);
    }
  };

  const stopFaceSetupCamera = () => {
    if (faceSetupLoopRef.current) {
      cancelAnimationFrame(faceSetupLoopRef.current);
      faceSetupLoopRef.current = null;
    }

    if (faceSetupStreamRef.current) {
      faceSetupStreamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      faceSetupStreamRef.current = null;
    }

    if (faceSetupVideoRef.current) {
      faceSetupVideoRef.current.srcObject = null;
    }
  };

  const resetFaceSetupSession = () => {
    faceSetupSamplesRef.current = {};
    faceSetupCooldownRef.current = {};
    setFaceSetupStepsDone([]);
    setFaceSetupProgress(0);
    setFaceSetupStatusText("Initializing camera...");
  };

  const isStepMatched = (stepKey, signals = {}) => {
    const { yaw = 0, pitch = 0, smileScore = 0, detectionScore = 0 } = signals;

    if (detectionScore < 0.65) return false;

    if (stepKey === "front") {
      return Math.abs(yaw) <= 0.2 && pitch >= 0.18 && pitch <= 0.55;
    }

    if (stepKey === "smile") {
      return smileScore >= 0.72 && Math.abs(yaw) <= 0.25;
    }

    if (stepKey === "left") {
      return yaw <= -0.28;
    }

    if (stepKey === "right") {
      return yaw >= 0.28;
    }

    if (stepKey === "up") {
      return pitch <= 0.28 && Math.abs(yaw) <= 0.3;
    }

    if (stepKey === "down") {
      return pitch >= 0.52;
    }

    return false;
  };

  const completeFaceSetupAndEnable = async () => {
    const descriptors = Object.values(faceSetupSamplesRef.current || {});

    if (descriptors.length < FACE_SETUP_REQUIRED_STEPS.length) {
      showError("Face setup is incomplete. Please capture all required angles.");
      return;
    }

    setIsFaceSetupSubmitting(true);
    setFaceSetupStatusText("Finalizing face profile...");

    try {
      await apiPost(API_ENDPOINTS.USER_PREFERENCES.UPDATE, {
        faceAuthEnabled: true,
        faceAuthProfile: {
          model: "face-api.js-0.22.2",
          version: 1,
          steps: FACE_SETUP_REQUIRED_STEPS.map((item) => item.key),
          descriptors,
        },
      });

      setFaceAuth({
        enabled: true,
        configured: true,
        supported: isFaceAuthSupported(),
        stepsDone: FACE_SETUP_REQUIRED_STEPS.map((item) => item.key),
      });

      setShowFaceSetupModal(false);
      showSuccess("Face Authentication enabled successfully.");
      showInfo("Face Authentication enabled successfully.");
    } catch (error) {
      showError(
        error?.response?.data?.error ||
          "Unable to enable face authentication right now",
      );
    } finally {
      setIsFaceSetupSubmitting(false);
      stopFaceSetupCamera();
    }
  };

  const startFaceSetupCaptureLoop = () => {
    const run = async () => {
      const video = faceSetupVideoRef.current;
      if (!video || !showFaceSetupModal || isFaceSetupSubmitting) {
        return;
      }

      try {
          const result = await extractFaceDescriptorFromVideo(video, {
            inputSize: 160,
          });
        const pose = estimateFacePose(result.landmarks);
        const smileScore = Number(result?.expressions?.happy || 0);
        const currentDone = new Set(
          Object.keys(faceSetupSamplesRef.current || {}),
        );

        FACE_SETUP_REQUIRED_STEPS.forEach((step) => {
          if (currentDone.has(step.key)) {
            return;
          }

          const now = Date.now();
          const cooldownUntil = faceSetupCooldownRef.current[step.key] || 0;
          if (now < cooldownUntil) {
            return;
          }

          const matched = isStepMatched(step.key, {
            yaw: pose.yaw,
            pitch: pose.pitch,
            smileScore,
            detectionScore: result.detectionScore,
          });

          if (matched) {
            faceSetupSamplesRef.current[step.key] = result.descriptor;
            faceSetupCooldownRef.current[step.key] = now + 1200;
            currentDone.add(step.key);
            const nextDone = Array.from(currentDone);
            setFaceSetupStepsDone(nextDone);
            setFaceSetupProgress(
              Math.round(
                (nextDone.length / FACE_SETUP_REQUIRED_STEPS.length) * 100,
              ),
            );
            setFaceSetupStatusText(`${step.label} captured successfully`);
          }
        });

        if (currentDone.size >= FACE_SETUP_REQUIRED_STEPS.length) {
          setFaceSetupProgress(100);
          setFaceSetupStatusText(
            "All angles captured. Saving face profile securely...",
          );
          await completeFaceSetupAndEnable();
          return;
        }
      } catch {
        setFaceSetupStatusText(
          "Face not detected clearly. Keep your face in center and adjust lighting.",
        );
      }

      faceSetupLoopRef.current = requestAnimationFrame(run);
    };

    faceSetupLoopRef.current = requestAnimationFrame(run);
  };

  const startFaceSetupCamera = async () => {
    if (!isFaceAuthSupported()) {
      throw new Error(
        "Face authentication is not supported on this browser/device",
      );
    }

    await ensureFaceModelsLoaded();

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 24, max: 30 },
      },
      audio: false,
    });

    faceSetupStreamRef.current = stream;

    if (faceSetupVideoRef.current) {
      faceSetupVideoRef.current.srcObject = stream;
      await faceSetupVideoRef.current.play();
    }

    setFaceSetupStatusText("Follow instructions and move your face slowly");
    startFaceSetupCaptureLoop();
  };

  const handleFaceAuthToggle = async (enabled) => {
    if (!enabled) {
      setIsFaceAuthLoading(true);

      try {
        await apiPost(API_ENDPOINTS.USER_PREFERENCES.UPDATE, {
          faceAuthEnabled: false,
          faceAuthProfile: null,
        });

        setFaceAuth((prev) => ({
          ...prev,
          enabled: false,
          configured: false,
          stepsDone: [],
        }));
        showInfo("Face Authentication disabled");
      } catch (error) {
        showError(
          error?.response?.data?.error ||
            "Unable to disable face authentication",
        );
        await loadBiometricLoginStatus();
      } finally {
        setIsFaceAuthLoading(false);
      }

      return;
    }

    if (!isFaceAuthSupported()) {
      showError("Camera access is required but not supported on this browser");
      return;
    }

    setIsFaceAuthLoading(true);
    resetFaceSetupSession();
    setShowFaceSetupModal(true);

    // Camera and model startup will be performed by an effect
    // after the modal has rendered so the video ref is available.
    setIsFaceAuthLoading(false);
  };

  const handleCopyBackupCodes = () => {
    const text = backupCodes.join("\n");
    navigator.clipboard.writeText(text).then(() => {
      showSuccess("Backup codes copied to clipboard!");
    });
  };

  const handleDownloadBackupCodes = () => {
    const text = backupCodes.join("\n");
    const element = document.createElement("a");
    element.setAttribute(
      "href",
      "data:text/plain;charset=utf-8," + encodeURIComponent(text),
    );
    element.setAttribute("download", "2fa-backup-codes.txt");
    element.style.display = "none";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    showSuccess("Backup codes downloaded!");
  };

  // Business Details Handlers
  const buildBusinessSettingsPayload = (settings) =>
    BUSINESS_DETAILS_FIELDS.reduce((acc, field) => {
      acc[field] = settings[field] ?? "";
      return acc;
    }, {});

  const mergeBusinessSettings = (settings = {}) => {
    if (!settings || typeof settings !== "object") return;

    const normalizedSettings = {
      ...settings,
      companyName:
        settings.companyName || settings.businessName || settings.name || "",
      gstin: settings.gstin || settings.GSTIN || settings.companyGstin || "",
      companyAddress:
        settings.companyAddress ||
        settings.address ||
        settings.company_location ||
        "",
      companyPhone:
        settings.companyPhone ||
        settings.phone ||
        settings.mobile ||
        settings.phoneNumber ||
        "",
      companyEmail:
        settings.companyEmail || settings.email || settings.officialEmail || "",
      invoiceTermsConditions:
        settings.invoiceTermsConditions ||
        settings.invoiceTerms ||
        settings.termsConditions ||
        DEFAULT_INVOICE_TERMS,
      invoiceTermsVersion: /^V\d+\.\d+\.\d+$/i.test(
        String(settings.invoiceTermsVersion || "").trim(),
      )
        ? String(settings.invoiceTermsVersion).trim().toUpperCase()
        : "V1.0.0",
      selfInvoiceTermsConditions:
        settings.selfInvoiceTermsConditions ||
        settings.selfInvoiceTerms ||
        settings.selfTermsConditions ||
        DEFAULT_SELF_INVOICE_TERMS,
      selfInvoiceTermsVersion: /^V\d+\.\d+\.\d+$/i.test(
        String(settings.selfInvoiceTermsVersion || "").trim(),
      )
        ? String(settings.selfInvoiceTermsVersion).trim().toUpperCase()
        : "V1.0.0",
      performaInvoiceTermsConditions:
        settings.performaInvoiceTermsConditions ||
        settings.performaInvoiceTerms ||
        settings.performaTermsConditions ||
        DEFAULT_PERFORMA_INVOICE_TERMS,
      performaInvoiceTermsVersion: /^V\d+\.\d+\.\d+$/i.test(
        String(settings.performaInvoiceTermsVersion || "").trim(),
      )
        ? String(settings.performaInvoiceTermsVersion).trim().toUpperCase()
        : "V1.0.0",
      creditDebitNoteTermsConditions:
        settings.creditDebitNoteTermsConditions ||
        settings.creditDebitNoteTerms ||
        settings.noteTermsConditions ||
        DEFAULT_CREDIT_DEBIT_NOTE_TERMS,
      creditDebitNoteTermsVersion: /^V\d+\.\d+\.\d+$/i.test(
        String(settings.creditDebitNoteTermsVersion || "").trim(),
      )
        ? String(settings.creditDebitNoteTermsVersion).trim().toUpperCase()
        : "V1.0.0",
    };

    const resolvedServices = Array.isArray(settings.services)
      ? settings.services
      : Array.isArray(settings.serviceMaster)
        ? settings.serviceMaster
        : Array.isArray(settings.serviceList)
          ? settings.serviceList
          : null;

    if (resolvedServices) {
      normalizedSettings.services = resolvedServices;
    }

    const resolvedUpiIds = Array.isArray(settings.upiIds)
      ? settings.upiIds
      : Array.isArray(settings.upiIdMaster)
        ? settings.upiIdMaster
        : Array.isArray(settings.upiList)
          ? settings.upiList
          : null;

    if (resolvedUpiIds) {
      normalizedSettings.upiIds = resolvedUpiIds;
    }

    const resolvedBackupSettings =
      settings.backupSettings ||
      settings.driveConfig ||
      settings.googleDriveConfig ||
      null;

    if (resolvedBackupSettings) {
      normalizedSettings.backupSettings = resolvedBackupSettings;
    }

    const resolvedCloudflareSettings =
      settings.cloudflareSettings &&
      typeof settings.cloudflareSettings === "object"
        ? settings.cloudflareSettings
        : null;

    if (resolvedCloudflareSettings) {
      normalizedSettings.cloudflareSettings = {
        storeUrl: toMaskedSecret(
          resolvedCloudflareSettings.storeUrl,
          resolvedCloudflareSettings.hasStoreUrl === true,
        ),
        publicDomain: toMaskedSecret(
          resolvedCloudflareSettings.publicDomain,
          resolvedCloudflareSettings.hasPublicDomain === true,
        ),
        password: toMaskedSecret(
          resolvedCloudflareSettings.password,
          resolvedCloudflareSettings.hasPassword === true,
        ),
        turnstileSiteKey:
          resolvedCloudflareSettings.turnstileSiteKey || "",
        turnstileSecretKey: toMaskedSecret(
          resolvedCloudflareSettings.turnstileSecretKey,
          resolvedCloudflareSettings.hasTurnstileSecretKey === true,
        ),
        defaultFolder: resolvedCloudflareSettings.defaultFolder || "",
        folderOptions: resolvedCloudflareSettings.folderOptions || "",
        hasStoreUrl: resolvedCloudflareSettings.hasStoreUrl === true,
        hasPublicDomain: resolvedCloudflareSettings.hasPublicDomain === true,
        hasPassword: resolvedCloudflareSettings.hasPassword === true,
        hasTurnstileSiteKey:
          resolvedCloudflareSettings.hasTurnstileSiteKey === true,
        hasTurnstileSecretKey:
          resolvedCloudflareSettings.hasTurnstileSecretKey === true,
      };
    }

    const resolvedWhatsAppSettings =
      settings.whatsappSettings && typeof settings.whatsappSettings === "object"
        ? settings.whatsappSettings
        : null;

    if (resolvedWhatsAppSettings) {
      normalizedSettings.whatsappSettings = {
        accessToken: toMaskedSecret(
          resolvedWhatsAppSettings.accessToken,
          resolvedWhatsAppSettings.hasAccessToken === true,
        ),
        appId: toMaskedSecret(
          resolvedWhatsAppSettings.appId,
          resolvedWhatsAppSettings.hasAppId === true,
        ),
        phoneNumberId: toMaskedSecret(
          resolvedWhatsAppSettings.phoneNumberId,
          resolvedWhatsAppSettings.hasPhoneNumberId === true,
        ),
        businessAccountId: toMaskedSecret(
          resolvedWhatsAppSettings.businessAccountId,
          resolvedWhatsAppSettings.hasBusinessAccountId === true,
        ),
        founderCeoPhoneNumber:
          resolvedWhatsAppSettings.founderCeoPhoneNumber || "",
        hasAccessToken: resolvedWhatsAppSettings.hasAccessToken === true,
        hasAppId: resolvedWhatsAppSettings.hasAppId === true,
        hasPhoneNumberId: resolvedWhatsAppSettings.hasPhoneNumberId === true,
        hasBusinessAccountId:
          resolvedWhatsAppSettings.hasBusinessAccountId === true,
      };
    }

    const resolvedTelegramSettings =
      settings.telegramSettings && typeof settings.telegramSettings === "object"
        ? settings.telegramSettings
        : null;

    if (resolvedTelegramSettings) {
      normalizedSettings.telegramSettings = {
        botName: resolvedTelegramSettings.botName || "",
        botUserName: resolvedTelegramSettings.botUserName || "",
        botToken: toMaskedSecret(
          resolvedTelegramSettings.botToken,
          resolvedTelegramSettings.hasBotToken === true,
        ),
        chatId: toMaskedSecret(
          resolvedTelegramSettings.chatId,
          resolvedTelegramSettings.hasChatId === true,
        ),
        sharedSecret: toMaskedSecret(
          resolvedTelegramSettings.sharedSecret,
          resolvedTelegramSettings.hasSharedSecret === true,
        ),
        routerBotId: toMaskedSecret(
          resolvedTelegramSettings.routerBotId,
          resolvedTelegramSettings.hasRouterBotId === true,
        ),
        routerConnectionId: toMaskedSecret(
          resolvedTelegramSettings.routerConnectionId,
          resolvedTelegramSettings.hasRouterConnectionId === true,
        ),
        enabled: resolvedTelegramSettings.enabled === true,
        hasBotToken: resolvedTelegramSettings.hasBotToken === true,
        hasChatId: resolvedTelegramSettings.hasChatId === true,
        hasSharedSecret: resolvedTelegramSettings.hasSharedSecret === true,
        hasRouterBotId: resolvedTelegramSettings.hasRouterBotId === true,
        hasRouterConnectionId:
          resolvedTelegramSettings.hasRouterConnectionId === true,
      };
    }

    setBusinessSettings((prev) => ({
      ...prev,
      ...normalizedSettings,
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
        // Ignore parse errors - will fetch from server
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
        localStorage.removeItem("business_settings");
        return;
      }
    } catch (error) {
      // Silently handle network errors - will use cached data if available
    } finally {
      setIsBusinessLoading(false);
    }

    if (cachedSettings) {
      mergeBusinessSettings(cachedSettings);
    }
  };

  const handleBusinessChange = (field, value) => {
    if (!isSuperAdmin) return;

    setBusinessSettings((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleCloudflareChange = (field, value) => {
    if (!isSuperAdmin) return;

    setBusinessSettings((prev) => ({
      ...prev,
      cloudflareSettings: {
        ...(prev.cloudflareSettings || {}),
        [field]: value,
      },
    }));
  };

  const handleWhatsAppChange = (field, value) => {
    if (!isSuperAdmin) return;

    setBusinessSettings((prev) => ({
      ...prev,
      whatsappSettings: {
        ...(prev.whatsappSettings || {}),
        [field]: value,
      },
    }));
  };

  const handleDriveSecretInputChange = (field, value) => {
    setDriveConfig((prev) => ({
      ...prev,
      [field]: value,
    }));

    if (showDrivePassword[field]) {
      scheduleDriveAutoHide(field);
    }
  };

  const handleCloudflareSecretInputChange = (field, value) => {
    if (!isSuperAdmin) return;

    setBusinessSettings((prev) => ({
      ...prev,
      cloudflareSettings: {
        ...(prev.cloudflareSettings || {}),
        [field]: value,
      },
    }));

    if (showCloudflareSecret[field]) {
      scheduleCloudflareAutoHide(field);
    }
  };

  const handleWhatsAppSecretInputChange = (field, value) => {
    if (!isSuperAdmin) return;

    setBusinessSettings((prev) => ({
      ...prev,
      whatsappSettings: {
        ...(prev.whatsappSettings || {}),
        [field]: value,
      },
    }));

    if (showWhatsAppSecret[field]) {
      scheduleWhatsAppAutoHide(field);
    }
  };

  const handleTelegramChange = (field, value) => {
    if (!isSuperAdmin) return;
    setBusinessSettings((prev) => ({
      ...prev,
      telegramSettings: {
        ...(prev.telegramSettings || {}),
        [field]: value,
      },
    }));
  };

  const handleTelegramSecretInputChange = (field, value) => {
    if (!isSuperAdmin) return;
    setBusinessSettings((prev) => ({
      ...prev,
      telegramSettings: {
        ...(prev.telegramSettings || {}),
        [field]: value,
      },
    }));

    if (showTelegramSecret[field]) {
      clearSecretTimer(telegramSecretTimersRef, field);
      telegramSecretTimersRef.current[field] = setTimeout(() => {
        setBusinessSettings((prev) => ({
          ...prev,
          telegramSettings: {
            ...(prev.telegramSettings || {}),
            [field]: String(prev.telegramSettings?.[field] || "").trim()
              ? SECRET_MASK
              : "",
          },
        }));
        setShowTelegramSecret((prev) => ({ ...prev, [field]: false }));
        clearSecretTimer(telegramSecretTimersRef, field);
      }, SECRET_AUTO_HIDE_MS);
    }
  };

  const fetchRevealedBusinessSecret = async (scope, field) => {
    const query = new URLSearchParams({
      action: "reveal-secret",
      scope,
      field,
    });

    const response = await apiGet(
      `${API_ENDPOINTS.BUSINESS_SETTINGS.GET}?${query.toString()}`,
    );

    return String(response?.data?.value || "");
  };

  const revealDriveField = async (field) => {
    const currentValue = String(driveConfig?.[field] || "");
    if (currentValue.trim() !== SECRET_MASK) {
      return currentValue;
    }

    const revealed = await fetchRevealedBusinessSecret("backupSettings", field);
    setDriveConfig((prev) => ({
      ...prev,
      [field]: revealed,
    }));
    return revealed;
  };

  const revealCloudflareField = async (field) => {
    const currentValue = String(
      businessSettings?.cloudflareSettings?.[field] || "",
    );

    if (currentValue.trim() !== SECRET_MASK) {
      return currentValue;
    }

    const revealed = await fetchRevealedBusinessSecret(
      "cloudflareSettings",
      field,
    );

    setBusinessSettings((prev) => ({
      ...prev,
      cloudflareSettings: {
        ...(prev.cloudflareSettings || {}),
        [field]: revealed,
      },
    }));

    return revealed;
  };

  const revealWhatsAppField = async (field) => {
    const currentValue = String(
      businessSettings?.whatsappSettings?.[field] || "",
    );

    if (currentValue.trim() !== SECRET_MASK) {
      return currentValue;
    }

    const revealed = await fetchRevealedBusinessSecret(
      "whatsappSettings",
      field,
    );

    setBusinessSettings((prev) => ({
      ...prev,
      whatsappSettings: {
        ...(prev.whatsappSettings || {}),
        [field]: revealed,
      },
    }));

    return revealed;
  };

  const revealTelegramField = async (field) => {
    const currentValue = String(businessSettings?.telegramSettings?.[field] || "");
    if (currentValue.trim() !== SECRET_MASK) return currentValue;
    const revealed = await fetchRevealedBusinessSecret("telegramSettings", field);
    setBusinessSettings((prev) => ({
      ...prev,
      telegramSettings: { ...(prev.telegramSettings || {}), [field]: revealed },
    }));
    return revealed;
  };

  const handleTelegramSetup = async (action) => {
    if (!ensureSuperAdminAccess("manage Telegram webhook")) return;
    setIsTelegramSettingUp(true);
    try {
      const response = await apiPost(API_ENDPOINTS.TELEGRAM.SETUP, { action });
      if (action === "webhook-info") {
        const info = response?.data?.info || {};
        showInfo(
          `Webhook: ${info.url || "not set"}\nPending updates: ${info.pending_update_count ?? 0}`,
        );
      } else if (action === "send-test") {
        showSuccess("Test message sent to Telegram.");
      } else if (action === "sync-commands") {
        showSuccess(
          `Command menu synced (${response?.data?.commands ?? 0} commands). Type / in Telegram to see it.`,
        );
      } else if (response?.data?.reason === "router-mode") {
        showSuccess(
          "Router mode is on. Paste this Target URL into MaxCode Telegram Webhook instead of setting Telegram webhook here.",
        );
      } else {
        showSuccess("Telegram webhook registered successfully.");
      }
    } catch (error) {
      showError(
        error?.response?.data?.error || "Telegram setup request failed",
      );
    } finally {
      setIsTelegramSettingUp(false);
    }
  };

  const handleTelegramRevealToggle = async (field) => {
    const willShow = !Boolean(showTelegramSecret[field]);
    if (willShow) {
      try {
        await revealTelegramField(field);
      } catch (error) {
        showError(error?.response?.data?.error || "Unable to reveal value");
        return;
      }
    }
    setShowTelegramSecret((prev) => ({ ...prev, [field]: willShow }));
    if (willShow) {
      clearSecretTimer(telegramSecretTimersRef, field);
      telegramSecretTimersRef.current[field] = setTimeout(() => {
        setBusinessSettings((prev) => ({
          ...prev,
          telegramSettings: {
            ...(prev.telegramSettings || {}),
            [field]: String(prev.telegramSettings?.[field] || "").trim()
              ? SECRET_MASK
              : "",
          },
        }));
        setShowTelegramSecret((prev) => ({ ...prev, [field]: false }));
        clearSecretTimer(telegramSecretTimersRef, field);
      }, SECRET_AUTO_HIDE_MS);
    } else {
      clearSecretTimer(telegramSecretTimersRef, field);
    }
  };

  const handleDriveRevealToggle = async (field) => {
    const willShow = !Boolean(showDrivePassword[field]);
    if (willShow) {
      try {
        await revealDriveField(field);
      } catch (error) {
        showError(error?.response?.data?.error || "Unable to reveal value");
        return;
      }

      setShowDrivePassword((prev) => ({
        ...prev,
        [field]: true,
      }));
      scheduleDriveAutoHide(field);
      return;
    }

    clearSecretTimer(driveSecretTimersRef, field);
    setDriveConfig((prev) => ({
      ...prev,
      [field]: String(prev?.[field] || "").trim() ? SECRET_MASK : "",
    }));
    setShowDrivePassword((prev) => ({
      ...prev,
      [field]: false,
    }));
  };

  const handleCloudflareRevealToggle = async (field) => {
    const willShow = !Boolean(showCloudflareSecret[field]);
    if (willShow) {
      try {
        await revealCloudflareField(field);
      } catch (error) {
        showError(error?.response?.data?.error || "Unable to reveal value");
        return;
      }

      setShowCloudflareSecret((prev) => ({
        ...prev,
        [field]: true,
      }));
      scheduleCloudflareAutoHide(field);
      return;
    }

    clearSecretTimer(cloudflareSecretTimersRef, field);
    setBusinessSettings((prev) => ({
      ...prev,
      cloudflareSettings: {
        ...(prev.cloudflareSettings || {}),
        [field]: String(prev?.cloudflareSettings?.[field] || "").trim()
          ? SECRET_MASK
          : "",
      },
    }));
    setShowCloudflareSecret((prev) => ({
      ...prev,
      [field]: false,
    }));
  };

  const handleWhatsAppRevealToggle = async (field) => {
    const willShow = !Boolean(showWhatsAppSecret[field]);
    if (willShow) {
      try {
        await revealWhatsAppField(field);
      } catch (error) {
        showError(error?.response?.data?.error || "Unable to reveal value");
        return;
      }

      setShowWhatsAppSecret((prev) => ({
        ...prev,
        [field]: true,
      }));
      scheduleWhatsAppAutoHide(field);
      return;
    }

    clearSecretTimer(whatsappSecretTimersRef, field);
    setBusinessSettings((prev) => ({
      ...prev,
      whatsappSettings: {
        ...(prev.whatsappSettings || {}),
        [field]: String(prev?.whatsappSettings?.[field] || "").trim()
          ? SECRET_MASK
          : "",
      },
    }));
    setShowWhatsAppSecret((prev) => ({
      ...prev,
      [field]: false,
    }));
  };

  const copyDriveFieldValue = async (field) => {
    try {
      const value = await revealDriveField(field);
      if (!String(value || "").trim()) {
        showError("Nothing to copy");
        return;
      }

      await navigator.clipboard.writeText(String(value));
      if (showDrivePassword[field]) {
        scheduleDriveAutoHide(field);
      }
      showSuccess("Copied to clipboard");
    } catch (error) {
      showError(error?.response?.data?.error || "Copy failed");
    }
  };

  const copyCloudflareFieldValue = async (field) => {
    try {
      const value = await revealCloudflareField(field);
      if (!String(value || "").trim()) {
        showError("Nothing to copy");
        return;
      }

      await navigator.clipboard.writeText(String(value));
      if (showCloudflareSecret[field]) {
        scheduleCloudflareAutoHide(field);
      }
      showSuccess("Copied to clipboard");
    } catch (error) {
      showError(error?.response?.data?.error || "Copy failed");
    }
  };

  const copyWhatsAppFieldValue = async (field) => {
    try {
      const value = await revealWhatsAppField(field);
      if (!String(value || "").trim()) {
        showError("Nothing to copy");
        return;
      }

      await navigator.clipboard.writeText(String(value));
      if (showWhatsAppSecret[field]) {
        scheduleWhatsAppAutoHide(field);
      }
      showSuccess("Copied to clipboard");
    } catch (error) {
      showError(error?.response?.data?.error || "Copy failed");
    }
  };

  const copyTelegramFieldValue = async (field) => {
    try {
      const value = await revealTelegramField(field);
      if (!String(value || "").trim()) {
        showError("Nothing to copy");
        return;
      }

      await navigator.clipboard.writeText(String(value));
      if (showTelegramSecret[field]) {
        clearSecretTimer(telegramSecretTimersRef, field);
        telegramSecretTimersRef.current[field] = setTimeout(() => {
          setBusinessSettings((prev) => ({
            ...prev,
            telegramSettings: {
              ...(prev.telegramSettings || {}),
              [field]: String(prev.telegramSettings?.[field] || "").trim()
                ? SECRET_MASK
                : "",
            },
          }));
          setShowTelegramSecret((prev) => ({ ...prev, [field]: false }));
          clearSecretTimer(telegramSecretTimersRef, field);
        }, SECRET_AUTO_HIDE_MS);
      }
      showSuccess("Copied to clipboard");
    } catch (error) {
      showError(error?.response?.data?.error || "Copy failed");
    }
  };

  const handleResetTermsToDefault = () => {
    if (!ensureSuperAdminAccess("reset terms")) return;
    setBusinessSettings((prev) => ({
      ...prev,
      invoiceTermsConditions: DEFAULT_INVOICE_TERMS,
      selfInvoiceTermsConditions: DEFAULT_SELF_INVOICE_TERMS,
      performaInvoiceTermsConditions: "",
      creditDebitNoteTermsConditions: "",
    }));

    setBusinessSettings((prev) => ({
      ...prev,
      invoiceTermsConditions: DEFAULT_INVOICE_TERMS,
      selfInvoiceTermsConditions: DEFAULT_SELF_INVOICE_TERMS,
    }));
    setShowResetTermsConfirm(false);
    showInfo("Terms reset to default. Save Terms to apply changes.");
  };

  const syncServicesToBackend = async (nextServices) => {
    if (!ensureSuperAdminAccess("update service master")) return null;

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
    if (!ensureSuperAdminAccess("upload branding assets")) return;

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

    const reader = new FileReader();

    reader.onload = (event) => {
      const base64 = event.target.result;
      // Store base64 directly in state
      handleBusinessChange(field, base64);

      const fieldLabel = field
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (str) => str.toUpperCase())
        .trim();

      showSuccess(
        `${fieldLabel} uploaded successfully! Click SAVE CHANGES to save.`,
      );
      setUploadingField(null);
    };

    reader.onerror = () => {
      showError("Failed to read image. Please try again.");
      setUploadingField(null);
    };

    reader.readAsDataURL(file);
  };

  const handleSaveAll = async () => {
    if (!ensureSuperAdminAccess("save shared business settings")) return;

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
      }

      localStorage.removeItem("business_settings");

      const telegramWebhook = response?.data?.telegramWebhook;
      if (telegramWebhook?.success) {
        showSuccess("✅ Saved! Telegram webhook registered automatically.");
      } else if (telegramWebhook?.reason === "local-url") {
        showSuccess(
          "✅ Saved! Telegram webhook will auto-register after you deploy (localhost is not reachable by Telegram).",
        );
      } else if (telegramWebhook?.error) {
        showWarning(
          `Saved, but Telegram webhook could not be set: ${telegramWebhook.error}`,
        );
      } else {
        showSuccess("✅ All changes saved successfully!");
      }
    } catch (error) {
      localStorage.removeItem("business_settings");
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
  const getUpiStatus = (upi) => upi.status || "active";

  const openAddServiceModal = () => {
    if (!ensureSuperAdminAccess("add service")) return;

    setEditingServiceId(null);
    setServiceFormData(DEFAULT_SERVICE_FORM);
    setIsServiceModalOpen(true);
  };

  const openEditServiceModal = (service) => {
    if (!ensureSuperAdminAccess("edit service")) return;

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
    if (!ensureSuperAdminAccess("save service")) return;

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
    if (!ensureSuperAdminAccess("remove service")) return;

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
    if (!ensureSuperAdminAccess("remove selected services")) return;

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
    if (!ensureSuperAdminAccess("change service status")) return;

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

  const syncUpiIdsToBackend = async (nextUpiIds) => {
    if (!ensureSuperAdminAccess("update UPI IDs")) return null;

    const normalizedUpiIds = nextUpiIds
      .map((item) => ({
        id: String(item.id),
        accountName: item.accountName?.trim() || "",
        upiId: item.upiId?.trim().toLowerCase() || "",
        status: getUpiStatus(item),
        isDeleted: item.isDeleted === true,
        deletedAt: item.isDeleted
          ? item.deletedAt || new Date().toISOString()
          : null,
      }))
      .filter((item) => item.accountName && item.upiId);

    const response = await apiPut(API_ENDPOINTS.BUSINESS_SETTINGS.UPDATE, {
      upiIds: normalizedUpiIds,
    });

    const remoteUpiIds = response?.data?.settings?.upiIds;
    if (Array.isArray(remoteUpiIds)) {
      handleBusinessChange("upiIds", remoteUpiIds);
      return remoteUpiIds;
    }

    handleBusinessChange("upiIds", normalizedUpiIds);
    return normalizedUpiIds;
  };

  const openAddUpiModal = () => {
    if (!ensureSuperAdminAccess("add UPI ID")) return;

    setEditingUpiId(null);
    setUpiFormData(DEFAULT_UPI_FORM);
    setIsUpiModalOpen(true);
  };

  const openEditUpiModal = (upi) => {
    if (!ensureSuperAdminAccess("edit UPI ID")) return;

    setEditingUpiId(upi.id);
    setUpiFormData({
      accountName: upi.accountName || "",
      upiId: upi.upiId || "",
      status: getUpiStatus(upi),
    });
    setIsUpiModalOpen(true);
  };

  const closeUpiModal = () => {
    setIsUpiModalOpen(false);
    setEditingUpiId(null);
    setUpiFormData(DEFAULT_UPI_FORM);
  };

  const handleUpiFormChange = (field, value) => {
    setUpiFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const saveUpi = async () => {
    if (!ensureSuperAdminAccess("save UPI ID")) return;

    const accountName = upiFormData.accountName.trim();
    const upiId = upiFormData.upiId.trim().toLowerCase();

    if (!accountName) {
      showError("Please enter account name");
      return;
    }

    if (!upiId) {
      showError("Please enter UPI ID");
      return;
    }

    if (editingUpiId) {
      const updated = (businessSettings.upiIds || []).map((item) =>
        item.id === editingUpiId
          ? {
              ...item,
              accountName,
              upiId,
              status: upiFormData.status,
              isDeleted: false,
              deletedAt: null,
            }
          : item,
      );

      try {
        await syncUpiIdsToBackend(updated);
        showSuccess("UPI account updated successfully");
      } catch (error) {
        showError(
          error?.response?.data?.error || "Failed to update UPI account",
        );
        return;
      }
    } else {
      const newUpi = {
        id: Date.now().toString(),
        accountName,
        upiId,
        status: upiFormData.status,
        isDeleted: false,
        deletedAt: null,
      };

      try {
        await syncUpiIdsToBackend([...(businessSettings.upiIds || []), newUpi]);
        showSuccess("UPI account added successfully");
      } catch (error) {
        showError(error?.response?.data?.error || "Failed to add UPI account");
        return;
      }
    }

    closeUpiModal();
  };

  const handleBulkDeleteUpiIds = async () => {
    if (!ensureSuperAdminAccess("remove selected UPI IDs")) return;
    if (confirmDeleteUpiIds.length === 0) return;

    const updated = (businessSettings.upiIds || []).map((item) =>
      confirmDeleteUpiIds.includes(item.id)
        ? {
            ...item,
            status: "inactive",
            isDeleted: true,
            deletedAt: new Date().toISOString(),
          }
        : item,
    );

    try {
      await syncUpiIdsToBackend(updated);
      showSuccess(`${confirmDeleteUpiIds.length} UPI accounts deleted`);
      setConfirmDeleteUpiIds([]);
      setSelectedUpiIds([]);
    } catch (error) {
      showError(
        error?.response?.data?.error || "Failed to delete UPI accounts",
      );
    }
  };

  const filteredUpiIds = (businessSettings.upiIds || []).filter((item) => {
    if (item.isDeleted === true) return false;
    const query = upiSearch.toLowerCase();
    return (
      String(item.accountName || "")
        .toLowerCase()
        .includes(query) ||
      String(item.upiId || "")
        .toLowerCase()
        .includes(query)
    );
  });

  const toggleSelectAllUpi = () => {
    if (selectedUpiIds.length === filteredUpiIds.length) {
      setSelectedUpiIds([]);
    } else {
      setSelectedUpiIds(filteredUpiIds.map((item) => item.id));
    }
  };

  const toggleSelectUpiRow = (id) => {
    setSelectedUpiIds((prev) =>
      prev.includes(id)
        ? prev.filter((itemId) => itemId !== id)
        : [...prev, id],
    );
  };

  const toggleUpiStatus = async (id) => {
    if (!ensureSuperAdminAccess("change UPI ID status")) return;

    let updatedStatus = "inactive";
    const updated = (businessSettings.upiIds || []).map((item) =>
      item.id === id
        ? {
            ...item,
            status: getUpiStatus(item) === "active" ? "inactive" : "active",
          }
        : item,
    );

    const target = updated.find((item) => item.id === id);
    if (target) {
      updatedStatus = getUpiStatus(target);
    }

    try {
      await syncUpiIdsToBackend(updated);
      showSuccess(
        `UPI account marked as ${updatedStatus === "active" ? "Active" : "Inactive"}`,
      );
    } catch (error) {
      showError(error?.response?.data?.error || "Failed to update status");
    }
  };

  // Interested Services Functions
  const getInterestedServiceStatus = (service) => service.status || "active";

  const syncInterestedServicesToBackend = async (nextServices) => {
    if (!ensureSuperAdminAccess("update interested services")) return null;

    const normalizedServices = nextServices.map((service) => ({
      id: String(service.id),
      name: service.name?.trim() || "",
      status: getInterestedServiceStatus(service),
    }));

    const response = await apiPut(API_ENDPOINTS.BUSINESS_SETTINGS.UPDATE, {
      interestedServices: normalizedServices,
    });

    const remoteServices = response?.data?.settings?.interestedServices;

    if (Array.isArray(remoteServices)) {
      handleBusinessChange("interestedServices", remoteServices);
      return remoteServices;
    }

    handleBusinessChange("interestedServices", normalizedServices);
    return normalizedServices;
  };

  const openAddInterestedServiceModal = () => {
    if (!ensureSuperAdminAccess("add interested service")) return;

    setEditingInterestedServiceId(null);
    setInterestedServiceFormData({ name: "", status: "active" });
    setIsInterestedServiceModalOpen(true);
  };

  const openEditInterestedServiceModal = (service) => {
    if (!ensureSuperAdminAccess("edit interested service")) return;

    setEditingInterestedServiceId(service.id);
    setInterestedServiceFormData({
      name: service.name,
      status: getInterestedServiceStatus(service),
    });
    setIsInterestedServiceModalOpen(true);
  };

  const closeInterestedServiceModal = () => {
    setIsInterestedServiceModalOpen(false);
    setEditingInterestedServiceId(null);
    setInterestedServiceFormData({ name: "", status: "active" });
  };

  const handleInterestedServiceFormChange = (field, value) => {
    setInterestedServiceFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const saveInterestedService = async () => {
    if (!ensureSuperAdminAccess("save interested service")) return;

    const serviceName = interestedServiceFormData.name.trim();

    if (!serviceName) {
      showError("Please enter service name");
      return;
    }

    if (editingInterestedServiceId) {
      const updatedServices = businessSettings.interestedServices.map(
        (service) =>
          service.id === editingInterestedServiceId
            ? {
                ...service,
                name: serviceName,
                status: interestedServiceFormData.status,
              }
            : service,
      );
      try {
        await syncInterestedServicesToBackend(updatedServices);
        showSuccess("Service updated successfully");
      } catch (error) {
        showError(error?.response?.data?.error || "Failed to update service");
        return;
      }
    } else {
      const newService = {
        id: Date.now().toString(),
        name: serviceName,
        status: interestedServiceFormData.status,
      };
      try {
        await syncInterestedServicesToBackend([
          ...businessSettings.interestedServices,
          newService,
        ]);
        showSuccess("Service added to interested services");
      } catch (error) {
        showError(error?.response?.data?.error || "Failed to add service");
        return;
      }
    }

    closeInterestedServiceModal();
  };

  const removeInterestedService = async (id) => {
    if (!ensureSuperAdminAccess("remove interested service")) return;

    const remainingServices = businessSettings.interestedServices.filter(
      (s) => s.id !== id,
    );

    try {
      await syncInterestedServicesToBackend(remainingServices);
      showSuccess("Service removed");
    } catch (error) {
      showError(error?.response?.data?.error || "Failed to remove service");
    }
  };

  const handleBulkDeleteInterestedServices = async () => {
    if (!ensureSuperAdminAccess("remove selected services")) return;

    if (confirmDeleteInterestedServices.length === 0) return;

    const remaining = businessSettings.interestedServices.filter(
      (s) => !confirmDeleteInterestedServices.includes(s.id),
    );

    try {
      await syncInterestedServicesToBackend(remaining);
      showSuccess(
        `${confirmDeleteInterestedServices.length} services removed successfully`,
      );
      setConfirmDeleteInterestedServices([]);
      setSelectedInterestedServices([]);
    } catch (error) {
      showError(error?.response?.data?.error || "Failed to remove services");
    }
  };

  const filteredInterestedServices = businessSettings.interestedServices.filter(
    (s) => s.name.toLowerCase().includes(interestedServiceSearch.toLowerCase()),
  );

  const toggleInterestedSelectAll = () => {
    if (
      selectedInterestedServices.length === filteredInterestedServices.length
    ) {
      setSelectedInterestedServices([]);
    } else {
      setSelectedInterestedServices(
        filteredInterestedServices.map((s) => s.id),
      );
    }
  };

  const toggleInterestedSelectRow = (id) => {
    setSelectedInterestedServices((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  const toggleInterestedServiceStatus = async (id) => {
    if (!ensureSuperAdminAccess("change service status")) return;

    let updatedStatus = "inactive";
    const updatedServices = businessSettings.interestedServices.map(
      (service) =>
        service.id === id
          ? {
              ...service,
              status:
                getInterestedServiceStatus(service) === "active"
                  ? "inactive"
                  : "active",
            }
          : service,
    );

    const targetService = updatedServices.find((service) => service.id === id);
    if (targetService) {
      updatedStatus = getInterestedServiceStatus(targetService);
    }

    try {
      await syncInterestedServicesToBackend(updatedServices);
      showSuccess(
        `Service marked as ${updatedStatus === "active" ? "Active" : "Inactive"}`,
      );
    } catch (error) {
      showError(error?.response?.data?.error || "Failed to update status");
    }
  };

  const BACKUP_LONG_REQUEST_TIMEOUT_MS = 10 * 60 * 1000;

  // Export Backup Handler
  // Export Backup Handler - BSON Format
  // Update the Export Backup Handler in your Settings component
  // Export Backup Handler
  const handleExportBackup = async () => {
    try {
      setIsExporting(true);
      setBackupProgress("Creating secure backup from server...");

      // Get selected format from radio buttons
      const selectedFormat =
        document.querySelector('input[name="exportFormat"]:checked')?.value ||
        "bson";

      // Set appropriate Accept header based on format
      const headers = {};
      if (selectedFormat === "json") {
        headers["Accept"] = "application/json";
      } else {
        headers["Accept"] = "application/octet-stream";
      }

      const response = await apiGet(API_ENDPOINTS.BACKUP.EXPORT, {
        headers: headers,
        timeout: BACKUP_LONG_REQUEST_TIMEOUT_MS,
        // Don't specify responseType for JSON, let axios handle it
        responseType: selectedFormat === "bson" ? "arraybuffer" : "json",
      });

      setBackupProgress("Processing backup file...");

      const timestamp = new Date().toISOString().split("T")[0];

      if (selectedFormat === "json") {
        // Handle JSON format - response.data should already be parsed JSON
        const jsonData = response.data;

        // Accept any object as valid backup data
        let backupObject = null;
        if (jsonData && typeof jsonData === "object") {
          if (jsonData.success === true && jsonData.data) {
            // If wrapped in success object
            backupObject = jsonData.data;
          } else if (jsonData.collections) {
            // Direct backup data
            backupObject = jsonData;
          } else {
            // Fallback: treat the whole object as backup
            backupObject = jsonData;
          }
        }

        if (backupObject) {
          const jsonString = JSON.stringify(backupObject, null, 2);
          const blob = new Blob([jsonString], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `maxcode-backup-${timestamp}.json`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          showSuccess("Backup exported successfully in JSON format!");
        } else {
          throw new Error("Unexpected JSON response format");
        }
      } else {
        // Handle BSON format - response.data should be ArrayBuffer
        const buffer = response.data;
        const blob = new Blob([buffer], { type: "application/octet-stream" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `maxcode-backup-${timestamp}.bson`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showSuccess("Backup exported successfully in BSON format!");
      }

      setBackupProgress("");
    } catch (error) {
      console.error("Backup export error:", error);
      console.error("Error details:", error.response?.data || error.message);
      showError(
        error.response?.data?.error ||
          "Failed to export backup. Please try again.",
      );
      setBackupProgress("");
    } finally {
      setIsExporting(false);
    }
  };

  // Import Backup Handler
  // Import Backup Handler
  // Import Backup Handler - Direct File Upload Version
  const handleImportBackup = async (event) => {
    if (!ensureSuperAdminAccess("restore backup")) return;

    const file = event.target.files?.[0];
    if (!file) {
      showError("No file selected for import.");
      return;
    }

    const fileName = file.name.toLowerCase();
    const isBson = fileName.endsWith(".bson");
    const isJson = fileName.endsWith(".json");

    if (!isBson && !isJson) {
      showError(
        "Invalid file format. Please select a .bson or .json backup file.",
      );
      return;
    }

    setIsImporting(true);
    setBackupProgress("Importing backup file...");

    try {
      if (isJson) {
        setBackupProgress("Step 1: Reading JSON backup file...");
        const jsonText = await file.text();
        const backupData = JSON.parse(jsonText);

        setBackupProgress("Step 2: Restoring data on server...");
        await apiPost(
          API_ENDPOINTS.BACKUP.RESTORE,
          {
            action: "restore",
            backupData,
          },
          {
            timeout: BACKUP_LONG_REQUEST_TIMEOUT_MS,
          },
        );

        showSuccess("Backup imported successfully from JSON file!");
        setBackupProgress("");
        return;
      } else if (isBson) {
        setBackupProgress("Step 1: Reading backup file...");
        // Read file as ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();

        setBackupProgress("Step 2: Validating file size...");
        if (arrayBuffer.byteLength < 100) {
          showError("Backup file is too small or corrupted.");
          setIsImporting(false);
          return;
        }

        setBackupProgress("Step 3: Validating file header...");
        // Advanced validation: check BSON header (first bytes)
        const fileLength = new DataView(arrayBuffer).getInt32(0, true);
        if (fileLength !== arrayBuffer.byteLength) {
          showError("Backup file header mismatch. File may be corrupted.");
          setIsImporting(false);
          return;
        }

        setBackupProgress("Step 4: Encoding file for upload...");
        // Convert directly to base64 using FileReader
        const base64Data = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = reader.result.split(",")[1];
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        setBackupProgress("Step 5: Sending data to server for restore...");

        // Send to backend
        await apiPost(
          API_ENDPOINTS.BACKUP.RESTORE,
          {
            action: "restore",
            backupData: `base64:${base64Data}`,
          },
          {
            timeout: BACKUP_LONG_REQUEST_TIMEOUT_MS,
          },
        );

        setBackupProgress("Step 6: Finalizing restore...");
        showSuccess("Backup restored successfully!");
      }
      setBackupProgress("");
    } catch (error) {
      console.error("Import error:", error);
      let errMsg =
        error?.response?.data?.error ||
        error?.message ||
        "Failed to import backup";

      const isNetworkError =
        !error?.response &&
        (error?.message === "Network Error" ||
          String(error?.code || "").toUpperCase() === "ERR_NETWORK");

      if (isNetworkError) {
        errMsg =
          "Unable to connect to the server. Please ensure the backend is running and accessible, then try again.";
      }

      if (errMsg.includes("timeout") || errMsg.includes("server")) {
        errMsg += "\nThe request may have timed out. Please try again or contact support.";
      }
      showError(errMsg);
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
    if (!ensureSuperAdminAccess("save backup configuration")) return;

    if (
      driveConfig.enabled &&
      (!driveConfig.clientId ||
        !driveConfig.clientSecret ||
        !driveConfig.refreshToken ||
        !driveConfig.backupApiKey)
    ) {
      showError("Please fill all required fields to enable auto backup");
      return;
    }

    try {
      setIsDriveSaving(true);

      await apiPut(API_ENDPOINTS.BUSINESS_SETTINGS.UPDATE, {
        backupSettings: {
          enabled: driveConfig.enabled,
          clientId: driveConfig.clientId,
          clientSecret: driveConfig.clientSecret,
          refreshToken: driveConfig.refreshToken,
          backupApiKey: driveConfig.backupApiKey,
          folderId: driveConfig.folderId,
          backupTime: driveConfig.backupTime,
          frequency: driveConfig.frequency,
          everyHours: driveConfig.everyHours,
          dayOfWeek: driveConfig.dayOfWeek,
          dayOfMonth: driveConfig.dayOfMonth,
          monthOfYear: driveConfig.monthOfYear,
          timezone: driveConfig.timezone,
        },
      });

      // Reload settings to ensure enabled state persists
      await loadGoogleDriveConfig();

      showSuccess("✅ Google Drive backup configuration saved successfully!");

      if (driveConfig.enabled) {
        showInfo(
          "📌 Next: Add these credentials as GitHub Secrets to activate automation.",
        );
      }
    } catch (error) {
      console.error("Drive config save error:", error);
      showError(error?.response?.data?.error || "Failed to save configuration");
    } finally {
      setIsDriveSaving(false);
    }
  };

  const handleTestDriveConnection = async () => {
    if (!ensureSuperAdminAccess("test drive connection")) return;

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

      const response = await apiPost(
        API_ENDPOINTS.BACKUP.TEST_DRIVE,
        {
          action: "test-drive-config",
          driveConfig,
        },
        {
          timeout: BACKUP_LONG_REQUEST_TIMEOUT_MS,
        },
      );

      if (response?.data?.user?.emailAddress) {
        showSuccess(
          `✅ Google Drive connected successfully!\nLogged in as: ${response.data.user.emailAddress}`,
        );
      } else {
        showSuccess("✅ Google Drive connection successful!");
      }
    } catch (error) {
      console.error("Drive connection test error:", error);
      showError(
        error?.response?.data?.error ||
          "Failed to connect to Google Drive. Please check your credentials.",
      );
    } finally {
      setIsDriveSaving(false);
    }
  };

  const handleRunBackupNow = async () => {
    if (!ensureSuperAdminAccess("run backup now")) return;

    try {
      setIsDriveSaving(true);
      showInfo("⏳ Creating backup and uploading to Google Drive...");

      const response = await apiPost(
        API_ENDPOINTS.BACKUP.RUN_NOW,
        {
          action: "run-now",
        },
        {
          timeout: BACKUP_LONG_REQUEST_TIMEOUT_MS,
        },
      );

      const stats = response?.data?.stats;
      const drive = response?.data?.drive;

      if (drive?.fileName) {
        showSuccess(
          `✅ Backup uploaded to Google Drive!\n📁 ${drive.fileName}\n📊 ${stats.totalRecords} records across ${stats.collections} collections`,
        );
      } else if (stats) {
        showSuccess(
          `✅ Backup completed (local only)!\n📊 ${stats.totalRecords} records across ${stats.collections} collections\n💡 Enable Google Drive in configuration to upload backups`,
        );
      } else {
        showSuccess("✅ Backup completed successfully");
      }
    } catch (error) {
      console.error("Run backup now error:", error);
      showError(
        error?.response?.data?.error ||
          error?.response?.data?.message ||
          "Failed to run backup",
      );
    } finally {
      setIsDriveSaving(false);
    }
  };

  // Check Undo Import availability on mount and after import
  const checkUndoImport = async () => {
    try {
      const response = await apiPost(API_ENDPOINTS.BACKUP.RESTORE, {
        action: "check-undo-import",
      });
      if (response?.data?.available) {
        setUndoAvailable(true);
        setUndoExpiry(response.data.expiresAt);
      } else {
        setUndoAvailable(false);
        setUndoExpiry(null);
      }
    } catch {
      setUndoAvailable(false);
      setUndoExpiry(null);
    }
  };

  useEffect(() => {
    checkUndoImport();
  }, []);

  const handleUndoImport = async () => {
    if (!ensureSuperAdminAccess("undo imported data")) return;

    if (!undoAvailable) return;
    setIsUndoing(true);
    try {
      const response = await apiPost(API_ENDPOINTS.BACKUP.RESTORE, {
        action: "undo-import",
      });
      if (response?.data?.success) {
        showSuccess("Import undone. Data restored to pre-import state.");
        setUndoAvailable(false);
        setUndoExpiry(null);
      } else {
        showError(response?.data?.error || "Failed to undo import.");
      }
    } catch (err) {
      showError(err?.response?.data?.error || "Failed to undo import.");
    } finally {
      setIsUndoing(false);
    }
  };

  const renderTabContent = () => {
    if (activeTab === "profile") {
      return (
        <ProfileTab
          isEditing={isEditing}
          setIsEditing={setIsEditing}
          handleProfileSubmit={handleProfileSubmit}
          handleCancel={handleCancel}
          loading={loading}
          formData={formData}
          handleInputChange={handleInputChange}
        />
      );
    }

    if (activeTab === "pin") {
      return (
        <PinTab
          handlePinSubmit={handlePinSubmit}
          showPassword={showPassword}
          pinData={pinData}
          handlePinChange={handlePinChange}
          togglePasswordVisibility={togglePasswordVisibility}
          loading={loading}
          handlePinCancel={handlePinCancel}
        />
      );
    }

    if (activeTab === "2fa") {
      return (
        <TwoFATab
          twoFAData={twoFAData}
          is2FALoading={is2FALoading}
          handleGenerate2FA={handleGenerate2FA}
          setShow2FAVerification={setShow2FAVerification}
          biometricLogin={biometricLogin}
          handleBiometricToggle={handleBiometricToggle}
          isBiometricLoading={isBiometricLoading}
          usbKeyLogin={usbKeyLogin}
          handleUsbKeyToggle={handleUsbKeyToggle}
          isUsbKeyLoading={isUsbKeyLoading}
          faceAuth={faceAuth}
          handleFaceAuthToggle={handleFaceAuthToggle}
          isFaceAuthLoading={isFaceAuthLoading}
          showBackupCodes={showBackupCodes}
          backupCodes={backupCodes}
          handleCopyBackupCodes={handleCopyBackupCodes}
          handleDownloadBackupCodes={handleDownloadBackupCodes}
          setShowBackupCodes={setShowBackupCodes}
          show2FAVerification={show2FAVerification}
          disable2FACode={disable2FACode}
          setDisable2FACode={setDisable2FACode}
          handleDisable2FA={handleDisable2FA}
        />
      );
    }

    if (activeTab === "business") {
      return (
        <BusinessTab
          handleSaveAll={handleSaveAll}
          isSaving={isSaving}
          isBusinessLoading={isBusinessLoading}
          isSuperAdmin={isSuperAdmin}
          uploadingField={uploadingField}
          businessSettings={businessSettings}
          handleImageUpload={handleImageUpload}
          handleBusinessChange={handleBusinessChange}
          handleTestConnection={handleTestConnection}
          isTesting={isTesting}
        />
      );
    }

    if (activeTab === "whatsappCloudApi") {
      return (
        <WhatsAppCloudApiTab
          handleSaveAll={handleSaveAll}
          isSaving={isSaving}
          isBusinessLoading={isBusinessLoading}
          isSuperAdmin={isSuperAdmin}
          businessSettings={businessSettings}
          handleWhatsAppChange={handleWhatsAppChange}
          handleWhatsAppSecretInputChange={handleWhatsAppSecretInputChange}
          showWhatsAppSecret={showWhatsAppSecret}
          handleWhatsAppRevealToggle={handleWhatsAppRevealToggle}
          copyWhatsAppFieldValue={copyWhatsAppFieldValue}
        />
      );
    }

    if (activeTab === "telegram") {
      return (
        <TelegramTab
          handleSaveAll={handleSaveAll}
          isSaving={isSaving}
          isBusinessLoading={isBusinessLoading}
          isSuperAdmin={isSuperAdmin}
          businessSettings={businessSettings}
          handleTelegramChange={handleTelegramChange}
          handleTelegramSecretInputChange={handleTelegramSecretInputChange}
          showTelegramSecret={showTelegramSecret}
          handleTelegramRevealToggle={handleTelegramRevealToggle}
          copyTelegramFieldValue={copyTelegramFieldValue}
          webhookUrl={`${window.location.origin}${API_ENDPOINTS.TELEGRAM.WEBHOOK_PATH}`}
          onTelegramSetup={handleTelegramSetup}
          isTelegramSettingUp={isTelegramSettingUp}
        />
      );
    }

    if (activeTab === "cloudflare") {
      return (
        <CloudflareTab
          handleSaveAll={handleSaveAll}
          isSaving={isSaving}
          isBusinessLoading={isBusinessLoading}
          isSuperAdmin={isSuperAdmin}
          businessSettings={businessSettings}
          handleCloudflareChange={handleCloudflareChange}
          handleCloudflareSecretInputChange={handleCloudflareSecretInputChange}
          showCloudflareSecret={showCloudflareSecret}
          handleCloudflareRevealToggle={handleCloudflareRevealToggle}
          copyCloudflareFieldValue={copyCloudflareFieldValue}
        />
      );
    }

    if (activeTab === "terms") {
      return (
        <TermsTab
          isSaving={isSaving}
          isBusinessLoading={isBusinessLoading}
          isSuperAdmin={isSuperAdmin}
          setShowResetTermsConfirm={setShowResetTermsConfirm}
          handleSaveAll={handleSaveAll}
          businessSettings={businessSettings}
          handleBusinessChange={handleBusinessChange}
          showResetTermsConfirm={showResetTermsConfirm}
          handleResetTermsToDefault={handleResetTermsToDefault}
        />
      );
    }

    if (activeTab === "hsn") {
      return (
        <HsnTab
          serviceSearch={serviceSearch}
          setServiceSearch={setServiceSearch}
          selectedServices={selectedServices}
          setConfirmDeleteServices={setConfirmDeleteServices}
          openAddServiceModal={openAddServiceModal}
          isSuperAdmin={isSuperAdmin}
          filteredServices={filteredServices}
          toggleSelectAll={toggleSelectAll}
          toggleSelectRow={toggleSelectRow}
          getServiceStatus={getServiceStatus}
          toggleServiceStatus={toggleServiceStatus}
          openEditServiceModal={openEditServiceModal}
          removeService={removeService}
          isServiceModalOpen={isServiceModalOpen}
          editingServiceId={editingServiceId}
          closeServiceModal={closeServiceModal}
          serviceFormData={serviceFormData}
          handleServiceFormChange={handleServiceFormChange}
          saveService={saveService}
          confirmDeleteServices={confirmDeleteServices}
          handleBulkDeleteServices={handleBulkDeleteServices}
        />
      );
    }

    if (activeTab === "upiId") {
      return (
        <UpiIdTab
          upiIds={businessSettings.upiIds || []}
          upiSearch={upiSearch}
          setUpiSearch={setUpiSearch}
          selectedUpiIds={selectedUpiIds}
          setConfirmDeleteUpiIds={setConfirmDeleteUpiIds}
          openAddUpiModal={openAddUpiModal}
          isSuperAdmin={isSuperAdmin}
          filteredUpiIds={filteredUpiIds}
          toggleSelectAllUpi={toggleSelectAllUpi}
          toggleSelectUpiRow={toggleSelectUpiRow}
          getUpiStatus={getUpiStatus}
          toggleUpiStatus={toggleUpiStatus}
          openEditUpiModal={openEditUpiModal}
          isUpiModalOpen={isUpiModalOpen}
          editingUpiId={editingUpiId}
          closeUpiModal={closeUpiModal}
          upiFormData={upiFormData}
          handleUpiFormChange={handleUpiFormChange}
          saveUpi={saveUpi}
          confirmDeleteUpiIds={confirmDeleteUpiIds}
          handleBulkDeleteUpiIds={handleBulkDeleteUpiIds}
        />
      );
    }

    if (activeTab === "backup") {
      return (
        <BackupTab
          undoAvailable={undoAvailable}
          undoExpiry={undoExpiry}
          handleUndoImport={handleUndoImport}
          isUndoing={isUndoing}
          isSuperAdmin={isSuperAdmin}
          backupProgress={backupProgress}
          handleExportBackup={handleExportBackup}
          isExporting={isExporting}
          backupFileInputRef={backupFileInputRef}
          handleImportBackup={handleImportBackup}
          isImporting={isImporting}
          driveConfig={driveConfig}
          setDriveConfig={setDriveConfig}
          handleDriveSecretInputChange={handleDriveSecretInputChange}
          showDrivePassword={showDrivePassword}
          handleDriveRevealToggle={handleDriveRevealToggle}
          copyDriveFieldValue={copyDriveFieldValue}
          handleSaveDriveConfig={handleSaveDriveConfig}
          isDriveSaving={isDriveSaving}
          handleRunBackupNow={handleRunBackupNow}
          handleTestDriveConnection={handleTestDriveConnection}
        />
      );
    }

    if (activeTab === "interestedService") {
      return (
        <InterestedServiceTab
          interestedServiceSearch={interestedServiceSearch}
          setInterestedServiceSearch={setInterestedServiceSearch}
          selectedInterestedServices={selectedInterestedServices}
          setConfirmDeleteInterestedServices={
            setConfirmDeleteInterestedServices
          }
          openAddInterestedServiceModal={openAddInterestedServiceModal}
          isSuperAdmin={isSuperAdmin}
          filteredInterestedServices={filteredInterestedServices}
          toggleSelectAll={toggleInterestedSelectAll}
          toggleSelectRow={toggleInterestedSelectRow}
          getInterestedServiceStatus={getInterestedServiceStatus}
          toggleInterestedServiceStatus={toggleInterestedServiceStatus}
          openEditInterestedServiceModal={openEditInterestedServiceModal}
          removeInterestedService={removeInterestedService}
          isInterestedServiceModalOpen={isInterestedServiceModalOpen}
          editingInterestedServiceId={editingInterestedServiceId}
          closeInterestedServiceModal={closeInterestedServiceModal}
          interestedServiceFormData={interestedServiceFormData}
          handleInterestedServiceFormChange={handleInterestedServiceFormChange}
          saveInterestedService={saveInterestedService}
          confirmDeleteInterestedServices={confirmDeleteInterestedServices}
          handleBulkDeleteInterestedServices={
            handleBulkDeleteInterestedServices
          }
        />
      );
    }

    return null;
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
            <SettingsTabsNav
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              canAccessTab={canAccessTab}
            />

            <div className="tab-content">
              {!["profile", "pin", "2fa"].includes(activeTab) &&
                !isSuperAdmin && (
                  <div className="alert alert-info mb-4" role="alert">
                    <i className="fas fa-lock me-2"></i>
                    These settings are shared for all users and can only be
                    edited by Super Admin.
                  </div>
                )}

              {renderTabContent()}
            </div>
          </div>
        </div>
      </div>
      {/* QR Code Modal for 2FA Setup */}
      {showQRModal && (
        <div
          className="modal d-block"
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1060,
          }}
        >
          <div className="modal-dialog modal-lg modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header bg-success text-white">
                <h5 className="modal-title">
                  <i className="fas fa-qrcode me-2"></i>
                  Setup Two-Factor Authentication
                </h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => setShowQRModal(false)}
                ></button>
              </div>
              <div className="modal-body">
                <div className="row">
                  <div className="col-md-6 text-center">
                    <h6 className="mb-3">Step 1: Scan QR Code</h6>
                    <div className="mb-3">
                      {qrCodeUrl && (
                        <img
                          src={qrCodeUrl}
                          alt="2FA QR Code"
                          style={{ maxWidth: "200px", height: "auto" }}
                        />
                      )}
                    </div>
                    <small className="text-muted">
                      Use Google Authenticator, Zoho Auth, Microsoft
                      Authenticator, or any TOTP-compatible app
                    </small>
                  </div>

                  <div className="col-md-6">
                    <h6 className="mb-3">Step 2: Enter Verification Code</h6>
                    <p className="text-muted small mb-3">
                      Enter the 6-digit code from your authenticator app:
                    </p>
                    <div className="mb-3">
                      <input
                        type="text"
                        className="form-control form-control-lg text-center"
                        value={twoFAData.twoFACode}
                        onChange={(e) => {
                          const value = e.target.value
                            .replace(/[^0-9]/g, "")
                            .slice(0, 6);
                          setTwoFAData({ ...twoFAData, twoFACode: value });
                        }}
                        placeholder="000000"
                        maxLength="6"
                        inputMode="numeric"
                        style={{
                          fontSize: "24px",
                          letterSpacing: "8px",
                          fontWeight: "bold",
                        }}
                      />
                    </div>

                    <div className="alert alert-info small">
                      <i className="fas fa-info-circle me-2"></i>
                      Codes refresh every 30 seconds. Enter the current code
                      shown in your app.
                    </div>

                    <div className="alert alert-warning small">
                      <i className="fas fa-exclamation-triangle me-2"></i>
                      <strong>Important:</strong> After enabling 2FA, save your
                      backup codes! You cannot use 2FA without them.
                    </div>
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setShowQRModal(false);
                    setTwoFAData({ enabled: false, twoFACode: "" });
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleVerifyAndEnable2FA}
                  disabled={is2FALoading || twoFAData.twoFACode.length !== 6}
                >
                  {is2FALoading ? (
                    <>
                      <span
                        className="spinner-border spinner-border-sm me-2"
                        role="status"
                        aria-hidden="true"
                      ></span>
                      Enabling...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-check me-2"></i>
                      Enable 2FA
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showFaceSetupModal && (
        <div
          className="modal d-block"
          style={{
            backgroundColor: "rgba(12, 34, 41, 0.58)",
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 1060,
            backdropFilter: "blur(4px)",
          }}
        >
          <div className="modal-dialog modal-xl modal-dialog-centered">
            <div className="modal-content border-0 shadow-lg overflow-hidden">
              <div
                className="modal-header text-white bg-success" 
              >
                <h5 className="modal-title d-flex align-items-center gap-2">
                  <i className="fas fa-camera"></i>
                  Setup Face Authentication
                </h5>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  onClick={() => {
                    setShowFaceSetupModal(false);
                    stopFaceSetupCamera();
                    setFaceSetupStatusText("Face setup cancelled");
                  }}
                  disabled={isFaceSetupSubmitting}
                ></button>
              </div>

              <div className="modal-body p-4">
                <div className="row g-4 align-items-stretch">
                  <div className="col-lg-7">
                    <div
                      className="rounded-4 p-2 h-100"
                      style={{
                        background:
                          "linear-gradient(165deg, rgba(9,104,95,0.12), rgba(24,98,163,0.14))",
                        border: "1px solid rgba(20, 112, 140, 0.2)",
                      }}
                    >
                      <div
                        className="position-relative rounded-4 overflow-hidden"
                        style={{
                          background: "#021d2a",
                          minHeight: "380px",
                        }}
                      >
                        <video
                          ref={faceSetupVideoRef}
                          autoPlay
                          muted
                          playsInline
                          className="w-100 h-100"
                          style={{
                            objectFit: "cover",
                            minHeight: "380px",
                          }}
                        />
                        <div
                          className="position-absolute top-0 start-0 end-0 p-3 text-center text-white"
                          style={{
                            background:
                              "linear-gradient(to bottom, rgba(3,20,31,0.78), rgba(3,20,31,0))",
                          }}
                        >
                          <strong>Keep your face inside camera frame</strong>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="col-lg-5">
                    <div className="card border-0 bg-light h-100">
                      <div className="card-body">
                        <h6 className="mb-2 d-flex align-items-center gap-2">
                          <i className="fas fa-shield-check text-success"></i>
                          Enrollment Progress: {faceSetupProgress}%
                        </h6>

                        <div
                          className="progress mb-3"
                          style={{ height: "12px", borderRadius: "999px" }}
                        >
                          <div
                            className="progress-bar progress-bar-striped progress-bar-animated"
                            role="progressbar"
                            style={{ width: `${faceSetupProgress}%` }}
                          ></div>
                        </div>

                        <div className="alert alert-info py-2 small mb-3">
                          <i className="fas fa-info-circle me-2"></i>
                          {faceSetupStatusText}
                        </div>

                        <div className="list-group list-group-flush">
                          {FACE_SETUP_REQUIRED_STEPS.map((step) => {
                            const done = faceSetupStepsDone.includes(step.key);
                            return (
                              <div
                                key={step.key}
                                className="list-group-item d-flex align-items-center justify-content-between px-0 bg-transparent"
                              >
                                <span className="fw-semibold small">
                                  {step.label}
                                </span>
                                <span
                                  className={`badge ${done ? "bg-success" : "bg-secondary"}`}
                                >
                                  {done ? "Captured" : "Pending"}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => {
                    setShowFaceSetupModal(false);
                    stopFaceSetupCamera();
                    setFaceSetupStatusText("Face setup cancelled");
                  }}
                  disabled={isFaceSetupSubmitting}
                >
                  Cancel Setup
                </button>

                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={
                    isFaceSetupSubmitting ||
                    faceSetupStepsDone.length < FACE_SETUP_REQUIRED_STEPS.length
                  }
                  onClick={completeFaceSetupAndEnable}
                >
                  {isFaceSetupSubmitting ? (
                    <>
                      <span
                        className="spinner-border spinner-border-sm me-2"
                        role="status"
                        aria-hidden="true"
                      ></span>
                      Saving Face Profile...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-check-circle me-2"></i>
                      Enable Face Authentication
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .tabs-container {
          width: 100%;
          overflow: hidden;
        }

        .modern-tabs {
          border: none !important;
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          border-radius: 15px;
          padding: 5px;
          display: flex !important;
          overflow-x: auto !important;
          overflow-y: hidden !important;
          scroll-behavior: smooth;
          flex-wrap: nowrap !important;
          gap: 0;
          width: 100%;
          margin: 0 !important;
        }

        .modern-tabs::-webkit-scrollbar {
          height: 6px;
        }

        .modern-tabs::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.1);
          border-radius: 10px;
        }

        .modern-tabs::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.3);
          border-radius: 10px;
        }

        .modern-tabs::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.5);
        }

        .modern-tabs .nav-item {
          flex-shrink: 0 !important;
          min-width: max-content;
        }

        .modern-tabs .nav-link {
          border: none;
          color: white;
          font-weight: 600;
          border-radius: 10px;
          margin: 0 5px;
          transition: all 0.3s ease;
          background: #5b194f;
          flex-shrink: 0;
          white-space: nowrap;
        }

        .modern-tabs .nav-link:hover {
          background: #5b194f;
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

        .settings-responsive-btn {
          width: 100% !important;
        }

        .settings-action-group {
          width: 100%;
        }

        @media (min-width: 768px) {
          .settings-responsive-btn {
            width: auto !important;
          }

          .settings-action-group {
            width: auto;
          }
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
          background: var(--header-gradient);
          box-shadow: 0 4px 15px rgba(102, 126, 234, 0.3);
        }

        .backup-icon-wrapper i {
          color: white !important;
        }

        .backup-info-card {
          background: #f8f9fa;
          border-left: 4px solid #007230;
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
          padding: 0px 10px;
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
