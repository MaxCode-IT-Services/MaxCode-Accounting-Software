import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { ObjectId } from "mongodb";
import {
  generateToken,
  verifyToken,
  hashPassword,
  comparePassword,
  createAuthResponse,
  validateRequiredFields,
  sanitizeUser,
} from "./utils/auth.js";
import speakeasy from "speakeasy";

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

  try {
    const { db } = await connectToDatabase();
    const usersCollection = db.collection("users");

    // Parse request body
    const body = event.body ? JSON.parse(event.body) : {};
    const { action } = body;

    // POST - Handle different auth actions
    if (event.httpMethod === "POST") {
      // LOGIN
      if (action === "login") {
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

        // Check if 2FA is enabled
        if (user.twoFactor?.enabled) {
          // Generate temporary token for 2FA verification
          const tempToken = generateToken({
            userId: user._id.toString(),
            email: user.email,
            phone: user.phone,
            temp: true,
            exp: Date.now() + 5 * 60 * 1000, // 5 minutes
          });

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
        );
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
