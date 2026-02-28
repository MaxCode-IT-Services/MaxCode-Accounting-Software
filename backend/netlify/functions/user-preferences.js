import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { verifyRequestToken } from "./utils/auth.js";

/**
 * User Preferences API
 * Stores and fetches user-specific preferences (e.g., server-side mode)
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

    if (event.httpMethod === "GET") {
      // Fetch user preferences
      const pref = await preferencesCollection.findOne({ userId });
      return createResponse(200, pref || {}, origin);
    }

    if (event.httpMethod === "POST" || event.httpMethod === "PUT") {
      // Save/update user preferences
      const body = JSON.parse(event.body || "{}");
      const { clientManagementServerSide, vendorManagementServerSide } = body;
      // At least one of the preferences must be present and boolean
      if (
        (clientManagementServerSide !== undefined &&
          typeof clientManagementServerSide !== "boolean") ||
        (vendorManagementServerSide !== undefined &&
          typeof vendorManagementServerSide !== "boolean")
      ) {
        return createResponse(
          400,
          {
            error:
              "Invalid value for clientManagementServerSide or vendorManagementServerSide",
          },
          origin,
        );
      }
      const updateFields = {};
      if (clientManagementServerSide !== undefined)
        updateFields.clientManagementServerSide = clientManagementServerSide;
      if (vendorManagementServerSide !== undefined)
        updateFields.vendorManagementServerSide = vendorManagementServerSide;
      if (Object.keys(updateFields).length === 0) {
        return createResponse(
          400,
          { error: "No valid preference provided" },
          origin,
        );
      }
      await preferencesCollection.updateOne(
        { userId },
        { $set: updateFields },
        { upsert: true },
      );
      return createResponse(200, { message: "Preference updated" }, origin);
    }

    return createResponse(405, { error: "Method not allowed" }, origin);
  } catch (error) {
    return createResponse(500, { error: error.message }, origin);
  }
}
