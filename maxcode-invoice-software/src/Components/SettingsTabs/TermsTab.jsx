import React from "react";
import ConfirmationModal from "../ConfirmationModal";

const TermsTab = ({
  isSaving,
  isBusinessLoading,
  isSuperAdmin,
  setShowResetTermsConfirm,
  handleSaveAll,
  businessSettings,
  handleBusinessChange,
  showResetTermsConfirm,
  handleResetTermsToDefault,
}) => {
  return (
    <div className="business-details-container">
      <div className="card modern-card mb-4">
        <div className="card-body">
          <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center gap-3">
            <div>
              <h5 className="mb-1 fw-bold">Terms & Conditions</h5>
              <p className="text-muted mb-0">
                Manage default terms and conditions for invoice previews
              </p>
            </div>

            <div className="d-flex flex-column flex-sm-row gap-2 settings-action-group">
              <button
                onClick={() => setShowResetTermsConfirm(true)}
                disabled={isSaving || isBusinessLoading || !isSuperAdmin}
                className="btn btn-outline-secondary px-4 py-2 fw-bold settings-responsive-btn"
              >
                <i className="fas fa-rotate-left me-2"></i>
                Reset to Default
              </button>

              <button
                onClick={handleSaveAll}
                disabled={isSaving || isBusinessLoading || !isSuperAdmin}
                className="btn btn-success px-4 py-2 fw-bold settings-responsive-btn d-flex align-items-center justify-content-center gap-2"
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
                    Save Terms
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="row g-4">
        <div className="col-lg-6">
          <div className="card border-0 shadow-sm rounded-4 p-4 bg-white h-100">
            <h5
              className="fw-bold mb-3 pb-2 border-bottom"
              style={{ color: "#198754" }}
            >
              <i className="fas fa-file-invoice me-2"></i>
              Invoice Terms
            </h5>
            <p className="text-muted small mb-2">
              Each line will be treated as a separate point.
            </p>
            <textarea
              className="form-control modern-input"
              rows={14}
              value={businessSettings.invoiceTermsConditions || ""}
              onChange={(e) =>
                handleBusinessChange("invoiceTermsConditions", e.target.value)
              }
              placeholder="Invoice terms yahan likhein (one line per term)"
              disabled={!isSuperAdmin}
            />
          </div>
        </div>

        <div className="col-lg-6">
          <div className="card border-0 shadow-sm rounded-4 p-4 bg-white h-100">
            <h5
              className="fw-bold mb-3 pb-2 border-bottom"
              style={{ color: "#198754" }}
            >
              <i className="fas fa-file-invoice-dollar me-2"></i>
              Self Invoice Terms
            </h5>
            <p className="text-muted small mb-2">
              Each line will be treated as a separate point.
            </p>
            <textarea
              className="form-control modern-input"
              rows={14}
              value={businessSettings.selfInvoiceTermsConditions || ""}
              onChange={(e) =>
                handleBusinessChange(
                  "selfInvoiceTermsConditions",
                  e.target.value,
                )
              }
              placeholder="Self invoice terms yahan likhein (one line per term)"
              disabled={!isSuperAdmin}
            />
          </div>
        </div>
      </div>

      <ConfirmationModal
        show={showResetTermsConfirm}
        onHide={() => setShowResetTermsConfirm(false)}
        onConfirm={handleResetTermsToDefault}
        title="Reset Terms to Default?"
        message="Invoice Terms and Self Invoice Terms will both be reset to their default values."
        confirmText="Yes, Reset"
        cancelText="Cancel"
        variant="warning"
      />
    </div>
  );
};

export default TermsTab;
