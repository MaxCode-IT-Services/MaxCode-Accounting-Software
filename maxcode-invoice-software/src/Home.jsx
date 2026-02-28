import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const randomBetween = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const formatCurrency = (value) => `₹ ${value.toLocaleString("en-IN")}`;

const generateOverviewData = () => {
  const sales = randomBetween(650000, 980000);
  const purchase = randomBetween(240000, 520000);
  const expenses = randomBetween(90000, 220000);
  const pending = randomBetween(60000, 180000);
  const bars = Array.from({ length: 7 }, () => randomBetween(45, 96));
  const net = sales - purchase - expenses;
  const growth = randomBetween(3, 18);

  return {
    sales,
    purchase,
    expenses,
    pending,
    net,
    bars,
    growth,
  };
};

const modules = [
  {
    icon: "fas fa-file-invoice-dollar",
    title: "Sales & Invoicing",
    description:
      "Professional GST invoices, payment follow-up aur quick billing workflow.",
  },
  {
    icon: "fas fa-cart-arrow-down",
    title: "Purchase Management",
    description:
      "Vendor purchases, bills, dues aur monthly reconciliation tracking.",
  },
  {
    icon: "fas fa-briefcase",
    title: "Project & Services",
    description:
      "Project billing, services entries, milestones aur payout visibility.",
  },
  {
    icon: "fas fa-balance-scale",
    title: "Ledger Control",
    description: "Ledger, detailed ledger aur audit-ready transaction history.",
  },
  {
    icon: "fas fa-receipt",
    title: "RCM & GST",
    description:
      "Reverse charge records, tax logic aur compliant business accounting.",
  },
  {
    icon: "fas fa-chart-pie",
    title: "Balance Sheet",
    description:
      "Financial reports and structured summaries for business decisions.",
  },
];

const technicalHighlights = [
  {
    icon: "fas fa-server",
    title: "Netlify Serverless API",
    text: "Backend functions for clients, invoices, projects, purchases, vendors, staff, years and settings.",
  },
  {
    icon: "fas fa-shield-alt",
    title: "JWT Authentication",
    text: "Secure login flow with token-based protected endpoints for all core modules.",
  },
  {
    icon: "fas fa-file-export",
    title: "PDF + Excel Export",
    text: "Business documents export support for operational and reporting workflows.",
  },
  {
    icon: "fas fa-cloud-upload-alt",
    title: "Auto Backup Ready",
    text: "Google Drive backup support with GitHub Actions daily automation workflow.",
  },
  {
    icon: "fas fa-code-branch",
    title: "CI/CD Deployment",
    text: "Netlify deployment setup with GitHub Actions for reliable releases.",
  },
  {
    icon: "fas fa-mobile-alt",
    title: "Responsive UI",
    text: "React + Bootstrap based interface optimized for desktop and mobile teams.",
  },
];

const moduleList = [
  "Client Management",
  "Vendor Management",
  "Staff Management",
  "Sales Management",
  "Purchase Management",
  "Services Management",
  "Project Management",
  "RCM Management",
  "Ledger Management",
  "Detailed Ledger",
  "Balance Sheet",
  "Financial Year Management",
  "Business Settings",
  "Backup & Restore",
];

const steps = [
  {
    title: "Setup & Secure",
    text: "Financial year configuration, user access aur secure login se system ready karein.",
  },
  {
    title: "Daily Business Entry",
    text: "Sales, purchase, service, project aur ledger data daily basis par maintain karein.",
  },
  {
    title: "Reports, Backup & Growth",
    text: "Balance sheet, summaries aur automated backup ke saath confident operations run karein.",
  },
];

const checkAuthStatus = () => {
  const authFlag = localStorage.getItem("maxcode_auth") === "true";
  return authFlag;
};

