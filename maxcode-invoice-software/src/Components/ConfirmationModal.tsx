import React, { ReactNode } from "react";

const ConfirmationModal = ({
  show,
  onHide,
  onConfirm,
  title = "Confirm Action",
  message = "Are you sure you want to perform this action?",
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "danger", // bootstrap variant (danger, warning, primary, etc.)
}) => {
  if (!show) return null;

  return (
    <>
      <div className="modal-backdrop fade show" style={{ zIndex: 1050 }}></div>
      <div
        className="modal fade show"
        style={{ display: "block", zIndex: 1051 }}
        tabIndex="-1"
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
              <p>{message as ReactNode}</p>
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
