/**
 * Auto Backup Script for MaxCode Invoice Software
 *
 * This script:
 * 1. Connects to MongoDB
 * 2. Fetches all collections data
 * 3. Creates a backup JSON file
 * 4. Uploads to Google Drive
 * 5. Overwrites existing backup file to keep only latest version
 */

const axios = require("axios");
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");

// Configuration from environment variables
const MONGODB_URI = process.env.MONGODB_URI;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
const NETLIFY_API_URL = process.env.NETLIFY_API_URL;
const BACKUP_API_KEY = process.env.BACKUP_API_KEY;
const BACKUP_FREQUENCY = process.env.BACKUP_FREQUENCY || "manual";

// Validate required environment variables
function validateEnvironmentVariables() {
  const required = {
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REFRESH_TOKEN,
    GOOGLE_DRIVE_FOLDER_ID,
    NETLIFY_API_URL,
    BACKUP_API_KEY,
  };

  const missing = [];
  for (const [key, value] of Object.entries(required)) {
    if (!value) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    console.error("❌ Missing required environment variables:");
    missing.forEach((key) => console.error(`   • ${key}`));
    console.error(
      "\n📖 Please add these as GitHub Secrets (Settings → Secrets → Actions)",
    );
    console.error(
      "\n💡 BACKUP_API_KEY: Create a strong random key (e.g., openssl rand -hex 32)",
    );
    return false;
  }

  return true;
}

// API endpoints
const BACKUP_ENDPOINT = `${NETLIFY_API_URL || "https://billing.maxcode.in/api"}/backup`;
const BUSINESS_SETTINGS_ENDPOINT = `${NETLIFY_API_URL || "https://billing.maxcode.in/api"}/business-settings`;

/**
 * Validate backup settings from backend
 * Checks if auto backup is enabled and matches current frequency
 */
async function validateBackupSettings() {
  console.log("🔍 Validating backup settings from backend...");
  console.log(`   Expected Frequency: ${BACKUP_FREQUENCY}`);

  try {
    // First try with API Key (new secure endpoint)
    const apiKeyResponse = await axios
      .get(`${BACKUP_ENDPOINT}/validate-backup-settings`, {
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": BACKUP_API_KEY,
        },
        timeout: 10000,
      })
      .catch((err) => {
        console.log(
          "   Note: API Key validation endpoint not available, attempting direct settings fetch...",
        );
        return null;
      });

    // Try alternative endpoint if API key approach failed
    let backupSettings = apiKeyResponse?.data?.backupSettings;

    if (!backupSettings) {
      // Alternative: Try fetching via business-settings endpoint
      const settingsResponse = await axios.get(BUSINESS_SETTINGS_ENDPOINT, {
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": BACKUP_API_KEY,
        },
        timeout: 10000,
      });
      backupSettings = settingsResponse?.data?.settings?.backupSettings;
    }

    if (!backupSettings) {
      console.log("⚠️  No backup settings found in backend");
      console.log("   ⛔ CRITICAL: Cannot verify if backup is enabled!");
      console.log(
        "   ⚠️  Skipping backup (safety first - won't backup without verification)",
      );
      console.log(
        "\n🔧 FIX: Make sure your BACKUP_API_KEY environment variable is set correctly",
      );
      return false; // Changed from true to false for safety!
    }

    console.log(
      `   Backup Enabled: ${backupSettings.enabled ? "✅ Yes" : "❌ No"}`,
    );
    console.log(
      `   Configured Frequency: ${backupSettings.frequency || "daily"}`,
    );

    // Check if backup is disabled
    if (!backupSettings.enabled) {
      console.log("\n⏸️  BACKUP SKIPPED");
      console.log("   Reason: Auto backup is disabled in settings");
      console.log(
        "   Enable it from: Settings → Backup & Restore → Google Drive Auto Backup",
      );
      return false;
    }

    // Check if frequency matches
    const configuredFrequency = backupSettings.frequency || "daily";
    if (configuredFrequency !== BACKUP_FREQUENCY) {
      console.log("\n⏩ BACKUP SKIPPED");
      console.log(
        `   Reason: Frequency mismatch (Expected: ${BACKUP_FREQUENCY}, Got: ${configuredFrequency})`,
      );
      console.log(`   Current schedule: ${configuredFrequency.toUpperCase()}`);
      console.log("   Change frequency from: Settings → Backup & Restore");
      return false;
    }

    console.log("✅ Backup settings validated successfully");
    return true;
  } catch (error) {
    console.error("❌ CRITICAL ERROR: Failed to fetch backup settings");
    console.error("   Error:", error.message);
    console.log("\n⛔ BACKUP SKIPPED (Safety First)");
    console.log("   Cannot verify backup settings - refusing to proceed");
    console.log("\n🔧 TROUBLESHOOTING:");
    console.log("   1. Check if BACKUP_API_KEY is set correctly");
    console.log("   2. Check if NETLIFY_API_URL is reachable");
    console.log("   3. Check MongoDB connection");
    console.log("   4. Review GitHub Actions logs for more details");

    return false; // Changed from true - NEVER proceed if settings check fails!
  }
}

