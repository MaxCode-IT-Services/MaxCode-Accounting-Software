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
      const {
        clientManagementServerSide,
        vendorManagementServerSide,
        purchaseManagementServerSide,
        salesManagementServerSide,
        rcmManagementServerSide, // Added RCM management preference
      } = body;

      // Validate preferences
      const invalidPreference = [
        {
          name: "clientManagementServerSide",
          value: clientManagementServerSide,
        },
        {
          name: "vendorManagementServerSide",
          value: vendorManagementServerSide,
        },
        {
          name: "purchaseManagementServerSide",
          value: purchaseManagementServerSide,
        },
        { name: "salesManagementServerSide", value: salesManagementServerSide },
        { name: "rcmManagementServerSide", value: rcmManagementServerSide }, // Added validation
      ].some(
        ({ name, value }) => value !== undefined && typeof value !== "boolean",
      );

      if (invalidPreference) {
        return createResponse(
          400,
          {
            error:
              "Invalid value for server-side preferences. Must be boolean.",
          },
          origin,
        );
      }

      const updateFields = {};
      if (clientManagementServerSide !== undefined)
        updateFields.clientManagementServerSide = clientManagementServerSide;
      if (vendorManagementServerSide !== undefined)
        updateFields.vendorManagementServerSide = vendorManagementServerSide;
      if (purchaseManagementServerSide !== undefined)
        updateFields.purchaseManagementServerSide =
          purchaseManagementServerSide;
      if (salesManagementServerSide !== undefined)
        updateFields.salesManagementServerSide = salesManagementServerSide;
      if (rcmManagementServerSide !== undefined)
        // Added RCM preference
        updateFields.rcmManagementServerSide = rcmManagementServerSide;

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
    console.error("User Preferences API Error:", error);
    return createResponse(500, { error: error.message }, origin);
  }
}
