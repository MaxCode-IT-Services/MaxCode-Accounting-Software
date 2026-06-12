import React, { useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import ConfirmationModal from "../Components/ConfirmationModal";
import ReusableTable from "../Components/ReusableTable";
import CreatePaymentLink from "../Components/CreatePaymentLink";
import {
  showError,
  showInfo,
  showSuccess,
} from "../Components/ToastNotification";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { apiDelete, apiGet, apiPost, apiPut } from "../utils/api";
import { hasActionPermission } from "../utils/permissions";

const PAYMENT_APP_LABELS = ["Paytm", "GPay", "PhonePe", "BHIM", "UPI"];

const getStatusBadgeClass = (status = "") => {
  const normalized = String(status || "")
    .trim()
    .toLowerCase();
  if (normalized === "success") return "bg-success";
  if (normalized === "failed") return "bg-danger";
  if (normalized === "under_verification") return "bg-warning text-dark";
  if (normalized === "expired") return "bg-warning text-dark";
  return "bg-secondary";
};

const getLinkStatusBadgeClass = (status = "") => {
  const normalized = String(status || "")
    .trim()
    .toLowerCase();
  if (normalized === "inactive") return "bg-danger";
  return "bg-success";
};

const formatDateTimeForDisplay = (value) => {
  if (!value) return "-";

  const parsed = dayjs(value);
  if (!parsed.isValid()) return "-";

  return parsed.format("DD-MM-YYYY | hh:mm:ss A");
};

const normalizePaymentLinkRecord = (record = {}) => ({
  ...record,
  id: String(record._id || record.id || "").trim(),
  _id: String(record._id || record.id || "").trim(),
  linkExpiry: record.linkExpiry || "",
});

const escapeXml = (value = "") =>
  String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const buildUpiPayload = (record = {}) => {
  const amount = Number(record.amount || 0);
  return `upi://pay?pa=${encodeURIComponent(record.upiId || "")}&pn=${encodeURIComponent(record.accountName || record.clientName || "")}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(record.note || `Payment Link ${record.alias || ""}`)}`;
};

const getQrImageUrl = (record = {}) =>
  `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(buildUpiPayload(record))}`;

const getAppBadgeMarkup = (name = "") => {
  const common = {
    width: "58",
    height: "22",
    viewBox: "0 0 58 22",
    xmlns: "http://www.w3.org/2000/svg",
  };

  if (name === "Paytm") {
    return (
      <svg {...common}>
        <rect
          x="0.5"
          y="0.5"
          width="57"
          height="21"
          rx="10.5"
          fill="#ffffff"
          stroke="#dbe4f0"
        />
        <text
          x="29"
          y="15"
          textAnchor="middle"
          fontSize="11"
          fontWeight="800"
          fill="#0f4bb5"
          fontFamily="Arial, sans-serif"
        >
          PAYTM
        </text>
      </svg>
    );
  }

  if (name === "GPay") {
    return (
      <svg {...common}>
        <rect
          x="0.5"
          y="0.5"
          width="57"
          height="21"
          rx="10.5"
          fill="#ffffff"
          stroke="#dbe4f0"
        />
        <circle cx="14" cy="11" r="5" fill="#ea4335" />
        <circle cx="18" cy="11" r="5" fill="#fbbc05" fillOpacity="0.95" />
        <circle cx="16" cy="8" r="5" fill="#34a853" fillOpacity="0.95" />
        <text
          x="40"
          y="15"
          textAnchor="middle"
          fontSize="10.5"
          fontWeight="800"
          fill="#202124"
          fontFamily="Arial, sans-serif"
        >
          GPay
        </text>
      </svg>
    );
  }

  if (name === "PhonePe") {
    return (
      <svg {...common}>
        <rect
          x="0.5"
          y="0.5"
          width="57"
          height="21"
          rx="10.5"
          fill="#ffffff"
          stroke="#dbe4f0"
        />
        <circle cx="12" cy="11" r="8" fill="#5f259f" />
        <text
          x="12"
          y="15"
          textAnchor="middle"
          fontSize="11"
          fontWeight="800"
          fill="#ffffff"
          fontFamily="Arial, sans-serif"
        >
          पे
        </text>
        <text
          x="40"
          y="15"
          textAnchor="middle"
          fontSize="10.5"
          fontWeight="800"
          fill="#5f259f"
          fontFamily="Arial, sans-serif"
        >
          PhonePe
        </text>
      </svg>
    );
  }

  if (name === "BHIM") {
    return (
      <svg {...common}>
        <rect
          x="0.5"
          y="0.5"
          width="57"
          height="21"
          rx="10.5"
          fill="#ffffff"
          stroke="#dbe4f0"
        />
        <path d="M8 6h8l2 5-2 5H8z" fill="#0f62fe" />
        <text
          x="39"
          y="15"
          textAnchor="middle"
          fontSize="10.5"
          fontWeight="800"
          fill="#0f62fe"
          fontFamily="Arial, sans-serif"
        >
          BHIM
        </text>
      </svg>
    );
  }

  return (
    <svg {...common}>
      <rect
        x="0.5"
        y="0.5"
        width="57"
        height="21"
        rx="10.5"
        fill="#ffffff"
        stroke="#dbe4f0"
      />
      <circle cx="13" cy="11" r="7" fill="#111827" />
      <text
        x="13"
        y="15"
        textAnchor="middle"
        fontSize="9"
        fontWeight="800"
        fill="#ffffff"
        fontFamily="Arial, sans-serif"
      >
        UPI
      </text>
      <text
        x="40"
        y="15"
        textAnchor="middle"
        fontSize="10.5"
        fontWeight="800"
        fill="#111827"
        fontFamily="Arial, sans-serif"
      >
        UPI
      </text>
    </svg>
  );
};

const readBlobAsDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

const buildPaymentCardSvg = (record = {}, qrDataUrl = "") => {
  const amount = Number(record.amount || 0);
  const expiryText = record.linkExpiry
    ? dayjs(record.linkExpiry).isValid()
      ? dayjs(record.linkExpiry).format("DD-MM-YYYY | hh:mm:ss A")
      : "No expiry"
    : "No expiry";

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1400" viewBox="0 0 1080 1400">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#ecfdf5" />
          <stop offset="45%" stop-color="#eff6ff" />
          <stop offset="100%" stop-color="#fff7ed" />
        </linearGradient>
        <linearGradient id="header" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#0f766e" />
          <stop offset="50%" stop-color="#16a34a" />
          <stop offset="100%" stop-color="#22c55e" />
        </linearGradient>
        <linearGradient id="amount" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="#0f5132" />
          <stop offset="100%" stop-color="#198754" />
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="20" stdDeviation="24" flood-color="#0f172a" flood-opacity="0.14"/>
        </filter>
      </defs>
      <rect width="1080" height="1400" fill="url(#bg)" />
      <circle cx="130" cy="120" r="110" fill="#bbf7d0" opacity="0.35" />
      <circle cx="940" cy="160" r="140" fill="#bae6fd" opacity="0.30" />
      <circle cx="870" cy="1240" r="190" fill="#fed7aa" opacity="0.22" />

      <rect x="90" y="90" width="900" height="1220" rx="44" fill="#ffffff" filter="url(#shadow)" />
      <rect x="90" y="90" width="900" height="170" rx="44" fill="url(#header)" />
      <rect x="90" y="220" width="900" height="40" fill="#ffffff" opacity="0.12" />

      <text x="150" y="155" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="700" fill="#d1fae5" letter-spacing="2">MAXCODE IT SERVICES</text>
      <text x="150" y="205" font-family="Inter, Arial, sans-serif" font-size="54" font-weight="800" fill="#ffffff">Secure UPI Payment Card</text>

      <rect x="150" y="300" width="780" height="140" rx="28" fill="#f0fdf4" stroke="#bbf7d0" stroke-width="2" />
      <text x="190" y="350" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="700" fill="#065f46">Amount to Pay</text>
      <text x="190" y="402" font-family="Inter, Arial, sans-serif" font-size="66" font-weight="800" fill="url(#amount)">Rs ${amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</text>

      <rect x="150" y="480" width="780" height="420" rx="32" fill="#ffffff" stroke="#e5e7eb" stroke-width="2" />
      <rect x="195" y="525" width="690" height="300" rx="28" fill="#f8fafc" stroke="#e2e8f0" stroke-width="2" />
      ${qrDataUrl ? `<image x="320" y="580" width="440" height="440" href="${qrDataUrl}" preserveAspectRatio="xMidYMid meet" />` : ""}
      <rect x="450" y="500" width="180" height="46" rx="23" fill="#0f766e" />
      <text x="540" y="531" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="700" fill="#ffffff">SCAN TO PAY</text>

      <text x="190" y="950" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="700" fill="#111827">{ACCOUNT_NAME}</text>
      <text x="190" y="990" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="500" fill="#6b7280">UPI ID: {UPI_ID}</text>

      <rect x="150" y="1030" width="780" height="110" rx="24" fill="#f8fafc" stroke="#e5e7eb" stroke-width="2" />
      <text x="190" y="1078" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="700" fill="#0f172a">Payment Note</text>
      <text x="190" y="1112" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="500" fill="#4b5563">{NOTE_TEXT}</text>

      <rect x="150" y="1170" width="360" height="96" rx="22" fill="#ecfdf5" stroke="#bbf7d0" stroke-width="2" />
      <text x="330" y="1208" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="700" fill="#166534">Alias Hidden</text>
      <text x="330" y="1238" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="500" fill="#166534">Paid Amount Shown Above</text>

      <rect x="570" y="1170" width="360" height="96" rx="22" fill="#eff6ff" stroke="#bfdbfe" stroke-width="2" />
      <text x="750" y="1208" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="700" fill="#1d4ed8">Expiry</text>
      <text x="750" y="1238" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="20" font-weight="500" fill="#1e3a8a">${escapeXml(expiryText)}</text>
    </svg>
  `
    .replace(
      /\{ACCOUNT_NAME\}/g,
      escapeXml(String(record.accountName || record.clientName || "Account")),
    )
    .replace(/\{UPI_ID\}/g, escapeXml(String(record.upiId || "UPI ID")))
    .replace(
      /\{NOTE_TEXT\}/g,
      escapeXml(String(record.note || `Payment Link ${record.alias || ""}`)),
    );
};

const svgToPngDataUrl = async (svgMarkup) => {
  const svgBlob = new Blob([svgMarkup], {
    type: "image/svg+xml;charset=utf-8",
  });
  const svgUrl = URL.createObjectURL(svgBlob);

  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = svgUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1400;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Canvas not available");
    }

    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return await new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error("Failed to render payment card"));
          return;
        }
        const outputUrl = URL.createObjectURL(blob);
        resolve(outputUrl);
      }, "image/png");
    });
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
};

const PaymentLinkManagement = () => {
  const moduleKey = "paymentLinkManagement";
  const canCreate = hasActionPermission(moduleKey, "create");

  const [serverSide, setServerSide] = useState(true);
  const [prefLoading, setPrefLoading] = useState(true);

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);
  const [statistics, setStatistics] = useState({
    total: 0,
    pending: 0,
    success: 0,
    failed: 0,
    underVerification: 0,
    expired: 0,
  });

  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [activeCardFilter, setActiveCardFilter] = useState("total");

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState(null);

  const [showQrModal, setShowQrModal] = useState(false);
  const [qrRecord, setQrRecord] = useState(null);
  const [qrDownloading, setQrDownloading] = useState(false);
  const qrCardRef = useRef(null);
  const [branding, setBranding] = useState({
    companyName: "MaxCode IT Services",
    logoUrl: "",
  });

  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(10);
  const [filters, setFilters] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState(null);
  const [sortDirection, setSortDirection] = useState("normal");

  const debounceTimeoutRef = useRef(null);
  const debounceColumnTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null);

  useEffect(() => {
    document.title = "Payment Link Management | MaxCode IT Services";

    const fetchPreference = async () => {
      try {
        const response = await apiGet("/user-preferences");
        if (
          typeof response?.data?.paymentLinkManagementServerSide === "boolean"
        ) {
          setServerSide(response.data.paymentLinkManagementServerSide);
        }
      } catch {
      } finally {
        setPrefLoading(false);
      }
    };

    fetchPreference();
  }, []);

  useEffect(() => {
    const fetchBranding = async () => {
      try {
        const response = await apiGet(API_ENDPOINTS.BUSINESS_SETTINGS.GET);
        setBranding({
          companyName: response?.data?.companyName || "MaxCode IT Services",
          logoUrl: response?.data?.logoUrl || "",
        });
      } catch {
        setBranding({ companyName: "MaxCode IT Services", logoUrl: "" });
      }
    };

    fetchBranding();
  }, []);

  useEffect(() => {
    if (prefLoading) return;

    const savePreference = async () => {
      try {
        await apiPost("/user-preferences", {
          paymentLinkManagementServerSide: serverSide,
        });
      } catch {}
    };

    savePreference();
  }, [serverSide, prefLoading]);

  const updateStatisticsClientSide = (data = []) => {
    const liveData = data.filter((item) => item.isDeleted !== true);

    setStatistics({
      total: liveData.length,
      pending: liveData.filter(
        (item) => String(item.status || "").toLowerCase() === "pending",
      ).length,
      success: liveData.filter(
        (item) => String(item.status || "").toLowerCase() === "success",
      ).length,
      failed: liveData.filter(
        (item) => String(item.status || "").toLowerCase() === "failed",
      ).length,
      underVerification: liveData.filter(
        (item) =>
          String(item.status || "").toLowerCase() === "under_verification",
      ).length,
      expired: liveData.filter(
        (item) => String(item.status || "").toLowerCase() === "expired",
      ).length,
    });
  };

  const fetchRecords = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (prefLoading) return;

    setLoading(true);

    try {
      let url = API_ENDPOINTS.PAYMENT_LINKS.LIST;
      const params = new URLSearchParams();

      if (serverSide) {
        params.append("page", String(currentPage));
        params.append("limit", String(recordsPerPage));

        if (searchTerm) {
          params.append("search", searchTerm);
        }

        Object.entries(filters).forEach(([key, value]) => {
          if (key === "sn" || key === "action") return;
          if (
            value === undefined ||
            value === null ||
            value === "" ||
            value === "All"
          ) {
            return;
          }

          if (Array.isArray(value) && value.length > 0) {
            params.append(key, value.join(","));
          } else if (!Array.isArray(value)) {
            params.append(key, value);
          }
        });

        if (sortField && sortDirection !== "normal") {
          params.append("sortBy", sortField);
          params.append(
            "sortOrder",
            sortDirection === "ascending" ? "asc" : "desc",
          );
        }

        if (
          activeCardFilter &&
          activeCardFilter !== "total" &&
          activeCardFilter !== "addNew"
        ) {
          params.append("filter", activeCardFilter);
        }

        url = `${url}?${params.toString()}`;
      } else {
        params.append("limit", "300");
        url = `${url}?${params.toString()}`;
      }

      const response = await apiGet(url, { signal: controller.signal });
      const rows = response?.data?.records || [];
      const total =
        response?.data?.pagination?.totalRecords ||
        response?.data?.total ||
        rows.length;

      const normalizedRows = rows.map((item, index) => ({
        ...item,
        id: item.id || item._id,
        sn: (currentPage - 1) * recordsPerPage + index + 1,
        amountDisplay: `Rs ${Number(item.amount || 0).toLocaleString("en-IN", {
          minimumFractionDigits: 2,
        })}`,
        createdDateTime: item.createdAt
          ? new Date(item.createdAt).toLocaleString("en-IN")
          : "-",
        linkExpiryDisplay: item.linkExpiry
          ? new Date(item.linkExpiry).toLocaleString("en-IN")
          : "No expiry",
      }));

      setRecords(normalizedRows);
      setTotalRecords(total);

      if (response?.data?.statistics) {
        setStatistics(response.data.statistics);
      } else {
        updateStatisticsClientSide(normalizedRows);
      }
    } catch (error) {
      if (error.name === "CanceledError" || error.name === "AbortError") {
        return;
      }

      showError("Failed to fetch payment links");
      setRecords([]);
      setTotalRecords(0);
      updateStatisticsClientSide([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (prefLoading) return;

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(
      () => {
        fetchRecords();
      },
      serverSide ? 450 : 0,
    );

    return () => clearTimeout(debounceTimeoutRef.current);
  }, [
    prefLoading,
    serverSide,
    currentPage,
    recordsPerPage,
    searchTerm,
    filters,
    sortField,
    sortDirection,
    activeCardFilter,
  ]);

  const filteredClientSideData = useMemo(() => {
    if (serverSide) {
      return records.filter((item) => item.isDeleted !== true);
    }

    let data = records.filter((item) => item.isDeleted !== true);

    Object.entries(filters).forEach(([key, value]) => {
      if (!value || value === "All") return;

      data = data.filter((row) => {
        const rowValue = String(row[key] || "").toLowerCase();
        return rowValue.includes(String(value).toLowerCase());
      });
    });

    if (activeCardFilter && activeCardFilter !== "total") {
      if (activeCardFilter === "pending") {
        data = data.filter(
          (item) => String(item.status || "").toLowerCase() === "pending",
        );
      }
      if (activeCardFilter === "success") {
        data = data.filter(
          (item) => String(item.status || "").toLowerCase() === "success",
        );
      }
      if (activeCardFilter === "failed") {
        data = data.filter(
          (item) => String(item.status || "").toLowerCase() === "failed",
        );
      }
      if (activeCardFilter === "under_verification") {
        data = data.filter(
          (item) =>
            String(item.status || "").toLowerCase() === "under_verification",
        );
      }
      if (activeCardFilter === "expired") {
        data = data.filter(
          (item) => String(item.status || "").toLowerCase() === "expired",
        );
      }
    }

    return data;
  }, [records, filters, activeCardFilter, serverSide]);

  const cards = [
    {
      icon: "fas fa-check-circle",
      title: "Success",
      key: "success",
      color: "success",
      count: statistics.success,
    },
    {
      icon: "fas fa-clock",
      title: "Pending",
      key: "pending",
      color: "secondary",
      count: statistics.pending,
    },
    {
      icon: "fas fa-times-circle",
      title: "Failed",
      key: "failed",
      color: "danger",
      count: statistics.failed,
    },
    {
      icon: "fas fa-spinner",
      title: "Under Verification",
      key: "under_verification",
      color: "warning",
      count: statistics.underVerification || 0,
    },
    {
      icon: "fas fa-hourglass-end",
      title: "Expired",
      key: "expired",
      color: "warning",
      count: statistics.expired,
    },
    {
      icon: "fas fa-plus-circle",
      title: "Add New Link",
      key: "addNew",
      color: "success",
    },
  ];

  const columns = [
    { key: "sn", label: "S.No", width: 70 },
    { key: "clientName", label: "Client Name", width: 180 },
    { key: "businessName", label: "Business Name", width: 200 },
    { key: "phoneNumber", label: "Phone", width: 140 },
    { key: "accountName", label: "Account Name", width: 180 },
    { key: "upiId", label: "UPI ID", width: 200 },
    { key: "domain", label: "Domain", width: 200 },
    { key: "alias", label: "Alias", width: 140 },
    { key: "utrNumber", label: "Transaction ID / UTR Number", width: 220 },
    { key: "amountDisplay", label: "Amount", width: 130 },
    {
      key: "status",
      label: "Payment Status",
      width: 120,
      render: (value) => {
        const normalized = String(value || "pending")
          .replace(/_/g, " ")
          .toLowerCase();
        const displayText =
          normalized.charAt(0).toUpperCase() + normalized.slice(1);
        return (
          <span className={`badge ${getStatusBadgeClass(value)}`}>
            {displayText}
          </span>
        );
      },
    },
    {
      key: "paymentDate",
      label: "Payment Date",
      width: 190,
      render: (value) => formatDateTimeForDisplay(value),
    },
    {
      key: "linkExpiry",
      label: "Link Expiry",
      width: 190,
      render: (value) => formatDateTimeForDisplay(value),
    },
    {
      key: "createdAt",
      label: "Created Date & Time",
      width: 220,
      render: (value) => formatDateTimeForDisplay(value),
    },
    {
      key: "linkStatus",
      label: "Status",
      width: 110,
      render: (value, record) => {
        const status = String(value || "active")
          .trim()
          .toLowerCase();
        const displayStatus = status.charAt(0).toUpperCase() + status.slice(1);
        return (
          <div className="form-check form-switch">
            <input
              className="form-check-input"
              type="checkbox"
              checked={status === "active"}
              onChange={() => handleLinkStatusToggle(record._id || record.id)}
              style={{ cursor: "pointer" }}
            />
            <label className="form-check-label">{displayStatus}</label>
          </div>
        );
      },
    },
    { key: "action", label: "Actions", width: 230 },
  ];

  const fixedColumns = ["sn"];
  const defaultVisibleColumns = [
    "sn",
    "clientName",
    "accountName",
    "upiId",
    "linkExpiry",
    "action",
  ];

  const columnsWithDropdownFilter = [
    "status",
    "linkStatus",
    "domain",
    "accountName",
  ];

  const getFilterOptions = () => {
    const statuses = [
      "All",
      ...Array.from(
        new Set(records.map((item) => item.status).filter(Boolean)),
      ).sort(),
    ];
    const domains = [
      "All",
      ...Array.from(
        new Set(records.map((item) => item.domain).filter(Boolean)),
      ).sort(),
    ];
    const accounts = [
      "All",
      ...Array.from(
        new Set(records.map((item) => item.accountName).filter(Boolean)),
      ).sort(),
    ];
    const linkStatuses = [
      "All",
      ...Array.from(
        new Set(records.map((item) => item.linkStatus).filter(Boolean)),
      ).sort(),
    ];

    return {
      status: statuses,
      linkStatus: linkStatuses,
      domain: domains,
      accountName: accounts,
    };
  };

  const handleCardClick = (cardKey) => {
    if (cardKey === "addNew") {
      if (!canCreate) {
        showError("You don't have permission to add payment links");
        return;
      }
      setEditingRecord(null);
      setShowForm(true);
      return;
    }

    setActiveCardFilter(cardKey);
    if (serverSide) {
      setCurrentPage(1);
    }
  };

  const handleFormSubmit = () => {
    setShowForm(false);
    setEditingRecord(null);
    fetchRecords();
  };

  const handleView = (record) => {
    setEditingRecord({
      ...normalizePaymentLinkRecord(record),
      isViewMode: true,
    });
    setShowForm(true);
    showInfo(`Viewing payment link: ${record.alias || record.clientName}`);
  };

  const handleEdit = (record) => {
    setEditingRecord(normalizePaymentLinkRecord(record));
    setShowForm(true);
    showInfo(`Editing payment link: ${record.alias || record.clientName}`);
  };

  const copyLink = async (record) => {
    const url = String(record?.shareUrl || "").trim();
    if (!url) {
      showError("No payment link available to copy");
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      showSuccess("Payment link copied");
    } catch {
      showError("Failed to copy payment link");
    }
  };

  const openQrModal = (record) => {
    setQrRecord(normalizePaymentLinkRecord(record));
    setShowQrModal(true);
  };

  const closeQrModal = () => {
    setShowQrModal(false);
    setQrRecord(null);
  };

  const downloadQr = async () => {
    if (!qrRecord || !qrCardRef.current || qrDownloading) return;

    let cloned = null;

    try {
      setQrDownloading(true);
      const { default: html2canvas } = await import("html2canvas");

      const sourceCard = qrCardRef.current;
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

      await new Promise((res) => requestAnimationFrame(() => res()));

      const clonedImages = Array.from(cloned.querySelectorAll("img"));
      await Promise.all(
        clonedImages.map(async (img) => {
          const src = img.getAttribute("src");
          if (!src || src.startsWith("data:")) return;

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

      const DOWNLOAD_CARD_WIDTH = 650;
      const DOWNLOAD_CARD_HEIGHT = 775;
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
            showError("Download failed. Please try again.");
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
      showError("Download failed. Please try again.");
    } finally {
      if (cloned && cloned.parentNode) {
        cloned.parentNode.removeChild(cloned);
      }
      setQrDownloading(false);
    }
  };

  const handleLinkStatusToggle = async (id) => {
    const record = records.find((r) => r.id === id || r._id === id);
    if (!record) return;

    const newStatus =
      String(record.linkStatus || "active").toLowerCase() === "active"
        ? "inactive"
        : "active";
    try {
      await apiPut(`${API_ENDPOINTS.PAYMENT_LINKS.LIST}/${id}`, {
        ...record,
        linkStatus: newStatus,
      });
      showSuccess("Link status updated successfully!");
      await fetchRecords();
    } catch (error) {
      console.error("Error updating link status:", error);
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to update link status",
      );
    }
  };

  const handleDeleteClick = (record) => {
    setRecordToDelete(normalizePaymentLinkRecord(record));
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    const targetId = String(
      recordToDelete?.id || recordToDelete?._id || "",
    ).trim();
    if (!targetId) {
      showError("Unable to delete payment link: missing record id");
      return;
    }

    try {
      await apiDelete(
        API_ENDPOINTS.PAYMENT_LINKS.DELETE(encodeURIComponent(targetId)),
      );
      showSuccess("Payment link deleted successfully");
      setRecordToDelete(null);
      fetchRecords();
    } catch (error) {
      showError(
        error?.response?.data?.error || "Failed to delete payment link",
      );
    }
  };

  const handleRefresh = () => {
    if (serverSide) {
      setFilters({});
      setSearchTerm("");
      setSortField(null);
      setSortDirection("normal");
      setCurrentPage(1);
      setActiveCardFilter("total");
    }
    fetchRecords();
    showInfo("Data refreshed");
  };

  const handleDebouncedColumnFilterChange = (key, value) => {
    if (serverSide) {
      if (debounceColumnTimeoutRef.current) {
        clearTimeout(debounceColumnTimeoutRef.current);
      }

      debounceColumnTimeoutRef.current = setTimeout(() => {
        setFilters((prev) => ({ ...prev, [key]: value }));
        setCurrentPage(1);
      }, 400);
      return;
    }

    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const customActions = (record) => (
    <>
      <button
        className="btn btn-sm btn-outline-secondary me-1"
        title="Copy Link"
        onClick={() => copyLink(record)}
      >
        <i className="fas fa-link"></i>
      </button>
      <button
        className="btn btn-sm btn-outline-dark me-1"
        title="Payment QR"
        onClick={() => openQrModal(record)}
      >
        <i className="fas fa-qrcode"></i>
      </button>
      <button
        className="btn btn-sm btn-outline-danger me-1"
        title="Delete"
        onClick={() => handleDeleteClick(record)}
      >
        <i className="fas fa-trash"></i>
      </button>
    </>
  );

  return (
    <>
      <div className="container-fluid">
        <div
          className="py-3 d-flex justify-content-between align-items-center flex-wrap"
          style={{ marginTop: "70px" }}
        >
          <h4 className="fs-18 fw-semibold m-0">Payment Link Management</h4>

          <div className="form-check form-switch m-0">
            <input
              className="form-check-input"
              type="checkbox"
              checked={serverSide}
              onChange={(event) => {
                setServerSide(event.target.checked);
                setCurrentPage(1);
                setFilters({});
                setSearchTerm("");
                setSortField(null);
                setSortDirection("normal");
                setActiveCardFilter("total");
              }}
              id="paymentLinkServerSideToggle"
            />
            <label
              className="form-check-label ms-2"
              htmlFor="paymentLinkServerSideToggle"
            >
              Server-side Mode {serverSide ? "(Enabled)" : "(Disabled)"}
            </label>
          </div>
        </div>

        <div className="row">
          {cards.map((card, index) => {
            const cardNumber = (index % 8) + 1;
            const cardClass = `card${cardNumber}`;
            const cardIconBgClass = `card-icon-bg${cardNumber}`;
            const isActive =
              activeCardFilter === card.key && card.key !== "addNew";
            const isAddNewDisabled = card.key === "addNew" && !canCreate;

            return (
              <div key={card.key} className="col-md-6 col-xl-2 mb-4">
                <div
                  className={`card border-0 overflow-hidden ${cardClass} modern-card hover-elevate`}
                  style={{
                    cursor: isAddNewDisabled ? "not-allowed" : "pointer",
                    opacity: isAddNewDisabled ? 0.6 : 1,
                    borderRadius: "12px",
                    height: "100%",
                    border: isActive
                      ? "2px solid #0d6efd"
                      : undefined,
                  }}
                  onClick={() => !isAddNewDisabled && handleCardClick(card.key)}
                >
                  <div className="card-body text-center p-2">
                    <div className="mb-3 mt-2 d-flex justify-content-center">
                      <span
                        className={`avatar-md rounded-circle ${cardIconBgClass} d-inline-flex justify-content-center align-items-center kpi-icon`}
                        style={{ width: "56px", height: "56px" }}
                      >
                        <i className={`${card.icon} fs-4 text-white`} />
                      </span>
                    </div>
                    <h5 className="mb-2 fw-bold" style={{ fontSize: "16px" }}>{card.title}</h5>
                    <h6 className="mb-0 text-muted fw-bold">
                      {card.key === "addNew"
                        ? "+ Add New"
                        : card.count !== undefined
                          ? card.count
                          : 0}
                    </h6>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <ReusableTable
          ensureCreatedByColumn={true}
          createdByLabel="Created By"
          moduleKey={moduleKey}
          columns={columns}
          data={filteredClientSideData}
          loading={loading}
          totalRecords={totalRecords}
          onEdit={handleEdit}
          onView={handleView}
          onRefresh={handleRefresh}
          showActions={true}
          actions={["view", "edit"]}
          skipDeleteConfirmation={true}
          fixedColumns={fixedColumns}
          defaultVisibleColumns={defaultVisibleColumns}
          columnsWithDropdownFilter={columnsWithDropdownFilter}
          filterOptions={getFilterOptions()}
          tableTitle="Payment Links Record"
          showColumnSelector={true}
          showExport={true}
          showRefresh={true}
          showAdvancedFilter={true}
          showSearch={true}
          exportFileName="Payment_Link_Management"
          exportTitle="Payment Link Management Report"
          columnsWithDateFilter={["paymentDate", "linkExpiry", "createdAt"]}
          activeCardFilter={activeCardFilter}
          cards={cards}
          getBadgeClass={getStatusBadgeClass}
          serverSide={serverSide}
          onServerSideSearch={(term) => {
            setSearchTerm(term);
            setCurrentPage(1);
          }}
          onServerSideFilter={(nextFilters) => {
            setFilters(nextFilters);
            setCurrentPage(1);
          }}
          onServerSideSort={(field, direction) => {
            setSortField(field);
            setSortDirection(direction);
            setCurrentPage(1);
          }}
          onServerSidePageChange={(page) => setCurrentPage(page)}
          onServerSideRecordsPerPageChange={(limit) => {
            setRecordsPerPage(limit);
            setCurrentPage(1);
          }}
          currentPage={currentPage}
          recordsPerPage={recordsPerPage}
          onPageChange={setCurrentPage}
          onRecordsPerPageChange={setRecordsPerPage}
          onColumnFilterChange={handleDebouncedColumnFilterChange}
          exportApi={API_ENDPOINTS.PAYMENT_LINKS.LIST}
          customActions={customActions}
        />

        <CreatePaymentLink
          show={showForm}
          onClose={() => {
            setShowForm(false);
            setEditingRecord(null);
          }}
          onSubmit={handleFormSubmit}
          editingRecord={editingRecord}
        />

        {showQrModal && qrRecord && (
          <div
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 1200,
              padding: "0px",
            }}
            onClick={closeQrModal}
          >
            <div
              style={{
                width: "100%",
                maxWidth: "420px",
                backgroundColor: "transparent",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                ref={qrCardRef}
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
                  {["#4285f4", "#34a853", "#fbbc05", "#ea4335"].map((color) => (
                    <div
                      key={color}
                      style={{ background: color, margin: "0", padding: "0" }}
                    />
                  ))}
                </div>

                <div className="px-4 pt-4 pb-2 text-center">
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

                  <div
                    className="fw-bold text-dark"
                    style={{
                      fontSize: "1.55rem",
                      lineHeight: 1.05,
                      marginTop: "10px",
                    }}
                  >
                    {qrRecord?.accountName || "MaxCode IT Services"}
                  </div>
                </div>

                <div
                  className="px-3 pt-1 text-center"
                  style={{ paddingBottom: "0", margin: "0" }}
                >
                  <div
                    className="mx-auto"
                    style={{
                      width: "100%",
                      maxWidth: "530px",
                      padding: "4px 0",
                    }}
                  >
                    <img
                      src={getQrImageUrl(qrRecord)}
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

                    <div
                      className="mt-2 fw-bold text-dark"
                      style={{ fontSize: "0.9rem", letterSpacing: "0.5px" }}
                    >
                      {qrRecord?.accountName || "MaxCode IT Services"} |{" "}
                      {qrRecord?.upiId || "UPI ID"}
                    </div>

                    <div
                      className="text-center text-muted mt-3 mb-1"
                      style={{
                        fontSize: "0.75rem",
                        whiteSpace: "nowrap",
                        lineHeight: 1.2,
                        paddingInline: "4px",
                      }}
                    >
                      Scan this QR from any UPI app to pay to{" "}
                      {qrRecord?.accountName || "MaxCode IT Services"}
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
                      {[
                        { name: "PhonePe", src: "/UPI-app/PhonePe.png" },
                        { name: "Paytm", src: "/UPI-app/Paytm.png" },
                        { name: "GPay", src: "/UPI-app/GooglePay.png" },
                        { name: "Navi", src: "/UPI-app/Navi.png" },
                        { name: "BHIM", src: "/UPI-app/bhim-upi.png" },
                      ].map((app) => (
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

                  <div
                    className="d-flex align-items-center gap-2 mt-3 mb-2"
                    data-no-download="true"
                  >
                    <button
                      type="button"
                      className={`btn flex-grow-1 btn-primary`}
                      onClick={downloadQr}
                      disabled={qrDownloading}
                    >
                      <span className="d-inline-flex align-items-center justify-content-center gap-2">
                        <i
                          className={`fas ${qrDownloading ? "fa-spinner fa-spin" : "fa-download"}`}
                        ></i>
                        <span>
                          {qrDownloading ? "Downloading..." : "Download QR"}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`btn flex-grow-1 btn-danger`}
                      onClick={closeQrModal}
                      disabled={qrDownloading}
                    >
                      <span className="d-inline-flex align-items-center justify-content-center gap-2">
                        <i className="fas fa-times"></i>
                        <span>Close</span>
                      </span>
                    </button>
                  </div>
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
                  }}
                >
                  {["#4285f4", "#34a853", "#fbbc05", "#ea4335"].map((color) => (
                    <div
                      key={`bottom-${color}`}
                      style={{ background: color, margin: "0", padding: "0" }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <ConfirmationModal
          show={showDeleteConfirm}
          onHide={() => {
            setShowDeleteConfirm(false);
            setRecordToDelete(null);
          }}
          onConfirm={handleDeleteConfirm}
          title="Delete Payment Link"
          message={
            <>
              Are you sure you want to delete payment link for{" "}
              <strong>
                {recordToDelete?.clientName || recordToDelete?.alias || ""}
              </strong>
              {recordToDelete?.amount != null && (
                <>
                  {" "}
                  of{" "}
                  <strong>
                    ₹
                    {Number(recordToDelete.amount).toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </strong>
                </>
              )}
              ?
              {(recordToDelete?.accountName || recordToDelete?.upiId) && (
                <div
                  className="mt-2 text-muted"
                  style={{ fontSize: "0.87rem" }}
                >
                  {recordToDelete?.accountName && (
                    <div>
                      Account: <strong>{recordToDelete.accountName}</strong>
                    </div>
                  )}
                  {recordToDelete?.upiId && (
                    <div>
                      UPI ID: <strong>{recordToDelete.upiId}</strong>
                    </div>
                  )}
                </div>
              )}
            </>
          }
          confirmText="Delete"
          cancelText="Cancel"
          variant="danger"
        />
      </div>
    </>
  );
};

export default PaymentLinkManagement;
