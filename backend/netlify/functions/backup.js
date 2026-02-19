import { connectToDatabase, createResponse } from "./utils/mongodb.js";

/**
 * Backup API Endpoint
 * Returns all collections data for backup purposes
 * Requires BACKUP_API_KEY authentication (not JWT)
 */
export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin;

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return createResponse(200, {}, origin);
  }

  try {
    // Only allow GET requests
    if (event.httpMethod !== "GET") {
      return createResponse(
        405,
        { error: "Method not allowed. Use GET." },
        origin,
      );
    }

    // Verify API Key authentication
    const apiKey =
      event.headers["x-api-key"] ||
      event.headers["X-API-Key"] ||
      event.queryStringParameters?.apiKey;

    const BACKUP_API_KEY = process.env.BACKUP_API_KEY;

    if (!BACKUP_API_KEY) {
      return createResponse(
        500,
        {
          error:
            "Backup API key not configured on server. Set BACKUP_API_KEY environment variable.",
        },
        origin,
      );
    }

    if (!apiKey || apiKey !== BACKUP_API_KEY) {
      return createResponse(
        401,
        {
          error:
            "Unauthorized. Invalid or missing API key. Provide X-API-Key header.",
        },
        origin,
      );
    }

    // Connect to database
    const { db } = await connectToDatabase();

    console.log("📦 Fetching all collections for backup...");

    // Fetch all collections
    const backupData = {
      metadata: {
        timestamp: new Date().toISOString(),
        version: "1.0",
        source: "MaxCode Invoice Software",
      },
      collections: {},
    };

    // List of collections to backup
    const collections = [
      "clients",
      "vendors",
      "staff",
      "invoices",
      "purchases",
      "rcm",
      "projects",
      "services",
      "years",
      "businessSettings",
    ];

    // Fetch each collection
    for (const collectionName of collections) {
      try {
        const collection = db.collection(collectionName);
        const data = await collection.find({}).toArray();
        backupData.collections[collectionName] = data;
        console.log(`  ✅ ${collectionName}: ${data.length} records`);
      } catch (error) {
        console.error(`  ❌ Error fetching ${collectionName}:`, error.message);
        backupData.collections[collectionName] = [];
      }
    }

    const totalRecords = Object.values(backupData.collections).reduce(
      (sum, arr) => sum + arr.length,
      0,
    );

    console.log(`✅ Backup complete: ${totalRecords} total records`);

    return createResponse(
      200,
      {
        success: true,
        data: backupData,
        stats: {
          totalRecords,
          collections: Object.keys(backupData.collections).length,
          timestamp: backupData.metadata.timestamp,
        },
      },
      origin,
    );
  } catch (error) {
    console.error("❌ Backup error:", error);
    return createResponse(
      500,
      {
        error: "Failed to create backup",
        message: error.message,
      },
      origin,
    );
  }
}
