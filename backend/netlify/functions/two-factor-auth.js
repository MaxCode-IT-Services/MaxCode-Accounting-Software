import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { verifyRequestToken } from "./utils/auth.js";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import { ObjectId } from "mongodb";

/**
 * Two-Factor Authentication (2FA) API Endpoint
 * Supports:
 * - POST action=generate-2fa: Generate TOTP secret and QR code
 * - POST action=verify-2fa: Verify TOTP token
 * - POST action=enable-2fa: Save verified secret and enable 2FA
 * - POST action=disable-2fa: Disable 2FA
 * - GET: Check if 2FA is enabled
 */

const generate2FASecret = (userPhone) => {
  return speakeasy.generateSecret({
    name: `MaxCode Accounting (${userPhone})`,
    issuer: "MaxCode IT Services",
    length: 32, // Standard length for TOTP
  });
};

const generateQRCode = async (secret) => {
  try {
    const qrCode = await QRCode.toDataURL(secret.otpauth_url);
    return qrCode;
  } catch (error) {
    console.error("Error generating QR code:", error);
    throw new Error("Failed to generate QR code");
  }
};

const verifyTOTPToken = (secret, token) => {
  try {
    const verified = speakeasy.totp.verify({
      secret,
      encoding: "base32",
      token,
      window: 2, // Allow 2 time windows (±60 seconds)
    });
    return verified;
  } catch (error) {
    console.error("Error verifying TOTP:", error);
    return false;
  }
};

const backupCodesGenerator = () => {
  const codes = [];
  for (let i = 0; i < 10; i++) {
    codes.push(
      Math.random().toString(36).substring(2, 10).toUpperCase().slice(0, 8),
    );
  }
  return codes;
};

