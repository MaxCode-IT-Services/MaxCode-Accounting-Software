# Quick Start Guide

Get your MaxCode Invoice app up and running in 5 minutes!

## 1. Install Dependencies (2 min)

```bash
# Option 1: NPM
npm run install:all

# Option 2: Make (if you have make installed)
make install

# Option 3: Manual
npm install
cd backend && npm install && cd ..
cd maxcode-invoice-software && npm install && cd ..
```

## 2. Setup MongoDB (3 min)

### MongoDB Atlas (Cloud - Recommended)

1. Go to https://cloud.mongodb.com and sign up
2. Create a FREE cluster (M0 Sandbox)
3. Create database user:
   - Username: `maxcode_user`
   - Password: `YourSecurePassword123`
4. Get connection string from "Connect" button
5. Whitelist IP: `0.0.0.0/0` (for development)

### Setup .env file

```bash
# Copy the example file
cp .env.example backend/.env

# Edit with your MongoDB URI
nano backend/.env
```

Add your connection string:

```env
MONGODB_URI=mongodb+srv://maxcode_user:YourSecurePassword123@cluster0.xxxxx.mongodb.net/maxcode-invoice?retryWrites=true&w=majority
```

## 3. Run Locally

```bash
# Start both frontend and backend
npm run dev

# Or use Make
make dev

# Or run separately
npm run dev:frontend  # http://localhost:5173
npm run dev:backend   # http://localhost:8888
```

## 4. Test the API

Open browser and test endpoints:

```
http://localhost:8888/api/clients
http://localhost:8888/api/invoices
```

## 5. Deploy to Netlify (Optional)

### Quick Deploy

```bash
# Install Netlify CLI globally
npm install -g netlify-cli

# Login
netlify login

# Deploy
npm run deploy
```

### Or use Netlify Dashboard

1. Push code to GitHub
2. Go to https://app.netlify.com
3. Click "Add new site" → Import from Git
4. Select your repo
5. Add `MONGODB_URI` to environment variables
6. Deploy!

## Common Issues

### "Cannot connect to MongoDB"

- Check your connection string in `backend/.env`
- Verify IP whitelist in MongoDB Atlas
- Make sure you replaced `<username>` and `<password>`

### "Port already in use"

- Kill existing process: `lsof -ti:5173 | xargs kill`
- Or change port in `vite.config.js`

### "Module not found"

- Run `npm run install:all` again
- Clear cache: `rm -rf node_modules **/node_modules && npm run install:all`

## What's Next?

- Read [README.md](README.md) for full project overview
- Check [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment instructions
- Review [backend/netlify/README.md](backend/netlify/README.md) for API documentation

## Quick Commands

```bash
make help           # See all available commands
make dev            # Start development
make build          # Build for production
make deploy         # Deploy to Netlify
make clean          # Clean build artifacts
make reset          # Clean and reinstall
```

---

**Ready?** Run `npm run dev` and open http://localhost:5173 🚀
