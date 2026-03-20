import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { ObjectId } from "mongodb";
import { verifyRequestToken } from "./utils/auth.js";

const FILES_COLLECTION = "files";
const SETTINGS_COLLECTION = "business_settings";
const GLOBAL_SETTINGS_SCOPE = "global";
const CLOUD_LIST_CACHE_TTL_MS = 20 * 1000;
const cloudListCache = new Map();
const CLOUD_LIST_ATTEMPT_TIMEOUT_MS = 7000;

const getCloudCacheKey = (storeUrl = "", password = "") =>
  `${String(storeUrl || "").trim()}|${String(password || "").trim()}`;

const getCachedCloudRows = (cacheKey) => {
  if (!cacheKey || !cloudListCache.has(cacheKey)) return null;
  const entry = cloudListCache.get(cacheKey);
  const age = Date.now() - Number(entry?.cachedAt || 0);
  if (!entry || age > CLOUD_LIST_CACHE_TTL_MS) {
    cloudListCache.delete(cacheKey);
    return null;
  }
  return Array.isArray(entry.rows) ? entry.rows : null;
};

const setCachedCloudRows = (cacheKey, rows) => {
  if (!cacheKey || !Array.isArray(rows)) return;
  cloudListCache.set(cacheKey, {
    cachedAt: Date.now(),
    rows,
  });
};

const invalidateCloudListCache = () => {
  cloudListCache.clear();
};

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

const FILE_CATEGORY_EXTENSIONS = {
  documents: [
    "pdf",
    "doc",
    "docx",
    "xls",
    "xlsx",
    "csv",
    "ppt",
    "pptx",
    "txt",
    "rtf",
    "odt",
    "ods",
    "zip",
    "rar",
    "7z",
    "tar",
    "gz",
  ],
  images: [
    "jpg",
    "jpeg",
    "png",
    "gif",
    "webp",
    "bmp",
    "svg",
    "tif",
    "tiff",
    "ico",
    "avif",
    "heic",
    "heif",
  ],
  videos: [
    "mp4",
    "mov",
    "avi",
    "mkv",
    "webm",
    "m4v",
    "flv",
    "wmv",
    "3gp",
    "mpeg",
    "mpg",
    "ts",
    "m2ts",
  ],
};

const getFileExtension = (record = {}) => {
  const candidates = [record?.filePath, record?.fileName, record?.originalName]
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  for (const candidate of candidates) {
    const normalized = candidate.split("?")[0].split("#")[0];
    const baseName = normalized.split("/").pop() || "";
    const parts = baseName.split(".");
    if (parts.length < 2) continue;
    const extension = String(parts.pop() || "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    if (extension) {
      return extension;
    }
  }

  return "";
};

const getFileCategory = (record = {}) => {
  const extension = getFileExtension(record);
  const fileType = String(record?.fileType || "").toLowerCase();

  if (
    FILE_CATEGORY_EXTENSIONS.documents.includes(extension) ||
    /(pdf|word|document|spreadsheet|excel|csv|text|zip|rar|7z|application\/)/i.test(
      fileType,
    )
  ) {
    return "documents";
  }

  if (
    FILE_CATEGORY_EXTENSIONS.images.includes(extension) ||
    /^image\//i.test(fileType)
  ) {
    return "images";
  }

  if (
    FILE_CATEGORY_EXTENSIONS.videos.includes(extension) ||
    /^video\//i.test(fileType)
  ) {
    return "videos";
  }

  return "others";
};

const buildExtensionRegex = (extensions = []) =>
  `\\.(${extensions.map((ext) => escapeRegExp(ext)).join("|")})$`;

const buildMongoExtensionCondition = (extensions = []) => {
  const extensionRegex = buildExtensionRegex(extensions);
  return {
    $or: [
      { fileName: { $regex: extensionRegex, $options: "i" } },
      { originalName: { $regex: extensionRegex, $options: "i" } },
      { filePath: { $regex: extensionRegex, $options: "i" } },
    ],
  };
};

