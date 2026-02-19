/**
 * Example: Client Service
 *
 * This demonstrates how to create service files that encapsulate
 * all API calls related to a specific feature (clients, invoices, etc.)
 */

import { apiGet, apiPost, apiPut, apiDelete } from "../utils/api";
import API_ENDPOINTS from "../utils/apiEndpoints";

/**
 * Client Service - All client-related API calls
 */
const ClientService = {
  /**
   * Fetch all clients
   * @param {Object} params - Query parameters (page, limit, status, etc.)
   * @returns {Promise} Response with clients data
   */
  getAll: async (params = {}) => {
    try {
      const response = await apiGet(API_ENDPOINTS.CLIENTS.LIST, { params });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Get a single client by ID
   * @param {string} clientId - The client ID
   * @returns {Promise} Response with client data
   */
  getById: async (clientId) => {
    try {
      const response = await apiGet(API_ENDPOINTS.CLIENTS.GET(clientId));
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Create a new client
   * @param {Object} clientData - Client information
   * @returns {Promise} Response with created client
   */
  create: async (clientData) => {
    try {
      const response = await apiPost(API_ENDPOINTS.CLIENTS.CREATE, clientData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Update an existing client
   * @param {string} clientId - The client ID
   * @param {Object} clientData - Updated client information
   * @returns {Promise} Response with updated client
   */
  update: async (clientId, clientData) => {
    try {
      const response = await apiPut(
        API_ENDPOINTS.CLIENTS.UPDATE(clientId),
        clientData,
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Delete a client
   * @param {string} clientId - The client ID
   * @returns {Promise} Response confirming deletion
   */
  delete: async (clientId) => {
    try {
      const response = await apiDelete(API_ENDPOINTS.CLIENTS.DELETE(clientId));
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Get client statistics
   * @returns {Promise} Response with statistics
   */
  getStatistics: async () => {
    try {
      const response = await apiGet(`${API_ENDPOINTS.CLIENTS.LIST}/statistics`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Search clients by query
   * @param {string} query - Search query
   * @returns {Promise} Response with matching clients
   */
  search: async (query) => {
    try {
      const response = await apiGet(`${API_ENDPOINTS.CLIENTS.LIST}/search`, {
        params: { q: query },
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Bulk delete clients
   * @param {Array} clientIds - Array of client IDs to delete
   * @returns {Promise} Response confirming bulk deletion
   */
  bulkDelete: async (clientIds) => {
    try {
      const response = await apiPost(
        `${API_ENDPOINTS.CLIENTS.LIST}/bulk-delete`,
        {
          ids: clientIds,
        },
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  },
};

/**
 * Invoice Service - All invoice-related API calls
 */
const InvoiceService = {
  getAll: async (params = {}) => {
    try {
      const response = await apiGet(API_ENDPOINTS.INVOICES.LIST, { params });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  getById: async (invoiceId) => {
    try {
      const response = await apiGet(API_ENDPOINTS.INVOICES.GET(invoiceId));
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  create: async (invoiceData) => {
    try {
      const response = await apiPost(
        API_ENDPOINTS.INVOICES.CREATE,
        invoiceData,
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  update: async (invoiceId, invoiceData) => {
    try {
      const response = await apiPut(
        API_ENDPOINTS.INVOICES.UPDATE(invoiceId),
        invoiceData,
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  delete: async (invoiceId) => {
    try {
      const response = await apiDelete(
        API_ENDPOINTS.INVOICES.DELETE(invoiceId),
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  downloadPDF: async (invoiceId) => {
    try {
      const response = await apiGet(
        `${API_ENDPOINTS.INVOICES.GET(invoiceId)}/pdf`,
        {
          responseType: "blob", // Important for file downloads
        },
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  },
};

/**
 * Vendor Service - All vendor-related API calls
 */
const VendorService = {
  /**
   * Fetch all vendors
   * @param {Object} params - Query parameters (page, limit, status, etc.)
   * @returns {Promise} Response with vendors data
   */
  getAll: async (params = {}) => {
    try {
      const response = await apiGet(API_ENDPOINTS.VENDORS.LIST, { params });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Get a single vendor by ID
   * @param {string} vendorId - The vendor ID
   * @returns {Promise} Response with vendor data
   */
  getById: async (vendorId) => {
    try {
      const response = await apiGet(API_ENDPOINTS.VENDORS.GET(vendorId));
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Create a new vendor
   * @param {Object} vendorData - Vendor information
   * @returns {Promise} Response with created vendor
   */
  create: async (vendorData) => {
    try {
      const response = await apiPost(API_ENDPOINTS.VENDORS.CREATE, vendorData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Update an existing vendor
   * @param {string} vendorId - The vendor ID
   * @param {Object} vendorData - Updated vendor information
   * @returns {Promise} Response with updated vendor
   */
  update: async (vendorId, vendorData) => {
    try {
      const response = await apiPut(
        API_ENDPOINTS.VENDORS.UPDATE(vendorId),
        vendorData,
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Delete a vendor
   * @param {string} vendorId - The vendor ID
   * @returns {Promise} Response confirming deletion
   */
  delete: async (vendorId) => {
    try {
      const response = await apiDelete(API_ENDPOINTS.VENDORS.DELETE(vendorId));
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Get vendor statistics
   * @returns {Promise} Response with statistics
   */
  getStatistics: async () => {
    try {
      const response = await apiGet(`${API_ENDPOINTS.VENDORS.LIST}/statistics`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Search vendors by query
   * @param {string} query - Search query
   * @returns {Promise} Response with matching vendors
   */
  search: async (query) => {
    try {
      const response = await apiGet(`${API_ENDPOINTS.VENDORS.LIST}/search`, {
        params: { q: query },
      });
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  /**
   * Bulk delete vendors
   * @param {Array} vendorIds - Array of vendor IDs to delete
   * @returns {Promise} Response confirming bulk deletion
   */
  bulkDelete: async (vendorIds) => {
    try {
      const response = await apiPost(
        `${API_ENDPOINTS.VENDORS.LIST}/bulk-delete`,
        {
          ids: vendorIds,
        },
      );
      return response.data;
    } catch (error) {
      throw error;
    }
  },
};

/**
 * Auth Service - All authentication-related API calls
 */
const AuthService = {
  login: async (credentials) => {
    try {
      const response = await apiPost(API_ENDPOINTS.AUTH.LOGIN, credentials);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  logout: async () => {
    try {
      const response = await apiPost(API_ENDPOINTS.AUTH.LOGOUT);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  refreshToken: async () => {
    try {
      const response = await apiPost(API_ENDPOINTS.AUTH.REFRESH);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  verifyToken: async () => {
    try {
      const response = await apiGet(API_ENDPOINTS.AUTH.VERIFY);
      return response.data;
    } catch (error) {
      throw error;
    }
  },
};

// Export all services
export { ClientService, InvoiceService, VendorService, AuthService };

// Default export
export default {
  clients: ClientService,
  invoices: InvoiceService,
  vendors: VendorService,
  auth: AuthService,
};

// ========================================
// USAGE EXAMPLE IN COMPONENT
// ========================================
/*

import React, { useState, useEffect } from 'react';
import { ClientService } from '../services/apiServices';
import { showSuccess, showError } from '../Components/ToastNotification';

const ClientManagement = () => {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(false);

  // Fetch clients on mount
  useEffect(() => {
    loadClients();
  }, []);

  const loadClients = async () => {
    setLoading(true);
    try {
      const data = await ClientService.getAll();
      setClients(data.clients || []);
      showSuccess('Clients loaded successfully');
    } catch (error) {
      showError('Failed to load clients');
      console.error('Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateClient = async (clientData) => {
    try {
      const newClient = await ClientService.create(clientData);
      setClients([...clients, newClient]);
      showSuccess('Client created successfully');
    } catch (error) {
      showError(error.response?.data?.message || 'Failed to create client');
    }
  };

  const handleUpdateClient = async (clientId, clientData) => {
    try {
      const updatedClient = await ClientService.update(clientId, clientData);
      setClients(clients.map(c => c._id === clientId ? updatedClient : c));
      showSuccess('Client updated successfully');
    } catch (error) {
      showError('Failed to update client');
    }
  };

  const handleDeleteClient = async (clientId) => {
    try {
      await ClientService.delete(clientId);
      setClients(clients.filter(c => c._id !== clientId));
      showSuccess('Client deleted successfully');
    } catch (error) {
      showError('Failed to delete client');
    }
  };

  return (
    <div>
      {loading ? <p>Loading...</p> : <ClientList clients={clients} />}
    </div>
  );
};

*/
