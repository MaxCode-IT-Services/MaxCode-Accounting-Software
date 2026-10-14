import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { verifyRequestToken } from "./utils/auth.js";
import { ObjectId } from "mongodb";
import {
  decryptSecretFromStorage,
  encryptSecretForStorage,
  isEncryptedSecret,
  rotateEncryptedSecret,
} from "./utils/secret-crypto.js";
import {
  TERMS_SETTINGS_CONFIG,
  computeNextTermsVersion,
  getFirstDefinedValue,
  getTermsForVersion,
  normalizeSemanticVersion,
  normalizeTermsArray,
  upsertTermsVersionDocument,
} from "./utils/terms-versioning.js";
import { ensureTelegramWebhook } from "./utils/payment-verification-telegram.js";
import {
  PAYMENT_CHARGE_VERSION_FIELD,
  resolveChargeVersionForSave,
  getChargesForVersion,
  listChargeVersions,
  normalizeChargeVersion,
} from "./utils/payment-charge-versioning.js";

const SETTINGS_COLLECTION = "business_settings";
const ASSETS_COLLECTION = "business_assets";
const GLOBAL_SETTINGS_SCOPE = "global";
const SECRET_MASK = "********";
const LOGIN_CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;
const CLOUDFLARE_SECRET_FIELDS = [
  "storeUrl",
  "publicDomain",
  "password",
  "turnstileSiteKey",
  "turnstileSecretKey",
];
const WHATSAPP_SECRET_FIELDS = [
  "accessToken",
  "appId",
  "phoneNumberId",
  "businessAccountId",
];
const TELEGRAM_SECRET_FIELDS = [
  "botToken",
  "chatId",
  "sharedSecret",
  "routerBotId",
  "routerConnectionId",
];
const BACKUP_SECRET_FIELDS = [
  "clientId",
  "clientSecret",
  "refreshToken",
  "backupApiKey",
  "folderId",
];

let loginConfigCache = null;
let loginConfigCacheExpiresAt = 0;

// Short-TTL cache for the settings GET response. Settings are read on every
// page load; caching the mapped response for a few seconds removes the DB
// round-trip from the critical path without serving stale data for long.
const SETTINGS_CACHE_TTL_MS = 10 * 1000;
let settingsCache = null;
let settingsCacheExpiresAt = 0;
let settingsCacheKey = "";

const getCachedSettingsResponse = (userId) => {
  const key = String(userId || "");
  if (
    settingsCache &&
    settingsCacheKey === key &&
    settingsCacheExpiresAt > Date.now()
  ) {
    return settingsCache;
  }
  return null;
};

const setCachedSettingsResponse = (userId, response) => {
  settingsCacheKey = String(userId || "");
  settingsCache = response;
  settingsCacheExpiresAt = Date.now() + SETTINGS_CACHE_TTL_MS;
};

const invalidateSettingsCache = () => {
  settingsCache = null;
  settingsCacheKey = "";
  settingsCacheExpiresAt = 0;
};

const getEnvBoolean = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  return ["1", "true", "yes", "on"].includes(normalized);
};

const getTurnstileConfigFromEnv = () => {
  const siteKey = String(
    process.env.CLOUDFLARE_TURNSTILE_SITE_KEY ||
      process.env.TURNSTILE_SITE_KEY ||
      "",
  ).trim();
  const secretKey = String(
    process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY ||
      process.env.TURNSTILE_SECRET_KEY ||
      "",
  ).trim();
  const loginCaptchaEnabled = getEnvBoolean(
    process.env.CLOUDFLARE_LOGIN_CAPTCHA_ENABLED,
  );

  return {
    siteKey,
    secretKey,
    loginCaptchaEnabled,
  };
};

const IMAGE_FIELDS = [
  "profilePhotoUrl",
  "logoUrl",
  "qrCodeUrl",
  "sealUrl",
  "paidSealUrl",
  "unpaidSealUrl",
];

const FIELD_TO_INDEX = IMAGE_FIELDS.reduce((acc, field, index) => {
  acc[field] = String(index);
  return acc;
}, {});

const INDEX_TO_FIELD = Object.entries(FIELD_TO_INDEX).reduce(
  (acc, [field, index]) => {
    acc[index] = field;
    return acc;
  },
  {},
);

const ALLOWED_FIELDS = [
  ...IMAGE_FIELDS,
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
  "services",
  "upiIds",
  "paymentMethodCharges",
  "paymentMethodChargesVersion",
  "interestedServices",
  "backupSettings",
  "cloudflareSettings",
  "whatsappSettings",
  "telegramSettings",
  "featureToggles",
];

const isMaskedSecretValue = (value = "") =>
  String(value || "").trim() === SECRET_MASK;

const maskSecretValue = (value = "") => {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  return SECRET_MASK;
};

const resolveSecretForStorage = (incomingValue, existingValue = "") => {
  const incoming = String(incomingValue || "").trim();
  const existing = String(existingValue || "").trim();

  // Keep existing secret when client sends masked placeholder.
  if (isMaskedSecretValue(incoming)) {
    if (existing && !isEncryptedSecret(existing)) {
      return encryptSecretForStorage(existing);
    }
    // Re-encrypt values that still use a previous key, so a rotated
    // CREDENTIALS_ENCRYPTION_KEY can be dropped without losing the secret.
    return isEncryptedSecret(existing) ? rotateEncryptedSecret(existing) : existing;
  }

  // Empty string means explicit clear by user.
  if (!incoming) {
    return "";
  }

  return encryptSecretForStorage(incoming);
};

const secretExists = (value = "") => {
  const normalized = String(value || "").trim();
  if (!normalized) return false;
  if (isMaskedSecretValue(normalized)) return false;
  return true;
};

