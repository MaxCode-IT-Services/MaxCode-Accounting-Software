import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { ObjectId } from "mongodb";
import { verifyRequestToken, getAuditFieldsFromEvent } from "./utils/auth.js";
import { normalizePaymentMethodsInRecord } from "./utils/payment-methods.js";
import { syncTransactionSnapshot } from "./utils/transactions.js";

const escapeRegExp = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getDateOnly = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const isDateWithinRange = (value, startDate, endDate) => {
  const targetDate = getDateOnly(value);
  const start = getDateOnly(startDate);
  const end = getDateOnly(endDate);
  if (!targetDate || !start || !end) return false;
  return targetDate >= start && targetDate <= end;
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

const getFinancialYearFromDate = (dateValue) => {
  const parsed = getDateOnly(dateValue) || new Date();
  const year = parsed.getFullYear();
  const month = parsed.getMonth() + 1;
  const startYear = month >= 4 ? year : year - 1;
  const endYearShort = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}-${endYearShort}`;
};

const getCurrentDateString = () => new Date().toISOString().split("T")[0];

const normalizeAccountType = (value, fallback = "Bank Account") => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized.includes("cash")) return "Cash Account";
  if (normalized.includes("bank")) return "Bank Account";
  return fallback;
};

const resolveFinancialYearRecord = async (yearsCollection, financialYear, recordDate) => {
  const normalizedYear = String(financialYear || "").trim();
  if (normalizedYear && normalizedYear !== "ALL") {
    return yearsCollection.findOne({
      isDeleted: { $ne: true },
      $or: [{ financialYear: normalizedYear }, { year: normalizedYear }],
    });
  }

  const targetDate = getDateOnly(recordDate);
  if (!targetDate) return null;

  const yearRecords = await yearsCollection
    .find({
      isDeleted: { $ne: true },
      startDate: { $exists: true, $ne: null },
      endDate: { $exists: true, $ne: null },
    })
    .toArray();

  return (
    yearRecords.find((yearRecord) =>
      isDateWithinRange(recordDate, yearRecord.startDate, yearRecord.endDate),
    ) || null
  );
};

const validateFdDateAgainstFinancialYear = async (fdData, yearsCollection) => {
  const startDate = String(fdData?.startDate || "").trim();
  if (!startDate) return "Start Date is required";

  const normalizedYear = String(fdData?.financialYear || "").trim();
  if (normalizedYear === "ALL") {
    return "Please select a specific Financial Year before saving FD";
  }

  const yearRecord = await resolveFinancialYearRecord(
    yearsCollection,
    normalizedYear,
    startDate,
  );

  if (!yearRecord?.startDate || !yearRecord?.endDate) {
    return normalizedYear
      ? `Financial Year range not found for ${normalizedYear}`
      : "Could not determine Financial Year for selected Start Date";
  }

  if (!isDateWithinRange(startDate, yearRecord.startDate, yearRecord.endDate)) {
    const yearLabel = yearRecord.financialYear || yearRecord.year || normalizedYear;
    return `FD Start Date must be within the selected Financial Year (${yearLabel})`;
  }

  return null;
};

const validateClosureDateAgainstFinancialYear = async (fdData, yearsCollection) => {
  const closureDate = String(fdData?.closureDate || "").trim();
  if (!closureDate) return null;

  const yearRecord = await resolveFinancialYearRecord(yearsCollection, "", closureDate);

  if (!yearRecord?.startDate || !yearRecord?.endDate) {
    return "Could not determine Financial Year for selected Closure Date";
  }

  if (!isDateWithinRange(closureDate, yearRecord.startDate, yearRecord.endDate)) {
    const yearLabel = yearRecord.financialYear || yearRecord.year || getFinancialYearFromDate(closureDate);
    return `Closure Date must be within the selected Financial Year (${yearLabel})`;
  }

  return null;
};

const getNextFromFormat = async ({ fdCollection, format, financialYear }) => {
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
    fdNumber: { $regex: pattern },
    isDeleted: { $ne: true },
  };

  if (financialYear) {
    query.financialYear = String(financialYear).trim();
  }

  const existingFds = await fdCollection
    .find(query, { projection: { fdNumber: 1 } })
    .toArray();

  let maxNumber = 0;
  existingFds.forEach((fd) => {
    const fdNumber = String(fd?.fdNumber || "");
    const fdMatch = fdNumber.match(pattern);
    if (!fdMatch) return;
    const current = parseInt(fdMatch[1], 10);
    if (!Number.isNaN(current) && current > maxNumber) {
      maxNumber = current;
    }
  });

  const nextNumber = Math.max(seedNumber, maxNumber + 1);
  return `${prefix}${String(nextNumber).padStart(width, "0")}`;
};

const resolveFdNumberContext = async ({ yearsCollection, requestedFinancialYear }) => {
  const normalizedRequestedFinancialYear = String(requestedFinancialYear || "").trim();

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

  const resolvedFinancialYear =
    normalizedRequestedFinancialYear || String(yearRecord?.financialYear || "").trim();

  const format =
    String(yearRecord?.fdFormat || "").trim() ||
    `MC/FD/${getFinancialYearToken(resolvedFinancialYear)}/0001`;

  return {
    financialYear: resolvedFinancialYear,
    format,
  };
};

const normalizeFdRecord = (rawRecord = {}) => {
  const principalAmount = toNumber(rawRecord?.principalAmount || rawRecord?.amount || 0);
  const status = String(rawRecord?.fdStatus || "Active").trim() || "Active";
  const closureDate = String(rawRecord?.closureDate || "").trim();
  const totalInterestEarned = toNumber(rawRecord?.totalInterestEarned || 0);
  const penaltyAmount = toNumber(rawRecord?.penaltyAmount || 0);
  const closureFinancialYear = closureDate ? getFinancialYearFromDate(closureDate) : "";

  return {
    ...rawRecord,
    principalAmount,
    amount: principalAmount,
    rateOfInterest: toNumber(rawRecord?.rateOfInterest || 0),
    tenure: rawRecord?.tenure !== undefined && rawRecord?.tenure !== null ? parseInt(rawRecord.tenure, 10) || 0 : 0,
    totalInterestEarned,
    penaltyAmount,
    fdStatus: status,
    transferredFromAccountType: normalizeAccountType(
      rawRecord?.transferredFromAccountType || rawRecord?.transferredFromAccount,
      "Bank Account",
    ),
    closureDate: closureDate || null,
    closurePaymentMethod: rawRecord?.closurePaymentMethod || null,
    closureRemarks: rawRecord?.closureRemarks || "",
    closureFinancialYear,
  };
};

export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === "OPTIONS") {
    return createResponse(200, {}, origin, event);
  }

  try {
    verifyRequestToken(event);

    const { db } = await connectToDatabase();
    const fdCollection = db.collection("fixedDeposits");
    const yearsCollection = db.collection("financialYears");

    if (event.httpMethod === "GET") {
      const {
        id,
        action,
        page = 1,
        limit = 10,
        search,
        bankName,
        transferredFromAccount,
        transferredFromAccountType,
        fdStatus,
        startDate_start,
        startDate_end,
        maturityDate_start,
        maturityDate_end,
        closureDate_start,
        closureDate_end,
        sortBy = "startDate",
        sortOrder = "desc",
        filter,
        financialYear,
      } = event.queryStringParameters || {};

      // Handle next-number action
      if (action === "next-number") {
        try {
          const { financialYear: resolvedYear, format } = await resolveFdNumberContext({
            yearsCollection,
            requestedFinancialYear: financialYear,
          });
          const nextNumber = await getNextFromFormat({
            fdCollection,
            format,
            financialYear: resolvedYear,
          });
          return createResponse(200,
            { fdNumber: nextNumber, financialYear: resolvedYear, format },
            origin, event);
        } catch (error) {
          console.error("Error generating next FD number:", error);
          return createResponse(500, { error: "Failed to generate next FD number" }, origin, event);
        }
      }

      // Fetch single FD by ID
      if (id) {
        const fd = await fdCollection.findOne({
          _id: new ObjectId(id),
          isDeleted: { $ne: true },
        });
        if (!fd) {
          return createResponse(404, { error: "Fixed Deposit not found" }, origin, event);
        }
        return createResponse(200, fd, origin, event);
      }

      // Fetch list with pagination and filters
      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 10;
      const skip = (pageNum - 1) * limitNum;

      const filterQuery = { isDeleted: { $ne: true } };

      if (search && search.trim()) {
        const searchRegex = { $regex: search.trim(), $options: "i" };
        filterQuery.$or = [
          { fdNumber: searchRegex },
          { bankName: searchRegex },
          { transferredFromAccount: searchRegex },
        ];
      }

      if (bankName) filterQuery.bankName = bankName.trim();
      if (transferredFromAccount) filterQuery.transferredFromAccount = transferredFromAccount.trim();
      if (transferredFromAccountType) filterQuery.transferredFromAccountType = transferredFromAccountType.trim();
      if (fdStatus && fdStatus !== "All") filterQuery.fdStatus = fdStatus.trim();
      if (filter && filter !== "total") {
        switch (filter) {
          case "active":
            filterQuery.fdStatus = "Active";
            break;
          case "matured":
            filterQuery.fdStatus = "Matured";
            break;
          case "closed":
            filterQuery.fdStatus = "Closed";
            break;
        }
      }

      // Date range filters
      const dateRanges = {};
      const processDateRange = (startKey, endKey, baseKey) => {
        if (startKey || endKey) {
          dateRanges[baseKey] = {};
          if (startKey) {
            const dateParts = startKey.split("-");
            if (dateParts.length === 3) {
              dateRanges[baseKey].$gte = new Date(
                Date.UTC(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]), 0, 0, 0, 0)
              );
            }
          }
          if (endKey) {
            const dateParts = endKey.split("-");
            if (dateParts.length === 3) {
              dateRanges[baseKey].$lte = new Date(
                Date.UTC(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]), 23, 59, 59, 999)
              );
            }
          }
        }
      };

      processDateRange(startDate_start, startDate_end, "startDate");
      processDateRange(maturityDate_start, maturityDate_end, "maturityDate");
      processDateRange(closureDate_start, closureDate_end, "closureDate");

      Object.entries(dateRanges).forEach(([key, range]) => {
        filterQuery[key] = range;
      });

      const sortObject = {};
      sortObject[sortBy] = sortOrder === "asc" ? 1 : -1;

      const totalRecords = await fdCollection.countDocuments(filterQuery);
      const fds = await fdCollection
        .find(filterQuery)
        .sort(sortObject)
        .skip(skip)
        .limit(limitNum)
        .toArray();

      // Get distinct values for filters
      const bankNames = await fdCollection.distinct("bankName", {
        isDeleted: { $ne: true },
        bankName: { $exists: true, $ne: "" },
      });

      const accountTypes = await fdCollection.distinct("transferredFromAccountType", {
        isDeleted: { $ne: true },
        transferredFromAccountType: { $exists: true, $ne: "" },
      });

      const statuses = await fdCollection.distinct("fdStatus", {
        isDeleted: { $ne: true },
        fdStatus: { $exists: true, $ne: "" },
      });

      // Calculate statistics
      const aggregation = await fdCollection
        .aggregate([
          { $match: { isDeleted: { $ne: true } } },
          {
            $group: {
              _id: null,
              totalPrincipal: { $sum: "$principalAmount" },
              totalInterestEarned: { $sum: { $ifNull: ["$totalInterestEarned", 0] } },
              totalPenalty: { $sum: { $ifNull: ["$penaltyAmount", 0] } },
            },
          },
        ])
        .toArray();

      const stats = aggregation[0] || { totalPrincipal: 0, totalInterestEarned: 0, totalPenalty: 0 };

      const activeCount = await fdCollection.countDocuments({
        isDeleted: { $ne: true },
        fdStatus: "Active",
      });
      const maturedCount = await fdCollection.countDocuments({
        isDeleted: { $ne: true },
        fdStatus: "Matured",
      });
      const closedCount = await fdCollection.countDocuments({
        isDeleted: { $ne: true },
        fdStatus: "Closed",
      });

      return createResponse(200,
        {
          data: fds,
          pagination: {
            page: pageNum,
            limit: limitNum,
            totalRecords,
            totalPages: Math.ceil(totalRecords / limitNum),
          },
          statistics: {
            total: totalRecords,
            totalPrincipal: stats.totalPrincipal,
            totalInterestEarned: stats.totalInterestEarned,
            totalPenalty: stats.totalPenalty,
            active: activeCount,
            matured: maturedCount,
            closed: closedCount,
          },
          filterOptions: {
            fdStatus: ["All", ...statuses.sort()],
            bankName: ["All", ...bankNames.sort()],
            transferredFromAccountType: ["All", ...accountTypes.sort()],
          },
        },
        origin, event);
    }

    if (event.httpMethod === "POST") {
      const fdData = normalizePaymentMethodsInRecord(JSON.parse(event.body));

      const validationError = await validateFdDateAgainstFinancialYear(fdData, yearsCollection);
      if (validationError) {
        return createResponse(400, { error: validationError }, origin, event);
      }

      const { financialYear: resolvedYear, format } = await resolveFdNumberContext({
        yearsCollection,
        requestedFinancialYear: fdData.financialYear,
      });

      const fdNumber = await getNextFromFormat({
        fdCollection,
        format,
        financialYear: resolvedYear,
      });

      const normalizedData = normalizeFdRecord({
        ...fdData,
        fdNumber,
        financialYear: resolvedYear,
      });

      const newFd = {
        _id: new ObjectId(),
        ...normalizedData,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...getAuditFieldsFromEvent(event, "create"),
      };

      await fdCollection.insertOne(newFd);

      // Sync opening transaction snapshot
      await syncTransactionSnapshot({
        db,
        sourceCollection: "fixedDeposits",
        sourceType: "fixed_deposit",
        sourceRecord: newFd,
        sourceLabel: newFd.fdNumber || "",
        sourceEvent: "open",
      });

      return createResponse(201,
        {
          message: "Fixed Deposit created successfully",
          id: newFd._id,
          fdNumber: newFd.fdNumber,
        },
        origin, event);
    }

    if (event.httpMethod === "PUT") {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(400, { error: "Fixed Deposit ID is required" }, origin, event);
      }

      const fdData = normalizePaymentMethodsInRecord(JSON.parse(event.body));

      const existingRecord = await fdCollection.findOne({
        _id: new ObjectId(id),
        isDeleted: { $ne: true },
      });

      if (!existingRecord) {
        return createResponse(404, { error: "Fixed Deposit not found" }, origin, event);
      }

      const mergedData = {
        ...existingRecord,
        ...fdData,
      };

      const validationError = await validateFdDateAgainstFinancialYear(mergedData, yearsCollection);
      if (validationError) {
        return createResponse(400, { error: validationError }, origin, event);
      }

      const closureValidationError = await validateClosureDateAgainstFinancialYear(
        mergedData,
        yearsCollection,
      );
      if (closureValidationError) {
        return createResponse(400, { error: closureValidationError }, origin, event);
      }

      const normalizedData = normalizeFdRecord(mergedData);

      const newStatus = String(normalizedData.fdStatus || "").trim();
      const oldStatus = String(existingRecord.fdStatus || "").trim();

      if ((newStatus === "Matured" || newStatus === "Closed") && !normalizedData.closureDate) {
        normalizedData.closureDate = getCurrentDateString();
      }

      if (!normalizedData.closureFinancialYear && normalizedData.closureDate) {
        normalizedData.closureFinancialYear = getFinancialYearFromDate(normalizedData.closureDate);
      }

      const updatedRecord = {
        ...normalizedData,
        updatedAt: new Date(),
        ...getAuditFieldsFromEvent(event, "update"),
      };

      await fdCollection.updateOne(
        { _id: new ObjectId(id), isDeleted: { $ne: true } },
        { $set: updatedRecord },
      );

      // Sync opening transaction (always)
      await syncTransactionSnapshot({
        db,
        sourceCollection: "fixedDeposits",
        sourceType: "fixed_deposit",
        sourceRecord: updatedRecord,
        sourceLabel: updatedRecord.fdNumber || "",
        sourceEvent: "open",
      });

      // Sync closing transaction if status changed to Matured or Closed
      if (
        (newStatus === "Matured" || newStatus === "Closed") &&
        oldStatus !== "Matured" &&
        oldStatus !== "Closed"
      ) {
        await syncTransactionSnapshot({
          db,
          sourceCollection: "fixedDeposits",
          sourceType: "fixed_deposit",
          sourceRecord: updatedRecord,
          sourceLabel: updatedRecord.fdNumber || "",
          sourceEvent: "close",
        });
      }

      return createResponse(200, { message: "Fixed Deposit updated successfully" }, origin, event);
    }

    if (event.httpMethod === "DELETE") {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(400, { error: "Fixed Deposit ID is required" }, origin, event);
      }

      const existingRecord = await fdCollection.findOne({
        _id: new ObjectId(id),
        isDeleted: { $ne: true },
      });

      if (!existingRecord) {
        return createResponse(404, { error: "Fixed Deposit not found" }, origin, event);
      }

      // Sync deletion
      await syncTransactionSnapshot({
        db,
        sourceCollection: "fixedDeposits",
        sourceType: "fixed_deposit",
        sourceRecord: existingRecord,
        sourceLabel: existingRecord.fdNumber || "",
        deleted: true,
      });

      await fdCollection.updateOne(
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

      return createResponse(200, { message: "Fixed Deposit deleted successfully" }, origin, event);
    }

    return createResponse(405, { error: "Method not allowed" }, origin, event);
  } catch (error) {
    if (error.message?.includes("Invalid token") || error.message?.includes("jwt")) {
      return createResponse(401, { error: "Unauthorized" }, origin, event);
    }
    console.error("Fixed Deposits API Error:", error);
    return createResponse(500, { error: "Internal server error" }, origin, event);
  }
}
