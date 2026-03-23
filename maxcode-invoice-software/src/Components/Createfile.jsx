import React, { useEffect, useMemo, useRef, useState } from "react";
import Select from "react-select";
import pako from "pako";
import { showError, showInfo, showSuccess } from "./ToastNotification";
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

const Createfile = ({
  show,
  onClose,
  onSubmit,
  cloudflareSettings = {},
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
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef(null);

  const folderOptions = useMemo(
    () => normalizeFolderOptions(cloudflareSettings),
    [cloudflareSettings],
  );

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

    return {
      size: formatBytes(total),
      type: uniqueTypes.length
        ? uniqueTypes.length === 1
          ? uniqueTypes[0]
          : `${uniqueTypes.length} file types`
        : "-",
    };
  }, [isEditMode, initialData, selectedFiles, selectedFolderFiles, uploadMode]);

  useEffect(() => {
    if (!show) return;

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
  }, [show, isEditMode, initialData, cloudflareSettings, folderOptions]);

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
      if (!cloudflareSettings?.storeUrl || !cloudflareSettings?.password) {
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
            cloudflareSettings,
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

      let payload;

      if (uploadMode === "single") {
        const item = selectedFiles[0];
        const uploadReadyFile = await getUploadReadyFile(item.file);
        payload = {
          action: "upload",
          fileName: String(item.customName || "").trim(),
          originalName: item.file.name,
          folderName: formData.folderName.trim(),
          uploadDate: formData.uploadDate,
          fileType: uploadReadyFile.fileType,
          fileSizeBytes: uploadReadyFile.fileSizeBytes,
          fileDataBase64: uploadReadyFile.fileDataBase64,
          compression: uploadReadyFile.compression,
          cloudflareSettings,
        };
      } else if (uploadMode === "multiple") {
        const files = await Promise.all(
          selectedFiles.map(async (item) => {
            const uploadReadyFile = await getUploadReadyFile(item.file);
            return {
              fileName: String(item.customName || "").trim(),
              originalName: item.file.name,
              fileType: uploadReadyFile.fileType,
              fileSizeBytes: uploadReadyFile.fileSizeBytes,
              fileDataBase64: uploadReadyFile.fileDataBase64,
              compression: uploadReadyFile.compression,
            };
          }),
        );

        payload = {
          action: "upload-files",
          folderName: formData.folderName.trim(),
          uploadDate: formData.uploadDate,
          files,
          cloudflareSettings,
        };
      } else {
        const selectedRootName =
          selectedFolderFiles[0]?.webkitRelativePath?.split("/")?.[0] || "";

        const folderFiles = await Promise.all(
          selectedFolderFiles.map(async (file) => {
            const uploadReadyFile = await getUploadReadyFile(file);
            return {
              relativePath: (() => {
                const raw = String(file.webkitRelativePath || file.name || "");
                if (
                  !selectedRootName ||
                  !raw.startsWith(`${selectedRootName}/`)
                ) {
                  return `${folderUploadName.trim()}/${file.name}`;
                }
                return `${folderUploadName.trim()}/${raw.slice(selectedRootName.length + 1)}`;
              })(),
              originalName: file.name,
              fileType:
                uploadReadyFile.fileType ||
                file.type ||
                "application/octet-stream",
              fileSizeBytes: uploadReadyFile.fileSizeBytes || file.size,
              fileDataBase64: uploadReadyFile.fileDataBase64,
              compression: uploadReadyFile.compression,
            };
          }),
        );

        payload = {
          action: "upload-folder",
          folderName: formData.folderName.trim(),
          uploadDate: formData.uploadDate,
          folderFiles,
          cloudflareSettings,
        };
      }

      const response = await apiPost(API_ENDPOINTS.FILES.CREATE, payload);
      showSuccess(
        response?.data?.message ||
          (uploadMode === "folder"
            ? "Folder uploaded successfully"
            : uploadMode === "multiple"
              ? "Files uploaded successfully"
              : "File uploaded successfully"),
      );

      if (onSubmit) onSubmit(response?.data?.data || null);
      onClose();
    } catch (error) {
      showError(
        error?.response?.data?.error ||
          error?.response?.data?.message ||
          (isEditMode ? "Failed to update file" : "Failed to upload file"),
      );
    } finally {
      setSubmitting(false);
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
              onClick={onClose}
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
                    value={selectionSummary.type}
                    readOnly
                  />
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
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
      `}</style>
    </div>
  );
};

export default Createfile;
