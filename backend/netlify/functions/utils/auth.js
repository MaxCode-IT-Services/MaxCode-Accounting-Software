import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { createResponse } from "./mongodb.js";

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = "1d";
const AUTH_COOKIE_NAME = "maxcode_auth_token";
const DEFAULT_COOKIE_MAX_AGE_SECONDS = 24 * 60 * 60;

if (!JWT_SECRET || String(JWT_SECRET).trim().length < 32) {
  throw new Error(
    "JWT_SECRET is missing or too short. Set a strong secret (min 32 chars).",
  );
}

function parseCookies(cookieHeader = "") {
  if (!cookieHeader || typeof cookieHeader !== "string") {
    return {};
  }

  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, current) => {
      const separatorIndex = current.indexOf("=");
      if (separatorIndex === -1) return acc;
      const key = current.slice(0, separatorIndex).trim();
      const value = current.slice(separatorIndex + 1).trim();
      if (!key) return acc;
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

/**
 * Generate JWT token
 */
// export function generateToken(payload, expiresIn = JWT_EXPIRES_IN) {
//   return jwt.sign(payload, JWT_SECRET, {
//     expiresIn,
//     issuer: "MaxCode IT Services",
//   });
// }

/**
 * Generate JWT token
 */

export function generateToken(payload, expiresIn = JWT_EXPIRES_IN) {
  return jwt.sign(
    {
      ...payload,

      "Company Name": "MaxCode IT Services",
      "Application Developer": "MaxCode IT Services",
      "Founder & CEO": "Mr. Vipin Khandelwal",
      "Official Website": "https://www.maxcode.in",
      "Contact Number": "+91 6377241446",
      "WhatsApp Number": "+91 9462327957",
      "Support Email": "contact@maxcode.in",
      "Developed On": "30 March 2026",
    },
    JWT_SECRET,
    {
      expiresIn,
      issuer: "MaxCode IT Services",
      audience: "MaxCode IT Services Clients & Teams",
    }
  );
}



/**
 * Generate Temporary Token (for 2FA verification, etc)
 */
export function generateTempToken(payload, expiresIn = "5m") {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn,
    issuer: "MaxCode IT Services",
  });
}

/**
 * Verify JWT token
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET, {
      issuer: "MaxCode IT Services",
    });
  } catch (error) {
    throw new Error("Invalid or expired token");
  }
}

/**
 * Hash password using bcrypt
 */
export async function hashPassword(password) {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
}

/**
 * Compare password with hashed password
 */
export async function comparePassword(password, hashedPassword) {
  return await bcrypt.compare(password, hashedPassword);
}

/**
 * Extract token from Authorization header
 */
export function extractToken(event) {
  const authHeader = event.headers.authorization || event.headers.Authorization;

  if (authHeader) {
    // Support both "Bearer <token>" and just "<token>"
    const parts = authHeader.split(" ");
    if (parts.length === 2 && parts[0] === "Bearer") {
      return parts[1];
    }

    return authHeader;
  }

  const cookieHeader = event.headers.cookie || event.headers.Cookie;
  const cookies = parseCookies(cookieHeader);
  return cookies[AUTH_COOKIE_NAME] || null;
}

export function createAuthCookie(
  token,
  maxAgeSeconds = DEFAULT_COOKIE_MAX_AGE_SECONDS,
) {
  const secureFlag = "Secure; ";
  const normalizedMaxAge =
    Number.isInteger(maxAgeSeconds) && maxAgeSeconds > 0
      ? maxAgeSeconds
      : DEFAULT_COOKIE_MAX_AGE_SECONDS;

  // SameSite=None is required so the browser sends the cookie on cross-origin
  // credentialed API requests (frontend and API on different origins in prod).
  // None mandates Secure, which is already set via secureFlag.
  return `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; ${secureFlag}SameSite=None; Max-Age=${normalizedMaxAge}`;
}

export function createClearAuthCookie() {
  const secureFlag = "Secure; ";
  return `${AUTH_COOKIE_NAME}=; Path=/; HttpOnly; ${secureFlag}SameSite=None; Max-Age=0`;
}

/**
 * Middleware to verify JWT token from request
 */
export function verifyRequestToken(event) {
  const token = extractToken(event);

  if (!token) {
    throw new Error("No token provided");
  }

  try {
    const decoded = verifyToken(token);
    return decoded;
  } catch (error) {
    throw new Error("Invalid or expired token");
  }
}

/**
 * Create authenticated response with user data
 */
export function createAuthResponse(user, token, expiresIn = JWT_EXPIRES_IN) {
  return {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      mobile: user.mobile || user.phone,
      phone: user.phone || user.mobile,
      role: user.role || "user",
      status: user.status || "Active",
      userType: user.userType || "admin",
      permissions: user.permissions || {},
    },
    token,
    expiresIn,
  };
}

/**
 * Validate required fields
 */
export function validateRequiredFields(data, requiredFields) {
  const missing = [];

  for (const field of requiredFields) {
    if (!data[field]) {
      missing.push(field);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(", ")}`);
  }
}

/**
 * Sanitize user data (remove sensitive fields)
 */
export function sanitizeUser(user) {
  const sanitized = { ...user };
  delete sanitized.password;
  delete sanitized.pin;
  return sanitized;
}

const resolveActorFromToken = (decoded = {}) => {
  if (!decoded || typeof decoded !== "object") {
    return null;
  }

  const id =
    decoded.userId || decoded.id || decoded._id || decoded.sub || decoded.uid;
  const name =
    decoded.name ||
    decoded.userName ||
    decoded.username ||
    decoded.displayName ||
    decoded.email ||
    decoded.phone ||
    "";

  if (!id && !name) {
    return null;
  }

  return {
    id: id ? String(id) : "",
    name: name ? String(name) : "",
  };
};

export function getAuditFieldsFromEvent(event, mode = "create") {
  try {
    const decoded = verifyRequestToken(event);
    const actor = resolveActorFromToken(decoded);

    if (!actor) {
      return {};
    }

    if (mode === "update") {
      return {
        updatedBy: actor.name || actor.id,
      };
    }

    if (mode === "delete") {
      return {
        deletedBy: actor.name || actor.id,
      };
    }

    return {
      createdBy: actor.name || actor.id,
    };
  } catch (error) {
    return {};
  }
}
