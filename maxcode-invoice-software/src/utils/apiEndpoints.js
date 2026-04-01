// User Preferences endpoints
// API Endpoints Configuratio
// Centralized API endpoint definitions

const API_ENDPOINTS = {
  // Auth endpoints
  AUTH: {
    LOGIN: "/auth",
    LOGOUT: "/auth/logout",
    REFRESH: "/auth/refresh",
    VERIFY: "/auth/verify",
  },

  // Client endpoints
  CLIENTS: {
    LIST: "/clients",
    CREATE: "/clients",
    GENERATE_ID: (name, phoneNumber) =>
      `/clients?action=generate-client-id&name=${encodeURIComponent(name || "")}&phoneNumber=${encodeURIComponent(phoneNumber || "")}`,
    GET: (id) => `/clients?id=${id}`,
    UPDATE: (id) => `/clients?id=${id}`,
    DELETE: (id) => `/clients?id=${id}`,
  },

  // Lead endpoints
  LEADS: {
    LIST: "/leads",
    CREATE: "/leads",
    GET: (id) => `/leads?id=${id}`,
    UPDATE: (id) => `/leads?id=${id}`,
    DELETE: (id) => `/leads?id=${id}`,
  },

  // File management endpoints
  FILES: {
    LIST: "/files",
    CREATE: "/files",
    DOWNLOAD_FOLDER_ZIP: (folderPath) =>
      `/files?action=download-folder-zip&folderPath=${encodeURIComponent(folderPath || "")}`,
    DOWNLOAD_FILE: (filePath) =>
      `/files?action=download-file&filePath=${encodeURIComponent(filePath || "")}`,
    GET: (id) => `/files?id=${encodeURIComponent(id)}`,
    UPDATE: (id) => `/files?id=${encodeURIComponent(id)}`,
    DELETE: (id) => `/files?id=${encodeURIComponent(id)}`,
  },

  // Vendor endpoints
  VENDORS: {
    LIST: "/vendors",
    CREATE: "/vendors",
    GET: (id) => `/vendors?id=${id}`,
    UPDATE: (id) => `/vendors?id=${id}`,
    DELETE: (id) => `/vendors?id=${id}`,
  },

  // Invoice endpoints
  INVOICES: {
    LIST: "/invoices",
    CREATE: "/invoices",
    NEXT_NUMBER: "/invoices?action=next-number",
    GET: (id) => `/invoices?id=${id}`,
    UPDATE: (id) => `/invoices?id=${id}`,
    DELETE: (id) => `/invoices?id=${id}`,
  },

  // Qutation endpoints
  QUTATIONS: {
    LIST: "/qutations",
    CREATE: "/qutations",
    NEXT_NUMBER: "/qutations?action=next-number",
    GET: (id) => `/qutations?id=${id}`,
    UPDATE: (id) => `/qutations?id=${id}`,
    DELETE: (id) => `/qutations?id=${id}`,
  },

  // Financial Year endpoints
  YEARS: {
    LIST: "/years",
    CREATE: "/years",
    GET: (id) => `/years?id=${id}`,
    UPDATE: (id) => `/years?id=${id}`,
    DELETE: (id) => `/years?id=${id}`,
  },

  // Business Settings endpoints
  BUSINESS_SETTINGS: {
    GET: "/business-settings",
    UPDATE: "/business-settings",
  },

  // User Settings endpoints
  SETTINGS: {
    PROFILE: "/settings",
    CHANGE_PIN: "/settings",
  },

  // Backup endpoints
  BACKUP: {
    EXPORT: "/backup",
    RESTORE: "/backup",
    TEST_DRIVE: "/backup",
    RUN_NOW: "/backup",
  },

  // Purchase endpoints
  PURCHASES: {
    LIST: "/purchases",
    CREATE: "/purchases",
    GET: (id) => `/purchases?id=${id}`,
    UPDATE: (id) => `/purchases?id=${id}`,
    DELETE: (id) => `/purchases?id=${id}`,
  },

  // Company Expense endpoints
  COMPANY_EXPENSES: {
    LIST: "/company-expenses",
    CREATE: "/company-expenses",
    NEXT_NUMBER: "/company-expenses?action=next-number",
    GET: (id) => `/company-expenses?id=${id}`,
    UPDATE: (id) => `/company-expenses?id=${id}`,
    DELETE: (id) => `/company-expenses?id=${id}`,
  },

  // RCM endpoints
  RCM: {
    LIST: "/rcm",
    CREATE: "/rcm",
    NEXT_NUMBER: "/rcm?action=next-number",
    GET: (id) => `/rcm?id=${id}`,
    UPDATE: (id) => `/rcm?id=${id}`,
    DELETE: (id) => `/rcm?id=${id}`,
  },

  // Services endpoints
  SERVICES: {
    LIST: "/services",
    CREATE: "/services",
    NEXT_NUMBER: "/services?action=next-number",
    GET: (id) => `/services?id=${id}`,
    UPDATE: (id) => `/services?id=${id}`,
    DELETE: (id) => `/services?id=${id}`,
  },

  // Notification endpoints
  NOTIFICATION: {
    LIST: "/notification",
    MARK: "/notification",
    DELETE: (id) => `/notification?id=${id}`,
  },

  // Projects endpoints
  PROJECTS: {
    LIST: "/projects",
    CREATE: "/projects",
    NEXT_NUMBER: "/projects?action=next-number",
    GET: (id) => `/projects?id=${id}`,
    UPDATE: (id) => `/projects?id=${id}`,
    DELETE: (id) => `/projects?id=${id}`,
  },

  // Project Credentials endpoints
  PROJECT_CREDENTIALS: {
    LIST: "/project-credentials",
    CREATE: "/project-credentials",
    GET: (id) => `/project-credentials?id=${id}`,
    UPDATE: (id) => `/project-credentials?id=${id}`,
    DELETE: (id) => `/project-credentials?id=${id}`,
  },

  // Staff endpoints
  STAFF: {
    LIST: "/staff",
    CREATE: "/staff",
    GET: (id) => `/staff?id=${id}`,
    UPDATE: (id) => `/staff?id=${id}`,
    DELETE: (id) => `/staff?id=${id}`,
  },

  // Team Members endpoints
  TEAM_MEMBERS: {
    LIST: "/team-members",
    CREATE: "/team-members",
    GET: (id) => `/team-members?id=${id}`,
    UPDATE: (id) => `/team-members?id=${id}`,
    DELETE: (id) => `/team-members?id=${id}`,
  },

  // Two-Factor Authentication endpoints
  TWO_FACTOR_AUTH: {
    GET_STATUS: "/two-factor-auth",
    GENERATE: "/two-factor-auth",
    VERIFY: "/two-factor-auth",
    ENABLE: "/two-factor-auth",
    DISABLE: "/two-factor-auth",
  },

  USER_PREFERENCES: {
    GET: "/user-preferences",
    UPDATE: "/user-preferences",
  },

  BOOKS_OF_ACCOUNTS: {
    LIST: "/books-of-accounts",
    STATISTICS: "/books-of-accounts/statistics",
  },

  DASHBOARD: {
    SUMMARY: "/dashboard-summary",
  },

  // Owner Investments endpoints
  OWNER_INVESTMENTS: {
    LIST: "/owner-investments",
    CREATE: "/owner-investments",
    GET: (id) => `/owner-investments?id=${id}`,
    UPDATE: (id) => `/owner-investments?id=${id}`,
    DELETE: (id) => `/owner-investments?id=${id}`,
  },
};

export default API_ENDPOINTS;
