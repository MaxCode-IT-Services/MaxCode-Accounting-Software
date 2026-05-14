import React, { useState, useEffect, useRef, useMemo } from "react";
import { Player } from "@lottiefiles/react-lottie-player";
import ColumnSelectorOffcanvas from "./ColumnSelectorOffcanvas";
import AdvancedFilterOffcanvas from "./AdvancedFilterOffcanvas";
import ConfirmationModal from "./ConfirmationModal";
import { showSuccess, showError, showInfo } from "./ToastNotification";
import {
  getDataAccessScope,
  getStoredUserInfo,
  hasActionPermission,
} from "../utils/permissions";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
dayjs.extend(customParseFormat);

const DEFAULT_OWNERSHIP_FIELDS = [
  "userId",
  "createdBy",
  "createdById",
  "ownerId",
  "teamMemberId",
  "assignedUserId",
  "assignedTo",
  "addedBy",
  "authorId",
];

const CREATED_BY_DISPLAY_KEY = "createdByDisplay";
const CREATED_BY_NAME_FIELDS = [
  "createdByName",
  "creatorName",
  "createdByUserName",
  "addedByName",
  "ownerName",
  "userName",
  "createdBy",
  "addedBy",
];

const resolveCreatedByName = (record = {}) => {
  for (const field of CREATED_BY_NAME_FIELDS) {
    const value = record?.[field];

    if (value === null || value === undefined || value === "") {
      continue;
    }

    if (typeof value === "object") {
      const nested =
        value.name ||
        value.fullName ||
        value.displayName ||
        value.userName ||
        value.email ||
        value.phone;
      if (nested) return String(nested);
      continue;
    }

    return String(value);
  }

  return "-";
};

let cachedPdfLibsPromise = null;
let cachedXlsxLibPromise = null;
let devanagariFontBase64Promise = null;
let canvasDevanagariFontLoadPromise = null;

const EXPORT_FALLBACK_PAGE_SIZE = 500;
const EXPORT_MAX_PAGES = 200;
const PDF_WIDTH_MEASUREMENT_SAMPLE_SIZE = 350;
const PDF_CELL_PADDING_PX = 5;
const MM_PER_PX = 0.264583;
const PDF_EXPORT_SINGLE_PAGE_COLUMNS_MODE_KEY =
  "pdfExportSinglePageColumnsMode";
const EXPORT_PRESERVE_TEXT_COLOR_MODE_KEY = "exportPreserveTextColorMode";
const DEVANAGARI_FONT_NAME = "NotoSansDevanagari";
const DEVANAGARI_FONT_FILE = "NotoSansDevanagari-Regular.ttf";
const DEVANAGARI_FONT_URL = "/fonts/NotoSansDevanagari-Regular.ttf";

const loadPdfExportLibs = async () => {
  if (!cachedPdfLibsPromise) {
    cachedPdfLibsPromise = Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]).then(([jspdfModule, autoTableModule]) => ({
      jsPDF: jspdfModule.jsPDF,
      autoTable: autoTableModule.default,
    }));
  }

  return cachedPdfLibsPromise;
};

const loadXlsxLib = async () => {
  if (!cachedXlsxLibPromise) {
    cachedXlsxLibPromise = import("xlsx");
  }

  return cachedXlsxLibPromise;
};

const extractExportRows = (payload) => {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.rows)) return payload.rows;
  return [];
};

const extractRowIdentity = (row) =>
  String(
    row?._id || row?.id || row?.registrationNumber || row?.phoneNumber || "",
  );

const mergeRowsWithoutDuplicates = (baseRows = [], incomingRows = []) => {
  const merged = [...baseRows];
  const seen = new Set(baseRows.map(extractRowIdentity).filter(Boolean));

  incomingRows.forEach((row) => {
    const identity = extractRowIdentity(row);
    if (!identity) {
      merged.push(row);
      return;
    }

    if (!seen.has(identity)) {
      seen.add(identity);
      merged.push(row);
    }
  });

  return merged;
};

const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return window.btoa(binary);
};

