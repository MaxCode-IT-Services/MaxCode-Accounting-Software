import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { verifyRequestToken } from "./utils/auth.js";
import { serialize, deserialize } from "bson";
import { decryptSecretFromStorage } from "./utils/secret-crypto.js";

/**
 * Backup API Endpoint
 * - GET: Export backup data (supports JWT auth or X-API-Key auth)
 *   - Supports both JSON and BSON formats based on Accept header
 * - POST action=restore: Restore backup data (JWT required)
 * - POST action=test-drive-config: Test Google Drive connection (JWT required)
 * - POST action=run-now: Create a backup snapshot and upload to Drive (JWT required)
 * - POST action=run-automated: Scheduled backup run via GitHub Actions (API Key required)
 */

const DEFAULT_BACKUP_COLLECTIONS = [
  "users",
  "clients",
  "vendors",
  "staff",
  "invoices",
  "purchases",
  "rcm",
  "projects",
  "services",
  "financialYears",
  "company_expenses",
  "business_settings",
  "business_assets",
  "backup_runs",
];

const GLOBAL_SETTINGS_SCOPE = "global";

const getSharedBusinessSettings = async (db, fallbackUserId) => {
  const collection = db.collection("business_settings");

  const globalSettings = await collection.findOne({
    scope: GLOBAL_SETTINGS_SCOPE,
  });

  if (globalSettings) {
    return globalSettings;
  }

  if (fallbackUserId) {
    const userSettings = await collection.findOne({ userId: fallbackUserId });
    if (userSettings) {
      return userSettings;
    }
  }

  return collection.findOne(
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

const getDynamicCollectionNames = async (db) => {
  try {
    const allCollections = await db
      .listCollections({}, { nameOnly: true })
      .toArray();

    const collectionNames = allCollections
      .map((item) => item?.name)
      .filter(
        (name) =>
          typeof name === "string" &&
          name.length > 0 &&
          !name.startsWith("system."),
      );

    if (collectionNames.length === 0) {
      throw new Error("No user collections found for backup");
    }

    return collectionNames;
  } catch (error) {
    throw new Error(
      `Failed to discover collections for backup: ${error?.message || "Unknown error"}`,
    );
  }
};

const toTrimmedString = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

const SECRET_MASK = "********";

const isMaskedSecretValue = (value = "") =>
  String(value || "").trim() === SECRET_MASK;

const maskSecretValue = (value = "") => {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  return SECRET_MASK;
};

const maskDriveConfigForResponse = (config = {}) => {
  if (!config || typeof config !== "object") {
    return {
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
  }

  const clientId = toTrimmedString(config.clientId);
  const clientSecret = toTrimmedString(config.clientSecret);
  const refreshToken = toTrimmedString(config.refreshToken);
  const backupApiKey = toTrimmedString(config.backupApiKey);
  const folderId = toTrimmedString(config.folderId);

  return {
    enabled: Boolean(config.enabled),
    frequency: toTrimmedString(config.frequency) || "daily",
    backupTime: toTrimmedString(config.backupTime) || "20:00",
    everyHours: Number.parseInt(config.everyHours, 10) || 4,
    dayOfWeek: toTrimmedString(config.dayOfWeek) || "monday",
    dayOfMonth: Number.parseInt(config.dayOfMonth, 10) || 1,
    monthOfYear: Number.parseInt(config.monthOfYear, 10) || 1,
    timezone: toTrimmedString(config.timezone) || "Asia/Kolkata",
    clientId: maskSecretValue(clientId),
    clientSecret: maskSecretValue(clientSecret),
    refreshToken: maskSecretValue(refreshToken),
    backupApiKey: maskSecretValue(backupApiKey),
    folderId: maskSecretValue(folderId),
    hasClientId: Boolean(clientId) && !isMaskedSecretValue(clientId),
    hasClientSecret:
      Boolean(clientSecret) && !isMaskedSecretValue(clientSecret),
    hasRefreshToken:
      Boolean(refreshToken) && !isMaskedSecretValue(refreshToken),
    hasBackupApiKey:
      Boolean(backupApiKey) && !isMaskedSecretValue(backupApiKey),
    hasFolderId: Boolean(folderId) && !isMaskedSecretValue(folderId),
  };
};

const normalizeDriveConfigSecrets = (config = {}) => {
  if (!config || typeof config !== "object") {
    return {};
  }

  const decryptOrEmpty = (value) => {
    const normalized = toTrimmedString(value);
    if (!normalized || isMaskedSecretValue(normalized)) return "";
    return decryptSecretFromStorage(normalized);
  };

  return {
    ...config,
    clientId: decryptOrEmpty(config.clientId),
    clientSecret: decryptOrEmpty(config.clientSecret),
    refreshToken: decryptOrEmpty(config.refreshToken),
    backupApiKey: decryptOrEmpty(config.backupApiKey),
    folderId: decryptOrEmpty(config.folderId),
  };
};

const mergeDriveConfigWithStored = (incoming = {}, stored = {}) => {
  const incomingConfig =
    incoming && typeof incoming === "object" ? incoming : {};
  const storedConfig = stored && typeof stored === "object" ? stored : {};

  const mergeSecret = (field) => {
    const incomingValue = toTrimmedString(incomingConfig[field]);
    const storedValue = toTrimmedString(storedConfig[field]);

    if (isMaskedSecretValue(incomingValue)) {
      return storedValue;
    }

    return incomingValue || storedValue;
  };

  return {
    ...storedConfig,
    ...incomingConfig,
    clientId: mergeSecret("clientId"),
    clientSecret: mergeSecret("clientSecret"),
    refreshToken: mergeSecret("refreshToken"),
    backupApiKey: mergeSecret("backupApiKey"),
    folderId: mergeSecret("folderId"),
  };
};

const getApiKeyFromRequest = (event) =>
  event.headers["x-api-key"] || event.headers["X-API-Key"];

const hasValidBackupApiKey = (event) => {
  const backupApiKey = process.env.BACKUP_API_KEY;
  const requestApiKey = getApiKeyFromRequest(event);

  if (!backupApiKey || !requestApiKey) {
    return false;
  }

  return requestApiKey === backupApiKey;
};

const validateJwtAccess = (event) => {
  const decoded = verifyRequestToken(event);
  if (!decoded?.userId) {
    throw new Error("Unauthorized");
  }
  return decoded;
};

const buildBackupPayload = async (db) => {
  const collectionNames = await getDynamicCollectionNames(db);
  const failedCollections = [];
  const collectionStats = {};

  const backupData = {
    metadata: {
      timestamp: new Date().toISOString(),
      version: "1.2",
      source: "MaxCode Invoice Software",
      collectionNames,
      strictMode: true,
    },
    collections: {},
  };

  for (const collectionName of collectionNames) {
    try {
      const collection = db.collection(collectionName);
      const data = await collection.find({}).toArray();
      backupData.collections[collectionName] = data;
      collectionStats[collectionName] = Array.isArray(data) ? data.length : 0;
    } catch (error) {
      failedCollections.push({
        collection: collectionName,
        error: error?.message || "Unknown error",
      });
      backupData.collections[collectionName] = [];
      collectionStats[collectionName] = 0;
    }
  }

  backupData.metadata.collectionStats = collectionStats;
  backupData.metadata.failedCollections = failedCollections;

  if (failedCollections.length > 0) {
    const failedNames = failedCollections
      .map((item) => item.collection)
      .join(", ");
    throw new Error(
      `Backup incomplete. Failed collections: ${failedNames}. Please fix and retry.`,
    );
  }

  return backupData;
};

const getBackupStats = (backupData) => {
  const totalRecords = Object.values(backupData.collections || {}).reduce(
    (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
    0,
  );

  return {
    totalRecords,
    collections: Object.keys(backupData.collections || {}).length,
    timestamp: backupData?.metadata?.timestamp || new Date().toISOString(),
    collectionStats: backupData?.metadata?.collectionStats || {},
    failedCollections: backupData?.metadata?.failedCollections || [],
  };
};

const normalizeBackupCollections = (inputCollections = {}) => {
  const sourceCollections = { ...inputCollections };

  if (
    !sourceCollections.financialYears &&
    Array.isArray(sourceCollections.years)
  ) {
    sourceCollections.financialYears = sourceCollections.years;
  }

  if (
    !sourceCollections.business_settings &&
    Array.isArray(sourceCollections.businessSettings)
  ) {
    sourceCollections.business_settings = sourceCollections.businessSettings;
  }

  const normalized = {};

  const collectionNames = [
    ...new Set([
      ...Object.keys(sourceCollections),
      ...DEFAULT_BACKUP_COLLECTIONS,
      "financialYears",
      "business_settings",
    ]),
  ].filter(
    (name) =>
      typeof name === "string" &&
      name.length > 0 &&
      !name.startsWith("system."),
  );

  for (const collectionName of collectionNames) {
    const value = sourceCollections[collectionName];
    normalized[collectionName] = Array.isArray(value) ? value : [];
  }

  return normalized;
};

const UNDO_BACKUP_COLLECTION = "undo_import_backup";
const UNDO_BACKUP_EXPIRY_HOURS = 30 * 24; // 30 days

const restoreBackupData = async (db, backupData, userId) => {
  // 1. Take a snapshot of current data for undo (before restore)
  const currentData = await buildBackupPayload(db);
  const undoBackup = {
    createdAt: new Date(),
    userId: userId || null,
    data: currentData,
  };
  // Remove any previous undo backup for this user
  // Always assign _id as ObjectId for undo backup
  await db.collection(UNDO_BACKUP_COLLECTION).deleteMany({ userId });
  await db.collection(UNDO_BACKUP_COLLECTION).insertOne({
    ...undoBackup,
    _id: new (await import("mongodb")).ObjectId(),
  });

  // 2. Restore the new backup
  const normalizedCollections = normalizeBackupCollections(
    backupData?.collections || {},
  );
  const collectionNames = Object.keys(normalizedCollections);
  for (const collectionName of collectionNames) {
    const collection = db.collection(collectionName);
    const documents = normalizedCollections[collectionName].filter(
      (doc) => doc && typeof doc === "object",
    );
    await collection.deleteMany({});
    if (documents.length > 0) {
      await collection.insertMany(documents, { ordered: false });
    }
  }
  return {
    metadata: {
      timestamp: new Date().toISOString(),
      restoredFrom: backupData?.metadata?.timestamp || null,
    },
    collections: normalizedCollections,
  };
};

const validateDriveConfigPayload = (config = {}) => {
  const enabled = Boolean(config.enabled);

  if (!enabled) {
    return { valid: true };
  }

  const required = ["clientId", "clientSecret", "refreshToken", "backupApiKey"];
  const missing = required.filter((field) => !toTrimmedString(config[field]));

  if (missing.length > 0) {
    return {
      valid: false,
      error: `Missing required fields: ${missing.join(", ")}`,
    };
  }

  const validFrequencies = [
    "daily",
    "weekly",
    "monthly",
    "yearly",
    "every_4_hours",
    "manual",
  ];

  const frequency = toTrimmedString(config.frequency) || "daily";
  if (!validFrequencies.includes(frequency)) {
    return {
      valid: false,
      error: "Invalid schedule frequency",
    };
  }

  return { valid: true };
};

/**
 * Exchange refresh token for access token
 * @param {Object} driveConfig
 * @returns {Promise<string>}
 */
const getGoogleAccessToken = async (driveConfig) => {
  try {
    const params = new URLSearchParams({
      client_id: toTrimmedString(driveConfig.clientId),
      client_secret: toTrimmedString(driveConfig.clientSecret),
      refresh_token: toTrimmedString(driveConfig.refreshToken),
      grant_type: "refresh_token",
    });

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    const responseText = await tokenResponse.text();
    let tokenPayload;

    try {
      tokenPayload = JSON.parse(responseText);
    } catch (parseError) {
      throw new Error("Invalid JSON from token endpoint");
    }

    if (!tokenResponse.ok || !tokenPayload?.access_token) {
      throw new Error(
        tokenPayload?.error_description ||
          tokenPayload?.error ||
          "Unable to fetch Google access token",
      );
    }

    return tokenPayload.access_token;
  } catch (error) {
    throw new Error(`Token refresh failed: ${error.message}`);
  }
};

/**
 * Upload backup data to Google Drive
 * @param {Object} driveConfig - Google Drive configuration
 * @param {Object} backupData - Backup data to upload
 * @param {string} trigger - Trigger type (manual/automated)
 * @returns {Promise<Object>} Upload result with fileId and fileUrl
 */
const uploadToGoogleDrive = async (
  driveConfig,
  backupData,
  trigger = "manual",
) => {
  try {
    const accessToken = await getGoogleAccessToken(driveConfig);

    // Keep a single rolling backup file (overwrite on each run)
    const fileName = "maxcode-backup-latest.bson";

    // Convert backup data to BSON buffer
    const bsonBuffer = serialize(backupData);

    const escapedName = fileName.replace(/'/g, "\\'");
    const folderFilter =
      driveConfig.folderId && driveConfig.folderId.trim()
        ? ` and '${driveConfig.folderId.trim()}' in parents`
        : "";
    const searchQuery = `name='${escapedName}' and trashed=false${folderFilter}`;

    const searchResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(searchQuery)}&fields=files(id,name,webViewLink,size)&pageSize=1`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    const searchPayload = await searchResponse.json().catch(() => ({}));
    if (!searchResponse.ok) {
      throw new Error(
        searchPayload?.error?.message ||
          "Failed to search existing backup file",
      );
    }

    const existingFileId = searchPayload?.files?.[0]?.id;

    const uploadUrl = existingFileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existingFileId)}?uploadType=multipart&fields=id,name,webViewLink,size`
      : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,size";

    const uploadMethod = existingFileId ? "PATCH" : "POST";

    const fileMetadata = {
      name: fileName,
      mimeType: "application/octet-stream",
    };

    if (
      !existingFileId &&
      driveConfig.folderId &&
      driveConfig.folderId.trim()
    ) {
      fileMetadata.parents = [driveConfig.folderId.trim()];
    }

    const boundary = `maxcode_backup_boundary_${Date.now()}`;
    const multipartBody =
      `--${boundary}\r\n` +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      `${JSON.stringify(fileMetadata)}\r\n` +
      `--${boundary}\r\n` +
      "Content-Type: application/octet-stream\r\n\r\n";

    // Combine metadata and BSON data
    const metadataPart = Buffer.from(multipartBody, "utf-8");
    const closingBoundary = Buffer.from(`\r\n--${boundary}--`);

    const uploadBody = Buffer.concat([
      metadataPart,
      bsonBuffer,
      closingBoundary,
    ]);

    const uploadResponse = await fetch(uploadUrl, {
      method: uploadMethod,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: uploadBody,
    });

    // Check if response is OK before trying to parse JSON
    const responseText = await uploadResponse.text();
    let response;

    try {
      response = JSON.parse(responseText);
    } catch (parseError) {
      throw new Error("Invalid JSON response from Google Drive");
    }

    if (!uploadResponse.ok || !response?.id) {
      throw new Error(
        response?.error?.message ||
          response?.error_description ||
          `Google Drive file upload failed with status ${uploadResponse.status}`,
      );
    }

    return {
      success: true,
      fileId: response.id,
      fileName: response.name,
      fileUrl: response.webViewLink,
      fileSize: response.size,
    };
  } catch (error) {
    throw new Error(`Google Drive upload failed: ${error.message}`);
  }
};

/**
 * Test Google Drive connection
 * @param {Object} driveConfig - Google Drive configuration
 * @returns {Promise<Object>} Test result
 */
const testGoogleDriveConnection = async (driveConfig) => {
  try {
    const accessToken = await getGoogleAccessToken(driveConfig);

    const aboutResponse = await fetch(
      "https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName),storageQuota",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );

    const about = await aboutResponse.json().catch(() => ({}));
    if (!aboutResponse.ok) {
      throw new Error(
        about?.error?.message || "Unable to fetch Drive user info",
      );
    }

    // If folderId is provided, verify it exists
    if (driveConfig.folderId && driveConfig.folderId.trim()) {
      const folderResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(driveConfig.folderId)}?fields=id,name`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (!folderResponse.ok) {
        const folderError = await folderResponse.json().catch(() => ({}));
        throw new Error(
          `Folder ID not found or not accessible: ${folderError?.error?.message || folderResponse.statusText}`,
        );
      }
    }

    return {
      success: true,
      user: about.user,
      storageQuota: about.storageQuota,
    };
  } catch (error) {
    throw new Error(`Drive connection test failed: ${error.message}`);
  }
};

export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin;

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return createResponse(200, {}, origin);
  }

  try {
    const method = event.httpMethod;
    const path = event.path || event.rawUrl || "";

    // Special endpoint for backup validation (used by auto-backup.js script)
    if (
      path.includes("validate-backup-settings") ||
      event.queryStringParameters?.validate === "settings"
    ) {
      const isApiKeyAuthorized = hasValidBackupApiKey(event);

      if (!isApiKeyAuthorized) {
        return createResponse(
          401,
          {
            error: "Unauthorized. Provide valid X-API-Key header.",
          },
          origin,
        );
      }

      const { db } = await connectToDatabase();
      const businessSettings = await getSharedBusinessSettings(db);
      const backupSettings = businessSettings?.backupSettings || {
        enabled: false,
        frequency: "daily",
      };

      return createResponse(
        200,
        {
          success: true,
          backupSettings: maskDriveConfigForResponse(backupSettings),
          timestamp: new Date().toISOString(),
        },
        origin,
      );
    }

    if (method === "GET") {
      const isApiKeyAuthorized = hasValidBackupApiKey(event);

      if (!isApiKeyAuthorized) {
        try {
          validateJwtAccess(event);
        } catch {
          return createResponse(
            401,
            {
              error: "Unauthorized. Provide valid Bearer token or X-API-Key.",
            },
            origin,
          );
        }
      }

      const { db } = await connectToDatabase();
      const backupData = await buildBackupPayload(db);
      const stats = getBackupStats(backupData);

      // Check Accept header to determine response format
      const acceptHeader = event.headers.accept || event.headers.Accept || "";

      if (acceptHeader.includes("application/json")) {
        // Return JSON format using createResponse (which handles CORS)
        return createResponse(
          200,
          {
            success: true,
            data: backupData,
            stats,
          },
          origin,
        );
      } else {
        // Return BSON format
        const bsonBuffer = serialize(backupData);

        return {
          statusCode: 200,
          headers: {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": true,
            "Content-Type": "application/octet-stream",
            "Content-Disposition": `attachment; filename="maxcode-backup-${new Date().toISOString().split("T")[0]}.bson"`,
          },
          body: bsonBuffer.toString("base64"),
          isBase64Encoded: true,
        };
      }
    }

    if (method === "POST") {
      const user = validateJwtAccess(event);
      const body = event.body ? JSON.parse(event.body) : {};
      const action = toTrimmedString(body.action).toLowerCase();

      if (!action) {
        return createResponse(400, { error: "Action is required" }, origin);
      }

      const { db } = await connectToDatabase();

      // --- Undo Import ---
      if (action === "undo-import") {
        // Find undo backup for this user (within 12 hours)
        const undoDoc = await db
          .collection(UNDO_BACKUP_COLLECTION)
          .findOne({ userId: user.userId });
        if (!undoDoc) {
          return createResponse(
            400,
            { error: "No undo backup available." },
            origin,
          );
        }
        const createdAt = new Date(undoDoc.createdAt);
        const now = new Date();
        const diffHours = (now - createdAt) / (1000 * 60 * 60);
        if (diffHours > UNDO_BACKUP_EXPIRY_HOURS) {
          // Expired, remove it
          await db
            .collection(UNDO_BACKUP_COLLECTION)
            .deleteOne({ _id: undoDoc._id });
          return createResponse(400, { error: "Undo period expired." }, origin);
        }
        // Restore the undo backup
        await restoreBackupData(db, undoDoc.data, user.userId);
        // Remove the undo backup after use
        // Ensure _id is ObjectId for delete
        const { ObjectId } = await import("mongodb");
        await db.collection(UNDO_BACKUP_COLLECTION).deleteOne({
          _id:
            typeof undoDoc._id === "string"
              ? new ObjectId(undoDoc._id)
              : undoDoc._id,
        });
        return createResponse(
          200,
          {
            success: true,
            message: "Import undone. Data restored to pre-import state.",
          },
          origin,
        );
      }

      // --- Check Undo Import Availability ---
      if (action === "check-undo-import") {
        const undoDoc = await db
          .collection(UNDO_BACKUP_COLLECTION)
          .findOne({ userId: user.userId });
        if (!undoDoc) {
          return createResponse(200, { available: false }, origin);
        }
        const createdAt = new Date(undoDoc.createdAt);
        const now = new Date();
        const diffHours = (now - createdAt) / (1000 * 60 * 60);
        if (diffHours > UNDO_BACKUP_EXPIRY_HOURS) {
          // Expired, remove it
          // Ensure _id is ObjectId for delete
          const { ObjectId } = await import("mongodb");
          await db.collection(UNDO_BACKUP_COLLECTION).deleteOne({
            _id:
              typeof undoDoc._id === "string"
                ? new ObjectId(undoDoc._id)
                : undoDoc._id,
          });
          return createResponse(200, { available: false }, origin);
        }
        return createResponse(
          200,
          {
            available: true,
            expiresAt: new Date(
              createdAt.getTime() + UNDO_BACKUP_EXPIRY_HOURS * 60 * 60 * 1000,
            ).toISOString(),
          },
          origin,
        );
      }

      if (action === "restore") {
        // Handle restore for both JSON and BSON formats
        let backupData;
        if (body.backupData && body.backupData._bsontype) {
          // Already parsed BSON object
          backupData = body.backupData;
        } else if (
          body.backupData &&
          typeof body.backupData === "string" &&
          body.backupData.startsWith("base64:")
        ) {
          // Handle base64 encoded BSON
          const base64Data = body.backupData.replace("base64:", "");
          const buffer = Buffer.from(base64Data, "base64");
          backupData = deserialize(buffer);
        } else if (body.backupData && typeof body.backupData === "object") {
          // Handle JSON format
          backupData = body.backupData;
        } else {
          return createResponse(
            400,
            {
              error:
                "Invalid backup file format. Please provide a valid backup file.",
            },
            origin,
          );
        }
        if (
          !backupData?.collections ||
          typeof backupData.collections !== "object"
        ) {
          return createResponse(
            400,
            { error: "Invalid backup file structure" },
            origin,
          );
        }
        const restorePayload = {
          ...backupData,
          collections: {
            ...(backupData.collections || {}),
            businessSettings:
              backupData.collections?.businessSettings ||
              backupData.businessSettings ||
              undefined,
          },
        };
        const restored = await restoreBackupData(
          db,
          restorePayload,
          user.userId,
        );
        const stats = getBackupStats(restored);
        return createResponse(
          200,
          {
            success: true,
            message: "Backup restored successfully",
            stats,
          },
          origin,
        );
      }

      if (action === "test-drive-config") {
        const businessSettings = await getSharedBusinessSettings(
          db,
          user.userId,
        );
        const storedDriveConfig = businessSettings?.backupSettings || {};
        const mergedDriveConfig = mergeDriveConfigWithStored(
          body.driveConfig || {},
          storedDriveConfig,
        );
        const resolvedDriveConfig =
          normalizeDriveConfigSecrets(mergedDriveConfig);

        const validation = validateDriveConfigPayload(resolvedDriveConfig);

        if (!validation.valid) {
          return createResponse(
            400,
            {
              success: false,
              error: validation.error,
            },
            origin,
          );
        }

        // Actually test the Google Drive connection
        try {
          const testResult =
            await testGoogleDriveConnection(resolvedDriveConfig);

          return createResponse(
            200,
            {
              success: true,
              message: "Google Drive connection successful",
              user: testResult.user,
            },
            origin,
          );
        } catch (error) {
          return createResponse(
            400,
            {
              success: false,
              error: error.message,
            },
            origin,
          );
        }
      }

      if (action === "run-now") {
        // Get backup settings from database
        const businessSettings = await getSharedBusinessSettings(
          db,
          user.userId,
        );

        const driveConfig = normalizeDriveConfigSecrets(
          businessSettings?.backupSettings,
        );

        // Check if Google Drive backup is enabled
        if (!driveConfig || !driveConfig.enabled) {
          // If Drive is not enabled, just create local backup
          const backupData = await buildBackupPayload(db);
          const stats = getBackupStats(backupData);

          await db.collection("backup_runs").insertOne({
            userId: user.userId,
            triggeredAt: new Date(),
            trigger: "manual",
            stats,
            status: "completed-local-only",
          });

          return createResponse(
            200,
            {
              success: true,
              message:
                "Manual backup completed (local only - Google Drive not enabled)",
              stats,
            },
            origin,
          );
        }

        // Create backup data
        const backupData = await buildBackupPayload(db);
        const stats = getBackupStats(backupData);

        // Upload to Google Drive
        try {
          const uploadResult = await uploadToGoogleDrive(
            driveConfig,
            backupData,
            "manual",
          );

          // Save backup run record with Drive info
          await db.collection("backup_runs").insertOne({
            userId: user.userId,
            triggeredAt: new Date(),
            trigger: "manual",
            stats,
            status: "completed",
            driveFileId: uploadResult.fileId,
            driveFileName: uploadResult.fileName,
            driveFileUrl: uploadResult.fileUrl,
            driveFileSize: uploadResult.fileSize,
          });

          return createResponse(
            200,
            {
              success: true,
              message: `Backup uploaded to Google Drive successfully`,
              stats,
              drive: {
                fileName: uploadResult.fileName,
                fileUrl: uploadResult.fileUrl,
                fileSize: uploadResult.fileSize,
              },
            },
            origin,
          );
        } catch (error) {
          // Save backup run with error status
          await db.collection("backup_runs").insertOne({
            userId: user.userId,
            triggeredAt: new Date(),
            trigger: "manual",
            stats,
            status: "failed",
            error: error.message,
          });

          return createResponse(
            500,
            {
              success: false,
              error: `Backup created but upload failed: ${error.message}`,
              stats,
            },
            origin,
          );
        }
      }

      if (action === "run-automated") {
        // This action is for GitHub Actions scheduled backups
        // Requires X-API-Key authentication
        const isApiKeyAuthorized = hasValidBackupApiKey(event);

        if (!isApiKeyAuthorized) {
          return createResponse(
            401,
            {
              error:
                "Unauthorized. Valid X-API-Key required for automated backups.",
            },
            origin,
          );
        }

        // Get backup settings from database (first user or system-wide settings)
        const businessSettings = await getSharedBusinessSettings(db);

        const driveConfig = normalizeDriveConfigSecrets(
          businessSettings?.backupSettings,
        );

        // Check if Google Drive backup is enabled
        if (!driveConfig || !driveConfig.enabled) {
          return createResponse(
            200,
            {
              success: false,
              message: "Google Drive backup is not enabled in settings",
            },
            origin,
          );
        }

        // Create backup data
        const backupData = await buildBackupPayload(db);
        const stats = getBackupStats(backupData);

        // Upload to Google Drive
        try {
          const uploadResult = await uploadToGoogleDrive(
            driveConfig,
            backupData,
            "automated",
          );

          // Save backup run record
          await db.collection("backup_runs").insertOne({
            userId: businessSettings.userId || "automated",
            triggeredAt: new Date(),
            trigger: "automated",
            stats,
            status: "completed",
            driveFileId: uploadResult.fileId,
            driveFileName: uploadResult.fileName,
            driveFileUrl: uploadResult.fileUrl,
            driveFileSize: uploadResult.fileSize,
          });

          return createResponse(
            200,
            {
              success: true,
              message: `Automated backup uploaded to Google Drive successfully`,
              stats,
              drive: {
                fileName: uploadResult.fileName,
                fileUrl: uploadResult.fileUrl,
                fileSize: uploadResult.fileSize,
              },
            },
            origin,
          );
        } catch (error) {
          // Save backup run with error status
          await db.collection("backup_runs").insertOne({
            userId: businessSettings.userId || "automated",
            triggeredAt: new Date(),
            trigger: "automated",
            stats,
            status: "failed",
            error: error.message,
          });

          return createResponse(
            500,
            {
              success: false,
              error: `Automated backup upload failed: ${error.message}`,
              stats,
            },
            origin,
          );
        }
      }

      return createResponse(400, { error: "Invalid action" }, origin);
    }

    return createResponse(405, { error: "Method not allowed" }, origin);
  } catch (error) {
    return createResponse(
      500,
      {
        error: "Failed to create backup",
        message: "Backup request failed",
      },
      origin,
    );
  }
}
