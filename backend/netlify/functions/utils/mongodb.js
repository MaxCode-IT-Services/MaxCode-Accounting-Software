import dotenv from "dotenv";
dotenv.config();
import { MongoClient } from "mongodb";
import { setupDb } from "./setupDb.js";

let cachedClient = null;
let cachedDb = null;
let cachedClientPromise = null;
let isDbSetupCompleted = false;
let cachedSetupPromise = null;

const globalMongo = globalThis.__maxcodeMongo || {
  client: null,
  db: null,
  clientPromise: null,
  isDbSetupCompleted: false,
  setupPromise: null,
};
globalThis.__maxcodeMongo = globalMongo;

const readPositiveIntegerEnv = (envName, fallback) => {
  const envValue = Number(process.env[envName]);
  if (!Number.isFinite(envValue) || envValue <= 0) {
    return fallback;
  }
  return Math.floor(envValue);
};

const getPoolSize = () => {
  return readPositiveIntegerEnv("MONGODB_MAX_POOL_SIZE", 50);
};

const getMaxConnecting = () => {
  return readPositiveIntegerEnv("MONGODB_MAX_CONNECTING", 8);
};

const getMinPoolSize = () => {
  const envValue = Number(process.env.MONGODB_MIN_POOL_SIZE);
  if (!Number.isFinite(envValue) || envValue < 0) {
    return 0;
  }
  return Math.floor(envValue);
};

/**
 * Connects to MongoDB using connection pooling
 * Reuses existing connection if available
 */
export async function connectToDatabase() {
  // Return cached connection if available
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  if (globalMongo.client && globalMongo.db) {
    cachedClient = globalMongo.client;
    cachedDb = globalMongo.db;
    isDbSetupCompleted = globalMongo.isDbSetupCompleted;
    return { client: cachedClient, db: cachedDb };
  }

  const MONGODB_URI = process.env.MONGODB_URI;

  if (!MONGODB_URI) {
    throw new Error(
      "Please define the MONGODB_URI environment variable inside .env",
    );
  }

  try {
    if (!cachedClientPromise && !globalMongo.clientPromise) {
      const poolSize = getPoolSize();
      const maxConnecting = getMaxConnecting();
      const minPoolSize = getMinPoolSize();
      const client = new MongoClient(MONGODB_URI, {
        maxPoolSize: poolSize,
        maxConnecting,
        minPoolSize,
        maxIdleTimeMS: readPositiveIntegerEnv(
          "MONGODB_MAX_IDLE_TIME_MS",
          30000,
        ),
        serverSelectionTimeoutMS: readPositiveIntegerEnv(
          "MONGODB_SERVER_SELECTION_TIMEOUT_MS",
          15000,
        ),
        waitQueueTimeoutMS: readPositiveIntegerEnv(
          "MONGODB_WAIT_QUEUE_TIMEOUT_MS",
          20000,
        ),
        connectTimeoutMS: readPositiveIntegerEnv(
          "MONGODB_CONNECT_TIMEOUT_MS",
          10000,
        ),
        socketTimeoutMS: readPositiveIntegerEnv(
          "MONGODB_SOCKET_TIMEOUT_MS",
          45000,
        ),
      });

      cachedClientPromise = client.connect();
      globalMongo.clientPromise = cachedClientPromise;
    }

    const connectedClient =
      cachedClientPromise || globalMongo.clientPromise || null;

    if (!connectedClient) {
      throw new Error("Failed to initialize MongoDB client promise");
    }

    const client = await connectedClient;
    const db = client.db(process.env.DB_NAME || "maxcode");

    // Cache the connection
    cachedClient = client;
    cachedDb = db;
    globalMongo.client = client;
    globalMongo.db = db;

    if (!isDbSetupCompleted && !globalMongo.isDbSetupCompleted) {
      if (!cachedSetupPromise && !globalMongo.setupPromise) {
        cachedSetupPromise = setupDb(db);
        globalMongo.setupPromise = cachedSetupPromise;
      }

      const setupPromise = cachedSetupPromise || globalMongo.setupPromise;
      if (setupPromise) {
        await setupPromise;
      }

      isDbSetupCompleted = true;
      globalMongo.isDbSetupCompleted = true;
      cachedSetupPromise = null;
      globalMongo.setupPromise = null;
    }

    return { client, db };
  } catch (error) {
    console.error("MongoDB connection error:", error);
    cachedClientPromise = null;
    cachedSetupPromise = null;
    globalMongo.clientPromise = null;
    globalMongo.setupPromise = null;
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
