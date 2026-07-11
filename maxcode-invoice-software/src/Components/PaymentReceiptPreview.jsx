import React, { useEffect, useMemo, useState } from "react";
import { showError, showSuccess } from "./ToastNotification";
import { apiGet } from "../utils/api";
import API_ENDPOINTS from "../utils/apiEndpoints";

const ADVANCE_REFERENCE_INVOICE_NUMBER =
  "Advance Payment (Final Invoice Not Generated)";

const PaymentReceiptPreview = ({
  id,
  receiptData,
  show = false,
  onClose = () => {},
  renderMode = "modal",
}) => {
  const [loading, setLoading] = useState({ pdf: false, image: false, imageSeparate: false });
  const [termsConditions, setTermsConditions] = useState([]);
  const [termsLoading, setTermsLoading] = useState(true);
  const [businessSettings, setBusinessSettings] = useState({});
  const isPrintMode = renderMode === "print";

  useEffect(() => {
    if (isPrintMode) return undefined;
    document.body.style.overflow = show ? "hidden" : "auto";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [show, isPrintMode]);

  const data = useMemo(() => {
    const fallback = {
      companyName: "MaxCode IT Services",
      companyAddress: "Jaipur, Rajasthan",
      receiptNo: "MEMO-0001",
      memoNo: "MEMO-0001",
      receiptDate: "-",
      clientName: "-",
      businessName: "-",
      paymentMethod: "-",
      contactNo: "-",
      purpose: "Sales Invoice",
      amount: 0,
      amountInWords: "Zero Rupees Only",
      receivedWithThanksFrom: "-",
      receivedBy: "-",
      bankName: "-",
      note: "",
    };

    return {
      ...fallback,
      ...(receiptData || {}),
    };
  }, [receiptData]);

  const formatCurrency = (value) => {
    const num = Number.parseFloat(value);
    return (Number.isFinite(num) ? num : 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const parseTerms = (value, fallback = []) => {
    if (Array.isArray(value)) {
      const terms = value
        .map((item) => String(item || "").trim())
        .filter(Boolean);
      return terms.length ? terms : fallback;
    }

    if (typeof value === "string") {
      const terms = value
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean);
      return terms.length ? terms : fallback;
    }

    return fallback;
  };

  const safeFileToken = String(
    data.invoiceNumber || data.memoNo || data.receiptNo || "0001",
  )
    .replace(/[^A-Za-z0-9-]/g, "")
    .slice(0, 30);
  const exportFileBaseName = `Payment-Receipt-RCPT-${safeFileToken || "0001"}`;

  const displayPurpose = data.purpose || data.note || "Sales Invoice";
  const displayReceivedBy = data.receivedBy || data.companyName || "-";
  const displayClientAddress =
    data.clientAddress || data.address || data.businessAddress || "-";
  const signatureDateTimeText = data.signatureDateTime || "-";
  const receiptRefNumber = data.receiptNo || "-";

  const storedReferenceInvoiceNumber = String(
    data.referenceInvoiceNumber || "",
  ).trim();

  // Build reference invoice numbers from allocations
  let referenceInvoiceNumber = storedReferenceInvoiceNumber || "-";

  if (
    Array.isArray(data.invoiceAllocations) &&
    data.invoiceAllocations.length > 0
  ) {
    const allocatedNumbers = data.invoiceAllocations
      .map((alloc) => {
        return (
          alloc.invoiceNumber ||
          alloc.invoice_no ||
          alloc.invoiceNo ||
          alloc.referenceNumber
        );
      })
      .filter(Boolean);

    if (allocatedNumbers.length > 0) {
      referenceInvoiceNumber = allocatedNumbers.join(", ");
    }
  } else if (
    Array.isArray(data.invoiceNumbers) &&
    data.invoiceNumbers.length > 0
  ) {
    const validNumbers = data.invoiceNumbers.filter(Boolean);
    if (validNumbers.length > 0) {
      referenceInvoiceNumber = validNumbers.join(", ");
    }
  } else if (data.invoiceNumber) {
    referenceInvoiceNumber = data.invoiceNumber;
  } else if (data.appliedInvoiceNumber) {
    referenceInvoiceNumber = data.appliedInvoiceNumber;
  } else if (storedReferenceInvoiceNumber) {
    referenceInvoiceNumber = storedReferenceInvoiceNumber;
  } else if (String(data.paymentType || "").toLowerCase() === "advance") {
    referenceInvoiceNumber = ADVANCE_REFERENCE_INVOICE_NUMBER;
  }

  const companyPhoneDisplay = data.companyPhone || data.phone || "-";
  const companyWebsiteDisplay =
    data.companyWebsite || data.website || "www.maxcode.in";
  const companyEmailDisplay = data.companyEmail || data.email || "-";
  const companyAddressDisplay = data.companyAddress || "-";
  const amountText = formatCurrency(data.amount);
  const invoiceTermsVersion = String(data.invoiceTermsVersion || "").trim();
  const invoiceTermsSnapshot = data.invoiceTermsConditionsSnapshot;

  const dotBackgroundImage = useMemo(() => {
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="1" fill="rgba(18,118,69,0.14)"/></svg>';
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }, []);

  const renderContactIcon = (type) => {
    if (!isPrintMode) {
      if (type === "phone") return <i className="bi bi-telephone-fill" />;
      if (type === "web") return <i className="bi bi-globe" />;
      if (type === "email") return <i className="bi bi-envelope-fill" />;
      return <i className="bi bi-geo-alt-fill" />;
    }

    if (type === "phone") return <span>P</span>;
    if (type === "web") return <span>W</span>;
    if (type === "email") return <span>E</span>;
    return <span>A</span>;
  };

  useEffect(() => {
    let mounted = true;
    setTermsLoading(true);

    const snapshotTerms = parseTerms(invoiceTermsSnapshot, []);

    if (snapshotTerms.length > 0) {
      setTermsConditions(snapshotTerms);
      setTermsLoading(false);
      return () => {
        mounted = false;
      };
    }

    const applyBusinessSettingsTerms = (settings) => {
      if (!mounted || !settings || typeof settings !== "object") return false;

      setBusinessSettings(settings);
      const parsed = parseTerms(settings.invoiceTermsConditions, []);
      if (parsed.length > 0) {
        setTermsConditions(parsed);
        return true;
      }

      return false;
    };

    const loadTerms = async () => {
      if (/^V\d+\.\d+\.\d+$/i.test(invoiceTermsVersion)) {
        try {
          const versionResponse = await apiGet(
            API_ENDPOINTS.BUSINESS_SETTINGS.TERMS_BY_VERSION(
              "invoice",
              invoiceTermsVersion,
            ),
          );
          const versionTerms = parseTerms(versionResponse?.data?.terms, []);
          if (versionTerms.length > 0 && mounted) {
            setTermsConditions(versionTerms);
            return;
          }
        } catch {
          // Fallback to current business settings below.
        }
      }

      const cached = localStorage.getItem("business_settings");
      if (cached) {
        try {
          const cachedSettings = JSON.parse(cached);
          if (applyBusinessSettingsTerms(cachedSettings)) {
            return;
          }
        } catch {
          // Ignore cache parse errors and fall through to remote fetch.
        }
      }

      try {
        const response = await apiGet(API_ENDPOINTS.BUSINESS_SETTINGS.GET);
        const remoteSettings = response?.data?.settings;
        if (remoteSettings && applyBusinessSettingsTerms(remoteSettings)) {
          localStorage.removeItem("business_settings");
          return;
        }
      } catch {
        // Keep empty terms list if nothing can be loaded.
      }

      if (mounted) {
        setTermsConditions([]);
      }
    };

    loadTerms().finally(() => {
      if (mounted) {
        setTermsLoading(false);
      }
    });

    return () => {
      mounted = false;
    };
  }, [invoiceTermsVersion, invoiceTermsSnapshot]);

  const getElement = () =>
    document.getElementById(id || "payment-receipt-preview");

  const captureReceipt = async () => {
    if (termsLoading) {
      showError("Invoice terms are still loading. Please try again in a moment.");
      return null;
    }

    const element = getElement();
    if (!element) {
      showError("Payment receipt element not found.");
      return null;
    }

    const html2canvas = (await import("html2canvas")).default;

    // Capture a single element (kept for backward compatibility)
    const images = Array.from(element.querySelectorAll("img"));
    await Promise.all(
      images.map(async (img) => {
        if (img.complete && img.naturalWidth > 0) {
          if (typeof img.decode === "function") {
            try {
              await img.decode();
            } catch {
              // Ignore decode failures and continue with best effort.
            }
          }
          return;
        }

        await new Promise((resolve) => {
          const done = () => resolve();
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
        });
      }),
    );

    return html2canvas(element, {
      scale: 5,
      useCORS: true,
      allowTaint: true,
      width: element.scrollWidth,
      height: element.scrollHeight,
      windowWidth: element.scrollWidth,
      windowHeight: element.scrollHeight,
      logging: false,
      backgroundColor: "#ffffff",
    });
  };

  const capturePages = async () => {
    if (termsLoading) {
      showError("Invoice terms are still loading. Please try again in a moment.");
      return null;
    }

    const element = getElement();
    if (!element) {
      showError("Payment receipt element not found.");
      return null;
    }

    // Find the containing wrapper that holds pages
    const container = element.closest(".money-receipt-wrap") || element.parentElement || element;
    const pageEls = Array.from(container.querySelectorAll(".money-receipt-page"));
    if (!pageEls.length) {
      // fallback to single element
      const canvas = await captureReceipt();
      return canvas ? [canvas] : [];
    }

    const html2canvas = (await import("html2canvas")).default;
    const canvases = [];

    for (const el of pageEls) {
      const images = Array.from(el.querySelectorAll("img"));
      await Promise.all(
        images.map(async (img) => {
          if (img.complete && img.naturalWidth > 0) {
            if (typeof img.decode === "function") {
              try {
                await img.decode();
              } catch {
                // Ignore
              }
            }
            return;
          }

          await new Promise((resolve) => {
            const done = () => resolve();
            img.addEventListener("load", done, { once: true });
            img.addEventListener("error", done, { once: true });
          });
        }),
      );

      const canvas = await html2canvas(el, {
        scale: 5,
        useCORS: true,
        allowTaint: true,
        width: el.scrollWidth,
        height: el.scrollHeight,
        windowWidth: el.scrollWidth,
        windowHeight: el.scrollHeight,
        logging: false,
        backgroundColor: "#ffffff",
      });

      canvases.push(canvas);
    }

    return canvases;
  };

  const exportPDF = async () => {
    setLoading((prev) => ({ ...prev, pdf: true }));
    try {
      const canvases = await capturePages();
      if (!canvases || canvases.length === 0) return;

      const jsPDF = (await import("jspdf")).default;

      // Create PDF with the first page size, then add subsequent pages
      const first = canvases[0];
      const imageWidth = first.width;
      const imageHeight = first.height;
      const pageWidthMm = 297;
      const pageHeightMm = (imageHeight / imageWidth) * pageWidthMm;

      const pdf = new jsPDF({ orientation: "l", unit: "mm", format: [pageWidthMm, pageHeightMm], compress: true });

      for (let i = 0; i < canvases.length; i++) {
        const c = canvases[i];
        const imgW = c.width;
        const imgH = c.height;
        const hMm = (imgH / imgW) * pageWidthMm;

        if (i > 0) {
          pdf.addPage([pageWidthMm, hMm]);
        }

        pdf.addImage(c.toDataURL("image/png"), "PNG", 0, 0, pageWidthMm, hMm, undefined, "FAST");
      }

      pdf.save(`${exportFileBaseName}.pdf`);
      showSuccess("Payment receipt PDF downloaded successfully!");
    } catch (error) {
      console.error("Payment receipt PDF export error:", error);
      showError("Payment receipt PDF export failed.");
    } finally {
      setLoading((prev) => ({ ...prev, pdf: false }));
    }
  };

  const exportImage = async () => {
    setLoading((prev) => ({ ...prev, image: true }));
    try {
      const canvases = await capturePages();
      if (!canvases || canvases.length === 0) return;

      if (canvases.length === 1) {
        const link = document.createElement("a");
        link.download = `${exportFileBaseName}.png`;
        link.href = canvases[0].toDataURL("image/png");
        link.click();
        showSuccess("Payment receipt image downloaded successfully!");
      } else {
        // Combine canvases vertically into one image
        const totalWidth = Math.max(...canvases.map((c) => c.width));
        const totalHeight = canvases.reduce((s, c) => s + c.height, 0);
        const out = document.createElement("canvas");
        out.width = totalWidth;
        out.height = totalHeight;
        const ctx = out.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, totalWidth, totalHeight);
        let offsetY = 0;
        canvases.forEach((c) => {
          ctx.drawImage(c, 0, offsetY, c.width, c.height);
          offsetY += c.height;
        });

        const link = document.createElement("a");
        link.download = `${exportFileBaseName}.png`;
        link.href = out.toDataURL("image/png");
        link.click();
        showSuccess("Payment receipt image downloaded successfully!");
      }
    } catch (error) {
      console.error("Payment receipt image export error:", error);
      showError("Payment receipt image export failed.");
    } finally {
      setLoading((prev) => ({ ...prev, image: false }));
    }
  };

  const exportImageSeparate = async () => {
    setLoading((prev) => ({ ...prev, imageSeparate: true }));
    try {
      const canvases = await capturePages();
      if (!canvases || canvases.length === 0) return;

      // Trigger download for each page as a separate PNG (one click per page)
      canvases.forEach((c, idx) => {
        const link = document.createElement("a");
        link.download = `${exportFileBaseName}_page${idx + 1}.png`;
        link.href = c.toDataURL("image/png");
        link.click();
      });
      showSuccess("Payment receipt images downloaded successfully!");
    } catch (error) {
      console.error("Payment receipt image export error:", error);
      showError("Payment receipt image export failed.");
    } finally {
      setLoading((prev) => ({ ...prev, imageSeparate: false }));
    }
  };

  if (!isPrintMode && !show) return null;

  return (
    <div className={isPrintMode ? "money-receipt-print" : undefined}>
      <style>{`
        .money-receipt-modal {
          z-index: 1055;
        }

        .money-receipt-backdrop {
          background: rgba(8, 12, 10, 0.5);
          backdrop-filter: blur(3px);
          z-index: 1050;
        }

        .money-receipt-dialog {
          max-width: min(1220px, 98vw);
          margin: 18px auto;
        }

        .money-receipt-shell {
          border-radius: 12px;
          background: #ffffff;
          border: 1px solid #d2ddd3;
          box-shadow: 0 22px 48px rgba(15, 23, 42, 0.35);
          overflow: hidden;
        }

        .money-receipt-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 16px;
          color: #ffffff;
          background: linear-gradient(90deg, #0e6b3f 0%, #117547 48%, #178454 100%);
        }

        .money-receipt-toolbar h5 {
          margin: 0;
          font-size: 17px;
          font-weight: 800;
          letter-spacing: 0.2px;
        }

        .money-receipt-actions {
          display: flex;
          gap: 8px;
          align-items: center;
          flex-wrap: wrap;
        }

        .mr-btn {
          border: 0;
          border-radius: 8px;
          padding: 7px 12px;
          font-weight: 700;
          cursor: pointer;
        }

        .mr-btn:disabled {
          opacity: 0.72;
          cursor: not-allowed;
        }

        .mr-btn-light {
          background: #ffffff;
          color: #123d29;
        }

        .mr-btn-pdf {
          background: #0f633a;
          color: #fff;
        }

        .mr-btn-image {
          background: #1b7f59;
          color: #fff;
        }

        .money-receipt-wrap {
          overflow: auto;
          max-height: calc(96vh - 60px);
          background: #ffffff;
          padding: 20px;
        }

        .money-receipt-page {
          width: 1080px;
          min-width: 1080px;
          min-height: 420px;
          margin: 0 auto;
          position: relative;
          background: #f1f6e0;
          // border: 1px solid #b9ccb8;
          // box-shadow: 0 16px 38px rgba(15, 23, 42, 0.2);
          box-shadow: rgba(50, 50, 93, 0.25) 0px 50px 100px -20px, rgba(0, 0, 0, 0.3) 0px 30px 60px -30px, rgba(10, 37, 64, 0.35) 0px -2px 6px 0px inset;
          overflow: hidden;
        }

        .money-receipt-terms-page {
          margin-top: 18px;
          min-height: 420px;
          background: #f1f6e0;
          break-before: page;
          page-break-before: always;
        }

        .money-receipt-dot-layer {
          position: absolute;
          inset: 17px 0 17px 0;
          z-index: 1;
          pointer-events: none;
          background-image: var(--money-receipt-dot-image);
          background-repeat: repeat;
          background-size: 14px 14px;
        }

        .money-receipt-topbar,
        .money-receipt-bottombar {
          position: absolute;
          left: 0;
          width: 100%;
          height: 17px;
          background: linear-gradient(90deg, #0b7a43 0%, #129153 35%, #0c864a 68%, #0c723f 100%);
          z-index: 2;
        }

        .money-receipt-topbar {
          top: 0;
        }

        .money-receipt-bottombar {
          bottom: 0;
        }

        .money-receipt-inner {
          position: relative;
          z-index: 3;
          padding: 31px 28px 26px;
        }

        .money-receipt-head {
          display: grid;
          grid-template-columns: 180px 1fr 250px;
          gap: 10px;
          align-items: start;
        }

        .money-receipt-logo {
          width: auto;
          height: 56px;
          max-width: 200px;
          object-fit: contain;
          display: block;
          margin-top: 0;
        }

        .money-receipt-title-wrap {
          display: flex;
          justify-content: center;
          align-items: start;
          padding-top: 2px;
        }

        .money-receipt-title {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: 228px;
          padding: 8px 14px;
          border: 2px solid #1a8c53;
          border-radius: 10px;
          color: #146f41;
          background: rgba(255,255,255,0.9);
          font-size: 34px;
          font-weight: 900;
          line-height: 1;
          letter-spacing: 0.5px;
        }

        .money-receipt-company {
          text-align: right;
          padding-top: 1px;
        }

        .money-receipt-company h3 {
          margin: 0;
          color: #1c7e48;
          font-size: 26px;
          font-weight: 800;
          line-height: 1.04;
        }

        .money-receipt-company p {
          margin: 8px 0 0;
          font-size: 14px;
          color: #6a746a;
          line-height: 1.2;
        }

        .money-receipt-lines {
          margin-top: 12px;
          display: grid;
          gap: 4px;
          --mr-label-width: 180px;
        }

        .line-row {
          display: grid;
          grid-template-columns: var(--mr-label-width) minmax(0, 1fr);
          gap: 8px;
          min-height: 27px;
          border-bottom: 1px solid #bfd1be;
          align-items: end;
        }

        .line-label {
          font-size: 12px;
          color: #22382a;
          font-weight: 700;
          white-space: nowrap;
          padding-bottom: 4px;
        }

        .line-label::after {
          content: ":";
          margin-left: 4px;
        }

        .line-value {
          font-size: 13px;
          color: #213328;
          font-weight: 600;
          min-height: 18px;
          padding-bottom: 3px;
        }

        .split-row {
          display: grid;
          grid-template-columns: 1fr 170px 1fr 130px;
          gap: 8px;
          align-items: end;
          min-height: 27px;
          border-bottom: 1px solid #bfd1be;
        }

        .split-row .line-label,
        .split-row .line-value {
          padding-bottom: 3px;
        }

        .two-col-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 25px;
          align-items: stretch;
        }

        .two-col-item {
          display: grid;
          grid-template-columns: var(--mr-label-width) minmax(0, 1fr);
          gap: 8px;
          min-height: 27px;
          align-items: end;
        }

        .two-col-item .line-label,
        .two-col-item .line-value {
          padding-bottom: 3px;
        }

        .two-col-item .line-value {
          border-bottom: 2px dotted #8b8b8b;
          min-height: 20px;
        }

        .full-row-item {
          display: grid;
          grid-template-columns: var(--mr-label-width) minmax(0, 1fr);
          gap: 8px;
          min-height: 27px;
          align-items: end;
        }

        .full-row-item .line-label,
        .full-row-item .line-value {
          padding-bottom: 3px;
        }

        .full-row-item .line-value {
          border-bottom: 2px dotted #8b8b8b;
          min-height: 20px;
        }

        .bottom-panel {
          margin-top: 10px;
          display: grid;
          grid-template-columns: 430px 1fr;
          gap: 10px;
          align-items: end;
        }

        .amount-field {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          justify-content: flex-start;
          gap: 6px;
          transform: translateY(-46px);
        }

        .amount-note {
          margin-top: 4px;
          font-size: 12px;
          font-weight:600;
          color: #586a5b;
          line-height: 1.3;
          max-width: 500px;
          white-space: nowrap;
        }

        .amount-field .amount-label {
          color: #1c7e48;
          font-size: 14px;
          font-weight: 800;
          line-height: 1;
        }

        .amount-field .amount-box {
          border: 2px solid #9abca3;
          height: 29px;
          display: flex;
          align-items: center;
          min-width: 185px;
          padding: 0 10px;
          background: rgba(255,255,255,0.9);
          color: #000;
          font-size: 13px;
          font-weight: 700;
        }

        .center-tag {
          text-align: center;
          font-size: 12px;
          font-weight: 700;
          color: #21412f;
          padding-bottom: 5px;
        }

        .signature-tag {
          text-align: right;
          font-size: 12px;
          font-weight: 700;
          color: #21412f;
          padding-bottom: 5px;
        }

        .signature-block {
          width: 250px;
          margin-left: auto;
          margin-right: 0;
          transform: translate(-2px, -35px);
          position: relative;
          min-height: 122px;
          padding-top: 38px;
        }

        .founder-signature-image {
          position: absolute;
          left: 20%;
          transform: translateY(-63%);
          height: 98px;
          object-fit: contain;
          pointer-events: none;
        }

        .signature-context {
          margin: 0 0 0px;
          padding: 2px 0 0 0;
          font-size: 10px;
          color: #2f4436;
          font-weight: 700;
          text-align: center;
          line-height: 1.25;
        }

        .signature-line {
          border-top: 2px solid #21412f;
          padding-top: 6px;
        }

        .signature-name {
          margin: 0;
          text-align: center;
          font-size: 14px;
          font-weight: 700;
          color: #21412f;
        }

        .signature-role {
          margin: 0;
          text-align: center;
          font-size: 11px;
          color: #5a6d5f;
          font-weight: 700;
        }

        .money-receipt-note {
          margin-top: 8px;
          font-size: 11px;
          color: #586a5b;
          line-height: 1.35;
        }

        .money-receipt-terms-inner {
          display: flex;
          flex-direction: column;
          gap: 10px;
          min-height: calc(420px - 57px);
        }

        .money-receipt-terms-heading {
          padding: 0 0px 10px;
        }

        .money-receipt-terms-heading-text {
          color: #111;
          font-size: 14px;
          font-weight: 700;
          line-height: 1.45;
          margin: 0;
          text-align: left;
        }

        .money-receipt-terms-list {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px 25px;
          align-content: start;
          padding: 0 0px 8px;
        }

        .money-receipt-terms-item {
          display: flex;
          gap: 8px;
          align-items: flex-start;
          font-size: 14px;
          line-height: 1.3;
        }

        .money-receipt-terms-index {
          width: 22px;
          height: 22px;
          border-radius: 999px;
          border: 2px solid #d9d9d9;
          background: #f6f6f6;
          color: #111111;
          font-size: 11px;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-top: 0;
          flex: 0 0 auto;
          line-height: 1;
          font-variant-numeric: tabular-nums;
        }

        .money-receipt-terms-text {
          color: #6c757d;
          font-size: 14px;
          line-height: 1.45;
          font-weight: 500;
          word-break: break-word;
        }

        .money-receipt-terms-empty {
          border: 1px dashed #a7b8a6;
          background: rgba(255, 255, 255, 0.7);
          border-radius: 10px;
          padding: 18px;
          color: #586a5b;
          font-size: 14px;
          font-weight: 600;
          text-align: center;
        }

        .money-receipt-terms-footer {
          margin-top: auto;
          padding: 0px 0px 0;
          color: #111;
          font-size: 14px;
          font-weight: 700;
          text-align: left;
        }

        .money-receipt-terms-page .money-receipt-head {
          margin-bottom: 8px;
        }

        .money-receipt-terms-body {
          display: flex;
          flex-direction: column;
          gap: 0;
        }

        .money-receipt-terms-body .money-receipt-terms-line {
          padding: 0 12px;
        }

        .money-receipt-terms-body .money-receipt-terms-line span {
          font-size: 14px;
        }

        .money-receipt-terms-body .money-receipt-terms-line .fw-bold {
          color: #111;
          font-weight: 800;
        }

        .money-receipt-terms-page .receipt-contact-footer {
          margin-top: 8px;
        }

        .money-receipt-terms-page .money-receipt-company p {
          margin-top: 6px;
        }

        .receipt-contact-footer {
          margin-top: -26px;
          border: 2px solid #1a8c53;
          background: linear-gradient(180deg, #eef8f0 0%, #e4f3e8 100%);
          border-radius: 50px;
          padding: 6px 10px;
        }

        .receipt-contact-grid {
          display: grid;
          grid-template-columns: 0.9fr 0.9fr 1fr 1.3fr;
          gap: 2px;
          align-items: center;
        }

        .receipt-contact-item {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 0 2px;
        }

        .receipt-contact-icon {
          width: 30px;
          height: 30px;
          border-radius: 999px;
          background: #1a8c53;
          color: #ffffff;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 14px;
          flex: 0 0 auto;
          font-weight: 700;
        }

        .receipt-contact-text {
          min-width: 0;
        }

        .receipt-contact-label {
          display: block;
          font-size: 10px;
          font-weight: 800;
          color: #1c7e48;
          margin-bottom: 1px;
          line-height: 1.1;
        }

        .receipt-contact-value {
          display: block;
          font-size: 12px;
          font-weight: 800;
          color: #1e2b22;
          line-height: 1.1;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        @media print {
          .money-receipt-modal {
            position: static;
            inset: auto;
            background: transparent;
            padding: 0;
            backdrop-filter: none;
          }

          .money-receipt-shell {
            border: 0;
            box-shadow: none;
            max-height: none;
            border-radius: 0;
            width: auto;
          }

          .money-receipt-toolbar {
            display: none;
          }

          .money-receipt-wrap {
            background: transparent;
            max-height: none;
            overflow: visible;
            padding: 0;
          }

          .money-receipt-page {
            width: 297mm;
            min-height: 148mm;
            box-shadow: none;
            border-radius: 0;
          }
        }

        @media (max-width: 768px) {
          .money-receipt-toolbar {
            flex-direction: column;
            align-items: stretch;
            gap: 10px;
          }

          .money-receipt-toolbar h5 {
            font-size: 15px;
            text-align: center;
          }

          .money-receipt-actions {
            justify-content: center;
            gap: 6px;
          }

          .mr-btn {
            padding: 8px 14px;
            font-size: 13px;
            flex: 1 1 auto;
            min-width: 0;
            white-space: nowrap;
            text-align: center;
          }

          .money-receipt-dialog {
            max-width: 100vw;
            margin: 8px auto;
          }

          .money-receipt-shell {
            border-radius: 8px;
            max-height: 96vh;
          }

          .money-receipt-wrap {
            padding: 10px;
          }
        }
      `}</style>

      <div
        className="modal fade show d-block money-receipt-modal"
        role="dialog"
        aria-modal="true"
        tabIndex="-1"
      >
        <div className="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable money-receipt-dialog">
          <div className="modal-content money-receipt-shell">
            {!isPrintMode ? (
              <div className="money-receipt-toolbar">
                <h5>Payment Receipt Preview</h5>
                <div className="money-receipt-actions">
                  <button
                    className="mr-btn mr-btn-pdf"
                    onClick={exportPDF}
                    disabled={loading.pdf || loading.image || termsLoading}
                  >
                    {termsLoading
                      ? "Loading Terms..."
                      : loading.pdf
                        ? "Generating..."
                        : "Export PDF"}
                  </button>
                  <button
                    className="mr-btn mr-btn-pdf"
                    onClick={exportImage}
                    disabled={loading.pdf || loading.image || termsLoading}
                  >
                    {termsLoading
                      ? "Loading Terms..."
                      : loading.image
                        ? "Generating..."
                        : "Export Image"}
                  </button>
                  <button
                    className="mr-btn mr-btn-pdf"
                    onClick={exportImageSeparate}
                    disabled={loading.pdf || loading.imageSeparate || termsLoading}
                  >
                    {termsLoading
                      ? "Loading Terms..."
                      : loading.imageSeparate
                        ? "Generating..."
                        : "Export Image (Pages)"}
                  </button>
                  <button className="mr-btn mr-btn-light" onClick={onClose}>
                    Close
                  </button>
                </div>
              </div>
            ) : null}

            <div className="money-receipt-wrap">
              <div
                id={id || "payment-receipt-preview"}
                className="money-receipt-page"
              >
                <div className="money-receipt-topbar" aria-hidden="true" />
                <div className="money-receipt-bottombar" aria-hidden="true" />
                <div
                  className="money-receipt-dot-layer"
                  aria-hidden="true"
                  style={{ "--money-receipt-dot-image": dotBackgroundImage }}
                />

                <div className="money-receipt-inner">
                  <div className="money-receipt-head">
                    <div>
                      <img
                        src="/Logo.png"
                        alt="Logo"
                        className="money-receipt-logo"
                      />
                    </div>

                    <div className="money-receipt-title-wrap">
                      <div className="money-receipt-title">PAYMENT RECEIPT</div>
                    </div>

                    <div className="money-receipt-company">
                      <h3>{data.companyName}</h3>
                      <p>{data.companyAddress}</p>
                    </div>
                  </div>

                  <div className="money-receipt-lines">
                    <div className="two-col-row">
                      <div className="two-col-item">
                        <div className="line-label">Payment Receipt No.</div>
                        <div className="line-value">{receiptRefNumber}</div>
                      </div>
                      <div className="two-col-item">
                        <div className="line-label">Date</div>
                        <div className="line-value">
                          {data.receiptDate || "-"}
                        </div>
                      </div>
                    </div>

                    <div className="two-col-row">
                      <div className="two-col-item">
                        <div className="line-label">Client Name</div>
                        <div className="line-value">
                          {data.clientName || "-"}
                        </div>
                      </div>
                      <div className="two-col-item">
                        <div className="line-label">Business Name</div>
                        <div className="line-value">
                          {data.businessName || "-"}
                        </div>
                      </div>
                    </div>

                    <div className="two-col-row">
                      <div className="two-col-item">
                        <div className="line-label">Contact Number</div>
                        <div className="line-value">
                          {data.contactNo || "-"}
                        </div>
                      </div>
                      <div className="two-col-item">
                        <div className="line-label">Address</div>
                        <div className="line-value">{displayClientAddress}</div>
                      </div>
                    </div>

                    <div className="two-col-row">
                      <div className="two-col-item">
                        <div className="line-label">
                          Reference Invoice Number
                        </div>
                        <div className="line-value">
                          {referenceInvoiceNumber}
                        </div>
                      </div>
                      <div className="two-col-item">
                        <div className="line-label">
                          For the purpose of payment
                        </div>
                        <div className="line-value">{displayPurpose}</div>
                      </div>
                    </div>

                    <div className="two-col-row">
                      <div className="two-col-item">
                        <div className="line-label">Payment Method</div>
                        <div className="line-value">
                          {data.paymentMethod || "-"}
                        </div>
                      </div>
                      <div className="two-col-item">
                        <div className="line-label">Payment Received By</div>
                        <div className="line-value">{displayReceivedBy}</div>
                      </div>
                    </div>

                    <div className="full-row-item">
                      <div className="line-label">Amount in a word</div>
                      <div className="line-value">
                        {data.amountInWords || "-"}
                      </div>
                    </div>
                  </div>

                  <div className="bottom-panel">
                    <div className="amount-field">
                      <div className="amount-label">Amount</div>
                      <div className="amount-box">Rs {amountText}</div>
                      <div className="amount-note">
                        This receipt confirms that the above payment has been
                        successfully received. Please read the Terms &
                        Conditions given on Page 2 carefully.
                      </div>
                    </div>

                    <div className="signature-block">
                      <img
                        src="/Invoice/Signture.png"
                        alt="Founder seal and signature"
                        className="founder-signature-image"
                      />
                      <p className="signature-context">
                        This signature is for receipt of {receiptRefNumber}
                        <br />
                        Date & Time : {signatureDateTimeText}
                      </p>
                      <div className="signature-line">
                        <p className="signature-name">Vipin Khandelwal</p>
                        <p className="signature-role">Founder & CEO</p>
                      </div>
                    </div>
                  </div>

                  <div className="receipt-contact-footer">
                    <div className="receipt-contact-grid">
                      <div className="receipt-contact-item">
                        <span className="receipt-contact-icon">
                          {renderContactIcon("phone")}
                        </span>
                        <div className="receipt-contact-text">
                          <span className="receipt-contact-label">
                            Phone Number
                          </span>
                          <span className="receipt-contact-value">
                            {companyPhoneDisplay}
                          </span>
                        </div>
                      </div>
                      <div className="receipt-contact-item">
                        <span className="receipt-contact-icon">
                          {renderContactIcon("web")}
                        </span>
                        <div className="receipt-contact-text">
                          <span className="receipt-contact-label">
                            More Information
                          </span>
                          <span className="receipt-contact-value">
                            {companyWebsiteDisplay}
                          </span>
                        </div>
                      </div>
                      <div className="receipt-contact-item">
                        <span className="receipt-contact-icon">
                          {renderContactIcon("email")}
                        </span>
                        <div className="receipt-contact-text">
                          <span className="receipt-contact-label">
                            Send Requirement To
                          </span>
                          <span className="receipt-contact-value">
                            {companyEmailDisplay}
                          </span>
                        </div>
                      </div>
                      <div className="receipt-contact-item">
                        <span className="receipt-contact-icon">
                          {renderContactIcon("address")}
                        </span>
                        <div className="receipt-contact-text">
                          <span className="receipt-contact-label">
                            Office Address
                          </span>
                          <span className="receipt-contact-value">
                            {companyAddressDisplay}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="money-receipt-page money-receipt-terms-page">
                <div className="money-receipt-topbar" aria-hidden="true" />
                <div className="money-receipt-bottombar" aria-hidden="true" />
                <div
                  className="money-receipt-dot-layer"
                  aria-hidden="true"
                  style={{ "--money-receipt-dot-image": dotBackgroundImage }}
                />

                <div className="money-receipt-inner money-receipt-terms-inner">
                  <div className="money-receipt-head">
                    <div>
                      <img
                        src="/Logo.png"
                        alt="Logo"
                        className="money-receipt-logo"
                      />
                    </div>

                    <div className="money-receipt-title-wrap">
                      <div className="money-receipt-title">Terms & Conditions</div>
                    </div>

                    <div className="money-receipt-company">
                      <h3>{data.companyName}</h3>
                      <p>{data.companyAddress}</p>
                    </div>
                  </div>

                  <div className="money-receipt-terms-body">
                    <div className="money-receipt-terms-heading">
                      <div className="money-receipt-terms-heading-text">
                        Terms & Conditions (Full Terms & Conditions are
                        available on our website:
                        https://www.maxcode.in/terms-conditions) :
                      </div>
                    </div>

                    {termsConditions.length > 0 ? (
                      <div className="money-receipt-terms-list">
                        {termsConditions.map((term, index) => (
                          <div
                            key={`${index}-${term}`}
                            className="money-receipt-terms-item"
                          >
                            <span className="money-receipt-terms-index">
                              {index + 1}
                            </span>
                            <span className="money-receipt-terms-text">
                              {term}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="money-receipt-terms-empty">
                        No invoice terms were configured for this receipt.
                      </div>
                    )}

                    <div className="money-receipt-terms-footer">
                      By continuing the services or project with MaxCode IT
                      Services, the client agrees to these Terms & Conditions
                      and full terms available on our website.
                    </div>
                    <div class="amount-note mt-1"><strong className="text-danger">Note: </strong>Payments made to MaxCode IT Services for any services or any project work are non-refundable. This is a computer-generated receipt for accounting purposes.</div>
                  </div>

                  <div className="receipt-contact-footer">
                    <div className="receipt-contact-grid">
                      <div className="receipt-contact-item">
                        <span className="receipt-contact-icon">
                          {renderContactIcon("phone")}
                        </span>
                        <div className="receipt-contact-text">
                          <span className="receipt-contact-label">
                            Phone Number
                          </span>
                          <span className="receipt-contact-value">
                            {companyPhoneDisplay}
                          </span>
                        </div>
                      </div>
                      <div className="receipt-contact-item">
                        <span className="receipt-contact-icon">
                          {renderContactIcon("web")}
                        </span>
                        <div className="receipt-contact-text">
                          <span className="receipt-contact-label">
                            More Information
                          </span>
                          <span className="receipt-contact-value">
                            {companyWebsiteDisplay}
                          </span>
                        </div>
                      </div>
                      <div className="receipt-contact-item">
                        <span className="receipt-contact-icon">
                          {renderContactIcon("email")}
                        </span>
                        <div className="receipt-contact-text">
                          <span className="receipt-contact-label">
                            Send Requirement To
                          </span>
                          <span className="receipt-contact-value">
                            {companyEmailDisplay}
                          </span>
                        </div>
                      </div>
                      <div className="receipt-contact-item">
                        <span className="receipt-contact-icon">
                          {renderContactIcon("address")}
                        </span>
                        <div className="receipt-contact-text">
                          <span className="receipt-contact-label">
                            Office Address
                          </span>
                          <span className="receipt-contact-value">
                            {companyAddressDisplay}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {!isPrintMode ? (
        <div
          className="modal-backdrop fade show money-receipt-backdrop"
          onClick={onClose}
        />
      ) : null}
      {!isPrintMode ? (
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css"
        />
      ) : null}
    </div>
  );
};

export default PaymentReceiptPreview;
