/**
 * External Cron Endpoint for Google Drive Backups
 *
 * This is a regular HTTP function that can be called by external cron
 * services such as https://console.cron-job.org or any other cron provider
 * (Azure Logic Apps, Azure Scheduler, uptime monitors, etc.).
 *
 * Uploads the FULL backup to Google Drive in BOTH formats, updating the
 * same rolling files used by every other backup path:
 *   - maxcode-backup-latest.bson
 *   - maxcode-backup-latest.json
 *
 * URL (via Netlify redirect or the Express server adapter):
 *   GET /api/backup-cron
 *   POST /api/backup-cron
 *
 * Direct Netlify function URL:
 *   https://{site-name}.netlify.app/.netlify/functions/backup-cron
 *
 * Authentication:
 *   Requires X-Api-Key header matching the BACKUP_API_KEY environment variable.
 *
 * Response:
 *   Success: { success: true, message: "...", timestamp: "..." }
 *   Error:   { success: false, error: "...", timestamp: "..." }
 *
 * Example cron-job.org config:
 *   URL:     https://your-site.netlify.app/api/backup-cron
 *   Method:  GET
 *   Headers: X-Api-Key: your-backup-api-key
 *   Period:  Custom (e.g., every 24 hours at desired time)
 */

import {
  connectToDatabase,
  createResponse,
  getCorsHeaders,
} from "./utils/mongodb.js";
import {
  getSharedBusinessSettings,
  normalizeDriveConfigSecrets,
  buildBackupPayload,
  uploadBackupToGoogleDrive,
  getBackupStats,
  toTrimmedString,
} from "./backup.js";

// ── Authentication ───────────────────────────────────────────────────────────

/**
 * Validate the X-Api-Key header against the configured BACKUP_API_KEY.
 * @param {Object} event - Lambda event object
 * @returns {boolean}
 */
const isAuthorized = (event) => {
  const apiKey = process.env.BACKUP_API_KEY;
  if (!apiKey) {
    console.warn("[backup-cron] BACKUP_API_KEY not set in environment");
    return false;
  }
  const header = event.headers["x-api-key"]
    || event.headers["X-Api-Key"]
    || "";
  return header === apiKey;
};

// ── Main Handler ─────────────────────────────────────────────────────────────

export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin || "*";

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: getCorsHeaders(origin),
      body: JSON.stringify({ success: true }),
    };
  }

  // ── Health check / ping ──────────────────────────────────────────────────
  // A simple GET without API key returns status (for monitoring tools)
  if (event.httpMethod === "GET" && !isAuthorized(event)) {
    return {
      statusCode: 200,
      headers: getCorsHeaders(origin),
      body: JSON.stringify({
        success: true,
        message: "Cron endpoint is alive. Provide X-Api-Key header to trigger a backup.",
        timestamp: new Date().toISOString(),
      }),
    };
  }

  // ── Authorization ────────────────────────────────────────────────────────
  if (!isAuthorized(event)) {
    return createResponse(401, {
      success: false,
      error: "Unauthorized. Provide valid X-Api-Key header.",
    }, origin, event);
  }

  try {
    const { db } = await connectToDatabase();

    // 1. Get backup settings
    const businessSettings = await getSharedBusinessSettings(db);
    const backupSettings = businessSettings?.backupSettings || {};
    const driveConfig = normalizeDriveConfigSecrets(backupSettings);

    // 2. Validate Drive config
    if (!driveConfig || !driveConfig.enabled) {
      return createResponse(200, {
        success: false,
        message: "Google Drive backup is not enabled in settings. Enable it from the Backup settings page.",
        timestamp: new Date().toISOString(),
      }, origin, event);
    }

    if (!driveConfig.clientId || !driveConfig.clientSecret || !driveConfig.refreshToken) {
      return createResponse(200, {
        success: false,
        message: "Google Drive configuration is incomplete. Please configure all credentials in settings.",
        timestamp: new Date().toISOString(),
      }, origin, event);
    }

    // 3. Build backup payload
    console.log("[backup-cron] Building backup payload…");
    const backupData = await buildBackupPayload(db);
    const stats = getBackupStats(backupData);

    console.log(`[backup-cron] Backup built – ${stats.totalRecords} records across ${stats.collections} collections`);

    // 4. Upload to Google Drive (BSON + JSON, same rolling file names)
    console.log("[backup-cron] Uploading to Google Drive…");
    const uploadResult = await uploadBackupToGoogleDrive(
      driveConfig,
      backupData,
    );

    console.log(
      `[backup-cron] Uploaded – bsonFileId=${uploadResult.bson.fileId}, jsonFileId=${uploadResult.json.fileId}`,
    );

    // 5. Save backup run record
    const runRecord = {
      userId: businessSettings.userId || "external-cron",
      triggeredAt: new Date(),
      trigger: "external-cron",
      stats,
      status: "completed",
      driveFileId: uploadResult.bson.fileId,
      driveFileName: uploadResult.bson.fileName,
      driveFileUrl: uploadResult.bson.fileUrl,
      driveFileSize: uploadResult.bson.fileSize,
      jsonFileId: uploadResult.json.fileId,
      jsonFileName: uploadResult.json.fileName,
      jsonFileUrl: uploadResult.json.fileUrl,
      jsonFileSize: uploadResult.json.fileSize,
    };

    await db.collection("backup_runs").insertOne(runRecord);

    console.log("[backup-cron] Backup completed successfully");

    return createResponse(200, {
      success: true,
      message: "Backup completed successfully",
      timestamp: new Date().toISOString(),
    }, origin, event);
  } catch (error) {
    console.error(`[backup-cron] Error: ${error.message}`);

    // Save error record
    try {
      const { db } = await connectToDatabase();
      await db.collection("backup_runs").insertOne({
        userId: "external-cron",
        triggeredAt: new Date(),
        trigger: "external-cron",
        stats: null,
        status: "failed",
        error: error.message,
      });
    } catch {
      // Silently ignore
    }

    return createResponse(500, {
      success: false,
      error: `Backup failed: ${error.message}`,
      timestamp: new Date().toISOString(),
    }, origin, event);
  }
}
