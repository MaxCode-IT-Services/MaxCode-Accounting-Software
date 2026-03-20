import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { ObjectId } from "mongodb";
import { verifyRequestToken } from "./utils/auth.js";

const FILES_COLLECTION = "files";
const SETTINGS_COLLECTION = "business_settings";
const GLOBAL_SETTINGS_SCOPE = "global";

const normalizeCloudflareSettings = (settings = {}) => {
  if (!settings || typeof settings !== "object") {
    return null;
  }

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
    defaultFolder: String(settings.defaultFolder || "").trim() || "general",
  };
};

const ensureFolder = (value, fallback = "general") => {
  const folder = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9/_-]+/g, "-")
    .replace(/^[-/]+|[-/]+$/g, "");

  return folder || fallback;
};

const safeFileName = (value = "") =>
  String(value || "")
    .trim()
    .replace(/[\\/]+/g, "-") || `file-${Date.now()}`;

const sanitizePathSegment = (value = "") =>
  String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

const normalizeRelativePath = (value = "") => {
  const normalized = String(value || "")
    .replace(/\\+/g, "/")
    .split("/")
    .map((segment) =>
      String(segment || "")
        .replace(/[\u0000-\u001f]/g, "")
        .trim(),
    )
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .map((segment) => segment.replace(/[\\/]+/g, "-"))
    .filter(Boolean)
    .join("/");

  return normalized;
};

const escapeRegExp = (value = "") =>
  String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const formatBytes = (bytes) => {
  const numeric = Number(bytes || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const power = Math.min(Math.floor(Math.log(numeric) / Math.log(1024)), 4);
  const size = numeric / Math.pow(1024, power);
  return `${size.toFixed(size >= 100 || power === 0 ? 0 : 2)} ${units[power]}`;
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

  const commonHeaders = {
    "Content-Type": mimeType || "application/octet-stream",
    "x-upload-password": password,
    "x-api-key": password,
    "x-password": password,
    Authorization: `Bearer ${password}`,
  };

  const putResponse = await fetch(putUrl, {
    method: "PUT",
    headers: commonHeaders,
    body: fileBuffer,
  });

  let responseUrl = "";

  if (putResponse.ok) {
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
      providerResponse: null,
    };
  }

  // Fallback: JSON upload for custom workers expecting payload body.
  const postResponse = await fetch(cleanedStoreUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...commonHeaders,
    },
    body: JSON.stringify({
      password,
      path: cleanedPath,
      fileName: cleanedPath.split("/").pop(),
      contentType: mimeType || "application/octet-stream",
      contentBase64: fileBuffer.toString("base64"),
    }),
  });

  if (!postResponse.ok) {
    const putBody = await putResponse.text();
    const postBody = await postResponse.text();
    throw new Error(
      `Cloudflare upload failed. PUT: ${putResponse.status} ${putBody || ""}; POST: ${postResponse.status} ${postBody || ""}`,
    );
  }

  const postJson = await postResponse.json().catch(() => ({}));
  responseUrl =
    postJson?.url ||
    postJson?.fileUrl ||
    postJson?.data?.url ||
    postJson?.result?.url ||
    "";

  return {
    fileUrl: responseUrl || buildPublicUrl(publicDomain, cleanedPath),
    providerResponse: postJson,
  };
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

  if (deleteResponse.ok) {
    return;
  }

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
    const first = await deleteResponse.text();
    const second = await fallbackResponse.text();
    throw new Error(
      `Cloudflare delete failed. DELETE: ${deleteResponse.status} ${first || ""}; POST: ${fallbackResponse.status} ${second || ""}`,
    );
  }
};

