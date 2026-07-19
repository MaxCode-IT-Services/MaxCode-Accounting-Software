// Cash & Bank Book API
// Tracks miscellaneous cash/bank receipts from other sources (asset sales, commission, etc.)
// Requires JWT authentication
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

const round2 = (value) => {
  const num = toNumber(value);
  return Math.round(num * 100) / 100;
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

const validateDateAgainstFinancialYear = async (entryData, yearsCollection) => {
  const entryDate = String(entryData?.entryDate || "").trim();
  if (!entryDate) return "Entry Date is required";

  const normalizedYear = String(entryData?.financialYear || "").trim();
  if (normalizedYear === "ALL") {
    return "Please select a specific Financial Year before saving";
  }

  const yearRecord = await resolveFinancialYearRecord(yearsCollection, normalizedYear, entryDate);
  if (!yearRecord?.startDate || !yearRecord?.endDate) {
    return normalizedYear
      ? `Financial Year range not found for ${normalizedYear}`
      : "Could not determine Financial Year for selected Date";
  }

  if (!isDateWithinRange(entryDate, yearRecord.startDate, yearRecord.endDate)) {
    const yearLabel = yearRecord.financialYear || yearRecord.year || normalizedYear;
    return `Entry Date must be within the selected Financial Year (${yearLabel})`;
  }

  return null;
};

/**
 * Generate entry number in format: CB/YY-YY/XXXX
 */
const generateEntryNumber = async (cbCollection, financialYear) => {
  const yearToken = String(financialYear || "").trim();
  let token = yearToken;
  if (/^\d{4}-\d{4}$/.test(yearToken)) {
    token = `${yearToken.slice(2, 4)}-${yearToken.slice(-2)}`;
  }

  const prefix = `CB/${token}/`;

  const lastEntry = await cbCollection
    .findOne(
      { entryNumber: { $regex: new RegExp(`^${escapeRegExp(prefix)}\\d+$`) }, isDeleted: { $ne: true } },
      { sort: { createdAt: -1 } },
    );

  let nextNum = 1;
  if (lastEntry?.entryNumber) {
    const match = lastEntry.entryNumber.match(/(\d+)$/);
    if (match) nextNum = parseInt(match[1], 10) + 1;
  }

  return `${prefix}${String(nextNum).padStart(4, "0")}`;
};

export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === "OPTIONS") {
    return createResponse(200, {}, origin);
  }

  try {
    const user = verifyRequestToken(event);
    const { db } = await connectToDatabase();
    const cbCollection = db.collection("cashBankBook");
    const yearsCollection = db.collection("financialYears");

    // GET - Fetch all entries or single by ID
    if (event.httpMethod === "GET") {
      const {
        id,
        page = 1,
        limit = 10,
        search,
        entryType,
        entryDate_start,
        entryDate_end,
        sortBy = "createdAt",
        sortOrder = "desc",
        filter,
        financialYear,
      } = event.queryStringParameters || {};

      if (id) {
        const entry = await cbCollection.findOne({
          _id: new ObjectId(id),
          isDeleted: { $ne: true },
        });
        if (!entry) {
          return createResponse(404, { error: "Cash & Bank entry not found" }, origin);
        }
        return createResponse(200, entry, origin);
      }

      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 10;
      const skip = (pageNum - 1) * limitNum;

      const filterQuery = { isDeleted: { $ne: true } };
      const params = event.queryStringParameters || {};

      // Financial year filter
      if (financialYear && financialYear !== "ALL") {
        filterQuery.financialYear = financialYear;
      }

      // Date range filter
      const dateRanges = {};
      if (entryDate_start || entryDate_end) {
        dateRanges.entryDate = {};
        if (entryDate_start) {
          const parts = entryDate_start.split("-");
          dateRanges.entryDate.$gte = new Date(
            Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)),
          );
        }
        if (entryDate_end) {
          const parts = entryDate_end.split("-");
          dateRanges.entryDate.$lte = new Date(
            Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 23, 59, 59, 999),
          );
        }
      }

      // Created date-time range filter
      const createdAt_start = params.createdAt_start;
      const createdAt_end = params.createdAt_end;
      if (createdAt_start || createdAt_end) {
        dateRanges.createdAt = {};
        if (createdAt_start) {
          const parts = createdAt_start.split("-");
          dateRanges.createdAt.$gte = new Date(
            Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10)),
          );
        }
        if (createdAt_end) {
          const parts = createdAt_end.split("-");
          dateRanges.createdAt.$lte = new Date(
            Date.UTC(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10), 23, 59, 59, 999),
          );
        }
      }

      Object.entries(dateRanges).forEach(([key, range]) => {
        filterQuery[key] = range;
      });

      // Filter by card click
      if (filter) {
        switch (filter) {
          case "cash":
            filterQuery.entryType = "Cash";
            break;
          case "bank":
            filterQuery.entryType = "Bank";
            break;
          default:
            break;
        }
      }

      // Dropdown filters
      if (entryType && entryType !== "All") {
        filterQuery.entryType = entryType;
      }

      // Search filter
      if (search && search.trim()) {
        const searchRegex = { $regex: search.trim(), $options: "i" };
        filterQuery.$or = [
          { entryNumber: searchRegex },
          { sourceName: searchRegex },
          { description: searchRegex },
          { referenceNumber: searchRegex },
          { paymentMethod: searchRegex },
        ];
      }

      // Sorting
      const sortObject = {};
      sortObject[sortBy] = sortOrder === "asc" ? 1 : -1;

      const totalRecords = await cbCollection.countDocuments(filterQuery);
      const entries = await cbCollection
        .find(filterQuery)
        .sort(sortObject)
        .skip(skip)
        .limit(limitNum)
        .toArray();

      // Distinct values for dropdown filters
      const entryTypeValues = await cbCollection.distinct("entryType", {
        isDeleted: { $ne: true },
        entryType: { $exists: true, $ne: "" },
      });

      const sourceNameValues = await cbCollection.distinct("sourceName", {
        isDeleted: { $ne: true },
        sourceName: { $exists: true, $ne: "" },
      });

      // Statistics
      const totalCashEntries = await cbCollection.countDocuments({
        isDeleted: { $ne: true },
        entryType: "Cash",
      });

      const totalBankEntries = await cbCollection.countDocuments({
        isDeleted: { $ne: true },
        entryType: "Bank",
      });

      const totalAmountAgg = await cbCollection
        .aggregate([
          { $match: { isDeleted: { $ne: true } } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ])
        .toArray();

      const totalCashAmountAgg = await cbCollection
        .aggregate([
          { $match: { isDeleted: { $ne: true }, entryType: "Cash" } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ])
        .toArray();

      const totalBankAmountAgg = await cbCollection
        .aggregate([
          { $match: { isDeleted: { $ne: true }, entryType: "Bank" } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ])
        .toArray();

      return createResponse(
        200,
        {
          data: entries,
          pagination: {
            page: pageNum,
            limit: limitNum,
            totalRecords,
            totalPages: Math.ceil(totalRecords / limitNum),
          },
          statistics: {
            total: totalRecords,
            totalAmount: totalAmountAgg[0]?.total || 0,
            cashEntries: totalCashEntries,
            bankEntries: totalBankEntries,
            cashAmount: totalCashAmountAgg[0]?.total || 0,
            bankAmount: totalBankAmountAgg[0]?.total || 0,
          },
          filterOptions: {
            entryType: ["All", ...entryTypeValues.sort()],
            sourceName: ["All", ...sourceNameValues.sort()],
          },
        },
        origin,
      );
    }

    // POST - Create new cash/bank entry
    if (event.httpMethod === "POST") {
      const entryData = normalizePaymentMethodsInRecord(JSON.parse(event.body));

      const validationError = await validateDateAgainstFinancialYear(entryData, yearsCollection);
      if (validationError) {
        return createResponse(400, { error: validationError }, origin);
      }

      // Resolve financial year if not set
      if (!entryData.financialYear || entryData.financialYear === "ALL") {
        const yearRecord = await resolveFinancialYearRecord(
          yearsCollection,
          "",
          entryData.entryDate,
        );
        if (yearRecord) {
          entryData.financialYear = yearRecord.financialYear || yearRecord.year;
        }
      }

      // Generate entry number
      entryData.entryNumber = await generateEntryNumber(cbCollection, entryData.financialYear);

      const newEntry = {
        _id: new ObjectId(),
        ...entryData,
        amount: round2(toNumber(entryData.amount)),
        createdAt: new Date(),
        updatedAt: new Date(),
        ...getAuditFieldsFromEvent(event, "create"),
      };

      const result = await cbCollection.insertOne(newEntry);

      // Sync to transactions for balance sheet
      await syncTransactionSnapshot({
        db,
        sourceCollection: "cashBankBook",
        sourceType: "cash-bank-entry",
        sourceRecord: newEntry,
        sourceLabel: newEntry.entryNumber || "",
      });

      return createResponse(
        201,
        {
          message: "Cash & Bank entry created successfully",
          id: result.insertedId,
          ...entryData,
        },
        origin,
      );
    }

    // PUT - Update existing entry
    if (event.httpMethod === "PUT") {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(400, { error: "Entry ID is required" }, origin);
      }

      const entryData = normalizePaymentMethodsInRecord(JSON.parse(event.body));
      const { _id, id: recordId, ...updateData } = entryData;

      const existingRecord = await cbCollection.findOne({
        _id: new ObjectId(id),
        isDeleted: { $ne: true },
      });

      if (!existingRecord) {
        return createResponse(404, { error: "Cash & Bank entry not found" }, origin);
      }

      const mergedData = { ...existingRecord, ...updateData };

      const validationError = await validateDateAgainstFinancialYear(mergedData, yearsCollection);
      if (validationError) {
        return createResponse(400, { error: validationError }, origin);
      }

      const updatedRecord = {
        ...mergedData,
        amount: round2(toNumber(mergedData.amount)),
        updatedAt: new Date(),
        ...getAuditFieldsFromEvent(event, "update"),
      };

      const result = await cbCollection.updateOne(
        { _id: new ObjectId(id), isDeleted: { $ne: true } },
        { $set: updatedRecord },
      );

      if (result.matchedCount === 0) {
        return createResponse(404, { error: "Cash & Bank entry not found" }, origin);
      }

      // Sync to transactions for balance sheet
      await syncTransactionSnapshot({
        db,
        sourceCollection: "cashBankBook",
        sourceType: "cash-bank-entry",
        sourceRecord: updatedRecord,
        sourceLabel: updatedRecord.entryNumber || "",
      });

      return createResponse(200, { message: "Cash & Bank entry updated successfully" }, origin);
    }

    // DELETE - Soft delete
    if (event.httpMethod === "DELETE") {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(400, { error: "Entry ID is required" }, origin);
      }

      const existingRecord = await cbCollection.findOne({
        _id: new ObjectId(id),
        isDeleted: { $ne: true },
      });

      if (!existingRecord) {
        return createResponse(404, { error: "Cash & Bank entry not found" }, origin);
      }

      const result = await cbCollection.updateOne(
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
        return createResponse(404, { error: "Cash & Bank entry not found" }, origin);
      }

      // Sync deletion to transactions
      await syncTransactionSnapshot({
        db,
        sourceCollection: "cashBankBook",
        sourceType: "cash-bank-entry",
        sourceRecord: existingRecord,
        sourceLabel: existingRecord.entryNumber || "",
        deleted: true,
      });

      return createResponse(200, { message: "Cash & Bank entry deleted successfully" }, origin);
    }

    return createResponse(405, { error: "Method not allowed" }, origin);
  } catch (error) {
    console.error("Cash & Bank Book API Error:", error);
    if (error.message === "Unauthorized") {
      return createResponse(401, { error: "Unauthorized" }, origin);
    }
    return createResponse(500, { error: "Internal server error" }, origin);
  }
}
