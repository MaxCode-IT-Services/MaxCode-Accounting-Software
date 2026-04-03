import React, { useEffect, useMemo, useRef, useState } from "react";
import ReusableTable from "../Components/ReusableTable";
import { showError, showInfo } from "../Components/ToastNotification";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { apiGet, apiPost } from "../utils/api";

const toNumber = (value) => {
  const number = parseFloat(value);
  return Number.isNaN(number) ? 0 : number;
};

const formatCurrency = (value) => {
  return `₹ ${toNumber(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatDateForDisplay = (dateString) => {
  if (!dateString) return "-";

  try {
    const date = new Date(dateString);
    if (!Number.isNaN(date.getTime())) {
      const day = String(date.getDate()).padStart(2, "0");
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    }
    return dateString;
  } catch (e) {
    return dateString;
  }
};

const getPeriodModeLabel = (mode) => {
  if (mode === "daily") return "Daily";
  if (mode === "monthly") return "Monthly";
  if (mode === "quarterly") return "Quarterly";
  if (mode === "halfYearly") return "Half Yearly";
  return "Yearly";
};

const DeveloperPayoutManagement = () => {
  useEffect(() => {
    document.title = "Developer Payout | MaxCode IT Services";
  }, []);

  const [serverSide, setServerSide] = useState(true);
  const [prefLoading, setPrefLoading] = useState(true);
  const [dynamicFilterOptions, setDynamicFilterOptions] = useState({});

  const [financialYears, setFinancialYears] = useState([]);
  const [selectedFinancialYear, setSelectedFinancialYear] = useState(
    localStorage.getItem("selectedFinancialYear") || "ALL",
  );
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [financialPeriodMode, setFinancialPeriodMode] = useState("yearly");

  const [statistics, setStatistics] = useState({
    totalDevelopers: 0,
    totalProjects: 0,
    totalDeveloperCost: 0,
    totalPayout: 0,
    pendingPayout: 0,
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

  const fetchDeveloperPayouts = async () => {
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

      params.append("view", "developerPayouts");

      if (serverSide) {
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

        Object.entries(filters).forEach(([key, value]) => {
          if (["sn", "action"].includes(key)) return;
          if (
            value === undefined ||
            value === null ||
            value === "" ||
            value === "All"
          )
            return;

          if (key === "payoutDate") {
            if (value && typeof value === "object") {
              if (value.startDate) {
                params.append("payoutDate_start", value.startDate);
              }
              if (value.endDate) {
                params.append("payoutDate_end", value.endDate);
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
      } else {
        params.append("page", 1);
        params.append("limit", 5000);

        if (selectedFinancialYear && selectedFinancialYear !== "ALL") {
          params.append("financialYear", selectedFinancialYear);
        }

        if (financialPeriodMode && financialPeriodMode !== "yearly") {
          params.append("period", financialPeriodMode);
        }
      }

      url = `${url}?${params.toString()}`;

      const response = await apiGet(url, {
        signal: controller.signal,
      });

      const payoutData = response.data?.data || [];
      const normalizedRows = payoutData.map((row, index) => ({
        ...row,
        id: row.id || `${row.projectId || "project"}-${index + 1}`,
        payoutDate: formatDateForDisplay(row.payoutDate),
      }));

      setRecords(normalizedRows);
      setTotalRecords(
        response.data?.pagination?.totalRecords || normalizedRows.length,
      );

      if (response.data?.statistics) {
        setStatistics(response.data.statistics);
      } else {
        const uniqueDevelopers = new Set(
          normalizedRows
            .map((row) => String(row.developerName || "").trim())
            .filter((name) => name && name !== "-"),
        ).size;

        const uniqueProjects = new Set(
          normalizedRows.map((row) =>
            String(row.projectObjectId || row.projectId || ""),
          ),
        ).size;

        const totalPayout = normalizedRows.reduce(
          (sum, row) => sum + toNumber(row.payoutAmount || 0),
          0,
        );

        const totalDeveloperCost = normalizedRows.reduce(
          (sum, row) => sum + toNumber(row.totalDeveloperCost || 0),
          0,
        );

        setStatistics({
          totalDevelopers: uniqueDevelopers,
          totalProjects: uniqueProjects,
          totalDeveloperCost,
          totalPayout,
          pendingPayout: totalDeveloperCost - totalPayout,
        });
      }

      if (response.data?.filterOptions) {
        setDynamicFilterOptions(response.data.filterOptions);
      }
    } catch (error) {
      if (error.name === "CanceledError" || error.name === "AbortError") {
        return;
      }

      console.error("Failed to load developer payout data:", error);
      showError("Failed to fetch developer payout data");
      setRecords([]);
      setTotalRecords(0);
      setStatistics({
        totalDevelopers: 0,
        totalProjects: 0,
        totalDeveloperCost: 0,
        totalPayout: 0,
        pendingPayout: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchPreference = async () => {
      try {
        const res = await apiGet(API_ENDPOINTS.USER_PREFERENCES.GET);
        if (
          typeof res.data?.developerPayoutManagementServerSide === "boolean"
        ) {
          setServerSide(res.data.developerPayoutManagementServerSide);
        }
      } catch (error) {
        console.error("Failed to fetch payout preferences:", error);
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
          developerPayoutManagementServerSide: serverSide,
        });
      } catch (error) {
        console.error("Failed to save payout preferences:", error);
      }
    };

    savePreference();
  }, [serverSide, prefLoading]);

  useEffect(() => {
    fetchFinancialYears();

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
        fetchDeveloperPayouts();
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
    selectedFinancialYear,
    financialPeriodMode,
    prefLoading,
  ]);

  const tableData = useMemo(() => {
    return records.map((row, index) => ({
      ...row,
      sn: serverSide
        ? (currentPage - 1) * recordsPerPage + index + 1
        : index + 1,
    }));
  }, [records, serverSide, currentPage, recordsPerPage]);

  const cards = [
    {
      key: "totalDevelopers",
      title: "Total Developer",
      value: String(statistics.totalDevelopers || 0),
      icon: "fa-solid fa-user-tie",
    },
    {
      key: "totalProjects",
      title: "Total Project",
      value: String(statistics.totalProjects || 0),
      icon: "fa-solid fa-diagram-project",
    },
    {
      key: "totalDeveloperCost",
      title: "Total Cost",
      value: formatCurrency(statistics.totalDeveloperCost || 0),
      icon: "fa-solid fa-file-invoice-dollar",
    },
    {
      key: "totalPayout",
      title: "Total Payout",
      value: formatCurrency(statistics.totalPayout || 0),
      icon: "fa-solid fa-money-check-dollar",
    },
    {
      key: "pendingPayout",
      title: "Pending Payout",
      value: formatCurrency(statistics.pendingPayout || 0),
      icon: "fa-solid fa-clock",
    },
    {
      key: "period",
      title: "Financial Period",
      value: `${selectedFinancialYear === "ALL" ? "All Year" : selectedFinancialYear} • ${getPeriodModeLabel(financialPeriodMode)}`,
      icon: "fa-regular fa-calendar-days",
    },
  ];

  const handleCardClick = (cardKey) => {
    if (cardKey !== "period") return;

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
      return periodCycle[(currentIndex + 1) % periodCycle.length];
    });

    if (serverSide) {
      setCurrentPage(1);
    }
  };

  const columns = [
    { key: "sn", label: "S.N", width: 70 },
    { key: "developerName", label: "Developer Name", width: 190 },
    { key: "phoneNumber", label: "Phone Number", width: 140 },
    { key: "projectName", label: "Project Name", width: 220 },
    { key: "payoutDate", label: "Payout Date", width: 130 },
    { key: "payoutMethod", label: "Payout Method", width: 150 },
    {
      key: "payoutAmount",
      label: "Payout Amount",
      width: 150,
      render: (value) => (
        <span className="fw-semibold text-success">
          {formatCurrency(value)}
        </span>
      ),
    },
    { key: "description", label: "Description", width: 260 },
  ];

  const handleRefresh = async () => {
    await fetchFinancialYears();

    if (serverSide) {
      setFilters({});
      setSearchTerm("");
      setSortField(null);
      setSortDirection("normal");
      setCurrentPage(1);
    }

    await fetchDeveloperPayouts();
    showInfo("Developer payout data refreshed!");
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

  const getCardNumber = (index) => (index % 8) + 1;

  return (
    <div className="container-fluid">
      <div
        className="py-3 d-flex justify-content-between align-items-center flex-wrap"
        style={{ marginTop: "70px" }}
      >
        <div>
          <h4 className="fs-18 fw-semibold m-0">Developer Payout Management</h4>
        </div>

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
            }}
            id="developerPayoutServerSideToggle"
          />
          <label
            className="form-check-label ms-2"
            htmlFor="developerPayoutServerSideToggle"
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

          return (
            <div key={card.key} className="col-md-6 col-xl-2 mb-4">
              <div
                className={`card border-0 shadow-sm overflow-hidden ${cardClass}`}
                style={{
                  transition: "all 0.3s ease",
                  cursor: card.key === "period" ? "pointer" : "default",
                  height: "100%",
                  borderRadius: "12px",
                  border: "1px solid #dee2e6",
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
                      {card.value}
                    </h6>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <ReusableTable
          ensureCreatedByColumn={true}
          createdByLabel="Created By"
        moduleKey="developerPayoutManagement"
        columns={columns}
        data={tableData}
        loading={loading}
        totalRecords={totalRecords}
        showActions={false}
        fixedColumns={["sn"]}
        defaultVisibleColumns={[
          "sn",
          "developerName",
          "phoneNumber",
          "projectName",
          "payoutDate",
          "payoutAmount",
        ]}
        columnsWithDropdownFilter={[
          "developerName",
          "payoutMethod",
          "projectName",
        ]}
        columnsWithDateFilter={["payoutDate"]}
        filterOptions={
          serverSide
            ? dynamicFilterOptions
            : {
                developerName: [
                  "All",
                  ...[
                    ...new Set(
                      records.map((row) => row.developerName).filter(Boolean),
                    ),
                  ].sort(),
                ],
                payoutMethod: [
                  "All",
                  ...[
                    ...new Set(
                      records.map((row) => row.payoutMethod).filter(Boolean),
                    ),
                  ].sort(),
                ],
                projectName: [
                  "All",
                  ...[
                    ...new Set(
                      records.map((row) => row.projectName).filter(Boolean),
                    ),
                  ].sort(),
                ],
              }
        }
        tableTitle="Developer Payout Records"
        showColumnSelector={true}
        showExport={true}
        showRefresh={true}
        showAdvancedFilter={true}
        showSearch={true}
        onRefresh={handleRefresh}
        exportFileName="Developer_Payout"
        exportTitle="Developer Payout Report"
        serverSide={serverSide}
        onServerSideSearch={handleServerSideSearch}
        onServerSideFilter={handleServerSideFilter}
        onServerSideSort={handleServerSideSort}
        onServerSidePageChange={handleServerSidePageChange}
        onServerSideRecordsPerPageChange={handleServerSideRecordsPerPageChange}
        currentPage={currentPage}
        recordsPerPage={recordsPerPage}
        onPageChange={setCurrentPage}
        onRecordsPerPageChange={setRecordsPerPage}
        onColumnFilterChange={handleDebouncedColumnFilterChange}
        exportApi={`${API_ENDPOINTS.PROJECTS.LIST}?view=developerPayouts`}
      />
    </div>
  );
};

export default DeveloperPayoutManagement;
