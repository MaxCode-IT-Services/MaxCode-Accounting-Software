import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { ObjectId } from "mongodb";
import {
  generateToken,
  generateTempToken,
  verifyToken,
  verifyRequestToken,
  hashPassword,
  comparePassword,
  createAuthResponse,
  createAuthCookie,
  createClearAuthCookie,
  validateRequiredFields,
  sanitizeUser,
} from "./utils/auth.js";
import speakeasy from "speakeasy";
import {
  getClientIp,
  checkLoginRateLimit,
  resetLoginRateLimit,
  checkUserRateLimit,
} from "./utils/rate-limit.js";
import crypto from "crypto";

const DEFAULT_JWT_EXPIRY_DAYS = 1;

const getTokenExpiryDays = (user = {}) => {
  const parsed = Number.parseInt(user?.jwtTokenExpiryDays, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 365) {
    return DEFAULT_JWT_EXPIRY_DAYS;
  }
  return parsed;
};

const getTokenExpiryConfig = (user = {}) => {
  const days = getTokenExpiryDays(user);
  return {
    jwtExpiresIn: `${days}d`,
    cookieMaxAgeSeconds: days * 24 * 60 * 60,
  };
};

const normalizeCredentialIds = (ids = [], singleId = null) => {
  const merged = Array.isArray(ids) ? [...ids] : [];

  if (typeof singleId === "string" && singleId.trim()) {
    merged.unshift(singleId.trim());
  }

  return [
    ...new Set(merged.filter((id) => typeof id === "string" && id.trim())),
  ];
};

/**
 * Authentication API
 * Handles login, register, logout, and password/pin changes
 */