/**
 * Setup Google Drive OAuth2 Client
 *
 * IMPORTANT: How Refresh Token Works
 * ====================================
 *
 * 1. Refresh token is LONG-LIVED (doesn't expire frequently)
 * 2. Access token expires every ~1 hour
 * 3. When access token expires, Google OAuth2 client AUTOMATICALLY:
 *    - Uses refresh_token to get a new access token
 *    - Handles renewal in the background
 *    - No manual intervention needed!
 *
 * YOU ONLY NEED TO:
 * - Generate refresh token ONCE from OAuth Playground
 * - Save it in GitHub Secrets / Settings
 * - It will work automatically forever (unless revoked)
 *
 * Refresh token expires ONLY if:
 * - User manually revokes access
 * - User changes Google account password
 * - Token unused for 6+ months
 * - You regenerate OAuth credentials (Client ID/Secret)
 */
function getGoogleDriveClient() {
  try {
    const oauth2Client = new google.auth.OAuth2(
      GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET,
      "https://developers.google.com/oauthplayground",
    );

    // Set refresh token - Google OAuth2 library will auto-renew access tokens
    oauth2Client.setCredentials({
      refresh_token: GOOGLE_REFRESH_TOKEN,
    });

    return google.drive({ version: "v3", auth: oauth2Client });
  } catch (error) {
    console.error("❌ Failed to setup Google Drive client:", error.message);
    throw error;
  }
}

/**
 * Fetch data from all collections using the backup endpoint
 */
async function fetchAllData() {
  console.log("📡 Fetching backup data from MaxCode Invoice API...");
  console.log(`   Endpoint: ${BACKUP_ENDPOINT}`);

  try {
    const response = await axios.get(BACKUP_ENDPOINT, {
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": BACKUP_API_KEY,
      },
      timeout: 60000, // 60 seconds timeout (fetching all data may take time)
    });

    if (!response.data || !response.data.success) {
      throw new Error("Invalid response from backup API");
    }

    const backupData = response.data.data;
    const stats = response.data.stats;

    console.log(`✅ Backup data fetched successfully`);
    console.log(
      `   📊 Total records: ${stats.totalRecords} across ${stats.collections} collections`,
    );

    // Log individual collection counts
    if (backupData.collections) {
      Object.entries(backupData.collections).forEach(([name, data]) => {
        if (Array.isArray(data)) {
          console.log(`   • ${name}: ${data.length} records`);
        }
      });
    }

    return backupData;
  } catch (error) {
    console.error("\n❌ ERROR FETCHING BACKUP DATA:");

    if (error.response) {
      console.error(`   HTTP Status: ${error.response.status}`);
      console.error(`   Error: ${JSON.stringify(error.response.data)}`);

      if (error.response.status === 401) {
        console.error("\n💡 Authentication Failed:");
        console.error(
          "   Your BACKUP_API_KEY is invalid or missing from the request.",
        );
        console.error(
          "   Make sure BACKUP_API_KEY environment variable is set.",
        );
      } else if (error.response.status === 404) {
        console.error("\n💡 Endpoint Not Found:");
        console.error("   The backup endpoint doesn't exist yet.");
        console.error(
          "   Make sure backend/netlify/functions/backup.js is deployed.",
        );
      } else if (error.response.status === 500) {
        console.error("\n💡 Server Error:");
        console.error(
          "   Check if BACKUP_API_KEY is set in Netlify environment variables.",
        );
      }
    } else if (error.code === "ECONNABORTED") {
      console.error("   Request timeout - server took too long to respond");
    } else {
      console.error(`   ${error.message}`);
    }

    console.error(`\n🔗 Verify your setup:`);
    console.error(`   1. NETLIFY_API_URL: ${NETLIFY_API_URL}`);
    console.error(`   2. Backup endpoint: ${BACKUP_ENDPOINT}`);
    console.error(
      `   3. BACKUP_API_KEY is set: ${BACKUP_API_KEY ? "✅ Yes" : "❌ No"}`,
    );

    throw error;
  }
}

/**
 * Save backup data to local JSON file
 */
function saveBackupToFile(backupData) {
  const timestamp = new Date().toISOString().split("T")[0];
  const filename = `backup-maxcode-${timestamp}.json`;
  const filepath = path.join(process.cwd(), filename);

  console.log(`💾 Saving backup to ${filename}...`);
  fs.writeFileSync(filepath, JSON.stringify(backupData, null, 2));
  console.log(`✅ Backup saved locally`);

  return { filename, filepath };
}

/**
 * Upload backup to Google Drive
 * If file exists, it will be updated; otherwise, it will be created
 */
