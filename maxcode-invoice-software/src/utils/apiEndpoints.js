// API Endpoints Configuration
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
    GET: (id) => `/clients?id=${id}`,
    UPDATE: (id) => `/clients?id=${id}`,
    DELETE: (id) => `/clients?id=${id}`,
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
    GET: (id) => `/invoices?id=${id}`,
    UPDATE: (id) => `/invoices?id=${id}`,
    DELETE: (id) => `/invoices?id=${id}`,
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

  // RCM endpoints
  RCM: {
    LIST: "/rcm",
    CREATE: "/rcm",
    GET: (id) => `/rcm?id=${id}`,
    UPDATE: (id) => `/rcm?id=${id}`,
    DELETE: (id) => `/rcm?id=${id}`,
  },

  // Services endpoints
  SERVICES: {
    LIST: "/services",
    CREATE: "/services",
    GET: (id) => `/services?id=${id}`,
    UPDATE: (id) => `/services?id=${id}`,
    DELETE: (id) => `/services?id=${id}`,
  },

  // Projects endpoints
  PROJECTS: {
    LIST: "/projects",
    CREATE: "/projects",
    GET: (id) => `/projects?id=${id}`,
    UPDATE: (id) => `/projects?id=${id}`,
    DELETE: (id) => `/projects?id=${id}`,
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

  // Add more endpoints as needed
};

export default API_ENDPOINTS;
