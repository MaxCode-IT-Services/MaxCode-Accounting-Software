import { apiGet } from "./api";
import API_ENDPOINTS from "./apiEndpoints";

const MAX_PAGES = 500;
const CACHE_TTL_MS = 20 * 1000;
const SELECTABLE_LIMIT = 50;
const entityCache = new Map();

const extractRows = (payload, fallbackKeys = []) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;

  for (const key of fallbackKeys) {
    if (Array.isArray(payload?.[key])) {
      return payload[key];
    }
  }

  return [];
};

const uniqueById = (rows = []) => {
  const seen = new Set();
  const uniqueRows = [];

  rows.forEach((row) => {
    const key = String(row?._id || row?.id || "");
    if (!key || seen.has(key)) return;
    seen.add(key);
    uniqueRows.push(row);
  });

  return uniqueRows;
};

export const fetchAllPaginatedEntities = async ({
  endpoint,
  fallbackKeys = [],
  pageSize = 10,
  fetchAll = false,
  queryParams = {},
  useCache = true,
  forceRefresh = false,
}) => {
  const cacheKey = JSON.stringify({
    endpoint,
    fallbackKeys,
    pageSize,
    fetchAll,
    queryParams,
  });
  const now = Date.now();

  if (useCache && !forceRefresh) {
    const cached = entityCache.get(cacheKey);

    if (cached?.inFlightPromise) {
      return cached.inFlightPromise;
    }

    if (cached?.data && now - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
  }

  const allRows = [];
  let page = 1;

  const fetchPromise = (async () => {
    for (let attempts = 0; attempts < MAX_PAGES; attempts += 1) {
      const separator = endpoint.includes("?") ? "&" : "?";
      const mergedParams = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      });

      Object.entries(queryParams || {}).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") return;
        mergedParams.set(key, String(value));
      });

      const fullUrl = `${endpoint}${separator}${mergedParams.toString()}`;
      const response = await apiGet(fullUrl);
      const payload = response?.data;
      const rows = extractRows(payload, fallbackKeys);
      allRows.push(...rows);

      const totalPages = Number(payload?.pagination?.totalPages || 0);
      const totalRecords = Number(payload?.pagination?.totalRecords || 0);

      if (!fetchAll) {
        break;
      }

      if (totalPages > 0) {
        if (page >= totalPages) break;
        page += 1;
        continue;
      }

      if (totalRecords > 0) {
        if (allRows.length >= totalRecords) break;
        page += 1;
        continue;
      }

      if (rows.length < pageSize) {
        break;
      }

      page += 1;
    }

    return uniqueById(allRows);
  })();

  entityCache.set(cacheKey, {
    inFlightPromise: fetchPromise,
    timestamp: now,
    data: null,
  });

  try {
    const data = await fetchPromise;
    entityCache.set(cacheKey, {
      inFlightPromise: null,
      timestamp: Date.now(),
      data,
    });
    return data;
  } catch (error) {
    entityCache.delete(cacheKey);
    throw error;
  }
};

export const clearFetchAllEntitiesCache = () => {
  entityCache.clear();
};

export const fetchSelectableEntities = async ({
  endpoint,
  fallbackKeys = [],
  search = "",
  limit = SELECTABLE_LIMIT,
  queryParams = {},
  useCache = true,
  forceRefresh = false,
  signal,
}) => {
  const normalizedSearch = String(search || "").trim();
  const cacheKey = JSON.stringify({
    endpoint,
    fallbackKeys,
    normalizedSearch,
    limit,
    queryParams,
  });
  const now = Date.now();

  if (useCache && !forceRefresh) {
    const cached = entityCache.get(cacheKey);

    if (cached?.inFlightPromise) {
      return cached.inFlightPromise;
    }

    if (cached?.data && now - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }
  }

  const fetchPromise = (async () => {
    const separator = endpoint.includes("?") ? "&" : "?";
    const mergedParams = new URLSearchParams({
      page: "1",
      limit: String(limit),
    });

    if (normalizedSearch) {
      mergedParams.set("search", normalizedSearch);
    }

    Object.entries(queryParams || {}).forEach(([key, value]) => {
      if (value === undefined || value === null || value === "") return;
      mergedParams.set(key, String(value));
    });

    const response = await apiGet(
      `${endpoint}${separator}${mergedParams.toString()}`,
      signal ? { signal } : {},
    );

    return uniqueById(extractRows(response?.data, fallbackKeys));
  })();

  entityCache.set(cacheKey, {
    inFlightPromise: fetchPromise,
    timestamp: now,
    data: null,
  });

  try {
    const data = await fetchPromise;
    entityCache.set(cacheKey, {
      inFlightPromise: null,
      timestamp: Date.now(),
      data,
    });
    return data;
  } catch (error) {
    entityCache.delete(cacheKey);
    throw error;
  }
};

export const fetchSelectableClients = async (options = {}) => {
  return fetchSelectableEntities({
    endpoint: API_ENDPOINTS.CLIENTS.LIST,
    fallbackKeys: ["clients"],
    ...options,
  });
};

export const fetchSelectableVendors = async (options = {}) => {
  return fetchSelectableEntities({
    endpoint: API_ENDPOINTS.VENDORS.LIST,
    fallbackKeys: ["vendors"],
    ...options,
  });
};

export const fetchSelectableStaff = async (options = {}) => {
  return fetchSelectableEntities({
    endpoint: API_ENDPOINTS.STAFF.LIST,
    fallbackKeys: ["staff"],
    ...options,
  });
};

export const filterRowsBySearch = (rows = [], search = "", keys = []) => {
  const normalizedSearch = String(search || "")
    .trim()
    .toLowerCase();

  if (!normalizedSearch) return Array.isArray(rows) ? rows : [];

  return (Array.isArray(rows) ? rows : []).filter((row) =>
    (Array.isArray(keys) ? keys : []).some((key) => {
      const value = String(row?.[key] || "").toLowerCase();
      return value.includes(normalizedSearch);
    }),
  );
};

export const fetchAllClients = async (options = {}) => {
  return fetchAllPaginatedEntities({
    endpoint: API_ENDPOINTS.CLIENTS.LIST,
    fallbackKeys: ["clients"],
    fetchAll: true,
    ...options,
  });
};

export const fetchAllVendors = async (options = {}) => {
  return fetchAllPaginatedEntities({
    endpoint: API_ENDPOINTS.VENDORS.LIST,
    fallbackKeys: ["vendors"],
    fetchAll: true,
    ...options,
  });
};

export const filterActiveSelectableRows = (rows = []) => {
  return (Array.isArray(rows) ? rows : []).filter((row) => {
    if (row?.isDeleted === true) return false;

    const status = String(row?.status || "")
      .trim()
      .toLowerCase();
    if (!status) return true;

    return status === "active";
  });
};
