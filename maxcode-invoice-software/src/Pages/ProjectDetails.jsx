import React, { useEffect, useMemo, useRef, useState } from "react";
import ReusableTable from "../Components/ReusableTable";
import { showError, showInfo } from "../Components/ToastNotification";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { apiGet, apiPost } from "../utils/api";

const toNumber = (value) => {
  const number = parseFloat(value);
  return Number.isNaN(number) ? 0 : number;
};

const formatDateForDisplay = (dateString) => {
  if (!dateString) return "-";

  try {
    const date = new Date(dateString);
    if (!Number.isNaN(date.getTime())) {
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

const formatCurrency = (value) => {
  return `₹ ${toNumber(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const getPeriodDisplay = (projectDate, mode) => {
  const date = projectDate ? new Date(projectDate) : null;
  if (!date || Number.isNaN(date.getTime())) return "-";

  if (mode === "daily") {
    return formatDateForDisplay(projectDate);
  }

  if (mode === "monthly") {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${month}/${date.getFullYear()}`;
  }

  if (mode === "quarterly") {
    const quarter = Math.floor(date.getMonth() / 3) + 1;
    return `Q${quarter} ${date.getFullYear()}`;
  }

  if (mode === "halfYearly") {
    const half = date.getMonth() < 6 ? "H1" : "H2";
    return `${half} ${date.getFullYear()}`;
  }

  return String(date.getFullYear());
};

const getPeriodModeLabel = (mode) => {
  if (mode === "daily") return "Daily";
  if (mode === "monthly") return "Monthly";
  if (mode === "quarterly") return "Quarterly";
  if (mode === "halfYearly") return "Half Yearly";
  return "Yearly";
};

const ProjectDetails = () => {
  useEffect(() => {
    document.title = "Project Details | MaxCode IT Services";
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

  const columnsWithDateFilter = ["projectDate", "createdDateTime"];

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

  const fetchProjectDetails = async () => {
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

          if (columnsWithDateFilter.includes(key)) {
            if (value && typeof value === "object") {
              if (value.startDate) {
                const backendKey =
                  key === "createdDateTime" ? "createdAt" : key;
                params.append(`${backendKey}_start`, value.startDate);
              }
              if (value.endDate) {
                const backendKey =
                  key === "createdDateTime" ? "createdAt" : key;
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

      console.error("Failed to load project details data:", error);
      showError("Failed to fetch project details data");
      setRecords([]);
      setTotalRecords(0);
      updateStatistics([]);
    } finally {
      setLoading(false);
    }
  };

  const updateStatistics = (projectRecords) => {
    const stats = projectRecords.reduce(
      (acc, record) => {
        const summary = record.summary || {};
        const totalAmountWithoutTax = toNumber(
          summary.totalProjectAmountWithoutTax || record.projectTotalCost || 0,
        );
        const totalAmountWithTax = toNumber(
          summary.totalAmountWithTax ||
            totalAmountWithoutTax +
              (totalAmountWithoutTax * toNumber(summary.taxPercentage || 0)) /
                100,
        );

        acc.totalAmountWithTax += totalAmountWithTax;
        acc.totalProjectValue += totalAmountWithoutTax;
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

  useEffect(() => {
    const fetchPreference = async () => {
      try {
        const res = await apiGet(API_ENDPOINTS.USER_PREFERENCES.GET);
        if (typeof res.data?.projectDetailsServerSide === "boolean") {
          setServerSide(res.data.projectDetailsServerSide);
        }
      } catch (error) {
        console.error("Failed to fetch project details preferences:", error);
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
          projectDetailsServerSide: serverSide,
        });
      } catch (error) {
        console.error("Failed to save project details preferences:", error);
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
        fetchProjectDetails();
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
    return records.map((record, index) => {
      const summary = record.summary || {};
      const totalAmountWithoutTax = toNumber(
        summary.totalProjectAmountWithoutTax || record.projectTotalCost || 0,
      );
      const totalAmountWithTax = toNumber(
        summary.totalAmountWithTax ||
          totalAmountWithoutTax +
            (totalAmountWithoutTax * toNumber(summary.taxPercentage || 0)) /
              100,
      );
      const totalClientReceived = toNumber(summary.totalClientPayable || 0);
      const totalDeveloperPaid = toNumber(summary.totalDeveloperPayable || 0);
      const remainingAmount = toNumber(summary.remainingAmount || 0);
      const taxAmount =
        totalAmountWithTax > 0
          ? Math.max(totalAmountWithTax - totalAmountWithoutTax, 0)
          : (totalAmountWithoutTax * toNumber(summary.taxPercentage || 0)) /
            100;

      return {
        id: record.id || `${record.projectId || "project"}-${index}`,
        sn: serverSide
          ? (currentPage - 1) * recordsPerPage + index + 1
          : index + 1,
        period: getPeriodDisplay(
          record.projectDate || record.createdDate,
          financialPeriodMode,
        ),
        projectId: record.projectId || "-",
        businessName: record.businessName || "-",
        projectName: record.projectName || "-",
        projectDate: formatDateForDisplay(
          record.projectDate || record.createdDate,
        ),
        createdDateTime: formatDateForDisplay(
          record.createdDate || record.createdAt,
        ),
        totalAmountWithoutTax,
        totalAmountWithTax,
        totalClientReceived,
        totalDeveloperPaid,
        remainingAmount,
        taxAmount,
      };
    });
  }, [records, serverSide, currentPage, recordsPerPage, financialPeriodMode]);

  const cards = [
    {
      key: "totalAmountWithTax",
      title: "Total With Tax",
      value: formatCurrency(statistics.totalAmountWithTax),
      icon: "fa-solid fa-diagram-project",
    },
    {
      key: "totalProjectValue",
      title: "Total Without Tax",
      value: formatCurrency(statistics.totalProjectValue),
      icon: "fa-solid fa-sack-dollar",
    },
    {
      key: "totalTaxAmount",
      title: "Tax Amount",
      value: formatCurrency(
        toNumber(statistics.totalAmountWithTax) -
          toNumber(statistics.totalProjectValue),
      ),
      icon: "fa-solid fa-receipt",
    },
    {
      key: "totalDeveloperPayable",
      title: "Developer Paid",
      value: formatCurrency(statistics.totalDeveloperPayable),
      icon: "fa-solid fa-money-check-dollar",
    },
    {
      key: "totalRemainingAmount",
      title: "Net Amount",
      value: formatCurrency(statistics.totalRemainingAmount),
      icon: "fa-solid fa-scale-balanced",
    },
    {
      key: "period",
      title: "Financial Period",
      value: `${selectedFinancialYear === "ALL" ? "All Year" : selectedFinancialYear} • ${getPeriodModeLabel(financialPeriodMode)}`,
      icon: "fa-regular fa-calendar-days",
    },
  ];

  const getCardNumber = (index) => {
    return (index % 8) + 1;
  };

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
    { key: "sn", label: "S.No", width: 70 },
    { key: "projectId", label: "Project ID", width: 130 },
    { key: "businessName", label: "Client Business Name", width: 220 },
    { key: "projectName", label: "Project Name", width: 200 },
    { key: "period", label: "Period", width: 120 },
    { key: "projectDate", label: "Project Date", width: 130 },
    {
      key: "totalAmountWithoutTax",
      label: "Project Total Without Tax",
      width: 200,
      render: (value) => (
        <span className="fw-semibold">{formatCurrency(value)}</span>
      ),
    },
    {
      key: "taxAmount",
      label: "Tax Amount",
      width: 140,
      render: (value) => (
        <span className="fw-semibold text-primary">
          {formatCurrency(value)}
        </span>
      ),
    },
    {
      key: "totalAmountWithTax",
      label: "Total With Tax",
      width: 180,
      render: (value) => (
        <span className="fw-semibold text-info">{formatCurrency(value)}</span>
      ),
    },
    {
      key: "totalClientReceived",
      label: "Client Received",
      width: 170,
      render: (value) => (
        <span className="fw-semibold text-success">
          {formatCurrency(value)}
        </span>
      ),
    },
    {
      key: "totalDeveloperPaid",
      label: "Developer Paid",
      width: 180,
      render: (value) => (
        <span className="fw-semibold text-warning">
          {formatCurrency(value)}
        </span>
      ),
    },
    {
      key: "remainingAmount",
      label: "Remaining",
      width: 170,
      render: (value) => (
        <span
          className={`fw-semibold ${toNumber(value) < 0 ? "text-danger" : "text-success"}`}
        >
          {formatCurrency(value)}
        </span>
      ),
    },
  ];

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

  const handleRefresh = async () => {
    await fetchFinancialYears();

    if (serverSide) {
      setFilters({});
      setSearchTerm("");
      setSortField(null);
      setSortDirection("normal");
      setCurrentPage(1);
    }

    await fetchProjectDetails();
    showInfo("Project details refreshed!");
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
    <div className="container-fluid">
      <div
        className="py-3 d-flex justify-content-between align-items-center flex-wrap"
        style={{ marginTop: "70px" }}
      >
        <div>
          <h4 className="fs-18 fw-semibold m-0">Project Details</h4>
          <small className="text-muted">
            Project-wise payable, payout and tax details
          </small>
        </div>

        <div className="d-flex align-items-center gap-3 flex-wrap">
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
              id="projectDetailsServerSideToggle"
            />
            <label
              className="form-check-label ms-2"
              htmlFor="projectDetailsServerSideToggle"
            >
              Server-side Mode {serverSide ? "(Enabled)" : "(Disabled)"}
            </label>
          </div>
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
        moduleKey="projectDetails"
        columns={columns}
        data={tableData}
        loading={loading}
        totalRecords={totalRecords}
        showActions={false}
        fixedColumns={["sn"]}
        defaultVisibleColumns={[
          "sn",
          "projectId",
          "businessName",
          "projectName",
          "taxAmount",
          "totalAmountWithTax",
        ]}
        columnsWithDropdownFilter={["businessName", "projectName"]}
        columnsWithDateFilter={columnsWithDateFilter}
        filterOptions={
          serverSide
            ? dynamicFilterOptions
            : {
                businessName: [
                  "All",
                  ...[
                    ...new Set(
                      records.map((row) => row.businessName).filter(Boolean),
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
        tableTitle="Project Details"
        showColumnSelector={true}
        showExport={true}
        showRefresh={true}
        showAdvancedFilter={true}
        showSearch={true}
        onRefresh={handleRefresh}
        exportFileName="Project_Details"
        exportTitle="Project Details Report"
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
        exportApi={API_ENDPOINTS.PROJECTS.LIST}
      />
    </div>
  );
};

export default ProjectDetails;
