import React, { useEffect, useMemo, useState, useCallback } from "react";
import ReusableTable from "../Components/ReusableTable";
import { showError, showInfo } from "../Components/ToastNotification";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { apiGet } from "../utils/api";

const ProfitLoss = () => {
  useEffect(() => {
    document.title = "Profit & Loss | MaxCode IT Services";
  }, []);

  const [financialYears, setFinancialYears] = useState([]);
  const [selectedFinancialYear, setSelectedFinancialYear] = useState(
    localStorage.getItem("selectedFinancialYear") || "ALL",
  );
  const [plData, setPlData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeCardFilter, setActiveCardFilter] = useState("all");
  const [apiStatus, setApiStatus] = useState({
    years: "idle",
    profitLoss: "idle",
  });

  const toNumber = (value) => {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : 0;
    }

    if (typeof value === "string") {
      const sanitized = value.replace(/,/g, "").replace(/[^0-9.-]/g, "").trim();
      if (!sanitized) return 0;
      const parsed = Number(sanitized);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const extractPayload = (response) => {
    if (response && typeof response === "object" && "data" in response) {
      return response.data;
    }
    return response;
  };

  const formatCurrency = (value) => {
    return `₹ ${toNumber(value).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const loadFinancialYears = useCallback(
    async ({ forceRefresh = false } = {}) => {
      setApiStatus((prev) => ({ ...prev, years: "loading" }));
      try {
        const url = API_ENDPOINTS.YEARS.LIST;
        const response = await apiGet(url, { forceRefresh });
        const payload = extractPayload(response);
        const yearsData = Array.isArray(payload)
          ? payload
          : payload?.years || payload?.data || [];

        const normalizedYears = yearsData
          .filter((yearRecord) => yearRecord?.isDeleted !== true)
          .map((yearRecord) => ({
            ...yearRecord,
            id: yearRecord.id || yearRecord._id,
            value: yearRecord.financialYear || yearRecord.year,
            startDate: yearRecord.startDate,
            endDate: yearRecord.endDate,
          }));

        setFinancialYears(normalizedYears);
        setApiStatus((prev) => ({ ...prev, years: "loaded" }));
        return normalizedYears;
      } catch (error) {
        console.error("Failed to fetch financial years:", error);
        setFinancialYears([]);
        setApiStatus((prev) => ({ ...prev, years: "failed" }));
        throw error;
      }
    },
    [],
  );

  const loadProfitLoss = useCallback(
    async ({ forceRefresh = false } = {}) => {
      setApiStatus((prev) => ({ ...prev, profitLoss: "loading" }));
      setLoading(true);
      try {
        const url = API_ENDPOINTS.PROFIT_LOSS.SUMMARY(selectedFinancialYear);
        const response = await apiGet(url, { forceRefresh });
        const payload = extractPayload(response);
        setPlData(payload || null);
        setApiStatus((prev) => ({ ...prev, profitLoss: "loaded" }));
      } catch (err) {
        console.error("Failed to load profit & loss:", err);
        showError("Failed to fetch profit & loss data");
        setPlData(null);
        setApiStatus((prev) => ({ ...prev, profitLoss: "failed" }));
      } finally {
        setLoading(false);
      }
    },
    [selectedFinancialYear],
  );

  const loadAllData = useCallback(
    async ({ forceRefresh = false } = {}) => {
      await Promise.all([
        loadFinancialYears({ forceRefresh }),
        loadProfitLoss({ forceRefresh }),
      ]);
    },
    [loadFinancialYears, loadProfitLoss],
  );

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
  }, [loadAllData]);

  useEffect(() => {
    if (selectedFinancialYear) {
      loadProfitLoss();
    }
  }, [selectedFinancialYear, loadProfitLoss]);

  const getStatusBadgeClass = (status) => {
    if (status === "loaded") return "bg-success";
    if (status === "failed") return "bg-danger";
    if (status === "loading") return "bg-warning";
    return "bg-secondary";
  };

  const getStatusLabel = (status) => {
    if (status === "loaded") return "Loaded";
    if (status === "failed") return "Failed";
    if (status === "loading") return "Loading";
    return "Idle";
  };

  const renderStatusContent = (name, status) => {
    return (
      <>
        {name}:{" "}
        {status === "loading" && (
          <i className="fa-solid fa-spinner fa-spin me-1" />
        )}
        {getStatusLabel(status)}
      </>
    );
  };

  const retrySingleApi = async (apiKey) => {
    setApiStatus((prev) => ({ ...prev, [apiKey]: "loading" }));
    try {
      if (apiKey === "years") {
        await loadFinancialYears({ forceRefresh: true });
      } else if (apiKey === "profitLoss") {
        await loadProfitLoss({ forceRefresh: true });
      }
      showInfo(`${apiKey.toUpperCase()} API retried successfully.`);
    } catch (error) {
      showError(`Failed to retry ${apiKey} API.`);
    }
  };

  const failedApiKeys = useMemo(() => {
    return Object.entries(apiStatus)
      .filter(([, status]) => status === "failed")
      .map(([key]) => key);
  }, [apiStatus]);

  const isAnyApiLoading = useMemo(() => {
    return Object.values(apiStatus).some((status) => status === "loading");
  }, [apiStatus]);

  const retryAllFailedApis = async () => {
    if (!failedApiKeys.length) return;
    for (const apiKey of failedApiKeys) {
      await retrySingleApi(apiKey);
    }
  };

  const income = plData?.income || {
    salesRevenue: 0,
    serviceRevenue: 0,
    otherIncome: 0,
    discountReceived: 0,
    totalRevenue: 0,
  };

  const expenses = plData?.expenses || {
    purchaseExpense: 0,
    companyExpenses: 0,
    rcmExpense: 0,
    developerPayoutExpense: 0,
    directExpenses: 0,
    indirectExpenses: 0,
    totalExpenses: 0,
  };

  const cogs = plData?.costOfGoodsSold || {
    openingStock: 0,
    purchases: 0,
    closingStock: 0,
    cogs: 0,
  };

  const summary = plData?.summary || {
    grossProfit: 0,
    otherExpensesTotal: 0,
    netProfit: 0,
    gstOutputTotal: 0,
    gstInputTotal: 0,
    netGst: 0,
  };

  const position = plData?.position || {
    openingCash: 0,
    openingBank: 0,
    closingCash: 0,
    closingBank: 0,
    openingGstInput: 0,
    gstInputTotal: 0,
    gstOutputTotal: 0,
    gstNetWithOpeningItc: 0,
    gstItcAvailable: 0,
    gstPayable: 0,
    ownerInvestmentNet: 0,
    ownerWithdrawalNet: 0,
    closingOwnerEquity: 0,
    openingCapital: 0,
  };

  const isProfit = summary.netProfit >= 0;
  const gstPositionLabel =
    position.gstItcAvailable > 0
      ? "ITC Available"
      : position.gstPayable > 0
        ? "GST Payable"
        : "GST Settled";
  const gstPositionAmount =
    position.gstItcAvailable > 0
      ? position.gstItcAvailable
      : position.gstPayable > 0
        ? position.gstPayable
        : 0;

  const rows = useMemo(() => {
    const getDescription = (account, section, isTotal) => {
      if (isTotal) {
        if (section === "Income") return "Total of all income/revenue sources";
        if (section === "Expenses") return "Total of all expenses";
        if (section === "COGS") return "Cost of Goods Sold";
        if (section === "Summary") return "Final profit/loss result";
        return `Total of ${section}`;
      }

      switch (account) {
        case "Sales Revenue":
          return "Revenue from sales invoices (excluding GST)";
        case "Service Revenue":
          return "Revenue from services rendered (excluding GST)";
        case "Other Income":
          return "Miscellaneous income from other sources";
        case "Discount Received":
          return "Discounts received on purchases";
        case "Purchase Expenses":
          return "Cost of goods purchased (excluding GST)";
        case "Company Expenses":
          return "General company operational expenses";
        case "RCM Expenses":
          return "Reverse Charge Mechanism expenses";
        case "Developer Payout":
          return "Payments made to developers/contractors";
        case "Direct Expenses":
          return "Expenses directly attributable to revenue";
        case "Indirect Expenses":
          return "Overhead and administrative expenses";
        case "Opening Stock":
          return "Inventory value at start of period";
        case "Closing Stock":
          return "Inventory value at end of period";
        case "Cost of Goods Sold":
          return "Opening Stock + Purchases - Closing Stock";
        case "Gross Profit":
          return "Total Revenue minus Cost of Goods Sold";
        case "Other Expenses Total":
          return "Indirect or operating expenses";
        case "Net Profit / (Loss)":
          return "Final profit after expenses";
        case "GST Output Total":
          return "GST collected on sales";
        case "GST Input Total":
          return "GST paid on purchases";
        case "Net GST":
          return "GST payable or receivable";
        default:
          return "";
      }
    };

    const incomeRows = [
      {
        section: "Income",
        account: "Sales Revenue",
        amount: income.salesRevenue,
      },
      {
        section: "Income",
        account: "Service Revenue",
        amount: income.serviceRevenue,
      },
    ];

    if (income.otherIncome > 0) {
      incomeRows.push({
        section: "Income",
        account: "Other Income",
        amount: income.otherIncome,
      });
    }

    if (income.discountReceived > 0) {
      incomeRows.push({
        section: "Income",
        account: "Discount Received",
        amount: income.discountReceived,
      });
    }

    incomeRows.push({
      section: "Income",
      account: "Total Revenue",
      amount: income.totalRevenue,
      isTotal: true,
    });

    const cogsRows = [
      {
        section: "COGS",
        account: "Opening Stock",
        amount: cogs.openingStock,
      },
      {
        section: "COGS",
        account: "Purchase Expenses",
        amount: cogs.purchases,
      },
      {
        section: "COGS",
        account: "Closing Stock",
        amount: -cogs.closingStock,
      },
      {
        section: "COGS",
        account: "Cost of Goods Sold",
        amount: cogs.cogs,
        isTotal: true,
      },
    ];

    const expenseRows = [];

    if (expenses.companyExpenses > 0) {
      expenseRows.push({
        section: "Expenses",
        account: "Company Expenses",
        amount: expenses.companyExpenses,
      });
    }

    if (expenses.rcmExpense > 0) {
      expenseRows.push({
        section: "Expenses",
        account: "RCM Expenses",
        amount: expenses.rcmExpense,
      });
    }

    if (expenses.developerPayoutExpense > 0) {
      expenseRows.push({
        section: "Expenses",
        account: "Developer Payout",
        amount: expenses.developerPayoutExpense,
      });
    }

    if (expenses.directExpenses > 0) {
      expenseRows.push({
        section: "Expenses",
        account: "Direct Expenses",
        amount: expenses.directExpenses,
      });
    }

    if (expenses.indirectExpenses > 0) {
      expenseRows.push({
        section: "Expenses",
        account: "Indirect Expenses",
        amount: expenses.indirectExpenses,
      });
    }

    expenseRows.push({
      section: "Expenses",
      account: "Total Expenses",
      amount: expenses.totalExpenses,
      isTotal: true,
    });

    const summaryRows = [
      {
        section: "Summary",
        account: "Gross Profit",
        amount: summary.grossProfit,
      },
      {
        section: "Summary",
        account: "Other Expenses Total",
        amount: summary.otherExpensesTotal,
      },
      {
        section: "Summary",
        account: "Net Profit / (Loss)",
        amount: summary.netProfit,
        isTotal: true,
      },
      {
        section: "Summary",
        account: "Net GST",
        amount: summary.netGst,
      },
    ];

    return [...incomeRows, ...cogsRows, ...expenseRows, ...summaryRows].map(
      (row, index) => ({
        ...row,
        sn: index + 1,
        amountFormatted: formatCurrency(row.amount),
        description: getDescription(row.account, row.section, row.isTotal),
      }),
    );
  }, [income, expenses, cogs, summary]);

  const filteredRows = useMemo(() => {
    if (activeCardFilter === "all") return rows;

    const filterMap = {
      totalRevenue: "Total Revenue",
      cogs: "Cost of Goods Sold",
      grossProfit: "Gross Profit",
      operatingExpenses: "Other Expenses Total",
      netProfit: "Net Profit / (Loss)",
      gst: "Net GST",
    };

    if (filterMap[activeCardFilter]) {
      return rows.filter((row) => row.account === filterMap[activeCardFilter]);
    }

    if (activeCardFilter === "income") {
      return rows.filter((row) => row.section === "Income");
    }

    if (activeCardFilter === "expenses") {
      return rows.filter(
        (row) => row.section === "Expenses" || row.section === "COGS",
      );
    }

    return rows;
  }, [rows, activeCardFilter]);

  const handleCardClick = (cardKey) => {
    setActiveCardFilter(activeCardFilter === cardKey ? "all" : cardKey);
  };

  const cards = [
    {
      key: "totalRevenue",
      title: "Sales",
      value: formatCurrency(income.totalRevenue),
      icon: "fa-solid fa-arrow-trend-up",
    },
    {
      key: "cogs",
      title: "Purchase Cost",
      value: formatCurrency(cogs.cogs),
      icon: "fa-solid fa-boxes-stacked",
    },
    {
      key: "grossProfit",
      title: "Business Margin",
      value: formatCurrency(summary.grossProfit),
      icon: "fa-solid fa-chart-line",
    },
    {
      key: "operatingExpenses",
      title: "Office Expenses",
      value: formatCurrency(summary.otherExpensesTotal),
      icon: "fa-solid fa-money-bill-wave",
    },
    {
      key: "netProfit",
      title: "Final Profit",
      value: formatCurrency(summary.netProfit),
      icon: isProfit
        ? "fa-solid fa-circle-arrow-up"
        : "fa-solid fa-circle-arrow-down",
    },
    {
      key: "gst",
      title: "GST Balance",
      value: formatCurrency(summary.netGst),
      icon: "fa-solid fa-receipt",
    },
  ];

  const positionCards = [
    {
      key: "bankBalance",
      title: "Bank Balance",
      value: formatCurrency(position.closingBank),
      caption: `Opening: ${formatCurrency(position.openingBank)}`,
      icon: "fa-solid fa-building-columns",
    },
    {
      key: "cashBalance",
      title: "Cash Balance",
      value: formatCurrency(position.closingCash),
      caption: `Opening: ${formatCurrency(position.openingCash)}`,
      icon: "fa-solid fa-sack-dollar",
    },
    {
      key: "cashBankTotal",
      title: "Cash + Bank",
      value: formatCurrency((position.closingCash || 0) + (position.closingBank || 0)),
      caption: `Liquid Funds`,
      icon: "fa-solid fa-wallet",
    },
    {
      key: "gstPosition",
      title: gstPositionLabel,
      value: formatCurrency(gstPositionAmount),
      caption: `Opening ITC: ${formatCurrency(position.openingGstInput)}`,
      icon: "fa-solid fa-receipt",
    },
    {
      key: "ownerEquity",
      title: "Owner Equity",
      value: formatCurrency(position.closingOwnerEquity),
      caption: `Capital + Profit - Drawings`,
      icon: "fa-solid fa-user-tie",
    },
    {
      key: "ownerInvestment",
      title: "Owner Investment",
      value: formatCurrency(position.ownerInvestmentNet),
      caption: `Withdrawals: ${formatCurrency(position.ownerWithdrawalNet)}`,
      icon: "fa-solid fa-arrow-trend-up",
    },
  ];

  const getCardNumber = (index) => (index % 8) + 1;

  const columns = [
    { key: "sn", label: "S.No", width: 70 },
    { key: "section", label: "Section", width: 180 },
    { key: "account", label: "Account", width: 260 },
    { key: "description", label: "Description", width: 320 },
    {
      key: "amountFormatted",
      label: "Amount",
      width: 160,
      render: (value, row) => (
        <span
          className={
            row?.isTotal
              ? "fw-bold"
              : row?.section === "Income"
                ? "fw-semibold text-success"
                : row?.section === "Expenses" || row?.section === "COGS"
                  ? "fw-semibold text-danger"
                  : "fw-semibold"
          }
        >
          {value}
        </span>
      ),
    },
  ];

  const handleRefresh = async () => {
    await loadAllData({ forceRefresh: true });
    showInfo("Profit & Loss refreshed!");
  };

  return (
    <div className="container-fluid">
      <div
        className="py-3 d-flex justify-content-between align-items-center flex-wrap"
        style={{ marginTop: "70px" }}
      >
        <div>
          <h4 className="fs-18 fw-semibold m-0">Profit & Loss Statement</h4>
        </div>

        <div className="d-flex flex-wrap gap-2 mt-2 mt-sm-0 justify-content-end">
          <span className="badge bg-light text-dark border d-inline-flex align-items-center">
            API Status
          </span>

          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            onClick={retryAllFailedApis}
            disabled={!failedApiKeys.length || isAnyApiLoading}
            title={
              failedApiKeys.length
                ? "Retry all failed APIs"
                : "No failed APIs to retry"
            }
          >
            <i className="fa-solid fa-rotate me-1"></i>
            Retry All Failed
          </button>

          <span
            className={`badge ${getStatusBadgeClass(apiStatus.years)} d-inline-flex align-items-center`}
            style={{
              cursor: apiStatus.years === "failed" ? "pointer" : "default",
            }}
            onClick={() =>
              apiStatus.years === "failed" && retrySingleApi("years")
            }
          >
            {renderStatusContent("Years", apiStatus.years)}
          </span>

          <span
            className={`badge ${getStatusBadgeClass(apiStatus.profitLoss)} d-inline-flex align-items-center`}
            style={{
              cursor:
                apiStatus.profitLoss === "failed" ? "pointer" : "default",
            }}
            onClick={() =>
              apiStatus.profitLoss === "failed" &&
              retrySingleApi("profitLoss")
            }
          >
            {renderStatusContent("P&L", apiStatus.profitLoss)}
          </span>

          <span
            className={`badge d-inline-flex align-items-center ${isProfit ? "bg-success" : "bg-danger"}`}
            title={
              isProfit
                ? "Net Profit for the period"
                : "Net Loss for the period"
            }
          >
            {isProfit ? "Net Profit" : "Net Loss"}
          </span>
        </div>
      </div>

      <div className="row">
        {cards.map((card, index) => {
          const cardNumber = getCardNumber(index);
          const cardClass = `card${cardNumber}`;
          const cardIconBgClass = `card-icon-bg${cardNumber}`;
          const isActive = activeCardFilter === card.key;

          return (
            <div key={card.key} className="col-md-6 col-xl mb-4">
              <div
                className={`card border-0 overflow-hidden ${cardClass} modern-card hover-elevate`}
                style={{
                  cursor: "pointer",
                  borderRadius: "12px",
                  height: "100%",
                  border: isActive ? "2px solid #0d6efd" : undefined,
                }}
                onClick={() => handleCardClick(card.key)}
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
                  <h6 className="mb-0 text-muted fw-bold">{card.value}</h6>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      

      <div className="row">
        {positionCards.map((card, index) => {
          const cardNumber = getCardNumber(index);
          const cardClass = `card${cardNumber}`;
          const cardIconBgClass = `card-icon-bg${cardNumber}`;

          return (
            <div key={card.key} className="col-md-6 col-xl mb-4">
              <div className={`card border-0 overflow-hidden ${cardClass} modern-card hover-elevate`} style={{ borderRadius: "12px", height: "100%" }}>
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
                  <h6 className="mb-1 text-muted fw-bold">{card.value}</h6>
                  {card.caption && <div className="text-muted small">{card.caption}</div>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <ReusableTable
        ensureCreatedByColumn={true}
        createdByLabel="Created By"
        moduleKey="profitLoss"
        columns={columns}
        data={filteredRows}
        loading={loading}
        showActions={false}
        fixedColumns={["sn"]}
        defaultVisibleColumns={[
          "sn",
          "section",
          "account",
          "description",
          "amountFormatted",
        ]}
        tableTitle="Profit & Loss Statement"
        showColumnSelector={true}
        showExport={true}
        showRefresh={true}
        showAdvancedFilter={false}
        showSearch={true}
        onRefresh={handleRefresh}
        exportFileName="Profit_Loss_Statement"
        exportTitle="Profit & Loss Report"
      />
    </div>
  );
};

export default ProfitLoss;