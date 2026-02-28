import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { ObjectId } from "mongodb";
import { verifyRequestToken } from "./utils/auth.js";

/**
 * Purchase Management API
 * Handles CRUD operations for purchases with pagination support
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
    const purchasesCollection = db.collection("purchases");
    const vendorsCollection = db.collection("vendors");

    // GET - Fetch all purchases or specific purchase by ID with pagination support
    if (event.httpMethod === "GET") {
      const {
        id,
        page = 1,
        limit = 10,
        search,
        paymentStatus,
        paymentMethod,
        invoiceType,
        placeOfSupply,
        financialYear,
        period,
        createdDateTime_start,
        createdDateTime_end,
        invoiceDateFormatted_start,
        invoiceDateFormatted_end,
        paymentDateFormatted_start,
        paymentDateFormatted_end,
        sortBy = "createdAt",
        sortOrder = "desc",
        filter, // For card filters
      } = event.queryStringParameters || {};

      // If ID is provided, return single purchase
      if (id) {
        if (!ObjectId.isValid(id)) {
          return createResponse(400, { error: "Invalid purchase ID" }, origin);
        }

        const purchase = await purchasesCollection.findOne({
          _id: new ObjectId(id),
          isDeleted: { $ne: true },
        });

        if (!purchase) {
          return createResponse(404, { error: "Purchase not found" }, origin);
        }

        return createResponse(200, purchase, origin);
      }

      // Build filter query
      const filterQuery = { isDeleted: { $ne: true } };
      const params = event.queryStringParameters || {};

      // Financial year filter
      if (financialYear && financialYear !== "ALL") {
        // We need to get the financial year dates from years collection
        const yearsCollection = db.collection("financialYears");
        const yearRecord = await yearsCollection.findOne({
          financialYear: financialYear,
          isDeleted: { $ne: true },
        });

        if (yearRecord?.startDate && yearRecord?.endDate) {
          filterQuery.invoiceDate = {
            $gte: yearRecord.startDate,
            $lte: yearRecord.endDate,
          };
        }
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
          filterQuery.invoiceDate = {
            $gte: startDate,
            $lte: endDate,
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

        if (key === "invoiceType") {
          filterQuery.invoiceType = value;
          return;
        }

        // If value is comma-separated, treat as array
        if (typeof value === "string" && value.includes(",")) {
          filterQuery[key] = { $in: value.split(",") };
        } else if (typeof value === "string") {
          filterQuery[key] = { $regex: value, $options: "i" };
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
          if (baseKey === "invoiceDateFormatted") baseKey = "invoiceDate";
          if (baseKey === "paymentDateFormatted") baseKey = "paymentDate";

          if (!dateRanges[baseKey]) dateRanges[baseKey] = {};

          const dateParts = value.split("-");
          if (dateParts.length === 3) {
            // For paymentDate and invoiceDate (string fields), use string comparison (YYYY-MM-DD)
            if (baseKey === "paymentDate" || baseKey === "invoiceDate") {
              // Pad month and day to 2 digits
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
          if (baseKey === "invoiceDateFormatted") baseKey = "invoiceDate";
          if (baseKey === "paymentDateFormatted") baseKey = "paymentDate";

          if (!dateRanges[baseKey]) dateRanges[baseKey] = {};

          const dateParts = value.split("-");
          if (dateParts.length === 3) {
            if (baseKey === "paymentDate" || baseKey === "invoiceDate") {
              // Pad month and day to 2 digits
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
            filterQuery.paymentStatus = "Unpaid";
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
          { invoiceNumber: { $regex: search, $options: "i" } },
          { vendorName: { $regex: search, $options: "i" } },
          { businessName: { $regex: search, $options: "i" } },
          { placeOfSupply: { $regex: search, $options: "i" } },
          { paymentMethod: { $regex: search, $options: "i" } },
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
      const totalRecords =
        await purchasesCollection.countDocuments(filterQuery);

      // Get paginated results
      const purchases = await purchasesCollection
        .find(filterQuery)
        .sort(sortObject)
        .skip(skip)
        .limit(limitNum)
        .toArray();

      // Get vendors for reference
      const vendors = await vendorsCollection
        .find({ isDeleted: { $ne: true } })
        .toArray();

      // Get distinct values for dynamic filter options
      const paymentStatusValues = await purchasesCollection.distinct(
        "paymentStatus",
        { isDeleted: { $ne: true }, paymentStatus: { $exists: true, $ne: "" } },
      );

      const paymentMethodValues = await purchasesCollection.distinct(
        "paymentMethod",
        { isDeleted: { $ne: true }, paymentMethod: { $exists: true, $ne: "" } },
      );

      const invoiceTypeValues = await purchasesCollection.distinct(
        "invoiceType",
        { isDeleted: { $ne: true }, invoiceType: { $exists: true, $ne: "" } },
      );

      const placeOfSupplyValues = await purchasesCollection.distinct(
        "placeOfSupply",
        { isDeleted: { $ne: true }, placeOfSupply: { $exists: true, $ne: "" } },
      );

      // Get statistics for dashboard cards
      const totalRecordsCount = await purchasesCollection.countDocuments({
        isDeleted: { $ne: true },
      });

      const paidCount = await purchasesCollection.countDocuments({
        isDeleted: { $ne: true },
        paymentStatus: "Paid",
      });

      const unpaidCount = await purchasesCollection.countDocuments({
        isDeleted: { $ne: true },
        paymentStatus: "Unpaid",
      });

      const partialCount = await purchasesCollection.countDocuments({
        isDeleted: { $ne: true },
        paymentStatus: "Partial",
      });

      // Calculate total amount
      const allPurchases = await purchasesCollection
        .find({ isDeleted: { $ne: true } })
        .toArray();

      const totalAmount = allPurchases.reduce(
        (sum, p) => sum + (p.taxData?.totalAmount || 0),
        0,
      );

      const paidAmount = allPurchases
        .filter(
          (p) => p.paymentStatus === "Paid" || p.paymentStatus === "Partial",
        )
        .reduce((sum, p) => {
          if (p.amountReceived !== undefined && p.amountReceived !== null) {
            return sum + (p.amountReceived || 0);
          } else if (p.paymentStatus === "Paid") {
            return sum + (p.taxData?.totalAmount || 0);
          } else if (p.paymentStatus === "Partial") {
            return sum + (p.taxData?.totalAmount || 0) / 2;
          }
          return sum;
        }, 0);

      const unpaidAmount = totalAmount - paidAmount;

      // Return paginated response with metadata
      return createResponse(
        200,
        {
          data: purchases,
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
            paymentStatus: ["All", ...paymentStatusValues.sort()],
            paymentMethod: ["All", ...paymentMethodValues.sort()],
            invoiceType: ["All", ...invoiceTypeValues.sort()],
            placeOfSupply: ["All", ...placeOfSupplyValues.sort()],
          },
          vendors: vendors.map((v) => ({
            id: v._id,
            vendorName: v.vendorName,
            businessName: v.businessName,
          })),
          debug: {
            filterQuery,
            params,
            dateRanges,
          },
        },
        origin,
      );
    }

    // POST - Create new purchase
    if (event.httpMethod === "POST") {
      const purchaseData = JSON.parse(event.body);

      if (!purchaseData.invoiceNumber) {
        return createResponse(
          400,
          { error: "Invoice number is required" },
          origin,
        );
      }

      // Check for duplicate invoice number (including soft-deleted records)
      const existingInvoice = await purchasesCollection.findOne({
        invoiceNumber: purchaseData.invoiceNumber,
      });

      if (existingInvoice) {
        return createResponse(
          409,
          { error: "Invoice number already exists" },
          origin,
        );
      }

      const result = await purchasesCollection.insertOne({
        ...purchaseData,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return createResponse(
        201,
        {
          message: "Purchase created successfully",
          id: result.insertedId,
        },
        origin,
      );
    }

    // PUT - Update existing purchase
    if (event.httpMethod === "PUT") {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(
          400,
          { error: "Purchase ID is required" },
          origin,
        );
      }

      if (!ObjectId.isValid(id)) {
        return createResponse(400, { error: "Invalid purchase ID" }, origin);
      }

      const purchaseData = JSON.parse(event.body);
      const purchaseObjectId = new ObjectId(id);

      // Check for duplicate invoice number (excluding current record)
      if (purchaseData.invoiceNumber) {
        const existingInvoice = await purchasesCollection.findOne({
          _id: { $ne: purchaseObjectId },
          invoiceNumber: purchaseData.invoiceNumber,
        });

        if (existingInvoice) {
          return createResponse(
            409,
            { error: "Invoice number already exists" },
            origin,
          );
        }
      }

      const result = await purchasesCollection.updateOne(
        { _id: purchaseObjectId, isDeleted: { $ne: true } },
        {
          $set: {
            ...purchaseData,
            updatedAt: new Date(),
          },
        },
      );

      if (result.matchedCount === 0) {
        return createResponse(404, { error: "Purchase not found" }, origin);
      }

      return createResponse(
        200,
        { message: "Purchase updated successfully" },
        origin,
      );
    }

    // DELETE - Soft delete purchase
    if (event.httpMethod === "DELETE") {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(
          400,
          { error: "Purchase ID is required" },
          origin,
        );
      }

      if (!ObjectId.isValid(id)) {
        return createResponse(400, { error: "Invalid purchase ID" }, origin);
      }

      const result = await purchasesCollection.updateOne(
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
        return createResponse(404, { error: "Purchase not found" }, origin);
      }

      return createResponse(
        200,
        { message: "Purchase deleted successfully" },
        origin,
      );
    }

    return createResponse(405, { error: "Method not allowed" }, origin);
  } catch (error) {
    console.error("Purchase API Error:", error);

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
