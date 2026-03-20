import React from "react";

const BackupTab = ({
  undoAvailable,
  undoExpiry,
  handleUndoImport,
  isUndoing,
  isSuperAdmin,
  backupProgress,
  handleExportBackup,
  isExporting,
  backupFileInputRef,
  handleImportBackup,
  isImporting,
  driveConfig,
  setDriveConfig,
  showDrivePassword,
  setShowDrivePassword,
  handleSaveDriveConfig,
  isDriveSaving,
  handleRunBackupNow,
  handleTestDriveConnection,
}) => {
  return (
    <div className="business-details-container">
      {undoAvailable && (
        <div className="alert alert-warning d-flex align-items-center justify-content-between mb-4">
          <div>
            <i className="fas fa-undo me-2"></i>
            <b>Undo Import:</b> You can undo the last import within 12 hours.
            <br />
            <small>
              Expires:{" "}
              {undoExpiry ? new Date(undoExpiry).toLocaleString() : "-"}
            </small>
          </div>
          <button
            className="btn btn-danger ms-3"
            onClick={handleUndoImport}
            disabled={isUndoing || !isSuperAdmin}
          >
            {isUndoing ? (
              <span className="spinner-border spinner-border-sm me-2"></span>
            ) : (
              <i className="fas fa-undo me-2"></i>
            )}
            Undo Import
          </button>
        </div>
      )}
      <div className="row g-4">
        <div className="col-lg-6">
          <div className="card modern-card h-100">
            <div className="card-body">
              <div className="text-center mb-4">
                <div className="backup-icon-wrapper mb-3">
                  <i className="fas fa-download fa-3x text-primary"></i>
                </div>
                <h4 className="fw-bold mb-2">Export Backup</h4>
                <p className="text-muted">
                  Download all your data as a secure BSON & JSON backup for
                  safekeeping
                </p>
              </div>

              <div className="backup-info-card mb-3">
                <div className="d-flex align-items-center mb-2">
                  <i className="fas fa-info-circle text-info me-2"></i>
                  <strong>What will be exported?</strong>
                </div>
                <ul className="backup-list row list-unstyled">
                  <li className="col-md-6 mb-2">
                    <i className="fas fa-check-circle text-success me-2"></i>
                    All Clients Data
                  </li>
                  <li className="col-md-6 mb-2">
                    <i className="fas fa-check-circle text-success me-2"></i>
                    All Vendors Data
                  </li>
                  <li className="col-md-6 mb-2">
                    <i className="fas fa-check-circle text-success me-2"></i>
                    All Invoices & Sales
                  </li>
                  <li className="col-md-6 mb-2">
                    <i className="fas fa-check-circle text-success me-2"></i>
                    All Purchases
                  </li>
                  <li className="col-md-6 mb-2">
                    <i className="fas fa-check-circle text-success me-2"></i>
                    All RCM Records
                  </li>
                  <li className="col-md-6 mb-2">
                    <i className="fas fa-check-circle text-success me-2"></i>
                    All Company Expense
                  </li>
                  <li className="col-md-6 mb-2">
                    <i className="fas fa-check-circle text-success me-2"></i>
                    All Services Management
                  </li>
                  <li className="col-md-6 mb-2">
                    <i className="fas fa-check-circle text-success me-2"></i>
                    All Projects Data
                  </li>
                  <li className="col-md-6 mb-2">
                    <i className="fas fa-check-circle text-success me-2"></i>
                    All Staff Records
                  </li>
                  <li className="col-md-6 mb-2">
                    <i className="fas fa-check-circle text-success me-2"></i>
                    All Users & Team
                  </li>
                  <li className="col-md-6 mb-2">
                    <i className="fas fa-check-circle text-success me-2"></i>
                    Financial Years
                  </li>
                  <li className="col-md-6 mb-2">
                    <i className="fas fa-check-circle text-success me-2"></i>
                    Business Settings
                  </li>
                </ul>
              </div>

              <div className="mb-3 text-center">
                <label className="me-3">
                  <input
                    type="radio"
                    name="exportFormat"
                    value="bson"
                    defaultChecked={true}
                    className="me-1"
                  />
                  BSON (Recommended for backup/restore)
                </label>
                <label>
                  <input
                    type="radio"
                    name="exportFormat"
                    value="json"
                    className="me-1"
                  />
                  JSON (Human readable)
                </label>
              </div>

              {backupProgress && (
                <div className="alert alert-info">
                  <i className="fas fa-spinner fa-spin me-2"></i>
                  {backupProgress}
                </div>
              )}

              <button
                className="btn btn-primary btn-lg w-100"
                onClick={handleExportBackup}
                disabled={isExporting}
              >
                {isExporting ? (
                  <>
                    <i className="fas fa-spinner fa-spin me-2"></i>
                    Exporting...
                  </>
                ) : (
                  <>
                    <i className="fas fa-download me-2"></i>
                    Export Backup Now
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="col-lg-6">
          <div className="card modern-card h-100">
            <div className="card-body">
              <div className="text-center mb-4">
                <div className="backup-icon-wrapper mb-3">
                  <i className="fas fa-upload fa-3x text-success"></i>
                </div>
                <h4 className="fw-bold mb-2">Restore Backup</h4>
                <p className="text-muted">
                  Import and restore data from a previously exported BSON & JSON
                  backup file
                </p>
              </div>

              <div className="backup-warning-card mb-3">
                <div className="d-flex align-items-start">
                  <i className="fas fa-exclamation-triangle text-warning me-2 mt-1"></i>
                  <div>
                    <strong className="text-warning">Important Warning!</strong>
                    <p className="mb-0 mt-1 small">
                      Importing a backup will{" "}
                      <strong>replace all existing data.</strong>
                      This action cannot be undone. Please export a current
                      backup before proceeding.
                    </p>
                  </div>
                </div>
              </div>

              <div className="backup-info-card mb-3">
                <div className="d-flex align-items-center mb-2">
                  <i className="fas fa-list-check text-primary me-2 ps-2"></i>
                  <strong>Before you restore:</strong>
                </div>
                <ul className="backup-list">
                  <li className="mb-2">
                    <i className="fas fa-arrow-right text-primary me-2"></i>
                    Export current data as backup
                  </li>
                  <li className="mb-2">
                    <i className="fas fa-arrow-right text-primary me-2"></i>
                    Verify the BSON & JSON file is not corrupted
                  </li>
                  <li className="mb-2">
                    <i className="fas fa-arrow-right text-primary me-2"></i>
                    Ensure file is from this system
                  </li>
                </ul>
              </div>

              <input
                type="file"
                ref={backupFileInputRef}
                accept=".bson,.json"
                style={{ display: "none" }}
                onChange={handleImportBackup}
                disabled={!isSuperAdmin}
              />

              <button
                className="btn btn-success btn-lg w-100"
                onClick={() => backupFileInputRef.current?.click()}
                disabled={isImporting || !isSuperAdmin}
              >
                {isImporting ? (
                  <>
                    <i className="fas fa-spinner fa-spin me-2"></i>
                    Importing...
                  </>
                ) : (
                  <>
                    <i className="fas fa-upload me-2"></i>
                    Choose Backup File
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="col-12">
          <div className="card modern-card">
            <div className="card-body">
              <h5 className="fw-bold mb-3">
                <i className="fas fa-lightbulb text-warning me-2"></i>
                Backup Best Practices
              </h5>
              <div className="row">
                <div className="col-md-6">
                  <div className="backup-tip">
                    <i className="fas fa-calendar-day text-info me-2"></i>
                    <strong>Regular Backups:</strong> Export backups daily or
                    weekly
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="backup-tip">
                    <i className="fas fa-cloud text-primary me-2"></i>
                    <strong>Multiple Locations:</strong> Store backups in
                    different places
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="backup-tip">
                    <i className="fas fa-shield-halved text-success me-2"></i>
                    <strong>Verify Backups:</strong> Test restore periodically
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="backup-tip">
                    <i className="fas fa-tag text-danger me-2"></i>
                    <strong>Label Files:</strong> Use dates in backup filenames
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-12">
          <div className="card modern-card">
            <div className="card-body">
              <div className="d-flex justify-content-between align-items-center mb-4">
                <div>
                  <h5 className="fw-bold mb-1">
                    <i className="fab fa-google-drive text-success me-2"></i>
                    Google Drive Auto Backup
                  </h5>
                  <p className="text-muted mb-0">
                    Automatically backup your data to Google Drive with flexible
                    schedule options
                  </p>
                </div>
                <div className="form-check form-switch">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="driveEnabled"
                    checked={driveConfig.enabled}
                    onChange={(e) =>
                      setDriveConfig({
                        ...driveConfig,
                        enabled: e.target.checked,
                      })
                    }
                    style={{ width: "48px", height: "24px" }}
                  />
                  <label
                    className="form-check-label ms-2 fw-bold"
                    htmlFor="driveEnabled"
                  >
                    {driveConfig.enabled ? "Enabled" : "Disabled"}
                  </label>
                </div>
              </div>

              {driveConfig.enabled && (
                <>
                  <div className="alert alert-info mb-4 border-info overflow-hidden">
                    <div className="d-flex align-items-start gap-2 flex-nowrap">
                      <div className="flex-shrink-0">
                        <i className="fas fa-info-circle text-info mt-1"></i>
                      </div>

                      <div className="flex-grow-1 min-w-0">
                        <h6 className="mb-2">
                          <strong>
                            🔐 Refresh Token Setup (One-Time Only)
                          </strong>
                        </h6>

                        <p className="mb-2">
                          <strong>
                            ✅ Generate refresh token once from OAuth
                            Playground.
                          </strong>
                          <br />
                          <strong>🔄 Auto-Renewal:</strong> Once saved, the
                          token automatically renews access in background. No
                          need to regenerate unless manually revoked!
                        </p>

                        <p className="mb-2">
                          <strong>📝 Setup Steps:</strong>
                        </p>

                        <ol className="mb-2 small ps-3">
                          <li className="text-break">
                            Visit:{" "}
                            <a
                              href="https://developers.google.com/oauthplayground"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary text-break"
                            >
                              <strong>Google OAuth Playground</strong>
                            </a>
                          </li>

                          <li className="text-break">
                            Click <strong>Settings (⚙️)</strong> → Enable{" "}
                            <strong>"Use your own OAuth credentials"</strong>
                          </li>

                          <li className="text-break">
                            Enter your <strong>Client ID</strong> and{" "}
                            <strong>Client Secret</strong> (from Google Cloud
                            Console)
                          </li>

                          <li className="text-break">
                            In <strong>Step 1</strong>: Select{" "}
                            <strong>Drive API v3</strong>→
                            <code className="text-break d-block small">
                              https://www.googleapis.com/auth/drive.file
                            </code>
                          </li>

                          <li className="text-break">
                            Click <strong>"Authorize APIs"</strong> → Login with
                            your Google account
                          </li>

                          <li className="text-break">
                            In <strong>Step 2</strong>: Click{" "}
                            <strong>
                              "Exchange authorization code for tokens"
                            </strong>
                          </li>

                          <li className="text-break">
                            Copy the <strong>"Refresh token"</strong> and paste
                            below ⬇️
                          </li>

                          <li className="text-success fw-bold text-break">
                            <i className="fas fa-check-circle me-1"></i>
                            That's it! Token will auto-renew forever (unless
                            manually revoked)
                          </li>
                        </ol>

                        <div className="alert alert-info mb-0 py-2 px-3">
                          <small className="text-break">
                            💡 <strong>Tip:</strong> Save credentials here first
                            with toggle OFF, then enable toggle after setup is
                            complete.
                          </small>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="alert alert-info mb-4">
                    <i className="fas fa-info-circle me-2"></i>
                    <strong>Setup Instructions:</strong>
                    <ol className="mb-0 mt-2 ps-3">
                      <li>
                        Create a project in{" "}
                        <a
                          href="https://console.cloud.google.com"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Google Cloud Console
                        </a>
                      </li>
                      <li>
                        Enable <strong>Google Drive API</strong> for your
                        project
                      </li>
                      <li>
                        Create <strong>OAuth 2.0 Client ID</strong> credentials
                      </li>
                      <li>
                        Get <strong>Refresh Token</strong> using OAuth
                        Playground (see warning above ⬆️)
                      </li>
                      <li>
                        Create a folder in Google Drive and copy its{" "}
                        <strong>Folder ID</strong> from URL
                      </li>
                      <li>
                        Fill all fields below and click{" "}
                        <strong>"Test Connection"</strong>
                      </li>
                      <li>
                        Once validated, click{" "}
                        <strong>"Save Drive Configuration"</strong>
                      </li>
                    </ol>
                  </div>

                  <div className="row g-3">
                    <div className="col-md-6">
                      <label className="form-label fw-bold">
                        <i className="fas fa-key me-2"></i>
                        Google Client ID
                      </label>
                      <input
                        type="text"
                        className="form-control modern-input"
                        value={driveConfig.clientId}
                        onChange={(e) =>
                          setDriveConfig({
                            ...driveConfig,
                            clientId: e.target.value,
                          })
                        }
                        placeholder="Enter Client ID"
                      />
                    </div>

                    <div className="col-md-6">
                      <label className="form-label fw-bold">
                        <i className="fas fa-lock me-2"></i>
                        Google Client Secret
                      </label>
                      <div className="input-group">
                        <input
                          type={
                            showDrivePassword.clientSecret ? "text" : "password"
                          }
                          className="form-control modern-input"
                          value={driveConfig.clientSecret}
                          onChange={(e) =>
                            setDriveConfig({
                              ...driveConfig,
                              clientSecret: e.target.value,
                            })
                          }
                          placeholder="Enter Client Secret"
                        />
                        <button
                          className="btn btn-outline-secondary"
                          type="button"
                          onClick={() =>
                            setShowDrivePassword({
                              ...showDrivePassword,
                              clientSecret: !showDrivePassword.clientSecret,
                            })
                          }
                        >
                          <i
                            className={`fas fa-eye${showDrivePassword.clientSecret ? "-slash" : ""}`}
                          ></i>
                        </button>
                      </div>
                    </div>

                    <div className="col-md-12">
                      <label className="form-label fw-bold">
                        <i className="fas fa-refresh me-2"></i>
                        Refresh Token
                      </label>
                      <div className="input-group">
                        <input
                          type={
                            showDrivePassword.refreshToken ? "text" : "password"
                          }
                          className="form-control modern-input"
                          value={driveConfig.refreshToken}
                          onChange={(e) =>
                            setDriveConfig({
                              ...driveConfig,
                              refreshToken: e.target.value,
                            })
                          }
                          placeholder="Enter Refresh Token"
                        />
                        <button
                          className="btn btn-outline-secondary"
                          type="button"
                          onClick={() =>
                            setShowDrivePassword({
                              ...showDrivePassword,
                              refreshToken: !showDrivePassword.refreshToken,
                            })
                          }
                        >
                          <i
                            className={`fas fa-eye${showDrivePassword.refreshToken ? "-slash" : ""}`}
                          ></i>
                        </button>
                      </div>
                      <small className="text-success">
                        <i className="fas fa-info-circle me-1"></i>
                        <strong>✅ One-Time Setup:</strong> Generate refresh
                        token from{" "}
                        <a
                          href="https://developers.google.com/oauthplayground"
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Google OAuth Playground
                        </a>
                        <br />
                        <i className="fas fa-magic me-1"></i>
                        <strong>Auto-Renewal:</strong> Once saved, this token
                        automatically renews access tokens in background. No
                        need to regenerate unless manually revoked or password
                        changed.
                      </small>
                    </div>

                    <div className="col-md-12">
                      <label className="form-label fw-bold">
                        <i className="fas fa-shield-alt me-2"></i>
                        Backup API Key
                      </label>
                      <div className="input-group">
                        <input
                          type={
                            showDrivePassword.backupApiKey ? "text" : "password"
                          }
                          className="form-control modern-input"
                          value={driveConfig.backupApiKey}
                          onChange={(e) =>
                            setDriveConfig({
                              ...driveConfig,
                              backupApiKey: e.target.value,
                            })
                          }
                          placeholder="Enter Backup API Key"
                        />
                        <button
                          className="btn btn-outline-secondary"
                          type="button"
                          onClick={() =>
                            setShowDrivePassword({
                              ...showDrivePassword,
                              backupApiKey: !showDrivePassword.backupApiKey,
                            })
                          }
                        >
                          <i
                            className={`fas fa-eye${showDrivePassword.backupApiKey ? "-slash" : ""}`}
                          ></i>
                        </button>
                      </div>
                      <small className="text-muted">
                        Create a strong random key:{" "}
                        <code>openssl rand -hex 32</code>
                        or{" "}
                        <code>
                          node -e
                          "console.log(require('crypto').randomBytes(32).toString('hex'))"
                        </code>
                      </small>
                    </div>

                    <div className="col-md-4">
                      <label className="form-label fw-bold">
                        <i className="fas fa-folder me-2"></i>
                        Google Drive Folder ID
                      </label>
                      <input
                        type="text"
                        className="form-control modern-input"
                        value={driveConfig.folderId}
                        onChange={(e) =>
                          setDriveConfig({
                            ...driveConfig,
                            folderId: e.target.value,
                          })
                        }
                        placeholder="Enter Folder ID from Drive URL"
                      />
                      <small className="text-muted">
                        Open folder in Drive, copy ID from URL after /folders/
                      </small>
                    </div>

                    <div className="col-md-4">
                      <label className="form-label fw-bold">
                        <i className="fas fa-calendar-alt me-2"></i>
                        Backup Frequency
                      </label>
                      <select
                        className="form-select modern-input"
                        value={driveConfig.frequency}
                        onChange={(e) =>
                          setDriveConfig({
                            ...driveConfig,
                            frequency: e.target.value,
                          })
                        }
                      >
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                        <option value="every_4_hours">Every 4 Hours</option>
                        <option value="manual">Manual Only</option>
                      </select>
                    </div>

                    <div className="col-md-4">
                      <label className="form-label fw-bold">
                        <i className="fas fa-clock me-2"></i>
                        Backup Time (24-hour format)
                      </label>
                      <input
                        type="time"
                        className="form-control modern-input"
                        value={driveConfig.backupTime}
                        disabled={
                          driveConfig.frequency === "every_4_hours" ||
                          driveConfig.frequency === "manual"
                        }
                        onChange={(e) =>
                          setDriveConfig({
                            ...driveConfig,
                            backupTime: e.target.value,
                          })
                        }
                      />
                      <small className="text-muted">
                        Used for Daily, Weekly, Monthly, and Yearly schedules
                      </small>
                    </div>

                    {driveConfig.frequency === "weekly" && (
                      <div className="col-md-6">
                        <label className="form-label fw-bold">
                          <i className="fas fa-calendar-week me-2"></i>
                          Day of Week
                        </label>
                        <select
                          className="form-select modern-input"
                          value={driveConfig.dayOfWeek}
                          onChange={(e) =>
                            setDriveConfig({
                              ...driveConfig,
                              dayOfWeek: e.target.value,
                            })
                          }
                        >
                          <option value="monday">Monday</option>
                          <option value="tuesday">Tuesday</option>
                          <option value="wednesday">Wednesday</option>
                          <option value="thursday">Thursday</option>
                          <option value="friday">Friday</option>
                          <option value="saturday">Saturday</option>
                          <option value="sunday">Sunday</option>
                        </select>
                      </div>
                    )}

                    {(driveConfig.frequency === "monthly" ||
                      driveConfig.frequency === "yearly") && (
                      <div className="col-md-6">
                        <label className="form-label fw-bold">
                          <i className="fas fa-calendar-day me-2"></i>
                          Day of Month
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="31"
                          className="form-control modern-input"
                          value={driveConfig.dayOfMonth}
                          onChange={(e) =>
                            setDriveConfig({
                              ...driveConfig,
                              dayOfMonth: Math.max(
                                1,
                                Math.min(31, Number(e.target.value) || 1),
                              ),
                            })
                          }
                        />
                      </div>
                    )}

                    {driveConfig.frequency === "yearly" && (
                      <div className="col-md-6">
                        <label className="form-label fw-bold">
                          <i className="fas fa-calendar me-2"></i>
                          Month of Year
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="12"
                          className="form-control modern-input"
                          value={driveConfig.monthOfYear}
                          onChange={(e) =>
                            setDriveConfig({
                              ...driveConfig,
                              monthOfYear: Math.max(
                                1,
                                Math.min(12, Number(e.target.value) || 1),
                              ),
                            })
                          }
                        />
                      </div>
                    )}

                    {driveConfig.frequency === "every_4_hours" && (
                      <div className="col-md-6">
                        <label className="form-label fw-bold">
                          <i className="fas fa-history me-2"></i>
                          Interval (Hours)
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="24"
                          className="form-control modern-input"
                          value={driveConfig.everyHours}
                          onChange={(e) =>
                            setDriveConfig({
                              ...driveConfig,
                              everyHours: Math.max(
                                1,
                                Math.min(24, Number(e.target.value) || 4),
                              ),
                            })
                          }
                        />
                        <small className="text-muted">
                          Set 4 for every 4 hours backups
                        </small>
                      </div>
                    )}
                  </div>

                  <div className="mt-4">
                    <div className="d-flex flex-column flex-md-row gap-2">
                      <button
                        className="btn btn-success btn-lg w-100 w-md-auto d-flex align-items-center justify-content-center gap-2"
                        onClick={handleSaveDriveConfig}
                        disabled={isDriveSaving || !isSuperAdmin}
                      >
                        {isDriveSaving ? (
                          <>
                            <i className="fas fa-spinner fa-spin"></i>
                            Saving...
                          </>
                        ) : (
                          <>
                            <i className="fas fa-save"></i>
                            Save Drive Configuration
                          </>
                        )}
                      </button>

                      <button
                        className="btn btn-primary btn-lg w-100 w-md-auto d-flex align-items-center justify-content-center gap-2"
                        onClick={handleRunBackupNow}
                        disabled={isDriveSaving || !isSuperAdmin}
                      >
                        <i className="fas fa-play"></i>
                        Run Backup Now
                      </button>

                      <button
                        className="btn btn-info btn-lg w-100 w-md-auto d-flex align-items-center justify-content-center gap-2"
                        onClick={handleTestDriveConnection}
                        disabled={isDriveSaving || !isSuperAdmin}
                      >
                        <i className="fas fa-plug"></i>
                        Test Connection
                      </button>
                    </div>
                  </div>

                  {driveConfig.enabled && (
                    <div className="alert alert-info mt-4">
                      <i className="fas fa-info-circle me-2"></i>
                      <strong>📌 Automation Setup Required</strong>
                      <p className="mb-2 mt-2">
                        To activate automatic backups, add these credentials as
                        GitHub Secrets:
                      </p>
                      <ol className="mb-2">
                        <li>
                          Go to:{" "}
                          <strong>
                            Repository → Settings → Secrets and variables →
                            Actions
                          </strong>
                        </li>
                        <li>
                          Click <strong>"New repository secret"</strong>
                        </li>
                        <li>
                          Add these 7 secrets (one by one):
                          <ul className="mt-2">
                            <li>
                              <code>GOOGLE_CLIENT_ID</code>
                            </li>
                            <li>
                              <code>GOOGLE_CLIENT_SECRET</code>
                            </li>
                            <li>
                              <code>GOOGLE_REFRESH_TOKEN</code>
                            </li>
                            <li>
                              <code>GOOGLE_DRIVE_FOLDER_ID</code>
                            </li>
                            <li>
                              <code>BACKUP_API_KEY</code>
                            </li>
                            <li>
                              <code>NETLIFY_API_URL</code>
                            </li>
                            <li>
                              <code>MONGODB_URI</code>
                            </li>
                          </ul>
                        </li>
                        <li>
                          After saving here, check{" "}
                          <strong>browser console</strong>
                          (F12) for exact values to copy
                        </li>
                      </ol>
                      <div className="mt-2">
                        <strong>Current Schedule:</strong>{" "}
                        {driveConfig.frequency.charAt(0).toUpperCase() +
                          driveConfig.frequency.slice(1).replace("_", " ")}{" "}
                        at {driveConfig.backupTime} IST
                      </div>
                      <div className="mt-2">
                        <a
                          href="https://github.com/yourusername/yourrepo/settings/secrets/actions"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-sm btn-outline-primary me-2"
                        >
                          <i className="fab fa-github me-1"></i>
                          Open GitHub Secrets
                        </a>
                        <a
                          href="https://developers.google.com/oauthplayground"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-sm btn-outline-info"
                        >
                          <i className="fab fa-google me-1"></i>
                          OAuth Playground (Get Refresh Token)
                        </a>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BackupTab;
