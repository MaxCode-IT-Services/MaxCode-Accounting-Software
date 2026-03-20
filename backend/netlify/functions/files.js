import { verifyRequestToken } from "./utils/auth.js";

const getCorsHeaders = (origin) => {
  const allowedOrigins = [
    "https://billing.maxcode.in",
    "https://billing-dausa.netlify.app",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:5174",
  ];

  const corsOrigin = allowedOrigins.includes(origin) ? origin : "null";

  return {
    "Access-Control-Allow-Origin": corsOrigin,
    "Access-Control-Allow-Headers":
      "Content-Type, Authorization, x-cloud-store-url, x-cloud-public-domain, x-cloud-password, x-cloud-default-folder",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
    "Access-Control-Allow-Credentials": "true",
  };
};

const createResponse = (
  statusCode,
  body,
  origin = null,
  extraHeaders = {},
) => ({
  statusCode,
  headers: {
    ...getCorsHeaders(origin),
    ...extraHeaders,
  },
  body: JSON.stringify(body),
});

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

const getHeaderValue = (headers = {}, key = "") => {
  const lookupKey = String(key || "").toLowerCase();
  const matched = Object.keys(headers || {}).find(
    (item) => String(item || "").toLowerCase() === lookupKey,
  );
  return matched ? headers[matched] : "";
};

