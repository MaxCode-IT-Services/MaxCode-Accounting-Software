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
import { decryptSecretFromStorage } from "./utils/secret-crypto.js";
import speakeasy from "speakeasy";
import {
  getClientIp,
  checkLoginRateLimit,
  resetLoginRateLimit,
  checkUserRateLimit,
} from "./utils/rate-limit.js";
import crypto from "crypto";

const DEFAULT_JWT_EXPIRY_DAYS = 1;
const FACE_AUTH_ENCRYPTION_CONTEXT = "maxcode-face-auth-v1";
const FACE_AUTH_DISTANCE_THRESHOLD = 0.32;
const FACE_AUTH_AVERAGE_DISTANCE_THRESHOLD = 0.38;

const getFaceAuthEncryptionKey = () => {
  const baseSecret = String(process.env.JWT_SECRET || "").trim();

  if (!baseSecret) {
    throw new Error("JWT_SECRET is required for face auth encryption");
  }

  return crypto
    .createHash("sha256")
    .update(`${FACE_AUTH_ENCRYPTION_CONTEXT}:${baseSecret}`)
    .digest();
};

const decryptFaceDescriptors = (profile = {}) => {
  const payload = profile?.encryptedDescriptors || {};
  const iv = Buffer.from(String(payload?.iv || ""), "base64");
  const tag = Buffer.from(String(payload?.tag || ""), "base64");
  const encrypted = Buffer.from(String(payload?.data || ""), "base64");

  if (!iv.length || !tag.length || !encrypted.length) {
    return [];
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    getFaceAuthEncryptionKey(),
    iv,
  );
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]).toString("utf8");

  const parsed = JSON.parse(decrypted);
  return Array.isArray(parsed) ? parsed : [];
};

const normalizeDescriptor = (descriptor = []) => {
  if (!Array.isArray(descriptor)) return [];

  return descriptor
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .slice(0, 128);
};

const computeFaceDistance = (first = [], second = []) => {
  if (!Array.isArray(first) || !Array.isArray(second)) return Number.POSITIVE_INFINITY;

  if (first.length === 0 || second.length === 0 || first.length !== second.length) {
    return Number.POSITIVE_INFINITY;
  }

  let sum = 0;
  for (let i = 0; i < first.length; i += 1) {
    const delta = Number(first[i]) - Number(second[i]);
    sum += delta * delta;
  }

  return Math.sqrt(sum);
};

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

const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

const getEnvBoolean = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  return ["1", "true", "yes", "on"].includes(normalized);
};

const getSharedBusinessSettings = async (db) => {
  const settingsCollection = db.collection("business_settings");
  const globalSettings = await settingsCollection.findOne({ scope: "global" });

  if (globalSettings) {
    return globalSettings;
  }

  return settingsCollection.findOne(
    {},
    {
      sort: {
        updatedAt: -1,
        createdAt: -1,
        _id: -1,
      },
    },
  );
};

const getTurnstileSecretKey = (settings = {}) => {
  const envSecretKey = String(
    process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY ||
      process.env.TURNSTILE_SECRET_KEY ||
      "",
  ).trim();

  if (envSecretKey) {
    return envSecretKey;
  }

  const encryptedSecret = String(
    settings?.cloudflareSettings?.turnstileSecretKey || "",
  ).trim();

  let storedSecret = "";

  if (encryptedSecret) {
    try {
      storedSecret = decryptSecretFromStorage(encryptedSecret);
    } catch {
      storedSecret = encryptedSecret;
    }
  }

  return (
    String(storedSecret || "").trim() ||
    String(process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY || "").trim() ||
    String(process.env.TURNSTILE_SECRET_KEY || "").trim()
  );
};