const normalizeRole = (role = "") =>
  String(role || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");

const isSuperAdminRole = (role = "") => {
  const normalized = normalizeRole(role);
  return normalized === "super-admin" || normalized === "superadmin";
};

const getSharedSettings = async (settingsCollection, userId) => {
  const globalSettings = await settingsCollection.findOne({
    scope: GLOBAL_SETTINGS_SCOPE,
  });

  if (globalSettings) {
    return globalSettings;
  }

  // Backward compatibility: old deployments stored settings per-user.
  if (userId) {
    const userSettings = await settingsCollection.findOne({ userId });
    if (userSettings) {
      return userSettings;
    }
  }

  return settingsCollection.findOne(
    {},
    {
      sort: {
        updatedAt: -1,
        createdAt: -1,
        _id: -1,
      },
    },
  );
};

const sanitizeBackupSettings = (value = {}, existingBackupSettings = {}) => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const frequency = [
    "daily",
    "weekly",
    "monthly",
    "yearly",
    "every_4_hours",
    "manual",
  ].includes(value.frequency)
    ? value.frequency
    : "daily";

  const dayOfMonthRaw = Number.parseInt(value.dayOfMonth, 10);
  const dayOfMonth = Number.isFinite(dayOfMonthRaw)
    ? Math.min(Math.max(dayOfMonthRaw, 1), 31)
    : 1;

  const monthOfYearRaw = Number.parseInt(value.monthOfYear, 10);
  const monthOfYear = Number.isFinite(monthOfYearRaw)
    ? Math.min(Math.max(monthOfYearRaw, 1), 12)
    : 1;

  const everyHoursRaw = Number.parseInt(value.everyHours, 10);
  const everyHours = Number.isFinite(everyHoursRaw)
    ? Math.min(Math.max(everyHoursRaw, 1), 24)
    : 4;

  return {
    enabled: Boolean(value.enabled),
    clientId: resolveSecretForStorage(
      value.clientId,
      existingBackupSettings?.clientId,
    ),
    clientSecret: resolveSecretForStorage(
      value.clientSecret,
      existingBackupSettings?.clientSecret,
    ),
    refreshToken: resolveSecretForStorage(
      value.refreshToken,
      existingBackupSettings?.refreshToken,
    ),
    backupApiKey: resolveSecretForStorage(
      value.backupApiKey,
      existingBackupSettings?.backupApiKey,
    ),
    folderId: resolveSecretForStorage(
      value.folderId,
      existingBackupSettings?.folderId,
    ),
    backupTime:
      typeof value.backupTime === "string" &&
      /^\d{2}:\d{2}$/.test(value.backupTime)
        ? value.backupTime
        : "20:00",
    frequency,
    everyHours,
    dayOfWeek:
      typeof value.dayOfWeek === "string" ? value.dayOfWeek.trim() : "monday",
    dayOfMonth,
    monthOfYear,
    timezone:
      typeof value.timezone === "string" && value.timezone.trim()
        ? value.timezone.trim()
        : "Asia/Kolkata",
    updatedAt: new Date(),
  };
};

const sanitizeCloudflareSettings = (
  value = {},
  existingCloudflareSettings = {},
) => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const normalizeUrl = (urlValue = "") => {
    const trimmed = String(urlValue || "").trim();
    if (!trimmed) return "";
    if (isMaskedSecretValue(trimmed)) return SECRET_MASK;
    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed.replace(/\/+$/, "");
    }
    return `https://${trimmed}`.replace(/\/+$/, "");
  };

  return {
    storeUrl: resolveSecretForStorage(
      normalizeUrl(value.storeUrl),
      existingCloudflareSettings?.storeUrl,
    ),
    publicDomain: resolveSecretForStorage(
      normalizeUrl(value.publicDomain),
      existingCloudflareSettings?.publicDomain,
    ),
    password: resolveSecretForStorage(
      value.password,
      existingCloudflareSettings?.password,
    ),
    turnstileSiteKey: resolveSecretForStorage(
      value.turnstileSiteKey,
      existingCloudflareSettings?.turnstileSiteKey,
    ),
    turnstileSecretKey: resolveSecretForStorage(
      value.turnstileSecretKey,
      existingCloudflareSettings?.turnstileSecretKey,
    ),
    defaultFolder:
      typeof value.defaultFolder === "string" && value.defaultFolder.trim()
        ? value.defaultFolder.trim()
        : "MaxCode",
    folderOptions:
      typeof value.folderOptions === "string" && value.folderOptions.trim()
        ? value.folderOptions.trim()
        : "MaxCode,Other",
    updatedAt: new Date(),
  };
};

const sanitizeWhatsAppSettings = (
  value = {},
  existingWhatsAppSettings = {},
) => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const normalizeDigits = (input = "") =>
    String(input || "")
      .replace(/\D+/g, "")
      .slice(-15);

  return {
    accessToken: resolveSecretForStorage(
      value.accessToken,
      existingWhatsAppSettings?.accessToken,
    ),
    appId: resolveSecretForStorage(
      value.appId,
      existingWhatsAppSettings?.appId,
    ),
    phoneNumberId: resolveSecretForStorage(
      value.phoneNumberId,
      existingWhatsAppSettings?.phoneNumberId,
    ),
    businessAccountId: resolveSecretForStorage(
      value.businessAccountId,
      existingWhatsAppSettings?.businessAccountId,
    ),
    founderCeoPhoneNumber: normalizeDigits(value.founderCeoPhoneNumber || ""),
    updatedAt: new Date(),
  };
};

const sanitizeTelegramSettings = (value = {}, existingTelegramSettings = {}) => {
  if (!value || typeof value !== "object") return null;

  return {
    botName: String(value.botName || "").trim(),
    botUserName: String(value.botUserName || "").trim().replace(/^@/, ""),
    // Full URL pasted into the router software's Software Connection.
    // Kept verbatim so a custom path or host is never rewritten.
    targetUrl: String(value.targetUrl || "")
      .trim()
      .slice(0, 300),
    botToken: resolveSecretForStorage(
      value.botToken,
      existingTelegramSettings?.botToken,
    ),
    chatId: resolveSecretForStorage(
      value.chatId,
      existingTelegramSettings?.chatId,
    ),
    sharedSecret: resolveSecretForStorage(
      value.sharedSecret,
      existingTelegramSettings?.sharedSecret,
    ),
    routerBotId: resolveSecretForStorage(
      value.routerBotId,
      existingTelegramSettings?.routerBotId,
    ),
    routerConnectionId: resolveSecretForStorage(
      value.routerConnectionId,
      existingTelegramSettings?.routerConnectionId,
    ),
    enabled: value.enabled === true,
    updatedAt: new Date(),
  };
};

const getBaseUrl = (event) => {
  const host =
    event.headers["x-forwarded-host"] || event.headers.host || "localhost:8888";

  const forwardedProto = event.headers["x-forwarded-proto"];
  const isLocalHost = host.includes("localhost") || host.includes("127.0.0.1");

  const protocol = forwardedProto || (isLocalHost ? "http" : "https");
  return `${protocol}://${host}`;
};

const normalizeHttpsUrl = (value) => {
  if (!value || typeof value !== "string") return "";
  if (value.startsWith("https://")) return value;
  if (value.startsWith("http://")) {
    return value.replace("http://", "https://");
  }
  return value;
};

