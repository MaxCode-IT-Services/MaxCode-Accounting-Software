import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { ObjectId } from "mongodb";
import { verifyRequestToken } from "./utils/auth.js";

/**
 * Company Expense Management API
 * Handles CRUD operations for company expenses with pagination support
 * Requires JWT authentication
 */
export async function handler(event) {
  // Extract origin for CORS
  const origin = event.headers.origin || event.headers.Origin;

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return createResponse(200, {}, origin);
  }

  try {
    // Verify JWT token
    const user = verifyRequestToken(event);

    const { db } = await connectToDatabase();
    const expensesCollection = db.collection("company_expenses");
    const yearsCollection = db.collection("financialYears");

    const escapeRegExp = (value) => {
      return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    };

    const getNextExpenseNumber = async (financialYear) => {
      // Format: MC/CEXP/YY-YY/0001
      if (!financialYear) return "";

      // Get financial year record to get the year range
      const yearRecord = await yearsCollection.findOne({
        financialYear: financialYear,
        isDeleted: { $ne: true },
      });

      if (!yearRecord) return "";

      // Extract YY-YY from financial year (e.g., "2024-2025" -> "24-25")
      const yearParts = financialYear.split("-");
      if (yearParts.length !== 2) return "";

      const shortYear1 = yearParts[0].slice(-2);
      const shortYear2 = yearParts[1].slice(-2);
      const prefix = `MC/CEXP/${shortYear1}-${shortYear2}/`;

      // Find all expense numbers with this prefix
      const pattern = new RegExp(`^${escapeRegExp(prefix)}(\\d+)$`);

      const existingExpenses = await expensesCollection
        .find(
          {
            expenseNumber: { $regex: pattern },
            financialYear: financialYear,
            isDeleted: { $ne: true },
          },
          { projection: { expenseNumber: 1 } },
        )
        .toArray();

      let maxNumber = 0;
      existingExpenses.forEach((expense) => {
        const expenseNumber = String(expense?.expenseNumber || "");
        const expenseMatch = expenseNumber.match(pattern);
        if (!expenseMatch) return;
        const current = parseInt(expenseMatch[1], 10);
        if (!Number.isNaN(current) && current > maxNumber) {
          maxNumber = current;
        }
      });

      const nextNumber = maxNumber + 1;
      return `${prefix}${String(nextNumber).padStart(4, "0")}`;
    };

    // GET - Fetch all expenses or specific expense by ID with pagination support
    if (event.httpMethod === "GET") {
      const {
        id,
        page = 1,
        limit = 10,
        search,
        paymentStatus,
        paymentMethod,
        entrySource,
        financialYear,
        period,
        createdDateTime_start,
        createdDateTime_end,
        expenseDateFormatted_start,
        expenseDateFormatted_end,
        paymentDateFormatted_start,
        paymentDateFormatted_end,
        sortBy = "createdAt",
        sortOrder = "desc",
        filter, // For card filters
      } = event.queryStringParameters || {};

      // If ID is provided, return single expense
      if (id) {
        if (!ObjectId.isValid(id)) {
          return createResponse(400, { error: "Invalid expense ID" }, origin);
        }

        const expense = await expensesCollection.findOne({
          _id: new ObjectId(id),
          isDeleted: { $ne: true },
        });

        if (!expense) {
          return createResponse(404, { error: "Expense not found" }, origin);
        }

        return createResponse(200, expense, origin);
      }

      // Build filter query
      const filterQuery = { isDeleted: { $ne: true } };
      const params = event.queryStringParameters || {};

      // Financial year filter
      if (financialYear && financialYear !== "ALL") {
        filterQuery.financialYear = financialYear;
      }

      // Period filter (daily, monthly, quarterly, halfYearly, yearly)
      if (period && period !== "yearly") {
        const today = new Date();
        let startDate, endDate;

        if (period === "daily") {
          startDate = new Date(today.setHours(0, 0, 0, 0));
          endDate = new Date(today.setHours(23, 59, 59, 999));
        } else if (period === "monthly") {
          startDate = new Date(today.getFullYear(), today.getMonth(), 1);
          endDate = new Date(
            today.getFullYear(),
            today.getMonth() + 1,
            0,
            23,
            59,
            59,
            999,
          );
        } else if (period === "quarterly") {
          const quarter = Math.floor(today.getMonth() / 3);
          startDate = new Date(today.getFullYear(), quarter * 3, 1);
          endDate = new Date(
            today.getFullYear(),
            (quarter + 1) * 3,
            0,
            23,
            59,
            59,
            999,
          );
        } else if (period === "halfYearly") {
          const half = today.getMonth() < 6 ? 0 : 6;
          startDate = new Date(today.getFullYear(), half, 1);
          endDate = new Date(today.getFullYear(), half + 6, 0, 23, 59, 59, 999);
        }

        if (startDate && endDate) {
          const pad = (n) => String(n).padStart(2, "0");
          const startStr = `${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-${pad(startDate.getDate())}`;
          const endStr = `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-${pad(endDate.getDate())}`;
          filterQuery.expenseDate = {
            $gte: startStr,
            $lte: endStr,
          };
        }
      }

      Object.entries(params).forEach(([key, value]) => {
        if (!value || value === "" || value === "All") return;
        if (key === "filter") return;
        if (key === "financialYear" || key === "period") return;
        if (
          ["page", "limit", "sortBy", "sortOrder", "search", "id"].includes(key)
        )
          return;

        if (key.endsWith("_start") || key.endsWith("_end")) return;

        // Handle filter keys
        if (key === "paymentStatus") {
          filterQuery.paymentStatus = value;
          return;
        }

        if (key === "paymentMethod") {
          filterQuery.paymentMethod = value;
          return;
        }

        if (key === "entrySource") {
          filterQuery.entrySource = value;
          return;
        }

        // If value is comma-separated, treat as array
        if (typeof value === "string" && value.includes(",")) {
          filterQuery[key] = {
            $in: value.split(",").map((v) => v.trim()),
          };
        } else if (typeof value === "string") {
          // Exact match for dropdown columns
          if (["paymentStatus", "paymentMethod", "entrySource"].includes(key)) {
            filterQuery[key] = value.trim();
          } else {
            // Text search fields
            filterQuery[key] = {
              $regex: value.trim(),
              $options: "i",
            };
          }
        } else {
          filterQuery[key] = value;
        }
      });

      // Handle date range filters dynamically
      const dateRanges = {};

      Object.entries(params).forEach(([key, value]) => {
        if (!value) return;

        if (key.endsWith("_start")) {
          let baseKey = key.replace(/_start$/, "");
          if (baseKey === "createdDateTime") baseKey = "createdAt";
          if (baseKey === "expenseDateFormatted") baseKey = "expenseDate";
          if (baseKey === "paymentDateFormatted") baseKey = "paymentDate";

          if (!dateRanges[baseKey]) dateRanges[baseKey] = {};

          const dateParts = value.split("-");
          if (dateParts.length === 3) {
            if (baseKey === "paymentDate" || baseKey === "expenseDate") {
              const year = dateParts[0];
              const month = dateParts[1].padStart(2, "0");
              const day = dateParts[2].padStart(2, "0");
              dateRanges[baseKey].$gte = `${year}-${month}-${day}`;
            } else {
              const year = parseInt(dateParts[0]);
              const month = parseInt(dateParts[1]) - 1;
              const day = parseInt(dateParts[2]);
              const startDate = new Date(
                Date.UTC(year, month, day, 0, 0, 0, 0),
              );
              dateRanges[baseKey].$gte = startDate;
            }
          }
        }

        if (key.endsWith("_end")) {
          let baseKey = key.replace(/_end$/, "");
          if (baseKey === "createdDateTime") baseKey = "createdAt";
          if (baseKey === "expenseDateFormatted") baseKey = "expenseDate";
          if (baseKey === "paymentDateFormatted") baseKey = "paymentDate";

          if (!dateRanges[baseKey]) dateRanges[baseKey] = {};

          const dateParts = value.split("-");
          if (dateParts.length === 3) {
            if (baseKey === "paymentDate" || baseKey === "expenseDate") {
              const year = dateParts[0];
              const month = dateParts[1].padStart(2, "0");
              const day = dateParts[2].padStart(2, "0");
              dateRanges[baseKey].$lte = `${year}-${month}-${day}`;
            } else {
              const year = parseInt(dateParts[0]);
              const month = parseInt(dateParts[1]) - 1;
              const day = parseInt(dateParts[2]);
              const endDate = new Date(
                Date.UTC(year, month, day, 23, 59, 59, 999),
              );
              dateRanges[baseKey].$lte = endDate;
            }
          }
        }
      });

      Object.entries(dateRanges).forEach(([key, range]) => {
        filterQuery[key] = range;
      });

      // Card filter (activeCardFilter)
      if (filter) {
        switch (filter) {
          case "paid":
            filterQuery.paymentStatus = "Paid";
            break;
          case "unpaid":
            filterQuery.paymentStatus = { $in: ["Unpaid", "Partial"] };
            break;
          case "partial":
            filterQuery.paymentStatus = "Partial";
            break;
          default:
            break;
        }
      }

      // Global search (multi-field)
      if (search) {
        filterQuery.$or = [
          { expenseNumber: { $regex: search, $options: "i" } },
          { expenseTitle: { $regex: search, $options: "i" } },
          { expenseFor: { $regex: search, $options: "i" } },
          { partyName: { $regex: search, $options: "i" } },
          { referenceNumber: { $regex: search, $options: "i" } },
          { paymentMethod: { $regex: search, $options: "i" } },
          { description: { $regex: search, $options: "i" } },
        ];
      }

      // Parse pagination parameters
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      // Build sort object
      const sortObject = {};
      sortObject[sortBy] = sortOrder === "asc" ? 1 : -1;

      // Get total count for pagination
      const totalRecords = await expensesCollection.countDocuments(filterQuery);

      // Get paginated results
      const expenses = await expensesCollection
        .find(filterQuery)
        .sort(sortObject)
        .skip(skip)
        .limit(limitNum)
        .toArray();

      // Get distinct values for dynamic filter options

      // Get distinct entrySource values for dynamic filter options
      const entrySourceValues = await expensesCollection.distinct(
        "entrySource",
        { isDeleted: { $ne: true }, entrySource: { $exists: true, $ne: "" } },
      );

      const paymentStatusValues = await expensesCollection.distinct(
        "paymentStatus",
        { isDeleted: { $ne: true }, paymentStatus: { $exists: true, $ne: "" } },
      );

      const paymentMethodValues = await expensesCollection.distinct(
        "paymentMethod",
        { isDeleted: { $ne: true }, paymentMethod: { $exists: true, $ne: "" } },
      );

      // Get statistics for dashboard cards
      const totalRecordsCount = await expensesCollection.countDocuments({
        isDeleted: { $ne: true },
      });

      const paidCount = await expensesCollection.countDocuments({
        isDeleted: { $ne: true },
        paymentStatus: "Paid",
      });

      const unpaidCount = await expensesCollection.countDocuments({
        isDeleted: { $ne: true },
        paymentStatus: { $in: ["Unpaid", "Partial"] },
      });

      const partialCount = await expensesCollection.countDocuments({
        isDeleted: { $ne: true },
        paymentStatus: "Partial",
      });

      // Calculate total amount
      const allExpenses = await expensesCollection
        .find({ isDeleted: { $ne: true } })
        .toArray();

      const totalAmount = allExpenses.reduce(
        (sum, p) => sum + (p.amount || 0),
        0,
      );

      const paidAmount = allExpenses
        .filter(
          (p) => p.paymentStatus === "Paid" || p.paymentStatus === "Partial",
        )
        .reduce((sum, p) => {
          if (p.amountReceived !== undefined && p.amountReceived !== null) {
            return sum + (p.amountReceived || 0);
          } else if (p.paymentStatus === "Paid") {
            return sum + (p.amount || 0);
          } else if (p.paymentStatus === "Partial") {
            return sum + (p.amount || 0) / 2;
          }
          return sum;
        }, 0);

      const unpaidAmount = totalAmount - paidAmount;

      // Return paginated response with metadata
      return createResponse(
        200,
        {
          data: expenses,
          pagination: {
            page: pageNum,
            limit: limitNum,
            totalRecords,
            totalPages: Math.ceil(totalRecords / limitNum),
          },
          statistics: {
            total: totalRecordsCount,
            paid: Number(paidAmount || 0).toFixed(2),
            unpaid: Number(unpaidAmount || 0).toFixed(2),
            partial: partialCount,
            totalAmount: Number(totalAmount || 0).toFixed(2),
          },
          filterOptions: {
            entrySource: ["All", ...entrySourceValues.sort()],
            paymentStatus: ["All", ...paymentStatusValues.sort()],
            paymentMethod: ["All", ...paymentMethodValues.sort()],
          },
          debug: {
            filterQuery,
            params,
            dateRanges,
          },
        },
        origin,
      );
    }

    // POST - Create new expense
    if (event.httpMethod === "POST") {
      const expenseData = JSON.parse(event.body || "{}");

      if (!expenseData.financialYear) {
        const defaultYear = await yearsCollection.findOne({
          isDeleted: { $ne: true },
          isDefault: true,
        });

        if (defaultYear?.financialYear) {
          expenseData.financialYear = defaultYear.financialYear;
        } else {
          return createResponse(
            400,
            {
              error:
                "Financial year is required. Default financial year not found.",
            },
            origin,
          );
        }
      }

      if (!expenseData.expenseNumber) {
        expenseData.expenseNumber = await getNextExpenseNumber(
          expenseData.financialYear,
        );

        if (!expenseData.expenseNumber) {
          return createResponse(
            400,
            {
              error:
                "Could not generate expense number. Please check financial year configuration.",
            },
            origin,
          );
        }
      }

      // Check for duplicate expense number (including soft-deleted records)
      const existingExpense = await expensesCollection.findOne({
        expenseNumber: expenseData.expenseNumber,
      });

      if (existingExpense && !existingExpense.isDeleted) {
        return createResponse(
          409,
          { error: "Expense number already exists" },
          origin,
        );
      }

      // Normalize amount and tax data
      const amount = parseFloat(expenseData.amount || 0);

      const normalizedExpense = {
        ...expenseData,
        _id: new ObjectId(),
        amount,
        taxData: {
          taxableAmount: amount,
          subtotal: amount,
          totalAmount: amount,
          cgst: 0,
          sgst: 0,
          igst: 0,
          taxPercentage: 0,
        },
        invoiceType: "No GST",
        items: expenseData.items || [],
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await expensesCollection.insertOne(normalizedExpense);

      return createResponse(
        201,
        {
          message: "Company expense created successfully",
          id: result.insertedId,
        },
        origin,
      );
    }

    // PUT - Update existing expense
    if (event.httpMethod === "PUT") {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(400, { error: "Expense ID is required" }, origin);
      }

      if (!ObjectId.isValid(id)) {
        return createResponse(400, { error: "Invalid expense ID" }, origin);
      }

      const expenseData = JSON.parse(event.body);
      const expenseObjectId = new ObjectId(id);

      // Check for duplicate expense number (excluding current record)
      if (expenseData.expenseNumber) {
        const existingExpense = await expensesCollection.findOne({
          _id: { $ne: expenseObjectId },
          expenseNumber: expenseData.expenseNumber,
        });

        if (existingExpense) {
          return createResponse(
            409,
            { error: "Expense number already exists" },
            origin,
          );
        }
      }

      // Normalize amount and tax data
      const amount = parseFloat(expenseData.amount || 0);

      const result = await expensesCollection.updateOne(
        { _id: expenseObjectId, isDeleted: { $ne: true } },
        {
          $set: {
            ...expenseData,
            amount,
            taxData: {
              taxableAmount: amount,
              subtotal: amount,
              totalAmount: amount,
              cgst: 0,
              sgst: 0,
              igst: 0,
              taxPercentage: 0,
            },
            invoiceType: "No GST",
            items: expenseData.items || [],
            updatedAt: new Date(),
          },
        },
      );

      if (result.matchedCount === 0) {
        return createResponse(404, { error: "Expense not found" }, origin);
      }

      return createResponse(
        200,
        { message: "Company expense updated successfully" },
        origin,
      );
    }

    // DELETE - Soft delete expense
    if (event.httpMethod === "DELETE") {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(400, { error: "Expense ID is required" }, origin);
      }

      if (!ObjectId.isValid(id)) {
        return createResponse(400, { error: "Invalid expense ID" }, origin);
      }

      const result = await expensesCollection.updateOne(
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
        return createResponse(404, { error: "Expense not found" }, origin);
      }

      return createResponse(
        200,
        { message: "Company expense deleted successfully" },
        origin,
      );
    }

    return createResponse(405, { error: "Method not allowed" }, origin);
  } catch (error) {
    console.error("Company Expense API Error:", error);

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
