/**
 * Auto Backup Script for MaxCode Invoice Software
 *
 * This script:
 * 1. Connects to MongoDB via API
 * 2. Fetches all collections data
 * 3. Creates backup files in JSON and BSON format
 * 4. Uploads both files to Google Drive
 * 5. Overwrites existing files to keep only latest version
 */

const axios = require("axios");
const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

// Try to load BSON, install if not available
let BSON;
try {
  BSON = require("bson");
  console.log("✅ BSON package loaded successfully");
} catch (error) {
  console.log(
    "⚠️  BSON package not found. Will use Buffer fallback for BSON format",
  );
  BSON = null;
}

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
 * Convert JavaScript object to BSON format
 */
function convertToBSON(data) {
  try {
    if (BSON) {
      // Use official BSON package
      return BSON.serialize(data);
    } else {
      // Fallback: Create a buffer from JSON string
      console.log("   ⚠️  Using Buffer fallback for BSON format");
      const jsonString = JSON.stringify(data);
      return Buffer.from(jsonString, "utf8");
    }
  } catch (error) {
    console.error("   ❌ Error converting to BSON:", error.message);
    // Fallback to JSON in buffer
    const jsonString = JSON.stringify(data);
    return Buffer.from(jsonString, "utf8");
  }
}

/**
 * Save backup data to local files (JSON and BSON)
 */
function saveBackupToFiles(backupData) {
  const timestamp = new Date().toISOString().split("T")[0];

  // JSON file
  const jsonFilename = `backup-maxcode-${timestamp}.json`;
  const jsonFilepath = path.join(process.cwd(), jsonFilename);

  // BSON file
  const bsonFilename = `backup-maxcode-${timestamp}.bson`;
  const bsonFilepath = path.join(process.cwd(), bsonFilename);

  console.log(`\n💾 Saving JSON backup to ${jsonFilename}...`);
  fs.writeFileSync(jsonFilepath, JSON.stringify(backupData, null, 2));
  const jsonSize = (fs.statSync(jsonFilepath).size / 1024).toFixed(2);
  console.log(`   ✅ JSON backup saved (${jsonSize} KB)`);

  console.log(`💾 Saving BSON backup to ${bsonFilename}...`);
  const bsonData = convertToBSON(backupData);
  fs.writeFileSync(bsonFilepath, bsonData);
  const bsonSize = (fs.statSync(bsonFilepath).size / 1024).toFixed(2);
  console.log(`   ✅ BSON backup saved (${bsonSize} KB)`);

  // Compare sizes
  const sizeDiff = (((jsonSize - bsonSize) / jsonSize) * 100).toFixed(2);
  console.log(`   📊 BSON is ${sizeDiff}% smaller than JSON`);

  return [
    {
      filename: jsonFilename,
      filepath: jsonFilepath,
      type: "json",
      driveName: "maxcode-backup-latest.json",
      mimeType: "application/json",
      size: jsonSize,
    },
    {
      filename: bsonFilename,
      filepath: bsonFilepath,
      type: "bson",
      driveName: "maxcode-backup-latest.bson",
      mimeType: "application/octet-stream",
      size: bsonSize,
    },
  ];
}

/**
 * Upload file to Google Drive
 * If file exists, it will be updated; otherwise, it will be created
 */
