# MaxCode Invoice Software - Deployment Guide

Complete guide for deploying your MaxCode Invoice application to Netlify with MongoDB backend.

## 📁 Project Structure

```
MaxCode-Invoice/
├── .github/
│   └── workflows/
│       └── deploy.yml           # GitHub Actions CI/CD
├── backend/
│   ├── netlify/
│   │   ├── functions/
│   │   │   ├── clients.js       # Client API endpoints
│   │   │   ├── invoices.js      # Invoice API endpoints
│   │   │   └── utils/
│   │   │       └── mongodb.js   # Database connection
│   │   └── README.md
│   ├── .env.example
│   ├── .gitignore
│   ├── netlify.toml
│   └── package.json
├── maxcode-invoice-software/    # Frontend React App
│   ├── src/
│   ├── public/
│   ├── package.json
│   └── vite.config.js
├── .env.example
├── .gitignore
├── netlify.toml                 # Root Netlify config
├── package.json                 # Root package.json
└── DEPLOYMENT.md                # This file
```

## 🚀 Quick Start Deployment

### Prerequisites

- Node.js 18+ and npm 9+
- Git repository (GitHub, GitLab, or Bitbucket)
- Netlify account (free tier available)
- MongoDB Atlas account (free tier available)

### Step 1: MongoDB Setup

1. **Create MongoDB Atlas Account**
   - Go to [MongoDB Atlas](https://cloud.mongodb.com)
   - Sign up for a free account
   - Create a new cluster (M0 Sandbox - Free)

2. **Configure Database**
   ```
   - Create a database named: maxcode-invoice
   - Create a database user with read/write permissions
   - Get your connection string
   ```

3. **Whitelist IPs**
   - Go to Network Access
   - Add IP Address: `0.0.0.0/0` (allow from anywhere)
   - Or add specific Netlify IPs

4. **Get Connection String**
   ```
   mongodb+srv://<username>:<password>@cluster.mongodb.net/maxcode-invoice?retryWrites=true&w=majority
   ```

### Step 2: Local Development Setup

1. **Clone and Install**
   ```bash
   git clone <your-repo-url>
   cd MaxCode-Invoice
   npm run install:all
   ```

2. **Configure Environment Variables**
   ```bash
   # Copy environment template
   cp .env.example backend/.env
   
   # Edit backend/.env and add your MongoDB URI
   nano backend/.env
   ```

   Add your MongoDB connection string:
   ```env
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/maxcode-invoice
   ```

3. **Run Locally**
   ```bash
   # Run both frontend and backend
   npm run dev
   
   # Or run separately:
   npm run dev:frontend  # Frontend on http://localhost:5173
   npm run dev:backend   # Backend on http://localhost:8888
   ```

### Step 3: Deploy to Netlify

#### Option A: Netlify Dashboard (Recommended for First Deployment)

1. **Connect Repository**
   - Go to [Netlify Dashboard](https://app.netlify.com)
   - Click "Add new site" → "Import an existing project"
   - Choose your Git provider and repository
   - Select the `main` branch

2. **Configure Build Settings**
   ```
   Base directory: maxcode-invoice-software
   Build command: npm run build
   Publish directory: maxcode-invoice-software/dist
   Functions directory: ../backend/netlify/functions
   ```

3. **Add Environment Variables**
   - Go to Site settings → Environment variables
   - Add the following:
     ```
     MONGODB_URI = your_mongodb_connection_string
     DB_NAME = maxcode-invoice
     ```

4. **Deploy**
   - Click "Deploy site"
   - Wait for build to complete
   - Your site will be live at: `https://your-site-name.netlify.app`

#### Option B: Netlify CLI

1. **Install Netlify CLI**
   ```bash
   npm install -g netlify-cli
   ```

2. **Login to Netlify**
   ```bash
   netlify login
   ```

3. **Initialize Site**
   ```bash
   netlify init
   ```

4. **Set Environment Variables**
   ```bash
   netlify env:set MONGODB_URI "your_connection_string"
   netlify env:set DB_NAME "maxcode-invoice"
   ```

5. **Deploy**
   ```bash
   # Deploy preview
   npm run deploy:backend
   npm run deploy:frontend
   
   # Or deploy everything
   npm run deploy
   ```

#### Option C: Automatic CI/CD with GitHub Actions

1. **Set GitHub Secrets**
   - Go to your repository → Settings → Secrets and variables → Actions
   - Add the following secrets:
     ```
     NETLIFY_AUTH_TOKEN = your_netlify_auth_token
     NETLIFY_SITE_ID = your_netlify_site_id
     ```

2. **Get Netlify Tokens**
   ```bash
   # Get auth token
   netlify login
   netlify --telemetry-disable
   
   # Get site ID from Netlify dashboard
   # Site settings → General → Site details → Site ID
   ```

3. **Push to Main Branch**
   ```bash
   git add .
   git commit -m "Deploy to Netlify"
   git push origin main
   ```
   
   GitHub Actions will automatically build and deploy!

## 🔧 Available NPM Scripts

### Root Level Scripts

```bash
npm run install:all      # Install all dependencies (root, frontend, backend)
npm run dev             # Run both frontend and backend concurrently
npm run dev:frontend    # Run frontend only
npm run dev:backend     # Run backend only
npm run build           # Build both frontend and backend
npm run build:frontend  # Build frontend only
npm run build:backend   # Build backend only
npm run deploy          # Deploy both to Netlify
npm run deploy:frontend # Deploy frontend only
npm run deploy:backend  # Deploy backend only
npm run lint:frontend   # Lint frontend code
```

### Frontend Scripts (maxcode-invoice-software/)

```bash
npm run dev      # Start Vite dev server
npm run build    # Build for production
npm run preview  # Preview production build
npm run lint     # Run ESLint
```

### Backend Scripts (backend/)

```bash
npm run dev               # Start Netlify dev server
npm run build            # Prepare backend for deployment
npm run deploy           # Deploy to Netlify production
npm run deploy:preview   # Deploy preview version
npm run functions:invoke # Test individual functions
```

## 🌐 API Endpoints

Once deployed, your API will be available at:

### Clients API
- `GET /api/clients` - Get all clients
- `GET /api/clients?id={id}` - Get client by ID
- `POST /api/clients` - Create new client
- `PUT /api/clients?id={id}` - Update client
- `DELETE /api/clients?id={id}` - Delete client

### Invoices API
- `GET /api/invoices` - Get all invoices
- `GET /api/invoices?id={id}` - Get invoice by ID
- `GET /api/invoices?clientId={clientId}` - Get invoices by client
- `POST /api/invoices` - Create new invoice
- `PUT /api/invoices?id={id}` - Update invoice
- `DELETE /api/invoices?id={id}` - Delete invoice

## 📝 Using the API in Your React App

```javascript
// Example: Fetch all clients
const fetchClients = async () => {
  try {
    const response = await fetch('/api/clients');
    const clients = await response.json();
    return clients;
  } catch (error) {
    console.error('Error fetching clients:', error);
  }
};

// Example: Create new client
const createClient = async (clientData) => {
  try {
    const response = await fetch('/api/clients', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(clientData),
    });
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error creating client:', error);
  }
};

// Example: Update client
const updateClient = async (id, clientData) => {
  try {
    const response = await fetch(`/api/clients?id=${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(clientData),
    });
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error updating client:', error);
  }
};

