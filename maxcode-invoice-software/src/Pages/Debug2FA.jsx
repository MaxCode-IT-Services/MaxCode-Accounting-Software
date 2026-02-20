import React, { useState, useEffect } from "react";
import { apiGet, apiPost } from "../utils/apiHelpers";
import { API_ENDPOINTS } from "../utils/apiEndpoints";

export default function Debug2FA() {
  const [2FAStatus, set2FAStatus] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);

  const addLog = (msg) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const check2FAStatus = async () => {
    setLoading(true);
    addLog("🔍 Checking 2FA status...");
    try {
      const response = await apiGet(API_ENDPOINTS.TWO_FACTOR_AUTH.GET_STATUS);
      addLog(`✅ Response: ${JSON.stringify(response.data)}`);
      set2FAStatus(response.data);
    } catch (error) {
      addLog(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const checkUserData = async () => {
    setLoading(true);
    addLog("🔍 Fetching user data...");
    try {
      const token = localStorage.getItem("maxcode_auth_token");
      const user = localStorage.getItem("user_info");
      addLog(`✅ Token exists: ${!!token}`);
      addLog(`✅ User info: ${user}`);
      setUserData(user ? JSON.parse(user) : null);
    } catch (error) {
      addLog(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    addLog("🚀 Debug page loaded");
    check2FAStatus();
    checkUserData();
  }, []);

  return (
    <div className="container mt-4">
      <h1>🔐 2FA Debug Page</h1>

      <div className="row">
        <div className="col-md-6">
          <div className="card mb-3">
            <div className="card-header bg-danger text-white">
              <h5>2FA Status</h5>
            </div>
            <div className="card-body">
              {2FAStatus ? (
                <pre className="bg-light p-2 rounded">
                  {JSON.stringify(2FAStatus, null, 2)}
                </pre>
              ) : (
                <p>Loading...</p>
              )}
              <button
                className="btn btn-primary mt-2"
                onClick={check2FAStatus}
                disabled={loading}
              >
                Refresh Status
              </button>
            </div>
          </div>
        </div>

        <div className="col-md-6">
          <div className="card mb-3">
            <div className="card-header bg-info text-white">
              <h5>User Data</h5>
            </div>
            <div className="card-body">
              {userData ? (
                <pre className="bg-light p-2 rounded">
                  {JSON.stringify(userData, null, 2)}
                </pre>
              ) : (
                <p>No user data found</p>
              )}
              <button
                className="btn btn-primary mt-2"
                onClick={checkUserData}
                disabled={loading}
              >
                Refresh User Data
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header bg-warning">
          <h5>📋 Logs</h5>
        </div>
        <div className="card-body" style={{ maxHeight: "300px", overflowY: "auto" }}>
          {logs.map((log, idx) => (
            <div key={idx} className="font-monospace small mb-1">
              {log}
            </div>
          ))}
        </div>
        <div className="card-footer">
          <button
            className="btn btn-danger"
            onClick={() => setLogs([])}
          >
            Clear Logs
          </button>
        </div>
      </div>

      <div className="alert alert-info mt-3">
        <h6>What to check:</h6>
        <ul>
          <li><strong>2FA Status:</strong> Should show <code>twoFactorEnabled: true</code> if enabled</li>
          <li><strong>User Data:</strong> Check if <code>twoFactor.enabled</code> field exists</li>
          <li>If <code>twoFactorEnabled</code> is <strong>false</strong>, 2FA is NOT actually enabled in the database</li>
          <li>The login screen will ONLY show 2FA if this value is <strong>true</strong></li>
        </ul>
      </div>
    </div>
  );
}
