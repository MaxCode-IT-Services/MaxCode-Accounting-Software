import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { ObjectId } from "mongodb";
import { verifyRequestToken } from "./utils/auth.js";

/**
 * Project Credentials API
 * Handles CRUD with pagination, filters, search and card statistics
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
    const collection = db.collection("projectCredentials");

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
        if (!ObjectId.isValid(id)) {
          return createResponse(400, { error: "Invalid record ID" }, origin);
        }

        const record = await collection.findOne({
          _id: new ObjectId(id),
          isDeleted: { $ne: true },
        });

        if (!record) {
          return createResponse(404, { error: "Record not found" }, origin);
        }

        return createResponse(200, record, origin);
      }

      const params = event.queryStringParameters || {};
      const filterQuery = { isDeleted: { $ne: true } };

      Object.entries(params).forEach(([key, value]) => {
        if (!value || value === "" || value === "All") return;

        if (
          [
            "id",
            "page",
            "limit",
            "search",
            "sortBy",
            "sortOrder",
            "filter",
          ].includes(key)
        )
          return;

        if (key.endsWith("_start") || key.endsWith("_end")) return;

        if (typeof value === "string" && value.includes(",")) {
          filterQuery[key] = {
            $in: value
              .split(",")
              .map((row) => row.trim())
              .filter(Boolean),
          };
          return;
        }

        if (
          ["clientName", "projectName", "serverName", "databaseName"].includes(
            key,
          )
        ) {
          filterQuery[key] = value.trim();
          return;
        }

        filterQuery[key] = { $regex: String(value).trim(), $options: "i" };
      });

      if (filter) {
        switch (filter) {
          case "withWebsite":
            filterQuery.$or = [
              { websiteGithubRepoName: { $exists: true, $ne: "" } },
              { websiteGithubUrl: { $exists: true, $ne: "" } },
            ];
            break;
          case "withApp":
            filterQuery.$or = [
              { appGithubRepoName: { $exists: true, $ne: "" } },
              { appGithubUrl: { $exists: true, $ne: "" } },
            ];
            break;
          case "withServer":
            filterQuery.$or = [
              { serverName: { $exists: true, $ne: "" } },
              { serverUsername: { $exists: true, $ne: "" } },
              { serverPassword: { $exists: true, $ne: "" } },
            ];
            break;
          case "withDatabase":
            filterQuery.$or = [
              { databaseName: { $exists: true, $ne: "" } },
              { databaseId: { $exists: true, $ne: "" } },
              { databasePassword: { $exists: true, $ne: "" } },
            ];
            break;
          default:
            break;
        }
      }

      if (search) {
        filterQuery.$and = filterQuery.$and || [];
        filterQuery.$and.push({
          $or: [
            { clientName: { $regex: search, $options: "i" } },
            { businessName: { $regex: search, $options: "i" } },
            { projectName: { $regex: search, $options: "i" } },
            { websiteGithubRepoName: { $regex: search, $options: "i" } },
            { websiteGithubUrl: { $regex: search, $options: "i" } },
            { appGithubRepoName: { $regex: search, $options: "i" } },
            { appGithubUrl: { $regex: search, $options: "i" } },
            { serverName: { $regex: search, $options: "i" } },
            { serverUsername: { $regex: search, $options: "i" } },
            { databaseName: { $regex: search, $options: "i" } },
            { databaseId: { $regex: search, $options: "i" } },
            { appUsername: { $regex: search, $options: "i" } },
          ],
        });
      }

      const pageNum = Math.max(parseInt(page, 10) || 1, 1);
      const limitNum = Math.max(parseInt(limit, 10) || 10, 1);
      const skip = (pageNum - 1) * limitNum;

      const sortObject = {
        [sortBy]: sortOrder === "asc" ? 1 : -1,
      };

      const totalRecords = await collection.countDocuments(filterQuery);

      const data = await collection
        .find(filterQuery)
        .sort(sortObject)
        .skip(skip)
        .limit(limitNum)
        .toArray();

      const clientNameValues = await collection.distinct("clientName", {
        isDeleted: { $ne: true },
        clientName: { $exists: true, $ne: "" },
      });

      const total = await collection.countDocuments({
        isDeleted: { $ne: true },
      });
      const withWebsite = await collection.countDocuments({
        isDeleted: { $ne: true },
        $or: [
          { websiteGithubRepoName: { $exists: true, $ne: "" } },
          { websiteGithubUrl: { $exists: true, $ne: "" } },
        ],
      });
      const withApp = await collection.countDocuments({
        isDeleted: { $ne: true },
        $or: [
          { appGithubRepoName: { $exists: true, $ne: "" } },
          { appGithubUrl: { $exists: true, $ne: "" } },
        ],
      });
      const withServer = await collection.countDocuments({
        isDeleted: { $ne: true },
        $or: [
          { serverName: { $exists: true, $ne: "" } },
          { serverUsername: { $exists: true, $ne: "" } },
          { serverPassword: { $exists: true, $ne: "" } },
        ],
      });
      const withDatabase = await collection.countDocuments({
        isDeleted: { $ne: true },
        $or: [
          { databaseName: { $exists: true, $ne: "" } },
          { databaseId: { $exists: true, $ne: "" } },
          { databasePassword: { $exists: true, $ne: "" } },
        ],
      });

      return createResponse(
        200,
        {
          data,
          pagination: {
            page: pageNum,
            limit: limitNum,
            totalRecords,
            totalPages: Math.ceil(totalRecords / limitNum),
          },
          statistics: {
            total,
            withWebsite,
            withApp,
            withServer,
            withDatabase,
          },
          filterOptions: {
            clientName: ["All", ...clientNameValues.sort()],
          },
        },
        origin,
      );
    }

    if (event.httpMethod === "POST") {
      const payload = JSON.parse(event.body || "{}");

      if (!String(payload.clientRefId || "").trim()) {
        return createResponse(
          400,
          { error: "Select Client is required" },
          origin,
        );
      }

      if (!String(payload.projectName || "").trim()) {
        return createResponse(
          400,
          { error: "Project Name is required" },
          origin,
        );
      }

      const existingRecord = await collection.findOne({
        clientRefId: payload.clientRefId,
        projectName: payload.projectName,
        isDeleted: { $ne: true },
      });

      if (existingRecord) {
        return createResponse(
          409,
          {
            error:
              "Credentials for this client and project already exist. Please edit existing record.",
          },
          origin,
        );
      }

      const result = await collection.insertOne({
        ...payload,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return createResponse(
        201,
        {
          message: "Project credentials created successfully",
          id: result.insertedId,
        },
        origin,
      );
    }

    if (event.httpMethod === "PUT") {
      const { id } = event.queryStringParameters || {};
      if (!id || !ObjectId.isValid(id)) {
        return createResponse(400, { error: "Valid ID is required" }, origin);
      }

      const payload = JSON.parse(event.body || "{}");

      if (!String(payload.clientRefId || "").trim()) {
        return createResponse(
          400,
          { error: "Select Client is required" },
          origin,
        );
      }

      if (!String(payload.projectName || "").trim()) {
        return createResponse(
          400,
          { error: "Project Name is required" },
          origin,
        );
      }

      const duplicate = await collection.findOne({
        _id: { $ne: new ObjectId(id) },
        clientRefId: payload.clientRefId,
        projectName: payload.projectName,
        isDeleted: { $ne: true },
      });

      if (duplicate) {
        return createResponse(
          409,
          {
            error:
              "Credentials for this client and project already exist. Please use different project name.",
          },
          origin,
        );
      }

      const result = await collection.updateOne(
        { _id: new ObjectId(id), isDeleted: { $ne: true } },
        {
          $set: {
            ...payload,
            updatedAt: new Date(),
          },
        },
      );

      if (result.matchedCount === 0) {
        return createResponse(404, { error: "Record not found" }, origin);
      }

      return createResponse(
        200,
        { message: "Project credentials updated successfully" },
        origin,
      );
    }

    if (event.httpMethod === "DELETE") {
      const { id } = event.queryStringParameters || {};
      if (!id || !ObjectId.isValid(id)) {
        return createResponse(400, { error: "Valid ID is required" }, origin);
      }

      const result = await collection.updateOne(
        { _id: new ObjectId(id), isDeleted: { $ne: true } },
        {
          $set: {
            isDeleted: true,
            deletedAt: new Date(),
            updatedAt: new Date(),
          },
        },
      );

      if (result.matchedCount === 0) {
        return createResponse(404, { error: "Record not found" }, origin);
      }

      return createResponse(
        200,
        { message: "Project credentials deleted successfully" },
        origin,
      );
    }

    return createResponse(405, { error: "Method not allowed" }, origin);
  } catch (error) {
    console.error("Project Credentials API Error:", error);

    if (error.message.includes("token") || error.message.includes("Token")) {
      return createResponse(401, { error: "Unauthorized" }, origin);
    }

    if (error.name === "SyntaxError") {
      return createResponse(
        400,
        { error: "Invalid JSON in request body" },
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
