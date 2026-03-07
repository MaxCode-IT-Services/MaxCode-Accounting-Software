import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { ObjectId } from "mongodb";
import { verifyRequestToken } from "./utils/auth.js";

const normalizeIncomingQutationData = (qutationData = {}) => {
  const normalizedData = { ...qutationData };

  if (!normalizedData.qutationExpiryDate && normalizedData.qutationValidity) {
    normalizedData.qutationExpiryDate = normalizedData.qutationValidity;
  }

  delete normalizedData.qutationValidity;

  return normalizedData;
};

const normalizeOutgoingQutationData = (qutationData = {}) => {
  const normalizedData = { ...qutationData };

  if (!normalizedData.qutationExpiryDate && normalizedData.qutationValidity) {
    normalizedData.qutationExpiryDate = normalizedData.qutationValidity;
  }

  return normalizedData;
};

/**
 * Qutation Management API
 * Handles CRUD operations for qutations with pagination support
 * Requires JWT authentication
 */
export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === "OPTIONS") {
    return createResponse(200, {}, origin);
  }

  try {
    verifyRequestToken(event);

    const { db } = await connectToDatabase();
    const qutationsCollection = db.collection("qutations");

    if (event.httpMethod === "GET") {
      const {
        id,
        page = 1,
        limit = 10,
        search,
        sortBy = "createdAt",
        sortOrder = "desc",
        filter,
      } = event.queryStringParameters || {};

      if (id) {
        const qutation = await qutationsCollection.findOne({
          _id: new ObjectId(id),
          isDeleted: { $ne: true },
        });

        if (!qutation) {
          return createResponse(404, { error: "Qutation not found" }, origin);
        }

        return createResponse(
          200,
          normalizeOutgoingQutationData(qutation),
          origin,
        );
      }

      const filterQuery = { isDeleted: { $ne: true } };
      const params = event.queryStringParameters || {};

      Object.entries(params).forEach(([key, value]) => {
        if (!value || value === "" || value === "All") return;
        if (key === "filter") return;

        const normalizedKey =
          key === "qutationValidity" ? "qutationExpiryDate" : key;

        if (
          ["page", "limit", "sortBy", "sortOrder", "search", "id"].includes(key)
        ) {
          return;
        }

        if (key.endsWith("_start") || key.endsWith("_end")) return;

        if (typeof value === "string" && value.includes(",")) {
          filterQuery[normalizedKey] = {
            $in: value
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean),
          };
          return;
        }

        if (typeof value === "string") {
          if (
            [
              "projectType",
              "qutationType",
              "qutationStatus",
              "qutationSendVia",
            ].includes(key)
          ) {
            filterQuery[normalizedKey] = value.trim();
          } else {
            filterQuery[normalizedKey] = {
              $regex: value.trim(),
              $options: "i",
            };
          }
          return;
        }

        filterQuery[normalizedKey] = value;
      });

      const dateRanges = {};

      Object.entries(params).forEach(([key, value]) => {
        if (!value) return;

        if (key.endsWith("_start")) {
          let baseKey = key.replace(/_start$/, "");
          if (baseKey === "createdDateTime") baseKey = "createdAt";
          if (baseKey === "qutationValidity") baseKey = "qutationExpiryDate";

          if (!dateRanges[baseKey]) dateRanges[baseKey] = {};

          const dateParts = value.split("-");
          if (dateParts.length === 3) {
            const [year, month, day] = dateParts.map((item) =>
              parseInt(item, 10),
            );
            dateRanges[baseKey].$gte = new Date(
              Date.UTC(year, month - 1, day, 0, 0, 0, 0),
            );
          }
        }

        if (key.endsWith("_end")) {
          let baseKey = key.replace(/_end$/, "");
          if (baseKey === "createdDateTime") baseKey = "createdAt";
          if (baseKey === "qutationValidity") baseKey = "qutationExpiryDate";

          if (!dateRanges[baseKey]) dateRanges[baseKey] = {};

          const dateParts = value.split("-");
          if (dateParts.length === 3) {
            const [year, month, day] = dateParts.map((item) =>
              parseInt(item, 10),
            );
            dateRanges[baseKey].$lte = new Date(
              Date.UTC(year, month - 1, day, 23, 59, 59, 999),
            );
          }
        }
      });

      Object.entries(dateRanges).forEach(([key, range]) => {
        filterQuery[key] = range;
      });

      if (filter) {
        if (filter === "send") {
          filterQuery.qutationStatus = { $in: ["Send", "Send + Approve"] };
        }

        if (filter === "approve") {
          filterQuery.qutationStatus = { $in: ["Approve", "Send + Approve"] };
        }

        if (filter === "reject") {
          filterQuery.qutationStatus = "Reject";
        }

        if (filter === "pending") {
          filterQuery.qutationStatus = "Pending";
        }
      }

      if (search) {
        filterQuery.$or = [
          { clientName: { $regex: search, $options: "i" } },
          { projectName: { $regex: search, $options: "i" } },
          { phoneNumber: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { qutationType: { $regex: search, $options: "i" } },
          { qutationStatus: { $regex: search, $options: "i" } },
          { qutationSendVia: { $regex: search, $options: "i" } },
        ];
      }

      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);
      const skip = (pageNum - 1) * limitNum;

      const sortObject = {};
      sortObject[sortBy] = sortOrder === "asc" ? 1 : -1;

      const totalRecords =
        await qutationsCollection.countDocuments(filterQuery);

      const qutations = await qutationsCollection
        .find(filterQuery)
        .sort(sortObject)
        .skip(skip)
        .limit(limitNum)
        .toArray();

      const normalizedQutations = qutations.map(normalizeOutgoingQutationData);

      const projectTypes = await qutationsCollection.distinct("projectType", {
        isDeleted: { $ne: true },
        projectType: { $exists: true, $ne: "" },
      });

      const qutationTypes = await qutationsCollection.distinct("qutationType", {
        isDeleted: { $ne: true },
        qutationType: { $exists: true, $ne: "" },
      });

      const qutationStatuses = await qutationsCollection.distinct(
        "qutationStatus",
        {
          isDeleted: { $ne: true },
          qutationStatus: { $exists: true, $ne: "" },
        },
      );

      const qutationSendVias = await qutationsCollection.distinct(
        "qutationSendVia",
        {
          isDeleted: { $ne: true },
          qutationSendVia: { $exists: true, $ne: "" },
        },
      );

      const totalSend = await qutationsCollection.countDocuments({
        isDeleted: { $ne: true },
        qutationStatus: { $in: ["Send", "Send + Approve"] },
      });

      const totalApprove = await qutationsCollection.countDocuments({
        isDeleted: { $ne: true },
        qutationStatus: { $in: ["Approve", "Send + Approve"] },
      });

      const totalReject = await qutationsCollection.countDocuments({
        isDeleted: { $ne: true },
        qutationStatus: "Reject",
      });

      const totalPending = await qutationsCollection.countDocuments({
        isDeleted: { $ne: true },
        qutationStatus: "Pending",
      });

      return createResponse(
        200,
        {
          data: normalizedQutations,
          pagination: {
            page: pageNum,
            limit: limitNum,
            totalRecords,
            totalPages: Math.ceil(totalRecords / limitNum),
          },
          statistics: {
            total: totalRecords,
            send: totalSend,
            approve: totalApprove,
            reject: totalReject,
            pending: totalPending,
          },
          filterOptions: {
            projectType: ["All", ...projectTypes.sort()],
            qutationType: ["All", ...qutationTypes.sort()],
            qutationStatus: ["All", ...qutationStatuses.sort()],
            qutationSendVia: ["All", ...qutationSendVias.sort()],
          },
        },
        origin,
      );
    }

    if (event.httpMethod === "POST") {
      const qutationData = normalizeIncomingQutationData(
        JSON.parse(event.body || "{}"),
      );

      const result = await qutationsCollection.insertOne({
        ...qutationData,
        qutationTotalAmount: Number(qutationData.qutationTotalAmount || 0),
        status: qutationData.status || "Active",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return createResponse(
        201,
        { message: "Qutation created successfully", id: result.insertedId },
        origin,
      );
    }

    if (event.httpMethod === "PUT") {
      const { id } = event.queryStringParameters || {};

      if (!id) {
        return createResponse(
          400,
          { error: "Qutation ID is required" },
          origin,
        );
      }

      const qutationData = normalizeIncomingQutationData(
        JSON.parse(event.body || "{}"),
      );

      const result = await qutationsCollection.updateOne(
        { _id: new ObjectId(id), isDeleted: { $ne: true } },
        {
          $set: {
            ...qutationData,
            qutationTotalAmount: Number(qutationData.qutationTotalAmount || 0),
            updatedAt: new Date(),
          },
        },
      );

      if (result.matchedCount === 0) {
        return createResponse(404, { error: "Qutation not found" }, origin);
      }

      return createResponse(
        200,
        { message: "Qutation updated successfully" },
        origin,
      );
    }

    if (event.httpMethod === "DELETE") {
      const { id } = event.queryStringParameters || {};

      if (!id) {
        return createResponse(
          400,
          { error: "Qutation ID is required" },
          origin,
        );
      }

      const result = await qutationsCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            isDeleted: true,
            deletedAt: new Date(),
            updatedAt: new Date(),
          },
        },
      );

      if (result.matchedCount === 0) {
        return createResponse(404, { error: "Qutation not found" }, origin);
      }

      return createResponse(
        200,
        { message: "Qutation deleted successfully" },
        origin,
      );
    }

    return createResponse(405, { error: "Method not allowed" }, origin);
  } catch (error) {
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
