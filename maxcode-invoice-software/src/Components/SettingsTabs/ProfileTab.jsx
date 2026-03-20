import React from "react";

const ProfileTab = ({
  isEditing,
  setIsEditing,
  handleProfileSubmit,
  handleCancel,
  loading,
  formData,
  handleInputChange,
}) => {
  return (
    <div className="card modern-card">
      <div className="card-body">
        <div className="row mb-4">
          <div className="col-12">
            <div className="d-flex justify-content-between align-items-center">
              <h5 className="mb-0">Profile Information</h5>
              {!isEditing ? (
                <button
                  className="btn btn-primary btn-edit"
                  onClick={() => setIsEditing(true)}
                >
                  <i className="fas fa-edit me-2"></i>
                  Edit Profile
                </button>
              ) : (
                <div className="d-flex gap-2">
                  <button
                    className="btn btn-success"
                    onClick={handleProfileSubmit}
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <span
                          className="spinner-border spinner-border-sm me-1"
                          role="status"
                          aria-hidden="true"
                        ></span>
                        Updating...
                      </>
                    ) : (
                      <>
                        <i className="fas fa-check me-1"></i>
                        Update Profile
                      </>
                    )}
                  </button>
                  <button
                    className="btn btn-outline-secondary"
                    onClick={handleCancel}
                    disabled={loading}
                  >
                    <i className="fas fa-times me-1"></i>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="row">
          <div className="col-xl-12 col-lg-12 col-md-12">
            <form onSubmit={handleProfileSubmit}>
              <div className="row">
                <div className="col-md-6 mb-3">
                  <label htmlFor="name" className="form-label">
                    <i className="fas fa-user me-2 text-primary"></i>
                    Full Name
                  </label>
                  <input
                    type="text"
                    className="form-control modern-input"
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    disabled={!isEditing}
                  />
                </div>

                <div className="col-md-6 mb-3">
                  <label htmlFor="email" className="form-label">
                    <i className="fas fa-envelope me-2 text-primary"></i>
                    Email Address
                  </label>
                  <input
                    type="email"
                    className="form-control modern-input"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    disabled={!isEditing}
                  />
                </div>

                <div className="col-md-6 mb-3">
                  <label htmlFor="phone" className="form-label">
                    <i className="fas fa-phone me-2 text-primary"></i>
                    Phone Number
                    {formData.phone.length !== 10 && isEditing && (
                      <small className="text-danger ms-2">
                        {10 - formData.phone.length} digits remaining
                      </small>
                    )}
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
                      className="form-control modern-input"
                      id="phone"
                      name="phone"
                      value={formData.phone}
                      onChange={handleInputChange}
                      disabled={!isEditing}
                      maxLength="10"
                      placeholder="10-digit mobile number"
                    />
                  </div>
                  {formData.phone.length !== 10 && isEditing && (
                    <div className="text-danger small mt-1">
                      Please enter exactly 10 digits
                    </div>
                  )}
                </div>

                <div className="col-md-6 mb-3">
                  <label htmlFor="role" className="form-label">
                    <i className="fas fa-briefcase me-2 text-primary"></i>
                    Role
                  </label>
                  <input
                    type="text"
                    className="form-control modern-input"
                    id="role"
                    name="role"
                    value={formData.role}
                    disabled={true}
                  />
                </div>

                <div className="col-12 mb-3">
                  <label htmlFor="address" className="form-label">
                    <i className="fas fa-map-marker-alt me-2 text-primary"></i>
                    Address
                  </label>
                  <input
                    type="text"
                    className="form-control modern-input"
                    id="address"
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    disabled={!isEditing}
                    placeholder="Enter your address"
                  />
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileTab;
