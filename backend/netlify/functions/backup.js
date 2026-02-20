import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { verifyRequestToken } from "./utils/auth.js";
import { google } from "googleapis";
import { Readable } from "stream";

/**
 * Backup API Endpoint
 * - GET: Export backup data (supports JWT auth or X-API-Key auth)
 * - POST action=restore: Restore backup data (JWT required)
 * - POST action=test-drive-config: Test Google Drive connection (JWT required)
 * - POST action=run-now: Create a backup snapshot and upload to Drive (JWT required)
 * - POST action=run-automated: Scheduled backup run via GitHub Actions (API Key required)
 */

const BACKUP_COLLECTIONS = [
  "clients",
  "vendors",
  "staff",
  "invoices",
  "purchases",
  "rcm",
  "projects",
  "services",
  "years",
  "business_settings",
];

const toTrimmedString = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

const getApiKeyFromRequest = (event) =>
  event.headers["x-api-key"] ||
  event.headers["X-API-Key"] ||
  event.queryStringParameters?.apiKey;

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
  const backupData = {
    metadata: {
      timestamp: new Date().toISOString(),
      version: "1.1",
      source: "MaxCode Invoice Software",
    },
    collections: {},
  };

  for (const collectionName of BACKUP_COLLECTIONS) {
    try {
      const collection = db.collection(collectionName);
      const data = await collection.find({}).toArray();
      backupData.collections[collectionName] = data;
    } catch (error) {
      backupData.collections[collectionName] = [];
    }
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
  };
};

const normalizeBackupCollections = (inputCollections = {}) => {
  const sourceCollections = { ...inputCollections };

  if (
    !sourceCollections.business_settings &&
    Array.isArray(sourceCollections.businessSettings)
  ) {
    sourceCollections.business_settings = sourceCollections.businessSettings;
  }

  const normalized = {};

  for (const collectionName of BACKUP_COLLECTIONS) {
    const value = sourceCollections[collectionName];
    normalized[collectionName] = Array.isArray(value) ? value : [];
  }

  return normalized;
};

const restoreBackupData = async (db, backupData) => {
  const normalizedCollections = normalizeBackupCollections(
    backupData?.collections || {},
  );

  for (const collectionName of BACKUP_COLLECTIONS) {
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
    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      driveConfig.clientId,
      driveConfig.clientSecret,
      "https://developers.google.com/oauthplayground", // Redirect URI used during token generation
    );

    // Set credentials with refresh token
    oauth2Client.setCredentials({
      refresh_token: driveConfig.refreshToken,
    });

    // Initialize Drive API
    const drive = google.drive({ version: "v3", auth: oauth2Client });

    // Create backup file name with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const fileName = `maxcode-backup-${trigger}-${timestamp}.json`;

    // Convert backup data to JSON string
    const backupJson = JSON.stringify(backupData, null, 2);

    // Create a readable stream from the JSON string
    const bufferStream = Readable.from([backupJson]);

    // Upload to Google Drive
    const fileMetadata = {
      name: fileName,
      mimeType: "application/json",
    };

    // Only specify parent folder if folderId is provided
    if (driveConfig.folderId && driveConfig.folderId.trim()) {
      fileMetadata.parents = [driveConfig.folderId];
    }

    const media = {
      mimeType: "application/json",
      body: bufferStream,
    };

    const response = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: "id, name, webViewLink, size",
    });

    return {
      success: true,
      fileId: response.data.id,
      fileName: response.data.name,
      fileUrl: response.data.webViewLink,
      fileSize: response.data.size,
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
    // Create OAuth2 client
    const oauth2Client = new google.auth.OAuth2(
      driveConfig.clientId,
      driveConfig.clientSecret,
      "https://developers.google.com/oauthplayground",
    );

    // Set credentials with refresh token
    oauth2Client.setCredentials({
      refresh_token: driveConfig.refreshToken,
    });

    // Initialize Drive API
    const drive = google.drive({ version: "v3", auth: oauth2Client });

    // Test: Get user info
    const about = await drive.about.get({
      fields: "user(emailAddress, displayName), storageQuota",
    });

    // If folderId is provided, verify it exists
    if (driveConfig.folderId && driveConfig.folderId.trim()) {
      try {
        await drive.files.get({
          fileId: driveConfig.folderId,
          fields: "id, name",
        });
      } catch (error) {
        throw new Error(
          `Folder ID not found or not accessible: ${error.message}`,
        );
      }
    }

    return {
      success: true,
      user: about.data.user,
      storageQuota: about.data.storageQuota,
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
      const businessSettings = await db
        .collection("business_settings")
        .findOne({});
      const backupSettings = businessSettings?.backupSettings || {
        enabled: false,
        frequency: "daily",
      };

      return createResponse(
        200,
        {
          success: true,
          backupSettings,
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

      return createResponse(
        200,
        {
          success: true,
          data: backupData,
          stats,
        },
        origin,
      );
    }

    if (method === "POST") {
      const user = validateJwtAccess(event);
      const body = event.body ? JSON.parse(event.body) : {};
      const action = toTrimmedString(body.action).toLowerCase();

      if (!action) {
        return createResponse(400, { error: "Action is required" }, origin);
      }

      const { db } = await connectToDatabase();

      if (action === "restore") {
        const backupData = body.backupData;

        if (!backupData || typeof backupData !== "object") {
          return createResponse(
            400,
            { error: "backupData object is required" },
            origin,
          );
        }

        if (
          !backupData.collections ||
          typeof backupData.collections !== "object"
        ) {
          return createResponse(
            400,
            { error: "Invalid backup file format" },
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

        const restored = await restoreBackupData(db, restorePayload);
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
        const validation = validateDriveConfigPayload(body.driveConfig || {});

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
          const testResult = await testGoogleDriveConnection(body.driveConfig);

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
        const businessSettings = await db
          .collection("business_settings")
          .findOne({ userId: user.userId });

        const driveConfig = businessSettings?.backupSettings;

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
        const businessSettings = await db
          .collection("business_settings")
          .findOne({});

        const driveConfig = businessSettings?.backupSettings;

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
        message: error.message,
      },
      origin,
    );
  }
}
