import React, { useEffect, useMemo, useRef, useState } from "react";
import ReusableTable from "../Components/ReusableTable";
import CreateCredentials from "../Components/CreateCredentials";
import OtpAccessModal from "../Components/OtpAccessModal";
import ConfirmationModal from "../Components/ConfirmationModal";
import {
  showInfo,
  showSuccess,
  showError,
} from "../Components/ToastNotification";
import { apiDelete, apiGet, apiPost, apiPut } from "../utils/api";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { hasActionPermission } from "../utils/permissions";
import { fetchSelectableClients } from "../utils/fetchAllEntities";

const CARD_FILTERS = {
  total: () => true,
  withWebsite: (record) =>
    Boolean(
      String(record.websiteGithubRepoName || "").trim() ||
      String(record.websiteGithubUrl || "").trim() ||
      String(record.websiteLink || "").trim(),
    ),
  withApp: (record) =>
    Boolean(
      String(record.appGithubRepoName || "").trim() ||
      String(record.appGithubUrl || "").trim() ||
      String(record.androidAppLink || "").trim() ||
      String(record.iosRepoName || "").trim() ||
      String(record.iosRepoUrl || "").trim() ||
      String(record.iosAppLink || "").trim(),
    ),
  withServer: (record) =>
    Boolean(
      String(record.serverName || "").trim() ||
      String(record.serverRootUsername || record.serverUsername || "").trim() ||
      String(record.serverRootPassword || record.serverPassword || "").trim() ||
      String(record.serverPortNumber || "").trim(),
    ),
  withDatabase: (record) =>
    Boolean(
      String(record.databaseName || "").trim() ||
      String(record.databaseRootUsername || record.databaseId || "").trim() ||
      String(
        record.databaseRootPassword || record.databasePassword || "",
      ).trim() ||
      String(record.databasePortNumber || "").trim(),
    ),
};

const DATE_FILTER_COLUMNS = ["createdDateTime"];

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
  } catch (error) {
    return dateString;
  }
};

