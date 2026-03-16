// Login.jsx
import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost, markSessionAuthenticated } from "../utils/api";
import API_ENPOINTS from "../utils/apiEndpoints";
import { getFirstAllowedRoute } from "../utils/permissions";
import {
  showSuccess,
  showError,
  showInfo,
} from "../Components/ToastNotification";
import {
  getStoredBiometricConfig,
  verifyDeviceBiometric,
} from "../utils/biometricAuth";

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
  const [backupCode, setBackupCode] = useState([
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
  ]); // 8-digit backup code
  const [isVerifying2FA, setIsVerifying2FA] = useState(false);
  const [showBackupOption, setShowBackupOption] = useState(false); // Toggle between 2FA and backup code
  const [needsFingerprint, setNeedsFingerprint] = useState(false);
  const [isVerifyingFingerprint, setIsVerifyingFingerprint] = useState(false);
  const [fingerprintError, setFingerprintError] = useState("");
  const [pendingLoginData, setPendingLoginData] = useState(null);

  const pinRefs = useRef([]);
  const twoFACodeRefs = useRef([]);
  const backupCodeRefs = useRef([]);

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

  // Backup Code handlers
  const handleBackupCodeChange = (index, value) => {
    if (value.length > 1) value = value[value.length - 1];
    if (!/^[A-Za-z0-9]?$/.test(value)) return; // Allow alphanumeric for backup codes

    const newCode = [...backupCode];
    newCode[index] = value.toUpperCase(); // Convert to uppercase for consistency
    setBackupCode(newCode);

    // Clear error if exists
    if (errors.backupCode) {
      setErrors((prev) => ({ ...prev, backupCode: null }));
    }

    // Auto focus next input
    if (value && index < 7) {
      backupCodeRefs.current[index + 1]?.focus();
    }
  };

  const handleBackupKeyDown = (index, e) => {
    if (e.key === "Backspace" && !backupCode[index] && index > 0) {
      backupCodeRefs.current[index - 1]?.focus();
    }
  };

  const handleBackupPaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData
      .getData("text")
      .replace(/[^A-Za-z0-9]/g, "");
    if (pastedData.length === 8) {
      const newCode = pastedData.toUpperCase().split("");
      setBackupCode(newCode);
      backupCodeRefs.current[7]?.focus();
    }
  };

  const completeLogin = (responseData, successMessage) => {
    if (!responseData?.user) {
      showError(responseData?.message || "Invalid credentials");
      setPin(["", "", "", "", "", ""]);
      setErrors({ pin: "Invalid PIN" });
      return;
    }

    markSessionAuthenticated(responseData.user, responseData.token);
    showSuccess(successMessage || responseData.message || "Welcome back!");

    const loggedInUser = responseData.user || {};
    const nextRoute = getFirstAllowedRoute(loggedInUser);

    if (nextRoute !== "/login") {
      navigate(nextRoute);
      return;
    }

    showError("No module permission assigned to this user");
    localStorage.removeItem("maxcode_auth");
    localStorage.removeItem("user_info");
  };

  const switchFromFingerprintTo2FA = () => {
    if (!pendingLoginData?.tempToken) {
      showError("2FA token not available. Please login again.");
      return;
    }

    setNeedsFingerprint(false);
    setNeeds2FA(true);
    setTempToken(pendingLoginData.tempToken);
    setShowBackupOption(false);
    setFingerprintError("");
    showInfo("Enter your Two-Factor code to continue login");
  };

  const handleFingerprintSubmit = async (e) => {
    e.preventDefault();

    if (!pendingLoginData?.phone) {
      showError("Fingerprint session expired. Please login again.");
      setNeedsFingerprint(false);
      return;
    }

    setIsVerifyingFingerprint(true);
    setFingerprintError("");

    try {
      const localBiometric = getStoredBiometricConfig(pendingLoginData.phone);

      await verifyDeviceBiometric({
        phone: pendingLoginData.phone,
        credentialId: localBiometric?.credentialId,
      });

      if (pendingLoginData.requires2FA) {
        const response = await apiPost(API_ENPOINTS.AUTH.LOGIN, {
          action: "verify-fingerprint",
          tempToken: pendingLoginData.tempToken,
        });

        completeLogin(
          response.data,
          response.data?.message || "Fingerprint verified! Login successful",
        );
      } else {
        completeLogin(
          pendingLoginData.responseData,
          "Fingerprint verified! Login successful",
        );
      }
    } catch (error) {
      const message =
        error?.name === "NotAllowedError"
          ? "Fingerprint verification cancelled"
          : error?.response?.data?.error ||
            error?.message ||
            "Fingerprint verification failed";

      setFingerprintError(message);
      showError(message);
    } finally {
      setIsVerifyingFingerprint(false);
    }
  };

  const handle2FASubmit = async (e) => {
    e.preventDefault();

    let code;
    let verificationType;

    if (!showBackupOption) {
      // Using 2FA code
      code = twoFACode.join("");
      verificationType = "2fa";

      if (code.length !== 6 || !/^\d+$/.test(code)) {
        setErrors({ twoFACode: "Please enter a valid 6-digit code" });
        return;
      }
    } else {
      // Using backup code
      code = backupCode.join("");
      verificationType = "backup";

      if (code.length !== 8) {
        setErrors({ backupCode: "Please enter a valid 8-digit backup code" });
        return;
      }
    }

    setIsVerifying2FA(true);

    try {
      // Send verification code along with temp token
      const response = await apiPost(API_ENPOINTS.AUTH.LOGIN, {
        action: "verify-2fa",
        tempToken,
        twoFACode: code,
        verificationType, // Send the type to help server identify
      });

      if (response.data.user) {
        markSessionAuthenticated(response.data.user, response.data.token);

        showSuccess(
          verificationType === "backup"
            ? "✅ Backup code verified! Please set up a new 2FA device."
            : "✅ 2FA verified! Welcome back!",
        );

        const loggedInUser = response.data.user || {};
        const nextRoute = getFirstAllowedRoute(loggedInUser);

        if (nextRoute !== "/login") {
          navigate(nextRoute);
        } else {
          showError("No module permission assigned to this user");
          localStorage.removeItem("maxcode_auth");
          localStorage.removeItem("user_info");
          setNeeds2FA(false);
        }
      } else {
        showError(response.data.message || "Verification failed");
        if (!showBackupOption) {
          setTwoFACode(["", "", "", "", "", ""]);
          setErrors({ twoFACode: "Invalid code" });
        } else {
          setBackupCode(["", "", "", "", "", "", "", ""]);
          setErrors({ backupCode: "Invalid backup code" });
        }
      }
    } catch (error) {
      console.error("Verification error:", error);
      const errorMessage =
        error.response?.data?.message ||
        error.response?.data?.error ||
        "Verification failed";
      showError(errorMessage);

      if (!showBackupOption) {
        setTwoFACode(["", "", "", "", "", ""]);
        setErrors({ twoFACode: "Verification failed" });
      } else {
        setBackupCode(["", "", "", "", "", "", "", ""]);
        setErrors({ backupCode: "Verification failed" });
      }
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
      const response = await apiPost(API_ENPOINTS.AUTH.LOGIN, {
        action: "login",
        phone: mobile,
        pin: enteredPin,
      });

      const fingerprintLoginEnabled =
        response?.data?.fingerprintLoginEnabled === true;

      if (fingerprintLoginEnabled) {
        let localBiometric = getStoredBiometricConfig(mobile);

        // If not in localStorage but backend has credentialId, sync it
        if (
          !localBiometric?.credentialId &&
          response?.data?.biometricCredentialId
        ) {
          const stored = JSON.parse(
            localStorage.getItem("maxcode_biometric_credentials") || "{}",
          );
          stored[mobile] = {
            credentialId: response.data.biometricCredentialId,
            enabled: true,
            updatedAt: new Date().toISOString(),
          };
          localStorage.setItem(
            "maxcode_biometric_credentials",
            JSON.stringify(stored),
          );
          localBiometric = stored[mobile];
        }

        if (!localBiometric?.credentialId) {
          if (response.data.needs2FA && response.data.tempToken) {
            setTempToken(response.data.tempToken);
            setNeeds2FA(true);
            setShowBackupOption(false);
            showInfo(
              "Fingerprint is enabled but this device is not registered. Continue with Two-Factor code.",
            );
            return;
          }

          showError(
            "Fingerprint is enabled but not configured on this device. Login from registered device or disable fingerprint in settings.",
          );
          setPin(["", "", "", "", "", ""]);
          return;
        }

        setPendingLoginData({
          phone: mobile,
          requires2FA: response.data.needs2FA === true,
          tempToken: response.data.tempToken || null,
          responseData: response.data,
        });
        setNeedsFingerprint(true);
        setNeeds2FA(false);
        setShowBackupOption(false);
        setTwoFACode(["", "", "", "", "", ""]);
        setBackupCode(["", "", "", "", "", "", "", ""]);
        setFingerprintError("");
        showInfo(
          response.data.needs2FA
            ? "PIN verified. Verify fingerprint to login, or choose Login using 2 Factor."
            : "PIN verified. Please verify fingerprint to login.",
        );
        return;
      }

      // If 2FA is required
      if (response.data.needs2FA && response.data.tempToken) {
        setTempToken(response.data.tempToken);
        setNeeds2FA(true);
        setShowBackupOption(false); // Reset to 2FA mode
        showInfo(
          "✓ PIN verified! Please enter your 2FA code from your authenticator app",
        );
        setPin(["", "", "", "", "", ""]);
        return;
      }

      // If login successful, store the token
      completeLogin(
        response.data,
        response.data.message || "Welcome back! Authentication successful",
      );
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

  const toggleBackupOption = () => {
    setShowBackupOption(!showBackupOption);
    // Clear fields when switching
    setTwoFACode(["", "", "", "", "", ""]);
    setBackupCode(["", "", "", "", "", "", "", ""]);
    setErrors({});
  };

  const isPinComplete = pin.every((digit) => digit !== "");
  const isCodeComplete = showBackupOption
    ? backupCode.every((digit) => digit !== "")
    : twoFACode.every((digit) => digit !== "");

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
                onSubmit={
                  needsFingerprint
                    ? handleFingerprintSubmit
                    : needs2FA
                      ? handle2FASubmit
                      : handleSubmit
                }
                className="flex-grow-1"
              >
                {!needs2FA && !needsFingerprint ? (
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
                ) : needsFingerprint ? (
                  <>
                    <div className="mb-4 text-center">
                      <h4 className="fw-semibold mb-2">Verify Fingerprint</h4>
                    </div>

                    <div className="mb-4">
                      <div className="card border-0 bg-light">
                        <div className="card-body text-center py-2">
                          <div className="mx-auto mb-3 fingerprint-orb-wrap mt-2">
                            <span className="fingerprint-ring ring-1"></span>
                            <span className="fingerprint-ring ring-2"></span>
                            <div
                              className="d-flex align-items-center justify-content-center rounded-circle fingerprint-orb"
                              style={{
                                width: "72px",
                                height: "72px",
                                background: "var(--primary-light)",
                              }}
                            >
                              <i className="fas fa-fingerprint fs-1 fingerprint-icon-animated"></i>
                            </div>
                          </div>
                          <p className="text-muted small mb-0">
                            Continue with fingerprint or passkey
                          </p>
                        </div>
                      </div>

                      {fingerprintError && (
                        <div className="error-message mt-2 text-center">
                          <i className="fas fa-exclamation-circle me-1"></i>
                          {fingerprintError}
                        </div>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={isVerifyingFingerprint}
                      className="btn btn-lg w-100 py-2 rounded-3 fw-semibold text-white position-relative overflow-hidden"
                      style={{
                        background: "var(--header-gradient)",
                        border: "none",
                        opacity: isVerifyingFingerprint ? 0.8 : 1,
                        transition: "all 0.3s ease",
                      }}
                    >
                      {isVerifyingFingerprint ? (
                        <div className="d-flex align-items-center justify-content-center gap-3">
                          <div
                            className="spinner-border spinner-border-sm"
                            role="status"
                          ></div>
                          <span>Verifying fingerprint...</span>
                        </div>
                      ) : (
                        <div className="d-flex align-items-center justify-content-center gap-3">
                          <i className="fas fa-fingerprint"></i>
                          <span>Verify Fingerprint</span>
                        </div>
                      )}
                    </button>

                    <div className="d-flex justify-content-between mt-3">
                      {pendingLoginData?.requires2FA && (
                        <button
                          type="button"
                          onClick={switchFromFingerprintTo2FA}
                          className="btn btn-link text-decoration-none p-0 fw-bold"
                          style={{ color: "var(--primary-color)" }}
                        >
                          <i className="fas fa-shield-alt me-2"></i>
                          Login using 2 Factor
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setNeedsFingerprint(false);
                          setPendingLoginData(null);
                          setFingerprintError("");
                          setPin(["", "", "", "", "", ""]);
                          setErrors({});
                        }}
                        className="btn btn-link text-muted p-0 fw-bold"
                      >
                        <i className="fas fa-arrow-left me-2"></i>
                        Back to Login
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {/* 2FA/Backup Verification Screen */}
                    <div className="mb-4 text-center">
                      <h4 className="fw-semibold mb-2">
                        {!showBackupOption
                          ? "Two-Factor Authentication"
                          : "Backup Code"}
                      </h4>
                      <p className="text-muted small">
                        {!showBackupOption
                          ? "Enter the 6-digit code from your authenticator app"
                          : "Enter an 8-digit backup code from your recovery list"}
                      </p>
                    </div>

                    {/* Code Input */}
                    <div className="mb-4">
                      <label className="form-label fw-semibold text-secondary mb-2">
                        <i
                          className={`fas ${!showBackupOption ? "fa-qrcode" : "fa-key"} me-2`}
                          style={{ color: "var(--primary-color)" }}
                        ></i>
                        {!showBackupOption
                          ? "Authenticator Code"
                          : "Backup Code"}
                      </label>

                      <div
                        className={`pin-container mb-2 ${showBackupOption ? "backup-code-container" : ""}`}
                      >
                        {!showBackupOption
                          ? // 2FA 6-digit input
                            twoFACode.map((digit, i) => (
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
                                  onPaste={
                                    i === 0 ? handleTwoFAPaste : undefined
                                  }
                                  inputMode="numeric"
                                  autoComplete="off"
                                  maxLength={1}
                                />
                              </div>
                            ))
                          : // Backup Code 8-digit input
                            backupCode.map((digit, i) => (
                              <div key={i} className="pin-box fw-bold">
                                <input
                                  ref={(el) => (backupCodeRefs.current[i] = el)}
                                  type="text"
                                  className={`pin-input backup-pin-input ${digit ? "filled" : ""} ${errors.backupCode ? "error" : ""}`}
                                  value={digit}
                                  onChange={(e) =>
                                    handleBackupCodeChange(i, e.target.value)
                                  }
                                  onKeyDown={(e) => handleBackupKeyDown(i, e)}
                                  onFocus={() => setFocusedField(`backup-${i}`)}
                                  onBlur={() => setFocusedField(null)}
                                  onPaste={
                                    i === 0 ? handleBackupPaste : undefined
                                  }
                                  inputMode="text"
                                  autoComplete="off"
                                  maxLength={1}
                                  style={{ textTransform: "uppercase" }}
                                />
                              </div>
                            ))}
                      </div>

                      {/* Status and "Try Other Option" Link */}
                      <div className="d-flex justify-content-between align-items-center">
                        <span className="text-muted small">
                          <i
                            className="fas fa-info-circle me-1"
                            style={{ color: "var(--primary-color)" }}
                          ></i>
                          {isCodeComplete
                            ? "Code ready to verify"
                            : `${
                                (!showBackupOption ? 6 : 8) -
                                (showBackupOption
                                  ? backupCode.filter((d) => d).length
                                  : twoFACode.filter((d) => d).length)
                              } digits remaining`}
                        </span>

                        {/* Try Other Option Link */}
                        <button
                          type="button"
                          onClick={toggleBackupOption}
                          className="btn btn-link p-0 text-decoration-none"
                          style={{
                            color: "var(--primary-color)",
                            fontSize: "0.875rem",
                          }}
                        >
                          <i className="fas fa-exchange-alt me-1"></i>
                          {showBackupOption
                            ? "Try 2FA Code"
                            : "Try Other Option"}
                        </button>
                      </div>

                      {!showBackupOption && errors.twoFACode && (
                        <div className="error-message mt-2">
                          <i className="fas fa-exclamation-circle me-1"></i>
                          {errors.twoFACode}
                        </div>
                      )}

                      {showBackupOption && errors.backupCode && (
                        <div className="error-message mt-2">
                          <i className="fas fa-exclamation-circle me-1"></i>
                          {errors.backupCode}
                        </div>
                      )}
                    </div>

                    {/* Verify Button */}
                    <button
                      type="submit"
                      disabled={isVerifying2FA || !isCodeComplete}
                      className="btn btn-lg w-100 py-3 rounded-3 fw-semibold text-white position-relative overflow-hidden"
                      style={{
                        background: "var(--header-gradient)",
                        border: "none",
                        opacity: isVerifying2FA || !isCodeComplete ? 0.8 : 1,
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
                        setNeedsFingerprint(false);
                        setTempToken(null);
                        setPendingLoginData(null);
                        setTwoFACode(["", "", "", "", "", ""]);
                        setBackupCode(["", "", "", "", "", "", "", ""]);
                        setShowBackupOption(false);
                        setFingerprintError("");
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

        @keyframes fingerprintPulse {
          0%,
          100% {
            transform: scale(1);
            opacity: 0.9;
          }
          50% {
            transform: scale(1.08);
            opacity: 1;
          }
        }

        @keyframes fingerprintSweep {
          0% {
            background-position: 0% 0%;
          }
          100% {
            background-position: 0% 220%;
          }
        }

        @keyframes fingerprintRingPulse {
          0% {
            transform: scale(0.85);
            opacity: 0.55;
          }
          70% {
            transform: scale(1.2);
            opacity: 0;
          }
          100% {
            transform: scale(1.2);
            opacity: 0;
          }
        }

        @keyframes fingerprintOrbGlow {
          0%,
          100% {
            box-shadow:
              0 0 0 1px rgba(0, 112, 38, 0.12),
              0 10px 24px rgba(0, 112, 38, 0.16);
          }
          50% {
            box-shadow:
              0 0 0 1px rgba(0, 112, 38, 0.25),
              0 12px 30px rgba(0, 112, 38, 0.26);
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

        .backup-code-container {
          grid-template-columns: repeat(8, 1fr);
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

        .backup-pin-input {
          font-size: 1.2rem;
          text-transform: uppercase;
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

        .fingerprint-orb-wrap {
          position: relative;
          width: 72px;
          height: 72px;
        }

        .fingerprint-orb {
          position: relative;
          z-index: 2;
          animation: fingerprintOrbGlow 1.8s ease-in-out infinite;
        }

        .fingerprint-ring {
          position: absolute;
          inset: -8px;
          border-radius: 50%;
          border: 3px solid rgba(0, 112, 38, 0.28);
          pointer-events: none;
          z-index: 1;
          animation: fingerprintRingPulse 2.1s ease-out infinite;
        }

        .fingerprint-ring.ring-2 {
          animation-delay: 0.95s;
          border-color: rgba(0, 112, 38, 0.18);
        }

        .fingerprint-icon-animated {
          background: linear-gradient(
            180deg,
            rgba(0, 112, 38, 0.35) 0%,
            rgba(0, 112, 38, 0.35) 42%,
            rgba(0, 112, 38, 1) 52%,
            rgba(0, 112, 38, 0.35) 62%,
            rgba(0, 112, 38, 0.35) 100%
          );
          background-size: 100% 220%;
          color: transparent;
          -webkit-background-clip: text;
          background-clip: text;
          filter: drop-shadow(0 0 3px rgba(0, 112, 38, 0.35));
          animation:
            fingerprintPulse 1.8s ease-in-out infinite,
            fingerprintSweep 1.55s linear infinite;
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
          .backup-pin-input {
            font-size: 1rem;
          }
        }
      `}</style>
    </div>
  );
};

export default Login;
