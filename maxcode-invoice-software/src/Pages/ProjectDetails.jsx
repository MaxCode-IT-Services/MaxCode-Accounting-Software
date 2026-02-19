import React, { useEffect, useMemo, useState } from "react";
import ReusableTable from "../Components/ReusableTable";
import { showError, showInfo } from "../Components/ToastNotification";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { apiGet } from "../utils/api";

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
      return `${day}/${month}/${year}`;
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

const formatCurrency = (value) => {
  return `₹ ${toNumber(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const getPeriodDisplay = (projectDate, mode) => {
  const date = getDateOnly(projectDate);
  if (!date) return "-";

  if (mode === "daily") {
    return formatDateForDisplay(projectDate);
  }

  if (mode === "monthly") {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${month}/${date.getFullYear()}`;
  }

  return String(date.getFullYear());
};

const ProjectDetails = () => {
  useEffect(() => {
    document.title = "Project Details | MaxCode IT Services";
  }, []);

  const [financialYears, setFinancialYears] = useState([]);
  const [selectedFinancialYear, setSelectedFinancialYear] = useState(
    localStorage.getItem("selectedFinancialYear") || "ALL",
  );
  const [allRecords, setAllRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [financialPeriodMode, setFinancialPeriodMode] = useState("yearly");

  const getSelectedYearRange = () => {
    if (!selectedFinancialYear || selectedFinancialYear === "ALL") {
      return null;
    }

    const matchedYear = financialYears.find(
      (year) => year.value === selectedFinancialYear,
    );

    if (!matchedYear?.startDate || !matchedYear?.endDate) {
      return null;
    }

    const startDate = getDateOnly(matchedYear.startDate);
    const endDate = getDateOnly(matchedYear.endDate);
    if (!startDate || !endDate) return null;

    return { startDate, endDate };
  };

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [yearsResult, projectsResult] = await Promise.allSettled([
        apiGet(API_ENDPOINTS.YEARS.LIST),
        apiGet(API_ENDPOINTS.PROJECTS.LIST),
      ]);

      const yearsData =
        yearsResult.status === "fulfilled"
          ? Array.isArray(yearsResult.value.data)
            ? yearsResult.value.data
            : yearsResult.value.data?.years || []
          : [];

      const normalizedYears = yearsData
        .filter((yearRecord) => yearRecord?.isDeleted !== true)
        .map((yearRecord) => ({
          ...yearRecord,
          id: yearRecord.id || yearRecord._id,
          value: yearRecord.financialYear || yearRecord.year,
        }));

      const projectsData =
        projectsResult.status === "fulfilled"
          ? Array.isArray(projectsResult.value.data)
            ? projectsResult.value.data
            : projectsResult.value.data?.projects || []
          : [];

      setFinancialYears(normalizedYears);
      setAllRecords(
        projectsData.map((record) => ({
          ...record,
          id: record._id || record.id,
        })),
      );

      if (
        yearsResult.status === "rejected" ||
        projectsResult.status === "rejected"
      ) {
        showInfo(
          "Some project details data could not be loaded. Please refresh.",
        );
      }
    } catch (error) {
      console.error("Failed to load project details data:", error);
      showError("Failed to fetch project details data");
      setFinancialYears([]);
      setAllRecords([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();

    const handleFinancialYearSelectionChanged = (event) => {
      const selectedYear =
        event?.detail?.selectedFinancialYear ||
        localStorage.getItem("selectedFinancialYear") ||
        "ALL";
      setSelectedFinancialYear(selectedYear);
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
  }, []);

  const filteredRecords = useMemo(() => {
    const selectedRange = getSelectedYearRange();
    const today = getDateOnly(new Date());

    return allRecords.filter((record) => {
      const projectDate = getDateOnly(record.projectDate || record.createdDate);
      if (!projectDate) return false;

      if (selectedRange) {
        const isWithinYear =
          projectDate >= selectedRange.startDate &&
          projectDate <= selectedRange.endDate;
        if (!isWithinYear) return false;
      }

      if (financialPeriodMode === "daily") {
        if (!today || projectDate.getTime() !== today.getTime()) return false;
      } else if (financialPeriodMode === "monthly") {
        if (
          !today ||
          projectDate.getFullYear() !== today.getFullYear() ||
          projectDate.getMonth() !== today.getMonth()
        ) {
          return false;
        }
      }

      return true;
    });
  }, [allRecords, selectedFinancialYear, financialYears, financialPeriodMode]);

  const tableData = useMemo(() => {
    return filteredRecords.map((record, index) => {
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
        sn: index + 1,
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
        totalAmountWithoutTax,
        totalAmountWithTax,
        totalClientReceived,
        totalDeveloperPaid,
        remainingAmount,
        taxAmount,
      };
    });
  }, [filteredRecords, financialPeriodMode]);

  const summaryCards = useMemo(() => {
    return filteredRecords.reduce(
      (acc, record) => {
        const summary = record.summary || {};
        const totalAmountWithoutTax = toNumber(
          summary.totalProjectAmountWithoutTax || record.projectTotalCost || 0,
        );
        const totalDeveloperPaid = toNumber(summary.totalDeveloperPayable || 0);
        const remainingAmount = toNumber(summary.remainingAmount || 0);
        const totalAmountWithTax = toNumber(summary.totalAmountWithTax || 0);
        const taxAmount =
          totalAmountWithTax > 0
            ? Math.max(totalAmountWithTax - totalAmountWithoutTax, 0)
            : (totalAmountWithoutTax * toNumber(summary.taxPercentage || 0)) /
              100;

        acc.totalAmountWithTax += totalAmountWithTax;
        acc.totalAmountWithoutTax += totalAmountWithoutTax;
        acc.totalDeveloperPaid += totalDeveloperPaid;
        acc.totalRemainingAmount += remainingAmount;
        acc.totalTaxAmount += taxAmount;

        return acc;
      },
      {
        totalAmountWithTax: 0,
        totalAmountWithoutTax: 0,
        totalDeveloperPaid: 0,
        totalRemainingAmount: 0,
        totalTaxAmount: 0,
      },
    );
  }, [filteredRecords]);

  const cards = [
    {
      key: "totalAmountWithTax",
      title: "Total With Tax",
      value: formatCurrency(summaryCards.totalAmountWithTax),
      icon: "fa-solid fa-diagram-project",
    },
    {
      key: "totalAmountWithoutTax",
      title: "Total Without Tax",
      value: formatCurrency(summaryCards.totalAmountWithoutTax),
      icon: "fa-solid fa-sack-dollar",
    },
    {
      key: "totalTaxAmount",
      title: "Tax Amount",
      value: formatCurrency(summaryCards.totalTaxAmount),
      icon: "fa-solid fa-receipt",
    },
    {
      key: "totalDeveloperPaid",
      title: "Developer Paid",
      value: formatCurrency(summaryCards.totalDeveloperPaid),
      icon: "fa-solid fa-money-check-dollar",
    },
    {
      key: "totalRemainingAmount",
      title: "Net Amount",
      value: formatCurrency(summaryCards.totalRemainingAmount),
      icon: "fa-solid fa-scale-balanced",
    },
    {
      key: "period",
      title: "Financial Period",
      value: `${financialPeriodMode.charAt(0).toUpperCase()}${financialPeriodMode.slice(1)}`,
      icon: "fa-regular fa-calendar-days",
    },
  ];

  const getCardNumber = (index) => {
    return (index % 8) + 1;
  };

  const handleCardClick = (cardKey) => {
    if (cardKey !== "period") return;

    const periodCycle = ["daily", "monthly", "yearly"];
    setFinancialPeriodMode((prev) => {
      const currentIndex = periodCycle.indexOf(prev);
      if (currentIndex === -1) return "daily";
      return periodCycle[(currentIndex + 1) % periodCycle.length];
    });
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

  const handleRefresh = async () => {
    await loadAllData();
    showInfo("Project details refreshed!");
  };

  return (
    <div className="container-fluid">
      <div
        className="py-3 d-flex align-items-sm-center flex-sm-row flex-column"
        style={{ marginTop: "70px" }}
      >
        <div className="flex-grow-1">
          <h4 className="fs-18 fw-semibold m-0">Project Details</h4>
          <small className="text-muted">
            Project-wise payable, payout and tax details
          </small>
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
        columns={columns}
        data={tableData}
        loading={loading}
        showActions={false}
        fixedColumns={["sn"]}
        defaultVisibleColumns={[
          "sn",
          "projectId",
          "businessName",
          "projectName",
          "period",
          "projectDate",
          "totalAmountWithoutTax",
          "taxAmount",
          "totalAmountWithTax",
          "totalClientReceived",
          "totalDeveloperPaid",
          "remainingAmount",
        ]}
        columnsWithDateFilter={["projectDate"]}
        tableTitle="Project Details"
        showColumnSelector={true}
        showExport={true}
        showRefresh={true}
        showAdvancedFilter={true}
        showSearch={true}
        onRefresh={handleRefresh}
        exportFileName="Project_Details"
        exportTitle="Project Details Report"
      />
    </div>
  );
};

export default ProjectDetails;
