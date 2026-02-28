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
      const { clientManagementServerSide } = body;
      if (typeof clientManagementServerSide !== "boolean") {
        return createResponse(
          400,
          { error: "Invalid value for clientManagementServerSide" },
          origin,
        );
      }
      await preferencesCollection.updateOne(
        { userId },
        { $set: { clientManagementServerSide } },
        { upsert: true },
      );
      return createResponse(200, { message: "Preference updated" }, origin);
    }

    return createResponse(405, { error: "Method not allowed" }, origin);
  } catch (error) {
    return createResponse(500, { error: error.message }, origin);
  }
}