const isManagedBusinessAssetUrl = (value) =>
  typeof value === "string" &&
  value.includes("/api/business-settings") &&
  !value.startsWith("data:image/");

const sanitizeFeatureToggles = (value = {}) => {
  if (!value || typeof value !== "object") {
    return {};
  }

  return {
    projectCredentialsAccessControl:
      value.projectCredentialsAccessControl !== false,
    publicPaymentWhatsapp: value.publicPaymentWhatsapp !== false,
    telegramPaymentNotifications: value.telegramPaymentNotifications === true,
    cloudflareLoginCaptcha: value.cloudflareLoginCaptcha === true,
    accountingViewMode: value.accountingViewMode || "professional",
    pdfExportSinglePageColumns: value.pdfExportSinglePageColumns === true,
    exportPreserveTextColor: value.exportPreserveTextColor === true,
  };
};

const toChargeNumber = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
};

// Thrown when the payload is structurally valid JSON but semantically
// unusable. The PUT handler turns this into a 400 with the message intact,
// so the client sees what to fix instead of a generic 500.
class SettingsValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "SettingsValidationError";
    this.statusCode = 400;
  }
}

const sanitizeSettingsPayload = (payload = {}, existingSettings = {}) => {
  const normalizedPayload = { ...payload };

  if (
    !Object.prototype.hasOwnProperty.call(normalizedPayload, "gstin") &&
    typeof normalizedPayload.GSTIN === "string"
  ) {
    normalizedPayload.gstin = normalizedPayload.GSTIN;
  }

  if (
    !Object.prototype.hasOwnProperty.call(normalizedPayload, "gstin") &&
    typeof normalizedPayload.companyGstin === "string"
  ) {
    normalizedPayload.gstin = normalizedPayload.companyGstin;
  }

  const sanitized = {};

  for (const field of ALLOWED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(normalizedPayload, field)) {
      const value = normalizedPayload[field];
      if (typeof value === "string") {
        const trimmedValue = value.trim();

        if (IMAGE_FIELDS.includes(field)) {
          // Always prefer base64 data for images
          if (trimmedValue.startsWith("data:image/")) {
            // New image upload - save base64 directly
            sanitized[field] = trimmedValue;
          } else if (isManagedBusinessAssetUrl(trimmedValue)) {
            // Existing managed asset URL - keep it to maintain database integrity
            // This allows old images to persist if not replaced with new upload
            sanitized[field] = trimmedValue;
          } else if (trimmedValue.length > 0) {
            // External image URL from third party - normalize to HTTPS
            sanitized[field] = normalizeHttpsUrl(trimmedValue);
          } else {
            // Empty string - skip to avoid clearing previous valid image
            // Only update if new value is provided
          }
        } else {
          sanitized[field] = trimmedValue;
        }
      } else if (field === "services" && Array.isArray(value)) {
        sanitized[field] = value
          .map((item) => ({
            id: item?.id ? String(item.id) : Date.now().toString(),
            name: item?.name ? String(item.name).trim() : "",
            hsnCode: item?.hsnCode ? String(item.hsnCode).trim() : "",
            status: item?.status === "inactive" ? "inactive" : "active",
          }))
          .filter((item) => item.name && item.hsnCode);
      } else if (field === "upiIds" && Array.isArray(value)) {
        sanitized[field] = value
          .map((item) => ({
            id: item?.id ? String(item.id) : Date.now().toString(),
            accountName: item?.accountName
              ? String(item.accountName).trim()
              : "",
            upiId: item?.upiId ? String(item.upiId).trim() : "",
            status: item?.status === "inactive" ? "inactive" : "active",
            isDeleted: item?.isDeleted === true,
            deletedAt:
              item?.isDeleted === true && item?.deletedAt
                ? new Date(item.deletedAt)
                : null,
          }))
          .filter((item) => item.accountName && item.upiId);
      } else if (field === "paymentMethodCharges" && Array.isArray(value)) {
        const invalidRows = [];
        sanitized[field] = value
          .map((item, index) => {
            const name = item?.name ? String(item.name).trim() : "";
            if (!name) invalidRows.push(index + 1);
            return {
              id: item?.id ? String(item.id) : Date.now().toString(),
              name,
              status: item?.status === "inactive" ? "inactive" : "active",
              // Each fee is optional – an empty/zero value means "Nil".
              processingFeeEnabled: item?.processingFeeEnabled === true,
              processingFeePercent: toChargeNumber(item?.processingFeePercent),
              processingFeeCap: toChargeNumber(item?.processingFeeCap),
              // Fee applies only above this amount; 0 = no threshold.
              processingFeeMinAmount: toChargeNumber(
                item?.processingFeeMinAmount,
              ),
              mdrEnabled: item?.mdrEnabled === true,
              mdrPercent: toChargeNumber(item?.mdrPercent),
              mdrCap: toChargeNumber(item?.mdrCap),
              // MDR applies only above this amount; 0 = no threshold.
              mdrMinAmount: toChargeNumber(item?.mdrMinAmount),
              // "extra" = customer pays it on top of the amount,
              // "included" = already part of the collected amount.
              chargeMode:
                item?.chargeMode === "included" ? "included" : "extra",
              isDeleted: item?.isDeleted === true,
              deletedAt:
                item?.isDeleted === true && item?.deletedAt
                  ? new Date(item.deletedAt)
                  : null,
            };
          });

        // Dropping a nameless row silently used to delete the user's data with
        // no feedback. Reject the whole save instead so nothing is lost.
        if (invalidRows.length > 0) {
          throw new SettingsValidationError(
            `Payment method name is required (row ${invalidRows.join(", ")}). Nothing was saved.`,
          );
        }
      } else if (field === "backupSettings") {
        const sanitizedBackupSettings = sanitizeBackupSettings(
          value,
          existingSettings?.backupSettings || {},
        );
        if (sanitizedBackupSettings) {
          sanitized[field] = sanitizedBackupSettings;
        }
      } else if (field === "cloudflareSettings") {
        const sanitizedCloudflareSettings = sanitizeCloudflareSettings(
          value,
          existingSettings?.cloudflareSettings || {},
        );
        if (sanitizedCloudflareSettings) {
          sanitized[field] = sanitizedCloudflareSettings;
        }
      } else if (field === "whatsappSettings") {
        const sanitizedWhatsAppSettings = sanitizeWhatsAppSettings(
          value,
          existingSettings?.whatsappSettings || {},
        );
        if (sanitizedWhatsAppSettings) {
          sanitized[field] = sanitizedWhatsAppSettings;
        }
      } else if (field === "telegramSettings") {
        const sanitizedTelegramSettings = sanitizeTelegramSettings(
          value,
          existingSettings?.telegramSettings || {},
        );
        if (sanitizedTelegramSettings) {
          sanitized[field] = sanitizedTelegramSettings;
        }
      } else if (field === "featureToggles") {
        const sanitizedFeatureToggles = sanitizeFeatureToggles(value);
        sanitized[field] = sanitizedFeatureToggles;
      } else {
        sanitized[field] = value;
      }
    }
  }

  return sanitized;
};