const ProjectCredentials = () => {
  const moduleKey = "projectCredentials";
  const canCreate = hasActionPermission(moduleKey, "create");

  const [serverSide, setServerSide] = useState(true);
  const [prefLoading, setPrefLoading] = useState(true);
  const [businessSettings, setBusinessSettings] = useState({});
  const [records, setRecords] = useState([]);
  const [allClientSideRecords, setAllClientSideRecords] = useState([]);
  const [clientOptions, setClientOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [activeCardFilter, setActiveCardFilter] = useState("total");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState(null);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [pendingAccessContext, setPendingAccessContext] = useState(null);
  const [otpGrants, setOtpGrants] = useState({});

  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(10);
  const [filters, setFilters] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState(null);
  const [sortDirection, setSortDirection] = useState("normal");
  const [dynamicFilterOptions, setDynamicFilterOptions] = useState({});
  const [statistics, setStatistics] = useState({
    total: 0,
    withWebsite: 0,
    withApp: 0,
    withServer: 0,
    withDatabase: 0,
  });

  const debounceTimeoutRef = useRef(null);
  const debounceColumnTimeoutRef = useRef(null);

  useEffect(() => {
    document.title = "Project Credentials | MaxCode IT Services";
    fetchClients();
    fetchPreference();
    fetchBusinessSettings();
  }, []);

  const fetchBusinessSettings = async () => {
    try {
      const response = await apiGet(API_ENDPOINTS.BUSINESS_SETTINGS.GET);
      if (response?.data) {
        setBusinessSettings(response.data);
      }
    } catch (error) {
      // keep default empty state
    }
  };

  const fetchPreference = async () => {
    try {
      const response = await apiGet(API_ENDPOINTS.USER_PREFERENCES.GET);
      if (typeof response.data?.projectCredentialsServerSide === "boolean") {
        setServerSide(response.data.projectCredentialsServerSide);
      }
    } catch (error) {
      // keep default
    } finally {
      setPrefLoading(false);
    }
  };

  useEffect(() => {
    if (prefLoading) return;

    const savePreference = async () => {
      try {
        await apiPost(API_ENDPOINTS.USER_PREFERENCES.UPDATE, {
          projectCredentialsServerSide: serverSide,
        });
      } catch (error) {
        // ignore preference save failure
      }
    };

    savePreference();
  }, [serverSide, prefLoading]);

  const fetchClients = async () => {
    try {
      const clientsData = await fetchSelectableClients({ limit: 50 });

      const mapped = clientsData
        .filter((item) => item?.isDeleted !== true)
        .map((client) => ({
          value: client._id || client.id || client.clientId,
          label: `${client.clientName || ""} - ${client.businessName || ""}`,
          clientName: client.clientName || "",
          businessName: client.businessName || "",
          phoneNumber: client.phoneNumber || client.whatsappNumber || "",
        }));

      setClientOptions(mapped);
    } catch (error) {
      console.error("Failed to fetch clients:", error);
      showError("Unable to fetch client list");
      setClientOptions([]);
    }
  };

  const buildLocalStatistics = (source = []) => ({
    total: source.length,
    withWebsite: source.filter(CARD_FILTERS.withWebsite).length,
    withApp: source.filter(CARD_FILTERS.withApp).length,
    withServer: source.filter(CARD_FILTERS.withServer).length,
    withDatabase: source.filter(CARD_FILTERS.withDatabase).length,
  });

  const buildLocalFilterOptions = (source = []) => {
    const clientName = [
      ...new Set(
        source
          .map((record) => record.clientName)
          .filter((value) => Boolean(String(value || "").trim())),
      ),
    ].sort();

    return {
      clientName: ["All", ...clientName],
    };
  };

  const applyClientSideQuery = (source) => {
    let processed = [...source];

    if (searchTerm.trim()) {
      const lowered = searchTerm.toLowerCase();
      processed = processed.filter((record) =>
        [
          record.clientName,
          record.businessName,
          record.projectName,
          record.websiteGithubRepoName,
          record.websiteGithubUrl,
          record.websiteLink,
          record.appGithubRepoName,
          record.appGithubUrl,
          record.androidAppLink,
          record.iosRepoName,
          record.iosRepoUrl,
          record.iosAppLink,
          record.serverName,
          record.serverPortNumber,
          record.serverRootUsername || record.serverUsername,
          record.databaseName,
          record.databasePortNumber,
          record.databaseRootUsername || record.databaseId,
          record.appUsername,
        ]
          .join(" ")
          .toLowerCase()
          .includes(lowered),
      );
    }

    Object.entries(filters).forEach(([key, value]) => {
      if (
        value === undefined ||
        value === null ||
        value === "" ||
        value === "All"
      )
        return;

      processed = processed.filter((row) =>
        String(row[key] || "")
          .toLowerCase()
          .includes(String(value).toLowerCase()),
      );
    });

    if (
      activeCardFilter &&
      activeCardFilter !== "total" &&
      CARD_FILTERS[activeCardFilter]
    ) {
      processed = processed.filter(CARD_FILTERS[activeCardFilter]);
    }

    if (sortField && sortDirection !== "normal") {
      processed.sort((a, b) => {
        const aVal = String(a[sortField] || "").toLowerCase();
        const bVal = String(b[sortField] || "").toLowerCase();

        if (aVal < bVal) return sortDirection === "ascending" ? -1 : 1;
        if (aVal > bVal) return sortDirection === "ascending" ? 1 : -1;
        return 0;
      });
    }

    const start = (currentPage - 1) * recordsPerPage;
    const paged = processed.slice(start, start + recordsPerPage);

    return {
      paged,
      total: processed.length,
    };
  };

  const fetchCredentials = async () => {
    if (prefLoading) return;

    setLoading(true);
    try {
      if (serverSide) {
        const params = new URLSearchParams();
        params.append("page", currentPage);
        params.append("limit", recordsPerPage);

        if (searchTerm) params.append("search", searchTerm);

        Object.entries(filters).forEach(([key, value]) => {
          if (
            value === undefined ||
            value === null ||
            value === "" ||
            value === "All"
          )
            return;

          if (
            DATE_FILTER_COLUMNS.includes(key) &&
            value &&
            typeof value === "object"
          ) {
            const backendKey = key === "createdDateTime" ? "createdAt" : key;
            if (value.startDate)
              params.append(`${backendKey}_start`, value.startDate);
            if (value.endDate)
              params.append(`${backendKey}_end`, value.endDate);
            return;
          }

          if (Array.isArray(value) && value.length > 0) {
            params.append(key, value.join(","));
          } else if (!Array.isArray(value)) {
            params.append(key, value);
          }
        });

        if (sortField && sortDirection !== "normal") {
          params.append(
            "sortBy",
            sortField === "createdDateTime" ? "createdAt" : sortField,
          );
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

        const response = await apiGet(
          `${API_ENDPOINTS.PROJECT_CREDENTIALS.LIST}?${params.toString()}`,
        );

        const data = response.data?.data || [];
        const total =
          response.data?.pagination?.totalRecords ||
          response.data?.total ||
          data.length;

        setRecords(
          data.map((record, index) => ({
            ...record,
            id: record._id || record.id,
            serverRootUsername:
              record.serverRootUsername || record.serverUsername || "",
            serverRootPassword:
              record.serverRootPassword || record.serverPassword || "",
            databaseRootUsername:
              record.databaseRootUsername || record.databaseId || "",
            databaseRootPassword:
              record.databaseRootPassword || record.databasePassword || "",
            createdDate:
              record.createdDate || record.createdAt || record.created_on,
            sn: (currentPage - 1) * recordsPerPage + index + 1,
          })),
        );
        setTotalRecords(total);
        setStatistics(response.data?.statistics || buildLocalStatistics(data));
        setDynamicFilterOptions(
          response.data?.filterOptions || buildLocalFilterOptions(data),
        );
        return;
      }

      const response = await apiGet(
        `${API_ENDPOINTS.PROJECT_CREDENTIALS.LIST}?page=${currentPage}&limit=${recordsPerPage}`,
      );
      const source = (response.data?.data || []).map((record) => ({
        ...record,
        id: record._id || record.id,
        serverRootUsername:
          record.serverRootUsername || record.serverUsername || "",
        serverRootPassword:
          record.serverRootPassword || record.serverPassword || "",
        databaseRootUsername:
          record.databaseRootUsername || record.databaseId || "",
        databaseRootPassword:
          record.databaseRootPassword || record.databasePassword || "",
        createdDate:
          record.createdDate || record.createdAt || record.created_on,
      }));

      setAllClientSideRecords(source);
      setStatistics(buildLocalStatistics(source));
      setDynamicFilterOptions(buildLocalFilterOptions(source));

      const { paged, total } = applyClientSideQuery(source);
      setRecords(
        paged.map((record, index) => ({
          ...record,
          sn: (currentPage - 1) * recordsPerPage + index + 1,
        })),
      );
      setTotalRecords(total);
    } catch (error) {
      console.error("Failed to fetch project credentials:", error);
      showError("Failed to load project credentials");
      setRecords([]);
      setAllClientSideRecords([]);
      setTotalRecords(0);
      setStatistics({
        total: 0,
        withWebsite: 0,
        withApp: 0,
        withServer: 0,
        withDatabase: 0,
      });
      setDynamicFilterOptions({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);

    debounceTimeoutRef.current = setTimeout(
      () => {
        fetchCredentials();
      },
      serverSide ? 400 : 0,
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

  const cards = [
    {
      icon: "fa-solid fa-key",
      title: "Total Credentials",
      key: "total",
      count: statistics.total,
    },
    {
      icon: "fa-solid fa-globe",
      title: "With Website",
      key: "withWebsite",
      count: statistics.withWebsite,
    },
    {
      icon: "fa-solid fa-mobile-screen-button",
      title: "With App",
      key: "withApp",
      count: statistics.withApp,
    },
    {
      icon: "fa-solid fa-server",
      title: "With Server",
      key: "withServer",
      count: statistics.withServer,
    },
    {
      icon: "fa-solid fa-database",
      title: "With Database",
      key: "withDatabase",
      count: statistics.withDatabase,
    },
    {
      icon: "fas fa-plus-circle",
      title: "Add Credentials",
      key: "addNew",
    },
  ];

  const columns = [
    { key: "sn", label: "S.No", width: 70 },
    { key: "clientName", label: "Client Name", width: 170 },
    { key: "projectName", label: "Project Name", width: 180 },
    { key: "websiteGithubRepoName", label: "Website Repo", width: 180 },
    { key: "websiteGithubUrl", label: "Website URL", width: 220 },
    { key: "websiteLink", label: "Website Link", width: 220 },
    { key: "appGithubRepoName", label: "Android Repo Name", width: 180 },
    { key: "appGithubUrl", label: "Android Repo URL", width: 220 },
    { key: "androidAppLink", label: "Android App Link", width: 220 },
    { key: "iosRepoName", label: "IOS Repo Name", width: 180 },
    { key: "iosRepoUrl", label: "IOS Repo URL", width: 220 },
    { key: "iosAppLink", label: "IOS App Link", width: 220 },
    { key: "serverName", label: "Server Name", width: 150 },
    { key: "serverPortNumber", label: "Server Port Number", width: 150 },
    {
      key: "serverRootUsername",
      label: "Server Root UserName",
      width: 170,
    },
    { key: "databaseName", label: "Database Name", width: 160 },
    {
      key: "databasePortNumber",
      label: "Database Port Number",
      width: 160,
    },
    {
      key: "databaseRootUsername",
      label: "Database Root User Name",
      width: 190,
    },
    { key: "appUsername", label: "App User Name", width: 150 },
    { key: "createdDateTime", label: "Created Date & Time", width: 200 },
    { key: "action", label: "Actions", width: 140 },
  ];

  const handleCardClick = (cardKey) => {
    if (cardKey === "addNew") {
      if (!canCreate) {
        showError("You don't have permission to add credentials");
        return;
      }
      setEditingRecord(null);
      setShowCreateForm(true);
      return;
    }

    setActiveCardFilter(cardKey);
    setCurrentPage(1);
  };

  const handleFormSubmit = async (payload) => {
    try {
      const { id, _id, sn, ...body } = payload;

      if (id) {
        await apiPut(API_ENDPOINTS.PROJECT_CREDENTIALS.UPDATE(id), body);
        showSuccess("Credentials updated successfully!");
      } else {
        await apiPost(API_ENDPOINTS.PROJECT_CREDENTIALS.CREATE, body);
        showSuccess("Credentials saved successfully!");
      }

      setShowCreateForm(false);
      setEditingRecord(null);
      await fetchCredentials();
    } catch (error) {
      console.error("Error saving credentials:", error);
      showError(
        error.response?.data?.error ||
          error.response?.data?.message ||
          "Failed to save credentials",
      );
    }
  };

  const handleEdit = (record) => {
    const matchedClient = clientOptions.find(
      (item) => String(item.value || "") === String(record?.clientRefId || ""),
    );
    const otpRecord = {
      ...record,
      clientName: record?.clientName || matchedClient?.clientName || "",
      clientPhoneNumber:
        record?.clientPhoneNumber || matchedClient?.phoneNumber || "",
    };

    // Check if OTP is disabled
    if (businessSettings?.whatsappSettings?.disableOtpForCredentials === true) {
      setEditingRecord(otpRecord);
      setShowCreateForm(true);
      showInfo(`Editing credentials: ${record.projectName}`);
      return;
    }

    const recordId = String(record?.id || record?._id || "").trim();
    const grantKey = `${recordId}:edit`;
    const existingGrant = otpGrants[grantKey];

    if (
      existingGrant?.accessToken &&
      new Date(existingGrant.validUntil).getTime() > Date.now()
    ) {
      setEditingRecord({
        ...otpRecord,
        otpAccessGrantToken: existingGrant.accessToken,
      });
      setShowCreateForm(true);
      showInfo(`Editing credentials: ${record.projectName}`);
      return;
    }

    setPendingAccessContext({ record: otpRecord, operation: "edit" });
    setShowOtpModal(true);
  };

  const handleView = (record) => {
    const matchedClient = clientOptions.find(
      (item) => String(item.value || "") === String(record?.clientRefId || ""),
    );
    const otpRecord = {
      ...record,
      clientName: record?.clientName || matchedClient?.clientName || "",
      clientPhoneNumber:
        record?.clientPhoneNumber || matchedClient?.phoneNumber || "",
    };

    // Check if OTP is disabled
    if (businessSettings?.whatsappSettings?.disableOtpForCredentials === true) {
      setEditingRecord({
        ...otpRecord,
        isViewMode: true,
      });
      setShowCreateForm(true);
      showInfo(`Viewing credentials: ${record.projectName}`);
      return;
    }

    const recordId = String(record?.id || record?._id || "").trim();
    const grantKey = `${recordId}:view`;
    const existingGrant = otpGrants[grantKey];

    if (
      existingGrant?.accessToken &&
      new Date(existingGrant.validUntil).getTime() > Date.now()
    ) {
      setEditingRecord({
        ...otpRecord,
        isViewMode: true,
        otpAccessGrantToken: existingGrant.accessToken,
      });
      setShowCreateForm(true);
      showInfo(`Viewing credentials: ${record.projectName}`);
      return;
    }

    setPendingAccessContext({ record: otpRecord, operation: "view" });
    setShowOtpModal(true);
  };

  const handleOtpVerified = ({ accessToken, validUntil }) => {
    const operation = pendingAccessContext?.operation || "view";
    const record = pendingAccessContext?.record;
    const recordId = String(record?.id || record?._id || "").trim();
    if (!recordId || !accessToken) return;

    const grantKey = `${recordId}:${operation}`;
    setOtpGrants((prev) => ({
      ...prev,
      [grantKey]: {
        accessToken,
        validUntil,
      },
    }));

    if (operation === "edit") {
      setEditingRecord({ ...record, otpAccessGrantToken: accessToken });
      setShowCreateForm(true);
      showInfo(`Editing credentials: ${record.projectName}`);
    } else {
      setEditingRecord({
        ...record,
        isViewMode: true,
        otpAccessGrantToken: accessToken,
      });
      setShowCreateForm(true);
      showInfo(`Viewing credentials: ${record.projectName}`);
    }

    setPendingAccessContext(null);
    setShowOtpModal(false);
  };

  const handleDelete = (id) => {
    setRecordToDelete(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!recordToDelete) return;

    try {
      await apiDelete(API_ENDPOINTS.PROJECT_CREDENTIALS.DELETE(recordToDelete));
      showSuccess("Credentials deleted successfully!");
      setShowDeleteConfirm(false);
      setRecordToDelete(null);
      await fetchCredentials();
    } catch (error) {
      console.error("Error deleting credentials:", error);
      showError(
        error.response?.data?.error ||
          error.response?.data?.message ||
          "Failed to delete credentials",
      );
    }
  };

  const handleRefresh = () => {
    fetchCredentials();
    fetchClients();
    showInfo("Data refreshed!");
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
      return;
    }

    setFilters((prev) => ({ ...prev, [key]: value }));
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

  const getCardNumber = (index) => (index % 8) + 1;

  const preparedData = useMemo(() => {
    return records.map((record) => ({
      ...record,
      createdDateTime:
        record.createdDateTime || formatDateTimeForDisplay(record.createdDate),
    }));
  }, [records, allClientSideRecords]);

  return (
    <>
      <div className="container-fluid">
        <div
          className="py-3 d-flex justify-content-between align-items-center flex-wrap"
          style={{ marginTop: "70px" }}
        >
          <h4 className="fs-18 fw-semibold m-0">Project Credentials</h4>

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
              id="projectCredentialsServerSideToggle"
            />
            <label
              className="form-check-label ms-2"
              htmlFor="projectCredentialsServerSideToggle"
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
              activeCardFilter === card.key && card.key !== "addNew";
            const isAddNewDisabled = card.key === "addNew" && !canCreate;

            return (
              <div key={card.key} className="col-md-6 col-xl-2 mb-4">
                <div
                  className={`card border-0 shadow-sm overflow-hidden ${cardClass} ${isActive ? "border-primary" : ""}`}
                  style={{
                    transition: "all 0.3s ease",
                    cursor: isAddNewDisabled ? "not-allowed" : "pointer",
                    opacity: isAddNewDisabled ? 0.6 : 1,
                    height: "100%",
                    borderRadius: "12px",
                    border: isActive
                      ? "2px solid #0d6efd"
                      : "1px solid #dee2e6",
                  }}
                  onMouseEnter={(e) => {
                    if (
                      card.key === "addNew" ||
                      card.key === activeCardFilter
                    ) {
                      e.currentTarget.style.transform = "translateY(-5px)";
                      e.currentTarget.style.boxShadow =
                        "0 10px 20px rgba(0,0,0,0.1)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow =
                      "0 2px 4px rgba(0,0,0,0.1)";
                  }}
                  onClick={() => !isAddNewDisabled && handleCardClick(card.key)}
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
                    <h5 className="mb-2 fw-bold">{card.title}</h5>
                    <h6
                      className="mb-0 text-muted fs-6 fw-bold"
                      style={{ marginBottom: "-10px" }}
                    >
                      {card.key === "addNew" ? "+ Add New" : card.count}
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
          data={preparedData}
          loading={loading}
          totalRecords={totalRecords}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onView={handleView}
          onRefresh={handleRefresh}
          showActions={true}
          actions={["view", "edit", "delete"]}
          skipDeleteConfirmation={true}
          fixedColumns={["sn"]}
          defaultVisibleColumns={[
            "sn",
            "clientName",
            "projectName",
            "websiteGithubRepoName",
            "serverName",
            "createdDateTime",
            "action",
          ]}
          columnsWithDropdownFilter={["clientName"]}
          filterOptions={dynamicFilterOptions}
          activeCardFilter={activeCardFilter}
          cards={cards}
          tableTitle="Project Credentials Record"
          showColumnSelector={true}
          showExport={true}
          showRefresh={true}
          showAdvancedFilter={true}
          showSearch={true}
          exportFileName="Project_Credentials"
          exportTitle="Project Credentials Report"
          serverSide={serverSide}
          onServerSideSearch={handleServerSideSearch}
          onServerSideFilter={handleServerSideFilter}
          onServerSideSort={handleServerSideSort}
          onServerSidePageChange={setCurrentPage}
          onServerSideRecordsPerPageChange={(limit) => {
            setRecordsPerPage(limit);
            setCurrentPage(1);
          }}
          currentPage={currentPage}
          recordsPerPage={recordsPerPage}
          onPageChange={setCurrentPage}
          onRecordsPerPageChange={setRecordsPerPage}
          onColumnFilterChange={handleDebouncedColumnFilterChange}
          exportApi={API_ENDPOINTS.PROJECT_CREDENTIALS.LIST}
        />

        <CreateCredentials
          show={showCreateForm}
          onClose={() => {
            setShowCreateForm(false);
            setEditingRecord(null);
          }}
          onSubmit={handleFormSubmit}
          editingRecord={editingRecord}
          clientOptions={clientOptions}
        />

        <OtpAccessModal
          show={showOtpModal}
          onClose={() => {
            setShowOtpModal(false);
            setPendingAccessContext(null);
          }}
          operation={pendingAccessContext?.operation || "view"}
          credentialType="project-credentials"
          targetRecord={pendingAccessContext?.record}
          onVerified={handleOtpVerified}
        />

        <ConfirmationModal
          show={showDeleteConfirm}
          onHide={() => {
            setShowDeleteConfirm(false);
            setRecordToDelete(null);
          }}
          onConfirm={confirmDelete}
          title="Delete Credentials"
          message="Are you sure you want to delete this credential record?"
          confirmText="Delete"
          cancelText="Cancel"
          variant="danger"
        />
      </div>
    </>
  );
};

export default ProjectCredentials;
