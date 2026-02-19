# 🔧 Backup System Troubleshooting Guide

This guide helps you resolve common errors when running the automated backup system.

---

## 🚨 Error 1: ALL API ENDPOINTS RETURNING 404

### **Symptoms:**

```
❌ Error fetching clients: API endpoint not found (404)
❌ Error fetching vendors: API endpoint not found (404)
❌ Error fetching staff: API endpoint not found (404)
... (all endpoints fail)
```

### **Root Cause:**

Your `NETLIFY_API_URL` is **incorrect** or your **Netlify Functions are not deployed**.

### **Solution Steps:**

#### **Step 1: Find Your Correct Netlify URL**

1. Go to **Netlify Dashboard**: https://app.netlify.com
2. Click on your **MaxCode Invoice** site
3. Copy your site URL from the top (e.g., `https://maxcode-invoice.netlify.app`)
4. Your API URL should be: `https://maxcode-invoice.netlify.app/.netlify/functions`

#### **Step 2: Verify Functions Are Deployed**

1. In Netlify Dashboard, go to **Functions** tab
2. You should see these functions listed:
   - `auth`
   - `clients`
   - `vendors`
   - `staff`
   - `invoices`
   - `purchases`
   - `rcm`
   - `projects`
   - `services`
   - `years`
   - `business-settings`

3. If functions are **NOT showing**, you need to deploy your backend:
   ```bash
   cd backend
   git add .
   git commit -m "Deploy backend functions"
   git push
   ```

#### **Step 3: Test API Endpoint Manually**

Open a browser or use `curl` to test:

```bash
# Test clients endpoint
curl https://YOUR-SITE.netlify.app/.netlify/functions/clients

# Should return JSON data (success) or authentication error (also success - means endpoint works)
```

If you get **404**, your functions are not deployed correctly.

#### **Step 4: Update GitHub Secret**

1. Go to your GitHub repository
2. **Settings** → **Secrets and variables** → **Actions**
3. Find `NETLIFY_API_URL` secret
4. Click **Update** and enter the correct URL:
   ```
   https://YOUR-SITE.netlify.app/.netlify/functions
   ```

#### **Step 5: Re-run Backup**

**Locally:**

```bash
node scripts/auto-backup.js
```

**On GitHub:**

- Go to **Actions** tab
- Select **Auto Backup** workflow
- Click **Run workflow** → **Run workflow**

---

## 🚨 Error 2: Google OAuth invalid_grant

### **Symptoms:**

```
❌ GOOGLE OAUTH ERROR: invalid_grant
```

### **Root Cause:**

Your `GOOGLE_REFRESH_TOKEN` has **expired** or is **invalid**.

**Note:** Google refresh tokens expire after:

- 7 days of inactivity (for testing apps)
- When OAuth consent screen is not verified
- When credentials are regenerated

### **Solution Steps:**

#### **Step 1: Generate New Refresh Token**

1. Go to **OAuth 2.0 Playground**: https://developers.google.com/oauthplayground

2. Click **Settings icon (⚙️)** in top right

3. Check **"Use your own OAuth credentials"**

4. Enter your credentials:
   - **OAuth Client ID**: (from Google Cloud Console)
   - **OAuth Client secret**: (from Google Cloud Console)

5. Close Settings

#### **Step 2: Authorize Drive API**

1. In **Step 1** (Select & authorize APIs):
   - Find **Drive API v3**
   - Check: `https://www.googleapis.com/auth/drive.file`

2. Click **Authorize APIs**

3. **Login with your Google account** where you want backups saved

4. Click **Allow** to grant permissions

#### **Step 3: Get Refresh Token**

1. In **Step 2** (Exchange authorization code for tokens):
   - Click **Exchange authorization code for tokens**

2. You'll see:

   ```json
   {
     "access_token": "...",
     "refresh_token": "1//..."
   }
   ```

3. **Copy the `refresh_token`** (starts with `1//`)

#### **Step 4: Update GitHub Secret**