const normalizeLegacySettings = (document = {}) => {
  if (!document || typeof document !== "object") return {};

  const normalized = {};

  const fieldAliases = {
    companyName: ["companyName", "businessName", "name"],
    gstin: ["gstin", "GSTIN", "companyGstin", "gstNumber"],
    companyAddress: ["companyAddress", "address", "company_location"],
    companyPhone: ["companyPhone", "phone", "mobile", "phoneNumber"],
    companyEmail: ["companyEmail", "email", "officialEmail"],
    bankName: ["bankName", "bank"],
    ifscCode: ["ifscCode", "ifsc", "ifsc_code"],
    accountNumber: ["accountNumber", "accountNo", "bankAccountNumber"],
    accountName: ["accountName", "beneficiaryName", "accountHolderName"],
    branchAddress: ["branchAddress", "bankAddress", "branch"],
    invoiceTermsConditions: [
      "invoiceTermsConditions",
      "invoiceTerms",
      "termsConditions",
    ],
    selfInvoiceTermsConditions: [
      "selfInvoiceTermsConditions",
      "selfInvoiceTerms",
      "selfTermsConditions",
    ],
    performaInvoiceTermsConditions: [
      "performaInvoiceTermsConditions",
      "performaInvoiceTerms",
      "performaTermsConditions",
    ],
    creditDebitNoteTermsConditions: [
      "creditDebitNoteTermsConditions",
      "creditDebitNoteTerms",
      "noteTermsConditions",
    ],
    services: ["services", "serviceMaster", "serviceList"],
    upiIds: ["upiIds", "upiIdMaster", "upiList", "upiAccounts"],
    paymentMethodCharges: [
      "paymentMethodCharges",
      "paymentMethods",
      "paymentMethodMaster",
    ],
    backupSettings: ["backupSettings", "driveConfig", "googleDriveConfig"],
    cloudflareSettings: [
      "cloudflareSettings",
      "r2Settings",
      "cloudStorageSettings",
    ],
    whatsappSettings: ["whatsappSettings", "whatsappCloudApiSettings"],
    telegramSettings: ["telegramSettings", "telegramBotSettings"],
  };

  for (const [targetField, aliases] of Object.entries(fieldAliases)) {
    const value = getFirstDefinedValue(document, aliases);
    if (value !== undefined) {
      normalized[targetField] = value;
    }
  }

  return normalized;
};

