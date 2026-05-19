import React, { useState, useEffect, useRef, useCallback } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { apiGet, apiPost, apiPut, clearAuth } from "../utils/api";
import {
  hasModuleAccess,
  getStoredUserInfo,
  withRolePrefix,
} from "../utils/permissions";
import Notification from "./Notification";
import ConfirmationModal from "./ConfirmationModal";

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

const PDF_EXPORT_SINGLE_PAGE_COLUMNS_MODE_KEY =
  "pdfExportSinglePageColumnsMode";
const EXPORT_PRESERVE_TEXT_COLOR_MODE_KEY = "exportPreserveTextColorMode";

const DashboardNavbar = ({ children }: DashboardNavbarProps) => {
  // State management
  const navigate = useNavigate();
  const location = useLocation();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
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
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [singlePagePdfColumnsMode, setSinglePagePdfColumnsMode] =
    useState(false);
  const [preserveExportTextColorMode, setPreserveExportTextColorMode] =
    useState(false);
  const [projectCredentialsAccessControl, setProjectCredentialsAccessControl] =
    useState(true);
  const [publicPaymentWhatsappEnabled, setPublicPaymentWhatsappEnabled] =
    useState(true);
  const [cloudflareLoginCaptchaEnabled, setCloudflareLoginCaptchaEnabled] =
    useState(false);
  const [showCompanyTooltip, setShowCompanyTooltip] = useState(false);
  const [user, setUser] = useState({
    name: "Guest User",
    email: "guest@example.com",
    role: "User",
  });
  const dropdownRef = useRef<HTMLLIElement | null>(null);
  const financialYearRef = useRef<HTMLLIElement | null>(null);
  const companyTooltipRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    const enabled =
      String(
        localStorage.getItem(PDF_EXPORT_SINGLE_PAGE_COLUMNS_MODE_KEY) || "",
      ).toLowerCase() === "true";
    setSinglePagePdfColumnsMode(enabled);

    const preserveExportTextColor =
      String(
        localStorage.getItem(EXPORT_PRESERVE_TEXT_COLOR_MODE_KEY) || "",
      ).toLowerCase() === "true";
    setPreserveExportTextColorMode(preserveExportTextColor);
  }, []);

  // Fetch business settings feature toggles
  useEffect(() => {
    const fetchFeatureToggles = async () => {
      try {
        const res = await apiGet(API_ENDPOINTS.BUSINESS_SETTINGS.GET);
        const settings = res?.data?.settings || res?.data || {};
        const toggles = settings.featureToggles || {};

        // Default to true if not explicitly set to false
        const projCredAccess =
          toggles.projectCredentialsAccessControl !== false;
        const pubPaymentWhatsapp = toggles.publicPaymentWhatsapp !== false;
        const cloudflareLoginCaptcha = toggles.cloudflareLoginCaptcha === true;

        setProjectCredentialsAccessControl(projCredAccess);
        setPublicPaymentWhatsappEnabled(pubPaymentWhatsapp);
        setCloudflareLoginCaptchaEnabled(cloudflareLoginCaptcha);
        window.dispatchEvent(
          new CustomEvent("business-settings-updated", {
            detail: { featureToggles: toggles },
          }),
        );
      } catch (err) {
        console.error("Failed to fetch feature toggles:", err);
        // keep defaults as true
      }
    };

    fetchFeatureToggles();
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

  // Close tooltip when clicking outside or moving cursor far away
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;

      if (
        dropdownRef.current &&
        target &&
        !dropdownRef.current.contains(target as Node)
      ) {
        setDropdownOpen(false);
      }
      if (
        financialYearRef.current &&
        target &&
        !financialYearRef.current.contains(target as Node)
      ) {
        setFinancialYearDropdownOpen(false);
      }
      if (
        companyTooltipRef.current &&
        target &&
        !companyTooltipRef.current.contains(target as Node) &&
        !target.closest("a[href*='maxcode']")
      ) {
        setShowCompanyTooltip(false);
      }
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!showCompanyTooltip || !companyTooltipRef.current) return;

      const rect = companyTooltipRef.current.getBoundingClientRect();
      const distance = calculateDistanceToElement(event.clientX, event.clientY, rect);

      if (distance > 100) {
        setShowCompanyTooltip(false);
      }
    };

    const calculateDistanceToElement = (x: number, y: number, rect: DOMRect) => {
      const closestX = Math.max(rect.left, Math.min(x, rect.right));
      const closestY = Math.max(rect.top, Math.min(y, rect.bottom));
      const dx = x - closestX;
      const dy = y - closestY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("mousemove", handleMouseMove);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("mousemove", handleMouseMove);
    };
  }, [showCompanyTooltip]);

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
        document.body.setAttribute("data-sidebar", "default");
        document.body.classList.remove("sidebar-collapsed");
        document.body.classList.remove("sidebar-enable");
        setMobileSidebarOpen(false);
      } else {
        document.body.setAttribute("data-sidebar", "default");
        document.body.classList.remove("sidebar-collapsed");
        document.body.classList.remove("sidebar-enable");
        setMobileSidebarOpen(false);
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
  const closeMobileSidebar = () => {
    setMobileSidebarOpen(false);
    document.body.classList.remove("sidebar-enable");
  };

  const toggleSidebar = () => {
    if (isMobile) {
      const nextEnabled = !mobileSidebarOpen;
      setMobileSidebarOpen(nextEnabled);

      if (nextEnabled) {
        document.body.classList.add("sidebar-enable");
        document.body.setAttribute("data-sidebar", "default");
      } else {
        document.body.classList.remove("sidebar-enable");
      }

      return;
    }

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

  const getRoleLabel = () => {
    const normalizedRole = String(user.role || "User")
      .trim()
      .toLowerCase();

    if (normalizedRole.includes("super")) return "Super Admin";
    if (normalizedRole.includes("admin")) return "Admin";
    return "User";
  };

  const getRoleDescription = () => {
    const normalizedRole = String(user.role || "User")
      .trim()
      .toLowerCase();

    if (normalizedRole.includes("super")) {
      return "Full access enabled for system-wide management.";
    }

    if (normalizedRole.includes("admin")) {
      return "Administrative access enabled for workspace management.";
    }

    return "Standard user access enabled for assigned features.";
  };

  const getAccessSummary = () => {
    const accessibleModules = adminMenuItems.filter((item: any) => {
      if (!item.permissionKey) return true;
      return hasModuleAccess(item.permissionKey);
    }).length;

    const totalModules = adminMenuItems.length;

    if (accessibleModules >= totalModules) {
      return "Full access enabled for system-wide management.";
    }

    if (accessibleModules >= Math.ceil(totalModules / 2)) {
      return "Partial access enabled for selected management areas.";
    }

    return "Partial access enabled for limited management areas.";
  };

  const requestLogout = (event?: React.MouseEvent<HTMLElement>) => {
    event?.preventDefault();
    setDropdownOpen(false);
    setShowLogoutConfirm(true);
  };

  const handleToggleSinglePagePdfColumnsMode = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const enabled = event.target.checked;
    setSinglePagePdfColumnsMode(enabled);
    localStorage.setItem(
      PDF_EXPORT_SINGLE_PAGE_COLUMNS_MODE_KEY,
      enabled ? "true" : "false",
    );
  };

  const handleTogglePreserveExportTextColorMode = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const enabled = event.target.checked;
    setPreserveExportTextColorMode(enabled);
    localStorage.setItem(
      EXPORT_PRESERVE_TEXT_COLOR_MODE_KEY,
      enabled ? "true" : "false",
    );
  };

  const saveFeatureToggles = async (nextToggles: any) => {
    try {
      const payload = { featureToggles: nextToggles };

      const response = await apiPut(
        API_ENDPOINTS.BUSINESS_SETTINGS.UPDATE,
        payload,
      );

      const returned = response?.data?.settings || {};
      const toggles = returned.featureToggles || nextToggles || {};

      // Use same logic as fetch: anything other than false = true
      setProjectCredentialsAccessControl(
        toggles.projectCredentialsAccessControl !== false,
      );
      setPublicPaymentWhatsappEnabled(toggles.publicPaymentWhatsapp !== false);
      setCloudflareLoginCaptchaEnabled(toggles.cloudflareLoginCaptcha === true);

      window.dispatchEvent(
        new CustomEvent("business-settings-updated", {
          detail: { featureToggles: toggles },
        }),
      );

      // Force refresh from server after a short delay to ensure DB is updated
      setTimeout(() => {
        apiGet(API_ENDPOINTS.BUSINESS_SETTINGS.GET, { forceRefresh: true })
          .then((res: any) => {
            const settings = res?.data?.settings || res?.data || {};
            const freshToggles = settings.featureToggles || {};
            setProjectCredentialsAccessControl(
              freshToggles.projectCredentialsAccessControl !== false,
            );
            setPublicPaymentWhatsappEnabled(
              freshToggles.publicPaymentWhatsapp !== false,
            );
            setCloudflareLoginCaptchaEnabled(
              freshToggles.cloudflareLoginCaptcha === true,
            );
            window.dispatchEvent(
              new CustomEvent("business-settings-updated", {
                detail: { featureToggles: freshToggles },
              }),
            );
          })
          .catch((err: any) =>
            console.error("Failed to refresh toggles:", err),
          );
      }, 300);
    } catch (error) {
      console.error("Failed to save feature toggles", error);
      // Reset to previous values on error
    }
  };

  const handleToggleProjectCredentialsAccessControl = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const enabled = event.target.checked;
    setProjectCredentialsAccessControl(enabled);
    saveFeatureToggles({
      projectCredentialsAccessControl: enabled,
      publicPaymentWhatsapp: publicPaymentWhatsappEnabled,
    });
  };

  const handleTogglePublicPaymentWhatsapp = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const enabled = event.target.checked;
    setPublicPaymentWhatsappEnabled(enabled);
    saveFeatureToggles({
      projectCredentialsAccessControl,
      publicPaymentWhatsapp: enabled,
      cloudflareLoginCaptcha: cloudflareLoginCaptchaEnabled,
    });
  };

  const handleToggleCloudflareLoginCaptcha = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const enabled = event.target.checked;
    setCloudflareLoginCaptchaEnabled(enabled);
    saveFeatureToggles({
      projectCredentialsAccessControl,
      publicPaymentWhatsapp: publicPaymentWhatsappEnabled,
      cloudflareLoginCaptcha: enabled,
    });
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
      setShowLogoutConfirm(false);

      // Redirect to login
      navigate("/login", { replace: true });
    } catch (error) {
      console.error("Logout error:", error);
      setShowLogoutConfirm(false);
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
      to: "/admin/lead-management",
      icon: "fa-solid fa-address-book",
      label: "Lead Management",
      permissionKey: "leadManagement",
    },
    {
      to: "/admin/client-management",
      icon: "fa-solid fa-users",
      label: "Client Management",
      permissionKey: "clientManagement",
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
      to: "/admin/payment-receipt-management",
      icon: "fa-solid fa-receipt",
      label: "Payment Receipts",
      permissionKey: "paymentReceiptManagement",
    },
    {
      to: "/admin/credit-debit-notes-management",
      icon: "fas fa-envelope-open-text",
      label: "Credit/Debit Notes",
      permissionKey: "creditDebitNotesManagement",
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
      to: "/admin/owner-withdrawal",
      icon: "fa-solid fa-money-bill-transfer",
      label: "Owner Withdrawal",
      permissionKey: "ownerWithdrawal",
    },
    {
      to: "/admin/project-credentials",
      icon: "fa-solid fa-key",
      label: "Project Credentials",
      permissionKey: "projectCredentials",
    },
    {
      to: "/admin/my-software-credential",
      icon: "fas fa-user-lock",
      label: "My Software Credential",
      permissionKey: "mySoftwareCredential",
    },
    {
      to: "/admin/file-management",
      icon: "fa-solid fa-folder-open",
      label: "File Management",
      permissionKey: "fileManagement",
    },
    {
      to: "/admin/payment-link-management",
      icon: "fa-solid fa-link",
      label: "Payment Links",
      permissionKey: "paymentLinkManagement",
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
      label: "Financial Year",
      permissionKey: "financialYearManagement",
    },
    {
      to: "/admin/otp-request-management",
      icon: "fa-solid fa-shield-halved",
      label: "OTP Request Management",
      permissionKey: "otpRequestManagement",
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
      minWidth: "320px",
      maxWidth: "360px",
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
                      <div className="dropdown-header noti-title px-3 pt-3 pb-2 border-bottom">
                        <div className="d-flex align-items-center flex-nowrap gap-2">
                          <div
                            className="profile-dropdown-avatar"
                            style={{
                              backgroundColor: circleColor,
                              flexShrink: 0,
                            }}
                          >
                            {getInitials(user.name)}
                          </div>

                          <div className="flex-grow-1 min-w-0">
                            <h6
                              className="text-overflow mb-1"
                              style={{
                                fontSize: "16px",
                                fontWeight: "700",
                              }}
                            >
                              Welcome, {user.name}!
                            </h6>
                            <small
                              className="text-muted d-block"
                              style={{ fontSize: "12px", fontWeight: "700" }}
                            >
                              {user.email}
                            </small>
                          </div>
                        </div>

                        <div className="d-lg-none mt-2">
                          <small
                            className="text-muted d-block mb-1"
                            style={{ fontSize: "11px", fontWeight: 600 }}
                          >
                            Financial Year
                          </small>
                          <select
                            className="form-select form-select-sm"
                            value={selectedFinancialYear}
                            onChange={(e) =>
                              handleFinancialYearSelect(e.target.value)
                            }
                            style={{
                              borderColor: "#007026",
                              backgroundColor: "#def9e7",
                              fontSize: "12px",
                            }}
                          >
                            {financialYearOptions.map((year) => (
                              <option key={year.id} value={year.value}>
                                {year.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="dropdown-divider m-0"></div>
                      <div className="dropdown-item px-3 py-2 border-bottom">
                        <div className="d-flex align-items-center justify-content-between gap-2">
                          <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                            <div
                              className="fw-semibold"
                              style={{ fontSize: "13px" }}
                            >
                              Role: {getRoleLabel()}
                            </div>
                            <small
                              className="text-muted d-block mt-1"
                              style={{ fontSize: "11px" }}
                            >
                              {getAccessSummary()}
                            </small>
                          </div>
                          <div
                            className="form-check form-switch"
                            style={{ flex: "0 0 auto", marginRight: "-10px" }}
                          >
                            <input
                              className="form-check-input"
                              type="checkbox"
                              checked={true}
                              readOnly
                            />
                          </div>
                        </div>
                      </div>
                      <div className="dropdown-item px-3 py-2 border-bottom">
                        <div className="d-flex align-items-center justify-content-between gap-2">
                          <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                            <div
                              className="fw-semibold"
                              style={{ fontSize: "13px" }}
                            >
                              PDF Fit All Columns In One Page
                            </div>
                            <small
                              className="text-muted"
                              style={{ fontSize: "11px" }}
                            >
                              Export Table with Adjustable Column Views
                            </small>
                          </div>
                          <div
                            className="form-check form-switch"
                            style={{ flex: "0 0 auto", marginRight: "-10px" }}
                          >
                            <input
                              className="form-check-input"
                              type="checkbox"
                              checked={singlePagePdfColumnsMode}
                              onChange={handleToggleSinglePagePdfColumnsMode}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="dropdown-item px-3 py-2 border-bottom">
                        <div className="d-flex align-items-center justify-content-between gap-2">
                          <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                            <div
                              className="fw-semibold"
                              style={{ fontSize: "13px" }}
                            >
                              Export Preserve Text Colors
                            </div>
                            <small
                              className="text-muted"
                              style={{ fontSize: "11px" }}
                            >
                              Export Tables with Applied Text Colors
                            </small>
                          </div>
                          <div
                            className="form-check form-switch "
                            style={{ flex: "0 0 auto", marginRight: "-10px" }}
                          >
                            <input
                              className="form-check-input"
                              type="checkbox"
                              checked={preserveExportTextColorMode}
                              onChange={handleTogglePreserveExportTextColorMode}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Public Payment Link WhatsApp toggle - only Super Admin */}
                      {String(user.role || "")
                        .toLowerCase()
                        .includes("super") && (
                        <div className="dropdown-item px-3 py-2 border-bottom">
                          <div className="d-flex align-items-center justify-content-between gap-2">
                            <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                              <div
                                className="fw-semibold"
                                style={{ fontSize: "13px" }}
                              >
                                Public Payment Link WhatsApp
                              </div>
                              <small
                                className="text-muted"
                                style={{ fontSize: "11px" }}
                              >
                                Transaction Verification Notification Control.
                              </small>
                            </div>
                            <div
                              className="form-check form-switch "
                              style={{ flex: "0 0 auto", marginRight: "-10px" }}
                            >
                              <input
                                className="form-check-input"
                                type="checkbox"
                                checked={publicPaymentWhatsappEnabled}
                                onChange={handleTogglePublicPaymentWhatsapp}
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Project Credentials Access Control - only Super Admin */}
                      {String(user.role || "")
                        .toLowerCase()
                        .includes("super") && (
                        <div className="dropdown-item px-3 py-2 border-bottom">
                          <div className="d-flex align-items-center justify-content-between gap-2">
                            <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                              <div
                                className="fw-semibold"
                                style={{ fontSize: "13px" }}
                              >
                                Project Credentials Access Control
                              </div>
                              <small
                                className="text-muted"
                                style={{ fontSize: "11px" }}
                              >
                                Super Admin view & edit Credentials Access
                                Control.
                              </small>
                            </div>
                            <div
                              className="form-check form-switch"
                              style={{ flex: "0 0 auto", marginRight: "-10px" }}
                            >
                              <input
                                className="form-check-input"
                                type="checkbox"
                                checked={projectCredentialsAccessControl}
                                onChange={
                                  handleToggleProjectCredentialsAccessControl
                                }
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Cloudflare Login Captcha - only Super Admin */}
                      {String(user.role || "")
                        .toLowerCase()
                        .includes("super") && (
                        <div className="dropdown-item px-3 py-2 border-bottom">
                          <div className="d-flex align-items-center justify-content-between gap-2">
                            <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                              <div
                                className="fw-semibold"
                                style={{ fontSize: "13px" }}
                              >
                                Cloudflare Login Captcha
                              </div>
                              <small
                                className="text-muted"
                                style={{ fontSize: "11px" }}
                              >
                                Require Turnstile verification before login.
                              </small>
                            </div>
                            <div
                              className="form-check form-switch"
                              style={{ flex: "0 0 auto", marginRight: "-10px" }}
                            >
                              <input
                                className="form-check-input"
                                type="checkbox"
                                checked={cloudflareLoginCaptchaEnabled}
                                onChange={handleToggleCloudflareLoginCaptcha}
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="dropdown-divider m-0"></div>

                      <a
                        className="dropdown-item px-3 pt-2 pb-3"
                        href="#"
                        style={dropdownStyle.dropdownItem}
                        onClick={requestLogout}
                      >
                        <i className="fa-solid fa-right-from-bracket me-2 fs-16 align-middle text-danger"></i>
                        <span className="fw-bold">Logout</span>
                      </a>
                    </div>
                  )}
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        {isMobile && mobileSidebarOpen && (
          <div
            aria-hidden="true"
            onClick={closeMobileSidebar}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.45)",
              zIndex: 1040,
            }}
          />
        )}

        <div
          className={`app-sidebar-menu ${sidebarCollapsed ? "collapsed" : ""}`}
          style={
            isMobile
              ? {
                  position: "fixed",
                  top: 0,
                  left: 0,
                  width: "100vw",
                  height: "100vh",
                  zIndex: 1050,
                  transform: mobileSidebarOpen
                    ? "translateX(0)"
                    : "translateX(-100%)",
                  visibility: mobileSidebarOpen ? "visible" : "hidden",
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                  paddingTop: 0,
                  paddingBottom: 0,
                  background: "var(--bs-sidebar-bg)",
                  boxShadow: "0 20px 45px rgba(0,0,0,0.28)",
                  transition: "transform 0.25s ease, visibility 0.25s ease",
                }
              : undefined
          }
        >
          <div className="h-100 d-flex flex-column" style={{ minHeight: 0 }}>
            {isMobile && (
              <div
                style={{
                  flex: "0 0 auto",
                  minHeight: 72,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "0 18px",
                  borderBottom: "3px solid rgba(0,0,0,0.18)",
                  position: "sticky",
                  top: 0,
                  zIndex: 2,
                  background: "var(--bs-sidebar-bg)",
                  boxShadow: "0 1px 0 rgba(255,255,255,0.12)",
                }}
              >
                <NavLink to={getDashboardLink()} className="logo logo-dark">
                  <img
                    src="/Logo.png"
                    alt=""
                    style={{ width: "180px", height: "48px" }}
                  />
                </NavLink>
                <button
                  type="button"
                  className="btn btn-link p-0"
                  onClick={closeMobileSidebar}
                  aria-label="Close menu"
                  style={{ color: "inherit" }}
                >
                  <i className="far fa-times-circle fs-1"></i>
                </button>
              </div>
            )}

            <div
              className="h-100"
              data-simplebar
              style={{ minHeight: 0, overflowY: "auto", flex: "1 1 auto" }}
            >
              <div id="sidebar-menu">
                {!isMobile && (
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
                )}

                <ul id="side-menu">
                  {/* Dynamic Menu Items based on Role */}
                  {currentMenuItems.map((item, index) => (
                    <li key={index}>
                      <NavLink
                        to={item.to}
                        onClick={isMobile ? closeMobileSidebar : undefined}
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

                  {!isMobile && (
                    <li>
                      <a
                        href="#"
                        style={{ padding: "10px", display: "block" }}
                        onClick={requestLogout}
                      >
                        <i className="fa-solid fa-right-from-bracket"></i>
                        <span> Logout </span>
                      </a>
                    </li>
                  )}
                </ul>
              </div>
              <div className="clearfix" />
            </div>

            {isMobile && (
              <div
                style={{
                  flex: "0 0 auto",
                  position: "sticky",
                  bottom: 0,
                  zIndex: 2,
                  padding: "14px 18px 18px",
                  borderTop: "1px solid rgba(255,255,255,0.08)",
                  background: "inherit",
                }}
              >
                <a
                  href="#"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    width: "100%",
                    padding: "12px 14px",
                    borderRadius: 12,
                    textDecoration: "none",
                    color: "#d9534f",
                    fontWeight: 700,
                    background: "rgba(217, 83, 79, 0.08)",
                  }}
                  onClick={(event) => {
                    event.preventDefault();
                    closeMobileSidebar();
                    requestLogout();
                  }}
                >
                  <i className="fa-solid fa-right-from-bracket"></i>
                  <span> Logout </span>
                </a>
              </div>
            )}
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
                  <span
                    style={{
                      position: "relative",
                      display: "inline-block",
                      cursor: "pointer",
                    }}
                  >
                    <span
                      onClick={() => setShowCompanyTooltip(!showCompanyTooltip)}
                      onMouseEnter={() => setShowCompanyTooltip(true)}
                      style={{
                        color: "#FF0000",
                        textDecoration: "underline",
                        textDecorationColor: "#ffffff",
                        textUnderlineOffset: "4px",
                        fontWeight: "700",
                        letterSpacing: "0.5px",
                        cursor: "pointer",
                      }}
                    >
                      MaxCode IT Services
                    </span>

                    {/* Company Info Tooltip */}
                    {showCompanyTooltip && (
                      <div
                        ref={companyTooltipRef}
                        style={{
                          position: "fixed",
                          bottom: "70px",
                          left: "50%",
                          transform: "translateX(-50%)",
                          backgroundColor: "#ffffff",
                          border: "1px solid #e5e7eb",
                          borderRadius: "12px",
                          padding: "20px",
                          boxShadow: "0 12px 40px rgba(0, 0, 0, 0.15)",
                          zIndex: 9999,
                          minWidth: "320px",
                          maxWidth: "400px",
                          animation: "tooltipSlideUp 0.3s ease-out",
                          textAlign: "left",
                        }}
                        className="company-tooltip"
                      >
                        {/* Header */}
                        <div style={{
                          marginBottom: "18px",
                          paddingBottom: "12px",
                          borderBottom: "2px solid #1a7a5c",
                        }}>
                          <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                            <div style={{
                              width: "36px",
                              height: "36px",
                              minWidth: "36px",
                              backgroundColor: "#def9e7",
                              borderRadius: "8px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}>
                              <i className="fa-solid fa-building" style={{ color: "#1a7a5c", fontSize: "16px" }}></i>
                            </div>
                            <div style={{ flex: 1 }}>
                              <h4 style={{
                                margin: "0 0 4px 0",
                                color: "#1a1a1a",
                                fontSize: "16px",
                                fontWeight: "700",
                                lineHeight: "1.3",
                              }}>
                                MaxCode IT Services
                              </h4>
                              <p style={{
                                margin: "0",
                                color: "#666",
                                fontSize: "12px",
                                fontWeight: "500",
                              }}>
                                Website, Software & Digital Solutions Provider
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Information Items */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                          {/* Founder & CEO */}
                          <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                            <div style={{
                              width: "36px",
                              height: "36px",
                              minWidth: "36px",
                              backgroundColor: "#def9e7",
                              borderRadius: "8px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}>
                              <i className="fa-solid fa-user-tie" style={{ color: "#1a7a5c", fontSize: "16px" }}></i>
                            </div>
                            <div style={{ flex: 1 }}>
                              <p style={{
                                margin: "0 0 4px 0",
                                color: "#666",
                                fontSize: "12px",
                                fontWeight: "500",
                                textTransform: "uppercase",
                                letterSpacing: "0.5px",
                              }}>
                                Founder & CEO
                              </p>
                              <p style={{
                                margin: "0",
                                color: "#1a1a1a",
                                fontSize: "14px",
                                fontWeight: "600",
                              }}>
                                Mr. Vipin Khandelwal
                              </p>
                            </div>
                          </div>

                          {/* Contact Number */}
                          <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                            <div style={{
                              width: "36px",
                              height: "36px",
                              minWidth: "36px",
                              backgroundColor: "#def9e7",
                              borderRadius: "8px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}>
                              <i className="fa-solid fa-phone" style={{ color: "#1a7a5c", fontSize: "16px" }}></i>
                            </div>
                            <div style={{ flex: 1 }}>
                              <p style={{
                                margin: "0 0 4px 0",
                                color: "#666",
                                fontSize: "12px",
                                fontWeight: "500",
                                textTransform: "uppercase",
                                letterSpacing: "0.5px",
                              }}>
                                Contact Number
                              </p>
                              <a href="tel:+916377241446" style={{
                                margin: "0",
                                color: "#1a1a1a",
                                fontSize: "14px",
                                fontWeight: "600",
                                textDecoration: "none",
                              }}>
                                +91 6377241446
                              </a>
                            </div>
                          </div>

                          {/* Website */}
                          <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                            <div style={{
                              width: "36px",
                              height: "36px",
                              minWidth: "36px",
                              backgroundColor: "#def9e7",
                              borderRadius: "8px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}>
                              <i className="fa-solid fa-globe" style={{ color: "#1a7a5c", fontSize: "16px" }}></i>
                            </div>
                            <div style={{ flex: 1 }}>
                              <p style={{
                                margin: "0 0 4px 0",
                                color: "#666",
                                fontSize: "12px",
                                fontWeight: "500",
                                textTransform: "uppercase",
                                letterSpacing: "0.5px",
                              }}>
                                Website
                              </p>
                              <a href="https://www.maxcode.in" target="_blank" rel="noopener noreferrer" style={{
                                margin: "0",
                                color: "#1a1a1a",
                                fontSize: "14px",
                                fontWeight: "600",
                                textDecoration: "none",
                              }}>
                                www.maxcode.in
                              </a>
                            </div>
                          </div>

                          {/* Office Address */}
                          <div style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                            <div style={{
                              width: "36px",
                              height: "36px",
                              minWidth: "36px",
                              backgroundColor: "#def9e7",
                              borderRadius: "8px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}>
                              <i className="fa-solid fa-map-pin" style={{ color: "#1a7a5c", fontSize: "16px" }}></i>
                            </div>
                            <div style={{ flex: 1 }}>
                              <p style={{
                                margin: "0 0 4px 0",
                                color: "#666",
                                fontSize: "12px",
                                fontWeight: "500",
                                textTransform: "uppercase",
                                letterSpacing: "0.5px",
                              }}>
                                Office Address
                              </p>
                              <p style={{
                                margin: "0",
                                color: "#1a1a1a",
                                fontSize: "14px",
                                fontWeight: "600",
                                lineHeight: "1.5",
                              }}>
                                New Mandi Road, Dausa (Raj.) - 303303
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Arrow indicator */}
                        <div style={{
                          position: "absolute",
                          bottom: "-8px",
                          left: "50%",
                          width: "16px",
                          height: "16px",
                          backgroundColor: "#ffffff",
                          border: "1px solid #e5e7eb",
                          borderTop: "none",
                          borderLeft: "none",
                          transform: "translateX(-50%) rotate(45deg)",
                        }}></div>
                      </div>
                    )}
                  </span>
                </div>
              </div>
            </div>
          </footer>
        </div>
      </div>

      {/* Notification Component */}
      <Notification onUnreadCountChange={handleUnreadCountChange} />

      <ConfirmationModal
        show={showLogoutConfirm}
        onHide={() => setShowLogoutConfirm(false)}
        onConfirm={handleLogout}
        title="Logout Confirmation"
        message="Are you sure you want to logout from your account?"
        confirmText="Logout"
        cancelText="Cancel"
        variant="warning"
      />

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
          border-radius: 12px;
          color: white;
          font-weight: bold;
          font-size: 18px;
        }

        .profile-dropdown-avatar {
          display: flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 44px;
          width: 44px;
          height: 44px;
          border-radius: 12px;
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

        @keyframes tooltipSlideUp {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
      `}</style>
    </>
  );
};

export default DashboardNavbar;