async function uploadFileToDrive(drive, fileInfo) {
  console.log(`\n   📤 Processing ${fileInfo.driveName}...`);

  // Check if file already exists in the folder
  const existingFiles = await drive.files.list({
    q: `name='${fileInfo.driveName}' and '${GOOGLE_DRIVE_FOLDER_ID}' in parents and trashed=false`,
    fields: "files(id, name, webViewLink)",
  });

  const fileMetadata = {
    name: fileInfo.driveName,
    parents: [GOOGLE_DRIVE_FOLDER_ID],
  };

  const media = {
    mimeType: fileInfo.mimeType,
    body: fs.createReadStream(fileInfo.filepath),
  };

  let result;

  if (existingFiles.data.files && existingFiles.data.files.length > 0) {
    // Update existing file
    const fileId = existingFiles.data.files[0].id;
    console.log(
      `      → Updating existing ${fileInfo.type} file (ID: ${fileId})...`,
    );

    result = await drive.files.update({
      fileId: fileId,
      media: media,
      fields: "id, name, webViewLink, size",
    });

    console.log(
      `      ✅ ${fileInfo.type.toUpperCase()} backup updated in Google Drive`,
    );
  } else {
    // Create new file
    console.log(`      → Creating new ${fileInfo.type} file...`);

    result = await drive.files.create({
      requestBody: fileMetadata,
      media: media,
      fields: "id, name, webViewLink, size",
    });

    console.log(
      `      ✅ ${fileInfo.type.toUpperCase()} backup uploaded to Google Drive`,
    );
  }

  console.log(`      📂 File ID: ${result.data.id}`);
  if (result.data.webViewLink) {
    console.log(`      🔗 View Link: ${result.data.webViewLink}`);
  }

  return result.data;
}

/**
 * Upload both files to Google Drive
 */
async function uploadBothToGoogleDrive(files) {
  console.log("\n☁️  Uploading files to Google Drive...");

  let drive;
  try {
    drive = getGoogleDriveClient();
  } catch (error) {
    handleGoogleAuthError(error);
    throw error;
  }

  const results = [];

  for (const file of files) {
    try {
      const result = await uploadFileToDrive(drive, file);
      results.push({
        type: file.type,
        driveName: file.driveName,
        fileId: result.id,
        webViewLink: result.webViewLink,
        size: file.size,
      });
    } catch (error) {
      console.error(`   ❌ Failed to upload ${file.type} file:`, error.message);
      throw error;
    }
  }

  return results;
}

/**
 * Handle Google OAuth errors
 */
function handleGoogleAuthError(error) {
  if (error.message.includes("invalid_grant")) {
    console.error("\n❌ GOOGLE OAUTH ERROR: invalid_grant");
    console.error("   Your GOOGLE_REFRESH_TOKEN has expired or is invalid.");
    console.error("\n💡 How to fix:");
    console.error("   1. Go to: https://developers.google.com/oauthplayground");
    console.error(
      '   2. Click Settings (⚙️) → Check "Use your own OAuth credentials"',
    );
    console.error("   3. Enter your GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET");
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
  } else {
    console.error("\n❌ GOOGLE DRIVE ERROR:", error.message);
  }
}

/**
 * Clean up local files (optional)
 */
function cleanupLocalFiles(files) {
  console.log("\n🧹 Cleaning up local files...");

  for (const file of files) {
    try {
      if (fs.existsSync(file.filepath)) {
        fs.unlinkSync(file.filepath);
        console.log(`   🗑️  Deleted: ${file.filename}`);
      }
    } catch (error) {
      console.log(`   ⚠️  Failed to delete ${file.filename}:`, error.message);
    }
  }
}

/**
 * Main backup function
 */
