# MaxCode Invoice Software - Setup Guide

## Netlify Backend Setup

Your project now has a dedicated `netlify/` subdirectory containing all backend functions and MongoDB integrations.

### Directory Structure

```
netlify/
├── functions/
│   ├── clients.js      # Client CRUD operations
│   ├── invoices.js     # Invoice CRUD operations
│   └── utils/
│       └── mongodb.js  # MongoDB connection utility
└── README.md           # Backend documentation
```

### Setup Steps

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure MongoDB:**
   - Create a free cluster at [MongoDB Atlas](https://cloud.mongodb.com)
   - Get your connection string
   - Copy `.env.example` to `.env`
   - Add your MongoDB URI to `.env`:
     ```
     MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/maxcode-invoice
     ```

3. **Test locally:**
   ```bash
   npm run netlify:dev
   ```
   Your API will be available at `http://localhost:8888/api/`

4. **Deploy to Netlify:**
   - Push your code to GitHub/GitLab/Bitbucket
   - Connect your repository to Netlify
   - Add `MONGODB_URI` environment variable in Netlify dashboard (Site settings → Environment variables)
   - Deploy!

### API Endpoints

Once deployed, you can access:

- **Clients API:**
  - `GET /api/clients` - Get all clients
  - `GET /api/clients?id={id}` - Get specific client
  - `POST /api/clients` - Create new client
  - `PUT /api/clients?id={id}` - Update client
  - `DELETE /api/clients?id={id}` - Delete client

- **Invoices API:**
  - `GET /api/invoices` - Get all invoices
  - `GET /api/invoices?id={id}` - Get specific invoice
  - `GET /api/invoices?clientId={clientId}` - Get invoices by client
  - `POST /api/invoices` - Create new invoice
  - `PUT /api/invoices?id={id}` - Update invoice
  - `DELETE /api/invoices?id={id}` - Delete invoice

### Using the API in Your React App

Example fetch call:

```javascript
// Get all clients
const response = await fetch('/api/clients');
const clients = await response.json();

// Create a new client
const response = await fetch('/api/clients', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'John Doe',
    email: 'john@example.com',
    phone: '555-1234'
  })
});
```

### Next Steps

1. Customize the API functions to match your data schema
2. Add authentication (e.g., Netlify Identity)
3. Add validation and error handling
4. Create additional API endpoints as needed

For more details, see [netlify/README.md](netlify/README.md)
