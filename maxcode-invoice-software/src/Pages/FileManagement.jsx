import React, { useEffect, useMemo, useRef, useState } from "react";
import ReusableTable from "../Components/ReusableTable";
import Createfile from "../Components/Createfile";
import ConfirmationModal from "../Components/ConfirmationModal";
import {
  showError,
  showInfo,
  showSuccess,
} from "../Components/ToastNotification";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { apiDelete, apiGet, apiPost } from "../utils/api";
import { hasActionPermission } from "../utils/permissions";

const splitPath = (value = "") =>
  String(value || "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

const normalizePathForMatch = (value = "") =>
  String(value || "")
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join("/");

const removeRootSegment = (value = "") => {
  const segments = splitPath(value);
  if (segments.length <= 1) return value;
  return segments.slice(1).join("/");
};

const isPathInsideFolder = (recordPath = "", folderPath = "") => {
  const normalizedRecordPath = normalizePathForMatch(recordPath);
  const normalizedFolderPath = normalizePathForMatch(folderPath);

  if (!normalizedRecordPath || !normalizedFolderPath) return false;

  if (
    normalizedRecordPath === normalizedFolderPath ||
    normalizedRecordPath.startsWith(`${normalizedFolderPath}/`)
  ) {
    return true;
  }

  const trimmedRecordPath = normalizePathForMatch(
    removeRootSegment(normalizedRecordPath),
  );
  const trimmedFolderPath = normalizePathForMatch(
    removeRootSegment(normalizedFolderPath),
  );

  if (!trimmedRecordPath || !trimmedFolderPath) return false;

  return (
    trimmedRecordPath === trimmedFolderPath ||
    trimmedRecordPath.startsWith(`${trimmedFolderPath}/`)
  );
};

const formatBytes = (bytes) => {
  const numeric = Number(bytes || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const power = Math.min(Math.floor(Math.log(numeric) / Math.log(1024)), 4);
  const size = numeric / Math.pow(1024, power);
  return `${size.toFixed(size >= 100 || power === 0 ? 0 : 2)} ${units[power]}`;
};

const extractApiErrorMessage = (error, fallbackMessage = "Request failed") => {
  const responsePayload = error?.response?.data;

  const candidateValues = [
    responsePayload?.error,
    responsePayload?.message,
    error?.message,
  ];

  for (const candidate of candidateValues) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
    if (candidate && typeof candidate === "object") {
      const nestedMessage =
        candidate.error || candidate.message || JSON.stringify(candidate);
      if (typeof nestedMessage === "string" && nestedMessage.trim()) {
        return nestedMessage.trim();
      }
    }
  }

  return fallbackMessage;
};

const parseFileSizeToBytes = (value) => {
  if (value === null || value === undefined) return 0;

  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  const text = String(value).trim();
  if (!text) return 0;

  const numberMatch = text.match(/^[\d.,]+/);
  if (!numberMatch) return 0;

  const numeric = Number(numberMatch[0].replace(/,/g, ""));
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;

  const unitText = text.slice(numberMatch[0].length).trim().toUpperCase();
  const normalizedUnit =
    unitText === "" ||
    unitText === "B" ||
    unitText === "BYTE" ||
    unitText === "BYTES"
      ? "B"
      : unitText;

  const multipliers = {
    B: 1,
    KB: 1024,
    MB: 1024 ** 2,
    GB: 1024 ** 3,
    TB: 1024 ** 4,
  };

  const multiplier = multipliers[normalizedUnit] || 1;
  return Math.round(numeric * multiplier);
};

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
  const candidates = [record.filePath, record.fileName, record.originalName]
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
    if (extension) return extension;
  }

  return "";
};

