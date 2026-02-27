import dotenv from "dotenv";
dotenv.config();
import { MongoClient } from "mongodb";
import { setupDb } from "./setupDb.js";

let cachedClient = null;
let cachedDb = null;

/**
 * Connects to MongoDB using connection pooling
 * Reuses existing connection if available
 */
export async function connectToDatabase() {
  // Return cached connection if available
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  const MONGODB_URI = process.env.MONGODB_URI;
  console.log("ENV VALUE:", process.env.MONGODB_URI);

  if (!MONGODB_URI) {
    throw new Error(
      "Please define the MONGODB_URI environment variable inside .env",
    );
  }

  try {
    const client = await MongoClient.connect(MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    const db = client.db(process.env.DB_NAME);

    // Cache the connection
    cachedClient = client;
    cachedDb = db;

    await setupDb(db);

    return { client, db };
  } catch (error) {
    console.error("MongoDB connection error:", error);
    throw error;
  }
}

/**
 * Helper to handle CORS headers
 * Allows localhost:5173 and localhost:5174 for development
 */
export function getCorsHeaders(origin) {
  const allowedOrigins = [
    "https://billing.maxcode.in",
    "https://billing-dausa.netlify.app",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
  ];

  // Only allow if origin is in allowedOrigins, else set to 'null'
  const corsOrigin = allowedOrigins.includes(origin) ? origin : "null";

  return {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
    "Access-Control-Allow-Credentials": "true",
  };
}

/**
 * Helper to create API response
 */
export function createResponse(
  statusCode,
  body,
  origin = null,
  extraHeaders = {},
) {
  return {
    statusCode,
    headers: {
      ...getCorsHeaders(origin),
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}
