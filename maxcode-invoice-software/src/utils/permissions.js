export const CRUD_ACTIONS = ["create", "read", "update", "delete", "export"];

export const PERMISSION_MODULES = [
  {
    key: "dashboard",
    label: "Dashboard",
    description: "Access main dashboard",
    icon: "fa-solid fa-house",
    route: "/admin/dashboard",
    detailed: false,
  },
  {
    key: "clientManagement",
    label: "Client Management",
    description: "Manage clients",
    icon: "fa-solid fa-users",
    route: "/admin/client-management",
    detailed: true,
  },
  {
    key: "qutationManagement",
    label: "Qutation Management",
    description: "Manage qutations",
    icon: "fa-solid fa-file-invoice-dollar",
    route: "/admin/qutation-management",
    detailed: true,
  },
  {
    key: "vendorManagement",
    label: "Vendor Management",
    description: "Manage vendors",
    icon: "fa-solid fa-store",
    route: "/admin/vendor-management",
    detailed: true,
  },
  {
    key: "purchaseManagement",
    label: "Purchase Management",
    description: "Manage purchases",
    icon: "fa-solid fa-cart-plus",
    route: "/admin/purchase-management",
    detailed: true,
  },
  {
    key: "companyExpenseManagement",
    label: "Company Expense",
    description: "Manage company expenses",
    icon: "fa-solid fa-money-bill-wave",
    route: "/admin/company-expense-management",
    detailed: true,
  },
  {
    key: "salesManagement",
    label: "Sales Management",
    description: "Manage sales",
    icon: "fa-brands fa-shopify",
    route: "/admin/sales-management",
    detailed: true,
  },
  {
    key: "rcmManagement",
    label: "RCM Management",
    description: "Manage RCM",
    icon: "fa-solid fa-file-invoice-dollar",
    route: "/admin/rcm-management",
    detailed: true,
  },
  {
    key: "ledgerManagement",
    label: "Ledger Management",
    description: "Manage ledgers",
    icon: "fa-solid fa-book",
    route: "/admin/ledger-management",
    detailed: true,
  },
  {
    key: "detailedLedgerManagement",
    label: "Detailed Ledger",
    description: "Detailed ledger access",
    icon: "fa-solid fa-table-list",
    route: "/admin/detailed-ledger-management",
    detailed: true,
  },
  {
    key: "balanceSheet",
    label: "Balance Sheet",
    description: "Balance sheet access",
    icon: "fa-solid fa-scale-unbalanced-flip",
    route: "/admin/balance-sheet",
    detailed: true,
  },
  {
    key: "servicesManagement",
    label: "Services Management",
    description: "Manage services",
    icon: "fa-solid fa-globe",
    route: "/admin/services-management",
    detailed: true,
  },
  {
    key: "projectManagement",
    label: "Project Management",
    description: "Manage projects",
    icon: "fa-solid fa-diagram-project",
    route: "/admin/project-management",
    detailed: true,
  },
  {
    key: "projectDetails",
    label: "Project Details",
    description: "View project details",
    icon: "fa-solid fa-list-check",
    route: "/admin/project-details",
    detailed: true,
  },
  {
    key: "projectCredentials",
    label: "Project Credentials",
    description: "Manage project credentials",
    icon: "fa-solid fa-key",
    route: "/admin/project-credentials",
    detailed: true,
  },
  {
    key: "developerPayoutManagement",
    label: "Developer Payout",
    description: "Manage developer payout",
    icon: "fa-solid fa-hand-holding-dollar",
    route: "/admin/developer-payout-management",
    detailed: true,
  },
  {
    key: "staffManagement",
    label: "Staff Management",
    description: "Manage staff",
    icon: "fa-solid fa-user-tie",
    route: "/admin/staff-management",
    detailed: true,
  },
  {
    key: "financialYearManagement",
    label: "Financial Year Management",
    description: "Manage financial year",
    icon: "fa-regular fa-calendar-days",
    route: "/admin/financial-year-management",
    detailed: true,
  },
  {
    key: "teamManagement",
    label: "Team Management",
    description: "Manage team users",
    icon: "fa-solid fa-user-shield",
    route: "/admin/team-management",
    detailed: true,
  },
  {
    key: "setting",
    label: "Setting",
    description: "System settings",
    icon: "fa-solid fa-gear",
    route: "/admin/setting",
    detailed: true,
  },
];