async function runBackup() {
  console.log("\n" + "=".repeat(70));
  console.log("🚀 MaxCode Invoice Software - Auto Backup System");
  console.log("=".repeat(70));
  console.log(
    `📅 Date: ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
  );
  console.log(`🔄 Frequency: ${BACKUP_FREQUENCY.toUpperCase()}`);
  console.log(`📦 Backup Format: JSON + BSON (Dual Format)`);
  console.log("─".repeat(70));

  try {
    // Step 1: Validate environment variables
    console.log("\n🔧 STEP 1: Environment Validation");
    if (!validateEnvironmentVariables()) {
      throw new Error("Environment validation failed");
    }
    console.log("   ✅ All environment variables are set");

    // Step 2: Validate backup settings from backend
    console.log("\n🔧 STEP 2: Backup Settings Validation");
    const shouldProceed = await validateBackupSettings();
    if (!shouldProceed) {
      console.log("\n" + "─".repeat(70));
      console.log("🛑 Backup cancelled based on settings validation");
      console.log("=".repeat(70));
      process.exit(0);
    }

    // Step 3: Fetch data from API
    console.log("\n🔧 STEP 3: Data Fetching");
    console.log(`   📡 Endpoint: ${BACKUP_ENDPOINT}`);
    const backupData = await fetchAllData();

    // Step 4: Save to local files (JSON and BSON)
    console.log("\n🔧 STEP 4: Local File Creation");
    const files = saveBackupToFiles(backupData);

    // Step 5: Upload to Google Drive
    console.log("\n🔧 STEP 5: Google Drive Upload");
    const driveResults = await uploadBothToGoogleDrive(files);

    // Step 6: Calculate final statistics
    console.log("\n" + "=".repeat(70));
    console.log("📊 FINAL BACKUP SUMMARY");
    console.log("=".repeat(70));

    // Data statistics
    const totalCollections = Object.keys(backupData.collections || {}).length;
    const totalRecords = Object.values(backupData.collections || {}).reduce(
      (sum, collection) =>
        sum + (Array.isArray(collection) ? collection.length : 0),
      0,
    );

    console.log(`\n📁 Data Statistics:`);
    console.log(`   • Total Collections: ${totalCollections}`);
    console.log(`   • Total Records: ${totalRecords}`);

    // File statistics
    console.log(`\n💾 File Statistics:`);
    for (const file of files) {
      console.log(`   • ${file.type.toUpperCase()}: ${file.filename}`);
      console.log(`     Size: ${file.size} KB`);
      console.log(`     Drive Name: ${file.driveName}`);
    }

    // Drive upload results
    console.log(`\n☁️  Google Drive Status:`);
    for (const result of driveResults) {
      console.log(`   • ${result.type.toUpperCase()}: ✅ Uploaded`);
      console.log(`     File ID: ${result.fileId}`);
      if (result.webViewLink) {
        console.log(`     Link: ${result.webViewLink}`);
      }
    }

    // Compression ratio
    const jsonFile = files.find((f) => f.type === "json");
    const bsonFile = files.find((f) => f.type === "bson");
    if (jsonFile && bsonFile) {
      const jsonSize = parseFloat(jsonFile.size);
      const bsonSize = parseFloat(bsonFile.size);
      const savings = (((jsonSize - bsonSize) / jsonSize) * 100).toFixed(2);
      console.log(`\n📈 Compression: BSON is ${savings}% smaller than JSON`);
    }

    console.log("\n" + "─".repeat(70));
    console.log("✅ BACKUP COMPLETED SUCCESSFULLY");
    console.log("✨ All operations completed");
    console.log("=".repeat(70));

    // Optional: Cleanup local files (uncomment if you want to delete local files)
    // cleanupLocalFiles(files);
  } catch (error) {
    console.error("\n" + "❌".repeat(35));
    console.error("❌ BACKUP FAILED");
    console.error("❌".repeat(35));
    console.error("\nError Details:");
    console.error(`   • Message: ${error.message}`);
    console.error(`   • Stack: ${error.stack}`);

    if (error.response) {
      console.error(`   • API Status: ${error.response.status}`);
      console.error(`   • API Data:`, error.response.data);
    }

    console.error("\n" + "─".repeat(70));
    console.error("🔧 TROUBLESHOOTING STEPS:");
    console.error("   1. Check all environment variables are set correctly");
    console.error("   2. Verify Google Drive OAuth credentials");
    console.error("   3. Ensure BACKUP_API_KEY is valid");
    console.error("   4. Check if backup endpoint is accessible");
    console.error("   5. Review network connectivity");
    console.error("=".repeat(70));

    process.exit(1);
  }
}

/**
 * Handle process termination
 */
process.on("SIGINT", () => {
  console.log("\n\n⚠️  Backup process interrupted by user");
  process.exit(130);
});

process.on("unhandledRejection", (error) => {
  console.error("\n💥 Unhandled Promise Rejection:", error);
  process.exit(1);
});

// Run the backup
if (require.main === module) {
  runBackup()
    .then(() => {
      console.log("\n✨ Script execution finished");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n💥 Fatal error:", error);
      process.exit(1);
    });
}
