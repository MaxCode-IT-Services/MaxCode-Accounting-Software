// Simple MongoDB-based rate limiter for Netlify Functions
// Supports per-IP and per-user limits, and exponential backoff for login

import { connectToDatabase } from "./mongodb.js";

const RATE_LIMIT_COLLECTION = "rate_limits";

// Helper: Get client IP from event
export function getClientIp(event) {
  // Netlify's edge-set client-ip cannot be spoofed by the caller. The leftmost
  // x-forwarded-for entry is attacker-controlled, so it is only a fallback for
  // local setups where no platform header is present.
  return (
    event.headers["client-ip"] ||
    event.requestContext?.identity?.sourceIp ||
    event.headers["x-real-ip"] ||
    event.headers["cf-connecting-ip"] ||
    event.headers["x-client-ip"] ||
    event.headers["fastly-client-ip"] ||
    event.headers["true-client-ip"] ||
    event.headers["x-forwarded-for"]?.split(",")[0] ||
    "unknown"
  );
}

// Login rate limit: 3 attempts/minute per IP, exponential backoff on fail
export async function checkLoginRateLimit(ip) {
  const { db } = await connectToDatabase();
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const maxAttempts = 3;

  const doc = await db
    .collection(RATE_LIMIT_COLLECTION)
    .findOne({ key: `login:${ip}` });
  if (doc && doc.blockUntil && doc.blockUntil > now) {
    // Return retryAfter in seconds
    return {
      blocked: true,
      retryAfter: Math.ceil((doc.blockUntil - now) / 1000),
    };
  }
  if (doc && doc.firstAttempt > now - windowMs) {
    if (doc.count >= maxAttempts) {
      // Exponential backoff: block for 5, 10, 15... minutes
      const blockMinutes = (doc.count - maxAttempts + 1) * 5;
      const blockMs = blockMinutes * 60 * 1000;
      await db.collection(RATE_LIMIT_COLLECTION).updateOne(
        { key: `login:${ip}` },
        {
          $set: { blockUntil: now + blockMs },
          $inc: { count: 1 },
        },
      );
      return { blocked: true, retryAfter: blockMinutes * 60 };
    } else {
      await db
        .collection(RATE_LIMIT_COLLECTION)
        .updateOne({ key: `login:${ip}` }, { $inc: { count: 1 } });
    }
  } else {
    await db
      .collection(RATE_LIMIT_COLLECTION)
      .updateOne(
        { key: `login:${ip}` },
        { $set: { count: 1, firstAttempt: now, blockUntil: 0 } },
        { upsert: true },
      );
  }
  return { blocked: false };
}

// On successful login, reset rate limit for IP
export async function resetLoginRateLimit(ip) {
  const { db } = await connectToDatabase();
  await db.collection(RATE_LIMIT_COLLECTION).deleteOne({ key: `login:${ip}` });
}

// Public (unauthenticated) payment actions: 10 per 5 minutes per IP, so a
// visitor cannot flood the owner's WhatsApp/Telegram with fake UTR submits.
export async function checkPublicActionRateLimit(ip, action = "public") {
  const { db } = await connectToDatabase();
  const now = Date.now();
  const windowMs = 5 * 60 * 1000;
  const maxAttempts = 10;
  const key = `public:${action}:${ip}`;

  const doc = await db
    .collection(RATE_LIMIT_COLLECTION)
    .findOne({ key });
  if (doc && doc.blockUntil && doc.blockUntil > now) {
    return {
      blocked: true,
      retryAfter: Math.ceil((doc.blockUntil - now) / 1000),
    };
  }
  if (doc && doc.firstAttempt > now - windowMs) {
    if (doc.count >= maxAttempts) {
      const blockMs = 15 * 60 * 1000;
      await db
        .collection(RATE_LIMIT_COLLECTION)
        .updateOne(
          { key },
          { $set: { blockUntil: now + blockMs }, $inc: { count: 1 } },
        );
      return { blocked: true, retryAfter: 15 * 60 };
    }
    await db
      .collection(RATE_LIMIT_COLLECTION)
      .updateOne({ key }, { $inc: { count: 1 } });
  } else {
    await db
      .collection(RATE_LIMIT_COLLECTION)
      .updateOne(
        { key },
        { $set: { count: 1, firstAttempt: now, blockUntil: 0 } },
        { upsert: true },
      );
  }
  return { blocked: false };
}

// Per-user rate limit: 60 requests/minute
// userRole must be passed (e.g. "super-admin", "admin", "team-member", etc)
export async function checkUserRateLimit(userId, userRole) {
  const { db } = await connectToDatabase();
  const now = Date.now();
  const windowMs = 60 * 1000;
  // Super Admin: 500/min, Admin: 200/min, Team/Other: 60/min
  let maxRequests = 60;
  if (userRole === "super-admin") {
    maxRequests = 500;
  } else if (userRole === "admin") {
    maxRequests = 200;
  } else {
    maxRequests = 60;
  }
  const blockMs = 5 * 60 * 1000; // 5 min block
  const doc = await db
    .collection(RATE_LIMIT_COLLECTION)
    .findOne({ key: `user:${userId}` });
  if (doc && doc.blockUntil && doc.blockUntil > now) {
    return {
      blocked: true,
      retryAfter: Math.ceil((doc.blockUntil - now) / 1000),
    };
  }
  if (doc && doc.firstRequest > now - windowMs) {
    if (doc.count >= maxRequests) {
      // Block for 5 min only (no exponential)
      await db
        .collection(RATE_LIMIT_COLLECTION)
        .updateOne(
          { key: `user:${userId}` },
          { $set: { blockUntil: now + blockMs } },
        );
      return {
        blocked: true,
        retryAfter: 5 * 60,
      };
    } else {
      await db
        .collection(RATE_LIMIT_COLLECTION)
        .updateOne({ key: `user:${userId}` }, { $inc: { count: 1 } });
    }
  } else {
    await db
      .collection(RATE_LIMIT_COLLECTION)
      .updateOne(
        { key: `user:${userId}` },
        { $set: { count: 1, firstRequest: now, blockUntil: 0 } },
        { upsert: true },
      );
  }
  return { blocked: false };
}

// Optionally, cleanup old rate limit docs (not required for basic use)
