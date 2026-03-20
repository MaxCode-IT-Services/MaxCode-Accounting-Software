import React, { useEffect, useMemo, useState } from "react";
import { showError, showSuccess } from "./ToastNotification";
import { apiPost } from "../utils/api";
import API_ENDPOINTS from "../utils/apiEndpoints";

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

const Createfile = ({ show, onClose, onSubmit, cloudflareSettings = {} }) => {
  const [uploadMode, setUploadMode] = useState("file");
  const [formData, setFormData] = useState({
    fileName: "",
    folderName: "general",
    uploadDate: new Date().toISOString().slice(0, 10),
    fileSizeBytes: 0,
    fileSize: "0 B",
    fileType: "",
  });
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedFolderFiles, setSelectedFolderFiles] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const folderOptions = useMemo(
    () => normalizeFolderOptions(cloudflareSettings),
    [cloudflareSettings],
  );

  useEffect(() => {
    if (!show) return;

    setFormData((prev) => ({
      ...prev,
      fileName: "",
      folderName:
        String(cloudflareSettings?.defaultFolder || "").trim() ||
        folderOptions[0] ||
        "general",
      uploadDate: new Date().toISOString().slice(0, 10),
      fileSizeBytes: 0,
      fileSize: "0 B",
      fileType: "",
    }));
    setUploadMode("file");
    setSelectedFile(null);
    setSelectedFolderFiles([]);
  }, [show, cloudflareSettings, folderOptions]);

  if (!show) return null;

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);

    if (!file) {
      setFormData((prev) => ({
        ...prev,
        fileSizeBytes: 0,
        fileSize: "0 B",
        fileType: "",
      }));
      return;
    }

    const derivedName = file.name.replace(/\.[^/.]+$/, "");

    setFormData((prev) => ({
      ...prev,
      fileName: prev.fileName || derivedName,
      uploadDate: new Date().toISOString().slice(0, 10),
      fileSizeBytes: file.size,
      fileSize: formatBytes(file.size),
      fileType: file.type || "application/octet-stream",
    }));
  };

  const handleFolderChange = (event) => {
    const files = Array.from(event.target.files || []);
    setSelectedFolderFiles(files);
    setSelectedFile(null);

    if (!files.length) {
      setFormData((prev) => ({
        ...prev,
        fileName: "",
        fileSizeBytes: 0,
        fileSize: "0 B",
        fileType: "",
      }));
      return;
    }

    const rootFolderName =
      files[0]?.webkitRelativePath?.split("/")?.[0] || "SelectedFolder";
    const totalBytes = files.reduce((sum, file) => sum + (file.size || 0), 0);

    setFormData((prev) => ({
      ...prev,
      fileName: rootFolderName,
      uploadDate: new Date().toISOString().slice(0, 10),
      fileSizeBytes: totalBytes,
      fileSize: formatBytes(totalBytes),
      fileType: `folder (${files.length} files)`,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!cloudflareSettings?.storeUrl || !cloudflareSettings?.password) {
      showError(
        "Cloudflare settings missing. Please configure it in Settings tab.",
      );
      return;
    }

    if (!formData.folderName.trim()) {
      showError("Please select folder");
      return;
    }

    if (uploadMode === "file") {
      if (!formData.fileName.trim()) {
        showError("Please enter file name");
        return;
      }

      if (!selectedFile) {
        showError("Please choose file");
        return;
      }
    } else if (selectedFolderFiles.length === 0) {
      showError("Please choose folder");
      return;
    }

    setSubmitting(true);

    try {
      let payload;

      if (uploadMode === "file") {
        const fileDataBase64 = await toBase64(selectedFile);

        payload = {
          action: "upload",
          fileName: formData.fileName.trim(),
          originalName: selectedFile.name,
          folderName: formData.folderName.trim(),
          uploadDate: formData.uploadDate,
          fileType: formData.fileType,
          fileSizeBytes: formData.fileSizeBytes,
          fileDataBase64,
        };
      } else {
        const folderFiles = await Promise.all(
          selectedFolderFiles.map(async (file) => ({
            relativePath: file.webkitRelativePath || file.name,
            originalName: file.name,
            fileType: file.type || "application/octet-stream",
            fileSizeBytes: file.size,
            fileDataBase64: await toBase64(file),
          })),
        );

        payload = {
          action: "upload-folder",
          folderName: formData.folderName.trim(),
          uploadDate: formData.uploadDate,
          folderFiles,
        };
      }

      const response = await apiPost(API_ENDPOINTS.FILES.CREATE, payload);
      showSuccess(
        response?.data?.message ||
          (uploadMode === "file"
            ? "File uploaded successfully"
            : "Folder uploaded successfully"),
      );

      if (onSubmit) {
        onSubmit(response?.data?.data || null);
      }
      onClose();
    } catch (error) {
      showError(
        error?.response?.data?.error ||
          error?.response?.data?.message ||
          "Failed to upload file",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="modal show d-block"
      tabIndex="-1"
      role="dialog"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <div className="modal-dialog modal-lg" role="document">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">Upload File</h5>
            <button
              type="button"
              className="btn-close"
              onClick={onClose}
            ></button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              <div className="row g-3">
                <div className="col-12">
                  <label className="form-label fw-semibold d-block">
                    Upload Type
                  </label>
                  <div className="d-flex gap-4">
                    <div className="form-check">
                      <input
                        className="form-check-input"
                        type="radio"
                        id="uploadTypeFile"
                        name="uploadType"
                        checked={uploadMode === "file"}
                        onChange={() => {
                          setUploadMode("file");
                          setSelectedFolderFiles([]);
                          setFormData((prev) => ({
                            ...prev,
                            fileName: "",
                            fileType: "",
                            fileSizeBytes: 0,
                            fileSize: "0 B",
                          }));
                        }}
                      />
                      <label
                        className="form-check-label"
                        htmlFor="uploadTypeFile"
                      >
                        Single File (pdf, zip, doc, image, etc.)
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
                          setSelectedFile(null);
                          setFormData((prev) => ({
                            ...prev,
                            fileName: "",
                            fileType: "",
                            fileSizeBytes: 0,
                            fileSize: "0 B",
                          }));
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

                <div className="col-md-6">
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
                    placeholder={
                      uploadMode === "file"
                        ? "Enter file name"
                        : "Folder name auto from selected folder"
                    }
                    readOnly={uploadMode === "folder"}
                  />
                </div>

                <div className="col-md-6">
                  <label className="form-label fw-semibold">
                    Select Folder
                  </label>
                  <select
                    className="form-select modern-input"
                    value={formData.folderName}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        folderName: e.target.value,
                      }))
                    }
                  >
                    {folderOptions.map((folder) => (
                      <option key={folder} value={folder}>
                        {folder}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-12">
                  <label className="form-label fw-semibold">
                    {uploadMode === "file" ? "Choose File" : "Choose Folder"}
                  </label>
                  {uploadMode === "file" ? (
                    <input
                      type="file"
                      className="form-control modern-input"
                      onChange={handleFileChange}
                    />
                  ) : (
                    <>
                      <input
                        type="file"
                        className="form-control modern-input"
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
                    value={formData.fileSize}
                    readOnly
                  />
                </div>

                <div className="col-md-4">
                  <label className="form-label fw-semibold">File Type</label>
                  <input
                    type="text"
                    className="form-control modern-input"
                    value={formData.fileType}
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
                className="btn btn-success"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <span
                      className="spinner-border spinner-border-sm me-2"
                      role="status"
                      aria-hidden="true"
                    ></span>
                    Uploading...
                  </>
                ) : (
                  <>
                    <i className="fas fa-upload me-2"></i>
                    Upload File
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Createfile;
