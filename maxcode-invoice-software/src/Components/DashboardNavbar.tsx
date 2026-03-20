import React, { useState, useEffect, useRef, useCallback } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { apiGet, apiPost, clearAuth } from "../utils/api";
import {
  hasModuleAccess,
  getStoredUserInfo,
  withRolePrefix,
} from "../utils/permissions";
import Notification from "./Notification";

interface DashboardNavbarProps {
  children: React.ReactNode;
}

interface FinancialYearOption {
  id: string;
  label: string;
  value: string;
  isDefault?: boolean;
}

interface ExtendedFullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
  mozRequestFullScreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
}

interface ExtendedFullscreenDocument extends Document {
  webkitExitFullscreen?: () => Promise<void> | void;
  mozCancelFullScreen?: () => Promise<void> | void;
  msExitFullscreen?: () => Promise<void> | void;
}

const DashboardNavbar = ({ children }: DashboardNavbarProps) => {
  // State management
  const navigate = useNavigate();
  const location = useLocation();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [greeting, setGreeting] = useState("Good Morning");
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1040);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [circleColor, setCircleColor] = useState("");
  const [selectedFinancialYear, setSelectedFinancialYear] = useState("ALL");
  const [financialYears, setFinancialYears] = useState<FinancialYearOption[]>(
    [],
  );
  const [financialYearDropdownOpen, setFinancialYearDropdownOpen] =
    useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [user, setUser] = useState({
    name: "Guest User",
    email: "guest@example.com",
    role: "User",
  });
  const dropdownRef = useRef<HTMLLIElement | null>(null);
  const financialYearRef = useRef<HTMLLIElement | null>(null);

  const ALL_YEARS_VALUE = "ALL";

  const fetchFinancialYears = useCallback(async () => {
    try {
      const response = await apiGet(API_ENDPOINTS.YEARS.LIST);
      const yearsData = Array.isArray(response.data)
        ? response.data
        : response.data?.years || [];

      const normalizedYears = yearsData
        .filter((yearRecord: any) => yearRecord?.isDeleted !== true)
        .map((yearRecord: any) => {
          const value = yearRecord.financialYear || yearRecord.year || "";
          return {
            id: yearRecord._id || yearRecord.id || value,
            label: value,
            value,
            isDefault: yearRecord.isDefault === true,
          };
        })
        .filter((year: FinancialYearOption) => Boolean(year.value));

      setFinancialYears(normalizedYears);

      const defaultYear = normalizedYears.find(
        (year: FinancialYearOption) => year.isDefault,
      );
      const selectedYearValue = defaultYear?.value || ALL_YEARS_VALUE;
      setSelectedFinancialYear(selectedYearValue);
      localStorage.setItem("selectedFinancialYear", selectedYearValue);
      window.dispatchEvent(
        new CustomEvent("financialYearSelectionChanged", {
          detail: { selectedFinancialYear: selectedYearValue },
        }),
      );
    } catch (error) {
      console.error("Failed to fetch financial years:", error);
      setFinancialYears([]);
      setSelectedFinancialYear(ALL_YEARS_VALUE);
      localStorage.setItem("selectedFinancialYear", ALL_YEARS_VALUE);
      window.dispatchEvent(
        new CustomEvent("financialYearSelectionChanged", {
          detail: { selectedFinancialYear: ALL_YEARS_VALUE },
        }),
      );
    }
  }, []);

  // Get user data from localStorage
  useEffect(() => {
    const userData = getStoredUserInfo();

    if (userData) {
      setUser({
        name: userData.name || "Guest User",
        email: userData.email || "guest@example.com",
        role: userData.role || "User",
      });
    }
  }, [location.pathname]);

  // Generate random color for profile circle
  useEffect(() => {
    const colors = [
      "#FF6384",
      "#36A2EB",
      "#FFCE56",
      "#4BC0C0",
      "#9966FF",
      "#FF9F40",
      "#8AC249",
      "#EA5545",
      "#F46A9B",
      "#EF9B20",
    ];
    setCircleColor(colors[Math.floor(Math.random() * colors.length)]);
  }, []);

  // Load financial years and set default selection
  useEffect(() => {
    fetchFinancialYears();

    const handleFinancialYearDefaultUpdated = () => {
      fetchFinancialYears();
    };

    window.addEventListener(
      "financialYearDefaultUpdated",
      handleFinancialYearDefaultUpdated,
    );

    return () => {
      window.removeEventListener(
        "financialYearDefaultUpdated",
        handleFinancialYearDefaultUpdated,
      );
    };
  }, [fetchFinancialYears]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;

      if (
        dropdownRef.current &&
        target &&
        !dropdownRef.current.contains(target)
      ) {
        setDropdownOpen(false);
      }
      if (
        financialYearRef.current &&
        target &&
        !financialYearRef.current.contains(target)
      ) {
        setFinancialYearDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Set greeting based on time of day
  useEffect(() => {
    const updateGreeting = () => {
      const hour = new Date().getHours();
      if (hour < 12) setGreeting("Good Morning");
      else if (hour < 17) setGreeting("Good Afternoon");
      else if (hour < 21) setGreeting("Good Evening");
      else setGreeting("Good Night");
    };

    updateGreeting();
    const interval = setInterval(updateGreeting, 60000);
    return () => clearInterval(interval);
  }, []);

  // Handle responsiveness
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      setWindowWidth(width);
      const mobile = width < 1040;
      setIsMobile(mobile);

      if (mobile) {
        document.body.setAttribute("data-sidebar", "hidden");
        document.body.classList.add("sidebar-collapsed");
      } else {
        document.body.setAttribute("data-sidebar", "default");
        document.body.classList.remove("sidebar-collapsed");
      }
    };

    window.addEventListener("resize", handleResize);
    handleResize();
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Fullscreen toggle
  const toggleFullscreen = () => {
    const elem = document.documentElement as ExtendedFullscreenElement;
    const doc = document as ExtendedFullscreenDocument;

    if (!isFullscreen) {
      if (elem.requestFullscreen) elem.requestFullscreen();
      else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
      else if (elem.mozRequestFullScreen) elem.mozRequestFullScreen();
      else if (elem.msRequestFullscreen) elem.msRequestFullscreen();
    } else {
      if (doc.exitFullscreen) doc.exitFullscreen();
      else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
      else if (doc.mozCancelFullScreen) doc.mozCancelFullScreen();
      else if (doc.msExitFullscreen) doc.msExitFullscreen();
    }
    setIsFullscreen(!isFullscreen);
  };

  // Sidebar toggle
  const toggleSidebar = () => {
    const newCollapsed = !sidebarCollapsed;
    setSidebarCollapsed(newCollapsed);

    if (newCollapsed) {
      document.body.setAttribute("data-sidebar", "hidden");
      document.body.classList.add("sidebar-collapsed");
    } else {
      document.body.setAttribute("data-sidebar", "default");
      document.body.classList.remove("sidebar-collapsed");
    }
  };

  // Handle financial year selection
  const handleFinancialYearSelect = (year: string) => {
    setSelectedFinancialYear(year);
    localStorage.setItem("selectedFinancialYear", year);
    window.dispatchEvent(
      new CustomEvent("financialYearSelectionChanged", {
        detail: { selectedFinancialYear: year },
      }),
    );
    setFinancialYearDropdownOpen(false);
    // You can add additional logic here like fetching data for selected year
    console.log("Selected Financial Year:", year);
  };

  // Get initials from name
  const getInitials = (name: string) => {
    if (!name) return "GU";
    const words = name.split(" ");
    if (words.length === 1) return words[0].charAt(0).toUpperCase();
    return `${words[0].charAt(0).toUpperCase()}${words[words.length - 1]
      .charAt(0)
      .toUpperCase()}`;
  };

  // Logout function - Clear localStorage and redirect
  const handleLogout = async () => {
    try {
      await apiPost(API_ENDPOINTS.AUTH.LOGIN, { action: "logout" });

      // Clear auth and user data from localStorage
      clearAuth();
      localStorage.removeItem("user");
      localStorage.removeItem("user_info");
      localStorage.removeItem("token");
      localStorage.removeItem("refreshToken");

      // Close dropdown
      setDropdownOpen(false);

      // Redirect to login
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Logout error:", error);
      navigate("/login", { replace: true });
    }
  };

  const getSelectedFinancialYearLabel = () => {
    if (selectedFinancialYear === ALL_YEARS_VALUE) {
      return "All Year";
    }

    const selectedYear = financialYears.find(
      (year: any) => year.value === selectedFinancialYear,
    );

    return selectedYear?.label || "Select Year";
  };

  const financialYearOptions = [
    { id: ALL_YEARS_VALUE, label: "All Year", value: ALL_YEARS_VALUE },
    ...financialYears,
  ];

  // Handle unread count change from Notification component
  const handleUnreadCountChange = (count: number) => {
    setUnreadCount(count);
  };

  // Admin Menu Items
  const adminMenuItems = [
    {
      to: "/admin/dashboard",
      icon: "fa-solid fa-house",
      label: "Dashboard",
      permissionKey: "dashboard",
    },
    {
      to: "/admin/client-management",
      icon: "fa-solid fa-users",
      label: "Client Management",
      permissionKey: "clientManagement",
    },
    {
      to: "/admin/file-management",
      icon: "fa-solid fa-folder-open",
      label: "File Management",
      permissionKey: "fileManagement",
    },
    {
      to: "/admin/vendor-management",
      icon: "fa-solid fa-store",
      label: "Vendor Management",
      permissionKey: "vendorManagement",
    },
    {
      to: "/admin/purchase-management",
      icon: "fa-solid fa-cart-plus",
      label: "Purchase Management",
      permissionKey: "purchaseManagement",
    },
    {
      to: "/admin/sales-management",
      icon: "fa-brands fa-shopify",
      label: "Sales Management",
      permissionKey: "salesManagement",
    },
    {
      to: "/admin/rcm-management",
      icon: "fa-solid fa-file-invoice-dollar",
      label: "RCM Management",
      permissionKey: "rcmManagement",
    },
    {
      to: "/admin/company-expense-management",
      icon: "fa-solid fa-money-bill-wave",
      label: "Company Expense",
      permissionKey: "companyExpenseManagement",
    },
    {
      to: "/admin/ledger-management",
      icon: "fa-solid fa-book",
      label: "Ledger Management",
      permissionKey: "ledgerManagement",
    },
    {
      to: "/admin/books-of-accounts",
      icon: "fa-solid fa-table-list",
      label: "Books of Accounts",
      permissionKey: "booksOfAccounts",
    },
    {
      to: "/admin/balance-sheet",
      icon: "fa-solid fa-scale-unbalanced-flip",
      label: "Balance Sheet",
      permissionKey: "balanceSheet",
    },
    {
      to: "/admin/qutation-management",
      icon: "fa-solid fa-file-signature",
      label: "Qutation Management",
      permissionKey: "qutationManagement",
    },
    {
      to: "/admin/services-management",
      icon: "fa-solid fa-globe",
      label: "Services Management",
      permissionKey: "servicesManagement",
    },
    {
      to: "/admin/project-management",
      icon: "fa-solid fa-diagram-project",
      label: "Project Management",
      permissionKey: "projectManagement",
    },
    {
      to: "/admin/project-details",
      icon: "fa-solid fa-list-check",
      label: "Project Details",
      permissionKey: "projectDetails",
    },
    {
      to: "/admin/developer-payout-management",
      icon: "fa-solid fa-hand-holding-dollar",
      label: "Developer Payout",
      permissionKey: "developerPayoutManagement",
    },
    {
      to: "/admin/owner-investment",
      icon: "fa-solid fa-sack-dollar",
      label: "Owner Investment",
      permissionKey: "ownerInvestment",
    },
    {
      to: "/admin/project-credentials",
      icon: "fa-solid fa-key",
      label: "Project Credentials",
      permissionKey: "projectCredentials",
    },
    {
      to: "/admin/staff-management",
      icon: "fa-solid fa-user-tie",
      label: "Staff Management",
      permissionKey: "staffManagement",
    },
    {
      to: "/admin/team-management",
      icon: "fa-solid fa-user-shield",
      label: "Team Management",
      permissionKey: "teamManagement",
    },
    {
      to: "/admin/financial-year-management",
      icon: "fa-regular fa-calendar-days",
      label: "Financial Year Management",
      permissionKey: "financialYearManagement",
    },
    {
      to: "/admin/setting",
      icon: "fa-solid fa-gear",
      label: "Setting",
      permissionKey: "setting",
    },
  ];

  // Get current menu based on role
  const getCurrentMenuItems = () => {
    return adminMenuItems
      .filter((item: any) => {
        if (!item.permissionKey) return true;
        return hasModuleAccess(item.permissionKey);
      })
      .map((item: any) => ({
        ...item,
        to: withRolePrefix(item.to),
      }));
  };

  // Get dashboard link based on role
  const getDashboardLink = () => {
    return withRolePrefix("/admin/dashboard");
  };

  // Styles
  const dropdownStyle: Record<string, React.CSSProperties> = {
    profile: {
      minWidth: "200px",
      padding: "0",
      border: "none",
      boxShadow: "0 5px 15px rgba(0,0,0,0.1)",
      borderRadius: "10px",
      overflow: "hidden",
    },
    dropdownItem: {
      padding: "10px 15px",
      transition: "all 0.2s",
      borderBottom: "1px solid rgba(0,0,0,0.05)",
    },
  };

  const financialYearStyle: Record<string, React.CSSProperties> = {
    container: {
      position: "relative",
      minWidth: "150px",
    },
    select: {
      width: "100%",
      padding: "10px 35px 10px 15px",
      borderRadius: "25px",
      border: "2px solid #007026",
      backgroundColor: "#def9e7",
      cursor: "pointer",
      fontSize: "14px",
      fontWeight: "500",
      color: "#333",
      appearance: "none",
      WebkitAppearance: "none",
      MozAppearance: "none",
      backgroundImage: "none",
    },
    icon: {
      position: "absolute",
      right: "15px",
      top: "50%",
      transform: "translateY(-50%)",
      color: "#007026",
      pointerEvents: "none",
      transition: "transform 0.3s ease",
    },
    iconRotated: {
      transform: "translateY(-50%) rotate(180deg)",
    },
    dropdown: {
      position: "absolute",
      top: "calc(100% + 5px)",
      left: 0,
      right: 0,
      backgroundColor: "#fff",
      borderRadius: "10px",
      boxShadow: "0 5px 15px rgba(0,0,0,0.1)",
      zIndex: 1000,
      maxHeight: "250px",
      overflowY: "auto",
    },
    option: {
      padding: "10px 15px",
      cursor: "pointer",
      transition: "all 0.2s",
      fontSize: "14px",
      borderBottom: "1px solid rgba(0,0,0,0.05)",
    },
    optionHover: {
      backgroundColor: "#d7fee4",
    },
    optionSelected: {
      backgroundColor: "#007026",
      color: "#fff",
    },
    label: {
      display: "block",
      marginBottom: "5px",
      fontSize: "12px",
      fontWeight: "600",
      color: "#666",
    },
  };

  const activeLinkStyle = {
    background: "var(--header-gradient)",
    color: "white",
    padding: "10px",
    borderRadius: "5px",
    display: "block",
  };

  const currentMenuItems = getCurrentMenuItems();

  return (
    <>
      <div
        id="app-layout"
        className={sidebarCollapsed ? "sidebar-collapsed" : ""}
      >
        {/* Topbar */}
        <div className="topbar-custom">
          <div className="container-fluid">
            <div className="d-flex justify-content-between">
              {/* Left Side */}
              <ul className="list-unstyled topnav-menu mb-0 d-flex align-items-center">
                <li>
                  <button
                    className="button-toggle-menu nav-link"
                    onClick={toggleSidebar}
                  >
                    <i className="fa-solid fa-bars"></i>
                  </button>
                </li>
                {isMobile && (
                  <li className="d-lg-none ms-2">
                    <NavLink to={getDashboardLink()} className="logo logo-dark">
                      <img
                        src="/Logo.png"
                        alt=""
                        style={{ width: "200px", height: "50px" }}
                      />
                    </NavLink>
                  </li>
                )}
                <li className="d-none d-lg-block">
                  <h5 className="mb-0">
                    {greeting}, {user.name}
                  </h5>
                </li>
              </ul>

              {/* Right Side */}
              <ul className="list-unstyled topnav-menu mb-0 d-flex align-items-center">
                {/* Financial Year Dropdown - Replacing Search */}
                <li className="d-none d-lg-block me-3" ref={financialYearRef}>
                  <div style={financialYearStyle.container}>
                    <div
                      className="financial-year-select"
                      style={financialYearStyle.select}
                      onClick={() =>
                        setFinancialYearDropdownOpen(!financialYearDropdownOpen)
                      }
                    >
                      {getSelectedFinancialYearLabel()}
                    </div>
                    <i
                      className="fa-solid fa-chevron-down"
                      style={{
                        ...financialYearStyle.icon,
                        ...(financialYearDropdownOpen
                          ? financialYearStyle.iconRotated
                          : {}),
                      }}
                    />

                    {financialYearDropdownOpen && (
                      <div style={financialYearStyle.dropdown}>
                        {financialYearOptions.map((year) => (
                          <div
                            key={year.id}
                            style={{
                              ...financialYearStyle.option,
                              ...(selectedFinancialYear === year.value
                                ? financialYearStyle.optionSelected
                                : {}),
                            }}
                            onClick={() =>
                              handleFinancialYearSelect(year.value)
                            }
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor =
                                selectedFinancialYear === year.value
                                  ? "#007026"
                                  : "#f0f0f0";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor =
                                selectedFinancialYear === year.value
                                  ? "#007026"
                                  : "transparent";
                            }}
                          >
                            {year.label}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </li>

                <li className="d-flex">
                  <a
                    href="#notificationSlider"
                    className="cart-content"
                    data-bs-toggle="offcanvas"
                    role="button"
                    aria-controls="notificationSlider"
                  >
                    <i
                      className="fa-solid fa-bell fs-4"
                      style={{ color: "#ffb200" }}
                    ></i>
                    {unreadCount > 0 && (
                      <span className="head-cart-counter">{unreadCount}</span>
                    )}
                  </a>
                </li>

                {/* Fullscreen */}
                {!isMobile && (
                  <li className="d-flex">
                    <button
                      type="button"
                      className="btn nav-link"
                      onClick={toggleFullscreen}
                    >
                      <i
                        className={`fa-solid ${isFullscreen ? "fa-compress" : "fa-expand"} align-middle noti-icon`}
                      />
                    </button>
                  </li>
                )}

                {/* Profile Dropdown */}
                <li
                  className="dropdown notification-list1 topbar-dropdown"
                  ref={dropdownRef}
                >
                  <a
                    className="nav-link dropdown-toggle1 nav-user"
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    role="button"
                    aria-haspopup="true"
                    aria-expanded={dropdownOpen}
                  >
                    <div className="d-flex align-items-center">
                      <div
                        className="profile-initials"
                        style={{
                          backgroundColor: circleColor,
                          width: "40px",
                          height: "40px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: "50%",
                          color: "white",
                          fontWeight: "bold",
                          fontSize: "18px",
                        }}
                      >
                        {getInitials(user.name)}
                      </div>
                    </div>
                  </a>

                  {dropdownOpen && (
                    <div
                      className="dropdown-menu dropdown-menu-end profile-dropdown show"
                      style={dropdownStyle.profile}
                    >
                      <div className="dropdown-header noti-title p-3 border-bottom">
                        <h6
                          className="text-overflow"
                          style={{
                            fontSize: "16px",
                            fontWeight: "700",
                            marginBottom: "5px",
                          }}
                        >
                          Welcome, {user.name}!
                        </h6>
                        <small
                          className="text-muted"
                          style={{ fontSize: "12px", fontWeight: "700" }}
                        >
                          {user.email}
                        </small>
                        <small
                          className="text-primary d-block mt-1"
                          style={{ fontSize: "11px" }}
                        >
                          Role: {user.role || "User"}
                        </small>
                      </div>

                      <div className="dropdown-divider m-0"></div>
                      <a
                        className="dropdown-item p-3"
                        href="#"
                        style={dropdownStyle.dropdownItem}
                        onClick={handleLogout}
                      >
                        <i className="fa-solid fa-right-from-bracket me-2 fs-16 align-middle text-danger"></i>
                        <span>Logout</span>
                      </a>
                    </div>
                  )}
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div
          className={`app-sidebar-menu ${sidebarCollapsed ? "collapsed" : ""}`}
        >
          <div className="h-100" data-simplebar>
            <div id="sidebar-menu">
              <div className="logo-box">
                <NavLink to={getDashboardLink()} className="logo logo-dark">
                  <span className="logo-sm">
                    <img
                      src="/Logo.png"
                      alt=""
                      style={{ width: "200px", height: "50px" }}
                    />
                  </span>
                  <span className="logo-lg">
                    <img
                      src="/Logo.png"
                      alt=""
                      style={{ width: "200px", height: "50px" }}
                    />
                  </span>
                </NavLink>
              </div>

              <ul id="side-menu">
                {/* Dynamic Menu Items based on Role */}
                {currentMenuItems.map((item, index) => (
                  <li key={index}>
                    <NavLink
                      to={item.to}
                      style={({ isActive }) =>
                        isActive
                          ? activeLinkStyle
                          : { padding: "10px", display: "block" }
                      }
                    >
                      <i className={item.icon}></i>
                      <span> {item.label} </span>
                    </NavLink>
                  </li>
                ))}

                <li>
                  <a
                    href="#"
                    style={{ padding: "10px", display: "block" }}
                    onClick={handleLogout}
                  >
                    <i className="fa-solid fa-right-from-bracket"></i>
                    <span> Logout </span>
                  </a>
                </li>
              </ul>
            </div>
            <div className="clearfix" />
          </div>
        </div>

        {/* Content Area */}
        <div
          className={`content-page ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}
        >
          <div className="content">{children}</div>

          {/* Footer */}
          <footer className="footer" style={{ marginTop: "50px" }}>
            <div className="container-fluid">
              <div className="row">
                <div className="col fs-10 fw-semi-bold text-muted text-center">
                  <i className="fa-regular fa-copyright"></i>{" "}
                  {new Date().getFullYear()} - Made with{" "}
                  <span className="fa-solid fa-heart text-danger" /> by{" "}
                  <a
                    href="https://www.maxcode.in"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#ff0000" }}
                  >
                    MaxCode IT Services
                  </a>
                </div>
              </div>
            </div>
          </footer>
        </div>
      </div>

      {/* Notification Component */}
      <Notification onUnreadCountChange={handleUnreadCountChange} />

      <style>{`
        @media (max-width: 768px) {
          .content {
            margin-bottom: 120px;
          }
        }

        @media (min-width: 769px) {
          .content {
            margin-bottom: 30px;
          }
        }

        .profile-initials {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: 50%;
          color: white;
          font-weight: bold;
          font-size: 18px;
        }

        .dropdown-toggle1 {
          cursor: pointer;
          transition: all 0.3s;
        }

        .dropdown-toggle1:hover {
          transform: scale(1.05);
        }

        .profile-dropdown.show {
          display: block;
          position: absolute;
          right: 0;
          left: auto;
          z-index: 1000;
        }

        .role-display {
          background: linear-gradient(135deg, var(--bs-primary) 0%, var(--bs-primary-dark) 100%);
          animation: fadeIn 0.5s ease-in;
        }

        .financial-year-select {
          transition: all 0.3s ease;
        }

        .financial-year-select:hover {
          border-color: #007026;
          background-color: #fff;
        }

        .head-cart-counter {
          position: absolute;
          top: -5px;
          right: -5px;
          background-color: #ff4d4d;
          color: white;
          border-radius: 50%;
          width: 18px;
          height: 18px;
          font-size: 11px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
        }

        .cart-content {
          position: relative;
          display: inline-block;
        }

        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* Scrollbar styling for financial year dropdown */
        .financial-year-select + div::-webkit-scrollbar {
          width: 5px;
        }

        .financial-year-select + div::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 10px;
        }

        .financial-year-select + div::-webkit-scrollbar-thumb {
          background: #007026;
          border-radius: 10px;
        }

        .financial-year-select + div::-webkit-scrollbar-thumb:hover {
          background: #007026;
        }
      `}</style>
    </>
  );
};

export default DashboardNavbar;
