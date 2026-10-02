import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { verifyRequestToken } from "./utils/auth.js";

/**
 * Dashboard summary API
 * Returns all dashboard datasets in a single request to cut network round-trips.
 */
export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === "OPTIONS") {
    return createResponse(200, {}, origin, event);
  }

  if (event.httpMethod !== "GET") {
    return createResponse(405, { error: "Method not allowed" }, origin, event);
  }

  try {
    verifyRequestToken(event);

    const { db } = await connectToDatabase();

    const notDeletedQuery = { isDeleted: { $ne: true } };
    const idAndCreatedProjection = {
      _id: 1,
      id: 1,
      createdAt: 1,
      createdDate: 1,
      date: 1,
      isDeleted: 1,
    };
    const monetaryProjection = {
      _id: 1,
      id: 1,
      invoiceDate: 1,
      paymentDate: 1,
      createdAt: 1,
      createdDate: 1,
      date: 1,
      paymentStatus: 1,
      amountReceived: 1,
      amountPaid: 1,
      paidAmount: 1,
      totalAmount: 1,
      taxData: 1,
      isDeleted: 1,
    };
    const receiptProjection = {
      _id: 1,
      id: 1,
      receiptDate: 1,
      createdAt: 1,
      createdDate: 1,
      date: 1,
      paymentType: 1,
      amount: 1,
      adjustedAmount: 1,
      paymentMethod: 1,
      tdsEnabled: 1,
      tdsAmount: 1,
      tdsPercent: 1,
      grossAmount: 1,
      isDeleted: 1,
    };

    const [
      years,
      clients,
      vendors,
      staff,
      services,
      invoices,
      purchases,
      rcm,
      paymentReceipts,
      projects,
      fixedDeposits,
    ] = await Promise.all([
      db.collection("financialYears").find(notDeletedQuery).toArray(),
      db
        .collection("clients")
        .find(notDeletedQuery, { projection: idAndCreatedProjection })
        .toArray(),
      db
        .collection("vendors")
        .find(notDeletedQuery, { projection: idAndCreatedProjection })
        .toArray(),
      db
        .collection("staff")
        .find(notDeletedQuery, { projection: idAndCreatedProjection })
        .toArray(),
      db
        .collection("services")
        .find(notDeletedQuery, {
          projection: {
            _id: 1,
            id: 1,
            createdAt: 1,
            createdDate: 1,
            date: 1,
            invoiceDate: 1,
            isDeleted: 1,
          },
        })
        .toArray(),
      db
        .collection("invoices")
        .find(notDeletedQuery, { projection: monetaryProjection })
        .toArray(),
      db
        .collection("purchases")
        .find(notDeletedQuery, { projection: monetaryProjection })
        .toArray(),
      db
        .collection("rcm")
        .find(notDeletedQuery, { projection: monetaryProjection })
        .toArray(),
      db
        .collection("payment_receipts")
        .find(notDeletedQuery, { projection: receiptProjection })
        .toArray(),
      db
        .collection("projects")
        .find(notDeletedQuery, {
          projection: {
            _id: 1,
            id: 1,
            projectDate: 1,
            createdAt: 1,
            createdDate: 1,
            date: 1,
            paymentDetails: 1,
            developerTransactions: 1,
            isDeleted: 1,
          },
        })
        .toArray(),
      db
        .collection("fixedDeposits")
        .find(notDeletedQuery, {
          projection: {
            _id: 1,
            id: 1,
            fdNumber: 1,
            principalAmount: 1,
            fdStatus: 1,
            createdAt: 1,
            createdDate: 1,
            date: 1,
            isDeleted: 1,
          },
        })
        .toArray(),
    ]);

    return createResponse(200,
      {
        years,
        clients,
        vendors,
        staff,
        services,
        invoices,
        purchases,
        rcm,
        paymentReceipts,
        projects,
        fixedDeposits,
      },
      origin, event);
  } catch (error) {
    console.error("Dashboard summary error:", error);

    if (error.message.includes("token") || error.message.includes("Token")) {
      return createResponse(401,
        {
          error: "Unauthorized",
          message: error.message,
        },
        origin, event);
    }

    return createResponse(500,
      {
        error: "Failed to fetch dashboard summary",
        message: error.message,
      },
      origin, event);
  }
}