const createActionMatrix = () => ({
  create: false,
  read: false,
  update: false,
  delete: false,
  export: false,
});

export const createDefaultPermissions = () => {
  const permissions = {};

  for (const module of PERMISSION_MODULES) {
    if (module.detailed) {
      permissions[module.key] = {
        active: false,
        pages: {
          [module.label]: createActionMatrix(),
        },
      };
    } else {
      permissions[module.key] = {
        active: false,
      };
    }
  }

  return permissions;
};

export const getStoredUserInfo = () => {
  try {
    const raw = localStorage.getItem("user_info");
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
};

const ADMIN_PREFIX = "/admin";
const TEAM_PREFIX = "/team";
const SUPER_PREFIX = "/super";

const resolveNormalizedRole = (role = "") => {
  const normalized = String(role || "")
    .trim()
    .toLowerCase();
  if (!normalized) return "";

  if (normalized.includes("super") || normalized.includes("master"))
    return "super";
  if (normalized.includes("admin") || normalized === "master") return "admin";
  if (normalized.includes("team") || normalized.includes("member"))
    return "team";

  return normalized;
};

export const getRoleRoutePrefix = (userInfo = null) => {
  const resolvedUser = userInfo || getStoredUserInfo();

  if (!resolvedUser) return ADMIN_PREFIX;

  const normalizedRole = resolveNormalizedRole(resolvedUser.role);
  const isTeamMember = resolvedUser.userType === "team-member";

  if (normalizedRole === "super") return SUPER_PREFIX;
  if (normalizedRole === "admin") return ADMIN_PREFIX;
  if (normalizedRole === "team") return TEAM_PREFIX;

  if (isTeamMember) return TEAM_PREFIX;

  return ADMIN_PREFIX;
};

export const withRolePrefix = (route, userInfo = null) => {
  if (!route || typeof route !== "string") {
    return route;
  }

  const prefix = getRoleRoutePrefix(userInfo);
  return route.replace(/^\/(admin|team|super)(?=\/|$)/i, prefix);
};

export const getDefaultDashboardRoute = (userInfo = null) => {
  return `${getRoleRoutePrefix(userInfo)}/dashboard`;
};

export const getFirstAllowedRoute = (userInfo = null) => {
  const resolvedUser = userInfo || getStoredUserInfo();

  if (!resolvedUser) {
    return getDefaultDashboardRoute(resolvedUser);
  }

  const isTeamMember = resolvedUser.userType === "team-member";

  if (!isTeamMember) {
    return getDefaultDashboardRoute(resolvedUser);
  }

  const permissions = resolvedUser.permissions || {};
  const firstAllowedModule = PERMISSION_MODULES.find(
    (module) => permissions[module.key]?.active === true,
  );

  if (!firstAllowedModule?.route) {
    return "/login";
  }

  return withRolePrefix(firstAllowedModule.route, resolvedUser);
};

export const hasModuleAccess = (moduleKey, userInfo = null) => {
  const resolvedUser = userInfo || getStoredUserInfo();

  if (!resolvedUser) return true;

  const isTeamMember = resolvedUser.userType === "team-member";
  if (!isTeamMember) return true;

  const permissions = resolvedUser.permissions || {};
  return permissions[moduleKey]?.active === true;
};

export const hasActionPermission = (moduleKey, action, userInfo = null) => {
  const resolvedUser = userInfo || getStoredUserInfo();

  if (!resolvedUser) return true;

  const isTeamMember = resolvedUser.userType === "team-member";
  if (!isTeamMember) return true;

  const permissions = resolvedUser.permissions || {};
  const modulePermission = permissions[moduleKey];

  if (!modulePermission?.active) return false;
  if (!modulePermission.pages) return action === "read";

  return Object.values(modulePermission.pages).some(
    (pagePermissions) => pagePermissions?.[action] === true,
  );
};