const verifyTurnstileToken = async ({ token, secret, remoteIp }) => {
  if (!token || !String(token).trim()) {
    return { success: false, error: "Captcha token is required" };
  }

  if (!secret) {
    return {
      success: false,
      error: "Captcha secret is missing on the server",
    };
  }

  const payload = new URLSearchParams({
    secret,
    response: String(token).trim(),
  });

  if (remoteIp) {
    payload.set("remoteip", remoteIp);
  }

  const response = await fetch(TURNSTILE_VERIFY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: payload.toString(),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data?.success !== true) {
    const errorCodes = Array.isArray(data?.["error-codes"])
      ? data["error-codes"].join(", ")
      : "";

    return {
      success: false,
      error: errorCodes || "Captcha verification failed",
    };
  }

  return { success: true };
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
          b.action !== "verify-usb-key" &&
          b.action !== "verify-face-auth"
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

    const resolveActorName = async (userDoc = {}) => {
      // Prioritize actual name fields in order of preference
      const nameFields = [
        userDoc?.name,
        userDoc?.fullName,
        userDoc?.displayName,
        userDoc?.userName,
        userDoc?.username,
      ];
      
      for (const field of nameFields) {
        if (field && String(field).trim()) {
          return String(field).trim();
        }
      }
      
      // If no name fields found, use user ID (not email)
      const userId = String(userDoc?._id || "").trim();
      if (userId) {
        return `User ${userId.substring(0, 8)}`;
      }
      
      // Fallback to "User" if nothing else available
      return "User";
    };

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

        const { phone, pin, turnstileToken } = body;

        if (!phone || !pin) {
          return createResponse(
            400,
            {
              error: "Email/phone and password/pin are required",
            },
            origin,
          );
        }

        const sharedSettings = await getSharedBusinessSettings(db);
        const captchaEnabled =
          getEnvBoolean(process.env.CLOUDFLARE_LOGIN_CAPTCHA_ENABLED) ??
          Boolean(process.env.CLOUDFLARE_TURNSTILE_SITE_KEY) ??
          sharedSettings?.featureToggles?.cloudflareLoginCaptcha === true;

        if (captchaEnabled) {
          const turnstileSecretKey = getTurnstileSecretKey(sharedSettings);
          const turnstileSiteKey = String(
            process.env.CLOUDFLARE_TURNSTILE_SITE_KEY ||
              process.env.TURNSTILE_SITE_KEY ||
              sharedSettings?.cloudflareSettings?.turnstileSiteKey ||
              "",
          ).trim();

          if (!turnstileSecretKey || !turnstileSiteKey) {
            return createResponse(
              500,
              {
                error:
                  "Cloudflare login captcha is enabled but not configured.",
              },
              origin,
            );
          }
        }

        if (captchaEnabled) {
          const turnstileSecretKey = getTurnstileSecretKey(sharedSettings);
          const captchaResult = await verifyTurnstileToken({
            token: turnstileToken,
            secret: turnstileSecretKey,
            remoteIp: ip,
          });

          if (!captchaResult.success) {
            return createResponse(
              401,
              {
                error:
                  captchaResult.error ||
                  "Cloudflare verification failed. Please try again.",
              },
              origin,
            );
          }
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
        let faceAuthEnabled = user?.faceAuthEnabled === true;
        let faceAuthProfile = user?.faceAuthProfile || null;

        // Backward compatibility: fallback to legacy userPreferences document.
        if (
          user?.fingerprintLoginEnabled === undefined ||
          biometricCredentialIds.length === 0 ||
          user?.usbKeyLoginEnabled === undefined ||
          !usbKeyTokenHash ||
          user?.faceAuthEnabled === undefined ||
          !faceAuthProfile
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

          if (user?.faceAuthEnabled === undefined) {
            faceAuthEnabled = legacyPreferences?.faceAuthEnabled === true;
          }

          if (!faceAuthProfile && legacyPreferences?.faceAuthProfile) {
            faceAuthProfile = legacyPreferences.faceAuthProfile;
          }
        }

        const hasFaceProfile =
          Boolean(faceAuthProfile?.encryptedDescriptors?.data) &&
          Boolean(faceAuthProfile?.encryptedDescriptors?.iv) &&
          Boolean(faceAuthProfile?.encryptedDescriptors?.tag);

        const faceAuthReady = faceAuthEnabled === true && hasFaceProfile;

        const requiresSecondFactor =
          user.twoFactor?.enabled === true ||
          (usbKeyLoginEnabled === true && Boolean(usbKeyTokenHash)) ||
          faceAuthReady;

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
              needsFaceAuth: faceAuthReady,
              tempToken,
              fingerprintLoginEnabled,
              biometricCredentialId,
              biometricCredentialIds,
              faceAuthEnabled: faceAuthReady,
              usbKeyLoginEnabled:
                usbKeyLoginEnabled === true && Boolean(usbKeyTokenHash),
            },
            origin,
          );
        }

        // Generate token
        const actorName = await resolveActorName(user);
        const tokenPayload = {
          userId: user._id.toString(),
          name: actorName,
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
            faceAuthEnabled: false,
            needsFaceAuth: false,
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
        const actorName = await resolveActorName(user);
        const tokenPayload = {
          userId: user._id.toString(),
          name: actorName,
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

        const actorName = await resolveActorName(user);
        const tokenPayload = {
          userId: user._id.toString(),
          name: actorName,
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
      if (action === "verify-face-auth") {
        const { tempToken, descriptor } = body;

        if (!tempToken || !Array.isArray(descriptor)) {
          return createResponse(
            400,
            { error: "Temporary token and face descriptor are required" },
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

        let faceAuthEnabled = user?.faceAuthEnabled === true;
        let faceAuthProfile = user?.faceAuthProfile || null;

        if (user?.faceAuthEnabled === undefined || !faceAuthProfile) {
          const legacyPreferences = await preferencesCollection.findOne({
            userId: user._id.toString(),
          });

          if (user?.faceAuthEnabled === undefined) {
            faceAuthEnabled = legacyPreferences?.faceAuthEnabled === true;
          }

          if (!faceAuthProfile && legacyPreferences?.faceAuthProfile) {
            faceAuthProfile = legacyPreferences.faceAuthProfile;
          }
        }

        if (!faceAuthEnabled || !faceAuthProfile) {
          return createResponse(
            403,
            { error: "Face authentication is not enabled for this account" },
            origin,
          );
        }

        const incomingDescriptor = normalizeDescriptor(descriptor);
        if (incomingDescriptor.length < 64) {
          return createResponse(
            400,
            { error: "Invalid face descriptor payload" },
            origin,
          );
        }

        let storedDescriptors = [];
        try {
          storedDescriptors = decryptFaceDescriptors(faceAuthProfile)
            .map((item) => normalizeDescriptor(item))
            .filter((item) => item.length === incomingDescriptor.length);
        } catch {
          return createResponse(
            500,
            { error: "Stored face profile is unreadable. Re-enroll face auth." },
            origin,
          );
        }

        if (storedDescriptors.length === 0) {
          return createResponse(
            403,
            { error: "No valid face profile found. Please re-setup face auth." },
            origin,
          );
        }

        const distances = storedDescriptors
          .map((current) => computeFaceDistance(incomingDescriptor, current))
          .filter((distance) => Number.isFinite(distance));

        if (distances.length === 0) {
          return createResponse(
            401,
            { error: "Face does not match. Please try again." },
            origin,
          );
        }

        const sortedDistances = distances.sort((first, second) => first - second);
        const bestDistance = sortedDistances[0];
        const averageBestDistances =
          sortedDistances.slice(0, Math.min(3, sortedDistances.length)).reduce(
            (sum, distance) => sum + distance,
            0,
          ) / Math.min(3, sortedDistances.length);

        if (
          !Number.isFinite(bestDistance) ||
          bestDistance > FACE_AUTH_DISTANCE_THRESHOLD ||
          averageBestDistances > FACE_AUTH_AVERAGE_DISTANCE_THRESHOLD
        ) {
          return createResponse(
            401,
            { error: "Face does not match. Please try again." },
            origin,
          );
        }

        const actorName = await resolveActorName(user);
        const tokenPayload = {
          userId: user._id.toString(),
          name: actorName,
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
            message: "Face authentication verified. Login successful!",
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

        const actorName = await resolveActorName(user);
        const tokenPayload = {
          userId: user._id.toString(),
          name: actorName,
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
        const actorName = await resolveActorName(newUser);
        const tokenPayload = {
          userId: newUser._id.toString(),
          name: actorName,
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
