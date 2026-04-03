import React, { ReactNode, useEffect, useMemo, useState } from "react";

type ConfirmationModalProps = {
  show: boolean;
  onHide: () => void;
  onConfirm: () => void;
  title?: string;
  message?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: string;
  confirmationText?: string | null;
  confirmationLabel?: string;
};

const ConfirmationModal = ({
  show,
  onHide,
  onConfirm,
  title = "Confirm Action",
  message = "Are you sure you want to perform this action?",
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "danger", // bootstrap variant (danger, warning, primary, etc.)
  confirmationText = null,
  confirmationLabel = "Type DELETE to confirm",
}: ConfirmationModalProps) => {
  const [typedText, setTypedText] = useState("");

  const requiredConfirmationText = useMemo(() => {
    if (typeof confirmationText === "string") {
      const normalized = confirmationText.trim().toLowerCase();
      return normalized || null;
    }

    const normalizedConfirmText = String(confirmText || "")
      .trim()
      .toLowerCase();
    if (normalizedConfirmText === "delete") {
      return "delete";
    }

    const normalizedTitle = String(title || "")
      .trim()
      .toLowerCase();
    if (
      normalizedTitle.includes("delete") ||
      normalizedTitle.includes("deletion")
    ) {
      return "delete";
    }

    return null;
  }, [confirmationText, confirmText, title]);

  const canConfirm =
    !requiredConfirmationText ||
    typedText.trim().toLowerCase() === requiredConfirmationText;

  useEffect(() => {
    if (!show) {
      setTypedText("");
    }
  }, [show]);

  if (!show) return null;

  const isSimpleMessage =
    typeof message === "string" || typeof message === "number";

  return (
    <>
      <div className="modal-backdrop fade show" style={{ zIndex: 1050 }}></div>
      <div
        className="modal fade show"
        style={{ display: "block", zIndex: 1051 }}
        tabIndex={-1}
      >
        <div className="modal-dialog modal-dialog-centered">
          <div className="modal-content">
            <div className={`modal-header bg-${variant} text-white`}>
              <h5 className="modal-title">{title}</h5>
              <button
                type="button"
                className="btn-close btn-close-white"
                onClick={onHide}
              ></button>
            </div>
            <div className="modal-body">
              {isSimpleMessage ? (
                <p className="mb-0">{message as ReactNode}</p>
              ) : (
                <div>{message as ReactNode}</div>
              )}
              {requiredConfirmationText && (
                <div className="mt-3">
                  <label className="form-label fw-semibold">
                    {confirmationLabel}
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    autoComplete="off"
                    value={typedText}
                    onChange={(e) => setTypedText(e.target.value)}
                    placeholder={requiredConfirmationText.toUpperCase()}
                  />
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onHide}
              >
                {cancelText}
              </button>
              <button
                type="button"
                className={`btn btn-${variant}`}
                disabled={!canConfirm}
                onClick={() => {
                  onConfirm();
                  onHide();
                }}
              >
                {confirmText}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ConfirmationModal;