const Home = () => {
  const [scrolled, setScrolled] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(() => checkAuthStatus());
  const [activeSection, setActiveSection] = useState("features");
  const [overviewData, setOverviewData] = useState(() =>
    generateOverviewData(),
  );
  const [isLiveUpdating, setIsLiveUpdating] = useState(false);
  const weekLabels = ["M", "T", "W", "T", "F", "S", "S"];
  const trendCoordinates = overviewData.bars.map((value, index) => {
    const x = (index / (overviewData.bars.length - 1)) * 100;
    const normalized = ((value - 40) / 60) * 100;
    const y = 100 - Math.min(95, Math.max(5, normalized));
    return { x, y };
  });
  const trendPoints = trendCoordinates
    .map((point) => `${point.x},${point.y}`)
    .join(" ");
  const areaPoints = `0,100 ${trendPoints} 100,100`;
  const collectionRate = Math.round(
    ((overviewData.sales - overviewData.pending) / overviewData.sales) * 100,
  );
  const pageSections = [
    "features",
    "project-details",
    "workflow",
    "pricing",
    "footer",
  ];
  const primaryCtaPath = isLoggedIn ? "/admin/dashboard" : "/login";
  const primaryCtaLabel = isLoggedIn ? "Open Dashboard" : "Start Login";
  const navLinkClass = (sectionId) =>
    `nav-link px-3 ${activeSection === sectionId ? "active" : ""}`;
  const mobileNavLinkClass = (sectionId) =>
    `nav-link py-2 ${activeSection === sectionId ? "active" : ""}`;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    let timeoutId;
    const interval = setInterval(() => {
      setIsLiveUpdating(true);
      setOverviewData(generateOverviewData());

      timeoutId = setTimeout(() => {
        setIsLiveUpdating(false);
      }, 500);
    }, 3500);

    return () => {
      clearInterval(interval);
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  useEffect(() => {
    const syncAuthState = () => {
      setIsLoggedIn(checkAuthStatus());
    };

    window.addEventListener("storage", syncAuthState);
    window.addEventListener("focus", syncAuthState);

    return () => {
      window.removeEventListener("storage", syncAuthState);
      window.removeEventListener("focus", syncAuthState);
    };
  }, []);

  useEffect(() => {
    const observedElements = pageSections
      .map((sectionId) => document.getElementById(sectionId))
      .filter(Boolean);

    if (observedElements.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);

        if (visible[0]?.target?.id) {
          setActiveSection(visible[0].target.id);
        }
      },
      {
        root: null,
        threshold: [0.2, 0.45, 0.7],
        rootMargin: "-20% 0px -45% 0px",
      },
    );

    observedElements.forEach((element) => observer.observe(element));

    return () => {
      observedElements.forEach((element) => observer.unobserve(element));
      observer.disconnect();
    };
  }, [pageSections]);

  return (
    <div className="maxcode-home">
      <nav
        className={`navbar navbar-expand-lg fixed-top py-3 home-navbar ${
          scrolled ? "scrolled" : ""
        }`}
      >
        <div className="container">
          <Link className="navbar-brand" to="/">
            <img src="Logo.png" alt="MaxCode" style={{ width: "180px" }} />
          </Link>

          <div className="d-none d-lg-flex align-items-center ms-auto gap-2">
            <a className={navLinkClass("features")} href="#features">
              Features
            </a>
            <a
              className={navLinkClass("project-details")}
              href="#project-details"
            >
              Details
            </a>
            <a className={navLinkClass("workflow")} href="#workflow">
              Workflow
            </a>
            <a className={navLinkClass("pricing")} href="#pricing">
              Pricing
            </a>
            <a className={navLinkClass("footer")} href="#footer">
              Contact
            </a>
            <Link className={navLinkClass("privacy")} to="/privacy-policy">
              Privacy Policy
            </Link>
            <Link
              to={isLoggedIn ? "/admin/dashboard" : "/login"}
              className={`btn ${
                isLoggedIn ? "btn-success" : "btn-outline-success"
              } rounded-pill px-4 fw-semibold`}
            >
              {isLoggedIn ? "Dashboard" : "Login"}
            </Link>
          </div>

          <button
            className="navbar-toggler d-lg-none border-0"
            type="button"
            data-bs-toggle="offcanvas"
            data-bs-target="#mobileMenu"
            aria-controls="mobileMenu"
          >
            <span className="navbar-toggler-icon"></span>
          </button>
        </div>
      </nav>

      <div className="offcanvas offcanvas-start" tabIndex="-1" id="mobileMenu">
        <div className="offcanvas-header">
          <img src="Logo.png" alt="MaxCode" style={{ width: "180px" }} />
          <button
            type="button"
            className="btn-close"
            data-bs-dismiss="offcanvas"
            aria-label="Close"
          ></button>
        </div>
        <div className="offcanvas-body d-flex flex-column">
          <a
            href="#features"
            className={mobileNavLinkClass("features")}
            data-bs-dismiss="offcanvas"
          >
            Features
          </a>
          <a
            href="#project-details"
            className={mobileNavLinkClass("project-details")}
            data-bs-dismiss="offcanvas"
          >
            Details
          </a>
          <a
            href="#workflow"
            className={mobileNavLinkClass("workflow")}
            data-bs-dismiss="offcanvas"
          >
            Workflow
          </a>
          <a
            href="#pricing"
            className={mobileNavLinkClass("pricing")}
            data-bs-dismiss="offcanvas"
          >
            Pricing
          </a>
          <a
            href="#footer"
            className={mobileNavLinkClass("footer")}
            data-bs-dismiss="offcanvas"
          >
            Contact
          </a>
          <Link
            to="/privacy-policy"
            className={mobileNavLinkClass("privacy")}
            data-bs-dismiss="offcanvas"
          >
            Privacy Policy
          </Link>
          <Link
            to={isLoggedIn ? "/admin/dashboard" : "/login"}
            className={`btn ${
              isLoggedIn ? "btn-success" : "btn-outline-success"
            } rounded-pill mt-3 fw-semibold`}
            data-bs-dismiss="offcanvas"
          >
            {isLoggedIn ? "Dashboard" : "Login"}
          </Link>
        </div>
      </div>

      <section className="hero-section">
        <div className="container">
          <div className="row align-items-center g-4">
            <div className="col-lg-6">
              <div className="hero-badge">MAXCODE ACCOUNTING SOFTWARE</div>
              <h1 className="hero-title">
                Complete Business Billing, Accounting & GST Platform
              </h1>
              <p className="hero-text">
                Aapke software ke saare core modules ek unified dashboard me.
                Client management se balance sheet tak full workflow fast, clean
                aur team-friendly experience ke saath.
              </p>

              <div className="d-flex flex-wrap gap-3">
                <Link
                  to={primaryCtaPath}
                  className="btn btn-success btn-lg px-4 rounded-pill"
                >
                  {primaryCtaLabel}
                </Link>
                <a
                  href="#project-details"
                  className="btn btn-outline-success btn-lg px-4 rounded-pill"
                >
                  View Details
                </a>
              </div>

              <div className="trust-row mt-3">
                <span>
                  <i className="fas fa-shield-check me-2"></i>Secure Access
                </span>
                <span>
                  <i className="fas fa-receipt me-2"></i>GST / RCM Ready
                </span>
                <span>
                  <i className="fas fa-cloud-arrow-up me-2"></i>Auto Backup
                </span>
              </div>

              <div className="stats-grid mt-4">
                <div className="stat-item">
                  <h4>14+</h4>
                  <p>Business Modules</p>
                </div>
                <div className="stat-item">
                  <h4>API</h4>
                  <p>Serverless Backend</p>
                </div>
                <div className="stat-item">
                  <h4>Daily</h4>
                  <p>Auto Backup Ready</p>
                </div>
              </div>
            </div>

            <div className="col-lg-6">
              <div
                className={`dashboard-mock ${isLiveUpdating ? "is-updating" : ""}`}
              >
                <div className="mock-header d-flex justify-content-between align-items-center mb-3">
                  <div>
                    <h6 className="mb-1">Live Financial Overview</h6>
                    <small>Random Live Snapshot • This Week</small>
                  </div>
                  <span className="overview-chip">
                    <i className="fas fa-circle me-2 live-dot"></i>
                    Live
                  </span>
                </div>

                <div className="finance-grid mb-3">
                  <div className="finance-card">
                    <small>Total Sales</small>
                    <h6>{formatCurrency(overviewData.sales)}</h6>
                    <span className="up-text">+{overviewData.growth}%</span>
                  </div>
                  <div className="finance-card">
                    <small>Total Expense</small>
                    <h6>{formatCurrency(overviewData.expenses)}</h6>
                    <span className="muted-text">Operations</span>
                  </div>
                  <div className="finance-card">
                    <small>Outstanding</small>
                    <h6>{formatCurrency(overviewData.pending)}</h6>
                    <span className="warn-text">Needs Follow-up</span>
                  </div>
                </div>

                <div className="net-strip mb-3 d-flex justify-content-between align-items-center">
                  <span>Net Position</span>
                  <strong
                    className={
                      overviewData.net >= 0 ? "text-success" : "text-danger"
                    }
                  >
                    {formatCurrency(overviewData.net)}
                  </strong>
                </div>

                <div className="meta-strip mb-3">
                  <div>
                    <small>Collection Rate</small>
                    <p>{collectionRate}%</p>
                  </div>
                  <div>
                    <small>Purchase</small>
                    <p>{formatCurrency(overviewData.purchase)}</p>
                  </div>
                </div>

                <div className="trend-card">
                  <div className="trend-head d-flex justify-content-between align-items-center">
                    <small>Weekly Performance Graph</small>
                    <span
                      className={
                        overviewData.net >= 0 ? "text-success" : "text-danger"
                      }
                    >
                      {overviewData.net >= 0 ? "+" : ""}
                      {overviewData.growth}%
                    </span>
                  </div>

                  <div className="trend-graph">
                    <svg viewBox="0 0 100 100" preserveAspectRatio="none">
                      {[20, 40, 60, 80].map((line) => (
                        <line
                          key={line}
                          x1="0"
                          y1={line}
                          x2="100"
                          y2={line}
                          className="graph-grid"
                        />
                      ))}
                      <polygon points={areaPoints} className="trend-area" />
                      <polyline points={trendPoints} className="trend-line" />
                      {trendCoordinates.map((point, index) => {
                        return (
                          <circle
                            key={index}
                            cx={point.x}
                            cy={point.y}
                            r="2"
                            className="trend-dot"
                          />
                        );
                      })}
                    </svg>
                  </div>

                  <div className="trend-labels">
                    {weekLabels.map((label, index) => (
                      <span key={`${label}-${index}`}>{label}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="features-section">
        <div className="container">
          <div className="section-head text-center mb-4">
            <h2>Core Modules for Daily Operations</h2>
            <p>
              Existing software structure ke according ready-to-use accounting
              modules.
            </p>
          </div>

          <div className="row g-3">
            {modules.map((item) => (
              <div className="col-md-6 col-xl-4" key={item.title}>
                <div className="feature-card h-100">
                  <div className="icon-wrap">
                    <i className={item.icon}></i>
                  </div>
                  <h5>{item.title}</h5>
                  <p>{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="project-details" className="details-section">
        <div className="container">
          <div className="section-head text-center mb-4">
            <h2>Platform Details & Highlights</h2>
            <p>
              Real business capabilities with secure workflows, backup and daily
              accounting operations.
            </p>
          </div>

          <div className="row g-3 mb-4">
            {technicalHighlights.map((item) => (
              <div className="col-md-6 col-xl-4" key={item.title}>
                <div className="detail-card h-100">
                  <div className="icon-wrap mb-2">
                    <i className={item.icon}></i>
                  </div>
                  <h5>{item.title}</h5>
                  <p>{item.text}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="module-cloud">
            {moduleList.map((item) => (
              <span key={item} className="module-pill">
                {item}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section id="workflow" className="workflow-section">
        <div className="container">
          <div className="section-head text-center mb-4">
            <h2>How It Works</h2>
            <p>
              Simple 3-step process for running your complete accounting cycle.
            </p>
          </div>

          <div className="row g-3">
            {steps.map((step, index) => (
              <div className="col-md-4" key={step.title}>
                <div className="step-card h-100">
                  <div className="step-no">0{index + 1}</div>
                  <h5>{step.title}</h5>
                  <p>{step.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="pricing-section">
        <div className="container">
          <div className="section-head text-center mb-4">
            <h2>Simple Plans</h2>
            <p>Aapke team size ke hisaab se choose karein.</p>
          </div>

          <div className="row g-3 justify-content-center">
            <div className="col-md-6 col-lg-4">
              <div className="price-card h-100">
                <h6>Starter</h6>
                <h3>₹999/mo</h3>
                <ul>
                  <li>Basic billing & sales</li>
                  <li>Client + Vendor modules</li>
                  <li>Email support</li>
                </ul>
                <Link
                  to="/login"
                  className="btn btn-outline-success w-100 rounded-pill"
                >
                  Choose Starter
                </Link>
              </div>
            </div>

            <div className="col-md-6 col-lg-4">
              <div className="price-card h-100 popular">
                <span className="popular-badge">Most Used</span>
                <h6>Business</h6>
                <h3>₹1,999/mo</h3>
                <ul>
                  <li>All accounting modules</li>
                  <li>RCM + GST support</li>
                  <li>Priority support</li>
                </ul>
                <Link
                  to="/login"
                  className="btn btn-success w-100 rounded-pill"
                >
                  Choose Business
                </Link>
              </div>
            </div>

            <div className="col-md-6 col-lg-4">
              <div className="price-card h-100">
                <h6>Enterprise</h6>
                <h3>Custom</h3>
                <ul>
                  <li>Advanced controls</li>
                  <li>Custom reports</li>
                  <li>Dedicated onboarding</li>
                </ul>
                <Link
                  to="/login"
                  className="btn btn-outline-success w-100 rounded-pill"
                >
                  Contact Team
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="cta-section">
        <div className="container">
          <div className="cta-box">
            <h3>Ready to Start with MaxCode Accounting Software?</h3>
            <p>
              Login karke direct dashboard par daily operations, reports aur
              backups manage karein.
            </p>
            <Link
              to={primaryCtaPath}
              className="btn btn-light text-dark fw-bold rounded-pill px-4"
            >
              {isLoggedIn ? "Go to Dashboard" : "Continue to Login"}
            </Link>
          </div>
        </div>
      </section>

      <footer id="footer" className="footer-section">
        <div className="container">
          <div className="row g-4 mb-4">
            <div className="col-lg-4">
              <img src="Logo.png" alt="MaxCode" style={{ width: "180px" }} />
              <p className="footer-text mt-3 mb-3">
                MaxCode Invoice & Accounting platform for complete business
                billing, GST, reports, backup and secure operations.
              </p>
              <div className="d-flex gap-2">
                <a href="#" className="social-icon" aria-label="facebook">
                  <i className="fab fa-facebook-f"></i>
                </a>
                <a href="#" className="social-icon" aria-label="instagram">
                  <i className="fab fa-instagram"></i>
                </a>
                <a href="#" className="social-icon" aria-label="linkedin">
                  <i className="fab fa-linkedin-in"></i>
                </a>
              </div>
            </div>

            <div className="col-sm-6 col-lg-2">
              <h6 className="footer-title">Product</h6>
              <ul className="footer-links">
                <li>
                  <Link to="/privacy-policy">Privacy Policy</Link>
                </li>
                <li>
                  <a href="#features">Features</a>
                </li>
                <li>
                  <a href="#project-details">Project Details</a>
                </li>
                <li>
                  <a href="#workflow">Workflow</a>
                </li>
                <li>
                  <a href="#pricing">Pricing</a>
                </li>
              </ul>
            </div>

            <div className="col-sm-6 col-lg-3">
              <h6 className="footer-title">Popular Modules</h6>
              <ul className="footer-links">
                <li>Client & Vendor Management</li>
                <li>Sales, Purchase & Services</li>
                <li>Ledger & Balance Sheet</li>
                <li>RCM, Settings & Backup</li>
              </ul>
            </div>

            <div className="col-lg-3">
              <h6 className="footer-title">Contact</h6>
              <ul className="footer-links">
                <li>
                  <i className="fas fa-envelope me-2"></i> contact@maxcode.in
                </li>
                <li>
                  <i className="fas fa-globe me-2"></i> www.maxcode.in
                </li>
                <li>
                  <i className="fas fa-phone me-2"></i> +91 8069640420
                </li>
              </ul>
            </div>
          </div>

          <div className="footer-bottom d-flex flex-column flex-md-row justify-content-between gap-2">
            <p className="mb-0">
              © {new Date().getFullYear()} MaxCode IT Services. All rights
              reserved.
            </p>
            <p className="mb-0">
              Built for business billing and accounting workflows.
            </p>
          </div>
        </div>
      </footer>

      <style jsx>{`
        .maxcode-home {
          color: #1f2937;
          background: #ffffff;
          scroll-behavior: smooth;
        }

        section[id],
        footer[id] {
          scroll-margin-top: 108px;
        }

        .home-navbar {
          transition: all 0.25s ease;
          background: rgba(255, 255, 255, 0.8);
          backdrop-filter: blur(8px);
        }

        .home-navbar .nav-link {
          font-weight: 700;
          color: #0f172a;
          position: relative;
        }

        .home-navbar .nav-link:hover {
          color: #007026;
        }

        .home-navbar .nav-link.active {
          color: #007026;
        }

        .home-navbar .nav-link::after {
          content: "";
          position: absolute;
          left: 12px;
          right: 12px;
          top: calc(100% + 10px);
          height: 2px;
          background: #007026;
          transform: scaleX(0);
          transform-origin: center;
          transition: transform 0.2s ease;
        }

        .home-navbar .nav-link:hover::after {
          transform: scaleX(1);
        }

        .home-navbar .nav-link.active::after {
          transform: scaleX(1);
        }

        .home-navbar.scrolled {
          background: #ffffff;
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
        }

        .hero-section {
          padding: 140px 0 90px;
          background: linear-gradient(
            180deg,
            rgba(0, 112, 38, 0.08) 0%,
            #ffffff 70%
          );
        }

        .hero-badge {
          display: inline-block;
          padding: 8px 14px;
          border-radius: 999px;
          background: rgba(0, 112, 38, 0.1);
          color: #007026;
          font-weight: 700;
          font-size: 12px;
          letter-spacing: 0.4px;
          margin-bottom: 16px;
        }

        .hero-title {
          font-size: clamp(2rem, 3.8vw, 3.2rem);
          font-weight: 800;
          line-height: 1.2;
          margin-bottom: 14px;
        }

        .hero-text {
          font-size: 1.05rem;
          color: #4b5563;
          margin-bottom: 24px;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }

        .trust-row {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }

        .trust-row span {
          font-size: 0.82rem;
          font-weight: 600;
          color: #334155;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 999px;
          padding: 6px 12px;
        }

        .trust-row i {
          color: #007026;
        }

        .stat-item {
          border: 1px solid #e5e7eb;
          border-radius: 16px;
          padding: 14px;
          background: #fff;
          transition:
            transform 0.2s ease,
            box-shadow 0.2s ease;
        }

        .stat-item:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
        }

        .stat-item h4 {
          color: #007026;
          margin: 0;
          font-weight: 800;
        }

        .stat-item p {
          margin: 0;
          color: #6b7280;
          font-size: 0.88rem;
        }

        .dashboard-mock {
          border: 1px solid #e5e7eb;
          border-radius: 24px;
          padding: 22px;
          background: #fff;
          box-shadow: 0 14px 35px rgba(15, 23, 42, 0.08);
          transition:
            box-shadow 0.3s ease,
            transform 0.3s ease;
          position: relative;
          overflow: hidden;
        }

        .dashboard-mock::before {
          content: "";
          position: absolute;
          width: 220px;
          height: 220px;
          right: -70px;
          top: -70px;
          border-radius: 50%;
          background: radial-gradient(
            circle,
            rgba(0, 112, 38, 0.16) 0%,
            rgba(0, 112, 38, 0) 70%
          );
          pointer-events: none;
        }

        .dashboard-mock.is-updating {
          box-shadow: 0 18px 38px rgba(0, 112, 38, 0.16);
          transform: translateY(-2px);
        }

        .mock-header small {
          color: #6b7280;
        }

        .overview-chip {
          border: 1px solid #cdecd8;
          color: #007026;
          background: #effcf4;
          border-radius: 999px;
          padding: 6px 12px;
          font-size: 0.82rem;
          font-weight: 700;
        }

        .overview-chip i {
          font-size: 0.58rem;
        }

        .live-dot {
          animation: blinkLive 1.1s ease-in-out infinite;
        }

        .finance-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }

        .finance-card {
          border: 1px solid #e6edf3;
          border-radius: 14px;
          background: #fbfdff;
          padding: 12px;
          transition:
            border-color 0.2s ease,
            transform 0.2s ease;
        }

        .finance-card:hover {
          border-color: #b6e0c4;
          transform: translateY(-2px);
        }

        .finance-card small {
          color: #6b7280;
          font-weight: 600;
        }

        .finance-card h6 {
          margin: 4px 0 0;
          color: #0f172a;
          font-weight: 700;
        }

        .up-text,
        .muted-text,
        .warn-text {
          display: block;
          margin-top: 3px;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .up-text {
          color: #0f9d58;
        }

        .muted-text {
          color: #64748b;
        }

        .warn-text {
          color: #d97706;
        }

        .net-strip {
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          background: #f8fafc;
          padding: 10px 14px;
          font-weight: 600;
        }

        .meta-strip {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }

        .meta-strip > div {
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 10px 12px;
          background: #ffffff;
        }

        .meta-strip small {
          color: #64748b;
          font-weight: 600;
        }

        .meta-strip p {
          margin: 2px 0 0;
          color: #0f172a;
          font-weight: 700;
          font-size: 0.95rem;
        }

        .trend-card {
          border: 1px solid #e2e8f0;
          border-radius: 14px;
          padding: 10px 12px 12px;
          background: #ffffff;
          transition: border-color 0.2s ease;
        }

        .trend-card:hover {
          border-color: #b6e0c4;
        }

        .trend-head {
          margin-bottom: 8px;
          font-weight: 600;
        }

        .trend-head small {
          color: #6b7280;
          font-weight: 600;
        }

        .trend-graph {
          position: relative;
          height: 150px;
          border-radius: 10px;
          background: linear-gradient(
            to bottom,
            rgba(0, 112, 38, 0.06),
            rgba(0, 112, 38, 0.01)
          );
          border: 1px solid #edf2f7;
          overflow: hidden;
        }

        .graph-grid {
          stroke: #e5e7eb;
          stroke-width: 0.4;
        }

        .trend-area {
          fill: rgba(0, 112, 38, 0.14);
        }

        .trend-graph svg {
          width: 100%;
          height: 100%;
        }

        .trend-line {
          fill: none;
          stroke: #007026;
          stroke-width: 1.4;
          stroke-linecap: round;
          stroke-linejoin: round;
          animation: linePulse 1.8s ease-in-out infinite;
        }

        .trend-dot {
          fill: #ffffff;
          stroke: #007026;
          stroke-width: 1.2;
        }

        .trend-labels {
          display: flex;
          justify-content: space-between;
          margin-top: 8px;
          padding: 0 2px;
        }

        .trend-labels span {
          font-size: 0.74rem;
          color: #6b7280;
          font-weight: 600;
        }

        .features-section,
        .details-section,
        .workflow-section,
        .pricing-section {
          padding: 84px 0;
        }

        .details-section,
        .workflow-section {
          background: #f8fafc;
        }

        .section-head h2 {
          font-weight: 800;
          margin-bottom: 10px;
        }

        .section-head p {
          margin: 0;
          color: #6b7280;
        }

        .feature-card,
        .detail-card {
          border: 1px solid #e5e7eb;
          border-radius: 20px;
          padding: 22px;
          background: #fff;
          transition: all 0.25s ease;
        }

        .feature-card:hover,
        .detail-card:hover {
          transform: translateY(-4px);
          border-color: #007026;
        }

        .icon-wrap {
          width: 52px;
          height: 52px;
          border-radius: 14px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 112, 38, 0.1);
          color: #007026;
          font-size: 1.2rem;
          margin-bottom: 12px;
        }

        .feature-card h5,
        .detail-card h5 {
          font-weight: 700;
          margin-bottom: 8px;
        }

        .feature-card p,
        .detail-card p {
          margin: 0;
          color: #6b7280;
        }

        .module-cloud {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .module-pill {
          padding: 7px 14px;
          border-radius: 999px;
          border: 1px solid #dbe4ea;
          background: #fff;
          color: #334155;
          font-size: 0.86rem;
          font-weight: 600;
        }

        .step-card {
          border-radius: 20px;
          padding: 22px;
          background: #fff;
          border: 1px solid #e5e7eb;
        }

        .step-no {
          width: 38px;
          height: 38px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          background: var(--header-gradient);
          color: #fff;
          font-weight: 700;
          margin-bottom: 12px;
        }

        .step-card h5 {
          font-weight: 700;
          margin-bottom: 8px;
        }

        .step-card p {
          color: #6b7280;
          margin: 0;
        }

        .price-card {
          border: 1px solid #e5e7eb;
          border-radius: 22px;
          padding: 24px;
          background: #fff;
          position: relative;
          transition:
            transform 0.2s ease,
            box-shadow 0.2s ease;
        }

        .price-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 14px 26px rgba(15, 23, 42, 0.08);
        }

        .price-card h6 {
          color: #6b7280;
          font-weight: 700;
          margin-bottom: 6px;
        }

        .price-card h3 {
          font-weight: 800;
          margin-bottom: 16px;
        }

        .price-card ul {
          list-style: none;
          padding: 0;
          margin: 0 0 18px;
        }

        .price-card li {
          position: relative;
          padding-left: 22px;
          margin-bottom: 10px;
          color: #4b5563;
        }

        .price-card li::before {
          content: "✓";
          position: absolute;
          left: 0;
          color: #007026;
          font-weight: 700;
        }

        .price-card.popular {
          border-color: #007026;
          box-shadow: 0 16px 30px rgba(0, 112, 38, 0.12);
        }

        .popular-badge {
          position: absolute;
          top: -12px;
          right: 18px;
          background: var(--header-gradient);
          color: #fff;
          border-radius: 999px;
          padding: 4px 12px;
          font-size: 0.72rem;
          font-weight: 700;
        }

        .cta-box {
          border-radius: 24px;
          text-align: center;
          padding: 44px 20px;
          color: #fff;
          background: var(--header-gradient);
        }

        .cta-section {
          padding: 0 0 80px;
        }

        .cta-box h3 {
          font-weight: 800;
          margin-bottom: 8px;
        }

        .cta-box p {
          color: rgba(255, 255, 255, 0.9);
          margin-bottom: 18px;
        }

        .footer-section {
          background: #f8fafc;
          color: #111827;
          padding: 50px 0 20px;
          border-top: 1px solid #e5e7eb;
        }

        .footer-text {
          color: #374151;
          max-width: 360px;
        }

        .footer-title {
          color: #111827;
          font-weight: 700;
          margin-bottom: 14px;
        }

        .footer-links {
          list-style: none;
          padding: 0;
          margin: 0;
          display: grid;
          gap: 8px;
        }

        .footer-links li,
        .footer-links a {
          color: #1f2937;
          text-decoration: none;
          font-size: 0.95rem;
        }

        .footer-links a:hover {
          color: #007026;
        }

        .social-icon {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          border: 1px solid #d1d5db;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          color: #111827;
          text-decoration: none;
        }

        .social-icon:hover {
          background: #ffffff;
          border-color: #9ca3af;
          transform: translateY(-1px);
        }

        .footer-bottom {
          border-top: 1px solid #d1d5db;
          padding-top: 14px;
          font-size: 0.9rem;
          color: #1f2937;
        }

        @keyframes blinkLive {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.35;
          }
        }

        @keyframes linePulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.78;
          }
        }

        @media (max-width: 991px) {
          .hero-section {
            padding: 120px 0 72px;
          }

          .stats-grid {
            grid-template-columns: 1fr;
          }

          .finance-grid {
            grid-template-columns: 1fr;
          }

          .meta-strip {
            grid-template-columns: 1fr;
          }

          .trust-row {
            gap: 8px;
          }
        }
      `}</style>
    </div>
  );
};

export default Home;
