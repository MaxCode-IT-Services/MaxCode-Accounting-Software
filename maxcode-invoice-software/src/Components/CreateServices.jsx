import React, { useState, useEffect } from "react";
import Select from "react-select";
import CreatableSelect from "react-select/creatable";
import { showError } from "./ToastNotification";
import { apiGet } from "../utils/api";
import API_ENDPOINTS from "../utils/apiEndpoints";

const emptyServiceRow = (id = 1) => ({
  id,
  serviceName: "",
  description: "",
  price: "",
  startDate: "",
  expiryDate: "",
  status: "Active",
  sendAlert: false,
});

const emptyTransactionRow = (id = 1) => ({
  id,
  serviceName: "",
  description: "",
  price: "",
  renewDate: "",
  expiryDate: "",
  status: "Active",
});

const getAutoStatusFromExpiry = (expiryDate) => {
  if (!expiryDate) return "Active";
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);

  return expiry < today ? "Expired" : "Active";
};

const getExpiryDrivenStatus = (expiryDate, fallbackStatus = "Active") => {
  if (!expiryDate) return fallbackStatus || "Active";
  return getAutoStatusFromExpiry(expiryDate);
};

const toNumber = (value) => {
  const number = parseFloat(value);
  return Number.isNaN(number) ? 0 : number;
};

