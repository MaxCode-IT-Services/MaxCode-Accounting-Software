/**
 * Auto Backup Script for MaxCode Invoice Software
 *
 * This script:
 * 1. Connects to MongoDB
 * 2. Fetches all collections data
 * 3. Creates both JSON and BSON backup files
 * 4. Uploads both formats to Google Drive (overwrites existing)
 */

const axios = require("axios");
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
const { serialize, deserialize } = require("bson");

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
      return false;
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

    return false;
  }
}

/**
 * Setup Google Drive OAuth2 Client
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
 * Requests BSON format from the API
 */
async function fetchAllData() {
  console.log("📡 Fetching backup data from MaxCode Invoice API...");
  console.log(`   Endpoint: ${BACKUP_ENDPOINT}`);

  try {
    // Request BSON format from the API
    const response = await axios.get(BACKUP_ENDPOINT, {
      headers: {
        Accept: "application/octet-stream", // Request BSON format
        "X-API-Key": BACKUP_API_KEY,
      },
      responseType: "arraybuffer", // Important for BSON binary data
      timeout: 60000, // 60 seconds timeout
    });

    // Check if response is BSON (binary) or JSON
    const contentType = response.headers["content-type"] || "";

    let backupData;
    let stats;

    if (contentType.includes("application/octet-stream")) {
      // Parse BSON data
      const bsonBuffer = Buffer.from(response.data);
      backupData = deserialize(bsonBuffer);

      // Calculate stats from the deserialized data
      const totalRecords = Object.values(backupData.collections || {}).reduce(
        (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
        0,
      );

      stats = {
        totalRecords,
        collections: Object.keys(backupData.collections || {}).length,
        timestamp: backupData?.metadata?.timestamp || new Date().toISOString(),
        collectionStats: backupData?.metadata?.collectionStats || {},
      };
    } else {
      // Parse JSON data (fallback)
      backupData = response.data.data || response.data;
      stats = response.data.stats || {
        totalRecords: Object.values(backupData.collections || {}).reduce(
          (sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0),
          0,
        ),
        collections: Object.keys(backupData.collections || {}).length,
      };
    }

    console.log(
      `✅ Backup data fetched successfully (${contentType || "BSON"})`,
    );
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
      if (error.response.data) {
        try {
          const errorData = JSON.parse(error.response.data.toString());
          console.error(`   Error: ${JSON.stringify(errorData)}`);
        } catch {
          console.error(
            `   Error: ${error.response.data.toString().substring(0, 200)}`,
          );
        }
      }

      if (error.response.status === 401) {
        console.error("\n💡 Authentication Failed:");
        console.error(
          "   Your BACKUP_API_KEY is invalid or missing from the request.",
        );
      } else if (error.response.status === 404) {
        console.error("\n💡 Endpoint Not Found:");
        console.error("   The backup endpoint doesn't exist yet.");
      }
    } else if (error.code === "ECONNABORTED") {
      console.error("   Request timeout - server took too long to respond");
    } else {
      console.error(`   ${error.message}`);
    }

    throw error;
  }
}

/**
 * Save backup data to local files (both JSON and BSON)
 */
function saveBackupToFiles(backupData) {
  const timestamp = new Date().toISOString().split("T")[0];

  // Save JSON file
  const jsonFilename = `backup-maxcode-${timestamp}.json`;
  const jsonFilepath = path.join(process.cwd(), jsonFilename);

  console.log(`💾 Saving JSON backup to ${jsonFilename}...`);
  fs.writeFileSync(jsonFilepath, JSON.stringify(backupData, null, 2));
  console.log(
    `✅ JSON backup saved locally (${(fs.statSync(jsonFilepath).size / 1024).toFixed(2)} KB)`,
  );

  // Save BSON file
  const bsonFilename = `backup-maxcode-${timestamp}.bson`;
  const bsonFilepath = path.join(process.cwd(), bsonFilename);

  console.log(`💾 Saving BSON backup to ${bsonFilename}...`);
  const bsonBuffer = serialize(backupData);
  fs.writeFileSync(bsonFilepath, bsonBuffer);
  console.log(
    `✅ BSON backup saved locally (${(fs.statSync(bsonFilepath).size / 1024).toFixed(2)} KB)`,
  );

  return {
    json: { filename: jsonFilename, filepath: jsonFilepath },
    bson: { filename: bsonFilename, filepath: bsonFilepath },
  };
}

/**
 * Upload a file to Google Drive with the specified name
 * If file exists, it will be updated; otherwise, it will be created
 */
