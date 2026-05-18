import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Player } from "@lottiefiles/react-lottie-player";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { apiGet, apiPut } from "../utils/api";
import { showInfo, showWarning } from "../Components/ToastNotification";

const TOP_STRIP_COLORS = ["#4285f4", "#34a853", "#fbbc05", "#ea4335"];

const UPI_APPS = [
  { name: "PhonePe", src: "/UPI-app/PhonePe.png" },
  { name: "Paytm", src: "/UPI-app/Paytm.png" },
  { name: "GPay", src: "/UPI-app/GooglePay.png" },
  { name: "Navi", src: "/UPI-app/Navi.png" },
  { name: "BHIM", src: "/UPI-app/bhim-upi.png" },
];

const DOWNLOAD_CARD_WIDTH = 650;
const DOWNLOAD_CARD_HEIGHT = 775;

const formatDisplayLabel = (value = "") => {
  const normalized = String(value || "")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();

  if (!normalized) return "-";

  return normalized
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const buildUpiPayload = (record = {}, amount = 0) =>
  `upi://pay?pa=${encodeURIComponent(record.upiId || "")}&pn=${encodeURIComponent(record.accountName || record.clientName || "")}&am=${Number(amount || 0).toFixed(2)}&cu=INR&tn=${encodeURIComponent(record.note || `Payment Link ${record.alias || ""}`)}`;

const getQrImageUrl = (record = {}, amount = 0) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(buildUpiPayload(record, amount))}`;

const createRoundedRectPath = (ctx, width, height, radius) => {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  ctx.beginPath();
  ctx.moveTo(safeRadius, 0);
  ctx.lineTo(width - safeRadius, 0);
  ctx.quadraticCurveTo(width, 0, width, safeRadius);
  ctx.lineTo(width, height - safeRadius);
  ctx.quadraticCurveTo(width, height, width - safeRadius, height);
  ctx.lineTo(safeRadius, height);
  ctx.quadraticCurveTo(0, height, 0, height - safeRadius);
  ctx.lineTo(0, safeRadius);
  ctx.quadraticCurveTo(0, 0, safeRadius, 0);
  ctx.closePath();
};

const PublicPaymentLinkPage = () => {
  const { paymentAlias = "" } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [record, setRecord] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [showVerifyPanel, setShowVerifyPanel] = useState(false);
  const [verifyUtrInput, setVerifyUtrInput] = useState("");
  const [verifyFeedback, setVerifyFeedback] = useState("");
  const [transactionCopied, setTransactionCopied] = useState(false);
  const cardRef = useRef(null);
  const [branding, setBranding] = useState({
    companyName: "MaxCode IT Services",
    companyPhone: "",
    logoUrl: "",
  });

  const refreshPublicRecord = async (options = {}) => {
    const response = await apiGet(
      API_ENDPOINTS.PAYMENT_LINKS.PUBLIC_BY_ALIAS(paymentAlias),
      {
        cache: options.cache ?? true,
        forceRefresh: options.forceRefresh ?? false,
        timeout: 10000,
      },
    );

    const nextRecord = response?.data?.record;
    if (!nextRecord) {
      throw new Error("Payment link not found");
    }

    setRecord(nextRecord);
    setBranding({
      companyName:
        response?.data?.branding?.companyName || "MaxCode IT Services",
      companyPhone: response?.data?.branding?.companyPhone || "",
      logoUrl: response?.data?.branding?.logoUrl || "",
    });

    return nextRecord;
  };

  useEffect(() => {
    const fetchRecord = async () => {
      setLoading(true);
      setError("");

      try {
        await refreshPublicRecord({ cache: true, forceRefresh: false });
      } catch (requestError) {
        setError(
          requestError?.response?.data?.error ||
            "Unable to open payment link right now",
        );
        setRecord(null);
      } finally {
        setLoading(false);
      }
    };

    fetchRecord();
  }, [paymentAlias]);

  const amountNumber = useMemo(() => {
    const parsed = Number(record?.amount || 0);
    return Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;
  }, [record?.amount]);

  const normalizedLinkStatus = String(
    record?.linkStatus || "active",
  ).toLowerCase();
  const normalizedStatus = String(record?.status || "pending").toLowerCase();
  const isManuallyResolvedStatus =
    normalizedStatus === "success" ||
    normalizedStatus === "failed" ||
    normalizedStatus === "under_verification";
  const isLinkInactive = normalizedLinkStatus === "inactive";

  const isExpiredByDate = useMemo(() => {
    if (!record?.linkExpiry) return false;
    const expiry = new Date(record.linkExpiry);
    if (Number.isNaN(expiry.getTime())) return false;
    return expiry.getTime() < Date.now();
  }, [record?.linkExpiry]);

  // Expiry date gets first priority when status is stale and not updated yet.
  const effectiveStatus =
    !isManuallyResolvedStatus && isExpiredByDate ? "expired" : normalizedStatus;

  const isPaymentSuccess = effectiveStatus === "success";
  const isPaymentFailed = effectiveStatus === "failed";
  const isPaymentUnderVerification = effectiveStatus === "under_verification";
  const canPay = effectiveStatus === "pending" && !isLinkInactive;
  const isPaymentExpired = effectiveStatus === "expired";

  useEffect(() => {
    const companyName = branding.companyName || "MaxCode IT Services";

    if (!loading && error) {
      document.title = `Link Note Found | ${companyName}`;
      return;
    }

    const amt = Number(record?.amount || 0);
    const amtFormatted =
      Number.isFinite(amt) && amt > 0
        ? `₹${amt.toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`
        : null;

    if (!amtFormatted) {
      document.title = `Pay Link | ${companyName}`;
      return;
    }

    if (isLinkInactive) {
      document.title = `Payment Link Disabled | ${companyName}`;
      return;
    }

    if (effectiveStatus === "success") {
      document.title = `${amtFormatted} Payment Successful | ${companyName}`;
      return;
    }

    if (effectiveStatus === "failed") {
      document.title = `${amtFormatted} Payment Failed | ${companyName}`;
      return;
    }

    if (effectiveStatus === "under_verification") {
      document.title = `${amtFormatted} Payment Under Verification | ${companyName}`;
      return;
    }

    document.title = `Pay ${amtFormatted} | ${companyName}`;
  }, [
    branding.companyName,
    effectiveStatus,
    error,
    isLinkInactive,
    loading,
    record?.amount,
  ]);

  const paymentDateDisplay = useMemo(() => {
    if (!record?.paymentDate) return "-";

    const raw = String(record.paymentDate || "").trim();
    const strictDateOnly = raw.match(/^(\d{4}-\d{2}-\d{2})$/);
    if (strictDateOnly) {
      const istParsed = new Date(`${strictDateOnly[1]}T00:00:00.000+05:30`);
      if (!Number.isNaN(istParsed.getTime())) {
        return istParsed.toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          timeZone: "Asia/Kolkata",
        });
      }
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return "-";
    return parsed.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      timeZone: "Asia/Kolkata",
    });
  }, [record?.paymentDate]);

  const upiPayload = useMemo(
    () => (record ? buildUpiPayload(record, amountNumber) : ""),
    [amountNumber, record],
  );
  const hasVerifyUtrInput = String(verifyUtrInput || "").trim().length >= 10;

  const handlePayNowClick = (event) => {
    if (!canPay) {
      event.preventDefault();
      return;
    }

    const isLaptopOrLargerScreen =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(min-width: 1024px)").matches;

    if (!isLaptopOrLargerScreen) return;

    event.preventDefault();
    showWarning(
      "Pay Now button supports mobile UPI apps only. Please scan the QR code using your mobile device to complete the payment.",
      4800,
    );
  };

  const handleCopyTransactionId = async () => {
    const transactionId = String(record?.utrNumber || "").trim();
    if (!transactionId) return;

    try {
      await navigator.clipboard.writeText(transactionId);
      setTransactionCopied(true);
      setTimeout(() => setTransactionCopied(false), 1500);
    } catch {
      setTransactionCopied(false);
    }
  };

  const handleCheckAgain = async () => {
    if (!paymentAlias || verifying || loading) return;

    try {
      setVerifying(true);
      setVerifyFeedback("");
      await refreshPublicRecord({ cache: false, forceRefresh: true });
    } catch {
      setVerifyFeedback(
        "Unable to check latest status right now. Please try again.",
      );
    } finally {
      setVerifying(false);
    }
  };

  const handleVerifyStatus = async () => {
    if (!paymentAlias || verifying || loading) return;

    const enteredUtr = String(verifyUtrInput || "").trim();
    if (!enteredUtr) {
      setVerifyFeedback("Please enter Transaction ID / UTR Number.");
      return;
    }

    try {
      setVerifying(true);
      setVerifyFeedback("");
      const verifyResponse = await apiPut(
        API_ENDPOINTS.PAYMENT_LINKS.PUBLIC_VERIFY_BY_ALIAS(paymentAlias),
        {
          utrNumber: enteredUtr,
        },
      );

      const nextRecord = verifyResponse?.data?.record;
      let resolvedRecord = nextRecord || null;

      if (nextRecord) {
        setRecord(nextRecord);
      } else {
        resolvedRecord = await refreshPublicRecord({
          cache: false,
          forceRefresh: true,
        });
      }

      if (
        String(resolvedRecord?.status || "").toLowerCase() ===
        "under_verification"
      ) {
        showInfo(
          "Transaction submitted. Your payment is now under verification.",
          3500,
        );
      }

      setShowVerifyPanel(false);
      setVerifyFeedback("");
      setVerifyUtrInput("");
    } catch (requestError) {
      const apiError =
        requestError?.response?.data?.error ||
        "Unable to verify right now. Please try again.";

      const latestRecord = requestError?.response?.data?.record;
      if (latestRecord) {
        setRecord(latestRecord);
      }

      setVerifyFeedback(apiError);
    } finally {
      setVerifying(false);
    }
  };

  const handleDownloadCard = async () => {
    if (!cardRef.current || downloading) return;

    let cloned = null;

    try {
      setDownloading(true);
      const { default: html2canvas } = await import("html2canvas");

      const sourceCard = cardRef.current;
      const sourceRect = sourceCard.getBoundingClientRect();
      const captureWidth = Math.max(1, Math.round(sourceRect.width));
      const sourceStyle = window.getComputedStyle(sourceCard);
      const cornerRadius = Math.max(
        0,
        parseFloat(sourceStyle.borderTopLeftRadius || "0") || 0,
      );

      cloned = sourceCard.cloneNode(true);
      cloned.style.width = `${captureWidth}px`;
      cloned.style.minWidth = `${captureWidth}px`;
      cloned.style.maxWidth = `${captureWidth}px`;
      cloned.style.height = "auto";
      cloned.style.position = "fixed";
      cloned.style.left = "-10000px";
      cloned.style.top = "0";
      cloned.style.zIndex = "-1";
      cloned.style.borderRadius = sourceStyle.borderRadius;
      cloned.style.overflow = "hidden";
      cloned.style.background = "#ffffff";
      cloned.style.backgroundColor = "#ffffff";
      cloned.style.margin = "0";
      cloned.style.padding = "0";
      cloned.style.transform = "none";
      cloned.style.boxSizing = "border-box";
      cloned.style.boxShadow = "none";
      cloned.style.filter = "none";

      cloned.classList.remove("shadow", "shadow-sm", "shadow-lg");

      cloned
        .querySelectorAll('[data-no-download], [data-no-download="true"]')
        .forEach((node) => {
          node.remove();
        });

      // Safety layer: if any no-download node survives, force-hide it.
      cloned
        .querySelectorAll('[data-no-download], [data-no-download="true"]')
        .forEach((node) => {
          node.style.display = "none";
          node.style.visibility = "hidden";
          node.style.height = "0";
          node.style.overflow = "hidden";
        });

      document.body.appendChild(cloned);

      // Let layout settle before measuring to get exact final capture size.
      await new Promise((res) => requestAnimationFrame(() => res()));

      // Convert all external images (cross-origin) to base64 so they render in html2canvas
      const clonedImages = Array.from(cloned.querySelectorAll("img"));
      await Promise.all(
        clonedImages.map(async (img) => {
          const src = img.getAttribute("src");
          if (!src || src.startsWith("data:")) return;

          // Convert to base64 to avoid cross-origin issues
          try {
            const fetchResponse = await fetch(src, { cache: "force-cache" });
            if (fetchResponse.ok) {
              const blob = await fetchResponse.blob();
              const base64 = await new Promise((res) => {
                const reader = new FileReader();
                reader.onload = () => res(reader.result);
                reader.readAsDataURL(blob);
              });
              img.src = base64;
              img.removeAttribute("crossorigin");
              // Wait for the new src to load
              await new Promise((res) => {
                if (img.complete) {
                  res();
                  return;
                }
                img.onload = res;
                img.onerror = res;
                setTimeout(res, 3000);
              });
            }
          } catch {
            // Leave original src if fetch fails
          }
        }),
      );

      await new Promise((res) => requestAnimationFrame(() => res()));

      const finalRect = cloned.getBoundingClientRect();
      const cardWidth = captureWidth;
      const cardHeight = Math.max(1, Math.round(finalRect.height));

      // Keep export dimensions exactly same as rendered card size.
      const captureScale = 5;

      const rawCanvas = await html2canvas(cloned, {
        scale: captureScale,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        logging: false,
        imageTimeout: 8000,
        width: cardWidth,
        height: cardHeight,
        windowWidth: cardWidth,
        windowHeight: cardHeight,
      });

      // Apply rounded corners by drawing into a new clipped canvas
      const radius = cornerRadius * captureScale;
      const w = rawCanvas.width;
      const h = rawCanvas.height;
      const roundedCanvas = document.createElement("canvas");
      roundedCanvas.width = w;
      roundedCanvas.height = h;
      const ctx = roundedCanvas.getContext("2d");
      if (!ctx) {
        throw new Error("Unable to create canvas context");
      }
      ctx.beginPath();
      ctx.moveTo(radius, 0);
      ctx.lineTo(w - radius, 0);
      ctx.quadraticCurveTo(w, 0, w, radius);
      ctx.lineTo(w, h - radius);
      ctx.quadraticCurveTo(w, h, w - radius, h);
      ctx.lineTo(radius, h);
      ctx.quadraticCurveTo(0, h, 0, h - radius);
      ctx.lineTo(0, radius);
      ctx.quadraticCurveTo(0, 0, radius, 0);
      ctx.closePath();
      ctx.clip();
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(rawCanvas, 0, 0);

      // Export in fixed 650x775 while preserving the original card aspect ratio.
      const exportCanvas = document.createElement("canvas");
      exportCanvas.width = DOWNLOAD_CARD_WIDTH;
      exportCanvas.height = DOWNLOAD_CARD_HEIGHT;
      const exportCtx = exportCanvas.getContext("2d");
      if (!exportCtx) {
        throw new Error("Unable to create export canvas context");
      }
      exportCtx.imageSmoothingEnabled = true;
      exportCtx.imageSmoothingQuality = "high";
      exportCtx.fillStyle = "#ffffff";
      const exportRadius = Math.round(
        (cornerRadius / Math.max(1, cardWidth)) * DOWNLOAD_CARD_WIDTH,
      );

      createRoundedRectPath(
        exportCtx,
        DOWNLOAD_CARD_WIDTH,
        DOWNLOAD_CARD_HEIGHT,
        exportRadius,
      );
      exportCtx.clip();
      exportCtx.fillRect(0, 0, DOWNLOAD_CARD_WIDTH, DOWNLOAD_CARD_HEIGHT);

      // Draw the card scaled to fill entire export canvas (no centering that crops strips)
      exportCtx.drawImage(
        roundedCanvas,
        0,
        0,
        DOWNLOAD_CARD_WIDTH,
        DOWNLOAD_CARD_HEIGHT,
      );

      exportCanvas.toBlob(
        (blob) => {
          if (!blob) {
            alert("Download failed. Please try again.");
            return;
          }
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `MaxCode-QR.png`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        },
        "image/png",
        1.0,
      );
    } catch (downloadError) {
      console.error("Failed to download payment card", downloadError);
      alert("Download failed. Please try again.");
    } finally {
      if (cloned && cloned.parentNode) {
        cloned.parentNode.removeChild(cloned);
      }
      setDownloading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "linear-gradient(180deg, rgba(0, 112, 38, 0.08) 0%, #ffffff 70%)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          width: "100%",
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "10px",
        }}
      >
        {!loading && !error && canPay && !showVerifyPanel ? (
          /* Desktop only: fixed on right side */
          <button
            type="button"
            data-no-download="true"
            title="Verify Transaction"
            className="btn btn-primary py-3 fw-bold rounded-pill d-none d-md-flex"
            onClick={() => {
              setShowVerifyPanel(true);
              setVerifyFeedback("");
            }}
            style={{
              position: "fixed",
              right: "18px",
              top: "50%",
              transform: "translateY(-50%)",
              zIndex: 999,
              boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
              writingMode: "vertical-rl",
              textOrientation: "mixed",
              padding: "16px 10px",
              letterSpacing: "0.04em",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
            }}
          >
            <i className="fas fa-hourglass-half text-white"></i>
            <span>Verify Transaction</span>
          </button>
        ) : null}

        <div style={{ width: "100%", maxWidth: "420px" }}>
          <div
            ref={cardRef}
            className="bg-white shadow-lg overflow-hidden mx-auto"
            style={{ borderRadius: "22px" }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                height: "12px",
                margin: "0",
                padding: "0",
                lineHeight: "0",
                gap: "0",
              }}
            >
              {TOP_STRIP_COLORS.map((color) => (
                <div
                  key={color}
                  style={{ background: color, margin: "0", padding: "0" }}
                />
              ))}
            </div>

            <div className="px-4 pt-4 pb-2 text-center">
              {branding.logoUrl ? (
                <img
                  src="/Logo.png"
                  alt={branding.companyName}
                  style={{
                    width: "180px",
                    height: "40px",
                    objectFit: "contain",
                    margin: "0 auto 10px",
                  }}
                />
              ) : (
                <img
                  src="/Logo.png"
                  alt="MaxCode IT Services"
                  style={{
                    width: "180px",
                    height: "40px",
                    objectFit: "contain",
                    margin: "0 auto 10px",
                  }}
                />
              )}

              {!loading &&
                !error &&
                !isPaymentSuccess &&
                !isPaymentUnderVerification &&
                !isPaymentFailed &&
                !isPaymentExpired &&
                !showVerifyPanel && (
                  <div
                    className="fw-bold text-dark"
                    style={{
                      fontSize: "1.55rem",
                      lineHeight: 1.05,
                      marginTop: "10px",
                    }}
                  >
                    {record?.accountName || "MaxCode IT Services"}
                  </div>
                )}
            </div>

            <div className="px-3 pb-2 pt-1 text-center">
              {loading ? (
                <div className="py-5 d-flex justify-content-center">
                  <Player
                    autoplay
                    loop
                    src="/Json/loading3.json"
                    style={{ height: "110px", width: "110px" }}
                  />
                </div>
              ) : error ? (
                <div className="py-2 text-center">
                  <Player
                    autoplay
                    loop
                    src="/Json/404.json"
                    style={{
                      height: "180px",
                      width: "180px",
                      margin: "0 auto",
                    }}
                  />

                  <div
                    className="fw-bold text-danger mt-2"
                    style={{ fontSize: "1.2rem", letterSpacing: "0.2px" }}
                  >
                    Invalid Payment Link
                  </div>

                  <div
                    className="text-muted mt-2"
                    style={{ fontSize: "0.92rem", lineHeight: 1.55 }}
                  >
                    The payment request associated with this link does not exist
                    or may have been removed. Please verify the payment link and
                    try again. If the issue still persists, kindly contact our
                    support team for assistance.
                  </div>

                  <div
                    className="mt-3 text-secondary"
                    style={{ fontSize: "0.88rem" }}
                  >
                    📞 Support:{" "}
                    <a
                      href="tel:+916377241446"
                      className="text-decoration-none fw-semibold text-dark"
                    >
                      +91 6377241446
                    </a>
                  </div>
                </div>
              ) : isLinkInactive ? (
                <div className="py-2 text-center">
                  <Player
                    autoplay
                    loop
                    src="/Json/Inactive.json"
                    style={{
                      height: "170px",
                      width: "170px",
                      margin: "0 auto",
                    }}
                  />

                  <div
                    className="fw-bold text-danger mt-2"
                    style={{ fontSize: "1.2rem", letterSpacing: "0.2px" }}
                  >
                    Payment Link Disabled!
                  </div>

                  <div
                    className="text-muted mt-1"
                    style={{ fontSize: "0.92rem", lineHeight: 1.55 }}
                  >
                    Sorry, this payment link is currently inactive and
                    unavailable for payments. Please contact our support team
                    for assistance.
                  </div>

                  <div
                    className="mt-3 text-dark fw-semibold"
                    style={{ fontSize: "0.92rem" }}
                  >
                    📞 Contact Now:&nbsp;
                    <a
                      href="tel:+916377241446"
                      className="text-decoration-none text-danger fw-bold"
                    >
                      +916377241446
                    </a>
                  </div>
                </div>
              ) : isPaymentSuccess ? (
                <div className="py-2 text-center">
                  <Player
                    autoplay
                    loop
                    src="/Json/Success.json"
                    style={{
                      height: "180px",
                      width: "180px",
                      margin: "0 auto",
                    }}
                  />

                  <div
                    className="fw-bold text-success mt-2"
                    style={{ fontSize: "1.2rem", letterSpacing: "0.2px" }}
                  >
                    Transaction Successful
                  </div>

                  <div
                    className="text-muted mt-1"
                    style={{ fontSize: "0.92rem" }}
                  >
                    Your payment has been received successfully.
                  </div>

                  <div
                    className="mt-3 text-dark fw-semibold"
                    style={{ fontSize: "0.9rem" }}
                  >
                    Payment Date: {paymentDateDisplay}
                  </div>

                  <div
                    className="mt-1 text-dark fw-semibold"
                    style={{ fontSize: "0.9rem" }}
                  >
                    <span>Transaction ID: {record?.utrNumber || "-"}</span>
                    {record?.utrNumber ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary ms-2 py-0 px-2"
                        onClick={handleCopyTransactionId}
                        aria-label="Copy Transaction ID"
                        title={
                          transactionCopied ? "Copied" : "Copy Transaction ID"
                        }
                        style={{
                          backgroundColor: "#198754",
                          borderColor: "#198754",
                          color: "#ffffff",
                        }}
                      >
                        <i
                          className={`fas ${transactionCopied ? "fa-check" : "fa-copy"}`}
                        ></i>
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : isPaymentUnderVerification ? (
                <div className="py-2 text-center">
                  <div className="verify-animation-wrap">
                    <Player
                      autoplay
                      loop
                      src="/Json/Verify-Transaction.json"
                      className="verify-animation-player"
                    />
                  </div>

                  <div
                    className="fw-bold text-warning mt-2"
                    style={{ fontSize: "1.2rem", letterSpacing: "0.2px" }}
                  >
                    Payment Verification Pending
                  </div>

                  <div
                    className="text-muted mt-1"
                    style={{ fontSize: "0.92rem" }}
                  >
                    We are currently verifying your payment details. Please
                    check again after some time.
                  </div>

                  <button
                    type="button"
                    className="btn btn-primary mt-3 verify-check-again-btn"
                    onClick={handleCheckAgain}
                    disabled={verifying || loading}
                    data-no-download="true"
                    style={{ position: "relative", zIndex: 20 }}
                  >
                    <span className="d-inline-flex align-items-center justify-content-center gap-2">
                      <i
                        className={`fas ${verifying ? "fa-spinner fa-spin" : "fa-rotate-right"}`}
                      ></i>
                      <span>{verifying ? "Checking..." : "Check Again"}</span>
                    </span>
                  </button>

                  {verifyFeedback ? (
                    <div
                      className="mt-2"
                      style={{ fontSize: "0.8rem", color: "#b02a37" }}
                    >
                      {verifyFeedback}
                    </div>
                  ) : null}
                </div>
              ) : isPaymentFailed ? (
                <div className="py-2 text-center">
                  <Player
                    autoplay
                    loop
                    src="/Json/Failed.json"
                    style={{
                      height: "140px",
                      width: "140px",
                      margin: "0 auto",
                    }}
                  />

                  <div
                    className="fw-bold text-danger mt-2"
                    style={{ fontSize: "1.2rem", letterSpacing: "0.2px" }}
                  >
                    Transaction Failed
                  </div>

                  <div
                    className="text-muted mt-1"
                    style={{ fontSize: "0.92rem" }}
                  >
                    Your payment could not be completed. Please try again.
                  </div>

                  {record?.failedReason ? (
                    <div
                      className="mt-2 fw-semibold"
                      style={{ fontSize: "0.9rem", color: "#842029" }}
                    >
                      Reason: {formatDisplayLabel(record.failedReason)}
                    </div>
                  ) : null}
                </div>
              ) : isPaymentExpired ? (
                <div className="py-2 text-center">
                  <Player
                    autoplay
                    loop
                    src="/Json/Expired.json"
                    style={{
                      height: "140px",
                      width: "140px",
                      margin: "0 auto",
                    }}
                  />

                  <div
                    className="fw-bold text-warning mt-2"
                    style={{ fontSize: "1.2rem", letterSpacing: "0.2px" }}
                  >
                    Payment Link Expired
                  </div>

                  <div
                    className="text-muted mt-1"
                    style={{ fontSize: "0.92rem" }}
                  >
                    The payment link is invalid or has expired.
                  </div>
                </div>
              ) : (
                <>
                  {showVerifyPanel ? (
                    <div
                      className="mx-auto"
                      style={{
                        width: "100%",
                        maxWidth: "360px",
                        padding: "8px 0 10px",
                      }}
                    >
                      <div
                        className="text-start mb-2 fw-semibold text-dark"
                        style={{ fontSize: "0.88rem" }}
                      >
                        Transaction ID / UTR Number{" "}
                        <span className="text-danger">*</span>
                      </div>
                      <input
                        type="text"
                        className="form-control modern-input"
                        placeholder="Enter Transaction ID / UTR Number"
                        value={verifyUtrInput}
                        onChange={(event) => {
                          setVerifyUtrInput(event.target.value);
                          if (verifyFeedback) setVerifyFeedback("");
                        }}
                      />

                      <div
                        className="text-start text-muted mt-2"
                        style={{ fontSize: "0.76rem", lineHeight: 1.45 }}
                      >
                        You can find the Transaction ID / UTR Number in your UPI
                        app (PhonePe, Google Pay, Paytm, BHIM, etc.) under
                        Payment History or Transaction Details.
                      </div>

                      {verifyFeedback ? (
                        <div
                          className="mt-2"
                          style={{ fontSize: "0.8rem", color: "#b02a37" }}
                        >
                          {verifyFeedback}
                        </div>
                      ) : null}

                      <div className="mt-3 d-flex gap-2">
                        <button
                          type="button"
                          className="btn btn-outline-secondary flex-grow-1"
                          onClick={() => {
                            setShowVerifyPanel(false);
                            setVerifyFeedback("");
                            setVerifyUtrInput("");
                          }}
                          disabled={verifying}
                        >
                          <span className="d-inline-flex align-items-center justify-content-center gap-2">
                            <i className="fas fa-arrow-left"></i>
                            <span>Back</span>
                          </span>
                        </button>
                        <button
                          type="button"
                          className="btn btn-primary flex-grow-1"
                          onClick={handleVerifyStatus}
                          disabled={
                            verifying ||
                            loading ||
                            !!error ||
                            !hasVerifyUtrInput
                          }
                        >
                          <span className="d-inline-flex align-items-center justify-content-center gap-2">
                            <i
                              className={`fas ${verifying ? "fa-spinner fa-spin" : "fa-hourglass-half"}`}
                            ></i>
                            <span>
                              {verifying
                                ? "Verifying..."
                                : "Verify Transaction"}
                            </span>
                          </span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div
                        className="mx-auto"
                        style={{
                          width: "100%",
                          maxWidth: "530px",
                          padding: "4px 0",
                        }}
                      >
                        {canPay ? (
                          <img
                            src={getQrImageUrl(record, amountNumber)}
                            alt="Payment QR"
                            style={{
                              width: "100%",
                              maxWidth: "230px",
                              aspectRatio: "1 / 1",
                              display: "block",
                              margin: "0 auto",
                              borderRadius: "12px",
                            }}
                          />
                        ) : (
                          <div className="py-5 text-muted">
                            Payment unavailable
                          </div>
                        )}

                        <div
                          className="mt-2 fw-bold text-dark"
                          style={{ fontSize: "0.9rem", letterSpacing: "0.5px" }}
                        >
                          {record?.accountName || "MaxCode IT Services"} |{" "}
                          {record?.upiId || "UPI ID"}
                        </div>

                        <div
                          className="text-center text-muted mt-3 mb-1"
                          style={{
                            fontSize: "0.70rem",
                            whiteSpace: "nowrap",
                            lineHeight: 1.2,
                            paddingInline: "4px",
                          }}
                        >
                          Scan this QR from any UPI app to pay to{" "}
                          {record?.accountName || "MaxCode IT Services"}
                        </div>

                        <div
                          className="mt-2 mb-2 d-flex justify-content-center align-items-center"
                          style={{
                            gap: "8px",
                            flexWrap: "nowrap",
                            width: "100%",
                            maxWidth: "100%",
                            paddingInline: "2px",
                            boxSizing: "border-box",
                          }}
                        >
                          {UPI_APPS.map((app) => (
                            <img
                              key={app.name}
                              src={app.src}
                              alt={app.name}
                              style={{
                                height: "20px",
                                width: "auto",
                                maxWidth: "25%",
                                flexShrink: 0,
                                objectFit: "contain",
                              }}
                            />
                          ))}
                        </div>
                      </div>

                      <div data-no-download="true">
                        <div className="d-flex align-items-center gap-2 mt-3 mb-2">
                          <a
                            href={canPay ? upiPayload : "#"}
                            className={`btn flex-grow-1 ${canPay ? "btn-primary" : "btn-secondary"}`}
                            target={canPay ? "_blank" : undefined}
                            rel={canPay ? "noreferrer" : undefined}
                            onClick={handlePayNowClick}
                          >
                            <span className="d-inline-flex align-items-center justify-content-center gap-2">
                              <i
                                className={`fas ${canPay ? "fa-money-bill-wave" : "fa-ban"}`}
                              ></i>
                              <span>
                                {canPay ? "Pay Now" : "Payment Unavailable"}
                              </span>
                            </span>
                          </a>
                          <button
                            type="button"
                            className={`btn flex-grow-1 ${canPay ? "btn-primary" : "btn-secondary"}`}
                            onClick={handleDownloadCard}
                            disabled={downloading || loading || !!error}
                          >
                            <span className="d-inline-flex align-items-center justify-content-center gap-2">
                              <i
                                className={`fas ${downloading ? "fa-spinner fa-spin" : "fa-qrcode"}`}
                              ></i>
                              <span>
                                {downloading ? "Downloading..." : "Download QR"}
                              </span>
                            </span>
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                height: "12px",
                margin: "0",
                padding: "0",
                lineHeight: "0",
                gap: "0",
                bottom: "0px",
              }}
            >
              {TOP_STRIP_COLORS.map((color) => (
                <div
                  key={`bottom-${color}`}
                  style={{ background: color, margin: "0", padding: "0" }}
                />
              ))}
            </div>
          </div>

          {!loading && !error && canPay && !showVerifyPanel ? (
            /* Mobile only: below card */
            <button
              type="button"
              data-no-download="true"
              className="btn btn-primary d-flex d-md-none w-100 align-items-center justify-content-center mt-4"
              onClick={() => {
                setShowVerifyPanel(true);
                setVerifyFeedback("");
              }}
            >
              <span className="d-inline-flex align-items-center justify-content-center gap-2">
                <i className="fas fa-hourglass-half"></i>
                <span>Verify Transaction</span>
              </span>
            </button>
          ) : null}
        </div>
      </div>

      <div
        className="text-center"
        style={{
          fontSize: "0.8rem",
          color: "#000000",
          fontWeight: 600,
          padding: "0 10px 8px",
        }}
      >
        Powered by{" "}
        <a
          href="https://www.maxcode.in"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            color: "#ff0000",
            textDecoration: "none",
            fontWeight: 600,
          }}
          onMouseEnter={(e) => (e.target.style.textDecoration = "underline")}
          onMouseLeave={(e) => (e.target.style.textDecoration = "none")}
        >
          MaxCode IT Services
        </a>
      </div>

      <style>{`
        .verify-animation-wrap {
          display: flex;
          justify-content: center;
          align-items: center;
          margin-top: -180px;
          margin-bottom: -170px;
          margin-left: 0px;
          margin-right: auto;
          position: relative;
          z-index: 1;
        }

        .verify-animation-player {
          width: 500px;
          height: 500px;
        }

        @media (max-width: 767.98px) {
          .verify-animation-wrap {
            margin-top: -140px;
            margin-bottom: -130px;
            margin-left: 0px;
          }

          .verify-animation-player {
            width: 400px;
            height: 400px;
          }
        }
      `}</style>
    </div>
  );
};

export default PublicPaymentLinkPage;
