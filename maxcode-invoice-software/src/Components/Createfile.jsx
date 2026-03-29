import React, { useEffect, useMemo, useRef, useState } from "react";
import Select from "react-select";
import pako from "pako";
import { showError, showInfo, showSuccess } from "./ToastNotification";
import ConfirmationModal from "./ConfirmationModal";
import { apiPost, apiPut } from "../utils/api";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { getUnifiedSelectStyles } from "../utils/reactSelectStyles";

const toBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : "";
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });

const uint8ArrayToBase64 = (bytes = new Uint8Array()) => {
  let binary = "";
  const chunkSize = 0x8000;

  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
};

const prepareFileForUpload = async (file, compressionPercent = 0) => {
  const normalizedPercent = Math.min(
    100,
    Math.max(0, Number(compressionPercent) || 0),
  );

  if (!normalizedPercent) {
    return {
      fileDataBase64: await toBase64(file),
      fileType: file.type || "application/octet-stream",
      fileSizeBytes: file.size,
      compression: null,
    };
  }

  const inputBytes = new Uint8Array(await file.arrayBuffer());
  const level = Math.min(
    9,
    Math.max(1, Math.round((normalizedPercent / 100) * 9)),
  );
  const compressedBytes = pako.deflate(inputBytes, { level });
  const compressedBase64 = uint8ArrayToBase64(compressedBytes);

  return {
    fileDataBase64: compressedBase64,
    fileType: file.type || "application/octet-stream",
    fileSizeBytes: file.size,
    compression: {
      compressed: true,
      algorithm: "deflate",
      level,
      compressionPercent: normalizedPercent,
      originalSizeBytes: file.size,
      compressedSizeBytes: compressedBytes.length,
    },
  };
};