const CreateServices = ({
  show,
  onClose,
  onSubmit,
  editingRecord = null,
  clients = [],
  existingServices = [],
}) => {
  const [formData, setFormData] = useState({
    serviceNumber: "",
    serviceDate: "",
    clientRefId: "",
    clientId: "",
    clientName: "",
    businessName: "",
    gstin: "",
    phoneNumber: "",
    email: "",
    address: "",
  });

  const [services, setServices] = useState([emptyServiceRow(1)]);
  const [transactions, setTransactions] = useState([emptyTransactionRow(1)]);
  const [clientOptions, setClientOptions] = useState([]);
  const [serviceNameOptions, setServiceNameOptions] = useState([]);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (show) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
    }

    return () => {
      document.body.style.overflow = "auto";
    };
  }, [show]);

  useEffect(() => {
    if (Array.isArray(clients) && clients.length > 0) {
      setClientOptions(clients.filter((client) => client?.isDeleted !== true));
    }
  }, [clients]);

  useEffect(() => {
    if (!show) return;

    const fetchClients = async () => {
      try {
        const response = await apiGet(API_ENDPOINTS.CLIENTS.LIST);
        const clientData = Array.isArray(response.data)
          ? response.data
          : response.data?.clients || [];

        setClientOptions(
          clientData.filter((client) => client?.isDeleted !== true),
        );
      } catch (error) {
        console.error("Failed to fetch clients:", error);
      }
    };

    fetchClients();
  }, [show]);

  useEffect(() => {
    if (!show) return;

    const fetchBusinessSettings = async () => {
      try {
        const response = await apiGet(API_ENDPOINTS.BUSINESS_SETTINGS.GET);
        const services = Array.isArray(response?.data?.settings?.services)
          ? response.data.settings.services
          : [];

        const normalizedServices = services
          .filter((service) => service?.name && service?.status !== "inactive")
          .map((service) => ({
            value: service.name,
            label: service.name,
          }));

        setServiceNameOptions(normalizedServices);
      } catch (error) {
        console.error("Failed to fetch business settings:", error);
        setServiceNameOptions([]);
      }
    };

    fetchBusinessSettings();
  }, [show]);

  const getNextServiceNumber = (records) => {
    const maxNumber = (records || []).reduce((max, record) => {
      const match = String(record?.serviceNumber || "").match(/SRV(\d+)/i);
      if (!match) return max;
      const value = parseInt(match[1], 10);
      return Number.isNaN(value) ? max : Math.max(max, value);
    }, 0);

    return `SRV${String(maxNumber + 1).padStart(4, "0")}`;
  };

  const resetForm = () => {
    setFormData({
      serviceNumber: getNextServiceNumber(existingServices),
      serviceDate: new Date().toISOString().slice(0, 10),
      clientRefId: "",
      clientId: "",
      clientName: "",
      businessName: "",
      gstin: "",
      phoneNumber: "",
      email: "",
      address: "",
    });
    setServices([emptyServiceRow(1)]);
    setTransactions([emptyTransactionRow(1)]);
    setErrors({});
  };

  useEffect(() => {
    if (!show) return;

    if (editingRecord) {
      setFormData({
        serviceNumber: editingRecord.serviceNumber || "",
        serviceDate: editingRecord.serviceDate || "",
        clientRefId: editingRecord.clientRefId || "",
        clientId: editingRecord.clientId || "",
        clientName: editingRecord.clientName || "",
        businessName: editingRecord.businessName || "",
        gstin: editingRecord.gstin || "",
        phoneNumber: editingRecord.phoneNumber || "",
        email: editingRecord.email || "",
        address: editingRecord.address || "",
      });

      const mappedServices = Array.isArray(editingRecord.services)
        ? editingRecord.services.map((service, index) => ({
            id: service.id || index + 1,
            serviceName: service.serviceName || "",
            description: service.description || "",
            price: String(service.price ?? ""),
            startDate: service.startDate || "",
            expiryDate: service.expiryDate || "",
            status: getExpiryDrivenStatus(service.expiryDate, service.status),
            sendAlert: Boolean(service.sendAlert),
          }))
        : [emptyServiceRow(1)];

      const mappedTransactions = Array.isArray(editingRecord.transactions)
        ? editingRecord.transactions.map((transaction, index) => ({
            id: transaction.id || index + 1,
            serviceName: transaction.serviceName || "",
            description: transaction.description || "",
            price: String(transaction.price ?? ""),
            renewDate: transaction.renewDate || "",
            expiryDate: transaction.expiryDate || "",
            status: getExpiryDrivenStatus(
              transaction.expiryDate,
              transaction.status,
            ),
          }))
        : [emptyTransactionRow(1)];

      setServices(
        mappedServices.length ? mappedServices : [emptyServiceRow(1)],
      );
      setTransactions(
        mappedTransactions.length
          ? mappedTransactions
          : [emptyTransactionRow(1)],
      );
      setErrors({});
      return;
    }

    resetForm();
  }, [editingRecord, show]);

  const handleNumberInput = (e) => {
    const value = e.target.value;
    const filteredValue = value.replace(/[^0-9.]/g, "");
    const parts = filteredValue.split(".");
    const validValue =
      parts.length > 2
        ? parts[0] + "." + parts.slice(1).join("")
        : filteredValue;
    e.target.value = validValue;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: "",
      }));
    }
  };

  const handleClientChange = (selectedOption) => {
    const selectedRefId = selectedOption?.value || "";
    const selectedClient = clientOptions.find(
      (client) =>
        String(client.id || client._id || client.clientId || "") ===
        String(selectedRefId),
    );

    if (selectedClient) {
      setFormData((prev) => ({
        ...prev,
        clientRefId: selectedRefId,
        clientId:
          selectedClient.clientId ||
          selectedClient.id ||
          selectedClient._id ||
          "",
        clientName: selectedClient.clientName || "",
        businessName: selectedClient.businessName || "",
        gstin:
          selectedClient.gstin && String(selectedClient.gstin).trim() !== ""
            ? selectedClient.gstin
            : "Unregistered",
        phoneNumber: selectedClient.phoneNumber || "",
        email: selectedClient.email || "",
        address: selectedClient.address || "",
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        clientRefId: selectedRefId,
        clientId: "",
        clientName: "",
        businessName: "",
        gstin: "",
        phoneNumber: "",
        email: "",
        address: "",
      }));
    }

    if (errors.clientRefId) {
      setErrors((prev) => ({ ...prev, clientRefId: "" }));
    }
  };

  const handleServiceChange = (id, field, value) => {
    setServices((prev) =>
      prev.map((service) => {
        if (service.id !== id) return service;

        const updated = { ...service, [field]: value };

        if (field === "expiryDate") {
          updated.status = getAutoStatusFromExpiry(value);
        }

        return updated;
      }),
    );
  };

  const handleServiceNameSelect = (id, selectedOption) => {
    handleServiceChange(id, "serviceName", selectedOption?.value || "");
  };

  const handleServiceStatusToggle = (id, checked) => {
    setServices((prev) =>
      prev.map((service) =>
        service.id === id
          ? {
              ...service,
              status: checked
                ? getExpiryDrivenStatus(service.expiryDate, "Active")
                : "Expired",
            }
          : service,
      ),
    );
  };

  const handleServiceSendAlertToggle = (id, checked) => {
    setServices((prev) =>
      prev.map((service) =>
        service.id === id ? { ...service, sendAlert: checked } : service,
      ),
    );
  };

  const addService = () => {
    const nextId = services.length
      ? Math.max(...services.map((service) => service.id)) + 1
      : 1;
    setServices((prev) => [...prev, emptyServiceRow(nextId)]);
  };

  const removeService = (id) => {
    if (services.length === 1) {
      showError("At least one service is required");
      return;
    }

    setServices((prev) => prev.filter((service) => service.id !== id));
  };

  const handleTransactionChange = (id, field, value) => {
    setTransactions((prev) =>
      prev.map((transaction) => {
        if (transaction.id !== id) return transaction;

        const updated = { ...transaction, [field]: value };

        if (field === "expiryDate") {
          updated.status = getAutoStatusFromExpiry(value);
        }

        return updated;
      }),
    );
  };

  const handleTransactionServiceNameSelect = (id, selectedOption) => {
    handleTransactionChange(id, "serviceName", selectedOption?.value || "");
  };

  const handleTransactionStatusToggle = (id, checked) => {
    setTransactions((prev) =>
      prev.map((transaction) =>
        transaction.id === id
          ? {
              ...transaction,
              status: checked
                ? getExpiryDrivenStatus(transaction.expiryDate, "Active")
                : "Expired",
            }
          : transaction,
      ),
    );
  };

  const addTransaction = () => {
    const nextId = transactions.length
      ? Math.max(...transactions.map((transaction) => transaction.id)) + 1
      : 1;
    setTransactions((prev) => [...prev, emptyTransactionRow(nextId)]);
  };

  const removeTransaction = (id) => {
    if (transactions.length === 1) {
      showError("At least one transaction row is required");
      return;
    }

    setTransactions((prev) =>
      prev.filter((transaction) => transaction.id !== id),
    );
  };

  const getSummary = () => {
    const totalServiceAmount = services.reduce(
      (sum, service) => sum + toNumber(service.price),
      0,
    );

    const totalTransactionAmount = transactions.reduce(
      (sum, transaction) => sum + toNumber(transaction.price),
      0,
    );

    return {
      totalServiceAmount: totalServiceAmount.toFixed(2),
      totalTransactionAmount: totalTransactionAmount.toFixed(2),
      grandTotal: (totalServiceAmount + totalTransactionAmount).toFixed(2),
    };
  };

  const fieldNames = {
    serviceNumber: "Service Number",
    serviceDate: "Service Date",
    clientRefId: "Client",
  };

  const validateForm = () => {
    const newErrors = {};
    const requiredFields = ["serviceNumber", "serviceDate", "clientRefId"];

    requiredFields.forEach((field) => {
      if (!formData[field] || formData[field].toString().trim() === "") {
        newErrors[field] = `${fieldNames[field]} is required`;
      }
    });

    const hasValidService = services.some(
      (service) =>
        service.serviceName &&
        String(service.serviceName).trim() !== "" &&
        service.price !== "" &&
        service.startDate &&
        service.expiryDate,
    );

    if (!hasValidService) {
      newErrors.services =
        "At least one service with name, price, start date and expiry date is required";
      showError("Please add at least one complete service row");
    }

    const hasInvalidDates = services.some(
      (service) =>
        service.startDate &&
        service.expiryDate &&
        new Date(service.expiryDate) < new Date(service.startDate),
    );

    if (hasInvalidDates) {
      newErrors.servicesDates =
        "Service expiry date cannot be before start date";
      showError("Service expiry date must be after start date");
    }

    const hasInvalidTransactionDates = transactions.some(
      (transaction) =>
        transaction.renewDate &&
        transaction.expiryDate &&
        new Date(transaction.expiryDate) < new Date(transaction.renewDate),
    );

    if (hasInvalidTransactionDates) {
      newErrors.transactionsDates =
        "Transaction expiry date cannot be before renew date";
      showError("Transaction expiry date must be after renew date");
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    if (formData.phoneNumber && !/^\d{10}$/.test(formData.phoneNumber)) {
      newErrors.phoneNumber = "Phone number must be exactly 10 digits";
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      const firstErrorField = Object.keys(newErrors)[0];
      if (fieldNames[firstErrorField]) {
        showError(`Please fill ${fieldNames[firstErrorField]} field correctly`);
      }
      return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!validateForm()) return;

    setSubmitting(true);
    try {
      const summary = getSummary();
      const normalizedServices = services.map((service) => ({
        ...service,
        status: getExpiryDrivenStatus(service.expiryDate, service.status),
      }));
      const normalizedTransactions = transactions.map((transaction) => ({
        ...transaction,
        status: getExpiryDrivenStatus(
          transaction.expiryDate,
          transaction.status,
        ),
      }));

      const submitData = {
        ...formData,
        services: normalizedServices,
        transactions: normalizedTransactions,
        summary,
        status: normalizedServices.every(
          (service) => service.status === "Expired",
        )
          ? "Expired"
          : "Active",
        id: editingRecord?.id || Date.now(),
        createdDate: editingRecord?.createdDate || new Date().toISOString(),
      };

      await onSubmit(submitData);
    } finally {
      setSubmitting(false);
    }
  };

  const RequiredStar = () => <span className="text-danger">*</span>;

  if (!show) return null;

  const isViewMode = editingRecord?.isViewMode;

  const modalTitle = editingRecord
    ? editingRecord.isViewMode
      ? `View Service - ${editingRecord.serviceNumber}`
      : `Edit Service - ${editingRecord.serviceNumber}`
    : "Add New Services";

  const selectMenuPortalTarget =
    typeof document !== "undefined" ? document.body : null;

  const selectedClientOption = clientOptions
    .map((client) => ({
      value: client.id || client._id || client.clientId,
      label: `${client.clientName || ""} - ${client.businessName || ""}`,
    }))
    .find((option) => String(option.value) === String(formData.clientRefId));

  const clientSelectStyles = {
    control: (base, state) => ({
      ...base,
      minHeight: "48px",
      border: errors.clientRefId
        ? "2px solid #dc3545"
        : state.isFocused
          ? "2px solid #667eea"
          : "2px solid #e9ecef",
      borderColor:
        state.isHovered && !errors.clientRefId ? "#d6dbe1" : undefined,
      borderRadius: "10px",
      boxShadow: state.isFocused
        ? "0 0 0 .25rem rgba(102, 126, 234, 0.15)"
        : "none",
      backgroundColor: "#ffffff",
      transition: "all 0.3s ease",
    }),
    valueContainer: (base) => ({
      ...base,
      padding: "6px 8px",
    }),
    input: (base) => ({
      ...base,
      margin: "2px",
      padding: 0,
    }),
    indicatorsContainer: (base) => ({
      ...base,
      paddingRight: "8px",
    }),
    menu: (base) => ({
      ...base,
      zIndex: 20,
    }),
    menuPortal: (base) => ({
      ...base,
      zIndex: 9999,
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isSelected
        ? "#007026"
        : state.isFocused
          ? "rgba(0, 112, 38, 0.15)"
          : base.backgroundColor,
      color: state.isSelected ? "#fff" : "#212529",
      cursor: "pointer",
    }),
  };

  const serviceNameSelectStyles = {
    control: (base, state) => ({
      ...base,
      minHeight: "34px",
      border: state.isFocused ? "2px solid #667eea" : "2px solid #e9ecef",
      borderColor: state.isHovered ? "#d6dbe1" : undefined,
      borderRadius: "10px",
      fontSize: "0.875rem",
      boxShadow: state.isFocused
        ? "0 0 0 .25rem rgba(102, 126, 234, 0.15)"
        : "none",
      backgroundColor: "#ffffff",
      transition: "all 0.3s ease",
    }),
    valueContainer: (base) => ({
      ...base,
      paddingTop: "2px",
      paddingBottom: "2px",
      paddingLeft: "8px",
    }),
    input: (base) => ({
      ...base,
      margin: 0,
      padding: 0,
    }),
    indicatorsContainer: (base) => ({
      ...base,
      height: "42px",
      paddingRight: "4px",
    }),
    menu: (base) => ({
      ...base,
      zIndex: 20,
      fontSize: "0.875rem",
    }),
    menuPortal: (base) => ({
      ...base,
      zIndex: 9999,
    }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isSelected
        ? "#007026"
        : state.isFocused
          ? "rgba(0, 112, 38, 0.15)"
          : base.backgroundColor,
      color: state.isSelected ? "#fff" : "#212529",
      cursor: "pointer",
    }),
  };

  const getServiceSelectValue = (serviceName) => {
    if (!serviceName) return null;

    return (
      serviceNameOptions.find((option) => option.value === serviceName) || {
        value: serviceName,
        label: serviceName,
      }
    );
  };

  const summary = getSummary();

  return (
    <div
      className={`modal ${show ? "show d-block" : "d-none"}`}
      tabIndex="-1"
      role="dialog"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <div className="modal-dialog modal-fullscreen" role="document">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{modalTitle}</h5>
            <button
              type="button"
              className="btn-close"
              onClick={onClose}
            ></button>
          </div>

          <div
            className="modal-body"
            style={{ maxHeight: "75vh", overflowY: "auto" }}
          >
            <form id="servicesForm" onSubmit={handleSubmit} noValidate>
              <div className="row mb-4">
                <div className="col-12">
                  <h6 className="border-bottom pb-2 mb-3">
                    <i className="fas fa-info-circle me-2 text-primary"></i>
                    Basic Information
                  </h6>
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="serviceNumber" className="form-label">
                    <i className="fas fa-hashtag me-2 text-primary"></i>
                    Service Number <RequiredStar />
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.serviceNumber ? "is-invalid" : ""}`}
                    id="serviceNumber"
                    name="serviceNumber"
                    value={formData.serviceNumber}
                    onChange={handleInputChange}
                    readOnly={isViewMode || !editingRecord}
                  />
                  {errors.serviceNumber && (
                    <div className="invalid-feedback d-block">
                      {errors.serviceNumber}
                    </div>
                  )}
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="serviceDate" className="form-label">
                    <i className="fas fa-calendar me-2 text-primary"></i>
                    Service Date <RequiredStar />
                  </label>
                  <input
                    type="date"
                    className={`form-control modern-input ${errors.serviceDate ? "is-invalid" : ""}`}
                    id="serviceDate"
                    name="serviceDate"
                    value={formData.serviceDate}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                  />
                  {errors.serviceDate && (
                    <div className="invalid-feedback d-block">
                      {errors.serviceDate}
                    </div>
                  )}
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="clientRefId" className="form-label">
                    <i className="fas fa-user me-2 text-primary"></i>
                    Select Client <RequiredStar />
                  </label>
                  <Select
                    inputId="clientRefId"
                    name="clientRefId"
                    className={errors.clientRefId ? "is-invalid" : ""}
                    classNamePrefix="react-select"
                    styles={clientSelectStyles}
                    menuPortalTarget={selectMenuPortalTarget}
                    menuPosition="fixed"
                    value={selectedClientOption || null}
                    onChange={handleClientChange}
                    isDisabled={isViewMode}
                    isClearable
                    isSearchable
                    placeholder="Select Client"
                    options={clientOptions.map((client) => ({
                      value: client.id || client._id || client.clientId,
                      label: `${client.clientName || ""} - ${client.businessName || ""}`,
                    }))}
                  />
                  {errors.clientRefId && (
                    <div className="invalid-feedback d-block">
                      {errors.clientRefId}
                    </div>
                  )}
                </div>
              </div>

              <div className="row mb-4">
                <div className="col-12">
                  <h6 className="border-bottom pb-2 mb-3">
                    <i className="fas fa-building me-2 text-success"></i>
                    Client Details (Auto-filled)
                  </h6>
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="clientId" className="form-label">
                    Client ID
                  </label>
                  <input
                    type="text"
                    className="form-control modern-input"
                    id="clientId"
                    value={formData.clientId}
                    readOnly
                    style={{ backgroundColor: "#e9ecef" }}
                  />
                </div>
                <div className="col-md-4 mb-3">
                  <label htmlFor="businessName" className="form-label">
                    Business Name
                  </label>
                  <input
                    type="text"
                    className="form-control modern-input"
                    id="businessName"
                    value={formData.businessName}
                    readOnly
                    style={{ backgroundColor: "#e9ecef" }}
                  />
                </div>
                <div className="col-md-4 mb-3">
                  <label htmlFor="gstin" className="form-label">
                    GSTIN
                  </label>
                  <input
                    type="text"
                    className="form-control modern-input"
                    id="gstin"
                    value={formData.gstin}
                    readOnly
                    style={{ backgroundColor: "#e9ecef" }}
                  />
                </div>
                <div className="col-md-4 mb-3">
                  <label htmlFor="phoneNumber" className="form-label">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.phoneNumber ? "is-invalid" : ""}`}
                    id="phoneNumber"
                    name="phoneNumber"
                    value={formData.phoneNumber}
                    readOnly
                    style={{ backgroundColor: "#e9ecef" }}
                  />
                  {errors.phoneNumber && (
                    <div className="invalid-feedback d-block">
                      {errors.phoneNumber}
                    </div>
                  )}
                </div>
                <div className="col-md-4 mb-3">
                  <label htmlFor="email" className="form-label">
                    Email ID
                  </label>
                  <input
                    type="email"
                    className={`form-control modern-input ${errors.email ? "is-invalid" : ""}`}
                    id="email"
                    name="email"
                    value={formData.email}
                    readOnly
                    style={{ backgroundColor: "#e9ecef" }}
                  />
                  {errors.email && (
                    <div className="invalid-feedback d-block">
                      {errors.email}
                    </div>
                  )}
                </div>
                <div className="col-md-4 mb-3">
                  <label htmlFor="address" className="form-label">
                    Address
                  </label>
                  <input
                    type="text"
                    className="form-control modern-input"
                    id="address"
                    value={formData.address}
                    readOnly
                    style={{ backgroundColor: "#e9ecef" }}
                  />
                </div>
              </div>

              <div className="row mb-4">
                <div className="col-12">
                  <h6 className="border-bottom pb-2 mb-3">
                    <i className="fas fa-network-wired me-2 text-info"></i>
                    Services Details
                  </h6>
                  {(errors.services || errors.servicesDates) && (
                    <div className="alert alert-danger">
                      {errors.services || errors.servicesDates}
                    </div>
                  )}
                </div>

                <div className="col-12">
                  <div className="table-responsive">
                    <table className="table table-bordered table-hover">
                      <thead className="table-primary">
                        <tr>
                          <th style={{ width: "50px" }}>S.N</th>
                          <th style={{ width: "220px" }}>Service Name</th>
                          <th style={{ width: "260px" }}>Description</th>
                          <th style={{ width: "120px" }}>Price (Rs)</th>
                          <th style={{ width: "140px" }}>Start Date</th>
                          <th style={{ width: "140px" }}>Expiry Date</th>
                          <th style={{ width: "60px" }}>Status</th>
                          <th style={{ width: "70px" }}>Send Alert</th>
                          <th style={{ width: "50px" }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {services.map((service, index) => (
                          <tr key={service.id}>
                            <td className="text-center align-middle">
                              <strong>{index + 1}</strong>
                            </td>
                            <td>
                              <CreatableSelect
                                classNamePrefix="react-select"
                                styles={serviceNameSelectStyles}
                                menuPortalTarget={selectMenuPortalTarget}
                                menuPosition="fixed"
                                value={getServiceSelectValue(
                                  service.serviceName,
                                )}
                                onChange={(selectedOption) =>
                                  handleServiceNameSelect(
                                    service.id,
                                    selectedOption,
                                  )
                                }
                                isDisabled={isViewMode}
                                isClearable
                                isSearchable
                                placeholder="Select or type service..."
                                options={serviceNameOptions}
                                formatCreateLabel={(inputValue) =>
                                  `Add Custom: ${inputValue}`
                                }
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                className="form-control modern-input form-control-sm"
                                value={service.description}
                                onChange={(e) =>
                                  handleServiceChange(
                                    service.id,
                                    "description",
                                    e.target.value,
                                  )
                                }
                                placeholder="Description"
                                readOnly={isViewMode}
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                className="form-control modern-input form-control-sm"
                                value={service.price}
                                onChange={(e) => {
                                  handleNumberInput(e);
                                  handleServiceChange(
                                    service.id,
                                    "price",
                                    e.target.value,
                                  );
                                }}
                                placeholder="Price"
                                readOnly={isViewMode}
                              />
                            </td>
                            <td>
                              <input
                                type="date"
                                className="form-control modern-input form-control-sm"
                                value={service.startDate}
                                onChange={(e) =>
                                  handleServiceChange(
                                    service.id,
                                    "startDate",
                                    e.target.value,
                                  )
                                }
                                readOnly={isViewMode}
                              />
                            </td>
                            <td>
                              <input
                                type="date"
                                className="form-control modern-input form-control-sm"
                                value={service.expiryDate}
                                onChange={(e) =>
                                  handleServiceChange(
                                    service.id,
                                    "expiryDate",
                                    e.target.value,
                                  )
                                }
                                readOnly={isViewMode}
                              />
                            </td>
                            <td className="align-middle">
                              <div className="form-check form-switch d-flex align-items-center justify-content-center">
                                <input
                                  className="form-check-input me-2"
                                  type="checkbox"
                                  checked={service.status === "Active"}
                                  onChange={(e) =>
                                    handleServiceStatusToggle(
                                      service.id,
                                      e.target.checked,
                                    )
                                  }
                                  disabled={isViewMode}
                                />
                                <span
                                  className={`badge ${service.status === "Active" ? "bg-success" : "bg-danger"}`}
                                >
                                  {service.status}
                                </span>
                              </div>
                            </td>
                            <td className="align-middle">
                              <div className="form-check form-switch d-flex align-items-center justify-content-center">
                                <input
                                  className="form-check-input me-2"
                                  type="checkbox"
                                  checked={Boolean(service.sendAlert)}
                                  onChange={(e) =>
                                    handleServiceSendAlertToggle(
                                      service.id,
                                      e.target.checked,
                                    )
                                  }
                                  disabled={isViewMode}
                                />
                                <span
                                  className={`badge ${service.sendAlert ? "bg-success" : "bg-secondary"}`}
                                >
                                  {service.sendAlert ? "On" : "Off"}
                                </span>
                              </div>
                            </td>
                            <td className="text-center align-middle">
                              {!isViewMode && (
                                <button
                                  type="button"
                                  className="btn btn-danger btn-sm"
                                  onClick={() => removeService(service.id)}
                                  disabled={services.length === 1}
                                >
                                  <i className="fas fa-trash"></i>
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {!isViewMode && (
                    <button
                      type="button"
                      className="btn btn-success btn-sm mt-2"
                      onClick={addService}
                    >
                      <i className="fas fa-plus me-2"></i>
                      Add More Service
                    </button>
                  )}
                </div>
              </div>

              <div className="row mb-4">
                <div className="col-12">
                  <h6 className="border-bottom pb-2 mb-3">
                    <i className="fas fa-rotate-right me-2 text-warning"></i>
                    Add Transaction (Renewal/Update)
                  </h6>
                  {errors.transactionsDates && (
                    <div className="alert alert-danger">
                      {errors.transactionsDates}
                    </div>
                  )}
                </div>

                <div className="col-12">
                  <div className="table-responsive">
                    <table className="table table-bordered table-hover">
                      <thead className="table-success">
                        <tr>
                          <th style={{ width: "50px" }}>S.N</th>
                          <th style={{ width: "220px" }}>Service Name</th>
                          <th style={{ width: "260px" }}>Description</th>
                          <th style={{ width: "120px" }}>Price (Rs)</th>
                          <th style={{ width: "140px" }}>Renew Date</th>
                          <th style={{ width: "140px" }}>Expiry Date</th>
                          <th style={{ width: "140px" }}>Status</th>
                          <th style={{ width: "80px" }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {transactions.map((transaction, index) => (
                          <tr key={transaction.id}>
                            <td className="text-center align-middle">
                              <strong>{index + 1}</strong>
                            </td>
                            <td>
                              <CreatableSelect
                                classNamePrefix="react-select"
                                styles={serviceNameSelectStyles}
                                menuPortalTarget={selectMenuPortalTarget}
                                menuPosition="fixed"
                                value={getServiceSelectValue(
                                  transaction.serviceName,
                                )}
                                onChange={(selectedOption) =>
                                  handleTransactionServiceNameSelect(
                                    transaction.id,
                                    selectedOption,
                                  )
                                }
                                isDisabled={isViewMode}
                                isClearable
                                isSearchable
                                placeholder="Select or type service..."
                                options={serviceNameOptions}
                                formatCreateLabel={(inputValue) =>
                                  `Add Custom: ${inputValue}`
                                }
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                className="form-control modern-input form-control-sm"
                                value={transaction.description}
                                onChange={(e) =>
                                  handleTransactionChange(
                                    transaction.id,
                                    "description",
                                    e.target.value,
                                  )
                                }
                                placeholder="Description"
                                readOnly={isViewMode}
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                className="form-control modern-input form-control-sm"
                                value={transaction.price}
                                onChange={(e) => {
                                  handleNumberInput(e);
                                  handleTransactionChange(
                                    transaction.id,
                                    "price",
                                    e.target.value,
                                  );
                                }}
                                placeholder="Price"
                                readOnly={isViewMode}
                              />
                            </td>
                            <td>
                              <input
                                type="date"
                                className="form-control modern-input form-control-sm"
                                value={transaction.renewDate}
                                onChange={(e) =>
                                  handleTransactionChange(
                                    transaction.id,
                                    "renewDate",
                                    e.target.value,
                                  )
                                }
                                readOnly={isViewMode}
                              />
                            </td>
                            <td>
                              <input
                                type="date"
                                className="form-control modern-input form-control-sm"
                                value={transaction.expiryDate}
                                onChange={(e) =>
                                  handleTransactionChange(
                                    transaction.id,
                                    "expiryDate",
                                    e.target.value,
                                  )
                                }
                                readOnly={isViewMode}
                              />
                            </td>
                            <td className="align-middle">
                              <div className="form-check form-switch d-flex align-items-center justify-content-center">
                                <input
                                  className="form-check-input me-2"
                                  type="checkbox"
                                  checked={transaction.status === "Active"}
                                  onChange={(e) =>
                                    handleTransactionStatusToggle(
                                      transaction.id,
                                      e.target.checked,
                                    )
                                  }
                                  disabled={isViewMode}
                                />
                                <span
                                  className={`badge ${transaction.status === "Active" ? "bg-success" : "bg-danger"}`}
                                >
                                  {transaction.status}
                                </span>
                              </div>
                            </td>
                            <td className="text-center align-middle">
                              {!isViewMode && (
                                <button
                                  type="button"
                                  className="btn btn-danger btn-sm"
                                  onClick={() =>
                                    removeTransaction(transaction.id)
                                  }
                                  disabled={transactions.length === 1}
                                >
                                  <i className="fas fa-trash"></i>
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {!isViewMode && (
                    <button
                      type="button"
                      className="btn btn-success btn-sm mt-2"
                      onClick={addTransaction}
                    >
                      <i className="fas fa-plus me-2"></i>
                      Add Transaction
                    </button>
                  )}
                </div>
              </div>

              <div className="row mb-4">
                <div className="col-12">
                  <div className="card border-0 shadow-sm">
                    <div className="card-header bg-success rounded-top-3 text-white">
                      <h6 className="mb-0">
                        <i className="fas fa-calculator me-2"></i>
                        Summary
                      </h6>
                    </div>
                    <div className="card-body">
                      <div className="row">
                        <div className="col-md-4 mb-3">
                          <label className="form-label fw-bold">
                            Services Amount
                          </label>
                          <div className="input-group">
                            <span className="input-group-text bg-info text-white">
                              ₹
                            </span>
                            <input
                              type="text"
                              className="form-control modern-input fw-bold"
                              value={summary.totalServiceAmount}
                              readOnly
                            />
                          </div>
                        </div>
                        <div className="col-md-4 mb-3">
                          <label className="form-label fw-bold">
                            Transaction Amount
                          </label>
                          <div className="input-group">
                            <span className="input-group-text bg-success text-white">
                              ₹
                            </span>
                            <input
                              type="text"
                              className="form-control modern-input fw-bold"
                              value={summary.totalTransactionAmount}
                              readOnly
                            />
                          </div>
                        </div>
                        <div className="col-md-4 mb-3">
                          <label className="form-label fw-bold">
                            Grand Total
                          </label>
                          <div className="input-group">
                            <span className="input-group-text bg-danger text-white">
                              ₹
                            </span>
                            <input
                              type="text"
                              className="form-control modern-input fw-bold text-danger"
                              value={summary.grandTotal}
                              readOnly
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </form>
          </div>

          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
            >
              <i className="fas fa-times me-2"></i>
              {isViewMode ? "Close" : "Cancel"}
            </button>
            {!isViewMode && (
              <button
                type="submit"
                form="servicesForm"
                className="btn btn-success"
                disabled={submitting}
              >
                {submitting ? (
                  <>
                    <span
                      className="spinner-border spinner-border-sm me-2"
                      role="status"
                      aria-hidden="true"
                    ></span>
                    {editingRecord ? "Updating..." : "Saving..."}
                  </>
                ) : (
                  <>
                    <i className="fas fa-check me-2"></i>
                    {editingRecord ? "Update Service" : "Save Service"}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      <style jsx>{`
        .modal-body::-webkit-scrollbar {
          width: 8px;
        }

        .modal-body::-webkit-scrollbar-track {
          background: #f1f1f1;
        }

        .modal-body::-webkit-scrollbar-thumb {
          background: #888;
          border-radius: 4px;
        }

        .table-responsive::-webkit-scrollbar {
          height: 8px;
        }

        .table-responsive::-webkit-scrollbar-track {
          background: #f1f1f1;
        }

        .table-responsive::-webkit-scrollbar-thumb {
          background: #888;
          border-radius: 4px;
        }

        .invalid-feedback.d-block {
          display: block !important;
          margin-top: 5px;
        }
      `}</style>
    </div>
  );
};

export default CreateServices;
