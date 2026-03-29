import React from "react";
import { SETTINGS_TABS } from "../../utils/settingsTabsConfig";

const SettingsTabsNav = ({ activeTab, setActiveTab, canAccessTab }) => {
  return (
    <div className="tabs-container mb-4">
      <ul className="nav nav-tabs modern-tabs">
        {SETTINGS_TABS.filter((tab) => canAccessTab(tab.key)).map((tab) => (
          <li key={tab.key} className="nav-item">
            <button
              className={`nav-link ${activeTab === tab.key ? "active" : ""}`}
              onClick={() => setActiveTab(tab.key)}
            >
              <i className={`${tab.icon} me-2`}></i>
              {tab.label}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default SettingsTabsNav;