const getMongoCategoryCondition = (category = "") => {
  const documentsCondition = {
    $or: [
      buildMongoExtensionCondition(FILE_CATEGORY_EXTENSIONS.documents),
      {
        fileType: {
          $regex:
            /(pdf|word|document|spreadsheet|excel|csv|text|zip|rar|7z|application\/)/i,
        },
      },
    ],
  };
  const imagesCondition = {
    $or: [
      buildMongoExtensionCondition(FILE_CATEGORY_EXTENSIONS.images),
      { fileType: { $regex: /^image\//i } },
    ],
  };
  const videosCondition = {
    $or: [
      buildMongoExtensionCondition(FILE_CATEGORY_EXTENSIONS.videos),
      { fileType: { $regex: /^video\//i } },
    ],
  };

  if (category === "documents") return documentsCondition;
  if (category === "images") return imagesCondition;
  if (category === "videos") return videosCondition;
  if (category === "others") {
    return {
      $nor: [documentsCondition, imagesCondition, videosCondition],
    };
  }

  return null;
};

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

const guessMimeTypeFromFileName = (name = "") => {
  const extension = String(name || "")
    .toLowerCase()
    .split(".")
    .pop();

  const map = {
    pdf: "pdf",
    txt: "text/plain",
    csv: "text/csv",
    json: "json",
    zip: "zip",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    html: "text/html",
    mp4: "video/mp4",
    mp3: "audio/mpeg",
    doc: "documents",
    docx: "documents",
    xls: "excel",
    xlsx: "excel",
    csv: "text/csv",
    js: "javascript",
    wav: "audio/wav",
  };

  return map[extension] || "application/octet-stream";
};

const tryParseJson = (value) => {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (
    !(
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))
    )
  ) {
    return value;
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
};

const looksLikeFileRecord = (item) => {
  if (!item || typeof item !== "object") return false;

  const keys = [
    "path",
    "key",
    "filePath",
    "name",
    "fileName",
    "url",
    "fileUrl",
  ];

  return keys.some((field) => {
    const raw = item?.[field];
    return typeof raw === "string" && raw.trim().length > 0;
  });
};

const extractLikelyFileArray = (rootPayload) => {
  const root = tryParseJson(rootPayload);
  if (!root) return [];

  if (Array.isArray(root)) {
    if (root.some(looksLikeFileRecord)) return root;
  }

  const queue = [{ value: root, depth: 0 }];
  const visited = new Set();

  while (queue.length > 0) {
    const current = queue.shift();
    const value = current?.value;
    const depth = Number(current?.depth || 0);

    if (!value || depth > 6) continue;

    if (typeof value === "string") {
      const parsed = tryParseJson(value);
      if (parsed !== value) {
        queue.push({ value: parsed, depth: depth + 1 });
      }
      continue;
    }

    if (Array.isArray(value)) {
      if (value.some(looksLikeFileRecord)) {
        return value;
      }

      for (const item of value) {
        if (item && typeof item === "object") {
          queue.push({ value: item, depth: depth + 1 });
        }
      }
      continue;
    }

    if (typeof value === "object") {
      if (visited.has(value)) continue;
      visited.add(value);

      const entries = Object.entries(value);

      // Support map-style payloads like { files: { "folder/a.pdf": {...} } }
      for (const [field, fieldValueRaw] of entries) {
        const fieldValue = tryParseJson(fieldValueRaw);
        if (
          field === "files" &&
          fieldValue &&
          typeof fieldValue === "object" &&
          !Array.isArray(fieldValue)
        ) {
          const mapRows = Object.entries(fieldValue)
            .map(([k, v]) => {
              if (!v || typeof v !== "object") {
                return { key: k, path: k };
              }
              return {
                ...v,
                key: v.key || v.path || k,
                path: v.path || v.key || k,
              };
            })
            .filter(looksLikeFileRecord);

          if (mapRows.length > 0) {
            return mapRows;
          }
        }

        if (Array.isArray(fieldValue) && fieldValue.some(looksLikeFileRecord)) {
          return fieldValue;
        }
      }

      for (const [, fieldValueRaw] of entries) {
        const fieldValue = tryParseJson(fieldValueRaw);
        if (fieldValue && typeof fieldValue === "object") {
          queue.push({ value: fieldValue, depth: depth + 1 });
        }
      }
    }
  }

  return [];
};

const normalizeCloudListPayload = (payload) => {
  if (!payload) return [];
  const parsed = tryParseJson(payload);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.files)) return parsed.files;
  if (Array.isArray(parsed?.fileList)) return parsed.fileList;
  if (Array.isArray(parsed?.data)) return parsed.data;
  if (Array.isArray(parsed?.data?.files)) return parsed.data.files;
  if (Array.isArray(parsed?.data?.items)) return parsed.data.items;
  if (Array.isArray(parsed?.result)) return parsed.result;
  if (Array.isArray(parsed?.result?.files)) return parsed.result.files;
  if (Array.isArray(parsed?.result?.objects)) return parsed.result.objects;
  if (Array.isArray(parsed?.objects)) return parsed.objects;
  if (Array.isArray(parsed?.items)) return parsed.items;

  return extractLikelyFileArray(parsed);
};

const parseFileSizeBytes = (value) => {
  if (value === null || value === undefined) return 0;

  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, value);
  }

  const text = String(value).trim();
  if (!text) return 0;

  const numeric = Number(text);
  if (Number.isFinite(numeric)) {
    return Math.max(0, numeric);
  }

  const match = text.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB|TB)$/i);
  if (!match) return 0;

  const amount = Number(match[1]);
  const unit = String(match[2] || "B").toUpperCase();
  const powers = {
    B: 0,
    KB: 1,
    MB: 2,
    GB: 3,
    TB: 4,
  };

  return Math.round(amount * Math.pow(1024, powers[unit] || 0));
};