async function uploadFileToGoogleDrive(
  drive,
  filepath,
  driveFileName,
  mimeType,
) {
  console.log(`  → Processing: ${driveFileName} (${mimeType})...`);

  // Check if file already exists in the folder
  const escapedName = driveFileName.replace(/'/g, "\\'");
  const searchQuery = `name='${escapedName}' and '${GOOGLE_DRIVE_FOLDER_ID}' in parents and trashed=false`;

  const existingFiles = await drive.files.list({
    q: searchQuery,
    fields: "files(id, name, webViewLink)",
  });

  const fileMetadata = {
    name: driveFileName,
    parents: [GOOGLE_DRIVE_FOLDER_ID],
  };

  const media = {
    mimeType: mimeType,
    body: fs.createReadStream(filepath),
  };

  let result;

  if (existingFiles.data.files && existingFiles.data.files.length > 0) {
    // Update existing file
    const fileId = existingFiles.data.files[0].id;
    console.log(`     ↻ Updating existing file (ID: ${fileId})...`);

    result = await drive.files.update({
      fileId: fileId,
      media: media,
      fields: "id, name, webViewLink, size",
    });

    console.log(`     ✅ File updated: ${driveFileName}`);
  } else {
    // Create new file
    console.log(`     ✨ Creating new file...`);

    result = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: "id, name, webViewLink, size",
    });

    console.log(`     ✅ File created: ${driveFileName}`);
  }

  return result.data;
}

/**
 * Upload both JSON and BSON backups to Google Drive
 */
async function uploadToGoogleDrive(files) {
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
        '   7. Copy the "Refresh token" and update GOOGLE_REFRESH_TOKEN secret',
      );
    }
    throw error;
  }

  const uploadResults = {};

  // Upload JSON file (keep latest version)
  console.log("\n📄 Uploading JSON backup...");
  uploadResults.json = await uploadFileToGoogleDrive(
    drive,
    files.json.filepath,
    "maxcode-backup-latest.json",
    "application/json",
  );

  // Upload BSON file (keep latest version)
  console.log("\n🔷 Uploading BSON backup...");
  uploadResults.bson = await uploadFileToGoogleDrive(
    drive,
    files.bson.filepath,
    "maxcode-backup-latest.bson",
    "application/octet-stream",
  );

  console.log("\n✅ Both backup formats uploaded successfully!");
  console.log(`   📄 JSON: ${uploadResults.json.webViewLink}`);
  console.log(`   🔷 BSON: ${uploadResults.bson.webViewLink}`);

  return uploadResults;
}

/**
 * Calculate backup statistics
 */
function calculateStats(backupData) {
  const totalRecords = Object.values(backupData.collections || {}).reduce(
    (sum, collection) =>
      sum + (Array.isArray(collection) ? collection.length : 0),
    0,
  );

  return {
    totalRecords,
    collections: Object.keys(backupData.collections || {}).length,
    timestamp: backupData?.metadata?.timestamp || new Date().toISOString(),
    collectionStats: backupData?.metadata?.collectionStats || {},
  };
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
  console.log("📦 Format: JSON + BSON (both will be uploaded)");
  console.log("─".repeat(70));

  try {
    // Validate environment variables
    if (!validateEnvironmentVariables()) {
      throw new Error("Environment validation failed");
    }

    console.log("✅ Environment variables validated");
    console.log("─".repeat(70));

    // Validate backup settings from backend
    const shouldProceed = await validateBackupSettings();
    if (!shouldProceed) {
      console.log("─".repeat(70));
      console.log("🛑 Backup cancelled based on settings validation");
      process.exit(0); // Exit gracefully without error
    }

    console.log("─".repeat(70));
    console.log(`📡 Backup Endpoint: ${BACKUP_ENDPOINT}`);

    // Step 1: Fetch all data (will get BSON from API)
    const backupData = await fetchAllData();

    // Step 2: Save to local files (both JSON and BSON)
    const files = saveBackupToFiles(backupData);

    // Step 3: Upload both formats to Google Drive
    const driveResults = await uploadToGoogleDrive(files);

    // Step 4: Calculate statistics
    const stats = calculateStats(backupData);
    const jsonSize = (fs.statSync(files.json.filepath).size / 1024).toFixed(2);
    const bsonSize = (fs.statSync(files.bson.filepath).size / 1024).toFixed(2);

    console.log("─".repeat(70));
    console.log("📊 Backup Summary:");
    console.log(`  • Total Collections: ${stats.collections}`);
    console.log(`  • Total Records: ${stats.totalRecords}`);
    console.log(`  • JSON File Size: ${jsonSize} KB`);
    console.log(`  • BSON File Size: ${bsonSize} KB`);
    console.log(`  • Status: ✅ SUCCESS`);
    console.log("─".repeat(70));
    console.log("📄 JSON Drive Link:");
    console.log(`  ${driveResults.json.webViewLink}`);
    console.log("\n🔷 BSON Drive Link:");
    console.log(`  ${driveResults.bson.webViewLink}`);
    console.log("─".repeat(70));

    // Optional: Cleanup local files
    // fs.unlinkSync(files.json.filepath);
    // fs.unlinkSync(files.bson.filepath);
    // console.log('🗑️  Local backup files cleaned up');
  } catch (error) {
    console.error("─".repeat(70));
    console.error("❌ BACKUP FAILED");
    console.error("Error:", error.message);
    if (error.stack) {
      console.error("Stack:", error.stack);
    }
    console.error("─".repeat(70));
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
