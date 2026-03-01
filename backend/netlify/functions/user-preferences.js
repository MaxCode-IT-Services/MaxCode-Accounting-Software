import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { verifyRequestToken } from "./utils/auth.js";

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

    const preferenceFields = [
      "clientManagementServerSide",
      "companyExpenseManagementServerSide",
      "detailedLedgerManagementServerSide",
      "purchaseManagementServerSide",
      "rcmManagementServerSide",
      "salesManagementServerSide",
      "servicesManagementServerSide",
      "vendorManagementServerSide",
    ];

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

      return merged;
    };

    // GET - Fetch user preferences
    if (event.httpMethod === "GET") {
      const pref = await preferencesCollection.findOne({ userId });

      // Return normalized preferences from top-level + legacy nested object
      return createResponse(200, mergePreferenceValues(pref), origin);
    }

    // POST/PUT - Save/update user preferences
    if (event.httpMethod === "POST" || event.httpMethod === "PUT") {
      const body = JSON.parse(event.body || "{}");

      // Build update object with only valid preference fields
      const updateFields = {};
      let invalidField = null;

      // Validate and collect preferences
      Object.entries(body).forEach(([key, value]) => {
        // Only process known preference fields
        if (preferenceFields.includes(key)) {
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
            error: `Invalid value for ${invalidField}. Must be boolean.`,
          },
          origin,
        );
      }

      if (Object.keys(updateFields).length === 0) {
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
      };

      // Update or insert preferences as top-level fields and remove legacy nested object
      await preferencesCollection.updateOne(
        { userId },
        {
          $set: {
            userId,
            ...finalPreferences,
            updatedAt: new Date(),
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
