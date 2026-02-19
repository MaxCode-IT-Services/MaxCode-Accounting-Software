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

// Request interceptor to add access token to headers
api.interceptors.request.use(
  (config) => {
    // Get token from localStorage
    const token = localStorage.getItem("access_token");

    // If token exists, add it to headers
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

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
          // Unauthorized - clear token and redirect to login
          localStorage.removeItem("access_token");
          localStorage.removeItem("maxcode_auth");
          window.location.href = "/login";
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

// Helper to set token manually if needed
export const setAuthToken = (token) => {
  if (token) {
    localStorage.setItem("access_token", token);
  } else {
    localStorage.removeItem("access_token");
  }
};

// Helper to get current token
export const getAuthToken = () => {
  return localStorage.getItem("access_token");
};

// Helper to clear all auth data
export const clearAuth = () => {
  localStorage.removeItem("access_token");
  localStorage.removeItem("maxcode_auth");
};
