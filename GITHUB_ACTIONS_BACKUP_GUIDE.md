# GitHub Actions Backup Setup Guide

## 📋 Overview

MaxCode Invoice Software ab **5 different backup frequencies** support karta hai, jo aap Settings page se control kar sakte ho:

1. **Daily** - Har din 8:00 PM IST pe
2. **Weekly** - Har Monday 8:00 PM IST pe
3. **Monthly** - Har mahine ki 1st tareek ko 8:00 PM IST pe
4. **Every 4 Hours** - Har 4 ghante me (00:00, 04:00, 08:00, 12:00, 16:00, 20:00 UTC)
5. **Manual Only** - Sirf manual trigger (koi auto schedule nahi)

---

## 🚀 Setup Steps

### 1️⃣ **GitHub Secrets Add Karein**

Repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Required secrets:

```
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/maxcode-invoice
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REFRESH_TOKEN=your-google-refresh-token
GOOGLE_DRIVE_FOLDER_ID=your-google-drive-folder-id
NETLIFY_API_URL=https://billing.maxcode.in/api
BACKUP_API_KEY=your-strong-random-key
```

**BACKUP_API_KEY Generate Karein:**

```bash
# Option 1: OpenSSL
openssl rand -hex 32

# Option 2: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

### 2️⃣ **Settings Page Se Frequency Select Karein**

1. Login karein application me
2. **Settings** → **Backup & Restore** jaayein
3. **Google Drive Auto Backup** toggle ko **Enable** karein
4. **Backup Frequency** dropdown se apna pasand ka option select karein:
   - Daily
   - Weekly (Day of Week select karein)
   - Monthly (Day of Month enter karein)
   - Every 4 Hours (Interval hours set karein)
   - Manual Only (sirf button se trigger karein)
5. Google Drive credentials fill karein (Client ID, Secret, etc.)
6. **Save Drive Configuration** button click karein

---

### 3️⃣ **Kaise Kaam Karta Hai**

**Workflow Execution Flow:**

```
GitHub Actions Cron Trigger
         ↓
Check Backend Settings (API Call)
         ↓
   Is Enabled? → NO → ⏸️ Skip Backup
         ↓ YES
Frequency Match? → NO → ⏩ Skip Backup
         ↓ YES
   Run Backup Script
         ↓
 Fetch Data from Backend
         ↓
Upload to Google Drive
         ↓
  ✅ Success / ❌ Failure
```

**Smart Validation:**

- Har workflow run hone se pehle backend settings check karta hai
- Agar settings me backup **disabled** hai → Skip
- Agar frequency **match nahi** karti → Skip
- Sirf matching frequency wali backup hi chalegi

---

## 📂 Workflow Files

| File                       | Frequency     | Cron Schedule | Runs On                     |
| -------------------------- | ------------- | ------------- | --------------------------- |
| `backup-daily.yml`         | Daily         | `30 14 * * *` | 8:00 PM IST daily           |
| `backup-weekly.yml`        | Weekly        | `30 14 * * 1` | 8:00 PM IST every Monday    |
| `backup-monthly.yml`       | Monthly       | `30 14 1 * *` | 8:00 PM IST on 1st of month |
| `backup-every-4-hours.yml` | Every 4 Hours | `0 */4 * * *` | Every 4 hours               |
| `backup-manual.yml`        | Manual        | (no schedule) | Manual trigger only         |

---

## 🧪 Test Karein

### **Manual Trigger Se Test:**

1. GitHub repository me jaayein
2. **Actions** tab open karein
3. Left sidebar me apni frequency select karein (e.g., "Auto Backup - Daily")
4. **Run workflow** button click karein
5. **Run workflow** confirm karein

**Ya directly:**

```
Repository → Actions → [Select Workflow] → Run workflow → Run workflow
```

### **Logs Dekhein:**

1. Actions tab me jaayein
2. Latest workflow run click karein
3. **backup** job expand karein
4. Har step ka output dekhein:
   - ✅ Settings validated
   - 📡 Data fetched
   - ☁️ Uploaded to Drive

---

## 🛠️ Troubleshooting

### ❌ **Backup Skip Ho Raha Hai**

**Reason 1: Backup Disabled**

```
⏸️  BACKUP SKIPPED
Reason: Auto backup is disabled in settings
```

**Fix:** Settings → Enable Google Drive Auto Backup

**Reason 2: Frequency Mismatch**

```
⏩ BACKUP SKIPPED
Reason: Frequency mismatch (Expected: daily, Got: weekly)
```

**Fix:** Settings → Change Backup Frequency to match workflow

---

### ❌ **Environment Variables Missing**

```
❌ Missing required environment variables:
   • GOOGLE_CLIENT_ID
   • BACKUP_API_KEY
```

**Fix:** GitHub Secrets properly add karein (Step 1 dekhein)

---

### ❌ **Google Drive Upload Fail**

```
❌ GOOGLE OAUTH ERROR: invalid_grant
```

**Fix:** Refresh Token regenerate karein:

1. https://developers.google.com/oauthplayground
2. Settings → Use your own OAuth credentials
3. Enter Client ID & Secret
4. Authorize & get new Refresh Token
5. Update `GOOGLE_REFRESH_TOKEN` secret

---

## 📊 Monitoring

**Check Backup Status:**

1. **GitHub Actions Tab:** Recent runs aur logs
2. **Google Drive Folder:** Latest backup file (`maxcode-backup-latest.json`)
3. **Artifacts:** Download backup from Actions → Workflow Run → Artifacts

**Artifact Retention:**

- Daily/Weekly: 7 days
- Every 4 Hours: 2 days
- Monthly: 30 days
- Manual: 14 days

---

## 🔄 Multiple Frequencies Ek Saath

**Kya aap 2+ frequencies ek saath enable kar sakte ho?**

**Haan!** Lekin:

- Settings me sirf **ek frequency** select kar sakte ho
- Baaki workflows manual trigger kar sakte ho
- Ya alag-alag `.env` settings ke saath multiple repos/branches use karein

**Recommended:** Ek hi frequency use karein confusion avoid karne ke liye.

---

## 📝 Migration from Old Workflow

Agar aapne purani `auto-backup.yml` workflow use ki thi:

1. ✅ Wo ab **deprecated** mark hai
2. ✅ Schedule automatically disabled ho gaya
3. ✅ Naye frequency-specific workflows automatically active hain
4. ✅ Koi action nahi chahiye - sab settings page se control ho jayega

---

## 🎯 Best Practices

1. **Daily Backup** production ke liye recommend hai
2. **Every 4 Hours** high-activity businesses ke liye
3. **Manual** testing environment ke liye
4. **Monthly** archive purposes ke liye

**Security:**

- GitHub Secrets kabhi commit/push mat karein
- BACKUP_API_KEY strong aur unique rakhein
- Regular basis pe check karein ki backups ho rahi hain

---

## 📞 Support

Issues ya questions ke liye:

- Settings page ka "Test Connection" button use karein
- GitHub Actions logs dekhein
- Backend logs check karein (Netlify Functions)

---

**Last Updated:** February 2026  
**Version:** 2.0 (Frequency-Based Workflows)
