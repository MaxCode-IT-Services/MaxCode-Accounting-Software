import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { ObjectId } from "mongodb";
import { verifyRequestToken, getAuditFieldsFromEvent } from "./utils/auth.js";

const YEARS_LIST_CACHE_TTL_MS = 120000;
let yearsListCache = {
  value: null,
  expiresAt: 0,
};

/**
 * Financial Year Management API
 * Handles CRUD operations for financial years
 * Requires JWT authentication
 */
export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === "OPTIONS") {
    return createResponse(200, {}, origin, event);
  }

  try {
    verifyRequestToken(event);

    const { db } = await connectToDatabase();
    const yearsCollection = db.collection("financialYears");

    const getCurrentFinancialYear = () => {
      const today = new Date();
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth() + 1;

      if (currentMonth >= 4) {
        return `${currentYear}-${(currentYear + 1).toString().slice(-2)}`;
      }

      return `${currentYear - 1}-${currentYear.toString().slice(-2)}`;
    };

    const getCurrentFinancialYearStart = () => {
      const [startYear] = getCurrentFinancialYear().split("-").map(Number);
      return Number.isNaN(startYear) ? new Date().getFullYear() : startYear;
    };

    if (event.httpMethod === "GET") {
      const params = event.queryStringParameters || {};
      const {
        id,
        page,
        limit,
        includeMeta = "true",
        search,
        sortBy = "startDate",
        sortOrder = "desc",
        filter,
      } = params;

      if (id) {
        if (!ObjectId.isValid(id)) {
          return createResponse(400,
            { error: "Invalid Financial Year ID" },
            origin, event);
        }
        const yearRecord = await yearsCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!yearRecord) {
          return createResponse(404,
            { error: "Financial year not found" },
            origin, event);
        }
        return createResponse(200, yearRecord, origin, event);
      }

      const hasServerSideParams = [
        "page",
        "limit",
        "search",
        "sortBy",
        "sortOrder",
        "filter",
      ].some((key) => Object.prototype.hasOwnProperty.call(params, key));

      if (!hasServerSideParams) {
        let years = [];

        if (yearsListCache.value && yearsListCache.expiresAt > Date.now()) {
          years = yearsListCache.value;
        } else {
          years = await yearsCollection
            .find({ isDeleted: { $ne: true } })
            .sort({ startDate: -1, createdAt: -1 })
            .toArray();

          yearsListCache = {
            value: years,
            expiresAt: Date.now() + YEARS_LIST_CACHE_TTL_MS,
          };
        }

        return createResponse(200, years, origin, event);
      }

      const filterQuery = { isDeleted: { $ne: true } };

      Object.entries(params).forEach(([key, value]) => {
        if (!value || value === "" || value === "All") return;
        if (key === "filter") return;
        if (
          ["id", "page", "limit", "search", "sortBy", "sortOrder"].includes(key)
        ) {
          return;
        }

        if (key.endsWith("_start") || key.endsWith("_end")) return;

        if (key === "isDefaultDisplay") {
          if (value === "Yes") filterQuery.isDefault = true;
          if (value === "No") filterQuery.isDefault = { $ne: true };
          return;
        }

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
          [
            "status",
            "financialYear",
            "invoiceFormat",
            "selfInvoiceFormat",
            "fdFormat",
            "quotationFormat",
            "serviceFormat",
            "projectFormat",
            "companyExpenseFormat",
            "paymentReceiptFormat",
          ].includes(key)
        ) {
          filterQuery[key] = String(value).trim();
          return;
        }

        filterQuery[key] = { $regex: String(value).trim(), $options: "i" };
      });

      const dateRanges = {};
      Object.entries(params).forEach(([key, value]) => {
        if (!value) return;

        if (key.endsWith("_start")) {
          let baseKey = key.replace(/_start$/, "");
          if (baseKey === "createdDateTime") baseKey = "createdAt";

          if (!dateRanges[baseKey]) dateRanges[baseKey] = {};

          const dateParts = String(value).split("-");
          if (dateParts.length === 3) {
            const yearValue = parseInt(dateParts[0], 10);
            const month = parseInt(dateParts[1], 10) - 1;
            const day = parseInt(dateParts[2], 10);
            dateRanges[baseKey].$gte = new Date(
              Date.UTC(yearValue, month, day, 0, 0, 0, 0),
            );
          }
        }

        if (key.endsWith("_end")) {
          let baseKey = key.replace(/_end$/, "");
          if (baseKey === "createdDateTime") baseKey = "createdAt";

          if (!dateRanges[baseKey]) dateRanges[baseKey] = {};

          const dateParts = String(value).split("-");
          if (dateParts.length === 3) {
            const yearValue = parseInt(dateParts[0], 10);
            const month = parseInt(dateParts[1], 10) - 1;
            const day = parseInt(dateParts[2], 10);
            dateRanges[baseKey].$lte = new Date(
              Date.UTC(yearValue, month, day, 23, 59, 59, 999),
            );
          }
        }
      });

      Object.entries(dateRanges).forEach(([key, range]) => {
        filterQuery[key] = range;
      });

      const currentFY = getCurrentFinancialYear();
      const currentFYStart = getCurrentFinancialYearStart();

      if (filter === "active") {
        filterQuery.status = "Active";
      }
      if (filter === "inactive") {
        filterQuery.status = "Inactive";
      }
      if (filter === "currentYear") {
        filterQuery.financialYear = currentFY;
      }
      if (filter === "upcomingYear") {
        filterQuery.$expr = {
          $gt: [
            {
              $convert: {
                input: { $substr: ["$financialYear", 0, 4] },
                to: "int",
                onError: 0,
                onNull: 0,
              },
            },
            currentFYStart,
          ],
        };
      }

      if (search) {
        filterQuery.$and = [
          ...(Array.isArray(filterQuery.$and) ? filterQuery.$and : []),
          {
            $or: [
              { financialYear: { $regex: search, $options: "i" } },
              { invoiceFormat: { $regex: search, $options: "i" } },
              { selfInvoiceFormat: { $regex: search, $options: "i" } },
              { fdFormat: { $regex: search, $options: "i" } },
              { performaInvoiceFormat: { $regex: search, $options: "i" } },
              { creditNoteFormat: { $regex: search, $options: "i" } },
              { debitNoteFormat: { $regex: search, $options: "i" } },
              { quotationFormat: { $regex: search, $options: "i" } },
              { serviceFormat: { $regex: search, $options: "i" } },
              { projectFormat: { $regex: search, $options: "i" } },
              { companyExpenseFormat: { $regex: search, $options: "i" } },
              { paymentReceiptFormat: { $regex: search, $options: "i" } },
              { description: { $regex: search, $options: "i" } },
            ],
          },
        ];
      }

      const pageNum = Math.max(parseInt(page, 10) || 1, 1);
      const limitNum = Math.max(parseInt(limit, 10) || 10, 1);
      const skip = (pageNum - 1) * limitNum;

      const sortFieldMapping = {
        startDateFormatted: "startDate",
        endDateFormatted: "endDate",
        createdDateTime: "createdAt",
        isDefaultDisplay: "isDefault",
      };

      const sortObject = {};
      sortObject[sortFieldMapping[sortBy] || sortBy] =
        sortOrder === "asc" ? 1 : -1;
      const shouldIncludeMeta = includeMeta !== "false";

      const totalRecords = await yearsCollection.countDocuments(filterQuery);

      const years = await yearsCollection
        .find(filterQuery)
        .sort(sortObject)
        .skip(skip)
        .limit(limitNum)
        .toArray();

      let statusValues = [];
      let totalAll = 0;
      let totalActive = 0;
      let totalInactive = 0;
      let totalCurrentYear = 0;
      let totalUpcomingYear = 0;

      if (shouldIncludeMeta) {
        [
          statusValues,
          totalAll,
          totalActive,
          totalInactive,
          totalCurrentYear,
          totalUpcomingYear,
        ] = await Promise.all([
          yearsCollection.distinct("status", {
            isDeleted: { $ne: true },
            status: { $exists: true, $ne: "" },
          }),
          yearsCollection.countDocuments({
            isDeleted: { $ne: true },
          }),
          yearsCollection.countDocuments({
            isDeleted: { $ne: true },
            status: "Active",
          }),
          yearsCollection.countDocuments({
            isDeleted: { $ne: true },
            status: "Inactive",
          }),
          yearsCollection.countDocuments({
            isDeleted: { $ne: true },
            financialYear: currentFY,
          }),
          yearsCollection.countDocuments({
            isDeleted: { $ne: true },
            $expr: {
              $gt: [
                {
                  $convert: {
                    input: { $substr: ["$financialYear", 0, 4] },
                    to: "int",
                    onError: 0,
                    onNull: 0,
                  },
                },
                currentFYStart,
              ],
            },
          }),
        ]);
      }

      return createResponse(200,
        {
          data: years,
          years,
          pagination: {
            page: pageNum,
            limit: limitNum,
            totalRecords,
            totalPages: Math.ceil(totalRecords / limitNum),
          },
          ...(shouldIncludeMeta
            ? {
                statistics: {
                  total: totalAll,
                  active: totalActive,
                  inactive: totalInactive,
                  currentYear: totalCurrentYear,
                  upcomingYear: totalUpcomingYear,
                },
                filterOptions: {
                  status: ["All", ...statusValues.sort()],
                  isDefaultDisplay: ["All", "Yes", "No"],
                },
              }
            : {}),
        },
        origin, event);
    }

    if (event.httpMethod === "POST") {
      const payload = JSON.parse(event.body || "{}");

      const duplicateChecks = [
        {
          field: "financialYear",
          value: payload.financialYear,
          message:
            "Financial Year already exists. Please use a different year.",
        },
        {
          field: "invoiceFormat",
          value: payload.invoiceFormat,
          message: "Invoice Format already exists. Please use a unique format.",
        },
        {
          field: "selfInvoiceFormat",
          value: payload.selfInvoiceFormat,
          message:
            "Self Invoice Format already exists. Please use a unique format.",
        },
        {
          field: "fdFormat",
          value: payload.fdFormat,
          message: "FD Format already exists. Please use a unique format.",
        },
        {
          field: "performaInvoiceFormat",
          value: payload.performaInvoiceFormat,
          message:
            "Performa Invoice Format already exists. Please use a unique format.",
        },
        {
          field: "creditNoteFormat",
          value: payload.creditNoteFormat,
          message:
            "Credit Note Format already exists. Please use a unique format.",
        },
        {
          field: "debitNoteFormat",
          value: payload.debitNoteFormat,
          message:
            "Debit Note Format already exists. Please use a unique format.",
        },
        {
          field: "quotationFormat",
          value: payload.quotationFormat,
          message:
            "Quotation Format already exists. Please use a unique format.",
        },
        {
          field: "serviceFormat",
          value: payload.serviceFormat,
          message: "Service Format already exists. Please use a unique format.",
        },
        {
          field: "projectFormat",
          value: payload.projectFormat,
          message: "Project Format already exists. Please use a unique format.",
        },
        {
          field: "companyExpenseFormat",
          value: payload.companyExpenseFormat,
          message:
            "Company Expense Format already exists. Please use a unique format.",
        },
        {
          field: "paymentReceiptFormat",
          value: payload.paymentReceiptFormat,
          message:
            "Payment Receipt Format already exists. Please use a unique format.",
        },
        {
          field: "startDate",
          value: payload.startDate,
          message: "Start Date already exists. Please use a unique start date.",
        },
        {
          field: "endDate",
          value: payload.endDate,
          message: "End Date already exists. Please use a unique end date.",
        },
      ];

      for (const check of duplicateChecks) {
        if (!check.value) continue;
        const existing = await yearsCollection.findOne({
          [check.field]: check.value,
          isDeleted: { $ne: true },
        });
        if (existing) {
          return createResponse(409, { error: check.message }, origin, event);
        }
      }

      if (payload.isDefault === true) {
        await yearsCollection.updateMany(
          { isDeleted: { $ne: true }, isDefault: true },
          {
            $set: {
              isDefault: false,
              updatedAt: new Date(),
            },
          },
        );
      }

      // Always assign _id as ObjectId
      const docToInsert = {
        ...payload,
        _id: new ObjectId(),
        taxPercentage: Number(payload.taxPercentage),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...getAuditFieldsFromEvent(event, "create"),
      };
      const result = await yearsCollection.insertOne(docToInsert);

      return createResponse(201,
        {
          message: "Financial year created successfully",
          id: result.insertedId,
        },
        origin, event);
    }

    if (event.httpMethod === "PUT") {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(400,
          { error: "Financial Year ID is required" },
          origin, event);
      }
      if (!ObjectId.isValid(id)) {
        return createResponse(400,
          { error: "Invalid Financial Year ID" },
          origin, event);
      }
      const payload = JSON.parse(event.body || "{}");
      const yearObjectId = new ObjectId(id);

      const duplicateChecks = [
        {
          field: "financialYear",
          value: payload.financialYear,
          message:
            "Financial Year already exists. Please use a different year.",
        },
        {
          field: "invoiceFormat",
          value: payload.invoiceFormat,
          message: "Invoice Format already exists. Please use a unique format.",
        },
        {
          field: "selfInvoiceFormat",
          value: payload.selfInvoiceFormat,
          message:
            "Self Invoice Format already exists. Please use a unique format.",
        },
        {
          field: "fdFormat",
          value: payload.fdFormat,
          message: "FD Format already exists. Please use a unique format.",
        },
        {
          field: "performaInvoiceFormat",
          value: payload.performaInvoiceFormat,
          message:
            "Performa Invoice Format already exists. Please use a unique format.",
        },
        {
          field: "creditNoteFormat",
          value: payload.creditNoteFormat,
          message:
            "Credit Note Format already exists. Please use a unique format.",
        },
        {
          field: "debitNoteFormat",
          value: payload.debitNoteFormat,
          message:
            "Debit Note Format already exists. Please use a unique format.",
        },
        {
          field: "quotationFormat",
          value: payload.quotationFormat,
          message:
            "Quotation Format already exists. Please use a unique format.",
        },
        {
          field: "serviceFormat",
          value: payload.serviceFormat,
          message: "Service Format already exists. Please use a unique format.",
        },
        {
          field: "projectFormat",
          value: payload.projectFormat,
          message: "Project Format already exists. Please use a unique format.",
        },
        {
          field: "companyExpenseFormat",
          value: payload.companyExpenseFormat,
          message:
            "Company Expense Format already exists. Please use a unique format.",
        },
        {
          field: "paymentReceiptFormat",
          value: payload.paymentReceiptFormat,
          message:
            "Payment Receipt Format already exists. Please use a unique format.",
        },
        {
          field: "startDate",
          value: payload.startDate,
          message: "Start Date already exists. Please use a unique start date.",
        },
        {
          field: "endDate",
          value: payload.endDate,
          message: "End Date already exists. Please use a unique end date.",
        },
      ];

      for (const check of duplicateChecks) {
        if (!check.value) continue;
        const existing = await yearsCollection.findOne({
          _id: { $ne: yearObjectId },
          [check.field]: check.value,
          isDeleted: { $ne: true },
        });
        if (existing) {
          return createResponse(409, { error: check.message }, origin, event);
        }
      }

      if (payload.isDefault === true) {
        await yearsCollection.updateMany(
          {
            _id: { $ne: yearObjectId },
            isDeleted: { $ne: true },
            isDefault: true,
          },
          {
            $set: {
              isDefault: false,
              updatedAt: new Date(),
            },
          },
        );
      }

      const updateData = {
        ...payload,
        updatedAt: new Date(),
        ...getAuditFieldsFromEvent(event, "update"),
      };

      if (payload.taxPercentage !== undefined) {
        updateData.taxPercentage = Number(payload.taxPercentage);
      }

      const result = await yearsCollection.updateOne(
        { _id: yearObjectId },
        {
          $set: updateData,
        },
      );

      if (result.matchedCount === 0) {
        return createResponse(404,
          { error: "Financial year not found" },
          origin, event);
      }

      return createResponse(200,
        { message: "Financial year updated successfully" },
        origin, event);
    }

    if (event.httpMethod === "DELETE") {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(400,
          { error: "Financial Year ID is required" },
          origin, event);
      }
      if (!ObjectId.isValid(id)) {
        return createResponse(400,
          { error: "Invalid Financial Year ID" },
          origin, event);
      }
      const result = await yearsCollection.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            isDeleted: true,
            deletedAt: new Date(),
            updatedAt: new Date(),
            ...getAuditFieldsFromEvent(event, "delete"),
          },
        },
      );

      if (result.matchedCount === 0) {
        return createResponse(404,
          { error: "Financial year not found" },
          origin, event);
      }

      return createResponse(200,
        { message: "Financial year deleted successfully" },
        origin, event);
    }

    return createResponse(405, { error: "Method not allowed" }, origin, event);
  } catch (error) {
    console.error("Financial Year API Error:", error);

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
        error: "Internal server error",
        message: error.message,
      },
      origin, event);
  }
}