const ensureCloudflareFolder = async ({
  storeUrl,
  password,
  folderName,
  publicDomain,
}) => {
  const cleanedStoreUrl = String(storeUrl || "").replace(/\/+$/, "");
  const cleanedFolder = String(folderName || "").replace(/^\/+|\/+$/g, "");

  if (!cleanedStoreUrl || !cleanedFolder) return;

  const placeholderPath = `${cleanedFolder}/.maxcode_keep`;
  const commonHeaders = {
    "Content-Type": "application/octet-stream",
    "x-upload-password": password,
    "x-api-key": password,
    "x-password": password,
    Authorization: `Bearer ${password}`,
  };

  try {
    await fetch(`${cleanedStoreUrl}/${placeholderPath}`, {
      method: "PUT",
      headers: commonHeaders,
      body: new Uint8Array(0),
    });
  } catch {
    // Some workers auto-create folder prefix on file upload; ignore folder bootstrap errors.
  }

  // Best effort: some custom workers expose folder creation API.
  try {
    await fetch(cleanedStoreUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...commonHeaders,
      },
      body: JSON.stringify({
        action: "create-folder",
        password,
        folder: cleanedFolder,
        path: cleanedFolder,
        publicDomain,
      }),
    });
  } catch {
    // Keep non-fatal.
  }
};

