import axios from "axios";

const GET_REQUEST_CACHE_TTL_MS = {
  "/years": 60000,
  "/user-preferences": 300000,
  "/business-settings": 30000,
};
const USER_PREFERENCES_POST_DEDUPE_MS = 60000;

const inflightGetRequests = new Map();
const getResponseCache = new Map();
let lastUserPreferencesPostSignature = "";
let lastUserPreferencesPostAt = 0;

const stableStringify = (value) => {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== "object") return JSON.stringify(value);

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const keys = Object.keys(value).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
};

const normalizePathFromUrl = (url) => {
  const rawUrl = String(url || "").trim();
  if (!rawUrl) return "";

  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
    try {
      return new URL(rawUrl).pathname || "";
    } catch {
      return rawUrl.split("?")[0] || rawUrl;
    }
  }

  return rawUrl.split("?")[0] || rawUrl;
};

const normalizeUrlForRequestKey = (url) => {
  const rawUrl = String(url || "").trim();
  if (!rawUrl) return "";

  if (rawUrl.startsWith("http://") || rawUrl.startsWith("https://")) {
    try {
      const parsed = new URL(rawUrl);
      return `${parsed.pathname || ""}${parsed.search || ""}`;
    } catch {
      return rawUrl;
    }
  }

  return rawUrl;
};

const buildGetRequestKey = (url, config = {}) => {
  const normalizedUrl = normalizeUrlForRequestKey(url);
  const paramsSignature = stableStringify(config?.params || {});
  return `GET|${normalizedUrl}|${paramsSignature}`;
};

const getCacheTtlForPath = (path = "") => {
  return GET_REQUEST_CACHE_TTL_MS[path] || 0;
};

const shouldCacheGetRequest = (url, config = {}) => {
  if (config?.cache === false) return false;
  if (
    String(url || "")
      .toLowerCase()
      .includes("action=reveal-secret")
  ) {
    return false;
  }
  const path = normalizePathFromUrl(url);
  return getCacheTtlForPath(path) > 0;
};

const invalidateGetCacheByPath = (path = "") => {
  if (!path) return;

  for (const key of getResponseCache.keys()) {
    if (key.includes(`|${path}|`)) {
      getResponseCache.delete(key);
    }
  }
};

const isUserPreferencesPath = (url) => {
  const path = normalizePathFromUrl(url);
  return path === "/user-preferences";
};

const getCachedGetResponse = (url, config = {}) => {
  const requestKey = buildGetRequestKey(url, config);
  const cachedEntry = getResponseCache.get(requestKey);
  if (!cachedEntry) return null;
  if (cachedEntry.expiresAt <= Date.now()) {
    getResponseCache.delete(requestKey);
    return null;
  }
  return cachedEntry.response;
};

const isNoopUserPreferencesUpdate = (payload = {}) => {
  if (!payload || typeof payload !== "object") return false;

  const cachedPreferencesResponse = getCachedGetResponse("/user-preferences");
  const currentPreferences = cachedPreferencesResponse?.data;
  if (!currentPreferences || typeof currentPreferences !== "object") {
    return false;
  }

  const entries = Object.entries(payload);
  if (entries.length === 0) return true;

  return entries.every(([key, value]) => {
    return stableStringify(currentPreferences[key]) === stableStringify(value);
  });
};

const formatApiErrorForLog = (payload) => {
  if (typeof payload === "string") {
    return payload;
  }

  if (payload && typeof payload === "object") {
    if (typeof payload.error === "string" && payload.error.trim()) {
      return payload.error.trim();
    }
    if (typeof payload.message === "string" && payload.message.trim()) {
      return payload.message.trim();
    }

    try {
      return JSON.stringify(payload);
    } catch {
      return "Unserializable error payload";
    }
  }

  return "Unknown API error";
};

const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }

  if (import.meta.env.DEV) {
    return "http://localhost:8888/api";
  }

  return "/api";
};

// Create axios instance with default config
const api = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true, // Enable sending cookies and auth headers
});

api.interceptors.request.use((config) => {
  // Auth is handled via secure HttpOnly cookie.
  return config;
});

// Response interceptor to handle errors globally
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (axios.isCancel(error) || error?.code === "ERR_CANCELED") {
      return Promise.reject(error);
    }

    if (error?.code === "ECONNABORTED") {
      console.error("Request timeout:", error?.config?.url || "unknown-url");
      return Promise.reject(error);
    }

    // Handle different error scenarios
    if (error.response) {
      // Server responded with error status
      switch (error.response.status) {
        case 401:
          // Unauthorized - clear auth state and redirect to login
          clearAuth();
          if (window.location.pathname !== "/login") {
            window.location.href = "/login";
          }
          break;
        case 403:
          console.error("Access forbidden");
          break;
        case 404:
          console.error("Resource not found");
          break;
        case 500:
          console.error("Internal server error");
          break;
        default:
          console.error(
            `API request failed (${error.response.status}): ${formatApiErrorForLog(
              error.response.data,
            )}`,
          );
      }
    } else if (error.request) {
      // Request made but no response received
      console.error(
        "Network error - no response received:",
        error?.config?.url || "unknown-url",
      );
    } else {
      // Something else happened
      console.error("Error:", error.message);
    }

    return Promise.reject(error);
  },
);

