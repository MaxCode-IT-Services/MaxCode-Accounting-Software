import React, { useEffect, useMemo, useState } from "react";
import { showSuccess, showError } from "./ToastNotification";
import { apiPost, apiPut } from "../utils/api";
import API_ENDPOINTS from "../utils/apiEndpoints";
import {
  CRUD_ACTIONS,
  PERMISSION_MODULES,
  createDefaultPermissions,
} from "../utils/permissions";

const normalizeRoleValue = (role = "") => {
  const normalized = String(role || "")
    .trim()
    .toLowerCase();
  if (!normalized) return "";
  if (normalized === "master admin" || normalized === "masteradmin") {
    return "Super Admin";
  }
  if (normalized === "super admin" || normalized === "superadmin") {
    return "Super Admin";
  }
  if (normalized === "admin") {
    return "Admin";
  }
  if (normalized === "team") {
    return "Team";
  }
  return role;
};

const CreateTeamMember = ({
  show,
  onClose,
  onSubmit,
  editingRecord = null,
}) => {
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    role: "",
    jwtTokenExpiryDays: "",
    pin: "",
    sendEmail: true,
    status: "Active",
  });
  const [permissions, setPermissions] = useState(createDefaultPermissions());
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [showPin, setShowPin] = useState(false);

  const isViewMode = editingRecord?.isViewMode === true;

  useEffect(() => {
    if (show) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }

    return () => {
      document.body.style.overflow = "auto";
    };
  }, [show]);

  useEffect(() => {
    if (editingRecord) {
      setFormData({
        name: editingRecord.name || "",
        phone: editingRecord.phone || editingRecord.phoneNumber || "",
        email: editingRecord.email || "",
        address: editingRecord.address || "",
        role: normalizeRoleValue(editingRecord.role),
        jwtTokenExpiryDays:
          editingRecord.jwtTokenExpiryDays?.toString?.() || "",
        pin: "",
        sendEmail: editingRecord.sendEmail === true,
        status: editingRecord.status === "Inactive" ? "Inactive" : "Active",
      });

      const nextPermissions = createDefaultPermissions();
      if (
        editingRecord.permissions &&
        typeof editingRecord.permissions === "object"
      ) {
        Object.keys(nextPermissions).forEach((moduleKey) => {
          if (!editingRecord.permissions[moduleKey]) return;

          nextPermissions[moduleKey] = {
            ...nextPermissions[moduleKey],
            ...editingRecord.permissions[moduleKey],
          };
        });
      }

      setPermissions(nextPermissions);
    } else {
      setFormData({
        name: "",
        phone: "",
        email: "",
        address: "",
        role: "",
        jwtTokenExpiryDays: "",
        pin: "",
        sendEmail: true,
        status: "Active",
      });
      setPermissions(createDefaultPermissions());
      setErrors({});
    }
  }, [editingRecord, show]);

  const detailedModules = useMemo(
    () => PERMISSION_MODULES.filter((module) => module.detailed),
    [],
  );

  const tableRows = useMemo(() => {
    const rows = [];
    for (const module of detailedModules) {
      const modulePermissions = permissions[module.key];
      if (!modulePermissions?.active || !modulePermissions?.pages) continue;

      Object.entries(modulePermissions.pages).forEach(
        ([pageName, pagePermissions]) => {
          rows.push({ module, pageName, pagePermissions });
        },
      );
    }
    return rows;
  }, [permissions, detailedModules]);

  const handleInputChange = (event) => {
    const { name, value, type, checked } = event.target;

    if (name === "phone") {
      setFormData((prev) => ({
        ...prev,
        phone: value.replace(/\D/g, "").slice(0, 10),
      }));
    } else if (name === "pin") {
      setFormData((prev) => ({
        ...prev,
        pin: value.replace(/\D/g, "").slice(0, 6),
      }));
    } else if (name === "jwtTokenExpiryDays") {
      setFormData((prev) => ({
        ...prev,
        jwtTokenExpiryDays: value.replace(/\D/g, "").slice(0, 3),
      }));
    } else if (type === "checkbox") {
      setFormData((prev) => ({ ...prev, [name]: checked }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const toggleModule = (moduleKey) => {
    setPermissions((prev) => ({
      ...prev,
      [moduleKey]: {
        ...prev[moduleKey],
        active: !prev[moduleKey].active,
      },
    }));
  };

  const togglePermission = (moduleKey, pageName, action, checked) => {
    setPermissions((prev) => ({
      ...prev,
      [moduleKey]: {
        ...prev[moduleKey],
        pages: {
          ...prev[moduleKey].pages,
          [pageName]: {
            ...prev[moduleKey].pages[pageName],
            [action]: checked,
          },
        },
      },
    }));
  };

  const handleSelectAllTable = (checked) => {
    setPermissions((prev) => {
      const next = { ...prev };

      detailedModules.forEach((module) => {
        const moduleData = next[module.key];
        if (!moduleData?.active || !moduleData?.pages) return;

        const updatedPages = { ...moduleData.pages };
        Object.keys(updatedPages).forEach((pageName) => {
          const updatedRow = { ...updatedPages[pageName] };
          CRUD_ACTIONS.forEach((action) => {
            updatedRow[action] = checked;
          });
          updatedPages[pageName] = updatedRow;
        });

        next[module.key] = {
          ...moduleData,
          pages: updatedPages,
        };
      });

      return next;
    });
  };

  const areAllTablePermissionsSelected = () => {
    if (tableRows.length === 0) return false;
    return tableRows.every((row) =>
      CRUD_ACTIONS.every((action) => row.pagePermissions[action] === true),
    );
  };

  const validateForm = () => {
    const nextErrors = {};
    const requiredFields = [
      "name",
      "phone",
      "email",
      "address",
      "role",
      "jwtTokenExpiryDays",
    ];

    if (!editingRecord) {
      requiredFields.push("pin");
    }

    requiredFields.forEach((field) => {
      if (!formData[field] || formData[field].toString().trim() === "") {
        nextErrors[field] = `${field} is required`;
      }
    });

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      nextErrors.email = "Please enter a valid email address";
    }

    if (formData.phone && !/^\d{10}$/.test(formData.phone)) {
      nextErrors.phone = "Phone number must be exactly 10 digits";
    }

    if (formData.pin && !/^\d{6}$/.test(formData.pin)) {
      nextErrors.pin = "PIN must be exactly 6 digits";
    }

    if (
      formData.jwtTokenExpiryDays &&
      !/^(?:[1-9]\d?|[1-2]\d\d|3[0-5]\d|36[0-5])$/.test(
        formData.jwtTokenExpiryDays,
      )
    ) {
      nextErrors.jwtTokenExpiryDays =
        "JWT Token Expiry Days must be between 1 and 365";
    }

    const activeModules = Object.values(permissions).filter(
      (module) => module.active,
    );
    if (activeModules.length === 0) {
      nextErrors.permissions = "Please enable at least one module";
    }

    for (const module of detailedModules) {
      const moduleData = permissions[module.key];
      if (!moduleData?.active || !moduleData.pages) continue;

      const hasAnyPermission = Object.values(moduleData.pages).some(
        (pagePermissions) =>
          CRUD_ACTIONS.some((action) => pagePermissions[action] === true),
      );

      if (!hasAnyPermission) {
        nextErrors.permissions = `Please select at least one detailed permission for ${module.label}`;
        break;
      }
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      showError(
        nextErrors.permissions || "Please fill required fields correctly",
      );
      return false;
    }

    return true;
  };

  const generatePin = () => {
    const generatedPin = Math.floor(100000 + Math.random() * 900000).toString();
    setFormData((prev) => ({ ...prev, pin: generatedPin }));
    showSuccess("PIN generated successfully");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (isViewMode || !validateForm()) return;

    setSubmitting(true);
    try {
      const payload = {
        ...formData,
        role: normalizeRoleValue(formData.role),
        permissions,
      };

      if (editingRecord && !editingRecord.isViewMode) {
        const teamMemberId = editingRecord._id || editingRecord.id;
        const dataToUpdate = { ...payload };

        if (!dataToUpdate.pin) {
          delete dataToUpdate.pin;
        }

        await apiPut(
          API_ENDPOINTS.TEAM_MEMBERS.UPDATE(teamMemberId),
          dataToUpdate,
        );
        showSuccess("Team user updated successfully");
      } else {
        await apiPost(API_ENDPOINTS.TEAM_MEMBERS.CREATE, payload);
        showSuccess("Team user created successfully");
      }

      onSubmit(payload);
    } catch (error) {
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to save team user",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!show) return null;

  const modalTitle = editingRecord
    ? isViewMode
      ? `View Team User - ${editingRecord.name}`
      : `Edit Team User - ${editingRecord.name}`
    : "Add Team User";

  return (
    <div
      className={`modal ${show ? "show d-block" : "d-none"}`}
      tabIndex="-1"
      role="dialog"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <div className="modal-dialog modal-fullscreen" role="document">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{modalTitle}</h5>
            <button
              type="button"
              className="btn-close"
              onClick={onClose}
            ></button>
          </div>

          <div className="modal-body">
            <form id="teamUserForm" onSubmit={handleSubmit} noValidate>
              <div className="card modern-card mb-4">
                <div className="card-body">
                  <h5 className="mb-3">
                    <i className="fas fa-id-card me-2 text-primary"></i>
                    Basic Information
                  </h5>
                  <div className="row">
                    <div className="col-xl-4 col-lg-4 col-md-6 mb-3">
                      <label htmlFor="name" className="form-label fw-semibold">
                        Full Name <span className="text-danger">*</span>
                      </label>
                      <input
                        id="name"
                        name="name"
                        type="text"
                        className={`form-control modern-input ${errors.name ? "is-invalid" : ""}`}
                        value={formData.name}
                        onChange={handleInputChange}
                        readOnly={isViewMode}
                        placeholder="Enter full name"
                      />
                      {errors.name && (
                        <div className="invalid-feedback">{errors.name}</div>
                      )}
                    </div>

                    <div className="col-xl-4 col-lg-4 col-md-6 mb-3">
                      <label htmlFor="phone" className="form-label fw-semibold">
                        Phone <span className="text-danger">*</span>
                      </label>
                      <div className="input-group">
                        <span
                          className="input-group-text"
                          style={{
                            background:
                              "linear-gradient(135deg, #ff9933, #ffffff, #138808)",
                            border: "2px solid #e9ecef",
                            borderRight: "none",
                            borderRadius: "10px 0 0 10px",
                            fontWeight: 600,
                            color: "#333",
                          }}
                        >
                          <img
                            src="https://flagcdn.com/w40/in.png"
                            alt="India"
                            style={{
                              width: "20px",
                              height: "15px",
                              marginRight: "8px",
                              borderRadius: "2px",
                            }}
                          />
                          +91
                        </span>
                        <input
                          id="phone"
                          name="phone"
                          type="tel"
                          className={`form-control modern-input ${errors.phone ? "is-invalid" : ""}`}
                          value={formData.phone}
                          onChange={handleInputChange}
                          maxLength="10"
                          readOnly={isViewMode}
                          placeholder="10-digit mobile number"
                        />
                      </div>
                      {errors.phone && (
                        <div className="invalid-feedback d-block">
                          {errors.phone}
                        </div>
                      )}
                    </div>

                    <div className="col-xl-4 col-lg-4 col-md-6 mb-3">
                      <label htmlFor="email" className="form-label fw-semibold">
                        Email <span className="text-danger">*</span>
                      </label>
                      <input
                        id="email"
                        name="email"
                        type="email"
                        className={`form-control modern-input ${errors.email ? "is-invalid" : ""}`}
                        value={formData.email}
                        onChange={handleInputChange}
                        readOnly={isViewMode}
                        placeholder="Enter email"
                      />
                      {errors.email && (
                        <div className="invalid-feedback">{errors.email}</div>
                      )}
                    </div>

                    <div className="col-xl-4 col-lg-4 col-md-6 mb-3">
                      <label
                        htmlFor="address"
                        className="form-label fw-semibold"
                      >
                        Address <span className="text-danger">*</span>
                      </label>
                      <input
                        id="address"
                        name="address"
                        type="text"
                        className={`form-control modern-input ${errors.address ? "is-invalid" : ""}`}
                        value={formData.address}
                        onChange={handleInputChange}
                        readOnly={isViewMode}
                        placeholder="Enter address"
                      />
                      {errors.address && (
                        <div className="invalid-feedback">{errors.address}</div>
                      )}
                    </div>

                    <div className="col-xl-2 col-lg-3 col-md-6 mb-3">
                      <label htmlFor="role" className="form-label fw-semibold">
                        Role <span className="text-danger">*</span>
                      </label>
                      <select
                        id="role"
                        name="role"
                        className={`form-select modern-input ${errors.role ? "is-invalid" : ""}`}
                        value={formData.role}
                        onChange={handleInputChange}
                        disabled={isViewMode}
                      >
                        <option value="">Select Role</option>
                        <option value="Team">Team</option>
                        <option value="Admin">Admin</option>
                        <option value="Super Admin">Super Admin</option>
                      </select>
                      {errors.role && (
                        <div className="invalid-feedback">{errors.role}</div>
                      )}
                    </div>

                    <div className="col-xl-2 col-lg-4 col-md-6 mb-3">
                      <label
                        htmlFor="jwtTokenExpiryDays"
                        className="form-label fw-semibold"
                      >
                        JWT Token Expiry Days
                        <span className="text-danger"> *</span>
                      </label>
                      <input
                        id="jwtTokenExpiryDays"
                        name="jwtTokenExpiryDays"
                        type="text"
                        inputMode="numeric"
                        className={`form-control modern-input ${errors.jwtTokenExpiryDays ? "is-invalid" : ""}`}
                        value={formData.jwtTokenExpiryDays}
                        onChange={handleInputChange}
                        readOnly={isViewMode}
                        placeholder="1 to 365"
                      />
                      {errors.jwtTokenExpiryDays && (
                        <div className="invalid-feedback d-block">
                          {errors.jwtTokenExpiryDays}
                        </div>
                      )}
                    </div>

                    <div className="col-xl-3 col-lg-4 col-md-6 mb-3">
                      <label htmlFor="pin" className="form-label fw-semibold">
                        PIN{" "}
                        {!editingRecord && (
                          <span className="text-danger">*</span>
                        )}
                      </label>
                      <div className="input-group">
                        <input
                          id="pin"
                          name="pin"
                          type={showPin ? "text" : "password"}
                          className={`form-control modern-input ${errors.pin ? "is-invalid" : ""}`}
                          value={formData.pin}
                          onChange={handleInputChange}
                          readOnly={isViewMode}
                          maxLength="6"
                          placeholder="6-digit PIN"
                        />
                        {!isViewMode && (
                          <>
                            <button
                              type="button"
                              className="btn btn-outline-secondary"
                              onClick={() => setShowPin((prev) => !prev)}
                            >
                              <i
                                className={`fas ${showPin ? "fa-eye-slash" : "fa-eye"}`}
                              ></i>
                            </button>
                            <button
                              type="button"
                              className="btn btn-success"
                              onClick={generatePin}
                            >
                              Auto
                            </button>
                          </>
                        )}
                      </div>
                      {errors.pin && (
                        <div className="invalid-feedback d-block">
                          {errors.pin}
                        </div>
                      )}
                    </div>

                    <div className="col-xl-1 col-lg-4 col-md-6 mb-3">
                      <label className="form-label fw-semibold d-block">
                        Status
                      </label>
                      <div className="form-check form-switch mt-2">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id="statusToggle"
                          checked={formData.status === "Active"}
                          onChange={(event) =>
                            setFormData((prev) => ({
                              ...prev,
                              status: event.target.checked
                                ? "Active"
                                : "Inactive",
                            }))
                          }
                          disabled={isViewMode}
                        />
                        <label
                          className="form-check-label"
                          htmlFor="statusToggle"
                        >
                          {formData.status}
                        </label>
                      </div>
                    </div>

                    {!isViewMode && (
                      <div className="col-12">
                        <div className="form-check form-switch">
                          <input
                            className="form-check-input"
                            type="checkbox"
                            id="sendEmail"
                            name="sendEmail"
                            checked={formData.sendEmail}
                            onChange={handleInputChange}
                          />
                          <label
                            className="form-check-label fw-semibold"
                            htmlFor="sendEmail"
                          >
                            Send login credentials on email
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="card modern-card">
                <div className="card-body">
                  <h5 className="mb-2">
                    <i className="fas fa-shield-alt me-2 text-primary"></i>
                    Permissions
                  </h5>
                  <small className="text-muted d-block mb-3">
                    Dashboard toggle gives direct menu access. For other active
                    modules, assign detailed permissions below.
                  </small>

                  <div className="row">
                    {PERMISSION_MODULES.map((module) => (
                      <div
                        key={module.key}
                        className="col-xl-2 col-lg-3 col-md-4 col-sm-6 mb-3"
                      >
                        <div
                          className="card h-90"
                          style={{
                            border:
                              permissions[module.key]?.active === true
                                ? "2px solid #198754"
                                : "2px solid #f8f9fa",
                            backgroundColor:
                              permissions[module.key]?.active === true
                                ? "rgba(25, 135, 84, 0.08)"
                                : "#ffffff",
                            transition: "all 0.25s ease",
                          }}
                        >
                          <div className="card-body text-center p-3">
                            <div className="form-check form-switch d-flex justify-content-center mb-2">
                              <input
                                className="form-check-input"
                                type="checkbox"
                                checked={
                                  permissions[module.key]?.active === true
                                }
                                onChange={() =>
                                  !isViewMode && toggleModule(module.key)
                                }
                                disabled={isViewMode}
                              />
                            </div>
                            <i
                              className={`${module.icon} fs-4 text-primary mb-2`}
                            ></i>
                            <h5 className="mb-0 fs-6">{module.label}</h5>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {errors.permissions && (
                    <div className="alert alert-danger py-2 mt-1 mb-3">
                      {errors.permissions}
                    </div>
                  )}

                  {tableRows.length > 0 && (
                    <div className="table-responsive mt-3">
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <h6 className="mb-0">
                          <i className="fas fa-table me-2 text-primary"></i>
                          Detailed Permissions
                        </h6>
                        <div className="form-check">
                          <input
                            className="form-check-input"
                            type="checkbox"
                            id="selectAllDetailed"
                            checked={areAllTablePermissionsSelected()}
                            onChange={(event) =>
                              handleSelectAllTable(event.target.checked)
                            }
                            disabled={isViewMode}
                          />
                          <label
                            className="form-check-label"
                            htmlFor="selectAllDetailed"
                          >
                            Select All
                          </label>
                        </div>
                      </div>

                      <table className="table table-bordered align-middle mb-0">
                        <thead className="table-light">
                          <tr>
                            <th>Module</th>
                            <th>Page</th>
                            <th className="text-center">Create</th>
                            <th className="text-center">Read</th>
                            <th className="text-center">Update</th>
                            <th className="text-center">Delete</th>
                            <th className="text-center">Export</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tableRows.map((row) => (
                            <tr key={`${row.module.key}-${row.pageName}`}>
                              <td>{row.module.label}</td>
                              <td>{row.pageName}</td>
                              {CRUD_ACTIONS.map((action) => (
                                <td key={action} className="text-center">
                                  <input
                                    type="checkbox"
                                    checked={
                                      row.pagePermissions[action] === true
                                    }
                                    onChange={(event) =>
                                      togglePermission(
                                        row.module.key,
                                        row.pageName,
                                        action,
                                        event.target.checked,
                                      )
                                    }
                                    disabled={isViewMode}
                                  />
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </form>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
            >
              {isViewMode ? "Close" : "Cancel"}
            </button>
            {!isViewMode && (
              <button
                type="submit"
                form="teamUserForm"
                className="btn btn-success"
                disabled={submitting}
              >
                {submitting
                  ? "Saving..."
                  : editingRecord
                    ? "Update"
                    : "Create User"}
              </button>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .modern-card {
          border: none;
          border-radius: 16px;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
          background: rgba(255, 255, 255, 0.95);
          overflow: hidden;
        }

        .modern-card .card-body {
          padding: 1.5rem;
        }

        .modern-input {
          border: 2px solid #e9ecef;
          border-radius: 10px;
          padding: 12px 15px;
          transition: all 0.3s ease;
          background: white;
        }

        .modern-input:focus {
          border-color: var(--counter-color);
          box-shadow: 0 0 0 0.2rem rgba(102, 126, 234, 0.25);
        }

        .modern-input:disabled,
        .modern-input[readonly] {
          background-color: #f8f9fa;
          border-color: #dee2e6;
          color: #6c757d;
        }
      `}</style>
    </div>
  );
};

export default CreateTeamMember;
