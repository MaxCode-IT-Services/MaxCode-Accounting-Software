/**
 * In-process backup scheduler for Node.js deployments (Azure, DigitalOcean, VPS…).
 *
 * On Netlify, automatic backups run through the scheduled function
 * (backend/netlify/functions/auto-backup-scheduled.js) — Netlify fires it on
 * its own schedule. On any other platform that schedule never fires, so this
 * module takes over that role inside the Express server:
 *
 *   - Checks every 30 minutes whether a backup is due, using the SAME
 *     schedule logic and the SAME Settings → Backup & Restore configuration
 *     (enabled toggle, frequency, backup time, day of week, etc.)
 *   - When due, uploads the FULL backup to Google Drive in BOTH formats,
 *     updating the same rolling files every other backup path uses:
 *       - maxcode-backup-latest.bson
 *       - maxcode-backup-latest.json
 *   - Records runs in the `backup_runs` collection with trigger
 *     "server-scheduled" and only looks at its own last completed run, so it
 *     works as an independent fallback path alongside the Netlify scheduled
 *     function (if both platforms run, each keeps its own schedule).
 */

import { connectToDatabase } from "../backend/netlify/functions/utils/mongodb.js";
import {
  getSharedBusinessSettings,
  normalizeDriveConfigSecrets,
  buildBackupPayload,
  getBackupStats,
  uploadBackupToGoogleDrive,
} from "../backend/netlify/functions/backup.js";
import {
  shouldRunBackup,
  getCurrentTimeInIST,
} from "../backend/netlify/functions/auto-backup-scheduled.js";

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // every 30 minutes
const INITIAL_DELAY_MS = 2 * 60 * 1000; // let the server finish booting first
const SCHEDULER_TRIGGER = "server-scheduled";

let isRunInProgress = false;

const runDueBackup = async () => {
  if (isRunInProgress) return;
  isRunInProgress = true;

  try {
    const { db } = await connectToDatabase();

    // 1. Read backup settings from DB (same source as the app UI)
    const businessSettings = await getSharedBusinessSettings(db);
    const backupSettings = businessSettings?.backupSettings || {};
    const driveConfig = normalizeDriveConfigSecrets(backupSettings);

    // 2. Skip when backup is disabled or Drive credentials are incomplete
    if (!driveConfig || !driveConfig.enabled) {
      return;
    }

    if (
      !driveConfig.clientId ||
      !driveConfig.clientSecret ||
      !driveConfig.refreshToken
    ) {
      console.log(
        "[backup-scheduler] Incomplete Google Drive configuration – skipping",
      );
      return;
    }

    // 3. Check whether a backup is due (frequency + backupTime from settings)
    const lastRun = await db.collection("backup_runs").findOne(
      { trigger: SCHEDULER_TRIGGER, status: "completed" },
      { sort: { triggeredAt: -1 } },
    );

    const nowTime = getCurrentTimeInIST();

    if (!shouldRunBackup(backupSettings, lastRun, nowTime)) {
      return;
    }

    console.log("[backup-scheduler] Backup due – starting…");

    // 4. Build the full backup payload (all collections)
    const backupData = await buildBackupPayload(db);
    const stats = getBackupStats(backupData);

    console.log(
      `[backup-scheduler] Backup built – ${stats.totalRecords} records across ${stats.collections} collections`,
    );

    // 5. Upload both formats to Google Drive (same rolling file names)
    const uploadResult = await uploadBackupToGoogleDrive(
      driveConfig,
      backupData,
    );

    console.log(
      `[backup-scheduler] Uploaded – bsonFileId=${uploadResult.bson.fileId}, jsonFileId=${uploadResult.json.fileId}`,
    );

    // 6. Save backup run record
    await db.collection("backup_runs").insertOne({
      userId: businessSettings.userId || SCHEDULER_TRIGGER,
      triggeredAt: new Date(),
      trigger: SCHEDULER_TRIGGER,
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
    });

    console.log("[backup-scheduler] Backup completed successfully");
  } catch (error) {
    console.error(`[backup-scheduler] Backup failed: ${error.message}`);

    // Record the failure so it's visible in backup history
    try {
      const { db } = await connectToDatabase();
      await db.collection("backup_runs").insertOne({
        userId: SCHEDULER_TRIGGER,
        triggeredAt: new Date(),
        trigger: SCHEDULER_TRIGGER,
        stats: null,
        status: "failed",
        error: error.message,
      });
    } catch {
      // DB unreachable – nothing more we can do
    }
  } finally {
    isRunInProgress = false;
  }
};

/**
 * Start the scheduler. Safe to call once at server startup.
 */
export const startBackupScheduler = () => {
  console.log(
    `[backup-scheduler] Started – checking every ${CHECK_INTERVAL_MS / 60000} minutes for due backups`,
  );

  setTimeout(() => {
    runDueBackup();
    setInterval(runDueBackup, CHECK_INTERVAL_MS);
  }, INITIAL_DELAY_MS);
};
