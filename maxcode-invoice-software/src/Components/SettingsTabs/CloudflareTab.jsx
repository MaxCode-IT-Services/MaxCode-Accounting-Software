import React from "react";

const CloudflareTab = ({
  handleSaveAll,
  isSaving,
  isBusinessLoading,
  isSuperAdmin,
  businessSettings,
  handleCloudflareChange,
}) => {
  return (
    <div className="business-details-container">
      <div className="card modern-card mb-4">
        <div className="card-body d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3">
          <div>
            <h5 className="mb-1 fw-bold">Cloudflare Storage</h5>
            <p className="text-muted mb-0">
              Configure a Cloudflare Worker and R2 endpoint for file uploads.
            </p>
          </div>
          <button
            onClick={handleSaveAll}
            disabled={isSaving || isBusinessLoading || !isSuperAdmin}
            className="btn btn-success px-4 py-2 fw-bold d-flex align-items-center gap-2"
          >
            {isSaving || isBusinessLoading ? (
              <>
                <span
                  className="spinner-border spinner-border-sm"
                  role="status"
                  aria-hidden="true"
                ></span>
                Saving...
              </>
            ) : (
              <>
                <i className="fas fa-save"></i>
                Save Cloudflare
              </>
            )}
          </button>
        </div>
      </div>

      <div className="card border-0 shadow-sm rounded-4 p-4 bg-white">
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label fw-bold">Store URL</label>
            <input
              type="url"
              className="form-control modern-input"
              value={businessSettings.cloudflareSettings?.storeUrl || ""}
              onChange={(e) =>
                handleCloudflareChange("storeUrl", e.target.value)
              }
              placeholder="https://img.official-maxcode.workers.dev"
              disabled={!isSuperAdmin}
            />
          </div>

          <div className="col-md-6">
            <label className="form-label fw-bold">Public URL Domain</label>
            <input
              type="url"
              className="form-control modern-input"
              value={businessSettings.cloudflareSettings?.publicDomain || ""}
              onChange={(e) =>
                handleCloudflareChange("publicDomain", e.target.value)
              }
              placeholder="https://img.maxcodehub.com"
              disabled={!isSuperAdmin}
            />
          </div>

          <div className="col-md-6">
            <label className="form-label fw-bold">Password</label>
            <input
              type="password"
              className="form-control modern-input"
              value={businessSettings.cloudflareSettings?.password || ""}
              onChange={(e) =>
                handleCloudflareChange("password", e.target.value)
              }
              placeholder="Upload API password"
              disabled={!isSuperAdmin}
            />
          </div>

          <div className="col-md-6">
            <label className="form-label fw-bold">Default Folder</label>
            <input
              type="text"
              className="form-control modern-input"
              value={businessSettings.cloudflareSettings?.defaultFolder || ""}
              onChange={(e) =>
                handleCloudflareChange("defaultFolder", e.target.value)
              }
              placeholder="MaxCode"
              disabled={!isSuperAdmin}
            />
          </div>

          <div className="col-12">
            <label className="form-label fw-bold">
              Folder Options (comma separated)
            </label>
            <input
              type="text"
              className="form-control modern-input"
              value={businessSettings.cloudflareSettings?.folderOptions || ""}
              onChange={(e) =>
                handleCloudflareChange("folderOptions", e.target.value)
              }
              placeholder="MaxCode,Other"
              disabled={!isSuperAdmin}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default CloudflareTab;
