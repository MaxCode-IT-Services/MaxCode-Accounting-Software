# MaxCode Invoice Software

Full-stack invoice management application with React frontend and MongoDB backend deployed on Netlify.

## 🚀 Features

- **Client Management** - Create, read, update, and delete clients
- **Invoice Management** - Generate and manage invoices
- **Serverless Backend** - Netlify Functions with MongoDB
- **Responsive UI** - Built with React and Bootstrap
- **Export Capabilities** - PDF and Excel export
- **Real-time Updates** - Modern React state management

## 📋 Prerequisites

- Node.js 18+ and npm 9+
- MongoDB Atlas account (free tier available)
- Netlify account (free tier available)
- Git

## 🛠️ Quick Start

### 1. Install Dependencies

```bash
# Install all dependencies for frontend, backend, and root
npm run install:all
```

### 2. Configure MongoDB

1. Create a MongoDB Atlas account at https://cloud.mongodb.com
2. Create a new cluster (free M0 tier)
3. Create a database user
4. Get your connection string
5. Copy `.env.example` to `backend/.env`
6. Add your MongoDB URI to `backend/.env`:

```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/maxcode-invoice
```

### 3. Run Locally

```bash
# Run both frontend and backend
npm run dev

# Or run separately:
npm run dev:frontend  # http://localhost:5173
npm run dev:backend   # http://localhost:8888
```

### 4. Build for Production

```bash
npm run build
```

### 5. Deploy to Netlify

See [DEPLOYMENT.md](DEPLOYMENT.md) for detailed deployment instructions.

Quick deploy:
```bash
npm run deploy
```

## 📁 Project Structure

```
MaxCode-Invoice/
├── backend/                     # Backend serverless functions
│   ├── netlify/functions/      # API endpoints
│   │   ├── clients.js          # Client CRUD operations
│   │   ├── invoices.js         # Invoice CRUD operations
│   │   └── utils/mongodb.js    # Database connection
│   └── package.json
├── maxcode-invoice-software/   # Frontend React app
│   ├── src/
│   │   ├── Components/         # React components
│   │   ├── Pages/             # Page components
│   │   └── main.jsx           # Entry point
│   └── package.json
├── .github/workflows/          # CI/CD configuration
├── netlify.toml               # Netlify configuration
├── package.json              # Root package.json
├── DEPLOYMENT.md             # Detailed deployment guide
└── README.md                # This file
```

## 📚 Documentation

- **[DEPLOYMENT.md](DEPLOYMENT.md)** - Complete deployment guide
- **[backend/netlify/README.md](backend/netlify/README.md)** - Backend API documentation
- **[backend/SETUP.md](backend/SETUP.md)** - Backend setup guide

## 🔌 API Endpoints

All API endpoints are available at `/api/*`:

### Clients
- `GET /api/clients` - List all clients
- `POST /api/clients` - Create client
- `PUT /api/clients?id={id}` - Update client
- `DELETE /api/clients?id={id}` - Delete client

### Invoices
- `GET /api/invoices` - List all invoices
- `POST /api/invoices` - Create invoice
- `PUT /api/invoices?id={id}` - Update invoice
- `DELETE /api/invoices?id={id}` - Delete invoice

## 🛠️ Development Scripts

### Root Level
```bash
npm run install:all      # Install all dependencies
npm run dev             # Run frontend and backend
npm run build           # Build everything
npm run deploy          # Deploy to Netlify
```

### Frontend
```bash
cd maxcode-invoice-software
npm run dev      # Start dev server
npm run build    # Build for production
npm run lint     # Lint code
```

### Backend
```bash
cd backend
npm run dev               # Start Netlify dev server
npm run deploy           # Deploy to Netlify
npm run functions:invoke # Test functions
```

## 🔒 Environment Variables

Required environment variables for deployment:

```env
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/dbname
DB_NAME=maxcode-invoice
```

Set these in:
- Local: `backend/.env` file
- Netlify: Site settings → Environment variables

## 🚀 Deployment

### Via Netlify Dashboard

1. Connect your Git repository
2. Configure build settings:
   - Base: `maxcode-invoice-software`
   - Build: `npm run build`
   - Publish: `maxcode-invoice-software/dist`
   - Functions: `../backend/netlify/functions`
3. Add environment variables
4. Deploy!

### Via CLI

```bash
npm install -g netlify-cli
netlify login
netlify init
netlify env:set MONGODB_URI "your_connection_string"
npm run deploy
```

### Via GitHub Actions

Push to `main` branch and GitHub Actions will automatically deploy!

## 🐛 Troubleshooting

### Build Issues
```bash
# Clear everything and reinstall
rm -rf node_modules **/node_modules package-lock.json **/package-lock.json
npm run install:all
```

### Cannot Connect to MongoDB
1. Check connection string in `.env`
2. Verify IP whitelist in MongoDB Atlas
3. Confirm database user credentials
4. Check environment variables in Netlify

### Functions Not Working
1. Check Netlify function logs
2. Test locally with `netlify dev`
3. Verify function paths in `netlify.toml`

## 📊 Tech Stack

### Frontend
- React 19
- Vite
- React Router
- React Bootstrap
- jsPDF (PDF generation)
- XLSX (Excel export)

### Backend
- Netlify Functions (Serverless)
- MongoDB Atlas
- Node.js 18+

### Deployment
- Netlify (Hosting + Functions)
- GitHub Actions (CI/CD)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📝 License

MIT License

## 👥 Authors

MaxCode Team

## 🆘 Support

- Check [DEPLOYMENT.md](DEPLOYMENT.md) for deployment help
- Review function logs in Netlify dashboard
- Check MongoDB Atlas monitoring

---

**Ready to deploy?** See [DEPLOYMENT.md](DEPLOYMENT.md) for complete instructions!
