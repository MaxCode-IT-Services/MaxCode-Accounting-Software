// Simple MongoDB-based rate limiter for Netlify Functions
// Supports per-IP and per-user limits, and exponential backoff for login

import { connectToDatabase } from "./mongodb.js";

const RATE_LIMIT_COLLECTION = "rate_limits";

// Helper: Get client IP from event
export function getClientIp(event) {
  return (
    event.headers["x-forwarded-for"]?.split(",")[0] ||
    event.headers["client-ip"] ||
    event.headers["x-real-ip"] ||
    event.headers["cf-connecting-ip"] ||
    event.headers["x-client-ip"] ||
    event.headers["fastly-client-ip"] ||
    event.headers["true-client-ip"] ||
    event.requestContext?.identity?.sourceIp ||
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

// Per-user rate limit: 60 requests/minute
export async function checkUserRateLimit(userId) {
  const { db } = await connectToDatabase();
  const now = Date.now();
  const windowMs = 60 * 1000;
  const maxRequests = 60;
  const doc = await db
    .collection(RATE_LIMIT_COLLECTION)
    .findOne({ key: `user:${userId}` });
  if (doc && doc.firstRequest > now - windowMs) {
    if (doc.count >= maxRequests) {
      return {
        blocked: true,
        retryAfter: Math.ceil((doc.firstRequest + windowMs - now) / 1000),
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
        { $set: { count: 1, firstRequest: now } },
        { upsert: true },
      );
  }
  return { blocked: false };
}

// Optionally, cleanup old rate limit docs (not required for basic use)
