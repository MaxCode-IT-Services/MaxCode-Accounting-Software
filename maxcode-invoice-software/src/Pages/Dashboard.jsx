import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { showError, showInfo } from "../Components/ToastNotification";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { fetchAllPaginatedEntities } from "../utils/fetchAllEntities";

const toNumber = (value) => {
  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const formatCurrency = (value) =>
  `₹ ${toNumber(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

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
      const fetchSafe = async (config) => {
        try {
          const value = await fetchAllPaginatedEntities({
            ...config,
            forceRefresh,
          });
          return { status: "fulfilled", value };
        } catch (reason) {
          return { status: "rejected", reason };
        }
      };

      const yearsResult = await fetchSafe({
        endpoint: API_ENDPOINTS.YEARS.LIST,
        fallbackKeys: ["years"],
      });
      const clientsResult = await fetchSafe({
        endpoint: API_ENDPOINTS.CLIENTS.LIST,
        fallbackKeys: ["clients"],
      });
      const vendorsResult = await fetchSafe({
        endpoint: API_ENDPOINTS.VENDORS.LIST,
        fallbackKeys: ["vendors"],
      });
      const staffResult = await fetchSafe({
        endpoint: API_ENDPOINTS.STAFF.LIST,
        fallbackKeys: ["staff"],
      });
      const servicesResult = await fetchSafe({
        endpoint: API_ENDPOINTS.SERVICES.LIST,
        fallbackKeys: ["services"],
      });
      const salesResult = await fetchSafe({
        endpoint: API_ENDPOINTS.INVOICES.LIST,
        fallbackKeys: ["invoices"],
      });
      const purchasesResult = await fetchSafe({
        endpoint: API_ENDPOINTS.PURCHASES.LIST,
        fallbackKeys: ["purchases"],
      });
      const rcmResult = await fetchSafe({
        endpoint: API_ENDPOINTS.RCM.LIST,
        fallbackKeys: ["rcm", "records"],
      });
      const projectsResult = await fetchSafe({
        endpoint: API_ENDPOINTS.PROJECTS.LIST,
        fallbackKeys: ["projects"],
      });

      const yearData =
        yearsResult.status === "fulfilled" ? yearsResult.value : [];

      const rcmData = rcmResult.status === "fulfilled" ? rcmResult.value : [];

      setFinancialYears(
        yearData
          .filter((record) => record?.isDeleted !== true)
          .map((record) => ({
            ...record,
            id: record._id || record.id,
            value: record.financialYear || record.year,
          })),
      );

      setClients(
        (clientsResult.status === "fulfilled"
          ? clientsResult.value
          : []
        ).filter((record) => record?.isDeleted !== true),
      );

      setVendors(
        (vendorsResult.status === "fulfilled"
          ? vendorsResult.value
          : []
        ).filter((record) => record?.isDeleted !== true),
      );

      setStaff(
        (staffResult.status === "fulfilled" ? staffResult.value : []).filter(
          (record) => record?.isDeleted !== true,
        ),
      );

      setServices(
        (servicesResult.status === "fulfilled"
          ? servicesResult.value
          : []
        ).filter((record) => record?.isDeleted !== true),
      );

      setSales(
        (salesResult.status === "fulfilled" ? salesResult.value : []).filter(
          (record) => record?.isDeleted !== true,
        ),
      );

      setPurchases(
        (purchasesResult.status === "fulfilled"
          ? purchasesResult.value
          : []
        ).filter((record) => record?.isDeleted !== true),
      );

      setRcm(rcmData.filter((record) => record?.isDeleted !== true));

      setProjects(
        (projectsResult.status === "fulfilled"
          ? projectsResult.value
          : []
        ).filter((record) => record?.isDeleted !== true),
      );

      if (
        yearsResult.status === "rejected" ||
        clientsResult.status === "rejected" ||
        vendorsResult.status === "rejected" ||
        staffResult.status === "rejected" ||
        servicesResult.status === "rejected" ||
        salesResult.status === "rejected" ||
        purchasesResult.status === "rejected" ||
        rcmResult.status === "rejected" ||
        projectsResult.status === "rejected"
      ) {
        showInfo("Some dashboard data could not be loaded.");
      }
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
    const filteredProjects = filterByFinancialYear(projects);
    const filteredServices = filterByFinancialYear(services);

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
      projectSummary,
      netCashflow,
      estimatedProfit,
    };
  }, [
    sales,
    purchases,
    rcm,
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
      value: formatCurrency(summary.salesTotals.total),
      icon: "fa-solid fa-file-invoice-dollar",
      route: "/admin/sales-management",
    },
    {
      key: "sales-received",
      title: "Payment Received",
      value: formatCurrency(summary.salesTotals.received),
      icon: "fa-solid fa-money-bill-trend-up",
      route: "/admin/sales-management",
    },
    {
      key: "purchase-paid",
      title: "Supplier Payment Paid",
      value: formatCurrency(
        summary.purchaseTotals.paid + summary.rcmTotals.paid,
      ),
      icon: "fa-solid fa-cart-shopping",
      route: "/admin/purchase-management",
    },
    {
      key: "project-payout",
      title: "Developer Payout",
      value: formatCurrency(summary.projectSummary.payoutTotal),
      icon: "fa-solid fa-money-check-dollar",
      route: "/admin/project-details",
    },
    {
      key: "net-cashflow",
      title: "Net Cash In Hand",
      value: formatCurrency(summary.netCashflow),
      icon: "fa-solid fa-scale-balanced",
      route: "/admin/ledger-management",
    },
    {
      key: "estimated-profit",
      title: "Estimated Profit",
      value: formatCurrency(summary.estimatedProfit),
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
    },
    {
      label: "Books of Accounts",
      icon: "fa-solid fa-table-list",
      route: "/admin/books-of-accounts",
    },
    {
      label: "Balance Sheet",
      icon: "fa-solid fa-scale-unbalanced-flip",
      route: "/admin/balance-sheet",
    },
    {
      label: "Services Management",
      icon: "fa-solid fa-globe",
      route: "/admin/services-management",
    },
    {
      label: "Financial Years",
      icon: "fa-regular fa-calendar-days",
      route: "/admin/financial-year-management",
    },
  ];

  const inputGstTotal = summary.purchaseTotals.tax + summary.rcmTotals.tax;
  const netGstLiability = summary.salesTotals.tax - inputGstTotal;

  return (
    <div className="container-fluid">
      <div
        className="py-3 d-flex justify-content-between align-items-start flex-wrap"
        style={{ marginTop: "70px" }}
      >
        <div>
          <h4 className="fs-18 fw-semibold m-0">Dashboard</h4>
          <small className="text-muted">
            Unified overview across sales, purchases, projects, ledger and team
          </small>
        </div>

        <div className="d-flex gap-2 mt-2 mt-sm-0">
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
                className={`card border-0 shadow-sm overflow-hidden ${cardClass}`}
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
                  <h6 className="mb-2 fw-bold">{card.title}</h6>
                  <p className="mb-0 text-muted fw-semibold">{card.value}</p>
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
                className={`card border-0 shadow-sm overflow-hidden ${cardClass}`}
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
                  <h6 className="mb-2 fw-bold">{card.title}</h6>
                  <p className="mb-0 text-muted fw-semibold">
                    {toNumber(card.value).toLocaleString("en-IN")}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="row">
        <div className="col-lg-8 mb-4">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body">
              <div className="d-flex justify-content-between align-items-center mb-3">
                <h5 className="fw-semibold mb-0">Financial Snapshot</h5>
                <span className="badge bg-light text-dark border">
                  FY:{" "}
                  {selectedFinancialYear === "ALL"
                    ? "All Year"
                    : selectedFinancialYear}
                </span>
              </div>
              <div className="row g-3">
                <div className="col-md-6">
                  <div className="list-group list-group-flush border rounded h-100">
                    <div className="list-group-item d-flex justify-content-between align-items-center">
                      <span className="text-muted">Total Sales Value</span>
                      <span className="fw-semibold">
                        {formatCurrency(summary.salesTotals.total)}
                      </span>
                    </div>
                    <div className="list-group-item d-flex justify-content-between align-items-center">
                      <span className="text-muted">
                        Total Purchase + RCM Value
                      </span>
                      <span className="fw-semibold">
                        {formatCurrency(
                          summary.purchaseTotals.total +
                            summary.rcmTotals.total,
                        )}
                      </span>
                    </div>
                    <div className="list-group-item d-flex justify-content-between align-items-center">
                      <span className="text-muted">
                        Receivable from Customers
                      </span>
                      <span className="fw-semibold">
                        {formatCurrency(summary.salesTotals.pending)}
                      </span>
                    </div>
                    <div className="list-group-item d-flex justify-content-between align-items-center">
                      <span className="text-muted">Payable to Suppliers</span>
                      <span className="fw-semibold">
                        {formatCurrency(
                          summary.purchaseTotals.pending +
                            summary.rcmTotals.pending,
                        )}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="col-md-6">
                  <div className="list-group list-group-flush border rounded h-100">
                    <div className="list-group-item d-flex justify-content-between align-items-center">
                      <span className="text-muted">Output GST</span>
                      <span className="fw-semibold">
                        {formatCurrency(summary.salesTotals.tax)}
                      </span>
                    </div>
                    <div className="list-group-item d-flex justify-content-between align-items-center">
                      <span className="text-muted">Input GST</span>
                      <span className="fw-semibold">
                        {formatCurrency(inputGstTotal)}
                      </span>
                    </div>
                    <div className="list-group-item d-flex justify-content-between align-items-center">
                      <span className="text-muted">GST on Purchases</span>
                      <span className="fw-semibold">
                        {formatCurrency(summary.purchaseTotals.tax)}
                      </span>
                    </div>
                    <div className="list-group-item d-flex justify-content-between align-items-center">
                      <span className="text-muted">GST on RCM</span>
                      <span className="fw-semibold">
                        {formatCurrency(summary.rcmTotals.tax)}
                      </span>
                    </div>
                    <div className="list-group-item d-flex justify-content-between align-items-center">
                      <span className="text-muted">Net GST</span>
                      <span
                        className={`fw-bold ${netGstLiability >= 0 ? "text-danger" : "text-success"}`}
                      >
                        {formatCurrency(Math.abs(netGstLiability))}
                      </span>
                    </div>
                    <div className="list-group-item d-flex justify-content-between align-items-center">
                      <span className="text-muted">Status</span>
                      <span
                        className={`badge ${netGstLiability >= 0 ? "bg-danger-subtle text-danger" : "bg-success-subtle text-success"}`}
                      >
                        {netGstLiability >= 0 ? "GST Payable" : "GST Refund"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="col-lg-4 mb-4">
          <div className="card border-0 shadow-sm h-100">
            <div className="card-body">
              <h5 className="fw-semibold mb-3">Quick Access</h5>
              <div className="list-group list-group-flush">
                {quickActions.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className="list-group-item list-group-item-action border rounded-3 mb-2 d-flex align-items-center justify-content-between"
                    onClick={() => navigate(item.route)}
                  >
                    <span className="d-flex align-items-center">
                      <span className="avatar-xs rounded-circle bg-light text-primary d-inline-flex justify-content-center align-items-center me-2">
                        <i className={item.icon} />
                      </span>
                      {item.label}
                    </span>
                    <i className="fa-solid fa-chevron-right text-muted" />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

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
