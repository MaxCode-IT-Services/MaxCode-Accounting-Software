// Login.jsx
import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet, apiPost, markSessionAuthenticated } from "../utils/api";
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
import { extractTokenFromUsbKeyFile } from "../utils/usbKeyAuth";
import {
  extractFaceDescriptorFromVideo,
  isFaceAuthSupported,
} from "../utils/faceAuth";

const Login = ({ settings, onAuthSuccess }) => {
  const navigate = useNavigate();
  const [mobile, setMobile] = useState("");
  const [pin, setPin] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState(null);
  const [errors, setErrors] = useState({});
  const [captchaEnabled, setCaptchaEnabled] = useState(false);
  const [captchaSiteKey, setCaptchaSiteKey] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaError, setCaptchaError] = useState("");
  const [isDesktopCaptcha, setIsDesktopCaptcha] = useState(false);

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
  const [needsUsbKey, setNeedsUsbKey] = useState(false);
  const [isVerifyingUsbKey, setIsVerifyingUsbKey] = useState(false);
  const [usbKeyError, setUsbKeyError] = useState("");
  const [selectedUsbFile, setSelectedUsbFile] = useState(null);
  const [needsFaceAuth, setNeedsFaceAuth] = useState(false);
  const [isVerifyingFaceAuth, setIsVerifyingFaceAuth] = useState(false);
  const [faceAuthError, setFaceAuthError] = useState("");
  const [pendingLoginData, setPendingLoginData] = useState(null);

  const pinRefs = useRef([]);
  const twoFACodeRefs = useRef([]);
  const backupCodeRefs = useRef([]);
  const usbFileInputRef = useRef(null);
  const faceVideoRef = useRef(null);
  const faceStreamRef = useRef(null);
  const faceVerifyButtonRef = useRef(null);
  const faceAutoVerifyRequestedRef = useRef(false);
  const faceAutoVerifyFrameRef = useRef(null);
  const faceAutoVerifyAttemptedRef = useRef(false);
  const captchaContainerRef = useRef(null);
  const captchaWidgetIdRef = useRef(null);

  const TURNSTILE_SCRIPT_SRC =
    "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

  // Start loading Turnstile script immediately on mount — don't wait for API settings.
  // This eliminates the sequential delay of: API call → script load → widget render.
  useEffect(() => {
    if (typeof window === "undefined") return;

    // If script is already loaded (e.g. preloaded in index.html), nothing to do.
    if (window.turnstile) return;

    // Check if a script tag already exists (from preload or prior attempt).
    const existingScript = document.querySelector(
      'script[data-turnstile-script="true"]',
    );
    if (existingScript) return;

    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.dataset.turnstileScript = "true";
    document.head.appendChild(script);
  }, []);

  const clearCaptchaWidget = useCallback(() => {
    if (typeof window !== "undefined" && window.turnstile) {
      try {
        if (captchaWidgetIdRef.current !== null) {
          window.turnstile.remove(captchaWidgetIdRef.current);
        }
      } catch {
        // ignore widget cleanup errors
      }
    }

    captchaWidgetIdRef.current = null;

    if (captchaContainerRef.current) {
      captchaContainerRef.current.innerHTML = "";
    }
  }, []);

  const loadTurnstileScript = useCallback(
    () =>
      new Promise((resolve, reject) => {
      if (typeof window === "undefined") {
        reject(new Error("Browser environment unavailable"));
        return;
      }

      if (window.turnstile) {
        resolve();
        return;
      }

      const existingScript = document.querySelector(
        'script[data-turnstile-script="true"]',
      );

      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(), {
          once: true,
        });
        existingScript.addEventListener("error", () => {
          reject(new Error("Unable to load Cloudflare Turnstile script"));
        }, { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = TURNSTILE_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.dataset.turnstileScript = "true";
      script.onload = () => resolve();
      script.onerror = () => {
        reject(new Error("Unable to load Cloudflare Turnstile script"));
      };
      document.head.appendChild(script);
      }),
    [],
  );

  // Remove auto-focus completely - user must click to focus
  useEffect(() => {
    // Intentionally empty - no auto-focus on any field
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const mediaQuery = window.matchMedia("(min-width: 992px)");
    const updateScreenMode = () => {
      setIsDesktopCaptcha(mediaQuery.matches);
    };

    updateScreenMode();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", updateScreenMode);
      return () => mediaQuery.removeEventListener("change", updateScreenMode);
    }

    mediaQuery.addListener(updateScreenMode);
    return () => mediaQuery.removeListener(updateScreenMode);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadCaptchaSettings = async () => {
      try {
        const response = await apiGet(
          API_ENPOINTS.BUSINESS_SETTINGS.LOGIN_CONFIG,
        );
        const businessSettings = response?.data?.settings || response?.data || {};
        const toggles = businessSettings.featureToggles || {};
        const cloudflareSettings = businessSettings.cloudflareSettings || {};

        if (cancelled) return;

        // Fall back to the build-time site key so the widget renders in
        // production even when the API response omits it.
        const envSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY || "";
        const apiSiteKey = String(
          cloudflareSettings.turnstileSiteKey || "",
        ).trim();
        const apiEnabled = toggles.cloudflareLoginCaptcha === true;

        setCaptchaEnabled(apiEnabled || Boolean(envSiteKey));
        setCaptchaSiteKey(apiSiteKey || envSiteKey);
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load captcha settings:", error);
          setCaptchaEnabled(false);
          setCaptchaSiteKey("");
        }
      }
    };

    loadCaptchaSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    clearCaptchaWidget();
    setCaptchaToken("");
    setCaptchaError("");

    if (!captchaEnabled) {
      return () => {
        cancelled = true;
        clearCaptchaWidget();
      };
    }

    if (!captchaSiteKey) {
      setCaptchaError("Captcha is enabled but not configured.");
      return () => {
        cancelled = true;
        clearCaptchaWidget();
      };
    }

    const renderWidget = async () => {
      try {
        await loadTurnstileScript();

        if (
          cancelled ||
          !captchaContainerRef.current ||
          !window.turnstile
        ) {
          return;
        }

        clearCaptchaWidget();

        captchaWidgetIdRef.current = window.turnstile.render(
          captchaContainerRef.current,
          {
            sitekey: captchaSiteKey,
            theme: "light",
            callback: (token) => {
              if (cancelled) return;
              setCaptchaToken(token || "");
              setCaptchaError("");
            },
            "expired-callback": () => {
              if (cancelled) return;
              setCaptchaToken("");
            },
            "error-callback": () => {
              if (cancelled) return;
              setCaptchaToken("");
              setCaptchaError("Cloudflare verification could not load.");
            },
          },
        );
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to render Turnstile:", error);
          setCaptchaToken("");
          setCaptchaError("Cloudflare verification could not load.");
        }
      }
    };

    renderWidget();

    return () => {
      cancelled = true;
      clearCaptchaWidget();
    };
  }, [captchaEnabled, captchaSiteKey]);

  const stopFaceCamera = useCallback(() => {
    if (faceStreamRef.current) {
      faceStreamRef.current.getTracks().forEach((track) => track.stop());
      faceStreamRef.current = null;
    }

    if (faceVideoRef.current) {
      faceVideoRef.current.srcObject = null;
    }
  }, []);

  const startFaceCamera = useCallback(async () => {
    if (!isFaceAuthSupported()) {
      throw new Error("Camera is not supported on this browser/device");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 24, max: 30 },
      },
      audio: false,
    });

    faceStreamRef.current = stream;

    if (faceVideoRef.current) {
      faceVideoRef.current.srcObject = stream;
      await faceVideoRef.current.play();
    }
  }, []);

  useEffect(() => {
    if (!needsFaceAuth) {
      stopFaceCamera();
      faceAutoVerifyRequestedRef.current = false;
      faceAutoVerifyAttemptedRef.current = false;
      if (faceAutoVerifyFrameRef.current) {
        cancelAnimationFrame(faceAutoVerifyFrameRef.current);
        faceAutoVerifyFrameRef.current = null;
      }
      return;
    }

    let active = true;

    const initCamera = async () => {
      try {
        setFaceAuthError("");
        await startFaceCamera();
      } catch (error) {
        if (!active) return;
        const deniedCameraError =
          error?.name === "NotAllowedError" ||
          error?.name === "PermissionDeniedError" ||
          error?.name === "SecurityError";
        const message = deniedCameraError
          ? "Camera permission denied. Please allow camera access in the browser and try again."
          : error?.message || "Unable to access camera for face authentication";
        if (deniedCameraError) {
          faceAutoVerifyAttemptedRef.current = true;
        }
        setFaceAuthError(message);
        if (!deniedCameraError) {
          showError(message);
        }
      }
    };

    initCamera();

    return () => {
      active = false;
      stopFaceCamera();
      if (faceAutoVerifyFrameRef.current) {
        cancelAnimationFrame(faceAutoVerifyFrameRef.current);
        faceAutoVerifyFrameRef.current = null;
      }
    };
  }, [needsFaceAuth, startFaceCamera, stopFaceCamera]);

  useEffect(() => {
    if (!needsFaceAuth || isVerifyingFaceAuth || faceAutoVerifyAttemptedRef.current) {
      return undefined;
    }

    const tryAutoVerify = () => {
      if (
        !needsFaceAuth ||
        isVerifyingFaceAuth ||
        faceAutoVerifyAttemptedRef.current
      ) {
        return;
      }

      const video = faceVideoRef.current;
      if (!video || video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
        faceAutoVerifyFrameRef.current = requestAnimationFrame(tryAutoVerify);
        return;
      }

      faceAutoVerifyRequestedRef.current = true;
      faceAutoVerifyAttemptedRef.current = true;
      faceAutoVerifyFrameRef.current = null;
      handleFaceAuthSubmit();
    };

    faceAutoVerifyFrameRef.current = requestAnimationFrame(tryAutoVerify);

    return () => {
      if (faceAutoVerifyFrameRef.current) {
        cancelAnimationFrame(faceAutoVerifyFrameRef.current);
        faceAutoVerifyFrameRef.current = null;
      }
    };
  }, [needsFaceAuth, isVerifyingFaceAuth, handleFaceAuthSubmit]);

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

    // Update parent App component's auth state immediately after successful login
    if (onAuthSuccess) {
      onAuthSuccess({
        isChecking: false,
        isAuthenticated: true,
      });
    }

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

  const getBiometricAvailability = (phone, responseData = {}) => {
    let localBiometric = getStoredBiometricConfig(phone);
    const backendCredentialIds = [
      ...(Array.isArray(responseData?.biometricCredentialIds)
        ? responseData.biometricCredentialIds
        : []),
      ...(responseData?.biometricCredentialId
        ? [responseData.biometricCredentialId]
        : []),
    ].filter(Boolean);

    if (
      !localBiometric?.credentialId &&
      (!Array.isArray(localBiometric?.credentialIds) ||
        localBiometric.credentialIds.length === 0) &&
      backendCredentialIds.length > 0
    ) {
      const stored = JSON.parse(
        localStorage.getItem("maxcode_biometric_credentials") || "{}",
      );
      stored[phone] = {
        credentialId: backendCredentialIds[0],
        credentialIds: [...new Set(backendCredentialIds)],
        enabled: true,
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(
        "maxcode_biometric_credentials",
        JSON.stringify(stored),
      );
      localBiometric = stored[phone];
    }

    const hasBiometricCredential =
      Boolean(localBiometric?.credentialId) ||
      (Array.isArray(localBiometric?.credentialIds) &&
        localBiometric.credentialIds.length > 0);

    return {
      localBiometric,
      hasBiometricCredential,
    };
  };

  const switchFromFingerprintTo2FA = () => {
    if (!pendingLoginData?.tempToken) {
      showError("2FA token not available. Please login again.");
      return;
    }

    setNeedsFingerprint(false);
    setNeedsUsbKey(false);
    setNeedsFaceAuth(false);
    setNeeds2FA(true);
    setTempToken(pendingLoginData.tempToken);
    setShowBackupOption(false);
    setFingerprintError("");
    setUsbKeyError("");
    showInfo("Enter your Two-Factor code to continue login");
  };

  const switchFromFingerprintToUsbKey = () => {
    if (!pendingLoginData?.tempToken) {
      showError("USB key token not available. Please login again.");
      return;
    }

    setNeedsFingerprint(false);
    setNeeds2FA(false);
    setNeedsFaceAuth(false);
    setNeedsUsbKey(true);
    setTempToken(pendingLoginData.tempToken);
    setFingerprintError("");
    setUsbKeyError("");
    setSelectedUsbFile(null);
    showInfo("Please Verify USB Security Key.");
  };

  const switchFromUsbKeyToFingerprint = () => {
    if (!pendingLoginData?.canUseFingerprint) {
      showError("Fingerprint is not configured on this device.");
      return;
    }

    setNeedsUsbKey(false);
    setNeeds2FA(false);
    setNeedsFaceAuth(false);
    setNeedsFingerprint(true);
    setUsbKeyError("");
    setSelectedUsbFile(null);
    showInfo("Please verify fingerprint to continue login.");
  };

  const switchFromUsbKeyToFaceAuth = () => {
    if (!pendingLoginData?.requiresFaceAuth) {
      showError("Face authentication is not enabled for this account.");
      return;
    }

    setNeedsUsbKey(false);
    setNeeds2FA(false);
    setNeedsFingerprint(false);
    setNeedsFaceAuth(true);
    setUsbKeyError("");
    setFaceAuthError("");
    showInfo("Please verify face authentication to continue login.");
  };

  const switchFromFaceAuthToUsbKey = () => {
    if (!pendingLoginData?.requiresUSBKey) {
      showError("USB key is not enabled for this account.");
      return;
    }

    setNeedsFaceAuth(false);
    setNeeds2FA(false);
    setNeedsFingerprint(false);
    setNeedsFaceAuth(false);
    setNeedsUsbKey(true);
    setFaceAuthError("");
    setUsbKeyError("");
    setSelectedUsbFile(null);
    showInfo("Please Verify USB Security Key.");
  };

  const switchToUsbKeyFrom2FA = () => {
    if (!tempToken && !pendingLoginData?.tempToken) {
      showError("USB key token not available. Please login again.");
      return;
    }

    setNeeds2FA(false);
    setNeedsFingerprint(false);
    setNeedsUsbKey(true);
    setTempToken(tempToken || pendingLoginData?.tempToken || null);
    setShowBackupOption(false);
    setErrors({});
    setUsbKeyError("");
    setSelectedUsbFile(null);
    showInfo("Please Verify USB Security Key.");
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
        credentialIds: localBiometric?.credentialIds,
      });

      if (pendingLoginData?.tempToken) {
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

  const handleUsbKeySubmit = async (e) => {
    e.preventDefault();

    const tokenForVerification =
      pendingLoginData?.tempToken ||
      tempToken ||
      pendingLoginData?.responseData?.tempToken;

    if (!tokenForVerification) {
      showError("USB key session expired. Please login again.");
      setNeedsUsbKey(false);
      return;
    }

    if (!selectedUsbFile) {
      setUsbKeyError(
        "Please select MaxCode-Accounting.sec from your pen drive",
      );
      return;
    }

    setIsVerifyingUsbKey(true);
    setUsbKeyError("");

    try {
      const fileText = await selectedUsbFile.text();
      const usbToken = await extractTokenFromUsbKeyFile({
        fileText,
        phone: pendingLoginData?.phone || mobile,
      });

      const response = await apiPost(API_ENPOINTS.AUTH.LOGIN, {
        action: "verify-usb-key",
        tempToken: tokenForVerification,
        usbToken,
      });

      completeLogin(
        response.data,
        response.data?.message || "USB key verified! Login successful",
      );
    } catch (error) {
      const message =
        error?.response?.data?.error ||
        error?.message ||
        "USB key verification failed";
      setUsbKeyError(message);
      showError(message);
    } finally {
      setIsVerifyingUsbKey(false);
    }
  };

  async function handleFaceAuthSubmit(e) {
    e?.preventDefault?.();

    const tokenForVerification =
      pendingLoginData?.tempToken ||
      tempToken ||
      pendingLoginData?.responseData?.tempToken;

    if (!tokenForVerification) {
      showError("Face authentication session expired. Please login again.");
      setNeedsFaceAuth(false);
      return;
    }

    if (!faceVideoRef.current) {
      setFaceAuthError("Camera is not ready. Please try again.");
      return;
    }

    setIsVerifyingFaceAuth(true);
    setFaceAuthError("");

    try {
      const result = await extractFaceDescriptorFromVideo(faceVideoRef.current, {
        includeExpressions: false,
        inputSize: 128,
      });

      const response = await apiPost(API_ENPOINTS.AUTH.LOGIN, {
        action: "verify-face-auth",
        tempToken: tokenForVerification,
        descriptor: result.descriptor,
      });

      completeLogin(
        response.data,
        response.data?.message || "Face verified! Login successful",
      );
    } catch (error) {
      const message =
        error?.response?.data?.error ||
        error?.message ||
        "Face authentication verification failed";
      setFaceAuthError(message);
      showError(message);
    } finally {
      setIsVerifyingFaceAuth(false);
    }
  }

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

        // Update parent App component's auth state immediately after successful 2FA verification
        if (onAuthSuccess) {
          onAuthSuccess({
            isChecking: false,
            isAuthenticated: true,
          });
        }

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

    if (captchaEnabled && !captchaToken) {
      const captchaMessage =
        captchaError || "Please complete the Cloudflare security check";
      setErrors((prev) => ({ ...prev, captcha: captchaMessage }));
      showError(captchaMessage);
      return;
    }

    setLoading(true);

    try {
      // Call the actual API endpoint
      const response = await apiPost(API_ENPOINTS.AUTH.LOGIN, {
        action: "login",
        phone: mobile,
        pin: enteredPin,
        turnstileToken: captchaEnabled ? captchaToken : undefined,
      });

      const fingerprintLoginEnabled =
        response?.data?.fingerprintLoginEnabled === true;
      const usbKeyLoginEnabled = response?.data?.usbKeyLoginEnabled === true;
      const faceAuthEnabled = response?.data?.faceAuthEnabled === true;
      const biometricState = fingerprintLoginEnabled
        ? getBiometricAvailability(mobile, response.data)
        : { localBiometric: null, hasBiometricCredential: false };

      if (fingerprintLoginEnabled) {
        const { hasBiometricCredential } = biometricState;

        if (!hasBiometricCredential) {
          if (response.data.needs2FA && response.data.tempToken) {
            setTempToken(response.data.tempToken);
            setPendingLoginData({
              phone: mobile,
              requires2FA: true,
              requiresUSBKey: response.data.needsUSBKey === true,
              requiresFaceAuth: response.data.needsFaceAuth === true,
              requiresFingerprint: true,
              canUseFingerprint: false,
              tempToken: response.data.tempToken,
              responseData: response.data,
            });
            setNeeds2FA(true);
            setNeedsUsbKey(false);
            setShowBackupOption(false);
            showInfo(
              response.data.needsUSBKey
                ? "Fingerprint not configured on this device. Continue with 2FA or USB key."
                : "Fingerprint is enabled but this device is not registered. Continue with Two-Factor code.",
            );
            return;
          }

          showError(
            "Fingerprint is enabled but not configured on this device. Login from registered device or disable fingerprint in settings.",
          );
          setPin(["", "", "", "", "", ""]);
          return;
        }
      }

      if (usbKeyLoginEnabled && response.data.tempToken) {
        setPendingLoginData({
          phone: mobile,
          requires2FA: response.data.needs2FA === true,
          requiresUSBKey: true,
          requiresFaceAuth: response.data.needsFaceAuth === true,
          requiresFingerprint: fingerprintLoginEnabled,
          canUseFingerprint: biometricState.hasBiometricCredential,
          tempToken: response.data.tempToken,
          responseData: response.data,
        });
        setTempToken(response.data.tempToken);
        setNeedsUsbKey(true);
        setNeeds2FA(false);
        setNeedsFingerprint(false);
        setNeedsFaceAuth(false);
        setShowBackupOption(false);
        setUsbKeyError("");
        setFaceAuthError("");
        setSelectedUsbFile(null);
        showInfo("PIN verified. Please verify your USB Security Key.");
        return;
      }

      if (faceAuthEnabled && response.data.tempToken) {
        setPendingLoginData({
          phone: mobile,
          requires2FA: response.data.needs2FA === true,
          requiresUSBKey: response.data.needsUSBKey === true,
          requiresFaceAuth: true,
          requiresFingerprint: fingerprintLoginEnabled,
          canUseFingerprint: biometricState.hasBiometricCredential,
          tempToken: response.data.tempToken,
          responseData: response.data,
        });
        setTempToken(response.data.tempToken);
        setNeedsFaceAuth(true);
        setNeedsUsbKey(false);
        setNeeds2FA(false);
        setNeedsFingerprint(false);
        setShowBackupOption(false);
        setFaceAuthError("");
        setUsbKeyError("");
        showInfo("PIN verified. Please verify Face Authentication.");
        return;
      }

      if (fingerprintLoginEnabled) {
        setPendingLoginData({
          phone: mobile,
          requires2FA: response.data.needs2FA === true,
          requiresUSBKey: response.data.needsUSBKey === true,
          requiresFaceAuth: response.data.needsFaceAuth === true,
          requiresFingerprint: true,
          canUseFingerprint: biometricState.hasBiometricCredential,
          tempToken: response.data.tempToken || null,
          responseData: response.data,
        });
        setNeedsFingerprint(true);
        setNeedsUsbKey(false);
        setNeeds2FA(false);
        setNeedsFaceAuth(false);
        setShowBackupOption(false);
        setTwoFACode(["", "", "", "", "", ""]);
        setBackupCode(["", "", "", "", "", "", "", ""]);
        setFingerprintError("");
        setUsbKeyError("");
        setFaceAuthError("");
        showInfo(
          response.data.needs2FA
            ? response.data.needsUSBKey
              ? "PIN verified. Verify fingerprint, or choose 2FA / USB key login."
              : "PIN verified. Verify fingerprint to login, or choose Login using 2 Factor."
            : "PIN verified. Please verify fingerprint to login.",
        );
        return;
      }

      // If 2FA is required
      if (response.data.needs2FA && response.data.tempToken) {
        setTempToken(response.data.tempToken);
        setPendingLoginData({
          phone: mobile,
          requires2FA: true,
          requiresUSBKey: response.data.needsUSBKey === true,
          requiresFaceAuth: response.data.needsFaceAuth === true,
          requiresFingerprint: false,
          canUseFingerprint: false,
          tempToken: response.data.tempToken,
          responseData: response.data,
        });
        setNeeds2FA(true);
        setNeedsUsbKey(false);
        setNeedsFingerprint(false);
        setNeedsFaceAuth(false);
        setShowBackupOption(false); // Reset to 2FA mode
        showInfo(
          response.data.needsUSBKey
            ? "PIN verified! Enter 2FA code or choose USB key option."
            : "✓ PIN verified! Please enter your 2FA code from your authenticator app",
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
    <div
      className="login-shell min-vh-100 d-flex align-items-center justify-content-center p-3"
      style={{
        background:
          "radial-gradient(circle at 10% 18%, rgba(212, 143, 63, 0.2) 0%, transparent 34%), radial-gradient(circle at 86% 82%, rgba(61, 126, 145, 0.2) 0%, transparent 35%), linear-gradient(132deg, #f7f2e9 0%, #fdf8ef 45%, #edf5f7 100%)",
      }}
    >
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
        className="card road-board-card border-0 shadow-2xl rounded-4 overflow-hidden"
        style={{
          maxWidth: "1100px",
          width: "100%",
          background: "rgba(255, 255, 255, 0.95)",
          backdropFilter: "blur(10px)",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
        }}
      >
        <div className="row g-0">
          {/* Left Side: New Operations Cockpit Design */}
          <div className="col-lg-7 p-5 d-none d-lg-flex flex-column position-relative overflow-hidden login-left-cockpit">
            <div
              className="cockpit-aura cockpit-aura-one"
              aria-hidden="true"
            ></div>
            <div
              className="cockpit-aura cockpit-aura-two"
              aria-hidden="true"
            ></div>
            <div className="cockpit-grid" aria-hidden="true"></div>

            <div className="position-relative z-1 d-flex flex-column justify-content-between h-100">
              <div>
                <span className="cockpit-chip fs-5">MaxCode IT Services</span>
                <h1 className="display-5 fw-bold mb-3 text-white cockpit-heading">
                  Welcome Back,
                  <br />
                  <span className="cockpit-heading-accent">
                    Vipin Khandelwal
                  </span>
                </h1>

                {captchaEnabled && isDesktopCaptcha && (
                  <div className="mt-4 d-flex justify-content-start">
                    <div
                      className="captcha-shell captcha-desktop-shell"
                      style={{ width: "fit-content", maxWidth: 420, minHeight: 80 }}
                    >
                      <div ref={captchaContainerRef} />
                    </div>
                  </div>
                )}
              </div>

              <div className="cockpit-metrics-wrap">
                <div
                  className="cockpit-process"
                  aria-label="Login process steps"
                >
                  <div className="cockpit-step">
                    <span className="cockpit-step-node">
                      <i className="fas fa-mobile-screen-button"></i>
                    </span>
                    <div className="cockpit-step-content">
                      <div className="cockpit-step-title">Identify User</div>
                      <div className="cockpit-step-sub">
                        Mobile number match
                      </div>
                    </div>
                  </div>

                  <div className="cockpit-step">
                    <span className="cockpit-step-node">
                      <i className="fas fa-key"></i>
                    </span>
                    <div className="cockpit-step-content">
                      <div className="cockpit-step-title">Validate PIN</div>
                      <div className="cockpit-step-sub">
                        6-digit verification
                      </div>
                    </div>
                  </div>

                  <div className="cockpit-step">
                    <span className="cockpit-step-node">
                      <i className="fas fa-user-shield"></i>
                    </span>
                    <div className="cockpit-step-content">
                      <div className="cockpit-step-title">Security Layer</div>
                      <div className="cockpit-step-sub">
                        2FA, fingerprint & USB
                      </div>
                    </div>
                  </div>

                  <div className="cockpit-step">
                    <span className="cockpit-step-node">
                      <i className="fas fa-gauge-high"></i>
                    </span>
                    <div className="cockpit-step-content">
                      <div className="cockpit-step-title">Dashboard Access</div>
                      <div className="cockpit-step-sub">Secure session</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Side: Enhanced Login Form */}
          <div className="col-lg-5 p-4 p-xl-5 bg-white">
            <div className="d-flex flex-column h-100">
              {!needsFaceAuth && (
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
              )}

              <form
                onSubmit={
                  needsFingerprint
                    ? handleFingerprintSubmit
                    : needsUsbKey
                      ? handleUsbKeySubmit
                      : needsFaceAuth
                        ? handleFaceAuthSubmit
                      : needs2FA
                        ? handle2FASubmit
                        : handleSubmit
                }
                className="flex-grow-1"
              >
                {!needs2FA && !needsFingerprint && !needsUsbKey && !needsFaceAuth ? (
                  <>
                    {/* Mobile Number Field */}
                    <div className="mb-3">
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
                          placeholder="9876543210"
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
                    <div className="mb-3">
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

                      {captchaEnabled && !isDesktopCaptcha && (
                        <div className="mt-3 mb-2 d-flex justify-content-center">
                          <div className="captcha-shell" style={{ width: "100%", minHeight: 80 }}>
                            <div ref={captchaContainerRef} />
                          </div>
                          {!captchaSiteKey && !captchaError && (
                            <div className="text-danger small mt-2 text-center">
                              Captcha is enabled but not configured.
                            </div>
                          )}
                          {captchaError && (
                            <div className="error-message mt-2 text-center">
                              <i className="fas fa-exclamation-circle me-1"></i>
                              {captchaError}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Submit Button */}
                    <button
                      type="submit"
                      disabled={
                        loading ||
                        !mobile ||
                        !isPinComplete ||
                        (captchaEnabled && !captchaToken)
                      }
                      className="btn btn-lg w-100 py-3 rounded-3 fw-semibold text-white position-relative overflow-hidden"
                      style={{
                        border: "none",
                        background: "var(--header-gradient)",
                        cursor:
                          loading || !mobile || !isPinComplete || (captchaEnabled && !captchaToken)
                            ? "not-allowed"
                            : "pointer",
                        opacity:
                          loading ||
                          !mobile ||
                          !isPinComplete ||
                          (captchaEnabled && !captchaToken)
                            ? 0.8
                            : 1,
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
                    <div className="mb-2 text-center">
                      <h4 className="fw-semibold mb-2">Verify Fingerprint</h4>
                    </div>

                    <div className="mb-2">
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

                    <div className="d-flex justify-content-between mt-3 flex-wrap gap-2 auth-alt-actions">
                      {pendingLoginData?.requires2FA && (
                        <button
                          type="button"
                          onClick={switchFromFingerprintTo2FA}
                          className="btn btn-link text-decoration-none p-0 fw-bold auth-alt-link"
                          style={{ color: "var(--primary-color)" }}
                        >
                          <i className="fas fa-shield-alt me-2"></i>
                          Login using 2 Factor
                        </button>
                      )}

                      {pendingLoginData?.requiresUSBKey && (
                        <button
                          type="button"
                          onClick={switchFromFingerprintToUsbKey}
                          className="btn btn-link text-decoration-none p-0 fw-bold auth-alt-link"
                          style={{ color: "#007026" }}
                        >
                          <i className="fa-brands fa-usb me-2"></i>
                          Login using USB Key
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setNeedsFingerprint(false);
                          setNeedsUsbKey(false);
                          setNeedsFaceAuth(false);
                          setPendingLoginData(null);
                          setFingerprintError("");
                          setUsbKeyError("");
                          setFaceAuthError("");
                          setSelectedUsbFile(null);
                          setPin(["", "", "", "", "", ""]);
                          setErrors({});
                        }}
                        className="btn btn-link p-0 fw-bold auth-alt-link auth-back-link"
                        style={{ color: "#c17c00" }}
                      >
                        <i className="fas fa-arrow-left me-2"></i>
                        Back to Login
                      </button>
                    </div>
                  </>
                ) : needsUsbKey ? (
                  <>
                    <div className="mb-2 text-center">
                      <h4 className="fw-semibold mb-2">
                        Verify USB Security Key
                      </h4>
                    </div>

                    <div className="mb-2">
                      <div className="card bg-light">
                        <div
                          className="card-body text-center py-3"
                          style={{ border: "2px dashed #007026" }}
                        >
                          <i
                            className="fa-brands fa-usb fs-1 mb-3"
                            style={{ color: "#007026" }}
                          ></i>
                          <input
                            ref={usbFileInputRef}
                            type="file"
                            accept=".sec,.txt,application/octet-stream"
                            className="form-control"
                            onChange={(event) => {
                              const selectedFile =
                                event.target.files?.[0] || null;
                              setSelectedUsbFile(selectedFile);
                              setUsbKeyError("");
                            }}
                          />
                        </div>
                      </div>

                      {selectedUsbFile && (
                        <div className="small text-success mt-2 text-center">
                          <i className="fas fa-check-circle me-1"></i>
                          Selected: {selectedUsbFile.name}
                        </div>
                      )}

                      {usbKeyError && (
                        <div className="error-message mt-2 text-center">
                          <i className="fas fa-exclamation-circle me-1"></i>
                          {usbKeyError}
                        </div>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={isVerifyingUsbKey}
                      className="btn btn-lg w-100 py-2 rounded-3 fw-semibold text-white position-relative overflow-hidden"
                      style={{
                        background: "var(--header-gradient)",
                        border: "none",
                        opacity: isVerifyingUsbKey ? 0.8 : 1,
                        transition: "all 0.3s ease",
                      }}
                    >
                      {isVerifyingUsbKey ? (
                        <div className="d-flex align-items-center justify-content-center gap-3">
                          <div
                            className="spinner-border spinner-border-sm"
                            role="status"
                          ></div>
                          <span>Verifying USB key...</span>
                        </div>
                      ) : (
                        <div className="d-flex align-items-center justify-content-center gap-3">
                          <i className="fa-brands fa-usb"></i>
                          <span>Verify USB Key</span>
                        </div>
                      )}
                    </button>

                    <div className="d-flex justify-content-between mt-3 flex-wrap gap-2 auth-alt-actions">
                      {pendingLoginData?.requiresFingerprint &&
                        pendingLoginData?.canUseFingerprint && (
                          <button
                            type="button"
                            onClick={switchFromUsbKeyToFingerprint}
                            className="btn btn-link text-decoration-none p-0 fw-bold auth-alt-link"
                            style={{ color: "#007026" }}
                          >
                            <i className="fas fa-fingerprint me-1"></i>
                            Login using Fingerprint
                          </button>
                        )}

                      {pendingLoginData?.requires2FA && (
                        <button
                          type="button"
                          onClick={() => {
                            setNeedsUsbKey(false);
                            setNeeds2FA(true);
                            setShowBackupOption(false);
                            setUsbKeyError("");
                            setErrors({});
                          }}
                          className="btn btn-link text-decoration-none p-0 fw-bold auth-alt-link"
                          style={{ color: "var(--primary-color)" }}
                        >
                          <i className="fas fa-shield-alt me-1"></i>
                          Login using 2 Factor
                        </button>
                      )}

                      {pendingLoginData?.requiresFaceAuth && (
                        <button
                          type="button"
                          onClick={switchFromUsbKeyToFaceAuth}
                          className="btn btn-link text-decoration-none p-0 fw-bold auth-alt-link"
                          style={{ color: "var(--primary-color)" }}
                        >
                          <i className="fas fa-camera me-1"></i>
                          Face Authentication
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => {
                          setNeedsUsbKey(false);
                          setNeedsFaceAuth(false);
                          setPendingLoginData(null);
                          setUsbKeyError("");
                          setFaceAuthError("");
                          setSelectedUsbFile(null);
                          setPin(["", "", "", "", "", ""]);
                          setErrors({});
                        }}
                        className="btn btn-link p-0 fw-bold auth-alt-link auth-back-link"
                        style={{ color: "#c17c00" }}
                      >
                        <i className="fas fa-arrow-left me-2"></i>
                        Back to Login
                      </button>
                    </div>
                  </>
                ) : needsFaceAuth ? (
                  <>
                    <div className="mb-2">
                      <div className="card bg-light border-0">
                        <div
                          className="card-body p-2"
                          style={{ border: "2px dashed #1c7c93" }}
                        >
                          <div
                            className="rounded-3 overflow-hidden"
                            style={{ minHeight: "240px", background: "#0f172a" }}
                          >
                            <video
                              ref={faceVideoRef}
                              autoPlay
                              muted
                              playsInline
                              className="w-100"
                              style={{
                                height: "240px",
                                objectFit: "cover",
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      {faceAuthError && (
                        <div className="error-message mt-2 text-center">
                          <i className="fas fa-exclamation-circle me-1"></i>
                          {faceAuthError}
                        </div>
                      )}

                    </div>

                    <button
                      ref={faceVerifyButtonRef}
                      type="submit"
                      disabled={isVerifyingFaceAuth}
                      className="btn btn-lg w-100 py-2 rounded-3 fw-semibold text-white position-relative overflow-hidden"
                      style={{
                        background: "var(--header-gradient)",
                        border: "none",
                        opacity: isVerifyingFaceAuth ? 0.8 : 1,
                        transition: "all 0.3s ease",
                      }}
                    >
                      <i className="fas fa-camera me-2"></i>
                      {isVerifyingFaceAuth ? "Verifying face..." : "Verify Face"}
                    </button>

                    <div className="d-flex justify-content-between align-items-center mt-3 flex-wrap gap-2 auth-alt-actions">
                      <button
                        type="button"
                        onClick={() => {
                          setNeedsFaceAuth(false);
                          setNeedsFingerprint(false);
                          setNeedsUsbKey(false);
                          setPendingLoginData(null);
                          setFaceAuthError("");
                          setFingerprintError("");
                          setUsbKeyError("");
                          setPin(["", "", "", "", "", ""]);
                          setErrors({});
                        }}
                        className="btn btn-link p-0 fw-bold auth-alt-link auth-back-link"
                        style={{ color: "#c17c00" }}
                      >
                        <i className="fas fa-arrow-left me-2"></i>
                        Back to Login
                      </button>

                      {pendingLoginData?.requiresUSBKey ? (
                        <button
                          type="button"
                          onClick={switchFromFaceAuthToUsbKey}
                          className="btn btn-link text-decoration-none p-0 fw-semibold auth-alt-link"
                          style={{ color: "#007026" }}
                        >
                          <i className="fa-brands fa-usb me-2"></i>
                          Verify USB Security Key
                        </button>
                      ) : (
                        <span />
                      )}
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
                        {pendingLoginData?.requiresUSBKey ? (
                          <button
                            type="button"
                            onClick={switchToUsbKeyFrom2FA}
                            className="btn btn-link p-0 text-decoration-none"
                            style={{
                              color: "#c17c00",
                              fontSize: "0.875rem",
                            }}
                          >
                            <i className="fa-brands fa-usb me-1"></i>
                            Use USB Key
                          </button>
                        ) : (
                          <span className="text-muted small">
                            <i
                              className="fas fa-info-circle me-1"
                              style={{ color: "var(--primary-color)" }}
                            ></i>
                            {isCodeComplete
                              ? "Code ready to verify"
                              : "Enter your verification code"}
                          </span>
                        )}

                        {/* Try Other Option Link */}
                        <div className="d-flex align-items-center gap-3 flex-wrap justify-content-end">
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
                      className="btn btn-lg w-100 py-2 rounded-3 fw-semibold text-white position-relative overflow-hidden"
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
                        setNeedsUsbKey(false);
                        setNeedsFaceAuth(false);
                        setTempToken(null);
                        setPendingLoginData(null);
                        setTwoFACode(["", "", "", "", "", ""]);
                        setBackupCode(["", "", "", "", "", "", "", ""]);
                        setShowBackupOption(false);
                        setFingerprintError("");
                        setUsbKeyError("");
                        setFaceAuthError("");
                        setSelectedUsbFile(null);
                        setErrors({});
                      }}
                      className="btn btn-link w-100 mt-3 auth-back-link"
                      style={{ color: "#c17c00" }}
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
      <style>{`
        @import url("https://fonts.cdnfonts.com/css/geom-graphic");

        :root {
          --primary-color: #007026;
          --primary-light: #e8f5e9;
          --primary-dark: #004d1a;
          --error: #dc3545;
        }

        /* Provide 3D perspective for card flip */
        .login-shell {
          perspective: 1200px;
        }

        .login-left-cockpit {
          min-height: 440px;
          background:
            radial-gradient(circle at 18% 16%, rgba(255, 255, 255, 0.16), transparent 34%),
            linear-gradient(155deg, #063528 0%, #0b5d45 44%, #078f6f 100%);
        }

        .road-board-card {
          position: relative;
          border: 4px solid #5f6772 !important;
          border-radius: 22px !important;
          box-shadow:
            0 28px 48px rgba(21, 28, 38, 0.34),
            0 0 0 2px rgba(240, 245, 255, 0.8) inset,
            0 0 0 10px rgba(67, 73, 84, 0.22) inset;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.97) 0%, rgba(246, 250, 255, 0.94) 100%),
            repeating-linear-gradient(
              -10deg,
              rgba(54, 64, 82, 0.03) 0,
              rgba(54, 64, 82, 0.03) 12px,
              rgba(255, 255, 255, 0.03) 12px,
              rgba(255, 255, 255, 0.03) 24px
            );
          /* Flip animation (card entrance) */
          transform-style: preserve-3d;
          animation: cardFlip 1.2s cubic-bezier(0.68, -0.55, 0.265, 1.55);
        }

        .road-board-card::before,
        .road-board-card::after {
          content: "";
          position: absolute;
          width: 34px;
          height: 14px;
          top: -10px;
          border-radius: 10px;
          background:
            radial-gradient(circle at 50% 35%, rgba(255, 228, 138, 0.88) 0%, rgba(255, 228, 138, 0) 56%),
            linear-gradient(180deg, #949ca9 0%, #69707d 100%);
          border: 1px solid rgba(63, 70, 80, 0.6);
          box-shadow:
            0 5px 8px rgba(28, 33, 41, 0.3),
            0 22px 30px rgba(255, 214, 92, 0.5),
            0 62px 82px rgba(255, 198, 64, 0.34),
            0 118px 150px rgba(255, 186, 48, 0.2);
          filter: saturate(1.1);
          z-index: 4;
          animation: clampGlowBounce 2.8s ease-in-out infinite;
        }

        .road-board-card::before {
          left: 52px;
        }

        .road-board-card::after {
          right: 52px;
          animation-delay: 1.1s;
        }

        .road-board-card .row {
          position: relative;
        }

        .road-board-card .row::before {
          content: "";
          position: absolute;
          inset: 10px;
          pointer-events: none;
          border-radius: 16px;
          border: 2px dashed rgba(108, 120, 138, 0.35);
        }

        .cockpit-grid {
          position: absolute;
          inset: 0;
          opacity: 0.28;
          background-image:
            linear-gradient(rgba(255, 255, 255, 0.18) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.18) 1px, transparent 1px);
          background-size: 36px 36px;
          mask-image: radial-gradient(circle at 28% 40%, black 32%, transparent 78%);
        }

        .cockpit-aura {
          position: absolute;
          border-radius: 999px;
          filter: blur(8px);
          animation: cockpitAura 6s ease-in-out infinite;
        }

        .cockpit-aura-one {
          width: 280px;
          height: 280px;
          top: -90px;
          right: -90px;
          background: radial-gradient(circle, rgba(255, 255, 255, 0.5) 0%, transparent 72%);
        }

        .cockpit-aura-two {
          width: 210px;
          height: 210px;
          bottom: -60px;
          left: -70px;
          background: radial-gradient(circle, rgba(239, 255, 245, 0.36) 0%, transparent 74%);
          animation-delay: 1.4s;
        }

        .cockpit-chip {
          display: inline-block;
          padding: 0.35rem 0.85rem;
          border: 1px solid rgba(255, 255, 255, 0.3);
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.11);
          color: #e6fff4;
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          margin-bottom: 1rem;
        }

        .cockpit-heading {
          font-family: "Geom Graphic", "Geom", "Segoe UI", sans-serif;
          line-height: 1.14;
          letter-spacing: 0.01em;
        }

        .cockpit-heading-accent {
          color: #d0ffe9;
          border-bottom: 3px solid rgba(208, 255, 233, 0.38);
          padding-bottom: 0.12rem;
        }

        .cockpit-subtitle {
          max-width: 88%;
          color: rgba(243, 255, 249, 0.94);
        }

        .cockpit-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: #c8ffe4;
          box-shadow: 0 0 0 0 rgba(200, 255, 228, 0.5);
          animation: cockpitPing 2.2s ease-out infinite;
        }

        /* Strengthen 3D rendering and prevent flicker */
        .road-board-card {
          transform-origin: center center;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          will-change: transform, opacity;
        }

        .road-board-card * {
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
        }

        /* Card flip keyframes reused from minimalist variant */
        @keyframes cardFlip {
          0% {
            opacity: 0;
            transform: rotateY(90deg) rotateX(15deg) scale(0.8);
          }
          50% {
            opacity: 0.8;
            transform: rotateY(45deg) rotateX(8deg) scale(0.95);
          }
          100% {
            opacity: 1;
            transform: rotateY(0) rotateX(0) scale(1);
          }
        }

        .cockpit-dot:nth-child(2) {
          animation-delay: 0.35s;
        }

        .cockpit-dot:nth-child(3) {
          animation-delay: 0.7s;
        }

        .cockpit-process {
          position: relative;
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 0.75rem;
          padding-top: 0.2rem;
        }

        .cockpit-process::before {
          content: "";
          position: absolute;
          left: 8%;
          right: 8%;
          top: 17px;
          height: 2px;
          background: linear-gradient(
            90deg,
            rgba(198, 255, 230, 0.28) 0%,
            rgba(198, 255, 230, 0.88) 52%,
            rgba(198, 255, 230, 0.28) 100%
          );
        }

        .cockpit-step {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          z-index: 1;
        }

        .cockpit-step-node {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          margin-bottom: 0.50rem;
          display: grid;
          place-items: center;
          background: linear-gradient(145deg, rgba(255, 255, 255, 0.28), rgba(255, 255, 255, 0.1));
          border: 1px solid rgba(255, 255, 255, 0.28);
          color: #dfffee;
          font-size: 0.82rem;
          box-shadow: 0 0 0 0 rgba(200, 255, 228, 0.45);
          animation: cockpitNodePulse 2.8s ease-out infinite;
        }

        .cockpit-step:nth-child(2) .cockpit-step-node {
          animation-delay: 0.35s;
        }

        .cockpit-step:nth-child(3) .cockpit-step-node {
          animation-delay: 0.7s;
        }

        .cockpit-step:nth-child(4) .cockpit-step-node {
          animation-delay: 1.05s;
        }

        .cockpit-step-content {
          margin-top: 0.45rem;
          padding: 0.4rem 0.35rem;
          border-radius: 10px;
          background: linear-gradient(
            145deg,
            rgba(255, 255, 255, 0.14),
            rgba(255, 255, 255, 0.03)
          );
          border: 1px solid rgba(255, 255, 255, 0.16);
          min-height: 36px;
          width: 100%;
        }

        .cockpit-step-title {
          color: #f2fff8;
          font-size: 0.74rem;
          font-weight: 700;
          letter-spacing: 0.02em;
          line-height: 1.2;
        }

        .cockpit-step-sub {
          color: rgba(228, 255, 245, 0.82);
          font-size: 0.64rem;
          margin-top: 0.12rem;
          line-height: 1.2;
        }

        .cockpit-bottom-note {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          color: rgba(232, 255, 246, 0.92);
          font-size: 0.75rem;
          font-weight: 600;
          letter-spacing: 0.04em;
        }

        .cockpit-bottom-note .note-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #c6ffe6;
          animation: cockpitPing 2.4s ease-out infinite;
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

        @keyframes cockpitAura {
          0%,
          100% {
            transform: scale(1);
            opacity: 0.5;
          }
          50% {
            transform: scale(1.12);
            opacity: 0.7;
          }
        }

        @keyframes clampGlowBounce {
          0%,
          100% {
            box-shadow:
              0 5px 8px rgba(28, 33, 41, 0.3),
              0 18px 24px rgba(255, 214, 92, 0.42),
              0 54px 70px rgba(255, 198, 64, 0.28),
              0 98px 126px rgba(255, 186, 48, 0.16);
          }
          50% {
            box-shadow:
              0 5px 8px rgba(28, 33, 41, 0.3),
              0 28px 38px rgba(255, 214, 92, 0.62),
              0 78px 100px rgba(255, 198, 64, 0.42),
              0 138px 176px rgba(255, 186, 48, 0.26);
          }
        }

        @keyframes cockpitPing {
          0% {
            box-shadow: 0 0 0 0 rgba(200, 255, 228, 0.52);
          }
          100% {
            box-shadow: 0 0 0 14px rgba(200, 255, 228, 0);
          }
        }

        @keyframes cockpitNodePulse {
          0% {
            box-shadow: 0 0 0 0 rgba(200, 255, 228, 0.45);
          }
          100% {
            box-shadow: 0 0 0 12px rgba(200, 255, 228, 0);
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
        
        .captcha-shell {
          width: 100%;
          max-width: 100%;
          display: flex;
          justify-content: center;
          align-items: center;
          box-sizing: border-box;
        }

        .captcha-desktop-shell {
          width: fit-content;
          justify-content: flex-start;
          align-items: flex-start;
        }

        /* Responsive */
        @media (max-width: 768px) {
          .road-board-card {
            border-width: 3px !important;
            border-radius: 16px !important;
          }

          .road-board-card::before,
          .road-board-card::after {
            width: 26px;
            height: 11px;
            top: -8px;
            box-shadow:
              0 4px 6px rgba(28, 33, 41, 0.28),
              0 14px 18px rgba(221, 166, 4, 0.78),
              0 40px 54px rgba(215, 151, 1, 0.82),
              0 74px 96px rgba(255, 186, 48, 0.83);
          }

          .road-board-card::before {
            left: 28px;
          }

          .road-board-card::after {
            right: 28px;
          }

          .login-left-cockpit {
            min-height: 400px;
          }

          .cockpit-process {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            row-gap: 0.6rem;
          }

          .cockpit-process::before {
            display: none;
          }

          .pin-container {
            gap: 4px;
          }
          .backup-pin-input {
            font-size: 1rem;
          }

          .captcha-shell {
            width: auto !important;
            max-width: 100% !important;
            display: inline-flex;
            padding: 0 !important;
            border: 0 !important;
            border-radius: 0 !important;
            background: transparent !important;
            min-height: auto !important;
            transform: scale(0.95);
            transform-origin: center top;
          }

          .auth-alt-actions {
            display: flex !important;
            flex-wrap: wrap;
            justify-content: space-between !important;
            gap: 6px 10px !important;
            align-items: start;
          }

          .auth-alt-actions > .auth-alt-link,
          .auth-alt-actions > .auth-back-link {
            width: calc(50% - 5px);
            white-space: nowrap !important;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .auth-alt-link,
          .auth-back-link {
            font-size: 0.78rem !important;
            line-height: 1.2 !important;
            text-align: left !important;
          }

          .auth-alt-link i,
          .auth-back-link i {
            font-size: 0.72rem;
          }
        }
      `}</style>
    </div>
  );
};

export default Login;
