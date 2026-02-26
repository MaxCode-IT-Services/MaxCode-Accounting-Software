import { showSuccess, showError } from "./ToastNotification";
import React, { useState, useEffect } from "react";
import { apiGet } from "../utils/api";
import API_ENDPOINTS from "../utils/apiEndpoints";

const InvoicePreview = ({
  id,
  invoiceData: providedInvoiceData,
  show = false,
  onClose = () => {},
  renderMode = "modal",
}) => {
  const [loading, setLoading] = useState({
    pdf: false,
    image: false,
  });

  const defaultTermsConditions = [
    "60% advance payment is required before starting the project.",
    "20% payment is due after 60% project completion.",
    "Remaining 20% must be paid before final completion and launch.",
    "A late fee of 3% per month will be charged on delayed payments.",
    "Additional revisions will be billed separately.",
    "Payment once made after invoice issuance is non-refundable.",
    "Maintenance services are available at an additional cost.",
    "MaxCode can showcase completed projects in portfolios.",
    "Payments can be made via Cash, Bank Transfer, or UPI.",
    "Cancellation charges will apply once the project has started.",
    "All fees are non-refundable after project approval.",
    "Ownership rights will be transferred upon full payment.",
    "GST applicable on advance payment invoices.",
    "All disputes are subject to Dausa, Rajasthan jurisdiction.",
  ];

  const [termsConditions, setTermsConditions] = useState(
    defaultTermsConditions,
  );

  // Sample data for preview
  const fallbackInvoiceData = {
    // Company Details
    companyName: "MaxCode IT Services",
    companyAddress: "123, IT Park, Sitapura, Jaipur - 302022",
    companyEmail: "contact@maxcode.in",
    companyPhone: "08069640420",
    companyWebsite: "www.maxcode.in",
    companyGstin: "08KIVPK1263E1ZU",

    // Invoice Details
    invoiceNumber: "INV-2024-001",
    invoiceDate: "15/01/2024",
    orderNumber: "CL001",
    clientId: "CL001",
    placeOfSupply: "Rajasthan",

    // Client Details
    clientName: "Tech Solutions Pvt Ltd",
    clientAddress: "123 Business Park, Sitapura, Jaipur - 302022",
    clientPhone: "+91 98765 43210",
    clientEmail: "accounts@techsolutions.com",
    clientGstin: "08ABCDE1234F1Z5",

    // Payment Details
    paymentDate: "20/01/2024",
    paymentMethod: "Bank Transfer",
    discountPercent: 5,
    taxPercent: 18,
    hasTds: true,
    tdsPercent: 2,
    status: "PAID",
    subtotal: 108998,
    discountAmount: 5450,
    taxableAmount: 103548,
    cgst: 9320,
    sgst: 9320,
    igst: 0,
    cgstPercent: 9,
    sgstPercent: 9,
    igstPercent: 0,
    totalAmount: 122188,
    tdsAmount: 2444,

    // Bank Details
    accountName: "MaxCode IT Services",
    bankName: "HDFC Bank",
    accountNumber: "50100234567890",
    ifscCode: "HDFC0001234",
    branchAddress: "Sitapura Branch, Jaipur",

    // Items
    items: [
      {
        serviceName: "Web Development",
        description: "E-commerce Website",
        hsnCode: "998313",
        qty: 1,
        price: 50000,
        amount: 50000,
      },
      {
        serviceName: "SEO Services",
        description: "Monthly Package",
        hsnCode: "998316",
        qty: 3,
        price: 15000,
        amount: 45000,
      },
      {
        serviceName: "Hosting Service",
        description: "Premium Hosting - Annual",
        hsnCode: "998314",
        qty: 1,
        price: 12000,
        amount: 12000,
      },
      {
        serviceName: "Domain Registration",
        description: "Domain Registration - 1 Year",
        hsnCode: "998314",
        qty: 2,
        price: 999,
        amount: 1998,
      },
    ],
  };

  const normalizedItems = Array.isArray(providedInvoiceData?.items)
    ? providedInvoiceData.items
    : fallbackInvoiceData.items;

  const invoiceData = {
    ...fallbackInvoiceData,
    ...(providedInvoiceData || {}),
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

  useEffect(() => {
    if (isPrintMode) return;

    if (show.show) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }

    // Cleanup function
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [show.show, isPrintMode]);

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

    const applyTerms = (settings) => {
      if (!mounted || !settings || typeof settings !== "object") return;
      const parsed = parseTerms(
        settings.invoiceTermsConditions,
        defaultTermsConditions,
      );
      setTermsConditions(parsed);
    };

    const loadTerms = async () => {
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
        console.error("Failed to fetch invoice terms:", error);
      }
    };

    loadTerms();

    return () => {
      mounted = false;
    };
  }, []);

  // Calculations are done in SalesManagement; use precomputed values here.
  const items = invoiceData.items;
  const subtotal = Number(invoiceData.subtotal || 0);
  const discountAmount = Number(invoiceData.discountAmount || 0);
  const cgst = Number(invoiceData.cgst || 0);
  const sgst = Number(invoiceData.sgst || 0);
  const igst = Number(invoiceData.igst || 0);
  const cgstPercent = Number(invoiceData.cgstPercent || 0);
  const sgstPercent = Number(invoiceData.sgstPercent || 0);
  const igstPercent = Number(invoiceData.igstPercent || 0);
  const roundingAmount = Number(invoiceData.roundingAmount || 0);
  const totalAmount = Number(invoiceData.totalAmount || 0);
  const tdsAmount = Number(invoiceData.tdsAmount || 0);
  const tdsPercent = Number(invoiceData.tdsPercent || 0);
  const amountReceived = Number(invoiceData.amountReceived || 0);
  const amountReceivedDisplay = amountReceived;
  const qrAmount = totalAmount;
  const upiAmount = Number.isFinite(qrAmount) ? qrAmount : 0;
  const upiPayload = `upi://pay?pa=maxcode@aubank&pn=${encodeURIComponent(
    invoiceData.companyName || "",
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

        return `${day}/${month}/${year} | ${formattedHours}:${minutes}:${seconds} ${ampm}`;
      }

      return dateString;
    } catch (e) {
      return dateString;
    }
  };

  const signatureDateTime =
    invoiceData.createdDateTime ||
    formatDateTimeForDisplay(invoiceData.createdDate) ||
    `${new Date().toLocaleDateString("en-GB")} ${new Date().toLocaleTimeString(
      "en-US",
      {
        hour: "2-digit",
        minute: "2-digit",
      },
    )}`;

  // Helper Functions
  const formatCurrency = (val) => {
    const num = Number(val);
    const safe = Number.isFinite(num) ? num : 0;

    return new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safe);
  };

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
        return tens[Math.floor(n / 10)] + (n % 10 ? " " + ones[n % 10] : "");
      return (
        ones[Math.floor(n / 100)] +
        " Hundred" +
        (n % 100 ? " " + convertLessThanThousand(n % 100) : "")
      );
    };

    if (num < 1000) return convertLessThanThousand(num);
    if (num < 100000)
      return (
        convertLessThanThousand(Math.floor(num / 1000)) +
        " Thousand" +
        (num % 1000 ? " " + convertLessThanThousand(num % 1000) : "")
      );
    if (num < 10000000)
      return (
        convertLessThanThousand(Math.floor(num / 100000)) +
        " Lakh" +
        (num % 100000 ? " " + convertLessThanThousand(num % 100000) : "")
      );
    return (
      convertLessThanThousand(Math.floor(num / 10000000)) +
      " Crore" +
      (num % 10000000 ? " " + convertLessThanThousand(num % 10000000) : "")
    );
  };

  const amountInWords = (num) => {
    return numberToWords(Math.round(num)) + " Rupees Only";
  };

  const renderContactIcon = (type) => {
    if (!isPrintMode) {
      if (type === "phone")
        return <i className="bi bi-telephone-fill fs-2"></i>;
      if (type === "web") return <i className="bi bi-globe fs-2"></i>;
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

  // PDF Download Function
  const exportPDF = async () => {
    setLoading((prev) => ({ ...prev, pdf: true }));

    try {
      const element = document.getElementById(id || "invoice-preview");
      if (!element) {
        showError("Invoice element not found");
        return;
      }

      // Dynamically import html2canvas and jspdf
      const html2canvas = (await import("html2canvas")).default;
      const jsPDF = (await import("jspdf")).default;

      // Use high scale for clarity, ensuring strictly 210x297 ratio
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

      // A4 dimensions in mm
      const pdfWidth = 210;
      const pdfHeight = 297;

      pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Invoice_${invoiceData.invoiceNumber.replace(/\//g, "_")}.pdf`);

      showSuccess("PDF downloaded successfully!");
    } catch (error) {
      console.error("Error generating PDF:", error);
      showError("Error generating PDF. Please try again.");
    } finally {
      setLoading((prev) => ({ ...prev, pdf: false }));
    }
  };

  // Image Download Function
  const exportImage = async () => {
    setLoading((prev) => ({ ...prev, image: true }));

    try {
      const element = document.getElementById(id || "invoice-preview");
      if (!element) {
        showError("Invoice element not found");
        return;
      }

      // Dynamically import html2canvas
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
      link.download = `Invoice_${invoiceData.invoiceNumber.replace(/\//g, "_")}.jpg`;
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

  return (
    <div className={isPrintMode ? "invoice-print" : undefined}>
      <style>
        {`
          .modal-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
          }

          .modal-download-buttons {
            display: flex;
            gap: 10px;
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

          .bg-orange{
            background-color: #ff5c00 !important;
          }

          .spinner {
            display: inline-block;
            width: 16px;
            height: 16px;
            border: 2px solid rgba(255,255,255,.3);
            border-radius: 50%;
            border-top-color: #fff;
            animation: spin 1s ease-in-out infinite;
          }

          @keyframes spin {
            to { transform: rotate(360deg); }
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

          /* Default cell border */
          .invoice-table th,
          .invoice-table td {
            border-top: 3px solid #000 !important;
            border-left: 3px solid #000 !important;
            padding: 6px 4px;
          }

          /* Last column right border */
          .invoice-table th:last-child,
          .invoice-table td:last-child {
            border-right: 3px solid #000 !important;
          }

          /* Last row bottom border */
          .invoice-table tr:last-child td {
            border-bottom: 3px solid #000 !important;
          }

          /* Header background */
          .invoice-table thead th {
            background-color: #f3e5c8 !important;
            font-weight: bold;
          }

          /* First column ka left border remove */
          .invoice-table th:first-child,
          .invoice-table td:first-child {
            border-left: none !important;
          }

          /* Last column ka right border remove */
          .invoice-table th:last-child,
          .invoice-table td:last-child {
            border-right: none !important;
          }

          .payment-stamp {
            position: absolute;
            z-index: 10;
            opacity: 0.85;
            pointer-events: none;
          }

          /* Border classes */
          .border-3 {
            border-width: 3px !important;
            border-style: solid !important;
          }

          .border-bottom-3 {
            border-bottom-width: 3px !important;
            border-bottom-style: solid !important;
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


/* PAYMENT RECEIVED SEAL */
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
  border-color: #f0ad4e;
  color: #f0ad4e;
  background: rgba(240, 173, 78, 0.1);
  box-shadow: 0 0 10px rgba(240, 173, 78, 0.35);
  text-align: center;
}

/* Stamp Effect Rough Border */
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
              {/* Title */}
              <h5 className="modal-title text-start text-nowrap mb-2 mb-md-0">
                Invoice Preview - {invoiceData.invoiceNumber}
              </h5>

              {/* Button Section */}
              <div
                className="d-flex w-100 justify-content-between align-items-center
                  w-md-auto justify-content-md-end ms-md-auto"
              >
                {/* PDF + Image */}
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

                {/* Close Button */}
                <button
                  type="button"
                  className="btn-close ms-2"
                  onClick={onClose}
                ></button>
              </div>
            </div>

            <div className="modal-body p-0" style={{ background: "#f1f1f1" }}>
              {/* Invoice Content */}
              <div id={id || "invoice-preview"} className="a4-page">
                {/* Border Container */}
                <div
                  style={{
                    border: "3px solid #000",
                    height: "100%",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  {/* Header Section */}
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
                        {invoiceData.companyName}
                      </h2>
                      <p className="mb-0 fw-bold" style={{ fontSize: "16px" }}>
                        {invoiceData.companyAddress}
                      </p>
                      <p
                        className="mb-0 fw-bold text-dark"
                        style={{ fontSize: "16px" }}
                      >
                        GSTIN: {invoiceData.companyGstin}
                      </p>
                    </div>
                  </div>

                  {/* Info Grid - Three Columns with borders */}
                  <div className="row g-0">
                    {/* Col 1: Tax Invoice */}
                    <div
                      className="col-4 p-3"
                      style={{
                        width: "29.5%",
                        borderRight: "3px solid #000",
                      }}
                    >
                      <h6 className="fw-black mb-3 h4 fw-bold">TAX INVOICE</h6>
                      <div className="fs-6">
                        <div className="d-flex mb-1">
                          <span style={{ width: "120px" }}>Invoice Date</span>
                          <span className="fw-bold">
                            : {invoiceData.invoiceDate}
                          </span>
                        </div>
                        <div className="d-flex mb-1">
                          <span style={{ width: "120px" }}>Invoice Number</span>
                          <span className="fw-bold">
                            : {invoiceData.invoiceNumber}
                          </span>
                        </div>
                        <div className="d-flex mb-1">
                          <span style={{ width: "120px" }}>Order Number</span>
                          <span className="fw-bold">
                            : {invoiceData.orderNumber}
                          </span>
                        </div>
                        <div className="d-flex mb-1">
                          <span style={{ width: "120px" }}>Client ID</span>
                          <span className="fw-bold">
                            : {invoiceData.clientId}
                          </span>
                        </div>
                        <div className="d-flex mb-1">
                          <span style={{ width: "120px" }}>
                            Place of Supply
                          </span>
                          <span className="fw-bold">
                            : {invoiceData.placeOfSupply}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Col 2: Bill To */}
                    <div
                      className="col-4 p-3"
                      style={{
                        width: "42.5%",
                        borderRight: "3px solid #000",
                      }}
                    >
                      <h6 className="fw-bold mb-3 fs-5 fw-bold">Bill To :</h6>
                      <h6 className="fw-black mb-2 fw-bold">
                        {invoiceData.clientName}
                      </h6>
                      <p className="mb-1 small fs-6">
                        {invoiceData.clientAddress}
                      </p>
                      <div className="fs-6">
                        <div className="mb-1">
                          Phone: {invoiceData.clientPhone}
                        </div>
                        <div className="mb-1">
                          Email ID: {invoiceData.clientEmail}
                        </div>
                        <div className="mb-1">
                          GSTIN: <b>{invoiceData.clientGstin}</b>
                        </div>
                      </div>
                    </div>

                    {/* Col 3: Payment Information */}
                    <div
                      className="p-3 position-relative payment-wrapper"
                      style={{ width: "27%" }}
                    >
                      <h6 className="fw-bold mb-3 fs-5 fw-bold">
                        Payment Information :
                      </h6>
                      <div className="fs-6">
                        <div className="d-flex mb-1">
                          <span style={{ width: "120px" }}>Payment Date</span>
                          <span className="fw-bold">
                            : {invoiceData.paymentDate}
                          </span>
                        </div>
                        <div className="d-flex mb-1">
                          <span style={{ width: "120px" }}>Payment Method</span>
                          <span className="fw-bold">
                            : {invoiceData.paymentMethod}
                          </span>
                        </div>
                        <div className="d-flex mb-1">
                          <span style={{ width: "120px" }}>
                            Amount Received
                          </span>
                          <span className="fw-bold">
                            : ₹{formatCurrency(amountReceivedDisplay)}
                          </span>
                        </div>
                        <div className="d-flex mb-1 text-danger fw-bold ">
                          <span style={{ width: "120px" }}>
                            TDS ({tdsPercent}%)
                          </span>
                          <span className="fw-bold">
                            : - ₹{formatCurrency(tdsAmount)}
                          </span>
                        </div>
                      </div>
                      {/* Status Badge */}
                      {invoiceData.status === "PAID" && (
                        <div className="payment-seal">
                          PAYMENT
                          <br />
                          RECEIVED
                        </div>
                      )}
                      {invoiceData.status === "UNPAID" && (
                        <div className="payment-seal payment-seal--pending">
                          PAYMENT
                          <br />
                          PENDING
                        </div>
                      )}
                      {invoiceData.status === "PARTIAL" && (
                        <div className="payment-seal payment-seal--partial">
                          PARTIALLY
                          <br />
                          PAID
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Table Section */}
                  <table className="table table-bordered invoice-table mb-0 text-center">
                    <thead>
                      <tr>
                        <th style={{ width: "50px" }} className="px-3 py-2">
                          S.N.
                        </th>
                        <th className="px-3 py-2">SERVICE NAME</th>
                        <th className="px-3 py-2" style={{ width: "240.3px" }}>
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

                  {/* Notes and Bank Details Area */}
                  <div className="row g-0">
                    <div
                      className="col-9 px-3 py-2"
                      style={{ borderRight: "3px solid #000", width: "72%" }}
                    >
                      <p className="mb-2">
                        <strong>Notes : </strong>Thank you for choosing{" "}
                        {invoiceData.companyName} for your business needs.
                      </p>
                      <div className="row g-0">
                        {/* Bank Details */}
                        <div
                          className="col-9"
                          style={{
                            fontSize: "16px",
                            lineHeight: 1.75,
                          }}
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
                                {invoiceData.accountName}
                              </div>
                              <div>{invoiceData.bankName}</div>
                              <div className="fw-bold">
                                {invoiceData.accountNumber}
                              </div>
                              <div className="font-monospace">
                                {invoiceData.ifscCode}
                              </div>
                              <div>{invoiceData.branchAddress}</div>
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
                          className="d-flex justify-content-between px-3 py-1"
                          style={{ borderBottom: "1px solid #000" }}
                        >
                          <span>Sub Total</span>
                          <span>₹{formatCurrency(subtotal)}</span>
                        </div>
                        {invoiceData.discountPercent > 0 && (
                          <div
                            className="d-flex justify-content-between px-3 py-1"
                            style={{ borderBottom: "1px solid #000" }}
                          >
                            <span>
                              Discount ({invoiceData.discountPercent}%)
                            </span>
                            <span>- ₹{formatCurrency(discountAmount)}</span>
                          </div>
                        )}
                        <div
                          className="d-flex justify-content-between px-3 py-1"
                          style={{ borderBottom: "1px solid #000" }}
                        >
                          <span>CGST ({cgstPercent}%)</span>
                          <span>₹{formatCurrency(cgst)}</span>
                        </div>
                        <div
                          className="d-flex justify-content-between px-3 py-1"
                          style={{ borderBottom: "1px solid #000" }}
                        >
                          <span>SGST ({sgstPercent}%)</span>
                          <span>₹{formatCurrency(sgst)}</span>
                        </div>
                        <div
                          className="d-flex justify-content-between px-3 py-1"
                          style={{ borderBottom: "1px solid #000" }}
                        >
                          <span>IGST ({igstPercent}%)</span>
                          <span>₹{formatCurrency(igst)}</span>
                        </div>
                        <div
                          className="d-flex justify-content-between px-3 py-1"
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

                  {/* Total In Words */}
                  <div
                    className="px-3 py-2"
                    style={{
                      borderTop: "3px solid #000",
                      borderBottom: "3px solid #000",
                      backgroundColor: "#f3e5c8",
                    }}
                  >
                    <span className="fw-bold">Total In Words : </span>
                    <span className="">{amountInWords(totalAmount)}</span>
                  </div>

                  {/* Terms and Conditions */}
                  <div
                    className="px-3 py-1"
                    style={{ borderBottom: "3px solid #000" }}
                  >
                    <h6 className="fw-black h6 mb-2">Terms & Conditions :</h6>
                    <div className="row g-2 pb-2">
                      {(termsConditions || []).slice(0, 14).map((term, i) => (
                        <div
                          key={i}
                          className="col-6 d-flex gap-2"
                          style={{ fontSize: "14px", lineHeight: "1.3" }}
                        >
                          <span className="fw-bold">{i + 1}.</span>
                          <span className="text-muted">{term}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Signature Section - Fixed Layout */}
                  <div className="mt-4 mb-3 px-3">
                    <div
                      className="row align-items-end"
                      style={{ marginTop: "75px" }}
                    >
                      {/* Customer Signature */}
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

                      {/* Founder Signature */}
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
                          {/* Date/Time text - appears above signature */}
                          <p
                            className="fw-bold text-center mb-1"
                            style={{ fontSize: "10px" }}
                          >
                            This signature is for invoice of{" "}
                            {invoiceData.invoiceNumber} Date & Time :{" "}
                            {signatureDateTime}
                          </p>
                          {/* Signature Line */}
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

                  {/* CONTACT US Section */}
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
                        <div className="row d-flex align-items-center justify-content-between g-4">
                          <div className="col-2">
                            <div className="bg-orange text-white fw-bold text-center py-3 px-3 rounded-pill fs-6">
                              CONTACT US
                            </div>
                          </div>
                          {/* PHONE */}
                          <div className="col-3">
                            <div className="d-flex align-items-center">
                              <div
                                className="bg-orange text-white rounded-circle d-flex align-items-center justify-content-center"
                                style={{ width: 50, height: 50 }}
                              >
                                {renderContactIcon("phone")}
                              </div>
                              <div className="ms-3">
                                <div className="fw-bold">Phone Number</div>
                                <div className="fs-5 fw-bold">
                                  {invoiceData.companyPhone}
                                </div>
                              </div>
                            </div>
                          </div>
                          {/* WEBSITE */}
                          <div className="col-3">
                            <div className="d-flex align-items-center">
                              <div
                                className="bg-orange text-white rounded-circle d-flex align-items-center justify-content-center"
                                style={{ width: 50, height: 50 }}
                              >
                                {renderContactIcon("web")}
                              </div>
                              <div className="ms-3">
                                <div className="fw-bold">More Information</div>
                                <div className="fs-5 fw-bold">
                                  {invoiceData.companyWebsite}
                                </div>
                              </div>
                            </div>
                          </div>
                          {/* EMAIL */}
                          <div className="col-4">
                            <div className="d-flex align-items-center">
                              <div
                                className="bg-orange text-white rounded-circle d-flex align-items-center justify-content-center"
                                style={{ width: 50, height: 50 }}
                              >
                                {renderContactIcon("email")}
                              </div>
                              <div className="ms-3">
                                <div className="fw-bold">
                                  Send your Requirement to
                                </div>
                                <div className="fs-6 fw-bold">
                                  {invoiceData.companyEmail}
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

      {/* Bootstrap Icons CSS */}
      {!isPrintMode && (
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css"
        />
      )}
    </div>
  );
};

export default InvoicePreview;
