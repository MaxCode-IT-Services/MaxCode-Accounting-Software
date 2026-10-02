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

The server runs its own backup cron job — no GitHub Actions needed.
Backup runs at the time you set in **Settings → Backup → Backup Time**.

### Setup (one time)

```bash
cd /var/www/maxcode/server
bash setup-backup-cron.sh
```

### Trigger backup from anywhere (Postman / 3rd party)

```bash
curl -X POST https://your-server.com/api/backup \
  -H "Content-Type: application/json" \
  -H "X-API-Key: YOUR_BACKUP_API_KEY"
```

Or in Postman:
- **Method:** POST
- **URL:** `https://your-server.com/api/backup`
- **Header:** `X-API-Key: YOUR_BACKUP_API_KEY`
- **Body:** (empty)

The API key is in **Settings → Backup → API Key**.

### Commands

```bash
# Run backup now (ignores time check)
node backup.js --force

# Run backup (only if it's time)
node backup.js

# Get the latest backup link
node backup.js --link

# Check backup settings status
node backup.js --status

# View backup logs
tail -f /var/log/maxcode-backup.log
```

### How it works

1. Server cron runs every 10 minutes and checks the app's backup settings
2. When the time matches **Settings → Backup → Backup Time**, it runs the backup
3. Uploads to Google Drive with a **timestamped filename** (old backups are kept)
4. Outputs the backup link to the log
5. You can also trigger it manually via the API endpoint above

### Enable Google Drive backup

In the app: **Settings → Backup → Google Drive → Enable**

You need to configure:
- Google Client ID
- Google Client Secret
- Google Refresh Token
- Google Drive Folder ID

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