const parseUploadDate = (dateValue) => {
  if (!dateValue) return new Date();
  const date = new Date(dateValue);
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const assertNoExistingFilePath = async (filesCollection, objectPath) => {
  const escaped = escapeRegExp(objectPath);
  const existing = await filesCollection.findOne({
    isDeleted: { $ne: true },
    filePath: { $regex: `^${escaped}$`, $options: "i" },
  });

  if (existing) {
    throw new Error(`File already exists with name: ${objectPath}`);
  }
};

const saveFileRecord = async ({
  filesCollection,
  fileName,
  originalName,
  folderName,
  filePath,
  fileUrl,
  fileType,
  fileSizeBytes,
  uploadDate,
  user,
}) => {
  const record = {
    fileName,
    originalName,
    folderName,
    filePath,
    fileUrl,
    fileType,
    fileSizeBytes,
    fileSize: formatBytes(fileSizeBytes),
    uploadDate,
    status: "Active",
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdByUserId: user.userId,
    createdByRole: user.role || "",
  };

  const insert = await filesCollection.insertOne(record);

  return {
    ...record,
    _id: insert.insertedId,
  };
};

export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === "OPTIONS") {
    return createResponse(200, {}, origin);
  }

  try {
    const user = verifyRequestToken(event);

    const { db } = await connectToDatabase();
    const filesCollection = db.collection(FILES_COLLECTION);

    if (event.httpMethod === "GET") {
      const {
        id,
        page = 1,
        limit = 10,
        search,
        folderName,
        fileType,
        filter,
        uploadDate_start,
        uploadDate_end,
        sortBy = "createdAt",
        sortOrder = "desc",
      } = event.queryStringParameters || {};

      if (id) {
        const record = await filesCollection.findOne({
          _id: new ObjectId(id),
          isDeleted: { $ne: true },
        });

        if (!record) {
          return createResponse(
            404,
            { error: "File record not found" },
            origin,
          );
        }

        return createResponse(200, record, origin);
      }

      const query = { isDeleted: { $ne: true } };

      if (folderName && folderName !== "All") {
        query.folderName = String(folderName).trim();
      }

      if (fileType && fileType !== "All") {
        query.fileType = String(fileType).trim();
      }

      if (filter && filter !== "total") {
        if (filter === "documents") {
          query.folderName = { $regex: /^documents$/i };
        } else if (filter === "invoices") {
          query.folderName = { $regex: /^invoices$/i };
        } else if (filter === "purchases") {
          query.folderName = { $regex: /^purchases$/i };
        } else if (filter === "others") {
          query.folderName = {
            $not: { $regex: /^(documents|invoices|purchases)$/i },
          };
        }
      }

      if (search) {
        query.$or = [
          { fileName: { $regex: search, $options: "i" } },
          { originalName: { $regex: search, $options: "i" } },
          { folderName: { $regex: search, $options: "i" } },
          { fileType: { $regex: search, $options: "i" } },
        ];
      }

      if (uploadDate_start || uploadDate_end) {
        query.uploadDate = {};
        if (uploadDate_start) {
          query.uploadDate.$gte = new Date(`${uploadDate_start}T00:00:00.000Z`);
        }
        if (uploadDate_end) {
          query.uploadDate.$lte = new Date(`${uploadDate_end}T23:59:59.999Z`);
        }
      }

      const pageNum = Number.parseInt(page, 10) || 1;
      const limitNum = Number.parseInt(limit, 10) || 10;
      const skip = (pageNum - 1) * limitNum;

      const sortObject = {
        [sortBy]: sortOrder === "asc" ? 1 : -1,
      };

      const totalRecords = await filesCollection.countDocuments(query);
      const rows = await filesCollection
        .find(query)
        .sort(sortObject)
        .skip(skip)
        .limit(limitNum)
        .toArray();

      const folderValues = await filesCollection.distinct("folderName", {
        isDeleted: { $ne: true },
      });
      const typeValues = await filesCollection.distinct("fileType", {
        isDeleted: { $ne: true },
      });

      const totalSizeAgg = await filesCollection
        .aggregate([
          { $match: { isDeleted: { $ne: true } } },
          { $group: { _id: null, totalSizeBytes: { $sum: "$fileSizeBytes" } } },
        ])
        .toArray();

      const baseStatsQuery = { isDeleted: { $ne: true } };
      const totalAll = await filesCollection.countDocuments(baseStatsQuery);
      const totalDocuments = await filesCollection.countDocuments({
        ...baseStatsQuery,
        folderName: { $regex: /^documents$/i },
      });
      const totalInvoices = await filesCollection.countDocuments({
        ...baseStatsQuery,
        folderName: { $regex: /^invoices$/i },
      });
      const totalPurchases = await filesCollection.countDocuments({
        ...baseStatsQuery,
        folderName: { $regex: /^purchases$/i },
      });
      const totalOthers = await filesCollection.countDocuments({
        ...baseStatsQuery,
        folderName: { $not: { $regex: /^(documents|invoices|purchases)$/i } },
      });

      return createResponse(
        200,
        {
          data: rows,
          pagination: {
            page: pageNum,
            limit: limitNum,
            totalRecords,
            totalPages: Math.ceil(totalRecords / limitNum),
          },
          statistics: {
            total: totalAll,
            documents: totalDocuments,
            invoices: totalInvoices,
            purchases: totalPurchases,
            others: totalOthers,
            totalSizeBytes: totalSizeAgg?.[0]?.totalSizeBytes || 0,
            totalSize: formatBytes(totalSizeAgg?.[0]?.totalSizeBytes || 0),
          },
          filterOptions: {
            folderName: ["All", ...folderValues.filter(Boolean).sort()],
            fileType: ["All", ...typeValues.filter(Boolean).sort()],
          },
        },
        origin,
      );
    }

    if (event.httpMethod === "POST") {
      const body = event.body ? JSON.parse(event.body) : {};
      const action = String(body.action || "upload")
        .trim()
        .toLowerCase();

      if (!["upload", "upload-files", "upload-folder"].includes(action)) {
        return createResponse(400, { error: "Unsupported action" }, origin);
      }

      const uploadDate = parseUploadDate(body.uploadDate);

      const settingsCollection = db.collection(SETTINGS_COLLECTION);
      const settingsDocument = await settingsCollection.findOne({
        scope: GLOBAL_SETTINGS_SCOPE,
      });
      const cloudflareSettings = normalizeCloudflareSettings(
        settingsDocument?.cloudflareSettings,
      );

      if (!cloudflareSettings?.storeUrl || !cloudflareSettings?.password) {
        return createResponse(
          400,
          {
            error:
              "Cloudflare settings are missing. Please configure Store URL and Password in Settings > Cloudflare.",
          },
          origin,
        );
      }

      const folderName = ensureFolder(
        body.folderName,
        ensureFolder(cloudflareSettings.defaultFolder || "general"),
      );

      await ensureCloudflareFolder({
        storeUrl: cloudflareSettings.storeUrl,
        password: cloudflareSettings.password,
        folderName,
        publicDomain: cloudflareSettings.publicDomain,
      });

      if (action === "upload") {
        const fileDataBase64 = String(body.fileDataBase64 || "").trim();
        const requestedFileName = String(body.fileName || "").trim();

        if (!requestedFileName) {
          return createResponse(
            400,
            { error: "File name is required" },
            origin,
          );
        }

        if (!fileDataBase64) {
          return createResponse(
            400,
            { error: "File data is required" },
            origin,
          );
        }

        const fileName = safeFileName(requestedFileName);
        const originalName =
          String(body.originalName || requestedFileName).trim() || fileName;
        const fileType =
          String(
            body.fileType || body.mimeType || "application/octet-stream",
          ).trim() || "application/octet-stream";

        const objectPath = `${folderName}/${fileName}`;
        await assertNoExistingFilePath(filesCollection, objectPath);

        const fileBuffer = Buffer.from(fileDataBase64, "base64");
        if (!fileBuffer.length) {
          return createResponse(400, { error: "Invalid file data" }, origin);
        }

        const uploadResult = await uploadToCloudflareStore({
          storeUrl: cloudflareSettings.storeUrl,
          publicDomain: cloudflareSettings.publicDomain,
          password: cloudflareSettings.password,
          objectPath,
          mimeType: fileType,
          fileBuffer,
        });

        const fileSizeBytes = Number(body.fileSizeBytes) || fileBuffer.length;
        const saved = await saveFileRecord({
          filesCollection,
          fileName,
          originalName,
          folderName,
          filePath: objectPath,
          fileUrl: uploadResult.fileUrl,
          fileType,
          fileSizeBytes,
          uploadDate,
          user,
        });

        return createResponse(
          201,
          {
            message: "File uploaded successfully",
            data: saved,
          },
          origin,
        );
      }

      if (action === "upload-files") {
        const files = Array.isArray(body.files) ? body.files : [];
        if (files.length === 0) {
          return createResponse(
            400,
            { error: "At least one file is required" },
            origin,
          );
        }

        const preparedFiles = files
          .map((item) => {
            const fileName = safeFileName(
              item?.fileName || item?.originalName || "",
            );
            const originalName =
              String(item?.originalName || fileName).trim() || fileName;
            const fileDataBase64 = String(item?.fileDataBase64 || "").trim();
            const fileType =
              String(item?.fileType || "application/octet-stream").trim() ||
              "application/octet-stream";
            const fileSizeBytes = Number(item?.fileSizeBytes) || 0;

            return {
              fileName,
              originalName,
              fileDataBase64,
              fileType,
              fileSizeBytes,
            };
          })
          .filter((item) => item.fileName && item.fileDataBase64);

        if (preparedFiles.length === 0) {
          return createResponse(400, { error: "No valid files found" }, origin);
        }

        const paths = preparedFiles.map(
          (item) => `${folderName}/${item.fileName}`,
        );
        const seen = new Set();
        for (const path of paths) {
          const key = path.toLowerCase();
          if (seen.has(key)) {
            return createResponse(
              409,
              { error: `Duplicate file name in selection: ${path}` },
              origin,
            );
          }
          seen.add(key);
        }

        for (const path of paths) {
          await assertNoExistingFilePath(filesCollection, path);
        }

        const uploaded = [];
        for (const item of preparedFiles) {
          const objectPath = `${folderName}/${item.fileName}`;
          const fileBuffer = Buffer.from(item.fileDataBase64, "base64");
          if (!fileBuffer.length) {
            return createResponse(
              400,
              { error: `Invalid file data for: ${item.fileName}` },
              origin,
            );
          }

          const uploadResult = await uploadToCloudflareStore({
            storeUrl: cloudflareSettings.storeUrl,
            publicDomain: cloudflareSettings.publicDomain,
            password: cloudflareSettings.password,
            objectPath,
            mimeType: item.fileType,
            fileBuffer,
          });

          const saved = await saveFileRecord({
            filesCollection,
            fileName: item.fileName,
            originalName: item.originalName,
            folderName,
            filePath: objectPath,
            fileUrl: uploadResult.fileUrl,
            fileType: item.fileType,
            fileSizeBytes: item.fileSizeBytes || fileBuffer.length,
            uploadDate,
            user,
          });

          uploaded.push(saved);
        }

        return createResponse(
          201,
          {
            message: `${uploaded.length} files uploaded successfully`,
            data: uploaded,
          },
          origin,
        );
      }

      const folderFiles = Array.isArray(body.folderFiles)
        ? body.folderFiles
        : [];
      if (folderFiles.length === 0) {
        return createResponse(
          400,
          { error: "Folder files are required" },
          origin,
        );
      }

      const preparedFiles = folderFiles
        .map((item) => {
          const relativePath = normalizeRelativePath(item?.relativePath || "");
          const fileDataBase64 = String(item?.fileDataBase64 || "").trim();
          const fileType =
            String(item?.fileType || "application/octet-stream").trim() ||
            "application/octet-stream";
          const originalName =
            String(item?.originalName || "").trim() ||
            relativePath.split("/").pop() ||
            "file";
          const fileName = safeFileName(
            relativePath.split("/").pop() || "file",
          );

          return {
            relativePath,
            fileDataBase64,
            fileType,
            originalName,
            fileName,
            fileSizeBytes: Number(item?.fileSizeBytes) || 0,
          };
        })
        .filter((item) => item.relativePath && item.fileDataBase64);

      if (preparedFiles.length === 0) {
        return createResponse(
          400,
          { error: "No valid files found in selected folder" },
          origin,
        );
      }

      const fullFolderPaths = preparedFiles.map(
        (item) => `${folderName}/${item.relativePath}`,
      );

      const seen = new Set();
      for (const path of fullFolderPaths) {
        const key = path.toLowerCase();
        if (seen.has(key)) {
          return createResponse(
            409,
            { error: `Duplicate file in selected folder payload: ${path}` },
            origin,
          );
        }
        seen.add(key);
      }

      for (const path of fullFolderPaths) {
        await assertNoExistingFilePath(filesCollection, path);
      }

      const uploaded = [];
      for (const item of preparedFiles) {
        const objectPath = `${folderName}/${item.relativePath}`;
        const subFolder = objectPath.includes("/")
          ? objectPath.slice(0, objectPath.lastIndexOf("/"))
          : folderName;

        await ensureCloudflareFolder({
          storeUrl: cloudflareSettings.storeUrl,
          password: cloudflareSettings.password,
          folderName: subFolder,
          publicDomain: cloudflareSettings.publicDomain,
        });

        const fileBuffer = Buffer.from(item.fileDataBase64, "base64");
        if (!fileBuffer.length) {
          return createResponse(
            400,
            { error: `Invalid file data in folder item: ${item.relativePath}` },
            origin,
          );
        }

        const uploadResult = await uploadToCloudflareStore({
          storeUrl: cloudflareSettings.storeUrl,
          publicDomain: cloudflareSettings.publicDomain,
          password: cloudflareSettings.password,
          objectPath,
          mimeType: item.fileType,
          fileBuffer,
        });

        const saved = await saveFileRecord({
          filesCollection,
          fileName: item.fileName,
          originalName: item.originalName,
          folderName,
          filePath: objectPath,
          fileUrl: uploadResult.fileUrl,
          fileType: item.fileType,
          fileSizeBytes: item.fileSizeBytes || fileBuffer.length,
          uploadDate,
          user,
        });

        uploaded.push(saved);
      }

      return createResponse(
        201,
        {
          message: `Folder uploaded successfully (${uploaded.length} files)`,
          data: uploaded,
        },
        origin,
      );
    }

    if (event.httpMethod === "DELETE") {
      const payload = event.body ? JSON.parse(event.body) : {};
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(400, { error: "File id is required" }, origin);
      }

      const existing = await filesCollection.findOne({
        _id: new ObjectId(id),
        isDeleted: { $ne: true },
      });

      if (!existing) {
        return createResponse(404, { error: "File record not found" }, origin);
      }

      const deleteFromCloudflare =
        payload?.deleteFromCloudflare === true ||
        String(payload?.deleteFromCloudflare || "").toLowerCase() === "true";

      if (deleteFromCloudflare) {
        const settingsCollection = db.collection(SETTINGS_COLLECTION);
        const settingsDocument = await settingsCollection.findOne({
          scope: GLOBAL_SETTINGS_SCOPE,
        });
        const cloudflareSettings = normalizeCloudflareSettings(
          settingsDocument?.cloudflareSettings,
        );

        if (!cloudflareSettings?.storeUrl || !cloudflareSettings?.password) {
          return createResponse(
            400,
            {
              error:
                "Cloudflare settings are missing. Please configure Store URL and Password in Settings > Cloudflare.",
            },
            origin,
          );
        }

        try {
          await deleteFromCloudflareStore({
            storeUrl: cloudflareSettings.storeUrl,
            password: cloudflareSettings.password,
            objectPath: existing.filePath,
          });
        } catch (cloudError) {
          return createResponse(
            500,
            {
              error: "Failed to delete file from Cloudflare",
              message: cloudError.message,
            },
            origin,
          );
        }
      }

      const result = await filesCollection.updateOne(
        { _id: new ObjectId(id), isDeleted: { $ne: true } },
        {
          $set: {
            isDeleted: true,
            deletedAt: new Date(),
            deletedByUserId: user.userId,
            updatedAt: new Date(),
          },
        },
      );

      if (!result.matchedCount) {
        return createResponse(404, { error: "File record not found" }, origin);
      }

      return createResponse(200, { message: "File record deleted" }, origin);
    }

    if (event.httpMethod === "PUT") {
      const { id } = event.queryStringParameters || {};
      if (!id) {
        return createResponse(400, { error: "File id is required" }, origin);
      }

      const body = event.body ? JSON.parse(event.body) : {};
      const updates = {};

      if (Object.prototype.hasOwnProperty.call(body, "fileName")) {
        const nextName = safeFileName(body.fileName || "");
        if (!nextName) {
          return createResponse(
            400,
            { error: "File name is required" },
            origin,
          );
        }
        updates.fileName = nextName;
      }

      if (Object.prototype.hasOwnProperty.call(body, "folderName")) {
        updates.folderName = ensureFolder(body.folderName, "general");
      }

      if (Object.keys(updates).length === 0) {
        return createResponse(
          400,
          { error: "No valid fields to update" },
          origin,
        );
      }

      updates.updatedAt = new Date();

      const result = await filesCollection.updateOne(
        { _id: new ObjectId(id), isDeleted: { $ne: true } },
        {
          $set: updates,
        },
      );

      if (!result.matchedCount) {
        return createResponse(404, { error: "File record not found" }, origin);
      }

      const updated = await filesCollection.findOne({ _id: new ObjectId(id) });
      return createResponse(
        200,
        {
          message: "File record updated successfully",
          data: updated,
        },
        origin,
      );
    }

    return createResponse(405, { error: "Method not allowed" }, origin);
  } catch (error) {
    console.error("Files API error:", error);

    if (
      String(error.message || "")
        .toLowerCase()
        .includes("token")
    ) {
      return createResponse(401, { error: "Unauthorized" }, origin);
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
