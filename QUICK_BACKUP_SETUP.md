# Quick Start - Google Drive Auto Backup

## 🚀 Quick Setup (5 Minutes)

### 1. Add GitHub Secrets

Go to: **Repository** → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Add these 7 secrets:

```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/maxcode-invoice
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REFRESH_TOKEN=your-refresh-token
GOOGLE_DRIVE_FOLDER_ID=your-folder-id
NETLIFY_API_URL=https://yourapp.netlify.app/api
BACKUP_API_KEY=your-strong-random-key
```

**Generate BACKUP_API_KEY:**

```bash
openssl rand -hex 32
# OR
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

### 2. Configure in App Settings

1. Login → **Settings** → **Backup & Restore**
2. Enable **"Google Drive Auto Backup"** toggle
3. Select **Backup Frequency**:
   - Daily (recommended)
   - Weekly
   - Monthly
   - Every 4 Hours
   - Manual Only
4. Fill Google Drive credentials
5. Click **"Save Drive Configuration"**
6. Click **"Test Connection"** to verify

---

### 3. Get Google Drive Credentials

**Option 1: OAuth Playground (Easiest)**

1. Visit: https://developers.google.com/oauthplayground
2. Click **Settings** (⚙️) → Check **"Use your own OAuth credentials"**
3. Enter your `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
4. In **Step 1**: Select **"Drive API v3"** → `https://www.googleapis.com/auth/drive.file`
5. Click **"Authorize APIs"** → Login with Google
6. In **Step 2**: Click **"Exchange authorization code for tokens"**
7. Copy **"Refresh token"**

**Option 2: Google Cloud Console**

1. Create project: https://console.cloud.google.com
2. Enable **Google Drive API**
3. Create **OAuth 2.0 Client ID** credentials
4. Download credentials JSON

---

### 4. Push to GitHub

```bash
git add .
git commit -m "Setup automated backup system"
git push origin main
```

---

### 5. Test Backup

**Option A: From Settings Page**

- Click **"Run Backup Now"** button

**Option B: From GitHub Actions**

1. Go to: **Actions** tab
2. Select workflow based on your frequency:
   - Auto Backup - Daily
   - Auto Backup - Weekly
   - Auto Backup - Monthly
   - Auto Backup - Every 4 Hours
   - Manual Backup
3. Click **"Run workflow"** → **"Run workflow"**

---

## ✅ Done!

Your backup is now automated! It will:

- ✅ Run based on selected frequency
- ✅ Validate settings before each run
- ✅ Upload to Google Drive automatically
- ✅ Skip if settings don't match

---

## 🎯 What Happens Next?

**Daily Backup:** Runs at 8:00 PM IST every day  
**Weekly Backup:** Runs at 8:00 PM IST every Monday  
**Monthly Backup:** Runs at 8:00 PM IST on 1st of month  
**Every 4 Hours:** Runs at 00:00, 04:00, 08:00, 12:00, 16:00, 20:00 UTC  
**Manual Only:** Triggered only via button/Actions tab

---

## 📖 More Details

- **Full Guide:** [GITHUB_ACTIONS_BACKUP_GUIDE.md](./GITHUB_ACTIONS_BACKUP_GUIDE.md)
- **Troubleshooting:** [BACKUP_TROUBLESHOOTING.md](./BACKUP_TROUBLESHOOTING.md)
- **Complete Setup:** [GOOGLE_DRIVE_BACKUP_SETUP.md](./GOOGLE_DRIVE_BACKUP_SETUP.md)