const mapSettingsForClient = (document, event) => {
  if (!document) return null;

  const legacyNormalized = normalizeLegacySettings(document);

  const response = {};

  for (const field of ALLOWED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(document, field)) continue;

    const value =
      legacyNormalized[field] !== undefined
        ? legacyNormalized[field]
        : document[field];

    if (!IMAGE_FIELDS.includes(field)) {
      response[field] = value;
      continue;
    }

    if (!value || typeof value !== "string") {
      response[field] = "";
      continue;
    }

    // If it's already a short URL (managed asset or external URL), return as-is
    if (
      isManagedBusinessAssetUrl(value) ||
      value.startsWith("https://") ||
      value.startsWith("http://")
    ) {
      response[field] = value;
      continue;
    }

    // If it's old base64 data, convert to short URL for backward compatibility
    if (value.startsWith("data:image/")) {
      const settingsId = document?._id?.toString();
      const version = document?.updatedAt
        ? new Date(document.updatedAt).getTime()
        : document?.createdAt
          ? new Date(document.createdAt).getTime()
          : Date.now();
      const shortAssetUrl = settingsId
        ? `${getBaseUrl(event)}/api/business-settings?id=${buildAssetRef(settingsId, field)}&v=${version}`
        : "";
      response[field] = shortAssetUrl;
      continue;
    }

    // Empty value
    response[field] = "";
  }

  if (!Array.isArray(response.services)) {
    response.services = [];
  }

  if (!Array.isArray(response.upiIds)) {
    response.upiIds = [];
  }

  if (!Array.isArray(response.paymentMethodCharges)) {
    response.paymentMethodCharges = [];
  }

  // Always expose the charge-table version so the client can show which
  // pricing is currently live.
  response[PAYMENT_CHARGE_VERSION_FIELD] = normalizeChargeVersion(
    response[PAYMENT_CHARGE_VERSION_FIELD],
  );

  Object.values(TERMS_SETTINGS_CONFIG).forEach((config) => {
    response[config.versionField] = normalizeSemanticVersion(
      response[config.versionField],
    );
    if (!Array.isArray(response[config.settingsField])) {
      response[config.settingsField] = normalizeTermsArray(
        response[config.settingsField],
      ).join("\n");
    }
  });

  if (!response.backupSettings || typeof response.backupSettings !== "object") {
    response.backupSettings = {
      enabled: false,
      frequency: "daily",
      backupTime: "20:00",
      everyHours: 4,
      dayOfWeek: "monday",
      dayOfMonth: 1,
      monthOfYear: 1,
      timezone: "Asia/Kolkata",
      clientId: "",
      clientSecret: "",
      refreshToken: "",
      backupApiKey: "",
      folderId: "",
      hasClientId: false,
      hasClientSecret: false,
      hasRefreshToken: false,
      hasBackupApiKey: false,
      hasFolderId: false,
    };
  } else {
    const backupSettings = response.backupSettings || {};
    const clientId = String(backupSettings.clientId || "").trim();
    const clientSecret = String(backupSettings.clientSecret || "").trim();
    const refreshToken = String(backupSettings.refreshToken || "").trim();
    const backupApiKey = String(backupSettings.backupApiKey || "").trim();
    const folderId = String(backupSettings.folderId || "").trim();

    response.backupSettings = {
      ...backupSettings,
      clientId: maskSecretValue(clientId),
      clientSecret: maskSecretValue(clientSecret),
      refreshToken: maskSecretValue(refreshToken),
      backupApiKey: maskSecretValue(backupApiKey),
      folderId: maskSecretValue(folderId),
      hasClientId: secretExists(clientId),
      hasClientSecret: secretExists(clientSecret),
      hasRefreshToken: secretExists(refreshToken),
      hasBackupApiKey: secretExists(backupApiKey),
      hasFolderId: secretExists(folderId),
    };
  }

  if (
    !response.cloudflareSettings ||
    typeof response.cloudflareSettings !== "object"
  ) {
    response.cloudflareSettings = {
      storeUrl: "",
      publicDomain: "",
      password: "",
      turnstileSiteKey: "",
      turnstileSecretKey: "",
      defaultFolder: "",
      folderOptions: "",
      hasStoreUrl: false,
      hasPublicDomain: false,
      hasPassword: false,
      hasTurnstileSiteKey: false,
      hasTurnstileSecretKey: false,
    };
  } else {
    const cloudflareSettings = response.cloudflareSettings || {};
    const cloudStoreUrl = String(cloudflareSettings.storeUrl || "").trim();
    const cloudPublicDomain = String(
      cloudflareSettings.publicDomain || "",
    ).trim();
    const cloudPassword = String(cloudflareSettings.password || "").trim();
    const cloudTurnstileSiteKey = String(
      cloudflareSettings.turnstileSiteKey || "",
    ).trim();
    const cloudTurnstileSecretKey = String(
      cloudflareSettings.turnstileSecretKey || "",
    ).trim();
    response.cloudflareSettings = {
      ...cloudflareSettings,
      storeUrl: maskSecretValue(cloudStoreUrl),
      publicDomain: maskSecretValue(cloudPublicDomain),
      password: maskSecretValue(cloudPassword),
      turnstileSiteKey: maskSecretValue(cloudTurnstileSiteKey),
      turnstileSecretKey: maskSecretValue(cloudTurnstileSecretKey),
      hasStoreUrl: secretExists(cloudStoreUrl),
      hasPublicDomain: secretExists(cloudPublicDomain),
      hasPassword: secretExists(cloudPassword),
      hasTurnstileSiteKey: secretExists(cloudTurnstileSiteKey),
      hasTurnstileSecretKey: secretExists(cloudTurnstileSecretKey),
    };
  }

  if (
    !response.whatsappSettings ||
    typeof response.whatsappSettings !== "object"
  ) {
    response.whatsappSettings = {
      accessToken: "",
      appId: "",
      phoneNumberId: "",
      businessAccountId: "",
      founderCeoPhoneNumber: "",
      hasAccessToken: false,
      hasAppId: false,
      hasPhoneNumberId: false,
      hasBusinessAccountId: false,
    };
  } else {
    const whatsappSettings = response.whatsappSettings || {};
    const accessToken = String(whatsappSettings.accessToken || "").trim();
    const appId = String(whatsappSettings.appId || "").trim();
    const phoneNumberId = String(whatsappSettings.phoneNumberId || "").trim();
    const businessAccountId = String(
      whatsappSettings.businessAccountId || "",
    ).trim();
    const founderCeoPhoneNumber = String(
      whatsappSettings.founderCeoPhoneNumber || "",
    )
      .replace(/\D+/g, "")
      .slice(-15);

    response.whatsappSettings = {
      ...whatsappSettings,
      accessToken: maskSecretValue(accessToken),
      appId: maskSecretValue(appId),
      phoneNumberId: maskSecretValue(phoneNumberId),
      businessAccountId: maskSecretValue(businessAccountId),
      founderCeoPhoneNumber,
      hasAccessToken: secretExists(accessToken),
      hasAppId: secretExists(appId),
      hasPhoneNumberId: secretExists(phoneNumberId),
      hasBusinessAccountId: secretExists(businessAccountId),
    };
  }

  if (!response.telegramSettings || typeof response.telegramSettings !== "object") {
    response.telegramSettings = {
      botName: "",
      botUserName: "",
      botToken: "",
      chatId: "",
      sharedSecret: "",
      routerBotId: "",
      routerConnectionId: "",
      targetUrl: "",
      targetUrlEdited: false,
      enabled: false,
      hasBotToken: false,
      hasChatId: false,
      hasSharedSecret: false,
      hasRouterBotId: false,
      hasRouterConnectionId: false,
    };
  } else {
    const telegramSettings = response.telegramSettings || {};
    const botToken = String(telegramSettings.botToken || "").trim();
    const chatId = String(telegramSettings.chatId || "").trim();
    const sharedSecret = String(telegramSettings.sharedSecret || "").trim();
    const routerBotId = String(telegramSettings.routerBotId || "").trim();
    const routerConnectionId = String(
      telegramSettings.routerConnectionId || "",
    ).trim();
    response.telegramSettings = {
      ...telegramSettings,
      // Older rows have no targetUrl, so fall back to this software's own
      // receiver path. The router host is deliberately never used here.
      targetUrl:
        String(telegramSettings.targetUrl || "").trim() ||
        "https://billing.maxcode.in/api/telegram-hook",
      targetUrlEdited: telegramSettings.targetUrlEdited === true,
      botToken: maskSecretValue(botToken),
      chatId: maskSecretValue(chatId),
      sharedSecret: maskSecretValue(sharedSecret),
      routerBotId: maskSecretValue(routerBotId),
      routerConnectionId: maskSecretValue(routerConnectionId),
      hasBotToken: secretExists(botToken),
      hasChatId: secretExists(chatId),
      hasSharedSecret: secretExists(sharedSecret),
      hasRouterBotId: secretExists(routerBotId),
      hasRouterConnectionId: secretExists(routerConnectionId),
    };
  }

  if (!response.featureToggles || typeof response.featureToggles !== "object") {
    response.featureToggles = {
      projectCredentialsAccessControl: true,
      publicPaymentWhatsapp: true,
      telegramPaymentNotifications: false,
    };
  } else {
    response.featureToggles = sanitizeFeatureToggles(response.featureToggles);
  }

  return response;
};

const parseDataUrl = (dataUrl) => {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) return null;

  return {
    mimeType: match[1],
    data: match[2],
  };
};

