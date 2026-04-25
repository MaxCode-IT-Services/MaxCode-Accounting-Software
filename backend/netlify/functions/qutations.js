import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { ObjectId } from "mongodb";
import { verifyRequestToken, getAuditFieldsFromEvent } from "./utils/auth.js";
import { decryptSecretFromStorage } from "./utils/secret-crypto.js";
import {
  applyTermsBindingToDocument,
  getTermsBindingFromDatabase,
} from "./utils/terms-versioning.js";

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

const normalizeIncomingQutationData = (qutationData = {}) => {
  const normalizedData = { ...qutationData };

  if (!normalizedData.qutationExpiryDate && normalizedData.qutationValidity) {
    normalizedData.qutationExpiryDate = normalizedData.qutationValidity;
  }

  delete normalizedData.qutationValidity;
  delete normalizedData.agreementGoogleDriveLink;

  return normalizedData;
};

const normalizeOutgoingQutationData = (qutationData = {}) => {
  const normalizedData = { ...qutationData };

  if (!normalizedData.qutationExpiryDate && normalizedData.qutationValidity) {
    normalizedData.qutationExpiryDate = normalizedData.qutationValidity;
  }

  delete normalizedData.agreementGoogleDriveLink;

  return normalizedData;
};

/**
 * Qutation Management API
 * Handles CRUD operations for qutations with pagination support
 * Requires JWT authentication
 */
