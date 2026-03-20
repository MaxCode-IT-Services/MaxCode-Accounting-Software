import React from "react";

const TwoFATab = ({
  twoFAData,
  is2FALoading,
  handleGenerate2FA,
  setShow2FAVerification,
  biometricLogin,
  handleBiometricToggle,
  isBiometricLoading,
  usbKeyLogin,
  handleUsbKeyToggle,
  isUsbKeyLoading,
  showBackupCodes,
  backupCodes,
  handleCopyBackupCodes,
  handleDownloadBackupCodes,
  setShowBackupCodes,
  show2FAVerification,
  disable2FACode,
  setDisable2FACode,
  handleDisable2FA,
}) => {
  return (
    <div className="card modern-card">
      <div className="card-body">
        <h5 className="card-title mb-4">
          <i className="fas fa-shield-alt me-2 text-primary"></i>
          Two-Factor Authentication (2FA)
        </h5>

        <div className="alert alert-info mb-4">
          <i className="fas fa-info-circle me-2"></i>
          <strong>About 2FA:</strong> Two-Factor Authentication adds an extra
          layer of security. After entering your PIN during login, you'll need
          to enter a 6-digit code from Google Authenticator, Zoho Auth, or use
          your backup codes.
        </div>

        <div className="row mb-4">
          <div className="col-12">
            <div className="card bg-light">
              <div className="card-body">
                <div className="mb-3">
                  <h6 className="mb-1">
                    {twoFAData.enabled ? "2FA is Active" : "2FA is Inactive"}
                  </h6>

                  <small className="text-muted d-block">
                    {twoFAData.enabled
                      ? "Your account is protected with two-factor authentication"
                      : "Enable 2FA to secure your account"}
                  </small>
                </div>

                <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                  <div
                    className={`badge badge-pill ${twoFAData.enabled ? "bg-success" : "bg-danger"}`}
                    style={{ padding: "10px 15px" }}
                  >
                    <i
                      className={`fas ${twoFAData.enabled ? "fa-check-circle" : "fa-times-circle"} me-2`}
                    ></i>
                    {twoFAData.enabled ? "ENABLED" : "DISABLED"}
                  </div>

                  <div
                    className="form-check form-switch"
                    style={{
                      transform: "scale(1.3)",
                      transformOrigin: "right",
                    }}
                  >
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="twoFAToggle"
                      checked={twoFAData.enabled}
                      onChange={(e) => {
                        if (e.target.checked && !twoFAData.enabled) {
                          handleGenerate2FA();
                        } else if (!e.target.checked && twoFAData.enabled) {
                          setShow2FAVerification(true);
                        }
                      }}
                      disabled={is2FALoading}
                      style={{
                        cursor: "pointer",
                        width: "50px",
                        height: "28px",
                      }}
                    />
                    <label
                      className="form-check-label"
                      htmlFor="twoFAToggle"
                      style={{ cursor: "pointer" }}
                    ></label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="row mb-4">
          <div className="col-12">
            <div className="card bg-light border-start border-4 border-primary">
              <div className="card-body">
                <div className="mb-3">
                  <h6 className="mb-1 d-flex align-items-center gap-2">
                    <i className="fas fa-fingerprint text-primary"></i>
                    {biometricLogin.enabled
                      ? "Fingerprint Login is Active"
                      : "Fingerprint Login is Inactive"}
                  </h6>
                  <small className="text-muted d-block">
                    After PIN verification, login will continue with device
                    fingerprint.
                  </small>
                  <small className="text-muted d-block mt-1">
                    On laptop, choose phone passkey in browser prompt to verify
                    using mobile fingerprint.
                  </small>
                  {biometricLogin.enabled && !biometricLogin.hasCredential && (
                    <small className="text-danger d-block mt-1">
                      This device is not registered for fingerprint. Please
                      re-enable to setup.
                    </small>
                  )}
                  {!biometricLogin.supported && (
                    <small className="text-warning d-block mt-1">
                      This browser/device does not support fingerprint
                      authentication.
                    </small>
                  )}
                </div>

                <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                  <div
                    className={`badge badge-pill ${biometricLogin.enabled ? "bg-success" : "bg-danger"}`}
                    style={{ padding: "10px 15px" }}
                  >
                    <i
                      className={`fas ${biometricLogin.enabled ? "fa-check-circle" : "fa-times-circle"} me-2`}
                    ></i>
                    {biometricLogin.enabled ? "ENABLED" : "DISABLED"}
                  </div>

                  <div
                    className="form-check form-switch"
                    style={{
                      transform: "scale(1.3)",
                      transformOrigin: "right",
                    }}
                  >
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="fingerprintToggle"
                      checked={biometricLogin.enabled}
                      onChange={(e) => handleBiometricToggle(e.target.checked)}
                      disabled={isBiometricLoading}
                      style={{
                        cursor: "pointer",
                        width: "50px",
                        height: "28px",
                      }}
                    />
                    <label
                      className="form-check-label"
                      htmlFor="fingerprintToggle"
                      style={{ cursor: "pointer" }}
                    ></label>
                  </div>
                </div>

                {isBiometricLoading && (
                  <div className="mt-3 text-muted small d-flex align-items-center gap-2">
                    <span
                      className="spinner-border spinner-border-sm"
                      role="status"
                      aria-hidden="true"
                    ></span>
                    Updating fingerprint settings...
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="row mb-4">
          <div className="col-12">
            <div className="card bg-light border-start border-4 border-warning">
              <div className="card-body">
                <div className="mb-3">
                  <h6 className="mb-1 d-flex align-items-center gap-2">
                    <i className="fa-brands fa-usb text-warning"></i>
                    {usbKeyLogin.enabled
                      ? "USB Key Login is Active"
                      : "USB Key Login is Inactive"}
                  </h6>
                  <small className="text-muted d-block">
                    Create encrypted token file and store it inside your pen
                    drive.
                  </small>
                  <small className="text-muted d-block mt-1">
                    Login time you can verify by selecting
                    MaxCode-Accounting.sec from USB drive.
                  </small>
                  {usbKeyLogin.enabled && !usbKeyLogin.configured && (
                    <small className="text-danger d-block mt-1">
                      USB key token is missing. Disable and enable again to
                      generate a new key file.
                    </small>
                  )}
                </div>

                <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                  <div
                    className={`badge badge-pill ${usbKeyLogin.enabled ? "bg-success" : "bg-danger"}`}
                    style={{ padding: "10px 15px" }}
                  >
                    <i
                      className={`fas ${usbKeyLogin.enabled ? "fa-check-circle" : "fa-times-circle"} me-2`}
                    ></i>
                    {usbKeyLogin.enabled ? "ENABLED" : "DISABLED"}
                  </div>

                  <div
                    className="form-check form-switch"
                    style={{
                      transform: "scale(1.3)",
                      transformOrigin: "right",
                    }}
                  >
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="usbKeyToggle"
                      checked={usbKeyLogin.enabled}
                      onChange={(e) => handleUsbKeyToggle(e.target.checked)}
                      disabled={isUsbKeyLoading}
                      style={{
                        cursor: "pointer",
                        width: "50px",
                        height: "28px",
                      }}
                    />
                    <label
                      className="form-check-label"
                      htmlFor="usbKeyToggle"
                      style={{ cursor: "pointer" }}
                    ></label>
                  </div>
                </div>

                {isUsbKeyLoading && (
                  <div className="mt-3 text-muted small d-flex align-items-center gap-2">
                    <span
                      className="spinner-border spinner-border-sm"
                      role="status"
                      aria-hidden="true"
                    ></span>
                    Updating USB key settings...
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {showBackupCodes && (
          <div className="row mb-4">
            <div className="col-12">
              <div className="card border-warning">
                <div className="card-header bg-warning bg-opacity-10">
                  <h6 className="mb-0">
                    <i className="fas fa-exclamation-triangle me-2 text-warning"></i>
                    Save Your Backup Codes
                  </h6>
                </div>
                <div className="card-body">
                  <p className="text-muted mb-3">
                    Save these codes in a safe place. Each code can be used once
                    if you lose access to your authenticator app.
                  </p>
                  <div
                    className="bg-light p-3 rounded mb-3"
                    style={{
                      fontFamily: "monospace",
                      fontSize: "14px",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {backupCodes.map((code, index) => (
                      <div key={index}>{code}</div>
                    ))}
                  </div>
                  <div className="d-flex gap-2">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleCopyBackupCodes}
                    >
                      <i className="fas fa-copy me-2"></i>
                      Copy Codes
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleDownloadBackupCodes}
                    >
                      <i className="fas fa-download me-2"></i>
                      Download
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-secondary ms-auto"
                      onClick={() => setShowBackupCodes(false)}
                    >
                      <i className="fas fa-check me-2"></i>
                      I've Saved Codes
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {show2FAVerification && (
          <div className="row mb-4">
            <div className="col-12">
              <div className="card border-danger">
                <div className="card-header bg-danger bg-opacity-10">
                  <h6 className="mb-0">
                    <i className="fas fa-lock me-2 text-danger"></i>
                    Disable 2FA - Verify Identity
                  </h6>
                </div>
                <div className="card-body">
                  <p className="text-muted mb-3">
                    Enter your 6-digit 2FA code or a backup code to confirm
                    disabling 2FA.
                  </p>
                  <div className="mb-3">
                    <label htmlFor="disable2FACode" className="form-label">
                      Verification Code
                    </label>
                    <input
                      type="text"
                      className="form-control modern-input"
                      id="disable2FACode"
                      value={disable2FACode}
                      onChange={(e) =>
                        setDisable2FACode(e.target.value.slice(0, 8))
                      }
                      placeholder="Enter 6-digit code or 8-character backup code"
                      maxLength="8"
                    />
                  </div>
                  <div className="d-flex gap-2">
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={handleDisable2FA}
                      disabled={is2FALoading}
                    >
                      {is2FALoading ? (
                        <>
                          <span
                            className="spinner-border spinner-border-sm me-2"
                            role="status"
                            aria-hidden="true"
                          ></span>
                          Disabling...
                        </>
                      ) : (
                        <>
                          <i className="fas fa-trash me-2"></i>
                          Disable 2FA
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={() => {
                        setShow2FAVerification(false);
                        setDisable2FACode("");
                      }}
                    >
                      <i className="fas fa-times me-2"></i>
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="alert alert-warning">
          <h6 className="alert-heading">
            <i className="fas fa-lightbulb me-2"></i>
            Safety Tips:
          </h6>
          <ul className="mb-0 ps-3">
            <li>
              Save your backup codes in a secure location (password manager,
              safe)
            </li>
            <li>
              Each backup code can be used only once if you lose phone access
            </li>
            <li>
              During login, you can use either the 6-digit code from your app OR
              your main PIN
            </li>
            <li>Keep your authenticator app up-to-date</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default TwoFATab;