// Save base64 image to assets collection and return short URL reference
const saveImageAsset = async (db, base64DataUrl, userId, field, event) => {
  if (!base64DataUrl || !base64DataUrl.startsWith("data:image/")) {
    return null;
  }

  try {
    const parsed = parseDataUrl(base64DataUrl);
    if (!parsed) return null;

    const assetsCollection = db.collection(ASSETS_COLLECTION);

    // Create asset document
    const assetDoc = {
      userId,
      field,
      mimeType: parsed.mimeType,
      data: parsed.data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await assetsCollection.insertOne(assetDoc);
    const assetId = result.insertedId.toString();

    // Return short URL reference
    const shortUrl = `${getBaseUrl(event)}/api/business-settings?assetId=${assetId}&field=${field}`;
    return shortUrl;
  } catch (error) {
    console.error("Error saving image asset:", error);
    return null;
  }
};

const getAssetParams = (event) => {
  const query = event.queryStringParameters || {};

  // Check for new assetId format
  if (query.assetId && query.field) {
    return {
      assetId: query.assetId,
      field: query.field,
      isNewFormat: true,
    };
  }

  if (query.id) {
    const parsed = parseAssetRef(query.id);
    if (parsed) {
      return parsed;
    }
  }

  if (query.assetId && query.field) {
    return {
      assetId: query.assetId,
      field: query.field,
    };
  }

  const path = event.path || "";
  const pathMatch = path.match(/\/business-settings\/asset\/([^/]+)\/([^/?]+)/);

  if (!pathMatch) {
    return { assetId: null, field: null };
  }

  return {
    assetId: decodeURIComponent(pathMatch[1]),
    field: decodeURIComponent(pathMatch[2]),
  };
};

async function handleAssetRequest(event, origin) {
  const assetParams = getAssetParams(event);
  const { assetId, field, isNewFormat } = assetParams;

  if (!assetId || !field || !IMAGE_FIELDS.includes(field)) {
    return createResponse(400,
      { error: "assetId and field are required" },
      origin, event);
  }

  const { db } = await connectToDatabase();

  // New format: assetId is from business_assets collection
  if (isNewFormat) {
    try {
      const assetObjectId = new ObjectId(assetId);
      const assetsCollection = db.collection(ASSETS_COLLECTION);
      const asset = await assetsCollection.findOne({ _id: assetObjectId });

      if (!asset || !asset.data) {
        return createResponse(404, { error: "Asset not found" }, origin, event);
      }

      return {
        statusCode: 200,
        headers: {
          "Content-Type": asset.mimeType || "image/png",
          "Cache-Control": "public, max-age=3600",
        },
        isBase64Encoded: true,
        body: asset.data,
      };
    } catch (error) {
      console.error("Error fetching asset:", error);
      return createResponse(404, { error: "Asset not found" }, origin, event);
    }
  }

  // Old format: assetId is settings ID (backward compatibility)
  let settingsId;
  try {
    settingsId = new ObjectId(assetId);
  } catch {
    return createResponse(400, { error: "Invalid assetId" }, origin, event);
  }

  const settingsCollection = db.collection(SETTINGS_COLLECTION);
  const settings = await settingsCollection.findOne({ _id: settingsId });
  const assetValue = settings?.[field];

  if (!assetValue) {
    return createResponse(404, { error: "Asset not found" }, origin, event);
  }

  if (typeof assetValue === "string" && assetValue.startsWith("data:image/")) {
    const parsed = parseDataUrl(assetValue);

    if (!parsed) {
      return createResponse(400, { error: "Invalid image data" }, origin, event);
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": parsed.mimeType,
        "Cache-Control": "public, max-age=60",
      },
      isBase64Encoded: true,
      body: parsed.data,
    };
  }

  if (isManagedBusinessAssetUrl(assetValue)) {
    const currentRef = `${assetId}.${FIELD_TO_INDEX[field]}`;
    const nested = parseManagedAssetUrl(assetValue);
    const nestedRef = nested
      ? `${nested.assetId}.${FIELD_TO_INDEX[nested.field]}`
      : "";

    if (nestedRef === currentRef) {
      return createResponse(404,
        {
          error: "Asset data not found. Please upload image again and save.",
        },
        origin, event);
    }

    if (
      nested?.assetId &&
      nested?.field &&
      IMAGE_FIELDS.includes(nested.field)
    ) {
      const nestedSettings = await settingsCollection.findOne({
        _id: new ObjectId(nested.assetId),
      });
      const nestedValue = nestedSettings?.[nested.field];

      if (
        typeof nestedValue === "string" &&
        nestedValue.startsWith("data:image/")
      ) {
        const parsed = parseDataUrl(nestedValue);

        if (!parsed) {
          return createResponse(400, { error: "Invalid image data" }, origin, event);
        }

        return {
          statusCode: 200,
          headers: {
            "Content-Type": parsed.mimeType,
            "Cache-Control": "public, max-age=60",
          },
          isBase64Encoded: true,
          body: parsed.data,
        };
      }
    }
  }

  const redirectUrl = normalizeHttpsUrl(assetValue);

  if (
    !redirectUrl.startsWith("https://") &&
    !redirectUrl.startsWith("http://")
  ) {
    return createResponse(400, { error: "Invalid asset URL" }, origin, event);
  }

  return {
    statusCode: 302,
    headers: {
      Location: redirectUrl,
      "Cache-Control": "public, max-age=60",
    },
    body: "",
  };
}