const getCloudflareSettingsFromEvent = (event = {}, body = {}) => {
  const query = event?.queryStringParameters || {};
  const headerSettings = {
    storeUrl: getHeaderValue(event?.headers, "x-cloud-store-url"),
    publicDomain: getHeaderValue(event?.headers, "x-cloud-public-domain"),
    password: getHeaderValue(event?.headers, "x-cloud-password"),
    defaultFolder: getHeaderValue(event?.headers, "x-cloud-default-folder"),
  };

  const querySettings = {
    storeUrl: query.storeUrl,
    publicDomain: query.publicDomain,
    password: query.password,
    defaultFolder: query.defaultFolder,
  };

  const bodySettings =
    body?.cloudflareSettings && typeof body.cloudflareSettings === "object"
      ? body.cloudflareSettings
      : {};

  return normalizeCloudflareSettings({
    ...querySettings,
    ...headerSettings,
    ...bodySettings,
  });
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
    mp3: "audio/mp3",
    doc: "documents",
    docx: "documents",
    xls: "excel",
    xlsx: "excel",
    csv: "text/csv",
    js: "javascript",
    wav: "audio/wav",
    apk: "apk",
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

export async function handler(event) {
  const origin = event.headers.origin || event.headers.Origin;

  if (event.httpMethod === "OPTIONS") {
    return createResponse(200, {}, origin);
  }

  try {
    verifyRequestToken(event);

    const query = event.queryStringParameters || {};
    const parsedBody = event.body ? JSON.parse(event.body) : {};
    const cloudflareSettings = getCloudflareSettingsFromEvent(
      event,
      parsedBody,
    );

    if (!cloudflareSettings?.storeUrl || !cloudflareSettings?.password) {
      return createResponse(
        400,
        {
          error:
            "Cloudflare settings are required in request (storeUrl/publicDomain/password/defaultFolder).",
        },
        origin,
      );
    }

    const cloudCacheKey = getCloudCacheKey(
      cloudflareSettings.storeUrl,
      cloudflareSettings.password,
    );

    const getCloudRows = async () => {
      const cachedRows = getCachedCloudRows(cloudCacheKey);
      if (cachedRows) return cachedRows;

      const rows = await listFromCloudflareStore({
        storeUrl: cloudflareSettings.storeUrl,
        password: cloudflareSettings.password,
        publicDomain: cloudflareSettings.publicDomain,
      });
      setCachedCloudRows(cloudCacheKey, rows);
      return rows;
    };

    const ensureCloudPathNotExists = async (targetPath) => {
      const allRows = await getCloudRows();
      const exists = allRows.some(
        (row) =>
          String(row?.filePath || "").toLowerCase() ===
          String(targetPath || "").toLowerCase(),
      );
      if (exists) {
        throw new Error(`File already exists with name: ${targetPath}`);
      }
    };

    if (event.httpMethod === "GET") {
      const {
        id,
        page = 1,
        limit = 10,
        search,
        folderName,
        fileType,
        fileSize,
        filter,
        uploadDate_start,
        uploadDate_end,
        export: exportFlag,
        sortBy = "uploadDate",
        sortOrder = "desc",
      } = query;

      const allCloudRows = await getCloudRows();
      let filtered = [...allCloudRows];

      if (id) {
        const normalizedId = String(id).trim();
        const normalizedPath = normalizedId.startsWith("cloud:")
          ? normalizedId.slice("cloud:".length)
          : normalizedId;
        const single = filtered.find(
          (row) =>
            String(row.id) === normalizedId ||
            String(row._id) === normalizedId ||
            String(row.filePath || "") === normalizedPath,
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
          (row) => String(row.folderName || "") === String(folderName).trim(),
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
          const sizeBytesText = String(row.fileSizeBytes || "").toLowerCase();
          return (
            sizeText.includes(sizeTerm) || sizeBytesText.includes(sizeTerm)
          );
        });
      }

      if (filter && filter !== "total") {
        filtered = filtered.filter((row) => getFileCategory(row) === filter);
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
          const ts = row.uploadDate ? new Date(row.uploadDate).getTime() : NaN;
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
      const shouldExportAll =
        String(exportFlag || "").toLowerCase() === "1" ||
        String(exportFlag || "").toLowerCase() === "true";
      const rows = shouldExportAll
        ? filtered
        : filtered.slice(skip, skip + limitNum);

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

      return createResponse(
        200,
        {
          data: rows,
          pagination: {
            page: shouldExportAll ? 1 : pageNum,
            limit: shouldExportAll ? totalRecords || limitNum : limitNum,
            totalRecords,
            totalPages: shouldExportAll
              ? 1
              : Math.ceil(totalRecords / limitNum),
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
            folderName: ["All", ...[...folderSet].sort()],
            fileType: ["All", ...[...typeSet].sort()],
          },
          meta: {
            source: "cloud-only",
          },
        },
        origin,
      );
    }

    if (event.httpMethod === "POST") {
      const body = parsedBody;
      const action = String(body.action || "upload")
        .trim()
        .toLowerCase();

      if (!["upload", "upload-files", "upload-folder"].includes(action)) {
        return createResponse(400, { error: "Unsupported action" }, origin);
      }

      const uploadDate = parseUploadDate(body.uploadDate);
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
        if (!requestedFileName || !fileDataBase64) {
          return createResponse(
            400,
            { error: "File name and file data are required" },
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

        await ensureCloudPathNotExists(objectPath);

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

        invalidateCloudListCache();

        return createResponse(
          201,
          {
            message: "File uploaded successfully",
            data: {
              _id: `cloud:${objectPath}`,
              id: `cloud:${objectPath}`,
              fileName,
              originalName,
              folderName,
              filePath: objectPath,
              fileUrl: uploadResult.fileUrl,
              fileType,
              fileSizeBytes: Number(body.fileSizeBytes) || fileBuffer.length,
              fileSize: formatBytes(
                Number(body.fileSizeBytes) || fileBuffer.length,
              ),
              uploadDate,
              source: "cloud",
              status: "Active",
            },
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
          .map((item) => ({
            fileName: safeFileName(item?.fileName || item?.originalName || ""),
            originalName: String(item?.originalName || "").trim(),
            fileDataBase64: String(item?.fileDataBase64 || "").trim(),
            fileType:
              String(item?.fileType || "application/octet-stream").trim() ||
              "application/octet-stream",
            fileSizeBytes: Number(item?.fileSizeBytes) || 0,
          }))
          .filter((item) => item.fileName && item.fileDataBase64);

        if (!preparedFiles.length) {
          return createResponse(400, { error: "No valid files found" }, origin);
        }

        const fullPaths = preparedFiles.map(
          (item) => `${folderName}/${item.fileName}`,
        );
        const seen = new Set();
        for (const path of fullPaths) {
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

        for (const path of fullPaths) {
          await ensureCloudPathNotExists(path);
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

          uploaded.push({
            _id: `cloud:${objectPath}`,
            id: `cloud:${objectPath}`,
            fileName: item.fileName,
            originalName: item.originalName || item.fileName,
            folderName,
            filePath: objectPath,
            fileUrl: uploadResult.fileUrl,
            fileType: item.fileType,
            fileSizeBytes: item.fileSizeBytes || fileBuffer.length,
            fileSize: formatBytes(item.fileSizeBytes || fileBuffer.length),
            uploadDate,
            source: "cloud",
            status: "Active",
          });
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
      if (!folderFiles.length) {
        return createResponse(
          400,
          { error: "Folder files are required" },
          origin,
        );
      }

      const preparedFiles = folderFiles
        .map((item) => ({
          relativePath: normalizeRelativePath(item?.relativePath || ""),
          fileDataBase64: String(item?.fileDataBase64 || "").trim(),
          fileType:
            String(item?.fileType || "application/octet-stream").trim() ||
            "application/octet-stream",
          originalName: String(item?.originalName || "").trim(),
          fileSizeBytes: Number(item?.fileSizeBytes) || 0,
        }))
        .filter((item) => item.relativePath && item.fileDataBase64);

      if (!preparedFiles.length) {
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
        await ensureCloudPathNotExists(path);
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

        uploaded.push({
          _id: `cloud:${objectPath}`,
          id: `cloud:${objectPath}`,
          fileName: safeFileName(objectPath.split("/").pop() || "file"),
          originalName:
            item.originalName || objectPath.split("/").pop() || "file",
          folderName,
          filePath: objectPath,
          fileUrl: uploadResult.fileUrl,
          fileType: item.fileType,
          fileSizeBytes: item.fileSizeBytes || fileBuffer.length,
          fileSize: formatBytes(item.fileSizeBytes || fileBuffer.length),
          uploadDate,
          source: "cloud",
          status: "Active",
        });
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
      const { id } = query;
      if (!id) {
        return createResponse(400, { error: "File id is required" }, origin);
      }

      const decodedId = (() => {
        try {
          return decodeURIComponent(String(id));
        } catch {
          return String(id);
        }
      })();
      const objectPath = decodedId.startsWith("cloud:")
        ? decodedId.slice("cloud:".length)
        : decodedId;

      const cleanedPath = String(objectPath || "")
        .replace(/^\/+/, "")
        .trim();
      if (!cleanedPath) {
        return createResponse(400, { error: "Invalid file id/path" }, origin);
      }

      await deleteFromCloudflareStore({
        storeUrl: cloudflareSettings.storeUrl,
        password: cloudflareSettings.password,
        objectPath: cleanedPath,
      });

      invalidateCloudListCache();
      return createResponse(
        200,
        { message: "File deleted successfully" },
        origin,
      );
    }

    if (event.httpMethod === "PUT") {
      const { id } = query;
      if (!id) {
        return createResponse(400, { error: "File id is required" }, origin);
      }

      const body = parsedBody;
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
      if (!Object.keys(updates).length) {
        return createResponse(
          400,
          { error: "No valid fields to update" },
          origin,
        );
      }

      const decodedId = (() => {
        try {
          return decodeURIComponent(String(id));
        } catch {
          return String(id);
        }
      })();
      const oldPath = decodedId.startsWith("cloud:")
        ? decodedId.slice("cloud:".length)
        : decodedId;

      const cleanedOldPath = String(oldPath || "")
        .replace(/^\/+/, "")
        .trim();
      if (!cleanedOldPath) {
        return createResponse(400, { error: "Invalid cloud file id" }, origin);
      }

      const allCloudRows = await getCloudRows();
      const currentRow =
        allCloudRows.find(
          (row) =>
            String(row.filePath || "").toLowerCase() ===
            cleanedOldPath.toLowerCase(),
        ) || null;

      if (
        !currentRow &&
        !(await doesCloudObjectExist({
          storeUrl: cloudflareSettings.storeUrl,
          password: cloudflareSettings.password,
          objectPath: cleanedOldPath,
        }))
      ) {
        return createResponse(404, { error: "File record not found" }, origin);
      }

      const oldSegments = cleanedOldPath.split("/").filter(Boolean);
      const oldFileName = oldSegments[oldSegments.length - 1] || "";
      const oldFolderName = oldSegments[0] || "general";
      const nextFileName = updates.fileName || oldFileName;
      const nextFolderName = updates.folderName || oldFolderName;
      const nextPath = `${ensureFolder(nextFolderName, "general")}/${safeFileName(nextFileName)}`;

      if (cleanedOldPath.toLowerCase() !== nextPath.toLowerCase()) {
        const duplicateCloud = allCloudRows.some(
          (row) =>
            String(row.filePath || "").toLowerCase() === nextPath.toLowerCase(),
        );
        if (duplicateCloud) {
          return createResponse(
            409,
            { error: `File already exists with name: ${nextPath}` },
            origin,
          );
        }
      }

      let nextFileUrl =
        buildPublicUrl(cloudflareSettings.publicDomain, nextPath) ||
        `${cloudflareSettings.storeUrl}/${nextPath}`;

      if (cleanedOldPath.toLowerCase() !== nextPath.toLowerCase()) {
        const renameResult = await renameInCloudflareStore({
          storeUrl: cloudflareSettings.storeUrl,
          publicDomain: cloudflareSettings.publicDomain,
          password: cloudflareSettings.password,
          fromPath: cleanedOldPath,
          toPath: nextPath,
          currentFileUrl: currentRow?.fileUrl || "",
        });
        nextFileUrl = renameResult.fileUrl || nextFileUrl;
      }

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
