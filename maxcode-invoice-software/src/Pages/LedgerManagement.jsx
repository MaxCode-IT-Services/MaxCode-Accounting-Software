import React, { useEffect, useMemo, useState, useCallback } from "react";
import ReusableTable from "../Components/ReusableTable";
import { showError, showInfo } from "../Components/ToastNotification";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { apiGet } from "../utils/api";

const LedgerManagement = () => {
  useEffect(() => {
    document.title = "Ledger Management | MaxCode IT Services";
  }, []);

  const [financialYears, setFinancialYears] = useState([]);
  const [selectedFinancialYear, setSelectedFinancialYear] = useState(
    localStorage.getItem("selectedFinancialYear") || "ALL",
  );
  const [ledgerData, setLedgerData] = useState({
    totalDebit: 0,
    totalCredit: 0,
    cashClosing: 0,
    bankClosing: 0,
    bankClosingType: "Dr",
    gstNet: 0,
    gstNetType: "Dr",
    ledgerRows: [],
  });
  const [loading, setLoading] = useState(false);
  const [activeCardFilter, setActiveCardFilter] = useState("total");
  const [financialPeriodMode, setFinancialPeriodMode] = useState("yearly");
  const [apiStatus, setApiStatus] = useState({
    years: "idle",
    ledger: "idle",
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

  const getBalanceMeta = (debit, credit) => {
    const diff = toNumber(debit) - toNumber(credit);
    if (diff > 0) {
      return {
        text: `+ ${formatCurrency(diff)} Dr`,
        className: "text-success",
      };
    }
    if (diff < 0) {
      return {
        text: `- ${formatCurrency(Math.abs(diff))} Cr`,
        className: "text-danger",
      };
    }
    return { text: formatCurrency(0), className: "text-muted" };
  };

  const buildBalanceCell = (debit, credit) => {
    return getBalanceMeta(debit, credit).text;
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

  const loadLedgerSummary = useCallback(
    async ({
      forceRefresh = false,
      financialYear = selectedFinancialYear,
    } = {}) => {
      setApiStatus((prev) => ({ ...prev, ledger: "loading" }));
      setLoading(true);
      try {
        const url = API_ENDPOINTS.LEDGER_SUMMARY.GET(financialYear);
        const response = await apiGet(url, { forceRefresh });
        const payload = extractPayload(response);
        setLedgerData(
          payload || {
            totalDebit: 0,
            totalCredit: 0,
            cashClosing: 0,
            bankClosing: 0,
            bankClosingType: "Dr",
            gstNet: 0,
            gstNetType: "Dr",
            ledgerRows: [],
          },
        );
        setApiStatus((prev) => ({ ...prev, ledger: "loaded" }));
        return payload;
      } catch (error) {
        console.error("Failed to load ledger summary:", error);
        showError("Failed to fetch ledger data");
        setApiStatus((prev) => ({ ...prev, ledger: "failed" }));
        throw error;
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
        loadLedgerSummary({ forceRefresh }),
      ]);
    },
    [loadFinancialYears, loadLedgerSummary],
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
      loadLedgerSummary({ financialYear: selectedFinancialYear });
    }
  }, [selectedFinancialYear, loadLedgerSummary]);

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
      } else if (apiKey === "ledger") {
        await loadLedgerSummary({ forceRefresh: true });
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

  const ledgerRows = useMemo(() => {
    if (!ledgerData.ledgerRows || !ledgerData.ledgerRows.length) return [];
    return ledgerData.ledgerRows.map((row) => ({
      ...row,
      balanceText: buildBalanceCell(row.debit, row.credit),
      balanceClass: getBalanceMeta(row.debit, row.credit).className,
    }));
  }, [ledgerData]);

  const cards = [
    {
      key: "total",
      title: "Total Debit",
      value: formatCurrency(ledgerData.totalDebit),
      icon: "fa-solid fa-arrow-trend-up",
      colorClass: "text-success",
    },
    {
      key: "credit",
      title: "Total Credit",
      value: formatCurrency(ledgerData.totalCredit),
      icon: "fa-solid fa-arrow-trend-down",
      colorClass: "text-danger",
    },
    {
      key: "cash",
      title: "Cash Closing",
      value: formatCurrency(ledgerData.cashClosing),
      icon: "fa-solid fa-wallet",
      colorClass: "text-primary",
    },
    {
      key: "bank",
      title: "Bank Closing",
      value: `${formatCurrency(ledgerData.bankClosing)} ${ledgerData.bankClosingType}`,
      icon: "fa-solid fa-building-columns",
      colorClass: "text-info",
    },
    {
      key: "gst",
      title: "GST Net",
      value: `${formatCurrency(ledgerData.gstNet)} ${ledgerData.gstNetType}`,
      icon: "fa-solid fa-receipt",
      colorClass: "text-warning",
    },
    {
      key: "year",
      title: "Financial Year",
      value: `${selectedFinancialYear === "ALL" ? "All Year" : selectedFinancialYear} • ${
        financialPeriodMode.charAt(0).toUpperCase() +
        financialPeriodMode.slice(1)
      }`,
      icon: "fa-regular fa-calendar-days",
      colorClass: "text-secondary",
    },
  ];

  const getCardNumber = (index) => {
    return (index % 8) + 1;
  };

  const handleCardClick = (cardKey) => {
    if (cardKey === "year") {
      const periodCycle = ["daily", "monthly", "yearly"];
      setFinancialPeriodMode((prev) => {
        const currentIndex = periodCycle.indexOf(prev);
        if (currentIndex === -1) return "daily";
        return periodCycle[(currentIndex + 1) % periodCycle.length];
      });
    }
    setActiveCardFilter(cardKey);
  };

  const filteredLedgerRows = useMemo(() => {
    if (activeCardFilter === "total") return ledgerRows;
    if (activeCardFilter === "credit") {
      return ledgerRows.filter((row) =>
        [
          "Sales Account",
          "Credit Note / Customer Refund Payable",
          "GST Output Account",
          "Sundry Creditors Account",
          "Customer Credit Balance (Overpayment)",
          "Owner Funding Account",
          "Owner Investment Account",
          "GST Payable/(Receivable)",
        ].includes(row.accountName),
      );
    }
    if (activeCardFilter === "cash") {
      return ledgerRows.filter((row) => row.accountName === "Cash Account");
    }
    if (activeCardFilter === "bank") {
      return ledgerRows.filter((row) => row.accountName === "Bank Account");
    }
    if (activeCardFilter === "gst") {
      return ledgerRows.filter((row) =>
        [
          "GST Output Account",
          "GST Input Account",
          "GST Payable/(Receivable)",
        ].includes(row.accountName),
      );
    }
    if (activeCardFilter === "year") {
      return ledgerRows;
    }
    return ledgerRows;
  }, [activeCardFilter, ledgerRows]);

  const columns = [
    { key: "sn", label: "S.No", width: 70 },
    { key: "accountName", label: "Ledger Account", width: 220 },
    {
      key: "debit",
      label: "Debit",
      width: 140,
      render: (value) => (
        <span className="fw-semibold">{formatCurrency(value)}</span>
      ),
    },
    {
      key: "credit",
      label: "Credit",
      width: 140,
      render: (value) => (
        <span className="fw-semibold">{formatCurrency(value)}</span>
      ),
    },
    {
      key: "balanceText",
      label: "Balance",
      width: 160,
      render: (value, row) => (
        <span className={`fw-semibold ${row?.balanceClass || "text-muted"}`}>
          {value}
        </span>
      ),
    },
    { key: "notes", label: "Ledger Logic", width: 340 },
    { key: "description", label: "Description", width: 420 },
  ];

  const handleRefresh = async () => {
    await loadAllData({ forceRefresh: true });
    showInfo("Ledger refreshed!");
  };

  return (
    <div className="container-fluid">
      <div
        className="py-3 d-flex justify-content-between align-items-start flex-wrap"
        style={{ marginTop: "70px" }}
      >
        <div>
          <h4 className="fs-18 fw-semibold m-0">Ledger Management</h4>
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
            className={`badge ${getStatusBadgeClass(apiStatus.ledger)} d-inline-flex align-items-center`}
            style={{
              cursor: apiStatus.ledger === "failed" ? "pointer" : "default",
            }}
            onClick={() =>
              apiStatus.ledger === "failed" && retrySingleApi("ledger")
            }
          >
            {renderStatusContent("Ledger", apiStatus.ledger)}
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
            <div key={card.title} className="col-md-6 col-xl-2 mb-4">
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
                  <h5 className="mb-2 fw-bold">{card.title}</h5>
                  <h6 className="mb-0 text-muted fw-bold">
                    {card.value}
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
        moduleKey="ledgerManagement"
        columns={columns}
        data={filteredLedgerRows}
        loading={loading}
        showActions={false}
        fixedColumns={["sn"]}
        defaultVisibleColumns={[
          "sn",
          "accountName",
          "debit",
          "credit",
          "balanceText",
          "notes",
        ]}
        tableTitle="Ledger Register"
        showColumnSelector={true}
        showExport={true}
        showRefresh={true}
        showAdvancedFilter={true}
        showSearch={true}
        onRefresh={handleRefresh}
        exportFileName="Ledger_Management"
        exportTitle="Ledger Management Report"
      />
    </div>
  );
};

export default LedgerManagement;