export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === "OPTIONS") {
    return createResponse(200, {}, origin, event);
  }

  try {
    const user = verifyRequestToken(event);
    const { db } = await connectToDatabase();
    const usersCollection = db.collection("users");

    if (event.httpMethod === "GET") {
      const userData = await usersCollection.findOne({
        _id: new ObjectId(user.userId),
      });

      return createResponse(200,
        {
          twoFactorEnabled: userData?.twoFactor?.enabled || false,
          hasBackupCodes: !!(
            userData?.twoFactor?.backupCodes &&
            userData.twoFactor.backupCodes.length > 0
          ),
        },
        origin, event);
    }

    if (event.httpMethod === "POST") {
      const payload = event.body ? JSON.parse(event.body) : {};
      const action = (payload.action || "").toLowerCase();

      // Generate new 2FA secret
      if (action === "generate-2fa") {
        const userObjectId = new ObjectId(user.userId);
        const userData = await usersCollection.findOne({
          _id: userObjectId,
        });

        const userPhone =
          userData?.phone ||
          userData?.phoneNumber ||
          userData?.email ||
          user.userId;
        const secret = generate2FASecret(userPhone);

        const qrCode = await generateQRCode(secret);
        const backupCodes = backupCodesGenerator();

        // Store temporary secret (not yet verified/enabled)
        await usersCollection.updateOne(
          { _id: userObjectId },
          {
            $set: {
              twoFactor: {
                ...((await usersCollection.findOne({ _id: userObjectId }))
                  ?.twoFactor || {}),
                tempSecret: secret.base32,
                tempQRCode: null, // Don't store QR in DB, generate on-demand
                tempBackupCodes: backupCodes,
                generatedAt: new Date(),
              },
            },
          },
          { upsert: true },
        );

        return createResponse(200,
          {
            success: true,
            qrCode, // Data URL of QR code
            secret: secret.base32, // Manual entry alternative
            backupCodes, // Show to user during setup
            message: "Scan QR code with your authenticator app",
          },
          origin, event);
      }

      // Verify TOTP token
      if (action === "verify-2fa") {
        const { token } = payload;

        if (!token || token.length !== 6 || !/^\d+$/.test(token)) {
          return createResponse(400, { error: "Invalid token format" }, origin, event);
        }

        const userObjectId = new ObjectId(user.userId);
        const userData = await usersCollection.findOne({
          _id: userObjectId,
        });

        const tempSecret = userData?.twoFactor?.tempSecret;
        if (!tempSecret) {
          return createResponse(400,
            { error: "2FA not setup. Generate secret first." },
            origin, event);
        }

        const isValid = verifyTOTPToken(tempSecret, token);
        if (!isValid) {
          return createResponse(401, { error: "Invalid 2FA token" }, origin, event);
        }

        return createResponse(200,
          {
            success: true,
            verified: true,
            message: "Token verified successfully",
          },
          origin, event);
      }

      // Enable 2FA (save verified secret)
      if (action === "enable-2fa") {
        const { token } = payload;

        const userObjectId = new ObjectId(user.userId);
        const userData = await usersCollection.findOne({
          _id: userObjectId,
        });

        const tempSecret = userData?.twoFactor?.tempSecret;
        if (!tempSecret) {
          return createResponse(400,
            { error: "Temporary secret not found. Generate 2FA first." },
            origin, event);
        }

        if (!token || token.length !== 6 || !/^\d+$/.test(token)) {
          return createResponse(400,
            {
              error: "Please provide 6-digit code from your authenticator app",
            },
            origin, event);
        }

        const isValid = verifyTOTPToken(tempSecret, token);
        if (!isValid) {
          return createResponse(401,
            { error: "Invalid authenticator code. Please try again." },
            origin, event);
        }

        const backupCodes = userData?.twoFactor?.tempBackupCodes || [];

        await usersCollection.updateOne(
          { _id: userObjectId },
          {
            $set: {
              twoFactor: {
                enabled: true,
                secret: tempSecret,
                backupCodes,
                enabledAt: new Date(),
                tempSecret: null,
                tempQRCode: null,
                tempBackupCodes: null,
              },
            },
          },
        );

        return createResponse(200,
          {
            success: true,
            message: "Two-factor authentication enabled successfully!",
            backupCodes,
            instruction:
              "Save these backup codes in a safe place. Use them if you lose access to your authenticator app.",
          },
          origin, event);
      }

      // Disable 2FA
      if (action === "disable-2fa") {
        const { verificationToken } = payload;

        if (!verificationToken || verificationToken.length !== 6) {
          return createResponse(400,
            { error: "Verification token required" },
            origin, event);
        }

        const userData = await usersCollection.findOne({
          _id: new ObjectId(user.userId),
        });

        if (!userData?.twoFactor?.enabled) {
          return createResponse(400, { error: "2FA not enabled" }, origin, event);
        }

        const isValid = verifyTOTPToken(
          userData.twoFactor.secret,
          verificationToken,
        );

        if (!isValid && userData.twoFactor.backupCodes) {
          const isBackupCode =
            userData.twoFactor.backupCodes.includes(verificationToken);
          if (isBackupCode) {
            await usersCollection.updateOne(
              { _id: new ObjectId(user.userId) },
              {
                $pull: {
                  "twoFactor.backupCodes": verificationToken,
                },
              },
            );
          } else {
            return createResponse(401,
              { error: "Invalid verification code" },
              origin, event);
          }
        } else if (!isValid) {
          return createResponse(401,
            { error: "Invalid verification code" },
            origin, event);
        }

        // Disable 2FA
        await usersCollection.updateOne(
          { _id: new ObjectId(user.userId) },
          {
            $set: {
              twoFactor: {
                enabled: false,
              },
            },
          },
        );

        return createResponse(200,
          {
            success: true,
            message: "Two-factor authentication disabled",
          },
          origin, event);
      }

      return createResponse(400, { error: "Invalid action" }, origin, event);
    }

    return createResponse(405, { error: "Method not allowed" }, origin, event);
  } catch (error) {
    console.error("2FA error:", error);
    return createResponse(500,
      {
        error: "2FA operation failed",
        message: error.message,
      },
      event.headers.origin || event.headers.Origin, event);
  }
}
