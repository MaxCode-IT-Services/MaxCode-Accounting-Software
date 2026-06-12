import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { showError } from "../Components/ToastNotification";
import { apiGet } from "../utils/api";
import API_ENDPOINTS from "../utils/apiEndpoints";

const toNumber = (value) => {
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const formatCurrency = (value) =>
  `₹ ${toNumber(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const hexToRgba = (hex, alpha) => {
  const normalized = (hex || "").replace("#", "");
  if (normalized.length !== 6) return `rgba(0, 112, 38, ${alpha})`;
  const bigint = Number.parseInt(normalized, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const getDateOnly = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const getRecordDate = (record) => {
  const dateKeys = [
    "invoiceDate",
    "projectDate",
    "paymentDate",
    "payoutDate",
    "createdDate",
    "createdAt",
    "date",
  ];

  for (const key of dateKeys) {
    if (record?.[key]) {
      const date = getDateOnly(record[key]);
      if (date) return date;
    }
  }

  return null;
};

const getTaxAmount = (record) => {
  const taxData = record?.taxData || {};
  const explicitTax =
    toNumber(taxData.cgst || 0) +
    toNumber(taxData.sgst || 0) +
    toNumber(taxData.igst || 0);

  if (explicitTax > 0) return explicitTax;

  const total = toNumber(taxData.totalAmount || 0);
  const taxable = toNumber(taxData.taxableAmount || taxData.subtotal || 0);
  return Math.max(total - taxable, 0);
};

const getTotalAmount = (record) =>
  toNumber(record?.taxData?.totalAmount || record?.totalAmount || 0);

const getPaidAmount = (record, totalAmount) => {
  const explicitPaid = Math.max(
    toNumber(record?.amountReceived || 0),
    toNumber(record?.paidAmount || 0),
    toNumber(record?.amountPaid || 0),
  );

  if (explicitPaid > 0) return Math.min(explicitPaid, totalAmount);
  if (record?.paymentStatus === "Paid") return totalAmount;
  return 0;
};

const Dashboard = () => {
  const navigate = useNavigate();

  // Animated counter component (smoothly animates numeric values)
  const Counter = ({ value = 0, format = "currency", duration = 900 }) => {
    const [display, setDisplay] = useState(0);

    useEffect(() => {
      let start = null;
      const from = Number(display) || 0;
      const to = Number(value) || 0;
      if (from === to) return setDisplay(to);

      const step = (timestamp) => {
        if (!start) start = timestamp;
        const progress = Math.min((timestamp - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = from + (to - from) * eased;
        setDisplay(current);
        if (progress < 1) {
          requestAnimationFrame(step);
        }
      };

      const raf = requestAnimationFrame(step);
      return () => cancelAnimationFrame(raf);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    if (format === "int") return <span>{Math.round(display).toLocaleString("en-IN")}</span>;
    if (format === "currency") return (
      <span>
        {`₹ ${Math.max(0, Math.round(display)).toLocaleString("en-IN", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`}
      </span>
    );
    return <span>{display}</span>;
  };

  useEffect(() => {
    document.title = "Dashboard | MaxCode IT Services";
  }, []);

  const [loading, setLoading] = useState(false);
  const [financialYears, setFinancialYears] = useState([]);
  const [selectedFinancialYear, setSelectedFinancialYear] = useState(
    localStorage.getItem("selectedFinancialYear") || "ALL",
  );

  const [clients, setClients] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [staff, setStaff] = useState([]);
  const [services, setServices] = useState([]);
  const [sales, setSales] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [rcm, setRcm] = useState([]);
  const [paymentReceipts, setPaymentReceipts] = useState([]);
  const [projects, setProjects] = useState([]);

  const getSelectedYearRange = () => {
    if (!selectedFinancialYear || selectedFinancialYear === "ALL") return null;

    const matchedYear = financialYears.find(
      (year) => year.value === selectedFinancialYear,
    );
    if (!matchedYear?.startDate || !matchedYear?.endDate) return null;

    const startDate = getDateOnly(matchedYear.startDate);
    const endDate = getDateOnly(matchedYear.endDate);
    if (!startDate || !endDate) return null;

    return { startDate, endDate };
  };

  const filterByFinancialYear = (records) => {
    if (!Array.isArray(records)) return [];

    const selectedRange = getSelectedYearRange();
    if (!selectedRange) return records;

    return records.filter((record) => {
      const date = getRecordDate(record);
      if (!date) return false;
      return date >= selectedRange.startDate && date <= selectedRange.endDate;
    });
  };

  const loadDashboardData = async (options = {}) => {
    const { forceRefresh = false } = options;
    setLoading(true);
    try {
      const cacheBuster = forceRefresh ? `?ts=${Date.now()}` : "";
      const response = await apiGet(
        `${API_ENDPOINTS.DASHBOARD.SUMMARY}${cacheBuster}`,
      );
      const payload = response?.data || {};

      const yearData = Array.isArray(payload.years) ? payload.years : [];
      const clientsData = Array.isArray(payload.clients) ? payload.clients : [];
      const vendorsData = Array.isArray(payload.vendors) ? payload.vendors : [];
      const staffData = Array.isArray(payload.staff) ? payload.staff : [];
      const servicesData = Array.isArray(payload.services)
        ? payload.services
        : [];
      const salesData = Array.isArray(payload.invoices) ? payload.invoices : [];
      const purchasesData = Array.isArray(payload.purchases)
        ? payload.purchases
        : [];
      const rcmData = Array.isArray(payload.rcm) ? payload.rcm : [];
      const paymentReceiptsData = Array.isArray(payload.paymentReceipts)
        ? payload.paymentReceipts
        : [];
      const projectsData = Array.isArray(payload.projects)
        ? payload.projects
        : [];

      setFinancialYears(
        yearData
          .filter((record) => record?.isDeleted !== true)
          .map((record) => ({
            ...record,
            id: record._id || record.id,
            value: record.financialYear || record.year,
          })),
      );

      setClients(clientsData.filter((record) => record?.isDeleted !== true));

      setVendors(vendorsData.filter((record) => record?.isDeleted !== true));

      setStaff(staffData.filter((record) => record?.isDeleted !== true));

      setServices(servicesData.filter((record) => record?.isDeleted !== true));

      setSales(salesData.filter((record) => record?.isDeleted !== true));

      setPurchases(
        purchasesData.filter((record) => record?.isDeleted !== true),
      );

      setRcm(rcmData.filter((record) => record?.isDeleted !== true));

      setPaymentReceipts(
        paymentReceiptsData.filter((record) => record?.isDeleted !== true),
      );

      setProjects(projectsData.filter((record) => record?.isDeleted !== true));
    } catch (error) {
      console.error("Failed to load dashboard data:", error);
      showError("Failed to fetch dashboard data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();

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

  const summary = useMemo(() => {
    const filteredSales = filterByFinancialYear(sales);
    const filteredPurchases = filterByFinancialYear(purchases);
    const filteredRcm = filterByFinancialYear(rcm);
    const filteredPaymentReceipts = filterByFinancialYear(paymentReceipts);
    const filteredProjects = filterByFinancialYear(projects);
    const filteredServices = filterByFinancialYear(services);

    const advanceTotals = filteredPaymentReceipts.reduce(
      (acc, record) => {
        if (String(record?.paymentType || "").toLowerCase() !== "advance") {
          return acc;
        }

        const amount = toNumber(record.amount || 0);
        const adjustedAmount = toNumber(record.adjustedAmount || 0);
        const refundedAmount = toNumber(record.refundedAmount || 0);
        const remainingAmount = Math.max(
          amount - adjustedAmount - refundedAmount,
          0,
        );
        acc.total += amount;
        acc.adjusted += adjustedAmount;
        acc.refunded += refundedAmount;
        acc.balance += remainingAmount;
        return acc;
      },
      { total: 0, adjusted: 0, refunded: 0, balance: 0 },
    );

    const salesTotals = filteredSales.reduce(
      (acc, record) => {
        const total = getTotalAmount(record);
        const paid = getPaidAmount(record, total);
        acc.total += total;
        acc.received += paid;
        acc.pending += Math.max(total - paid, 0);
        acc.tax += getTaxAmount(record);
        return acc;
      },
      { total: 0, received: 0, pending: 0, tax: 0 },
    );

    const purchaseTotals = filteredPurchases.reduce(
      (acc, record) => {
        const total = getTotalAmount(record);
        const paid = getPaidAmount(record, total);
        acc.total += total;
        acc.paid += paid;
        acc.pending += Math.max(total - paid, 0);
        acc.tax += getTaxAmount(record);
        return acc;
      },
      { total: 0, paid: 0, pending: 0, tax: 0 },
    );

    const rcmTotals = filteredRcm.reduce(
      (acc, record) => {
        const total = getTotalAmount(record);
        const paid = getPaidAmount(record, total);
        acc.total += total;
        acc.paid += paid;
        acc.pending += Math.max(total - paid, 0);
        acc.tax += getTaxAmount(record);
        return acc;
      },
      { total: 0, paid: 0, pending: 0, tax: 0 },
    );

    const projectSummary = filteredProjects.reduce(
      (acc, project) => {
        const details = Array.isArray(project.paymentDetails)
          ? project.paymentDetails
          : [];
        const payouts = Array.isArray(project.developerTransactions)
          ? project.developerTransactions
          : [];

        const clientReceived = details.reduce(
          (sum, row) => sum + toNumber(row.totalAmount || row.amount || 0),
          0,
        );

        const payoutTotal = payouts.reduce(
          (sum, row) => sum + toNumber(row.payoutAmount || 0),
          0,
        );

        acc.clientReceived += clientReceived;
        acc.payoutTotal += payoutTotal;
        return acc;
      },
      { clientReceived: 0, payoutTotal: 0 },
    );

    const netCashflow =
      salesTotals.received -
      purchaseTotals.paid -
      rcmTotals.paid -
      projectSummary.payoutTotal;

    const estimatedProfit =
      salesTotals.received -
      (purchaseTotals.total + rcmTotals.total + projectSummary.payoutTotal);

    return {
      counts: {
        clients: filterByFinancialYear(clients).length,
        vendors: filterByFinancialYear(vendors).length,
        staff: filterByFinancialYear(staff).length,
        services: filteredServices.length,
        invoices: filteredSales.length,
        purchases: filteredPurchases.length,
        projects: filteredProjects.length,
      },
      salesTotals,
      purchaseTotals,
      rcmTotals,
      advanceTotals,
      projectSummary,
      netCashflow,
      estimatedProfit,
    };
  }, [
    sales,
    purchases,
    rcm,
    paymentReceipts,
    projects,
    services,
    clients,
    vendors,
    staff,
    selectedFinancialYear,
    financialYears,
  ]);

  const kpiCards = [
    {
      key: "sales-total",
      title: "Total Sales Value",
      rawValue: summary.salesTotals.total,
      format: "currency",
      icon: "fa-solid fa-file-invoice-dollar",
      route: "/admin/sales-management",
    },
    {
      key: "sales-received",
      title: "Payment Received",
      rawValue: summary.salesTotals.received,
      format: "currency",
      icon: "fa-solid fa-money-bill-trend-up",
      route: "/admin/sales-management",
    },
    {
      key: "purchase-paid",
      title: "Supplier Payment Paid",
      rawValue: summary.purchaseTotals.paid + summary.rcmTotals.paid,
      format: "currency",
      icon: "fa-solid fa-cart-shopping",
      route: "/admin/purchase-management",
    },
    {
      key: "project-payout",
      title: "Developer Payout",
      rawValue: summary.projectSummary.payoutTotal,
      format: "currency",
      icon: "fa-solid fa-money-check-dollar",
      route: "/admin/project-details",
    },
    {
      key: "net-cashflow",
      title: "Net Cash In Hand",
      rawValue: summary.netCashflow,
      format: "currency",
      icon: "fa-solid fa-scale-balanced",
      route: "/admin/ledger-management",
    },
    {
      key: "estimated-profit",
      title: "Estimated Profit",
      rawValue: summary.estimatedProfit,
      format: "currency",
      icon: "fa-solid fa-sack-dollar",
      route: "/admin/balance-sheet",
    },
  ];

  const moduleCards = [
    {
      key: "clients",
      title: "Total Active Clients",
      value: summary.counts.clients,
      icon: "fa-solid fa-users",
      route: "/admin/client-management",
    },
    {
      key: "vendors",
      title: "Total Active Vendors",
      value: summary.counts.vendors,
      icon: "fa-solid fa-truck-field",
      route: "/admin/vendor-management",
    },
    {
      key: "staff",
      title: "Total Active Staff",
      value: summary.counts.staff,
      icon: "fa-solid fa-user-tie",
      route: "/admin/staff-management",
    },
    {
      key: "projects",
      title: "Total Projects",
      value: summary.counts.projects,
      icon: "fa-solid fa-diagram-project",
      route: "/admin/project-management",
    },
    {
      key: "invoices",
      title: "Total Sales Invoices",
      value: summary.counts.invoices,
      icon: "fa-solid fa-file-invoice-dollar",
      route: "/admin/sales-management",
    },
    {
      key: "purchases",
      title: "Total Purchase Bills",
      value: summary.counts.purchases,
      icon: "fa-solid fa-file-circle-plus",
      route: "/admin/purchase-management",
    },
  ];

  const quickActions = [
    {
      label: "Ledger",
      icon: "fa-solid fa-book",
      route: "/admin/ledger-management",
      color: "#007026",
      colorTo: "#1f9d50",
    },
    {
      label: "Books of Accounts",
      icon: "fa-solid fa-table-list",
      route: "/admin/books-of-accounts",
      color: "#0e8f7b",
      colorTo: "#12a594",
    },
    {
      label: "Balance Sheet",
      icon: "fa-solid fa-scale-unbalanced-flip",
      route: "/admin/balance-sheet",
      color: "#ff0000",
      colorTo: "#ff4d4d",
    },
    {
      label: "Services Management",
      icon: "fa-solid fa-globe",
      route: "/admin/services-management",
      color: "#fd4c00",
      colorTo: "#fb6400",
    },
    {
      label: "Financial Years",
      icon: "fa-regular fa-calendar-days",
      route: "/admin/financial-year-management",
      color: "#d81b60",
      colorTo: "#ec407a",
    },
    {
      label: "Sales Management",
      icon: "fa-solid fa-file-invoice-dollar",
      route: "/admin/sales-management",
      color: "#007026",
      colorTo: "#1f9d50",
    },
  ];

  const inputGstTotal = summary.purchaseTotals.tax + summary.rcmTotals.tax;
  const netGstLiability = summary.salesTotals.tax - inputGstTotal;
  const snapshotRows = [
    {
      label: "Total Sales Value",
      value: formatCurrency(summary.salesTotals.total),
      icon: "fa-solid fa-file-invoice-dollar",
    },
    {
      label: "Total Purchase + RCM Value",
      value: formatCurrency(summary.purchaseTotals.total + summary.rcmTotals.total),
      icon: "fa-solid fa-cart-shopping",
    },
    {
      label: "Receivable from Customers",
      value: formatCurrency(summary.salesTotals.pending),
      icon: "fa-solid fa-wallet",
    },
    {
      label: "Payable to Suppliers",
      value: formatCurrency(summary.purchaseTotals.pending + summary.rcmTotals.pending),
      icon: "fa-solid fa-hand-holding-dollar",
    },
    {
      label: "Net Cash In Hand",
      value: formatCurrency(summary.netCashflow),
      icon: "fa-solid fa-scale-balanced",
    },
    {
      label: "Advance Amount",
      value: formatCurrency(summary.advanceTotals.total),
      icon: "fa-solid fa-hand-holding-dollar",
    },
  ];

  const gstRows = [
    {
      label: "Output GST",
      value: formatCurrency(summary.salesTotals.tax),
      icon: "fa-solid fa-arrow-trend-up",
    },
    {
      label: "Input GST",
      value: formatCurrency(inputGstTotal),
      icon: "fa-solid fa-arrow-trend-down",
    },
    {
      label: "GST on Purchases",
      value: formatCurrency(summary.purchaseTotals.tax),
      icon: "fa-solid fa-receipt",
    },
    {
      label: "GST on RCM",
      value: formatCurrency(summary.rcmTotals.tax),
      icon: "fa-solid fa-building-columns",
    },
    {
      label: "Net GST",
      value: formatCurrency(Math.abs(netGstLiability)),
      icon: "fa-solid fa-indian-rupee-sign",
    },
    {
      label: "Estimated Profit",
      value: formatCurrency(summary.estimatedProfit),
      icon: "fa-solid fa-sack-dollar",
    },
  ];

  return (
    <div className="container-fluid">
      <div
        className="py-3 d-flex justify-content-between align-items-start flex-wrap"
        style={{ marginTop: "70px" }}
      >
        <div>
          <h4 className="fs-18 fw-semibold m-0">Dashboard</h4>
        </div>

        <div className="d-flex gap-2 mt-sm-0">
          <span className="badge bg-light text-dark border d-inline-flex align-items-center">
            FY:{" "}
            {selectedFinancialYear === "ALL"
              ? "All Year"
              : selectedFinancialYear}
          </span>
          {loading && (
            <span className="badge bg-warning text-dark d-inline-flex align-items-center">
              Loading...
            </span>
          )}
          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            onClick={() => loadDashboardData({ forceRefresh: true })}
            disabled={loading}
          >
            <i className="fa-solid fa-rotate me-1" /> Refresh
          </button>
        </div>
      </div>

      <div className="row">
        {kpiCards.map((card, index) => {
          const cardNumber = (index % 8) + 1;
          const cardClass = `card${cardNumber}`;
          const iconClass = `card-icon-bg${cardNumber}`;

          return (
            <div key={card.key} className="col-md-6 col-xl-2 mb-4">
              <div
                className={`card border-0 overflow-hidden ${cardClass} modern-card hover-elevate`}
                style={{
                  cursor: "pointer",
                  borderRadius: "12px",
                  height: "100%",
                }}
                onClick={() => navigate(card.route)}
              >
                <div className="card-body text-center p-2">
                  <div className="mb-3 mt-2 d-flex justify-content-center">
                    <span
                      className={`avatar-md rounded-circle ${iconClass} d-inline-flex justify-content-center align-items-center kpi-icon`}
                      style={{ width: "56px", height: "56px" }}
                    >
                      <i className={`${card.icon} fs-4 text-white`} />
                    </span>
                  </div>
                  <h6 className="mb-2 fw-bold" style={{ fontSize: "14.5px" }}>{card.title}</h6>
                  <p className="mb-0 text-muted fw-semibold kpi-value">
                    <Counter value={card.rawValue ?? card.value ?? 0} format={card.format ?? "currency"} />
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="row">
        {moduleCards.map((card, index) => {
          const cardNumber = ((index + 2) % 8) + 1;
          const cardClass = `card${cardNumber}`;
          const iconClass = `card-icon-bg${cardNumber}`;

          return (
            <div key={card.key} className="col-md-6 col-xl-2 mb-4">
              <div
                className={`card border-0 overflow-hidden ${cardClass} modern-card hover-elevate`}
                style={{
                  cursor: "pointer",
                  borderRadius: "12px",
                  height: "100%",
                }}
                onClick={() => navigate(card.route)}
              >
                <div className="card-body text-center p-2">
                  <div className="mb-3 mt-2 d-flex justify-content-center">
                    <span
                      className={`avatar-md rounded-circle ${iconClass} d-inline-flex justify-content-center align-items-center`}
                      style={{ width: "56px", height: "56px" }}
                    >
                      <i className={`${card.icon} fs-4 text-white`} />
                    </span>
                  </div>
                  <h6 className="mb-2 fw-bold" style={{ fontSize: "14.5px" }}>{card.title}</h6>
                  <p className="mb-0 text-muted fw-semibold kpi-value">
                    <Counter value={card.value} format="int" />
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="row">
        <div className="col-lg-8 mb-4">
          <div className="card border-0 h-100 modern-card hover-elevate dashboard-snapshot-card">
            <div className="card-body">
              <div className="d-flex justify-content-between align-items-center mb-4 snapshot-title-wrap">
                <h5 className="fw-semibold mb-0 d-flex align-items-center gap-2">
                  <span className="snapshot-title-icon">
                    <i className="fa-solid fa-chart-line" />
                  </span>
                  Financial Snapshot
                </h5>
                <span className="badge bg-light text-dark border snapshot-fy-badge">
                  FY:{" "}
                  {selectedFinancialYear === "ALL"
                    ? "All Year"
                    : selectedFinancialYear}
                </span>
              </div>
              <div className="snapshot-quick-wrap">
                <div className="snapshot-quick-columns">
                  <div className="snapshot-quick-column">
                    {snapshotRows.map((row, i) => {
                      const colors = [
                        { c: '#007026', t: '#1f9d50' },
                        { c: '#0e8f7b', t: '#12a594' },
                        { c: '#ff0000', t: '#ff4d4d' },
                        { c: '#fd4c00', t: '#fb6400' },
                        { c: '#d81b60', t: '#ec407a' },
                      ];
                      const col = colors[i % colors.length];
                      return (
                        <button
                          key={row.label}
                          type="button"
                          className="quick-access-modern-item snapshot-quick-item"
                          onClick={() => {}}
                          style={{
                            "--quick-accent": col.c,
                            "--quick-accent-to": col.t,
                            "--quick-accent-soft": hexToRgba(col.c, 0.12),
                            "--quick-accent-border": hexToRgba(col.c, 0.34),
                            "--quick-accent-glow": hexToRgba(col.c, 0.18),
                          }}
                        >
                          <span className="quick-access-main">
                            <span className="quick-access-icon-modern">
                              <i className={row.icon} />
                            </span>
                            <span className="quick-access-label-modern">{row.label}</span>
                          </span>
                          <span className="quick-access-arrow-modern">{row.value}</span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="snapshot-quick-column">
                    {gstRows.map((row, i) => {
                      const colors = [
                        { c: '#007026', t: '#1f9d50' },
                        { c: '#0e8f7b', t: '#12a594' },
                        { c: '#ff0000', t: '#ff4d4d' },
                        { c: '#fd4c00', t: '#fb6400' },
                        { c: '#d81b60', t: '#ec407a' },
                      ];
                      const col = colors[i % colors.length];
                      return (
                        <button
                          key={row.label}
                          type="button"
                          className="quick-access-modern-item snapshot-quick-item"
                          onClick={() => {}}
                          style={{
                            "--quick-accent": col.c,
                            "--quick-accent-to": col.t,
                            "--quick-accent-soft": hexToRgba(col.c, 0.12),
                            "--quick-accent-border": hexToRgba(col.c, 0.34),
                            "--quick-accent-glow": hexToRgba(col.c, 0.18),
                          }}
                        >
                          <span className="quick-access-main">
                            <span className="quick-access-icon-modern">
                              <i className={row.icon} />
                            </span>
                            <span className="quick-access-label-modern">{row.label}</span>
                          </span>
                          <span className="quick-access-arrow-modern">{row.value}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-lg-4 mb-4">
          <div className="card border-0 h-100 modern-card hover-elevate dashboard-quick-card">
            <div className="card-body">
              <h5 className="fw-semibold mb-3 d-flex align-items-center gap-2">
                <span className="snapshot-title-icon quick-title-icon">
                  <i className="fa-solid fa-bolt" />
                </span>
                Quick Access
              </h5>
              <div className="quick-access-modern-grid">
                {quickActions.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className="quick-access-modern-item"
                    onClick={() => navigate(item.route)}
                    style={{
                      "--quick-accent": item.color,
                      "--quick-accent-to": item.colorTo,
                      "--quick-accent-soft": hexToRgba(item.color, 0.12),
                      "--quick-accent-border": hexToRgba(item.color, 0.34),
                      "--quick-accent-glow": hexToRgba(item.color, 0.22),
                    }}
                  >
                    <span className="quick-access-main">
                      <span className="quick-access-icon-modern">
                        <i className={item.icon} />
                      </span>
                      <span className="quick-access-label-modern">{item.label}</span>
                    </span>
                    <span className="quick-access-arrow-modern">
                      <i className="fa-solid fa-arrow-right" />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .dashboard-snapshot-card {
          background: #ffffff
          border: 1px solid rgba(0, 112, 38, 0.14);
          box-shadow: 0 16px 40px rgba(0, 64, 28, 0.08);
        }

        .snapshot-title-wrap {
          gap: 10px;
        }

        .snapshot-title-icon {
          width: 32px;
          height: 32px;
          border-radius: 10px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(145deg, #007026, #1d8f45);
          color: #fff;
          font-size: 14px;
          box-shadow: 0 8px 18px rgba(0, 112, 38, 0.24);
        }

        .snapshot-fy-badge {
          border-radius: 999px;
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 600;
        }

        .snapshot-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }

        .snapshot-panel {
          border-radius: 14px;
          border: 1px solid rgba(0, 112, 38, 0.12);
          background: rgba(255, 255, 255, 0.82);
          backdrop-filter: blur(4px);
          overflow: hidden;
        }

        .snapshot-panel-tax {
          border-color: rgba(15, 106, 131, 0.2);
        }

        .snapshot-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          padding: 11px 12px;
          border-bottom: 1px dashed rgba(0, 0, 0, 0.08);
        }

        .snapshot-row:last-child {
          border-bottom: 0;
        }

        .snapshot-row-label-wrap {
          display: inline-flex;
          align-items: center;
          min-width: 0;
          gap: 8px;
        }

        .snapshot-row-icon {
          width: 28px;
          height: 28px;
          border-radius: 8px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 112, 38, 0.12);
          color: #007026;
          font-size: 12px;
        }

        .snapshot-row-icon-tax {
          background: rgba(15, 106, 131, 0.14);
          color: #0f6a83;
        }

        .snapshot-row-label {
          font-size: 13px;
          color: #4a5568;
          font-weight: 500;
        }

        .snapshot-row-value {
          font-size: 13px;
          color: #1d2939;
          font-weight: 700;
          text-align: right;
        }

        .snapshot-highlight-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }

        .snapshot-highlight-card {
          border-radius: 12px;
          border: 1px solid rgba(0, 112, 38, 0.12);
          background: linear-gradient(140deg, rgba(255, 255, 255, 0.95), rgba(239, 250, 242, 0.9));
          padding: 10px 12px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-height: 76px;
        }

        .snapshot-highlight-label {
          font-size: 11px;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: #667085;
          font-weight: 700;
        }

        .snapshot-highlight-value {
          font-size: 14px;
          color: #101828;
          font-weight: 700;
        }

        .snapshot-status-chip {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          padding: 5px 10px;
          font-size: 12px;
          font-weight: 700;
          width: fit-content;
        }

        .snapshot-status-danger {
          background: rgba(220, 38, 38, 0.12);
          color: #b42318;
        }

        .snapshot-status-success {
          background: rgba(2, 122, 72, 0.14);
          color: #027a48;
        }

        .dashboard-quick-card {
          background: linear-gradient(180deg, #ffffff 0%, #f9fcff 100%);
          border: 1px solid rgba(15, 106, 131, 0.14);
          box-shadow: 0 14px 34px rgba(9, 30, 66, 0.08);
        }

        .quick-title-icon {
          background: linear-gradient(145deg, #0f6a83, #0f8ba4);
          box-shadow: 0 8px 18px rgba(15, 106, 131, 0.24);
        }

        .quick-access-modern-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 10px;
        }

        .quick-access-modern-item {
          --quick-accent: #007026;
          --quick-accent-to: #1f9d50;
          --quick-accent-soft: rgba(0, 112, 38, 0.12);
          --quick-accent-border: rgba(0, 112, 38, 0.34);
          --quick-accent-glow: rgba(0, 112, 38, 0.22);
          width: 100%;
          border: 1px solid var(--quick-accent-border);
          border-radius: 14px;
          background: linear-gradient(130deg, var(--quick-accent-soft) 0%, #ffffff 56%, rgba(255, 255, 255, 0.96) 100%);
          padding: 11px 12px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          transition: transform 0.24s ease, box-shadow 0.24s ease, border-color 0.24s ease;
          position: relative;
          overflow: hidden;
        }

        .quick-access-modern-item::before {
          content: "";
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 4px;
          background: linear-gradient(180deg, var(--quick-accent), var(--quick-accent-to));
        }

        .quick-access-modern-item::after {
          content: "";
          position: absolute;
          right: -30px;
          top: -30px;
          width: 88px;
          height: 88px;
          border-radius: 50%;
          background: radial-gradient(circle, var(--quick-accent-glow) 0%, rgba(255, 255, 255, 0) 70%);
          pointer-events: none;
        }

        .quick-access-modern-item:hover {
          transform: translateY(-3px) scale(1.01);
          border-color: var(--quick-accent);
          box-shadow: 0 12px 24px var(--quick-accent-glow);
        }

        .quick-access-main {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }

        .quick-access-icon-modern {
          width: 36px;
          height: 36px;
          min-width: 36px;
          border-radius: 10px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(145deg, var(--quick-accent), var(--quick-accent-to));
          color: #ffffff;
          font-size: 15px;
          box-shadow: 0 8px 16px var(--quick-accent-glow);
        }

        .quick-access-label-modern {
          font-size: 13px;
          font-weight: 700;
          color: #0f172a;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .quick-access-arrow-modern {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: var(--quick-accent);
          background: transparent;
          border: none;
          padding: 0;
          min-width: 0;
          font-size: 1rem;
          font-weight: 700;
          transition: transform 0.22s ease, color 0.22s ease;
        }

        .quick-access-modern-item:hover .quick-access-arrow-modern {
          transform: translateX(2px);
        }

        /* Snapshot quick grid styles */
        .snapshot-quick-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .snapshot-quick-columns {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .snapshot-quick-column {
          display: grid;
          gap: 10px;
          grid-auto-rows: 58px;
        }

        .snapshot-quick-item {
          padding: 11px 12px;
          min-height: 58px;
          height: 58px;
        }

        .snapshot-quick-item .quick-access-label-modern {
          max-width: 150px;
        }

        .snapshot-quick-highlights {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          margin-top: 12px;
        }

        @media (max-width: 991px) {
          .snapshot-quick-columns { grid-template-columns: 1fr; }
          .snapshot-quick-highlights { grid-template-columns: repeat(2, minmax(0,1fr)); }
        }

        @media (max-width: 991px) {
          .snapshot-grid {
            grid-template-columns: 1fr;
          }

          .snapshot-highlight-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 575px) {
          .snapshot-highlight-grid {
            grid-template-columns: 1fr;
          }

          .snapshot-row {
            flex-direction: column;
            align-items: flex-start;
          }

          .snapshot-row-value {
            text-align: left;
            padding-left: 36px;
          }
        }
      `}</style>

      <div className="alert bg-success text-white mb-4" role="alert">
        <div>
          <b>Net Cash In Hand =</b> Sales Received - Purchase Paid - RCM Paid -
          Developer Payout Paid
        </div>
        <div>
          <b>Estimated Profit =</b> Sales Received - (Purchase Total + RCM Total
          + Developer Payout Total)
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