export async function handler(event) {
  // Extract origin for CORS
  const origin = event.headers.origin || event.headers.Origin;

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return createResponse(200, {}, origin);
  }

  // --- Rate limiting logic ---
  const ip = getClientIp(event);
  let userIdForRateLimit = null;
  let userRoleForRateLimit = null;
  let decodedToken = null;
  // For authenticated endpoints (not login/register), check per-user rate limit
  const isAuthAction =
    event.httpMethod === "POST" &&
    event.body &&
    (() => {
      try {
        const b = JSON.parse(event.body);
        return (
          b.action !== "login" &&
          b.action !== "register" &&
          b.action !== "verify-2fa" &&
          b.action !== "verify-fingerprint" &&
          b.action !== "verify-usb-key"
        );
      } catch {
        return false;
      }
    })();
  if (isAuthAction) {
    try {
      decodedToken = verifyRequestToken(event);
      userIdForRateLimit = decodedToken.userId;
      userRoleForRateLimit = decodedToken.role || "user";
    } catch {}
    if (userIdForRateLimit) {
      const userLimit = await checkUserRateLimit(
        userIdForRateLimit,
        userRoleForRateLimit,
      );
      if (userLimit.blocked) {
        return createResponse(
          429,
          {
            error: `Too many requests. Try again after ${userLimit.retryAfter} seconds.`,
          },
          origin,
        );
      }
    }
  }

  try {
    const { db } = await connectToDatabase();
    const usersCollection = db.collection("users");
    const preferencesCollection = db.collection("userPreferences");

    const queryAction = event.queryStringParameters?.action;
    const isVerifySessionRequest =
      event.httpMethod === "GET" &&
      (queryAction === "verify" || event.path?.endsWith("/auth/verify"));

    if (isVerifySessionRequest) {
      try {
        const decodedToken = verifyRequestToken(event);

        const userQuery = decodedToken?.userId
          ? { _id: new ObjectId(decodedToken.userId) }
          : decodedToken?.phone
            ? { phone: String(decodedToken.phone) }
            : null;

        if (!userQuery) {
          return createResponse(
            401,
            { authenticated: false, error: "Invalid session payload" },
            origin,
            { "Set-Cookie": createClearAuthCookie() },
          );
        }

        const user = await usersCollection.findOne(userQuery);

        if (!user || (user.status && user.status !== "Active")) {
          return createResponse(
            401,
            { authenticated: false, error: "Session is not valid" },
            origin,
            { "Set-Cookie": createClearAuthCookie() },
          );
        }

        return createResponse(
          200,
          {
            authenticated: true,
            user: createAuthResponse(user, null).user,
          },
          origin,
        );
      } catch (error) {
        return createResponse(
          401,
          { authenticated: false, error: "Invalid or expired session" },
          origin,
          { "Set-Cookie": createClearAuthCookie() },
        );
      }
    }

    // Parse request body
    const body = event.body ? JSON.parse(event.body) : {};
    const { action } = body;

    // POST - Handle different auth actions
    if (event.httpMethod === "POST") {
      // LOGIN
      if (action === "login") {
        // --- Rate limit login attempts per IP ---
        const loginLimit = await checkLoginRateLimit(ip);
        if (loginLimit.blocked) {
          return createResponse(
            429,
            {
              error: `Too many login attempts. Try again after ${loginLimit.retryAfter} seconds.`,
            },
            origin,
          );
        }

        const { phone, pin } = body;

        // Validate required fields (either email or phone, and password or pin)
        if (!phone || !pin) {
          return createResponse(
            400,
            {
              error: "Email/phone and password/pin are required",
            },
            origin,
          );
        }

        // Find user by email or phone
        const query = { phone };
        const user = await usersCollection.findOne(query);

        if (!user) {
          return createResponse(401, { error: "Invalid credentials" }, origin);
        }

        if (user.status && user.status !== "Active") {
          return createResponse(
            403,
            { error: "Your account is inactive. Please contact admin." },
            origin,
          );
        }

        // Verify password or pin
        let isValidCredential = await comparePassword(pin, user.pin);

        if (!isValidCredential) {
          return createResponse(401, { error: "Invalid credentials" }, origin);
        }

        // On successful login, reset rate limit for this IP
        await resetLoginRateLimit(ip);

        let fingerprintLoginEnabled = user?.fingerprintLoginEnabled === true;
        let biometricCredentialIds = normalizeCredentialIds(
          user?.biometricCredentialIds,
          user?.biometricCredentialId,
        );
        let biometricCredentialId = biometricCredentialIds[0] || null;
        let usbKeyLoginEnabled = user?.usbKeyLoginEnabled === true;
        let usbKeyTokenHash = user?.usbKeyTokenHash || "";

        // Backward compatibility: fallback to legacy userPreferences document.
        if (
          user?.fingerprintLoginEnabled === undefined ||
          biometricCredentialIds.length === 0 ||
          user?.usbKeyLoginEnabled === undefined ||
          !usbKeyTokenHash
        ) {
          const legacyPreferences = await preferencesCollection.findOne({
            userId: user._id.toString(),
          });

          if (user?.fingerprintLoginEnabled === undefined) {
            fingerprintLoginEnabled =
              legacyPreferences?.fingerprintLoginEnabled === true;
          }

          if (biometricCredentialIds.length === 0) {
            biometricCredentialIds = normalizeCredentialIds(
              legacyPreferences?.biometricCredentialIds,
              legacyPreferences?.biometricCredentialId,
            );
            biometricCredentialId =
              biometricCredentialIds[0] || biometricCredentialId;
          }

          if (user?.usbKeyLoginEnabled === undefined) {
            usbKeyLoginEnabled = legacyPreferences?.usbKeyLoginEnabled === true;
          }

          if (!usbKeyTokenHash) {
            usbKeyTokenHash = legacyPreferences?.usbKeyTokenHash || "";
          }
        }

        const requiresSecondFactor =
          user.twoFactor?.enabled === true ||
          (usbKeyLoginEnabled === true && Boolean(usbKeyTokenHash));

        if (requiresSecondFactor) {
          const tempToken = generateTempToken(
            {
              userId: user._id.toString(),
              email: user.email,
              phone: user.phone,
              temp: true,
            },
            "10m",
          );

          return createResponse(
            200,
            {
              message:
                "PIN verified. Please complete second-factor verification.",
              needs2FA: user.twoFactor?.enabled === true,
              needsUSBKey:
                usbKeyLoginEnabled === true && Boolean(usbKeyTokenHash),
              tempToken,
              fingerprintLoginEnabled,
              biometricCredentialId,
              biometricCredentialIds,
              usbKeyLoginEnabled:
                usbKeyLoginEnabled === true && Boolean(usbKeyTokenHash),
            },
            origin,
          );
        }

        // Generate token
        const tokenPayload = {
          userId: user._id.toString(),
          email: user.email,
          phone: user.phone,
          role: user.role || "user",
        };

        const tokenExpiryConfig = getTokenExpiryConfig(user);
        const token = generateToken(
          tokenPayload,
          tokenExpiryConfig.jwtExpiresIn,
        );

        // Update last login
        await usersCollection.updateOne(
          { _id: user._id },
          { $set: { lastLogin: new Date() } },
        );

        return createResponse(
          200,
          {
            message: "Welcome back! Login successful",
            fingerprintLoginEnabled,
            biometricCredentialId,
            biometricCredentialIds,
            usbKeyLoginEnabled: false,
            needsUSBKey: false,
            ...createAuthResponse(user, token, tokenExpiryConfig.jwtExpiresIn),
          },
          origin,
          {
            "Set-Cookie": createAuthCookie(
              token,
              tokenExpiryConfig.cookieMaxAgeSeconds,
            ),
          },
        );
      }

      // VERIFY 2FA
      if (action === "verify-2fa") {
        const { tempToken, twoFACode } = body;

        if (!tempToken || !twoFACode) {
          return createResponse(
            400,
            { error: "Temp token and 2FA code are required" },
            origin,
          );
        }

        let decoded;
        try {
          decoded = verifyToken(tempToken);
        } catch (error) {
          return createResponse(
            401,
            { error: "Invalid or expired temporary token" },
            origin,
          );
        }

        if (!decoded.temp) {
          return createResponse(401, { error: "Invalid token type" }, origin);
        }

        const user = await usersCollection.findOne({
          _id: new ObjectId(decoded.userId),
        });

        if (!user) {
          return createResponse(401, { error: "User not found" }, origin);
        }

        if (!user.twoFactor?.enabled || !user.twoFactor?.secret) {
          return createResponse(
            400,
            { error: "2FA not enabled for this account" },
            origin,
          );
        }

        // Verify TOTP token
        const isValid = speakeasy.totp.verify({
          secret: user.twoFactor.secret,
          encoding: "base32",
          token: twoFACode,
          window: 2,
        });

        if (!isValid) {
          // Check backup codes
          let isBackupCode = false;
          if (user.twoFactor.backupCodes) {
            isBackupCode = user.twoFactor.backupCodes.includes(twoFACode);
            if (isBackupCode) {
              // Remove used backup code
              await usersCollection.updateOne(
                { _id: user._id },
                { $pull: { "twoFactor.backupCodes": twoFACode } },
              );
            }
          }

          if (!isBackupCode) {
            return createResponse(401, { error: "Invalid 2FA code" }, origin);
          }
        }

        // Generate full token
        const tokenPayload = {
          userId: user._id.toString(),
          email: user.email,
          phone: user.phone,
          role: user.role || "user",
        };

        const tokenExpiryConfig = getTokenExpiryConfig(user);
        const token = generateToken(
          tokenPayload,
          tokenExpiryConfig.jwtExpiresIn,
        );

        // Update last login
        await usersCollection.updateOne(
          { _id: user._id },
          { $set: { lastLogin: new Date() } },
        );

        return createResponse(
          200,
          {
            message: "2FA verified. Login successful!",
            ...createAuthResponse(user, token, tokenExpiryConfig.jwtExpiresIn),
          },
          origin,
          {
            "Set-Cookie": createAuthCookie(
              token,
              tokenExpiryConfig.cookieMaxAgeSeconds,
            ),
          },
        );
      }

      // VERIFY FINGERPRINT (used as alternative second factor when enabled on user account)
      if (action === "verify-fingerprint") {
        const { tempToken } = body;

        if (!tempToken) {
          return createResponse(
            400,
            { error: "Temporary token is required" },
            origin,
          );
        }

        let decoded;
        try {
          decoded = verifyToken(tempToken);
        } catch {
          return createResponse(
            401,
            { error: "Invalid or expired temporary token" },
            origin,
          );
        }

        if (!decoded?.temp) {
          return createResponse(401, { error: "Invalid token type" }, origin);
        }

        const user = await usersCollection.findOne({
          _id: new ObjectId(decoded.userId),
        });

        if (!user) {
          return createResponse(401, { error: "User not found" }, origin);
        }

        let isFingerprintEnabled = user?.fingerprintLoginEnabled === true;
        let biometricCredentialIds = normalizeCredentialIds(
          user?.biometricCredentialIds,
          user?.biometricCredentialId,
        );

        if (
          user?.fingerprintLoginEnabled === undefined ||
          biometricCredentialIds.length === 0
        ) {
          const legacyPreferences = await preferencesCollection.findOne({
            userId: user._id.toString(),
          });

          if (user?.fingerprintLoginEnabled === undefined) {
            isFingerprintEnabled =
              legacyPreferences?.fingerprintLoginEnabled === true;
          }

          if (biometricCredentialIds.length === 0) {
            biometricCredentialIds = normalizeCredentialIds(
              legacyPreferences?.biometricCredentialIds,
              legacyPreferences?.biometricCredentialId,
            );
          }
        }

        if (!isFingerprintEnabled) {
          return createResponse(
            403,
            { error: "Fingerprint login is not enabled for this account" },
            origin,
          );
        }

        if (biometricCredentialIds.length === 0) {
          return createResponse(
            403,
            { error: "No fingerprint credential registered for this account" },
            origin,
          );
        }

        const tokenPayload = {
          userId: user._id.toString(),
          email: user.email,
          phone: user.phone,
          role: user.role || "user",
        };

        const tokenExpiryConfig = getTokenExpiryConfig(user);
        const token = generateToken(
          tokenPayload,
          tokenExpiryConfig.jwtExpiresIn,
        );

        await usersCollection.updateOne(
          { _id: user._id },
          { $set: { lastLogin: new Date() } },
        );

        return createResponse(
          200,
          {
            message: "Fingerprint verified. Login successful!",
            ...createAuthResponse(user, token, tokenExpiryConfig.jwtExpiresIn),
          },
          origin,
          {
            "Set-Cookie": createAuthCookie(
              token,
              tokenExpiryConfig.cookieMaxAgeSeconds,
            ),
          },
        );
      }

      // VERIFY USB KEY (encrypted token from MaxCode-Accounting.sec file)
      if (action === "verify-usb-key") {
        const { tempToken, usbToken } = body;

        if (!tempToken || !usbToken) {
          return createResponse(
            400,
            { error: "Temporary token and USB key token are required" },
            origin,
          );
        }

        let decoded;
        try {
          decoded = verifyToken(tempToken);
        } catch {
          return createResponse(
            401,
            { error: "Invalid or expired temporary token" },
            origin,
          );
        }

        if (!decoded?.temp) {
          return createResponse(401, { error: "Invalid token type" }, origin);
        }

        const user = await usersCollection.findOne({
          _id: new ObjectId(decoded.userId),
        });

        if (!user) {
          return createResponse(401, { error: "User not found" }, origin);
        }

        let usbKeyLoginEnabled = user?.usbKeyLoginEnabled === true;
        let usbKeyTokenHash = user?.usbKeyTokenHash || "";

        if (user?.usbKeyLoginEnabled === undefined || !usbKeyTokenHash) {
          const legacyPreferences = await preferencesCollection.findOne({
            userId: user._id.toString(),
          });

          if (user?.usbKeyLoginEnabled === undefined) {
            usbKeyLoginEnabled = legacyPreferences?.usbKeyLoginEnabled === true;
          }

          if (!usbKeyTokenHash) {
            usbKeyTokenHash = legacyPreferences?.usbKeyTokenHash || "";
          }
        }

        if (!usbKeyLoginEnabled || !usbKeyTokenHash) {
          return createResponse(
            403,
            { error: "USB key login is not enabled for this account" },
            origin,
          );
        }

        const incomingHash = crypto
          .createHash("sha256")
          .update(String(usbToken))
          .digest("hex");

        const storedBuffer = Buffer.from(String(usbKeyTokenHash), "utf8");
        const incomingBuffer = Buffer.from(String(incomingHash), "utf8");

        const hashMatches =
          storedBuffer.length === incomingBuffer.length &&
          crypto.timingSafeEqual(storedBuffer, incomingBuffer);

        if (!hashMatches) {
          return createResponse(
            401,
            { error: "Invalid USB security key" },
            origin,
          );
        }

        const tokenPayload = {
          userId: user._id.toString(),
          email: user.email,
          phone: user.phone,
          role: user.role || "user",
        };

        const tokenExpiryConfig = getTokenExpiryConfig(user);
        const token = generateToken(
          tokenPayload,
          tokenExpiryConfig.jwtExpiresIn,
        );

        await usersCollection.updateOne(
          { _id: user._id },
          { $set: { lastLogin: new Date() } },
        );

        return createResponse(
          200,
          {
            message: "USB key verified. Login successful!",
            ...createAuthResponse(user, token, tokenExpiryConfig.jwtExpiresIn),
          },
          origin,
          {
            "Set-Cookie": createAuthCookie(
              token,
              tokenExpiryConfig.cookieMaxAgeSeconds,
            ),
          },
        );
      }

      // REGISTER
      if (action === "register") {
        const { name, phone, pin, role } = body;

        // Validate required fields
        try {
          validateRequiredFields(body, ["name"]);
          if (!phone) {
            throw new Error("Either phone is required");
          }
          if (!pin) {
            throw new Error("Either pin is required");
          }
        } catch (error) {
          return createResponse(400, { error: error.message }, origin);
        }

        // Check if user already exists
        const existingUser = await usersCollection.findOne({ phone });

        if (existingUser) {
          return createResponse(
            409,
            {
              error: "User with this phone already exists",
            },
            origin,
          );
        }

        // Hash password or pin
        const hashedPin = await hashPassword(pin);

        // Create new user
        const newUser = {
          name,
          phone: phone,
          pin: hashedPin,
          role: role || "user",
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        const result = await usersCollection.insertOne(newUser);
        newUser._id = result.insertedId;

        // Generate token
        const tokenPayload = {
          userId: newUser._id.toString(),
          phone: newUser.phone,
          role: newUser.role,
        };

        const tokenExpiryConfig = getTokenExpiryConfig(newUser);
        const token = generateToken(
          tokenPayload,
          tokenExpiryConfig.jwtExpiresIn,
        );

        return createResponse(
          201,
          {
            message: "Registration successful",
            ...createAuthResponse(
              newUser,
              token,
              tokenExpiryConfig.jwtExpiresIn,
            ),
          },
          origin,
          {
            "Set-Cookie": createAuthCookie(
              token,
              tokenExpiryConfig.cookieMaxAgeSeconds,
            ),
          },
        );
      }

      if (action === "logout") {
        return createResponse(200, { message: "Logout successful" }, origin, {
          "Set-Cookie": createClearAuthCookie(),
        });
      }

      // LOGOUT
      // if (action === "logout") {
      //   // With JWT, logout is handled client-side by removing the token
      //   // Optionally, you could maintain a token blacklist in the database
      //   return createResponse(200, { message: "Logout successful" });
      // }

      // CHANGE PASSWORD/PIN
      if (action === "change-password") {
        const { phone, oldPin, newPin } = body;

        if (!email && !phone) {
          return createResponse(
            400,
            { error: "Email or phone is required" },
            origin,
          );
        }

        if (!oldPin || !newPin) {
          return createResponse(
            400,
            {
              error: "Old and new pin are required",
            },
            origin,
          );
        }

        const query = { phone };
        const user = await usersCollection.findOne(query);

        if (!user) {
          return createResponse(404, { error: "User not found" }, origin);
        }

        // Verify old password/pin
        let isValid = await comparePassword(oldPin, user.pin);

        if (!isValid) {
          return createResponse(
            401,
            { error: "Invalid old password/pin" },
            origin,
          );
        }

        // Hash and update new password/pin
        const updateFields = { updatedAt: new Date() };

        updateFields.pin = await hashPassword(newPin);

        await usersCollection.updateOne(
          { _id: user._id },
          { $set: updateFields },
        );

        return createResponse(
          200,
          {
            message: "Password/PIN changed successfully",
          },
          origin,
        );
      }

      return createResponse(400, { error: "Invalid action" }, origin);
    }

    return createResponse(405, { error: "Method not allowed" }, origin);
  } catch (error) {
    console.error("Auth API Error:", error);
    return createResponse(
      500,
      {
        error: "Internal server error",
        message: error.message,
      },
      origin,
    );
  }
}
