import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { ObjectId } from "mongodb";
import { verifyRequestToken } from "./utils/auth.js";

/**
 * Invoice Management API
 * Handles CRUD operations for invoices with pagination support
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
    const invoicesCollection = db.collection("invoices");
    const clientsCollection = db.collection("clients");
    const yearsCollection = db.collection("financialYears");

    const escapeRegExp = (value) => {
      return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    };

    const getNextInvoiceNumber = async (format) => {
      if (!format) return "";
      const match = String(format).match(/^(.*?)(\d+)$/);
      if (!match) return String(format);

      const prefix = match[1];
      const seed = match[2];
      const width = seed.length;
      const seedNumber = parseInt(seed, 10) || 1;
      const pattern = new RegExp(`^${escapeRegExp(prefix)}(\\d+)$`);

      const existingInvoices = await invoicesCollection
        .find(
          { invoiceNumber: { $regex: pattern } },
          { projection: { invoiceNumber: 1 } },
        )
        .toArray();

      let maxNumber = 0;
      existingInvoices.forEach((invoice) => {
        const invoiceNumber = String(invoice?.invoiceNumber || "");
        const invoiceMatch = invoiceNumber.match(pattern);
        if (!invoiceMatch) return;
        const current = parseInt(invoiceMatch[1], 10);
        if (!Number.isNaN(current) && current > maxNumber) {
          maxNumber = current;
        }
      });

      const nextNumber = Math.max(seedNumber, maxNumber + 1);
      return `${prefix}${String(nextNumber).padStart(width, "0")}`;
    };

    // GET - Fetch all invoices or specific invoice by ID with pagination support
    if (event.httpMethod === "GET") {
      const {
        id,
        page = 1,
        limit = 10,
        search,
        paymentStatus,
        paymentMethod,
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

      // If ID is provided, return single invoice
      if (id) {
        if (!ObjectId.isValid(id)) {
          return createResponse(400, { error: "Invalid invoice ID" }, origin);
        }

        const invoice = await invoicesCollection.findOne({
          _id: new ObjectId(id),
          isDeleted: { $ne: true },
        });

        if (!invoice) {
          return createResponse(404, { error: "Invoice not found" }, origin);
        }

        return createResponse(200, invoice, origin);
      }

      // Build filter query
      const filterQuery = { isDeleted: { $ne: true } };
      const params = event.queryStringParameters || {};

      // Financial year filter
      if (financialYear && financialYear !== "ALL") {
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
          // If invoiceDate is string in DB, use YYYY-MM-DD string for range
          const pad = (n) => String(n).padStart(2, "0");
          const startStr = `${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-${pad(startDate.getDate())}`;
          const endStr = `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-${pad(endDate.getDate())}`;
          filterQuery.invoiceDate = {
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

        // If value is comma-separated, treat as array
        if (typeof value === "string" && value.includes(",")) {
          filterQuery[key] = {
            $in: value.split(",").map((v) => v.trim()),
          };
        } else if (typeof value === "string") {
          // Exact match for dropdown columns
          if (
            ["paymentStatus", "paymentMethod", "placeOfSupply"].includes(key)
          ) {
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
          if (baseKey === "invoiceDateFormatted") baseKey = "invoiceDate";
          if (baseKey === "paymentDateFormatted") baseKey = "paymentDate";

          if (!dateRanges[baseKey]) dateRanges[baseKey] = {};

          const dateParts = value.split("-");
          if (dateParts.length === 3) {
            // For paymentDate and invoiceDate (string fields), use string comparison (YYYY-MM-DD)
            if (baseKey === "paymentDate" || baseKey === "invoiceDate") {
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
          { clientName: { $regex: search, $options: "i" } },
          { businessName: { $regex: search, $options: "i" } },
          { placeOfSupply: { $regex: search, $options: "i" } },
          { paymentMethod: { $regex: search, $options: "i" } },
          { clientId: { $regex: search, $options: "i" } },
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
      const totalRecords = await invoicesCollection.countDocuments(filterQuery);

      // Get paginated results
      const invoices = await invoicesCollection
        .find(filterQuery)
        .sort(sortObject)
        .skip(skip)
        .limit(limitNum)
        .toArray();

      // Get clients for reference
      const clients = await clientsCollection
        .find({ isDeleted: { $ne: true } })
        .toArray();

      // Get distinct values for dynamic filter options

      // Get distinct placeOfSupply values for dynamic filter options
      const placeOfSupplyValues = await invoicesCollection.distinct(
        "placeOfSupply",
        { isDeleted: { $ne: true }, placeOfSupply: { $exists: true, $ne: "" } },
      );

      const paymentStatusValues = await invoicesCollection.distinct(
        "paymentStatus",
        { isDeleted: { $ne: true }, paymentStatus: { $exists: true, $ne: "" } },
      );

      const paymentMethodValues = await invoicesCollection.distinct(
        "paymentMethod",
        { isDeleted: { $ne: true }, paymentMethod: { $exists: true, $ne: "" } },
      );

      // Get statistics for dashboard cards
      const totalRecordsCount = await invoicesCollection.countDocuments({
        isDeleted: { $ne: true },
      });

      const paidCount = await invoicesCollection.countDocuments({
        isDeleted: { $ne: true },
        paymentStatus: "Paid",
      });

      const unpaidCount = await invoicesCollection.countDocuments({
        isDeleted: { $ne: true },
        paymentStatus: "Unpaid",
      });

      const partialCount = await invoicesCollection.countDocuments({
        isDeleted: { $ne: true },
        paymentStatus: "Partial",
      });

      // Calculate total amount
      const allInvoices = await invoicesCollection
        .find({ isDeleted: { $ne: true } })
        .toArray();

      const totalAmount = allInvoices.reduce(
        (sum, p) => sum + (p.taxData?.totalAmount || 0),
        0,
      );

      const paidAmount = allInvoices
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
          data: invoices,
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
            placeOfSupply: ["All", ...placeOfSupplyValues.sort()],
            paymentStatus: ["All", ...paymentStatusValues.sort()],
            paymentMethod: ["All", ...paymentMethodValues.sort()],
          },
          clients: clients.map((c) => ({
            id: c._id,
            clientName: c.clientName,
            businessName: c.businessName,
            clientId: c.clientId,
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

    // POST - Create new invoice
    if (event.httpMethod === "POST") {
      const invoiceData = JSON.parse(event.body || "{}");

      const defaultYear = await yearsCollection.findOne({
        isDeleted: { $ne: true },
        isDefault: true,
      });

      if (!invoiceData.invoiceNumber) {
        const invoiceFormat =
          invoiceData.invoiceFormat || defaultYear?.invoiceFormat || "";

        if (!invoiceFormat) {
          return createResponse(
            400,
            {
              error:
                "Invoice number is required. Default financial year invoice format not found.",
            },
            origin,
          );
        }

        invoiceData.invoiceNumber = await getNextInvoiceNumber(invoiceFormat);
      }

      if (!invoiceData.financialYear && defaultYear?.financialYear) {
        invoiceData.financialYear = defaultYear.financialYear;
      }

      // Check for duplicate invoice number (including soft-deleted records)
      const existingInvoice = await invoicesCollection.findOne({
        invoiceNumber: invoiceData.invoiceNumber,
      });

      if (existingInvoice && !existingInvoice.isDeleted) {
        return createResponse(
          409,
          { error: "Invoice number already exists" },
          origin,
        );
      }

      const result = await invoicesCollection.insertOne({
        _id: new ObjectId(),
        ...invoiceData,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      return createResponse(
        201,
        {
          message: "Invoice created successfully",
          id: result.insertedId,
        },
        origin,
      );
    }

    // PUT - Update existing invoice
    if (event.httpMethod === "PUT") {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(400, { error: "Invoice ID is required" }, origin);
      }

      if (!ObjectId.isValid(id)) {
        return createResponse(400, { error: "Invalid invoice ID" }, origin);
      }

      const invoiceData = JSON.parse(event.body);
      const invoiceObjectId = new ObjectId(id);

      // Check for duplicate invoice number (excluding current record)
      if (invoiceData.invoiceNumber) {
        const existingInvoice = await invoicesCollection.findOne({
          _id: { $ne: invoiceObjectId },
          invoiceNumber: invoiceData.invoiceNumber,
        });

        if (existingInvoice) {
          return createResponse(
            409,
            { error: "Invoice number already exists" },
            origin,
          );
        }
      }

      const result = await invoicesCollection.updateOne(
        { _id: invoiceObjectId, isDeleted: { $ne: true } },
        {
          $set: {
            ...invoiceData,
            updatedAt: new Date(),
          },
        },
      );

      if (result.matchedCount === 0) {
        return createResponse(404, { error: "Invoice not found" }, origin);
      }

      return createResponse(
        200,
        { message: "Invoice updated successfully" },
        origin,
      );
    }

    // DELETE - Soft delete invoice
    if (event.httpMethod === "DELETE") {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(400, { error: "Invoice ID is required" }, origin);
      }

      if (!ObjectId.isValid(id)) {
        return createResponse(400, { error: "Invalid invoice ID" }, origin);
      }

      const result = await invoicesCollection.updateOne(
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
        return createResponse(404, { error: "Invoice not found" }, origin);
      }

      return createResponse(
        200,
        { message: "Invoice deleted successfully" },
        origin,
      );
    }

    return createResponse(405, { error: "Method not allowed" }, origin);
  } catch (error) {
    console.error("Invoice API Error:", error);

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