async function uploadToGoogleDrive(filepath, filename) {
  console.log("☁️  Uploading to Google Drive...");

  let drive;
  try {
    drive = getGoogleDriveClient();
  } catch (error) {
    if (error.message.includes("invalid_grant")) {
      console.error("\n❌ GOOGLE OAUTH ERROR: invalid_grant");
      console.error("   Your GOOGLE_REFRESH_TOKEN has expired or is invalid.");
      console.error("\n💡 How to fix:");
      console.error(
        "   1. Go to: https://developers.google.com/oauthplayground",
      );
      console.error(
        '   2. Click Settings (⚙️) → Check "Use your own OAuth credentials"',
      );
      console.error(
        "   3. Enter your GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET",
      );
      console.error(
        '   4. In Step 1: Select "Drive API v3" → https://www.googleapis.com/auth/drive.file',
      );
      console.error(
        '   5. Click "Authorize APIs" and login with your Google account',
      );
      console.error(
        '   6. In Step 2: Click "Exchange authorization code for tokens"',
      );
      console.error(
        '   7. Copy the "Refresh token" and update GOOGLE_REFRESH_TOKEN secret in GitHub',
      );
    }
    throw error;
  }

  // Check if file already exists in the folder
  const existingFiles = await drive.files.list({
    q: `name='maxcode-backup-latest.json' and '${GOOGLE_DRIVE_FOLDER_ID}' in parents and trashed=false`,
    fields: "files(id, name)",
  });

  const fileMetadata = {
    name: "maxcode-backup-latest.json",
    parents: [GOOGLE_DRIVE_FOLDER_ID],
  };

  const media = {
    mimeType: "application/json",
    body: fs.createReadStream(filepath),
  };

  let result;

  if (existingFiles.data.files && existingFiles.data.files.length > 0) {
    // Update existing file
    const fileId = existingFiles.data.files[0].id;
    console.log(`  → Updating existing file (ID: ${fileId})...`);

    result = await drive.files.update({
      fileId: fileId,
      media: media,
      fields: "id, name, webViewLink",
    });

    console.log(`✅ Backup updated in Google Drive`);
  } else {
    // Create new file
    console.log(`  → Creating new file...`);

    result = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: "id, name, webViewLink",
    });

    console.log(`✅ Backup uploaded to Google Drive`);
  }

  console.log(`📂 File ID: ${result.data.id}`);
  console.log(`🔗 View Link: ${result.data.webViewLink}`);

  return result.data;
}

/**
 * Main backup function
 */
async function runBackup() {
  console.log("🚀 Starting MaxCode Invoice Software Auto Backup...");
  console.log(
    `📅 Date: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
  );
  console.log(`🔄 Frequency: ${BACKUP_FREQUENCY.toUpperCase()}`);
  console.log("─".repeat(60));

  try {
    // Validate environment variables
    if (!validateEnvironmentVariables()) {
      throw new Error("Environment validation failed");
    }

    console.log("✅ Environment variables validated");
    console.log("─".repeat(60));

    // Validate backup settings from backend
    const shouldProceed = await validateBackupSettings();
    if (!shouldProceed) {
      console.log("─".repeat(60));
      console.log("🛑 Backup cancelled based on settings validation");
      process.exit(0); // Exit gracefully without error
    }

    console.log("─".repeat(60));
    console.log(`📡 Backup Endpoint: ${BACKUP_ENDPOINT}`);

    // Step 1: Fetch all data
    const backupData = await fetchAllData();

    // Step 2: Save to local file
    const { filename, filepath } = saveBackupToFile(backupData);

    // Step 3: Upload to Google Drive
    const driveFile = await uploadToGoogleDrive(filepath, filename);

    // Step 4: Calculate statistics
    const totalRecords = Object.values(backupData.collections).reduce(
      (sum, collection) =>
        sum + (Array.isArray(collection) ? collection.length : 0),
      0,
    );

    console.log("─".repeat(60));
    console.log("📊 Backup Summary:");
    console.log(
      `  • Total Collections: ${Object.keys(backupData.collections).length}`,
    );
    console.log(`  • Total Records: ${totalRecords}`);
    console.log(
      `  • File Size: ${(fs.statSync(filepath).size / 1024).toFixed(2)} KB`,
    );
    console.log(`  • Status: ✅ SUCCESS`);
    console.log("─".repeat(60));

    // Cleanup local file (optional)
    // fs.unlinkSync(filepath);
    // console.log('🗑️  Local backup file cleaned up');
  } catch (error) {
    console.error("─".repeat(60));
    console.error("❌ BACKUP FAILED");
    console.error("Error:", error.message);
    console.error("Stack:", error.stack);
    console.error("─".repeat(60));
    process.exit(1);
  }
}

// Run the backup
runBackup()
  .then(() => {
    console.log("✨ Backup process completed successfully!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 Unexpected error:", error);
    process.exit(1);
  });
