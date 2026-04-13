import React from "react";

const getHiddenSecretInputStyle = (value = "") => {
  if (!String(value || "").trim()) return undefined;
  return {
    color: "transparent",
    textShadow: "0 0 6px rgba(33, 37, 41, 0.75)",
    transition: "text-shadow 0.2s ease",
  };
};

const WhatsAppCloudApiTab = ({
  handleSaveAll,
  isSaving,
  isBusinessLoading,
  isSuperAdmin,
  businessSettings,
  handleWhatsAppChange,
  handleWhatsAppSecretInputChange,
  showWhatsAppSecret,
  handleWhatsAppRevealToggle,
  copyWhatsAppFieldValue,
}) => {
  const config = businessSettings?.whatsappSettings || {};

  return (
    <div className="business-details-container">
      <div className="card modern-card mb-4">
        <div className="card-body d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3">
          <div>
            <h5 className="mb-1 fw-bold">WhatsApp Cloud API</h5>
            <p className="text-muted mb-0">
              Configure OTP template delivery for credential view and edit
              approval.
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
                Save WhatsApp API
              </>
            )}
          </button>
        </div>
      </div>

      <div className="card border-0 shadow-sm rounded-4 p-4 bg-white">
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label fw-bold">Access Token</label>
            <div className="input-group">
              <input
                type="text"
                className="form-control modern-input"
                value={config.accessToken || ""}
                onChange={(e) =>
                  handleWhatsAppSecretInputChange("accessToken", e.target.value)
                }
                placeholder="EAA..."
                disabled={!isSuperAdmin}
                style={
                  showWhatsAppSecret?.accessToken
                    ? undefined
                    : getHiddenSecretInputStyle(config.accessToken)
                }
              />
              <button
                className="btn btn-outline-secondary"
                type="button"
                onClick={() => handleWhatsAppRevealToggle("accessToken")}
              >
                <i
                  className={`fas fa-eye${showWhatsAppSecret?.accessToken ? "-slash" : ""}`}
                ></i>
              </button>
              <button
                className="btn btn-outline-primary rounded-end-3"
                type="button"
                onClick={() => copyWhatsAppFieldValue("accessToken")}
              >
                <i className="fas fa-copy"></i>
              </button>
            </div>
          </div>

          <div className="col-md-6">
            <label className="form-label fw-bold">App ID</label>
            <div className="input-group">
              <input
                type="text"
                className="form-control modern-input"
                value={config.appId || ""}
                onChange={(e) =>
                  handleWhatsAppSecretInputChange("appId", e.target.value)
                }
                placeholder="Meta app id"
                disabled={!isSuperAdmin}
                style={
                  showWhatsAppSecret?.appId
                    ? undefined
                    : getHiddenSecretInputStyle(config.appId)
                }
              />
              <button
                className="btn btn-outline-secondary"
                type="button"
                onClick={() => handleWhatsAppRevealToggle("appId")}
              >
                <i
                  className={`fas fa-eye${showWhatsAppSecret?.appId ? "-slash" : ""}`}
                ></i>
              </button>
              <button
                className="btn btn-outline-primary rounded-end-3"
                type="button"
                onClick={() => copyWhatsAppFieldValue("appId")}
              >
                <i className="fas fa-copy"></i>
              </button>
            </div>
          </div>

          <div className="col-md-6">
            <label className="form-label fw-bold">Phone Number ID</label>
            <div className="input-group">
              <input
                type="text"
                className="form-control modern-input"
                value={config.phoneNumberId || ""}
                onChange={(e) =>
                  handleWhatsAppSecretInputChange(
                    "phoneNumberId",
                    e.target.value,
                  )
                }
                placeholder="WhatsApp phone number id"
                disabled={!isSuperAdmin}
                style={
                  showWhatsAppSecret?.phoneNumberId
                    ? undefined
                    : getHiddenSecretInputStyle(config.phoneNumberId)
                }
              />
              <button
                className="btn btn-outline-secondary"
                type="button"
                onClick={() => handleWhatsAppRevealToggle("phoneNumberId")}
              >
                <i
                  className={`fas fa-eye${showWhatsAppSecret?.phoneNumberId ? "-slash" : ""}`}
                ></i>
              </button>
              <button
                className="btn btn-outline-primary rounded-end-3"
                type="button"
                onClick={() => copyWhatsAppFieldValue("phoneNumberId")}
              >
                <i className="fas fa-copy"></i>
              </button>
            </div>
          </div>

          <div className="col-md-6">
            <label className="form-label fw-bold">Business Account ID</label>
            <div className="input-group">
              <input
                type="text"
                className="form-control modern-input"
                value={config.businessAccountId || ""}
                onChange={(e) =>
                  handleWhatsAppSecretInputChange(
                    "businessAccountId",
                    e.target.value,
                  )
                }
                placeholder="WhatsApp business account id"
                disabled={!isSuperAdmin}
                style={
                  showWhatsAppSecret?.businessAccountId
                    ? undefined
                    : getHiddenSecretInputStyle(config.businessAccountId)
                }
              />
              <button
                className="btn btn-outline-secondary"
                type="button"
                onClick={() => handleWhatsAppRevealToggle("businessAccountId")}
              >
                <i
                  className={`fas fa-eye${showWhatsAppSecret?.businessAccountId ? "-slash" : ""}`}
                ></i>
              </button>
              <button
                className="btn btn-outline-primary rounded-end-3"
                type="button"
                onClick={() => copyWhatsAppFieldValue("businessAccountId")}
              >
                <i className="fas fa-copy"></i>
              </button>
            </div>
          </div>

          <div className="col-md-6">
            <label className="form-label fw-bold">
              Founder & CEO Phone Number
            </label>
            <div className="input-group">
              <span className="input-group-text flag-india">
                <img
                  src="https://flagcdn.com/w40/in.png"
                  alt="India"
                  className="flag-icon"
                />
                +91
              </span>
              <input
                type="tel"
                className="form-control modern-input rounded-end-3"
                value={config.founderCeoPhoneNumber || ""}
                onChange={(e) =>
                  handleWhatsAppChange(
                    "founderCeoPhoneNumber",
                    String(e.target.value || "")
                      .replace(/\D+/g, "")
                      .slice(0, 10),
                  )
                }
                minLength="10"
                maxLength="10"
                placeholder="10-digit mobile number"
                disabled={!isSuperAdmin}
              />
            </div>
          </div>

          <div className="col-12">
            <div className="card bg-success border-0 p-3">
              <div className="form-check form-switch m-0">
                <input
                  className="form-check-input"
                  type="checkbox"
                  checked={config.disableOtpForCredentials === true}
                  onChange={(e) =>
                    handleWhatsAppChange(
                      "disableOtpForCredentials",
                      e.target.checked,
                    )
                  }
                  disabled={!isSuperAdmin}
                  id="disableOtpToggle"
                />
                <label className="form-check-label" htmlFor="disableOtpToggle">
                  <span className="fw-bold text-white">
                    Disable OTP for Credentials
                  </span>
                  <p className="mb-0 small text-white">
                    When enabled, users can view and edit Project & Software
                    credentials directly without OTP verification.
                  </p>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WhatsAppCloudApiTab;