const formatBytes = (bytes) => {
  const numeric = Number(bytes || 0);
  if (!Number.isFinite(numeric) || numeric <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const power = Math.min(Math.floor(Math.log(numeric) / Math.log(1024)), 4);
  const size = numeric / Math.pow(1024, power);
  return `${size.toFixed(size >= 100 || power === 0 ? 0 : 2)} ${units[power]}`;
};

const formatDuration = (seconds = 0) => {
  const s = Math.max(0, Math.round(seconds));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${hrs}h ${mins}m ${secs}s`;
  }
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
};

const normalizeFolderOptions = (settings = {}) => {
  const fromSettings = String(settings?.folderOptions || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const defaultFolder = String(settings?.defaultFolder || "")
    .trim()
    .replace(/,+/g, "");

  const defaults = ["general", "documents", "invoices", "purchases"];
  return [
    ...new Set([
      ...(fromSettings.length ? fromSettings : defaults),
      ...(defaultFolder ? [defaultFolder] : []),
    ]),
  ];
};

const getBaseFolderFromPath = (path = "") => {
  const firstSegment = String(path || "")
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)[0];
  return firstSegment || "general";
};

const configuredChunkSizeMb = Number(import.meta.env.VITE_UPLOAD_CHUNK_SIZE_MB);
const safeChunkSizeMb = Number.isFinite(configuredChunkSizeMb)
  ? Math.min(5, Math.max(1, configuredChunkSizeMb))
  : 4;
const CHUNK_SIZE_BYTES = safeChunkSizeMb * 1024 * 1024;
const MAX_PARALLEL_CHUNKS = import.meta.env.DEV ? 1 : 2;
const MAX_CHUNK_UPLOAD_RETRIES = 3;

const shouldUseChunkUpload = (file) => file && file.size > CHUNK_SIZE_BYTES / 2;

const getApiRequestUrl = (path = "") => {
  const base = String(import.meta.env.VITE_API_BASE_URL || "/api").replace(
    /\/+$/,
    "",
  );
  const normalizedPath = String(path || "").startsWith("/")
    ? String(path || "")
    : `/${String(path || "")}`;
  return `${base}${normalizedPath}`;
};

const Createfile = ({
  show,
  onClose,
  onSubmit,
  cloudflareSettings = {},
  folderOptionsFromRecords = [],
  mode = "create",
  initialData = null,
}) => {
  const isEditMode = mode === "edit";

  const [uploadMode, setUploadMode] = useState("single");
  const [formData, setFormData] = useState({
    fileName: "",
    folderName: "general",
    uploadDate: new Date().toISOString().slice(0, 10),
  });
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [selectedFolderFiles, setSelectedFolderFiles] = useState([]);
  const [folderUploadName, setFolderUploadName] = useState("");
  const [selectedBaseFolder, setSelectedBaseFolder] = useState("general");
  const [compressionPercent, setCompressionPercent] = useState(0);
  const [manualFileType, setManualFileType] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({});
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const fileInputRef = useRef(null);
  const uploadControlRef = useRef({
    cancelled: false,
    controllers: new Set(),
    xhrs: new Set(),
    activeChunkUploadIds: new Set(),
  });

  const resetUploadControl = () => {
    uploadControlRef.current.cancelled = false;
    uploadControlRef.current.controllers.clear();
    uploadControlRef.current.xhrs.clear();
    uploadControlRef.current.activeChunkUploadIds.clear();
  };

  const isUploadCancelled = () => uploadControlRef.current.cancelled === true;

  const abortActiveUploads = () => {
    uploadControlRef.current.cancelled = true;
    uploadControlRef.current.controllers.forEach((controller) => {
      try {
        controller.abort();
      } catch {
        // Ignore abort errors.
      }
    });
    uploadControlRef.current.controllers.clear();

    uploadControlRef.current.xhrs.forEach((xhr) => {
      try {
        xhr.abort();
      } catch {
        // Ignore abort errors.
      }
    });
    uploadControlRef.current.xhrs.clear();
  };

  const cancelChunkUploadsOnServer = async (uploadIds = []) => {
    if (!Array.isArray(uploadIds) || uploadIds.length === 0) return;

    await Promise.allSettled(
      uploadIds.map((uploadId) => {
        const cleanedUploadId = String(uploadId || "").trim();
        if (!cleanedUploadId) return Promise.resolve();

        const controller = new AbortController();
        uploadControlRef.current.controllers.add(controller);

        return fetch(
          `${getApiRequestUrl(API_ENDPOINTS.FILES.CREATE)}?action=cancel-upload`,
          {
            method: "POST",
            credentials: "include",
            signal: controller.signal,
            headers: {
              "Content-Type": "application/json",
              ...buildCloudHeaders(),
            },
            body: JSON.stringify({ uploadId: cleanedUploadId }),
          },
        ).finally(() => {
          uploadControlRef.current.controllers.delete(controller);
        });
      }),
    );
  };

  const resetModalState = () => {
    setSelectedFiles([]);
    setSelectedFolderFiles([]);
    setFolderUploadName("");
    setCompressionPercent(0);
    setUploadProgress({});
    setShowCancelConfirm(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const folderOptions = useMemo(() => {
    const normalized = normalizeFolderOptions(cloudflareSettings);
    const fromRecords = Array.isArray(folderOptionsFromRecords)
      ? folderOptionsFromRecords
      : [];

    return [...new Set([...fromRecords, ...normalized])].filter(Boolean);
  }, [cloudflareSettings, folderOptionsFromRecords]);

  const compressionOptions = useMemo(
    () => [
      { value: 0, label: "Original Quality" },
      ...Array.from({ length: 10 }, (_, idx) => {
        const value = (idx + 1) * 10;
        return { value, label: `${value}%` };
      }),
    ],
    [],
  );

  const selectMenuPortalTarget =
    typeof document !== "undefined" ? document.body : null;
  const compressionSelectStyles = getUnifiedSelectStyles();

  const selectionSummary = useMemo(() => {
    if (isEditMode) {
      return {
        size: String(initialData?.fileSize || "-") || "-",
        type: String(initialData?.fileType || "-") || "-",
      };
    }

    if (uploadMode === "folder") {
      const total = selectedFolderFiles.reduce(
        (sum, file) => sum + (file.size || 0),
        0,
      );
      return {
        size: formatBytes(total),
        type: selectedFolderFiles.length
          ? `folder (${selectedFolderFiles.length} files)`
          : "-",
      };
    }

    const total = selectedFiles.reduce(
      (sum, item) => sum + (item.file?.size || 0),
      0,
    );

    const uniqueTypes = [
      ...new Set(
        selectedFiles
          .map((item) => item.file?.type || "application/octet-stream")
          .filter(Boolean),
      ),
    ];

    const computedType = uniqueTypes.length
      ? uniqueTypes.length === 1
        ? uniqueTypes[0]
        : `${uniqueTypes.length} file types`
      : "-";

    return {
      size: formatBytes(total),
      type:
        uploadMode === "single" && String(manualFileType || "").trim()
          ? String(manualFileType || "").trim()
          : computedType,
    };
  }, [
    isEditMode,
    initialData,
    selectedFiles,
    selectedFolderFiles,
    uploadMode,
    manualFileType,
  ]);

  const aggregateUploadProgress = useMemo(() => {
    const entries = Object.entries(uploadProgress || {});
    if (!entries.length) return null;

    const totals = entries.reduce(
      (acc, [, value]) => {
        const totalBytes = Math.max(0, Number(value?.totalBytes || 0));
        const uploadedBytes = Math.max(0, Number(value?.uploadedBytes || 0));
        const clampedUploaded = Math.min(
          uploadedBytes,
          totalBytes || uploadedBytes,
        );

        acc.totalBytes += totalBytes;
        acc.uploadedBytes += clampedUploaded;
        acc.estimatedRemaining += Math.max(
          0,
          Number(value?.estimatedRemaining || 0),
        );

        if (String(value?.status || "") === "uploading") {
          acc.hasUploading = true;
        }

        if (String(value?.status || "") === "finalizing") {
          acc.hasFinalizing = true;
        }

        return acc;
      },
      {
        totalBytes: 0,
        uploadedBytes: 0,
        estimatedRemaining: 0,
        hasUploading: false,
        hasFinalizing: false,
      },
    );

    const percentage =
      totals.totalBytes > 0
        ? Math.round((totals.uploadedBytes / totals.totalBytes) * 100)
        : 0;

    return {
      percentage: Math.max(0, Math.min(100, percentage)),
      uploadedBytes: totals.uploadedBytes,
      totalBytes: totals.totalBytes,
      estimatedRemaining: totals.estimatedRemaining,
      status: totals.hasFinalizing
        ? "finalizing"
        : totals.hasUploading
          ? "uploading"
          : "completed",
      fileCount: entries.length,
    };
  }, [uploadProgress]);

  useEffect(() => {
    if (!show) return;

    // Prevent stale progress from appearing when reopening modal.
    resetModalState();

    if (isEditMode && initialData) {
      const fullPath = String(initialData.filePath || "").trim();
      const inferredFolderFromPath = fullPath.includes("/")
        ? fullPath.slice(0, fullPath.lastIndexOf("/"))
        : "";

      const defaultFolderPath =
        inferredFolderFromPath ||
        String(initialData.folderName || "").trim() ||
        String(cloudflareSettings?.defaultFolder || "").trim() ||
        folderOptions[0] ||
        "general";

      setFormData({
        fileName: String(initialData.fileName || ""),
        folderName: defaultFolderPath,
        uploadDate:
          String(initialData.uploadDate || "").slice(0, 10) ||
          new Date().toISOString().slice(0, 10),
      });
      setSelectedBaseFolder(getBaseFolderFromPath(defaultFolderPath));
      setSelectedFiles([]);
      setSelectedFolderFiles([]);
      setFolderUploadName("");
      setCompressionPercent(0);
      setManualFileType(String(initialData.fileType || "").trim());
      setUploadMode("single");
      return;
    }

    const defaultFolderPath =
      String(cloudflareSettings?.defaultFolder || "").trim() ||
      folderOptions[0] ||
      "general";

    setFormData({
      fileName: "",
      folderName: defaultFolderPath,
      uploadDate: new Date().toISOString().slice(0, 10),
    });
    setSelectedBaseFolder(getBaseFolderFromPath(defaultFolderPath));
    setUploadMode("single");
    setSelectedFiles([]);
    setSelectedFolderFiles([]);
    setFolderUploadName("");
    setCompressionPercent(0);
    setManualFileType("");
  }, [show, isEditMode, initialData, cloudflareSettings, folderOptions]);

  const requestClose = () => {
    if (submitting) {
      setShowCancelConfirm(true);
      return;
    }
    resetUploadControl();
    resetModalState();
    onClose();
  };

  const confirmCancelUpload = async () => {
    const activeChunkUploadIds = Array.from(
      uploadControlRef.current.activeChunkUploadIds,
    );

    abortActiveUploads();
    await cancelChunkUploadsOnServer(activeChunkUploadIds);

    setShowCancelConfirm(false);
    resetModalState();
    setSubmitting(false);
    showInfo("Upload cancelled");
    onClose();
  };

  useEffect(() => {
    if (!show) return;

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = "hidden";
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
    };
  }, [show]);

  useEffect(() => {
    if (!submitting) return;

    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue =
        "Upload is in progress. Are you sure you want to leave?";
      return event.returnValue;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [submitting]);

  const handleFileChange = (event) => {
    const files = Array.from(event.target.files || []);
    const prepared = (uploadMode === "single" ? files.slice(0, 1) : files).map(
      (file) => ({
        file,
        customName: file.name,
      }),
    );

    setSelectedFiles(prepared);
    setSelectedFolderFiles([]);
    setFolderUploadName("");
    setFormData((prev) => ({
      ...prev,
      uploadDate: new Date().toISOString().slice(0, 10),
      fileName:
        uploadMode === "single" && prepared[0]
          ? prepared[0].customName
          : prev.fileName,
    }));

    if (uploadMode === "single") {
      setManualFileType(
        String(prepared[0]?.file?.type || "application/octet-stream"),
      );
    }

    if (fileInputRef.current) {
      if (!prepared.length) {
        fileInputRef.current.value = "";
      } else {
        try {
          const transfer = new DataTransfer();
          prepared.forEach((item) => transfer.items.add(item.file));
          fileInputRef.current.files = transfer.files;
        } catch {
          // Keep native selection when browser blocks file list assignment.
        }
      }
    }
  };

  const handleCustomNameChange = (index, value) => {
    setSelectedFiles((prev) =>
      prev.map((item, idx) =>
        idx === index ? { ...item, customName: value } : item,
      ),
    );
  };

  const handleRemoveSelectedFile = (indexToRemove) => {
    setSelectedFiles((prev) => {
      const next = prev.filter((_, idx) => idx !== indexToRemove);

      if (uploadMode === "single") {
        setFormData((current) => ({
          ...current,
          fileName: next[0]?.customName || "",
        }));
      }

      if (fileInputRef.current) {
        if (!next.length) {
          fileInputRef.current.value = "";
        } else {
          try {
            const transfer = new DataTransfer();
            next.forEach((item) => transfer.items.add(item.file));
            fileInputRef.current.files = transfer.files;
          } catch {
            // Keep native selection when browser blocks file list assignment.
          }
        }
      }

      return next;
    });
  };

  const handleFolderChange = (event) => {
    const files = Array.from(event.target.files || []);
    setSelectedFolderFiles(files);
    setSelectedFiles([]);

    if (!files.length) {
      setFolderUploadName("");
      return;
    }

    const rootFolderName =
      files[0]?.webkitRelativePath?.split("/")?.[0] || "SelectedFolder";
    setFolderUploadName(rootFolderName);
    setFormData((prev) => ({
      ...prev,
      uploadDate: new Date().toISOString().slice(0, 10),
    }));
  };

  const buildCloudHeaders = (extraHeaders = {}) => {
    const headers = {
      "x-cloud-store-url": String(cloudflareSettings?.storeUrl || ""),
      "x-cloud-public-domain": String(cloudflareSettings?.publicDomain || ""),
      "x-cloud-default-folder": String(cloudflareSettings?.defaultFolder || ""),
      ...extraHeaders,
    };

    return headers;
  };

  const uploadChunkToServer = async ({
    uploadId,
    filePath,
    fileName,
    chunkIndex,
    chunkCount,
    totalSize,
    chunk,
    mimeType,
  }) => {
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_CHUNK_UPLOAD_RETRIES; attempt += 1) {
      if (isUploadCancelled()) {
        throw new Error("Upload cancelled by user");
      }

      try {
        const controller = new AbortController();
        uploadControlRef.current.controllers.add(controller);
        const response = await fetch(
          `${getApiRequestUrl(API_ENDPOINTS.FILES.CREATE)}?action=upload-chunk`,
          {
            method: "POST",
            credentials: "include",
            signal: controller.signal,
            headers: buildCloudHeaders({
              "Content-Type": "application/octet-stream",
              "x-upload-id": uploadId,
              "x-upload-file-path": filePath,
              "x-upload-file-name": String(fileName || "").trim(),
              "x-upload-file-type": String(
                mimeType || "application/octet-stream",
              ),
              "x-upload-file-size": String(totalSize || 0),
              "x-upload-chunk-index": String(chunkIndex),
              "x-upload-chunk-count": String(chunkCount),
            }),
            body: chunk,
          },
        );
        uploadControlRef.current.controllers.delete(controller);

        if (!response.ok) {
          const errorText = await response.text().catch(() => "");
          throw new Error(
            `Chunk upload failed [${chunkIndex + 1}/${chunkCount}] ${response.status} ${errorText}`,
          );
        }

        return response.json().catch(() => ({ success: true }));
      } catch (error) {
        lastError = error;
        if (attempt >= MAX_CHUNK_UPLOAD_RETRIES) {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, attempt * 700));
      }
    }

    throw lastError || new Error("Chunk upload failed due to network error");
  };

  const completeChunkedUploadOnServer = async ({
    uploadId,
    filePath,
    folderName,
    fileName,
    fileType,
    fileSizeBytes,
    chunkCount,
    uploadDate,
    folderUploadName,
  }) => {
    if (isUploadCancelled()) {
      throw new Error("Upload cancelled by user");
    }

    const controller = new AbortController();
    uploadControlRef.current.controllers.add(controller);
    const response = await fetch(
      `${getApiRequestUrl(API_ENDPOINTS.FILES.CREATE)}?action=complete-upload`,
      {
        method: "POST",
        credentials: "include",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...buildCloudHeaders(),
        },
        body: JSON.stringify({
          uploadId,
          filePath,
          folderName,
          fileName,
          fileType,
          fileSizeBytes,
          chunkCount,
          uploadDate,
          folderUploadName,
        }),
      },
    );
    uploadControlRef.current.controllers.delete(controller);

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      throw new Error(`Chunk finalize failed ${response.status} ${errorText}`);
    }

    return response.json();
  };

  const chunkUpload = async ({
    file,
    relativePath,
    folderName,
    fileName,
    customMimeType,
    uploadDate,
    folderUploadName,
  }) => {
    const uploadId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    uploadControlRef.current.activeChunkUploadIds.add(uploadId);

    const normalizedPath =
      String(relativePath || "").replace(/^\/+/, "") ||
      `${folderName}/${fileName}`;
    const totalSize = Number(file?.size || 0);
    const chunkCount = Math.max(1, Math.ceil(totalSize / CHUNK_SIZE_BYTES));

    const pendingIndexes = Array.from({ length: chunkCount }, (_, idx) => idx);

    let completed = 0;
    let bytesUploaded = 0;
    const startTime = Date.now();

    const runWorker = async (index) => {
      const start = index * CHUNK_SIZE_BYTES;
      const end = Math.min(totalSize, start + CHUNK_SIZE_BYTES);
      const chunk = file.slice(start, end);
      await uploadChunkToServer({
        uploadId,
        filePath: normalizedPath,
        fileName,
        chunkIndex: index,
        chunkCount,
        totalSize,
        chunk,
        mimeType: customMimeType || file.type,
      });

      completed += 1;
      bytesUploaded += chunk.size;

      const elapsedSeconds = (Date.now() - startTime) / 1000;
      const speedBps = elapsedSeconds > 0 ? bytesUploaded / elapsedSeconds : 0;
      const remainingBytes = Math.max(0, totalSize - bytesUploaded);
      const remainingSeconds = speedBps > 0 ? remainingBytes / speedBps : 0;

      const percent = Math.round((completed / chunkCount) * 100);
      setUploadProgress((prev) => ({
        ...prev,
        [normalizedPath]: {
          percentage: percent,
          status: "uploading",
          uploadedBytes: bytesUploaded,
          totalBytes: totalSize,
          estimatedRemaining: remainingSeconds,
        },
      }));
    };

    const parallelWorkers = [];
    while (pendingIndexes.length > 0) {
      while (
        parallelWorkers.length < MAX_PARALLEL_CHUNKS &&
        pendingIndexes.length > 0
      ) {
        const index = pendingIndexes.shift();
        const p = runWorker(index).finally(() => {
          const idx = parallelWorkers.indexOf(p);
          if (idx > -1) parallelWorkers.splice(idx, 1);
        });
        parallelWorkers.push(p);
      }

      await Promise.race(parallelWorkers);
    }

    await Promise.all(parallelWorkers);

    setUploadProgress((prev) => ({
      ...prev,
      [normalizedPath]: {
        percentage: 100,
        status: "finalizing",
        uploadedBytes: totalSize,
        totalBytes: totalSize,
        estimatedRemaining: 0,
      },
    }));

    try {
      const completeResult = await completeChunkedUploadOnServer({
        uploadId,
        filePath: normalizedPath,
        folderName,
        fileName,
        fileType: customMimeType || file.type || "application/octet-stream",
        fileSizeBytes: totalSize,
        chunkCount,
        uploadDate,
        folderUploadName,
      });

      setUploadProgress((prev) => ({
        ...prev,
        [normalizedPath]: {
          percentage: 100,
          status: "completed",
          uploadedBytes: totalSize,
          totalBytes: totalSize,
          estimatedRemaining: 0,
        },
      }));

      return completeResult;
    } finally {
      uploadControlRef.current.activeChunkUploadIds.delete(uploadId);
    }
  };

  const uploadFileViaServerChunked = async ({
    file,
    objectPath,
    customMimeType,
    folderName,
    uploadDate,
    folderUploadName,
  }) => {
    const resolvedFileName = String(file?.name || "file").trim() || "file";
    const resolvedPath = String(objectPath || "").trim();

    return chunkUpload({
      file,
      relativePath: resolvedPath,
      folderName,
      fileName: resolvedFileName,
      customMimeType,
      uploadDate,
      folderUploadName,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.folderName.trim()) {
      showError("Please select folder");
      return;
    }

    if (isEditMode) {
      if (!initialData?._id && !initialData?.id) {
        showError("Invalid file record");
        return;
      }
      if (!formData.fileName.trim()) {
        showError("Please enter file name");
        return;
      }
    } else {
      if (!cloudflareSettings?.storeUrl) {
        showError(
          "Cloudflare settings missing. Please configure it in Settings tab.",
        );
        return;
      }

      if (uploadMode !== "folder") {
        if (!selectedFiles.length) {
          showError("Please choose file");
          return;
        }

        const invalidName = selectedFiles.some(
          (item) => !String(item.customName || "").trim(),
        );
        if (invalidName) {
          showError("Each selected file must have a file name");
          return;
        }
      } else if (selectedFolderFiles.length === 0) {
        showError("Please choose folder");
        return;
      } else if (!folderUploadName.trim()) {
        showError("Please enter folder name");
        return;
      }
    }

    setSubmitting(true);
    resetUploadControl();
    setUploadProgress({});
    try {
      const getUploadReadyFile = async (file) => {
        return prepareFileForUpload(file, compressionPercent);
      };

      if (isEditMode) {
        const fileId = initialData._id || initialData.id;
        const isCloudRecord = String(fileId || "").startsWith("cloud:");
        if (isCloudRecord) {
          showInfo("Cloud rename in progress, please wait...");
        }

        const response = await apiPut(
          API_ENDPOINTS.FILES.UPDATE(fileId),
          {
            fileName: formData.fileName.trim(),
            folderName: formData.folderName.trim(),
          },
          {
            timeout: isCloudRecord ? 120000 : 30000,
          },
        );

        showSuccess(response?.data?.message || "File updated successfully");
        if (onSubmit) onSubmit(response?.data?.data || null);
        onClose();
        return;
      }

      if (uploadMode === "single") {
        const item = selectedFiles[0];
        const fileName = String(item.customName || "").trim();
        const relativePath = `${formData.folderName.trim()}/${fileName}`;
        const effectiveMimeType =
          String(manualFileType || "").trim() ||
          String(item.file?.type || "application/octet-stream");

        const securedResult = await uploadFileViaServerChunked({
          file: item.file,
          objectPath: relativePath,
          customMimeType: effectiveMimeType,
          folderName: formData.folderName.trim(),
          uploadDate: formData.uploadDate,
        });

        if (isUploadCancelled()) {
          throw new Error("Upload cancelled by user");
        }

        showSuccess("File uploaded successfully");
        if (onSubmit) onSubmit(securedResult || null);
      } else if (uploadMode === "multiple") {
        for (const item of selectedFiles) {
          if (isUploadCancelled()) {
            throw new Error("Upload cancelled by user");
          }

          const fileName = String(item.customName || "").trim();
          const relativePath = `${formData.folderName.trim()}/${fileName}`;
          const effectiveMimeType =
            String(manualFileType || "").trim() ||
            String(item.file?.type || "application/octet-stream");

          await uploadFileViaServerChunked({
            file: item.file,
            objectPath: relativePath,
            customMimeType: effectiveMimeType,
            folderName: formData.folderName.trim(),
            uploadDate: formData.uploadDate,
          });
        }

        if (isUploadCancelled()) {
          throw new Error("Upload cancelled by user");
        }

        showSuccess("Files uploaded successfully");
        if (onSubmit) onSubmit(null);
      } else {
        const selectedRootName =
          selectedFolderFiles[0]?.webkitRelativePath?.split("/")?.[0] || "";

        for (const file of selectedFolderFiles) {
          if (isUploadCancelled()) {
            throw new Error("Upload cancelled by user");
          }

          const raw = String(file.webkitRelativePath || file.name || "");
          const relativeFilePath = (() => {
            if (!selectedRootName || !raw.startsWith(`${selectedRootName}/`)) {
              return `${folderUploadName.trim()}/${file.name}`;
            }
            return `${folderUploadName.trim()}/${raw.slice(selectedRootName.length + 1)}`;
          })();

          await uploadFileViaServerChunked({
            file,
            objectPath: `${formData.folderName.trim()}/${relativeFilePath}`,
            customMimeType:
              String(manualFileType || "").trim() ||
              String(file?.type || "application/octet-stream"),
            folderName: formData.folderName.trim(),
            uploadDate: formData.uploadDate,
            folderUploadName: folderUploadName.trim(),
          });
        }

        if (isUploadCancelled()) {
          throw new Error("Upload cancelled by user");
        }

        showSuccess("Folder uploaded successfully");
        if (onSubmit) onSubmit(null);
      }
      resetModalState();
      onClose();
    } catch (error) {
      console.error("Upload error details:", error);
      const message = String(error?.message || "").toLowerCase();
      if (message.includes("cancelled")) {
        showInfo("Upload cancelled");
        return;
      }
      showError(
        error?.response?.data?.error ||
          error?.response?.data?.message ||
          error?.message ||
          (isEditMode ? "Failed to update file" : "Failed to upload file"),
      );
    } finally {
      setSubmitting(false);
      resetUploadControl();
    }
  };

  if (!show) return null;

  return (
    <div
      className="modal show d-block"
      tabIndex="-1"
      role="dialog"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <div className="modal-dialog modal-lg" role="document">
        <div className="modal-content">
          <div
            className="modal-header border-0"
            style={{
              background:
                "linear-gradient(120deg, rgba(14,116,144,0.12), rgba(22,163,74,0.12))",
            }}
          >
            <h5 className="modal-title fw-bold">
              {isEditMode ? "Edit File" : "Smart File Upload Studio"}
            </h5>
            <button
              type="button"
              className="btn-close"
              onClick={requestClose}
            ></button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              <div className="row g-3">
                {!isEditMode && (
                  <div className="col-12">
                    <label className="form-label fw-semibold d-block">
                      Upload Type
                    </label>
                    <div className="d-flex gap-4">
                      <div className="form-check">
                        <input
                          className="form-check-input"
                          type="radio"
                          id="uploadTypeSingle"
                          name="uploadType"
                          checked={uploadMode === "single"}
                          onChange={() => {
                            setUploadMode("single");
                            setSelectedFolderFiles([]);
                            setSelectedFiles([]);
                            setFolderUploadName("");
                            if (fileInputRef.current)
                              fileInputRef.current.value = "";
                          }}
                        />
                        <label
                          className="form-check-label"
                          htmlFor="uploadTypeSingle"
                        >
                          Single File
                        </label>
                      </div>

                      <div className="form-check">
                        <input
                          className="form-check-input"
                          type="radio"
                          id="uploadTypeMultiple"
                          name="uploadType"
                          checked={uploadMode === "multiple"}
                          onChange={() => {
                            setUploadMode("multiple");
                            setSelectedFolderFiles([]);
                            setSelectedFiles([]);
                            setFolderUploadName("");
                            if (fileInputRef.current)
                              fileInputRef.current.value = "";
                          }}
                        />
                        <label
                          className="form-check-label"
                          htmlFor="uploadTypeMultiple"
                        >
                          Multiple Files
                        </label>
                      </div>

                      <div className="form-check">
                        <input
                          className="form-check-input"
                          type="radio"
                          id="uploadTypeFolder"
                          name="uploadType"
                          checked={uploadMode === "folder"}
                          onChange={() => {
                            setUploadMode("folder");
                            setSelectedFiles([]);
                            setSelectedFolderFiles([]);
                            setFolderUploadName("");
                            if (fileInputRef.current)
                              fileInputRef.current.value = "";
                          }}
                        />
                        <label
                          className="form-check-label"
                          htmlFor="uploadTypeFolder"
                        >
                          Complete Folder
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {isEditMode && (
                  <div className="col-12">
                    <label className="form-label fw-semibold">File Name</label>
                    <input
                      type="text"
                      className="form-control modern-input"
                      value={formData.fileName}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          fileName: e.target.value,
                        }))
                      }
                      placeholder="Enter file name"
                    />
                  </div>
                )}

                <div className={isEditMode ? "col-md-12" : "col-md-6"}>
                  <label className="form-label fw-semibold">
                    Select Folder
                  </label>
                  <select
                    className="form-select modern-input"
                    value={selectedBaseFolder}
                    onChange={(e) => {
                      const nextFolder = String(e.target.value || "").trim();
                      setSelectedBaseFolder(nextFolder);
                      setFormData((prev) => ({
                        ...prev,
                        folderName: nextFolder,
                      }));
                    }}
                  >
                    {[
                      ...new Set([
                        ...(folderOptions || []),
                        selectedBaseFolder,
                        getBaseFolderFromPath(formData.folderName),
                      ]),
                    ]
                      .filter(Boolean)
                      .map((folder) => (
                        <option key={folder} value={folder}>
                          {folder}
                        </option>
                      ))}
                  </select>
                </div>

                <div className={isEditMode ? "col-md-12" : "col-md-6"}>
                  <label className="form-label fw-semibold">
                    Select or Enter Folder Path
                  </label>
                  <input
                    type="text"
                    className="form-control modern-input"
                    list="folderPathOptions"
                    value={formData.folderName}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        folderName: e.target.value,
                      }))
                    }
                    placeholder="Example: general/invoices/2026"
                  />
                  <datalist id="folderPathOptions">
                    {[
                      ...new Set([
                        ...(folderOptions || []),
                        formData.folderName,
                      ]),
                    ]
                      .filter(Boolean)
                      .map((folder) => (
                        <option key={folder} value={folder}>
                          {folder}
                        </option>
                      ))}
                  </datalist>
                </div>

                {!isEditMode && (
                  <div className="col-md-6">
                    <label className="form-label fw-semibold">
                      {uploadMode === "folder"
                        ? "Choose Folder"
                        : "Choose File"}
                    </label>
                    {uploadMode !== "folder" ? (
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="form-control modern-input file-picker-input"
                        onChange={handleFileChange}
                        multiple={uploadMode === "multiple"}
                      />
                    ) : (
                      <>
                        <input
                          type="file"
                          className="form-control modern-input file-picker-input"
                          onChange={handleFolderChange}
                          webkitdirectory=""
                          directory=""
                          multiple
                        />
                        {selectedFolderFiles.length > 0 && (
                          <div className="small text-success mt-2">
                            Selected folder files: {selectedFolderFiles.length}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {!isEditMode && (
                  <div className="col-md-6">
                    <label className="form-label fw-semibold d-flex align-items-center gap-2">
                      Compression Quality
                    </label>
                    <Select
                      inputId="compressionPercent"
                      name="compressionPercent"
                      classNamePrefix="react-select"
                      styles={compressionSelectStyles}
                      menuPortalTarget={selectMenuPortalTarget}
                      menuPosition="fixed"
                      isSearchable={false}
                      value={
                        compressionOptions.find(
                          (option) => option.value === compressionPercent,
                        ) || compressionOptions[0]
                      }
                      onChange={(selectedOption) =>
                        setCompressionPercent(
                          Number(selectedOption?.value || 0),
                        )
                      }
                      options={compressionOptions}
                    />
                  </div>
                )}

                {!isEditMode && uploadMode === "folder" && (
                  <div className="col-12">
                    <label className="form-label fw-semibold">
                      Folder Name
                    </label>
                    <input
                      type="text"
                      className="form-control modern-input"
                      value={folderUploadName}
                      onChange={(e) => setFolderUploadName(e.target.value)}
                      placeholder="Enter folder name to save in Cloudflare"
                    />
                  </div>
                )}

                {!isEditMode &&
                  uploadMode !== "folder" &&
                  selectedFiles.length > 0 && (
                    <div className="col-12">
                      <div className="fw-semibold mb-2">File Name Options</div>
                      <div className="file-name-options-scroll pe-1">
                        <div className="row g-2">
                          {selectedFiles.map((item, index) => (
                            <div
                              className="col-md-6"
                              key={`${item.file.name}-${index}`}
                            >
                              <label className="form-label mb-1 small text-muted">
                                {item.file.name}
                              </label>
                              <div className="input-group">
                                <input
                                  type="text"
                                  className="form-control modern-input"
                                  value={item.customName}
                                  onChange={(e) =>
                                    handleCustomNameChange(
                                      index,
                                      e.target.value,
                                    )
                                  }
                                  placeholder="Enter file name"
                                />
                                <button
                                  type="button"
                                  className="btn btn-outline-danger"
                                  onClick={() =>
                                    handleRemoveSelectedFile(index)
                                  }
                                  title="Remove file"
                                >
                                  <i className="fa-solid fa-trash"></i>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                <div className="col-md-4">
                  <label className="form-label fw-semibold">Upload Date</label>
                  <input
                    type="date"
                    className="form-control modern-input"
                    value={formData.uploadDate}
                    readOnly
                  />
                </div>

                <div className="col-md-4">
                  <label className="form-label fw-semibold">File Size</label>
                  <input
                    type="text"
                    className="form-control modern-input"
                    value={selectionSummary.size}
                    readOnly
                  />
                </div>

                <div className="col-md-4">
                  <label className="form-label fw-semibold">File Type</label>
                  <input
                    type="text"
                    className="form-control modern-input"
                    value={
                      isEditMode
                        ? selectionSummary.type
                        : manualFileType || selectionSummary.type
                    }
                    onChange={(e) => setManualFileType(e.target.value)}
                    readOnly={isEditMode}
                    placeholder="Example: application/pdf"
                  />
                </div>

                {!isEditMode && aggregateUploadProgress && (
                  <div className="col-12 mt-3">
                    <div className="fw-semibold mb-1">Upload Progress</div>
                    <div className="upload-progress-card mb-2">
                      <div className="d-flex justify-content-between mb-1 align-items-center">
                        <span className="upload-file-path">
                          {aggregateUploadProgress.fileCount > 1
                            ? `Total (${aggregateUploadProgress.fileCount} files)`
                            : "Total"}
                        </span>
                        <span className="upload-percent-badge">
                          {aggregateUploadProgress.percentage || 0}%
                        </span>
                      </div>
                      <div className="progress upload-progress-track">
                        <div
                          className="progress-bar upload-progress-fill"
                          role="progressbar"
                          style={{
                            width: `${aggregateUploadProgress.percentage || 0}%`,
                          }}
                          aria-valuenow={
                            aggregateUploadProgress.percentage || 0
                          }
                          aria-valuemin="0"
                          aria-valuemax="100"
                        />
                      </div>
                      <div className="upload-progress-meta small text-muted mt-1">
                        <span>
                          {formatBytes(
                            aggregateUploadProgress.uploadedBytes || 0,
                          )}{" "}
                          /{" "}
                          {formatBytes(aggregateUploadProgress.totalBytes || 0)}
                        </span>
                        <span>
                          {aggregateUploadProgress.estimatedRemaining > 0 &&
                          aggregateUploadProgress.status !== "completed"
                            ? `Time left: ${formatDuration(aggregateUploadProgress.estimatedRemaining)}`
                            : "Time left: calculating..."}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={requestClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                className={`btn ${isEditMode ? "btn-primary" : "btn-success"}`}
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <span
                      className="spinner-border spinner-border-sm me-2"
                      role="status"
                      aria-hidden="true"
                    ></span>
                    {isEditMode ? "Saving..." : "Uploading..."}
                  </>
                ) : (
                  <>
                    <i
                      className={`fas ${isEditMode ? "fa-save" : "fa-upload"} me-2`}
                    ></i>
                    {isEditMode
                      ? "Save Changes"
                      : uploadMode === "folder"
                        ? "Upload Folder"
                        : "Upload File"}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      <style>{`
        .file-picker-input::file-selector-button,
        .file-picker-input::-webkit-file-upload-button {
          margin-right: 10px;
          border: 0;
          border-radius: 8px;
          background: linear-gradient(135deg, #007026 0, #09a98d 100%);
          color: #fff;
          padding: 8px 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .file-picker-input::file-selector-button:hover,
        .file-picker-input::-webkit-file-upload-button:hover {
          filter: brightness(1.08);
        }

        .file-name-options-scroll {
          max-height: 200px;
          overflow-y: auto;
          overflow-x: hidden;
          border: 2px dashed rgb(0 118 61 / 88%);
          border-radius: 10px;
          padding: 10px;
          background: rgb(14 144 60 / 5%);
        }

        .upload-progress-card {
          border: 2px solid #028011;
          border-radius: 14px;
          padding: 12px 14px;
          background: linear-gradient(180deg, rgb(245 255 250) 0%, #ffffff 100%);
        }

        .upload-file-path {
          max-width: 74%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          font-weight: 600;
          color: #0f172a;
        }

        .upload-percent-badge {
          background: linear-gradient(135deg, #007026 0%, #09a98d 100%);
          color: #fff;
          border-radius: 999px;
          padding: 3px 10px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.2px;
        }

        .upload-progress-track {
          height: 10px;
          border-radius: 999px;
          background: rgb(9 169 141 / 18%);
          overflow: hidden;
        }

        .upload-progress-fill {
          background: repeating-linear-gradient(45deg, #0b7d1b, #0b8f1d 10px, #d3ffe1 10px, #129637 20px);
          border-radius: 999px;
          transition: width 0.35s ease;
        }

        .upload-progress-meta {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          color: #475569 !important;
        }
        .progress{margin-top: 2px;}
      `}</style>

      <ConfirmationModal
        show={showCancelConfirm}
        onHide={() => setShowCancelConfirm(false)}
        onConfirm={confirmCancelUpload}
        title="Cancel Upload?"
        message="File upload is in progress. Do you want to cancel it?"
        confirmText="Yes, Cancel Upload"
        cancelText="Continue Upload"
        variant="warning"
      />
    </div>
  );
};

export default Createfile;
