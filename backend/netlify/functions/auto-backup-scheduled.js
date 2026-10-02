/**
 * Netlify Scheduled Function for Automated Google Drive Backups
 *
 * Runs every 30 minutes and checks whether a backup should execute
 * based on the user's configured schedule from the admin panel
 * (frequency, backupTime, dayOfWeek, etc.)
 *
 * Cron expression: every 30 minutes (e.g., :00 and :30 past the hour)
 * Execution limit: 30 seconds (Netlify scheduled function limit)
 *
 * This replaces the old GitHub Actions-based backup workflow.
 */

import { connectToDatabase } from "./utils/mongodb.js";
import {
  getSharedBusinessSettings,
  normalizeDriveConfigSecrets,
  buildBackupPayload,
  uploadToGoogleDrive,
  getBackupStats,
  toTrimmedString,
} from "./backup.js";

// ── Schedule Config ──────────────────────────────────────────────────────────
// Runs every 30 minutes – the function itself reads the configured frequency
// and backupTime from DB settings and decides whether it's time to run.
export const config = {
  schedule: "*/30 * * * *",
};

// ── Time Helpers ─────────────────────────────────────────────────────────────

/**
 * Parse "HH:MM" into total minutes of the day.
 * @param {string} timeStr
 * @returns {number|null}
 */
export const parseTimeToMinutes = (timeStr) => {
  if (!timeStr || typeof timeStr !== "string") return null;
  const parts = timeStr.trim().split(":");
  if (parts.length !== 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
};

/**
 * Get the current time in IST (Asia/Kolkata) — since the app is for Indian users
 * and the BackupTab shows times in IST, we default to IST.
 * @returns {{ minutes: number, day: number, date: number, month: number, year: number, hour: number, weekday: number }}
 */
export const getCurrentTimeInIST = () => {
  const now = new Date();
  const timezone = "Asia/Kolkata";
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "numeric",
      hour12: false,
      weekday: "short",
      day: "numeric",
      month: "numeric",
      year: "numeric",
    });
    const parts = formatter.formatToParts(now);
    const get = (type) => parseInt(parts.find((p) => p.type === type)?.value || "0", 10);
    const getStr = (type) => parts.find((p) => p.type === type)?.value || "";
    const hour = get("hour");
    const minute = get("minute");
    const day = get("day");
    const month = get("month");
    const year = get("year");

    const weekdayMap = {
      sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
    };
    const weekday = weekdayMap[getStr("weekday").toLowerCase().slice(0, 3)] ?? now.getDay();

    return { minutes: hour * 60 + minute, day, date: day, month, year, hour, weekday };
  } catch {
    // Fallback to UTC calculation + 5:30 for IST
    const istOffset = 5.5 * 60;
    const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const istMinutes = (utcMinutes + istOffset) % (24 * 60);
    const istDate = new Date(now.getTime() + istOffset * 60 * 1000);
    return {
      minutes: istMinutes,
      day: istDate.getUTCDate(),
      date: istDate.getUTCDate(),
      month: istDate.getUTCMonth() + 1,
      year: istDate.getUTCFullYear(),
      hour: Math.floor(istMinutes / 60),
      weekday: istDate.getUTCDay(),
    };
  }
};

// ── Schedule Check ───────────────────────────────────────────────────────────

/**
 * Determine whether the backup should run now based on the configured frequency and last run.
 * @param {Object} settings - backupSettings from DB
 * @param {Object|null} lastRun - Most recent automated backup run doc
 * @param {Object} now - Current time info from getCurrentTimeInTimezone()
 * @returns {boolean}
 */
