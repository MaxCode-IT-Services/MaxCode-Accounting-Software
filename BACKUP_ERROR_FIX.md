# ⚠️ Auto Backup Error Fix

## Problem: Exit Code 1 Error

If your GitHub Actions workflow fails with `Process completed with exit code 1`, follow these steps:

---

## ✅ Solution

### Step 1: Check GitHub Secrets

Make sure **ALL 6 secrets** are added correctly:

1. Go to your GitHub repository
2. Click: **Settings** → **Secrets and variables** → **Actions**
3. Verify these secrets exist:

| Secret Name              | Example Value                                        |
| ------------------------ | ---------------------------------------------------- |
| `GOOGLE_CLIENT_ID`       | `123456-abc.apps.googleusercontent.com`              |
| `GOOGLE_CLIENT_SECRET`   | `GOCSPX-abc123xyz`                                   |
| `GOOGLE_REFRESH_TOKEN`   | `1//abc123-xyz...`                                   |
| `GOOGLE_DRIVE_FOLDER_ID` | `1aB2cD3eF4gH5iJ6kL7mN8oP9qR0sT`                     |
| `NETLIFY_API_URL`        | `https://your-app.netlify.app/.netlify/functions`    |
| `MONGODB_URI`            | `mongodb+srv://user:pass@cluster.mongodb.net/dbname` |

---

### Step 2: Get Your Netlify API URL

This is the **most common missing secret!**

1. Open your Netlify dashboard
2. Go to your deployed site
3. Copy the site URL (e.g., `https://maxcode-invoice.netlify.app`)
4. Add `/.netlify/functions` at the end
5. Add this as `NETLIFY_API_URL` secret

**Example:**

```
https://maxcode-invoice-software.netlify.app/.netlify/functions
```

---

### Step 3: Verify Secret Values

**GitHub Secrets should NOT have:**

- ❌ Extra spaces
- ❌ Quotes around values
- ❌ Line breaks

**Correct Format:**

```
https://yourapp.netlify.app/.netlify/functions
```

**Incorrect Formats:**

```
"https://yourapp.netlify.app/.netlify/functions"   ❌ (has quotes)
https://yourapp.netlify.app/.netlify/functions     ❌ (extra space at end)
```

---

### Step 4: Re-run the Workflow

1. Go to **Actions** tab in your GitHub repository
2. Click on **"Auto Backup to Google Drive"**
3. Click **"Run workflow"**
4. Select branch: `main`
5. Click green **"Run workflow"** button

---

## 📋 Check Workflow Logs

If it still fails:

1. Go to **Actions** tab
2. Click on the failed workflow run
3. Click on **"backup"** job
4. Expand **"Run Backup Script"** step
5. Look for error messages (usually says which secret is missing)

---

## 🔍 Common Error Messages

### Error: "Missing required environment variables"

**Fix:** One or more GitHub Secrets are not set. Check all 6 secrets.

### Error: "NETLIFY_API_URL"

**Fix:** Add NETLIFY_API_URL secret with your Netlify Functions URL.

### Error: "Invalid credentials" or "401 Unauthorized"

**Fix:** Check Google Client ID, Client Secret, and Refresh Token are correct.

### Error: "Folder not found"

**Fix:** Verify GOOGLE_DRIVE_FOLDER_ID is correct. Open the folder in Drive and copy ID from URL.

### Error: "Request failed with status code 404"

**Fix:** Check NETLIFY_API_URL is correct and your Netlify functions are deployed.

---

## 🎯 Quick Test

Run this manually in your terminal to test credentials:

```bash
# Set environment variables
export GOOGLE_CLIENT_ID="your_client_id"
export GOOGLE_CLIENT_SECRET="your_client_secret"
export GOOGLE_REFRESH_TOKEN="your_refresh_token"
export GOOGLE_DRIVE_FOLDER_ID="your_folder_id"
export NETLIFY_API_URL="https://yourapp.netlify.app/.netlify/functions"

# Install dependencies
npm install axios googleapis

# Run backup script
node scripts/auto-backup.js
```

If this works locally, the issue is with GitHub Secrets.

---

## ✅ Success Indicators

When working correctly, you should see:

```
🚀 Starting MaxCode Invoice Software Auto Backup...
📅 Date: ...
────────────────────────────────────────────────────────────
✅ Environment variables validated
📡 API Base URL: https://yourapp.netlify.app/.netlify/functions
────────────────────────────────────────────────────────────
📥 Fetching data from MongoDB...
  → Fetching clients...
  ✅ clients: X records
  ...
☁️  Uploading to Google Drive...
✅ Backup completed successfully!
```

---

## 📞 Still Need Help?

1. Check detailed workflow logs
2. Verify all secrets are set (no typos)
3. Test Netlify functions are accessible
4. Confirm Google Drive API is enabled
5. Check OAuth credentials are valid

---

**Updated:** February 19, 2026  
**Issue:** Exit Code 1 - Missing NETLIFY_API_URL secret
