// Login.jsx
import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost, markSessionAuthenticated } from "../utils/api";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { PERMISSION_MODULES } from "../utils/permissions";
import {
  showSuccess,
  showError,
  showInfo,
} from "../Components/ToastNotification";

const Login = ({ settings }) => {
  const navigate = useNavigate();
  const [mobile, setMobile] = useState("");
  const [pin, setPin] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState(null);
  const [errors, setErrors] = useState({});

  // Two-Factor Authentication state
  const [needs2FA, setNeeds2FA] = useState(false);
  const [tempToken, setTempToken] = useState(null);
  const [twoFACode, setTwoFACode] = useState(["", "", "", "", "", ""]);
  const [isVerifying2FA, setIsVerifying2FA] = useState(false);

  const pinRefs = useRef([]);
  const twoFACodeRefs = useRef([]);

  // Remove auto-focus completely - user must click to focus
  useEffect(() => {
    // Intentionally empty - no auto-focus on any field
  }, []);

  const handlePinChange = (index, value) => {
    if (value.length > 1) value = value[value.length - 1];
    if (!/^\d?$/.test(value)) return;

    const newPin = [...pin];
    newPin[index] = value;
    setPin(newPin);

    // Clear error if exists
    if (errors.pin) {
      setErrors((prev) => ({ ...prev, pin: null }));
    }

    // Auto focus next input
    if (value && index < 5) {
      pinRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !pin[index] && index > 0) {
      pinRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").replace(/\D/g, "");
    if (pastedData.length === 6) {
      const newPin = pastedData.split("");
      setPin(newPin);
      pinRefs.current[5]?.focus();
    }
  };

  const handleMobileChange = (e) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 10);
    setMobile(value);
    if (errors.mobile) {
      setErrors((prev) => ({ ...prev, mobile: null }));
    }
  };

  // 2FA Code handlers
  const handleTwoFACodeChange = (index, value) => {
    if (value.length > 1) value = value[value.length - 1];
    if (!/^\d?$/.test(value)) return;

    const newCode = [...twoFACode];
    newCode[index] = value;
    setTwoFACode(newCode);

    // Clear error if exists
    if (errors.twoFACode) {
      setErrors((prev) => ({ ...prev, twoFACode: null }));
    }

    // Auto focus next input
    if (value && index < 5) {
      twoFACodeRefs.current[index + 1]?.focus();
    }
  };

  const handleTwoFAKeyDown = (index, e) => {
    if (e.key === "Backspace" && !twoFACode[index] && index > 0) {
      twoFACodeRefs.current[index - 1]?.focus();
    }
  };

  const handleTwoFAPaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData("text").replace(/\D/g, "");
    if (pastedData.length === 6) {
      const newCode = pastedData.split("");
      setTwoFACode(newCode);
      twoFACodeRefs.current[5]?.focus();
    }
  };

  const handle2FASubmit = async (e) => {
    e.preventDefault();
    const code = twoFACode.join("");

    if (code.length !== 6 || !/^\d+$/.test(code)) {
      setErrors({ twoFACode: "Please enter a valid 6-digit code" });
      return;
    }

    setIsVerifying2FA(true);

    try {
      // Send 2FA code along with temp token
      const response = await apiPost(API_ENDPOINTS.AUTH.LOGIN, {
        action: "verify-2fa",
        tempToken,
        twoFACode: code,
      });

      if (response.data.user) {
        markSessionAuthenticated(response.data.user);

        showSuccess("✅ 2FA verified! Welcome back!");

        const loggedInUser = response.data.user || {};
        const userPermissions = loggedInUser.permissions || {};
        const isTeamMember = loggedInUser.userType === "team-member";

        if (isTeamMember) {
          const firstAllowedModule = PERMISSION_MODULES.find(
            (module) => userPermissions[module.key]?.active === true,
          );

          if (firstAllowedModule?.route) {
            navigate(firstAllowedModule.route);
          } else {
            showError("No module permission assigned to this user");
            localStorage.removeItem("maxcode_auth");
            localStorage.removeItem("user_info");
            setNeeds2FA(false);
          }
        } else {
          navigate("/admin/dashboard");
        }
      } else {
        showError(response.data.message || "2FA verification failed");
        setTwoFACode(["", "", "", "", "", ""]);
        setErrors({ twoFACode: "Invalid 2FA code" });
      }
    } catch (error) {
      console.error("2FA verification error:", error);
      const errorMessage =
        error.response?.data?.message ||
        error.response?.data?.error ||
        "2FA verification failed";
      showError(errorMessage);
      setTwoFACode(["", "", "", "", "", ""]);
      setErrors({ twoFACode: "Verification failed" });
    } finally {
      setIsVerifying2FA(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const enteredPin = pin.join("");
    const newErrors = {};

    if (mobile.length !== 10) {
      newErrors.mobile = "Please enter a valid 10-digit mobile number";
    }

    if (enteredPin.length !== 6) {
      newErrors.pin = "Please enter your 6-digit PIN";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setLoading(true);

    try {
      // Call the actual API endpoint
      const response = await apiPost(API_ENDPOINTS.AUTH.LOGIN, {
        action: "login",
        phone: mobile,
        pin: enteredPin,
      });

      // If 2FA is required
      if (response.data.needs2FA && response.data.tempToken) {
        setTempToken(response.data.tempToken);
        setNeeds2FA(true);
        showInfo(
          "✓ PIN verified! Please enter your 2FA code from your authenticator app",
        );
        setPin(["", "", "", "", "", ""]);
        return;
      }

      // If login successful, store the token
      if (response.data.user) {
        markSessionAuthenticated(response.data.user);

        showSuccess(
          response.data.message || "Welcome back! Authentication successful",
        );

        const loggedInUser = response.data.user || {};
        const userPermissions = loggedInUser.permissions || {};
        const isTeamMember = loggedInUser.userType === "team-member";

        if (isTeamMember) {
          const firstAllowedModule = PERMISSION_MODULES.find(
            (module) => userPermissions[module.key]?.active === true,
          );

          if (firstAllowedModule?.route) {
            navigate(firstAllowedModule.route);
          } else {
            showError("No module permission assigned to this user");
            localStorage.removeItem("maxcode_auth");
            localStorage.removeItem("user_info");
          }
        } else {
          navigate("/admin/dashboard");
        }
      } else {
        showError(response.data.message || "Invalid credentials");
        setPin(["", "", "", "", "", ""]);
        setErrors({ pin: "Invalid PIN" });
        // Don't auto-focus on error - let user click where they want
      }
    } catch (error) {
      console.log(error);
      // Handle error from API
      const errorMessage =
        error.response?.data?.message ||
        error.response?.data?.error ||
        "Login failed. Please try again";
      showError(errorMessage);

      setPin(["", "", "", "", "", ""]);
      setErrors({ pin: "Authentication failed" });
    } finally {
      setLoading(false);
    }
  };

  const isPinComplete = pin.every((digit) => digit !== "");

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center bg-gradient-to-br from-slate-50 to-slate-100 p-3">
      {/* Background Pattern */}
      <div
        className="position-fixed top-0 start-0 w-100 h-100 opacity-10"
        style={{
          backgroundImage: `radial-gradient(circle at 1px 1px, #64748b 1px, transparent 0)`,
          backgroundSize: "40px 40px",
          pointerEvents: "none",
        }}
      ></div>

      <div
        className="card border-0 shadow-2xl rounded-4 overflow-hidden animate__animated animate__fadeInUp"
        style={{
          maxWidth: "1100px",
          width: "100%",
          background: "rgba(255, 255, 255, 0.95)",
          backdropFilter: "blur(10px)",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
        }}
      >
        <div className="row g-0">
          {/* Left Side: Enhanced Branding Column */}
          <div
            className="col-lg-7 p-5 d-none d-lg-flex flex-column position-relative overflow-hidden"
            style={{
              background: "var(--header-gradient)",
              minHeight: "500px",
            }}
          >
            {/* Animated Background Elements */}
            <div className="position-absolute top-0 start-0 w-100 h-100 opacity-10">
              <div
                className="position-absolute"
                style={{
                  top: "10%",
                  right: "10%",
                  width: "300px",
                  height: "300px",
                  background:
                    "radial-gradient(circle, rgba(255,255,255,0.3) 0%, transparent 70%)",
                  borderRadius: "50%",
                  animation: "pulse 4s ease-in-out infinite",
                }}
              ></div>
              <div
                className="position-absolute"
                style={{
                  bottom: "10%",
                  left: "10%",
                  width: "200px",
                  height: "200px",
                  background: "var(--header-gradient)",
                  borderRadius: "50%",
                  animation: "pulse 6s ease-in-out infinite reverse",
                }}
              ></div>
            </div>

            <div className="position-relative z-1 d-flex flex-column justify-content-between h-100">
              <div>
                <h1
                  className="display-5 fw-bold mb-4 text-white"
                  style={{ lineHeight: 1.2 }}
                >
                  Welcome Back,
                  <br />
                  <span className="text-white border-bottom border-3 border-white/30 pb-2">
                    Vipin Khandelwal
                  </span>
                </h1>

                <p className="text-white mb-3 fs-5" style={{ maxWidth: "90%" }}>
                  Your complete business ecosystem. Manage invoices, inventory,
                  and analytics in one secure, encrypted platform.
                </p>
              </div>

              <div className="space-y-1">
                {/* Feature Cards */}
                <div className="d-flex gap-3 flex-wrap mb-3">
                  <div
                    className="d-flex align-items-center gap-3 bg-white/10 p-3 rounded-3 border border-white/20 backdrop-blur-sm"
                    style={{ backdropFilter: "blur(5px)" }}
                  >
                    <div className="bg-white/20 p-2 rounded-2">
                      <i className="fas fa-shield-alt text-white fs-5"></i>
                    </div>
                    <div>
                      <span className="text-white fw-semibold d-block">
                        Bank-Grade Security
                      </span>
                      <span className="text-white small">
                        256-bit Encryption
                      </span>
                    </div>
                  </div>

                  <div
                    className="d-flex align-items-center gap-3 bg-white/10 p-3 rounded-3 border border-white/20 backdrop-blur-sm"
                    style={{ backdropFilter: "blur(5px)" }}
                  >
                    <div className="bg-white/20 p-2 rounded-2">
                      <i className="fas fa-chart-line text-white fs-5"></i>
                    </div>
                    <div>
                      <span className="text-white fw-semibold d-block">
                        Real-Time Sync
                      </span>
                      <span className="text-white small">
                        Live Dashboard Updates
                      </span>
                    </div>
                  </div>
                </div>

                {/* Company Info */}
                <div className="border-top border-white/20 pt-2">
                  <div className="d-flex align-items-center gap-2 mb-3">
                    <i className="fas fa-fingerprint text-white"></i>
                    <span className="text-white small fw-semibold">
                      Secured Session • IP Protected
                    </span>
                  </div>
                  <div className="d-flex justify-content-between align-items-center">
                    <span className="text-white small">v2.5.0 PRO</span>
                    <span className="text-white fw-semibold small">
                      MAXCODE IT SERVICES
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side: Enhanced Login Form */}
          <div className="col-lg-5 p-4 p-xl-5 bg-white">
            <div className="d-flex flex-column h-100">
              {/* Logo and Header */}
              <div className="text-center mb-2">
                <img
                  src="Logo.png"
                  alt="Company Logo"
                  className="img-fluid mb-3"
                  style={{
                    maxHeight: "70px",
                    maxWidth: "220px",
                    objectFit: "contain",
                  }}
                />
              </div>

              <form
                onSubmit={needs2FA ? handle2FASubmit : handleSubmit}
                className="flex-grow-1"
              >
                {!needs2FA ? (
                  <>
                    {/* Mobile Number Field */}
                    <div className="mb-4">
                      <label className="form-label fw-semibold text-secondary mb-2">
                        <i
                          className="fas fa-phone-alt me-2"
                          style={{ color: "var(--primary-color)" }}
                        ></i>
                        Mobile Number
                      </label>
                      <div className="input-group">
                        <span className="input-group-text flag-india bg-light border-0 rounded-start-3 px-3">
                          <img
                            src="https://flagcdn.com/w40/in.png"
                            alt="India"
                            className="flag-icon rounded"
                            style={{
                              width: "24px",
                              height: "16px",
                              objectFit: "cover",
                            }}
                          />
                          <span className="ms-2 fw-semibold">+91</span>
                        </span>
                        <input
                          type="tel"
                          className={`form-control modern-input fw-bold ${errors.mobile ? "is-invalid" : ""}`}
                          id="phoneNumber"
                          name="phoneNumber"
                          value={mobile}
                          onChange={handleMobileChange}
                          minLength="10"
                          maxLength="10"
                          placeholder="10-digit mobile number"
                          onFocus={() => setFocusedField("mobile")}
                          onBlur={() => setFocusedField(null)}
                          style={{
                            fontSize: "1.1rem",
                            boxShadow:
                              focusedField === "mobile"
                                ? "0 0 0 3px rgba(0,112,38,0.1)"
                                : "none",
                          }}
                        />
                        {errors.mobile && (
                          <div className="invalid-feedback d-block">
                            {errors.mobile}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* PIN Field */}
                    <div className="mb-4">
                      <div className="d-flex justify-content-between align-items-center mb-2">
                        <label className="form-label fw-semibold text-secondary mb-0">
                          <i
                            className="fas fa-lock me-2"
                            style={{ color: "var(--primary-color)" }}
                          ></i>
                          Security PIN
                        </label>
                        <span
                          className="badge fw-bold px-3 py-2 rounded-pill"
                          style={{
                            backgroundColor: "var(--primary-light)",
                            color: "var(--primary-color)",
                          }}
                        >
                          6-Digit PIN
                        </span>
                      </div>

                      <div className="pin-container mb-2">
                        {pin.map((digit, i) => (
                          <div key={i} className="pin-box fw-bold">
                            <input
                              ref={(el) => (pinRefs.current[i] = el)}
                              type="password"
                              className={`pin-input ${digit ? "filled" : ""} ${errors.pin ? "error" : ""}`}
                              value={digit}
                              onChange={(e) =>
                                handlePinChange(i, e.target.value)
                              }
                              onKeyDown={(e) => handleKeyDown(i, e)}
                              onFocus={() => setFocusedField(`pin-${i}`)}
                              onBlur={() => setFocusedField(null)}
                              onPaste={i === 0 ? handlePaste : undefined}
                              inputMode="numeric"
                              autoComplete="off"
                              maxLength={1}
                            />
                          </div>
                        ))}
                      </div>

                      {/* PIN Status */}
                      <div className="pin-status">
                        <span className="text-muted small">
                          <i
                            className="fas fa-info-circle me-1"
                            style={{ color: "var(--primary-color)" }}
                          ></i>
                          {isPinComplete
                            ? "PIN entered successfully"
                            : `${6 - pin.filter((d) => d).length} digits remaining`}
                        </span>
                        {isPinComplete && (
                          <span
                            className="status-ready"
                            style={{ color: "var(--primary-color)" }}
                          >
                            <i className="fas fa-check-circle me-1"></i>
                            Ready
                          </span>
                        )}
                      </div>

                      {errors.pin && (
                        <div className="error-message mt-2">
                          <i className="fas fa-exclamation-circle me-1"></i>
                          {errors.pin}
                        </div>
                      )}
                    </div>

                    {/* Submit Button */}
                    <button
                      type="submit"
                      disabled={loading || !mobile || !isPinComplete}
                      className="btn btn-lg w-100 py-3 rounded-3 fw-semibold text-white position-relative overflow-hidden"
                      style={{
                        background: "var(--header-gradient)",
                        border: "none",
                        opacity: loading || !mobile || !isPinComplete ? 0.8 : 1,
                        transition: "all 0.3s ease",
                      }}
                    >
                      {loading ? (
                        <div className="d-flex align-items-center justify-content-center gap-3">
                          <div
                            className="spinner-border spinner-border-sm"
                            role="status"
                          ></div>
                          <span>Authenticating...</span>
                        </div>
                      ) : (
                        <div className="d-flex align-items-center justify-content-center gap-3">
                          <span>Access Dashboard</span>
                          <i className="fas fa-arrow-right"></i>
                        </div>
                      )}
                    </button>
                  </>
                ) : (
                  <>
                    {/* 2FA Verification Screen */}
                    <div className="mb-4 text-center">
                      <h4 className="fw-semibold mb-2">
                        Two-Factor Authentication
                      </h4>
                      <p className="text-muted small">
                        Enter the 6-digit code from your authenticator app
                      </p>
                    </div>

                    {/* 2FA Code Input */}
                    <div className="mb-4">
                      <label className="form-label fw-semibold text-secondary mb-2">
                        <i
                          className="fas fa-qrcode me-2"
                          style={{ color: "var(--primary-color)" }}
                        ></i>
                        Authenticator Code
                      </label>

                      <div className="pin-container mb-2">
                        {twoFACode.map((digit, i) => (
                          <div key={i} className="pin-box fw-bold">
                            <input
                              ref={(el) => (twoFACodeRefs.current[i] = el)}
                              type="text"
                              className={`pin-input ${digit ? "filled" : ""} ${errors.twoFACode ? "error" : ""}`}
                              value={digit}
                              onChange={(e) =>
                                handleTwoFACodeChange(i, e.target.value)
                              }
                              onKeyDown={(e) => handleTwoFAKeyDown(i, e)}
                              onFocus={() => setFocusedField(`2fa-${i}`)}
                              onBlur={() => setFocusedField(null)}
                              onPaste={i === 0 ? handleTwoFAPaste : undefined}
                              inputMode="numeric"
                              autoComplete="off"
                              maxLength={1}
                            />
                          </div>
                        ))}
                      </div>

                      {/* 2FA Status */}
                      <div className="pin-status">
                        <span className="text-muted small">
                          <i
                            className="fas fa-info-circle me-1"
                            style={{ color: "var(--primary-color)" }}
                          ></i>
                          {twoFACode.every((d) => d)
                            ? "Code ready to verify"
                            : `${6 - twoFACode.filter((d) => d).length} digits remaining`}
                        </span>
                      </div>

                      {errors.twoFACode && (
                        <div className="error-message mt-2">
                          <i className="fas fa-exclamation-circle me-1"></i>
                          {errors.twoFACode}
                        </div>
                      )}
                    </div>

                    {/* 2FA Submit Button */}
                    <button
                      type="submit"
                      disabled={isVerifying2FA || !twoFACode.every((d) => d)}
                      className="btn btn-lg w-100 py-3 rounded-3 fw-semibold text-white position-relative overflow-hidden"
                      style={{
                        background: "var(--header-gradient)",
                        border: "none",
                        opacity:
                          isVerifying2FA || !twoFACode.every((d) => d)
                            ? 0.8
                            : 1,
                        transition: "all 0.3s ease",
                      }}
                    >
                      {isVerifying2FA ? (
                        <div className="d-flex align-items-center justify-content-center gap-3">
                          <div
                            className="spinner-border spinner-border-sm"
                            role="status"
                          ></div>
                          <span>Verifying...</span>
                        </div>
                      ) : (
                        <div className="d-flex align-items-center justify-content-center gap-3">
                          <span>Verify & Login</span>
                          <i className="fas fa-check"></i>
                        </div>
                      )}
                    </button>

                    {/* Back Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setNeeds2FA(false);
                        setTempToken(null);
                        setTwoFACode(["", "", "", "", "", ""]);
                        setErrors({});
                      }}
                      className="btn btn-link w-100 mt-3 text-muted"
                    >
                      <i className="fas fa-arrow-left me-2"></i>
                      Back to Login
                    </button>
                  </>
                )}
              </form>

              {/* Mobile Footer */}
              <div className="d-lg-none mt-4 pt-3 border-top text-center">
                <div className="d-flex justify-content-center gap-3 small text-muted">
                  <span>
                    <i
                      className="fas fa-shield-alt me-1"
                      style={{ color: "var(--primary-color)" }}
                    ></i>
                    Encrypted
                  </span>
                  <span>
                    <i
                      className="fas fa-clock me-1"
                      style={{ color: "var(--primary-color)" }}
                    ></i>
                    24/7 Support
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Styles */}
      <style jsx>{`
        :root {
          --primary-color: #007026;
          --primary-light: #e8f5e9;
          --primary-dark: #004d1a;
          --error: #dc3545;
        }

        @keyframes pulse {
          0%,
          100% {
            transform: scale(1);
            opacity: 0.1;
          }
          50% {
            transform: scale(1.2);
            opacity: 0.15;
          }
        }

        .animate__fadeInUp {
          animation: fadeInUp 0.6s ease-out;
        }

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .backdrop-blur-sm {
          backdrop-filter: blur(8px);
        }

        .shadow-2xl {
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
        }

        .bg-gradient-to-br {
          background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
        }

        .tracking-wider {
          letter-spacing: 0.05em;
        }

        .flag-india {
          background: linear-gradient(135deg, #ff9933, #ffffff, #138808);
          border: 2px solid #e9ecef;
          border-right: none;
          border-radius: 10px 0 0 10px;
          font-weight: 600;
          color: #333;
        }

        .flag-icon {
          width: 20px;
          height: 15px;
          margin-right: 8px;
          border-radius: 2px;
        }

        /* PIN Input Styles */
        .pin-container {
          display: grid;
          grid-template-columns: repeat(6, 1fr);
          gap: 8px;
          margin-bottom: 8px;
        }

        .pin-box {
          aspect-ratio: 1;
        }

        .pin-input {
          width: 100%;
          height: 100%;
          border: 2px solid #e9ecef;
          border-radius: 12px;
          text-align: center;
          font-size: 1.5rem;
          font-weight: 700;
          background: #f8f9fa;
          transition: all 0.3s ease;
        }

        .pin-input:focus {
          outline: none;
          border-color: var(--primary-color);
        }

        .pin-input.filled {
          background: var(--primary-light);
          border-color: var(--primary-color);
          color: var(--primary-color);
        }

        .pin-input.error {
          border-color: var(--error);
        }

        .pin-status {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-top: 8px;
        }

        .status-ready {
          color: var(--primary-color);
          font-size: 0.875rem;
          font-weight: 500;
        }

        .error-message {
          color: var(--error);
          font-size: 0.75rem;
          margin-top: 4px;
        }

        /* Responsive */
        @media (max-width: 768px) {
          .pin-container {
            gap: 4px;
          }
        }
      `}</style>
    </div>
  );
};

export default Login;
