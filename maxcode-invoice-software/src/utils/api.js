import axios from "axios";

const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }

  if (import.meta.env.DEV) {
    return "http://localhost:8888/api";
  }

  return "/api";
};

// Create axios instance with default config
const api = axios.create({
  baseURL: getApiBaseUrl(),
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
  withCredentials: true, // Enable sending cookies and auth headers
});

// Response interceptor to handle errors globally
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Handle different error scenarios
    if (error.response) {
      // Server responded with error status
      switch (error.response.status) {
        case 401:
          // Unauthorized - clear auth state and redirect to login
          clearAuth();
          if (window.location.pathname !== "/login") {
            window.location.href = "/login";
          }
          break;
        case 403:
          console.error("Access forbidden");
          break;
        case 404:
          console.error("Resource not found");
          break;
        case 500:
          console.error("Internal server error");
          break;
        default:
          console.error("An error occurred:", error.response.data);
      }
    } else if (error.request) {
      // Request made but no response received
      console.error("Network error - no response received");
    } else {
      // Something else happened
      console.error("Error:", error.message);
    }

    return Promise.reject(error);
  },
);

// Export API methods
export default api;

// Convenience methods for common operations
export const apiGet = (url, config = {}) => api.get(url, config);
export const apiPost = (url, data = {}, config = {}) =>
  api.post(url, data, config);
export const apiPut = (url, data = {}, config = {}) =>
  api.put(url, data, config);
export const apiPatch = (url, data = {}, config = {}) =>
  api.patch(url, data, config);
export const apiDelete = (url, config = {}) => api.delete(url, config);

// Compatibility helper retained for existing imports.
export const setAuthToken = (_token) => {};

// Helper to get current token
export const getAuthToken = () => {
  return null;
};

let verifySessionPromise = null;
let lastVerifiedAt = 0;
let lastVerifiedResult = false;
const VERIFY_CACHE_TTL_MS = 15000;

export const markSessionAuthenticated = (user = null) => {
  localStorage.setItem("maxcode_auth", "true");
  if (user) {
    localStorage.setItem("user_info", JSON.stringify(user));
  }

  lastVerifiedResult = true;
  lastVerifiedAt = Date.now();
};

export const verifyServerSession = async () => {
  const now = Date.now();

  if (now - lastVerifiedAt < VERIFY_CACHE_TTL_MS) {
    return lastVerifiedResult;
  }

  if (verifySessionPromise) {
    return verifySessionPromise;
  }

  verifySessionPromise = (async () => {
    try {
      const response = await api.get("/auth", {
        params: { action: "verify" },
      });

      const isValidSession =
        response.status === 200 && response.data?.authenticated === true;

      if (isValidSession) {
        markSessionAuthenticated(response.data?.user || null);
        return true;
      }

      clearAuth();
      localStorage.removeItem("user_info");
      lastVerifiedResult = false;
      lastVerifiedAt = Date.now();
      return false;
    } catch (error) {
      clearAuth();
      localStorage.removeItem("user_info");
      lastVerifiedResult = false;
      lastVerifiedAt = Date.now();
      return false;
    }
  })();

  try {
    return await verifySessionPromise;
  } finally {
    verifySessionPromise = null;
  }
};

// Helper to clear all auth data
export const clearAuth = () => {
  localStorage.removeItem("access_token");
  localStorage.removeItem("maxcode_auth");
  localStorage.removeItem("business_settings");
};