const listFromCloudflareStore = async ({
  storeUrl,
  password,
  publicDomain,
}) => {
  const cleanedStoreUrl = String(storeUrl || "").replace(/\/+$/, "");
  if (!cleanedStoreUrl || !password) {
    throw new Error("Cloudflare settings missing for listing");
  }

  const commonHeaders = {
    "Content-Type": "application/json",
    "x-upload-password": password,
    "x-api-key": password,
    "x-password": password,
    Authorization: `Bearer ${password}`,
  };

  const fetchWithTimeout = async (url, options = {}) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      CLOUD_LIST_ATTEMPT_TIMEOUT_MS,
    );

    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const attempts = [
    {
      url: cleanedStoreUrl,
      options: {
        method: "PATCH",
        headers: commonHeaders,
      },
    },
    {
      url: `${cleanedStoreUrl}/`,
      options: {
        method: "PATCH",
        headers: commonHeaders,
      },
    },
    {
      url: `${cleanedStoreUrl}?action=list`,
      options: {
        method: "GET",
        headers: commonHeaders,
      },
    },
    {
      url: `${cleanedStoreUrl}?action=list-files`,
      options: {
        method: "GET",
        headers: commonHeaders,
      },
    },
  ];

  const attemptFailures = [];

  for (const attempt of attempts) {
    try {
      const response = await fetchWithTimeout(attempt.url, attempt.options);
      if (!response.ok) {
        attemptFailures.push({
          url: attempt.url,
          status: response.status,
          statusText: response.statusText,
        });
        continue;
      }

      const json = await response.json().catch(() => null);
      const rows = normalizeCloudListPayload(json);
      if (!rows.length) {
        const preview = (() => {
          if (!json) return "empty-json";
          if (Array.isArray(json)) return `array(${json.length})`;
          if (typeof json === "object") {
            return `object-keys:${Object.keys(json).slice(0, 12).join(",")}`;
          }
          return typeof json;
        })();

        attemptFailures.push({
          url: attempt.url,
          status: response.status,
          statusText: `OK but empty/unrecognized payload (${preview})`,
        });
        continue;
      }

      return rows
        .map((item, index) => {
          let pathFromUrl = "";
          const urlCandidate = String(item?.url || item?.fileUrl || "").trim();
          if (urlCandidate) {
            try {
              const parsedUrl = new URL(urlCandidate);
              pathFromUrl = String(parsedUrl.pathname || "").replace(
                /^\/+/,
                "",
              );
            } catch {
              pathFromUrl = "";
            }
          }

          const rawPath =
            String(
              item?.path ||
                item?.key ||
                item?.filePath ||
                item?.name ||
                item?.fileName ||
                pathFromUrl ||
                "",
            )
              .replace(/^\/+/, "")
              .trim() || "";

          if (!rawPath || rawPath.endsWith("/")) {
            return null;
          }

          const fileName = rawPath.split("/").pop() || `file-${index + 1}`;
          const folderName = rawPath.split("/")[0] || "general";
          const fileSizeBytes = parseFileSizeBytes(
            item?.size ?? item?.fileSizeBytes ?? item?.bytes ?? item?.fileSize,
          );
          const fileType =
            String(
              item?.contentType ||
                item?.mimeType ||
                item?.httpMetadata?.contentType ||
                "",
            ).trim() || guessMimeTypeFromFileName(fileName);
          const uploadDateValue =
            item?.uploadedAt ||
            item?.uploadDate ||
            item?.uploaded ||
            item?.lastModified ||
            item?.updatedAt ||
            item?.createdAt ||
            null;
          const uploadDate = uploadDateValue
            ? parseUploadDate(uploadDateValue)
            : null;

          const fileUrl =
            String(item?.url || item?.fileUrl || "").trim() ||
            buildPublicUrl(publicDomain, rawPath) ||
            `${cleanedStoreUrl}/${rawPath}`;

          return {
            _id: `cloud:${rawPath}`,
            id: `cloud:${rawPath}`,
            fileName,
            originalName: fileName,
            folderName,
            filePath: rawPath,
            fileUrl,
            fileType,
            fileSizeBytes,
            fileSize: formatBytes(fileSizeBytes),
            uploadDate,
            status: "Active",
            source: "cloud",
            etag: String(item?.httpEtag || item?.etag || "").trim() || null,
            version: String(item?.version || "").trim() || null,
            storageClass: String(item?.storageClass || "").trim() || "Standard",
            checksum:
              item?.checksums && typeof item.checksums === "object"
                ? Object.values(item.checksums)
                    .map((value) => String(value || "").trim())
                    .filter(Boolean)
                    .join(", ") || null
                : null,
          };
        })
        .filter(Boolean);
    } catch (error) {
      attemptFailures.push({
        url: attempt.url,
        status: "request_failed",
        statusText: error?.message || "Request failed",
      });
      // Try next listing strategy.
    }
  }

  const cloudListError = new Error(
    "Unable to fetch file listing from Cloudflare store",
  );
  cloudListError.details = attemptFailures.slice(0, 12);
  throw cloudListError;
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

