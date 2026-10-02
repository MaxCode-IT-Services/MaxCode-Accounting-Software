import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { ObjectId } from "mongodb";
import { verifyRequestToken, getAuditFieldsFromEvent } from "./utils/auth.js";

/**
 * Services Management API
 * Handles CRUD operations for client services and renew transactions
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
    const servicesCollection = db.collection("services");
    const clientsCollection = db.collection("clients");
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

    const buildFallbackServiceFormat = (financialYearValue) => {
      const token = getFinancialYearToken(financialYearValue);
      if (!token) return "";
      return `MC/SRV/${token}/0001`;
    };

    const getNextServiceNumber = async ({ format, financialYear }) => {
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
        serviceNumber: { $regex: pattern },
        isDeleted: { $ne: true },
      };

      if (financialYear) {
        query.financialYear = String(financialYear).trim();
      }

      const existingRows = await servicesCollection
        .find(query, { projection: { serviceNumber: 1 } })
        .toArray();

      let maxNumber = 0;
      existingRows.forEach((row) => {
        const serviceNumber = String(row?.serviceNumber || "");
        const rowMatch = serviceNumber.match(pattern);
        if (!rowMatch) return;
        const current = parseInt(rowMatch[1], 10);
        if (!Number.isNaN(current) && current > maxNumber) {
          maxNumber = current;
        }
      });

      const nextNumber = Math.max(seedNumber, maxNumber + 1);
      return `${prefix}${String(nextNumber).padStart(width, "0")}`;
    };

    const resolveServiceNumberContext = async (requestedFinancialYear) => {
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
        });
      }

      const financialYear =
        normalizedRequestedFinancialYear ||
        String(yearRecord?.financialYear || "").trim();

      const format =
        String(yearRecord?.serviceFormat || "").trim() ||
        buildFallbackServiceFormat(financialYear);

      return { financialYear, format };
    };

    const getDateString = (date) => {
      const pad = (value) => String(value).padStart(2, "0");
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    };

    const getExpiryDrivenStatus = (expiryDate, fallbackStatus = "Active") => {
      if (!expiryDate) return fallbackStatus || "Active";

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const expiry = new Date(expiryDate);
      if (Number.isNaN(expiry.getTime())) return fallbackStatus || "Active";
      expiry.setHours(0, 0, 0, 0);

      return expiry < today ? "Expired" : "Active";
    };

    const getRecordStatus = (record) => {
      const serviceRows = Array.isArray(record?.services)
        ? record.services
        : [];
      if (!serviceRows.length) return "No Services";

      const normalizedStatuses = serviceRows.map((row) =>
        getExpiryDrivenStatus(row?.expiryDate, row?.status),
      );

      const allExpired = normalizedStatuses.every(
        (status) => status === "Expired",
      );
      const allActive = normalizedStatuses.every(
        (status) => status === "Active",
      );

      if (allExpired) return "Expired";
      if (allActive) return "Active";
      return "Mixed";
    };

    const getNearestExpiryDate = (record) => {
      const serviceRows = Array.isArray(record?.services)
        ? record.services
        : [];
      const dates = serviceRows
        .map((row) => row?.expiryDate)
        .filter(Boolean)
        .map((value) => new Date(value))
        .filter((date) => !Number.isNaN(date.getTime()))
        .sort((a, b) => a.getTime() - b.getTime());

      return dates.length ? getDateString(dates[0]) : "";
    };

    const normalizeRecord = (record) => {
      return {
        ...record,
        recordStatus: getRecordStatus(record),
        nextExpiryDate: getNearestExpiryDate(record),
      };
    };

    if (event.httpMethod === "GET") {
      const {
        action,
        id,
        page = 1,
        limit = 10,
        search,
        financialYear,
        period,
        serviceDateFormatted_start,
        serviceDateFormatted_end,
        createdDateTime_start,
        createdDateTime_end,
        nextExpiry_start,
        nextExpiry_end,
        sortBy = "createdAt",
        sortOrder = "desc",
        filter,
        export: exportAll,
      } = event.queryStringParameters || {};

      if (action === "next-number") {
        const { financialYear, format } = await resolveServiceNumberContext(
          event.queryStringParameters?.financialYear,
        );

        const nextNumber = await getNextServiceNumber({
          format,
          financialYear,
        });

        if (!nextNumber) {
          return createResponse(400,
            {
              error:
                "Could not generate service number. Please configure financial year format first.",
            },
            origin, event);
        }

        return createResponse(200,
          {
            nextNumber,
            serviceNumber: nextNumber,
            financialYear,
            format,
          },
          origin, event);
      }

      if (id) {
        if (!ObjectId.isValid(id)) {
          return createResponse(400, { error: "Invalid service ID" }, origin, event);
        }

        const serviceRecord = await servicesCollection.findOne({
          _id: new ObjectId(id),
          isDeleted: { $ne: true },
        });

        if (!serviceRecord) {
          return createResponse(404,
            { error: "Service record not found" },
            origin, event);
        }

        return createResponse(200, serviceRecord, origin, event);
      }

      const params = event.queryStringParameters || {};
      const filterQuery = { isDeleted: { $ne: true } };
      let derivedRecordStatusFilter = null;
      let derivedCardFilter = null;

      if (financialYear && financialYear !== "ALL") {
        filterQuery.financialYear = financialYear;
      }

      if (period && period !== "yearly") {
        const today = new Date();
        let startDate;
        let endDate;

        if (period === "daily") {
          startDate = new Date(
            today.getFullYear(),
            today.getMonth(),
            today.getDate(),
          );
          endDate = new Date(
            today.getFullYear(),
            today.getMonth(),
            today.getDate(),
          );
        } else if (period === "monthly") {
          startDate = new Date(today.getFullYear(), today.getMonth(), 1);
          endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        } else if (period === "quarterly") {
          const quarter = Math.floor(today.getMonth() / 3);
          startDate = new Date(today.getFullYear(), quarter * 3, 1);
          endDate = new Date(today.getFullYear(), quarter * 3 + 3, 0);
        } else if (period === "halfYearly") {
          const half = today.getMonth() < 6 ? 0 : 6;
          startDate = new Date(today.getFullYear(), half, 1);
          endDate = new Date(today.getFullYear(), half + 6, 0);
        }

        if (startDate && endDate) {
          filterQuery.serviceDate = {
            $gte: getDateString(startDate),
            $lte: getDateString(endDate),
          };
        }
      }

      Object.entries(params).forEach(([key, value]) => {
        if (!value || value === "" || value === "All") return;
        if (key === "filter" || key === "financialYear" || key === "period")
          return;
        if (key.endsWith("_start") || key.endsWith("_end")) return;
        if (
          [
            "id",
            "page",
            "limit",
            "sortBy",
            "sortOrder",
            "search",
            "export",
          ].includes(key)
        ) {
          return;
        }

        if (key === "recordStatus") {
          derivedRecordStatusFilter = String(value).trim();
          return;
        }

        if (typeof value === "string" && value.includes(",")) {
          filterQuery[key] = {
            $in: value
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean),
          };
          return;
        }

        if (key === "businessName") {
          filterQuery[key] = value.trim();
          return;
        }

        filterQuery[key] = {
          $regex: value.trim(),
          $options: "i",
        };
      });

      const dateRanges = {};

      Object.entries(params).forEach(([key, value]) => {
        if (!value) return;

        if (key.endsWith("_start") || key.endsWith("_end")) {
          let baseKey = key.replace(/_(start|end)$/, "");
          if (baseKey === "serviceDateFormatted") baseKey = "serviceDate";
          if (baseKey === "createdDateTime") baseKey = "createdAt";
          if (baseKey === "nextExpiry") baseKey = "nextExpiryDate";

          if (!dateRanges[baseKey]) dateRanges[baseKey] = {};

          if (baseKey === "serviceDate" || baseKey === "nextExpiryDate") {
            if (key.endsWith("_start")) {
              dateRanges[baseKey].$gte = value;
            }
            if (key.endsWith("_end")) {
              dateRanges[baseKey].$lte = value;
            }
            return;
          }

          const dateParts = String(value).split("-");
          if (dateParts.length !== 3) return;

          const year = parseInt(dateParts[0], 10);
          const month = parseInt(dateParts[1], 10) - 1;
          const day = parseInt(dateParts[2], 10);

          if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
            return;
          }

          if (key.endsWith("_start")) {
            dateRanges[baseKey].$gte = new Date(
              Date.UTC(year, month, day, 0, 0, 0, 0),
            );
          }

          if (key.endsWith("_end")) {
            dateRanges[baseKey].$lte = new Date(
              Date.UTC(year, month, day, 23, 59, 59, 999),
            );
          }
        }
      });

      Object.entries(dateRanges).forEach(([key, range]) => {
        if (key === "nextExpiryDate") {
          return;
        }

        filterQuery[key] = range;
      });

      if (filter) {
        derivedCardFilter = String(filter).trim();
      }

      if (search) {
        filterQuery.$or = [
          { serviceNumber: { $regex: search, $options: "i" } },
          { clientName: { $regex: search, $options: "i" } },
          { businessName: { $regex: search, $options: "i" } },
          { clientId: { $regex: search, $options: "i" } },
          { gstin: { $regex: search, $options: "i" } },
          { phoneNumber: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ];
      }

      const sortFieldMapping = {
        serviceDateFormatted: "serviceDate",
        createdDateTime: "createdAt",
        nextExpiry: "services.expiryDate",
      };

      const sortObject = {};
      const mappedSortBy = sortFieldMapping[sortBy] || sortBy || "createdAt";
      sortObject[mappedSortBy] = sortOrder === "asc" ? 1 : -1;

      const pageNum = Math.max(parseInt(page, 10) || 1, 1);
      const limitNum = Math.max(parseInt(limit, 10) || 10, 1);
      const skip = (pageNum - 1) * limitNum;

      let matchedRecords = await servicesCollection
        .find(filterQuery)
        .sort(sortObject)
        .toArray();

      matchedRecords = matchedRecords.map(normalizeRecord);

      if (derivedRecordStatusFilter && derivedRecordStatusFilter !== "All") {
        matchedRecords = matchedRecords.filter(
          (record) => record.recordStatus === derivedRecordStatusFilter,
        );
      }

      if (derivedCardFilter) {
        if (derivedCardFilter === "allActive") {
          matchedRecords = matchedRecords.filter(
            (record) => record.recordStatus === "Active",
          );
        } else if (derivedCardFilter === "expired") {
          matchedRecords = matchedRecords.filter(
            (record) => record.recordStatus === "Expired",
          );
        } else if (derivedCardFilter === "dueSoon") {
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          const dueSoonLimit = new Date(today);
          dueSoonLimit.setDate(dueSoonLimit.getDate() + 30);

          matchedRecords = matchedRecords.filter((record) => {
            const rows = Array.isArray(record?.services) ? record.services : [];
            return rows.some((row) => {
              if (!row?.expiryDate) return false;
              const expiry = new Date(row.expiryDate);
              if (Number.isNaN(expiry.getTime())) return false;
              expiry.setHours(0, 0, 0, 0);

              const rowStatus = getExpiryDrivenStatus(
                row?.expiryDate,
                row?.status,
              );
              return (
                rowStatus !== "Expired" &&
                expiry >= today &&
                expiry <= dueSoonLimit
              );
            });
          });
        }
      }

      if (dateRanges.nextExpiryDate) {
        const nextExpiryRange = dateRanges.nextExpiryDate;
        const startDate = nextExpiryRange.$gte || "";
        const endDate = nextExpiryRange.$lte || "";

        matchedRecords = matchedRecords.filter((record) => {
          const nextExpiryDate = record.nextExpiryDate || "";
          if (!nextExpiryDate) return false;

          if (startDate && nextExpiryDate < startDate) return false;
          if (endDate && nextExpiryDate > endDate) return false;
          return true;
        });
      }

      const totalRecords = matchedRecords.length;

      const serviceRecords =
        String(exportAll) === "1"
          ? matchedRecords
          : matchedRecords.slice(skip, skip + limitNum);

      const clients = await clientsCollection
        .find({ isDeleted: { $ne: true } })
        .toArray();

      const allServiceRecords = await servicesCollection
        .find({ isDeleted: { $ne: true } })
        .toArray();

      const businessNameValues = await servicesCollection.distinct(
        "businessName",
        {
          isDeleted: { $ne: true },
          businessName: { $exists: true, $ne: "" },
        },
      );

      const statusValuesSet = new Set();

      const aggregateStats = allServiceRecords.reduce(
        (acc, record) => {
          const serviceRows = Array.isArray(record?.services)
            ? record.services
            : [];
          const normalizedStatuses = serviceRows.map((row) =>
            getExpiryDrivenStatus(row?.expiryDate, row?.status),
          );

          const total = normalizedStatuses.length;
          const active = normalizedStatuses.filter(
            (status) => status === "Active",
          ).length;
          const expired = normalizedStatuses.filter(
            (status) => status === "Expired",
          ).length;

          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const dueSoonLimit = new Date(today);
          dueSoonLimit.setDate(dueSoonLimit.getDate() + 30);

          const dueSoon = serviceRows.filter((row) => {
            if (!row?.expiryDate) return false;
            const expiry = new Date(row.expiryDate);
            if (Number.isNaN(expiry.getTime())) return false;
            expiry.setHours(0, 0, 0, 0);

            const rowStatus = getExpiryDrivenStatus(
              row?.expiryDate,
              row?.status,
            );
            return (
              rowStatus !== "Expired" &&
              expiry >= today &&
              expiry <= dueSoonLimit
            );
          }).length;

          const recordStatus = getRecordStatus(record);
          if (recordStatus) {
            statusValuesSet.add(recordStatus);
          }

          acc.total += total;
          acc.allActive += active;
          acc.expired += expired;
          acc.dueSoon += dueSoon;
          // FIXED: Only count transaction amounts for revenue, NOT service plans (avoids double counting)
          acc.totalAmount +=
            parseFloat(record?.summary?.totalTransactionAmount || 0) || 0;

          return acc;
        },
        {
          total: 0,
          allActive: 0,
          expired: 0,
          dueSoon: 0,
          totalAmount: 0,
        },
      );

      return createResponse(200,
        {
          data: serviceRecords,
          services: serviceRecords,
          pagination: {
            page: pageNum,
            limit: limitNum,
            totalRecords,
            totalPages: Math.ceil(totalRecords / limitNum),
          },
          statistics: {
            total: aggregateStats.total,
            allActive: aggregateStats.allActive,
            expired: aggregateStats.expired,
            dueSoon: aggregateStats.dueSoon,
            totalAmount: Number(aggregateStats.totalAmount || 0).toFixed(2),
          },
          filterOptions: {
            recordStatus: ["All", ...Array.from(statusValuesSet).sort()],
            businessName: ["All", ...businessNameValues.sort()],
          },
          clients: clients.map((client) => ({
            id: client._id,
            clientName: client.clientName,
            businessName: client.businessName,
            clientId: client.clientId,
          })),
        },
        origin, event);
    }

    if (event.httpMethod === "POST") {
      const serviceData = JSON.parse(event.body || "{}");

      const { financialYear, format } = await resolveServiceNumberContext(
        serviceData.financialYear,
      );

      if (!serviceData.financialYear && financialYear) {
        serviceData.financialYear = financialYear;
      }

      if (!serviceData.serviceNumber) {
        serviceData.serviceNumber = await getNextServiceNumber({
          format,
          financialYear: serviceData.financialYear || financialYear,
        });
      }

      if (!serviceData.serviceNumber) {
        return createResponse(400,
          {
            error:
              "Could not generate service number. Please configure financial year format first.",
          },
          origin, event);
      }

      const existing = await servicesCollection.findOne({
        serviceNumber: serviceData.serviceNumber,
      });

      if (existing) {
        return createResponse(409,
          { error: "Service number already exists" },
          origin, event);
      }

      // Always assign _id as ObjectId
      const docToInsert = {
        ...serviceData,
        _id: new ObjectId(),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...getAuditFieldsFromEvent(event, "create"),
      };
      const result = await servicesCollection.insertOne(docToInsert);

      return createResponse(201,
        {
          message: "Services record created successfully",
          id: result.insertedId,
        },
        origin, event);
    }

    if (event.httpMethod === "PUT") {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(400, { error: "Service ID is required" }, origin, event);
      }

      if (!ObjectId.isValid(id)) {
        return createResponse(400, { error: "Invalid service ID" }, origin, event);
      }

      const serviceData = JSON.parse(event.body || "{}");
      const serviceObjectId = new ObjectId(id);

      if (serviceData.serviceNumber) {
        const existing = await servicesCollection.findOne({
          serviceNumber: serviceData.serviceNumber,
        });

        if (existing && String(existing._id) !== String(id)) {
          return createResponse(409,
            { error: "Service number already exists" },
            origin, event);
        }
      }

      const result = await servicesCollection.updateOne(
        { _id: serviceObjectId, isDeleted: { $ne: true } },
        {
          $set: {
            ...serviceData,
            updatedAt: new Date(),
            ...getAuditFieldsFromEvent(event, "update"),
          },
        },
      );

      if (result.matchedCount === 0) {
        return createResponse(404,
          { error: "Service record not found" },
          origin, event);
      }

      return createResponse(200,
        { message: "Services record updated successfully" },
        origin, event);
    }

    if (event.httpMethod === "DELETE") {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(400, { error: "Service ID is required" }, origin, event);
      }

      if (!ObjectId.isValid(id)) {
        return createResponse(400, { error: "Invalid service ID" }, origin, event);
      }

      const result = await servicesCollection.updateOne(
        { _id: new ObjectId(id), isDeleted: { $ne: true } },
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
          { error: "Service record not found" },
          origin, event);
      }

      return createResponse(200,
        { message: "Services record deleted successfully" },
        origin, event);
    }

    return createResponse(405, { error: "Method not allowed" }, origin, event);
  } catch (error) {
    console.error("Services API Error:", error);

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
