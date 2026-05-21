import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { verifyRequestToken, getAuditFieldsFromEvent } from "./utils/auth.js";
import { ObjectId } from "mongodb";

/**
 * User Preferences API
 * Stores and fetches user-specific preferences (e.g., server-side mode for all modules)
 * Requires JWT authentication
 */
export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin;

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return createResponse(200, {}, origin);
  }

  try {
    // Verify JWT token
    const user = verifyRequestToken(event);
    const userId = user?.id || user?._id || user?.userId;

    if (!userId) {
      return createResponse(401, { error: "Unauthorized: No user ID" }, origin);
    }

    const { db } = await connectToDatabase();
    const preferencesCollection = db.collection("userPreferences");
    const usersCollection = db.collection("users");
    const userObjectId = ObjectId.isValid(userId) ? new ObjectId(userId) : null;

    const normalizeCredentialIds = (ids = [], singleId = "") => {
      const merged = Array.isArray(ids) ? [...ids] : [];

      if (typeof singleId === "string" && singleId.trim()) {
        merged.unshift(singleId.trim());
      }

      return [
        ...new Set(merged.filter((id) => typeof id === "string" && id.trim())),
      ];
    };

    const preferenceFields = [
      "clientManagementServerSide",
      "leadManagementServerSide",
      "ownerInvestmentServerSide",
      "personalFundManagementServerSide",
      "qutationManagementServerSide",
      "companyExpenseManagementServerSide",
      "booksOfAccountsServerSide",
      "detailedLedgerManagementServerSide",
      "developerPayoutManagementServerSide",
      "financialYearManagementServerSide",
      "projectDetailsServerSide",
      "projectCredentialsServerSide",
      "maxcodeCredentialsServerSide",
      "projectManagementServerSide",
      "purchaseManagementServerSide",
      "rcmManagementServerSide",
      "creditDebitNotesManagementServerSide",
      "refundManagementServerSide",
      "salesManagementServerSide",
      "servicesManagementServerSide",
      "staffManagementServerSide",
      "teamManagementServerSide",
      "vendorManagementServerSide",
      "paymentReceiptManagementServerSide",
      "paymentLinkManagementServerSide",
      "fingerprintLoginEnabled",
      "usbKeyLoginEnabled",
    ];

    // Fields that store a string value (not boolean)
    const stringPreferenceFields = ["biometricCredentialId", "usbKeyTokenHash"];
    const userBooleanFields = ["fingerprintLoginEnabled", "usbKeyLoginEnabled"];
    const userStringFields = ["biometricCredentialId", "usbKeyTokenHash"];
    const userStringArrayFields = ["biometricCredentialIds"];
    const userObjectFields = ["settingsTabs"]; // For nested object permissions

    const mergePreferenceValues = (document = {}) => {
      const merged = {};

      preferenceFields.forEach((field) => {
        const topLevelValue = document?.[field];
        const nestedValue = document?.preferences?.[field];

        if (typeof topLevelValue === "boolean") {
          merged[field] = topLevelValue;
        } else if (typeof nestedValue === "boolean") {
          merged[field] = nestedValue;
        }
      });

      stringPreferenceFields.forEach((field) => {
        const val = document?.[field];
        if (typeof val === "string") {
          merged[field] = val;
        }
      });

      if (Array.isArray(document?.biometricCredentialIds)) {
        merged.biometricCredentialIds = normalizeCredentialIds(
          document.biometricCredentialIds,
          document?.biometricCredentialId,
        );
      }

      return merged;
    };

    // GET - Fetch user preferences
    if (event.httpMethod === "GET") {
      const pref = await preferencesCollection.findOne({ userId });
      const userDoc = userObjectId
        ? await usersCollection.findOne(
            { _id: userObjectId },
            {
              projection: {
                fingerprintLoginEnabled: 1,
                biometricCredentialId: 1,
                biometricCredentialIds: 1,
                usbKeyLoginEnabled: 1,
                usbKeyTokenHash: 1,
                "permissions.settingsTabs": 1,
              },
            },
          )
        : null;

      // Return normalized preferences from top-level + legacy nested object
      const mergedPreferences = mergePreferenceValues(pref);

      if (typeof userDoc?.fingerprintLoginEnabled === "boolean") {
        mergedPreferences.fingerprintLoginEnabled =
          userDoc.fingerprintLoginEnabled;
      }

      if (typeof userDoc?.biometricCredentialId === "string") {
        mergedPreferences.biometricCredentialId = userDoc.biometricCredentialId;
      }

      if (Array.isArray(userDoc?.biometricCredentialIds)) {
        mergedPreferences.biometricCredentialIds = normalizeCredentialIds(
          userDoc.biometricCredentialIds,
          userDoc?.biometricCredentialId,
        );
      } else if (typeof userDoc?.biometricCredentialId === "string") {
        mergedPreferences.biometricCredentialIds = normalizeCredentialIds(
          [],
          userDoc.biometricCredentialId,
        );
      }

      if (typeof userDoc?.usbKeyLoginEnabled === "boolean") {
        mergedPreferences.usbKeyLoginEnabled = userDoc.usbKeyLoginEnabled;
      }

      if (typeof userDoc?.usbKeyTokenHash === "string") {
        mergedPreferences.usbKeyTokenHash = userDoc.usbKeyTokenHash;
      }

      if (
        userDoc?.permissions?.settingsTabs &&
        typeof userDoc.permissions.settingsTabs === "object"
      ) {
        mergedPreferences.settingsTabs = userDoc.permissions.settingsTabs;
      }

      return createResponse(200, mergedPreferences, origin);
    }

    // POST/PUT - Save/update user preferences
    if (event.httpMethod === "POST" || event.httpMethod === "PUT") {
      const body = JSON.parse(event.body || "{}");

      // Build update object with only valid preference fields
      const updateFields = {};
      const userUpdateFields = {};
      let invalidField = null;

      // Validate and collect preferences
      Object.entries(body).forEach(([key, value]) => {
        if (userObjectFields.includes(key)) {
          // For object fields like settingsTabs
          if (key === "settingsTabs") {
            if (
              value &&
              typeof value === "object" &&
              typeof value.tabs === "object"
            ) {
              // Store settingsTabs in permissions.settingsTabs
              userUpdateFields["permissions.settingsTabs"] = value;
            } else if (value === null) {
              userUpdateFields["permissions.settingsTabs"] = null;
            }
          }
        } else if (userStringFields.includes(key)) {
          if (typeof value !== "string" && value !== null) {
            invalidField = key;
            return;
          }
          userUpdateFields[key] = value ?? "";
        } else if (userStringArrayFields.includes(key)) {
          if (value !== null && !Array.isArray(value)) {
            invalidField = key;
            return;
          }

          const normalized = value
            ? value.filter((id) => typeof id === "string" && id.trim())
            : [];

          if (value && normalized.length !== value.length) {
            invalidField = key;
            return;
          }

          userUpdateFields[key] = normalized;
        } else if (userBooleanFields.includes(key)) {
          if (typeof value !== "boolean") {
            invalidField = key;
            return;
          }
          userUpdateFields[key] = value;
        } else if (stringPreferenceFields.includes(key)) {
          // Allow string or null (null = clear)
          if (typeof value !== "string" && value !== null) {
            invalidField = key;
            return;
          }
          updateFields[key] = value ?? "";
        } else if (preferenceFields.includes(key)) {
          // Validate boolean type
          if (typeof value !== "boolean") {
            invalidField = key;
            return;
          }
          updateFields[key] = value;
        }
      });

      if (invalidField) {
        return createResponse(
          400,
          {
            error: `Invalid value for ${invalidField}. Must be boolean or string.`,
          },
          origin,
        );
      }

      if (
        Object.keys(updateFields).length === 0 &&
        Object.keys(userUpdateFields).length === 0
      ) {
        return createResponse(
          400,
          { error: "No valid preference provided" },
          origin,
        );
      }

      const existingDoc = await preferencesCollection.findOne({ userId });
      const existingPreferences = mergePreferenceValues(existingDoc);
      const finalPreferences = {
        ...existingPreferences,
        ...updateFields,
        ...userUpdateFields,
      };

      // Update normal preferences in userPreferences collection
      if (Object.keys(updateFields).length > 0) {
        await preferencesCollection.updateOne(
          { userId },
          {
            $set: {
              userId,
              ...existingPreferences,
              ...updateFields,
              updatedAt: new Date(),
              ...getAuditFieldsFromEvent(event, "update"),
            },
            $setOnInsert: {
              createdAt: new Date(),
            },
            $unset: {
              preferences: "",
            },
          },
          { upsert: true },
        );
      }

      // Store fingerprint fields directly on users collection
      if (Object.keys(userUpdateFields).length > 0) {
        if (!userObjectId) {
          return createResponse(400, { error: "Invalid user id" }, origin);
        }

        if (
          Object.prototype.hasOwnProperty.call(
            userUpdateFields,
            "biometricCredentialId",
          ) ||
          Object.prototype.hasOwnProperty.call(
            userUpdateFields,
            "biometricCredentialIds",
          )
        ) {
          const currentUserDoc = await usersCollection.findOne(
            { _id: userObjectId },
            {
              projection: {
                biometricCredentialId: 1,
                biometricCredentialIds: 1,
              },
            },
          );

          let nextCredentialIds = normalizeCredentialIds(
            currentUserDoc?.biometricCredentialIds,
            currentUserDoc?.biometricCredentialId,
          );

          if (
            Object.prototype.hasOwnProperty.call(
              userUpdateFields,
              "biometricCredentialIds",
            )
          ) {
            nextCredentialIds = normalizeCredentialIds(
              userUpdateFields.biometricCredentialIds,
              "",
            );
          }

          if (
            Object.prototype.hasOwnProperty.call(
              userUpdateFields,
              "biometricCredentialId",
            )
          ) {
            const incomingSingleId = userUpdateFields.biometricCredentialId;

            if (
              typeof incomingSingleId === "string" &&
              incomingSingleId.trim()
            ) {
              nextCredentialIds = normalizeCredentialIds(
                nextCredentialIds,
                incomingSingleId,
              );
            } else if (
              !Object.prototype.hasOwnProperty.call(
                userUpdateFields,
                "biometricCredentialIds",
              )
            ) {
              nextCredentialIds = [];
            }
          }

          userUpdateFields.biometricCredentialIds = nextCredentialIds;
          userUpdateFields.biometricCredentialId = nextCredentialIds[0] || "";
        }

        await usersCollection.updateOne(
          { _id: userObjectId },
          {
            $set: {
              ...userUpdateFields,
              updatedAt: new Date(),
              ...getAuditFieldsFromEvent(event, "update"),
            },
          },
        );
      }

      return createResponse(
        200,
        {
          message: "Preferences updated successfully",
          preferences: finalPreferences,
        },
        origin,
      );
    }

    // DELETE - Clear user preferences (optional)
    if (event.httpMethod === "DELETE") {
      const result = await preferencesCollection.deleteOne({ userId });

      if (result.deletedCount === 0) {
        return createResponse(404, { error: "No preferences found" }, origin);
      }

      return createResponse(
        200,
        { message: "Preferences cleared successfully" },
        origin,
      );
    }

    return createResponse(405, { error: "Method not allowed" }, origin);
  } catch (error) {
    console.error("User Preferences API Error:", error);

    // Handle specific errors
    if (error.message.includes("token") || error.message.includes("Token")) {
      return createResponse(
        401,
        {
          error: "Unauthorized",
          message: error.message,
        },
        origin,
      );
    }

    if (error.name === "SyntaxError") {
      return createResponse(
        400,
        { error: "Invalid JSON in request body" },
        origin,
      );
    }

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
