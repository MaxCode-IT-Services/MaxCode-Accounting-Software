import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { ObjectId } from "mongodb";
import { verifyRequestToken, getAuditFieldsFromEvent } from "./utils/auth.js";

const LEADS_META_CACHE_TTL_MS = 60000;
let leadsMetaCache = {
  value: null,
  expiresAt: 0,
};

/**
 * Lead Management API
 * Handles CRUD operations for leads with pagination and filters
 */
export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === "OPTIONS") {
    return createResponse(200, {}, origin);
  }

  try {
    verifyRequestToken(event);

    const { db } = await connectToDatabase();
    const leadsCollection = db.collection("leads");

    if (event.httpMethod === "GET") {
      const {
        id,
        page = 1,
        limit = 10,
        includeMeta = "true",
        search,
        leadStatus,
        priority,
        leadSource,
        interestedService,
        status,
        sortBy = "createdAt",
        sortOrder = "desc",
        filter,
      } = event.queryStringParameters || {};

      if (id) {
        if (!ObjectId.isValid(id)) {
          return createResponse(400, { error: "Invalid lead ID" }, origin);
        }

        const lead = await leadsCollection.findOne({
          _id: new ObjectId(id),
          isDeleted: { $ne: true },
        });

        if (!lead) {
          return createResponse(404, { error: "Lead not found" }, origin);
        }

        return createResponse(200, lead, origin);
      }

      const params = event.queryStringParameters || {};
      const filterQuery = { isDeleted: { $ne: true } };

      Object.entries(params).forEach(([key, value]) => {
        if (!value || value === "" || value === "All") return;
        if (key === "filter") return;
        if (
          [
            "id",
            "page",
            "limit",
            "sortBy",
            "sortOrder",
            "search",
            "includeMeta",
          ].includes(key)
        )
          return;

        if (key.endsWith("_start") || key.endsWith("_end")) return;

        if (
          [
            "leadStatus",
            "priority",
            "leadSource",
            "interestedService",
            "contactBy",
            "status",
          ].includes(key)
        ) {
          filterQuery[key] = String(value).trim();
          return;
        }

        if (typeof value === "string" && value.includes(",")) {
          filterQuery[key] = { $in: value.split(",").map((v) => v.trim()) };
          return;
        }

        filterQuery[key] = { $regex: String(value).trim(), $options: "i" };
      });

      const dateRanges = {};

      Object.entries(params).forEach(([key, value]) => {
        if (!value) return;

        if (key.endsWith("_start")) {
          const baseKey = key.replace(/_start$/, "");
          if (!dateRanges[baseKey]) dateRanges[baseKey] = {};
          dateRanges[baseKey].$gte = String(value);
        }

        if (key.endsWith("_end")) {
          const baseKey = key.replace(/_end$/, "");
          if (!dateRanges[baseKey]) dateRanges[baseKey] = {};
          dateRanges[baseKey].$lte = String(value);
        }
      });

      Object.entries(dateRanges).forEach(([key, range]) => {
        filterQuery[key] = range;
      });

      if (filter) {
        switch (filter) {
          case "new":
            filterQuery.leadStatus = "New";
            break;
          case "contacted":
            filterQuery.leadStatus = "Contacted";
            break;
          case "qualified":
            filterQuery.leadStatus = "Qualified";
            break;
          case "proposalSent":
            filterQuery.leadStatus = "Proposal Sent";
            break;
          case "success":
            filterQuery.leadStatus = "Success";
            break;
          case "lost":
            filterQuery.leadStatus = "Lost";
            break;
          default:
            break;
        }
      }

      if (search) {
        filterQuery.$or = [
          { leadName: { $regex: search, $options: "i" } },
          { businessName: { $regex: search, $options: "i" } },
          { phoneNumber: { $regex: search, $options: "i" } },
          { whatsappNumber: { $regex: search, $options: "i" } },
          { interestedService: { $regex: search, $options: "i" } },
          { leadSource: { $regex: search, $options: "i" } },
          { contactBy: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { notes: { $regex: search, $options: "i" } },
        ];
      }

      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 10;
      const skip = (pageNum - 1) * limitNum;
      const shouldIncludeMeta = includeMeta !== "false";

      const sortObject = {
        [sortBy]: sortOrder === "asc" ? 1 : -1,
      };

      const totalRecords = await leadsCollection.countDocuments(filterQuery);

      const leads = await leadsCollection
        .find(filterQuery)
        .sort(sortObject)
        .skip(skip)
        .limit(limitNum)
        .toArray();

      if (!shouldIncludeMeta) {
        return createResponse(
          200,
          {
            data: leads,
            pagination: {
              page: pageNum,
              limit: limitNum,
              totalRecords,
              totalPages: Math.ceil(totalRecords / limitNum),
            },
          },
          origin,
        );
      }

      const [
        leadSourceValues,
        priorityValues,
        leadStatusValues,
        interestedServiceValues,
        contactByValues,
        statusValues,
        totalNew,
        totalContacted,
        totalQualified,
        totalProposalSent,
        totalSuccess,
        totalLost,
        totalAll,
      ] =
        leadsMetaCache.value && leadsMetaCache.expiresAt > Date.now()
          ? leadsMetaCache.value
          : await Promise.all([
              leadsCollection.distinct("leadSource", {
                isDeleted: { $ne: true },
                leadSource: { $exists: true, $ne: "" },
              }),
              leadsCollection.distinct("priority", {
                isDeleted: { $ne: true },
                priority: { $exists: true, $ne: "" },
              }),
              leadsCollection.distinct("leadStatus", {
                isDeleted: { $ne: true },
                leadStatus: { $exists: true, $ne: "" },
              }),
              leadsCollection.distinct("interestedService", {
                isDeleted: { $ne: true },
                interestedService: { $exists: true, $ne: "" },
              }),
              leadsCollection.distinct("contactBy", {
                isDeleted: { $ne: true },
                contactBy: { $exists: true, $ne: "" },
              }),
              leadsCollection.distinct("status", {
                isDeleted: { $ne: true },
                status: { $exists: true, $ne: "" },
              }),
              leadsCollection.countDocuments({
                isDeleted: { $ne: true },
                leadStatus: "New",
              }),
              leadsCollection.countDocuments({
                isDeleted: { $ne: true },
                leadStatus: "Contacted",
              }),
              leadsCollection.countDocuments({
                isDeleted: { $ne: true },
                leadStatus: "Qualified",
              }),
              leadsCollection.countDocuments({
                isDeleted: { $ne: true },
                leadStatus: "Proposal Sent",
              }),
              leadsCollection.countDocuments({
                isDeleted: { $ne: true },
                leadStatus: "Success",
              }),
              leadsCollection.countDocuments({
                isDeleted: { $ne: true },
                leadStatus: "Lost",
              }),
              leadsCollection.countDocuments({
                isDeleted: { $ne: true },
              }),
            ]);

      if (!leadsMetaCache.value || leadsMetaCache.expiresAt <= Date.now()) {
        leadsMetaCache = {
          value: [
            leadSourceValues,
            priorityValues,
            leadStatusValues,
            interestedServiceValues,
            contactByValues,
            statusValues,
            totalNew,
            totalContacted,
            totalQualified,
            totalProposalSent,
            totalSuccess,
            totalLost,
            totalAll,
          ],
          expiresAt: Date.now() + LEADS_META_CACHE_TTL_MS,
        };
      }

      return createResponse(
        200,
        {
          data: leads,
          pagination: {
            page: pageNum,
            limit: limitNum,
            totalRecords,
            totalPages: Math.ceil(totalRecords / limitNum),
          },
          statistics: {
            total: totalAll,
            new: totalNew,
            contacted: totalContacted,
            qualified: totalQualified,
            proposalSent: totalProposalSent,
            success: totalSuccess,
            lost: totalLost,
          },
          filterOptions: {
            leadSource: ["All", ...leadSourceValues.sort()],
            priority: ["All", ...priorityValues.sort()],
            leadStatus: ["All", ...leadStatusValues.sort()],
            interestedService: ["All", ...interestedServiceValues.sort()],
            contactBy: ["All", ...contactByValues.sort()],
            status: ["All", ...statusValues.sort()],
          },
        },
        origin,
      );
    }

    if (event.httpMethod === "POST") {
      const leadData = JSON.parse(event.body || "{}");

      if (leadData.phoneNumber) {
        const existingPhone = await leadsCollection.findOne({
          phoneNumber: leadData.phoneNumber,
          isDeleted: { $ne: true },
        });

        if (existingPhone) {
          return createResponse(
            409,
            { error: "Phone Number already exists in lead list." },
            origin,
          );
        }
      }

      const result = await leadsCollection.insertOne({
        ...leadData,
        status: leadData.status || "Active",
        priority: leadData.priority || "Medium",
        leadStatus: leadData.leadStatus || "New",
        createdAt: new Date(),
        updatedAt: new Date(),
        ...getAuditFieldsFromEvent(event, "create"),
      });

      return createResponse(
        201,
        {
          message: "Lead created successfully",
          id: result.insertedId,
        },
        origin,
      );
    }

    if (event.httpMethod === "PUT") {
      const { id } = event.queryStringParameters || {};

      if (!id || !ObjectId.isValid(id)) {
        return createResponse(
          400,
          { error: "Valid lead ID is required" },
          origin,
        );
      }

      const leadData = JSON.parse(event.body || "{}");
      const leadObjectId = new ObjectId(id);

      if (leadData.phoneNumber) {
        const existingPhone = await leadsCollection.findOne({
          _id: { $ne: leadObjectId },
          phoneNumber: leadData.phoneNumber,
          isDeleted: { $ne: true },
        });

        if (existingPhone) {
          return createResponse(
            409,
            { error: "Phone Number already exists in lead list." },
            origin,
          );
        }
      }

      const result = await leadsCollection.updateOne(
        { _id: leadObjectId, isDeleted: { $ne: true } },
        {
          $set: {
            ...leadData,
            updatedAt: new Date(),
          },
        },
      );

      if (result.matchedCount === 0) {
        return createResponse(404, { error: "Lead not found" }, origin);
      }

      return createResponse(
        200,
        { message: "Lead updated successfully" },
        origin,
      );
    }

    if (event.httpMethod === "DELETE") {
      const { id } = event.queryStringParameters || {};

      if (!id || !ObjectId.isValid(id)) {
        return createResponse(
          400,
          { error: "Valid lead ID is required" },
          origin,
        );
      }

      const result = await leadsCollection.updateOne(
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
        return createResponse(404, { error: "Lead not found" }, origin);
      }

      return createResponse(
        200,
        { message: "Lead deleted successfully" },
        origin,
      );
    }

    return createResponse(405, { error: "Method not allowed" }, origin);
  } catch (error) {
    console.error("Lead API Error:", error);

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
