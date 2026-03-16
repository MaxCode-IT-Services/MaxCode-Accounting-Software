import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { ObjectId } from "mongodb";
import { verifyRequestToken } from "./utils/auth.js";

/**
 * Books of Accounts API
 * Provides combined ledger data from multiple collections with pagination
 * Requires JWT authentication
 */
export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin;

  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return createResponse(200, {}, origin);
  }

  try {
    // Verify JWT token
    const user = verifyRequestToken(event);

    const { db } = await connectToDatabase();
    const salesCollection = db.collection("invoices");
    const purchasesCollection = db.collection("purchases");
    const companyExpensesCollection = db.collection("company_expenses");
    const rcmCollection = db.collection("rcm");
    const projectsCollection = db.collection("projects");
    const yearsCollection = db.collection("financialYears");

    const escapeRegExp = (value) => {
      return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    };

    const toNumber = (value) => {
      const num = parseFloat(value);
      return Number.isNaN(num) ? 0 : num;
    };

    const getTaxAmount = (record) => {
      const taxData = record?.taxData || {};
      const cgst = toNumber(taxData.cgst || 0);
      const sgst = toNumber(taxData.sgst || 0);
      const igst = toNumber(taxData.igst || 0);
      const explicitTax = cgst + sgst + igst;

      if (explicitTax > 0) return explicitTax;

      const totalAmount = toNumber(taxData.totalAmount || 0);
      const taxableAmount = toNumber(
        taxData.taxableAmount || taxData.subtotal || 0,
      );
      return Math.max(totalAmount - taxableAmount, 0);
    };

    const getOpeningBalance = (yearRecord, keys) => {
      if (!yearRecord) return 0;

      const value = keys.reduce((found, key) => {
        if (found !== null) return found;
        const candidate = yearRecord?.[key];
        return candidate !== undefined && candidate !== null ? candidate : null;
      }, null);

      return value !== null ? toNumber(value) : 0;
    };

    // GET - Fetch paginated ledger data
    if (event.httpMethod === "GET") {
      const params = event.queryStringParameters || {};
      const {
        page = 1,
        limit = 10,
        search,
        financialYear,
        period,
        recordType,
        date_start,
        date_end,
        sortBy = "invoiceDate",
        sortOrder = "desc",
      } = params;

      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      // Build date range filter
      let dateFilter = {};
      if (date_start || date_end) {
        dateFilter = {};
        if (date_start) {
          dateFilter.$gte = date_start;
        }
        if (date_end) {
          dateFilter.$lte = date_end;
        }
      }

      // Get financial year range if selected
      let yearStartDate = null;
      let yearEndDate = null;
      if (financialYear && financialYear !== "ALL") {
        const yearRecord = await yearsCollection.findOne({
          financialYear: financialYear,
          isDeleted: { $ne: true },
        });
        if (yearRecord?.startDate && yearRecord?.endDate) {
          yearStartDate = yearRecord.startDate;
          yearEndDate = yearRecord.endDate;
        }
      }

      // Period filter
      let periodStartDate = null;
      let periodEndDate = null;
      if (period && period !== "yearly") {
        const today = new Date();

        if (period === "daily") {
          const start = new Date(today.setHours(0, 0, 0, 0));
          const end = new Date(today.setHours(23, 59, 59, 999));
          periodStartDate = start.toISOString().split("T")[0];
          periodEndDate = end.toISOString().split("T")[0];
        } else if (period === "monthly") {
          const start = new Date(today.getFullYear(), today.getMonth(), 1);
          const end = new Date(
            today.getFullYear(),
            today.getMonth() + 1,
            0,
            23,
            59,
            59,
            999,
          );
          periodStartDate = start.toISOString().split("T")[0];
          periodEndDate = end.toISOString().split("T")[0];
        } else if (period === "quarterly") {
          const quarter = Math.floor(today.getMonth() / 3);
          const start = new Date(today.getFullYear(), quarter * 3, 1);
          const end = new Date(
            today.getFullYear(),
            (quarter + 1) * 3,
            0,
            23,
            59,
            59,
            999,
          );
          periodStartDate = start.toISOString().split("T")[0];
          periodEndDate = end.toISOString().split("T")[0];
        } else if (period === "halfYearly") {
          const half = today.getMonth() < 6 ? 0 : 6;
          const start = new Date(today.getFullYear(), half, 1);
          const end = new Date(
            today.getFullYear(),
            half + 6,
            0,
            23,
            59,
            59,
            999,
          );
          periodStartDate = start.toISOString().split("T")[0];
          periodEndDate = end.toISOString().split("T")[0];
        }
      }

      // Build search query for source collections (base pre-filter)
      let searchQuery = {};
      if (search) {
        const searchRegex = { $regex: escapeRegExp(search), $options: "i" };
        searchQuery = {
          $or: [
            { invoiceNumber: searchRegex },
            { expenseNumber: searchRegex },
            { selfInvoiceNumber: searchRegex },
            { businessName: searchRegex },
            { partyName: searchRegex },
            { vendorName: searchRegex },
            { serviceProviderBusinessName: searchRegex },
            { staffName: searchRegex },
            { projectName: searchRegex },
          ],
        };
      }

      // Fetch data from all collections
      const allRecords = [];

      // Helper function to fetch from a collection
      const fetchFromCollection = async (
        collection,
        type,
        mapFn,
        baseQuery = {},
      ) => {
        let query = {
          isDeleted: { $ne: true },
          ...baseQuery,
          ...searchQuery,
        };

        // Apply date filters
        const dateField =
          type === "Company Expense" ? "expenseDate" : "invoiceDate";

        if (yearStartDate || yearEndDate || periodStartDate || periodEndDate) {
          query[dateField] = query[dateField] || {};
          if (yearStartDate) query[dateField].$gte = yearStartDate;
          if (yearEndDate) query[dateField].$lte = yearEndDate;
          if (periodStartDate) query[dateField].$gte = periodStartDate;
          if (periodEndDate) query[dateField].$lte = periodEndDate;
        }

        // Apply date range filter
        if (Object.keys(dateFilter).length > 0) {
          query[dateField] = { ...query[dateField], ...dateFilter };
        }

        // Apply record type filter
        if (recordType && recordType !== "all") {
          if (type === "Sales" && recordType !== "sales") return [];
          if (type === "Purchase" && recordType !== "purchase") return [];
          if (type === "Company Expense" && recordType !== "companyExpense")
            return [];
          if (type === "RCM" && recordType !== "rcm") return [];
        }

        const records = await collection.find(query).toArray();
        return records.map(mapFn);
      };

      // Fetch Sales
      if (!recordType || recordType === "all" || recordType === "sales") {
        const salesRecords = await fetchFromCollection(
          salesCollection,
          "Sales",
          (record) => ({
            id: record._id,
            sourceType: "sales",
            recordType: "Sales",
            invoiceNumber: record.invoiceNumber,
            businessName: record.businessName,
            gstin: record.gstin,
            invoiceDate: record.invoiceDate,
            paymentMethod: record.paymentMethod,
            paymentStatus: record.paymentStatus,
            taxData: record.taxData,
            amount: record.amount,
            amountReceived: record.amountReceived,
          }),
        );
        allRecords.push(...salesRecords);
      }

      // Fetch Purchases
      if (!recordType || recordType === "all" || recordType === "purchase") {
        const purchaseRecords = await fetchFromCollection(
          purchasesCollection,
          "Purchase",
          (record) => ({
            id: record._id,
            sourceType: "purchase",
            recordType: "Purchase",
            invoiceNumber: record.invoiceNumber,
            businessName: record.businessName,
            gstin: record.gstin,
            invoiceDate: record.invoiceDate,
            paymentMethod: record.paymentMethod,
            paymentStatus: record.paymentStatus,
            taxData: record.taxData,
            amount: record.amount,
            amountPaid: record.amountPaid,
          }),
        );
        allRecords.push(...purchaseRecords);
      }

      // Fetch Company Expenses
      if (
        !recordType ||
        recordType === "all" ||
        recordType === "companyExpense"
      ) {
        const expenseRecords = await fetchFromCollection(
          companyExpensesCollection,
          "Company Expense",
          (record) => ({
            id: record._id,
            sourceType: "companyExpense",
            recordType: "Company Expense",
            expenseNumber: record.expenseNumber,
            partyName: record.partyName,
            businessName: record.businessName,
            gstin: record.gstin,
            invoiceDate: record.expenseDate,
            paymentMethod: record.paymentMethod,
            paymentStatus: record.paymentStatus,
            taxData: record.taxData,
            amount: record.amount,
            amountReceived: record.amountReceived,
          }),
        );
        allRecords.push(...expenseRecords);
      }

      // Fetch RCM
      if (!recordType || recordType === "all" || recordType === "rcm") {
        const rcmRecords = await fetchFromCollection(
          rcmCollection,
          "RCM",
          (record) => ({
            id: record._id,
            sourceType: "rcm",
            recordType: "RCM",
            selfInvoiceNumber: record.selfInvoiceNumber,
            originalRefNo: record.originalRefNo,
            serviceProviderBusinessName: record.serviceProviderBusinessName,
            gstin: record.gstin,
            invoiceDate: record.invoiceDate,
            paymentMethod: record.paymentMethod,
            paymentStatus: record.paymentStatus,
            taxData: record.taxData,
            amount: record.amount,
            amountPaid: record.amountPaid,
          }),
        );
        allRecords.push(...rcmRecords);
      }

      // Fetch Projects (Developer Payouts)
      if (!recordType || recordType === "all" || recordType === "project") {
        let projectQuery = { isDeleted: { $ne: true }, ...searchQuery };

        if (yearStartDate || yearEndDate || periodStartDate || periodEndDate) {
          projectQuery.projectDate = projectQuery.projectDate || {};
          if (yearStartDate) projectQuery.projectDate.$gte = yearStartDate;
          if (yearEndDate) projectQuery.projectDate.$lte = yearEndDate;
          if (periodStartDate) projectQuery.projectDate.$gte = periodStartDate;
          if (periodEndDate) projectQuery.projectDate.$lte = periodEndDate;
        }

        if (Object.keys(dateFilter).length > 0) {
          projectQuery.projectDate = {
            ...projectQuery.projectDate,
            ...dateFilter,
          };
        }

        const projects = await projectsCollection.find(projectQuery).toArray();

        projects.forEach((project) => {
          const transactions = Array.isArray(project.developerTransactions)
            ? project.developerTransactions
            : [];

          transactions.forEach((transaction, index) => {
            const payoutAmount = toNumber(transaction.payoutAmount || 0);
            const payoutDate =
              transaction.payoutDate ||
              transaction.paymentDate ||
              project.projectDate ||
              project.createdDate ||
              "";

            allRecords.push({
              id: `${project._id}-${transaction.id || index}`,
              sourceType: "project",
              recordType: "Developer Payout",
              invoiceNumber: project.projectId || `PRJ-${project._id}`,
              businessName: transaction.staffName || project.projectName,
              gstin: "-",
              invoiceDate: payoutDate,
              paymentMethod: transaction.payoutMethod || "Bank Transfer",
              paymentStatus: "Paid",
              taxData: {
                taxableAmount: payoutAmount,
                subtotal: payoutAmount,
                totalAmount: payoutAmount,
                cgst: 0,
                sgst: 0,
                igst: 0,
                taxPercentage: 0,
              },
              amount: payoutAmount,
              amountPaid: payoutAmount,
            });
          });
        });
      }

      const getComparableFieldValue = (record, key) => {
        switch (key) {
          case "type":
            return record.recordType || "";
          case "paymentMode":
            return record.paymentMethod || "";
          case "paid":
            return record.paymentStatus || "";
          case "invoiceNo":
            return (
              record.invoiceNumber ||
              record.expenseNumber ||
              record.selfInvoiceNumber ||
              record.referenceNo ||
              ""
            );
          case "clientSecondary":
            return (
              record.businessName ||
              record.partyName ||
              record.vendorName ||
              record.serviceProviderBusinessName ||
              record.staffName ||
              ""
            );
          case "date":
          case "dateTime":
            return record.invoiceDate || "";
          default:
            return record[key];
        }
      };

      const reservedParamKeys = new Set([
        "page",
        "limit",
        "sortBy",
        "sortOrder",
        "search",
        "financialYear",
        "period",
        "recordType",
      ]);

      const dropdownFilterKeys = new Set([
        "type",
        "paymentMode",
        "paid",
        "gstin",
      ]);

      const customFilterEntries = Object.entries(params).filter(
        ([key, value]) => {
          if (reservedParamKeys.has(key)) return false;
          if (key.endsWith("_start") || key.endsWith("_end")) return false;
          if (
            value === undefined ||
            value === null ||
            value === "" ||
            value === "All"
          ) {
            return false;
          }
          return true;
        },
      );

      let filteredRecords = [...allRecords];

      // Apply robust global search on normalized ledger fields
      if (search) {
        const searchLower = String(search).toLowerCase().trim();
        filteredRecords = filteredRecords.filter((record) => {
          const searchableValues = [
            getComparableFieldValue(record, "invoiceNo"),
            getComparableFieldValue(record, "clientSecondary"),
            getComparableFieldValue(record, "type"),
            getComparableFieldValue(record, "paymentMode"),
            getComparableFieldValue(record, "paid"),
            record.gstin || "",
            record.sourceType || "",
          ];

          return searchableValues.some((value) =>
            String(value || "")
              .toLowerCase()
              .includes(searchLower),
          );
        });
      }

      // Apply dynamic column filters
      customFilterEntries.forEach(([key, rawValue]) => {
        const filterValues = String(rawValue)
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);

        if (filterValues.length === 0) return;

        filteredRecords = filteredRecords.filter((record) => {
          const comparableValue = getComparableFieldValue(record, key);

          if (comparableValue === undefined || comparableValue === null) {
            return false;
          }

          const recordValue = String(comparableValue).toLowerCase();

          if (dropdownFilterKeys.has(key)) {
            return filterValues.some(
              (value) => recordValue === String(value).toLowerCase(),
            );
          }

          return filterValues.some((value) =>
            recordValue.includes(String(value).toLowerCase()),
          );
        });
      });

      // Calculate statistics
      let outputGst = 0;
      let inputGst = 0;
      let rcmTax = 0;

      // Get opening ITC for the financial year
      let openingItcTotal = 0;
      if (financialYear && financialYear !== "ALL") {
        const yearRecord = await yearsCollection.findOne({
          financialYear: financialYear,
          isDeleted: { $ne: true },
        });
        if (yearRecord) {
          const cgst = getOpeningBalance(yearRecord, [
            "openingCgstItc",
            "openingItcCgst",
          ]);
          const sgst = getOpeningBalance(yearRecord, [
            "openingSgstItc",
            "openingItcSgst",
          ]);
          const igst = getOpeningBalance(yearRecord, [
            "openingIgstItc",
            "openingItcIgst",
          ]);
          const extra = getOpeningBalance(yearRecord, [
            "openingItc",
            "openingGstInput",
          ]);
          openingItcTotal = cgst + sgst + igst + extra;
        }
      }

      inputGst += openingItcTotal;

      filteredRecords.forEach((record) => {
        const taxAmount = getTaxAmount(record);

        if (record.sourceType === "sales") {
          outputGst += taxAmount;
        } else if (record.sourceType === "purchase") {
          inputGst += taxAmount;
        } else if (record.sourceType === "rcm") {
          rcmTax += taxAmount;
          inputGst += taxAmount;
          outputGst += taxAmount;
        }
      });

      // Apply sorting
      const sortField = sortBy || "invoiceDate";
      const sortMultiplier = sortOrder === "asc" ? 1 : -1;

      filteredRecords.sort((a, b) => {
        let valA = getComparableFieldValue(a, sortField);
        let valB = getComparableFieldValue(b, sortField);

        if (
          sortField === "invoiceDate" ||
          sortField === "date" ||
          sortField === "dateTime"
        ) {
          valA = new Date(valA || 0).getTime();
          valB = new Date(valB || 0).getTime();
        } else if (typeof valA === "string" && typeof valB === "string") {
          valA = valA.toLowerCase();
          valB = valB.toLowerCase();
        }

        if (valA < valB) return -1 * sortMultiplier;
        if (valA > valB) return 1 * sortMultiplier;
        return 0;
      });

      // Get distinct filter options
      const types = [...new Set(allRecords.map((r) => r.recordType))]
        .filter(Boolean)
        .sort();
      const paymentModes = [
        ...new Set(
          allRecords
            .map((r) => r.paymentMethod)
            .filter((m) => m && m !== "" && m !== "-"),
        ),
      ].sort();
      const paidStatuses = [
        ...new Set(
          allRecords
            .map((r) => r.paymentStatus)
            .filter((status) => status && status !== ""),
        ),
      ].sort();
      const gstins = [
        ...new Set(
          allRecords
            .map((r) => r.gstin)
            .filter((gstin) => gstin && gstin !== "" && gstin !== "-"),
        ),
      ].sort();

      // Paginate
      const paginatedRecords = filteredRecords.slice(skip, skip + limitNum);

      return createResponse(
        200,
        {
          data: paginatedRecords,
          pagination: {
            page: pageNum,
            limit: limitNum,
            totalRecords: filteredRecords.length,
            totalPages: Math.ceil(filteredRecords.length / limitNum),
          },
          statistics: {
            outputGst,
            inputGst,
            rcmTax,
            totalPayable: outputGst - inputGst,
          },
          filterOptions: {
            type: types,
            paymentMode: paymentModes,
            paid: paidStatuses,
            gstin: gstins,
          },
        },
        origin,
      );
    }

    return createResponse(405, { error: "Method not allowed" }, origin);
  } catch (error) {
    console.error("Books of Accounts API Error:", error);

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