const downloadFromCloudflareStore = async ({
  storeUrl,
  password,
  objectPath,
  fallbackUrl,
}) => {
  const cleanedStoreUrl = String(storeUrl || "").replace(/\/+$/, "");
  const cleanedPath = String(objectPath || "").replace(/^\/+/, "");
  const commonHeaders = {
    "x-upload-password": password,
    "x-api-key": password,
    "x-password": password,
    Authorization: `Bearer ${password}`,
  };

  const directUrl = `${cleanedStoreUrl}/${cleanedPath}`;
  const directResponse = await fetch(directUrl, {
    method: "GET",
    headers: commonHeaders,
  });

  if (directResponse.ok) {
    const mimeType =
      String(directResponse.headers.get("content-type") || "").trim() ||
      guessMimeTypeFromFileName(cleanedPath.split("/").pop() || "");
    return {
      buffer: Buffer.from(await directResponse.arrayBuffer()),
      mimeType,
    };
  }

  const publicUrl = String(fallbackUrl || "").trim();
  if (publicUrl) {
    const fallbackResponse = await fetch(publicUrl, {
      method: "GET",
    });
    if (fallbackResponse.ok) {
      const mimeType =
        String(fallbackResponse.headers.get("content-type") || "").trim() ||
        guessMimeTypeFromFileName(cleanedPath.split("/").pop() || "");
      return {
        buffer: Buffer.from(await fallbackResponse.arrayBuffer()),
        mimeType,
      };
    }
  }

  const directBody = await directResponse.text().catch(() => "");
  throw new Error(
    `Unable to read source file from Cloudflare. GET: ${directResponse.status} ${directBody || ""}`,
  );
};