// Export API methods
export default api;

// Convenience methods for common operations
export const apiGet = (url, config = {}) => {
  const requestKey = buildGetRequestKey(url, config);
  const shouldCache = shouldCacheGetRequest(url, config);
  const shouldDedupe = config?.dedupe !== false;
  const forceRefresh = config?.forceRefresh === true;

  if (shouldCache && !forceRefresh) {
    const cachedEntry = getResponseCache.get(requestKey);
    if (cachedEntry && cachedEntry.expiresAt > Date.now()) {
      return Promise.resolve(cachedEntry.response);
    }
    if (cachedEntry && cachedEntry.expiresAt <= Date.now()) {
      getResponseCache.delete(requestKey);
    }
  }

  if (shouldDedupe && inflightGetRequests.has(requestKey)) {
    return inflightGetRequests.get(requestKey);
  }

  const requestPromise = api.get(url, config).then((response) => {
    if (shouldCache) {
      const ttl = getCacheTtlForPath(normalizePathFromUrl(url));
      if (ttl > 0) {
        getResponseCache.set(requestKey, {
          response,
          expiresAt: Date.now() + ttl,
        });
      }
    }
    return response;
  });

  if (shouldDedupe) {
    inflightGetRequests.set(requestKey, requestPromise);
    requestPromise.finally(() => {
      inflightGetRequests.delete(requestKey);
    });
  }

  return requestPromise;
};

export const apiPost = (url, data = {}, config = {}) => {
  if (isUserPreferencesPath(url)) {
    if (isNoopUserPreferencesUpdate(data)) {
      return Promise.resolve({
        status: 200,
        statusText: "OK",
        data: { skippedNoChanges: true },
        headers: {},
        config,
        request: null,
      });
    }

    const signature = stableStringify(data || {});
    const now = Date.now();
    if (
      signature === lastUserPreferencesPostSignature &&
      now - lastUserPreferencesPostAt < USER_PREFERENCES_POST_DEDUPE_MS
    ) {
      return Promise.resolve({
        status: 200,
        statusText: "OK",
        data: { skippedDuplicate: true },
        headers: {},
        config,
        request: null,
      });
    }

    lastUserPreferencesPostSignature = signature;
    lastUserPreferencesPostAt = now;
  }

  const path = normalizePathFromUrl(url);
  return api.post(url, data, config).then((response) => {
    invalidateGetCacheByPath(path);
    return response;
  });
};

export const apiPut = (url, data = {}, config = {}) => {
  const path = normalizePathFromUrl(url);
  return api.put(url, data, config).then((response) => {
    invalidateGetCacheByPath(path);
    return response;
  });
};

export const apiPatch = (url, data = {}, config = {}) => {
  const path = normalizePathFromUrl(url);
  return api.patch(url, data, config).then((response) => {
    invalidateGetCacheByPath(path);
    return response;
  });
};

export const apiDelete = (url, config = {}) => {
  const path = normalizePathFromUrl(url);
  return api.delete(url, config).then((response) => {
    invalidateGetCacheByPath(path);
    return response;
  });
};

// Compatibility helper retained for existing imports.
export const setAuthToken = (token) => {
  // Deprecated: token is intentionally not stored in localStorage.
  return token;
};

// Helper to get current token
export const getAuthToken = () => {
  return null;
};

let verifySessionPromise = null;
let lastVerifiedAt = 0;
let lastVerifiedResult = false;
const VERIFY_CACHE_TTL_MS = 15000;

export const markSessionAuthenticated = (user = null, token = null) => {
  localStorage.setItem("maxcode_auth", "true");
  if (user) {
    localStorage.setItem("user_info", JSON.stringify(user));
  }
  if (token) {
    setAuthToken(token);
  }

  lastVerifiedResult = true;
  lastVerifiedAt = Date.now();
};

export const verifyServerSession = async () => {
  const now = Date.now();

  if (now - lastVerifiedAt < VERIFY_CACHE_TTL_MS) {
    return lastVerifiedResult;
  }

  if (verifySessionPromise) {
    return verifySessionPromise;
  }

  verifySessionPromise = (async () => {
    try {
      const response = await api.get("/auth", {
        params: { action: "verify" },
      });

      const isValidSession =
        response.status === 200 && response.data?.authenticated === true;

      if (isValidSession) {
        markSessionAuthenticated(response.data?.user || null);
        return true;
      }

      clearAuth();
      localStorage.removeItem("user_info");
      lastVerifiedResult = false;
      lastVerifiedAt = Date.now();
      return false;
    } catch (error) {
      clearAuth();
      localStorage.removeItem("user_info");
      lastVerifiedResult = false;
      lastVerifiedAt = Date.now();
      return false;
    }
  })();

  try {
    return await verifySessionPromise;
  } finally {
    verifySessionPromise = null;
  }
};

// Helper to clear all auth data
export const clearAuth = () => {
  localStorage.removeItem("maxcode_auth");
  localStorage.removeItem("business_settings");
};
