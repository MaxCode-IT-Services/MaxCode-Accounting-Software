# Server Deployment Guide

This software can be deployed to **any Node.js platform** (Azure, DigitalOcean, VPS, etc.) using GitHub Actions.

## How it works

```
Push to vps-server branch → GitHub Actions builds → SCP to server → PM2 restart
```

- **Build happens on GitHub** — server RAM stays free
- **Server only serves** — no build tools needed on server
- **Netlify keeps working** — `main` branch push → Netlify auto-deploy (unchanged)
- **VPS deploy** — `vps-server` branch push → auto-deploy to your server

## Server Requirements

- Node.js 20+
- PM2 (`npm install -g pm2`)
- SSH access (for GitHub Actions deploy)

## Initial Server Setup

### 1. Create deployment directory

```bash
sudo mkdir -p /var/www/maxcode
sudo chown -R $USER:$USER /var/www/maxcode
```

### 2. Install PM2

```bash
npm install -g pm2
```

### 3. Configure environment variables

```bash
cd /var/www/maxcode
cp server/.env.example backend/.env
nano backend/.env  # Fill in your values
```

### 4. Set up GitHub Secrets

In your GitHub repo → **Settings → Secrets and variables → Actions**, add:

| Secret | Description |
|---|---|
| `SERVER_HOST` | Server IP or hostname |
| `SERVER_USER` | SSH username (e.g., `root`, `ubuntu`, `deploy`) |
| `SERVER_SSH_KEY` | SSH private key (full content) |
| `SERVER_PORT` | SSH port (default: `22`) |

### 5. Generate SSH key for deploy

On your server:
```bash
ssh-keygen -t ed25519 -C "github-deploy" -f ~/.ssh/github_deploy
cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys
cat ~/.ssh/github_deploy  # Copy this to GitHub Secrets as SERVER_SSH_KEY
```

## Deploy

Push to `vps-server` branch — GitHub Actions automatically builds and deploys to your server.

```bash
# Create the branch (one time)
git checkout -b vps-server

# Push to deploy
git push origin vps-server
```

**Netlify** keeps working on `main` branch — no changes needed.

## Google Drive Backup

The server runs its own built-in backup cron — no GitHub Actions and no
external cron service needed. It starts automatically with the Express server
(`server/backup-scheduler.js`) and uses the same schedule logic as the app:

1. Every 30 minutes it checks the backup settings from the database
2. When the schedule matches **Settings → Backup & Restore** (enabled,
   frequency, backup time, day of week…), it runs the backup
3. Uploads the FULL backup to Google Drive in **both formats**, updating the
   same rolling files (no duplicates, no timestamped copies):
   - `maxcode-backup-latest.bson`
   - `maxcode-backup-latest.json`
4. Saves the run in the app's backup history (`backup_runs` collection)

### Enable Google Drive backup

In the app: **Settings → Backup & Restore → Google Drive Auto Backup → Enable**

You need to configure:
- Google Client ID
- Google Client Secret
- Google Refresh Token
- Google Drive Folder ID

### Trigger a backup from outside (cron-job.org / Azure Logic Apps / Postman)

The same backup can also be triggered by any external cron service via the
`backup-cron` endpoint (also uploads BSON + JSON):

```bash
curl -X POST https://your-server.com/api/backup-cron \
  -H "X-Api-Key: YOUR_BACKUP_API_KEY"
```

Or in cron-job.org:
- **Method:** POST (or GET)
- **URL:** `https://your-server.com/api/backup-cron`
- **Header:** `X-Api-Key: YOUR_BACKUP_API_KEY`
- **Period:** custom (e.g. every 24 hours)

The API key is in **Settings → Backup → API Key** and must also be set as the
`BACKUP_API_KEY` environment variable on the server.

## Useful Commands

```bash
# View logs
pm2 logs maxcode

# Restart
pm2 restart maxcode

# Stop
pm2 stop maxcode

# Monitor
pm2 monit
```

## Project Structure

```
/var/www/maxcode/
├── backend/
│   ├── netlify/functions/    # API functions (same as Netlify)
│   ├── package.json
│   └── .env                  # Environment variables
├── maxcode-invoice-software/
│   └── dist/                 # Built frontend
└── server/
    ├── server.js             # Express server
    ├── package.json
    └── ecosystem.config.js   # PM2 config
```
