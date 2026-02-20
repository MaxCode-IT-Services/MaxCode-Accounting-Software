import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { createResponse } from "./mongodb.js";

// JWT configuration
const JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-key-change-in-production";
const JWT_EXPIRES_IN = "1d";

/**
 * Generate JWT token
 */
export function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    issuer: "maxcode-invoice",
  });
}

/**
 * Generate Temporary Token (for 2FA verification, etc)
 */
export function generateTempToken(payload, expiresIn = "5m") {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn,
    issuer: "maxcode-invoice",
  });
}

/**
 * Verify JWT token
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET, {
      issuer: "maxcode-invoice",
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

  if (!authHeader) {
    return null;
  }

  // Support both "Bearer <token>" and just "<token>"
  const parts = authHeader.split(" ");
  if (parts.length === 2 && parts[0] === "Bearer") {
    return parts[1];
  }

  return authHeader;
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
export function createAuthResponse(user, token) {
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
    expiresIn: JWT_EXPIRES_IN,
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
