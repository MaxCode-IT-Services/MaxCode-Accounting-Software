# Netlify Backend Functions

This directory contains serverless functions and backend utilities for the MaxCode Invoice application.

## Structure

```
netlify/
├── functions/          # Serverless API endpoints
│   ├── utils/         # Shared utilities
│   │   └── mongodb.js # MongoDB connection handler
│   ├── clients.js     # Client management endpoints
│   └── invoices.js    # Invoice management endpoints
└── README.md          # This file
```

## Setup

1. Install dependencies:
```bash
npm install mongodb dotenv netlify-cli
```

2. Create a `.env` file in the project root:
```
MONGODB_URI=your_mongodb_connection_string
```

3. Configure MongoDB Atlas:
   - Create a cluster at https://cloud.mongodb.com
   - Get your connection string
   - Add it to your `.env` file
   - In Netlify dashboard, add MONGODB_URI to environment variables

## Local Development

Run Netlify Dev to test functions locally:
```bash
npx netlify dev
```

## Deployment

Functions are automatically deployed when you push to your repository connected to Netlify.

## API Endpoints

Once deployed, your functions will be available at:
- `/api/clients` - Client management
- `/api/invoices` - Invoice management
