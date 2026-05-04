import React, { useEffect, useMemo, useState } from "react";
import ReusableTable from "../Components/ReusableTable";
import { showError, showInfo } from "../Components/ToastNotification";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { apiGet } from "../utils/api";

const LedgerManagement = () => {
  useEffect(() => {
    document.title = "Ledger Management | MaxCode IT Services";
  }, []);

  const [selectedFinancialYear, setSelectedFinancialYear] = useState(
    localStorage.getItem("selectedFinancialYear") || "ALL",
  );
  const [loading, setLoading] = useState(false);
  const [activeCardFilter, setActiveCardFilter] = useState("total");
  const [financialPeriodMode, setFinancialPeriodMode] = useState("yearly");
  const [ledgerSummary, setLedgerSummary] = useState({
    cashDebit: 0,
    cashCredit: 0,
    bankDebit: 0,
    bankCredit: 0,
    salesCredit: 0,
    salesReturnDebit: 0,
    purchaseDebit: 0,
    companyExpenseDebit: 0,
    projectPayoutDebit: 0,
    gstOutputDebit: 0,
    gstOutputCredit: 0,
    gstInputDebit: 0,
    sundryDebtorsDebit: 0,
    sundryCreditorsCredit: 0,
    customerAdvanceLiabilityCredit: 0,
    creditNotePayableCredit: 0,
    customerOverpaymentCredit: 0,
    ownerFundingCredit: 0,
    personalFundCredit: 0,
    totalDebit: 0,
    totalCredit: 0,
  });
  const [ledgerRows, setLedgerRows] = useState([]);
  const [validation, setValidation] = useState(null);
  const [migration, setMigration] = useState(null);

  const toNumber = (value) => {
    const num = parseFloat(value);
    return Number.isNaN(num) ? 0 : num;
  };

  const formatCurrency = (value) => {
    return `? ${toNumber(value).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const fetchLedgerReport = async ({ forceRemigrate = false } = {}) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append("financialYear", selectedFinancialYear || "ALL");
      params.append("period", financialPeriodMode || "yearly");
      if (forceRemigrate) {
        params.append("remigrate", "true");
      }

      const response = await apiGet(
        `${API_ENDPOINTS.LEDGER.REPORT}?${params.toString()}`,
      );

      const payload = response?.data || {};
      setLedgerSummary(payload.summary || {});
      setLedgerRows(Array.isArray(payload.rows) ? payload.rows : []);
      setValidation(payload.validation || null);
      setMigration(payload.migration || null);
    } catch (error) {
      console.error("Failed to fetch ledger report:", error);
      showError("Failed to fetch ledger data");
      setLedgerSummary({
        cashDebit: 0,
        cashCredit: 0,
        bankDebit: 0,
        bankCredit: 0,
        salesCredit: 0,
        salesReturnDebit: 0,
        purchaseDebit: 0,
        companyExpenseDebit: 0,
        projectPayoutDebit: 0,
        gstOutputDebit: 0,
        gstOutputCredit: 0,
        gstInputDebit: 0,
        sundryDebtorsDebit: 0,
        sundryCreditorsCredit: 0,
        customerAdvanceLiabilityCredit: 0,
        creditNotePayableCredit: 0,
        customerOverpaymentCredit: 0,
        ownerFundingCredit: 0,
        personalFundCredit: 0,
        totalDebit: 0,
        totalCredit: 0,
      });
      setLedgerRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLedgerReport();

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

  useEffect(() => {
    fetchLedgerReport();
  }, [selectedFinancialYear, financialPeriodMode]);

  const cards = [
    {
      key: "total",
      title: "Total Debit",
      value: formatCurrency(ledgerSummary.totalDebit),
      icon: "fa-solid fa-arrow-trend-up",
      colorClass: "text-success",
    },
    {
      key: "credit",
      title: "Total Credit",
      value: formatCurrency(ledgerSummary.totalCredit),
      icon: "fa-solid fa-arrow-trend-down",
      colorClass: "text-danger",
    },
    {
      key: "cash",
      title: "Cash Closing",
      value:
        toNumber(ledgerSummary.cashDebit) -
          toNumber(ledgerSummary.cashCredit) >=
        0
          ? `+ ${formatCurrency(toNumber(ledgerSummary.cashDebit) - toNumber(ledgerSummary.cashCredit))} Dr`
          : `- ${formatCurrency(Math.abs(toNumber(ledgerSummary.cashDebit) - toNumber(ledgerSummary.cashCredit)))} Cr`,
      icon: "fa-solid fa-wallet",
      colorClass: "text-primary",
    },
    {
      key: "bank",
      title: "Bank Closing",
      value:
        toNumber(ledgerSummary.bankDebit) -
          toNumber(ledgerSummary.bankCredit) >=
        0
          ? `+ ${formatCurrency(toNumber(ledgerSummary.bankDebit) - toNumber(ledgerSummary.bankCredit))} Dr`
          : `- ${formatCurrency(Math.abs(toNumber(ledgerSummary.bankDebit) - toNumber(ledgerSummary.bankCredit)))} Cr`,
      icon: "fa-solid fa-building-columns",
      colorClass: "text-info",
    },
    {
      key: "gst",
      title: "GST Net",
      value:
        toNumber(ledgerSummary.gstInputDebit) -
          toNumber(ledgerSummary.gstOutputCredit) >=
        0
          ? `+ ${formatCurrency(toNumber(ledgerSummary.gstInputDebit) - toNumber(ledgerSummary.gstOutputCredit))} Dr`
          : `- ${formatCurrency(Math.abs(toNumber(ledgerSummary.gstInputDebit) - toNumber(ledgerSummary.gstOutputCredit)))} Cr`,
      icon: "fa-solid fa-receipt",
      colorClass: "text-warning",
    },
    {
      key: "year",
      title: "Financial Year",
      value: `${selectedFinancialYear === "ALL" ? "All Year" : selectedFinancialYear} � ${
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
    if (activeCardFilter === "total") {
      return ledgerRows;
    }

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
      key: "balance",
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
    await fetchLedgerReport();
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
            Transaction Engine
          </span>
          <span className="badge bg-info d-inline-flex align-items-center">
            FY: {selectedFinancialYear}
          </span>
          <span className="badge bg-secondary d-inline-flex align-items-center">
            Period: {financialPeriodMode}
          </span>
          <span
            className={`badge d-inline-flex align-items-center ${
              validation?.isBalanced ? "bg-success" : "bg-danger"
            }`}
          >
            {validation?.isBalanced ? "Dr=Cr Matched" : "Dr=Cr Mismatch"}
          </span>
          <span className="badge bg-primary d-inline-flex align-items-center">
            Txns: {validation?.totalTransactions || 0}
          </span>
          {migration?.didMigrate && (
            <span className="badge bg-warning text-dark d-inline-flex align-items-center">
              Migrated: {migration?.migratedCount || 0}
            </span>
          )}
          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            onClick={() => fetchLedgerReport({ forceRemigrate: true })}
            disabled={loading}
            title="Force rebuild transactions from old data"
          >
            <i className="fa-solid fa-arrows-rotate me-1"></i>
            Re-Migrate
          </button>
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
                className={`card border-0 shadow-sm overflow-hidden ${cardClass}`}
                style={{
                  transition: "all 0.3s ease",
                  cursor: "pointer",
                  height: "100%",
                  borderRadius: "12px",
                  border: isActive ? "2px solid #0d6efd" : "1px solid #dee2e6",
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
          "balance",
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
