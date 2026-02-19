# Quick Start - Google Drive Auto Backup

## 🚀 Quick Setup (5 Minutes)

### 1. Get Google Drive Credentials

```bash
# Use this tool to get credentials quickly
# https://developers.google.com/oauthplayground
```

### 2. Add GitHub Secrets

Go to: `Settings` → `Secrets and variables` → `Actions`

Add these 6 secrets:

```
MONGODB_URI
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_REFRESH_TOKEN
GOOGLE_DRIVE_FOLDER_ID
NETLIFY_API_URL
```

**Example NETLIFY_API_URL:**

```
https://yourapp.netlify.app/.netlify/functions
```

### 3. Push to GitHub

```bash
git add .
git commit -m "Setup auto backup"
git push origin main
```

### 4. Test

Go to: `Actions` → `Auto Backup to Google Drive` → `Run workflow`

---

## 📱 Configure in App

1. Open Settings → Backup & Restore
2. Enable "Google Drive Auto Backup"
3. Fill credentials
4. Save & Test Connection

---

## ✅ Done!

Backup runs daily at 8 PM IST automatically.

📖 **Full Guide:** [GOOGLE_DRIVE_BACKUP_SETUP.md](./GOOGLE_DRIVE_BACKUP_SETUP.md)
