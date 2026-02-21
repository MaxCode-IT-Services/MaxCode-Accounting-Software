import React, { useState, useEffect } from "react";
import ReusableTable from "../Components/ReusableTable";
import CreateServices from "../Components/CreateServices";
import {
  showSuccess,
  showError,
  showInfo,
} from "../Components/ToastNotification";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { apiDelete, apiGet, apiPost, apiPut } from "../utils/api";
import { hasActionPermission } from "../utils/permissions";

const ServicesManagement = () => {
  const moduleKey = "servicesManagement";
  const canCreate = hasActionPermission(moduleKey, "create");

  useEffect(() => {
    document.title = "Services Management | MaxCode IT Services";
  }, []);

  const [allRecords, setAllRecords] = useState([]);
  const [records, setRecords] = useState([]);
  const [clients, setClients] = useState([]);
  const [financialYears, setFinancialYears] = useState([]);
  const [selectedFinancialYear, setSelectedFinancialYear] = useState(
    localStorage.getItem("selectedFinancialYear") || "ALL",
  );

  const [loading, setLoading] = useState(false);
  const [showCreateServicesForm, setShowCreateServicesForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [activeCardFilter, setActiveCardFilter] = useState("total");

  const [statistics, setStatistics] = useState({
    total: 0,
    allActive: 0,
    expired: 0,
    dueSoon: 0,
    totalAmount: 0,
  });

  const cards = [
    {
      icon: "fa-solid fa-server",
      title: "Total Services",
      key: "total",
      color: "primary",
    },
    {
      icon: "fa-solid fa-circle-check",
      title: "Active",
      key: "allActive",
      color: "success",
    },
    {
      icon: "fa-solid fa-circle-xmark",
      title: "Expired",
      key: "expired",
      color: "danger",
    },
    {
      icon: "fa-solid fa-clock",
      title: "Due in 30 Days",
      key: "dueSoon",
      color: "warning",
    },
    {
      icon: "fas fa-rupee-sign",
      title: "Total Amount",
      key: "totalAmount",
      color: "info",
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
    fetchServices();
    fetchClients();

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

  const getExpiryDrivenStatus = (expiryDate, fallbackStatus = "Active") => {
    if (!expiryDate) return fallbackStatus || "Active";

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiry = new Date(expiryDate);
    if (Number.isNaN(expiry.getTime())) return fallbackStatus || "Active";
    expiry.setHours(0, 0, 0, 0);

    return expiry < today ? "Expired" : "Active";
  };

  const normalizeRecordStatuses = (record) => {
    const normalizedServices = Array.isArray(record?.services)
      ? record.services.map((service) => ({
          ...service,
          status: getExpiryDrivenStatus(service?.expiryDate, service?.status),
        }))
      : [];

    const normalizedTransactions = Array.isArray(record?.transactions)
      ? record.transactions.map((transaction) => ({
          ...transaction,
          status: getExpiryDrivenStatus(
            transaction?.expiryDate,
            transaction?.status,
          ),
        }))
      : [];

    return {
      ...record,
      services: normalizedServices,
      transactions: normalizedTransactions,
      status: normalizedServices.every(
        (service) => service.status === "Expired",
      )
        ? "Expired"
        : "Active",
    };
  };

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

  const fetchServices = async () => {
    setLoading(true);
    try {
      const response = await apiGet(API_ENDPOINTS.SERVICES.LIST);
      const servicesData = Array.isArray(response.data)
        ? response.data
        : response.data?.services || [];

      const normalized = servicesData.map((record) => {
        const withNormalizedStatus = normalizeRecordStatuses(record);
        return {
          ...withNormalizedStatus,
          id: withNormalizedStatus._id || withNormalizedStatus.id,
        };
      });

      setAllRecords(normalized);
    } catch (error) {
      console.error("Failed to fetch services:", error);
      showError("Failed to fetch services");
      setAllRecords([]);
      setRecords([]);
      updateStatistics([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchClients = async () => {
    try {
      const response = await apiGet(API_ENDPOINTS.CLIENTS.LIST);
      const clientsData = Array.isArray(response.data)
        ? response.data
        : response.data?.clients || [];

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
      const serviceDate = getDateOnly(record.serviceDate || record.createdDate);
      if (!serviceDate) return false;
      return serviceDate >= startDate && serviceDate <= endDate;
    });

    setRecords(filtered);
    updateStatistics(filtered);
  };

  const getNearestExpiryDate = (serviceRows = []) => {
    const validDates = serviceRows
      .map((service) => service?.expiryDate)
      .filter(Boolean)
      .map((value) => new Date(value))
      .filter((date) => !Number.isNaN(date.getTime()))
      .sort((a, b) => a.getTime() - b.getTime());

    return validDates.length ? validDates[0].toISOString().slice(0, 10) : "";
  };

  const calculateServiceCounters = (serviceRows = []) => {
    const total = serviceRows.length;
    const active = serviceRows.filter((row) => row?.status === "Active").length;
    const expired = serviceRows.filter(
      (row) => row?.status === "Expired",
    ).length;

    return { total, active, expired };
  };

  const updateStatistics = (data) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dueSoonLimit = new Date(today);
    dueSoonLimit.setDate(dueSoonLimit.getDate() + 30);

    const stats = data.reduce(
      (acc, record) => {
        const serviceRows = Array.isArray(record.services)
          ? record.services
          : [];
        const rowSummary = calculateServiceCounters(serviceRows);

        acc.total += rowSummary.total;
        acc.allActive += rowSummary.active;
        acc.expired += rowSummary.expired;

        const dueSoonCount = serviceRows.filter((row) => {
          if (!row?.expiryDate) return false;
          const expiry = new Date(row.expiryDate);
          expiry.setHours(0, 0, 0, 0);
          return (
            row.status !== "Expired" &&
            expiry >= today &&
            expiry <= dueSoonLimit
          );
        }).length;

        acc.dueSoon += dueSoonCount;
        acc.totalAmount += parseFloat(record.summary?.grandTotal || 0) || 0;

        return acc;
      },
      {
        total: 0,
        allActive: 0,
        expired: 0,
        dueSoon: 0,
        totalAmount: 0,
      },
    );

    setStatistics({
      ...stats,
      totalAmount: stats.totalAmount.toFixed(2),
    });
  };

  const getRecordStatus = (record) => {
    const serviceRows = Array.isArray(record.services) ? record.services : [];
    if (!serviceRows.length) return "No Services";

    const allExpired = serviceRows.every((row) => row.status === "Expired");
    const allActive = serviceRows.every((row) => row.status === "Active");

    if (allExpired) return "Expired";
    if (allActive) return "Active";
    return "Mixed";
  };

  const prepareTableData = () => {
    return records.map((record, index) => {
      const serviceRows = Array.isArray(record.services) ? record.services : [];
      const counters = calculateServiceCounters(serviceRows);

      return {
        ...record,
        sn: index + 1,
        serviceDateFormatted: formatDateForDisplay(record.serviceDate),
        createdDateTime:
          record.createdDateTime ||
          formatDateTimeForDisplay(record.createdDate),
        serviceCount: counters.total,
        activeCount: counters.active,
        expiredCount: counters.expired,
        nextExpiry: formatDateForDisplay(getNearestExpiryDate(serviceRows)),
        totalServiceAmount: record.summary?.totalServiceAmount || 0,
        totalTransactionAmount: record.summary?.totalTransactionAmount || 0,
        grandTotal: record.summary?.grandTotal || 0,
        recordStatus: getRecordStatus(record),
      };
    });
  };

  const getCardFilteredData = (tableData) => {
    if (activeCardFilter === "total") return tableData;

    if (activeCardFilter === "allActive") {
      return tableData.filter((record) => record.recordStatus === "Active");
    }

    if (activeCardFilter === "expired") {
      return tableData.filter((record) => record.recordStatus === "Expired");
    }

    if (activeCardFilter === "dueSoon") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const dueSoonLimit = new Date(today);
      dueSoonLimit.setDate(dueSoonLimit.getDate() + 30);

      return tableData.filter((record) => {
        const services = Array.isArray(record.services) ? record.services : [];
        return services.some((row) => {
          if (!row?.expiryDate || row.status === "Expired") return false;
          const expiry = new Date(row.expiryDate);
          expiry.setHours(0, 0, 0, 0);
          return expiry >= today && expiry <= dueSoonLimit;
        });
      });
    }

    return tableData;
  };

  const columns = [
    { key: "sn", label: "S.No", width: 70 },
    { key: "serviceNumber", label: "Service No.", width: 130 },
    { key: "serviceDateFormatted", label: "Service Date", width: 130 },
    { key: "clientName", label: "Client Name", width: 150 },
    { key: "clientId", label: "Client ID", width: 120 },
    { key: "businessName", label: "Business Name", width: 180 },
    {
      key: "serviceCount",
      label: "Total Services",
      width: 130,
      render: (value) => <span className="badge bg-primary">{value}</span>,
    },
    {
      key: "activeCount",
      label: "Active",
      width: 90,
      render: (value) => <span className="badge bg-success">{value}</span>,
    },
    {
      key: "expiredCount",
      label: "Expired",
      width: 90,
      render: (value) => <span className="badge bg-danger">{value}</span>,
    },
    { key: "nextExpiry", label: "Next Expiry", width: 130 },
    {
      key: "totalServiceAmount",
      label: "Service Amount",
      width: 130,
      render: (value) => (
        <span className="fw-bold text-primary">
          ₹{" "}
          {parseFloat(value || 0).toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      ),
    },
    {
      key: "totalTransactionAmount",
      label: "Txn Amount",
      width: 130,
      render: (value) => (
        <span className="fw-bold text-info">
          ₹{" "}
          {parseFloat(value || 0).toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      ),
    },
    {
      key: "grandTotal",
      label: "Grand Total",
      width: 130,
      render: (value) => (
        <span className="fw-bold text-success">
          ₹{" "}
          {parseFloat(value || 0).toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      ),
    },
    {
      key: "recordStatus",
      label: "Status",
      width: 110,
      render: (value) => {
        let badge = "bg-secondary";
        if (value === "Active") badge = "bg-success";
        else if (value === "Expired") badge = "bg-danger";
        else if (value === "Mixed") badge = "bg-warning";
        return <span className={`badge ${badge}`}>{value}</span>;
      },
    },
    { key: "createdDateTime", label: "Created Date & Time", width: 200 },
    { key: "action", label: "Actions", width: 170 },
  ];

  const fixedColumns = ["sn"];
  const defaultVisibleColumns = [
    "sn",
    "serviceNumber",
    "serviceDateFormatted",
    "clientName",
    "clientId",
    "businessName",
    "serviceCount",
    "activeCount",
    "expiredCount",
    "nextExpiry",
    "grandTotal",
    "recordStatus",
    "createdDateTime",
    "action",
  ];

  const columnsWithDropdownFilter = ["recordStatus", "businessName"];
  const columnsWithDateFilter = [
    "serviceDateFormatted",
    "createdDateTime",
    "nextExpiry",
  ];

  const handleCardClick = (cardKey) => {
    if (cardKey === "addNew") {
      if (!canCreate) {
        showError("You don't have permission to add services");
        return;
      }
      setEditingRecord(null);
      setShowCreateServicesForm(true);
    } else {
      setActiveCardFilter(cardKey);
    }
  };

  const getCardNumber = (index) => {
    return (index % 8) + 1;
  };

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
        createdDate: editingRecord?.createdDate || new Date().toISOString(),
      };

      if (editingRecord && !editingRecord.isViewMode) {
        const serviceId = editingRecord._id || editingRecord.id;
        await apiPut(API_ENDPOINTS.SERVICES.UPDATE(serviceId), payload);
        showSuccess("Service updated successfully!");
      } else {
        await apiPost(API_ENDPOINTS.SERVICES.CREATE, payload);
        showSuccess("Service added successfully!");
      }

      await fetchServices();
      setShowCreateServicesForm(false);
      setEditingRecord(null);
    } catch (error) {
      console.error("Error saving service:", error);
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to save service",
      );
      throw error;
    }
  };

  const handleEdit = (record) => {
    setEditingRecord(record);
    setShowCreateServicesForm(true);
    showInfo(`Editing service: ${record.serviceNumber}`);
  };

  const handleView = (record) => {
    setEditingRecord({ ...record, isViewMode: true });
    setShowCreateServicesForm(true);
    showInfo(`Viewing service: ${record.serviceNumber}`);
  };

  const handleDelete = async (id) => {
    try {
      await apiDelete(API_ENDPOINTS.SERVICES.DELETE(id));
      await fetchServices();
      showSuccess("Service deleted successfully!");
    } catch (error) {
      console.error("Error deleting service:", error);
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to delete service",
      );
    }
  };

  const handleRefresh = () => {
    fetchFinancialYears();
    fetchServices();
    fetchClients();
    setActiveCardFilter("total");
    showInfo("Data refreshed!");
  };

  const tableData = getCardFilteredData(prepareTableData());

  return (
    <>
      <div className="container-fluid">
        <div
          className="py-3 d-flex align-items-sm-center flex-sm-row flex-column"
          style={{ marginTop: "70px" }}
        >
          <div className="flex-grow-1">
            <h4 className="fs-18 fw-semibold m-0">Services Management</h4>
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
                          : card.key === "totalAmount"
                            ? `₹ ${parseFloat(statistics[card.key] || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : statistics[card.key]}
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
          tableTitle="Services Records"
          showColumnSelector={true}
          showExport={true}
          showRefresh={true}
          showAdvancedFilter={true}
          showSearch={true}
          exportFileName="Services_Management"
          exportTitle="Services Management Report"
          activeCardFilter={"total"}
          cards={cards}
          getBadgeClass={(value) => {
            if (value === "Active") return "bg-success";
            if (value === "Expired") return "bg-danger";
            if (value === "Mixed") return "bg-warning";
            return "bg-primary";
          }}
        />

        <CreateServices
          show={showCreateServicesForm}
          onClose={() => {
            setShowCreateServicesForm(false);
            setEditingRecord(null);
          }}
          onSubmit={handleFormSubmit}
          editingRecord={editingRecord}
          clients={clients}
          existingServices={allRecords}
        />
      </div>
    </>
  );
};

export default ServicesManagement;
