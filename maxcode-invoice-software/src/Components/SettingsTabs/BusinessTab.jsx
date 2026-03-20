import React from "react";

const BusinessTab = ({
  handleSaveAll,
  isSaving,
  isBusinessLoading,
  isSuperAdmin,
  uploadingField,
  businessSettings,
  handleImageUpload,
  handleBusinessChange,
  handleTestConnection,
  isTesting,
}) => {
  return (
    <div className="business-details-container">
      <div className="card modern-card mb-4">
        <div className="card-body">
          <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3">
            <div className="d-flex align-items-start align-items-md-center gap-3">
              <div className="p-3 rounded-4 bg-success bg-opacity-10">
                <i
                  className="fas fa-building text-white"
                  style={{ fontSize: "2rem" }}
                ></i>
              </div>

              <div>
                <h4 className="mb-1 fw-bold">Account & Branding</h4>
                <p className="text-muted mb-0">Business Profile Settings</p>
              </div>
            </div>

            <button
              onClick={handleSaveAll}
              disabled={isSaving || isBusinessLoading || !isSuperAdmin}
              className="btn btn-success px-4 px-md-5 py-2 py-md-3 rounded-4 fw-bold d-flex align-items-center justify-content-center gap-2 settings-responsive-btn"
            >
              {isSaving || isBusinessLoading ? (
                <>
                  <span
                    className="spinner-border spinner-border-sm"
                    role="status"
                    aria-hidden="true"
                  ></span>
                  {isBusinessLoading ? "LOADING..." : "SYNCING..."}
                </>
              ) : (
                <>
                  <i className="fas fa-save"></i>
                  SAVE CHANGES
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <div className="row g-4">
        <div className="col-12">
          <div className="card border-0 shadow-sm rounded-4 p-4 bg-white">
            <h5
              className="fw-bold mb-4 pb-3 border-bottom"
              style={{ color: "#198754" }}
            >
              <i className="fas fa-palette me-2"></i>
              Branding Assets (HTTPS Media Storage)
            </h5>
            <div className="row g-4">
              {[
                {
                  label: "Profile Photo",
                  field: "profilePhotoUrl",
                  icon: "fa-user",
                },
                {
                  label: "Company Logo",
                  field: "logoUrl",
                  icon: "fa-building",
                },
                { label: "Payment QR", field: "qrCodeUrl", icon: "fa-qrcode" },
                {
                  label: "Authorized Seal",
                  field: "sealUrl",
                  icon: "fa-shield-alt",
                },
                {
                  label: "Paid Stamp",
                  field: "paidSealUrl",
                  icon: "fa-check-circle",
                },
                {
                  label: "Unpaid Stamp",
                  field: "unpaidSealUrl",
                  icon: "fa-times-circle",
                },
              ].map((asset) => (
                <div
                  key={asset.field}
                  className="col-6 col-md-4 col-lg-2 text-center"
                >
                  <label className="fw-bold mb-3 d-block">{asset.label}</label>
                  <div
                    className="position-relative mx-auto"
                    style={{ width: "120px", height: "120px" }}
                  >
                    <div className="w-100 h-100 bg-light rounded-4 border-2 border-dashed border-secondary d-flex align-items-center justify-content-center overflow-hidden">
                      {uploadingField === asset.field ? (
                        <div className="d-flex align-items-center justify-content-center h-100">
                          <span
                            className="spinner-border text-success"
                            role="status"
                          ></span>
                        </div>
                      ) : businessSettings[asset.field] ? (
                        <img
                          src={businessSettings[asset.field]}
                          className="w-100 h-100 object-fit-contain p-2"
                          alt={asset.label}
                        />
                      ) : (
                        <div className="text-center opacity-50">
                          <i
                            className={`fas ${asset.icon} fa-2x text-muted`}
                          ></i>
                        </div>
                      )}
                      <input
                        type="file"
                        className="position-absolute w-100 h-100 opacity-0 cursor-pointer top-0 start-0"
                        accept="image/*"
                        onChange={(e) => handleImageUpload(asset.field, e)}
                        disabled={!isSuperAdmin}
                        title={`Upload ${asset.label}`}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="col-lg-6">
          <div className="card border-0 shadow-sm rounded-4 p-4 h-100 bg-white">
            <h5
              className="fw-bold mb-4 pb-3 border-bottom"
              style={{ color: "#198754" }}
            >
              <i className="fas fa-building me-2"></i>
              Office Details
            </h5>
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label small fw-bold text-muted">
                  Business Name
                </label>
                <input
                  className="form-control modern-input"
                  value={businessSettings.companyName}
                  onChange={(e) =>
                    handleBusinessChange("companyName", e.target.value)
                  }
                  disabled={!isSuperAdmin}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label small fw-bold text-muted">
                  GSTIN
                </label>
                <input
                  className="form-control modern-input"
                  value={businessSettings.gstin}
                  onChange={(e) =>
                    handleBusinessChange("gstin", e.target.value)
                  }
                  placeholder="Enter GSTIN"
                  disabled={!isSuperAdmin}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label small fw-bold text-muted">
                  Contact Phone
                </label>
                <input
                  className="form-control modern-input"
                  value={businessSettings.companyPhone}
                  onChange={(e) =>
                    handleBusinessChange("companyPhone", e.target.value)
                  }
                  disabled={!isSuperAdmin}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label small fw-bold text-muted">
                  Official Email
                </label>
                <input
                  className="form-control modern-input"
                  value={businessSettings.companyEmail}
                  onChange={(e) =>
                    handleBusinessChange("companyEmail", e.target.value)
                  }
                  disabled={!isSuperAdmin}
                />
              </div>
              <div className="col-12">
                <label className="form-label small fw-bold text-muted">
                  Full Address
                </label>
                <input
                  type="text"
                  className="form-control modern-input"
                  value={businessSettings.companyAddress}
                  onChange={(e) =>
                    handleBusinessChange("companyAddress", e.target.value)
                  }
                  disabled={!isSuperAdmin}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="col-lg-6">
          <div className="card border-0 shadow-sm rounded-4 p-4 h-100 bg-white">
            <h5
              className="fw-bold mb-4 pb-3 border-bottom"
              style={{ color: "#198754" }}
            >
              <i className="fas fa-university me-2"></i>
              Banking & Prefs
            </h5>
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label small fw-bold text-muted">
                  Bank Name
                </label>
                <input
                  className="form-control modern-input"
                  value={businessSettings.bankName}
                  onChange={(e) =>
                    handleBusinessChange("bankName", e.target.value)
                  }
                  disabled={!isSuperAdmin}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label small fw-bold text-muted">
                  Account Number
                </label>
                <input
                  className="form-control modern-input"
                  value={businessSettings.accountNumber}
                  onChange={(e) =>
                    handleBusinessChange("accountNumber", e.target.value)
                  }
                  disabled={!isSuperAdmin}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label small fw-bold text-muted">
                  Account Name
                </label>
                <input
                  className="form-control modern-input"
                  value={businessSettings.accountName}
                  onChange={(e) =>
                    handleBusinessChange("accountName", e.target.value)
                  }
                  disabled={!isSuperAdmin}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label small fw-bold text-muted">
                  IFSC Code
                </label>
                <input
                  className="form-control modern-input"
                  value={businessSettings.ifscCode}
                  onChange={(e) =>
                    handleBusinessChange("ifscCode", e.target.value)
                  }
                  disabled={!isSuperAdmin}
                />
              </div>
              <div className="col-12">
                <label className="form-label small fw-bold text-muted">
                  Branch Address
                </label>
                <input
                  type="text"
                  className="form-control modern-input"
                  value={businessSettings.branchAddress}
                  onChange={(e) =>
                    handleBusinessChange("branchAddress", e.target.value)
                  }
                  disabled={!isSuperAdmin}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 mb-4">
          <div className="card border-0 shadow-sm rounded-4 overflow-hidden">
            <div className="card-header bg-success text-white py-3 px-4 border-0 d-flex align-items-center justify-content-between">
              <div className="d-flex align-items-center gap-3">
                <i className="fas fa-database fa-lg"></i>
                <div>
                  <h5 className="fw-bold mb-0">Cloud Master Sync</h5>
                  <small className="text-white opacity-75">
                    Global Database Infrastructure
                  </small>
                </div>
              </div>
              <div className="form-check form-switch">
                <input
                  className="form-check-input cursor-pointer"
                  type="checkbox"
                  role="switch"
                  id="dbSyncSwitch"
                  checked={businessSettings.dbSyncEnabled}
                  onChange={(e) =>
                    handleBusinessChange("dbSyncEnabled", e.target.checked)
                  }
                  disabled={!isSuperAdmin}
                  style={{ width: "3rem", height: "1.5rem" }}
                />
              </div>
            </div>

            <div className="card-body p-4 bg-white">
              <div className="row g-4">
                <div className="col-lg-6">
                  <label className="form-label fw-bold text-muted small text-uppercase mb-2">
                    MongoDB Cluster URI
                  </label>

                  <div className="input-group" style={{ maxWidth: "100%" }}>
                    <span className="input-group-text bg-light border-2">
                      <i className="fas fa-database"></i>
                    </span>

                    <input
                      type="text"
                      className="form-control modern-input border-2"
                      value={businessSettings.mongoConnectionString}
                      onChange={(e) =>
                        handleBusinessChange(
                          "mongoConnectionString",
                          e.target.value,
                        )
                      }
                      placeholder="mongodb+srv://username:password@cluster.mongodb.net/database"
                      disabled={!isSuperAdmin}
                    />
                  </div>

                  <small className="text-muted mt-1 d-block">
                    <i className="fas fa-info-circle me-1"></i>
                    Enter your MongoDB connection string
                  </small>
                </div>

                <div className="col-lg-6">
                  <label className="form-label fw-bold text-muted small text-uppercase mb-2">
                    Netlify Bridge API URL
                  </label>

                  <div className="input-group" style={{ maxWidth: "100%" }}>
                    <span className="input-group-text bg-light border-2">
                      <i className="fas fa-link"></i>
                    </span>

                    <input
                      type="url"
                      className="form-control modern-input border-2"
                      value={businessSettings.mongoApiUrl}
                      onChange={(e) =>
                        handleBusinessChange("mongoApiUrl", e.target.value)
                      }
                      placeholder="https://your-app.netlify.app/.netlify/functions/sync"
                      disabled={!isSuperAdmin}
                    />
                  </div>

                  <small className="text-muted mt-1 d-block">
                    <i className="fas fa-info-circle me-1"></i>
                    Your Netlify function endpoint
                  </small>
                </div>

                <div className="col-12">
                  <button
                    onClick={handleTestConnection}
                    disabled={isTesting || !isSuperAdmin}
                    className="btn btn-outline-success px-4 py-2 fw-bold"
                  >
                    {isTesting ? (
                      <>
                        <span
                          className="spinner-border spinner-border-sm me-2"
                          role="status"
                        ></span>
                        Verifying Connection...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-plug me-2"></i>
                        Test MongoDB Connection
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BusinessTab;
