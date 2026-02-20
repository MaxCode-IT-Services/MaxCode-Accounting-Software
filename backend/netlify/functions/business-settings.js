import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { verifyRequestToken } from "./utils/auth.js";
import { ObjectId } from "mongodb";

const SETTINGS_COLLECTION = "business_settings";
const ASSETS_COLLECTION = "business_assets";

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
  "selfInvoiceTermsConditions",
  "services",
  "backupSettings",
];

const sanitizeBackupSettings = (value = {}) => {
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
    clientId: typeof value.clientId === "string" ? value.clientId.trim() : "",
    clientSecret:
      typeof value.clientSecret === "string" ? value.clientSecret.trim() : "",
    refreshToken:
      typeof value.refreshToken === "string" ? value.refreshToken.trim() : "",
    backupApiKey:
      typeof value.backupApiKey === "string" ? value.backupApiKey.trim() : "",
    folderId: typeof value.folderId === "string" ? value.folderId.trim() : "",
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

const sanitizeSettingsPayload = (payload = {}) => {
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
      } else if (field === "backupSettings") {
        const sanitizedBackupSettings = sanitizeBackupSettings(value);
        if (sanitizedBackupSettings) {
          sanitized[field] = sanitizedBackupSettings;
        }
      } else {
        sanitized[field] = value;
      }
    }
  }

  return sanitized;
};

const mapSettingsForClient = (document, event) => {
  if (!document) return null;

  const response = {};

  for (const field of ALLOWED_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(document, field)) continue;

    const value = document[field];

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

  if (
    !Object.prototype.hasOwnProperty.call(response, "gstin") &&
    typeof document.GSTIN === "string"
  ) {
    response.gstin = document.GSTIN;
  }

  if (
    !Object.prototype.hasOwnProperty.call(response, "gstin") &&
    typeof document.companyGstin === "string"
  ) {
    response.gstin = document.companyGstin;
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
    return createResponse(
      400,
      { error: "assetId and field are required" },
      origin,
    );
  }

  const { db } = await connectToDatabase();

  // New format: assetId is from business_assets collection
  if (isNewFormat) {
    try {
      const assetObjectId = new ObjectId(assetId);
      const assetsCollection = db.collection(ASSETS_COLLECTION);
      const asset = await assetsCollection.findOne({ _id: assetObjectId });

      if (!asset || !asset.data) {
        return createResponse(404, { error: "Asset not found" }, origin);
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
      return createResponse(404, { error: "Asset not found" }, origin);
    }
  }

  // Old format: assetId is settings ID (backward compatibility)
  let settingsId;
  try {
    settingsId = new ObjectId(assetId);
  } catch {
    return createResponse(400, { error: "Invalid assetId" }, origin);
  }

  const settingsCollection = db.collection(SETTINGS_COLLECTION);
  const settings = await settingsCollection.findOne({ _id: settingsId });
  const assetValue = settings?.[field];

  if (!assetValue) {
    return createResponse(404, { error: "Asset not found" }, origin);
  }

  if (typeof assetValue === "string" && assetValue.startsWith("data:image/")) {
    const parsed = parseDataUrl(assetValue);

    if (!parsed) {
      return createResponse(400, { error: "Invalid image data" }, origin);
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
      return createResponse(
        404,
        {
          error: "Asset data not found. Please upload image again and save.",
        },
        origin,
      );
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
          return createResponse(400, { error: "Invalid image data" }, origin);
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
    return createResponse(400, { error: "Invalid asset URL" }, origin);
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
    return createResponse(200, {}, origin);
  }

  try {
    const { assetId, field } = getAssetParams(event);

    if (event.httpMethod === "GET" && assetId && field) {
      return await handleAssetRequest(event, origin);
    }

    const user = verifyRequestToken(event);

    const { db } = await connectToDatabase();
    const settingsCollection = db.collection(SETTINGS_COLLECTION);

    if (event.httpMethod === "GET") {
      const settings = await settingsCollection.findOne({
        userId: user.userId,
      });

      return createResponse(
        200,
        {
          settings: mapSettingsForClient(settings, event),
        },
        origin,
      );
    }

    if (event.httpMethod === "PUT") {
      const payload = event.body ? JSON.parse(event.body) : {};
      const sanitizedPayload = sanitizeSettingsPayload(payload);
      const isServicesOnlyUpdate =
        Object.keys(payload).length === 1 &&
        Object.prototype.hasOwnProperty.call(payload, "services");

      if (
        !isServicesOnlyUpdate &&
        !Object.prototype.hasOwnProperty.call(sanitizedPayload, "gstin")
      ) {
        sanitizedPayload.gstin = "";
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

      await settingsCollection.updateOne(
        { userId: user.userId },
        {
          $set: {
            ...sanitizedPayload,
            userId: user.userId,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            createdAt: new Date(),
          },
        },
        { upsert: true },
      );

      const updated = await settingsCollection.findOne({ userId: user.userId });

      return createResponse(
        200,
        {
          message: "Business settings saved successfully",
          settings: mapSettingsForClient(updated, event),
        },
        origin,
      );
    }

    return createResponse(405, { error: "Method not allowed" }, origin);
  } catch (error) {
    console.error("Business settings API error:", error);

    if (error.message.includes("token") || error.message.includes("Token")) {
      return createResponse(401, { error: "Unauthorized" }, origin);
    }

    return createResponse(
      500,
      {
        error: "Internal server error",
        message: error.message,
      },
      origin,
    );
  }
}
