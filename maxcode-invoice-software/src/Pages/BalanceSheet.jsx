import React, { useEffect, useMemo, useState, useCallback } from "react";
import ReusableTable from "../Components/ReusableTable";
import { showError, showInfo } from "../Components/ToastNotification";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { apiGet } from "../utils/api";

const BalanceSheet = () => {
  useEffect(() => {
    document.title = "Balance Sheet | MaxCode IT Services";
  }, []);

  const [financialYears, setFinancialYears] = useState([]);
  const [selectedFinancialYear, setSelectedFinancialYear] = useState(
    localStorage.getItem("selectedFinancialYear") || "ALL",
  );
  const [balanceData, setBalanceData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeCardFilter, setActiveCardFilter] = useState("all");
  const [apiStatus, setApiStatus] = useState({
    years: "idle",
    balanceSheet: "idle",
  });

  const toNumber = (value) => {
    const num = parseFloat(value);
    return Number.isNaN(num) ? 0 : num;
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

  const loadBalanceSheet = useCallback(
    async ({ forceRefresh = false } = {}) => {
      setApiStatus((prev) => ({ ...prev, balanceSheet: "loading" }));
      setLoading(true);
      try {
        const url = API_ENDPOINTS.BALANCE_SHEET.SUMMARY(selectedFinancialYear);
        const response = await apiGet(url, { forceRefresh });
        const payload = extractPayload(response);
        setBalanceData(payload || null);
        setApiStatus((prev) => ({ ...prev, balanceSheet: "loaded" }));
      } catch (err) {
        console.error("Failed to load balance sheet:", err);
        showError("Failed to fetch balance sheet data");
        setBalanceData(null);
        setApiStatus((prev) => ({ ...prev, balanceSheet: "failed" }));
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
        loadBalanceSheet({ forceRefresh }),
      ]);
    },
    [loadFinancialYears, loadBalanceSheet],
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
      loadBalanceSheet();
    }
  }, [selectedFinancialYear, loadBalanceSheet]);

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
      } else if (apiKey === "balanceSheet") {
        await loadBalanceSheet({ forceRefresh: true });
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

  const assets = balanceData?.assets || {
    cashOpening: 0,
    cash: 0,
    bankOpening: 0,
    bank: 0,
    receivables: 0,
    gstReceivable: 0,
    inventory: 0,
  };

  const liabilities = balanceData?.liabilities || {
    payables: 0,
    gstPayable: 0,
    overdraft: 0,
    ownerFunding: 0,
    customerAdvance: 0,
    creditNotePayable: 0,
    customerOverpayment: 0,
  };

  const totalAssets = balanceData?.totalAssets || 0;
  const totalLiabilities = balanceData?.totalLiabilities || 0;
  const equity = balanceData?.equity || 0;
  const openingCapital = balanceData?.openingCapital || 0;

  const rows = useMemo(() => {
    const getDescription = (account, section, isTotal) => {
      if (isTotal) {
        if (section === "Assets") {
          return "Total value of all assets";
        }
        if (section === "Liabilities & Equity") {
          return "Total of liabilities and owner's equity";
        }
        return `Total of ${section}`;
      }

      switch (account) {
        case "Cash (Opening)":
          return "Cash balance at start of financial year";
        case "Cash (Closing)":
          return "Cash balance at the end of the financial period";
        case "Bank (Opening)":
          return "Bank balance at start of financial year";
        case "Bank (Closing)":
          return "Bank balance at the end of the financial period";
        case "Accounts Receivable (Sundry Debtors)":
          return "Amount receivable from customers (positive balance only)";
        case "Customer Advance Payment (Customer Credit)":
          return "Advance payments received from customers (unadjusted)";
        case "Credit Note / Customer Refund Payable":
          return "Separate liability from issued credit notes payable/adjustable to customer";
        case "Customer Credit Balance (Overpayment)":
          return "Customer overpayment liability excluding advance receipts and credit notes";
        case "GST Receivable":
          return "Input GST available for claim or refund";
        case "Inventory":
          return "Closing stock value";
        case "Accounts Payable (Sundry Creditors)":
          return "Amount payable to suppliers for unpaid purchases";
        case "GST Payable":
          return "Net GST liability payable to the government";
        case "Bank/Cash Overdraft":
          return "Negative cash/bank closing balance shown as liability";
        case "Owner Funding (Personal Payments)":
          return "Amount paid directly from owner's personal account for business purchases/RCM/developer payouts";
        case "Capital (Opening)":
          return "Owner capital brought at year start";
        case "Owner's Equity (Calculated)":
          return "Owner's net investment after assets minus liabilities";
        case "Total Liabilities & Equity":
          return "Liabilities plus equity total";
        default:
          return "";
      }
    };

    const assetRows = [
      {
        section: "Assets",
        account: "Cash (Opening)",
        amount: assets.cashOpening,
      },
      { section: "Assets", account: "Cash (Closing)", amount: assets.cash },
      {
        section: "Assets",
        account: "Bank (Opening)",
        amount: assets.bankOpening,
      },
      { section: "Assets", account: "Bank (Closing)", amount: assets.bank },
      {
        section: "Assets",
        account: "Accounts Receivable (Sundry Debtors)",
        amount: assets.receivables,
      },
      {
        section: "Assets",
        account: "GST Receivable",
        amount: assets.gstReceivable,
      },
    ];

    if (assets.inventory > 0) {
      assetRows.push({
        section: "Assets",
        account: "Inventory",
        amount: assets.inventory,
      });
    }

    assetRows.push({
      section: "Assets",
      account: "Total Assets",
      amount: totalAssets,
      isTotal: true,
    });

    const liabilityRows = [
      {
        section: "Liabilities",
        account: "Accounts Payable (Sundry Creditors)",
        amount: liabilities.payables,
      },
      {
        section: "Liabilities",
        account: "GST Payable",
        amount: liabilities.gstPayable,
      },
    ];

    if (liabilities.overdraft > 0) {
      liabilityRows.push({
        section: "Liabilities",
        account: "Bank/Cash Overdraft",
        amount: liabilities.overdraft,
      });
    }

    if (liabilities.customerAdvance > 0) {
      liabilityRows.push({
        section: "Liabilities",
        account: "Customer Advance Payment (Customer Credit)",
        amount: liabilities.customerAdvance,
      });
    }

    if (liabilities.creditNotePayable > 0) {
      liabilityRows.push({
        section: "Liabilities",
        account: "Credit Note / Customer Refund Payable",
        amount: liabilities.creditNotePayable,
      });
    }

    if (liabilities.customerOverpayment > 0) {
      liabilityRows.push({
        section: "Liabilities",
        account: "Customer Credit Balance (Overpayment)",
        amount: liabilities.customerOverpayment,
      });
    }

    if (liabilities.ownerFunding > 0) {
      liabilityRows.push({
        section: "Liabilities",
        account: "Owner Funding (Personal Payments)",
        amount: liabilities.ownerFunding,
      });
    }

    const equityRows = [];

    if (openingCapital > 0) {
      equityRows.push({
        section: "Liabilities & Equity",
        account: "Capital (Opening)",
        amount: openingCapital,
      });
    }

    equityRows.push({
      section: "Liabilities & Equity",
      account: "Owner's Equity (Calculated)",
      amount: equity,
    });
    equityRows.push({
      section: "Liabilities & Equity",
      account: "Total Liabilities & Equity",
      amount: totalLiabilities + equity,
      isTotal: true,
    });

    return [...assetRows, ...liabilityRows, ...equityRows].map(
      (row, index) => ({
        ...row,
        sn: index + 1,
        amountFormatted: formatCurrency(row.amount),
        description: getDescription(row.account, row.section, row.isTotal),
      }),
    );
  }, [
    assets,
    liabilities,
    totalAssets,
    totalLiabilities,
    equity,
    openingCapital,
  ]);

  const filteredRows = useMemo(() => {
    if (activeCardFilter === "all") return rows;

    const filterMap = {
      cashOpen: "Cash (Opening)",
      cashClose: "Cash (Closing)",
      bankOpen: "Bank (Opening)",
      bankClose: "Bank (Closing)",
    };

    if (filterMap[activeCardFilter]) {
      return rows.filter((row) => row.account === filterMap[activeCardFilter]);
    }

    if (activeCardFilter === "totalAssets") {
      return rows.filter((row) => row.section === "Assets");
    }

    if (activeCardFilter === "totalLiabilities") {
      return rows.filter(
        (row) =>
          row.section === "Liabilities" ||
          row.section === "Liabilities & Equity",
      );
    }

    return rows;
  }, [rows, activeCardFilter]);

  const handleCardClick = (cardKey) => {
    setActiveCardFilter(activeCardFilter === cardKey ? "all" : cardKey);
  };

  const cards = [
    {
      key: "cashOpen",
      title: "Cash Opening",
      value: formatCurrency(assets.cashOpening),
      icon: "fa-solid fa-wallet",
    },
    {
      key: "cashClose",
      title: "Cash Closing",
      value: formatCurrency(assets.cash),
      icon: "fa-solid fa-wallet",
    },
    {
      key: "bankOpen",
      title: "Bank Opening",
      value: formatCurrency(assets.bankOpening),
      icon: "fa-solid fa-building-columns",
    },
    {
      key: "bankClose",
      title: "Bank Closing",
      value: formatCurrency(assets.bank),
      icon: "fa-solid fa-building-columns",
    },
    {
      key: "totalAssets",
      title: "Total Assets",
      value: formatCurrency(totalAssets),
      icon: "fa-solid fa-scale-balanced",
    },
    {
      key: "totalLiabilities",
      title: "Total Liabilities",
      value: formatCurrency(totalLiabilities),
      icon: "fa-solid fa-scale-unbalanced",
    },
  ];

  const balanceDifference = totalAssets - (totalLiabilities + equity);
  const isBalanceMatched = Math.abs(balanceDifference) < 0.01;

  const getCardNumber = (index) => (index % 8) + 1;

  const columns = [
    { key: "sn", label: "S.No", width: 70 },
    { key: "section", label: "Section", width: 220 },
    { key: "account", label: "Account", width: 260 },
    { key: "description", label: "Description", width: 320 },
    {
      key: "amountFormatted",
      label: "Amount",
      width: 160,
      render: (value, row) => (
        <span className={row?.isTotal ? "fw-bold" : "fw-semibold"}>
          {value}
        </span>
      ),
    },
  ];

  const handleRefresh = async () => {
    await loadAllData({ forceRefresh: true });
    showInfo("Balance sheet refreshed!");
  };

  return (
    <div className="container-fluid">
      <div
        className="py-3 d-flex justify-content-between align-items-center flex-wrap"
        style={{ marginTop: "70px" }}
      >
        <div>
          <h4 className="fs-18 fw-semibold m-0">Balance Sheet</h4>
          <small className="text-muted">
            Assets, liabilities, and equity as of selected financial year
          </small>
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
            className={`badge ${getStatusBadgeClass(apiStatus.balanceSheet)} d-inline-flex align-items-center`}
            style={{
              cursor:
                apiStatus.balanceSheet === "failed" ? "pointer" : "default",
            }}
            onClick={() =>
              apiStatus.balanceSheet === "failed" &&
              retrySingleApi("balanceSheet")
            }
          >
            {renderStatusContent("Balance", apiStatus.balanceSheet)}
          </span>

          <span
            className={`badge d-inline-flex align-items-center ${isBalanceMatched ? "bg-success" : "bg-danger"}`}
            title={
              isBalanceMatched
                ? "Assets and Liabilities + Equity are matched"
                : "Assets and Liabilities + Equity are not matched"
            }
          >
            {isBalanceMatched
              ? "Balanced"
              : `Mismatch ${formatCurrency(Math.abs(balanceDifference))}`}
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
            <div key={card.key} className="col-md-6 col-xl-2 mb-4">
              <div
                className={`card border-0 shadow-sm overflow-hidden ${cardClass}`}
                style={{
                  transition: "all 0.3s ease",
                  cursor: "pointer",
                  height: "100%",
                  borderRadius: "12px",
                  border: isActive ? "2px solid #0d6efd" : "1px solid #dee2e6",
                  boxShadow: isActive
                    ? "0 6px 15px rgba(13, 110, 253, 0.3)"
                    : "0 0.125rem 0.25rem rgba(0, 0, 0, 0.075)",
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
        moduleKey="balanceSheet"
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
        tableTitle="Balance Sheet"
        showColumnSelector={true}
        showExport={true}
        showRefresh={true}
        showAdvancedFilter={false}
        showSearch={true}
        onRefresh={handleRefresh}
        exportFileName="Balance_Sheet"
        exportTitle="Balance Sheet Report"
      />
    </div>
  );
};

export default BalanceSheet;