1. Go to your GitHub repository
2. **Settings** → **Secrets and variables** → **Actions**
3. Find `GOOGLE_REFRESH_TOKEN` secret
4. Click **Update** and paste the new refresh token

#### **Step 5: Update Settings Page (Optional)**

To keep your local config in sync:

1. Open your app: http://localhost:5173
2. Login and go to **Settings**
3. Click **Backup & Restore** tab
4. Scroll to **Google Drive Auto Backup**
5. Paste the new **Refresh Token**
6. Click **Save Configuration**

#### **Step 6: Re-run Backup**

**Locally:**

```bash
node scripts/auto-backup.js
```

**On GitHub:**

- Go to **Actions** tab
- Select **Auto Backup** workflow
- Click **Run workflow** → **Run workflow**

---

## ✅ Successful Backup Output

When everything is configured correctly, you should see:

```
🚀 Starting MaxCode Invoice Software Auto Backup...
📅 Date: 2024-01-15 8:00:00 PM

✅ All required environment variables present

📡 Fetching data from MaxCode Invoice Atlas API...
  → Fetching clients...
  ✅ clients: 45 records
  → Fetching vendors...
  ✅ vendors: 23 records
  → Fetching staff...
  ✅ staff: 8 records
  ... (all collections)

💾 Saving backup to backup-maxcode-2024-01-15.json...
✅ Backup saved locally

☁️  Uploading to Google Drive...
  → Updating existing file (ID: 1abc...)
✅ Backup updated in Google Drive
📂 File ID: 1abc...
🔗 View Link: https://drive.google.com/file/d/...

✨ Backup completed successfully!
```

---

## 🔍 Quick Diagnosis Checklist

Before running backup, verify:

- [ ] **Netlify site is deployed** (check dashboard)
- [ ] **Backend functions are visible** in Netlify Functions tab
- [ ] **NETLIFY_API_URL format**: `https://site.netlify.app/.netlify/functions`
- [ ] **Google Cloud Project is created**
- [ ] **Drive API is enabled** in Google Cloud Console
- [ ] **OAuth credentials are created** (Client ID & Secret)
- [ ] **Refresh token is recently generated** (< 7 days old for test apps)
- [ ] **All 6 GitHub Secrets are set**: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GOOGLE_DRIVE_FOLDER_ID, NETLIFY_API_URL, MONGODB_URI

---

## 🆘 Still Having Issues?

### **Check GitHub Actions Logs:**

1. Go to **Actions** tab in your repo
2. Click on failed workflow run
3. Click on **Backup MaxCode Data** job
4. Expand each step to see detailed error messages

### **Test Locally First:**

Always test backup script locally before relying on GitHub Actions:

```bash
# Set environment variables
$env:GOOGLE_CLIENT_ID="your-client-id"
$env:GOOGLE_CLIENT_SECRET="your-client-secret"
$env:GOOGLE_REFRESH_TOKEN="your-refresh-token"
$env:GOOGLE_DRIVE_FOLDER_ID="your-folder-id"
$env:NETLIFY_API_URL="https://your-site.netlify.app/.netlify/functions"

# Run backup
node scripts/auto-backup.js
```

### **Common Mistakes:**

- ❌ Using `http://` instead of `https://` in NETLIFY_API_URL
- ❌ Forgetting `/.netlify/functions` at the end of URL
- ❌ Using expired refresh token
- ❌ Using wrong Google account (token from different account than folder owner)
- ❌ Not deploying backend to Netlify after code changes

---

## 📚 Related Documentation

- **Complete Setup Guide**: [GOOGLE_DRIVE_BACKUP_SETUP.md](./GOOGLE_DRIVE_BACKUP_SETUP.md)
- **Quick Setup**: [QUICK_BACKUP_SETUP.md](./QUICK_BACKUP_SETUP.md)
- **Implementation Details**: [AUTO_BACKUP_SUMMARY.md](./AUTO_BACKUP_SUMMARY.md)

---

**Last Updated:** January 2025
