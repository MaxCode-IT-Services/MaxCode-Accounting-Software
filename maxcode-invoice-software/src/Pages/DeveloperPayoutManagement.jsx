import React, { useEffect, useMemo, useState } from "react";
import ReusableTable from "../Components/ReusableTable";
import { showError, showInfo } from "../Components/ToastNotification";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { apiGet } from "../utils/api";

const DeveloperPayoutManagement = () => {
  useEffect(() => {
    document.title = "Developer Payout | MaxCode IT Services";
  }, []);

  const [financialYears, setFinancialYears] = useState([]);
  const [selectedFinancialYear, setSelectedFinancialYear] = useState(
    localStorage.getItem("selectedFinancialYear") || "ALL",
  );
  const [projectRecords, setProjectRecords] = useState([]);
  const [staffRecords, setStaffRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [financialPeriodMode, setFinancialPeriodMode] = useState("yearly");

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

  const getDateOnly = (value) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  };

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

  const isWithinFinancialYear = (dateValue) => {
    const dateOnly = getDateOnly(dateValue);
    if (!dateOnly) return false;

    const selectedRange = getSelectedYearRange();
    if (!selectedRange) return true;

    return (
      dateOnly >= selectedRange.startDate && dateOnly <= selectedRange.endDate
    );
  };

  const isWithinPeriodMode = (dateValue) => {
    const dateOnly = getDateOnly(dateValue);
    const today = getDateOnly(new Date());

    if (!dateOnly || !today) return false;

    if (financialPeriodMode === "daily") {
      return dateOnly.getTime() === today.getTime();
    }

    if (financialPeriodMode === "monthly") {
      return (
        dateOnly.getFullYear() === today.getFullYear() &&
        dateOnly.getMonth() === today.getMonth()
      );
    }

    if (financialPeriodMode === "quarterly") {
      const getQuarter = (date) => Math.floor(date.getMonth() / 3) + 1;
      return (
        dateOnly.getFullYear() === today.getFullYear() &&
        getQuarter(dateOnly) === getQuarter(today)
      );
    }

    if (financialPeriodMode === "halfYearly") {
      const getHalf = (date) => (date.getMonth() < 6 ? 1 : 2);
      return (
        dateOnly.getFullYear() === today.getFullYear() &&
        getHalf(dateOnly) === getHalf(today)
      );
    }

    if (financialPeriodMode === "yearly") {
      return dateOnly.getFullYear() === today.getFullYear();
    }

    return true;
  };

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [yearsResult, projectsResult, staffResult] =
        await Promise.allSettled([
          apiGet(API_ENDPOINTS.YEARS.LIST),
          apiGet(API_ENDPOINTS.PROJECTS.LIST),
          apiGet(API_ENDPOINTS.STAFF.LIST),
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

      const staffData =
        staffResult.status === "fulfilled"
          ? Array.isArray(staffResult.value.data)
            ? staffResult.value.data
            : staffResult.value.data?.staff || []
          : [];

      setFinancialYears(normalizedYears);
      setProjectRecords(
        projectsData
          .filter((record) => record?.isDeleted !== true)
          .map((record) => ({
            ...record,
            id: record._id || record.id,
          })),
      );
      setStaffRecords(
        staffData
          .filter((record) => record?.isDeleted !== true)
          .map((record) => ({
            ...record,
            id: record._id || record.id,
          })),
      );

      if (
        yearsResult.status === "rejected" ||
        projectsResult.status === "rejected" ||
        staffResult.status === "rejected"
      ) {
        showInfo(
          "Some developer payout data could not be loaded. Please refresh.",
        );
      }
    } catch (error) {
      console.error("Failed to load developer payout data:", error);
      showError("Failed to fetch developer payout data");
      setFinancialYears([]);
      setProjectRecords([]);
      setStaffRecords([]);
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

  const filteredProjects = useMemo(() => {
    return projectRecords.filter((project) => {
      const projectDate = project.projectDate || project.createdDate;
      return (
        isWithinFinancialYear(projectDate) && isWithinPeriodMode(projectDate)
      );
    });
  }, [
    projectRecords,
    selectedFinancialYear,
    financialYears,
    financialPeriodMode,
  ]);

  const payoutRows = useMemo(() => {
    const staffMap = new Map(
      staffRecords.map((staff) => [String(staff.id || staff._id || ""), staff]),
    );

    return filteredProjects.flatMap((project) => {
      const transactions = Array.isArray(project.developerTransactions)
        ? project.developerTransactions
        : [];

      return transactions
        .map((transaction, index) => {
          const payoutDate =
            transaction.payoutDate ||
            transaction.paymentDate ||
            project.projectDate ||
            project.createdDate;

          if (
            !isWithinFinancialYear(payoutDate) ||
            !isWithinPeriodMode(payoutDate)
          ) {
            return null;
          }

          const staffRefId = String(transaction.staffRefId || "");
          const matchedStaff = staffMap.get(staffRefId);
          const phoneNumber =
            matchedStaff?.phoneNumber ||
            transaction.phoneNumber ||
            project.phoneNumber ||
            "-";

          return {
            id: `${project.id || project._id || "project"}-${transaction.id || index + 1}`,
            sn: 0,
            developerName:
              transaction.staffName || matchedStaff?.developerName || "-",
            phoneNumber,
            projectName: project.projectName || "-",
            payoutDate: formatDateForDisplay(payoutDate),
            payoutMethod: transaction.payoutMethod || "-",
            payoutAmount: toNumber(transaction.payoutAmount || 0),
            description: transaction.description || "-",
          };
        })
        .filter(Boolean);
    });
  }, [
    filteredProjects,
    staffRecords,
    selectedFinancialYear,
    financialYears,
    financialPeriodMode,
  ]);

  const tableData = useMemo(() => {
    return payoutRows.map((row, index) => ({
      ...row,
      sn: index + 1,
    }));
  }, [payoutRows]);

  const stats = useMemo(() => {
    const uniqueDevelopers = new Set(
      payoutRows
        .map((row) => String(row.developerName || "").trim())
        .filter((name) => name && name !== "-"),
    ).size;

    const uniqueProjects = new Set(
      filteredProjects.map((project) =>
        String(project.id || project._id || project.projectId || ""),
      ),
    ).size;

    const totalDeveloperCost = filteredProjects.reduce(
      (sum, project) => sum + toNumber(project.totalDeveloperCost || 0),
      0,
    );

    const totalPayout = payoutRows.reduce(
      (sum, row) => sum + toNumber(row.payoutAmount || 0),
      0,
    );

    return {
      totalDevelopers: uniqueDevelopers,
      totalProjects: uniqueProjects,
      totalDeveloperCost,
      totalPayout,
      pendingPayout: totalDeveloperCost - totalPayout,
    };
  }, [payoutRows, filteredProjects]);

  const cards = [
    {
      key: "totalDevelopers",
      title: "Total Developer",
      value: String(stats.totalDevelopers),
      icon: "fa-solid fa-user-tie",
    },
    {
      key: "totalProjects",
      title: "Total Project",
      value: String(stats.totalProjects),
      icon: "fa-solid fa-diagram-project",
    },
    {
      key: "totalDeveloperCost",
      title: "Total Cost",
      value: formatCurrency(stats.totalDeveloperCost),
      icon: "fa-solid fa-file-invoice-dollar",
    },
    {
      key: "totalPayout",
      title: "Total Payout",
      value: formatCurrency(stats.totalPayout),
      icon: "fa-solid fa-money-check-dollar",
    },
    {
      key: "pendingPayout",
      title: "Pending Payout",
      value: formatCurrency(stats.pendingPayout),
      icon: "fa-solid fa-clock",
    },
    {
      key: "period",
      title: "Financial Period",
      value:
        financialPeriodMode === "daily"
          ? "Daily"
          : financialPeriodMode === "monthly"
            ? "Monthly"
            : financialPeriodMode === "quarterly"
              ? "Quarterly"
              : financialPeriodMode === "halfYearly"
                ? "Half Yearly"
                : "Yearly",
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
    await loadAllData();
    showInfo("Developer payout data refreshed!");
  };

  const columnsWithDropdownFilter = [
    "developerName",
    "payoutMethod",
    "projectName",
  ];
  const columnsWithDateFilter = ["payoutDate"];

  const getCardNumber = (index) => (index % 8) + 1;

  return (
    <div className="container-fluid">
      <div
        className="py-3 d-flex align-items-sm-center flex-sm-row flex-column"
        style={{ marginTop: "70px" }}
      >
        <div className="flex-grow-1">
          <h4 className="fs-18 fw-semibold m-0">Developer Payout Management</h4>
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
          "developerName",
          "phoneNumber",
          "projectName",
          "payoutDate",
          "payoutMethod",
          "payoutAmount",
          "description",
        ]}
        columnsWithDropdownFilter={columnsWithDropdownFilter}
        columnsWithDateFilter={columnsWithDateFilter}
        tableTitle="Developer Payout Records"
        showColumnSelector={true}
        showExport={true}
        showRefresh={true}
        showAdvancedFilter={true}
        showSearch={true}
        onRefresh={handleRefresh}
        exportFileName="Developer_Payout"
        exportTitle="Developer Payout Report"
      />
    </div>
  );
};

export default DeveloperPayoutManagement;
