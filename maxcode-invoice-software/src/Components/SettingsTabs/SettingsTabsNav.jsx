import React from "react";

const SettingsTabsNav = ({ activeTab, setActiveTab, canAccessTab }) => {
  return (
    <div className="tabs-container mb-4">
      <ul className="nav nav-tabs modern-tabs">
        {canAccessTab("profile") && (
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === "profile" ? "active" : ""}`}
              onClick={() => setActiveTab("profile")}
            >
              <i className="fas fa-user me-2"></i>
              Profile Management
            </button>
          </li>
        )}
        {canAccessTab("pin") && (
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === "pin" ? "active" : ""}`}
              onClick={() => setActiveTab("pin")}
            >
              <i className="fas fa-key me-2"></i>
              Change PIN
            </button>
          </li>
        )}
        {canAccessTab("2fa") && (
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === "2fa" ? "active" : ""}`}
              onClick={() => setActiveTab("2fa")}
            >
              <i className="fas fa-shield-alt me-2"></i>
              Two-Factor Auth
            </button>
          </li>
        )}
        {canAccessTab("business") && (
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === "business" ? "active" : ""}`}
              onClick={() => setActiveTab("business")}
            >
              <i className="fas fa-building me-2"></i>
              Business Details
            </button>
          </li>
        )}
        {canAccessTab("cloudflare") && (
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === "cloudflare" ? "active" : ""}`}
              onClick={() => setActiveTab("cloudflare")}
            >
              <i className="fas fa-cloud me-2"></i>
              Cloudflare
            </button>
          </li>
        )}
        {canAccessTab("terms") && (
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === "terms" ? "active" : ""}`}
              onClick={() => setActiveTab("terms")}
            >
              <i className="fas fa-file-contract me-2"></i>
              Terms & Conditions
            </button>
          </li>
        )}
        {canAccessTab("hsn") && (
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === "hsn" ? "active" : ""}`}
              onClick={() => setActiveTab("hsn")}
            >
              <i className="fas fa-tags me-2"></i>
              HSN Code
            </button>
          </li>
        )}
        {canAccessTab("backup") && (
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === "backup" ? "active" : ""}`}
              onClick={() => setActiveTab("backup")}
            >
              <i className="fas fa-database me-2"></i>
              Backup & Restore
            </button>
          </li>
        )}
      </ul>
    </div>
  );
};

export default SettingsTabsNav;
