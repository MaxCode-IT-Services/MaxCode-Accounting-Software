import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { ObjectId } from "mongodb";
import { verifyRequestToken } from "./utils/auth.js";

/**
 * Project Management API
 * Handles CRUD operations for projects
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
    const projectsCollection = db.collection("projects");
    const yearsCollection = db.collection("financialYears");

    const getDateOnly = (value) => {
      if (!value) return null;
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return null;
      return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    };

    const isDateWithinFinancialYear = (dateValue, financialYearRecord) => {
      const selectedDate = getDateOnly(dateValue);
      const startDate = getDateOnly(financialYearRecord?.startDate);
      const endDate = getDateOnly(financialYearRecord?.endDate);

      if (!selectedDate || !startDate || !endDate) return false;
      return selectedDate >= startDate && selectedDate <= endDate;
    };

    if (event.httpMethod === "GET") {
      const { id, clientId } = event.queryStringParameters || {};

      if (id) {
        if (!ObjectId.isValid(id)) {
          return createResponse(400, { error: "Invalid project ID" }, origin);
        }

        const projectRecord = await projectsCollection.findOne({
          _id: new ObjectId(id),
          isDeleted: { $ne: true },
        });

        if (!projectRecord) {
          return createResponse(
            404,
            { error: "Project record not found" },
            origin,
          );
        }

        return createResponse(200, projectRecord, origin);
      }

      const query = { isDeleted: { $ne: true } };

      if (clientId) {
        query.clientId = clientId;
      }

      const projectRecords = await projectsCollection
        .find(query)
        .sort({ createdAt: -1 })
        .toArray();

      return createResponse(200, projectRecords, origin);
    }

    if (event.httpMethod === "POST") {
      const projectData = JSON.parse(event.body || "{}");

      if (!projectData.projectId) {
        return createResponse(400, { error: "Project ID is required" }, origin);
      }

      if (!projectData.projectDate) {
        return createResponse(
          400,
          { error: "Project Date is required" },
          origin,
        );
      }

      const defaultFinancialYear = await yearsCollection.findOne({
        isDeleted: { $ne: true },
        isDefault: true,
        status: { $ne: "Inactive" },
      });

      if (!defaultFinancialYear?.startDate || !defaultFinancialYear?.endDate) {
        return createResponse(
          400,
          {
            error:
              "Default financial year not configured. Please set a default financial year first.",
          },
          origin,
        );
      }

      if (
        !isDateWithinFinancialYear(
          projectData.projectDate,
          defaultFinancialYear,
        )
      ) {
        return createResponse(
          400,
          {
            error: `Project Date must be between ${defaultFinancialYear.startDate} and ${defaultFinancialYear.endDate} (Default Financial Year: ${defaultFinancialYear.financialYear})`,
          },
          origin,
        );
      }

      const existing = await projectsCollection.findOne({
        projectId: projectData.projectId,
        isDeleted: { $ne: true },
      });

      if (existing) {
        return createResponse(
          409,
          { error: "Project ID already exists" },
          origin,
        );
      }

      const result = await projectsCollection.insertOne({
        ...projectData,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return createResponse(
        201,
        {
          message: "Project record created successfully",
          id: result.insertedId,
        },
        origin,
      );
    }

    if (event.httpMethod === "PUT") {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(400, { error: "Project ID is required" }, origin);
      }

      if (!ObjectId.isValid(id)) {
        return createResponse(400, { error: "Invalid project ID" }, origin);
      }

      const projectData = JSON.parse(event.body || "{}");
      const projectObjectId = new ObjectId(id);

      if (!projectData.projectDate) {
        return createResponse(
          400,
          { error: "Project Date is required" },
          origin,
        );
      }

      const defaultFinancialYear = await yearsCollection.findOne({
        isDeleted: { $ne: true },
        isDefault: true,
        status: { $ne: "Inactive" },
      });

      if (!defaultFinancialYear?.startDate || !defaultFinancialYear?.endDate) {
        return createResponse(
          400,
          {
            error:
              "Default financial year not configured. Please set a default financial year first.",
          },
          origin,
        );
      }

      if (
        !isDateWithinFinancialYear(
          projectData.projectDate,
          defaultFinancialYear,
        )
      ) {
        return createResponse(
          400,
          {
            error: `Project Date must be between ${defaultFinancialYear.startDate} and ${defaultFinancialYear.endDate} (Default Financial Year: ${defaultFinancialYear.financialYear})`,
          },
          origin,
        );
      }

      if (projectData.projectId) {
        const existing = await projectsCollection.findOne({
          _id: { $ne: projectObjectId },
          projectId: projectData.projectId,
          isDeleted: { $ne: true },
        });

        if (existing) {
          return createResponse(
            409,
            { error: "Project ID already exists" },
            origin,
          );
        }
      }

      const result = await projectsCollection.updateOne(
        { _id: projectObjectId, isDeleted: { $ne: true } },
        {
          $set: {
            ...projectData,
            updatedAt: new Date(),
          },
        },
      );

      if (result.matchedCount === 0) {
        return createResponse(
          404,
          { error: "Project record not found" },
          origin,
        );
      }

      return createResponse(
        200,
        { message: "Project record updated successfully" },
        origin,
      );
    }

    if (event.httpMethod === "DELETE") {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(400, { error: "Project ID is required" }, origin);
      }

      if (!ObjectId.isValid(id)) {
        return createResponse(400, { error: "Invalid project ID" }, origin);
      }

      const result = await projectsCollection.updateOne(
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
        return createResponse(
          404,
          { error: "Project record not found" },
          origin,
        );
      }

      return createResponse(
        200,
        { message: "Project record deleted successfully" },
        origin,
      );
    }

    return createResponse(405, { error: "Method not allowed" }, origin);
  } catch (error) {
    console.error("Projects API Error:", error);

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
