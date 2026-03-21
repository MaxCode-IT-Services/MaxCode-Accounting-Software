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

    const escapeRegExp = (value) => {
      return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    };

    const getFinancialYearToken = (financialYearValue) => {
      const value = String(financialYearValue || "").trim();
      if (/^\d{4}-\d{4}$/.test(value)) {
        return `${value.slice(2, 4)}-${value.slice(-2)}`;
      }
      if (/^\d{4}-\d{2}$/.test(value)) {
        return `${value.slice(2, 4)}-${value.slice(-2)}`;
      }
      if (/^\d{2}-\d{2}$/.test(value)) {
        return value;
      }
      return "";
    };

    const buildFallbackProjectFormat = (financialYearValue) => {
      const token = getFinancialYearToken(financialYearValue);
      if (!token) return "";
      return `MC/PRJ/${token}/0001`;
    };

    const getNextProjectId = async ({ format, financialYear }) => {
      const normalizedFormat = String(format || "").trim();
      if (!normalizedFormat) return "";

      const match = normalizedFormat.match(/^(.*?)(\d+)$/);
      if (!match) return normalizedFormat;

      const prefix = match[1];
      const seed = match[2];
      const width = seed.length;
      const seedNumber = parseInt(seed, 10) || 1;
      const pattern = new RegExp(`^${escapeRegExp(prefix)}(\\d+)$`);

      const query = {
        projectId: { $regex: pattern },
        isDeleted: { $ne: true },
      };

      if (financialYear) {
        query.financialYear = String(financialYear).trim();
      }

      const existingRows = await projectsCollection
        .find(query, { projection: { projectId: 1 } })
        .toArray();

      let maxNumber = 0;
      existingRows.forEach((row) => {
        const projectId = String(row?.projectId || "");
        const rowMatch = projectId.match(pattern);
        if (!rowMatch) return;
        const current = parseInt(rowMatch[1], 10);
        if (!Number.isNaN(current) && current > maxNumber) {
          maxNumber = current;
        }
      });

      const nextNumber = Math.max(seedNumber, maxNumber + 1);
      return `${prefix}${String(nextNumber).padStart(width, "0")}`;
    };

    const resolveProjectNumberContext = async (requestedFinancialYear) => {
      const normalizedRequestedFinancialYear = String(
        requestedFinancialYear || "",
      ).trim();

      let yearRecord = null;
      if (normalizedRequestedFinancialYear) {
        yearRecord = await yearsCollection.findOne({
          financialYear: normalizedRequestedFinancialYear,
          isDeleted: { $ne: true },
        });
      }

      if (!yearRecord) {
        yearRecord = await yearsCollection.findOne({
          isDeleted: { $ne: true },
          isDefault: true,
          status: { $ne: "Inactive" },
        });
      }

      const financialYear =
        normalizedRequestedFinancialYear ||
        String(yearRecord?.financialYear || "").trim();

      const format =
        String(yearRecord?.projectFormat || "").trim() ||
        buildFallbackProjectFormat(financialYear);

      return {
        financialYear,
        format,
      };
    };

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
      const {
        action,
        id,
        clientId,
        view,
        page = 1,
        limit = 10,
        search,
        financialYear,
        period,
        sortBy = "createdAt",
        sortOrder = "desc",
        filter,
      } = event.queryStringParameters || {};

      if (action === "next-number") {
        const { financialYear, format } = await resolveProjectNumberContext(
          event.queryStringParameters?.financialYear,
        );

        const nextNumber = await getNextProjectId({
          format,
          financialYear,
        });

        if (!nextNumber) {
          return createResponse(
            400,
            {
              error:
                "Could not generate project ID. Please configure financial year format first.",
            },
            origin,
          );
        }

        return createResponse(
          200,
          {
            nextNumber,
            projectId: nextNumber,
            financialYear,
            format,
          },
          origin,
        );
      }

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

      const normalizedView = String(view || "")
        .trim()
        .toLowerCase();
      if (normalizedView === "developerpayouts") {
        const params = event.queryStringParameters || {};
        const pageNum = Math.max(parseInt(page, 10) || 1, 1);
        const limitNum = Math.max(parseInt(limit, 10) || 10, 1);
        const skip = (pageNum - 1) * limitNum;

        const buildPeriodRange = (periodValue) => {
          const normalizedPeriod = String(periodValue || "")
            .trim()
            .toLowerCase();

          if (!normalizedPeriod || normalizedPeriod === "yearly") {
            return null;
          }

          const now = new Date();

          if (normalizedPeriod === "daily") {
            return {
              $gte: new Date(
                now.getFullYear(),
                now.getMonth(),
                now.getDate(),
                0,
                0,
                0,
                0,
              ),
              $lte: new Date(
                now.getFullYear(),
                now.getMonth(),
                now.getDate(),
                23,
                59,
                59,
                999,
              ),
            };
          }

          if (normalizedPeriod === "monthly") {
            return {
              $gte: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
              $lte: new Date(
                now.getFullYear(),
                now.getMonth() + 1,
                0,
                23,
                59,
                59,
                999,
              ),
            };
          }

          if (normalizedPeriod === "quarterly") {
            const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
            return {
              $gte: new Date(
                now.getFullYear(),
                quarterStartMonth,
                1,
                0,
                0,
                0,
                0,
              ),
              $lte: new Date(
                now.getFullYear(),
                quarterStartMonth + 3,
                0,
                23,
                59,
                59,
                999,
              ),
            };
          }

          if (normalizedPeriod === "halfyearly") {
            const halfStartMonth = now.getMonth() < 6 ? 0 : 6;
            return {
              $gte: new Date(now.getFullYear(), halfStartMonth, 1, 0, 0, 0, 0),
              $lte: new Date(
                now.getFullYear(),
                halfStartMonth + 6,
                0,
                23,
                59,
                59,
                999,
              ),
            };
          }

          return null;
        };

        const projectMatch = { isDeleted: { $ne: true } };
        if (financialYear && financialYear !== "ALL") {
          projectMatch.financialYear = String(financialYear).trim();
        }

        const prePipeline = [
          { $match: projectMatch },
          {
            $project: {
              _id: 1,
              projectId: 1,
              projectName: 1,
              phoneNumber: 1,
              totalDeveloperCost: { $ifNull: ["$totalDeveloperCost", 0] },
              projectDate: 1,
              createdAt: 1,
              developerTransactions: {
                $ifNull: ["$developerTransactions", []],
              },
            },
          },
          {
            $unwind: {
              path: "$developerTransactions",
              preserveNullAndEmptyArrays: false,
            },
          },
          {
            $addFields: {
              payoutDateResolved: {
                $ifNull: [
                  "$developerTransactions.payoutDate",
                  {
                    $ifNull: [
                      "$developerTransactions.paymentDate",
                      { $ifNull: ["$projectDate", "$createdAt"] },
                    ],
                  },
                ],
              },
              developerName: {
                $ifNull: ["$developerTransactions.staffName", "-"],
              },
              payoutMethod: {
                $ifNull: [
                  "$developerTransactions.payoutMethod",
                  "Bank Transfer",
                ],
              },
              description: {
                $ifNull: ["$developerTransactions.description", "-"],
              },
              payoutAmount: {
                $convert: {
                  input: "$developerTransactions.payoutAmount",
                  to: "double",
                  onError: 0,
                  onNull: 0,
                },
              },
            },
          },
        ];

        const payoutMatch = {};
        const periodRange = buildPeriodRange(period);
        if (periodRange) {
          payoutMatch.payoutDateResolved = periodRange;
        }

        if (search) {
          payoutMatch.$or = [
            { developerName: { $regex: search, $options: "i" } },
            { projectName: { $regex: search, $options: "i" } },
            { projectId: { $regex: search, $options: "i" } },
            { payoutMethod: { $regex: search, $options: "i" } },
            { description: { $regex: search, $options: "i" } },
            { phoneNumber: { $regex: search, $options: "i" } },
          ];
        }

        Object.entries(params).forEach(([key, value]) => {
          if (!value || value === "" || value === "All") return;
          if (
            [
              "id",
              "clientId",
              "view",
              "page",
              "limit",
              "search",
              "financialYear",
              "period",
              "sortBy",
              "sortOrder",
              "filter",
            ].includes(key)
          ) {
            return;
          }

          if (key.endsWith("_start") || key.endsWith("_end")) return;

          const keyMap = {
            developerName: "developerName",
            payoutMethod: "payoutMethod",
            projectName: "projectName",
            projectId: "projectId",
            description: "description",
          };

          const mappedKey = keyMap[key] || key;

          if (typeof value === "string" && value.includes(",")) {
            payoutMatch[mappedKey] = {
              $in: value
                .split(",")
                .map((row) => row.trim())
                .filter(Boolean),
            };
            return;
          }

          if (["developerName", "payoutMethod", "projectName"].includes(key)) {
            payoutMatch[mappedKey] = String(value).trim();
            return;
          }

          payoutMatch[mappedKey] = {
            $regex: String(value).trim(),
            $options: "i",
          };
        });

        const dateRanges = {};
        Object.entries(params).forEach(([key, value]) => {
          if (!value) return;

          if (key.endsWith("_start")) {
            const baseKey = key.replace(/_start$/, "");
            if (!dateRanges[baseKey]) dateRanges[baseKey] = {};
            const dateParts = String(value).split("-");
            if (dateParts.length === 3) {
              const year = parseInt(dateParts[0], 10);
              const month = parseInt(dateParts[1], 10) - 1;
              const day = parseInt(dateParts[2], 10);
              dateRanges[baseKey].$gte = new Date(
                Date.UTC(year, month, day, 0, 0, 0, 0),
              );
            }
          }

          if (key.endsWith("_end")) {
            const baseKey = key.replace(/_end$/, "");
            if (!dateRanges[baseKey]) dateRanges[baseKey] = {};
            const dateParts = String(value).split("-");
            if (dateParts.length === 3) {
              const year = parseInt(dateParts[0], 10);
              const month = parseInt(dateParts[1], 10) - 1;
              const day = parseInt(dateParts[2], 10);
              dateRanges[baseKey].$lte = new Date(
                Date.UTC(year, month, day, 23, 59, 59, 999),
              );
            }
          }
        });

        if (dateRanges.payoutDate) {
          payoutMatch.payoutDateResolved = {
            ...(payoutMatch.payoutDateResolved || {}),
            ...dateRanges.payoutDate,
          };
        }

        const sortFieldMapping = {
          payoutDate: "payoutDateResolved",
          payoutAmount: "payoutAmount",
          developerName: "developerName",
          projectName: "projectName",
          payoutMethod: "payoutMethod",
          projectId: "projectId",
        };

        const sortStage = {
          [sortFieldMapping[sortBy] || "payoutDateResolved"]:
            sortOrder === "asc" ? 1 : -1,
        };

        const aggregateResult = await projectsCollection
          .aggregate([
            ...prePipeline,
            { $match: payoutMatch },
            {
              $facet: {
                data: [
                  { $sort: sortStage },
                  { $skip: skip },
                  { $limit: limitNum },
                  {
                    $project: {
                      _id: 0,
                      id: {
                        $concat: [
                          { $toString: "$_id" },
                          "-",
                          { $ifNull: ["$developerTransactions.id", "0"] },
                        ],
                      },
                      projectObjectId: "$_id",
                      projectId: "$projectId",
                      projectName: "$projectName",
                      phoneNumber: { $ifNull: ["$phoneNumber", "-"] },
                      developerName: "$developerName",
                      payoutMethod: "$payoutMethod",
                      description: "$description",
                      payoutAmount: "$payoutAmount",
                      payoutDateRaw: "$payoutDateResolved",
                      payoutDate: "$payoutDateResolved",
                      totalDeveloperCost: "$totalDeveloperCost",
                    },
                  },
                ],
                totalCount: [{ $count: "count" }],
                optionBuckets: [
                  {
                    $group: {
                      _id: null,
                      developerNames: { $addToSet: "$developerName" },
                      payoutMethods: { $addToSet: "$payoutMethod" },
                      projectNames: { $addToSet: "$projectName" },
                    },
                  },
                ],
                projectCostBuckets: [
                  {
                    $group: {
                      _id: "$_id",
                      projectCost: { $first: "$totalDeveloperCost" },
                    },
                  },
                  {
                    $group: {
                      _id: null,
                      totalProjects: { $sum: 1 },
                      totalDeveloperCost: { $sum: "$projectCost" },
                    },
                  },
                ],
                payoutBuckets: [
                  {
                    $group: {
                      _id: null,
                      totalPayout: { $sum: "$payoutAmount" },
                      developers: { $addToSet: "$developerName" },
                    },
                  },
                ],
              },
            },
          ])
          .toArray();

        const facet = aggregateResult[0] || {};
        const rows = Array.isArray(facet.data) ? facet.data : [];
        const totalRecords = Number(facet.totalCount?.[0]?.count || 0);
        const optionBuckets = facet.optionBuckets?.[0] || {};
        const projectCostBuckets = facet.projectCostBuckets?.[0] || {};
        const payoutBuckets = facet.payoutBuckets?.[0] || {};

        const uniqueDeveloperCount = (
          Array.isArray(payoutBuckets.developers)
            ? payoutBuckets.developers
            : []
        ).filter(
          (name) => String(name || "").trim() && String(name) !== "-",
        ).length;

        const totalDeveloperCost = Number(
          projectCostBuckets.totalDeveloperCost || 0,
        );
        const totalPayout = Number(payoutBuckets.totalPayout || 0);

        return createResponse(
          200,
          {
            data: rows,
            pagination: {
              page: pageNum,
              limit: limitNum,
              totalRecords,
              totalPages: Math.ceil(totalRecords / limitNum),
            },
            statistics: {
              totalDevelopers: uniqueDeveloperCount,
              totalProjects: Number(projectCostBuckets.totalProjects || 0),
              totalDeveloperCost,
              totalPayout,
              pendingPayout: totalDeveloperCost - totalPayout,
            },
            filterOptions: {
              developerName: [
                "All",
                ...(Array.isArray(optionBuckets.developerNames)
                  ? optionBuckets.developerNames
                  : []
                )
                  .filter((value) => String(value || "").trim())
                  .sort(),
              ],
              payoutMethod: [
                "All",
                ...(Array.isArray(optionBuckets.payoutMethods)
                  ? optionBuckets.payoutMethods
                  : []
                )
                  .filter((value) => String(value || "").trim())
                  .sort(),
              ],
              projectName: [
                "All",
                ...(Array.isArray(optionBuckets.projectNames)
                  ? optionBuckets.projectNames
                  : []
                )
                  .filter((value) => String(value || "").trim())
                  .sort(),
              ],
            },
          },
          origin,
        );
      }

      const params = event.queryStringParameters || {};
      const query = { isDeleted: { $ne: true } };

      if (clientId) {
        query.clientId = clientId;
      }

      if (financialYear && financialYear !== "ALL") {
        query.financialYear = String(financialYear).trim();
      }

      Object.entries(params).forEach(([key, value]) => {
        if (!value || value === "" || value === "All") return;
        if (key === "filter") return;

        if (
          [
            "id",
            "clientId",
            "page",
            "limit",
            "search",
            "sortBy",
            "sortOrder",
            "financialYear",
            "period",
          ].includes(key)
        ) {
          return;
        }

        if (key.endsWith("_start") || key.endsWith("_end")) return;

        const mappedKey =
          key === "taxPercentage" ? "summary.taxPercentage" : key;

        if (typeof value === "string" && value.includes(",")) {
          query[mappedKey] = {
            $in: value
              .split(",")
              .map((row) => row.trim())
              .filter(Boolean),
          };
          return;
        }

        if (
          [
            "businessName",
            "clientName",
            "projectName",
            "taxPercentage",
          ].includes(key)
        ) {
          if (key === "taxPercentage") {
            const parsed = Number(value);
            if (!Number.isNaN(parsed)) {
              query[mappedKey] = parsed;
            }
          } else {
            query[mappedKey] = String(value).trim();
          }
          return;
        }

        query[mappedKey] = { $regex: String(value).trim(), $options: "i" };
      });

      const dateRanges = {};
      Object.entries(params).forEach(([key, value]) => {
        if (!value) return;

        if (key.endsWith("_start")) {
          let baseKey = key.replace(/_start$/, "");
          if (baseKey === "createdDateTime") baseKey = "createdAt";
          if (baseKey === "projectDateFormatted") baseKey = "projectDate";

          if (!dateRanges[baseKey]) dateRanges[baseKey] = {};

          const dateParts = String(value).split("-");
          if (dateParts.length === 3) {
            const year = parseInt(dateParts[0], 10);
            const month = parseInt(dateParts[1], 10) - 1;
            const day = parseInt(dateParts[2], 10);
            dateRanges[baseKey].$gte = new Date(
              Date.UTC(year, month, day, 0, 0, 0, 0),
            );
          }
        }

        if (key.endsWith("_end")) {
          let baseKey = key.replace(/_end$/, "");
          if (baseKey === "createdDateTime") baseKey = "createdAt";
          if (baseKey === "projectDateFormatted") baseKey = "projectDate";

          if (!dateRanges[baseKey]) dateRanges[baseKey] = {};

          const dateParts = String(value).split("-");
          if (dateParts.length === 3) {
            const year = parseInt(dateParts[0], 10);
            const month = parseInt(dateParts[1], 10) - 1;
            const day = parseInt(dateParts[2], 10);
            dateRanges[baseKey].$lte = new Date(
              Date.UTC(year, month, day, 23, 59, 59, 999),
            );
          }
        }
      });

      Object.entries(dateRanges).forEach(([key, range]) => {
        query[key] = range;
      });

      const andConditions = [];

      if (filter) {
        if (filter === "totalAmountWithTax") {
          andConditions.push({
            $or: [
              { "summary.totalAmountWithTax": { $gt: 0 } },
              { projectTotalCost: { $gt: 0 } },
            ],
          });
        }
        if (filter === "totalProjectValue") {
          andConditions.push({
            $or: [
              { "summary.totalProjectAmountWithoutTax": { $gt: 0 } },
              { projectTotalCost: { $gt: 0 } },
            ],
          });
        }
        if (filter === "totalClientPayable") {
          andConditions.push({ "summary.totalClientPayable": { $gt: 0 } });
        }
        if (filter === "totalDeveloperPayable") {
          andConditions.push({ "summary.totalDeveloperPayable": { $gt: 0 } });
        }
        if (filter === "totalRemainingAmount") {
          andConditions.push({ "summary.remainingAmount": { $ne: 0 } });
        }
      }

      if (search) {
        andConditions.push({
          $or: [
            { projectId: { $regex: search, $options: "i" } },
            { projectName: { $regex: search, $options: "i" } },
            { clientName: { $regex: search, $options: "i" } },
            { businessName: { $regex: search, $options: "i" } },
            { phoneNumber: { $regex: search, $options: "i" } },
            { email: { $regex: search, $options: "i" } },
          ],
        });
      }

      if (andConditions.length > 0) {
        query.$and = andConditions;
      }

      const normalizedPeriod = String(period || "")
        .trim()
        .toLowerCase();
      if (normalizedPeriod && normalizedPeriod !== "yearly") {
        const now = new Date();

        if (normalizedPeriod === "daily") {
          const start = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            0,
            0,
            0,
            0,
          );
          const end = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            23,
            59,
            59,
            999,
          );
          query.projectDate = {
            ...(query.projectDate || {}),
            $gte: start,
            $lte: end,
          };
        }

        if (normalizedPeriod === "monthly") {
          const start = new Date(
            now.getFullYear(),
            now.getMonth(),
            1,
            0,
            0,
            0,
            0,
          );
          const end = new Date(
            now.getFullYear(),
            now.getMonth() + 1,
            0,
            23,
            59,
            59,
            999,
          );
          query.projectDate = {
            ...(query.projectDate || {}),
            $gte: start,
            $lte: end,
          };
        }

        if (normalizedPeriod === "quarterly") {
          const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
          const start = new Date(
            now.getFullYear(),
            quarterStartMonth,
            1,
            0,
            0,
            0,
            0,
          );
          const end = new Date(
            now.getFullYear(),
            quarterStartMonth + 3,
            0,
            23,
            59,
            59,
            999,
          );
          query.projectDate = {
            ...(query.projectDate || {}),
            $gte: start,
            $lte: end,
          };
        }

        if (normalizedPeriod === "halfyearly") {
          const halfStartMonth = now.getMonth() < 6 ? 0 : 6;
          const start = new Date(
            now.getFullYear(),
            halfStartMonth,
            1,
            0,
            0,
            0,
            0,
          );
          const end = new Date(
            now.getFullYear(),
            halfStartMonth + 6,
            0,
            23,
            59,
            59,
            999,
          );
          query.projectDate = {
            ...(query.projectDate || {}),
            $gte: start,
            $lte: end,
          };
        }
      }

      const pageNum = Math.max(parseInt(page, 10) || 1, 1);
      const limitNum = Math.max(parseInt(limit, 10) || 10, 1);
      const skip = (pageNum - 1) * limitNum;

      const sortFieldMapping = {
        projectDateFormatted: "projectDate",
        createdDateTime: "createdAt",
        totalProjectAmountWithoutTax: "summary.totalProjectAmountWithoutTax",
        totalAmountWithTax: "summary.totalAmountWithTax",
        totalClientPayable: "summary.totalClientPayable",
        totalDeveloperPayable: "summary.totalDeveloperPayable",
        remainingAmount: "summary.remainingAmount",
        taxPercentage: "summary.taxPercentage",
      };

      const sortObject = {};
      sortObject[sortFieldMapping[sortBy] || sortBy] =
        sortOrder === "asc" ? 1 : -1;

      const totalRecords = await projectsCollection.countDocuments(query);

      const projectRecords = await projectsCollection
        .find(query)
        .sort(sortObject)
        .skip(skip)
        .limit(limitNum)
        .toArray();

      const statsMatchQuery = {
        isDeleted: { $ne: true },
      };
      if (clientId) statsMatchQuery.clientId = clientId;
      if (financialYear && financialYear !== "ALL") {
        statsMatchQuery.financialYear = String(financialYear).trim();
      }

      if (normalizedPeriod && normalizedPeriod !== "yearly") {
        const now = new Date();

        if (normalizedPeriod === "daily") {
          const start = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            0,
            0,
            0,
            0,
          );
          const end = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
            23,
            59,
            59,
            999,
          );
          statsMatchQuery.projectDate = {
            ...(statsMatchQuery.projectDate || {}),
            $gte: start,
            $lte: end,
          };
        }

        if (normalizedPeriod === "monthly") {
          const start = new Date(
            now.getFullYear(),
            now.getMonth(),
            1,
            0,
            0,
            0,
            0,
          );
          const end = new Date(
            now.getFullYear(),
            now.getMonth() + 1,
            0,
            23,
            59,
            59,
            999,
          );
          statsMatchQuery.projectDate = {
            ...(statsMatchQuery.projectDate || {}),
            $gte: start,
            $lte: end,
          };
        }

        if (normalizedPeriod === "quarterly") {
          const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
          const start = new Date(
            now.getFullYear(),
            quarterStartMonth,
            1,
            0,
            0,
            0,
            0,
          );
          const end = new Date(
            now.getFullYear(),
            quarterStartMonth + 3,
            0,
            23,
            59,
            59,
            999,
          );
          statsMatchQuery.projectDate = {
            ...(statsMatchQuery.projectDate || {}),
            $gte: start,
            $lte: end,
          };
        }

        if (normalizedPeriod === "halfyearly") {
          const halfStartMonth = now.getMonth() < 6 ? 0 : 6;
          const start = new Date(
            now.getFullYear(),
            halfStartMonth,
            1,
            0,
            0,
            0,
            0,
          );
          const end = new Date(
            now.getFullYear(),
            halfStartMonth + 6,
            0,
            23,
            59,
            59,
            999,
          );
          statsMatchQuery.projectDate = {
            ...(statsMatchQuery.projectDate || {}),
            $gte: start,
            $lte: end,
          };
        }
      }

      const [
        summaryStats,
        businessNames,
        projectNames,
        clientNames,
        taxPercentageValues,
      ] = await Promise.all([
        projectsCollection
          .aggregate([
            { $match: statsMatchQuery },
            {
              $group: {
                _id: null,
                totalAmountWithTax: {
                  $sum: {
                    $ifNull: [
                      "$summary.totalAmountWithTax",
                      "$projectTotalCost",
                    ],
                  },
                },
                totalProjectValue: {
                  $sum: {
                    $ifNull: [
                      "$summary.totalProjectAmountWithoutTax",
                      "$projectTotalCost",
                    ],
                  },
                },
                totalDeveloperCost: {
                  $sum: { $ifNull: ["$totalDeveloperCost", 0] },
                },
                totalClientPayable: {
                  $sum: { $ifNull: ["$summary.totalClientPayable", 0] },
                },
                totalDeveloperPayable: {
                  $sum: { $ifNull: ["$summary.totalDeveloperPayable", 0] },
                },
                totalRemainingAmount: {
                  $sum: { $ifNull: ["$summary.remainingAmount", 0] },
                },
              },
            },
          ])
          .toArray(),
        projectsCollection.distinct("businessName", {
          ...statsMatchQuery,
          businessName: { $exists: true, $ne: "" },
        }),
        projectsCollection.distinct("projectName", {
          ...statsMatchQuery,
          projectName: { $exists: true, $ne: "" },
        }),
        projectsCollection.distinct("clientName", {
          ...statsMatchQuery,
          clientName: { $exists: true, $ne: "" },
        }),
        projectsCollection.distinct("summary.taxPercentage", {
          ...statsMatchQuery,
          "summary.taxPercentage": { $exists: true, $ne: null },
        }),
      ]);

      const stats = summaryStats[0] || {
        totalAmountWithTax: 0,
        totalProjectValue: 0,
        totalDeveloperCost: 0,
        totalClientPayable: 0,
        totalDeveloperPayable: 0,
        totalRemainingAmount: 0,
      };

      return createResponse(
        200,
        {
          data: projectRecords,
          pagination: {
            page: pageNum,
            limit: limitNum,
            totalRecords,
            totalPages: Math.ceil(totalRecords / limitNum),
          },
          statistics: {
            totalAmountWithTax: stats.totalAmountWithTax || 0,
            totalProjectValue: stats.totalProjectValue || 0,
            totalDeveloperCost: stats.totalDeveloperCost || 0,
            totalClientPayable: stats.totalClientPayable || 0,
            totalDeveloperPayable: stats.totalDeveloperPayable || 0,
            totalRemainingAmount: stats.totalRemainingAmount || 0,
          },
          filterOptions: {
            businessName: ["All", ...businessNames.sort()],
            projectName: ["All", ...projectNames.sort()],
            clientName: ["All", ...clientNames.sort()],
            taxPercentage: [
              "All",
              ...taxPercentageValues
                .map((row) => Number(row))
                .filter((row) => !Number.isNaN(row))
                .sort((a, b) => a - b)
                .map((row) => String(row)),
            ],
          },
        },
        origin,
      );
    }

    if (event.httpMethod === "POST") {
      const projectData = JSON.parse(event.body || "{}");

      const { financialYear, format } = await resolveProjectNumberContext(
        projectData.financialYear,
      );

      if (!projectData.financialYear && financialYear) {
        projectData.financialYear = financialYear;
      }

      if (!projectData.projectId) {
        projectData.projectId = await getNextProjectId({
          format,
          financialYear: projectData.financialYear || financialYear,
        });
      }

      if (!projectData.projectId) {
        return createResponse(
          400,
          {
            error:
              "Could not generate project ID. Please configure financial year format first.",
          },
          origin,
        );
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