export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === "OPTIONS") {
    return createResponse(200, {}, origin, event);
  }

  try {
    const { assetId, field } = getAssetParams(event);

    if (event.httpMethod === "GET" && assetId && field) {
      return await handleAssetRequest(event, origin);
    }

    if (event.httpMethod === "GET") {
      const query = event.queryStringParameters || {};
      const action = String(query.action || "")
        .trim()
        .toLowerCase();

      if (action === "login-config") {
        if (
          loginConfigCache &&
          loginConfigCacheExpiresAt > Date.now()
        ) {
          return createResponse(200,
            loginConfigCache,
            origin,
            {
              "Cache-Control": `public, max-age=${Math.floor(
                LOGIN_CONFIG_CACHE_TTL_MS / 1000,
              )}`,
            }, event);
        }

        const envTurnstileConfig = getTurnstileConfigFromEnv();
        if (
          envTurnstileConfig.siteKey &&
          envTurnstileConfig.secretKey &&
          envTurnstileConfig.loginCaptchaEnabled !== null
        ) {
          const loginConfig = {
            featureToggles: {
              cloudflareLoginCaptcha: envTurnstileConfig.loginCaptchaEnabled,
            },
            cloudflareSettings: {
              turnstileSiteKey: envTurnstileConfig.siteKey,
            },
          };

          loginConfigCache = loginConfig;
          loginConfigCacheExpiresAt = Date.now() + LOGIN_CONFIG_CACHE_TTL_MS;

          return createResponse(200, loginConfig, origin, {
            "Cache-Control": `public, max-age=${Math.floor(
              LOGIN_CONFIG_CACHE_TTL_MS / 1000,
            )}`,
          }, event);
        }

        const { db } = await connectToDatabase();
        const settingsCollection = db.collection(SETTINGS_COLLECTION);
        const settings = await getSharedSettings(settingsCollection, null);
        const featureToggles = sanitizeFeatureToggles(
          settings?.featureToggles || {},
        );
        const cloudflareSettings = settings?.cloudflareSettings || {};
        const turnstileSiteKey =
          envTurnstileConfig.siteKey ||
          decryptSecretFromStorage(
            String(cloudflareSettings.turnstileSiteKey || "").trim(),
          );
        const loginCaptchaEnabled =
          envTurnstileConfig.loginCaptchaEnabled ??
          Boolean(envTurnstileConfig.siteKey) ??
          featureToggles.cloudflareLoginCaptcha === true;

        const loginConfig = {
          featureToggles: {
            cloudflareLoginCaptcha: loginCaptchaEnabled,
          },
          cloudflareSettings: {
            turnstileSiteKey: String(turnstileSiteKey || "").trim(),
          },
        };

        loginConfigCache = loginConfig;
        loginConfigCacheExpiresAt = Date.now() + LOGIN_CONFIG_CACHE_TTL_MS;

        return createResponse(200, loginConfig, origin, {
          "Cache-Control": `public, max-age=${Math.floor(
            LOGIN_CONFIG_CACHE_TTL_MS / 1000,
          )}`,
        }, event);
      }
    }

    const user = verifyRequestToken(event);

    const { db } = await connectToDatabase();
    const settingsCollection = db.collection(SETTINGS_COLLECTION);

    if (event.httpMethod === "GET") {
      const query = event.queryStringParameters || {};
      const action = String(query.action || "")
        .trim()
        .toLowerCase();
      const settings = await getSharedSettings(settingsCollection, user.userId);

      if (action === "terms-by-version") {
        const termsKind = String(query.termsKind || "").trim();
        const version = String(query.version || "").trim();

        if (!termsKind || !version || !TERMS_SETTINGS_CONFIG[termsKind]) {
          return createResponse(400,
            { error: "termsKind and valid version are required" },
            origin, event);
        }

        const resolved = await getTermsForVersion(db, { termsKind, version });

        if (!resolved) {
          return createResponse(404,
            { error: "Terms version not found" },
            origin, event);
        }

        return createResponse(200, resolved, origin, event);
      }

      // Payment method charge history — lets an old pricing version be
      // inspected after the live rates have moved on.
      if (action === "payment-method-charges-history") {
        const versions = await listChargeVersions(db, {
          limit: query.limit,
        });

        return createResponse(200,
          {
            currentVersion: normalizeChargeVersion(
              settings?.[PAYMENT_CHARGE_VERSION_FIELD],
            ),
            versions: versions.map((doc) => ({
              version: doc.version,
              charges: Array.isArray(doc.charges) ? doc.charges : [],
              createdAt: doc.createdAt || null,
              updatedAt: doc.updatedAt || null,
            })),
          },
          origin, event);
      }

      if (action === "payment-method-charges-by-version") {
        const version = String(query.version || "").trim();

        if (!version) {
          return createResponse(400,
            { error: "version is required" },
            origin, event);
        }

        const resolved = await getChargesForVersion(db, version);

        if (!resolved) {
          return createResponse(404,
            { error: "Payment method charge version not found" },
            origin, event);
        }

        return createResponse(200, resolved, origin, event);
      }

      if (action === "reveal-secret") {
        // Decrypted integration secrets (bot token, WhatsApp token, storage
        // password, Drive refresh token) are super-admin-only, matching the
        // PUT restriction on changing them.
        if (!isSuperAdminRole(user?.role)) {
          return createResponse(403,
            { error: "Only Super Admin can reveal secret values" },
            origin, event);
        }

        const scope = String(query.scope || "").trim();
        const field = String(query.field || "").trim();

        if (!scope || !field) {
          return createResponse(400,
            { error: "scope and field are required" },
            origin, event);
        }

        const scopeValue = settings?.[scope];
        if (!scopeValue || typeof scopeValue !== "object") {
          return createResponse(404, { error: "Settings not found" }, origin, event);
        }

        const allowedFieldsByScope = {
          backupSettings: BACKUP_SECRET_FIELDS,
          cloudflareSettings: CLOUDFLARE_SECRET_FIELDS,
          whatsappSettings: WHATSAPP_SECRET_FIELDS,
          telegramSettings: TELEGRAM_SECRET_FIELDS,
        };

        const allowedFields = allowedFieldsByScope[scope] || [];
        if (!allowedFields.includes(field)) {
          return createResponse(400, { error: "Invalid secret field" }, origin, event);
        }

        try {
          const encryptedValue = String(scopeValue[field] || "").trim();
          const value = decryptSecretFromStorage(encryptedValue);

          // Move old-key ciphertext onto the current key so a rotated
          // CREDENTIALS_ENCRYPTION_KEY can be dropped without data loss.
          try {
            const rotatedValue = rotateEncryptedSecret(encryptedValue);
            if (
              rotatedValue &&
              rotatedValue !== encryptedValue &&
              settings?._id
            ) {
              await settingsCollection.updateOne(
                { _id: settings._id },
                {
                  $set: {
                    [`${scope}.${field}`]: rotatedValue,
                    updatedAt: new Date(),
                  },
                },
              );
            }
          } catch (rotationError) {
            console.error(
              "[business-settings] secret rotation failed:",
              rotationError?.message || rotationError,
            );
          }

          return createResponse(200, { success: true, value }, origin, event);
        } catch (error) {
          // The real cause used to be swallowed here, which made a wrong
          // CREDENTIALS_ENCRYPTION_KEY look identical to any other failure.
          // Surfacing the reason lets the user tell "bad key" apart from
          // "value was never encrypted".
          console.error("[business-settings] reveal-secret failed", {
            scope,
            field,
            reason: error?.message || String(error),
          });
          return createResponse(500,
            {
              error: "Unable to reveal secret value",
              reason: error?.message || "unknown decryption error",
            },
            origin, event);
        }
      }

      const cachedSettingsResponse = getCachedSettingsResponse(user.userId);
      if (cachedSettingsResponse) {
        return createResponse(200, cachedSettingsResponse, origin, event);
      }

      const settingsResponse = {
        settings: mapSettingsForClient(settings, event),
      };
      setCachedSettingsResponse(user.userId, settingsResponse);

      return createResponse(200, settingsResponse, origin, event);
    }

    if (event.httpMethod === "PUT") {
      if (!isSuperAdminRole(user?.role)) {
        return createResponse(403,
          {
            error:
              "Only Super Admin can update business settings. These settings are shared for all users.",
          },
          origin, event);
      }

      // Settings changed — drop the cached GET response so the next read
      // reflects the update immediately.
      invalidateSettingsCache();

      const payload = event.body ? JSON.parse(event.body) : {};

      // Never log the incoming payload here: it carries unmasked secret
      // values before sanitisation, and function logs are broadly readable.

      const existingSharedSettings = await getSharedSettings(
        settingsCollection,
        user.userId,
      );

      const sanitizedPayload = sanitizeSettingsPayload(
        payload,
        existingSharedSettings || {},
      );

      console.log(
        "[BUSINESS-SETTINGS PUT] Sanitized payload featureToggles:",
        sanitizedPayload.featureToggles,
      );

      Object.entries(TERMS_SETTINGS_CONFIG).forEach(([, config]) => {
        const hasIncomingTerms = Object.prototype.hasOwnProperty.call(
          sanitizedPayload,
          config.settingsField,
        );

        const currentTermsValue = getFirstDefinedValue(
          existingSharedSettings || {},
          config.settingsAliases,
        );

        const incomingTermsValue = hasIncomingTerms
          ? sanitizedPayload[config.settingsField]
          : currentTermsValue;

        const nextVersion = computeNextTermsVersion({
          incomingValue: incomingTermsValue,
          existingValue: currentTermsValue,
          incomingVersion: sanitizedPayload[config.versionField],
          existingVersion: existingSharedSettings?.[config.versionField],
        });

        sanitizedPayload[config.versionField] = nextVersion;
      });

      for (const [termsKind, config] of Object.entries(TERMS_SETTINGS_CONFIG)) {
        const selectedTermsValue = Object.prototype.hasOwnProperty.call(
          sanitizedPayload,
          config.settingsField,
        )
          ? sanitizedPayload[config.settingsField]
          : getFirstDefinedValue(
              existingSharedSettings || {},
              config.settingsAliases,
            );

        const versionValue = sanitizedPayload[config.versionField];

        await upsertTermsVersionDocument(db, {
          termsKind,
          version: versionValue,
          terms: selectedTermsValue,
        });
      }

      // Payment method charges are versioned the same way as terms: a change
      // in any rate creates a new version, and invoices bind to the version
      // they were issued under so old pricing is never overwritten.
      if (
        Object.prototype.hasOwnProperty.call(
          sanitizedPayload,
          "paymentMethodCharges",
        )
      ) {
        const nextChargeVersion = await resolveChargeVersionForSave(db, {
          incomingCharges: sanitizedPayload.paymentMethodCharges,
          existingCharges: existingSharedSettings?.paymentMethodCharges,
          existingVersion:
            existingSharedSettings?.[PAYMENT_CHARGE_VERSION_FIELD],
        });

        sanitizedPayload[PAYMENT_CHARGE_VERSION_FIELD] = nextChargeVersion;
      } else if (existingSharedSettings?.[PAYMENT_CHARGE_VERSION_FIELD]) {
        // An unrelated save must not drop the pointer.
        sanitizedPayload[PAYMENT_CHARGE_VERSION_FIELD] =
          existingSharedSettings[PAYMENT_CHARGE_VERSION_FIELD];
      }

      // Process base64 images and convert to short URL references
      const assetsCollection = db.collection(ASSETS_COLLECTION);
      for (const field of IMAGE_FIELDS) {
        if (
          sanitizedPayload[field] &&
          typeof sanitizedPayload[field] === "string" &&
          sanitizedPayload[field].startsWith("data:image/")
        ) {
          const shortUrl = await saveImageAsset(
            db,
            sanitizedPayload[field],
            user.userId,
            field,
            event,
          );
          if (shortUrl) {
            sanitizedPayload[field] = shortUrl;
          }
        }
      }

      const baseUpdate = {
        ...sanitizedPayload,
        scope: GLOBAL_SETTINGS_SCOPE,
        userId: user.userId,
        updatedByUserId: user.userId,
        updatedByRole: user.role || "",
        updatedAt: new Date(),
      };

      console.log(
        "[BUSINESS-SETTINGS PUT] baseUpdate featureToggles:",
        baseUpdate.featureToggles,
      );

      let updated = null;

      if (existingSharedSettings?._id) {
        await settingsCollection.updateOne(
          { _id: existingSharedSettings._id },
          {
            $set: baseUpdate,
            $setOnInsert: {
              createdAt: new Date(),
              createdByUserId: user.userId,
            },
          },
        );

        updated = await settingsCollection.findOne({
          _id: existingSharedSettings._id,
        });
      } else {
        const insertResult = await settingsCollection.insertOne({
          ...baseUpdate,
          createdAt: new Date(),
          createdByUserId: user.userId,
        });

        updated = await settingsCollection.findOne({
          _id: insertResult.insertedId,
        });
      }

      loginConfigCache = null;
      loginConfigCacheExpiresAt = 0;

      console.log(
        "[BUSINESS-SETTINGS PUT] Updated document featureToggles:",
        updated?.featureToggles,
      );

      const clientSettings = mapSettingsForClient(updated, event);
      console.log(
        "[BUSINESS-SETTINGS PUT] Response featureToggles:",
        clientSettings.featureToggles,
      );

      // Auto-register the Telegram webhook whenever Telegram is enabled.
      // Failures are isolated so saving settings never breaks.
      let telegramWebhook = { success: false, skipped: true };
      try {
        telegramWebhook = await ensureTelegramWebhook({
          db,
          baseUrl: getBaseUrl(event),
        });
      } catch (webhookError) {
        console.error("Telegram webhook auto-register failed:", webhookError);
        telegramWebhook = {
          success: false,
          error: webhookError?.message || "Webhook registration failed",
        };
      }

      return createResponse(200,
        {
          message: "Business settings saved successfully",
          settings: clientSettings,
          telegramWebhook,
        },
        origin, event);
    }

    return createResponse(405, { error: "Method not allowed" }, origin, event);
  } catch (error) {
    console.error("Business settings API error:", error);

    if (error.name === "SettingsValidationError" || error.statusCode === 400) {
      return createResponse(400,
        {
          error: error.message,
        },
        origin, event);
    }

    if (error.message.includes("token") || error.message.includes("Token")) {
      return createResponse(401, { error: "Unauthorized" }, origin, event);
    }

    return createResponse(500,
      {
        error: "Internal server error",
        message: error.message,
      },
      origin, event);
  }
}