const loadDevanagariFontBase64 = async () => {
  if (!devanagariFontBase64Promise) {
    devanagariFontBase64Promise = fetch(DEVANAGARI_FONT_URL)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Font download failed: ${response.status}`);
        }

        return response.arrayBuffer();
      })
      .then((buffer) => arrayBufferToBase64(buffer));
  }

  return devanagariFontBase64Promise;
};

const ensureCanvasDevanagariFontLoaded = async () => {
  if (canvasDevanagariFontLoadPromise) {
    return canvasDevanagariFontLoadPromise;
  }

  canvasDevanagariFontLoadPromise = (async () => {
    if (typeof document === "undefined" || !document.fonts) return;

    try {
      // Use a dedicated font-family name for canvas snapshots.
      const fontFace = new FontFace(
        "NotoSansDevanagariPdf",
        `url(${DEVANAGARI_FONT_URL}) format("truetype")`,
      );
      const loadedFont = await fontFace.load();
      document.fonts.add(loadedFont);
      await document.fonts.load('12px "NotoSansDevanagariPdf"');
    } catch {
      // Keep fallback chain active when custom font cannot load.
    }
  })();

  return canvasDevanagariFontLoadPromise;
};

const hasIndicCharacters = (value) =>
  /[\u0900-\u097F]/.test(String(value || ""));

const hasExportSensitiveCharacters = (value) =>
  /[\u0900-\u097F₹]/.test(String(value || ""));

const resolveExportTextColor = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized) return null;

  if (
    normalized === "active" ||
    /^\+/.test(normalized) ||
    /\bdr\b/.test(normalized)
  ) {
    return [25, 135, 84];
  }

  if (
    normalized === "inactive" ||
    normalized === "deactive" ||
    /^-/.test(normalized) ||
    /\bcr\b/.test(normalized)
  ) {
    return [220, 53, 69];
  }

  if (normalized === "pending") {
    return [255, 193, 7];
  }

  return null;
};

const buildUrlWithParams = (baseUrl, params) => {
  const separator = String(baseUrl).includes("?") ? "&" : "?";
  return `${baseUrl}${separator}${new URLSearchParams(params).toString()}`;
};

const parseJsonResponseOrThrow = async (response, requestUrl) => {
  const contentType = String(response.headers.get("content-type") || "");
  const rawText = await response.text();

  if (!response.ok) {
    throw new Error(`Export API failed (${response.status})`);
  }

  if (!contentType.toLowerCase().includes("application/json")) {
    const preview = rawText.slice(0, 80).trim().toLowerCase();
    const isHtml =
      preview.startsWith("<!doctype") || preview.startsWith("<html");
    if (isHtml) {
      throw new Error(
        `Export API returned HTML instead of JSON. Check exportApi route: ${requestUrl}`,
      );
    }
  }

  try {
    return JSON.parse(rawText);
  } catch {
    throw new Error("Export API returned invalid JSON");
  }
};

// Helper: fetch all filtered data for export (server-side)
async function fetchAllServerDataForExport({
  exportApi,
  filterParams,
  requestHeaders = {},
  onExportStart,
  onExportEnd,
}) {
  try {
    if (onExportStart) onExportStart();
    const mergedHeaders = {
      ...requestHeaders,
    };

    const baseParams = {
      ...filterParams,
      export: 1,
      page: 1,
      limit: EXPORT_FALLBACK_PAGE_SIZE,
    };
    const firstUrl = buildUrlWithParams(exportApi, baseParams);

    const firstRes = await fetch(firstUrl, {
      headers: mergedHeaders,
      credentials: "include",
    });
    const firstJson = await parseJsonResponseOrThrow(firstRes, firstUrl);

    let allRows = extractExportRows(firstJson);
    const pagination = firstJson?.pagination || {};
    const totalPages = Math.max(Number(pagination?.totalPages) || 1, 1);
    const totalRecords = Math.max(Number(pagination?.totalRecords) || 0, 0);
    const hasPaginationMeta =
      Number.isFinite(Number(pagination?.totalPages)) ||
      Number.isFinite(Number(pagination?.totalRecords));

    if (totalPages > 1 && allRows.length < totalRecords) {
      for (let page = 2; page <= totalPages; page += 1) {
        const nextUrl = buildUrlWithParams(exportApi, {
          ...baseParams,
          page,
        });
        const nextRes = await fetch(nextUrl, {
          headers: mergedHeaders,
          credentials: "include",
        });

        if (!nextRes.ok) break;
        const nextJson = await parseJsonResponseOrThrow(nextRes, nextUrl);
        const nextRows = extractExportRows(nextJson);
        if (!nextRows.length) break;
        allRows = mergeRowsWithoutDuplicates(allRows, nextRows);
      }
    }

    if (!hasPaginationMeta && allRows.length >= EXPORT_FALLBACK_PAGE_SIZE) {
      for (let page = 2; page <= EXPORT_MAX_PAGES; page += 1) {
        const nextUrl = buildUrlWithParams(exportApi, {
          ...baseParams,
          page,
        });
        const nextRes = await fetch(nextUrl, {
          headers: mergedHeaders,
          credentials: "include",
        });

        if (!nextRes.ok) break;
        const nextJson = await parseJsonResponseOrThrow(nextRes, nextUrl);
        const nextRows = extractExportRows(nextJson);
        if (!nextRows.length) break;

        const previousLength = allRows.length;
        allRows = mergeRowsWithoutDuplicates(allRows, nextRows);
        const hasGrown = allRows.length > previousLength;

        if (!hasGrown || nextRows.length < EXPORT_FALLBACK_PAGE_SIZE) {
          break;
        }
      }
    }

    if (onExportEnd) onExportEnd();
    return allRows;
  } catch (err) {
    if (onExportEnd) onExportEnd();
    throw err;
  }
}

const ReusableTable = ({
  onColumnFilterChange,
  // Core props
  columns = [],
  data = [],
  loading = false,
  totalRecords: propTotalRecords = 0,

  // Actions
  onEdit,
  onDelete,
  onView,
  onStatusToggle,
  onRefresh: propOnRefresh,

  // Server-side props
  serverSide = false,
  onServerSideSearch,
  onServerSideFilter,
  onServerSideSort,
  onServerSidePageChange,
  onServerSideRecordsPerPageChange,

  // Configuration
  showActions = true,
  actions = ["view", "edit", "delete", "status"],
  fixedColumns = ["sn", "action"],
  defaultVisibleColumns = [],
  columnsWithDropdownFilter = [],
  columnsWithDateFilter = [],
  filterOptions: propFilterOptions = {},
  tableTitle = "Records",
  skipDeleteConfirmation = false,

  // UI Controls
  showColumnSelector = true,
  showExport = true,
  showRefresh = true,
  showAdvancedFilter = true,
  showSearch = true,

  // Pagination
  currentPage: propCurrentPage = 1,
  recordsPerPage: propRecordsPerPage = 10,
  onPageChange,
  onRecordsPerPageChange,

  // Export options
  exportFileName = "export",
  exportTitle = "Report",
  exportApi = null,
  extraExportItems = [],
  exportRequestHeaders = {},
  permissionPage = null,
  dataOwnershipFields = [],
  ensureCreatedByColumn = false,
  createdByLabel = "Created By",

  // Optional expandable row support (opt-in)
  expandableRows = false,
  canExpandRow,
  isRowExpanded,
  renderExpandedRow,
  expandedRowClassName = "bg-light",
  onToggleExpandRow,
  showExpandToggleInSn = false,

  // Additional
  customActions,
  getBadgeClass,
  onFilteredDataChange,

  // Card filter
  activeCardFilter,
  cards,
  moduleKey = null,
}) => {
  const effectiveColumns = useMemo(() => {
    const nextColumns = Array.isArray(columns) ? [...columns] : [];
    const alreadyExists = nextColumns.some(
      (column) => column?.key === CREATED_BY_DISPLAY_KEY,
    );

    if (!ensureCreatedByColumn || alreadyExists) {
      return nextColumns;
    }

    const createdByColumn = {
      key: CREATED_BY_DISPLAY_KEY,
      label: createdByLabel,
      width: 180,
      sortable: true,
    };

    const createdDateTimeIndex = nextColumns.findIndex(
      (column) => column?.key === "createdDateTime",
    );
    if (createdDateTimeIndex !== -1) {
      nextColumns.splice(createdDateTimeIndex, 0, createdByColumn);
      return nextColumns;
    }

    const actionIndex = nextColumns.findIndex(
      (column) => column?.key === "action",
    );
    if (actionIndex === -1) {
      nextColumns.push(createdByColumn);
    } else {
      nextColumns.splice(actionIndex, 0, createdByColumn);
    }

    return nextColumns;
  }, [columns, ensureCreatedByColumn, createdByLabel]);

  const effectiveColumnsWithDropdownFilter = useMemo(() => {
    const base = Array.isArray(columnsWithDropdownFilter)
      ? [...columnsWithDropdownFilter]
      : [];

    if (ensureCreatedByColumn && !base.includes(CREATED_BY_DISPLAY_KEY)) {
      base.push(CREATED_BY_DISPLAY_KEY);
    }

    return base;
  }, [columnsWithDropdownFilter, ensureCreatedByColumn]);

  const prepareRecordsWithCreatedBy = (records = []) => {
    if (!Array.isArray(records)) return [];

    return records.map((record) => {
      if (!record || typeof record !== "object") {
        return record;
      }

      return {
        ...record,
        [CREATED_BY_DISPLAY_KEY]:
          record[CREATED_BY_DISPLAY_KEY] || resolveCreatedByName(record),
      };
    });
  };

  // State management

  // Filtering state
  const [columnFilters, setColumnFilters] = useState(() => {
    const filters = {};
    effectiveColumns.forEach((col) => {
      if (effectiveColumnsWithDropdownFilter.includes(col.key)) {
        filters[col.key] = ["All"];
      } else {
        filters[col.key] = "";
      }
    });
    return filters;
  });

  const [tableColumns, setTableColumns] = useState(effectiveColumns);
  const [allData, setAllData] = useState(prepareRecordsWithCreatedBy(data));
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const initialVisible = {};
    effectiveColumns.forEach((col) => {
      initialVisible[col.key] = fixedColumns.includes(col.key)
        ? true
        : defaultVisibleColumns.includes(col.key);
    });
    return initialVisible;
  });

  // Sorting state
  const [sortConfig, setSortConfig] = useState({
    key: null,
    direction: "normal",
  });

  // Date range filters
  const [dateFilters, setDateFilters] = useState(() => {
    const filters = {};
    columnsWithDateFilter.forEach((key) => {
      filters[key] = {
        startDate: "",
        endDate: "",
      };
    });
    return filters;
  });

  // Global search
  const [searchTerm, setSearchTerm] = useState("");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(propCurrentPage);
  const [recordsPerPage, setRecordsPerPage] = useState(propRecordsPerPage);

  // UI state
  const [pinnedColumns, setPinnedColumns] = useState({
    left: [],
    right: [],
  });
  const [resizing, setResizing] = useState({
    isResizing: false,
    columnKey: null,
    startX: 0,
    startWidth: 0,
  });
  const [dragging, setDragging] = useState({
    isDragging: false,
    columnKey: null,
    startX: 0,
    startIndex: 0,
  });
  const [showColumnSelectorOffcanvas, setShowColumnSelectorOffcanvas] =
    useState(false);
  const [showFilterOffcanvas, setShowFilterOffcanvas] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [showAllPages, setShowAllPages] = useState(false);
  const [originalWidths, setOriginalWidths] = useState({});
  const [currentColumnFilter, setCurrentColumnFilter] = useState(null);
  const [openFilterDropdown, setOpenFilterDropdown] = useState(null);
  const [dropdownPosition, setDropdownPosition] = useState({
    top: 0,
    left: 0,
    width: 300,
  });
  const [filterSearchTerm, setFilterSearchTerm] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [modalConfig, setModalConfig] = useState({
    action: null,
    recordId: null,
    recordData: null,
    currentStatus: null,
  });

  // Debounce timer for search
  const searchDebounceTimer = useRef(null);

  const tableRef = useRef(null);
  const headerRowRef = useRef(null);
  const tableContainerRef = useRef(null);
  const dropdownRefs = useRef({});
  const onFilteredDataChangeRef = useRef(onFilteredDataChange);
  const prevSortedDataRef = useRef(null);

  const storedUserInfo = useMemo(() => getStoredUserInfo(), []);
  const resolvedDataScope = useMemo(() => {
    if (!moduleKey) return "all";
    return getDataAccessScope(moduleKey, storedUserInfo, permissionPage);
  }, [moduleKey, storedUserInfo, permissionPage]);
  const currentUserId =
    storedUserInfo?.id ||
    storedUserInfo?._id ||
    storedUserInfo?.userId ||
    storedUserInfo?.teamMemberId ||
    null;
  const ownershipFields =
    Array.isArray(dataOwnershipFields) && dataOwnershipFields.length > 0
      ? dataOwnershipFields
      : DEFAULT_OWNERSHIP_FIELDS;

  const isRecordOwnedByCurrentUser = (record) => {
    if (resolvedDataScope !== "self") return true;
    if (!currentUserId) return false;

    const userIdString = String(currentUserId);

    const matchesValue = (value) => {
      if (value === null || value === undefined || value === "") {
        return false;
      }

      if (Array.isArray(value)) {
        return value.some(matchesValue);
      }

      if (typeof value === "object") {
        return [
          value.id,
          value._id,
          value.userId,
          value.teamMemberId,
          value.createdBy,
        ].some(matchesValue);
      }

      return String(value) === userIdString;
    };

    return ownershipFields.some((field) => matchesValue(record?.[field]));
  };

  const applyDataScopeToRecords = (records = []) => {
    if (!Array.isArray(records)) return [];
    if (resolvedDataScope !== "self") return records;
    return records.filter((record) => isRecordOwnedByCurrentUser(record));
  };

  const appendDataScopeToFilters = (filterParams = {}) => {
    if (resolvedDataScope === "self") {
      return { ...filterParams, dataScope: "self" };
    }

    return filterParams;
  };

  const getServerFilterKey = (key) => {
    if (key === CREATED_BY_DISPLAY_KEY) return "createdBy";
    return key;
  };

  const getClientFilterKey = (key) => {
    if (key === "createdBy") return CREATED_BY_DISPLAY_KEY;
    return key;
  };

  const normalizeFilterOptionsForTable = (rawOptions = {}) => {
    const normalized = {};

    Object.entries(rawOptions || {}).forEach(([rawKey, rawValues]) => {
      const clientKey = getClientFilterKey(rawKey);
      const safeValues = Array.isArray(rawValues) ? rawValues : [];
      const valuesWithoutAll = safeValues
        .filter(
          (value) => value !== null && value !== undefined && value !== "",
        )
        .map((value) => String(value))
        .filter((value) => value !== "All");

      const existingValues = Array.isArray(normalized[clientKey])
        ? normalized[clientKey].filter((value) => value !== "All")
        : [];

      normalized[clientKey] = [
        "All",
        ...Array.from(new Set([...existingValues, ...valuesWithoutAll])),
      ];
    });

    return normalized;
  };

  const canRead = moduleKey
    ? hasActionPermission(moduleKey, "read", null, permissionPage)
    : true;
  const canShowTableData = moduleKey
    ? hasActionPermission(moduleKey, "showTableData", null, permissionPage)
    : true;
  const canUpdate = moduleKey
    ? hasActionPermission(moduleKey, "update", null, permissionPage)
    : true;
  const canDelete = moduleKey
    ? hasActionPermission(moduleKey, "delete", null, permissionPage)
    : true;
  const canExport = moduleKey
    ? hasActionPermission(moduleKey, "export", null, permissionPage) &&
      canShowTableData
    : true;

  const isSortableColumn = (column) => {
    if (!column) return false;
    if (column.key === "action") return false;
    if (column.sortable === false || column.disableSort === true) return false;
    return true;
  };

  const isFilterableColumn = (column) => {
    if (!column) return false;
    if (column.key === "action" || column.key === "sn") return false;
    if (column.filterable === false || column.disableFilter === true) {
      return false;
    }
    return true;
  };

  const getDisabledActionStyle = (isAllowed) => ({
    opacity: isAllowed ? 1 : 0.5,
    cursor: isAllowed ? "pointer" : "not-allowed",
  });

  // Update callback ref
  useEffect(() => {
    onFilteredDataChangeRef.current = onFilteredDataChange;
  }, [onFilteredDataChange]);

  // Update allData when data prop changes
  useEffect(() => {
    setAllData(prepareRecordsWithCreatedBy(data));
  }, [data]);

  // Keep internal table column definitions in sync with latest prop renderers.
  // Preserve user-resized widths when possible so UX stays consistent.
  useEffect(() => {
    setTableColumns((prevColumns) => {
      const previousByKey = new Map(
        (Array.isArray(prevColumns) ? prevColumns : []).map((col) => [
          col.key,
          col,
        ]),
      );

      return effectiveColumns.map((column) => {
        const previous = previousByKey.get(column.key);
        if (!previous) return column;

        return {
          ...column,
          width:
            previous.width !== undefined && previous.width !== null
              ? previous.width
              : column.width,
        };
      });
    });
  }, [effectiveColumns]);

  useEffect(() => {
    setVisibleColumns((prev) => {
      const next = { ...prev };
      let changed = false;

      effectiveColumns.forEach((col) => {
        if (next[col.key] === undefined) {
          next[col.key] =
            fixedColumns.includes(col.key) ||
            defaultVisibleColumns.includes(col.key);
          changed = true;
        }
      });

      Object.keys(next).forEach((key) => {
        const exists = effectiveColumns.some((column) => column.key === key);
        if (!exists) {
          delete next[key];
          changed = true;
        }
      });

      return changed ? next : prev;
    });
  }, [effectiveColumns, fixedColumns, defaultVisibleColumns]);

  // Update currentPage when prop changes
  useEffect(() => {
    setCurrentPage(propCurrentPage);
  }, [propCurrentPage]);

  // Update recordsPerPage when prop changes
  useEffect(() => {
    setRecordsPerPage(propRecordsPerPage);
  }, [propRecordsPerPage]);

  // Dynamic filter options
  const [dynamicFilterOptions, setDynamicFilterOptions] = useState(() => {
    const normalizedPropFilterOptions =
      normalizeFilterOptionsForTable(propFilterOptions);

    if (serverSide) {
      return normalizedPropFilterOptions;
    }

    const options = {};
    effectiveColumnsWithDropdownFilter.forEach((key) => {
      options[key] = ["All"];
    });

    return { ...normalizedPropFilterOptions, ...options };
  });

  // Helper function to parse date
  const parseDate = (dateStr) => {
    if (!dateStr) return null;

    if (dayjs(dateStr, "DD-MM-YYYY | hh:mm:ss A", true).isValid()) {
      return dayjs(dateStr, "DD-MM-YYYY | hh:mm:ss A", true).toDate();
    }
    if (dayjs(dateStr, "DD-MM-YYYY", true).isValid()) {
      return dayjs(dateStr, "DD-MM-YYYY", true).toDate();
    }
    // Backward compatibility for old stored values.
    if (dayjs(dateStr, "DD/MM/YYYY | hh:mm:ss A", true).isValid()) {
      return dayjs(dateStr, "DD/MM/YYYY | hh:mm:ss A", true).toDate();
    }
    if (dayjs(dateStr, "DD/MM/YYYY", true).isValid()) {
      return dayjs(dateStr, "DD/MM/YYYY", true).toDate();
    }
    if (dayjs(dateStr).isValid()) {
      return dayjs(dateStr).toDate();
    }
    return null;
  };

  // Helper function to format date for display
  const formatDateForDisplay = (dateString) => {
    if (!dateString) return "";

    try {
      if (
        typeof dateString === "string" &&
        (/^\d{2}-\d{2}-\d{4}$/.test(dateString) ||
          /^\d{2}\/\d{2}\/\d{4}$/.test(dateString))
      ) {
        return dateString.replace(/\//g, "-");
      }

      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        const day = String(date.getDate()).padStart(2, "0");
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
      }

      return dateString;
    } catch (e) {
      return dateString;
    }
  };

  // Update filter options based on data (for client-side)
  useEffect(() => {
    const scopedData = applyDataScopeToRecords(allData);

    if (serverSide) {
      const normalizedPropFilterOptions =
        normalizeFilterOptionsForTable(propFilterOptions);
      const mergedOptions = { ...normalizedPropFilterOptions };

      effectiveColumnsWithDropdownFilter.forEach((key) => {
        const fromServer = Array.isArray(mergedOptions[key])
          ? mergedOptions[key].filter((value) => value !== "All")
          : [];

        const fromData = Array.from(
          new Set(
            scopedData
              .map((record) => record?.[key])
              .filter(
                (value) =>
                  value !== null && value !== undefined && value !== "",
              )
              .map((value) => String(value)),
          ),
        ).sort();

        const sourceValues = fromServer.length > 0 ? fromServer : fromData;
        mergedOptions[key] = ["All", ...Array.from(new Set(sourceValues))];
      });

      setDynamicFilterOptions((prevOptions) => {
        const hasChanged =
          JSON.stringify(prevOptions) !== JSON.stringify(mergedOptions);
        return hasChanged ? mergedOptions : prevOptions;
      });
      return;
    }

    const normalizedPropFilterOptions =
      normalizeFilterOptionsForTable(propFilterOptions);

    if (!serverSide && scopedData.length > 0) {
      const newOptions = { ...normalizedPropFilterOptions };

      effectiveColumnsWithDropdownFilter.forEach((key) => {
        const uniqueValues = Array.from(
          new Set(
            scopedData
              .map((r) => r[key])
              .filter((val) => val !== null && val !== undefined && val !== ""),
          ),
        ).sort();

        newOptions[key] = ["All", ...uniqueValues];
      });

      setDynamicFilterOptions((prevOptions) => {
        const hasChanged =
          JSON.stringify(prevOptions) !== JSON.stringify(newOptions);
        return hasChanged ? newOptions : prevOptions;
      });
    }
  }, [
    allData,
    effectiveColumnsWithDropdownFilter,
    serverSide,
    propFilterOptions,
  ]);

  // Handle click outside dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        !e.target.closest(".dropdown-menu") &&
        !e.target.closest(".dropdown-toggle1")
      ) {
        setOpenFilterDropdown(null);
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, []);

  // Apply card filter (client-side)
  const getCardFilteredData = useMemo(() => {
    if (serverSide) {
      return applyDataScopeToRecords(allData);
    }

    if (
      !activeCardFilter ||
      activeCardFilter === "total" ||
      activeCardFilter === "addNew"
    ) {
      return applyDataScopeToRecords(allData);
    }

    let filtered = [...applyDataScopeToRecords(allData)];

    if (activeCardFilter === "active") {
      filtered = filtered.filter((r) => r.status === "Active");
    } else if (activeCardFilter === "inactive") {
      filtered = filtered.filter((r) => r.status === "Inactive");
    } else if (activeCardFilter === "withGST") {
      filtered = filtered.filter((r) => r.hasGSTIN === true);
    } else if (activeCardFilter === "withoutGST") {
      filtered = filtered.filter((r) => r.hasGSTIN === false);
    }

    return filtered;
  }, [allData, activeCardFilter, serverSide]);

  // Apply global search and column filters (client-side)
  const filteredData = useMemo(() => {
    if (serverSide) {
      return getCardFilteredData;
    }

    return getCardFilteredData.filter((record) => {
      // Global search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = Object.keys(record).some((key) => {
          if (!visibleColumns[key]) return false;
          const value = record[key];
          if (value === null || value === undefined) return false;
          return String(value).toLowerCase().includes(searchLower);
        });
        if (!matchesSearch) return false;
      }

      // Date range filters
      for (const [key, dateRange] of Object.entries(dateFilters)) {
        if (!dateRange.startDate && !dateRange.endDate) continue;

        const recordDate = parseDate(record[key]);

        if (!recordDate) continue;

        const startDate = dateRange.startDate
          ? new Date(dateRange.startDate)
          : null;
        const endDate = dateRange.endDate ? new Date(dateRange.endDate) : null;

        if (startDate) {
          startDate.setHours(0, 0, 0, 0);
        }
        if (endDate) {
          endDate.setHours(23, 59, 59, 999);
        }

        if (startDate && recordDate < startDate) return false;
        if (endDate && recordDate > endDate) return false;
      }

      // Column filters
      for (const [key, filterValue] of Object.entries(columnFilters)) {
        if (!filterValue || filterValue.length === 0) continue;

        const recordValue = record[key];

        // Dropdown filter
        if (effectiveColumnsWithDropdownFilter.includes(key)) {
          if (filterValue.includes("All") || filterValue.length === 0) {
            continue;
          }
          if (Array.isArray(filterValue)) {
            if (!filterValue.includes(recordValue)) {
              return false;
            }
          } else if (filterValue !== recordValue) {
            return false;
          }
        }
        // Text filter
        else if (filterValue) {
          const recordValueStr = recordValue
            ? String(recordValue).toLowerCase()
            : "";
          const filterValueStr = String(filterValue).toLowerCase();
          if (!recordValueStr.includes(filterValueStr)) {
            return false;
          }
        }
      }

      return true;
    });
  }, [
    getCardFilteredData,
    searchTerm,
    columnFilters,
    dateFilters,
    visibleColumns,
    effectiveColumnsWithDropdownFilter,
    serverSide,
  ]);

  // Apply sorting (client-side)
  const sortedData = useMemo(() => {
    if (serverSide) {
      return filteredData;
    }

    if (sortConfig.key && sortConfig.direction !== "normal") {
      return [...filteredData].sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        if (aValue === null || aValue === undefined) return 1;
        if (bValue === null || bValue === undefined) return -1;

        // Handle date sorting
        if (columnsWithDateFilter.includes(sortConfig.key)) {
          const aDate = parseDate(aValue);
          const bDate = parseDate(bValue);

          if (!aDate && !bDate) return 0;
          if (!aDate) return 1;
          if (!bDate) return -1;

          return sortConfig.direction === "ascending"
            ? aDate - bDate
            : bDate - aDate;
        }

        // Handle number sorting
        if (!isNaN(parseFloat(aValue)) && !isNaN(parseFloat(bValue))) {
          return sortConfig.direction === "ascending"
            ? parseFloat(aValue) - parseFloat(bValue)
            : parseFloat(bValue) - parseFloat(aValue);
        }

        // Handle string sorting
        const comparison = String(aValue).localeCompare(String(bValue));
        return sortConfig.direction === "ascending" ? comparison : -comparison;
      });
    }
    return filteredData;
  }, [filteredData, sortConfig, columnsWithDateFilter, serverSide]);

  // Call onFilteredDataChange only when sortedData actually changes (client-side)
  useEffect(() => {
    if (!serverSide && onFilteredDataChangeRef.current) {
      const hasChanged =
        JSON.stringify(prevSortedDataRef.current) !==
        JSON.stringify(sortedData);
      if (hasChanged) {
        prevSortedDataRef.current = sortedData;
        onFilteredDataChangeRef.current(sortedData);
      }
    }
  }, [sortedData, serverSide]);

  // Apply pagination
  const paginatedData = useMemo(() => {
    if (serverSide) {
      return applyDataScopeToRecords(allData);
    }

    const start = (currentPage - 1) * recordsPerPage;
    const end = start + recordsPerPage;
    return sortedData.slice(start, end);
  }, [sortedData, currentPage, recordsPerPage, serverSide, allData]);

  // Calculate total records
  const totalRecords = serverSide ? propTotalRecords : filteredData.length;

  const buildServerSideColumnSearchTerm = (filters = {}) => {
    if (!serverSide) return "";

    return Object.entries(filters || {})
      .filter(([key, value]) => {
        if (effectiveColumnsWithDropdownFilter.includes(key)) return false;
        if (columnsWithDateFilter.includes(key)) return false;
        return String(value || "").trim() !== "";
      })
      .map(([, value]) => String(value || "").trim())
      .filter(Boolean)
      .join(" ");
  };

  const syncServerSideColumnSearch = (filters = {}) => {
    if (!serverSide || !onServerSideSearch) return;
    const columnSearch = buildServerSideColumnSearchTerm(filters);
    onServerSideSearch(columnSearch, appendDataScopeToFilters({}));
  };

  // Server-side filter change handler
  function triggerServerSideFilter(updatedFilters) {
    if (!serverSide || !onServerSideFilter) return;

    setCurrentPage(1);
    if (onPageChange) onPageChange(1);

    const filterParams = {};

    Object.entries(updatedFilters || columnFilters).forEach(([key, value]) => {
      const serverKey = getServerFilterKey(key);
      if (effectiveColumnsWithDropdownFilter.includes(key)) {
        if (value && !value.includes("All") && value.length > 0) {
          filterParams[serverKey] = Array.isArray(value)
            ? value.join(",")
            : value;
        }
      } else {
        if (value && value.trim() !== "") {
          filterParams[serverKey] = value;
        }
      }
    });

    Object.entries(dateFilters).forEach(([key, range]) => {
      if (range.startDate) {
        // Format date to YYYY-MM-DD for API
        const formattedStartDate = range.startDate.split("T")[0];
        filterParams[`${key}_start`] = formattedStartDate;
      }
      if (range.endDate) {
        const formattedEndDate = range.endDate.split("T")[0];
        filterParams[`${key}_end`] = formattedEndDate;
      }
    });

    if (
      activeCardFilter &&
      activeCardFilter !== "total" &&
      activeCardFilter !== "addNew"
    ) {
      filterParams.filter = activeCardFilter;
    }

    onServerSideFilter(appendDataScopeToFilters(filterParams));
    syncServerSideColumnSearch(updatedFilters || columnFilters);
  }

  // Ensure filter applies when columnFilters change (for AdvancedFilterOffcanvas)
  useEffect(() => {
    if (serverSide) {
      triggerServerSideFilter(columnFilters);
    } else {
      setCurrentPage(1);
      if (onPageChange) onPageChange(1);
    }
  }, [columnFilters]);

  // Debounced search handler for server-side
  const handleServerSideSearch = (value) => {
    if (!serverSide || !onServerSideSearch) return;

    setCurrentPage(1);
    if (onPageChange) onPageChange(1);

    if (searchDebounceTimer.current) {
      clearTimeout(searchDebounceTimer.current);
    }

    searchDebounceTimer.current = setTimeout(() => {
      onServerSideSearch(value, appendDataScopeToFilters({}));
    }, 500);
  };

  // Handle date range filter change
  const handleDateFilterChange = (key, type, value, e) => {
    if (e) e.stopPropagation();

    // Get the raw input value (already in YYYY-MM-DD format from date input)
    let dateValue = value;

    // Ensure we're working with the correct format
    if (dateValue && dateValue.includes("T")) {
      dateValue = dateValue.split("T")[0];
    }

    const updatedDateFilters = {
      ...dateFilters,
      [key]: {
        ...dateFilters[key],
        [type]: dateValue,
      },
    };

    setDateFilters(updatedDateFilters);

    if (serverSide) {
      // Build filter params with all current filters
      const filterParams = {};

      // Add column filters
      Object.entries(columnFilters).forEach(([colKey, colValue]) => {
        const serverKey = getServerFilterKey(colKey);
        if (effectiveColumnsWithDropdownFilter.includes(colKey)) {
          if (colValue && !colValue.includes("All") && colValue.length > 0) {
            filterParams[serverKey] = Array.isArray(colValue)
              ? colValue.join(",")
              : colValue;
          }
        } else {
          if (colValue && colValue.trim() !== "") {
            filterParams[serverKey] = colValue;
          }
        }
      });

      // Add date filters (using the updated ones)
      Object.entries(updatedDateFilters).forEach(([dateKey, range]) => {
        if (range.startDate) {
          filterParams[`${dateKey}_start`] = range.startDate;
        }
        if (range.endDate) {
          filterParams[`${dateKey}_end`] = range.endDate;
        }
      });

      // Add card filter
      if (
        activeCardFilter &&
        activeCardFilter !== "total" &&
        activeCardFilter !== "addNew"
      ) {
        filterParams.cardFilter = activeCardFilter;
      }

      setCurrentPage(1);
      if (onPageChange) onPageChange(1);
      if (onServerSideFilter)
        onServerSideFilter(appendDataScopeToFilters(filterParams));
      syncServerSideColumnSearch(columnFilters);
    } else {
      setCurrentPage(1);
      if (onPageChange) onPageChange(1);
    }
  };

  // Handle column filter change
  const handleColumnFilterChange = (key, value, e) => {
    if (e) e.stopPropagation();
    setColumnFilters((prev) => {
      const updated = { ...prev, [key]: value };
      return updated;
    });
    if (onColumnFilterChange) {
      onColumnFilterChange(key, value);
    } else {
      if (!serverSide) {
        setCurrentPage(1);
        if (onPageChange) onPageChange(1);
      }
    }
  };

  // Handle select filter change
  const handleSelectFilterChange = (key, value, isChecked, e) => {
    e.stopPropagation();

    setColumnFilters((prev) => {
      const currentFilters = [...(prev[key] || [])];

      if (value === "All") {
        return {
          ...prev,
          [key]: isChecked ? ["All"] : [],
        };
      } else {
        let newFilters;
        if (isChecked) {
          newFilters = [...currentFilters.filter((v) => v !== "All"), value];
        } else {
          newFilters = currentFilters.filter((v) => v !== value);
        }

        if (newFilters.length === 0) {
          newFilters = ["All"];
        }

        return {
          ...prev,
          [key]: newFilters,
        };
      }
    });

    if (serverSide) {
      const filterParams = {};

      Object.entries(columnFilters).forEach(([colKey, colValue]) => {
        const serverKey = getServerFilterKey(colKey);
        if (effectiveColumnsWithDropdownFilter.includes(colKey)) {
          if (colKey === key) {
            const updatedValue = [...(columnFilters[key] || [])];
            if (value === "All") {
              // Handled in next state
            } else {
              if (isChecked) {
                updatedValue.push(value);
              } else {
                const index = updatedValue.indexOf(value);
                if (index > -1) updatedValue.splice(index, 1);
              }
            }
            if (updatedValue.length > 0 && !updatedValue.includes("All")) {
              filterParams[serverKey] = updatedValue.join(",");
            }
          } else {
            if (colValue && !colValue.includes("All") && colValue.length > 0) {
              filterParams[serverKey] = Array.isArray(colValue)
                ? colValue.join(",")
                : colValue;
            }
          }
        } else {
          if (colValue && colValue.trim() !== "") {
            filterParams[serverKey] = colValue;
          }
        }
      });

      Object.entries(dateFilters).forEach(([dateKey, range]) => {
        if (range.startDate) {
          filterParams[`${dateKey}_start`] = range.startDate;
        }
        if (range.endDate) {
          filterParams[`${dateKey}_end`] = range.endDate;
        }
      });

      if (
        activeCardFilter &&
        activeCardFilter !== "total" &&
        activeCardFilter !== "addNew"
      ) {
        filterParams.cardFilter = activeCardFilter;
      }

      setCurrentPage(1);
      if (onPageChange) onPageChange(1);
      if (onServerSideFilter)
        onServerSideFilter(appendDataScopeToFilters(filterParams));

      const nextColumnFilters = {
        ...columnFilters,
        [key]: (() => {
          const currentFilters = [...(columnFilters[key] || [])];

          if (value === "All") {
            return isChecked ? ["All"] : [];
          }

          let newFilters;
          if (isChecked) {
            newFilters = [...currentFilters.filter((v) => v !== "All"), value];
          } else {
            newFilters = currentFilters.filter((v) => v !== value);
          }

          if (newFilters.length === 0) {
            newFilters = ["All"];
          }

          return newFilters;
        })(),
      };
      syncServerSideColumnSearch(nextColumnFilters);
    } else {
      setCurrentPage(1);
      if (onPageChange) onPageChange(1);
    }
  };

  // Handle global search
  const handleGlobalSearch = (value) => {
    setSearchTerm(value);

    if (serverSide) {
      handleServerSideSearch(value);
    } else {
      setCurrentPage(1);
      if (onPageChange) onPageChange(1);
    }
  };

  // Handle sort
  const handleSort = (key, e) => {
    if (e) e.stopPropagation();
    if (key === "action") return;

    let direction;

    if (sortConfig.key !== key) {
      direction = "ascending";
    } else {
      switch (sortConfig.direction) {
        case "normal":
          direction = "ascending";
          break;
        case "ascending":
          direction = "descending";
          break;
        case "descending":
          direction = "normal";
          break;
        default:
          direction = "ascending";
      }
    }

    const newSortConfig = { key, direction };
    setSortConfig(newSortConfig);

    if (serverSide && onServerSideSort) {
      setCurrentPage(1);
      if (onPageChange) onPageChange(1);
      onServerSideSort(key, direction, appendDataScopeToFilters({}));
    }
  };

  // Handle refresh
  const handleRefresh = async () => {
    const resetFilters = {};
    Object.keys(columnFilters).forEach((key) => {
      if (effectiveColumnsWithDropdownFilter.includes(key)) {
        resetFilters[key] = ["All"];
      } else {
        resetFilters[key] = "";
      }
    });

    const resetDateFilters = {};
    columnsWithDateFilter.forEach((key) => {
      resetDateFilters[key] = {
        startDate: "",
        endDate: "",
      };
    });

    setColumnFilters(resetFilters);
    setDateFilters(resetDateFilters);
    setSearchTerm("");
    setSortConfig({ key: null, direction: "normal" });
    setOpenFilterDropdown(null);

    if (searchDebounceTimer.current) {
      clearTimeout(searchDebounceTimer.current);
      searchDebounceTimer.current = null;
    }

    const refreshContext = appendDataScopeToFilters({
      forceRefresh: 1,
      refreshTs: Date.now(),
    });

    if (serverSide) {
      setCurrentPage(1);
      if (onPageChange) onPageChange(1);

      // Prefer parent refresh callback to avoid duplicate/racing API calls.
      if (propOnRefresh) {
        await Promise.resolve(propOnRefresh(refreshContext));
      } else {
        if (onServerSideFilter) {
          onServerSideFilter(refreshContext);
        }

        if (onServerSideSearch) {
          onServerSideSearch("", refreshContext);
        }

        if (onServerSideSort) {
          onServerSideSort(null, "normal", refreshContext);
        }
      }
    } else {
      setCurrentPage(1);
      if (onPageChange) onPageChange(1);

      if (propOnRefresh) {
        await Promise.resolve(propOnRefresh(refreshContext));
      }
    }

    showInfo("Filters cleared and data refreshed!");
  };

  // Handle clear filters
  const handleClearFilters = () => {
    const resetFilters = {};
    Object.keys(columnFilters).forEach((key) => {
      if (effectiveColumnsWithDropdownFilter.includes(key)) {
        resetFilters[key] = ["All"];
      } else {
        resetFilters[key] = "";
      }
    });

    const resetDateFilters = {};
    columnsWithDateFilter.forEach((key) => {
      resetDateFilters[key] = {
        startDate: "",
        endDate: "",
      };
    });

    setColumnFilters(resetFilters);
    setDateFilters(resetDateFilters);
    setSearchTerm("");

    if (serverSide) {
      setCurrentPage(1);
      if (onPageChange) onPageChange(1);

      if (onServerSideFilter) {
        onServerSideFilter(appendDataScopeToFilters({}));
      }

      if (onServerSideSearch) {
        onServerSideSearch("", appendDataScopeToFilters({}));
      }
    } else {
      setCurrentPage(1);
      if (onPageChange) onPageChange(1);
    }

    showInfo("All filters cleared!");
  };

  // Handle page change
  const handlePageChange = (page) => {
    setCurrentPage(page);

    if (serverSide && onServerSidePageChange) {
      onServerSidePageChange(page, appendDataScopeToFilters({}));
    }

    if (onPageChange) onPageChange(page);
  };

  // Handle records per page change
  const handleRecordsPerPageChange = (value) => {
    setRecordsPerPage(value);
    setCurrentPage(1);

    if (serverSide && onServerSideRecordsPerPageChange) {
      onServerSideRecordsPerPageChange(value, appendDataScopeToFilters({}));
    }

    if (onRecordsPerPageChange) onRecordsPerPageChange(value);
    if (onPageChange) onPageChange(1);
  };

  // Get sort icon
  const getSortIcon = (key) => {
    if (key === "action") return null;

    if (sortConfig.key !== key || sortConfig.direction === "normal") {
      return (
        <i className="fa-solid fa-arrow-right-arrow-left ms-1 text-muted fa-rotate-90"></i>
      );
    }

    return sortConfig.direction === "ascending" ? (
      <i className="fa-solid fa-arrow-up-short-wide ms-1"></i>
    ) : (
      <i className="fas fa-sort-down ms-1"></i>
    );
  };

  // Get filter display text
  const getFilterDisplayText = (key) => {
    const filters = columnFilters[key];

    if (effectiveColumnsWithDropdownFilter.includes(key)) {
      if (
        !filters ||
        filters.length === 0 ||
        (filters.length === 1 && filters[0] === "All")
      ) {
        return "All";
      }
      return filters.join(", ");
    } else {
      return filters || "";
    }
  };

  // Clear column filters
  const clearColumnFilters = (key, e) => {
    e.stopPropagation();

    if (columnsWithDateFilter.includes(key)) {
      const updatedDateFilters = {
        ...dateFilters,
        [key]: {
          startDate: "",
          endDate: "",
        },
      };

      setDateFilters(updatedDateFilters);

      if (serverSide) {
        const filterParams = {};

        Object.entries(columnFilters).forEach(([colKey, colValue]) => {
          const serverKey = getServerFilterKey(colKey);
          if (effectiveColumnsWithDropdownFilter.includes(colKey)) {
            if (colValue && !colValue.includes("All") && colValue.length > 0) {
              filterParams[serverKey] = Array.isArray(colValue)
                ? colValue.join(",")
                : colValue;
            }
          } else {
            if (colValue && colValue.trim() !== "") {
              filterParams[serverKey] = colValue;
            }
          }
        });

        Object.entries(updatedDateFilters).forEach(([dateKey, range]) => {
          if (dateKey !== key) {
            if (range.startDate) {
              filterParams[`${dateKey}_start`] = range.startDate;
            }
            if (range.endDate) {
              filterParams[`${dateKey}_end`] = range.endDate;
            }
          }
        });

        if (
          activeCardFilter &&
          activeCardFilter !== "total" &&
          activeCardFilter !== "addNew"
        ) {
          filterParams.cardFilter = activeCardFilter;
        }

        setCurrentPage(1);
        if (onPageChange) onPageChange(1);
        if (onServerSideFilter)
          onServerSideFilter(appendDataScopeToFilters(filterParams));
        syncServerSideColumnSearch(columnFilters);
      }
    } else {
      const updatedFilters = {
        ...columnFilters,
        [key]: effectiveColumnsWithDropdownFilter.includes(key) ? ["All"] : "",
      };

      setColumnFilters(updatedFilters);

      if (serverSide) {
        triggerServerSideFilter(updatedFilters);
      }
    }
  };

  // Open advanced filter
  const openAdvancedFilter = (key, e) => {
    e.stopPropagation();
    setCurrentColumnFilter(key);
    setShowFilterOffcanvas(true);
  };

  // Toggle filter dropdown
  const toggleFilterDropdown = (key, e) => {
    e.stopPropagation();
    setFilterSearchTerm("");

    if (openFilterDropdown === key) {
      setOpenFilterDropdown(null);
      return;
    }

    const buttonRect = e.currentTarget.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const spaceRight = viewportWidth - buttonRect.right;
    const spaceLeft = buttonRect.left;
    const spaceBottom = viewportHeight - buttonRect.bottom;
    const spaceTop = buttonRect.top;

    let left = buttonRect.left;
    let top = buttonRect.bottom;
    let width = 300;

    if (spaceRight < width) {
      if (buttonRect.width > width) {
        left = buttonRect.left + (buttonRect.width - width) / 2;
      } else {
        left = buttonRect.right - width;
      }
      left = Math.max(0, left);
    }

    const estimatedDropdownHeight = 400;
    if (spaceBottom < estimatedDropdownHeight) {
      if (spaceTop >= estimatedDropdownHeight) {
        top = buttonRect.top - estimatedDropdownHeight;
      }
    }

    left = Math.max(0, Math.min(left, viewportWidth - width));
    top = Math.max(0, top);

    setDropdownPosition({
      top,
      left,
      width: Math.min(width, viewportWidth - 20),
    });
    setOpenFilterDropdown(key);
  };

  // Toggle pin column
  const togglePinColumn = (columnKey, position) => {
    setPinnedColumns((prev) => {
      const newPinned = { ...prev };
      newPinned.left = newPinned.left.filter((key) => key !== columnKey);
      newPinned.right = newPinned.right.filter((key) => key !== columnKey);
      const isCurrentlyPinned = prev[position].includes(columnKey);
      if (!isCurrentlyPinned) {
        newPinned[position] = [...newPinned[position], columnKey];
      }
      return newPinned;
    });
  };

  // Start resizing
  const startResizing = (columnKey, e) => {
    e.preventDefault();
    e.stopPropagation();
    const column = tableColumns.find((col) => col.key === columnKey);
    setResizing({
      isResizing: true,
      columnKey,
      startX: e.clientX,
      startWidth: column.width,
    });
  };

  // Handle resize
  const handleResize = (e) => {
    if (!resizing.isResizing) return;
    const deltaX = e.clientX - resizing.startX;
    const newWidth = Math.max(50, resizing.startWidth + deltaX);
    setTableColumns((prevColumns) =>
      prevColumns.map((column) =>
        column.key === resizing.columnKey
          ? { ...column, width: newWidth }
          : column,
      ),
    );
  };

  // Stop resizing
  const stopResizing = () => {
    setResizing({
      isResizing: false,
      columnKey: null,
      startX: 0,
      startWidth: 0,
    });
  };

  // Start dragging
  const startDragging = (columnKey, e) => {
    e.preventDefault();
    e.stopPropagation();
    const columnIndex = tableColumns.findIndex((col) => col.key === columnKey);
    setDragging({
      isDragging: true,
      columnKey,
      startX: e.clientX,
      startIndex: columnIndex,
    });
  };

  // Handle drag
  const handleDrag = (e) => {
    if (!dragging.isDragging) return;
    const thElements = headerRowRef.current.querySelectorAll("th");
    let targetIndex = -1;
    thElements.forEach((th, index) => {
      const rect = th.getBoundingClientRect();
      if (e.clientX >= rect.left && e.clientX <= rect.right) {
        targetIndex = index;
      }
    });
    if (targetIndex !== -1 && targetIndex !== dragging.startIndex) {
      setTableColumns((prevColumns) => {
        const newColumns = [...prevColumns];
        const [movedColumn] = newColumns.splice(dragging.startIndex, 1);
        newColumns.splice(targetIndex, 0, movedColumn);
        return newColumns;
      });
      setDragging((prev) => ({
        ...prev,
        startIndex: targetIndex,
      }));
    }
  };

  // Stop dragging
  const stopDragging = () => {
    setDragging({
      isDragging: false,
      columnKey: null,
      startX: 0,
      startIndex: 0,
    });
  };

  useEffect(() => {
    if (resizing.isResizing) {
      document.addEventListener("mousemove", handleResize);
      document.addEventListener("mouseup", stopResizing);
      return () => {
        document.removeEventListener("mousemove", handleResize);
        document.removeEventListener("mouseup", stopResizing);
      };
    }
  }, [resizing.isResizing]);

  useEffect(() => {
    if (dragging.isDragging) {
      document.addEventListener("mousemove", handleDrag);
      document.addEventListener("mouseup", stopDragging);
      return () => {
        document.removeEventListener("mousemove", handleDrag);
        document.removeEventListener("mouseup", stopDragging);
      };
    }
  }, [dragging.isDragging]);

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (searchDebounceTimer.current) {
        clearTimeout(searchDebounceTimer.current);
      }
    };
  }, []);

  // Handle auto resize all
  const handleAutoResizeAll = () => {
    const table = tableRef.current;
    if (!table) return;

    const currentAutoResizeState = tableColumns.some(
      (col) => col.width === "auto",
    );

    if (!currentAutoResizeState) {
      const widths = {};
      tableColumns.forEach((col) => {
        widths[col.key] = col.width;
      });
      setOriginalWidths(widths);
    }

    const headerCells = table.querySelectorAll("thead th");
    const bodyRows = table.querySelectorAll("tbody tr");

    const newColumns = tableColumns.map((col) => {
      if (!visibleColumns[col.key]) return col;

      const colIndex = Array.from(headerCells).findIndex(
        (cell) => cell.getAttribute("data-column-key") === col.key,
      );

      if (colIndex === -1) return col;

      let maxWidth = 0;

      const headerCell = headerCells[colIndex];
      const headerWidth = headerCell.scrollWidth;
      maxWidth = Math.max(maxWidth, headerWidth);

      bodyRows.forEach((row) => {
        const cell = row.querySelectorAll("td")[colIndex];
        if (cell) {
          maxWidth = Math.max(maxWidth, cell.scrollWidth);
        }
      });

      maxWidth = Math.min(maxWidth + 20, 800);

      return {
        ...col,
        width: currentAutoResizeState
          ? originalWidths[col.key] || col.width
          : maxWidth,
      };
    });

    setTableColumns(newColumns);
  };

  // Handle auto resize column
  const handleAutoResizeColumn = (columnKey) => {
    const table = tableRef.current;
    if (!table) return;

    const column = tableColumns.find((col) => col.key === columnKey);
    const isCurrentlyAutoResized = column?.width === "auto";

    if (isCurrentlyAutoResized) {
      setTableColumns((prevColumns) =>
        prevColumns.map((col) =>
          col.key === columnKey
            ? { ...col, width: originalWidths[columnKey] || col.width }
            : col,
        ),
      );
    } else {
      setOriginalWidths((prev) => ({
        ...prev,
        [columnKey]: column.width,
      }));

      const headerCells = table.querySelectorAll("thead th");
      const bodyRows = table.querySelectorAll("tbody tr");

      const colIndex = Array.from(headerCells).findIndex(
        (cell) => cell.getAttribute("data-column-key") === columnKey,
      );

      if (colIndex === -1) return;

      let maxWidth = 0;

      const headerCell = headerCells[colIndex];
      maxWidth = Math.max(maxWidth, headerCell.scrollWidth);

      bodyRows.forEach((row) => {
        const cell = row.querySelectorAll("td")[colIndex];
        if (cell) {
          maxWidth = Math.max(maxWidth, cell.scrollWidth);
        }
      });

      maxWidth = Math.min(maxWidth + 20, 800);

      setTableColumns((prevColumns) =>
        prevColumns.map((col) =>
          col.key === columnKey ? { ...col, width: maxWidth } : col,
        ),
      );
    }
  };

  // Confirm delete
  const confirmDelete = (record) => {
    setModalConfig({
      action: "delete",
      recordId: record?._id || record?.id,
      recordData: record || null,
    });
    setShowConfirmModal(true);
  };

  const getDeleteEntityLabel = () => {
    const normalizedTitle = String(tableTitle || "")
      .replace(/records?/gi, "")
      .replace(/management/gi, "")
      .trim();

    if (normalizedTitle === "RCM" || normalizedTitle === "Self") {
      return "Self Invoice (RCM)";
    }

    return normalizedTitle || "record";
  };

  const getDeleteRecordMeta = (record) => {
    const safeRecord = record || {};

    const primaryCandidates = [
      { key: "selfInvoiceNumber", label: "Self Invoice Number" },
      { key: "invoiceNumber", label: "Invoice Number" },
      { key: "vendorId", label: "Vendor ID" },
      { key: "clientId", label: "Client ID" },
      { key: "id", label: "ID" },
    ];

    const secondaryCandidates = [
      {
        key: "serviceProviderBusinessName",
        label: "Service Provider Business Name",
      },
      { key: "businessName", label: "Business Name" },
      { key: "clientName", label: "Client Name" },
      { key: "vendorName", label: "Vendor Name" },
      { key: "name", label: "Name" },
    ];

    const firstAvailable = (candidates) => {
      return (
        candidates.find(({ key }) => {
          const value = safeRecord[key];
          return value !== undefined && value !== null && String(value) !== "";
        }) || null
      );
    };

    const primary = firstAvailable(primaryCandidates);
    const secondary = firstAvailable(secondaryCandidates);

    return {
      entityLabel: getDeleteEntityLabel(),
      primaryLabel: primary?.label || "Record",
      primaryValue: primary ? safeRecord[primary.key] : "-",
      secondaryLabel: secondary?.label || "Name",
      secondaryValue: secondary ? safeRecord[secondary.key] : "-",
    };
  };

  // Handle confirm action
  const handleConfirmAction = () => {
    const { action, recordId } = modalConfig;
    if (action === "delete" && onDelete) {
      onDelete(recordId);
      setShowConfirmModal(false);
    }
  };

  // Get ordered columns
  const getOrderedColumns = () => {
    const leftPinned = tableColumns.filter((col) =>
      pinnedColumns.left.includes(col.key),
    );
    const rightPinned = tableColumns.filter((col) =>
      pinnedColumns.right.includes(col.key),
    );
    const unpinned = tableColumns.filter(
      (col) =>
        !pinnedColumns.left.includes(col.key) &&
        !pinnedColumns.right.includes(col.key),
    );
    return [...leftPinned, ...unpinned, ...rightPinned];
  };

  // Check if column is pinned
  const isPinned = (columnKey) => {
    if (pinnedColumns.left.includes(columnKey)) return "left";
    if (pinnedColumns.right.includes(columnKey)) return "right";
    return false;
  };

  // Get pagination info
  const paginationInfo = () => {
    const total = serverSide ? propTotalRecords : filteredData.length;
    const startRecord = total > 0 ? (currentPage - 1) * recordsPerPage + 1 : 0;
    const endRecord = Math.min(currentPage * recordsPerPage, total);

    return {
      startRecord,
      endRecord,
      totalRecords: total,
      isPrevDisabled: currentPage === 1,
      isNextDisabled: currentPage * recordsPerPage >= total,
    };
  };

  // Get pagination items
  const getPaginationItems = () => {
    const items = [];
    const totalPages = Math.ceil(
      (serverSide ? propTotalRecords : filteredData.length) / recordsPerPage,
    );

    const createPageButton = (i) => (
      <li key={i} className={`page-item ${i === currentPage ? "active" : ""}`}>
        <button className="page-link" onClick={() => handlePageChange(i)}>
          {i}
        </button>
      </li>
    );

    if (showAllPages) {
      for (let i = 1; i <= totalPages; i++) {
        items.push(createPageButton(i));
      }
    } else {
      let startPage = Math.max(1, currentPage - 1);
      let endPage = Math.min(startPage + 2, totalPages);

      if (startPage > 2) {
        items.push(createPageButton(1));
        items.push(
          <li key="start-ellipsis" className="page-item">
            <button className="page-link" onClick={() => setShowAllPages(true)}>
              ...
            </button>
          </li>,
        );
      } else if (startPage > 1) {
        items.push(createPageButton(1));
      }

      for (let i = startPage; i <= endPage; i++) {
        if (i >= 1 && i <= totalPages) {
          items.push(createPageButton(i));
        }
      }

      if (endPage < totalPages - 1) {
        items.push(
          <li key="end-ellipsis" className="page-item">
            <button className="page-link" onClick={() => setShowAllPages(true)}>
              ...
            </button>
          </li>,
        );
        items.push(createPageButton(totalPages));
      } else if (endPage < totalPages) {
        items.push(createPageButton(totalPages));
      }
    }

    return items;
  };

  // Get status badge class
  const getStatusBadgeClass = (value) => {
    if (getBadgeClass) return getBadgeClass(value);
    if (!value) return "bg-secondary";
    const lowerValue = value.toLowerCase();
    if (lowerValue === "active") return "bg-success";
    if (lowerValue === "inactive" || lowerValue === "deactive")
      return "bg-danger";
    if (lowerValue === "pending") return "bg-warning";
    return "bg-primary";
  };

  // Format column name for export
  const formatColumnName = (key) => {
    const columnConfig = tableColumns.find((col) => col.key === key);
    if (columnConfig && columnConfig.label) {
      return columnConfig.label;
    }
    const result = key.replace(/([A-Z])/g, " $1");
    return result.charAt(0).toUpperCase() + result.slice(1);
  };

  const isPhoneLikeColumn = (key = "", columnName = "") => {
    const normalizedKey = String(key || "").toLowerCase();
    const normalizedLabel = String(columnName || "").toLowerCase();
    return /phone|mobile|whatsapp/.test(`${normalizedKey} ${normalizedLabel}`);
  };

  const isWhatsAppColumn = (key = "", columnName = "") => {
    const normalizedKey = String(key || "").toLowerCase();
    const normalizedLabel = String(columnName || "").toLowerCase();
    return /whatsapp/.test(`${normalizedKey} ${normalizedLabel}`);
  };

  const resolveWhatsAppExportValue = (record, key) => {
    const directValue = record?.[key];
    if (String(directValue ?? "").trim()) {
      return directValue;
    }

    const fallbackKeys = [
      "phoneNumber",
      "phone",
      "mobile",
      "holderPhone",
      "giftDeliveredByPhone",
    ];

    for (const fallbackKey of fallbackKeys) {
      const fallbackValue = record?.[fallbackKey];
      if (String(fallbackValue ?? "").trim()) {
        return fallbackValue;
      }
    }

    return directValue;
  };

  const normalizePhoneForWhatsApp = (value) => {
    const rawValue = String(value ?? "").trim();
    if (!rawValue) return "";

    const digits = rawValue.replace(/\D/g, "");
    if (!digits) return rawValue;

    if (digits.length === 10) {
      return `91${digits}`;
    }

    if (digits.length === 11 && digits.startsWith("0")) {
      return `91${digits.slice(1)}`;
    }

    if (digits.length === 12 && digits.startsWith("91")) {
      return digits;
    }

    return rawValue;
  };

  const getExportValue = (record, key, columnName, index) => {
    if (key === "sn") {
      return index + 1;
    }

    if (columnsWithDateFilter.includes(key)) {
      return formatDateForDisplay(record[key]);
    }

    if (isPhoneLikeColumn(key, columnName)) {
      const exportValue = isWhatsAppColumn(key, columnName)
        ? resolveWhatsAppExportValue(record, key)
        : record[key];
      return normalizePhoneForWhatsApp(exportValue);
    }

    const rawValue = record?.[key];
    return rawValue ?? "";
  };

  const getExportRows = async () => {
    if (typeof exportApi === "string" && exportApi.trim() !== "") {
      const filterParams = buildServerFilterParams();
      try {
        const rows = await fetchAllServerDataForExport({
          exportApi,
          filterParams,
          requestHeaders: exportRequestHeaders,
        });
        return applyDataScopeToRecords(rows);
      } catch {
        // Silent fallback to current loaded rows
      }
    }

    return applyDataScopeToRecords(sortedData);
  };

  const resolvePdfFont = async ({ doc, columnLabels, exportData }) => {
    const needsIndicFont =
      hasExportSensitiveCharacters(exportTitle) ||
      columnLabels.some((label) => hasExportSensitiveCharacters(label)) ||
      exportData.some((row) =>
        row.some((value) => hasExportSensitiveCharacters(value)),
      );

    if (!needsIndicFont) {
      return "helvetica";
    }

    try {
      const fontBase64 = await loadDevanagariFontBase64();
      doc.addFileToVFS(DEVANAGARI_FONT_FILE, fontBase64);
      doc.addFont(DEVANAGARI_FONT_FILE, DEVANAGARI_FONT_NAME, "normal");
      doc.addFont(DEVANAGARI_FONT_FILE, DEVANAGARI_FONT_NAME, "bold");
      doc.setFont(DEVANAGARI_FONT_NAME, "normal");

      const sampleWidth = doc.getStringUnitWidth("Test");
      if (!Number.isFinite(sampleWidth) || sampleWidth <= 0) {
        throw new Error("Invalid custom font metrics");
      }

      return DEVANAGARI_FONT_NAME;
    } catch {
      return "helvetica";
    }
  };

  // Format date time for export
  const formatDateTime = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12;
    const formattedHours = String(hours).padStart(2, "0");
    return `${day}-${month}-${year} | ${formattedHours}.${minutes}.${seconds} ${ampm}`;
  };

  const exportToPdfUsingCanvas = async ({
    orientation,
    columnLabels,
    exportData,
    now,
    preserveTextColors = false,
  }) => {
    await ensureCanvasDevanagariFontLoaded();

    const { default: html2canvas } = await import("html2canvas");
    const { jsPDF } = await loadPdfExportLibs();
    const doc = new jsPDF({
      orientation,
      unit: "mm",
      format: "a4",
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const rowsPerPage = orientation === "landscape" ? 32 : 42;
    const isPortrait = orientation === "portrait";
    const columnCount = Math.max(columnLabels.length, 1);
    const totalRows = Math.max(exportData.length, 1);
    const columnPressure = Math.min(1.08, Math.max(0.88, 6 / columnCount));
    const densityPressure = Math.min(
      1.08,
      Math.max(0.94, rowsPerPage / totalRows),
    );
    const dynamicScale = columnPressure * densityPressure;
    const bodyFontSize = isPortrait
      ? 8
      : Math.min(9.5, Math.max(7.5, 8 * dynamicScale));
    const headerFontSize = isPortrait
      ? 9
      : Math.min(11, Math.max(bodyFontSize + 1, 9));
    const bodyCellPadding = `${PDF_CELL_PADDING_PX}px`;
    const headCellPadding = `${PDF_CELL_PADDING_PX}px`;

    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.left = "-10000px";
    container.style.top = "0";
    container.style.background = "#ffffff";
    container.style.padding = "8px";
    container.style.width = orientation === "landscape" ? "1780px" : "1240px";
    container.style.zIndex = "-1";
    container.style.fontFamily =
      '"NotoSansDevanagariPdf", "Noto Sans Devanagari", "Mangal", "Nirmala UI", Arial, sans-serif';
    document.body.appendChild(container);

    try {
      for (
        let start = 0, pageIndex = 0;
        start < exportData.length;
        start += rowsPerPage, pageIndex += 1
      ) {
        const rowsChunk = exportData.slice(start, start + rowsPerPage);
        const section = document.createElement("div");
        section.style.background = "#ffffff";
        section.style.color = "#000000";

        if (pageIndex === 0) {
          const title = document.createElement("h2");
          title.textContent = exportTitle;
          title.style.margin = "0 0 6px";
          title.style.textAlign = "center";
          title.style.fontSize = "26px";
          title.style.fontWeight = "700";
          section.appendChild(title);

          const divider = document.createElement("div");
          divider.style.height = "2px";
          divider.style.background = "#ffcc00";
          divider.style.margin = "0 0 8px";
          section.appendChild(divider);

          const meta = document.createElement("div");
          meta.style.display = "flex";
          meta.style.justifyContent = "space-between";
          meta.style.fontSize = "11px";
          meta.style.margin = "0 0 8px";
          meta.innerHTML = `<span>Generated on: ${formatDateTime(now.toISOString())}</span><span>Total Records: ${exportData.length}</span>`;
          section.appendChild(meta);
        }

        const table = document.createElement("table");
        table.style.width = "100%";
        table.style.borderCollapse = "collapse";
        table.style.tableLayout = "auto";

        const thead = document.createElement("thead");
        const headRow = document.createElement("tr");
        columnLabels.forEach((label) => {
          const th = document.createElement("th");
          th.textContent = label;
          th.style.border = "1px solid #cccccc";
          th.style.padding = headCellPadding;
          th.style.fontSize = `${headerFontSize}px`;
          th.style.fontWeight = "900";
          th.style.color = "#000000";
          th.style.textAlign = "left";
          th.style.background = "#ffcc00";
          th.style.whiteSpace = "nowrap";
          headRow.appendChild(th);
        });
        thead.appendChild(headRow);
        table.appendChild(thead);

        const tbody = document.createElement("tbody");
        rowsChunk.forEach((row, rowIndex) => {
          const tr = document.createElement("tr");
          const globalRowIndex = start + rowIndex;
          tr.style.backgroundColor =
            globalRowIndex % 2 === 0 ? "#ffffff" : "#f5f5f5";

          row.forEach((cellValue) => {
            const td = document.createElement("td");
            const textValue = String(cellValue ?? "");
            td.textContent = textValue;
            td.style.border = "1px solid #d7d7d7";
            td.style.padding = bodyCellPadding;
            td.style.fontSize = `${bodyFontSize}px`;
            td.style.wordBreak = "normal";
            td.style.overflowWrap = "normal";
            td.style.fontWeight = "600";
            if (preserveTextColors) {
              const resolvedColor = resolveExportTextColor(textValue);
              td.style.color = resolvedColor
                ? `rgb(${resolvedColor[0]}, ${resolvedColor[1]}, ${resolvedColor[2]})`
                : "#000000";
            } else {
              td.style.color = "#000000";
            }
            td.style.whiteSpace = "nowrap";
            td.style.verticalAlign = "top";
            tr.appendChild(td);
          });
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        section.appendChild(table);

        container.innerHTML = "";
        container.appendChild(section);

        const canvas = await html2canvas(section, {
          scale: 1.8,
          useCORS: true,
          backgroundColor: "#ffffff",
          logging: false,
        });

        const imgData = canvas.toDataURL("image/jpeg", 0.99);
        const imgWidth = pageWidth - 10;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        if (pageIndex > 0) {
          doc.addPage();
        }

        if (imgHeight <= pageHeight - 10) {
          doc.addImage(imgData, "JPEG", 5, 5, imgWidth, imgHeight);
        } else {
          doc.addImage(imgData, "JPEG", 5, 5, imgWidth, pageHeight - 10);
        }
      }
    } finally {
      container.remove();
    }

    doc.save(`${exportFileName}_${now.toISOString().slice(0, 10)}.pdf`);
  };

  const exportToPdfSinglePageColumns = async ({
    orientation,
    columnLabels,
    exportRows,
    exportData,
    now,
    preserveTextColors = false,
  }) => {
    const { jsPDF, autoTable } = await loadPdfExportLibs();
    const doc = new jsPDF({
      orientation,
      unit: "mm",
      format: "a4",
    });

    const pdfFont = await resolvePdfFont({ doc, columnLabels, exportData });
    const useIndicFont = pdfFont === DEVANAGARI_FONT_NAME;
    const pageWidth = doc.internal.pageSize.getWidth();
    const tableLeftMargin = 10;
    const tableRightMargin = 10;
    const availableWidth = pageWidth - tableLeftMargin - tableRightMargin;
    const measurementRows =
      exportData.length > PDF_WIDTH_MEASUREMENT_SAMPLE_SIZE
        ? exportData.slice(0, PDF_WIDTH_MEASUREMENT_SAMPLE_SIZE)
        : exportData;
    const cellPaddingTopBottom = PDF_CELL_PADDING_PX * MM_PER_PX;
    const cellPaddingLeftRight = PDF_CELL_PADDING_PX * MM_PER_PX;
    const horizontalPadding = cellPaddingLeftRight * 2;
    const widthSafetyFactor = 0.998;

    const measureColumnsAtFontSize = (fontSize) => {
      return columnLabels.map((label, columnIndex) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(fontSize + 0.6);
        const headerWidth = doc.getTextWidth(String(label || ""));

        const maxBodyWidth = measurementRows.reduce((maxWidth, row) => {
          const cellValue = String(row?.[columnIndex] ?? "");
          const cellHasSensitiveChars = hasExportSensitiveCharacters(cellValue);
          const fontName =
            cellHasSensitiveChars && useIndicFont ? pdfFont : "helvetica";

          doc.setFont(fontName, "normal");
          doc.setFontSize(fontSize);
          return Math.max(maxWidth, doc.getTextWidth(cellValue));
        }, 0);

        const preferredWidth =
          Math.max(headerWidth, maxBodyWidth) + horizontalPadding + 0.8;

        return Math.max(6, preferredWidth);
      });
    };

    const minFontSize = 1.8;
    const maxFontSize = 9.5;
    let computedFontSize = 8;
    let columnWidths = measureColumnsAtFontSize(computedFontSize);
    let totalWidth = columnWidths.reduce((sum, width) => sum + width, 0);
    const maxAllowedWidth = availableWidth * widthSafetyFactor;

    const totalAtMin = measureColumnsAtFontSize(minFontSize).reduce(
      (sum, width) => sum + width,
      0,
    );
    const totalAtMax = measureColumnsAtFontSize(maxFontSize).reduce(
      (sum, width) => sum + width,
      0,
    );

    if (totalAtMin >= maxAllowedWidth) {
      computedFontSize = minFontSize;
    } else if (totalAtMax <= maxAllowedWidth) {
      computedFontSize = maxFontSize;
    } else {
      let low = minFontSize;
      let high = maxFontSize;

      for (let i = 0; i < 22; i += 1) {
        const mid = (low + high) / 2;
        const midTotal = measureColumnsAtFontSize(mid).reduce(
          (sum, width) => sum + width,
          0,
        );

        if (midTotal <= maxAllowedWidth) {
          low = mid;
        } else {
          high = mid;
        }
      }

      computedFontSize = low;
    }

    if (orientation === "portrait") {
      computedFontSize = 8;
    }

    columnWidths = measureColumnsAtFontSize(computedFontSize);
    totalWidth = columnWidths.reduce((sum, width) => sum + width, 0);

    let guard = 0;
    while (
      totalWidth > maxAllowedWidth &&
      computedFontSize > minFontSize &&
      guard < 16
    ) {
      computedFontSize = Math.max(minFontSize, computedFontSize * 0.94);
      columnWidths = measureColumnsAtFontSize(computedFontSize);
      totalWidth = columnWidths.reduce((sum, width) => sum + width, 0);
      guard += 1;
    }

    const widthScale = totalWidth > 0 ? maxAllowedWidth / totalWidth : 1;

    const columnStyles = columnWidths.reduce((styles, width, columnIndex) => {
      styles[columnIndex] = {
        cellWidth: Math.max(0.8, width * widthScale),
      };
      return styles;
    }, {});

    const formattedDate = formatDateTime(now.toISOString());
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    const title = exportTitle;
    const titleWidth =
      (doc.getStringUnitWidth(title) * doc.internal.getFontSize()) /
      doc.internal.scaleFactor;
    const titleX = (pageWidth - titleWidth) / 2;
    doc.text(title, titleX, 12);
    doc.setDrawColor(255, 204, 0);
    doc.setLineWidth(1);
    doc.line(8, 17, pageWidth - 8, 17);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated on: ${formattedDate}`, 8, 25);
    doc.text(`Total Records: ${exportRows.length}`, pageWidth - 8, 25, {
      align: "right",
    });

    autoTable(doc, {
      head: [columnLabels],
      body: exportData,
      startY: 30,
      styles: {
        font: "helvetica",
        fontSize: computedFontSize,
        cellPadding: {
          top: cellPaddingTopBottom,
          right: cellPaddingLeftRight,
          bottom: cellPaddingTopBottom,
          left: cellPaddingLeftRight,
        },
        overflow: "visible",
        lineWidth: 0.1,
        lineColor: [200, 200, 200],
        textColor: [0, 0, 0],
        fillColor: [255, 255, 255],
        valign: "middle",
      },
      headStyles: {
        fillColor: [255, 204, 0],
        textColor: [0, 0, 0],
        fontStyle: "bold",
        fontSize: Math.max(computedFontSize + 0.4, 1.2),
      },
      alternateRowStyles: {
        fillColor: [245, 245, 245],
      },
      margin: {
        top: 8,
        bottom: 5,
        left: tableLeftMargin,
        right: tableRightMargin,
      },
      tableWidth: maxAllowedWidth,
      horizontalPageBreak: false,
      showHead: "everyPage",
      pageBreak: "auto",
      theme: "grid",
      columnStyles,
      didParseCell: (data) => {
        data.cell.styles.overflow = "visible";

        if (data.section === "body") {
          data.cell.styles.fillColor =
            data.row.index % 2 === 0 ? [255, 255, 255] : [245, 245, 245];
        }

        if (!useIndicFont) return;

        const rawText = (data.cell?.text || []).join("");
        if (preserveTextColors && data.section === "body") {
          const color = resolveExportTextColor(rawText);
          if (color) {
            data.cell.styles.textColor = color;
          }
        }

        if (!hasExportSensitiveCharacters(rawText)) {
          if (data.section === "head") {
            data.cell.styles.font = "helvetica";
            data.cell.styles.fontStyle = "bold";
          } else {
            data.cell.styles.font = "helvetica";
            data.cell.styles.fontStyle = "normal";
          }
          return;
        }

        data.cell.styles.font = DEVANAGARI_FONT_NAME;
        data.cell.styles.fontStyle = "normal";
      },
    });

    doc.save(`${exportFileName}_${now.toISOString().slice(0, 10)}.pdf`);
  };

  // Export to PDF (supports server-side export)
  const exportToPDF = async () => {
    try {
      const { jsPDF, autoTable } = await loadPdfExportLibs();

      const exportRows = await getExportRows();
      const visibleColumnKeys = getOrderedColumns()
        .filter((col) => visibleColumns[col.key])
        .map((col) => col.key);
      const columnLabels = visibleColumnKeys.map((key) => {
        const column = tableColumns.find((col) => col.key === key);
        return column ? column.label : formatColumnName(key);
      });
      const exportData = exportRows.map((record, index) => {
        return visibleColumnKeys.map((key) => {
          const columnName = formatColumnName(key);
          const value = getExportValue(record, key, columnName, index);
          return value == null ? "" : String(value);
        });
      });

      const needsIndicFont =
        hasExportSensitiveCharacters(exportTitle) ||
        columnLabels.some((label) => hasExportSensitiveCharacters(label)) ||
        exportData.some((row) =>
          row.some((value) => hasExportSensitiveCharacters(value)),
        );
      const now = new Date();
      const orientation =
        visibleColumnKeys.length > 6 ? "landscape" : "portrait";
      const singlePageColumnsModeEnabled =
        String(
          localStorage.getItem(PDF_EXPORT_SINGLE_PAGE_COLUMNS_MODE_KEY) || "",
        ).toLowerCase() === "true";
      const preserveTextColorsEnabled =
        String(
          localStorage.getItem(EXPORT_PRESERVE_TEXT_COLOR_MODE_KEY) || "",
        ).toLowerCase() === "true";

      if (singlePageColumnsModeEnabled) {
        await exportToPdfSinglePageColumns({
          orientation,
          columnLabels,
          exportRows,
          exportData,
          now,
          preserveTextColors: preserveTextColorsEnabled,
        });
        showSuccess("PDF exported successfully!");
        return;
      }

      const doc = new jsPDF({
        orientation,
        unit: "mm",
        format: "a4",
      });

      const pdfFont = await resolvePdfFont({ doc, columnLabels, exportData });
      const useIndicFont = pdfFont === DEVANAGARI_FONT_NAME;
      if (needsIndicFont && !useIndicFont) {
        await exportToPdfUsingCanvas({
          orientation,
          columnLabels,
          exportData,
          now,
          preserveTextColors: preserveTextColorsEnabled,
        });
        showSuccess("PDF exported successfully!");
        return;
      }

      const formattedDate = formatDateTime(now.toISOString());
      const pageWidth = doc.internal.pageSize.getWidth();
      doc.setFontSize(18);
      if (useIndicFont && hasExportSensitiveCharacters(exportTitle)) {
        doc.setFont(DEVANAGARI_FONT_NAME, "normal");
      } else {
        doc.setFont("helvetica", "bold");
      }
      const title = exportTitle;
      const titleWidth =
        (doc.getStringUnitWidth(title) * doc.internal.getFontSize()) /
        doc.internal.scaleFactor;
      const titleX = (pageWidth - titleWidth) / 2;
      doc.text(title, titleX, 12);
      doc.setDrawColor(255, 204, 0);
      doc.setLineWidth(1);
      doc.line(8, 17, pageWidth - 8, 17);
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Generated on: ${formattedDate}`, 8, 25);
      doc.text(`Total Records: ${exportRows.length}`, pageWidth - 8, 25, {
        align: "right",
      });

      const dynamicFontSize = 8;
      autoTable(doc, {
        head: [columnLabels],
        body: exportData,
        startY: 30,
        styles: {
          font: "helvetica",
          fontSize: dynamicFontSize,
          cellPadding: 2,
          overflow: "linebreak",
          lineWidth: 0.1,
          lineColor: [200, 200, 200],
          textColor: [0, 0, 0],
        },
        headStyles: {
          fillColor: [255, 204, 0],
          textColor: [0, 0, 0],
          fontStyle: "bold",
          fontSize: dynamicFontSize + 1,
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245],
        },
        margin: {
          top: 8,
          bottom: 5,
          left: 8,
          right: 8,
        },
        tableWidth: "auto",
        horizontalPageBreak: true,
        showHead: "everyPage",
        pageBreak: "auto",
        theme: "grid",
        didParseCell: (data) => {
          if (preserveTextColorsEnabled && data.section === "body") {
            const rawColorText = (data.cell?.text || []).join("");
            const color = resolveExportTextColor(rawColorText);
            if (color) {
              data.cell.styles.textColor = color;
            }
          }

          if (!useIndicFont) return;

          const rawText = (data.cell?.text || []).join("");
          if (!hasExportSensitiveCharacters(rawText)) {
            if (data.section === "head") {
              data.cell.styles.font = "helvetica";
              data.cell.styles.fontStyle = "bold";
            } else {
              data.cell.styles.font = "helvetica";
              data.cell.styles.fontStyle = "normal";
            }
            return;
          }

          data.cell.styles.font = DEVANAGARI_FONT_NAME;
          data.cell.styles.fontStyle = "normal";
        },
      });

      doc.save(`${exportFileName}_${now.toISOString().slice(0, 10)}.pdf`);
      showSuccess("PDF exported successfully!");
    } catch (error) {
      showError(`Failed to export PDF: ${error.message}`);
    }
  };

  // Export to Excel (supports server-side export)
  const exportToExcel = async () => {
    try {
      const XLSX = await loadXlsxLib();

      const exportRows = await getExportRows();
      const visibleColumnKeys = getOrderedColumns()
        .filter((col) => visibleColumns[col.key])
        .map((col) => col.key);
      const exportData = exportRows.map((record, index) => {
        const row = {};
        visibleColumnKeys.forEach((key) => {
          const columnName = formatColumnName(key);
          row[columnName] = getExportValue(record, key, columnName, index);
        });
        return row;
      });
      const preserveTextColorsEnabled =
        String(
          localStorage.getItem(EXPORT_PRESERVE_TEXT_COLOR_MODE_KEY) || "",
        ).toLowerCase() === "true";
      const ws = XLSX.utils.json_to_sheet(exportData);
      if (!ws["!cols"]) ws["!cols"] = [];
      visibleColumnKeys.forEach((key, index) => {
        const columnConfig = tableColumns.find((col) => col.key === key);
        const configuredWidth = Number(columnConfig?.width);
        const width =
          Number.isFinite(configuredWidth) && configuredWidth > 0
            ? Math.min(configuredWidth / 7, 50)
            : 15;
        ws["!cols"][index] = { width };
        const headerCell = XLSX.utils.encode_cell({ r: 0, c: index });
        if (!ws[headerCell]) return;
        ws[headerCell].s = {
          fill: { fgColor: { rgb: "FFFF00" } },
          font: { bold: true },
          alignment: { horizontal: "center" },
        };
      });

      if (preserveTextColorsEnabled) {
        const range = XLSX.utils.decode_range(ws["!ref"] || "A1:A1");
        for (
          let rowIndex = range.s.r + 1;
          rowIndex <= range.e.r;
          rowIndex += 1
        ) {
          for (
            let columnIndex = range.s.c;
            columnIndex <= range.e.c;
            columnIndex += 1
          ) {
            const cellAddress = XLSX.utils.encode_cell({
              r: rowIndex,
              c: columnIndex,
            });
            const cell = ws[cellAddress];
            if (!cell) continue;

            const cellText = String(cell.v ?? "");
            const color = resolveExportTextColor(cellText);
            if (!color) continue;

            const rgbHex = color
              .map((part) => Number(part).toString(16).padStart(2, "0"))
              .join("")
              .toUpperCase();

            cell.s = {
              ...(cell.s || {}),
              font: {
                ...((cell.s && cell.s.font) || {}),
                color: { rgb: rgbHex },
              },
            };
          }
        }
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
      XLSX.writeFile(
        wb,
        `${exportFileName}_${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
      showSuccess("Excel exported successfully!");
    } catch (error) {
      showError(`Failed to export Excel: ${error.message}`);
    }
  };

  // Export to JSON (supports server-side export)
  const exportToJSON = async () => {
    try {
      const exportRows = await getExportRows();
      const visibleColumnKeys = getOrderedColumns()
        .filter((col) => visibleColumns[col.key])
        .map((col) => col.key);
      const exportData = exportRows.map((record, index) => {
        const row = {};
        visibleColumnKeys.forEach((key) => {
          const columnName = formatColumnName(key);
          row[key] = getExportValue(record, key, columnName, index);
        });
        return row;
      });
      const json = JSON.stringify(exportData, null, 2);
      const blob = new Blob([`\uFEFF${json}`], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${exportFileName}_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showSuccess("JSON exported successfully!");
    } catch (error) {
      showError(`Failed to export JSON: ${error.message}`);
    }
  };

  // Helper: build filter params for server-side export
  function buildServerFilterParams() {
    const filterParams = {};
    Object.entries(columnFilters).forEach(([key, value]) => {
      const serverKey = getServerFilterKey(key);
      if (effectiveColumnsWithDropdownFilter.includes(key)) {
        if (value && !value.includes("All") && value.length > 0) {
          filterParams[serverKey] = Array.isArray(value)
            ? value.join(",")
            : value;
        }
      } else {
        if (value && value.trim() !== "") {
          filterParams[serverKey] = value;
        }
      }
    });
    Object.entries(dateFilters || {}).forEach(([key, range]) => {
      if (range.startDate) {
        filterParams[`${key}_start`] = range.startDate.split("T")[0];
      }
      if (range.endDate) {
        filterParams[`${key}_end`] = range.endDate.split("T")[0];
      }
    });
    if (
      activeCardFilter &&
      activeCardFilter !== "total" &&
      activeCardFilter !== "addNew"
    ) {
      filterParams.filter = activeCardFilter;
    }
    if (searchTerm && searchTerm.trim() !== "") {
      filterParams.search = searchTerm.trim();
    }

    if (sortConfig?.key && sortConfig?.direction !== "normal") {
      filterParams.sortBy = getServerFilterKey(sortConfig.key);
      filterParams.sortOrder =
        sortConfig.direction === "ascending" ? "asc" : "desc";
    }

    return appendDataScopeToFilters(filterParams);
  }

  // Handle export
  const handleExport = async (type) => {
    if (!canExport) {
      showError("You don't have export permission for this module");
      return;
    }
    switch (type) {
      case "PDF":
        await exportToPDF();
        break;
      case "Excel":
        await exportToExcel();
        break;
      case "JSON":
        await exportToJSON();
        break;
      default:
        showError(`Export type ${type} not supported`);
    }
  };

  const renderExtraExportItems = () => {
    if (!extraExportItems.length) return null;
    return extraExportItems.map((item, index) => (
      <li key={`extra-export-${index}`}>
        <button
          className="dropdown-item"
          onClick={item.onClick}
          disabled={!canExport}
        >
          {item.label}
        </button>
      </li>
    ));
  };

  const pageInfo = paginationInfo();
  const paginationItems = getPaginationItems();
  const visibleColumnCount = getOrderedColumns().filter(
    (column) => visibleColumns[column.key],
  ).length;

  return (
    <>
      <div className="card">
        <div className="card-header">
          <div className="row align-items-center">
            <div className="col-md-3">
              <h4 className="mb-0">{tableTitle}</h4>
              {activeCardFilter && cards && activeCardFilter !== "addNew" && (
                <small className="text-muted">
                  Filtered by:{" "}
                  {cards.find((card) => card.key === activeCardFilter)?.title}
                </small>
              )}
            </div>
            <div className="col-md-9">
              <div className="d-md-none mobile-icons mt-2">
                <div className="d-flex flex-wrap gap-2">
                  {showSearch && (
                    <button
                      className="btn btn-sm btn-danger flex-grow-1"
                      onClick={() => setShowMobileSearch(!showMobileSearch)}
                    >
                      <i className="fas fa-search"></i>
                    </button>
                  )}
                  {showAdvancedFilter && (
                    <button
                      className="btn btn-md btn-outline-danger me-2"
                      onClick={() => {
                        setShowFilterOffcanvas(true);
                        setCurrentColumnFilter(null);
                      }}
                      title="Advanced Filters"
                    >
                      <i className="fas fa-filter me-1"></i>
                    </button>
                  )}
                  {showRefresh && (
                    <button
                      className="btn btn-sm btn-warning flex-grow-1"
                      onClick={handleRefresh}
                    >
                      <i className="fas fa-sync-alt"></i>
                    </button>
                  )}
                  {showColumnSelector && (
                    <button
                      className="btn btn-sm btn-info flex-grow-1"
                      onClick={() => setShowColumnSelectorOffcanvas(true)}
                    >
                      <i className="fas fa-columns"></i>
                    </button>
                  )}
                  {showExport && (
                    <div className="dropdown flex-grow-1">
                      <button
                        className="btn btn-sm btn-secondary w-100 dropdown-toggle"
                        type="button"
                        data-bs-toggle="dropdown"
                        disabled={!canExport}
                      >
                        <i className="fas fa-download"></i>
                      </button>
                      <ul className="dropdown-menu">
                        {renderExtraExportItems()}
                        <li>
                          <button
                            className="dropdown-item"
                            onClick={() => handleExport("Excel")}
                            disabled={!canExport}
                          >
                            Excel
                          </button>
                        </li>
                        <li>
                          <button
                            className="dropdown-item"
                            onClick={() => handleExport("JSON")}
                            disabled={!canExport}
                          >
                            JSON
                          </button>
                        </li>
                        <li>
                          <button
                            className="dropdown-item"
                            onClick={() => handleExport("PDF")}
                            disabled={!canExport}
                          >
                            PDF
                          </button>
                        </li>
                      </ul>
                    </div>
                  )}
                  <div className="flex-grow-1">
                    <select
                      className="form-select form-select-sm"
                      value={recordsPerPage}
                      onChange={(e) =>
                        handleRecordsPerPageChange(Number(e.target.value))
                      }
                    >
                      <option value="10">10</option>
                      <option value="25">25</option>
                      <option value="50">50</option>
                      <option value="100">100</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="d-none d-md-flex justify-content-end align-items-center">
                {showSearch && (
                  <div
                    className="input-group me-2"
                    style={{ maxWidth: "300px" }}
                  >
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="Search..."
                      value={searchTerm}
                      onChange={(e) => handleGlobalSearch(e.target.value)}
                    />
                    <button className="btn btn-info" type="button">
                      <i className="fas fa-search"></i>
                    </button>
                  </div>
                )}

                <div className="me-2">
                  <select
                    className="form-select form-select-md"
                    value={recordsPerPage}
                    onChange={(e) =>
                      handleRecordsPerPageChange(Number(e.target.value))
                    }
                  >
                    <option value="10">10</option>
                    <option value="25">25</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                    <option value="250">250</option>
                    <option value="500">500</option>
                  </select>
                </div>

                {showAdvancedFilter && (
                  <button
                    className="btn btn-md btn-outline-danger me-2"
                    onClick={() => {
                      setShowFilterOffcanvas(true);
                      setCurrentColumnFilter(null);
                    }}
                    title="Advanced Filters"
                  >
                    <i className="fas fa-filter me-1"></i>
                  </button>
                )}

                {showRefresh && (
                  <button
                    className="btn btn-md btn-danger me-2"
                    onClick={handleRefresh}
                  >
                    <i className="fas fa-sync-alt me-1"></i> Refresh
                  </button>
                )}

                {showColumnSelector && (
                  <button
                    className="btn btn-md btn-success me-2"
                    onClick={() => setShowColumnSelectorOffcanvas(true)}
                  >
                    <i className="fas fa-columns me-1"></i> Select Column
                  </button>
                )}

                {showExport && (
                  <div className="dropdown">
                    <button
                      className="btn btn-md btn-warning dropdown-toggle"
                      type="button"
                      data-bs-toggle="dropdown"
                      disabled={!canExport}
                    >
                      <i className="fas fa-download me-1"></i> Export
                    </button>
                    <ul className="dropdown-menu">
                      {renderExtraExportItems()}
                      <li>
                        <button
                          className="dropdown-item"
                          onClick={() => handleExport("Excel")}
                          disabled={!canExport}
                        >
                          Excel
                        </button>
                      </li>
                      <li>
                        <button
                          className="dropdown-item"
                          onClick={() => handleExport("JSON")}
                          disabled={!canExport}
                        >
                          JSON
                        </button>
                      </li>
                      <li>
                        <button
                          className="dropdown-item"
                          onClick={() => handleExport("PDF")}
                          disabled={!canExport}
                        >
                          PDF
                        </button>
                      </li>
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>

          {showMobileSearch && showSearch && (
            <div className="row mt-2 d-md-none">
              <div className="col-12">
                <div className="input-group">
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="Search..."
                    value={searchTerm}
                    onChange={(e) => handleGlobalSearch(e.target.value)}
                  />
                  <button className="btn btn-info" type="button">
                    <i className="fas fa-search"></i>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="card-body">
          <div
            className="table-responsive"
            style={{ overflowX: "auto", position: "relative" }}
            ref={tableContainerRef}
          >
            <table
              className="table table-hover table-striped table-bordered"
              style={{ minWidth: "100%" }}
              ref={tableRef}
            >
              <thead className="table-light">
                <tr ref={headerRowRef}>
                  {getOrderedColumns().map(
                    (column) =>
                      visibleColumns[column.key] && (
                        <th
                          key={column.key}
                          scope="col"
                          data-column-key={column.key}
                          style={{
                            cursor: isSortableColumn(column)
                              ? "pointer"
                              : "default",
                            width: column.width,
                            minWidth: column.width,
                            whiteSpace: "nowrap",
                            position: isPinned(column.key)
                              ? "sticky"
                              : "relative",
                            userSelect: "none",
                            left:
                              isPinned(column.key) === "left" ? "0" : undefined,
                            right:
                              isPinned(column.key) === "right"
                                ? "0"
                                : undefined,
                            zIndex: isPinned(column.key) ? 2 : 1,
                            transform:
                              isPinned(column.key) === "left" ||
                              isPinned(column.key) === "right"
                                ? "translateX(-1px)"
                                : undefined,
                          }}
                        >
                          <div className="d-flex flex-column">
                            <div
                              className="d-flex align-items-center"
                              onClick={(e) => {
                                if (isSortableColumn(column)) {
                                  handleSort(column.key, e);
                                }
                              }}
                              onMouseDown={(e) => startDragging(column.key, e)}
                              style={{
                                cursor: isSortableColumn(column)
                                  ? "pointer"
                                  : "default",
                              }}
                            >
                              {column.label}
                              {isSortableColumn(column)
                                ? getSortIcon(column.key)
                                : null}
                            </div>

                            {isFilterableColumn(column) && (
                              <>
                                {columnsWithDateFilter.includes(column.key) ? (
                                  <div className="d-flex gap-1 mt-1 position-relative">
                                    <input
                                      type="date"
                                      className="form-control form-control-sm"
                                      placeholder="Start Date"
                                      value={
                                        dateFilters[column.key]?.startDate || ""
                                      }
                                      onChange={(e) =>
                                        handleDateFilterChange(
                                          column.key,
                                          "startDate",
                                          e.target.value,
                                          e,
                                        )
                                      }
                                      onClick={(e) => e.stopPropagation()}
                                      style={{ width: "110px" }}
                                    />
                                    <input
                                      type="date"
                                      className="form-control form-control-sm"
                                      placeholder="End Date"
                                      value={
                                        dateFilters[column.key]?.endDate || ""
                                      }
                                      onChange={(e) =>
                                        handleDateFilterChange(
                                          column.key,
                                          "endDate",
                                          e.target.value,
                                          e,
                                        )
                                      }
                                      onClick={(e) => e.stopPropagation()}
                                      style={{ width: "110px" }}
                                    />
                                  </div>
                                ) : (
                                  <div className="input-group mt-1">
                                    <input
                                      type="text"
                                      className="form-control form-control-sm"
                                      placeholder={`Filter ${column.label}`}
                                      value={
                                        effectiveColumnsWithDropdownFilter.includes(
                                          column.key,
                                        )
                                          ? getFilterDisplayText(column.key)
                                          : columnFilters[column.key] || ""
                                      }
                                      onChange={(e) =>
                                        handleColumnFilterChange(
                                          column.key,
                                          e.target.value,
                                          e,
                                        )
                                      }
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                    {effectiveColumnsWithDropdownFilter.includes(
                                      column.key,
                                    ) && (
                                      <button
                                        className="btn btn-outline-secondary btn-sm dropdown-toggle1 rounded-end-1"
                                        type="button"
                                        onClick={(e) => {
                                          setShowFilterOffcanvas(true);
                                          setCurrentColumnFilter(column.key);
                                        }}
                                        title="Advanced Filter"
                                      >
                                        <i className="fas fa-filter"></i>
                                      </button>
                                    )}
                                  </div>
                                )}
                              </>
                            )}
                          </div>

                          <div
                            className="column-resize-handle"
                            onMouseDown={(e) => startResizing(column.key, e)}
                            style={{
                              position: "absolute",
                              right: 0,
                              top: 0,
                              bottom: 0,
                              width: "3px",
                              cursor: "col-resize",
                              backgroundColor:
                                resizing.columnKey === column.key
                                  ? "#ff0000"
                                  : "transparent",
                              zIndex: 3,
                            }}
                          />
                        </th>
                      ),
                  )}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={getOrderedColumns().length}
                      className="text-center py-4"
                    >
                      <div className="d-flex justify-content-center">
                        <Player
                          autoplay
                          loop
                          src="/Json/loading3.json"
                          style={{
                            width: "110px",
                            height: "110px",
                          }}
                        />
                      </div>
                      <p className="mt-2 mb-0 fw-bold">Loading data...</p>
                    </td>
                  </tr>
                ) : !canShowTableData ? (
                  <tr>
                    <td
                      colSpan={getOrderedColumns().length}
                      className="text-center py-3"
                    >
                      <div
                        className="d-flex flex-column align-items-center justify-content-center mx-auto px-3 py-3"
                        style={{
                          maxWidth: "460px",
                          borderRadius: "16px",
                          border: "1px solid #e9eef5",
                          background:
                            "linear-gradient(135deg, #f7fbff 0%, #fff9f2 100%)",
                        }}
                      >
                        <div
                          className="rounded-circle d-flex align-items-center justify-content-center mb-3"
                          style={{
                            width: "56px",
                            height: "56px",
                            background: "rgba(255, 193, 7, 0.18)",
                            color: "#8f6200",
                          }}
                        >
                          <i className="fas fa-eye-slash fs-4"></i>
                        </div>
                        <h6 className="mb-1 fw-semibold">Table data hidden</h6>
                        <p className="mb-0 text-muted small">
                          You do not have permission to view table data for this
                          module.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : paginatedData.length > 0 ? (
                  paginatedData.map((record, index) => {
                    const displayIndex = serverSide
                      ? (currentPage - 1) * recordsPerPage + index + 1
                      : (currentPage - 1) * recordsPerPage + index + 1;

                    const rowCanExpand =
                      expandableRows && typeof canExpandRow === "function"
                        ? canExpandRow(record)
                        : false;
                    const rowExpanded =
                      rowCanExpand && typeof isRowExpanded === "function"
                        ? Boolean(isRowExpanded(record))
                        : false;
                    const expandedContent =
                      rowExpanded && typeof renderExpandedRow === "function"
                        ? renderExpandedRow(record)
                        : null;
                    const rowKey = record.id || record._id || index;

                    return (
                      <React.Fragment key={rowKey}>
                        <tr>
                          {getOrderedColumns().map(
                            (column) =>
                              visibleColumns[column.key] && (
                                <td
                                  key={`${rowKey}-${column.key}`}
                                  style={{
                                    whiteSpace: "nowrap",
                                    width: column.width,
                                    minWidth: column.width,
                                    position: isPinned(column.key)
                                      ? "sticky"
                                      : undefined,
                                    left:
                                      isPinned(column.key) === "left"
                                        ? "0"
                                        : undefined,
                                    right:
                                      isPinned(column.key) === "right"
                                        ? "0"
                                        : undefined,
                                    marginLeft:
                                      isPinned(column.key) === "left"
                                        ? "-2px"
                                        : undefined,
                                    marginRight:
                                      isPinned(column.key) === "right"
                                        ? "-2px"
                                        : undefined,
                                    zIndex: isPinned(column.key) ? 2 : 1,
                                    transform:
                                      isPinned(column.key) === "left" ||
                                      isPinned(column.key) === "right"
                                        ? "translateX(-1px)"
                                        : undefined,
                                  }}
                                >
                                  {column.key === "sn" ? (
                                    showExpandToggleInSn && rowCanExpand ? (
                                      <div className="d-flex align-items-center gap-2">
                                        <span>{displayIndex}</span>
                                        <span
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (
                                              typeof onToggleExpandRow ===
                                              "function"
                                            ) {
                                              onToggleExpandRow(record);
                                            }
                                          }}
                                          title={
                                            rowExpanded
                                              ? "Collapse details"
                                              : "Expand details"
                                          }
                                          style={{
                                            cursor:
                                              typeof onToggleExpandRow ===
                                              "function"
                                                ? "pointer"
                                                : "default",
                                            display: "flex",
                                            alignItems: "center",
                                          }}
                                        >
                                          <i
                                            className={`fa-solid ${
                                              rowExpanded
                                                ? "fa-circle-minus text-danger"
                                                : "fa-circle-plus text-success"
                                            }`}
                                            style={{ fontSize: "14px" }}
                                          ></i>
                                        </span>
                                      </div>
                                    ) : column.render ? (
                                      column.render(
                                        record[column.key],
                                        record,
                                        displayIndex,
                                      )
                                    ) : (
                                      displayIndex
                                    )
                                  ) : column.key === "action" && showActions ? (
                                    <div className="d-flex">
                                      {actions.includes("view") && onView && (
                                        <button
                                          className="btn btn-sm btn-outline-info me-1"
                                          onClick={() =>
                                            canRead && onView(record)
                                          }
                                          title="View"
                                          disabled={!canRead}
                                          style={getDisabledActionStyle(
                                            canRead,
                                          )}
                                        >
                                          <i className="fa-solid fa-eye"></i>
                                        </button>
                                      )}
                                      {actions.includes("edit") && onEdit && (
                                        <button
                                          className="btn btn-sm btn-outline-primary me-1"
                                          onClick={() =>
                                            canUpdate && onEdit(record)
                                          }
                                          title="Edit"
                                          disabled={!canUpdate}
                                          style={getDisabledActionStyle(
                                            canUpdate,
                                          )}
                                        >
                                          <i className="fas fa-edit"></i>
                                        </button>
                                      )}
                                      {actions.includes("delete") &&
                                        onDelete && (
                                          <button
                                            className="btn btn-sm btn-outline-danger me-1"
                                            onClick={() =>
                                              canDelete &&
                                              (skipDeleteConfirmation
                                                ? onDelete(
                                                    record._id || record.id,
                                                  )
                                                : confirmDelete(record))
                                            }
                                            title="Delete"
                                            disabled={!canDelete}
                                            style={getDisabledActionStyle(
                                              canDelete,
                                            )}
                                          >
                                            <i className="fas fa-trash"></i>
                                          </button>
                                        )}
                                      {customActions && customActions(record)}
                                    </div>
                                  ) : column.render ? (
                                    column.render(
                                      record[column.key],
                                      record,
                                      displayIndex,
                                    )
                                  ) : column.key === "status" &&
                                    actions.includes("status") &&
                                    onStatusToggle ? (
                                    <div className="form-check form-switch">
                                      <input
                                        className="form-check-input"
                                        type="checkbox"
                                        checked={
                                          record.status === "Active" ||
                                          record.status === "active"
                                        }
                                        onChange={() =>
                                          canUpdate &&
                                          onStatusToggle(
                                            record._id || record.id,
                                          )
                                        }
                                        style={getDisabledActionStyle(
                                          canUpdate,
                                        )}
                                        disabled={!canUpdate}
                                      />
                                      <label className="form-check-label">
                                        {record.status}
                                      </label>
                                    </div>
                                  ) : column.key === "status" &&
                                    !onStatusToggle ? (
                                    <span
                                      className={`badge ${getStatusBadgeClass(record.status)}`}
                                    >
                                      {record.status}
                                    </span>
                                  ) : columnsWithDateFilter.includes(
                                      column.key,
                                    ) ? (
                                    formatDateForDisplay(record[column.key])
                                  ) : (
                                    record[column.key]
                                  )}
                                </td>
                              ),
                          )}
                        </tr>

                        {rowExpanded && expandedContent && (
                          <tr className={expandedRowClassName}>
                            <td colSpan={visibleColumnCount}>
                              {expandedContent}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                ) : (
                  <tr>
                    <td
                      colSpan={getOrderedColumns().length}
                      className="text-center py-2"
                    >
                      <div
                        className="d-flex flex-column align-items-center justify-content-center mx-auto px-3 py-3"
                        style={{
                          maxWidth: "460px",
                          borderRadius: "16px",
                          border: "1px solid #e9eef5",
                          background:
                            "linear-gradient(135deg, #f7fbff 0%, #fff9f2 100%)",
                        }}
                      >
                        <div
                          className="rounded-circle d-flex align-items-center justify-content-center mb-3"
                          style={{
                            width: "56px",
                            height: "56px",
                            background: "rgba(13, 253, 17, 0.12)",
                            color: "#049428",
                          }}
                        >
                          <i className="fas fa-inbox fs-4"></i>
                        </div>
                        <h6 className="mb-1 fw-semibold">No records found</h6>
                        <p className="mb-0 text-muted small">
                          Try adjusting your search or filters, then check
                          again.
                        </p>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary mt-2"
                          onClick={handleClearFilters}
                        >
                          Clear Filters
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {openFilterDropdown && (
            <div
              className="dropdown-menu p-0 show"
              style={{
                width: `${dropdownPosition.width}px`,
                maxWidth: "100vw",
                zIndex: 1060,
                position: "fixed",
                top: `${dropdownPosition.top}px`,
                left: `${dropdownPosition.left}px`,
                boxShadow: "0 0.5rem 1rem rgba(0, 0, 0, 0.15)",
                border: "1px solid rgba(0, 0, 0, 0.15)",
                borderRadius: "0.375rem",
                maxHeight: "min(70vh, calc(100vh - 20px))",
                overflowY: "auto",
              }}
              ref={(el) => (dropdownRefs.current[openFilterDropdown] = el)}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="p-3"
                style={{ borderBottom: "1px solid #dee2e6" }}
              >
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <span className="fw-bold fs-14">
                    {
                      tableColumns.find((c) => c.key === openFilterDropdown)
                        ?.label
                    }{" "}
                    Filter
                  </span>
                  <div>
                    <button
                      className="btn btn-sm btn-outline-danger me-1"
                      onClick={(e) => {
                        clearColumnFilters(openFilterDropdown, e);
                        setFilterSearchTerm("");
                      }}
                      title="Clear all filters for this column"
                    >
                      <i className="fa-solid fa-eraser"></i>
                    </button>
                    <button
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() => setOpenFilterDropdown(null)}
                      title="Close filter menu"
                    >
                      <i className="fas fa-times"></i>
                    </button>
                  </div>
                </div>

                <div className="d-flex align-items-center gap-2">
                  <input
                    type="text"
                    className="form-control form-control-sm flex-grow-1"
                    placeholder="Search options..."
                    value={filterSearchTerm}
                    onChange={(e) => setFilterSearchTerm(e.target.value)}
                    style={{ minWidth: "180px" }}
                  />
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id={`${openFilterDropdown}-all`}
                      checked={
                        Array.isArray(columnFilters[openFilterDropdown]) &&
                        columnFilters[openFilterDropdown].includes("All")
                      }
                      onChange={(e) =>
                        handleSelectFilterChange(
                          openFilterDropdown,
                          "All",
                          e.target.checked,
                          e,
                        )
                      }
                    />
                    <label
                      className="form-check-label"
                      htmlFor={`${openFilterDropdown}-all`}
                    >
                      All
                    </label>
                  </div>
                </div>
              </div>

              <div
                style={{
                  maxHeight: "300px",
                  overflowY: "auto",
                  padding: "0 20px",
                }}
              >
                {(dynamicFilterOptions[openFilterDropdown] || [])
                  .filter((opt) => opt !== "All")
                  .filter(
                    (opt) =>
                      filterSearchTerm === "" ||
                      opt
                        .toLowerCase()
                        .includes(filterSearchTerm.toLowerCase()),
                  ).length > 0 ? (
                  (dynamicFilterOptions[openFilterDropdown] || [])
                    .filter((opt) => opt !== "All")
                    .filter(
                      (opt) =>
                        filterSearchTerm === "" ||
                        opt
                          .toLowerCase()
                          .includes(filterSearchTerm.toLowerCase()),
                    )
                    .map((option) => (
                      <div
                        key={`${openFilterDropdown}-${option}`}
                        className="form-check py-1"
                      >
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id={`${openFilterDropdown}-${option}`}
                          checked={
                            Array.isArray(columnFilters[openFilterDropdown]) &&
                            columnFilters[openFilterDropdown].includes(option)
                          }
                          onChange={(e) =>
                            handleSelectFilterChange(
                              openFilterDropdown,
                              option,
                              e.target.checked,
                              e,
                            )
                          }
                        />
                        <label
                          className="form-check-label"
                          htmlFor={`${openFilterDropdown}-${option}`}
                        >
                          {option}
                        </label>
                      </div>
                    ))
                ) : (
                  <div className="text-center py-2 text-muted">
                    No options found
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="row align-items-center mt-3">
            <div className="col-12 col-lg-6 text-start text-lg-start mb-2 mb-lg-0">
              <p className="mb-0">
                Showing{" "}
                <span className="font-medium">{pageInfo.startRecord}</span> to{" "}
                <span className="font-medium">{pageInfo.endRecord}</span> of{" "}
                <span className="font-medium">{pageInfo.totalRecords}</span>{" "}
                results
              </p>
            </div>
            <div className="col-12 col-lg-6 d-flex justify-content-start justify-content-lg-end">
              <nav>
                <ul className="pagination mb-0">
                  <li
                    className={`page-item ${
                      pageInfo.isPrevDisabled ? "disabled" : ""
                    }`}
                  >
                    <button
                      className="page-link"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={pageInfo.isPrevDisabled}
                    >
                      <i className="fas fa-chevron-left"></i>
                    </button>
                  </li>
                  {paginationItems}
                  <li
                    className={`page-item ${
                      pageInfo.isNextDisabled ? "disabled" : ""
                    }`}
                  >
                    <button
                      className="page-link"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={pageInfo.isNextDisabled}
                    >
                      <i className="fas fa-chevron-right"></i>
                    </button>
                  </li>
                </ul>
              </nav>
            </div>
          </div>
        </div>
      </div>

      {showColumnSelectorOffcanvas && (
        <ColumnSelectorOffcanvas
          show={showColumnSelectorOffcanvas}
          onHide={() => setShowColumnSelectorOffcanvas(false)}
          columns={tableColumns}
          setColumns={setTableColumns}
          visibleColumns={visibleColumns}
          setVisibleColumns={setVisibleColumns}
          fixedColumns={fixedColumns}
          pinnedColumns={pinnedColumns}
          setPinnedColumns={setPinnedColumns}
          handleAutoResizeAll={handleAutoResizeAll}
          handleAutoResizeColumn={handleAutoResizeColumn}
        />
      )}

      {showFilterOffcanvas && (
        <AdvancedFilterOffcanvas
          show={showFilterOffcanvas}
          onHide={() => setShowFilterOffcanvas(false)}
          columns={tableColumns}
          columnFilters={columnFilters}
          setColumnFilters={setColumnFilters}
          filterOptions={dynamicFilterOptions}
          currentColumnFilter={currentColumnFilter}
          setCurrentColumnFilter={setCurrentColumnFilter}
        />
      )}

      {showConfirmModal && (
        <ConfirmationModal
          show={showConfirmModal}
          onHide={() => setShowConfirmModal(false)}
          onConfirm={handleConfirmAction}
          title="Confirm Deletion"
          message={(() => {
            const details = getDeleteRecordMeta(modalConfig?.recordData);
            return (
              <>
                Are you sure you want to delete this{" "}
                {details.entityLabel.toLowerCase()}?
                <br />
                {details.primaryLabel}:{" "}
                <strong>{details.primaryValue || "-"}</strong>
                <br />
                {details.secondaryLabel}:{" "}
                <strong>{details.secondaryValue || "-"}</strong>
              </>
            );
          })()}
          confirmText="Delete"
          variant="danger"
        />
      )}
    </>
  );
};

export default ReusableTable;
