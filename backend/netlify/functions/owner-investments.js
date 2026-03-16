import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { ObjectId } from "mongodb";
import { verifyRequestToken } from "./utils/auth.js";

/**
 * Owner Investments API
 * Tracks owner capital injected into the business (transferred to current account or cash box)
 * Requires JWT authentication
 */
export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === "OPTIONS") {
    return createResponse(200, {}, origin);
  }

  try {
    const user = verifyRequestToken(event);

    const { db } = await connectToDatabase();
    const fundsCollection = db.collection("personalFunds");
    const yearsCollection = db.collection("financialYears");

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

    const resolveFinancialYearRecord = async (financialYear, fundDate) => {
      const normalizedYear = String(financialYear || "").trim();

      if (normalizedYear && normalizedYear !== "ALL") {
        return yearsCollection.findOne({
          isDeleted: { $ne: true },
          $or: [{ financialYear: normalizedYear }, { year: normalizedYear }],
        });
      }

      const targetDate = getDateOnly(fundDate);
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
          isDateWithinRange(fundDate, yearRecord.startDate, yearRecord.endDate),
        ) || null
      );
    };

    const validateFundDateAgainstFinancialYear = async (fundData) => {
      const fundDate = String(fundData?.fundDate || "").trim();
      if (!fundDate) {
        return "Capital Date is required";
      }

      const normalizedYear = String(fundData?.financialYear || "").trim();
      if (normalizedYear === "ALL") {
        return "Please select a specific Financial Year before saving capital";
      }

      const yearRecord = await resolveFinancialYearRecord(
        normalizedYear,
        fundDate,
      );

      if (!yearRecord?.startDate || !yearRecord?.endDate) {
        return normalizedYear
          ? `Financial Year range not found for ${normalizedYear}`
          : "Could not determine Financial Year for selected Capital Date";
      }

      if (
        !isDateWithinRange(fundDate, yearRecord.startDate, yearRecord.endDate)
      ) {
        const yearLabel =
          yearRecord.financialYear || yearRecord.year || normalizedYear;
        return `Capital Date must be within the selected Financial Year (${yearLabel})`;
      }

      return null;
    };

    // GET - Fetch all owner investments or single by ID
    if (event.httpMethod === "GET") {
      const {
        id,
        page = 1,
        limit = 10,
        search,
        fundSource,
        transferredTo,
        paymentMethod,
        fundDate_start,
        fundDate_end,
        sortBy = "fundDate",
        sortOrder = "desc",
        filter,
      } = event.queryStringParameters || {};

      if (id) {
        const fund = await fundsCollection.findOne({
          _id: new ObjectId(id),
          isDeleted: { $ne: true },
        });
        if (!fund) {
          return createResponse(
            404,
            { error: "Owner investment not found" },
            origin,
          );
        }
        return createResponse(200, fund, origin);
      }

      const pageNum = parseInt(page, 10) || 1;
      const limitNum = parseInt(limit, 10) || 10;
      const skip = (pageNum - 1) * limitNum;

      const filterQuery = { isDeleted: { $ne: true } };
      const params = event.queryStringParameters || {};

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

        if (["fundSource", "transferredTo", "paymentMethod"].includes(key)) {
          filterQuery[key] = value.trim();
          return;
        }

        if (typeof value === "string" && value.includes(",")) {
          filterQuery[key] = {
            $in: value.split(",").map((item) => item.trim()),
          };
          return;
        }

        filterQuery[key] = { $regex: value.trim(), $options: "i" };
      });

      const dateRanges = {};

      Object.entries(params).forEach(([key, value]) => {
        if (!value) return;

        if (key.endsWith("_start")) {
          const baseKey = key.replace(/_start$/, "");
          if (!dateRanges[baseKey]) dateRanges[baseKey] = {};

          const dateParts = value.split("-");
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

          const dateParts = value.split("-");
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
        filterQuery[key] = range;
      });

      if (filter) {
        switch (filter) {
          case "currentAccount":
            filterQuery.transferredTo = "Current Account";
            break;
          case "cashBox":
            filterQuery.transferredTo = "Cash Box";
            break;
          case "bankTransfer":
            filterQuery.paymentMethod = "Bank Transfer";
            break;
          default:
            break;
        }
      }

      if (search && search.trim()) {
        const searchRegex = { $regex: search.trim(), $options: "i" };
        filterQuery.$or = [
          { description: searchRegex },
          { fundSource: searchRegex },
          { transferredTo: searchRegex },
          { paymentMethod: searchRegex },
          { referenceNumber: searchRegex },
        ];
      }

      const sortObject = {};
      sortObject[sortBy] = sortOrder === "asc" ? 1 : -1;

      const totalRecords = await fundsCollection.countDocuments(filterQuery);
      const funds = await fundsCollection
        .find(filterQuery)
        .sort(sortObject)
        .skip(skip)
        .limit(limitNum)
        .toArray();

      const fundSourceValues = await fundsCollection.distinct("fundSource", {
        isDeleted: { $ne: true },
        fundSource: { $exists: true, $ne: "" },
      });

      const transferredToValues = await fundsCollection.distinct(
        "transferredTo",
        {
          isDeleted: { $ne: true },
          transferredTo: { $exists: true, $ne: "" },
        },
      );

      const paymentMethodValues = await fundsCollection.distinct(
        "paymentMethod",
        {
          isDeleted: { $ne: true },
          paymentMethod: { $exists: true, $ne: "" },
        },
      );

      const totalAmount = await fundsCollection
        .aggregate([
          { $match: { isDeleted: { $ne: true } } },
          { $group: { _id: null, total: { $sum: "$amount" } } },
        ])
        .toArray();

      const totalCurrentAccount = await fundsCollection.countDocuments({
        isDeleted: { $ne: true },
        transferredTo: "Current Account",
      });

      const totalCashBox = await fundsCollection.countDocuments({
        isDeleted: { $ne: true },
        transferredTo: "Cash Box",
      });

      const totalBankTransfer = await fundsCollection.countDocuments({
        isDeleted: { $ne: true },
        paymentMethod: "Bank Transfer",
      });

      return createResponse(
        200,
        {
          data: funds,
          pagination: {
            page: pageNum,
            limit: limitNum,
            totalRecords,
            totalPages: Math.ceil(totalRecords / limitNum),
          },
          statistics: {
            total: totalRecords,
            totalAmount: totalAmount[0]?.total || 0,
            currentAccount: totalCurrentAccount,
            cashBox: totalCashBox,
            bankTransfer: totalBankTransfer,
          },
          filterOptions: {
            fundSource: ["All", ...fundSourceValues.sort()],
            transferredTo: ["All", ...transferredToValues.sort()],
            paymentMethod: ["All", ...paymentMethodValues.sort()],
          },
        },
        origin,
      );
    }

    // POST - Create new owner investment record
    if (event.httpMethod === "POST") {
      const fundData = JSON.parse(event.body);

      const validationError =
        await validateFundDateAgainstFinancialYear(fundData);
      if (validationError) {
        return createResponse(400, { error: validationError }, origin);
      }

      const result = await fundsCollection.insertOne({
        ...fundData,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return createResponse(
        201,
        {
          message: "Owner investment created successfully",
          id: result.insertedId,
          ...fundData,
        },
        origin,
      );
    }

    // PUT - Update owner investment record
    if (event.httpMethod === "PUT") {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(
          400,
          { error: "Owner investment ID is required" },
          origin,
        );
      }

      const fundData = JSON.parse(event.body);
      const { _id, id: fundId, ...updateData } = fundData;

      const existingRecord = await fundsCollection.findOne({
        _id: new ObjectId(id),
        isDeleted: { $ne: true },
      });

      if (!existingRecord) {
        return createResponse(
          404,
          { error: "Owner investment not found" },
          origin,
        );
      }

      const mergedData = {
        ...existingRecord,
        ...updateData,
      };

      const validationError =
        await validateFundDateAgainstFinancialYear(mergedData);
      if (validationError) {
        return createResponse(400, { error: validationError }, origin);
      }

      const result = await fundsCollection.updateOne(
        { _id: new ObjectId(id), isDeleted: { $ne: true } },
        { $set: { ...updateData, updatedAt: new Date() } },
      );
      return createResponse(
        200,
        { message: "Owner investment updated successfully" },
        origin,
      );
    }

    // DELETE - Soft delete
    if (event.httpMethod === "DELETE") {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(
          400,
          { error: "Owner investment ID is required" },
          origin,
        );
      }

      const result = await fundsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { isDeleted: true, deletedAt: new Date() } },
      );

      if (result.matchedCount === 0) {
        return createResponse(
          404,
          { error: "Owner investment not found" },
          origin,
        );
      }

      return createResponse(
        200,
        { message: "Owner investment deleted successfully" },
        origin,
      );
    }

    return createResponse(405, { error: "Method not allowed" }, origin);
  } catch (error) {
    if (
      error.message?.includes("Invalid token") ||
      error.message?.includes("jwt")
    ) {
      return createResponse(
        401,
        { error: "Unauthorized" },
        event.headers.origin,
      );
    }
    console.error("Owner Investments API error:", error);
    return createResponse(
      500,
      { error: "Internal server error" },
      event.headers.origin,
    );
  }
}
