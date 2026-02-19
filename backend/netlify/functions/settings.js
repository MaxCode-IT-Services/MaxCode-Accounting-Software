import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { ObjectId } from "mongodb";
import {
  verifyRequestToken,
  comparePassword,
  hashPassword,
  sanitizeUser,
} from "./utils/auth.js";

const PROFILE_FIELDS = [
  "firstName",
  "lastName",
  "name",
  "email",
  "phone",
  "address",
];

const toTrimmedString = (value) => {
  if (value === undefined || value === null) return "";
  return String(value).trim();
};

const buildProfileResponse = (user) => ({
  firstName: toTrimmedString(user?.firstName),
  lastName: toTrimmedString(user?.lastName),
  name: toTrimmedString(user?.name),
  email: toTrimmedString(user?.email),
  phone: toTrimmedString(user?.phone),
  address: toTrimmedString(user?.address),
  role: toTrimmedString(user?.role) || "user",
});

const getAuthenticatedUserQuery = (decodedToken) => {
  if (decodedToken?.userId) {
    try {
      return { _id: new ObjectId(decodedToken.userId) };
    } catch {
      // fallback below
    }
  }

  if (decodedToken?.phone) {
    return { phone: String(decodedToken.phone) };
  }

  return null;
};

export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === "OPTIONS") {
    return createResponse(200, {}, origin);
  }

  try {
    const decodedToken = verifyRequestToken(event);
    const userQuery = getAuthenticatedUserQuery(decodedToken);

    if (!userQuery) {
      return createResponse(401, { error: "Unauthorized" }, origin);
    }

    const { db } = await connectToDatabase();
    const usersCollection = db.collection("users");

    const currentUser = await usersCollection.findOne(userQuery);

    if (!currentUser) {
      return createResponse(404, { error: "User not found" }, origin);
    }

    if (event.httpMethod === "GET") {
      return createResponse(
        200,
        {
          profile: buildProfileResponse(currentUser),
          user: sanitizeUser(currentUser),
        },
        origin,
      );
    }

    if (event.httpMethod === "PUT") {
      const body = event.body ? JSON.parse(event.body) : {};
      const action = toTrimmedString(body.action).toLowerCase();

      if (action === "change-pin") {
        const oldPin = toTrimmedString(body.oldPin);
        const newPin = toTrimmedString(body.newPin);

        if (!/^\d{6}$/.test(oldPin) || !/^\d{6}$/.test(newPin)) {
          return createResponse(
            400,
            { error: "Old PIN and New PIN must be exactly 6 digits" },
            origin,
          );
        }

        if (oldPin === newPin) {
          return createResponse(
            400,
            { error: "New PIN cannot be same as old PIN" },
            origin,
          );
        }

        const isOldPinValid = await comparePassword(
          oldPin,
          currentUser.pin || "",
        );

        if (!isOldPinValid) {
          return createResponse(401, { error: "Invalid old PIN" }, origin);
        }

        const hashedPin = await hashPassword(newPin);

        await usersCollection.updateOne(
          { _id: currentUser._id },
          {
            $set: {
              pin: hashedPin,
              updatedAt: new Date(),
            },
          },
        );

        return createResponse(
          200,
          { message: "PIN updated successfully" },
          origin,
        );
      }

      const updates = {};

      PROFILE_FIELDS.forEach((field) => {
        if (Object.prototype.hasOwnProperty.call(body, field)) {
          updates[field] = toTrimmedString(body[field]);
        }
      });

      if (Object.prototype.hasOwnProperty.call(updates, "phone")) {
        updates.phone = updates.phone.replace(/\D/g, "").slice(0, 10);
        if (updates.phone && !/^\d{10}$/.test(updates.phone)) {
          return createResponse(
            400,
            { error: "Phone number must be exactly 10 digits" },
            origin,
          );
        }
      }

      if (Object.prototype.hasOwnProperty.call(updates, "email")) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (updates.email && !emailRegex.test(updates.email)) {
          return createResponse(
            400,
            { error: "Please provide a valid email address" },
            origin,
          );
        }
      }

      if (Object.prototype.hasOwnProperty.call(updates, "name")) {
        const nameParts = updates.name.split(" ").filter(Boolean);
        if (!Object.prototype.hasOwnProperty.call(updates, "firstName")) {
          updates.firstName = nameParts[0] || "";
        }
        if (!Object.prototype.hasOwnProperty.call(updates, "lastName")) {
          updates.lastName = nameParts.slice(1).join(" ") || "";
        }
      }

      if (
        Object.prototype.hasOwnProperty.call(updates, "phone") &&
        updates.phone
      ) {
        const existingPhoneUser = await usersCollection.findOne({
          phone: updates.phone,
          _id: { $ne: currentUser._id },
        });

        if (existingPhoneUser) {
          return createResponse(
            409,
            { error: "Phone number already in use by another user" },
            origin,
          );
        }
      }

      if (
        Object.prototype.hasOwnProperty.call(updates, "email") &&
        updates.email
      ) {
        const existingEmailUser = await usersCollection.findOne({
          email: updates.email,
          _id: { $ne: currentUser._id },
        });

        if (existingEmailUser) {
          return createResponse(
            409,
            { error: "Email already in use by another user" },
            origin,
          );
        }
      }

      if (Object.keys(updates).length === 0) {
        return createResponse(
          400,
          { error: "No valid fields to update" },
          origin,
        );
      }

      updates.updatedAt = new Date();

      await usersCollection.updateOne(
        { _id: currentUser._id },
        {
          $set: updates,
        },
      );

      const updatedUser = await usersCollection.findOne({
        _id: currentUser._id,
      });

      return createResponse(
        200,
        {
          message: "Profile updated successfully",
          profile: buildProfileResponse(updatedUser),
          user: sanitizeUser(updatedUser),
        },
        origin,
      );
    }

    return createResponse(405, { error: "Method not allowed" }, origin);
  } catch (error) {
    console.error("Settings API Error:", error);

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
