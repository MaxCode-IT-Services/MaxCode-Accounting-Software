# Authentication & Security Setup

## JWT Authentication (1-Year Token)

Your API endpoints are now secured with JWT authentication. The system uses a simple, single-token approach with 1-year expiry.

### Environment Variables

Add to `backend/.env` and Netlify environment variables:

```env
# JWT Secret (CHANGE THIS IN PRODUCTION!)
JWT_SECRET=your-super-secret-jwt-key-change-me-in-production

# Optional: Custom token expiry (default: 365d)
JWT_EXPIRES_IN=365d
```

### API Endpoints

#### 🔐 Authentication (No Token Required)

**POST /api/auth**

All auth actions use the same endpoint with different `action` values in the request body.

##### Login

```javascript
POST /api/auth
{
  "action": "login",
  "email": "user@example.com",  // email OR mobile
  "password": "mypassword"       // password OR pin
}

// OR with mobile & PIN
{
  "action": "login",
  "mobile": "1234567890",
  "pin": "1234"
}

// Response
{
  "message": "Welcome back! Login successful",
  "user": {
    "id": "...",
    "name": "John Doe",
    "email": "user@example.com",
    "mobile": "1234567890",
    "role": "user"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": "365d"
}
```

##### Register

```javascript
POST /api/auth
{
  "action": "register",
  "name": "John Doe",
  "email": "user@example.com",
  "password": "mypassword",
  "role": "user"  // optional, defaults to "user"
}

// OR with mobile & PIN
{
  "action": "register",
  "name": "Jane Smith",
  "mobile": "1234567890",
  "pin": "1234"
}
```

##### Change Password/PIN

```javascript
POST /api/auth
{
  "action": "change-password",
  "email": "user@example.com",
  "oldPassword": "oldpass",
  "newPassword": "newpass"
}

// OR change PIN
{
  "action": "change-password",
  "mobile": "1234567890",
  "oldPin": "1234",
  "newPin": "5678"
}
```

##### Logout

```javascript
POST /api/auth
{
  "action": "logout"
}
```

#### 🔒 Protected Endpoints (Token Required)

All these endpoints require the JWT token in the Authorization header:

```javascript
fetch("/api/clients", {
  headers: {
    Authorization: "Bearer YOUR_JWT_TOKEN",
    "Content-Type": "application/json",
  },
});
```

**Clients API**

- `GET /api/clients` - Get all clients
- `GET /api/clients?id={id}` - Get specific client
- `POST /api/clients` - Create client
- `PUT /api/clients?id={id}` - Update client
- `DELETE /api/clients?id={id}` - Delete client

**Invoices API**

- `GET /api/invoices` - Get all invoices
- `GET /api/invoices?id={id}` - Get specific invoice
- `GET /api/invoices?clientId={id}` - Get invoices by client
- `POST /api/invoices` - Create invoice
- `PUT /api/invoices?id={id}` - Update invoice
- `DELETE /api/invoices?id={id}` - Delete invoice

### Frontend Integration

#### 1. Login & Store Token

```javascript
// Login
async function login(email, password) {
  const response = await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "login",
      email,
      password,
    }),
  });

  const data = await response.json();

  if (response.ok) {
    // Store token in localStorage
    localStorage.setItem("authToken", data.token);
    localStorage.setItem("user", JSON.stringify(data.user));
    return data;
  } else {
    throw new Error(data.error);
  }
}
```

#### 2. Make Authenticated Requests

```javascript
// Helper function to get token
function getAuthToken() {
  return localStorage.getItem("authToken");
}

// Fetch with authentication
async function fetchClients() {
  const token = getAuthToken();

  const response = await fetch("/api/clients", {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (response.status === 401) {
    // Token expired or invalid - redirect to login
    window.location.href = "/login";
    return;
  }

  return await response.json();
}

// Create client
async function createClient(clientData) {
  const token = getAuthToken();

  const response = await fetch("/api/clients", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(clientData),
  });

  return await response.json();
}
```

#### 3. Logout

```javascript
function logout() {
  // Clear token from localStorage
  localStorage.removeItem("authToken");
  localStorage.removeItem("user");

  // Optional: call logout endpoint
  fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "logout" }),
  });

  // Redirect to login
  window.location.href = "/login";
}
```

#### 4. React Hook Example

```javascript
// useAuth.js
import { useState, useEffect } from "react";

export function useAuth() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedToken = localStorage.getItem("authToken");
    const storedUser = localStorage.getItem("user");

    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const response = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", email, password }),
    });

    const data = await response.json();

    if (response.ok) {
      localStorage.setItem("authToken", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      return data;
    } else {
      throw new Error(data.error);
    }
  };

  const logout = () => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
  };

  const fetchWithAuth = async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (response.status === 401) {
      logout();
      throw new Error("Unauthorized");
    }

    return response;
  };

  return {
    user,
    token,
    loading,
    login,
    logout,
    fetchWithAuth,
    isAuthenticated: !!token,
  };
}

// Usage in component
function MyComponent() {
  const { user, isAuthenticated, fetchWithAuth } = useAuth();

  useEffect(() => {
    if (isAuthenticated) {
      fetchWithAuth("/api/clients")
        .then((res) => res.json())
        .then((data) => console.log(data));
    }
  }, [isAuthenticated]);

  return <div>Hello {user?.name}</div>;
}
```

### Security Features

✅ **JWT Authentication** - Industry-standard token-based auth
✅ **Password Hashing** - bcrypt with salt rounds
✅ **1-Year Token Expiry** - Long-lived tokens for convenience
✅ **Role-based Access** - User roles stored in JWT payload
✅ **CORS Headers** - Proper cross-origin configuration
✅ **Protected Endpoints** - All CRUD operations require authentication

### Database Schema

**Users Collection:**

```javascript
{
  _id: ObjectId,
  name: String,
  email: String (optional),
  mobile: String (optional),
  password: String (hashed, optional),
  pin: String (hashed, optional),
  role: String (default: "user"),
  createdAt: Date,
  updatedAt: Date,
  lastLogin: Date
}
```

### Production Security Checklist

- [ ] Change `JWT_SECRET` to a strong random string
- [ ] Add to Netlify environment variables
- [ ] Never commit `.env` file
- [ ] Use HTTPS only (Netlify provides this)
- [ ] Consider rate limiting for auth endpoints
- [ ] Monitor failed login attempts
- [ ] Implement password strength requirements
- [ ] Add email verification for registration (optional)
- [ ] Consider adding 2FA (optional)

### Error Responses

**401 Unauthorized**

```json
{
  "error": "Unauthorized",
  "message": "No token provided" // or "Invalid or expired token"
}
```

**400 Bad Request**

```json
{
  "error": "Email/mobile and password/pin are required"
}
```

**409 Conflict**

```json
{
  "error": "User with this email or mobile already exists"
}
```

### Testing

Create a test user:

```bash
curl -X POST http://localhost:8888/api/auth \
  -H "Content-Type: application/json" \
  -d '{"action":"register","name":"Test User","email":"test@example.com","password":"test123"}'
```

Login:

```bash
curl -X POST http://localhost:8888/api/auth \
  -H "Content-Type: application/json" \
  -d '{"action":"login","email":"test@example.com","password":"test123"}'
```

Use token:

```bash
curl http://localhost:8888/api/clients \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

Your API is now secured with JWT authentication! 🔒