const getFileCategory = (record = {}) => {
  const extension = getFileExtension(record);
  const fileType = String(record.fileType || "").toLowerCase();

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

const buildTreeRows = (records = [], expandedFolderKeys = {}) => {
  const roots = [];
  const nodeMap = new Map();

  const ensureFolderNode = ({ key, name, depth, absolutePath }) => {
    if (nodeMap.has(key)) {
      return nodeMap.get(key);
    }

    const folderNode = {
      id: key,
      key,
      expandKey: String(key || absolutePath || ""),
      rowType: "folder",
      name,
      depth,
      absolutePath,
      children: [],
      folderName: splitPath(absolutePath)[0] || "-",
      uploadDate: null,
      fileType: "Folder",
      fileSize: "-",
      fileUrl: null,
      sourceRecord: null,
      isExpandable: true,
    };
    nodeMap.set(key, folderNode);
    return folderNode;
  };

  records.forEach((record, recordIndex) => {
    const fullSegments = splitPath(
      record.filePath || `${record.folderName || ""}/${record.fileName || ""}`,
    );

    if (fullSegments.length <= 1) {
      const absolutePath =
        record.filePath || `${record.folderName}/${record.fileName}`;
      const uniqueFileRef = String(
        record.id ||
          record._id ||
          absolutePath ||
          `${record.folderName || ""}/${record.fileName || ""}` ||
          `row-${recordIndex}`,
      );
      const fileSizeBytes =
        Number(record.fileSizeBytes || 0) ||
        parseFileSizeToBytes(record.fileSize);

      roots.push({
        id: `file:${uniqueFileRef}`,
        key: `file:${uniqueFileRef}`,
        rowType: "file",
        name: record.fileName,
        fileName: record.fileName,
        depth: 0,
        absolutePath,
        children: [],
        folderName: record.folderName || "-",
        uploadDate: record.uploadDate,
        fileType: record.fileType,
        fileSizeBytes,
        fileSize: record.fileSize,
        fileUrl: record.fileUrl,
        sourceRecord: record,
        isExpandable: false,
      });
      return;
    }

    let parentNode = null;
    const fileSegment =
      fullSegments[fullSegments.length - 1] || record.fileName;

    for (let index = 0; index < fullSegments.length - 1; index += 1) {
      const segment = fullSegments[index];
      const absolutePath = fullSegments.slice(0, index + 1).join("/");
      const folderKey = `folder:${absolutePath}`;
      const folderNode = ensureFolderNode({
        key: folderKey,
        name: segment,
        depth: index,
        absolutePath,
      });

      if (parentNode) {
        if (!parentNode.children.some((child) => child.id === folderNode.id)) {
          parentNode.children.push(folderNode);
        }
      } else if (!roots.some((child) => child.id === folderNode.id)) {
        roots.push(folderNode);
      }

      parentNode = folderNode;
    }

    const absolutePath = fullSegments.join("/");
    const uniqueFileRef = String(
      record.id ||
        record._id ||
        absolutePath ||
        `${record.folderName || ""}/${record.fileName || ""}` ||
        `row-${recordIndex}`,
    );
    const fileSizeBytes =
      Number(record.fileSizeBytes || 0) ||
      parseFileSizeToBytes(record.fileSize);

    const fileNode = {
      id: `file:${uniqueFileRef}`,
      key: `file:${uniqueFileRef}`,
      rowType: "file",
      name: fileSegment || record.fileName,
      fileName: fileSegment || record.fileName,
      depth: Math.max(0, fullSegments.length - 1),
      absolutePath,
      children: [],
      folderName: record.folderName || "-",
      uploadDate: record.uploadDate,
      fileType: record.fileType,
      fileSizeBytes,
      fileSize: record.fileSize,
      fileUrl: record.fileUrl,
      sourceRecord: record,
      isExpandable: false,
    };

    if (parentNode) {
      parentNode.children.push(fileNode);
    } else {
      roots.push(fileNode);
    }
  });

  const sortNodes = (nodes = []) => {
    nodes.sort((a, b) => {
      if (a.rowType !== b.rowType) {
        return a.rowType === "folder" ? -1 : 1;
      }
      return String(a.name || "").localeCompare(String(b.name || ""), "en", {
        sensitivity: "base",
      });
    });

    nodes.forEach((node) => {
      if (node.children?.length) {
        sortNodes(node.children);
      }
    });
  };

  sortNodes(roots);

  const aggregateFolderNodes = (nodes = []) => {
    nodes.forEach((node) => {
      if (node.rowType !== "folder") {
        return;
      }

      if (node.children?.length) {
        aggregateFolderNodes(node.children);
      }

      let totalBytes = 0;
      let latestUploadDate = null;

      const collect = (items = []) => {
        items.forEach((item) => {
          if (item.rowType === "folder") {
            collect(item.children || []);
            return;
          }

          const size = Number(item.fileSizeBytes || 0) || 0;
          totalBytes += size;

          if (item.uploadDate) {
            const ts = new Date(item.uploadDate).getTime();
            if (
              Number.isFinite(ts) &&
              (!latestUploadDate || ts > new Date(latestUploadDate).getTime())
            ) {
              latestUploadDate = item.uploadDate;
            }
          }
        });
      };

      collect(node.children || []);
      node.fileSizeBytes = totalBytes;
      node.fileSize = formatBytes(totalBytes);
      node.uploadDate = latestUploadDate;
    });
  };

  aggregateFolderNodes(roots);

  const flatten = (nodes = []) => {
    const output = [];
    nodes.forEach((node) => {
      output.push(node);
      const expandKey = String(node.expandKey || node.key || "");
      if (
        node.rowType === "folder" &&
        node.children?.length > 0 &&
        expandedFolderKeys[expandKey]
      ) {
        output.push(...flatten(node.children));
      }
    });
    return output;
  };

  return flatten(roots).map((node, index) => ({
    ...(node.rowType === "folder"
      ? {
          isExpanded: Boolean(
            expandedFolderKeys[String(node.expandKey || node.key || "")],
          ),
        }
      : {}),
    ...node,
    fileName: node.fileName || node.name || "",
    sn: index + 1,
  }));
};

const MIN_DOWNLOAD_SPINNER_MS = 500;

const buildStableDownloadKey = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase();

const waitForUiPaint = async () => {
  await new Promise((resolve) => requestAnimationFrame(resolve));
  await new Promise((resolve) => requestAnimationFrame(resolve));
  await new Promise((resolve) => setTimeout(resolve, 30));
};

const FileManagement = () => {
  const moduleKey = "fileManagement";
  const canCreate = hasActionPermission(moduleKey, "create");
  const canDelete = hasActionPermission(moduleKey, "delete");
  const canUpdate = hasActionPermission(moduleKey, "update");
  const canRead = hasActionPermission(moduleKey, "read");

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);
  const [statistics, setStatistics] = useState({
    total: 0,
    documents: 0,
    images: 0,
    videos: 0,
    others: 0,
  });
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [fileToDelete, setFileToDelete] = useState(null);
  const [folderToDelete, setFolderToDelete] = useState(null);
  const [deleteTargetName, setDeleteTargetName] = useState("");
  const [deleteFromCloudflare, setDeleteFromCloudflare] = useState(false);
  const [isCloudDeleteTarget, setIsCloudDeleteTarget] = useState(false);
  const [formMode, setFormMode] = useState("create");
  const [editingRecord, setEditingRecord] = useState(null);
  const [cloudflareSettings, setCloudflareSettings] = useState({});

  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(10);
  const [filters, setFilters] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState(null);
  const [sortDirection, setSortDirection] = useState("normal");
  const [activeCardFilter, setActiveCardFilter] = useState("total");
  const [dynamicFilterOptions, setDynamicFilterOptions] = useState({});
  const [dynamicFolderOptions, setDynamicFolderOptions] = useState([]);
  const [expandedFolderKeys, setExpandedFolderKeys] = useState({});
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [isCleaningTempStorage, setIsCleaningTempStorage] = useState(false);
  const [showTempCleanupConfirm, setShowTempCleanupConfirm] = useState(false);
  const [isCloudflareSettingsReady, setIsCloudflareSettingsReady] =
    useState(false);
  const [downloadingFolderKey, setDownloadingFolderKey] = useState("");
  const [downloadingFileKey, setDownloadingFileKey] = useState("");

  const abortControllerRef = useRef(null);

  useEffect(() => {
    document.title = "File Management | MaxCode IT Services";
    loadCloudflareSettings();
  }, []);

  useEffect(() => {
    if (!isCloudflareSettingsReady) return;
    fetchFiles();
  }, [
    isCloudflareSettingsReady,
    currentPage,
    recordsPerPage,
    filters,
    searchTerm,
    sortField,
    sortDirection,
    activeCardFilter,
    refreshNonce,
    cloudflareSettings,
  ]);

  const loadCloudflareSettings = async () => {
    try {
      const response = await apiGet(API_ENDPOINTS.BUSINESS_SETTINGS.GET);
      setCloudflareSettings(response?.data?.settings?.cloudflareSettings || {});
    } catch {
      setCloudflareSettings({});
    } finally {
      setIsCloudflareSettingsReady(true);
    }
  };

  const getCloudRequestHeaders = (settings = cloudflareSettings) => ({
    "x-cloud-store-url": String(settings?.storeUrl || ""),
    "x-cloud-public-domain": String(settings?.publicDomain || ""),
    "x-cloud-default-folder": String(settings?.defaultFolder || ""),
  });

  const resolveCloudflareSettingsForRequest = async (persistToState = true) => {
    const hasStateSettings = Boolean(cloudflareSettings?.storeUrl);

    if (hasStateSettings) {
      return cloudflareSettings;
    }

    try {
      const response = await apiGet(API_ENDPOINTS.BUSINESS_SETTINGS.GET);
      const latestSettings = response?.data?.settings?.cloudflareSettings || {};

      if (latestSettings?.storeUrl) {
        if (persistToState) {
          setCloudflareSettings(latestSettings);
        }
        return latestSettings;
      }
    } catch {
      // Handled by null return below.
    }

    return null;
  };

  const fetchFiles = async (settingsOverride = null) => {
    const effectiveSettings = settingsOverride?.storeUrl
      ? settingsOverride
      : cloudflareSettings;

    // Abort previous request if still pending
    if (abortControllerRef.current) {
      try {
        abortControllerRef.current.abort();
      } catch {
        // Ignore abort errors
      }
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);

    try {
      const pageNum = Math.max(1, Number(currentPage || 1));
      const limitNum = Math.max(1, Number(recordsPerPage || 10));
      const maxPagesToScan = 20;

      const nameFilterTerm =
        typeof filters?.fileName === "string" ? filters.fileName.trim() : "";
      const effectiveSearchTerm =
        nameFilterTerm ||
        (typeof searchTerm === "string" ? searchTerm.trim() : "");

      const buildParams = (pageValue) => {
        const params = new URLSearchParams();
        params.append("page", String(pageValue));
        params.append("limit", String(limitNum));
        params.append("source", "cloud");

        if (effectiveSearchTerm) {
          params.append("search", effectiveSearchTerm);
        }

        if (activeCardFilter && activeCardFilter !== "total") {
          params.append("filter", activeCardFilter);
        }

        Object.entries(filters).forEach(([key, value]) => {
          if (
            value === undefined ||
            value === null ||
            value === "" ||
            value === "All" ||
            key === "fileName" ||
            key === "sn" ||
            key === "action"
          ) {
            return;
          }

          if (value && typeof value === "object") {
            if (value.startDate) {
              params.append(`${key}_start`, value.startDate);
            }
            if (value.endDate) {
              params.append(`${key}_end`, value.endDate);
            }
            return;
          }

          if (Array.isArray(value) && value.length > 0) {
            params.append(key, value.join(","));
            return;
          }

          params.append(key, value);
        });

        if (sortField && sortDirection !== "normal") {
          params.append("sortBy", sortField);
          params.append(
            "sortOrder",
            sortDirection === "ascending" ? "asc" : "desc",
          );
        }

        return params;
      };

      const cloudHeaders = {
        "x-cloud-store-url": String(effectiveSettings?.storeUrl || ""),
        "x-cloud-public-domain": String(effectiveSettings?.publicDomain || ""),
        "x-cloud-default-folder": String(
          effectiveSettings?.defaultFolder || "",
        ),
      };

      const normalizeRows = (rows = []) =>
        rows.map((item) => ({
          ...item,
          id: item._id || item.id,
          uploadDate: item.uploadDate || item.createdAt,
        }));

      const getVisibleRowCount = (rows = []) =>
        buildTreeRows(normalizeRows(rows), {}).length;

      let firstResponseData = null;
      let totalFromApi = 0;
      let fetchPage = pageNum;
      let fetchedPageCount = 0;
      let collectedRows = [];

      while (fetchedPageCount < maxPagesToScan) {
        const params = buildParams(fetchPage);
        const response = await apiGet(
          `${API_ENDPOINTS.FILES.LIST}?${params.toString()}`,
          {
            signal: controller.signal,
            headers: cloudHeaders,
          },
        );

        const responseData = response?.data || {};
        if (!firstResponseData) {
          firstResponseData = responseData;
          totalFromApi = Number(responseData?.pagination?.totalRecords || 0);

          const sourceMeta = String(responseData?.meta?.source || "");
          if (sourceMeta === "mongodb-fallback") {
            const fallbackReason = String(
              responseData?.meta?.cloudFallbackReason || "",
            ).trim();
            const fallbackAttempts = Array.isArray(
              responseData?.meta?.cloudFallbackAttempts,
            )
              ? responseData.meta.cloudFallbackAttempts
              : [];

            showInfo(
              fallbackReason
                ? `Cloudflare listing unavailable (${fallbackReason}). Showing database fallback data.`
                : "Cloudflare listing unavailable. Showing database fallback data.",
            );

            if (fallbackAttempts.length > 0) {
              console.warn("Cloudflare listing attempts:", fallbackAttempts);
            }
          }
        }

        const pageRows = Array.isArray(responseData?.data)
          ? responseData.data
          : [];
        collectedRows = [...collectedRows, ...pageRows];
        fetchedPageCount += 1;

        const totalPages = Number(responseData?.pagination?.totalPages || 0);
        const reachedLastPage =
          totalPages > 0 ? fetchPage >= totalPages : false;
        const reachedDataEnd =
          pageRows.length < limitNum ||
          (totalFromApi > 0 && collectedRows.length >= totalFromApi);
        const hasEnoughVisibleRows =
          getVisibleRowCount(collectedRows) >= limitNum;

        if (hasEnoughVisibleRows || reachedLastPage || reachedDataEnd) {
          break;
        }

        fetchPage += 1;
      }

      // Deduplicate records by filePath to avoid duplicate display
      const deduplicatedRows = collectedRows.reduce((acc, item) => {
        const filePath = String(item?.filePath || item?.path || "").trim();
        const uniqueId = filePath || String(item?.id || item?._id || "");

        if (!uniqueId) {
          acc.push(item);
          return acc;
        }

        const isDuplicate = acc.some((existing) => {
          const existingPath = String(
            existing?.filePath || existing?.path || "",
          ).trim();
          const existingId =
            existingPath || String(existing?.id || existing?._id || "");
          return existingId === uniqueId;
        });

        if (!isDuplicate) {
          acc.push(item);
        }

        return acc;
      }, []);

      setRecords(normalizeRows(deduplicatedRows));

      const folderNames = Array.from(
        new Set(
          deduplicatedRows
            .map((row) => {
              const folderFromPath = String(row?.filePath || "").trim();
              if (folderFromPath && folderFromPath.includes("/")) {
                return folderFromPath.slice(0, folderFromPath.lastIndexOf("/"));
              }
              if (row?.folderName) {
                return String(row.folderName || "").trim();
              }
              return "";
            })
            .map((item) => String(item || "").trim())
            .filter(Boolean),
        ),
      );

      setDynamicFolderOptions(folderNames);
      setTotalRecords(totalFromApi || collectedRows.length);
      setStatistics(
        firstResponseData?.statistics || {
          total: collectedRows.length,
          documents: collectedRows.filter(
            (row) => getFileCategory(row) === "documents",
          ).length,
          images: collectedRows.filter(
            (row) => getFileCategory(row) === "images",
          ).length,
          videos: collectedRows.filter(
            (row) => getFileCategory(row) === "videos",
          ).length,
          others: collectedRows.filter(
            (row) => getFileCategory(row) === "others",
          ).length,
        },
      );
      setDynamicFilterOptions(firstResponseData?.filterOptions || {});
    } catch (error) {
      // Silently ignore abort/cancel errors - expected when requests are cancelled
      const isCancellationError =
        error.name === "CanceledError" ||
        error.name === "AbortError" ||
        (error.code && error.code === "ECONNABORTED");

      if (isCancellationError) {
        // Don't log or show errors for cancelled requests
        return;
      }

      const backendError = extractApiErrorMessage(
        error,
        "Failed to fetch files",
      );
      if (
        backendError ===
        "Cloudflare configuration is missing on server. Configure it in Settings."
      ) {
        showInfo(
          "Cloudflare settings missing. Please configure them in Settings to load cloud files.",
        );
      } else {
        showError(backendError);
      }
      setRecords([]);
      setTotalRecords(0);
      setStatistics({
        total: 0,
        documents: 0,
        images: 0,
        videos: 0,
        others: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  const formatDateTimeForDisplay = (dateString) => {
    if (!dateString) return "-";

    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();

    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const seconds = String(date.getSeconds()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;

    return `${day}-${month}-${year} | ${String(hours).padStart(2, "0")}:${minutes}:${seconds} ${ampm}`;
  };

  const cards = [
    {
      icon: "fa-solid fa-folder-open",
      title: "Total Files",
      key: "total",
      color: "primary",
      count: statistics.total,
    },
    {
      icon: "fa-solid fa-file-contract",
      title: "Documents",
      key: "documents",
      color: "info",
      count: statistics.documents,
    },
    {
      icon: "fa-solid fa-image",
      title: "Images",
      key: "images",
      color: "success",
      count: statistics.images,
    },
    {
      icon: "fa-solid fa-video",
      title: "Videos",
      key: "videos",
      color: "warning",
      count: statistics.videos,
    },
    {
      icon: "fa-solid fa-layer-group",
      title: "Other Files",
      key: "others",
      color: "secondary",
      count: statistics.others,
    },
    {
      icon: "fas fa-plus-circle",
      title: "Upload New File",
      key: "addNew",
      color: "success",
    },
  ];

  const getCardNumber = (index) => {
    return (index % 8) + 1;
  };

  const preparedData = useMemo(
    () => buildTreeRows(records, expandedFolderKeys),
    [records, expandedFolderKeys],
  );

  const visiblePageRows = useMemo(() => {
    const limit = Math.max(1, Number(recordsPerPage || 10));
    return preparedData.slice(0, limit);
  }, [preparedData, recordsPerPage]);

  const toggleFolder = (folderKey) => {
    const stateKey = String(folderKey || "");
    if (!stateKey) return;

    if (!canRead) {
      showError("You don't have permission to view folders");
      return;
    }

    setExpandedFolderKeys((prev) => {
      const nextValue = !prev[stateKey];
      return {
        ...prev,
        [stateKey]: nextValue,
      };
    });
  };

  const handleFolderEdit = () => {
    showInfo(
      "Folder rename currently not available. Please edit individual files.",
    );
  };

  const handleFolderDownloadZip = async (folderRecord) => {
    const folderPath = String(folderRecord?.absolutePath || "").trim();
    const downloadKey = buildStableDownloadKey(
      folderRecord?.expandKey || folderPath || "",
    );
    const spinnerStartedAt = Date.now();

    if (!folderPath) {
      showError("Folder path not found for download");
      return;
    }

    setDownloadingFolderKey(downloadKey);
    await waitForUiPaint();
    showInfo("Your ZIP file is being prepared. Please wait...");

    try {
      const effectiveSettings =
        await resolveCloudflareSettingsForRequest(false);
      const response = await apiGet(
        API_ENDPOINTS.FILES.DOWNLOAD_FOLDER_ZIP(folderPath),
        {
          headers: getCloudRequestHeaders(effectiveSettings),
          responseType: "blob",
          cache: false,
          timeout: 180000,
        },
      );

      const folderName =
        splitPath(folderPath)[splitPath(folderPath).length - 1] || "folder";
      const fileName = `${folderName}.zip`;
      const blob = new Blob([response.data], { type: "application/zip" });
      const downloadUrl = window.URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);

      showSuccess(`Folder zip download started: ${fileName}`);
    } catch (error) {
      showError(extractApiErrorMessage(error, "Failed to download folder zip"));
    } finally {
      const elapsed = Date.now() - spinnerStartedAt;
      if (elapsed < MIN_DOWNLOAD_SPINNER_MS) {
        await new Promise((resolve) =>
          setTimeout(resolve, MIN_DOWNLOAD_SPINNER_MS - elapsed),
        );
      }
      setDownloadingFolderKey("");
    }
  };

  const handleFileDownload = async (fileRecord) => {
    const source = fileRecord?.sourceRecord || fileRecord;
    const filePath = String(source?.filePath || "")
      .replace(/^\/+/, "")
      .trim();
    const fileKey = buildStableDownloadKey(
      source?.id || source?._id || filePath || "",
    );
    const spinnerStartedAt = Date.now();

    if (!filePath) {
      showError("File path not found for download");
      return;
    }

    setDownloadingFileKey(fileKey);
    await waitForUiPaint();
    showInfo("Your file is being prepared for download. Please wait...");

    try {
      const effectiveSettings =
        await resolveCloudflareSettingsForRequest(false);
      const response = await apiGet(
        API_ENDPOINTS.FILES.DOWNLOAD_FILE(filePath),
        {
          headers: getCloudRequestHeaders(effectiveSettings),
          responseType: "blob",
          cache: false,
          timeout: 180000,
        },
      );

      const headerDisposition = String(
        response?.headers?.["content-disposition"] || "",
      );
      const filenameMatch = headerDisposition.match(/filename="?([^";]+)"?/i);
      const fileName =
        (filenameMatch && filenameMatch[1]) ||
        String(source?.fileName || "downloaded-file");

      const blob = new Blob([response.data], {
        type: response?.headers?.["content-type"] || "application/octet-stream",
      });

      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);

      showSuccess(`File download started: ${fileName}`);
    } catch (error) {
      showError(extractApiErrorMessage(error, "Failed to download file"));
    } finally {
      const elapsed = Date.now() - spinnerStartedAt;
      if (elapsed < MIN_DOWNLOAD_SPINNER_MS) {
        await new Promise((resolve) =>
          setTimeout(resolve, MIN_DOWNLOAD_SPINNER_MS - elapsed),
        );
      }
      setDownloadingFileKey("");
    }
  };

  const handleFolderDelete = async (folderRecord) => {
    const collectFilesFromNode = (node) => {
      if (!node || typeof node !== "object") return [];

      if (node.rowType === "file") {
        return node.sourceRecord ? [node.sourceRecord] : [];
      }

      const children = Array.isArray(node.children) ? node.children : [];
      return children.flatMap((child) => collectFilesFromNode(child));
    };

    const nodeFiles = collectFilesFromNode(folderRecord);
    const folderAbsolutePath = String(folderRecord?.absolutePath || "").trim();

    const fallbackFiles = folderAbsolutePath
      ? records.filter((record) => {
          const pathCandidates = [
            record.filePath,
            record.absolutePath,
            record.key,
            `${record.folderName || ""}/${record.fileName || ""}`,
          ]
            .map((value) => String(value || "").trim())
            .filter(Boolean);

          return pathCandidates.some((path) =>
            isPathInsideFolder(path, folderAbsolutePath),
          );
        })
      : [];

    const targetFiles = [...nodeFiles, ...fallbackFiles].reduce((acc, item) => {
      const uniqueKey = String(item?.id || item?._id || item?.filePath || "");
      if (!uniqueKey) return acc;
      if (
        acc.some((existing) => {
          const existingKey = String(
            existing?.id || existing?._id || existing?.filePath || "",
          );
          return existingKey === uniqueKey;
        })
      ) {
        return acc;
      }
      acc.push(item);
      return acc;
    }, []);

    if (!targetFiles.length) {
      showInfo("No files found in this folder");
      return;
    }

    try {
      const effectiveCloudflareSettings =
        await resolveCloudflareSettingsForRequest();

      let deletedCount = 0;
      let failedCount = 0;
      let firstFailureMessage = "";

      for (const item of targetFiles) {
        const rawFilePath = String(item?.filePath || "")
          .replace(/^\/+/, "")
          .trim();
        const fallbackId = item.id || item._id;
        const fileId = rawFilePath
          ? `cloud:${rawFilePath}`
          : String(fallbackId || "").startsWith("cloud:")
            ? fallbackId
            : "";

        if (!fileId) {
          failedCount += 1;
          if (!firstFailureMessage) {
            firstFailureMessage =
              "Missing file path for Cloudflare delete request.";
          }
          continue;
        }

        try {
          await apiDelete(API_ENDPOINTS.FILES.DELETE(fileId), {
            headers: getCloudRequestHeaders(effectiveCloudflareSettings),
            data: {
              deleteFromCloudflare: true,
            },
          });
          deletedCount += 1;
        } catch (error) {
          failedCount += 1;
          if (!firstFailureMessage) {
            firstFailureMessage = extractApiErrorMessage(
              error,
              "Cloudflare delete request failed.",
            );
          }
        }
      }

      if (deletedCount > 0) {
        showSuccess(
          `Folder deleted successfully (${deletedCount} file${deletedCount > 1 ? "s" : ""})`,
        );

        // Update state with latest settings to ensure fetchFiles has valid config
        if (effectiveCloudflareSettings) {
          setCloudflareSettings(effectiveCloudflareSettings);
        }

        // Refresh file list
        await fetchFiles(effectiveCloudflareSettings);
      }

      if (failedCount > 0) {
        showError(
          `${failedCount} file${failedCount > 1 ? "s" : ""} could not be deleted.${firstFailureMessage ? ` ${firstFailureMessage}` : " Please retry."}`,
        );
      }
    } catch {
      showError("Failed to delete folder files");
    }
  };

  const columns = [
    {
      key: "sn",
      label: "S.No",
      width: 80,
      render: (_, record, displayIndex) => {
        const rowSerial = Math.max(1, Number(displayIndex || record.sn || 1));
        const stateKey = String(record.expandKey || record.key || "");
        const isExpanded = Boolean(record.isExpanded);
        const canExpand =
          record.rowType === "folder" &&
          Array.isArray(record.children) &&
          record.children.length > 0;

        return (
          <div className="d-flex align-items-center gap-2">
            <span>{rowSerial}</span>

            {canExpand && (
              <span
                onClick={() => {
                  if (!canRead) return;
                  toggleFolder(stateKey);
                }}
                title={
                  isExpanded
                    ? canRead
                      ? "Collapse"
                      : "No permission to view"
                    : canRead
                      ? "Expand"
                      : "No permission to view"
                }
                style={{
                  cursor: canRead ? "pointer" : "not-allowed",
                  opacity: canRead ? undefined : 0.6,
                }}
              >
                <i
                  className={`fa-solid ${
                    isExpanded
                      ? "fa-circle-minus text-danger"
                      : "fa-circle-plus text-success"
                  }`}
                  style={{ fontSize: "16px" }}
                ></i>
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: "file",
      label: "File",
      width: 60,
      disableSort: true,
      disableFilter: true,
      render: (_, record) =>
        record.rowType === "file" && record.fileUrl ? (
          <a
            href={record.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-sm btn-outline-primary"
            title="Open file"
          >
            <i className="fas fa-file-alt"></i>
          </a>
        ) : record.rowType === "folder" ? (
          <i className="fa-solid fa-folder-tree text-danger text-center"></i>
        ) : (
          <span className="text-muted">-</span>
        ),
    },
    {
      key: "fileName",
      label: "File / Folder Name",
      width: 300,
      render: (_, record) => (
        <div
          className="d-flex align-items-center"
          style={{
            paddingLeft: `${Math.max(0, Number(record.depth || 0)) * 18}px`,
          }}
        >
          <i
            className={`fas ${record.rowType === "folder" ? "fa-folder-open text-warning" : "fa-file text-primary"} me-2`}
          ></i>
          <span>{record.name || "-"}</span>
        </div>
      ),
    },
    { key: "folderName", label: "Folder", width: 140 },
    { key: "fileType", label: "File Type", width: 200 },
    { key: "fileSize", label: "File Size", width: 120 },
    {
      key: "uploadDate",
      label: "Upload Date & Time",
      width: 200,
      render: (value) => formatDateTimeForDisplay(value),
    },
    {
      key: "action",
      label: "Actions",
      width: 220,
      render: (_, record) => {
        const sourceRecord = record.sourceRecord;
        const isFile = record.rowType === "file";
        const folderDownloadKey = buildStableDownloadKey(
          record.expandKey || record.absolutePath || "",
        );
        const isDownloadingFolder =
          !isFile && downloadingFolderKey === folderDownloadKey;
        const fileDownloadKey = buildStableDownloadKey(
          sourceRecord?.id || sourceRecord?._id || sourceRecord?.filePath || "",
        );
        const isDownloadingFile =
          isFile && downloadingFileKey === fileDownloadKey;

        return (
          <div className="d-flex">
            <button
              className={`btn btn-sm ${
                isFile
                  ? canRead
                    ? "btn-outline-info"
                    : "btn-outline-secondary"
                  : "btn-outline-info"
              } me-1`}
              onClick={() => {
                if (isFile) {
                  if (!canRead) {
                    showError("You don't have permission to view files");
                    return;
                  }
                  if (sourceRecord) {
                    handleOpenFile(sourceRecord);
                  }
                } else {
                  toggleFolder(record.expandKey || record.key);
                }
              }}
              title={
                isFile
                  ? canRead
                    ? "View"
                    : "No permission to view"
                  : "Expand / Collapse"
              }
              disabled={isFile ? !record.fileUrl || !canRead : false}
              style={{
                opacity: isFile && !canRead ? 0.6 : undefined,
                cursor: isFile && !canRead ? "not-allowed" : undefined,
              }}
            >
              <i className="fa-solid fa-eye"></i>
            </button>
            <button
              className={`btn btn-sm ${isFile ? (canRead ? "btn-outline-success" : "btn-outline-secondary") : "btn-outline-success"} me-1`}
              onClick={() => {
                if (isFile) {
                  if (!canRead) {
                    showError("You don't have permission to download files");
                    return;
                  }
                  if (sourceRecord) {
                    handleFileDownload(sourceRecord);
                  }
                } else {
                  handleFolderDownloadZip(record);
                }
              }}
              title={
                isFile
                  ? canRead
                    ? "Download File"
                    : "No permission to download"
                  : "Download Folder Zip"
              }
              disabled={
                isFile ? isDownloadingFile || !canRead : isDownloadingFolder
              }
              style={{
                opacity: isFile && !canRead ? 0.6 : undefined,
                cursor: isFile && !canRead ? "not-allowed" : undefined,
              }}
            >
              {isFile ? (
                isDownloadingFile ? (
                  <span
                    className="spinner-border spinner-border-sm"
                    role="status"
                    aria-hidden="true"
                  ></span>
                ) : (
                  <i className="fa-solid fa-download"></i>
                )
              ) : isDownloadingFolder ? (
                <span
                  className="spinner-border spinner-border-sm"
                  role="status"
                  aria-hidden="true"
                ></span>
              ) : (
                <i className="fa-solid fa-download"></i>
              )}
            </button>
            <button
              className={`btn btn-sm ${canUpdate ? "btn-outline-primary" : "btn-outline-secondary"} me-1`}
              onClick={() => {
                if (!canUpdate) {
                  showError("You don't have permission to edit files");
                  return;
                }
                if (isFile && sourceRecord) {
                  handleEditOpen(sourceRecord);
                } else {
                  handleFolderEdit();
                }
              }}
              title={canUpdate ? "Edit" : "No permission to edit"}
              disabled={!canUpdate}
              style={{
                opacity: canUpdate ? undefined : 0.6,
                cursor: canUpdate ? undefined : "not-allowed",
              }}
            >
              <i className="fas fa-edit"></i>
            </button>
            <button
              className={`btn btn-sm ${
                canDelete ? "btn-outline-danger" : "btn-outline-secondary"
              }`}
              onClick={() => {
                if (!canDelete) return;
                if (isFile && sourceRecord) {
                  handleDelete(sourceRecord.id || sourceRecord._id, {
                    name:
                      sourceRecord.fileName ||
                      sourceRecord.originalName ||
                      sourceRecord.name ||
                      record.name ||
                      "",
                  });
                } else {
                  setFolderToDelete(record);
                  setDeleteTargetName(String(record?.name || "").trim());
                  setShowDeleteConfirm(true);
                }
              }}
              title={canDelete ? "Delete" : "No permission to delete"}
              disabled={!canDelete}
              style={{
                opacity: canDelete ? undefined : 0.6,
                cursor: canDelete ? undefined : "not-allowed",
              }}
            >
              <i className="fas fa-trash"></i>
            </button>
          </div>
        );
      },
    },
  ];

  const handleCardClick = (cardKey) => {
    if (cardKey === "addNew") {
      if (!canCreate) {
        showError("You don't have permission to upload files");
        return;
      }
      setFormMode("create");
      setEditingRecord(null);
      setShowCreateForm(true);
      return;
    }

    setActiveCardFilter(cardKey || "total");
    setCurrentPage(1);
  };

  const handleDelete = (id, options = {}) => {
    const cloudTarget = String(id || "").startsWith("cloud:");
    const fallbackRecord = records.find(
      (item) =>
        String(item?.id || item?._id || "") === String(id || "") ||
        String(item?.filePath || "") ===
          String(id || "").replace(/^cloud:/, ""),
    );
    const resolvedName = String(
      options?.name ||
        fallbackRecord?.fileName ||
        fallbackRecord?.originalName ||
        fallbackRecord?.name ||
        "",
    ).trim();

    setFolderToDelete(null);
    setFileToDelete(id);
    setDeleteTargetName(resolvedName);
    setIsCloudDeleteTarget(cloudTarget);
    setDeleteFromCloudflare(cloudTarget ? true : false);
    setShowDeleteConfirm(true);
  };

  const handleOpenFile = (record) => {
    if (!record?.fileUrl) {
      showError("File URL not available");
      return;
    }

    window.open(record.fileUrl, "_blank", "noopener,noreferrer");
  };

  const handleEditOpen = (record) => {
    setFormMode("edit");
    setEditingRecord(record);
    setShowCreateForm(true);
  };

  const confirmDelete = async () => {
    if (folderToDelete) {
      const folderRecord = folderToDelete;
      setFolderToDelete(null);
      await handleFolderDelete(folderRecord);
      return;
    }

    if (!fileToDelete) return;

    try {
      const effectiveCloudflareSettings =
        await resolveCloudflareSettingsForRequest();

      await apiDelete(API_ENDPOINTS.FILES.DELETE(fileToDelete), {
        headers: getCloudRequestHeaders(effectiveCloudflareSettings),
        data: {
          deleteFromCloudflare,
        },
      });
      showSuccess(
        deleteFromCloudflare
          ? "File deleted from Cloudflare"
          : "File deleted successfully",
      );
      setFileToDelete(null);
      setDeleteTargetName("");
      setDeleteFromCloudflare(false);
      setIsCloudDeleteTarget(false);

      // Update state with latest settings to ensure fetchFiles has valid config
      if (effectiveCloudflareSettings) {
        setCloudflareSettings(effectiveCloudflareSettings);
      }

      // Refresh file list
      await fetchFiles(effectiveCloudflareSettings);
    } catch (error) {
      showError(extractApiErrorMessage(error, "Failed to delete file record"));
    }
  };

  const handleRefresh = () => {
    setFilters({});
    setSearchTerm("");
    setSortField(null);
    setSortDirection("normal");
    setActiveCardFilter("total");
    setExpandedFolderKeys({});
    setCurrentPage(1);
    setRefreshNonce((prev) => prev + 1);
    showInfo("Data refreshed");
  };

  const handleClearTempStorage = async () => {
    if (isCleaningTempStorage) return;

    setIsCleaningTempStorage(true);
    try {
      const effectiveSettings = await resolveCloudflareSettingsForRequest();

      const response = await apiPost(
        `${API_ENDPOINTS.FILES.CREATE}?action=cleanup-temp-uploads`,
        {
          forceAll: true,
        },
        {
          headers: getCloudRequestHeaders(effectiveSettings),
          timeout: 120000,
        },
      );

      const payload = response?.data || {};
      const deletedObjects = Number(payload?.deletedObjects || 0);
      const scanned = Number(payload?.scanned || 0);

      showSuccess(
        `Temp storage cleaned: ${deletedObjects} objects deleted out of ${scanned} scanned.`,
      );

      await fetchFiles(effectiveSettings);
    } catch (error) {
      showError(
        extractApiErrorMessage(
          error,
          "Failed to clear temporary Cloudflare storage",
        ),
      );
    } finally {
      setIsCleaningTempStorage(false);
    }
  };

  return (
    <div className="container-fluid">
      <div
        className="py-3 d-flex justify-content-between align-items-center flex-wrap"
        style={{ marginTop: "70px" }}
      >
        <h4 className="fs-18 fw-semibold m-0">File Management</h4>
        <button
          type="button"
          className="btn btn-outline-danger btn-sm mt-2 mt-md-0"
          onClick={() => setShowTempCleanupConfirm(true)}
          disabled={isCleaningTempStorage || loading}
          title="Delete temporary upload chunks from Cloudflare"
        >
          {isCleaningTempStorage ? (
            <>
              <span
                className="spinner-border spinner-border-sm me-2"
                role="status"
                aria-hidden="true"
              ></span>
              Clearing...
            </>
          ) : (
            <>
              <i className="fa-solid fa-broom me-2"></i>
              Clear Temp Storage
            </>
          )}
        </button>
      </div>

      <div className="row">
        {cards.map((card, index) => {
          const cardNumber = getCardNumber(index);
          const cardClass = `card${cardNumber}`;
          const cardIconBgClass = `card-icon-bg${cardNumber}`;
          const isActive =
            activeCardFilter === card.key && card.key !== "addNew";
          const isAddNewDisabled = card.key === "addNew" && !canCreate;

          return (
            <div key={index} className="col-md-6 col-xl-2 mb-4">
              <div
                className={`card border-0 shadow-sm overflow-hidden ${cardClass} ${isActive ? "border-primary" : ""}`}
                style={{
                  transition: "all 0.3s ease",
                  cursor: isAddNewDisabled ? "not-allowed" : "pointer",
                  opacity: isAddNewDisabled ? 0.6 : 1,
                  height: "100%",
                  borderRadius: "12px",
                  border: isActive ? "2px solid #0d6efd" : "1px solid #dee2e6",
                }}
                onMouseEnter={(e) => {
                  if (card.key === "addNew" && !isAddNewDisabled) {
                    e.currentTarget.style.transform = "translateY(-5px)";
                    e.currentTarget.style.boxShadow =
                      "0 10px 20px rgba(0,0,0,0.1)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)";
                }}
                onClick={() => !isAddNewDisabled && handleCardClick(card.key)}
              >
                <div className="card-body text-center p-2">
                  <div className="mb-3 mt-2 d-flex justify-content-center">
                    <span
                      className={`avatar-md rounded-circle ${cardIconBgClass} d-inline-flex justify-content-center align-items-center`}
                      style={{
                        boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
                        width: "60px",
                        height: "60px",
                      }}
                    >
                      <i className={`${card.icon} fs-3 text-white`}></i>
                    </span>
                  </div>
                  <div>
                    <h5 className="mb-2 fw-bold">{card.title}</h5>
                    <h6
                      className="mb-0 text-muted fs-6 fw-bold"
                      style={{ marginBottom: "-10px" }}
                    >
                      {card.key === "addNew"
                        ? "+ Upload"
                        : card.count !== undefined
                          ? card.count
                          : 0}
                    </h6>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <ReusableTable
        ensureCreatedByColumn={true}
        createdByLabel="Created By"
        moduleKey={moduleKey}
        columns={columns}
        data={visiblePageRows}
        loading={
          loading &&
          !Boolean(downloadingFileKey) &&
          !Boolean(downloadingFolderKey)
        }
        totalRecords={totalRecords}
        onDelete={handleDelete}
        onEdit={handleEditOpen}
        onView={handleOpenFile}
        onRefresh={handleRefresh}
        showActions={false}
        actions={[]}
        skipDeleteConfirmation={true}
        fixedColumns={["sn"]}
        defaultVisibleColumns={[
          "sn",
          "file",
          "fileName",
          "folderName",
          "fileType",
          "action",
        ]}
        columnsWithDropdownFilter={["folderName", "fileType"]}
        columnsWithDateFilter={["uploadDate"]}
        filterOptions={dynamicFilterOptions}
        tableTitle="Uploaded Files"
        showColumnSelector={true}
        showExport={true}
        showRefresh={true}
        showAdvancedFilter={true}
        showSearch={true}
        exportFileName="File_Management"
        exportTitle="File Management Report"
        activeCardFilter={activeCardFilter}
        cards={cards}
        serverSide={true}
        onServerSideSearch={(term) => {
          setSearchTerm(term);
          setCurrentPage(1);
        }}
        onServerSideFilter={(filterParams) => {
          setFilters(filterParams);
          setCurrentPage(1);
        }}
        onServerSideSort={(field, direction) => {
          setSortField(field);
          setSortDirection(direction);
          setCurrentPage(1);
        }}
        onServerSidePageChange={setCurrentPage}
        onServerSideRecordsPerPageChange={(limit) => {
          setRecordsPerPage(limit);
          setCurrentPage(1);
        }}
        currentPage={currentPage}
        recordsPerPage={recordsPerPage}
        onPageChange={setCurrentPage}
        onRecordsPerPageChange={setRecordsPerPage}
        exportApi={API_ENDPOINTS.FILES.LIST}
        exportRequestHeaders={{
          "x-cloud-store-url": String(cloudflareSettings?.storeUrl || ""),
          "x-cloud-public-domain": String(
            cloudflareSettings?.publicDomain || "",
          ),
          "x-cloud-default-folder": String(
            cloudflareSettings?.defaultFolder || "",
          ),
        }}
      />

      <Createfile
        show={showCreateForm}
        onClose={() => {
          setShowCreateForm(false);
          setFormMode("create");
          setEditingRecord(null);
        }}
        folderOptionsFromRecords={dynamicFolderOptions}
        onSubmit={() => {
          fetchFiles();
          setShowCreateForm(false);
          setFormMode("create");
          setEditingRecord(null);
        }}
        cloudflareSettings={cloudflareSettings}
        canCreate={canCreate}
        mode={formMode}
        initialData={editingRecord}
      />

      <ConfirmationModal
        show={showDeleteConfirm}
        onHide={() => {
          setShowDeleteConfirm(false);
          setFileToDelete(null);
          setFolderToDelete(null);
          setDeleteTargetName("");
          setDeleteFromCloudflare(false);
          setIsCloudDeleteTarget(false);
        }}
        onConfirm={confirmDelete}
        title={folderToDelete ? "Delete Folder" : "Delete File"}
        message={
          folderToDelete ? (
            <div>
              <div>
                Are you sure you want to delete this folder and all files inside
                it?
              </div>
              {deleteTargetName && (
                <div className="mt-2">
                  <strong>Folder:</strong> {deleteTargetName}
                </div>
              )}
              <div className="mt-2 text-danger small">
                This action permanently deletes folder files from Cloudflare.
              </div>
            </div>
          ) : (
            <div>
              <div>Are you sure you want to delete this file record?</div>
              {deleteTargetName && (
                <div className="mt-2">
                  <strong>File:</strong> {deleteTargetName}
                </div>
              )}
              <div className="form-check form-switch mt-3">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="deleteFromCloudflareToggle"
                  checked={deleteFromCloudflare}
                  disabled={isCloudDeleteTarget}
                  onChange={(e) => setDeleteFromCloudflare(e.target.checked)}
                />
                <label
                  className="form-check-label"
                  htmlFor="deleteFromCloudflareToggle"
                >
                  {isCloudDeleteTarget
                    ? "Cloud file will be deleted directly from Cloudflare"
                    : "Also delete file from Cloudflare"}
                </label>
              </div>
            </div>
          )
        }
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />

      <ConfirmationModal
        show={showTempCleanupConfirm}
        onHide={() => setShowTempCleanupConfirm(false)}
        onConfirm={async () => {
          setShowTempCleanupConfirm(false);
          await handleClearTempStorage();
        }}
        title="Clear Temp Storage"
        message={
          <div>
            <div>
              This will remove temporary upload chunks stored under .uploads.
            </div>
            <div className="mt-2 text-danger small">
              Running chunk uploads may fail if cleanup starts now.
            </div>
          </div>
        }
        confirmText="Clear Now"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
};

export default FileManagement;