export const shouldRunBackup = (settings, lastRun, nowTime) => {
  const frequency = toTrimmedString(settings.frequency) || "daily";
  if (frequency === "manual") return false;

  const lastRunTime = lastRun?.triggeredAt
    ? new Date(lastRun.triggeredAt).getTime()
    : 0;
  const nowMs = Date.now();
  const msSinceLastRun = nowMs - lastRunTime;

  switch (frequency) {
    case "every_4_hours": {
      const everyHours = parseInt(settings.everyHours, 10) || 4;
      const intervalMs = everyHours * 60 * 60 * 1000;
      // Allow 5-minute tolerance window
      return msSinceLastRun >= intervalMs - 5 * 60 * 1000;
    }

    case "daily": {
      const backupTime = parseTimeToMinutes(settings.backupTime);
      if (backupTime === null) return false;
      // Check current time matches backupTime (±15 min window)
      const timeDiff = Math.abs(nowTime.minutes - backupTime);
      if (timeDiff > 15) return false;
      // Make sure we haven't already run today
      const lastRunDate = lastRunTime
        ? new Date(lastRunTime).toISOString().slice(0, 10)
        : null;
      const today = new Date().toISOString().slice(0, 10);
      if (lastRunDate === today) return false;
      return true;
    }

    case "weekly": {
      const backupTime = parseTimeToMinutes(settings.backupTime);
      if (backupTime === null) return false;
      const timeDiff = Math.abs(nowTime.minutes - backupTime);
      if (timeDiff > 15) return false;
      // Check day of week
      const targetDay = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
        .indexOf((settings.dayOfWeek || "monday").toLowerCase());
      if (targetDay === -1 || nowTime.weekday !== targetDay) return false;
      // Haven't run in last 7 days
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
      return msSinceLastRun >= sevenDaysMs - 5 * 60 * 1000;
    }

    case "monthly": {
      const backupTime = parseTimeToMinutes(settings.backupTime);
      if (backupTime === null) return false;
      const timeDiff = Math.abs(nowTime.minutes - backupTime);
      if (timeDiff > 15) return false;
      // Check day of month
      const targetDay = parseInt(settings.dayOfMonth, 10) || 1;
      if (nowTime.date !== targetDay) return false;
      // Haven't run in last 28 days
      const monthMs = 28 * 24 * 60 * 60 * 1000;
      return msSinceLastRun >= monthMs - 5 * 60 * 1000;
    }

    case "yearly": {
      const backupTime = parseTimeToMinutes(settings.backupTime);
      if (backupTime === null) return false;
      const timeDiff = Math.abs(nowTime.minutes - backupTime);
      if (timeDiff > 15) return false;
      // Check month and day
      const targetMonth = parseInt(settings.monthOfYear, 10) || 1;
      const targetDay = parseInt(settings.dayOfMonth, 10) || 1;
      if (nowTime.month !== targetMonth || nowTime.date !== targetDay) return false;
      // Haven't run in last 360 days
      const yearMs = 360 * 24 * 60 * 60 * 1000;
      return msSinceLastRun >= yearMs - 5 * 60 * 1000;
    }

    default:
      return false;
  }
};

// ── Main Handler ─────────────────────────────────────────────────────────────

export async function handler(event) {
  try {
    const { db } = await connectToDatabase();

    // 1. Read backup settings from DB
    const businessSettings = await getSharedBusinessSettings(db);
    const backupSettings = businessSettings?.backupSettings || {};
    const driveConfig = normalizeDriveConfigSecrets(backupSettings);

    // 2. Check if backup is enabled
    if (!driveConfig || !driveConfig.enabled) {
      console.log("[auto-backup-scheduled] Backup not enabled – skipping");
      return {
        statusCode: 200,
        body: JSON.stringify({ success: false, message: "Backup not enabled in settings" }),
      };
    }

    // 3. Check if all required Drive credentials are present
    if (!driveConfig.clientId || !driveConfig.clientSecret || !driveConfig.refreshToken) {
      console.log("[auto-backup-scheduled] Incomplete Drive config – skipping");
      return {
        statusCode: 200,
        body: JSON.stringify({ success: false, message: "Incomplete Google Drive configuration" }),
      };
    }

    // 4. Get the last automated run (for schedule checking)
    const lastRun = await db.collection("backup_runs").findOne(
      { trigger: { $in: ["automated", "netlify-scheduled"] } },
      { sort: { triggeredAt: -1 } },
    );

    // 5. Determine current time in IST
    const nowTime = getCurrentTimeInIST();

    // 6. Check if we should run now
    if (!shouldRunBackup(backupSettings, lastRun, nowTime)) {
      console.log("[auto-backup-scheduled] Not scheduled to run at this time – skipping");
      return {
        statusCode: 200,
        body: JSON.stringify({ success: false, message: "Not scheduled to run now" }),
      };
    }

    console.log("[auto-backup-scheduled] Starting scheduled backup…");

    // 7. Build backup payload
    const backupData = await buildBackupPayload(db);
    const stats = getBackupStats(backupData);

    console.log(`[auto-backup-scheduled] Backup built – ${stats.totalRecords} records across ${stats.collections} collections`);

    // 8. Upload to Google Drive
    const uploadResult = await uploadToGoogleDrive(driveConfig, backupData, "automated");

    console.log(`[auto-backup-scheduled] Uploaded to Drive – fileId=${uploadResult.fileId}`);

    // 9. Save backup run record
    const runRecord = {
      userId: businessSettings.userId || "netlify-scheduled",
      triggeredAt: new Date(),
      trigger: "netlify-scheduled",
      stats,
      status: "completed",
      driveFileId: uploadResult.fileId,
      driveFileName: uploadResult.fileName,
      driveFileUrl: uploadResult.fileUrl,
      driveFileSize: uploadResult.fileSize,
    };

    await db.collection("backup_runs").insertOne(runRecord);

    console.log("[auto-backup-scheduled] Backup completed successfully");

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "Backup completed successfully",
        timestamp: new Date().toISOString(),
      }),
    };
  } catch (error) {
    console.error(`[auto-backup-scheduled] Error: ${error.message}`);

    // Attempt to save error record if DB is reachable
    try {
      const { db } = await connectToDatabase();
      await db.collection("backup_runs").insertOne({
        userId: "netlify-scheduled",
        triggeredAt: new Date(),
        trigger: "netlify-scheduled",
        stats: null,
        status: "failed",
        error: error.message,
      });
    } catch {
      // Silently ignore DB save failure in error branch
    }

    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        error: `Scheduled backup failed: ${error.message}`,
        timestamp: new Date().toISOString(),
      }),
    };
  }
}
