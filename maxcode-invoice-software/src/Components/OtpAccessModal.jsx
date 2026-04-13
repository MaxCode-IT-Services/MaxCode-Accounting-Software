import React, { useEffect, useMemo, useState } from "react";
import { apiPost } from "../utils/api";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { showError, showInfo, showSuccess } from "./ToastNotification";

const DEFAULT_MAX_SENDS = 3;

const OtpAccessModal = ({
  show,
  onClose,
  operation = "view",
  credentialType = "project-credentials",
  targetRecord = null,
  onVerified,
}) => {
  const [purpose, setPurpose] = useState("");
  const [recipientMode, setRecipientMode] = useState("founder");
  const [otpDigits, setOtpDigits] = useState(["", "", "", "", "", ""]);

  const [requestId, setRequestId] = useState("");
  const [sendCount, setSendCount] = useState(0);
  const [maxSends, setMaxSends] = useState(DEFAULT_MAX_SENDS);
  const [resendAvailableAt, setResendAvailableAt] = useState("");
  const [verifyWindowUntil, setVerifyWindowUntil] = useState("");
  const [otpExpiresAt, setOtpExpiresAt] = useState("");

  const [isSending, setIsSending] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [tickNow, setTickNow] = useState(Date.now());

  const isMySoftwareCredential =
    String(credentialType || "")
      .trim()
      .toLowerCase() === "my-software-credential";

  const hasSentOtp = Boolean(requestId);

  useEffect(() => {
    if (!show) return;

    const timer = setInterval(() => {
      setTickNow(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, [show]);

  useEffect(() => {
    if (!show) {
      setPurpose("");
      setRecipientMode("founder");
      setRequestId("");
      setOtpDigits(["", "", "", "", "", ""]);
      setSendCount(0);
      setMaxSends(DEFAULT_MAX_SENDS);
      setResendAvailableAt("");
      setVerifyWindowUntil("");
      setOtpExpiresAt("");
      setIsSending(false);
      setIsResending(false);
      setIsVerifying(false);
    }
  }, [show]);

  const countdownToResend = useMemo(() => {
    if (!resendAvailableAt) return 0;
    const target = new Date(resendAvailableAt).getTime();
    if (!Number.isFinite(target)) return 0;
    return Math.max(Math.ceil((target - tickNow) / 1000), 0);
  }, [resendAvailableAt, tickNow]);

  const canResend =
    hasSentOtp && countdownToResend <= 0 && sendCount < maxSends;

  const verifyWindowSecondsLeft = useMemo(() => {
    if (!verifyWindowUntil) return 0;
    const target = new Date(verifyWindowUntil).getTime();
    if (!Number.isFinite(target)) return 0;
    return Math.max(Math.ceil((target - tickNow) / 1000), 0);
  }, [verifyWindowUntil, tickNow]);

  const needsClientSelection =
    recipientMode === "client" || recipientMode === "both";

  const clientDisplayName = String(targetRecord?.clientName || "").trim();
  const clientDisplayPhone = String(
    targetRecord?.clientPhoneNumber || targetRecord?.phoneNumber || "",
  )
    .replace(/\D+/g, "")
    .slice(-10);

  const clientLine =
    clientDisplayName && clientDisplayPhone
      ? `${clientDisplayName} - ${clientDisplayPhone}`
      : clientDisplayName
        ? clientDisplayName
        : "Client not linked";

  const bothLine = `Founder & CEO and ${clientDisplayName || "Client Name"}`;
  const recipientSummary = useMemo(() => {
    if (isMySoftwareCredential) {
      return `OTP sent to: Founder & CEO`;
    }

    if (recipientMode === "both") {
      return `OTP sent to: ${bothLine}`;
    }

    if (recipientMode === "client") {
      return `OTP sent to: ${clientLine}`;
    }

    return `OTP sent to: Founder & CEO`;
  }, [isMySoftwareCredential, recipientMode, bothLine, clientLine]);

  const resolveLoggedInUser = () => {
    const parseJson = (value) => {
      try {
        return value ? JSON.parse(value) : null;
      } catch {
        return null;
      }
    };

    const userInfo = parseJson(localStorage.getItem("user_info")) || {};
    const legacyUser = parseJson(localStorage.getItem("user")) || {};
    const user = { ...legacyUser, ...userInfo };

    const nameFromProfile = String(
      user.name ||
        user.fullName ||
        user.displayName ||
        user.userName ||
        user.username ||
        "",
    ).trim();
    const phoneFromProfile = String(
      user.phone ||
        user.mobile ||
        user.phoneNumber ||
        user.whatsappNumber ||
        "",
    )
      .replace(/\D+/g, "")
      .slice(-10);
    const emailFallback = String(user.email || user.emailAddress || "")
      .trim()
      .split("@")[0]
      .replace(/[._]+/g, " ")
      .replace(/\b\w/g, (match) => match.toUpperCase());

    return {
      name: nameFromProfile || emailFallback || "Team Member",
      phone: phoneFromProfile,
    };
  };

  const otpValue = otpDigits.join("");

  const handleOtpDigitChange = (index, value) => {
    if (!/^\d?$/.test(String(value || ""))) return;

    setOtpDigits((prev) => {
      const next = [...prev];
      next[index] = String(value || "");
      return next;
    });

    if (value && index < 5) {
      const nextInput = document.getElementById(`otp-digit-${index + 1}`);
      if (nextInput) nextInput.focus();
    }
  };

  const handleOtpDigitKeyDown = (index, event) => {
    if (event.key === "Backspace" && !otpDigits[index] && index > 0) {
      const prevInput = document.getElementById(`otp-digit-${index - 1}`);
      if (prevInput) prevInput.focus();
    }
  };

  const handleOtpPaste = (event) => {
    event.preventDefault();
    const pasted = String(event.clipboardData.getData("text") || "")
      .replace(/\D+/g, "")
      .slice(0, 6);

    if (pasted.length !== 6) return;

    setOtpDigits(pasted.split(""));
    const lastInput = document.getElementById("otp-digit-5");
    if (lastInput) lastInput.focus();
  };

  const handleOtpTextChange = (value) => {
    const digits = String(value || "")
      .replace(/\D+/g, "")
      .slice(0, 6);
    const paddedDigits = digits.padEnd(6, "").split("").slice(0, 6);
    setOtpDigits(paddedDigits);
  };

  const prepareSendPayload = () => {
    const credentialId = String(
      targetRecord?.id || targetRecord?._id || "",
    ).trim();
    const loggedInUser = resolveLoggedInUser();
    const selfClientName = loggedInUser.name;
    const selfBusinessName = "MaxCode IT Services";

    return {
      action: "send",
      operation,
      credentialType,
      credentialId,
      purpose: purpose.trim(),
      recipientMode: isMySoftwareCredential ? "founder" : recipientMode,
      selectedClientId:
        targetRecord?.clientRefId || targetRecord?.clientId || "",
      projectName: targetRecord?.projectName || "",
      clientRefId: targetRecord?.clientRefId || "",
      clientName: isMySoftwareCredential
        ? selfClientName
        : targetRecord?.clientName || "",
      clientBusinessName: isMySoftwareCredential
        ? selfBusinessName
        : targetRecord?.businessName || "",
      clientPhoneNumber:
        targetRecord?.clientPhoneNumber || targetRecord?.phoneNumber || "",
      senderName: loggedInUser.name,
      senderPhoneNumber: loggedInUser.phone,
    };
  };

  const handleSendOtp = async () => {
    if (!String(purpose || "").trim()) {
      showError("Please enter purpose for view/edit request");
      return;
    }

    if (
      needsClientSelection &&
      (!String(
        targetRecord?.clientRefId || targetRecord?.clientId || "",
      ).trim() ||
        !String(targetRecord?.clientName || "").trim())
    ) {
      showError(
        "Is record me client linked nahi hai. Client OTP send nahi ho sakta.",
      );
      return;
    }

    setIsSending(true);
    try {
      const response = await apiPost(
        API_ENDPOINTS.OTP_ACCESS.SEND,
        prepareSendPayload(),
      );
      const data = response?.data || {};

      setRequestId(String(data.requestId || ""));
      setResendAvailableAt(data.resendAvailableAt || "");
      setVerifyWindowUntil(data.verifyWindowUntil || "");
      setOtpExpiresAt(data.otpExpiresAt || "");
      setSendCount(Number(data.sendCount || 1));
      setMaxSends(Number(data.maxSends || DEFAULT_MAX_SENDS));
      setOtpDigits(["", "", "", "", "", ""]);

      showSuccess("OTP sent successfully");
    } catch (error) {
      showError(
        error?.response?.data?.error ||
          error?.response?.data?.message ||
          "Failed to send OTP",
      );
    } finally {
      setIsSending(false);
    }
  };

  const handleResendOtp = async () => {
    if (!requestId) return;

    setIsResending(true);
    try {
      const response = await apiPost(API_ENDPOINTS.OTP_ACCESS.RESEND, {
        action: "resend",
        requestId,
      });
      const data = response?.data || {};

      setResendAvailableAt(data.resendAvailableAt || "");
      setVerifyWindowUntil(data.verifyWindowUntil || "");
      setOtpExpiresAt(data.otpExpiresAt || "");
      setSendCount(Number(data.sendCount || sendCount + 1));
      setMaxSends(Number(data.maxSends || maxSends));
      setOtpDigits(["", "", "", "", "", ""]);

      showSuccess("OTP resent successfully");
    } catch (error) {
      showError(
        error?.response?.data?.error ||
          error?.response?.data?.message ||
          "Failed to resend OTP",
      );
    } finally {
      setIsResending(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!requestId) {
      showError("Send OTP first");
      return;
    }

    if (!/^\d{6}$/.test(String(otpValue || ""))) {
      showError("Please enter valid 6 digit OTP");
      return;
    }

    setIsVerifying(true);
    try {
      const response = await apiPost(API_ENDPOINTS.OTP_ACCESS.VERIFY, {
        action: "verify",
        requestId,
        otp: otpValue,
      });

      const data = response?.data || {};

      showSuccess("OTP verified. Access granted for 15 minutes.");

      if (typeof onVerified === "function") {
        onVerified({
          accessToken: data.accessToken,
          validUntil: data.validUntil,
          operation: data.operation,
        });
      }

      if (typeof onClose === "function") {
        onClose();
      }
    } catch (error) {
      showError(
        error?.response?.data?.error ||
          error?.response?.data?.message ||
          "OTP verification failed",
      );
    } finally {
      setIsVerifying(false);
    }
  };

  if (!show) return null;

  return (
    <div
      className="modal fade show"
      style={{ display: "block", backgroundColor: "rgba(0,0,0,0.5)" }}
      tabIndex="-1"
      role="dialog"
      aria-modal="true"
    >
      <div className="modal-dialog modal-dialog-centered" role="document">
        <div className="modal-content border-0 shadow-lg rounded-4">
          <div className="modal-header bg-success text-white">
            <h5 className="modal-title fw-bold">
              Confirm {operation === "edit" ? "Edit" : "View"} Access
            </h5>
            <button
              type="button"
              className="btn-close btn-close-white"
              onClick={() => {
                if (typeof onClose === "function") {
                  onClose();
                }
              }}
            ></button>
          </div>

          <div className="modal-body">
            {hasSentOtp && (
              <div className="mb-2 text-success fw-semibold">
                {recipientSummary}
              </div>
            )}

            {!hasSentOtp ? (
              <>
                <div className="mb-3">
                  <label className="form-label fw-semibold">
                    Purpose for {operation}
                  </label>
                  <textarea
                    className="form-control modern-input"
                    rows={2}
                    placeholder="Why do you want to view/edit these credentials?"
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                  />
                </div>

                <div className="row g-3 mb-2">
                  <div className="col-12">
                    <label className="form-label fw-semibold">
                      Send OTP To
                    </label>
                    <select
                      className="form-select modern-input"
                      value={isMySoftwareCredential ? "founder" : recipientMode}
                      onChange={(e) => setRecipientMode(e.target.value)}
                      disabled={isMySoftwareCredential}
                    >
                      <option value="founder">Founder & CEO</option>
                      {!isMySoftwareCredential && (
                        <>
                          <option value="client">{clientLine}</option>
                          <option value="both">{bothLine}</option>
                        </>
                      )}
                    </select>
                  </div>
                </div>
              </>
            ) : (
              <div className="alert alert-success mt-2 mb-3 py-2 fw-semibold">
                OTP sent successfully. Enter 6 digit OTP to continue.
              </div>
            )}

            {!hasSentOtp ? (
              <button
                type="button"
                className="btn btn-success w-100 mt-2"
                onClick={handleSendOtp}
                disabled={isSending}
              >
                {isSending ? "Sending OTP..." : "Send OTP"}
              </button>
            ) : (
              <>
                <div className="mb-2">
                  <label className="form-label fw-semibold">Enter OTP</label>
                  <div className="input-group flex-nowrap">
                    <input
                      id="otp-digit-0"
                      type="text"
                      className="form-control modern-input fw-bold"
                      value={otpValue}
                      onChange={(e) => handleOtpTextChange(e.target.value)}
                      onPaste={handleOtpPaste}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      placeholder="Enter 6 digit OTP"
                      style={{ minHeight: "44px" }}
                    />
                    <button
                      type="button"
                      className="btn btn-success fw-bold"
                      onClick={handleVerifyOtp}
                      disabled={isVerifying}
                      style={{ minHeight: "44px", whiteSpace: "nowrap" }}
                    >
                      {isVerifying ? "Verifying..." : "Verify OTP"}
                    </button>
                  </div>
                </div>

                <div className="d-flex justify-content-start mb-2">
                  <button
                    type="button"
                    className="btn btn-link p-0 text-decoration-none fw-bold"
                    onClick={handleResendOtp}
                    disabled={!canResend || isResending}
                    title={
                      canResend
                        ? "Resend OTP"
                        : `Resend in ${countdownToResend}s`
                    }
                    style={{
                      cursor: canResend ? "pointer" : "not-allowed",
                      opacity: canResend ? 1 : 0.5,
                    }}
                  >
                    {isResending
                      ? "Resending..."
                      : countdownToResend > 0
                        ? `Resend OTP (${countdownToResend}s)`
                        : "Resend OTP"}
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                showInfo("OTP request cancelled");
                if (typeof onClose === "function") {
                  onClose();
                }
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default OtpAccessModal;
