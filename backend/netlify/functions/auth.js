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
          b.action !== "verify-2fa"
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

        // Check if 2FA is enabled
        if (user.twoFactor?.enabled === true) {
          // Generate temporary token for 2FA verification (valid for 5 minutes)
          const tempToken = generateTempToken(
            {
              userId: user._id.toString(),
              email: user.email,
              phone: user.phone,
              temp: true,
            },
            "5m",
          );

          return createResponse(
            200,
            {
              message: "PIN verified. Please provide 2FA code.",
              needs2FA: true,
              tempToken,
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

        const token = generateToken(tokenPayload);

        // Update last login
        await usersCollection.updateOne(
          { _id: user._id },
          { $set: { lastLogin: new Date() } },
        );

        return createResponse(
          200,
          {
            message: "Welcome back! Login successful",
            ...createAuthResponse(user, token),
          },
          origin,
          { "Set-Cookie": createAuthCookie(token) },
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

        const token = generateToken(tokenPayload);

        // Update last login
        await usersCollection.updateOne(
          { _id: user._id },
          { $set: { lastLogin: new Date() } },
        );

        return createResponse(
          200,
          {
            message: "2FA verified. Login successful!",
            ...createAuthResponse(user, token),
          },
          origin,
          { "Set-Cookie": createAuthCookie(token) },
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

        const token = generateToken(tokenPayload);

        return createResponse(
          201,
          {
            message: "Registration successful",
            ...createAuthResponse(newUser, token),
          },
          origin,
          { "Set-Cookie": createAuthCookie(token) },
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
