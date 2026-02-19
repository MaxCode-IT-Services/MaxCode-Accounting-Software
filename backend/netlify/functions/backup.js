import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { verifyRequestToken } from "./utils/auth.js";

/**
 * Backup API Endpoint
 * - GET: Export backup data (supports JWT auth or X-API-Key auth)
 * - POST action=restore: Restore backup data (JWT required)
 * - POST action=test-drive-config: Validate Drive config payload (JWT required)
 * - POST action=run-now: Create a backup snapshot now (JWT required)
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
      console.log(`  ✅ ${collectionName}: ${data.length} records`);
    } catch (error) {
      console.error(`  ❌ Error fetching ${collectionName}:`, error.message);
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
      console.log("📦 Fetching all collections for backup...");
      const backupData = await buildBackupPayload(db);
      const stats = getBackupStats(backupData);

      console.log(`✅ Backup complete: ${stats.totalRecords} total records`);

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

        return createResponse(
          200,
          {
            success: true,
            message: "Google Drive configuration payload is valid",
          },
          origin,
        );
      }

      if (action === "run-now") {
        const backupData = await buildBackupPayload(db);
        const stats = getBackupStats(backupData);

        await db.collection("backup_runs").insertOne({
          userId: user.userId,
          triggeredAt: new Date(),
          trigger: "manual",
          stats,
        });

        return createResponse(
          200,
          {
            success: true,
            message: "Manual backup run completed",
            stats,
          },
          origin,
        );
      }

      return createResponse(400, { error: "Invalid action" }, origin);
    }

    return createResponse(405, { error: "Method not allowed" }, origin);
  } catch (error) {
    console.error("❌ Backup error:", error);
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
