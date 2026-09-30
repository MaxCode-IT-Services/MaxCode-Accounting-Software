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
    CLAIM_TDS: (id) => `/invoices?id=${id}&action=claim-tds`,
    DELETE: (id) => `/invoices?id=${id}`,
  },

  // Credit/Debit Note endpoints
  CREDIT_DEBIT_NOTES: {
    LIST: "/credit-debit-notes",
    CREATE: "/credit-debit-notes",
    NEXT_NUMBER: (financialYear, noteType) =>
      `/credit-debit-notes?action=next-number${
        financialYear
          ? `&financialYear=${encodeURIComponent(financialYear)}`
          : ""
      }${noteType ? `&noteType=${encodeURIComponent(noteType)}` : ""}`,
    GET: (id) => `/credit-debit-notes?id=${id}`,
    UPDATE: (id) => `/credit-debit-notes?id=${id}`,
    DELETE: (id) => `/credit-debit-notes?id=${id}`,
  },

  // Quotation endpoints
  QUOTATIONS: {
    LIST: "/quotations",
    CREATE: "/quotations",
    NEXT_NUMBER: "/quotations?action=next-number",
    GET: (id) => `/quotations?id=${id}`,
    UPDATE: (id) => `/quotations?id=${id}`,
    DELETE: (id) => `/quotations?id=${id}`,
  },

  // Financial Year endpoints
  YEARS: {
    LIST: "/years",
    CREATE: "/years",
    GET: (id) => `/years?id=${id}`,
    UPDATE: (id) => `/years?id=${id}`,
    DELETE: (id) => `/years?id=${id}`,
  },

  FIXED_DEPOSITS: {
    LIST: "/fixed-deposits",
    CREATE: "/fixed-deposits",
    NEXT_NUMBER: (financialYear) =>
      `/fixed-deposits?action=next-number${financialYear ? `&financialYear=${encodeURIComponent(financialYear)}` : ""}`,
    GET: (id) => `/fixed-deposits?id=${id}`,
    UPDATE: (id) => `/fixed-deposits?id=${id}`,
    DELETE: (id) => `/fixed-deposits?id=${id}`,
  },

  // Business Settings endpoints
  BUSINESS_SETTINGS: {
    GET: "/business-settings",
    LOGIN_CONFIG: "/business-settings?action=login-config",
    UPDATE: "/business-settings",
    TERMS_BY_VERSION: (termsKind, version) =>
      `/business-settings?action=terms-by-version&termsKind=${encodeURIComponent(termsKind || "")}&version=${encodeURIComponent(version || "")}`,
  },

  // Telegram bot setup endpoints
  TELEGRAM: {
    SETUP: "/telegram-setup",
    WEBHOOK_PATH: "/api/telegram-hook",
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

  MAXCODE_CREDENTIALS: {
    LIST: "/maxcode-credentials",
    CREATE: "/maxcode-credentials",
    GET: (id) => `/maxcode-credentials?id=${id}`,
    UPDATE: (id) => `/maxcode-credentials?id=${id}`,
    DELETE: (id) => `/maxcode-credentials?id=${id}`,
  },

  OTP_ACCESS: {
    LIST: "/otp-access",
    SEND: "/otp-access",
    VERIFY: "/otp-access",
    RESEND: "/otp-access",
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

  TRANSACTIONS: {
    LIST: "/transactions",
    GET: (id) => `/transactions?id=${id}`,
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

  // Owner Withdrawals endpoints
  OWNER_WITHDRAWALS: {
    LIST: "/owner-withdrawals",
    CREATE: "/owner-withdrawals",
    GET: (id) => `/owner-withdrawals?id=${id}`,
    UPDATE: (id) => `/owner-withdrawals?id=${id}`,
    DELETE: (id) => `/owner-withdrawals?id=${id}`,
  },

  // Cash & Bank Book endpoints
  CASH_BANK_BOOK: {
    LIST: "/cash-bank-book",
    CREATE: "/cash-bank-book",
    GET: (id) => `/cash-bank-book?id=${id}`,
    UPDATE: (id) => `/cash-bank-book?id=${id}`,
    DELETE: (id) => `/cash-bank-book?id=${id}`,
  },

  // Payment Receipts endpoints
  PAYMENT_RECEIPTS: {
    LIST: "/payment-receipts",
    CREATE: "/payment-receipts",
    NEXT_NUMBER: "/payment-receipts?action=next-number",
    AVAILABLE_ADVANCES: (clientRefOrId) =>
      `/payment-receipts?action=available-advances&clientRefId=${encodeURIComponent(clientRefOrId || "")}&clientId=${encodeURIComponent(clientRefOrId || "")}`,
    GET: (id) => `/payment-receipts?id=${id}`,
    UPDATE: (id) => `/payment-receipts?id=${id}`,
    DELETE: (id) => `/payment-receipts?id=${id}`,
  },

  // Payment Refund endpoints
  PAYMENT_REFUNDS: {
    LIST: "/payment-refunds",
    CREATE: "/payment-refunds",
    NEXT_NUMBER: (financialYear = "") =>
      `/payment-refunds?action=next-number${financialYear ? `&financialYear=${encodeURIComponent(financialYear)}` : ""}`,
    GET: (id) => `/payment-refunds?id=${id}`,
    UPDATE: (id) => `/payment-refunds?id=${id}`,
    DELETE: (id) => `/payment-refunds?id=${id}`,
  },

  PAYMENT_LINKS: {
    LIST: "/payment-links",
    CREATE: "/payment-links",
    GET: (id) => `/payment-links?id=${id}`,
    UPDATE: (id) => `/payment-links?id=${id}`,
    DELETE: (id) => `/payment-links?id=${id}`,
    CHECK_ALIAS: (alias, domain, excludeId = "") =>
      `/payment-links?action=check-alias&alias=${encodeURIComponent(alias || "")}&domain=${encodeURIComponent(domain || "")}${excludeId ? `&excludeId=${encodeURIComponent(excludeId)}` : ""}`,
    PUBLIC_BY_ALIAS: (alias) =>
      `/payment-links?action=public&alias=${encodeURIComponent(alias || "")}`,
    PUBLIC_VERIFY_BY_ALIAS: (alias) =>
      `/payment-links?action=public-verify&alias=${encodeURIComponent(alias || "")}`,
  },

  LEDGER_SUMMARY: {
    GET: (financialYear = "ALL") =>
      `/ledger-summary?financialYear=${financialYear}`,
  },

  BALANCE_SHEET: {
    SUMMARY: (financialYear = "ALL") =>
      `/balance-sheet-summary?financialYear=${financialYear}`,
  },

  PROFIT_LOSS: {
    SUMMARY: (financialYear = "ALL") =>
      `/profit-loss-summary?financialYear=${financialYear}`,
  },
};

export default API_ENDPOINTS;
