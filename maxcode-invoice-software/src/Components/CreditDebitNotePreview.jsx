import { showSuccess, showError } from "./ToastNotification";
import React, { useState, useEffect } from "react";
import { apiGet } from "../utils/api";
import API_ENDPOINTS from "../utils/apiEndpoints";

const CreditDebitNotePreview = ({
  id,
  noteData: providedNoteData,
  show = false,
  onClose = () => {},
  renderMode = "modal",
}) => {
  const [loading, setLoading] = useState({
    pdf: false,
    image: false,
  });
  const [noteRecord, setNoteRecord] = useState(null);
  const [invoiceRecord, setInvoiceRecord] = useState(null);
  const [dataLoading, setDataLoading] = useState(false);

  const noteType =
    noteRecord?.noteType === "Debit Note"
      ? "Debit Note"
      : providedNoteData?.noteType === "Debit Note"
        ? "Debit Note"
        : "Credit Note";

  const defaultTermsConditions = [];

  const [termsConditions, setTermsConditions] = useState(
    defaultTermsConditions,
  );
  const [businessSettings, setBusinessSettings] = useState({});

  const rawNoteData = noteRecord || providedNoteData || {};

  const normalizedItems = Array.isArray(rawNoteData?.items)
    ? rawNoteData.items
    : [];

  const notePreviewData = {
    ...rawNoteData,
    invoiceNumber: rawNoteData.noteNumber || rawNoteData.invoiceNumber || "",
    orderNumber:
      rawNoteData.invoiceNumber ||
      rawNoteData.referenceNumber ||
      rawNoteData.referenceInvoiceNo ||
      rawNoteData.invoiceId ||
      "",
    items: normalizedItems.map((item) => ({
      serviceName: item.serviceName || item.itemName || "",
      description: item.description || item.itemDescription || "",
      hsnCode: item.hsnCode || "",
      qty: Number(item.qty || 0),
      price: Number(item.price || 0),
      amount: Number(item.amount || 0),
    })),
  };

  const isPrintMode = renderMode === "print";

  const getFirstNonEmptyValue = (...values) => {
    for (const value of values) {
      const normalized = String(value ?? "").trim();
      if (normalized) return normalized;
    }
    return "";
  };

  const contactDetails = {
    companyName: getFirstNonEmptyValue(
      businessSettings.companyName,
      noteRecord?.companyName,
      providedNoteData?.companyName,
    ),
    companyPhone: getFirstNonEmptyValue(
      businessSettings.companyPhone,
      businessSettings.phone,
      businessSettings.phoneNumber,
      businessSettings.contactPhone,
      noteRecord?.companyPhone,
      providedNoteData?.companyPhone,
    ),
    companyWebsite: getFirstNonEmptyValue(
      businessSettings.companyWebsite,
      businessSettings.website,
      businessSettings.webSite,
      businessSettings.companyUrl,
      businessSettings.websiteUrl,
      noteRecord?.companyWebsite,
      providedNoteData?.companyWebsite,
    ),
    companyEmail: getFirstNonEmptyValue(
      businessSettings.companyEmail,
      businessSettings.email,
      businessSettings.officialEmail,
      businessSettings.contactEmail,
      noteRecord?.companyEmail,
      providedNoteData?.companyEmail,
    ),
    companyAddress: getFirstNonEmptyValue(
      businessSettings.companyAddress,
      noteRecord?.companyAddress,
      providedNoteData?.companyAddress,
    ),
    companyGstin: getFirstNonEmptyValue(
      businessSettings.gstin,
      businessSettings.companyGstin,
      noteRecord?.companyGstin,
      providedNoteData?.companyGstin,
    ),
  };

  useEffect(() => {
    if (isPrintMode) return;

    if (show) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }

    return () => {
      document.body.style.overflow = "auto";
    };
  }, [show, isPrintMode]);

  useEffect(() => {
    if (!show || !id) {
      setNoteRecord(null);
      setInvoiceRecord(null);
      setDataLoading(false);
      return;
    }

    let mounted = true;

    const fetchNote = async () => {
      setDataLoading(true);

      try {
        const response = await apiGet(API_ENDPOINTS.CREDIT_DEBIT_NOTES.GET(id));
        if (!mounted) return;
        setNoteRecord(response?.data || null);
      } catch (error) {
        console.error("Failed to load credit/debit note preview:", error);
        if (mounted) {
          setNoteRecord(null);
          showError("Unable to load note preview data");
        }
      } finally {
        if (mounted) setDataLoading(false);
      }
    };

    fetchNote();

    return () => {
      mounted = false;
    };
  }, [show, id]);

  useEffect(() => {
    const invoiceId = noteRecord?.invoiceId || noteRecord?.invoiceRefId;
    if (!show || !invoiceId) {
      setInvoiceRecord(null);
      return;
    }

    let mounted = true;

    const fetchInvoice = async () => {
      try {
        const response = await apiGet(API_ENDPOINTS.INVOICES.GET(invoiceId));
        if (!mounted) return;
        setInvoiceRecord(response?.data || null);
      } catch (error) {
        if (mounted) setInvoiceRecord(null);
      }
    };

    fetchInvoice();

    return () => {
      mounted = false;
    };
  }, [show, noteRecord?.invoiceId, noteRecord?.invoiceRefId]);

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

  useEffect(() => {
    let mounted = true;
    const noteTermsSnapshot =
      notePreviewData.creditDebitNoteTermsConditionsSnapshot;
    const noteTermsVersion = String(
      notePreviewData.creditDebitNoteTermsVersion || "",
    ).trim();

    if (noteTermsSnapshot) {
      const parsedSnapshot = parseTerms(noteTermsSnapshot, []);
      if (parsedSnapshot.length > 0) {
        setTermsConditions(parsedSnapshot);
        return () => {
          mounted = false;
        };
      }
    }

    const applyTerms = (settings) => {
      if (!mounted || !settings || typeof settings !== "object") return;
      setBusinessSettings(settings);
      const parsed = parseTerms(
        settings.creditDebitNoteTermsConditions ||
          settings.creditDebitNoteTerms ||
          settings.noteTermsConditions ||
          settings.creditDebitTermsConditions,
        defaultTermsConditions,
      );
      setTermsConditions(parsed);
    };

    const loadTerms = async () => {
      if (/^V\d+\.\d+\.\d+$/i.test(noteTermsVersion)) {
        try {
          const versionResponse = await apiGet(
            API_ENDPOINTS.BUSINESS_SETTINGS.TERMS_BY_VERSION(
              "creditDebitNote",
              noteTermsVersion,
            ),
          );
          const versionTerms = parseTerms(versionResponse?.data?.terms, []);
          if (versionTerms.length > 0 && mounted) {
            setTermsConditions(versionTerms);
            return;
          }
        } catch (error) {
          // Fallback to current settings terms below.
        }
      }

      const cached = localStorage.getItem("business_settings");
      if (cached) {
        try {
          const cachedSettings = JSON.parse(cached);
          applyTerms(cachedSettings);
        } catch (error) {
          console.error("Failed to parse cached business settings:", error);
        }
      }

      try {
        const response = await apiGet(API_ENDPOINTS.BUSINESS_SETTINGS.GET);
        const remoteSettings = response?.data?.settings;
        if (remoteSettings) {
          applyTerms(remoteSettings);
          localStorage.removeItem("business_settings");
        }
      } catch (error) {
        console.error("Failed to fetch note terms:", error);
      }
    };

    loadTerms();

    return () => {
      mounted = false;
    };
  }, [
    notePreviewData.creditDebitNoteTermsVersion,
    notePreviewData.creditDebitNoteTermsConditionsSnapshot,
  ]);

  const items = notePreviewData.items;
  const toMoney = (value) => Number((Number(value) || 0).toFixed(2));

  const subtotal = toMoney(
    notePreviewData.subtotal ?? notePreviewData.amount ?? 0,
  );
  const discountAmount = toMoney(notePreviewData.discountAmount || 0);
  const taxRate = Number(
    notePreviewData.taxPercent ?? notePreviewData.taxRate ?? 0,
  );
  const derivedTaxAmount = toMoney((subtotal * taxRate) / 100);
  const taxAmount = toMoney(notePreviewData.taxAmount ?? derivedTaxAmount);

  const placeOfSupplyText = String(
    notePreviewData.placeOfSupply || "",
  ).toLowerCase();
  const isRajasthanSupply =
    placeOfSupplyText.includes("rajasthan") ||
    placeOfSupplyText.includes("(08)") ||
    /\b08\b/.test(placeOfSupplyText);

  const derivedCgst = isRajasthanSupply ? toMoney(taxAmount / 2) : 0;
  const derivedSgst = isRajasthanSupply ? toMoney(taxAmount / 2) : 0;
  const derivedIgst = isRajasthanSupply ? 0 : taxAmount;

  const cgst = toMoney(notePreviewData.cgst ?? derivedCgst);
  const sgst = toMoney(notePreviewData.sgst ?? derivedSgst);
  const igst = toMoney(notePreviewData.igst ?? derivedIgst);

  const cgstPercent = Number(
    notePreviewData.cgstPercent ?? (isRajasthanSupply ? taxRate / 2 : 0),
  );
  const sgstPercent = Number(
    notePreviewData.sgstPercent ?? (isRajasthanSupply ? taxRate / 2 : 0),
  );
  const igstPercent = Number(
    notePreviewData.igstPercent ?? (isRajasthanSupply ? 0 : taxRate),
  );

  const roundingAmount = toMoney(notePreviewData.roundingAmount || 0);
  const totalAmount = toMoney(
    notePreviewData.totalAmount ?? subtotal + taxAmount + roundingAmount,
  );
  const upiAmount = Number.isFinite(totalAmount) ? totalAmount : 0;
  const accountDetails = {
    accountName: getFirstNonEmptyValue(
      businessSettings.accountName,
      businessSettings.bankAccountName,
      notePreviewData.accountName,
    ),
    bankName: getFirstNonEmptyValue(
      businessSettings.bankName,
      notePreviewData.bankName,
    ),
    accountNumber: getFirstNonEmptyValue(
      businessSettings.accountNumber,
      notePreviewData.accountNumber,
    ),
    ifscCode: getFirstNonEmptyValue(
      businessSettings.ifscCode,
      notePreviewData.ifscCode,
    ),
    branchAddress: getFirstNonEmptyValue(
      businessSettings.branchAddress,
      notePreviewData.branchAddress,
    ),
  };
  const upiPayload = `upi://pay?pa=maxcode@aubank&pn=${encodeURIComponent(
    contactDetails.companyName || "",
  )}&am=${upiAmount.toFixed(2)}&cu=INR`;

  const formatDateTimeForDisplay = (dateString) => {
    if (!dateString) return "";

    try {
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        const day = String(date.getDate()).padStart(2, "0");
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const year = date.getFullYear();

        let hours = date.getHours();
        const minutes = String(date.getMinutes()).padStart(2, "0");
        const seconds = String(date.getSeconds()).padStart(2, "0");
        const ampm = hours >= 12 ? "PM" : "AM";

        hours = hours % 12;
        hours = hours ? hours : 12;
        const formattedHours = String(hours).padStart(2, "0");

        return `${day}-${month}-${year} | ${formattedHours}:${minutes}:${seconds} ${ampm}`;
      }

      return dateString;
    } catch (e) {
      return dateString;
    }
  };

  const signatureDateTime =
    notePreviewData.createdDateTime ||
    formatDateTimeForDisplay(notePreviewData.createdDate) ||
    formatDateTimeForDisplay(new Date());

  const formatDateOnly = (value) => {
    if (!value) return "";

    try {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) {
        const day = String(date.getDate()).padStart(2, "0");
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
      }

      const text = String(value).trim();
      const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (match) {
        return `${match[3]}-${match[2]}-${match[1]}`;
      }

      return text;
    } catch {
      return String(value);
    }
  };

  const formatCurrency = (val) => {
    const num = Number(val);
    const safe = Number.isFinite(num) ? num : 0;

    return new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safe);
  };

  const paymentDateToShow =
    formatDateOnly(
      noteType === "Credit Note"
        ? notePreviewData.refundDate || noteRecord?.refundDate
        : notePreviewData.paymentDate || noteRecord?.paymentDate,
    ) || "-";
  const refundMethod = String(
    notePreviewData.refundMethod || noteRecord?.refundMethod || "",
  ).trim();
  const advanceAdjustment = toMoney(
    notePreviewData.advanceAdjustedTotal ||
      noteRecord?.advanceAdjustedTotal ||
      0,
  );
  const tdsPercent = Number(
    notePreviewData.tdsPercent || noteRecord?.tdsPercent || 0,
  );
  const tdsAmount = toMoney(
    notePreviewData.tdsAmount || noteRecord?.tdsAmount || 0,
  );
  const totalReceived = toMoney(
    noteType === "Credit Note"
      ? notePreviewData.refundAmount || noteRecord?.refundAmount || 0
      : notePreviewData.receivedAmount ||
          noteRecord?.receivedAmount ||
          notePreviewData.amountReceived ||
          noteRecord?.amountReceived ||
          0,
  );
  const totalDue = Math.max(
    0,
    toMoney(totalAmount - totalReceived - tdsAmount),
  );
  const paymentStatusText = String(
    noteType === "Credit Note"
      ? notePreviewData.refundStatus || noteRecord?.refundStatus || ""
      : notePreviewData.paymentStatus || noteRecord?.paymentStatus || "",
  )
    .trim()
    .toUpperCase();

  const numberToWords = (num) => {
    if (num === 0) return "Zero";

    const ones = [
      "",
      "One",
      "Two",
      "Three",
      "Four",
      "Five",
      "Six",
      "Seven",
      "Eight",
      "Nine",
      "Ten",
      "Eleven",
      "Twelve",
      "Thirteen",
      "Fourteen",
      "Fifteen",
      "Sixteen",
      "Seventeen",
      "Eighteen",
      "Nineteen",
    ];
    const tens = [
      "",
      "",
      "Twenty",
      "Thirty",
      "Forty",
      "Fifty",
      "Sixty",
      "Seventy",
      "Eighty",
      "Ninety",
    ];

    const convertLessThanThousand = (n) => {
      if (n < 20) return ones[n];
      if (n < 100)
        return tens[Math.floor(n / 10)] + (n % 10 ? ` ${ones[n % 10]}` : "");
      return (
        ones[Math.floor(n / 100)] +
        " Hundred" +
        (n % 100 ? ` ${convertLessThanThousand(n % 100)}` : "")
      );
    };

    if (num < 1000) return convertLessThanThousand(num);
    if (num < 100000)
      return (
        convertLessThanThousand(Math.floor(num / 1000)) +
        " Thousand" +
        (num % 1000 ? ` ${convertLessThanThousand(num % 1000)}` : "")
      );
    if (num < 10000000)
      return (
        convertLessThanThousand(Math.floor(num / 100000)) +
        " Lakh" +
        (num % 100000 ? ` ${convertLessThanThousand(num % 100000)}` : "")
      );
    return (
      convertLessThanThousand(Math.floor(num / 10000000)) +
      " Crore" +
      (num % 10000000 ? ` ${convertLessThanThousand(num % 10000000)}` : "")
    );
  };

  const amountInWords = (num) =>
    `${numberToWords(Math.round(num))} Rupees Only`;

  const renderContactIcon = (type) => {
    if (!isPrintMode) {
      if (type === "phone")
        return <i className="bi bi-telephone-fill fs-3"></i>;
      if (type === "web") return <i className="bi bi-globe fs-2"></i>;
      if (type === "address")
        return <i className="bi bi-geo-alt-fill fs-2"></i>;
      return <i className="bi bi-envelope-fill fs-2"></i>;
    }

    if (type === "phone") {
      return (
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M6.62 10.79a15.053 15.053 0 006.59 6.59l2.2-2.2a1 1 0 011.01-.24c1.12.37 2.33.57 3.58.57a1 1 0 011 1V20a1 1 0 01-1 1C10.07 21 3 13.93 3 5a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.46.57 3.58a1 1 0 01-.24 1.01l-2.21 2.2z" />
        </svg>
      );
    }

    if (type === "web") {
      return (
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12 2C6.49 2 2 6.49 2 12s4.49 10 10 10 10-4.49 10-10S17.51 2 12 2zm7.93 9h-3.18a15.7 15.7 0 00-1.36-5.11A8.03 8.03 0 0119.93 11zM12 4c1.3 0 2.71 2.07 3.43 5H8.57C9.29 6.07 10.7 4 12 4zM4.07 11a8.03 8.03 0 014.54-5.11A15.7 15.7 0 007.25 11H4.07zM4.07 13h3.18a15.7 15.7 0 001.36 5.11A8.03 8.03 0 014.07 13zM12 20c-1.3 0-2.71-2.07-3.43-5h6.86C14.71 17.93 13.3 20 12 20zm3.93-1.89A15.7 15.7 0 0016.75 13h3.18a8.03 8.03 0 01-4 5.11z" />
        </svg>
      );
    }

    if (type === "address") {
      return (
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
        >
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1112 6a2.5 2.5 0 010 5.5z" />
        </svg>
      );
    }

    return (
      <svg
        width="26"
        height="26"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M20 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V6a2 2 0 00-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z" />
      </svg>
    );
  };

  const exportPDF = async () => {
    setLoading((prev) => ({ ...prev, pdf: true }));

    try {
      const element = document.getElementById(
        id || "credit-debit-note-preview",
      );
      if (!element) {
        showError("Preview element not found");
        return;
      }

      const html2canvas = (await import("html2canvas")).default;
      const jsPDF = (await import("jspdf")).default;

      const canvas = await html2canvas(element, {
        scale: 4,
        useCORS: true,
        allowTaint: true,
        width: element.offsetWidth,
        height: element.offsetHeight,
        logging: false,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/jpeg", 1.0);
      const pdf = new jsPDF({
        orientation: "p",
        unit: "mm",
        format: "a4",
        compress: true,
      });

      const pdfWidth = 210;
      const pdfHeight = 297;
      const saveNumber = String(
        notePreviewData.invoiceNumber || "Note",
      ).replace(/\//g, "-");

      pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${saveNumber}.pdf`);

      showSuccess("PDF downloaded successfully!");
    } catch (error) {
      console.error("Error generating PDF:", error);
      showError("Error generating PDF. Please try again.");
    } finally {
      setLoading((prev) => ({ ...prev, pdf: false }));
    }
  };

  const exportImage = async () => {
    setLoading((prev) => ({ ...prev, image: true }));

    try {
      const element = document.getElementById(
        id || "credit-debit-note-preview",
      );
      if (!element) {
        showError("Preview element not found");
        return;
      }

      const html2canvas = (await import("html2canvas")).default;

      const canvas = await html2canvas(element, {
        scale: 5,
        useCORS: true,
        allowTaint: true,
        width: element.offsetWidth,
        height: element.offsetHeight,
        logging: false,
        backgroundColor: "#ffffff",
      });

      const link = document.createElement("a");
      const saveNumber = String(
        notePreviewData.invoiceNumber || "Note",
      ).replace(/\//g, "-");
      link.download = `${saveNumber}.jpg`;
      link.href = canvas.toDataURL("image/jpeg", 1.0);
      link.click();

      showSuccess("High-res image downloaded successfully!");
    } catch (error) {
      console.error("Error generating image:", error);
      showError("Error generating image. Please try again.");
    } finally {
      setLoading((prev) => ({ ...prev, image: false }));
    }
  };

  if (!isPrintMode && !show) return null;

  if (!isPrintMode && dataLoading && !providedNoteData) {
    return (
      <div
        className="modal show d-block"
        tabIndex="-1"
        role="dialog"
        style={{ backgroundColor: "rgba(0,0,0,0.75)" }}
      >
        <div className="modal-dialog modal-fullscreen" role="document">
          <div className="modal-content">
            <div className="modal-body d-flex align-items-center justify-content-center">
              <div className="text-center">
                <div
                  className="spinner-border text-primary mb-3"
                  role="status"
                ></div>
                <div className="fw-bold">Loading preview...</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={isPrintMode ? "invoice-print" : undefined}>
      <style>
        {`
          .modal-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
          }

          .btn-download {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-weight: 500;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 5px;
            transition: all 0.3s ease;
            min-width: 100px;
          }

          .btn-download:disabled {
            opacity: 0.6;
            cursor: not-allowed;
          }

          .btn-pdf {
            background: #dc3545;
            color: white;
          }

          .btn-pdf:hover:not(:disabled) {
            background: #bb2d3b;
          }

          .btn-image {
            background: #28a745;
            color: white;
          }

          .btn-image:hover:not(:disabled) {
            background: #218838;
          }

          .bg-orange {
            background-color: #ff5c00 !important;
          }

          .a4-page {
            font-family: 'Roboto', sans-serif;
            width: 280mm;
            min-height: 360mm;
            padding: 12mm;
            margin: 0 auto;
            background: white;
            position: relative;
            box-shadow: 0 0 40px rgba(0,0,0,0.1);
            color: #000;
            line-height: 1.4;
          }

          .invoice-table th,
          .invoice-table td {
            border-top: 3px solid #000 !important;
            border-left: 3px solid #000 !important;
            padding: 6px 4px;
          }

          .invoice-table th:last-child,
          .invoice-table td:last-child {
            border-right: 3px solid #000 !important;
          }

          .invoice-table tr:last-child td {
            border-bottom: 3px solid #000 !important;
          }

          .invoice-table thead th {
            background-color: #f3e5c8 !important;
            font-weight: bold;
          }

          .invoice-table th:first-child,
          .invoice-table td:first-child {
            border-left: none !important;
          }

          .invoice-table th:last-child,
          .invoice-table td:last-child {
            border-right: none !important;
          }

          .invoice-print .modal {
            position: static !important;
            background: transparent !important;
          }

          .invoice-print .modal-dialog {
            margin: 0 !important;
            max-width: none !important;
            width: auto !important;
          }

          .invoice-print .modal-content {
            border: 0 !important;
            background: transparent !important;
          }

          .invoice-print .modal-header {
            display: none !important;
          }

          .invoice-print .modal-body {
            padding: 0 !important;
            background: transparent !important;
          }

          .payment-wrapper {
            position: relative;
            z-index: 1;
          }

          .payment-wrapper > *:not(.payment-seal) {
            position: relative;
            z-index: 2;
          }

          .payment-seal {
            position: absolute;
            top: 70px;
            right: 50px;
            transform: rotate(-25deg);
            border: 4px solid #1aa34a;
            color: #1aa34a;
            font-weight: 800;
            font-size: 25px;
            padding: 5px 8px;
            text-transform: uppercase;
            letter-spacing: 2px;
            background: rgba(0, 128, 0, 0.05);
            opacity: 1;
            z-index: 0;
            pointer-events: none;
            box-shadow: 0 0 10px rgba(0, 128, 0, 0.3);
            border-radius: 8px;
          }

          .payment-seal--pending {
            border-color: #ff0000;
            color: #ff0000;
            background: rgba(179, 0, 0, 0.05);
            box-shadow: 0 0 10px rgba(179, 0, 0, 0.3);
          }

          .payment-seal--partial {
            border-color: #f55900;
            color: #f55900;
            background: rgba(240, 173, 78, 0.1);
            box-shadow: 0 0 10px rgba(240, 137, 78, 0.35);
            text-align: center;
          }

          .payment-seal::before {
            content: "";
            position: absolute;
            inset: -6px;
            border: 2px dashed #1aa34a;
            border-radius: 10px;
            opacity: 0.6;
          }

          .payment-seal--pending::before {
            border-color: #ff0000;
          }

          .payment-seal--partial::before {
            border-color: #f0ad4e;
          }

          @media print {
            .no-print { display: none !important; }
            body { background: white; margin: 0; padding: 0; }
            .a4-page { box-shadow: none; margin: 0 !important; padding: 12mm; width: 210mm; min-height: 297mm; }
          }
        `}
      </style>

      <div
        className="modal show d-block"
        tabIndex="-1"
        role="dialog"
        style={{ backgroundColor: "rgba(0,0,0,0.75)" }}
      >
        <div
          className="modal-dialog modal-fullscreen overflow-hidden"
          role="document"
        >
          <div className="modal-content">
            <div className="modal-header d-flex flex-column flex-md-row align-items-start align-items-md-center">
              <h5 className="modal-title text-start text-nowrap mb-2 mb-md-0">
                {noteType} Preview - {notePreviewData.invoiceNumber}
              </h5>

              <div className="d-flex w-100 justify-content-between align-items-center w-md-auto justify-content-md-end ms-md-auto">
                <div className="d-flex gap-2">
                  <button
                    onClick={exportPDF}
                    disabled={loading.pdf || loading.image}
                    className="btn-download btn-pdf"
                  >
                    {loading.pdf ? "Generating..." : "PDF"}
                  </button>

                  <button
                    onClick={exportImage}
                    disabled={loading.pdf || loading.image}
                    className="btn-download btn-image"
                  >
                    {loading.image ? "Generating..." : "Image"}
                  </button>
                </div>

                <button
                  type="button"
                  className="btn-close ms-2"
                  onClick={onClose}
                ></button>
              </div>
            </div>

            <div className="modal-body p-0" style={{ background: "#f1f1f1" }}>
              <div id={id || "credit-debit-note-preview"} className="a4-page">
                <div
                  style={{
                    border: "3px solid #000",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div
                    className="d-flex justify-content-between align-items-start p-3"
                    style={{ borderBottom: "3px solid #000" }}
                  >
                    <div className="d-flex align-items-center">
                      <img
                        src="/Logo.png"
                        alt="Logo"
                        style={{
                          height: "90px",
                          width: "380px",
                          objectFit: "contain",
                        }}
                      />
                    </div>
                    <div className="text-end">
                      <h2
                        className="mb-0 fw-black text-dark"
                        style={{ fontSize: "32px", fontWeight: "900" }}
                      >
                        {contactDetails.companyName || "-"}
                      </h2>
                      <p className="mb-0 fw-bold" style={{ fontSize: "16px" }}>
                        {contactDetails.companyAddress || "-"}
                      </p>
                      <p
                        className="mb-0 fw-bold text-dark"
                        style={{ fontSize: "16px" }}
                      >
                        GSTIN: {contactDetails.companyGstin || "-"}
                      </p>
                    </div>
                  </div>

                  <div className="row g-0">
                    <div
                      className="col-4 p-3"
                      style={{ width: "32.5%", borderRight: "3px solid #000" }}
                    >
                      <h6 className="fw-black mb-3 h4 fw-bold">
                        {noteType === "Debit Note"
                          ? "DEBIT NOTE"
                          : "CREDIT NOTE"}
                      </h6>
                      <div className="fs-6">
                        <div className="d-flex mb-1">
                          <span style={{ width: "110px" }}>Note Date</span>
                          <span className="fw-bold">
                            :{" "}
                            {formatDateOnly(
                              notePreviewData.invoiceDate ||
                                notePreviewData.noteDate,
                            )}
                          </span>
                        </div>
                        <div className="d-flex mb-1">
                          <span style={{ width: "110px" }}>Note Number</span>
                          <span className="fw-bold">
                            : {notePreviewData.invoiceNumber}
                          </span>
                        </div>
                        <div className="d-flex mb-1">
                          <span style={{ width: "110px" }}>
                            Invoice Ref. No.
                          </span>
                          <span className="fw-bold">
                            : {notePreviewData.orderNumber}
                          </span>
                        </div>
                        <div className="d-flex mb-1">
                          <span style={{ width: "110px" }}>
                            {noteType === "Debit Note"
                              ? "Reason for DN"
                              : "Reason for CN"}
                          </span>
                          <span className="fw-bold">
                            :{" "}
                            {notePreviewData.reasonAdjustmentType ||
                              noteRecord?.reasonAdjustmentType ||
                              "-"}
                          </span>
                        </div>
                        <div className="d-flex mb-1">
                          <span style={{ width: "110px" }}>
                            Place of Supply
                          </span>
                          <span className="fw-bold">
                            : {notePreviewData.placeOfSupply}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div
                      className="col-4 p-3"
                      style={{ width: "39.5%", borderRight: "3px solid #000" }}
                    >
                      <h6 className="fw-bold mb-3 fs-5 fw-bold">Bill To :</h6>
                      <h5 className="fw-black mb-2 fw-bold">
                        {notePreviewData.businessName ||
                          notePreviewData.clientBusinessName ||
                          notePreviewData.clientName ||
                          noteRecord?.businessName ||
                          noteRecord?.clientName ||
                          "-"}
                      </h5>
                      <p className="mb-1 small fs-6">
                        {notePreviewData.clientAddress ||
                          noteRecord?.address ||
                          "-"}
                      </p>
                      <div className="fs-6">
                        <div className="mb-1">
                          Phone:{" "}
                          {notePreviewData.clientPhone ||
                            noteRecord?.phoneNumber ||
                            "-"}
                        </div>
                        <div className="mb-1">
                          Email ID:{" "}
                          {notePreviewData.clientEmail ||
                            notePreviewData.email ||
                            noteRecord?.clientEmail ||
                            noteRecord?.email ||
                            invoiceRecord?.clientEmail ||
                            invoiceRecord?.email ||
                            invoiceRecord?.contactEmail ||
                            "-"}
                        </div>
                        <div className="mb-1">
                          GSTIN:{" "}
                          <b>
                            {notePreviewData.clientGstin ||
                              noteRecord?.gstin ||
                              "-"}
                          </b>
                        </div>
                      </div>
                    </div>

                    <div
                      className="p-3 position-relative payment-wrapper"
                      style={{ width: "25%" }}
                    >
                      <h6 className="fw-bold mb-3 fs-5 fw-bold">
                        {noteType === "Credit Note"
                          ? "Refund Information :"
                          : "Payment Information :"}
                      </h6>
                      <div className="fs-6">
                        {noteType === "Credit Note" ? (
                          <>
                            <div className="d-flex mb-1 fw-bold">
                              <span style={{ width: "110px" }}>
                                Refund Date
                              </span>
                              <span className="fw-bold">
                                : {paymentDateToShow}
                              </span>
                            </div>
                            <div className="d-flex mb-1 fw-bold">
                              <span style={{ width: "110px" }}>
                                Refund Amount
                              </span>
                              <span className="fw-bold">
                                : ₹{formatCurrency(totalReceived)}
                              </span>
                            </div>
                            <div className="d-flex mb-1 fw-bold">
                              <span style={{ width: "110px" }}>
                                Refund Method
                              </span>
                              <span className="fw-bold">
                                : {refundMethod || "-"}
                              </span>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="d-flex mb-1 fw-bold">
                              <span style={{ width: "110px" }}>
                                Payment Date
                              </span>
                              <span className="fw-bold">
                                : {paymentDateToShow}
                              </span>
                            </div>
                            <div className="d-flex mb-1 fw-bold">
                              <span style={{ width: "110px" }}>
                                Advance Adj. (-)
                              </span>
                              <span className="fw-bold">
                                : ₹{formatCurrency(advanceAdjustment)}
                              </span>
                            </div>
                            <div className="d-flex mb-1 fw-bold">
                              <span style={{ width: "110px" }}>
                                TDS Ded. ({tdsPercent}%)
                              </span>
                              <span className="fw-bold">
                                : ₹{formatCurrency(tdsAmount)}
                              </span>
                            </div>
                            <div
                              className="d-flex mb-1 fw-bold"
                              style={{ color: "#000" }}
                            >
                              <span style={{ width: "110px" }}>
                                Total Received
                              </span>
                              <span className="fw-bold">
                                : ₹{formatCurrency(totalReceived)}
                              </span>
                            </div>
                            <div
                              className="d-flex mb-1 fw-bold"
                              style={{
                                color: totalDue > 0 ? "#b30000" : "#000",
                              }}
                            >
                              <span style={{ width: "110px" }}>Total Due</span>
                              <span className="fw-bold">
                                : ₹{formatCurrency(totalDue)}
                              </span>
                            </div>
                          </>
                        )}
                      </div>

                      {noteType === "Credit Note" ? (
                        <>
                          {paymentStatusText === "FULL REFUND" && (
                            <div className="payment-seal">
                              FULL
                              <br />
                              REFUND
                            </div>
                          )}
                          {paymentStatusText === "PARTIAL REFUND" && (
                            <div className="payment-seal payment-seal--partial">
                              PARTIAL
                              <br />
                              REFUND
                            </div>
                          )}
                          {(paymentStatusText === "PENDING" ||
                            !paymentStatusText ||
                            (paymentStatusText !== "FULL REFUND" &&
                              paymentStatusText !== "PARTIAL REFUND")) && (
                            <div className="payment-seal payment-seal--pending">
                              REFUND
                              <br />
                              PENDING
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          {paymentStatusText === "PAID" && (
                            <div className="payment-seal">
                              PAYMENT
                              <br />
                              RECEIVED
                            </div>
                          )}
                          {(paymentStatusText === "UNPAID" ||
                            paymentStatusText === "PENDING") && (
                            <div className="payment-seal payment-seal--pending">
                              PAYMENT
                              <br />
                              PENDING
                            </div>
                          )}
                          {(paymentStatusText === "PARTIAL" ||
                            paymentStatusText === "PARTIALLY PAID") && (
                            <div className="payment-seal payment-seal--partial">
                              PARTIAL
                              <br />
                              PAID
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  <table className="table table-bordered invoice-table mb-0 text-center">
                    <thead>
                      <tr>
                        <th style={{ width: "50px" }} className="px-3 py-2">
                          S.N.
                        </th>
                        <th className="px-3 py-2">SERVICE NAME</th>
                        <th className="px-3 py-2" style={{ width: "211.3px" }}>
                          DESCRIPTION
                        </th>
                        <th className="px-3 py-2" style={{ width: "100px" }}>
                          HSN/SAC
                        </th>
                        <th style={{ width: "60px" }} className="px-3 py-2">
                          QTY
                        </th>
                        <th style={{ width: "136px" }} className="px-3 py-2">
                          PRICE
                        </th>
                        <th style={{ width: "135px" }} className="px-3 py-2">
                          AMOUNT
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {Array.from({ length: 7 }).map((_, i) => {
                        const item = items[i];
                        return (
                          <tr key={i} style={{ height: "35px" }}>
                            <td className="align-middle px-3 py-2">{i + 1}</td>
                            <td className="text-start align-middle px-3 py-2">
                              {item?.serviceName || ""}
                            </td>
                            <td className="text-start align-middle px-3 py-2">
                              {item?.description || ""}
                            </td>
                            <td className="align-middle px-3 py-2">
                              {item?.hsnCode || ""}
                            </td>
                            <td className="align-middle px-3 py-2">
                              {item?.qty || ""}
                            </td>
                            <td className="align-middle px-3 py-2">
                              {item ? `₹${formatCurrency(item.price)}` : ""}
                            </td>
                            <td className="align-middle fw-bold px-3 py-2">
                              {item ? `₹${formatCurrency(item.amount)}` : ""}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <div className="row g-0">
                    <div
                      className="col-9 px-3 py-2"
                      style={{ borderRight: "3px solid #000", width: "72%" }}
                    >
                      <p className="mb-2">
                        <strong>Notes : </strong>Thank you for choosing{" "}
                        {contactDetails.companyName || "our company"} for your
                        business needs.
                      </p>
                      <div className="row g-0">
                        <div
                          className="col-9"
                          style={{ fontSize: "16px", lineHeight: 1.75 }}
                        >
                          <div className="row g-0">
                            <div className="col-4 fw-bold">
                              <div>Account Name</div>
                              <div>Bank Name</div>
                              <div>Account Number</div>
                              <div>IFSC Code</div>
                              <div>Branch Address</div>
                            </div>
                            <div className="col-2 text-center fw-bold">
                              <div>:</div>
                              <div>:</div>
                              <div>:</div>
                              <div>:</div>
                              <div>:</div>
                            </div>
                            <div className="col-1"></div>
                            <div className="col-5">
                              <div className="fw-bold">
                                {getFirstNonEmptyValue(
                                  businessSettings.accountName,
                                  businessSettings.bankAccountName,
                                  notePreviewData.accountName,
                                ) || "-"}
                              </div>
                              <div>
                                {getFirstNonEmptyValue(
                                  businessSettings.bankName,
                                  notePreviewData.bankName,
                                ) || "-"}
                              </div>
                              <div className="fw-bold">
                                {getFirstNonEmptyValue(
                                  businessSettings.accountNumber,
                                  notePreviewData.accountNumber,
                                ) || "-"}
                              </div>
                              <div className="font-monospace">
                                {getFirstNonEmptyValue(
                                  businessSettings.ifscCode,
                                  notePreviewData.ifscCode,
                                ) || "-"}
                              </div>
                              <div>
                                {getFirstNonEmptyValue(
                                  businessSettings.branchAddress,
                                  notePreviewData.branchAddress,
                                ) || "-"}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="col-3 d-flex justify-content-center align-items-end">
                          <img
                            src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(upiPayload)}`}
                            style={{
                              width: "135px",
                              height: "135px",
                              objectFit: "contain",
                            }}
                            alt="Payment QR"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="col-3" style={{ width: "28%" }}>
                      <div>
                        <div
                          className="d-flex justify-content-between px-3 py-1 fw-bold"
                          style={{ borderBottom: "1px solid #000" }}
                        >
                          <span>Sub Total</span>
                          <span>₹{formatCurrency(subtotal)}</span>
                        </div>
                        {notePreviewData.discountPercent > 0 && (
                          <div
                            className="d-flex justify-content-between px-3 py-1 fw-bold"
                            style={{ borderBottom: "1px solid #000" }}
                          >
                            <span>
                              Discount ({notePreviewData.discountPercent}%)
                            </span>
                            <span>- ₹{formatCurrency(discountAmount)}</span>
                          </div>
                        )}
                        <div
                          className="d-flex justify-content-between px-3 py-1 fw-bold"
                          style={{ borderBottom: "1px solid #000" }}
                        >
                          <span>CGST ({cgstPercent}%)</span>
                          <span>₹{formatCurrency(cgst)}</span>
                        </div>
                        <div
                          className="d-flex justify-content-between px-3 py-1 fw-bold"
                          style={{ borderBottom: "1px solid #000" }}
                        >
                          <span>SGST ({sgstPercent}%)</span>
                          <span>₹{formatCurrency(sgst)}</span>
                        </div>
                        <div
                          className="d-flex justify-content-between px-3 py-1 fw-bold"
                          style={{ borderBottom: "1px solid #000" }}
                        >
                          <span>IGST ({igstPercent}%)</span>
                          <span>₹{formatCurrency(igst)}</span>
                        </div>
                        <div
                          className="d-flex justify-content-between px-3 py-1 fw-bold"
                          style={{ borderBottom: "3px solid #000" }}
                        >
                          <span>Rounding</span>
                          <span>₹{formatCurrency(roundingAmount)}</span>
                        </div>
                        <div
                          className="d-flex justify-content-between px-3 py-2 fw-bold"
                          style={{ backgroundColor: "#f3e5c8" }}
                        >
                          <span>Total Amount</span>
                          <span>₹{formatCurrency(totalAmount)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    className="px-3 py-2"
                    style={{
                      borderTop: "3px solid #000",
                      borderBottom: "3px solid #000",
                      backgroundColor: "#f3e5c8",
                    }}
                  >
                    <span className="fw-bold">Total In Words : </span>
                    <span>{amountInWords(totalAmount)}</span>
                  </div>

                  <div
                    className="px-3 py-1"
                    style={{ borderBottom: "3px solid #000" }}
                  >
                    <h6 className="fw-black h6 mb-2">
                      Terms & Conditions (Full Terms & Conditions are available
                      on our website: https://www.maxcode.in/terms-conditions) :
                    </h6>
                    <div className="row g-1 pb-2">
                      {(termsConditions || []).slice(0, 14).map((term, i) => (
                        <div
                          key={i}
                          className="col-6 d-flex gap-1 align-items-center"
                          style={{ fontSize: "14px", lineHeight: "1.3" }}
                        >
                          <span
                            className="fw-bold"
                            style={{
                              width: "22px",
                              height: "22px",
                              borderRadius: "999px",
                              border: "1px solid #d9d9d9",
                              backgroundColor: "#f6f6f6",
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              flexShrink: 0,
                              fontSize: "11px",
                              lineHeight: 1,
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {i + 1}
                          </span>
                          <span className="text-muted">{term}</span>
                        </div>
                      ))}
                      {(termsConditions || []).length === 0 && (
                        <span className="text-muted">
                          No credit/debit note terms configured in settings.
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 mb-3 px-3">
                    <div
                      className="row align-items-end"
                      style={{ marginTop: "75px" }}
                    >
                      <div className="col-6">
                        <div
                          className="pt-2"
                          style={{
                            width: "250px",
                            borderTop: "3px solid #000",
                          }}
                        >
                          <p className="fw-bold text-center mb-0">
                            Signature of Customer
                          </p>
                          <p className="text-center text-muted mb-0 small fw-bold">
                            Authorized Signatory
                          </p>
                        </div>
                      </div>

                      <div className="col-6">
                        <div
                          style={{
                            width: "250px",
                            marginLeft: "auto",
                            position: "relative",
                          }}
                        >
                          <img
                            src="/Invoice/Signture.png"
                            alt="Founder seal and signature"
                            style={{
                              display: "block",
                              position: "absolute",
                              left: "14%",
                              transform: "translateY(-63%)",
                              height: "120px",
                              objectFit: "contain",
                              marginBottom: "10px",
                            }}
                          />
                          <p
                            className="fw-bold text-center mb-1"
                            style={{ fontSize: "10px" }}
                          >
                            This signature is for {noteType.toLowerCase()}{" "}
                            {notePreviewData.invoiceNumber} Date & Time :{" "}
                            {signatureDateTime}
                          </p>
                          <div
                            className="pt-2"
                            style={{ borderTop: "3px solid #000" }}
                          >
                            <p className="fw-bold text-center mb-0">
                              Vipin Khandelwal
                            </p>
                            <p className="text-center text-muted mb-0 small fw-bold">
                              Founder & CEO
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-auto">
                    <div
                      className="container-fluid py-1"
                      style={{
                        background: "#f3e5c8",
                        border: "3px solid #ff5c00",
                        width: "98%",
                        borderRadius: "50px",
                        margin: "0 auto 10px auto",
                      }}
                    >
                      <div className="container">
                        <div className="row d-flex align-items-center justify-content-between g-2 flex-nowrap">
                          <div className="col-auto">
                            <div className="d-flex align-items-center">
                              <div
                                className="bg-orange text-white rounded-circle d-flex align-items-center justify-content-center"
                                style={{ width: 42, height: 42 }}
                              >
                                {renderContactIcon("phone")}
                              </div>
                              <div className="ms-2">
                                <div className="fw-bold small">
                                  Phone Number
                                </div>
                                <div
                                  className="fs-6 fw-bold"
                                  style={{ lineHeight: 1.1 }}
                                >
                                  {contactDetails.companyPhone || "-"}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="col-auto">
                            <div className="d-flex align-items-center">
                              <div
                                className="bg-orange text-white rounded-circle d-flex align-items-center justify-content-center"
                                style={{ width: 42, height: 42 }}
                              >
                                {renderContactIcon("web")}
                              </div>
                              <div className="ms-2">
                                <div className="fw-bold small">
                                  More Information
                                </div>
                                <div
                                  className="fs-6 fw-bold"
                                  style={{ lineHeight: 1.1 }}
                                >
                                  {contactDetails.companyWebsite ||
                                    "www.maxcode.in"}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="col-auto">
                            <div className="d-flex align-items-center">
                              <div
                                className="bg-orange text-white rounded-circle d-flex align-items-center justify-content-center"
                                style={{ width: 42, height: 42 }}
                              >
                                {renderContactIcon("email")}
                              </div>
                              <div className="ms-2">
                                <div className="fw-bold small">
                                  Send your Requirement to
                                </div>
                                <div
                                  className="fs-6 fw-bold"
                                  style={{ lineHeight: 1.1 }}
                                >
                                  {contactDetails.companyEmail || "-"}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="col-auto">
                            <div className="d-flex align-items-center">
                              <div
                                className="bg-orange text-white rounded-circle d-flex align-items-center justify-content-center"
                                style={{ width: 42, height: 42 }}
                              >
                                {renderContactIcon("address")}
                              </div>
                              <div className="ms-2">
                                <div className="fw-bold small">
                                  Office Address
                                </div>
                                <div
                                  className="fs-6 fw-bold"
                                  style={{ lineHeight: 1.1 }}
                                >
                                  {contactDetails.companyAddress || "-"}
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
            </div>
          </div>
        </div>
      </div>

      {!isPrintMode && (
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css"
        />
      )}
    </div>
  );
};

export default CreditDebitNotePreview;
