import React, { useEffect, useMemo, useRef, useState } from "react";
import ReusableTable from "../Components/ReusableTable";
import { showError, showInfo } from "../Components/ToastNotification";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { apiGet, apiPost } from "../utils/api";

const OtpRequestManagement = () => {
  const moduleKey = "otpRequestManagement";
  const [serverSide, setServerSide] = useState(true);
  const [prefLoading, setPrefLoading] = useState(true);
  const [allClientSideRecords, setAllClientSideRecords] = useState([]);
  const [dynamicFilterOptions, setDynamicFilterOptions] = useState({});
  const [activeCardFilter, setActiveCardFilter] = useState("total");
  const [statistics, setStatistics] = useState({
    total: 0,
    otpSent: 0,
    verified: 0,
    expired: 0,
    blocked: 0,
    resendLocked: 0,
  });

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);

  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(10);
  const [filters, setFilters] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState(null);
  const [sortDirection, setSortDirection] = useState("normal");

  const debounceTimeoutRef = useRef(null);
  const debounceColumnTimeoutRef = useRef(null);

  const DATE_FILTER_COLUMNS = ["requestDateTime", "otpVerifiedDateTime"];

  const CARD_FILTERS = {
    total: () => true,
    otpSent: (record) => String(record?.status || "") === "otp_sent",
    verified: (record) => String(record?.status || "") === "verified",
    expired: (record) => String(record?.status || "") === "expired",
    blocked: (record) =>
      String(record?.status || "") === "blocked_wrong_attempts",
    resendLocked: (record) => String(record?.status || "") === "resend_locked",
  };

  const formatDateTimeForDisplay = (dateString) => {
    if (!dateString) return "";

    try {
      const date = new Date(dateString);
      if (Number.isNaN(date.getTime())) return dateString;

      const day = String(date.getDate()).padStart(2, "0");
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const year = date.getFullYear();

      let hours = date.getHours();
      const minutes = String(date.getMinutes()).padStart(2, "0");
      const seconds = String(date.getSeconds()).padStart(2, "0");
      const ampm = hours >= 12 ? "PM" : "AM";

      hours = hours % 12;
      hours = hours || 12;

      return `${day}-${month}-${year} | ${String(hours).padStart(2, "0")}:${minutes}:${seconds} ${ampm}`;
    } catch {
      return dateString;
    }
  };

  const formatCredentialType = (value = "") => {
    const normalized = String(value || "").trim();
    if (!normalized) return "";
    if (normalized === "my-software-credential")
      return "My Software Credential";
    if (normalized === "project-credentials") return "Project Credentials";
    return normalized
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (match) => match.toUpperCase());
  };

  const getStatusBadgeClass = (value = "") => {
    const normalized = String(value || "").trim();
    if (normalized === "otp_sent") return "bg-success";
    if (normalized === "verified") return "bg-success";
    if (normalized === "pending") return "bg-warning";
    if (normalized === "send_failed") return "bg-danger";
    if (normalized === "expired") return "bg-secondary";
    if (normalized === "blocked_wrong_attempts") return "bg-danger";
    if (normalized === "resend_locked") return "bg-warning";
    return "bg-primary";
  };

  const splitRequestBy = (value = "") => {
    const text = String(value || "").trim();
    if (!text) return { name: "", phone: "" };

    const match = text.match(/^(.*?)(?:\s*-\s*(\d{10,15}))?$/);
    if (!match) return { name: text, phone: "" };

    return {
      name: String(match[1] || "").trim(),
      phone: String(match[2] || "").trim(),
    };
  };

  const toTitleCase = (value = "") =>
    String(value || "")
      .trim()
      .replace(/[\s_-]+/g, " ")
      .replace(/\b\w/g, (match) => match.toUpperCase());

  const normalizeStatusOption = (value = "") => {
    const normalized = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");

    if (!normalized) return "";
    if (normalized === "otp_sent") return "OTP Send Success";
    if (normalized === "verified") return "Verified";
    if (normalized === "expired") return "Expired";
    if (normalized === "blocked_wrong_attempts") return "Blocked";
    if (normalized === "resend_locked") return "Resend Locked";
    if (normalized === "send_failed") return "Failed";
    if (normalized === "pending") return "Pending";

    return toTitleCase(normalized);
  };

  const normalizeStatusCode = (value = "") =>
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[\s-]+/g, "_");

  const normalizeRequestByOption = (value = "") => {
    const { name } = splitRequestBy(value);
    return String(name || "").trim();
  };

  const normalizeOperationOption = (value = "") => toTitleCase(value);

  const normalizeOtpRow = (row = {}) => {
    const parsed = splitRequestBy(row.requestBy);
    return {
      ...row,
      requestBy: parsed.name || String(row.requestBy || "").trim(),
      requestByPhone: parsed.phone || String(row.requestByPhone || "").trim(),
    };
  };

  useEffect(() => {
    document.title = "OTP Request Management | MaxCode IT Services";

    const fetchPreference = async () => {
      try {
        const response = await apiGet(API_ENDPOINTS.USER_PREFERENCES.GET);
        if (
          typeof response.data?.otpRequestManagementServerSide === "boolean"
        ) {
          setServerSide(response.data.otpRequestManagementServerSide);
        }
      } catch {
        // keep defaults
      } finally {
        setPrefLoading(false);
      }
    };

    fetchPreference();
  }, []);

  useEffect(() => {
    if (prefLoading) return;

    const savePreference = async () => {
      try {
        await apiPost(API_ENDPOINTS.USER_PREFERENCES.UPDATE, {
          otpRequestManagementServerSide: serverSide,
        });
      } catch {
        // ignore preference save errors
      }
    };

    savePreference();
  }, [serverSide, prefLoading]);

  const columns = [
    { key: "sn", label: "S.N.", width: 70 },
    {
      key: "requestDateTime",
      label: "Request Date & Time",
      width: 190,
      render: (value) => formatDateTimeForDisplay(value),
    },
    { key: "requestBy", label: "Request By", width: 170 },
    { key: "requestByPhone", label: "Request By Phone No.", width: 170 },
    { key: "clientName", label: "Client Name", width: 170 },
    { key: "clientBusinessName", label: "Client Business Name", width: 220 },
    { key: "projectName", label: "Project Name", width: 180 },
    {
      key: "credentialType",
      label: "Credential Type",
      width: 170,
      render: (value, record) =>
        formatCredentialType(record?.credentialTypeRaw || value || ""),
    },
    { key: "operation", label: "Operation", width: 110 },
    { key: "purpose", label: "Purpose", width: 260 },
    { key: "attempt", label: "Attempt", width: 100 },
    { key: "sentTo", label: "Sent To", width: 240 },
    {
      key: "otpVerifiedDateTime",
      label: "OTP Verified Date & Time",
      width: 210,
      render: (value) => formatDateTimeForDisplay(value),
    },
    {
      key: "status",
      label: "Status",
      width: 150,
      render: (value, record) => {
        const statusValue = String(record?.status || value || "").trim();
        const displayValue =
          record?.statusLabel ||
          (statusValue === "otp_sent"
            ? "OTP Send Success"
            : statusValue === "send_failed"
              ? "Failed"
              : statusValue === "verified"
                ? "Verified"
                : statusValue === "pending"
                  ? "Pending"
                  : statusValue === "resend_locked"
                    ? "Resend Locked"
                    : statusValue === "blocked_wrong_attempts"
                      ? "Blocked"
                      : statusValue === "expired"
                        ? "Expired"
                        : statusValue || "Pending");

        return (
          <span className={`badge ${getStatusBadgeClass(statusValue)}`}>
            {displayValue}
          </span>
        );
      },
    },
  ];

  const cards = [
    {
      key: "total",
      title: "Total Requests",
      count: statistics.total,
      icon: "fas fa-list",
      color: "primary",
    },
    {
      key: "otpSent",
      title: "OTP Sent",
      count: statistics.otpSent,
      icon: "fas fa-paper-plane",
      color: "info",
    },
    {
      key: "verified",
      title: "Verified",
      count: statistics.verified,
      icon: "fas fa-check-circle",
      color: "success",
    },
    {
      key: "expired",
      title: "Expired",
      count: statistics.expired,
      icon: "fas fa-clock",
      color: "warning",
    },
    {
      key: "blocked",
      title: "Blocked",
      count: statistics.blocked,
      icon: "fas fa-ban",
      color: "danger",
    },
    {
      key: "resendLocked",
      title: "Resend Locked",
      count: statistics.resendLocked,
      icon: "fas fa-lock",
      color: "secondary",
    },
  ];

  const getCardNumber = (index) => {
    return (index % 8) + 1;
  };

  const buildLocalStatistics = (source = []) => ({
    total: source.length,
    otpSent: source.filter((row) => row?.status === "otp_sent").length,
    verified: source.filter((row) => row?.status === "verified").length,
    expired: source.filter((row) => row?.status === "expired").length,
    blocked: source.filter((row) => row?.status === "blocked_wrong_attempts")
      .length,
    resendLocked: source.filter((row) => row?.status === "resend_locked")
      .length,
  });

  const buildLocalFilterOptions = (source = []) => {
    const uniq = (key, formatter) => {
      const normalized = new Map();

      source.forEach((row) => {
        const rawValue = String(row?.[key] || "").trim();
        if (!rawValue) return;
        const displayValue = formatter ? formatter(rawValue) : rawValue;
        if (!displayValue) return;

        const canonicalKey = displayValue.toLowerCase();
        if (!normalized.has(canonicalKey)) {
          normalized.set(canonicalKey, displayValue);
        }
      });

      return [...normalized.values()].sort((a, b) => a.localeCompare(b));
    };

    return {
      status: ["All", ...uniq("status", normalizeStatusOption)],
      operation: ["All", ...uniq("operation", normalizeOperationOption)],
      credentialType: ["All", ...uniq("credentialType")],
      requestBy: ["All", ...uniq("requestBy", normalizeRequestByOption)],
      requestByPhone: ["All", ...uniq("requestByPhone")],
      clientName: ["All", ...uniq("clientName")],
      clientBusinessName: ["All", ...uniq("clientBusinessName")],
      projectName: ["All", ...uniq("projectName")],
      sentTo: ["All", ...uniq("sentTo")],
    };
  };

  const applyClientSideQuery = (source = []) => {
    let processed = [...source];

    if (searchTerm.trim()) {
      const lowered = searchTerm.toLowerCase();
      processed = processed.filter((row) =>
        [
          row.requestBy,
          row.requestByPhone,
          row.clientName,
          row.clientBusinessName,
          row.projectName,
          row.credentialType,
          row.operation,
          row.purpose,
          row.status,
          row.sentTo,
        ]
          .join(" ")
          .toLowerCase()
          .includes(lowered),
      );
    }

    Object.entries(filters || {}).forEach(([key, value]) => {
      if (
        value === undefined ||
        value === null ||
        value === "" ||
        value === "All"
      ) {
        return;
      }

      if (
        DATE_FILTER_COLUMNS.includes(key) &&
        value &&
        typeof value === "object"
      ) {
        const start = value.startDate
          ? new Date(`${value.startDate}T00:00:00`)
          : null;
        const end = value.endDate
          ? new Date(`${value.endDate}T23:59:59`)
          : null;

        processed = processed.filter((row) => {
          const candidate =
            key === "requestDateTime"
              ? new Date(row.requestDateTime)
              : new Date(row.otpVerifiedDateTime);
          if (Number.isNaN(candidate.getTime())) return false;
          if (start && candidate < start) return false;
          if (end && candidate > end) return false;
          return true;
        });
        return;
      }

      if (key === "status") {
        const selectedStatusCode = normalizeStatusCode(
          String(value || "")
            .replace(/otp\s+send\s+success/i, "otp_sent")
            .replace(/failed/i, "send_failed")
            .replace(/blocked/i, "blocked_wrong_attempts")
            .replace(/resend\s+locked/i, "resend_locked"),
        );

        processed = processed.filter((row) => {
          const rowStatusCode = normalizeStatusCode(row?.status || "");
          return rowStatusCode === selectedStatusCode;
        });
        return;
      }

      processed = processed.filter((row) =>
        String(row?.[key] || "")
          .toLowerCase()
          .includes(String(value).toLowerCase()),
      );
    });

    if (activeCardFilter !== "total" && CARD_FILTERS[activeCardFilter]) {
      processed = processed.filter(CARD_FILTERS[activeCardFilter]);
    }

    if (sortField && sortDirection !== "normal") {
      processed.sort((a, b) => {
        const aVal = String(a?.[sortField] || "").toLowerCase();
        const bVal = String(b?.[sortField] || "").toLowerCase();
        if (aVal < bVal) return sortDirection === "ascending" ? -1 : 1;
        if (aVal > bVal) return sortDirection === "ascending" ? 1 : -1;
        return 0;
      });
    }

    const start = (currentPage - 1) * recordsPerPage;
    return {
      paged: processed.slice(start, start + recordsPerPage),
      total: processed.length,
    };
  };

  const fetchRecords = async () => {
    if (prefLoading) return;

    setLoading(true);
    try {
      if (serverSide) {
        const params = new URLSearchParams();
        params.append("page", currentPage);
        params.append("limit", recordsPerPage);
        params.append("filter", activeCardFilter);

        if (searchTerm.trim()) {
          params.append("search", searchTerm.trim());
        }

        Object.entries(filters || {}).forEach(([key, value]) => {
          if (
            value === undefined ||
            value === null ||
            value === "" ||
            value === "All"
          ) {
            return;
          }

          if (
            DATE_FILTER_COLUMNS.includes(key) &&
            value &&
            typeof value === "object"
          ) {
            if (value.startDate) params.append(`${key}_start`, value.startDate);
            if (value.endDate) params.append(`${key}_end`, value.endDate);
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

        const response = await apiGet(
          `${API_ENDPOINTS.OTP_ACCESS.LIST}?${params.toString()}`,
        );

        const rows = response?.data?.data || [];
        const total = response?.data?.pagination?.totalRecords || rows.length;

        setRecords(
          rows.map((row, index) => ({
            ...normalizeOtpRow(row),
            id: row.id,
            sn: (currentPage - 1) * recordsPerPage + index + 1,
          })),
        );
        setTotalRecords(total);
        setStatistics(response?.data?.statistics || buildLocalStatistics(rows));
        setDynamicFilterOptions(
          response?.data?.filterOptions || buildLocalFilterOptions(rows),
        );
        return;
      }

      const response = await apiGet(
        `${API_ENDPOINTS.OTP_ACCESS.LIST}?page=1&limit=1000`,
      );
      const source = (response?.data?.data || []).map((row) => ({
        ...normalizeOtpRow(row),
        id: row.id,
      }));

      setAllClientSideRecords(source);
      setStatistics(buildLocalStatistics(source));
      setDynamicFilterOptions(buildLocalFilterOptions(source));

      const { paged, total } = applyClientSideQuery(source);
      setRecords(
        paged.map((row, index) => ({
          ...row,
          sn: (currentPage - 1) * recordsPerPage + index + 1,
        })),
      );
      setTotalRecords(total);
    } catch (error) {
      showError(
        error?.response?.data?.error ||
          error?.response?.data?.message ||
          "Failed to fetch OTP request records",
      );
      setRecords([]);
      setTotalRecords(0);
      setStatistics({
        total: 0,
        otpSent: 0,
        verified: 0,
        expired: 0,
        blocked: 0,
        resendLocked: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (prefLoading) return;

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      fetchRecords();
    }, 350);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [
    currentPage,
    recordsPerPage,
    searchTerm,
    filters,
    sortField,
    sortDirection,
    activeCardFilter,
    serverSide,
    prefLoading,
  ]);

  useEffect(() => {
    if (serverSide) return;
    const { paged, total } = applyClientSideQuery(allClientSideRecords);
    setRecords(
      paged.map((row, index) => ({
        ...row,
        sn: (currentPage - 1) * recordsPerPage + index + 1,
      })),
    );
    setTotalRecords(total);
  }, [
    serverSide,
    allClientSideRecords,
    currentPage,
    recordsPerPage,
    searchTerm,
    filters,
    sortField,
    sortDirection,
    activeCardFilter,
  ]);

  const handleCardClick = (key) => {
    setActiveCardFilter(key);
    setCurrentPage(1);
  };

  const preparedData = useMemo(() => records, [records]);

  const finalFilterOptions = useMemo(() => {
    const localOptions = buildLocalFilterOptions(
      serverSide ? records : allClientSideRecords,
    );

    return {
      ...localOptions,
      ...(serverSide ? dynamicFilterOptions : {}),
    };
  }, [serverSide, records, allClientSideRecords, dynamicFilterOptions]);

  return (
    <div className="container-fluid" style={{ marginTop: "70px" }}>
      <div className="py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">
        <h4 className="fs-18 fw-semibold m-0">OTP Request Management</h4>

        <div className="form-check form-switch m-0">
          <input
            className="form-check-input"
            type="checkbox"
            checked={serverSide}
            onChange={(e) => {
              setServerSide(e.target.checked);
              setCurrentPage(1);
              setFilters({});
              setSearchTerm("");
              setSortField(null);
              setSortDirection("normal");
              setActiveCardFilter("total");
            }}
            id="otpRequestServerSideToggle"
          />
          <label
            className="form-check-label ms-2"
            htmlFor="otpRequestServerSideToggle"
          >
            Server-side Mode {serverSide ? "(Enabled)" : "(Disabled)"}
          </label>
        </div>
      </div>

      <div className="row">
        {cards.map((card, index) => {
          const cardNumber = getCardNumber(index);
          const cardClass = `card${cardNumber}`;
          const cardIconBgClass = `card-icon-bg${cardNumber}`;
          const isActive = activeCardFilter === card.key;

          return (
            <div key={index} className="col-md-6 col-xl-2 mb-4">
              <div
                className={`card border-0 shadow-sm overflow-hidden ${cardClass} ${isActive ? "border-primary" : ""}`}
                style={{
                  transition: "all 0.3s ease",
                  cursor: "pointer",
                  height: "100%",
                  borderRadius: "12px",
                  border: isActive ? "2px solid #0d6efd" : "1px solid #dee2e6",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = "translateY(-5px)";
                  e.currentTarget.style.boxShadow =
                    "0 10px 20px rgba(0,0,0,0.1)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)";
                }}
                onClick={() => handleCardClick(card.key)}
              >
                <div className="card-body text-center p-2">
                  <div className="mb-3 mt-2 d-flex justify-content-center">
                    <span
                      className={`avatar-md rounded-circle ${cardIconBgClass} d-inline-flex justify-content-center align-items-center`}
                      style={{
                        boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
                        width: "60px",
                        height: "60px",
                      }}
                    >
                      <i className={`${card.icon} fs-3 text-white`}></i>
                    </span>
                  </div>
                  <div>
                    <h5 className="mb-2 fw-bold">{card.title}</h5>
                    <h6
                      className="mb-0 text-muted fs-6 fw-bold"
                      style={{ marginBottom: "-10px" }}
                    >
                      {card.count !== undefined ? card.count : 0}
                    </h6>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <ReusableTable
        moduleKey={moduleKey}
        columns={columns}
        data={preparedData}
        loading={loading}
        totalRecords={totalRecords}
        showActions={false}
        actions={[]}
        fixedColumns={["sn"]}
        defaultVisibleColumns={[
          "sn",
          "requestDateTime",
          "requestBy",
          "clientName",
          "projectName",
          "status",
        ]}
        columnsWithDropdownFilter={[
          "status",
          "operation",
          "credentialType",
          "requestBy",
          "requestByPhone",
          "clientName",
          "clientBusinessName",
          "projectName",
          "sentTo",
        ]}
        columnsWithDateFilter={DATE_FILTER_COLUMNS}
        filterOptions={finalFilterOptions}
        activeCardFilter={activeCardFilter}
        cards={cards}
        tableTitle="OTP Access Request Logs"
        showColumnSelector={true}
        showExport={true}
        showRefresh={true}
        showAdvancedFilter={true}
        showSearch={true}
        exportFileName="OTP_Request_Management"
        exportTitle="OTP Request Management"
        serverSide={serverSide}
        onServerSideSearch={(term) => {
          setSearchTerm(term || "");
          setCurrentPage(1);
        }}
        onServerSideFilter={(params) => {
          setFilters(params || {});
          setCurrentPage(1);
        }}
        onServerSideSort={(field, direction) => {
          setSortField(field);
          setSortDirection(direction);
          setCurrentPage(1);
        }}
        onServerSidePageChange={setCurrentPage}
        onServerSideRecordsPerPageChange={(limit) => {
          setRecordsPerPage(limit);
          setCurrentPage(1);
        }}
        currentPage={currentPage}
        recordsPerPage={recordsPerPage}
        onPageChange={setCurrentPage}
        onRecordsPerPageChange={(limit) => {
          setRecordsPerPage(limit);
          setCurrentPage(1);
        }}
        onColumnFilterChange={(key, value) => {
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
          setCurrentPage(1);
        }}
        onRefresh={() => {
          fetchRecords();
          showInfo("OTP logs refreshed");
        }}
        exportApi={API_ENDPOINTS.OTP_ACCESS.LIST}
      />
    </div>
  );
};

export default OtpRequestManagement;
