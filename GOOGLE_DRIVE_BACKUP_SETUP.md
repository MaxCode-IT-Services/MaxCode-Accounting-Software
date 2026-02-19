# Google Drive Auto Backup Setup Guide

This guide will help you set up automatic daily backups of your MaxCode Invoice Software to Google Drive using GitHub Actions.

## 🎯 Features

- ✅ **Automatic Daily Backups** at 8:00 PM IST
- ✅ **Google Drive Storage** - Single file that updates daily
- ✅ **No Manual Intervention** - Fully automated via GitHub Actions
- ✅ **FREE** - Uses GitHub Actions free tier
- ✅ **Secure** - Credentials stored as GitHub Secrets

---

## 📋 Prerequisites

1. GitHub Repository (already have it)
2. Google Account
3. Google Cloud Project with Drive API enabled

---

## 🔧 Setup Instructions

### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Click **"Create Project"**
   - Name: `MaxCode Backup`
   - Click **Create**

### Step 2: Enable Google Drive API

1. In your project, go to **"APIs & Services"** → **"Library"**
2. Search for **"Google Drive API"**
3. Click on it and press **"Enable"**

### Step 3: Create OAuth 2.0 Credentials

1. Go to **"APIs & Services"** → **"Credentials"**
2. Click **"Create Credentials"** → **"OAuth client ID"**
3. If prompted, configure **OAuth consent screen**:
   - User Type: **External**
   - App name: `MaxCode Backup`
   - User support email: Your email
   - Developer contact: Your email
   - Click **Save and Continue** (skip scopes and test users)
4. Back to **Create OAuth client ID**:
   - Application type: **Web application**
   - Name: `MaxCode Backup Client`
   - Authorized redirect URIs: `https://developers.google.com/oauthplayground`
   - Click **Create**
5. **SAVE** your `Client ID` and `Client Secret`

### Step 4: Generate Refresh Token

1. Go to [OAuth 2.0 Playground](https://developers.google.com/oauthplayground)
2. Click the **Settings (gear icon)** in top-right
3. Check **"Use your own OAuth credentials"**
4. Enter your **Client ID** and **Client Secret**
5. Close settings
6. In **Step 1** (Select & authorize APIs):
   - Scroll down and find **"Drive API v3"**
   - Select: `https://www.googleapis.com/auth/drive.file`
   - Click **"Authorize APIs"**
7. Login with your Google Account and grant permissions
8. In **Step 2** (Exchange authorization code for tokens):
   - Click **"Exchange authorization code for tokens"**
9. **COPY** the **Refresh Token** (starts with `1//`)

### Step 5: Create Google Drive Backup Folder

1. Go to [Google Drive](https://drive.google.com)
2. Create a new folder: **"MaxCode Backups"**
3. Open the folder
4. Copy the **Folder ID** from URL:
   ```
   https://drive.google.com/drive/folders/[FOLDER_ID_IS_HERE]
   ```
   Example: `1aB2cD3eF4gH5iJ6kL7mN8oP9qR0sT`

### Step 6: Add GitHub Secrets

1. Go to your GitHub repository
2. Click **Settings** → **Secrets and variables** → **Actions**
3. Click **"New repository secret"** and add these **6 secrets**:

| Secret Name              | Value                          | Description                                            |
| ------------------------ | ------------------------------ | ------------------------------------------------------ |
| `MONGODB_URI`            | Your MongoDB connection string | Already have this                                      |
| `GOOGLE_CLIENT_ID`       | Your OAuth Client ID           | From Step 3                                            |
| `GOOGLE_CLIENT_SECRET`   | Your OAuth Client Secret       | From Step 3                                            |
| `GOOGLE_REFRESH_TOKEN`   | Your Refresh Token             | From Step 4                                            |
| `GOOGLE_DRIVE_FOLDER_ID` | Your Drive Folder ID           | From Step 5                                            |
| `NETLIFY_API_URL`        | Your Netlify Functions URL     | e.g., `https://yourapp.netlify.app/.netlify/functions` |

### Step 7: Configure in Settings Page

1. Open your MaxCode Invoice Software
2. Go to **Settings** → **Backup & Restore** tab
3. Scroll to **"Google Drive Auto Backup"** section
4. Toggle **Enable** switch
5. Fill in the same credentials:
   - Client ID
   - Client Secret
   - Refresh Token
   - Folder ID
   - Backup Time (default: 20:00 / 8 PM)
6. Click **"Save Drive Configuration"**
7. Click **"Test Connection"** to verify

### Step 8: Push to GitHub

1. Commit all changes:

   ```bash
   git add .
   git commit -m "Add Google Drive auto backup"
   git push origin main
   ```

2. The workflow will automatically run daily at 8 PM IST

---

## ✅ Verification

### Check if Workflow is Active

1. Go to your GitHub repository
2. Click **"Actions"** tab
3. You should see **"Auto Backup to Google Drive"** workflow

### Test Manual Backup

1. In Actions tab, click on **"Auto Backup to Google Drive"**
2. Click **"Run workflow"** → **"Run workflow"**
3. Wait for completion (~1-2 minutes)
4. Check your Google Drive folder for `maxcode-backup-latest.json`

### View Logs

- Click on any workflow run to see detailed logs
- Check for ✅ success or ❌ errors

---

## 📅 Backup Schedule

- **Default Time**: 8:00 PM IST (14:30 UTC)
- **Frequency**: Daily
- **File Name**: `maxcode-backup-latest.json` (overwritten daily)

### Change Backup Time

Edit `.github/workflows/auto-backup.yml`:

```yaml
schedule:
  - cron: "30 14 * * *" # 8:00 PM IST
```

Cron format: `minute hour day month weekday`

Examples:

- `0 0 * * *` - Midnight (12:00 AM)
- `0 12 * * *` - Noon (12:00 PM)
- `0 18 * * *` - 6:00 PM

---

## 🔒 Security Notes

- ✅ All credentials stored as GitHub Secrets (encrypted)
- ✅ Secrets never exposed in logs
- ✅ Only you can access your Google Drive
- ⚠️ Never commit credentials to repository
- ⚠️ Keep refresh token private

---

## 🐛 Troubleshooting

### Workflow Fails

**Error: Missing credentials**

- Check all 5 GitHub Secrets are added correctly
- No extra spaces in secret values

**Error: Invalid credentials**

- Regenerate refresh token (Step 4)
- Update `GOOGLE_REFRESH_TOKEN` secret

**Error: Folder not found**

- Check Google Drive Folder ID is correct
- Ensure folder exists and is not in trash

### Connection Test Fails

- Check credentials are correct
- Ensure Google Drive API is enabled
- Try regenerating OAuth client

### No Backup File in Drive

- Check workflow ran successfully in Actions tab
- Verify folder permissions
- Check workflow logs for errors

---

## 📊 What Gets Backed Up?

The backup includes complete data from:

- ✅ Clients
- ✅ Vendors
- ✅ Staff
- ✅ Invoices / Sales
- ✅ Purchases
- ✅ RCM Records
- ✅ Projects
- ✅ Services
- ✅ Financial Years
- ✅ Business Settings

---

## 🎉 Success!

If everything is set up correctly:

1. Every day at 8 PM, GitHub Actions will run
2. Your database will be backed up
3. File will be uploaded/updated in Google Drive
4. You can download and restore anytime

---

## 📞 Support

If you face any issues:

1. Check Actions logs for error details
2. Verify all secrets are correct
3. Test connection in Settings page
4. Check Google Cloud Console for API quotas

---

**Made with ❤️ for MaxCode Invoice Software**
