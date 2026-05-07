import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { ObjectId } from "mongodb";
import { verifyRequestToken, getAuditFieldsFromEvent } from "./utils/auth.js";
import { decryptSecretFromStorage } from "./utils/secret-crypto.js";
import { normalizePaymentMethodsInRecord } from "./utils/payment-methods.js";
import { syncTransactionSnapshot } from "./utils/transactions.js";

const normalizeCloudflareSettings = (settings = {}) => {
  if (!settings || typeof settings !== "object") return null;

  const normalizeUrl = (value = "") => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return "";
    if (/^https?:\/\//i.test(trimmed)) {
      return trimmed.replace(/\/+$/, "");
    }
    return `https://${trimmed}`.replace(/\/+$/, "");
  };

  return {
    storeUrl: normalizeUrl(settings.storeUrl),
    publicDomain: normalizeUrl(settings.publicDomain),
    password: String(settings.password || "").trim(),
  };
};

const getCloudflareSettingsFromDatabase = async (db) => {
  try {
    const settingsCollection = db.collection("business_settings");
    const globalSettings = await settingsCollection.findOne({
      scope: "global",
    });
    const latestSettings = globalSettings
      ? null
      : await settingsCollection.findOne(
          {},
          { sort: { updatedAt: -1, createdAt: -1, _id: -1 } },
        );

    const source = globalSettings || latestSettings || {};
    const nestedSettings =
      source.cloudflareSettings ||
      source.r2Settings ||
      source.cloudStorageSettings ||
      {};

    const decryptOrEmpty = (value = "") => {
      const normalized = String(value || "").trim();
      if (!normalized || normalized === "********") return "";
      try {
        return decryptSecretFromStorage(normalized);
      } catch {
        return "";
      }
    };

    return normalizeCloudflareSettings({
      ...nestedSettings,
      storeUrl: decryptOrEmpty(source.storeUrl || nestedSettings.storeUrl),
      publicDomain: decryptOrEmpty(
        source.publicDomain || nestedSettings.publicDomain,
      ),
      password: decryptOrEmpty(source.password || nestedSettings.password),
    });
  } catch {
    return null;
  }
};

const sanitizeIdentifier = (value = "") =>
  String(value || "")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "record";

const getExtensionFromUpload = (fileName = "", mimeType = "") => {
  const sourceName = String(fileName || "");
  const nameParts = sourceName.split(".");
  if (nameParts.length > 1) {
    const fromName = String(nameParts.pop() || "")
      .trim()
      .toLowerCase();
    if (fromName) return fromName;
  }

  const normalizedType = String(mimeType || "").toLowerCase();
  if (normalizedType === "application/pdf") return "pdf";
  if (normalizedType === "image/jpeg" || normalizedType === "image/jpg")
    return "jpg";
  if (normalizedType === "image/png") return "png";
  if (normalizedType === "image/webp") return "webp";
  if (normalizedType === "image/gif") return "gif";
  return "pdf";
};

const getExtensionFromPath = (path = "") => {
  const cleanedPath = String(path || "")
    .split("?")[0]
    .split("#")[0];
  const pathParts = cleanedPath.split("/");
  const lastSegment = String(pathParts.pop() || "");
  const nameParts = lastSegment.split(".");
  if (nameParts.length > 1) {
    return String(nameParts.pop() || "")
      .trim()
      .toLowerCase();
  }
  return "";
};

const parseDateValue = (value) => {
  if (!value) return null;
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct;

  const raw = String(value || "").trim();
  const ddMmYyyyMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddMmYyyyMatch) {
    const parsed = new Date(
      Number(ddMmYyyyMatch[3]),
      Number(ddMmYyyyMatch[2]) - 1,
      Number(ddMmYyyyMatch[1]),
    );
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
};