// Example: Delete client
const deleteClient = async (id) => {
  try {
    const response = await fetch(`/api/clients?id=${id}`, {
      method: 'DELETE',
    });
    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Error deleting client:', error);
  }
};
```

## 🔒 Security Best Practices

1. **Environment Variables**
   - Never commit `.env` files
   - Use different MongoDB databases for dev/staging/production
   - Rotate credentials regularly

2. **MongoDB Security**
   - Use strong passwords
   - Enable IP whitelisting
   - Use connection string encryption
   - Enable monitoring and alerts

3. **API Security**
   - Implement rate limiting
   - Add input validation
   - Consider adding authentication (JWT, OAuth)
   - Use HTTPS only (Netlify provides this automatically)

4. **Headers**
   - The netlify.toml includes security headers
   - Consider adding Content Security Policy (CSP)

## 🐛 Troubleshooting

### Build Fails

```bash
# Clear caches and reinstall
rm -rf node_modules package-lock.json
rm -rf maxcode-invoice-software/node_modules maxcode-invoice-software/package-lock.json
rm -rf backend/node_modules backend/package-lock.json
npm run install:all
```

### MongoDB Connection Issues

1. Check connection string format
2. Verify database user credentials
3. Confirm IP whitelist settings
4. Check MongoDB cluster status
5. Verify environment variables in Netlify

### Functions Not Working

1. Check Netlify function logs in dashboard
2. Verify functions directory path in netlify.toml
3. Test functions locally with `netlify dev`
4. Check function syntax and imports

### API Errors

```bash
# Test function locally
cd backend
netlify functions:invoke clients

# Check logs
netlify logs:function clients
```

## 📊 Monitoring & Logs

### Netlify Dashboard
- Go to your site → Functions
- View function logs and analytics
- Monitor build and deploy logs

### MongoDB Atlas
- Go to your cluster → Metrics
- Monitor database performance
- Set up alerts for issues

## 🔄 Continuous Deployment

Every push to `main` branch will trigger:
1. GitHub Actions workflow
2. Install dependencies
3. Run linting
4. Build frontend and backend
5. Deploy to Netlify
6. Run post-deployment tests (if configured)

## 📚 Additional Resources

- [Netlify Documentation](https://docs.netlify.com)
- [MongoDB Atlas Documentation](https://docs.atlas.mongodb.com)
- [Netlify Functions Guide](https://docs.netlify.com/functions/overview/)
- [React Deployment Guide](https://vitejs.dev/guide/static-deploy.html)

## 🆘 Need Help?

- Check the [backend/netlify/README.md](backend/netlify/README.md) for API details
- Review Netlify function logs
- Check MongoDB Atlas connection status
- Verify environment variables are set correctly

## 📝 License

MIT License - see LICENSE file for details
