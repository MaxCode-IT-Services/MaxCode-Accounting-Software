import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { ObjectId } from "mongodb";
import { verifyRequestToken } from "./utils/auth.js";

/**
 * Notification API
 * - GET: fetch notifications (with optional filters)
 * - POST: create notification (expiry, custom, etc.)
 * - PUT: mark as read, update
 * - DELETE: delete notification
 */
export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin;
  if (event.httpMethod === "OPTIONS") {
    return createResponse(200, {}, origin);
  }
  try {
    verifyRequestToken(event);
    const { db } = await connectToDatabase();
    const notifications = db.collection("notifications");

    if (event.httpMethod === "GET") {
      // Optional: filter by userId, unread, etc.
      const { userId, unread } = event.queryStringParameters || {};
      const query = {};
      if (userId) query.userId = userId;
      if (unread) query.read = false;
      const result = await notifications
        .find(query)
        .sort({ createdAt: -1 })
        .toArray();
      return createResponse(200, result, origin);
    }

    if (event.httpMethod === "POST") {
      // Accepts: { userId, serviceName, businessName, daysLeft, expiryDate, price, taxPercent }
      const body = JSON.parse(event.body || "{}");
      const {
        userId,
        serviceName,
        businessName,
        daysLeft,
        expiryDate,
        price,
        taxPercent,
      } = body;
      if (
        !userId ||
        !serviceName ||
        !businessName ||
        !daysLeft ||
        !expiryDate ||
        !price ||
        !taxPercent
      ) {
        return createResponse(
          400,
          { error: "Missing required fields" },
          origin,
        );
      }
      const taxAmount = Math.round((price * taxPercent) / 100);
      const totalAmount = price + taxAmount;
      const description = `<b>${serviceName}</b> Subscription for <b>${businessName}</b> is Expiring in <b>${daysLeft} days</b>. Expiry Date: <b>${expiryDate}</b>, Price: <b>₹${price}</b>, Tax <b>${taxPercent}%</b>: <b>₹${taxAmount}</b>, Total Amount <b>₹${totalAmount}</b>.<br/>Please take necessary action to renew or notify the client.`;
      const doc = {
        userId,
        title: "📢 Subscription Expiry Reminder",
        description,
        serviceName,
        businessName,
        daysLeft,
        expiryDate,
        price,
        taxPercent,
        taxAmount,
        totalAmount,
        read: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const result = await notifications.insertOne(doc);
      return createResponse(
        201,
        { message: "Notification created", id: result.insertedId },
        origin,
      );
    }

    if (event.httpMethod === "PUT") {
      // Mark as read or update notification
      const { id } = event.queryStringParameters || {};
      if (!id || !ObjectId.isValid(id)) {
        return createResponse(
          400,
          { error: "Invalid notification ID" },
          origin,
        );
      }
      const body = JSON.parse(event.body || "{}");
      const update = { ...body, updatedAt: new Date() };
      const result = await notifications.updateOne(
        { _id: new ObjectId(id) },
        { $set: update },
      );
      if (result.matchedCount === 0) {
        return createResponse(404, { error: "Notification not found" }, origin);
      }
      return createResponse(200, { message: "Notification updated" }, origin);
    }

    if (event.httpMethod === "DELETE") {
      const { id } = event.queryStringParameters || {};
      if (!id || !ObjectId.isValid(id)) {
        return createResponse(
          400,
          { error: "Invalid notification ID" },
          origin,
        );
      }
      const result = await notifications.deleteOne({ _id: new ObjectId(id) });
      if (result.deletedCount === 0) {
        return createResponse(404, { error: "Notification not found" }, origin);
      }
      return createResponse(200, { message: "Notification deleted" }, origin);
    }

    return createResponse(405, { error: "Method not allowed" }, origin);
  } catch (error) {
    console.error("Notification API Error:", error);
    return createResponse(
      500,
      { error: "Internal server error", message: error.message },
      origin,
    );
  }
}
