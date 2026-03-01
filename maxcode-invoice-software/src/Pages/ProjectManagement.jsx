import React, { useEffect, useMemo, useState } from "react";
import ReusableTable from "../Components/ReusableTable";
import CreateProject from "../Components/CreateProject";
import {
  showSuccess,
  showError,
  showInfo,
} from "../Components/ToastNotification";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { apiDelete, apiGet, apiPost, apiPut } from "../utils/api";
import { hasActionPermission } from "../utils/permissions";
import { fetchAllClients } from "../utils/fetchAllEntities";

const toNumber = (value) => {
  const number = parseFloat(value);
  return Number.isNaN(number) ? 0 : number;
};

const formatDateForDisplay = (dateString) => {
  if (!dateString) return "";

  try {
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
      const day = String(date.getDate()).padStart(2, "0");
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const year = date.getFullYear();
      return `${day}/${month}/${year}`;
    }
    return dateString;
  } catch (e) {
    return dateString;
  }
};

const formatDateTimeForDisplay = (dateString) => {
  if (!dateString) return "";

  try {
    const date = new Date(dateString);
    if (!isNaN(date.getTime())) {
      const day = String(date.getDate()).padStart(2, "0");
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const year = date.getFullYear();

      let hours = date.getHours();
      const minutes = String(date.getMinutes()).padStart(2, "0");
      const seconds = String(date.getSeconds()).padStart(2, "0");
      const ampm = hours >= 12 ? "PM" : "AM";

      hours = hours % 12;
      hours = hours ? hours : 12;
      const formattedHours = String(hours).padStart(2, "0");

      return `${day}/${month}/${year} | ${formattedHours}:${minutes}:${seconds} ${ampm}`;
    }

    return dateString;
  } catch (e) {
    return dateString;
  }
};

