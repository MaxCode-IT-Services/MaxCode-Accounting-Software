import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { verifyRequestToken } from "./utils/auth.js";

/**
 * Dashboard summary API
 * Returns all dashboard datasets in a single request to cut network round-trips.
 */
export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === "OPTIONS") {
    return createResponse(200, {}, origin);
  }

  if (event.httpMethod !== "GET") {
    return createResponse(405, { error: "Method not allowed" }, origin);
  }

  try {
    verifyRequestToken(event);

    const { db } = await connectToDatabase();

    const notDeletedQuery = { isDeleted: { $ne: true } };

    const [
      years,
      clients,
      vendors,
      staff,
      services,
      invoices,
      purchases,
      rcm,
      projects,
    ] = await Promise.all([
      db.collection("financialYears").find(notDeletedQuery).toArray(),
      db.collection("clients").find(notDeletedQuery).toArray(),
      db.collection("vendors").find(notDeletedQuery).toArray(),
      db.collection("staff").find(notDeletedQuery).toArray(),
      db.collection("services").find(notDeletedQuery).toArray(),
      db.collection("invoices").find(notDeletedQuery).toArray(),
      db.collection("purchases").find(notDeletedQuery).toArray(),
      db.collection("rcm").find(notDeletedQuery).toArray(),
      db.collection("projects").find(notDeletedQuery).toArray(),
    ]);

    return createResponse(
      200,
      {
        years,
        clients,
        vendors,
        staff,
        services,
        invoices,
        purchases,
        rcm,
        projects,
      },
      origin,
    );
  } catch (error) {
    console.error("Dashboard summary error:", error);
    return createResponse(
      500,
      {
        error: "Failed to fetch dashboard summary",
      },
      origin,
    );
  }
}