const getFinancialYearLabel = (dateValue) => {
  const parsedDate = parseDateValue(dateValue) || new Date();
  const year = parsedDate.getFullYear();
  const month = parsedDate.getMonth() + 1;
  const startYear = month >= 4 ? year : year - 1;
  const endYearShort = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}-${endYearShort}`;
};

const buildPublicUrl = (publicDomain, path) => {
  const cleanedPath = String(path || "").replace(/^\/+/, "");
  if (publicDomain) {
    return `${publicDomain}/${cleanedPath}`;
  }
  return "";
};

const uploadToCloudflareStore = async ({
  storeUrl,
  publicDomain,
  password,
  objectPath,
  mimeType,
  fileBuffer,
}) => {
  const cleanedStoreUrl = String(storeUrl || "").replace(/\/+$/, "");
  const cleanedPath = String(objectPath || "").replace(/^\/+/, "");
  const putUrl = `${cleanedStoreUrl}/${cleanedPath}`;

  const headers = {
    "Content-Type": mimeType || "application/octet-stream",
    "x-upload-password": password,
    "x-api-key": password,
    "x-password": password,
    Authorization: `Bearer ${password}`,
  };

  const putResponse = await fetch(putUrl, {
    method: "PUT",
    headers,
    body: fileBuffer,
  });

  if (putResponse.ok) {
    let responseUrl = "";
    try {
      const putJson = await putResponse.clone().json();
      responseUrl =
        putJson?.url ||
        putJson?.fileUrl ||
        putJson?.data?.url ||
        putJson?.result?.url ||
        "";
    } catch {
      // Ignore non-JSON responses.
    }

    return {
      fileUrl:
        responseUrl || buildPublicUrl(publicDomain, cleanedPath) || putUrl,
      filePath: cleanedPath,
    };
  }

  const responseBody = await putResponse.text().catch(() => "");
  throw new Error(
    `Cloudflare upload failed: ${putResponse.status} ${responseBody || ""}`,
  );
};

const deleteFromCloudflareStore = async ({
  storeUrl,
  password,
  objectPath,
}) => {
  const cleanedStoreUrl = String(storeUrl || "").replace(/\/+$/, "");
  const cleanedPath = String(objectPath || "").replace(/^\/+/, "");
  if (!cleanedStoreUrl || !cleanedPath) {
    throw new Error("Cloudflare delete path not available");
  }

  const commonHeaders = {
    "x-upload-password": password,
    "x-api-key": password,
    "x-password": password,
    Authorization: `Bearer ${password}`,
  };

  const deleteResponse = await fetch(`${cleanedStoreUrl}/${cleanedPath}`, {
    method: "DELETE",
    headers: commonHeaders,
  });

  if (deleteResponse.ok) return;

  const fallbackResponse = await fetch(cleanedStoreUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...commonHeaders,
    },
    body: JSON.stringify({
      action: "delete",
      password,
      path: cleanedPath,
      filePath: cleanedPath,
    }),
  });

  if (!fallbackResponse.ok) {
    const first = await deleteResponse.text().catch(() => "");
    const second = await fallbackResponse.text().catch(() => "");
    throw new Error(
      `Cloudflare delete failed. DELETE: ${deleteResponse.status} ${first || ""}; POST: ${fallbackResponse.status} ${second || ""}`,
    );
  }
};

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

    const buildFallbackExpenseFormat = (financialYearValue) => {
      const token = getFinancialYearToken(financialYearValue);
      if (!token) return "";
      return `MC/CEXP/${token}/0001`;
    };

    const resolveExpenseNumberContext = async (requestedFinancialYear) => {
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
        String(yearRecord?.companyExpenseFormat || "").trim() ||
        buildFallbackExpenseFormat(financialYear);

      return {
        financialYear,
        format,
      };
    };

    const getNextExpenseNumber = async ({ format, financialYear }) => {
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
        expenseNumber: { $regex: pattern },
        isDeleted: { $ne: true },
      };

      if (financialYear) {
        query.financialYear = String(financialYear).trim();
      }

      const existingExpenses = await expensesCollection
        .find(query, { projection: { expenseNumber: 1 } })
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

      const nextNumber = Math.max(seedNumber, maxNumber + 1);
      return `${prefix}${String(nextNumber).padStart(width, "0")}`;
    };

    // GET - Fetch all expenses or specific expense by ID with pagination support
    if (event.httpMethod === "GET") {
      const {
        action,
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

      if (action === "next-number") {
        const { financialYear, format } = await resolveExpenseNumberContext(
          event.queryStringParameters?.financialYear,
        );

        const nextNumber = await getNextExpenseNumber({
          format,
          financialYear,
        });

        if (!nextNumber) {
          return createResponse(
            400,
            {
              error:
                "Could not generate expense number. Please configure financial year format first.",
            },
            origin,
          );
        }

        return createResponse(
          200,
          {
            nextNumber,
            expenseNumber: nextNumber,
            financialYear,
            format,
          },
          origin,
        );
      }

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
      const expenseData = normalizePaymentMethodsInRecord(
        JSON.parse(event.body || "{}"),
      );

      const { financialYear, format } = await resolveExpenseNumberContext(
        expenseData.financialYear,
      );

      if (!expenseData.financialYear && financialYear) {
        expenseData.financialYear = financialYear;
      }

      if (!expenseData.financialYear) {
        return createResponse(
          400,
          {
            error:
              "Financial year is required. Default financial year not found.",
          },
          origin,
        );
      }

      if (!expenseData.expenseNumber) {
        expenseData.expenseNumber = await getNextExpenseNumber({
          format,
          financialYear: expenseData.financialYear,
        });

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
        ...getAuditFieldsFromEvent(event, "create"),
      };

      if (expenseData?.expenseUpload?.fileDataBase64) {
        const cloudflareSettings = await getCloudflareSettingsFromDatabase(db);
        if (!cloudflareSettings?.storeUrl || !cloudflareSettings?.password) {
          return createResponse(
            400,
            {
              error:
                "Cloudflare settings missing. Configure Cloudflare before uploading expense document.",
            },
            origin,
          );
        }

        const expenseUpload = expenseData.expenseUpload;
        const extension = getExtensionFromUpload(
          expenseUpload.fileName,
          expenseUpload.fileType,
        );
        const fileName = `${sanitizeIdentifier(expenseData.expenseNumber)}.${extension}`;
        const objectPath = `Company Expense/${getFinancialYearLabel(expenseData.expenseDate)}/${fileName}`;
        const fileBuffer = Buffer.from(
          String(expenseUpload.fileDataBase64 || ""),
          "base64",
        );

        if (!fileBuffer.length) {
          return createResponse(
            400,
            { error: "Invalid expense file data" },
            origin,
          );
        }

        const uploadResult = await uploadToCloudflareStore({
          storeUrl: cloudflareSettings.storeUrl,
          publicDomain: cloudflareSettings.publicDomain,
          password: cloudflareSettings.password,
          objectPath,
          mimeType: expenseUpload.fileType || "application/octet-stream",
          fileBuffer,
        });

        normalizedExpense.expenseFileURL = uploadResult.fileUrl;
        normalizedExpense.expenseFilePath = uploadResult.filePath;
        normalizedExpense.expenseFileName = fileName;
        normalizedExpense.expenseFileType =
          expenseUpload.fileType || "application/octet-stream";
      }

      delete normalizedExpense.expenseUpload;

      const result = await expensesCollection.insertOne(normalizedExpense);

      await syncTransactionSnapshot({
        db,
        sourceCollection: "company_expenses",
        sourceType: "expense",
        sourceRecord: normalizedExpense,
        sourceLabel: normalizedExpense.expenseNumber || "",
      });

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

      const expenseData = normalizePaymentMethodsInRecord(
        JSON.parse(event.body),
      );
      const expenseObjectId = new ObjectId(id);

      const existingExpenseRecord = await expensesCollection.findOne({
        _id: expenseObjectId,
        isDeleted: { $ne: true },
      });

      if (!existingExpenseRecord) {
        return createResponse(404, { error: "Expense not found" }, origin);
      }

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

      if (expenseData?.expenseUpload?.fileDataBase64) {
        const cloudflareSettings = await getCloudflareSettingsFromDatabase(db);
        if (!cloudflareSettings?.storeUrl || !cloudflareSettings?.password) {
          return createResponse(
            400,
            {
              error:
                "Cloudflare settings missing. Configure Cloudflare before uploading expense document.",
            },
            origin,
          );
        }

        const expenseUpload = expenseData.expenseUpload;
        const fileBuffer = Buffer.from(
          String(expenseUpload.fileDataBase64 || ""),
          "base64",
        );

        if (!fileBuffer.length) {
          return createResponse(
            400,
            { error: "Invalid expense file data" },
            origin,
          );
        }

        const existingPath = existingExpenseRecord.expenseFilePath;
        const extension =
          getExtensionFromPath(existingPath) ||
          getExtensionFromUpload(
            expenseUpload.fileName,
            expenseUpload.fileType,
          );
        const fileName = `${sanitizeIdentifier(expenseData.expenseNumber || existingExpenseRecord.expenseNumber)}.${extension}`;
        const objectPath =
          existingPath ||
          `Company Expense/${getFinancialYearLabel(expenseData.expenseDate || existingExpenseRecord.expenseDate)}/${fileName}`;

        const uploadResult = await uploadToCloudflareStore({
          storeUrl: cloudflareSettings.storeUrl,
          publicDomain: cloudflareSettings.publicDomain,
          password: cloudflareSettings.password,
          objectPath,
          mimeType: expenseUpload.fileType || "application/octet-stream",
          fileBuffer,
        });

        expenseData.expenseFileURL = uploadResult.fileUrl;
        expenseData.expenseFilePath = uploadResult.filePath;
        expenseData.expenseFileName = fileName;
        expenseData.expenseFileType =
          expenseUpload.fileType || "application/octet-stream";
      }

      delete expenseData.expenseUpload;

      const updatedExpenseRecord = {
        ...existingExpenseRecord,
        ...expenseData,
        _id: expenseObjectId,
        updatedAt: new Date(),
        ...getAuditFieldsFromEvent(event, "update"),
      };

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
            ...getAuditFieldsFromEvent(event, "update"),
          },
        },
      );

      if (result.matchedCount === 0) {
        return createResponse(404, { error: "Expense not found" }, origin);
      }

      await syncTransactionSnapshot({
        db,
        sourceCollection: "company_expenses",
        sourceType: "expense",
        sourceRecord: updatedExpenseRecord,
        sourceLabel: updatedExpenseRecord.expenseNumber || "",
      });

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

      const expenseObjectId = new ObjectId(id);
      const existingExpenseRecord = await expensesCollection.findOne({
        _id: expenseObjectId,
        isDeleted: { $ne: true },
      });

      if (!existingExpenseRecord) {
        return createResponse(404, { error: "Expense not found" }, origin);
      }

      if (existingExpenseRecord.expenseFilePath) {
        const cloudflareSettings = await getCloudflareSettingsFromDatabase(db);
        if (!cloudflareSettings?.storeUrl || !cloudflareSettings?.password) {
          return createResponse(
            400,
            {
              error:
                "Cloudflare settings missing. Unable to delete expense uploaded file.",
            },
            origin,
          );
        }

        await deleteFromCloudflareStore({
          storeUrl: cloudflareSettings.storeUrl,
          password: cloudflareSettings.password,
          objectPath: existingExpenseRecord.expenseFilePath,
        });
      }

      await syncTransactionSnapshot({
        db,
        sourceCollection: "company_expenses",
        sourceType: "expense",
        sourceRecord: existingExpenseRecord,
        sourceLabel: existingExpenseRecord.expenseNumber || "",
        deleted: true,
      });

      const result = await expensesCollection.updateOne(
        { _id: expenseObjectId, isDeleted: { $ne: true } },
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