export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === "OPTIONS") {
    return createResponse(200, {}, origin);
  }

  try {
    verifyRequestToken(event);

    const { db } = await connectToDatabase();
    const qutationsCollection = db.collection("qutations");
    const yearsCollection = db.collection("financialYears");
    let performaTermsBindingPromise = null;

    const getPerformaTermsBinding = async () => {
      if (!performaTermsBindingPromise) {
        performaTermsBindingPromise = getTermsBindingFromDatabase(
          db,
          "performaInvoice",
        );
      }
      return performaTermsBindingPromise;
    };

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

    const buildFallbackQutationFormat = (financialYearValue) => {
      const token = getFinancialYearToken(financialYearValue);
      if (!token) return "";
      return `MC/QTN/${token}/0001`;
    };

    const getNextFromFormat = async ({ format, financialYear }) => {
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
        qutationNumber: { $regex: pattern },
        isDeleted: { $ne: true },
      };

      if (financialYear) {
        query.financialYear = String(financialYear).trim();
      }

      const existingQutations = await qutationsCollection
        .find(query, { projection: { qutationNumber: 1 } })
        .toArray();

      let maxNumber = 0;
      existingQutations.forEach((qutation) => {
        const qutationNumber = String(qutation?.qutationNumber || "");
        const qutationMatch = qutationNumber.match(pattern);
        if (!qutationMatch) return;
        const current = parseInt(qutationMatch[1], 10);
        if (!Number.isNaN(current) && current > maxNumber) {
          maxNumber = current;
        }
      });

      const nextNumber = Math.max(seedNumber, maxNumber + 1);
      return `${prefix}${String(nextNumber).padStart(width, "0")}`;
    };

    const resolveQutationNumberContext = async (requestedFinancialYear) => {
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

      const resolvedFinancialYear =
        normalizedRequestedFinancialYear ||
        String(yearRecord?.financialYear || "").trim();

      const format =
        String(yearRecord?.qutationFormat || "").trim() ||
        buildFallbackQutationFormat(resolvedFinancialYear);

      return {
        financialYear: resolvedFinancialYear,
        format,
      };
    };

    if (event.httpMethod === "GET") {
      const {
        action,
        id,
        page = 1,
        limit = 10,
        search,
        sortBy = "createdAt",
        sortOrder = "desc",
        filter,
      } = event.queryStringParameters || {};

      if (action === "next-number") {
        const { financialYear, format } = await resolveQutationNumberContext(
          event.queryStringParameters?.financialYear,
        );

        const nextNumber = await getNextFromFormat({
          format,
          financialYear,
        });

        if (!nextNumber) {
          return createResponse(
            400,
            {
              error:
                "Could not generate qutation number. Please configure financial year format first.",
            },
            origin,
          );
        }

        return createResponse(
          200,
          {
            nextNumber,
            qutationNumber: nextNumber,
            financialYear,
            format,
          },
          origin,
        );
      }

      if (id) {
        const qutation = await qutationsCollection.findOne({
          _id: new ObjectId(id),
          isDeleted: { $ne: true },
        });

        if (!qutation) {
          return createResponse(404, { error: "Qutation not found" }, origin);
        }

        const binding = await getPerformaTermsBinding();
        const { document: hydratedQutation, patch } =
          applyTermsBindingToDocument(qutation, binding);

        if (patch) {
          await qutationsCollection.updateOne(
            { _id: qutation._id },
            {
              $set: patch,
            },
          );
        }

        return createResponse(
          200,
          normalizeOutgoingQutationData(hydratedQutation),
          origin,
        );
      }

      const filterQuery = { isDeleted: { $ne: true } };
      const params = event.queryStringParameters || {};

      Object.entries(params).forEach(([key, value]) => {
        if (!value || value === "" || value === "All") return;
        if (key === "filter") return;

        const normalizedKey =
          key === "qutationValidity" ? "qutationExpiryDate" : key;

        if (
          ["page", "limit", "sortBy", "sortOrder", "search", "id"].includes(key)
        ) {
          return;
        }

        if (key.endsWith("_start") || key.endsWith("_end")) return;

        if (typeof value === "string" && value.includes(",")) {
          filterQuery[normalizedKey] = {
            $in: value
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean),
          };
          return;
        }

        if (typeof value === "string") {
          if (
            [
              "projectType",
              "qutationType",
              "qutationStatus",
              "qutationSendVia",
            ].includes(key)
          ) {
            filterQuery[normalizedKey] = value.trim();
          } else {
            filterQuery[normalizedKey] = {
              $regex: value.trim(),
              $options: "i",
            };
          }
          return;
        }

        filterQuery[normalizedKey] = value;
      });

      const dateRanges = {};

      Object.entries(params).forEach(([key, value]) => {
        if (!value) return;

        if (key.endsWith("_start")) {
          let baseKey = key.replace(/_start$/, "");
          if (baseKey === "createdDateTime") baseKey = "createdAt";
          if (baseKey === "qutationValidity") baseKey = "qutationExpiryDate";

          if (!dateRanges[baseKey]) dateRanges[baseKey] = {};

          const dateParts = value.split("-");
          if (dateParts.length === 3) {
            const [year, month, day] = dateParts.map((item) =>
              parseInt(item, 10),
            );
            dateRanges[baseKey].$gte = new Date(
              Date.UTC(year, month - 1, day, 0, 0, 0, 0),
            );
          }
        }

        if (key.endsWith("_end")) {
          let baseKey = key.replace(/_end$/, "");
          if (baseKey === "createdDateTime") baseKey = "createdAt";
          if (baseKey === "qutationValidity") baseKey = "qutationExpiryDate";

          if (!dateRanges[baseKey]) dateRanges[baseKey] = {};

          const dateParts = value.split("-");
          if (dateParts.length === 3) {
            const [year, month, day] = dateParts.map((item) =>
              parseInt(item, 10),
            );
            dateRanges[baseKey].$lte = new Date(
              Date.UTC(year, month - 1, day, 23, 59, 59, 999),
            );
          }
        }
      });

      Object.entries(dateRanges).forEach(([key, range]) => {
        filterQuery[key] = range;
      });

      if (filter) {
        if (filter === "send") {
          filterQuery.qutationStatus = { $in: ["Send", "Send + Approve"] };
        }

        if (filter === "approve") {
          filterQuery.qutationStatus = { $in: ["Approve", "Send + Approve"] };
        }

        if (filter === "reject") {
          filterQuery.qutationStatus = "Reject";
        }

        if (filter === "pending") {
          filterQuery.qutationStatus = "Pending";
        }
      }

      if (search) {
        filterQuery.$or = [
          { clientName: { $regex: search, $options: "i" } },
          { projectName: { $regex: search, $options: "i" } },
          { phoneNumber: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { qutationType: { $regex: search, $options: "i" } },
          { qutationStatus: { $regex: search, $options: "i" } },
          { qutationSendVia: { $regex: search, $options: "i" } },
        ];
      }

      const pageNum = parseInt(page, 10);
      const limitNum = parseInt(limit, 10);
      const skip = (pageNum - 1) * limitNum;

      const sortObject = {};
      sortObject[sortBy] = sortOrder === "asc" ? 1 : -1;

      const totalRecords =
        await qutationsCollection.countDocuments(filterQuery);

      const qutations = await qutationsCollection
        .find(filterQuery)
        .sort(sortObject)
        .skip(skip)
        .limit(limitNum)
        .toArray();

      const binding = await getPerformaTermsBinding();
      const patchedQutations = [];
      const backfillUpdates = [];

      qutations.forEach((qutation) => {
        const { document: hydratedQutation, patch } =
          applyTermsBindingToDocument(qutation, binding);
        patchedQutations.push(hydratedQutation);

        if (patch) {
          backfillUpdates.push({
            updateOne: {
              filter: { _id: qutation._id },
              update: {
                $set: patch,
              },
            },
          });
        }
      });

      if (backfillUpdates.length > 0) {
        await qutationsCollection.bulkWrite(backfillUpdates, {
          ordered: false,
        });
      }

      const normalizedQutations = patchedQutations.map(
        normalizeOutgoingQutationData,
      );

      const projectTypes = await qutationsCollection.distinct("projectType", {
        isDeleted: { $ne: true },
        projectType: { $exists: true, $ne: "" },
      });

      const qutationTypes = await qutationsCollection.distinct("qutationType", {
        isDeleted: { $ne: true },
        qutationType: { $exists: true, $ne: "" },
      });

      const qutationStatuses = await qutationsCollection.distinct(
        "qutationStatus",
        {
          isDeleted: { $ne: true },
          qutationStatus: { $exists: true, $ne: "" },
        },
      );

      const qutationSendVias = await qutationsCollection.distinct(
        "qutationSendVia",
        {
          isDeleted: { $ne: true },
          qutationSendVia: { $exists: true, $ne: "" },
        },
      );

      const totalSend = await qutationsCollection.countDocuments({
        isDeleted: { $ne: true },
        qutationStatus: { $in: ["Send", "Send + Approve"] },
      });

      const totalApprove = await qutationsCollection.countDocuments({
        isDeleted: { $ne: true },
        qutationStatus: { $in: ["Approve", "Send + Approve"] },
      });

      const totalReject = await qutationsCollection.countDocuments({
        isDeleted: { $ne: true },
        qutationStatus: "Reject",
      });

      const totalPending = await qutationsCollection.countDocuments({
        isDeleted: { $ne: true },
        qutationStatus: "Pending",
      });

      return createResponse(
        200,
        {
          data: normalizedQutations,
          pagination: {
            page: pageNum,
            limit: limitNum,
            totalRecords,
            totalPages: Math.ceil(totalRecords / limitNum),
          },
          statistics: {
            total: totalRecords,
            send: totalSend,
            approve: totalApprove,
            reject: totalReject,
            pending: totalPending,
          },
          filterOptions: {
            projectType: ["All", ...projectTypes.sort()],
            qutationType: ["All", ...qutationTypes.sort()],
            qutationStatus: ["All", ...qutationStatuses.sort()],
            qutationSendVia: ["All", ...qutationSendVias.sort()],
          },
        },
        origin,
      );
    }

    if (event.httpMethod === "POST") {
      const qutationData = normalizeIncomingQutationData(
        JSON.parse(event.body || "{}"),
      );
      delete qutationData.performaInvoiceTermsVersion;
      delete qutationData.performaInvoiceTermsConditionsSnapshot;

      const { financialYear, format } = await resolveQutationNumberContext(
        qutationData.financialYear,
      );

      if (!qutationData.financialYear && financialYear) {
        qutationData.financialYear = financialYear;
      }

      if (!qutationData.qutationNumber) {
        qutationData.qutationNumber = await getNextFromFormat({
          format,
          financialYear: qutationData.financialYear || financialYear,
        });
      }

      if (!qutationData.qutationNumber) {
        return createResponse(
          400,
          {
            error:
              "Could not generate qutation number. Please configure financial year format first.",
          },
          origin,
        );
      }

      const existingQutation = await qutationsCollection.findOne({
        qutationNumber: qutationData.qutationNumber,
        isDeleted: { $ne: true },
      });

      if (existingQutation) {
        return createResponse(
          409,
          { error: "Qutation number already exists" },
          origin,
        );
      }

      if (qutationData?.qutationUpload?.fileDataBase64) {
        const cloudflareSettings = await getCloudflareSettingsFromDatabase(db);
        if (!cloudflareSettings?.storeUrl || !cloudflareSettings?.password) {
          return createResponse(
            400,
            {
              error:
                "Cloudflare settings missing. Configure Cloudflare before uploading qutation document.",
            },
            origin,
          );
        }

        const qutationUpload = qutationData.qutationUpload;
        const extension = getExtensionFromUpload(
          qutationUpload.fileName,
          qutationUpload.fileType,
        );
        const fileName = `${sanitizeIdentifier(qutationData.qutationNumber)}.${extension}`;
        const objectPath = `Qutation/${getFinancialYearLabel(qutationData.qutationDate)}/${fileName}`;
        const fileBuffer = Buffer.from(
          String(qutationUpload.fileDataBase64 || ""),
          "base64",
        );

        if (!fileBuffer.length) {
          return createResponse(
            400,
            { error: "Invalid qutation file data" },
            origin,
          );
        }

        const uploadResult = await uploadToCloudflareStore({
          storeUrl: cloudflareSettings.storeUrl,
          publicDomain: cloudflareSettings.publicDomain,
          password: cloudflareSettings.password,
          objectPath,
          mimeType: qutationUpload.fileType || "application/octet-stream",
          fileBuffer,
        });

        qutationData.qutationFileURL = uploadResult.fileUrl;
        qutationData.qutationFilePath = uploadResult.filePath;
        qutationData.qutationFileName = fileName;
        qutationData.qutationFileType =
          qutationUpload.fileType || "application/octet-stream";
      }

      delete qutationData.qutationUpload;

      const binding = await getPerformaTermsBinding();

      const result = await qutationsCollection.insertOne({
        ...qutationData,
        qutationTotalAmount: Number(qutationData.qutationTotalAmount || 0),
        status: qutationData.status || "Active",
        performaInvoiceTermsVersion: binding?.version || "V1.0.0",
        createdAt: new Date(),
        updatedAt: new Date(),
        ...getAuditFieldsFromEvent(event, "create"),
      });

      return createResponse(
        201,
        { message: "Qutation created successfully", id: result.insertedId },
        origin,
      );
    }

    if (event.httpMethod === "PUT") {
      const { id } = event.queryStringParameters || {};

      if (!id) {
        return createResponse(
          400,
          { error: "Qutation ID is required" },
          origin,
        );
      }

      const qutationData = normalizeIncomingQutationData(
        JSON.parse(event.body || "{}"),
      );
      delete qutationData.performaInvoiceTermsVersion;
      delete qutationData.performaInvoiceTermsConditionsSnapshot;

      const qutationObjectId = new ObjectId(id);
      const existingQutation = await qutationsCollection.findOne({
        _id: qutationObjectId,
        isDeleted: { $ne: true },
      });

      if (!existingQutation) {
        return createResponse(404, { error: "Qutation not found" }, origin);
      }

      if (qutationData?.qutationUpload?.fileDataBase64) {
        const cloudflareSettings = await getCloudflareSettingsFromDatabase(db);
        if (!cloudflareSettings?.storeUrl || !cloudflareSettings?.password) {
          return createResponse(
            400,
            {
              error:
                "Cloudflare settings missing. Configure Cloudflare before uploading qutation document.",
            },
            origin,
          );
        }

        const qutationUpload = qutationData.qutationUpload;
        const fileBuffer = Buffer.from(
          String(qutationUpload.fileDataBase64 || ""),
          "base64",
        );

        if (!fileBuffer.length) {
          return createResponse(
            400,
            { error: "Invalid qutation file data" },
            origin,
          );
        }

        const existingPath = existingQutation.qutationFilePath;
        const extension =
          getExtensionFromPath(existingPath) ||
          getExtensionFromUpload(
            qutationUpload.fileName,
            qutationUpload.fileType,
          );
        const fileName = `${sanitizeIdentifier(qutationData.qutationNumber || existingQutation.qutationNumber)}.${extension}`;
        const objectPath =
          existingPath ||
          `Qutation/${getFinancialYearLabel(qutationData.qutationDate || existingQutation.qutationDate)}/${fileName}`;

        const uploadResult = await uploadToCloudflareStore({
          storeUrl: cloudflareSettings.storeUrl,
          publicDomain: cloudflareSettings.publicDomain,
          password: cloudflareSettings.password,
          objectPath,
          mimeType: qutationUpload.fileType || "application/octet-stream",
          fileBuffer,
        });

        qutationData.qutationFileURL = uploadResult.fileUrl;
        qutationData.qutationFilePath = uploadResult.filePath;
        qutationData.qutationFileName = fileName;
        qutationData.qutationFileType =
          qutationUpload.fileType || "application/octet-stream";
      }

      delete qutationData.qutationUpload;

      const result = await qutationsCollection.updateOne(
        { _id: qutationObjectId, isDeleted: { $ne: true } },
        {
          $set: {
            ...qutationData,
            qutationTotalAmount: Number(qutationData.qutationTotalAmount || 0),
            updatedAt: new Date(),
          },
        },
      );

      if (result.matchedCount === 0) {
        return createResponse(404, { error: "Qutation not found" }, origin);
      }

      return createResponse(
        200,
        { message: "Qutation updated successfully" },
        origin,
      );
    }

    if (event.httpMethod === "DELETE") {
      const { id } = event.queryStringParameters || {};

      if (!id) {
        return createResponse(
          400,
          { error: "Qutation ID is required" },
          origin,
        );
      }

      const qutationObjectId = new ObjectId(id);
      const existingQutation = await qutationsCollection.findOne({
        _id: qutationObjectId,
        isDeleted: { $ne: true },
      });

      if (!existingQutation) {
        return createResponse(404, { error: "Qutation not found" }, origin);
      }

      if (existingQutation.qutationFilePath) {
        const cloudflareSettings = await getCloudflareSettingsFromDatabase(db);
        if (!cloudflareSettings?.storeUrl || !cloudflareSettings?.password) {
          return createResponse(
            400,
            {
              error:
                "Cloudflare settings missing. Unable to delete qutation uploaded file.",
            },
            origin,
          );
        }

        await deleteFromCloudflareStore({
          storeUrl: cloudflareSettings.storeUrl,
          password: cloudflareSettings.password,
          objectPath: existingQutation.qutationFilePath,
        });
      }

      const result = await qutationsCollection.updateOne(
        { _id: qutationObjectId },
        {
          $set: {
            isDeleted: true,
            deletedAt: new Date(),
            updatedAt: new Date(),
          },
        },
      );

      if (result.matchedCount === 0) {
        return createResponse(404, { error: "Qutation not found" }, origin);
      }

      return createResponse(
        200,
        { message: "Qutation deleted successfully" },
        origin,
      );
    }

    return createResponse(405, { error: "Method not allowed" }, origin);
  } catch (error) {
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
