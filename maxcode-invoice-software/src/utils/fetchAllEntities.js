import { apiGet } from "./api";
import API_ENDPOINTS from "./apiEndpoints";

const MAX_PAGES = 500;

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
  pageSize = 200,
}) => {
  const allRows = [];
  let page = 1;

  for (let attempts = 0; attempts < MAX_PAGES; attempts += 1) {
    const separator = endpoint.includes("?") ? "&" : "?";
    const response = await apiGet(
      `${endpoint}${separator}page=${page}&limit=${pageSize}`,
    );

    const payload = response?.data;
    const rows = extractRows(payload, fallbackKeys);
    allRows.push(...rows);

    const totalPages = Number(payload?.pagination?.totalPages || 0);
    const totalRecords = Number(payload?.pagination?.totalRecords || 0);

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
};

export const fetchAllClients = async () => {
  return fetchAllPaginatedEntities({
    endpoint: API_ENDPOINTS.CLIENTS.LIST,
    fallbackKeys: ["clients"],
  });
};

export const fetchAllVendors = async () => {
  return fetchAllPaginatedEntities({
    endpoint: API_ENDPOINTS.VENDORS.LIST,
    fallbackKeys: ["vendors"],
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