const renameInCloudflareStore = async ({
  storeUrl,
  publicDomain,
  password,
  fromPath,
  toPath,
  currentFileUrl,
}) => {
  const cleanedStoreUrl = String(storeUrl || "").replace(/\/+$/, "");
  const sourcePath = String(fromPath || "").replace(/^\/+/, "");
  const targetPath = String(toPath || "").replace(/^\/+/, "");

  if (!cleanedStoreUrl || !password || !sourcePath || !targetPath) {
    throw new Error("Cloudflare rename settings are invalid");
  }

  if (sourcePath.toLowerCase() === targetPath.toLowerCase()) {
    return {
      fileUrl:
        buildPublicUrl(publicDomain, targetPath) ||
        `${cleanedStoreUrl}/${targetPath}`,
    };
  }
  // This worker contract does not expose a dedicated rename route.
  // Rename is implemented as copy old -> new and delete old.
  const source = await downloadFromCloudflareStore({
    storeUrl: cleanedStoreUrl,
    password,
    objectPath: sourcePath,
    fallbackUrl: currentFileUrl,
  });

  const uploaded = await uploadToCloudflareStore({
    storeUrl: cleanedStoreUrl,
    publicDomain,
    password,
    objectPath: targetPath,
    mimeType: source.mimeType,
    fileBuffer: source.buffer,
  });

  await deleteFromCloudflareStore({
    storeUrl: cleanedStoreUrl,
    password,
    objectPath: sourcePath,
  });

  // Do not hard-fail here because some edge workers can show short-lived
  // stale reads immediately after delete. Final verification happens in PUT flow.

  return {
    fileUrl:
      uploaded.fileUrl ||
      buildPublicUrl(publicDomain, targetPath) ||
      `${cleanedStoreUrl}/${targetPath}`,
  };
};

