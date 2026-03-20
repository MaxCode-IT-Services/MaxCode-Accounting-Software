import React from "react";

const PinTab = ({
  handlePinSubmit,
  showPassword,
  pinData,
  handlePinChange,
  togglePasswordVisibility,
  loading,
  handlePinCancel,
}) => {
  return (
    <div className="card modern-card">
      <div className="card-body">
        <h5 className="card-title mb-4">
          <i className="fas fa-key me-2 text-primary"></i>
          Change Your PIN
        </h5>
        <form onSubmit={handlePinSubmit}>
          <div className="row">
            <div className="col-xl-4 col-lg-4 col-md-6 mb-3">
              <label htmlFor="oldPin" className="form-label">
                Old PIN
              </label>
              <div className="input-group">
                <input
                  type={showPassword.oldPin ? "text" : "password"}
                  className="form-control modern-input"
                  id="oldPin"
                  name="oldPin"
                  value={pinData.oldPin}
                  onChange={handlePinChange}
                  placeholder="Enter old PIN"
                  minLength="6"
                  maxLength="6"
                />
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => togglePasswordVisibility("oldPin")}
                >
                  <i
                    className={`fas ${showPassword.oldPin ? "fa-eye-slash" : "fa-eye"}`}
                  ></i>
                </button>
              </div>
            </div>

            <div className="col-xl-4 col-lg-4 col-md-6 mb-3">
              <label htmlFor="newPin" className="form-label">
                New PIN
              </label>
              <div className="input-group">
                <input
                  type={showPassword.newPin ? "text" : "password"}
                  className="form-control modern-input"
                  id="newPin"
                  name="newPin"
                  value={pinData.newPin}
                  onChange={handlePinChange}
                  placeholder="Enter new PIN"
                  minLength="6"
                  maxLength="6"
                />
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => togglePasswordVisibility("newPin")}
                >
                  <i
                    className={`fas ${showPassword.newPin ? "fa-eye-slash" : "fa-eye"}`}
                  ></i>
                </button>
              </div>
            </div>

            <div className="col-xl-4 col-lg-4 col-md-12 mb-4">
              <label htmlFor="confirmPin" className="form-label">
                Confirm PIN
              </label>
              <div className="input-group">
                <input
                  type={showPassword.confirmPin ? "text" : "password"}
                  className="form-control modern-input"
                  id="confirmPin"
                  name="confirmPin"
                  value={pinData.confirmPin}
                  onChange={handlePinChange}
                  placeholder="Confirm new PIN"
                  minLength="6"
                  maxLength="6"
                />
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => togglePasswordVisibility("confirmPin")}
                >
                  <i
                    className={`fas ${showPassword.confirmPin ? "fa-eye-slash" : "fa-eye"}`}
                  ></i>
                </button>
              </div>
            </div>
          </div>

          <div className="row">
            <div className="col-xl-6 col-lg-6 col-md-6 mb-2">
              <button
                type="submit"
                className="btn btn-primary w-100 btn-update"
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span
                      className="spinner-border spinner-border-sm me-2"
                      role="status"
                      aria-hidden="true"
                    ></span>
                    Updating...
                  </>
                ) : (
                  <>
                    <i className="fas fa-sync-alt me-2"></i>
                    Update PIN
                  </>
                )}
              </button>
            </div>
            <div className="col-xl-6 col-lg-6 col-md-6 mb-2">
              <button
                type="button"
                className="btn btn-outline-secondary w-100"
                onClick={handlePinCancel}
                disabled={loading}
              >
                <i className="fas fa-times me-2"></i>
                Cancel
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PinTab;
