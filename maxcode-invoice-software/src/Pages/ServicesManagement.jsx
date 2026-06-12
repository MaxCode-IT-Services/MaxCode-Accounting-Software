import React, { useState, useEffect, useMemo, useRef } from "react";
import ReusableTable from "../Components/ReusableTable";
import CreateServices from "../Components/CreateServices";
import ConfirmationModal from "../Components/ConfirmationModal";
import {
  showSuccess,
  showError,
  showInfo,
} from "../Components/ToastNotification";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { apiDelete, apiGet, apiPost, apiPut } from "../utils/api";
import { hasActionPermission } from "../utils/permissions";
import { fetchAllClients } from "../utils/fetchAllEntities";

const ServicesManagement = () => {
  const moduleKey = "servicesManagement";
  const canCreate = hasActionPermission(moduleKey, "create");

  const [serverSide, setServerSide] = useState(true);
  const [prefLoading, setPrefLoading] = useState(true);
  const [dynamicFilterOptions, setDynamicFilterOptions] = useState({});

  const debounceTimeoutRef = useRef(null);
  const debounceColumnTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null);

  useEffect(() => {
    document.title = "Services Management | MaxCode IT Services";

    const fetchPreference = async () => {
      try {
        const response = await apiGet(API_ENDPOINTS.USER_PREFERENCES.GET);
        if (typeof response.data?.servicesManagementServerSide === "boolean") {
          setServerSide(response.data.servicesManagementServerSide);
        }
      } catch (error) {
        console.error("Failed to fetch services management preference:", error);
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
          servicesManagementServerSide: serverSide,
        });
      } catch (error) {
        console.error("Failed to save services management preference:", error);
      }
    };

    savePreference();
  }, [serverSide, prefLoading]);

  const [allRecords, setAllRecords] = useState([]);
  const [records, setRecords] = useState([]);
  const [clients, setClients] = useState([]);
  const [financialYears, setFinancialYears] = useState([]);
  const [selectedFinancialYear, setSelectedFinancialYear] = useState(
    localStorage.getItem("selectedFinancialYear") || "ALL",
  );

  const [financialPeriodMode, setFinancialPeriodMode] = useState("yearly");

  const [loading, setLoading] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);
  const [showCreateServicesForm, setShowCreateServicesForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [serviceToDelete, setServiceToDelete] = useState(null);
  const [activeCardFilter, setActiveCardFilter] = useState("total");

  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(10);

  const [filters, setFilters] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState(null);
  const [sortDirection, setSortDirection] = useState("normal");

  const [statistics, setStatistics] = useState({
    total: 0,
    allActive: 0,
    expired: 0,
    dueSoon: 0,
    totalAmount: 0,
  });

  const cards = [
    {
      icon: "fas fa-rupee-sign",
      title: "Services Amount",
      key: "totalAmount",
      color: "info",
      count: statistics.totalAmount,
    },
    {
      icon: "fa-solid fa-circle-check",
      title: "Active",
      key: "allActive",
      color: "success",
      count: statistics.allActive,
    },
    {
      icon: "fa-solid fa-circle-xmark",
      title: "Expired",
      key: "expired",
      color: "danger",
      count: statistics.expired,
    },
    {
      icon: "fa-solid fa-clock",
      title: "Due in 30 Days",
      key: "dueSoon",
      color: "warning",
      count: statistics.dueSoon,
    },
    {
      icon: "fa-regular fa-calendar-days",
      title: "Financial Period",
      key: "period",
      color: "warning",
    },
    {
      icon: "fas fa-plus-circle",
      title: "Add New",
      key: "addNew",
      color: "success",
    },
  ];

  useEffect(() => {
    fetchFinancialYears();
    fetchClients();

    const handleFinancialYearSelectionChanged = (event) => {
      const selectedYear =
        event?.detail?.selectedFinancialYear ||
        localStorage.getItem("selectedFinancialYear") ||
        "ALL";
      setSelectedFinancialYear(selectedYear);
      if (serverSide) {
        setCurrentPage(1);
      }
    };

    window.addEventListener(
      "financialYearSelectionChanged",
      handleFinancialYearSelectionChanged,
    );

    return () => {
      window.removeEventListener(
        "financialYearSelectionChanged",
        handleFinancialYearSelectionChanged,
      );
    };
  }, [serverSide]);

  const formatDateForDisplay = (dateString) => {
    if (!dateString) return "";

    try {
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        const day = String(date.getDate()).padStart(2, "0");
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
      }
      return dateString;
    } catch (e) {
      return dateString;
    }
  };

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

  const getDateOnly = (value) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  };

  const getExpiryDrivenStatus = (expiryDate, fallbackStatus = "Active") => {
    if (!expiryDate) return fallbackStatus || "Active";

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiry = new Date(expiryDate);
    if (Number.isNaN(expiry.getTime())) return fallbackStatus || "Active";
    expiry.setHours(0, 0, 0, 0);

    return expiry < today ? "Expired" : "Active";
  };

  const normalizeRecordStatuses = (record) => {
    const normalizedServices = Array.isArray(record?.services)
      ? record.services.map((service) => ({
          ...service,
          status: getExpiryDrivenStatus(service?.expiryDate, service?.status),
        }))
      : [];

    const normalizedTransactions = Array.isArray(record?.transactions)
      ? record.transactions.map((transaction) => ({
          ...transaction,
          status: getExpiryDrivenStatus(
            transaction?.expiryDate,
            transaction?.status,
          ),
        }))
      : [];

    return {
      ...record,
      services: normalizedServices,
      transactions: normalizedTransactions,
      status: normalizedServices.every(
        (service) => service.status === "Expired",
      )
        ? "Expired"
        : "Active",
    };
  };

  const fetchFinancialYears = async () => {
    try {
      const response = await apiGet(API_ENDPOINTS.YEARS.LIST);
      const yearsData = Array.isArray(response.data)
        ? response.data
        : response.data?.years || [];

      const normalizedYears = yearsData
        .filter((yearRecord) => yearRecord?.isDeleted !== true)
        .map((yearRecord) => ({
          ...yearRecord,
          id: yearRecord.id || yearRecord._id,
          value: yearRecord.financialYear || yearRecord.year,
        }));

      setFinancialYears(normalizedYears);
    } catch (error) {
      console.error("Financial years API fetch error:", error);
      setFinancialYears([]);
    }
  };

  const fetchServices = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (prefLoading) return;
    setLoading(true);

    try {
      let url = API_ENDPOINTS.SERVICES.LIST;
      const params = new URLSearchParams();

      if (serverSide) {
        // ✅ Server-side pagination
        params.append("page", currentPage);
        params.append("limit", recordsPerPage);

        if (searchTerm) {
          params.append("search", searchTerm);
        }

        if (selectedFinancialYear && selectedFinancialYear !== "ALL") {
          params.append("financialYear", selectedFinancialYear);
        }

        if (financialPeriodMode && financialPeriodMode !== "yearly") {
          params.append("period", financialPeriodMode);
        }

        if (sortField && sortDirection !== "normal") {
          params.append("sortBy", sortField);
          params.append(
            "sortOrder",
            sortDirection === "ascending" ? "asc" : "desc",
          );
        }

        const dateRangeColumns = [
          "serviceDateFormatted",
          "createdDateTime",
          "nextExpiry",
        ];

        Object.entries(filters).forEach(([key, value]) => {
          if (["sn", "action", "filter"].includes(key)) return;
          if (
            value === undefined ||
            value === null ||
            value === "" ||
            value === "All"
          ) {
            return;
          }

          if (dateRangeColumns.includes(key) && typeof value === "object") {
            if (value.startDate) {
              params.append(`${key}_start`, value.startDate);
            }
            if (value.endDate) {
              params.append(`${key}_end`, value.endDate);
            }
            return;
          }

          if (
            Array.isArray(value) &&
            value.length > 0 &&
            !value.includes("All")
          ) {
            params.append(key, value.join(","));
            return;
          }

          if (!Array.isArray(value)) {
            params.append(key, value);
          }
        });

        if (
          activeCardFilter &&
          activeCardFilter !== "total" &&
          activeCardFilter !== "addNew" &&
          activeCardFilter !== "period"
        ) {
          params.append("filter", activeCardFilter);
        }
      } else {
        // ✅ Client-side mode → get FULL data
        params.append("export", "1");
      }

      url = `${url}?${params.toString()}`;

      const response = await apiGet(url, {
        signal: controller.signal,
      });

      let servicesData;
      let total;

      if (serverSide) {
        servicesData = response.data?.data || response.data?.services || [];
        total =
          response.data?.pagination?.totalRecords ||
          response.data?.total ||
          servicesData.length;

        if (response.data?.statistics) {
          setStatistics({
            total: Number(response.data.statistics.total || 0),
            allActive: Number(response.data.statistics.allActive || 0),
            expired: Number(response.data.statistics.expired || 0),
            dueSoon: Number(response.data.statistics.dueSoon || 0),
            totalAmount: Number(
              response.data.statistics.totalAmount || 0,
            ).toFixed(2),
          });
        }

        if (response.data?.filterOptions) {
          setDynamicFilterOptions(response.data.filterOptions);
        }

        if (response.data?.clients) {
          setClients(
            response.data.clients.map((client) => ({
              ...client,
              id: client.id || client._id,
            })),
          );
        }
      } else {
        servicesData =
          response.data?.data ||
          response.data?.services ||
          (Array.isArray(response.data) ? response.data : []);
        total = servicesData.length;
      }

      const normalized = servicesData.map((record) => {
        const withNormalizedStatus = normalizeRecordStatuses(record);
        const serviceRows = Array.isArray(withNormalizedStatus.services)
          ? withNormalizedStatus.services
          : [];
        const counters = calculateServiceCounters(serviceRows);
        const nearestExpiry = getNearestExpiryDate(serviceRows);
        const createdDate =
          withNormalizedStatus.createdDate || withNormalizedStatus.createdAt;

        return {
          ...withNormalizedStatus,
          id: withNormalizedStatus._id || withNormalizedStatus.id,
          createdDate,
          serviceDateFormatted: formatDateForDisplay(
            withNormalizedStatus.serviceDate,
          ),
          createdDateTime:
            withNormalizedStatus.createdDateTime ||
            formatDateTimeForDisplay(createdDate),
          serviceCount: counters.total,
          activeCount: counters.active,
          expiredCount: counters.expired,
          nextExpiry: formatDateForDisplay(nearestExpiry),
          totalServiceAmount:
            withNormalizedStatus.summary?.totalServiceAmount || 0,
          totalTransactionAmount:
            withNormalizedStatus.summary?.totalTransactionAmount || 0,
          recordStatus:
            withNormalizedStatus.recordStatus ||
            getRecordStatus(withNormalizedStatus),
        };
      });

      setRecords(normalized);
      setTotalRecords(total);

      if (!serverSide) {
        setAllRecords(normalized);
        updateStatistics(normalized);
      }

      if (serverSide) {
        setAllRecords(normalized);
      }
    } catch (error) {
      if (error.name === "CanceledError" || error.name === "AbortError") {
        return;
      }

      console.error("Failed to fetch services:", error);
      showError("Failed to fetch services");
      setAllRecords([]);
      setRecords([]);
      setTotalRecords(0);
      updateStatistics([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchClients = async (options = {}) => {
    try {
      const clientsData = await fetchAllClients(options);

      const activeClients = clientsData
        .filter((client) => client?.isDeleted !== true)
        .map((client) => ({
          ...client,
          id: client.id || client._id,
        }));

      setClients(activeClients);
    } catch (error) {
      console.error("Failed to fetch clients:", error);
      setClients([]);
    }
  };

  const applySelectedFinancialYearFilter = (sourceRecords, selectedYear) => {
    if (!Array.isArray(sourceRecords)) {
      setRecords([]);
      updateStatistics([]);
      return;
    }

    if (!selectedYear || selectedYear === "ALL") {
      setRecords(sourceRecords);
      updateStatistics(sourceRecords);
      return;
    }

    const matchedYear = financialYears.find(
      (year) => year.value === selectedYear,
    );

    if (!matchedYear?.startDate || !matchedYear?.endDate) {
      setRecords(sourceRecords);
      updateStatistics(sourceRecords);
      return;
    }

    const startDate = getDateOnly(matchedYear.startDate);
    const endDate = getDateOnly(matchedYear.endDate);

    if (!startDate || !endDate) {
      setRecords(sourceRecords);
      updateStatistics(sourceRecords);
      return;
    }

    const filtered = sourceRecords.filter((record) => {
      const serviceDate = getDateOnly(record.serviceDate || record.createdDate);
      if (!serviceDate) return false;
      return serviceDate >= startDate && serviceDate <= endDate;
    });

    setRecords(filtered);
    updateStatistics(filtered);
  };

  const getNearestExpiryDate = (serviceRows = []) => {
    const validDates = serviceRows
      .map((service) => service?.expiryDate)
      .filter(Boolean)
      .map((value) => new Date(value))
      .filter((date) => !Number.isNaN(date.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());

    return validDates.length ? validDates[0].toISOString().slice(0, 10) : "";
  };

  const calculateServiceCounters = (serviceRows = []) => {
    const total = serviceRows.length;
    const active = serviceRows.filter((row) => row?.status === "Active").length;
    const expired = serviceRows.filter(
      (row) => row?.status === "Expired",
    ).length;

    return { total, active, expired };
  };

  const calculateTransactionCounters = (transactionRows = []) => {
    const total = transactionRows.length;
    const active = transactionRows.filter((row) => row?.status === "Active").length;
    const expired = transactionRows.filter(
      (row) => row?.status === "Expired",
    ).length;

    return { total, active, expired };
  };

  const updateStatistics = (data) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dueSoonLimit = new Date(today);
    dueSoonLimit.setDate(dueSoonLimit.getDate() + 30);

    const stats = data.reduce(
      (acc, record) => {
        // Process services (Active service plans)
        const serviceRows = Array.isArray(record.services)
          ? record.services
          : [];
        const serviceSummary = calculateServiceCounters(serviceRows);

        // Process transactions (Service history - Renewal & Service History)
        const transactionRows = Array.isArray(record.transactions)
          ? record.transactions
          : [];
        const transactionSummary = calculateTransactionCounters(transactionRows);

        // Aggregate both services and transactions
        acc.total += serviceSummary.total + transactionSummary.total;
        acc.allActive += serviceSummary.active + transactionSummary.active;
        acc.expired += serviceSummary.expired + transactionSummary.expired;

        // Calculate due soon from both services and transactions
        const serviceDueSoonCount = serviceRows.filter((row) => {
          if (!row?.expiryDate) return false;
          const expiry = new Date(row.expiryDate);
          expiry.setHours(0, 0, 0, 0);
          return (
            row.status !== "Expired" &&
            expiry >= today &&
            expiry <= dueSoonLimit
          );
        }).length;

        const transactionDueSoonCount = transactionRows.filter((row) => {
          if (!row?.expiryDate) return false;
          const expiry = new Date(row.expiryDate);
          expiry.setHours(0, 0, 0, 0);
          return (
            row.status !== "Expired" &&
            expiry >= today &&
            expiry <= dueSoonLimit
          );
        }).length;

        acc.dueSoon += serviceDueSoonCount + transactionDueSoonCount;
        // FIXED: Only count transaction amounts for revenue, NOT service plans (avoids double counting)
        acc.totalAmount +=
          parseFloat(record.summary?.totalTransactionAmount || 0) || 0;

        return acc;
      },
      {
        total: 0,
        allActive: 0,
        expired: 0,
        dueSoon: 0,
        totalAmount: 0,
      },
    );

    setStatistics({
      ...stats,
      totalAmount: stats.totalAmount.toFixed(2),
    });
  };

  const getDefaultFinancialYearRecord = () => {
    return financialYears.find((year) => year?.isDefault === true) || null;
  };

  const isServiceDateWithinFinancialYear = (
    serviceDate,
    financialYearRecord,
  ) => {
    if (
      !serviceDate ||
      !financialYearRecord?.startDate ||
      !financialYearRecord?.endDate
    ) {
      return true;
    }

    const serviceDateObj = new Date(serviceDate);
    const startDate = new Date(financialYearRecord.startDate);
    const endDate = new Date(financialYearRecord.endDate);
    return serviceDateObj >= startDate && serviceDateObj <= endDate;
  };

  const getPeriodDisplayValue = () => {
    return financialPeriodMode === "daily"
      ? "Daily"
      : financialPeriodMode === "monthly"
        ? "Monthly"
        : financialPeriodMode === "quarterly"
          ? "Quarterly"
          : financialPeriodMode === "halfYearly"
            ? "Half Yearly"
            : "Yearly";
  };

  useEffect(() => {
    if (serverSide) return;
    updateStatistics(records);
  }, [records, serverSide]);

  useEffect(() => {
    if (prefLoading) return;

    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);

    debounceTimeoutRef.current = setTimeout(
      () => {
        fetchServices();
      },
      serverSide ? 500 : 0,
    );

    return () => clearTimeout(debounceTimeoutRef.current);
  }, [
    serverSide,
    currentPage,
    recordsPerPage,
    searchTerm,
    filters,
    sortField,
    sortDirection,
    activeCardFilter,
    selectedFinancialYear,
    financialPeriodMode,
    prefLoading,
  ]);

  const preparedData = useMemo(() => {
    return records.map((record, index) => ({
      ...record,
      sn: serverSide
        ? (currentPage - 1) * recordsPerPage + index + 1
        : index + 1,
    }));
  }, [records, currentPage, recordsPerPage, serverSide]);

  const filteredClientSideData = useMemo(() => {
    if (serverSide) {
      return preparedData;
    }

    let data = preparedData;

    Object.entries(filters).forEach(([key, value]) => {
      if (value && typeof value === "string" && value.trim() !== "") {
        data = data.filter((row) =>
          (row[key] || "")
            .toString()
            .toLowerCase()
            .includes(value.toLowerCase()),
        );
      }
    });

    if (selectedFinancialYear && selectedFinancialYear !== "ALL") {
      data = data.filter((record) => {
        const recordFinancialYear = String(record.financialYear || "").trim();

        if (recordFinancialYear) {
          return recordFinancialYear === selectedFinancialYear;
        }

        const yearRecord = financialYears.find(
          (year) => year.value === selectedFinancialYear,
        );

        if (!yearRecord?.startDate || !yearRecord?.endDate) {
          return true;
        }

        const serviceDate = new Date(record.serviceDate);
        if (Number.isNaN(serviceDate.getTime())) {
          return false;
        }

        const startDate = new Date(yearRecord.startDate);
        const endDate = new Date(yearRecord.endDate);
        return serviceDate >= startDate && serviceDate <= endDate;
      });
    }

    if (financialPeriodMode !== "yearly") {
      const today = new Date();

      data = data.filter((record) => {
        const serviceDate = new Date(record.serviceDate);
        if (!serviceDate || Number.isNaN(serviceDate.getTime())) return false;

        if (financialPeriodMode === "daily") {
          return (
            serviceDate.getDate() === today.getDate() &&
            serviceDate.getMonth() === today.getMonth() &&
            serviceDate.getFullYear() === today.getFullYear()
          );
        }

        if (financialPeriodMode === "monthly") {
          return (
            serviceDate.getMonth() === today.getMonth() &&
            serviceDate.getFullYear() === today.getFullYear()
          );
        }

        if (financialPeriodMode === "quarterly") {
          const quarter = (date) => Math.floor(date.getMonth() / 3) + 1;
          return (
            serviceDate.getFullYear() === today.getFullYear() &&
            quarter(serviceDate) === quarter(today)
          );
        }

        if (financialPeriodMode === "halfYearly") {
          const half = (date) => (date.getMonth() < 6 ? 1 : 2);
          return (
            serviceDate.getFullYear() === today.getFullYear() &&
            half(serviceDate) === half(today)
          );
        }

        return true;
      });
    }

    if (activeCardFilter === "allActive") {
      data = data.filter((record) => record.recordStatus === "Active");
    } else if (activeCardFilter === "expired") {
      data = data.filter((record) => record.recordStatus === "Expired");
    } else if (activeCardFilter === "dueSoon") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const dueSoonLimit = new Date(today);
      dueSoonLimit.setDate(dueSoonLimit.getDate() + 30);

      data = data.filter((record) => {
        const serviceRows = Array.isArray(record.services)
          ? record.services
          : [];
        return serviceRows.some((row) => {
          if (!row?.expiryDate || row.status === "Expired") return false;
          const expiry = new Date(row.expiryDate);
          if (Number.isNaN(expiry.getTime())) return false;
          expiry.setHours(0, 0, 0, 0);
          return expiry >= today && expiry <= dueSoonLimit;
        });
      });
    }

    return data;
  }, [
    preparedData,
    filters,
    serverSide,
    selectedFinancialYear,
    financialYears,
    financialPeriodMode,
    activeCardFilter,
  ]);

  const getRecordStatus = (record) => {
    const serviceRows = Array.isArray(record.services) ? record.services : [];
    if (!serviceRows.length) return "No Services";

    const allExpired = serviceRows.every((row) => row.status === "Expired");
    const allActive = serviceRows.every((row) => row.status === "Active");

    if (allExpired) return "Expired";
    if (allActive) return "Active";
    return "Mixed";
  };

  const handleDebouncedColumnFilterChange = (key, value) => {
    if (serverSide) {
      if (debounceColumnTimeoutRef.current) {
        clearTimeout(debounceColumnTimeoutRef.current);
      }

      debounceColumnTimeoutRef.current = setTimeout(() => {
        setFilters((prev) => ({ ...prev, [key]: value }));
        setCurrentPage(1);
      }, 500);
    } else {
      setFilters((prev) => ({ ...prev, [key]: value }));
    }
  };

  const columns = [
    { key: "sn", label: "S.No", width: 70 },
    { key: "serviceNumber", label: "Service No.", width: 130 },
    { key: "serviceDateFormatted", label: "Service Date", width: 130 },
    { key: "clientName", label: "Client Name", width: 150 },
    { key: "clientId", label: "Client ID", width: 120 },
    { key: "businessName", label: "Business Name", width: 180 },
    {
      key: "serviceCount",
      label: "Total Services",
      width: 130,
      render: (value) => <span className="badge bg-primary">{value}</span>,
    },
    {
      key: "activeCount",
      label: "Active",
      width: 90,
      render: (value) => <span className="badge bg-success">{value}</span>,
    },
    {
      key: "expiredCount",
      label: "Expired",
      width: 90,
      render: (value) => <span className="badge bg-danger">{value}</span>,
    },
    { key: "nextExpiry", label: "Next Expiry", width: 130 },
    {
      key: "totalServiceAmount",
      label: "Services Amount",
      width: 130,
      render: (value) => (
        <span className="fw-bold text-primary">
          ₹{" "}
          {parseFloat(value || 0).toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      ),
    },
    {
      key: "totalTransactionAmount",
      label: "Transactions Amount",
      width: 130,
      render: (value) => (
        <span className="fw-bold text-info">
          ₹{" "}
          {parseFloat(value || 0).toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      ),
    },
    {
      key: "recordStatus",
      label: "Status",
      width: 110,
      render: (value) => {
        let badge = "bg-secondary";
        if (value === "Active") badge = "bg-success";
        else if (value === "Expired") badge = "bg-danger";
        else if (value === "Mixed") badge = "bg-warning";
        return <span className={`badge ${badge}`}>{value}</span>;
      },
    },
    { key: "createdDateTime", label: "Created Date & Time", width: 200 },
    { key: "action", label: "Actions", width: 170 },
  ];

  const fixedColumns = ["sn"];
  const defaultVisibleColumns = [
    "sn",
    "serviceNumber",
    "serviceDateFormatted",
    "clientName",
    "businessName",
    "totalTransactionAmount",
    "action",
  ];

  const columnsWithDropdownFilter = ["recordStatus", "businessName"];
  const columnsWithDateFilter = [
    "serviceDateFormatted",
    "createdDateTime",
    "nextExpiry",
  ];

  const handleCardClick = (cardKey) => {
    if (cardKey === "addNew") {
      if (!canCreate) {
        showError("You don't have permission to add services");
        return;
      }
      setEditingRecord(null);
      setShowCreateServicesForm(true);
      return;
    }

    if (cardKey === "period") {
      const periodCycle = [
        "daily",
        "monthly",
        "quarterly",
        "halfYearly",
        "yearly",
      ];

      setFinancialPeriodMode((prev) => {
        const currentIndex = periodCycle.indexOf(prev);
        if (currentIndex === -1) return "daily";
        const next = periodCycle[(currentIndex + 1) % periodCycle.length];
        if (serverSide) {
          setCurrentPage(1);
        }
        return next;
      });
    } else {
      setActiveCardFilter(cardKey);
      if (serverSide) {
        setCurrentPage(1);
      }
    }
  };

  const getCardNumber = (index) => {
    return (index % 8) + 1;
  };

  const handleFormSubmit = async (formData) => {
    try {
      if (!editingRecord) {
        const defaultFinancialYear = getDefaultFinancialYearRecord();

        if (!defaultFinancialYear?.value) {
          showError(
            "Default financial year is not configured. Please set default financial year first.",
          );
          return;
        }

        if (selectedFinancialYear !== defaultFinancialYear.value) {
          showError(
            `Please select default financial year ${defaultFinancialYear.value} in navbar before creating service.`,
          );
          return;
        }

        const isValidServiceDate = isServiceDateWithinFinancialYear(
          formData.serviceDate,
          defaultFinancialYear,
        );

        if (!isValidServiceDate) {
          showError(
            `Service Date must be between ${formatDateForDisplay(defaultFinancialYear.startDate)} and ${formatDateForDisplay(defaultFinancialYear.endDate)} for financial year ${defaultFinancialYear.value}.`,
          );
          return;
        }
      }

      const selectedClient = clients.find(
        (client) =>
          client.id == formData.clientRefId ||
          client._id == formData.clientRefId ||
          client.clientId == formData.clientRefId,
      );

      const payload = {
        ...formData,
        financialYear:
          selectedFinancialYear !== "ALL"
            ? selectedFinancialYear
            : editingRecord?.financialYear ||
              getDefaultFinancialYearRecord()?.value ||
              "",
        clientName: selectedClient?.clientName || formData.clientName || "",
        createdDate: editingRecord?.createdDate || new Date().toISOString(),
      };

      if (editingRecord && !editingRecord.isViewMode) {
        const serviceId = editingRecord._id || editingRecord.id;
        await apiPut(API_ENDPOINTS.SERVICES.UPDATE(serviceId), payload);
        showSuccess("Service updated successfully!");
      } else {
        await apiPost(API_ENDPOINTS.SERVICES.CREATE, payload);
        showSuccess("Service added successfully!");
      }

      await fetchServices();
      setShowCreateServicesForm(false);
      setEditingRecord(null);
    } catch (error) {
      console.error("Error saving service:", error);
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to save service",
      );
      throw error;
    }
  };

  const handleEdit = (record) => {
    setEditingRecord(record);
    setShowCreateServicesForm(true);
    showInfo(`Editing service: ${record.serviceNumber}`);
  };

  const handleView = (record) => {
    setEditingRecord({ ...record, isViewMode: true });
    setShowCreateServicesForm(true);
    showInfo(`Viewing service: ${record.serviceNumber}`);
  };

  const handleDelete = (id) => {
    setServiceToDelete(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!serviceToDelete) return;

    try {
      await apiDelete(API_ENDPOINTS.SERVICES.DELETE(serviceToDelete));
      await fetchServices();
      showSuccess("Service deleted successfully!");
      setShowDeleteConfirm(false);
      setServiceToDelete(null);
    } catch (error) {
      console.error("Error deleting service:", error);
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to delete service",
      );
    }
  };

  const handleRefresh = () => {
    fetchClients({ forceRefresh: true });
    fetchServices();
    showInfo("Data refreshed!");
  };

  const handleServerSideSearch = (term) => {
    setSearchTerm(term);
    setCurrentPage(1);
  };

  const handleServerSideFilter = (filterParams) => {
    setFilters(filterParams);
    setCurrentPage(1);
  };

  const handleServerSideSort = (field, direction) => {
    setSortField(field);
    setSortDirection(direction);
    setCurrentPage(1);
  };

  const handleServerSidePageChange = (page) => {
    setCurrentPage(page);
  };

  const handleServerSideRecordsPerPageChange = (limit) => {
    setRecordsPerPage(limit);
    setCurrentPage(1);
  };

  const getFilterOptions = () => {
    const options = {
      recordStatus: ["All", "Active", "Expired", "Mixed", "No Services"],
    };

    if (serverSide && dynamicFilterOptions?.businessName) {
      options.businessName = dynamicFilterOptions.businessName;
    } else if (records.length > 0) {
      const names = [
        ...new Set(
          records
            .map((record) => record.businessName)
            .filter((name) => name && String(name).trim() !== ""),
        ),
      ].sort();
      options.businessName = ["All", ...names];
    } else {
      options.businessName = ["All"];
    }

    return options;
  };

  return (
    <>
      <div className="container-fluid">
        <div
          className="py-3 d-flex justify-content-between align-items-center flex-wrap"
          style={{ marginTop: "70px" }}
        >
          <h4 className="fs-18 fw-semibold m-0">Services Management</h4>

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
                setFinancialPeriodMode("yearly");
              }}
              id="servicesServerSideToggle"
            />
            <label
              className="form-check-label ms-2"
              htmlFor="servicesServerSideToggle"
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
            const isActive =
              activeCardFilter === card.key &&
              card.key !== "addNew" &&
              card.key !== "period";
            const isAddNewDisabled = card.key === "addNew" && !canCreate;

            let displayValue;
            if (card.key === "addNew") {
              displayValue = "+ Add New";
            } else if (card.key === "period") {
              displayValue = `${selectedFinancialYear === "ALL" ? "All Year" : selectedFinancialYear} • ${getPeriodDisplayValue()}`;
            } else if (card.key === "totalAmount") {
              displayValue = `₹ ${parseFloat(card.count || 0).toLocaleString(
                "en-IN",
                {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                },
              )}`;
            } else {
              displayValue = card.count || 0;
            }

            return (
              <div key={index} className="col-md-6 col-xl-2 mb-4">
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
                      {displayValue}
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
          key={serverSide ? "services-table-server" : "services-table-client"}
          moduleKey={moduleKey}
          columns={columns}
          data={serverSide ? preparedData : filteredClientSideData}
          loading={loading}
          totalRecords={totalRecords}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onView={handleView}
          onRefresh={handleRefresh}
          showActions={true}
          actions={["view", "edit", "delete"]}
          skipDeleteConfirmation={true}
          fixedColumns={fixedColumns}
          defaultVisibleColumns={defaultVisibleColumns}
          columnsWithDropdownFilter={columnsWithDropdownFilter}
          columnsWithDateFilter={columnsWithDateFilter}
          filterOptions={serverSide ? dynamicFilterOptions : getFilterOptions()}
          tableTitle="Services Records"
          showColumnSelector={true}
          showExport={true}
          showRefresh={true}
          showAdvancedFilter={true}
          showSearch={true}
          exportFileName="Services_Management"
          exportTitle="Services Management Report"
          activeCardFilter={activeCardFilter}
          cards={cards}
          getBadgeClass={(value) => {
            if (value === "Active") return "bg-success";
            if (value === "Expired") return "bg-danger";
            if (value === "Mixed") return "bg-warning";
            return "bg-primary";
          }}
          serverSide={serverSide}
          onServerSideSearch={handleServerSideSearch}
          onServerSideFilter={handleServerSideFilter}
          onServerSideSort={handleServerSideSort}
          onServerSidePageChange={handleServerSidePageChange}
          onServerSideRecordsPerPageChange={
            handleServerSideRecordsPerPageChange
          }
          currentPage={currentPage}
          recordsPerPage={recordsPerPage}
          onPageChange={setCurrentPage}
          onRecordsPerPageChange={setRecordsPerPage}
          onColumnFilterChange={handleDebouncedColumnFilterChange}
          exportApi={API_ENDPOINTS.SERVICES.LIST}
        />

        <CreateServices
          show={showCreateServicesForm}
          onClose={() => {
            setShowCreateServicesForm(false);
            setEditingRecord(null);
          }}
          onSubmit={handleFormSubmit}
          editingRecord={editingRecord}
          clients={clients}
          financialYears={financialYears}
          selectedFinancialYear={selectedFinancialYear}
          defaultFinancialYear={getDefaultFinancialYearRecord()}
        />

        <ConfirmationModal
          show={showDeleteConfirm}
          onHide={() => {
            setShowDeleteConfirm(false);
            setServiceToDelete(null);
          }}
          onConfirm={confirmDelete}
          title="Delete Service"
          message="Are you sure you want to delete this service record?"
          confirmText="Delete"
          variant="danger"
          confirmationText="delete"
        />
      </div>
    </>
  );
};

export default ServicesManagement;