const doesCloudObjectExist = async ({ storeUrl, password, objectPath }) => {
  const cleanedStoreUrl = String(storeUrl || "").replace(/\/+$/, "");
  const cleanedPath = String(objectPath || "").replace(/^\/+/, "");
  if (!cleanedStoreUrl || !password || !cleanedPath) {
    return false;
  }

  const commonHeaders = {
    "x-upload-password": password,
    "x-api-key": password,
    "x-password": password,
    Authorization: `Bearer ${password}`,
  };

  const targetUrl = `${cleanedStoreUrl}/${cleanedPath}`;

  const headResponse = await fetch(targetUrl, {
    method: "HEAD",
    headers: commonHeaders,
  }).catch(() => null);

  if (headResponse?.ok) {
    return true;
  }

  const getResponse = await fetch(targetUrl, {
    method: "GET",
    headers: commonHeaders,
  }).catch(() => null);

  return Boolean(getResponse?.ok);
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
  const commonHeaders = {
    "Content-Type": "application/octet-stream",
    "x-upload-password": password,
    "x-api-key": password,
    "x-password": password,
    Authorization: `Bearer ${password}`,
  };

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
        source = "mongodb",
        search,
        folderName,
        fileType,
        fileSize,
        filter,
        uploadDate_start,
        uploadDate_end,
        sortBy = "uploadDate",
        sortOrder = "desc",
      } = event.queryStringParameters || {};

      let cloudFallbackMeta = null;

      if (String(source || "").toLowerCase() === "cloud") {
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

        let allCloudRows = null;
        const cloudCacheKey = getCloudCacheKey(
          cloudflareSettings.storeUrl,
          cloudflareSettings.password,
        );
        const cachedRows = getCachedCloudRows(cloudCacheKey);

        try {
          if (cachedRows) {
            allCloudRows = cachedRows;
          } else {
            allCloudRows = await listFromCloudflareStore({
              storeUrl: cloudflareSettings.storeUrl,
              password: cloudflareSettings.password,
              publicDomain: cloudflareSettings.publicDomain,
            });
            setCachedCloudRows(cloudCacheKey, allCloudRows);
          }
        } catch (cloudListError) {
          cloudFallbackMeta = {
            message: cloudListError?.message || "Cloudflare listing failed",
            attempts: Array.isArray(cloudListError?.details)
              ? cloudListError.details
              : [],
          };
          console.warn(
            "Cloudflare listing failed. Falling back to MongoDB source:",
            cloudListError.message,
          );
        }

        if (!Array.isArray(allCloudRows)) {
          allCloudRows = null;
        }

        if (!allCloudRows) {
          // Continue to MongoDB flow below without returning 500.
        } else {
          let filtered = [...allCloudRows];

          if (id) {
            const single = filtered.find(
              (row) =>
                String(row.id) === String(id) || String(row._id) === String(id),
            );
            if (!single) {
              return createResponse(
                404,
                { error: "File record not found" },
                origin,
              );
            }
            return createResponse(200, single, origin);
          }

          if (folderName && folderName !== "All") {
            filtered = filtered.filter(
              (row) =>
                String(row.folderName || "") === String(folderName).trim(),
            );
          }

          if (fileType && fileType !== "All") {
            filtered = filtered.filter(
              (row) => String(row.fileType || "") === String(fileType).trim(),
            );
          }

          if (fileSize && fileSize !== "All") {
            const sizeTerm = String(fileSize).toLowerCase().trim();
            filtered = filtered.filter((row) => {
              const sizeText = String(row.fileSize || "").toLowerCase();
              const sizeBytesText = String(
                row.fileSizeBytes || "",
              ).toLowerCase();
              return (
                sizeText.includes(sizeTerm) || sizeBytesText.includes(sizeTerm)
              );
            });
          }

          if (filter && filter !== "total") {
            filtered = filtered.filter(
              (row) => getFileCategory(row) === filter,
            );
          }

          if (search) {
            const term = String(search).toLowerCase();
            filtered = filtered.filter((row) =>
              [
                row.fileName,
                row.originalName,
                row.folderName,
                row.fileType,
                row.filePath,
              ]
                .map((value) => String(value || "").toLowerCase())
                .some((value) => value.includes(term)),
            );
          }

          if (uploadDate_start || uploadDate_end) {
            const start = uploadDate_start
              ? new Date(`${uploadDate_start}T00:00:00.000Z`).getTime()
              : null;
            const end = uploadDate_end
              ? new Date(`${uploadDate_end}T23:59:59.999Z`).getTime()
              : null;
            filtered = filtered.filter((row) => {
              const ts = row.uploadDate
                ? new Date(row.uploadDate).getTime()
                : NaN;
              if (!Number.isFinite(ts)) return false;
              if (start && ts < start) return false;
              if (end && ts > end) return false;
              return true;
            });
          }

          const sortDirectionNum = sortOrder === "asc" ? 1 : -1;
          filtered.sort((a, b) => {
            const av = a?.[sortBy];
            const bv = b?.[sortBy];

            if (av == null && bv == null) return 0;
            if (av == null) return 1;
            if (bv == null) return -1;

            if (typeof av === "number" && typeof bv === "number") {
              return (av - bv) * sortDirectionNum;
            }

            const aDate = new Date(av).getTime();
            const bDate = new Date(bv).getTime();
            if (Number.isFinite(aDate) && Number.isFinite(bDate)) {
              return (aDate - bDate) * sortDirectionNum;
            }

            return (
              String(av).localeCompare(String(bv), "en", {
                sensitivity: "base",
              }) * sortDirectionNum
            );
          });

          const pageNum = Number.parseInt(page, 10) || 1;
          const limitNum = Number.parseInt(limit, 10) || 10;
          const skip = (pageNum - 1) * limitNum;
          const totalRecords = filtered.length;
          const rows = filtered.slice(skip, skip + limitNum);

          const folderSet = new Set();
          const typeSet = new Set();
          const stats = {
            total: 0,
            documents: 0,
            images: 0,
            videos: 0,
            others: 0,
            totalSizeBytes: 0,
          };

          allCloudRows.forEach((row) => {
            const folder = String(row.folderName || "").trim();
            const fileTypeValue = String(row.fileType || "").trim();
            if (folder) folderSet.add(folder);
            if (fileTypeValue) typeSet.add(fileTypeValue);

            stats.total += 1;
            const category = getFileCategory(row);
            if (category === "documents") stats.documents += 1;
            else if (category === "images") stats.images += 1;
            else if (category === "videos") stats.videos += 1;
            else stats.others += 1;

            stats.totalSizeBytes += Number(row.fileSizeBytes) || 0;
          });

          const folderValues = [...folderSet].sort();
          const typeValues = [...typeSet].sort();

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
                total: stats.total,
                documents: stats.documents,
                images: stats.images,
                videos: stats.videos,
                others: stats.others,
                totalSizeBytes: stats.totalSizeBytes,
                totalSize: formatBytes(stats.totalSizeBytes),
              },
              filterOptions: {
                folderName: ["All", ...folderValues],
                fileType: ["All", ...typeValues],
              },
              meta: {
                source: "cloud",
              },
            },
            origin,
          );
        }
      }

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

      if (fileSize && fileSize !== "All") {
        const sizeTerm = String(fileSize).trim();
        query.$and = query.$and || [];
        query.$and.push({
          $or: [
            { fileSize: { $regex: escapeRegExp(sizeTerm), $options: "i" } },
            {
              fileSizeBytes: {
                $regex: escapeRegExp(sizeTerm),
                $options: "i",
              },
            },
          ],
        });
      }

      if (filter && filter !== "total") {
        const categoryCondition = getMongoCategoryCondition(String(filter));
        if (categoryCondition) {
          query.$and = query.$and || [];
          query.$and.push(categoryCondition);
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
        $and: [getMongoCategoryCondition("documents")],
      });
      const totalImages = await filesCollection.countDocuments({
        ...baseStatsQuery,
        $and: [getMongoCategoryCondition("images")],
      });
      const totalVideos = await filesCollection.countDocuments({
        ...baseStatsQuery,
        $and: [getMongoCategoryCondition("videos")],
      });
      const totalOthers = await filesCollection.countDocuments({
        ...baseStatsQuery,
        $and: [getMongoCategoryCondition("others")],
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
            images: totalImages,
            videos: totalVideos,
            others: totalOthers,
            totalSizeBytes: totalSizeAgg?.[0]?.totalSizeBytes || 0,
            totalSize: formatBytes(totalSizeAgg?.[0]?.totalSizeBytes || 0),
          },
          filterOptions: {
            folderName: ["All", ...folderValues.filter(Boolean).sort()],
            fileType: ["All", ...typeValues.filter(Boolean).sort()],
          },
          meta: {
            source:
              String(source || "").toLowerCase() === "cloud"
                ? "mongodb-fallback"
                : "mongodb",
            cloudFallbackReason: cloudFallbackMeta?.message || null,
            cloudFallbackAttempts: cloudFallbackMeta?.attempts || [],
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

        invalidateCloudListCache();

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

        invalidateCloudListCache();

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

      invalidateCloudListCache();

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

      if (String(id).startsWith("cloud:")) {
        const cloudPath = String(id)
          .slice("cloud:".length)
          .replace(/^\/+/, "")
          .trim();

        if (!cloudPath) {
          return createResponse(
            400,
            { error: "Invalid cloud file id" },
            origin,
          );
        }

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

        await deleteFromCloudflareStore({
          storeUrl: cloudflareSettings.storeUrl,
          password: cloudflareSettings.password,
          objectPath: cloudPath,
        });

        await filesCollection.updateMany(
          {
            filePath: { $regex: `^${escapeRegExp(cloudPath)}$`, $options: "i" },
            isDeleted: { $ne: true },
          },
          {
            $set: {
              isDeleted: true,
              deletedAt: new Date(),
              deletedByUserId: user.userId,
              updatedAt: new Date(),
            },
          },
        );

        invalidateCloudListCache();
        return createResponse(
          200,
          { message: "Cloud file deleted successfully" },
          origin,
        );
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
          invalidateCloudListCache();
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

      if (String(id).startsWith("cloud:")) {
        const decodedId = (() => {
          try {
            return decodeURIComponent(String(id));
          } catch {
            return String(id);
          }
        })();

        const oldPath = String(decodedId)
          .slice("cloud:".length)
          .replace(/^\/+/, "")
          .trim();
        if (!oldPath) {
          return createResponse(
            400,
            { error: "Invalid cloud file id" },
            origin,
          );
        }

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

        const oldSegments = oldPath.split("/").filter(Boolean);
        const oldFileName = oldSegments[oldSegments.length - 1] || "";
        const oldFolderName = oldSegments[0] || "general";

        const nextFileName = updates.fileName || oldFileName;
        const nextFolderName = updates.folderName || oldFolderName;
        const nextPath = `${ensureFolder(nextFolderName, "general")}/${safeFileName(nextFileName)}`;

        if (oldPath.toLowerCase() !== nextPath.toLowerCase()) {
          await assertNoExistingFilePath(filesCollection, nextPath);
        }

        const cloudCacheKey = getCloudCacheKey(
          cloudflareSettings.storeUrl,
          cloudflareSettings.password,
        );
        const cloudRows = getCachedCloudRows(cloudCacheKey) || [];

        const duplicateCloud =
          oldPath.toLowerCase() !== nextPath.toLowerCase() &&
          Array.isArray(cloudRows) &&
          cloudRows.some(
            (row) =>
              String(row.filePath || "").toLowerCase() ===
              nextPath.toLowerCase(),
          );
        if (duplicateCloud) {
          return createResponse(
            409,
            { error: `File already exists with name: ${nextPath}` },
            origin,
          );
        }

        const currentRow =
          cloudRows.find(
            (row) =>
              String(row.filePath || "").toLowerCase() ===
              oldPath.toLowerCase(),
          ) || null;

        const existingDbRecord = await filesCollection.findOne({
          filePath: { $regex: `^${escapeRegExp(oldPath)}$`, $options: "i" },
          isDeleted: { $ne: true },
        });

        let nextFileUrl =
          buildPublicUrl(cloudflareSettings.publicDomain, nextPath) ||
          `${cloudflareSettings.storeUrl}/${nextPath}`;

        if (oldPath.toLowerCase() !== nextPath.toLowerCase()) {
          const renameResult = await renameInCloudflareStore({
            storeUrl: cloudflareSettings.storeUrl,
            publicDomain: cloudflareSettings.publicDomain,
            password: cloudflareSettings.password,
            fromPath: oldPath,
            toPath: nextPath,
            currentFileUrl:
              currentRow?.fileUrl || existingDbRecord?.fileUrl || "",
          });
          nextFileUrl = renameResult.fileUrl || nextFileUrl;
        }

        await filesCollection.updateOne(
          {
            filePath: { $regex: `^${escapeRegExp(oldPath)}$`, $options: "i" },
            isDeleted: { $ne: true },
          },
          {
            $set: {
              fileName: safeFileName(nextFileName),
              folderName: ensureFolder(nextFolderName, "general"),
              filePath: nextPath,
              fileUrl: nextFileUrl,
              updatedAt: new Date(),
            },
          },
        );

        invalidateCloudListCache();

        return createResponse(
          200,
          {
            message: "Cloud file updated successfully",
            data: {
              _id: `cloud:${nextPath}`,
              id: `cloud:${nextPath}`,
              fileName: safeFileName(nextFileName),
              folderName: ensureFolder(nextFolderName, "general"),
              filePath: nextPath,
              fileUrl: nextFileUrl,
              fileType:
                currentRow?.fileType ||
                guessMimeTypeFromFileName(safeFileName(nextFileName)),
              fileSizeBytes: Number(currentRow?.fileSizeBytes || 0) || 0,
              fileSize:
                currentRow?.fileSize ||
                formatBytes(Number(currentRow?.fileSizeBytes || 0) || 0),
              uploadDate: currentRow?.uploadDate || new Date(),
              source: "cloud",
              status: "Active",
            },
          },
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

    if (
      String(error.message || "")
        .toLowerCase()
        .includes("rename")
    ) {
      return createResponse(
        409,
        {
          error: "Rename failed",
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
