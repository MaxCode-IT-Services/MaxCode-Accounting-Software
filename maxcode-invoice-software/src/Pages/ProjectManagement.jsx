import React, { useEffect, useMemo, useRef, useState } from "react";
import ReusableTable from "../Components/ReusableTable";
import CreateProject from "../Components/CreateProject";
import UploadedFilePreviewBox from "../Components/UploadedFilePreviewBox";
import {
  showSuccess,
  showError,
  showInfo,
} from "../Components/ToastNotification";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { apiGet, apiPost, apiPut } from "../utils/api";
import { hasActionPermission } from "../utils/permissions";
import {
  fetchAllClients,
  fetchAllPaginatedEntities,
} from "../utils/fetchAllEntities";

const toNumber = (value) => {
  const number = parseFloat(value);
  return Number.isNaN(number) ? 0 : number;
};

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

const ProjectManagement = () => {
  const moduleKey = "projectManagement";
  const canCreate = hasActionPermission(moduleKey, "create");

  const [serverSide, setServerSide] = useState(true);
  const [prefLoading, setPrefLoading] = useState(true);
  const [dynamicFilterOptions, setDynamicFilterOptions] = useState({});

  const [records, setRecords] = useState([]);
  const [allProjectRecords, setAllProjectRecords] = useState([]);
  const [clients, setClients] = useState([]);
  const [staffRecords, setStaffRecords] = useState([]);
  const [financialYears, setFinancialYears] = useState([]);
  const [selectedFinancialYear, setSelectedFinancialYear] = useState(
    localStorage.getItem("selectedFinancialYear") || "ALL",
  );

  const [loading, setLoading] = useState(false);
  const [showCreateProjectForm, setShowCreateProjectForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [activeCardFilter, setActiveCardFilter] =
    useState("totalAmountWithTax");

  const [statistics, setStatistics] = useState({
    totalAmountWithTax: 0,
    totalProjectValue: 0,
    totalDeveloperCost: 0,
    totalClientPayable: 0,
    totalDeveloperPayable: 0,
    totalRemainingAmount: 0,
  });

  const [totalRecords, setTotalRecords] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(10);
  const [filters, setFilters] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState(null);
  const [sortDirection, setSortDirection] = useState("normal");

  const debounceTimeoutRef = useRef(null);
  const debounceColumnTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null);

  const cards = [
    {
      icon: "fa-solid fa-briefcase",
      title: "Total Value",
      key: "totalAmountWithTax",
      color: "primary",
    },
    {
      icon: "fa-solid fa-sack-dollar",
      title: "Project Value",
      key: "totalProjectValue",
      color: "info",
    },
    {
      icon: "fa-solid fa-wallet",
      title: "Client Received",
      key: "totalClientPayable",
      color: "success",
    },
    {
      icon: "fa-solid fa-money-check-dollar",
      title: "Developer Paid",
      key: "totalDeveloperPayable",
      color: "warning",
    },
    {
      icon: "fa-solid fa-scale-balanced",
      title: "Net Balance",
      key: "totalRemainingAmount",
      color: "danger",
    },
    {
      icon: "fas fa-plus-circle",
      title: "Add New",
      key: "addNew",
      color: "success",
    },
  ];

  const columnsWithDateFilter = ["projectDateFormatted", "createdDateTime"];

  useEffect(() => {
    document.title = "Project Management | MaxCode IT Services";

    const fetchPreference = async () => {
      try {
        const res = await apiGet(API_ENDPOINTS.USER_PREFERENCES.GET);
        if (typeof res.data?.projectManagementServerSide === "boolean") {
          setServerSide(res.data.projectManagementServerSide);
        }
      } catch (error) {
        console.error("Failed to fetch project preferences:", error);
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
          projectManagementServerSide: serverSide,
        });
      } catch (error) {
        console.error("Failed to save project preferences:", error);
      }
    };

    savePreference();
  }, [serverSide, prefLoading]);

  useEffect(() => {
    fetchFinancialYears();
    fetchClients();
    fetchStaff();
    loadAllProjectRecords();

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

  useEffect(() => {
    if (prefLoading) return;

    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);

    debounceTimeoutRef.current = setTimeout(
      () => {
        fetchProjects();
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
    prefLoading,
  ]);

  const loadAllProjectRecords = async (options = {}) => {
    try {
      const allData = await fetchAllPaginatedEntities({
        endpoint: API_ENDPOINTS.PROJECTS.LIST,
        fallbackKeys: ["projects"],
        ...options,
      });

      const normalized = allData
        .filter((record) => record?.isDeleted !== true)
        .map((record) => ({
          ...record,
          id: record._id || record.id,
        }));

      setAllProjectRecords(normalized);
    } catch (error) {
      console.error("Failed to fetch all projects:", error);
      setAllProjectRecords([]);
    }
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

  const fetchStaff = async () => {
    try {
      const response = await apiGet(API_ENDPOINTS.STAFF.LIST);
      const staffData = Array.isArray(response.data)
        ? response.data
        : response.data?.staff || [];

      const activeStaff = staffData
        .filter((staff) => staff?.isDeleted !== true)
        .map((staff) => ({
          ...staff,
          id: staff.id || staff._id,
        }));

      setStaffRecords(activeStaff);
    } catch (error) {
      console.error("Failed to fetch staff:", error);
      setStaffRecords([]);
    }
  };

  const fetchProjects = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (prefLoading) return;
    setLoading(true);

    try {
      let url = API_ENDPOINTS.PROJECTS.LIST;
      const params = new URLSearchParams();

      if (serverSide) {
        params.append("page", currentPage);
        params.append("limit", recordsPerPage);

        if (searchTerm) params.append("search", searchTerm);

        if (selectedFinancialYear && selectedFinancialYear !== "ALL") {
          params.append("financialYear", selectedFinancialYear);
        }

        Object.entries(filters).forEach(([key, value]) => {
          if (["sn", "action"].includes(key)) return;
          if (
            value === undefined ||
            value === null ||
            value === "" ||
            value === "All"
          )
            return;

          if (columnsWithDateFilter.includes(key)) {
            if (value && typeof value === "object") {
              if (value.startDate) {
                const backendKey =
                  key === "createdDateTime"
                    ? "createdAt"
                    : key === "projectDateFormatted"
                      ? "projectDate"
                      : key;
                params.append(`${backendKey}_start`, value.startDate);
              }
              if (value.endDate) {
                const backendKey =
                  key === "createdDateTime"
                    ? "createdAt"
                    : key === "projectDateFormatted"
                      ? "projectDate"
                      : key;
                params.append(`${backendKey}_end`, value.endDate);
              }
            }
          } else {
            if (Array.isArray(value) && value.length > 0) {
              params.append(key, value.join(","));
            } else if (!Array.isArray(value)) {
              params.append(key, value);
            }
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
      }

      const response = await apiGet(url, {
        signal: controller.signal,
      });

      let projectData;
      let total;

      if (serverSide) {
        projectData = response.data?.data || response.data?.projects || [];
        total =
          response.data?.pagination?.totalRecords ||
          response.data?.total ||
          projectData.length;

        if (response.data?.statistics) {
          setStatistics(response.data.statistics);
        }

        if (response.data?.filterOptions) {
          setDynamicFilterOptions(response.data.filterOptions);
        }
      } else {
        projectData =
          response.data?.data ||
          response.data?.projects ||
          (Array.isArray(response.data) ? response.data : []);
        total = projectData.length;
      }

      const normalized = projectData
        .filter((record) => record?.isDeleted !== true)
        .map((record) => ({
          ...record,
          id: record._id || record.id,
          createdDate: record.createdDate || record.createdAt,
          projectAgreementFileLink: record.projectAgreementFileURL || "",
          projectAgreementUrlLink:
            record.projectAgreementURL || record.agreementGoogleDriveLink || "",
        }));

      setRecords(normalized);
      setTotalRecords(total);

      if (!serverSide) {
        updateStatistics(normalized);
      }
    } catch (error) {
      if (error.name === "CanceledError" || error.name === "AbortError") {
        return;
      }

      console.error("Failed to fetch projects:", error);
      showError("Failed to fetch projects");
      setRecords([]);
      setTotalRecords(0);
      updateStatistics([]);
    } finally {
      setLoading(false);
    }
  };

  const updateStatistics = (data) => {
    const selectedRange =
      selectedFinancialYear && selectedFinancialYear !== "ALL"
        ? financialYears.find((year) => year.value === selectedFinancialYear)
        : null;

    const startDate = getDateOnly(selectedRange?.startDate);
    const endDate = getDateOnly(selectedRange?.endDate);

    const sourceData = Array.isArray(data) ? data : [];

    const fyData = sourceData.filter((record) => {
      if (!startDate || !endDate) return true;
      const projectDate = getDateOnly(record.projectDate || record.createdDate);
      if (!projectDate) return false;
      return projectDate >= startDate && projectDate <= endDate;
    });

    const stats = fyData.reduce(
      (acc, record) => {
        const summary = record.summary || {};
        const totalProjectAmountWithoutTax = toNumber(
          summary.totalProjectAmountWithoutTax || record.projectTotalCost || 0,
        );
        const totalAmountWithTax = toNumber(
          summary.totalAmountWithTax ||
            totalProjectAmountWithoutTax +
              (totalProjectAmountWithoutTax *
                toNumber(summary.taxPercentage || 0)) /
                100,
        );

        acc.totalAmountWithTax += totalAmountWithTax;
        acc.totalProjectValue += totalProjectAmountWithoutTax;
        acc.totalDeveloperCost += toNumber(record.totalDeveloperCost || 0);
        acc.totalClientPayable += toNumber(summary.totalClientPayable || 0);
        acc.totalDeveloperPayable += toNumber(
          summary.totalDeveloperPayable || 0,
        );
        acc.totalRemainingAmount += toNumber(summary.remainingAmount || 0);

        return acc;
      },
      {
        totalAmountWithTax: 0,
        totalProjectValue: 0,
        totalDeveloperCost: 0,
        totalClientPayable: 0,
        totalDeveloperPayable: 0,
        totalRemainingAmount: 0,
      },
    );

    setStatistics(stats);
  };

  const formatCurrency = (value) =>
    toNumber(value).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const preparedData = useMemo(() => {
    return records.map((record, index) => {
      const paymentDetails = Array.isArray(record.paymentDetails)
        ? record.paymentDetails
        : [];
      const developerTransactions = Array.isArray(record.developerTransactions)
        ? record.developerTransactions
        : [];
      const totalProjectAmountWithoutTax = toNumber(
        record.summary?.totalProjectAmountWithoutTax ||
          record.projectTotalCost ||
          0,
      );
      const totalAmountWithTax = toNumber(
        record.summary?.totalAmountWithTax ||
          totalProjectAmountWithoutTax +
            (totalProjectAmountWithoutTax *
              toNumber(record.summary?.taxPercentage || 0)) /
              100,
      );
      const totalTaxAmount = Math.max(
        totalAmountWithTax - totalProjectAmountWithoutTax,
        0,
      );
      const totalDeveloperCost = toNumber(record.totalDeveloperCost || 0);

      return {
        ...record,
        sn: serverSide
          ? (currentPage - 1) * recordsPerPage + index + 1
          : index + 1,
        projectDateFormatted: formatDateForDisplay(record.projectDate),
        createdDateTime:
          record.createdDateTime ||
          formatDateTimeForDisplay(record.createdDate || record.createdAt),
        paymentCount: paymentDetails.length,
        payoutCount: developerTransactions.length,
        totalProjectAmountWithoutTax,
        totalAmountWithTax,
        totalTaxAmount,
        totalDeveloperCost,
        totalClientPayable: toNumber(record.summary?.totalClientPayable || 0),
        totalDeveloperPayable: toNumber(
          record.summary?.totalDeveloperPayable || 0,
        ),
        remainingAmount: toNumber(record.summary?.remainingAmount || 0),
        taxPercentage: toNumber(record.summary?.taxPercentage || 0),
      };
    });
  }, [records, serverSide, currentPage, recordsPerPage]);

  const tableData = useMemo(() => {
    let data = preparedData;

    if (!serverSide) {
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
        const yearRecord = financialYears.find(
          (year) => year.value === selectedFinancialYear,
        );

        if (yearRecord?.startDate && yearRecord?.endDate) {
          const startDate = getDateOnly(yearRecord.startDate);
          const endDate = getDateOnly(yearRecord.endDate);

          data = data.filter((record) => {
            const projectDate = getDateOnly(record.projectDate);
            if (!projectDate || !startDate || !endDate) return false;
            return projectDate >= startDate && projectDate <= endDate;
          });
        }
      }

      if (activeCardFilter === "totalAmountWithTax") {
        data = data.filter((row) => row.totalAmountWithTax > 0);
      } else if (activeCardFilter === "totalProjectValue") {
        data = data.filter((row) => row.totalProjectAmountWithoutTax > 0);
      } else if (activeCardFilter === "totalClientPayable") {
        data = data.filter((row) => row.totalClientPayable > 0);
      } else if (activeCardFilter === "totalDeveloperPayable") {
        data = data.filter((row) => row.totalDeveloperPayable > 0);
      } else if (activeCardFilter === "totalRemainingAmount") {
        data = data.filter((row) => row.remainingAmount !== 0);
      }
    }

    return data;
  }, [
    preparedData,
    serverSide,
    filters,
    selectedFinancialYear,
    financialYears,
    activeCardFilter,
  ]);

  const columns = [
    { key: "sn", label: "S.No", width: 70 },
    { key: "projectId", label: "Project ID", width: 130 },
    { key: "projectDateFormatted", label: "Project Date", width: 130 },
    { key: "projectName", label: "Project Name", width: 190 },
    { key: "projectDevelopmentTime", label: "Development Time", width: 160 },
    { key: "clientName", label: "Client Name", width: 150 },
    { key: "clientId", label: "Client ID", width: 120 },
    { key: "businessName", label: "Business Name", width: 180 },
    { key: "phoneNumber", label: "Phone Number", width: 130 },
    { key: "email", label: "Email", width: 220 },
    { key: "address", label: "Address", width: 250 },
    {
      key: "taxPercentage",
      label: "Tax (%)",
      width: 100,
      render: (value) => <span>{toNumber(value).toFixed(2)}%</span>,
    },
    {
      key: "paymentCount",
      label: "Payments",
      width: 100,
      render: (value) => <span className="badge bg-primary">{value}</span>,
    },
    {
      key: "payoutCount",
      label: "Payouts",
      width: 100,
      render: (value) => <span className="badge bg-warning">{value}</span>,
    },
    {
      key: "totalProjectAmountWithoutTax",
      label: "Total Without Tax",
      width: 160,
      render: (value) => (
        <span className="fw-bold text-secondary">
          ₹ {formatCurrency(value)}
        </span>
      ),
    },
    {
      key: "totalTaxAmount",
      label: "Total Tax",
      width: 140,
      render: (value) => (
        <span className="fw-bold text-danger">₹ {formatCurrency(value)}</span>
      ),
    },
    {
      key: "totalAmountWithTax",
      label: "Total with Tax",
      width: 140,
      render: (value) => (
        <span className="fw-bold text-primary">₹ {formatCurrency(value)}</span>
      ),
    },
    {
      key: "totalClientPayable",
      label: "Client Received",
      width: 140,
      render: (value) => (
        <span className="fw-bold text-success">₹ {formatCurrency(value)}</span>
      ),
    },
    {
      key: "totalDeveloperPayable",
      label: "Developer Paid",
      width: 150,
      render: (value) => (
        <span className="fw-bold text-warning">₹ {formatCurrency(value)}</span>
      ),
    },
    {
      key: "totalDeveloperCost",
      label: "Total Developer Cost",
      width: 170,
      render: (value) => (
        <span className="fw-bold text-dark">₹ {formatCurrency(value)}</span>
      ),
    },
    {
      key: "remainingAmount",
      label: "Net Balance",
      width: 140,
      render: (value) => (
        <span
          className={`fw-bold ${toNumber(value) < 0 ? "text-danger" : "text-success"}`}
        >
          ₹ {formatCurrency(value)}
        </span>
      ),
    },
    {
      key: "agreementFile",
      label: "Agreement File",
      width: 120,
      disableSort: true,
      disableFilter: true,
      render: (_, record) =>
        record.projectAgreementFileLink ? (
          <div onClick={(event) => event.stopPropagation()}>
            <UploadedFilePreviewBox
              fileUrl={record.projectAgreementFileLink}
              title="Open uploaded agreement file"
              iconClassName="fa-solid fa-file-contract"
            />
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            title="No uploaded agreement file"
            disabled
          >
            <i class="fa-solid fa-file-contract"></i>
          </button>
        ),
    },
    {
      key: "agreementLink",
      label: "Agreement Link",
      width: 120,
      disableSort: true,
      disableFilter: true,
      render: (_, record) =>
        record?.projectAgreementUrlLink ? (
          <button
            type="button"
            className="btn btn-sm btn-outline-info"
            onClick={(event) => {
              event.stopPropagation();
              window.open(
                record.projectAgreementUrlLink,
                "_blank",
                "noopener,noreferrer",
              );
            }}
            title="Open Google Drive link"
          >
            <i className="fab fa-google-drive"></i>
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            title="No Google Drive link"
            disabled
          >
            <i className="fab fa-google-drive"></i>
          </button>
        ),
    },
    { key: "createdDateTime", label: "Created Date & Time", width: 200 },
    { key: "action", label: "Actions", width: 170 },
  ];

  const fixedColumns = ["sn"];
  const defaultVisibleColumns = [
    "sn",
    "projectId",
    "projectDateFormatted",
    "clientName",
    "businessName",
    "totalProjectAmountWithoutTax",
    "action",
  ];

  const columnsWithDropdownFilter = [
    "businessName",
    "projectName",
    "taxPercentage",
  ];

  const getFilterOptions = () => {
    const options = {
      businessName: ["All"],
      projectName: ["All"],
      taxPercentage: ["All"],
    };

    if (serverSide && Object.keys(dynamicFilterOptions).length) {
      return {
        ...options,
        ...dynamicFilterOptions,
      };
    }

    if (records.length > 0) {
      const businessNames = [
        ...new Set(
          records.map((record) => record.businessName).filter(Boolean),
        ),
      ].sort();
      const projectNames = [
        ...new Set(records.map((record) => record.projectName).filter(Boolean)),
      ].sort();
      const taxPercentages = [
        ...new Set(
          records
            .map((record) =>
              String(toNumber(record.summary?.taxPercentage || 0)),
            )
            .filter(Boolean),
        ),
      ].sort((a, b) => Number(a) - Number(b));

      options.businessName = ["All", ...businessNames];
      options.projectName = ["All", ...projectNames];
      options.taxPercentage = ["All", ...taxPercentages];
    }

    return options;
  };

  const handleDebouncedColumnFilterChange = (key, value) => {
    if (serverSide) {
      if (debounceColumnTimeoutRef.current)
        clearTimeout(debounceColumnTimeoutRef.current);
      debounceColumnTimeoutRef.current = setTimeout(() => {
        setFilters((prev) => ({ ...prev, [key]: value }));
        setCurrentPage(1);
      }, 500);
    } else {
      setFilters((prev) => ({ ...prev, [key]: value }));
    }
  };

  const handleCardClick = async (cardKey) => {
    if (cardKey === "addNew") {
      if (!canCreate) {
        showError("You don't have permission to add projects");
        return;
      }
      await loadAllProjectRecords();
      setEditingRecord(null);
      setShowCreateProjectForm(true);
    } else {
      setActiveCardFilter(cardKey);
      if (serverSide) {
        setCurrentPage(1);
      }
    }
  };

  const getCardNumber = (index) => (index % 8) + 1;

  const getDefaultFinancialYearRecord = () => {
    return financialYears.find((year) => year?.isDefault === true) || null;
  };

  const handleFormSubmit = async (formData) => {
    try {
      const selectedClient = clients.find(
        (client) =>
          client.id == formData.clientRefId ||
          client._id == formData.clientRefId ||
          client.clientId == formData.clientRefId,
      );

      const payload = {
        ...formData,
        financialYear: formData.financialYear || selectedFinancialYear || "",
        clientName: selectedClient?.clientName || formData.clientName || "",
        clientId:
          selectedClient?.clientId ||
          selectedClient?.id ||
          selectedClient?._id ||
          formData.clientId ||
          "",
        businessName:
          selectedClient?.businessName || formData.businessName || "",
        gstin:
          selectedClient?.gstin && String(selectedClient.gstin).trim() !== ""
            ? selectedClient.gstin
            : formData.gstin || "Unregistered",
        phoneNumber: selectedClient?.phoneNumber || formData.phoneNumber || "",
        email: selectedClient?.email || formData.email || "",
        address: selectedClient?.address || formData.address || "",
        createdDate: editingRecord?.createdDate || new Date().toISOString(),
      };

      if (editingRecord && !editingRecord.isViewMode) {
        const projectId = editingRecord._id || editingRecord.id;
        await apiPut(API_ENDPOINTS.PROJECTS.UPDATE(projectId), payload);
        showSuccess("Project updated successfully!");
      } else {
        await apiPost(API_ENDPOINTS.PROJECTS.CREATE, payload);
        showSuccess("Project added successfully!");
      }

      await fetchProjects();
      await loadAllProjectRecords({ forceRefresh: true });
      setShowCreateProjectForm(false);
      setEditingRecord(null);
    } catch (error) {
      console.error("Error saving project:", error);
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to save project",
      );
      throw error;
    }
  };

  const handleEdit = async (record) => {
    await loadAllProjectRecords();
    setEditingRecord(record);
    setShowCreateProjectForm(true);
    showInfo(`Editing project: ${record.projectId}`);
  };

  const handleView = async (record) => {
    await loadAllProjectRecords();
    setEditingRecord({ ...record, isViewMode: true });
    setShowCreateProjectForm(true);
    showInfo(`Viewing project: ${record.projectId}`);
  };

  const handleDelete = async (id) => {
    try {
      await apiPut(API_ENDPOINTS.PROJECTS.UPDATE(id), {
        isDeleted: true,
        deletedAt: new Date().toISOString(),
      });
      await fetchProjects();
      await loadAllProjectRecords({ forceRefresh: true });
      showSuccess("Project deleted successfully!");
    } catch (error) {
      console.error("Error deleting project:", error);
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to delete project",
      );
    }
  };

  const handleRefresh = async () => {
    await Promise.all([
      fetchFinancialYears(),
      fetchStaff(),
      fetchClients({ forceRefresh: true }),
      loadAllProjectRecords({ forceRefresh: true }),
    ]);

    if (serverSide) {
      setFilters({});
      setSearchTerm("");
      setSortField(null);
      setSortDirection("normal");
      setCurrentPage(1);
      setActiveCardFilter("totalAmountWithTax");
    }

    await fetchProjects();
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

  return (
    <>
      <div className="container-fluid">
        <div
          className="py-3 d-flex justify-content-between align-items-center flex-wrap"
          style={{ marginTop: "70px" }}
        >
          <h4 className="fs-18 fw-semibold m-0">Project Management</h4>

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
                setActiveCardFilter("totalAmountWithTax");
              }}
              id="serverSideToggle"
            />
            <label className="form-check-label ms-2" htmlFor="serverSideToggle">
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
              activeCardFilter === card.key && card.key !== "addNew";
            const isAddNewDisabled = card.key === "addNew" && !canCreate;

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
                    <h5 className="mb-2 fw-bold">{card.title}</h5>
                    <h6 className="mb-0 text-muted fw-bold">
                      {card.key === "addNew"
                        ? "+ Add New"
                        : `₹ ${formatCurrency(statistics[card.key] || 0)}`}
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
          data={tableData}
          loading={loading}
          totalRecords={totalRecords}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onView={handleView}
          onRefresh={handleRefresh}
          showActions={true}
          actions={["view", "edit", "delete"]}
          fixedColumns={fixedColumns}
          defaultVisibleColumns={defaultVisibleColumns}
          columnsWithDropdownFilter={columnsWithDropdownFilter}
          columnsWithDateFilter={columnsWithDateFilter}
          filterOptions={serverSide ? dynamicFilterOptions : getFilterOptions()}
          tableTitle="Project Records"
          showColumnSelector={true}
          showExport={true}
          showRefresh={true}
          showAdvancedFilter={true}
          showSearch={true}
          exportFileName="Project_Management"
          exportTitle="Project Management Report"
          activeCardFilter={activeCardFilter}
          cards={cards}
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
          exportApi={API_ENDPOINTS.PROJECTS.LIST}
        />

        <CreateProject
          show={showCreateProjectForm}
          onClose={() => {
            setShowCreateProjectForm(false);
            setEditingRecord(null);
          }}
          onSubmit={handleFormSubmit}
          editingRecord={editingRecord}
          clients={clients}
          staffRecords={staffRecords}
          financialYears={financialYears}
          existingProjects={allProjectRecords}
          selectedFinancialYear={selectedFinancialYear}
          defaultFinancialYear={getDefaultFinancialYearRecord()}
        />
      </div>
    </>
  );
};

export default ProjectManagement;
