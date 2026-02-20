import React, { useEffect, useMemo, useState } from "react";
import ReusableTable from "../Components/ReusableTable";
import { showError, showInfo } from "../Components/ToastNotification";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { apiGet } from "../utils/api";

const DetailedLedgerManagement = () => {
  useEffect(() => {
    document.title = "Detailed Ledger | MaxCode IT Services";
  }, []);

  const [financialYears, setFinancialYears] = useState([]);
  const [selectedFinancialYear, setSelectedFinancialYear] = useState(
    localStorage.getItem("selectedFinancialYear") || "ALL",
  );
  const [salesRecords, setSalesRecords] = useState([]);
  const [purchaseRecords, setPurchaseRecords] = useState([]);
  const [companyExpenseRecords, setCompanyExpenseRecords] = useState([]);
  const [rcmRecords, setRcmRecords] = useState([]);
  const [projectRecords, setProjectRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [financialPeriodMode, setFinancialPeriodMode] = useState("yearly");
  const [recordTypeMode, setRecordTypeMode] = useState("all");

  const toNumber = (value) => {
    const num = parseFloat(value);
    return Number.isNaN(num) ? 0 : num;
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

  const getTaxAmount = (record) => {
    const taxData = record?.taxData || {};
    const cgst = toNumber(taxData.cgst || 0);
    const sgst = toNumber(taxData.sgst || 0);
    const igst = toNumber(taxData.igst || 0);
    const explicitTax = cgst + sgst + igst;

    if (explicitTax > 0) return explicitTax;

    const totalAmount = toNumber(taxData.totalAmount || 0);
    const taxableAmount = toNumber(
      taxData.taxableAmount || taxData.subtotal || 0,
    );
    return Math.max(totalAmount - taxableAmount, 0);
  };

  const getTaxableAmount = (record) => {
    const taxData = record?.taxData || {};
    const taxable = toNumber(taxData.taxableAmount || taxData.subtotal || 0);
    if (taxable > 0) return taxable;

    const totalAmount = toNumber(taxData.totalAmount || 0);
    const taxAmount = getTaxAmount(record);
    return Math.max(totalAmount - taxAmount, 0);
  };

  const getTotalAmount = (record) =>
    toNumber(record?.taxData?.totalAmount || record?.amount || 0);

  const getReceivedAmount = (record, totalAmount) => {
    const explicitPaid = Math.max(
      toNumber(record?.amountReceived || 0),
      toNumber(record?.paidAmount || 0),
      toNumber(record?.amountPaid || 0),
    );

    if (explicitPaid > 0) {
      return Math.min(explicitPaid, totalAmount);
    }

    if (record?.paymentStatus === "Paid") {
      return totalAmount;
    }

    return 0;
  };

  const getPeriodDisplay = (invoiceDate, mode) => {
    const date = getDateOnly(invoiceDate);
    if (!date) return "-";

    if (mode === "daily") {
      return formatDateForDisplay(invoiceDate);
    }

    if (mode === "monthly") {
      const month = String(date.getMonth() + 1).padStart(2, "0");
      return `${month}/${date.getFullYear()}`;
    }

    return String(date.getFullYear());
  };

  const loadAllData = async () => {
    setLoading(true);
    try {
      const [
        yearsResult,
        salesResult,
        purchaseResult,
        companyExpenseResult,
        rcmResult,
        projectsResult,
      ] = await Promise.allSettled([
        apiGet(API_ENDPOINTS.YEARS.LIST),
        apiGet(API_ENDPOINTS.INVOICES.LIST),
        apiGet(API_ENDPOINTS.PURCHASES.LIST),
        apiGet(API_ENDPOINTS.COMPANY_EXPENSES.LIST),
        apiGet(API_ENDPOINTS.RCM.LIST),
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

      const invoicesData =
        salesResult.status === "fulfilled"
          ? Array.isArray(salesResult.value.data)
            ? salesResult.value.data
            : salesResult.value.data?.invoices || []
          : [];

      const purchasesData =
        purchaseResult.status === "fulfilled"
          ? Array.isArray(purchaseResult.value.data)
            ? purchaseResult.value.data
            : purchaseResult.value.data?.purchases || []
          : [];

      const companyExpensesData =
        companyExpenseResult.status === "fulfilled"
          ? Array.isArray(companyExpenseResult.value.data)
            ? companyExpenseResult.value.data
            : companyExpenseResult.value.data?.companyExpenses ||
              companyExpenseResult.value.data?.expenses ||
              []
          : [];

      const rcmData =
        rcmResult.status === "fulfilled"
          ? Array.isArray(rcmResult.value.data)
            ? rcmResult.value.data
            : rcmResult.value.data?.records || rcmResult.value.data?.rcm || []
          : [];

      const projectsData =
        projectsResult.status === "fulfilled"
          ? Array.isArray(projectsResult.value.data)
            ? projectsResult.value.data
            : projectsResult.value.data?.projects || []
          : [];

      setFinancialYears(normalizedYears);
      setSalesRecords(
        invoicesData.map((record) => ({
          ...record,
          id: record._id || record.id,
        })),
      );
      setPurchaseRecords(
        purchasesData.map((record) => ({
          ...record,
          id: record._id || record.id,
        })),
      );
      setCompanyExpenseRecords(
        companyExpensesData.map((record) => ({
          ...record,
          id: record._id || record.id,
        })),
      );
      setRcmRecords(
        rcmData.map((record) => ({
          ...record,
          id: record._id || record.id,
        })),
      );
      setProjectRecords(
        projectsData.map((record) => ({
          ...record,
          id: record._id || record.id,
        })),
      );

      if (
        yearsResult.status === "rejected" ||
        salesResult.status === "rejected" ||
        purchaseResult.status === "rejected" ||
        companyExpenseResult.status === "rejected" ||
        rcmResult.status === "rejected" ||
        projectsResult.status === "rejected"
      ) {
        showInfo(
          "Some detailed ledger data could not be loaded. Please refresh.",
        );
      }
    } catch (error) {
      console.error("Failed to load detailed ledger data:", error);
      showError("Failed to fetch detailed ledger data");
      setFinancialYears([]);
      setSalesRecords([]);
      setPurchaseRecords([]);
      setCompanyExpenseRecords([]);
      setRcmRecords([]);
      setProjectRecords([]);
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

  const allLedgerRecords = useMemo(() => {
    const sales = salesRecords.map((record) => ({
      sourceType: "sales",
      type: "Sales",
      invoiceNo: record.invoiceNumber || "-",
      partySecondary: record.businessName || "-",
      raw: record,
    }));

    const purchases = purchaseRecords.map((record) => ({
      sourceType: "purchase",
      type: "Purchase",
      invoiceNo: record.invoiceNumber || "-",
      partySecondary: record.businessName || "-",
      raw: record,
    }));

    const companyExpenses = companyExpenseRecords.map((record) => ({
      sourceType: "companyExpense",
      type: "Company Expense",
      invoiceNo: record.expenseNumber || "-",
      partySecondary:
        record.partyName || record.businessName || record.vendorName || "-",
      raw: {
        ...record,
        invoiceDate: record.expenseDate || record.invoiceDate,
      },
    }));

    const rcm = rcmRecords.map((record) => ({
      sourceType: "rcm",
      type: "RCM",
      invoiceNo: record.selfInvoiceNumber || record.originalRefNo || "-",
      partySecondary: record.serviceProviderBusinessName || "-",
      raw: record,
    }));

    const project = projectRecords.flatMap((record) => {
      const transactions = Array.isArray(record.developerTransactions)
        ? record.developerTransactions
        : [];

      return transactions.map((transaction, index) => {
        const payoutAmount = toNumber(transaction.payoutAmount || 0);
        const payoutDate =
          transaction.payoutDate ||
          transaction.paymentDate ||
          record.projectDate ||
          record.createdDate ||
          "";

        return {
          sourceType: "project",
          type: "Developer Payout",
          invoiceNo: record.projectId || `PRJ-${record.id || index + 1}`,
          partySecondary: transaction.staffName || record.projectName || "-",
          raw: {
            id: `${record.id || record._id || "project"}-${transaction.id || index + 1}`,
            invoiceDate: payoutDate,
            gstin: "-",
            invoiceType: "Developer Payout",
            paymentMethod: transaction.payoutMethod || "Bank Transfer",
            paymentStatus: "Paid",
            amountPaid: payoutAmount,
            taxData: {
              taxableAmount: payoutAmount,
              subtotal: payoutAmount,
              totalAmount: payoutAmount,
              cgst: 0,
              sgst: 0,
              igst: 0,
              taxPercentage: 0,
            },
          },
        };
      });
    });

    return [...sales, ...purchases, ...companyExpenses, ...rcm, ...project];
  }, [
    salesRecords,
    purchaseRecords,
    companyExpenseRecords,
    rcmRecords,
    projectRecords,
  ]);

  const filteredLedgerRecords = useMemo(() => {
    const selectedRange = getSelectedYearRange();
    const today = getDateOnly(new Date());

    return allLedgerRecords.filter((entry) => {
      const record = entry.raw;
      const invoiceDate = getDateOnly(record.invoiceDate);
      if (!invoiceDate) return false;

      if (selectedRange) {
        const isWithinYear =
          invoiceDate >= selectedRange.startDate &&
          invoiceDate <= selectedRange.endDate;
        if (!isWithinYear) return false;
      }

      if (financialPeriodMode === "daily") {
        if (!today || invoiceDate.getTime() !== today.getTime()) return false;
      } else if (financialPeriodMode === "monthly") {
        if (
          !today ||
          invoiceDate.getFullYear() !== today.getFullYear() ||
          invoiceDate.getMonth() !== today.getMonth()
        ) {
          return false;
        }
      }

      if (recordTypeMode === "sales" && entry.sourceType !== "sales") {
        return false;
      }

      if (recordTypeMode === "purchase" && entry.sourceType !== "purchase") {
        return false;
      }

      if (
        recordTypeMode === "companyExpense" &&
        entry.sourceType !== "companyExpense"
      ) {
        return false;
      }

      if (recordTypeMode === "rcm" && entry.sourceType !== "rcm") {
        return false;
      }

      if (recordTypeMode === "project" && entry.sourceType !== "project") {
        return false;
      }

      return true;
    });
  }, [
    allLedgerRecords,
    selectedFinancialYear,
    financialYears,
    financialPeriodMode,
    recordTypeMode,
  ]);

  const tableData = useMemo(() => {
    return filteredLedgerRecords.map((entry, index) => {
      const record = entry.raw;
      const totalAmount = getTotalAmount(record);
      const taxableAmount = getTaxableAmount(record);
      const gstAmount = getTaxAmount(record);
      const receivedAmount = getReceivedAmount(record, totalAmount);
      const pendingAmount = Math.max(totalAmount - receivedAmount, 0);

      return {
        id: `${entry.sourceType}-${record.id || record._id || index}`,
        sn: index + 1,
        type: entry.type,
        period: getPeriodDisplay(record.invoiceDate, financialPeriodMode),
        date: formatDateForDisplay(record.invoiceDate),
        invoiceNo: entry.invoiceNo,
        clientSecondary: entry.partySecondary,
        gstin: record.gstin || "-",
        gstPercent: `${toNumber(record?.taxData?.taxPercentage || 0)}%`,
        taxable: taxableAmount,
        gstAmount,
        cgst: toNumber(record?.taxData?.cgst || 0),
        sgct: toNumber(record?.taxData?.sgst || 0),
        igst: toNumber(record?.taxData?.igst || 0),
        total: totalAmount,
        invoiceType: record.invoiceType || "-",
        paymentMode: record.paymentMethod || "-",
        received: receivedAmount,
        pending: pendingAmount,
        paid: record.paymentStatus || "-",
      };
    });
  }, [filteredLedgerRecords, financialPeriodMode]);

  const gstSummary = useMemo(() => {
    let salesOutput = 0;
    let purchaseInput = 0;
    let rcmTax = 0;

    filteredLedgerRecords.forEach((entry) => {
      const taxAmount = getTaxAmount(entry.raw);

      if (entry.sourceType === "sales") {
        salesOutput += taxAmount;
      } else if (entry.sourceType === "purchase") {
        purchaseInput += taxAmount;
      } else if (entry.sourceType === "rcm") {
        rcmTax += taxAmount;
      }
    });

    const outputGst = salesOutput + rcmTax;
    const inputGst = purchaseInput + rcmTax;

    return {
      outputGst,
      inputGst,
      rcmTax,
      totalPayable: outputGst - inputGst,
    };
  }, [filteredLedgerRecords]);

  const getCardNumber = (index) => {
    return (index % 8) + 1;
  };

  const handleCardClick = (cardKey) => {
    if (cardKey === "period") {
      const periodCycle = ["daily", "monthly", "yearly"];
      setFinancialPeriodMode((prev) => {
        const currentIndex = periodCycle.indexOf(prev);
        if (currentIndex === -1) return "daily";
        return periodCycle[(currentIndex + 1) % periodCycle.length];
      });
      return;
    }

    if (cardKey === "recordType") {
      const typeCycle = [
        "sales",
        "purchase",
        "companyExpense",
        "rcm",
        "project",
        "all",
      ];
      setRecordTypeMode((prev) => {
        const currentIndex = typeCycle.indexOf(prev);
        if (currentIndex === -1) return "sales";
        return typeCycle[(currentIndex + 1) % typeCycle.length];
      });
    }
  };

  const cards = [
    {
      key: "outputGst",
      title: "Output GST",
      value: formatCurrency(gstSummary.outputGst),
      icon: "fa-solid fa-receipt",
    },
    {
      key: "inputGst",
      title: "Input GST",
      value: formatCurrency(gstSummary.inputGst),
      icon: "fa-solid fa-file-circle-check",
    },
    {
      key: "rcmGst",
      title: "RCM GST",
      value: formatCurrency(gstSummary.rcmTax),
      icon: "fa-solid fa-arrows-rotate",
    },
    {
      key: "totalPayable",
      title: "Total Payable",
      value: formatCurrency(gstSummary.totalPayable),
      icon: "fa-solid fa-scale-balanced",
    },
    {
      key: "recordType",
      title: "Record Type",
      value:
        recordTypeMode === "sales"
          ? "Clients (Sales)"
          : recordTypeMode === "purchase"
            ? "Purchases (Vendor)"
            : recordTypeMode === "companyExpense"
              ? "Company Expense"
              : recordTypeMode === "rcm"
                ? "RCM"
                : recordTypeMode === "project"
                  ? "Developer Payout"
                  : "All",
      icon: "fa-solid fa-layer-group",
    },
    {
      key: "period",
      title: "Financial Period",
      value: `${financialPeriodMode.charAt(0).toUpperCase()}${financialPeriodMode.slice(1)}`,
      icon: "fa-regular fa-calendar-days",
    },
  ];

  const columns = [
    { key: "sn", label: "S.No", width: 70 },
    { key: "type", label: "Type", width: 120 },
    { key: "period", label: "Period", width: 120 },
    { key: "date", label: "Date", width: 120 },
    { key: "invoiceNo", label: "Invoice No/Payout ID", width: 150 },
    { key: "clientSecondary", label: "Client/Vendor Business", width: 220 },
    { key: "gstin", label: "GSTIN", width: 160 },
    { key: "gstPercent", label: "GST %", width: 90 },
    {
      key: "taxable",
      label: "Taxable",
      width: 130,
      render: (value) => (
        <span className="fw-semibold">{formatCurrency(value)}</span>
      ),
    },
    {
      key: "gstAmount",
      label: "GST Amount",
      width: 130,
      render: (value) => (
        <span className="fw-semibold">{formatCurrency(value)}</span>
      ),
    },
    {
      key: "cgst",
      label: "CGST",
      width: 120,
      render: (value) => (
        <span className="fw-semibold">{formatCurrency(value)}</span>
      ),
    },
    {
      key: "sgct",
      label: "SGCT",
      width: 120,
      render: (value) => (
        <span className="fw-semibold">{formatCurrency(value)}</span>
      ),
    },
    {
      key: "igst",
      label: "IGST",
      width: 120,
      render: (value) => (
        <span className="fw-semibold">{formatCurrency(value)}</span>
      ),
    },
    {
      key: "total",
      label: "Total",
      width: 130,
      render: (value) => (
        <span className="fw-semibold">{formatCurrency(value)}</span>
      ),
    },
    { key: "paymentMode", label: "Payment Mode", width: 140 },
    {
      key: "received",
      label: "Received/Payout",
      width: 130,
      render: (value) => (
        <span className="text-success fw-semibold">
          {formatCurrency(value)}
        </span>
      ),
    },
    {
      key: "pending",
      label: "Pending",
      width: 130,
      render: (value) => (
        <span className="text-danger fw-semibold">{formatCurrency(value)}</span>
      ),
    },
    {
      key: "paid",
      label: "Paid",
      width: 100,
      render: (value) => {
        let badgeClass = "bg-secondary";
        if (value === "Paid") badgeClass = "bg-success";
        else if (value === "Unpaid") badgeClass = "bg-danger";
        else if (value === "Partial") badgeClass = "bg-warning";
        return <span className={`badge ${badgeClass}`}>{value}</span>;
      },
    },
  ];

  const handleRefresh = async () => {
    await loadAllData();
    showInfo("Detailed ledger refreshed!");
  };

  const columnsWithDropdownFilter = ["type", "paymentMode"];
  const columnsWithDateFilter = ["date"];

  const filterOptions = {
    type: [
      "All",
      "Sales",
      "Purchase",
      "Company Expense",
      "RCM",
      "Developer Payout",
    ],
    paymentMode: [
      "All",
      "Cash",
      "Bank Transfer",
      "Credit Card",
      "Debit Card",
      "UPI",
      "Cheque",
      "-",
    ],
  };

  return (
    <div className="container-fluid">
      <div
        className="py-3 d-flex align-items-sm-center flex-sm-row flex-column"
        style={{ marginTop: "70px" }}
      >
        <div className="flex-grow-1">
          <h4 className="fs-18 fw-semibold m-0">Detailed Ledger Register</h4>
          <small className="text-muted">
            Combined Sales, Purchase, Company Expense, RCM and Developer payout
            ledger records
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
                  cursor: "pointer",
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
          "type",
          "date",
          "invoiceNo",
          "clientSecondary",
          "taxable",
          "gstAmount",
          "cgst",
          "sgct",
          "igst",
          "total",
          "paymentMode",
          "received",
        ]}
        columnsWithDropdownFilter={columnsWithDropdownFilter}
        columnsWithDateFilter={columnsWithDateFilter}
        filterOptions={filterOptions}
        tableTitle="Detailed Ledger"
        showColumnSelector={true}
        showExport={true}
        showRefresh={true}
        showAdvancedFilter={true}
        showSearch={true}
        onRefresh={handleRefresh}
        exportFileName="Detailed_Ledger"
        exportTitle="Detailed Ledger Report"
      />
    </div>
  );
};

export default DetailedLedgerManagement;