const getDateOnly = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const ProjectManagement = () => {
  const moduleKey = "projectManagement";
  const canCreate = hasActionPermission(moduleKey, "create");

  useEffect(() => {
    document.title = "Project Management | MaxCode IT Services";
  }, []);

  const [allRecords, setAllRecords] = useState([]);
  const [records, setRecords] = useState([]);
  const [clients, setClients] = useState([]);
  const [staffRecords, setStaffRecords] = useState([]);
  const [financialYears, setFinancialYears] = useState([]);
  const [selectedFinancialYear, setSelectedFinancialYear] = useState(
    localStorage.getItem("selectedFinancialYear") || "ALL",
  );

  const [loading, setLoading] = useState(false);
  const [showCreateProjectForm, setShowCreateProjectForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [activeCardFilter, setActiveCardFilter] =
    useState("totalAmountWithTax");

  const [statistics, setStatistics] = useState({
    totalAmountWithTax: 0,
    totalProjectValue: 0,
    totalDeveloperCost: 0,
    totalClientPayable: 0,
    totalDeveloperPayable: 0,
    totalRemainingAmount: 0,
  });

  const cards = [
    {
      icon: "fa-solid fa-briefcase",
      title: "Total Value",
      key: "totalAmountWithTax",
      color: "primary",
    },
    {
      icon: "fa-solid fa-sack-dollar",
      title: "Project Value",
      key: "totalProjectValue",
      color: "info",
    },
    {
      icon: "fa-solid fa-wallet",
      title: "Client Received",
      key: "totalClientPayable",
      color: "success",
    },
    {
      icon: "fa-solid fa-money-check-dollar",
      title: "Developer Paid",
      key: "totalDeveloperPayable",
      color: "warning",
    },
    {
      icon: "fa-solid fa-scale-balanced",
      title: "Net Balance",
      key: "totalRemainingAmount",
      color: "danger",
    },
    {
      icon: "fas fa-plus-circle",
      title: "Add New",
      key: "addNew",
      color: "success",
    },
  ];

  useEffect(() => {
    fetchFinancialYears();
    fetchProjects();
    fetchClients();
    fetchStaff();

    const handleFinancialYearSelectionChanged = (event) => {
      const selectedYear =
        event?.detail?.selectedFinancialYear ||
        localStorage.getItem("selectedFinancialYear") ||
        "ALL";
      setSelectedFinancialYear(selectedYear);
    };

    window.addEventListener(
      "financialYearSelectionChanged",
      handleFinancialYearSelectionChanged,
    );

    return () => {
      window.removeEventListener(
        "financialYearSelectionChanged",
        handleFinancialYearSelectionChanged,
      );
    };
  }, []);

  useEffect(() => {
    applySelectedFinancialYearFilter(allRecords, selectedFinancialYear);
  }, [allRecords, selectedFinancialYear, financialYears]);

  const fetchFinancialYears = async () => {
    try {
      const response = await apiGet(API_ENDPOINTS.YEARS.LIST);
      const yearsData = Array.isArray(response.data)
        ? response.data
        : response.data?.years || [];

      const normalizedYears = yearsData
        .filter((yearRecord) => yearRecord?.isDeleted !== true)
        .map((yearRecord) => ({
          ...yearRecord,
          id: yearRecord.id || yearRecord._id,
          value: yearRecord.financialYear || yearRecord.year,
        }));

      setFinancialYears(normalizedYears);
    } catch (error) {
      console.error("Financial years API fetch error:", error);
      setFinancialYears([]);
    }
  };

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const response = await apiGet(API_ENDPOINTS.PROJECTS.LIST);
      const projectData = Array.isArray(response.data)
        ? response.data
        : response.data?.projects || [];

      const normalized = projectData.map((record) => ({
        ...record,
        id: record._id || record.id,
      }));

      setAllRecords(normalized);
    } catch (error) {
      console.error("Failed to fetch projects:", error);
      showError("Failed to fetch projects");
      setAllRecords([]);
      setRecords([]);
      updateStatistics([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchClients = async (options = {}) => {
    try {
      const clientsData = await fetchAllClients(options);

      const activeClients = clientsData
        .filter((client) => client?.isDeleted !== true)
        .map((client) => ({
          ...client,
          id: client.id || client._id,
        }));

      setClients(activeClients);
    } catch (error) {
      console.error("Failed to fetch clients:", error);
      setClients([]);
    }
  };

  const fetchStaff = async () => {
    try {
      const response = await apiGet(API_ENDPOINTS.STAFF.LIST);
      const staffData = Array.isArray(response.data)
        ? response.data
        : response.data?.staff || [];

      const activeStaff = staffData
        .filter((staff) => staff?.isDeleted !== true)
        .map((staff) => ({
          ...staff,
          id: staff.id || staff._id,
        }));

      setStaffRecords(activeStaff);
    } catch (error) {
      console.error("Failed to fetch staff:", error);
      setStaffRecords([]);
    }
  };

  const applySelectedFinancialYearFilter = (sourceRecords, selectedYear) => {
    if (!Array.isArray(sourceRecords)) {
      setRecords([]);
      updateStatistics([]);
      return;
    }

    if (!selectedYear || selectedYear === "ALL") {
      setRecords(sourceRecords);
      updateStatistics(sourceRecords);
      return;
    }

    const matchedYear = financialYears.find(
      (year) => year.value === selectedYear,
    );

    if (!matchedYear?.startDate || !matchedYear?.endDate) {
      setRecords(sourceRecords);
      updateStatistics(sourceRecords);
      return;
    }

    const startDate = getDateOnly(matchedYear.startDate);
    const endDate = getDateOnly(matchedYear.endDate);

    if (!startDate || !endDate) {
      setRecords(sourceRecords);
      updateStatistics(sourceRecords);
      return;
    }

    const filtered = sourceRecords.filter((record) => {
      const projectDate = getDateOnly(record.projectDate || record.createdDate);
      if (!projectDate) return false;
      return projectDate >= startDate && projectDate <= endDate;
    });

    setRecords(filtered);
    updateStatistics(filtered);
  };

  const updateStatistics = (data) => {
    const stats = data.reduce(
      (acc, record) => {
        const summary = record.summary || {};
        const totalProjectAmountWithoutTax = toNumber(
          summary.totalProjectAmountWithoutTax || record.projectTotalCost || 0,
        );
        const totalAmountWithTax = toNumber(
          summary.totalAmountWithTax ||
            totalProjectAmountWithoutTax +
              (totalProjectAmountWithoutTax *
                toNumber(summary.taxPercentage || 0)) /
                100,
        );

        acc.totalAmountWithTax += totalAmountWithTax;
        acc.totalProjectValue += totalProjectAmountWithoutTax;
        acc.totalDeveloperCost += toNumber(record.totalDeveloperCost || 0);
        acc.totalClientPayable += toNumber(summary.totalClientPayable || 0);
        acc.totalDeveloperPayable += toNumber(
          summary.totalDeveloperPayable || 0,
        );
        acc.totalRemainingAmount += toNumber(summary.remainingAmount || 0);

        return acc;
      },
      {
        totalAmountWithTax: 0,
        totalProjectValue: 0,
        totalDeveloperCost: 0,
        totalClientPayable: 0,
        totalDeveloperPayable: 0,
        totalRemainingAmount: 0,
      },
    );

    setStatistics(stats);
  };

  const formatCurrency = (value) =>
    toNumber(value).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const prepareTableData = () => {
    return records.map((record, index) => {
      const paymentDetails = Array.isArray(record.paymentDetails)
        ? record.paymentDetails
        : [];
      const developerTransactions = Array.isArray(record.developerTransactions)
        ? record.developerTransactions
        : [];
      const totalProjectAmountWithoutTax = toNumber(
        record.summary?.totalProjectAmountWithoutTax ||
          record.projectTotalCost ||
          0,
      );
      const totalAmountWithTax = toNumber(
        record.summary?.totalAmountWithTax ||
          totalProjectAmountWithoutTax +
            (totalProjectAmountWithoutTax *
              toNumber(record.summary?.taxPercentage || 0)) /
              100,
      );
      const totalTaxAmount = Math.max(
        totalAmountWithTax - totalProjectAmountWithoutTax,
        0,
      );
      const totalDeveloperCost = toNumber(record.totalDeveloperCost || 0);

      return {
        ...record,
        sn: index + 1,
        projectDateFormatted: formatDateForDisplay(record.projectDate),
        createdDateTime:
          record.createdDateTime ||
          formatDateTimeForDisplay(record.createdDate),
        paymentCount: paymentDetails.length,
        payoutCount: developerTransactions.length,
        totalProjectAmountWithoutTax,
        totalAmountWithTax,
        totalTaxAmount,
        totalDeveloperCost,
        totalClientPayable: toNumber(record.summary?.totalClientPayable || 0),
        totalDeveloperPayable: toNumber(
          record.summary?.totalDeveloperPayable || 0,
        ),
        remainingAmount: toNumber(record.summary?.remainingAmount || 0),
        taxPercentage: toNumber(record.summary?.taxPercentage || 0),
      };
    });
  };

  const tableData = useMemo(() => {
    const prepared = prepareTableData();

    if (activeCardFilter === "totalAmountWithTax") {
      return prepared.filter((row) => row.totalAmountWithTax > 0);
    }

    if (activeCardFilter === "totalProjectValue") {
      return prepared.filter((row) => row.totalProjectAmountWithoutTax > 0);
    }

    if (activeCardFilter === "totalClientPayable") {
      return prepared.filter((row) => row.totalClientPayable > 0);
    }

    if (activeCardFilter === "totalDeveloperPayable") {
      return prepared.filter((row) => row.totalDeveloperPayable > 0);
    }

    if (activeCardFilter === "totalRemainingAmount") {
      return prepared.filter((row) => row.remainingAmount !== 0);
    }

    return prepared;
  }, [activeCardFilter, records]);

  const columns = [
    { key: "sn", label: "S.No", width: 70 },
    { key: "projectId", label: "Project ID", width: 130 },
    { key: "projectDateFormatted", label: "Project Date", width: 130 },
    { key: "projectName", label: "Project Name", width: 190 },
    { key: "projectDevelopmentTime", label: "Development Time", width: 160 },
    { key: "clientName", label: "Client Name", width: 150 },
    { key: "clientId", label: "Client ID", width: 120 },
    { key: "businessName", label: "Business Name", width: 180 },
    { key: "phoneNumber", label: "Phone Number", width: 130 },
    { key: "email", label: "Email", width: 220 },
    { key: "address", label: "Address", width: 250 },
    {
      key: "taxPercentage",
      label: "Tax (%)",
      width: 100,
      render: (value) => <span>{toNumber(value).toFixed(2)}%</span>,
    },
    {
      key: "paymentCount",
      label: "Payments",
      width: 100,
      render: (value) => <span className="badge bg-primary">{value}</span>,
    },
    {
      key: "payoutCount",
      label: "Payouts",
      width: 100,
      render: (value) => <span className="badge bg-warning">{value}</span>,
    },
    {
      key: "totalProjectAmountWithoutTax",
      label: "Total Without Tax",
      width: 160,
      render: (value) => (
        <span className="fw-bold text-secondary">
          ₹ {formatCurrency(value)}
        </span>
      ),
    },
    {
      key: "totalTaxAmount",
      label: "Total Tax",
      width: 140,
      render: (value) => (
        <span className="fw-bold text-danger">₹ {formatCurrency(value)}</span>
      ),
    },
    {
      key: "totalAmountWithTax",
      label: "Total with Tax",
      width: 140,
      render: (value) => (
        <span className="fw-bold text-primary">₹ {formatCurrency(value)}</span>
      ),
    },
    {
      key: "totalClientPayable",
      label: "Client Received",
      width: 140,
      render: (value) => (
        <span className="fw-bold text-success">₹ {formatCurrency(value)}</span>
      ),
    },
    {
      key: "totalDeveloperPayable",
      label: "Developer Paid",
      width: 150,
      render: (value) => (
        <span className="fw-bold text-warning">₹ {formatCurrency(value)}</span>
      ),
    },
    {
      key: "totalDeveloperCost",
      label: "Total Developer Cost",
      width: 170,
      render: (value) => (
        <span className="fw-bold text-dark">₹ {formatCurrency(value)}</span>
      ),
    },
    {
      key: "remainingAmount",
      label: "Net Balance",
      width: 140,
      render: (value) => (
        <span
          className={`fw-bold ${toNumber(value) < 0 ? "text-danger" : "text-success"}`}
        >
          ₹ {formatCurrency(value)}
        </span>
      ),
    },
    { key: "createdDateTime", label: "Created Date & Time", width: 200 },
    { key: "action", label: "Actions", width: 170 },
  ];

  const fixedColumns = ["sn"];
  const defaultVisibleColumns = [
    "sn",
    "projectId",
    "projectDateFormatted",
    "projectName",
    "projectDevelopmentTime",
    "clientName",
    "clientId",
    "businessName",
    "phoneNumber",
    "address",
    "paymentCount",
    "payoutCount",
    "totalProjectAmountWithoutTax",
    "totalTaxAmount",
    "totalAmountWithTax",
    "totalClientPayable",
    "totalDeveloperPayable",
    "remainingAmount",
    "createdDateTime",
    "action",
  ];

  const columnsWithDropdownFilter = ["businessName", "taxPercentage"];
  const columnsWithDateFilter = ["projectDateFormatted", "createdDateTime"];

  const handleCardClick = (cardKey) => {
    if (cardKey === "addNew") {
      if (!canCreate) {
        showError("You don't have permission to add projects");
        return;
      }
      setEditingRecord(null);
      setShowCreateProjectForm(true);
    } else {
      setActiveCardFilter(cardKey);
    }
  };

  const getCardNumber = (index) => (index % 8) + 1;

  const handleFormSubmit = async (formData) => {
    try {
      const selectedClient = clients.find(
        (client) =>
          client.id == formData.clientRefId ||
          client._id == formData.clientRefId ||
          client.clientId == formData.clientRefId,
      );

      const payload = {
        ...formData,
        clientName: selectedClient?.clientName || formData.clientName || "",
        clientId:
          selectedClient?.clientId ||
          selectedClient?.id ||
          selectedClient?._id ||
          formData.clientId ||
          "",
        businessName:
          selectedClient?.businessName || formData.businessName || "",
        gstin:
          selectedClient?.gstin && String(selectedClient.gstin).trim() !== ""
            ? selectedClient.gstin
            : formData.gstin || "Unregistered",
        phoneNumber: selectedClient?.phoneNumber || formData.phoneNumber || "",
        email: selectedClient?.email || formData.email || "",
        address: selectedClient?.address || formData.address || "",
        createdDate: editingRecord?.createdDate || new Date().toISOString(),
      };

      if (editingRecord && !editingRecord.isViewMode) {
        const projectId = editingRecord._id || editingRecord.id;
        await apiPut(API_ENDPOINTS.PROJECTS.UPDATE(projectId), payload);
        showSuccess("Project updated successfully!");
      } else {
        await apiPost(API_ENDPOINTS.PROJECTS.CREATE, payload);
        showSuccess("Project added successfully!");
      }

      await fetchProjects();
      setShowCreateProjectForm(false);
      setEditingRecord(null);
    } catch (error) {
      console.error("Error saving project:", error);
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to save project",
      );
      throw error;
    }
  };

  const handleEdit = (record) => {
    setEditingRecord(record);
    setShowCreateProjectForm(true);
    showInfo(`Editing project: ${record.projectId}`);
  };

  const handleView = (record) => {
    setEditingRecord({ ...record, isViewMode: true });
    setShowCreateProjectForm(true);
    showInfo(`Viewing project: ${record.projectId}`);
  };

  const handleDelete = async (id) => {
    try {
      // Soft delete: set isDeleted true
      await apiPut(API_ENDPOINTS.PROJECTS.UPDATE(id), {
        isDeleted: true,
        deletedAt: new Date().toISOString(),
      });
      await fetchProjects();
      showSuccess("Project deleted successfully!");
    } catch (error) {
      console.error("Error deleting project:", error);
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to delete project",
      );
    }
  };

  const handleRefresh = () => {
    fetchFinancialYears();
    fetchProjects();
    fetchClients({ forceRefresh: true });
    fetchStaff();
    setActiveCardFilter("totalAmountWithTax");
    showInfo("Data refreshed!");
  };

  return (
    <>
      <div className="container-fluid">
        <div
          className="py-3 d-flex align-items-sm-center flex-sm-row flex-column"
          style={{ marginTop: "70px" }}
        >
          <div className="flex-grow-1">
            <h4 className="fs-18 fw-semibold m-0">Project Management</h4>
          </div>
        </div>

        <div className="row">
          {cards.map((card, index) => {
            const cardNumber = getCardNumber(index);
            const cardClass = `card${cardNumber}`;
            const cardIconBgClass = `card-icon-bg${cardNumber}`;
            const isActive =
              activeCardFilter === card.key && card.key !== "addNew";
            const isAddNewDisabled = card.key === "addNew" && !canCreate;

            return (
              <div key={index} className="col-md-6 col-xl-2 mb-4">
                <div
                  className={`card border-0 shadow-sm overflow-hidden ${cardClass} ${isActive ? "border-primary" : ""}`}
                  style={{
                    transition: "all 0.3s ease",
                    cursor: isAddNewDisabled ? "not-allowed" : "pointer",
                    opacity: isAddNewDisabled ? 0.6 : 1,
                    height: "100%",
                    borderRadius: "12px",
                    border: isActive
                      ? "2px solid #0d6efd"
                      : "1px solid #dee2e6",
                  }}
                  onMouseEnter={(e) => {
                    if (card.key === "addNew" && !isAddNewDisabled) {
                      e.currentTarget.style.transform = "translateY(-5px)";
                      e.currentTarget.style.boxShadow =
                        "0 10px 20px rgba(0,0,0,0.1)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow =
                      "0 2px 4px rgba(0,0,0,0.1)";
                  }}
                  onClick={() => !isAddNewDisabled && handleCardClick(card.key)}
                >
                  <div className="card-body text-center p-2">
                    <div className="mb-3 mt-2 d-flex justify-content-center">
                      <span
                        className={`avatar-md rounded-circle ${cardIconBgClass} d-inline-flex justify-content-center align-items-center`}
                        style={{
                          boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
                          width: "60px",
                          height: "60px",
                        }}
                      >
                        <i className={`${card.icon} fs-3 text-white`}></i>
                      </span>
                    </div>
                    <div>
                      <h5 className="mb-2 fw-bold">{card.title}</h5>
                      <h6
                        className="mb-0 text-muted fs-6 fw-bold"
                        style={{ marginBottom: "-10px" }}
                      >
                        {card.key === "addNew"
                          ? "+ Add New"
                          : `₹ ${formatCurrency(statistics[card.key] || 0)}`}
                      </h6>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <ReusableTable
          moduleKey={moduleKey}
          columns={columns}
          data={tableData}
          loading={loading}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onView={handleView}
          onRefresh={handleRefresh}
          showActions={true}
          actions={["view", "edit", "delete"]}
          fixedColumns={fixedColumns}
          defaultVisibleColumns={defaultVisibleColumns}
          columnsWithDropdownFilter={columnsWithDropdownFilter}
          columnsWithDateFilter={columnsWithDateFilter}
          tableTitle="Project Records"
          showColumnSelector={true}
          showExport={true}
          showRefresh={true}
          showAdvancedFilter={true}
          showSearch={true}
          exportFileName="Project_Management"
          exportTitle="Project Management Report"
          activeCardFilter={activeCardFilter}
          cards={cards}
        />

        <CreateProject
          show={showCreateProjectForm}
          onClose={() => {
            setShowCreateProjectForm(false);
            setEditingRecord(null);
          }}
          onSubmit={handleFormSubmit}
          editingRecord={editingRecord}
          clients={clients}
          staffRecords={staffRecords}
          financialYears={financialYears}
          existingProjects={allRecords}
        />
      </div>
    </>
  );
};

export default ProjectManagement;
