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
        // Existing preferences
        clientManagementServerSide,
        vendorManagementServerSide,
        purchaseManagementServerSide,
        salesManagementServerSide,
        companyExpenseManagementServerSide,
        rcmManagementServerSide,
        // New preference for detailed ledger
        detailedLedgerManagementServerSide,
      } = body;

      // Validate preferences - check all boolean values
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
        {
          name: "companyExpenseManagementServerSide",
          value: companyExpenseManagementServerSide,
        },
        { name: "rcmManagementServerSide", value: rcmManagementServerSide },
        {
          name: "detailedLedgerManagementServerSide",
          value: detailedLedgerManagementServerSide,
        },
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

      // Build update object with only provided fields
      const updateFields = {};

      // Add existing preferences if provided
      if (clientManagementServerSide !== undefined)
        updateFields.clientManagementServerSide = clientManagementServerSide;

      if (vendorManagementServerSide !== undefined)
        updateFields.vendorManagementServerSide = vendorManagementServerSide;

      if (purchaseManagementServerSide !== undefined)
        updateFields.purchaseManagementServerSide =
          purchaseManagementServerSide;

      if (salesManagementServerSide !== undefined)
        updateFields.salesManagementServerSide = salesManagementServerSide;

      if (companyExpenseManagementServerSide !== undefined)
        updateFields.companyExpenseManagementServerSide =
          companyExpenseManagementServerSide;

      if (rcmManagementServerSide !== undefined)
        updateFields.rcmManagementServerSide = rcmManagementServerSide;

      // Add new detailed ledger preference if provided
      if (detailedLedgerManagementServerSide !== undefined)
        updateFields.detailedLedgerManagementServerSide =
          detailedLedgerManagementServerSide;

      // Check if any valid preference was provided
      if (Object.keys(updateFields).length === 0) {
        return createResponse(
          400,
          { error: "No valid preference provided" },
          origin,
        );
      }

      // Add timestamps
      updateFields.updatedAt = new Date();

      // Update or insert user preferences
      await preferencesCollection.updateOne(
        { userId },
        {
          $set: updateFields,
          $setOnInsert: {
            createdAt: new Date(),
            userId,
          },
        },
        { upsert: true },
      );

      return createResponse(
        200,
        {
          message: "Preference updated successfully",
          updated: updateFields,
        },
        origin,
      );
    }

    return createResponse(405, { error: "Method not allowed" }, origin);
  } catch (error) {
    console.error("User Preferences API Error:", error);

    // Handle JSON parse errors
    if (error instanceof SyntaxError) {
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
