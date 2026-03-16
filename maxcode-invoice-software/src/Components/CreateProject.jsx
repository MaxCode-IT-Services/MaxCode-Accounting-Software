import React, { useEffect, useMemo, useState } from "react";
import Select from "react-select";
import { showError } from "./ToastNotification";
import API_ENDPOINTS from "../utils/apiEndpoints";
import {
  fetchAllClients,
  fetchAllPaginatedEntities,
  filterActiveSelectableRows,
} from "../utils/fetchAllEntities";

const emptyPaymentRow = (id = 1) => ({
  id,
  invoiceNumber: "",
  description: "",
  paymentDate: "",
  paymentMethod: "Cash",
  amount: "",
  tax: "",
  totalAmount: "",
});

const emptyDeveloperPayoutRow = (id = 1) => ({
  id,
  staffRefId: "",
  staffName: "",
  description: "",
  payoutDate: "",
  payoutAmount: "",
  payoutMethod: "Bank Transfer",
  payoutSource: "Business Account",
});

const toNumber = (value) => {
  const number = parseFloat(value);
  return Number.isNaN(number) ? 0 : number;
};

const formatCurrency = (value) =>
  toNumber(value).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const getDateOnly = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

const findApplicableFinancialYear = (projectDate, financialYears = []) => {
  const selectedDate = getDateOnly(projectDate);
  if (!selectedDate) return null;

  const activeYears = financialYears.filter(
    (year) => year?.isDeleted !== true && year?.status !== "Inactive",
  );

  const byDateMatch = activeYears.find((year) => {
    const startDate = getDateOnly(year.startDate);
    const endDate = getDateOnly(year.endDate);
    if (!startDate || !endDate) return false;
    return selectedDate >= startDate && selectedDate <= endDate;
  });

  if (byDateMatch) return byDateMatch;

  return activeYears.find((year) => year.isDefault === true) || null;
};

const isDateWithinFinancialYear = (dateValue, financialYearRecord) => {
  const selectedDate = getDateOnly(dateValue);
  const startDate = getDateOnly(financialYearRecord?.startDate);
  const endDate = getDateOnly(financialYearRecord?.endDate);

  if (!selectedDate || !startDate || !endDate) return false;
  return selectedDate >= startDate && selectedDate <= endDate;
};

const CreateProject = ({
  show,
  onClose,
  onSubmit,
  editingRecord = null,
  clients = [],
  staffRecords = [],
  financialYears = [],
  existingProjects = [],
}) => {
  const [formData, setFormData] = useState({
    projectId: "",
    projectDate: "",
    projectName: "",
    projectDevelopmentTime: "",
    projectTotalCost: "",
    totalDeveloperCost: "",
    clientRefId: "",
    clientId: "",
    clientName: "",
    businessName: "",
    gstin: "",
    phoneNumber: "",
    email: "",
    address: "",
  });

  const [paymentDetails, setPaymentDetails] = useState([emptyPaymentRow(1)]);
  const [developerTransactions, setDeveloperTransactions] = useState([
    emptyDeveloperPayoutRow(1),
  ]);
  const [clientOptions, setClientOptions] = useState([]);
  const [staffOptions, setStaffOptions] = useState([]);
  const [years, setYears] = useState([]);
  const [invoices, setInvoices] = useState([]);
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

  const getNextProjectId = (records) => {
    const maxNumber = (records || []).reduce((max, record) => {
      const match = String(record?.projectId || "").match(/PRJ(\d+)/i);
      if (!match) return max;
      const value = parseInt(match[1], 10);
      return Number.isNaN(value) ? max : Math.max(max, value);
    }, 0);

    return `PRJ${String(maxNumber + 1).padStart(4, "0")}`;
  };

  const resetForm = () => {
    setFormData({
      projectId: getNextProjectId(existingProjects),
      projectDate: "",
      projectName: "",
      projectDevelopmentTime: "",
      projectTotalCost: "",
      totalDeveloperCost: "",
      clientRefId: "",
      clientId: "",
      clientName: "",
      businessName: "",
      gstin: "",
      phoneNumber: "",
      email: "",
      address: "",
    });
    setPaymentDetails([emptyPaymentRow(1)]);
    setDeveloperTransactions([emptyDeveloperPayoutRow(1)]);
    setErrors({});
  };

  useEffect(() => {
    if (Array.isArray(clients) && clients.length > 0) {
      setClientOptions(filterActiveSelectableRows(clients));
    }
  }, [clients]);

  useEffect(() => {
    if (Array.isArray(staffRecords) && staffRecords.length > 0) {
      setStaffOptions(
        staffRecords.filter((staff) => staff?.isDeleted !== true),
      );
    }
  }, [staffRecords]);

  useEffect(() => {
    if (Array.isArray(financialYears) && financialYears.length > 0) {
      setYears(financialYears.filter((year) => year?.isDeleted !== true));
    }
  }, [financialYears]);

  useEffect(() => {
    if (!show) return;

    const fetchMetaData = async () => {
      try {
        const [clientResponse, staffData, yearData, invoiceData] =
          await Promise.all([
            fetchAllClients(),
            fetchAllPaginatedEntities({
              endpoint: API_ENDPOINTS.STAFF.LIST,
              fallbackKeys: ["staff"],
            }),
            fetchAllPaginatedEntities({
              endpoint: API_ENDPOINTS.YEARS.LIST,
              fallbackKeys: ["years"],
            }),
            fetchAllPaginatedEntities({
              endpoint: API_ENDPOINTS.INVOICES.LIST,
              fallbackKeys: ["invoices"],
            }),
          ]);

        const clientData = Array.isArray(clientResponse) ? clientResponse : [];

        setClientOptions(filterActiveSelectableRows(clientData));
        setStaffOptions(staffData.filter((item) => item?.isDeleted !== true));
        setYears(yearData.filter((item) => item?.isDeleted !== true));
        setInvoices(invoiceData.filter((item) => item?.isDeleted !== true));
      } catch (error) {
        console.error("Failed to fetch metadata:", error);
      }
    };

    fetchMetaData();
  }, [show]);

  useEffect(() => {
    if (!show) return;

    if (editingRecord) {
      setFormData({
        projectId: editingRecord.projectId || "",
        projectDate: editingRecord.projectDate || "",
        projectName: editingRecord.projectName || "",
        projectDevelopmentTime: editingRecord.projectDevelopmentTime || "",
        projectTotalCost: String(editingRecord.projectTotalCost ?? ""),
        totalDeveloperCost: String(editingRecord.totalDeveloperCost ?? ""),
        clientRefId: editingRecord.clientRefId || "",
        clientId: editingRecord.clientId || "",
        clientName: editingRecord.clientName || "",
        businessName: editingRecord.businessName || "",
        gstin: editingRecord.gstin || "",
        phoneNumber: editingRecord.phoneNumber || "",
        email: editingRecord.email || "",
        address: editingRecord.address || "",
      });

      const mappedPayments = Array.isArray(editingRecord.paymentDetails)
        ? editingRecord.paymentDetails.map((payment, index) => ({
            id: payment.id || index + 1,
            invoiceNumber: payment.invoiceNumber || "",
            description: payment.description || "",
            paymentDate: payment.paymentDate || "",
            paymentMethod: payment.paymentMethod || "Cash",
            amount: String(payment.amount ?? ""),
            tax: String(payment.tax ?? ""),
            totalAmount: String(payment.totalAmount ?? ""),
          }))
        : [emptyPaymentRow(1)];

      const mappedPayouts = Array.isArray(editingRecord.developerTransactions)
        ? editingRecord.developerTransactions.map((transaction, index) => ({
            id: transaction.id || index + 1,
            staffRefId: transaction.staffRefId || "",
            staffName: transaction.staffName || "",
            description: transaction.description || "",
            payoutDate: transaction.payoutDate || "",
            payoutAmount: String(transaction.payoutAmount ?? ""),
            payoutMethod: transaction.payoutMethod || "Bank Transfer",
            payoutSource: transaction.payoutSource || "Business Account",
          }))
        : [emptyDeveloperPayoutRow(1)];

      setPaymentDetails(
        mappedPayments.length ? mappedPayments : [emptyPaymentRow(1)],
      );
      setDeveloperTransactions(
        mappedPayouts.length ? mappedPayouts : [emptyDeveloperPayoutRow(1)],
      );
      setErrors({});
      return;
    }

    resetForm();
  }, [editingRecord, show]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    if (name === "projectTotalCost" || name === "totalDeveloperCost") {
      const numericValue = value.replace(/[^0-9.]/g, "");
      setFormData((prev) => ({ ...prev, [name]: numericValue }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
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
        clientRefId: "",
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

  const handlePaymentChange = (id, field, value) => {
    setPaymentDetails((prev) =>
      prev.map((payment) => {
        if (payment.id !== id) return payment;

        const nextValue =
          field === "amount" || field === "tax" || field === "totalAmount"
            ? String(value).replace(/[^0-9.]/g, "")
            : value;

        const updated = {
          ...payment,
          [field]: nextValue,
        };

        const amountNumber = toNumber(
          field === "amount" ? nextValue : updated.amount,
        );
        const taxNumber = toNumber(field === "tax" ? nextValue : updated.tax);

        if (field === "amount" || field === "tax") {
          updated.totalAmount = (amountNumber + taxNumber).toFixed(2);
        }

        return updated;
      }),
    );
  };

  const addPaymentRow = () => {
    const nextId = paymentDetails.length
      ? Math.max(...paymentDetails.map((payment) => payment.id)) + 1
      : 1;

    setPaymentDetails((prev) => [...prev, emptyPaymentRow(nextId)]);
  };

  const removePaymentRow = (id) => {
    if (paymentDetails.length === 1) {
      showError("At least one payment row is required");
      return;
    }

    setPaymentDetails((prev) => prev.filter((payment) => payment.id !== id));
  };

  const handlePayoutChange = (id, field, value) => {
    setDeveloperTransactions((prev) =>
      prev.map((transaction) => {
        if (transaction.id !== id) return transaction;

        const nextValue =
          field === "payoutAmount"
            ? String(value).replace(/[^0-9.]/g, "")
            : value;

        return {
          ...transaction,
          [field]: nextValue,
        };
      }),
    );
  };

  const handleStaffSelect = (id, selectedOption) => {
    const selectedRefId = selectedOption?.value || "";

    const selectedStaff = staffOptions.find(
      (staff) => String(staff.id || staff._id || "") === String(selectedRefId),
    );

    setDeveloperTransactions((prev) =>
      prev.map((transaction) =>
        transaction.id === id
          ? {
              ...transaction,
              staffRefId: selectedRefId,
              staffName: selectedStaff?.developerName || "",
            }
          : transaction,
      ),
    );
  };

  const addDeveloperTransactionRow = () => {
    const nextId = developerTransactions.length
      ? Math.max(...developerTransactions.map((item) => item.id)) + 1
      : 1;

    setDeveloperTransactions((prev) => [
      ...prev,
      emptyDeveloperPayoutRow(nextId),
    ]);
  };

  const removeDeveloperTransactionRow = (id) => {
    if (developerTransactions.length === 1) {
      showError("At least one developer transaction row is required");
      return;
    }

    setDeveloperTransactions((prev) => prev.filter((item) => item.id !== id));
  };

  const filteredInvoices = useMemo(() => {
    if (!formData.clientRefId) return [];

    const selectedYear = findApplicableFinancialYear(
      formData.projectDate,
      years,
    );

    return invoices.filter((invoice) => {
      const invoiceClientRef = String(
        invoice.clientRefId || invoice.clientId || "",
      );
      const selectedClientRef = String(formData.clientRefId || "");
      if (!invoiceClientRef || invoiceClientRef !== selectedClientRef)
        return false;

      if (!selectedYear) return true;
      return isDateWithinFinancialYear(invoice.invoiceDate, selectedYear);
    });
  }, [formData.clientRefId, formData.projectDate, invoices, years]);

  const getInvoiceTaxAmount = (invoice) => {
    const taxData = invoice?.taxData || {};
    const cgst = toNumber(taxData.cgst || 0);
    const sgst = toNumber(taxData.sgst || 0);
    const igst = toNumber(taxData.igst || 0);
    const summedTax = cgst + sgst + igst;

    if (summedTax > 0) return summedTax;

    const subtotal = toNumber(taxData.subtotal || 0);
    const total = toNumber(taxData.totalAmount || 0);
    return Math.max(0, total - subtotal);
  };

  const handleInvoiceSelect = (id, selectedOption) => {
    const selectedInvoiceNumber = selectedOption?.value || "";
    const selectedInvoice = filteredInvoices.find(
      (invoice) =>
        String(invoice.invoiceNumber || "") === String(selectedInvoiceNumber),
    );

    if (!selectedInvoice) {
      setPaymentDetails((prev) =>
        prev.map((payment) =>
          payment.id === id
            ? {
                ...payment,
                invoiceNumber: "",
                paymentDate: "",
                paymentMethod: "Cash",
                amount: "",
                tax: "",
                totalAmount: "",
              }
            : payment,
        ),
      );
      return;
    }

    const subtotal = toNumber(selectedInvoice?.taxData?.subtotal || 0);
    const taxAmount = getInvoiceTaxAmount(selectedInvoice);
    const totalAmount = toNumber(selectedInvoice?.taxData?.totalAmount || 0);

    setPaymentDetails((prev) =>
      prev.map((payment) =>
        payment.id === id
          ? {
              ...payment,
              invoiceNumber: selectedInvoice.invoiceNumber || "",
              description:
                payment.description ||
                `Sales Invoice ${selectedInvoice.invoiceNumber || ""}`,
              paymentDate:
                selectedInvoice.paymentDate ||
                selectedInvoice.invoiceDate ||
                "",
              paymentMethod: selectedInvoice.paymentMethod || "Cash",
              amount: subtotal.toFixed(2),
              tax: taxAmount.toFixed(2),
              totalAmount:
                totalAmount > 0
                  ? totalAmount.toFixed(2)
                  : (subtotal + taxAmount).toFixed(2),
            }
          : payment,
      ),
    );
  };

  const summary = useMemo(() => {
    const applicableYear = findApplicableFinancialYear(
      formData.projectDate,
      years,
    );
    const taxPercentage = toNumber(applicableYear?.taxPercentage || 0);

    const totalProjectAmountWithoutTax = toNumber(formData.projectTotalCost);
    const totalAmountWithTax =
      totalProjectAmountWithoutTax +
      (totalProjectAmountWithoutTax * taxPercentage) / 100;

    const totalClientPayable = paymentDetails.reduce((sum, payment) => {
      const totalAmountValue = toNumber(payment.totalAmount);
      if (totalAmountValue > 0) return sum + totalAmountValue;
      return sum + toNumber(payment.amount) + toNumber(payment.tax);
    }, 0);

    const totalDeveloperPayable = developerTransactions.reduce(
      (sum, transaction) => sum + toNumber(transaction.payoutAmount),
      0,
    );

    return {
      applicableFinancialYear: applicableYear?.financialYear || "-",
      taxPercentage,
      totalProjectAmountWithoutTax,
      totalAmountWithTax,
      totalClientPayable,
      totalDeveloperPayable,
      remainingAmount: totalClientPayable - totalDeveloperPayable,
    };
  }, [
    developerTransactions,
    formData.projectDate,
    formData.projectTotalCost,
    paymentDetails,
    years,
  ]);

  useEffect(() => {
    if (!formData.clientRefId) {
      setPaymentDetails((prev) =>
        prev.map((payment) => ({
          ...payment,
          invoiceNumber: "",
        })),
      );
      return;
    }

    const validInvoiceNumbers = new Set(
      filteredInvoices.map((invoice) => String(invoice.invoiceNumber || "")),
    );

    setPaymentDetails((prev) =>
      prev.map((payment) => {
        if (!payment.invoiceNumber) return payment;
        if (validInvoiceNumbers.has(String(payment.invoiceNumber)))
          return payment;

        return {
          ...payment,
          invoiceNumber: "",
          paymentDate: "",
          paymentMethod: "Cash",
          amount: "",
          tax: "",
          totalAmount: "",
        };
      }),
    );
  }, [filteredInvoices, formData.clientRefId]);

  const validateForm = () => {
    const newErrors = {};

    if (!formData.projectId.trim())
      newErrors.projectId = "Project ID is required";
    if (!formData.projectDate.trim())
      newErrors.projectDate = "Project Date is required";
    if (!formData.projectName.trim())
      newErrors.projectName = "Project Name is required";
    if (!formData.projectDevelopmentTime.trim())
      newErrors.projectDevelopmentTime = "Project Development Time is required";
    if (!formData.projectTotalCost.toString().trim())
      newErrors.projectTotalCost = "Project Total Cost is required";
    if (!formData.totalDeveloperCost.toString().trim())
      newErrors.totalDeveloperCost = "Total Developer Cost is required";
    if (!formData.clientRefId.toString().trim())
      newErrors.clientRefId = "Select Client is required";

    const defaultFinancialYear =
      years.find(
        (year) =>
          year?.isDeleted !== true &&
          year?.isDefault === true &&
          year?.status !== "Inactive",
      ) || null;

    if (!defaultFinancialYear?.startDate || !defaultFinancialYear?.endDate) {
      newErrors.projectDate =
        "Default financial year is not configured. Please set default financial year first";
    } else if (
      !isDateWithinFinancialYear(formData.projectDate, defaultFinancialYear)
    ) {
      newErrors.projectDate = `Project Date must be between ${defaultFinancialYear.startDate} and ${defaultFinancialYear.endDate} (Default Financial Year: ${defaultFinancialYear.financialYear})`;
    }

    const hasValidPayment = paymentDetails.some(
      (payment) =>
        payment.invoiceNumber?.trim() &&
        payment.paymentDate?.trim() &&
        payment.amount?.toString().trim(),
    );

    if (!hasValidPayment) {
      newErrors.paymentDetails =
        "At least one payment detail row with invoice number, date and amount is required";
      showError("Please add at least one complete payment row");
    }

    const hasValidDeveloperTxn = developerTransactions.some(
      (transaction) =>
        transaction.staffName?.trim() &&
        transaction.payoutDate?.trim() &&
        transaction.payoutAmount?.toString().trim(),
    );

    if (!hasValidDeveloperTxn) {
      newErrors.developerTransactions =
        "At least one developer payout row with staff name, payout date and amount is required";
      showError("Please add at least one complete developer transaction row");
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    if (formData.phoneNumber && !/^\d{10}$/.test(formData.phoneNumber)) {
      newErrors.phoneNumber = "Phone number must be exactly 10 digits";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!validateForm()) return;

    setSubmitting(true);
    try {
      const submitData = {
        ...formData,
        financialYear:
          summary.applicableFinancialYear || formData.financialYear || "",
        projectTotalCost: toNumber(formData.projectTotalCost),
        totalDeveloperCost: toNumber(formData.totalDeveloperCost),
        paymentDetails: paymentDetails.map((payment) => ({
          ...payment,
          amount: toNumber(payment.amount),
          tax: toNumber(payment.tax),
          totalAmount:
            toNumber(payment.totalAmount) ||
            toNumber(payment.amount) + toNumber(payment.tax),
        })),
        developerTransactions: developerTransactions.map((transaction) => ({
          ...transaction,
          payoutAmount: toNumber(transaction.payoutAmount),
        })),
        summary,
        id: editingRecord?.id || Date.now(),
        createdDate: editingRecord?.createdDate || new Date().toISOString(),
      };

      await onSubmit(submitData);
    } finally {
      setSubmitting(false);
    }
  };

  if (!show) return null;

  const isViewMode = editingRecord?.isViewMode;

  const modalTitle = editingRecord
    ? editingRecord.isViewMode
      ? `View Project - ${editingRecord.projectId}`
      : `Edit Project - ${editingRecord.projectId}`
    : "Add New Project";

  const selectMenuPortalTarget =
    typeof document !== "undefined" ? document.body : null;

  const selectedClientOption = clientOptions
    .map((client) => ({
      value: client.id || client._id || client.clientId,
      label: `${client.clientName || ""} - ${client.businessName || ""}`,
    }))
    .find((option) => String(option.value) === String(formData.clientRefId));

  const getUnifiedSelectStyles = ({
    hasError = false,
    minHeight = "38px",
  } = {}) => ({
    control: (base, state) => ({
      ...base,
      minHeight,
      border: hasError
        ? "2px solid #dc3545"
        : state.isFocused
          ? "2px solid #667eea"
          : "2px solid #e9ecef",
      borderColor: state.isHovered && !hasError ? "#d6dbe1" : undefined,
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
  });

  const clientSelectStyles = getUnifiedSelectStyles({
    hasError: Boolean(errors.clientRefId),
    minHeight: "38px",
  });

  const compactSelectStyles = getUnifiedSelectStyles({
    minHeight: "31px",
  });

  const paymentMethodOptions = [
    "Cash",
    "UPI",
    "Bank Transfer",
    "Cheque",
    "Card",
    "Other",
  ];

  const payoutMethodOptions = [
    "Cash",
    "UPI",
    "Bank Transfer",
    "Cheque",
    "Other",
  ];

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
            style={{ maxHeight: "78vh", overflowY: "auto" }}
          >
            <form id="projectForm" onSubmit={handleSubmit} noValidate>
              <div className="row mb-4">
                <div className="col-12">
                  <h6 className="border-bottom pb-2 mb-3">
                    <i className="fas fa-info-circle me-2 text-primary"></i>
                    Project Basic Information
                  </h6>
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="projectId" className="form-label">
                    Project ID <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.projectId ? "is-invalid" : ""}`}
                    id="projectId"
                    name="projectId"
                    value={formData.projectId}
                    onChange={handleInputChange}
                    readOnly={isViewMode || !editingRecord}
                  />
                  {errors.projectId && (
                    <div className="invalid-feedback d-block">
                      {errors.projectId}
                    </div>
                  )}
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="projectDate" className="form-label">
                    Project Date <span className="text-danger">*</span>
                  </label>
                  <input
                    type="date"
                    className={`form-control modern-input ${errors.projectDate ? "is-invalid" : ""}`}
                    id="projectDate"
                    name="projectDate"
                    value={formData.projectDate}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                  />
                  {errors.projectDate && (
                    <div className="invalid-feedback d-block">
                      {errors.projectDate}
                    </div>
                  )}
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="projectName" className="form-label">
                    Project Name <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.projectName ? "is-invalid" : ""}`}
                    id="projectName"
                    name="projectName"
                    value={formData.projectName}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                    placeholder="Enter project name"
                  />
                  {errors.projectName && (
                    <div className="invalid-feedback d-block">
                      {errors.projectName}
                    </div>
                  )}
                </div>

                <div className="col-md-4 mb-3">
                  <label
                    htmlFor="projectDevelopmentTime"
                    className="form-label"
                  >
                    Project Development Time{" "}
                    <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.projectDevelopmentTime ? "is-invalid" : ""}`}
                    id="projectDevelopmentTime"
                    name="projectDevelopmentTime"
                    value={formData.projectDevelopmentTime}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                    placeholder="e.g. 3 Months"
                  />
                  {errors.projectDevelopmentTime && (
                    <div className="invalid-feedback d-block">
                      {errors.projectDevelopmentTime}
                    </div>
                  )}
                </div>

                <div className="col-md-2 mb-3">
                  <label htmlFor="projectTotalCost" className="form-label">
                    Project Total Cost <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.projectTotalCost ? "is-invalid" : ""}`}
                    id="projectTotalCost"
                    name="projectTotalCost"
                    value={formData.projectTotalCost}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                    placeholder="Enter total project cost"
                  />
                  {errors.projectTotalCost && (
                    <div className="invalid-feedback d-block">
                      {errors.projectTotalCost}
                    </div>
                  )}
                </div>

                <div className="col-md-2 mb-3">
                  <label htmlFor="totalDeveloperCost" className="form-label">
                    Total Developer Cost <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.totalDeveloperCost ? "is-invalid" : ""}`}
                    id="totalDeveloperCost"
                    name="totalDeveloperCost"
                    value={formData.totalDeveloperCost}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                    placeholder="Enter total developer cost"
                  />
                  {errors.totalDeveloperCost && (
                    <div className="invalid-feedback d-block">
                      {errors.totalDeveloperCost}
                    </div>
                  )}
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="clientRefId" className="form-label">
                    Select Client <span className="text-danger">*</span>
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
                  <label className="form-label">Client ID</label>
                  <input
                    type="text"
                    className="form-control modern-input"
                    value={formData.clientId}
                    readOnly
                    style={{ backgroundColor: "#e9ecef" }}
                  />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label">Business Name</label>
                  <input
                    type="text"
                    className="form-control modern-input"
                    value={formData.businessName}
                    readOnly
                    style={{ backgroundColor: "#e9ecef" }}
                  />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label">GSTIN</label>
                  <input
                    type="text"
                    className="form-control modern-input"
                    value={formData.gstin}
                    readOnly
                    style={{ backgroundColor: "#e9ecef" }}
                  />
                </div>
                <div className="col-md-4 mb-3">
                  <label className="form-label">Phone Number</label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.phoneNumber ? "is-invalid" : ""}`}
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
                  <label className="form-label">Email Address</label>
                  <input
                    type="email"
                    className={`form-control modern-input ${errors.email ? "is-invalid" : ""}`}
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
                  <label className="form-label">Address</label>
                  <input
                    type="text"
                    className="form-control modern-input"
                    value={formData.address}
                    readOnly
                    style={{ backgroundColor: "#e9ecef" }}
                  />
                </div>
              </div>

              <div className="row mb-4">
                <div className="col-12">
                  <h6 className="border-bottom pb-2 mb-3">
                    <i className="fas fa-money-check-dollar me-2 text-info"></i>
                    Payment Details
                  </h6>
                  {errors.paymentDetails && (
                    <div className="alert alert-danger">
                      {errors.paymentDetails}
                    </div>
                  )}
                </div>

                <div className="col-12">
                  <div className="table-responsive">
                    <table className="table table-bordered table-hover">
                      <thead className="table-primary">
                        <tr>
                          <th style={{ width: "50px" }}>S.N</th>
                          <th style={{ width: "210px" }}>Invoice Number</th>
                          <th style={{ width: "240px" }}>Description</th>
                          <th style={{ width: "120px" }}>Payment Date</th>
                          <th style={{ width: "120px" }}>Payment Method</th>
                          <th style={{ width: "110px" }}>Amount (₹)</th>
                          <th style={{ width: "100px" }}>Tax (₹)</th>
                          <th style={{ width: "110px" }}>Total Amount (₹)</th>
                          <th style={{ width: "40px" }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paymentDetails.map((payment, index) => (
                          <tr key={payment.id}>
                            <td className="text-center align-middle">
                              <strong>{index + 1}</strong>
                            </td>
                            <td>
                              <Select
                                classNamePrefix="react-select"
                                styles={compactSelectStyles}
                                menuPortalTarget={selectMenuPortalTarget}
                                menuPosition="fixed"
                                value={
                                  payment.invoiceNumber
                                    ? {
                                        value: payment.invoiceNumber,
                                        label: payment.invoiceNumber,
                                      }
                                    : null
                                }
                                onChange={(selectedOption) =>
                                  handleInvoiceSelect(
                                    payment.id,
                                    selectedOption,
                                  )
                                }
                                isDisabled={isViewMode || !formData.clientRefId}
                                isClearable
                                isSearchable
                                placeholder={
                                  formData.clientRefId
                                    ? "Select invoice number"
                                    : "Select client first"
                                }
                                options={filteredInvoices.map((invoice) => ({
                                  value: invoice.invoiceNumber || "",
                                  label: `${invoice.invoiceNumber || ""} (${invoice.invoiceDate || ""})`,
                                }))}
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                className="form-control modern-input form-control-sm"
                                value={payment.description}
                                onChange={(e) =>
                                  handlePaymentChange(
                                    payment.id,
                                    "description",
                                    e.target.value,
                                  )
                                }
                                readOnly={isViewMode}
                                placeholder="Description"
                              />
                            </td>
                            <td>
                              <input
                                type="date"
                                className="form-control modern-input form-control-sm"
                                value={payment.paymentDate}
                                onChange={(e) =>
                                  handlePaymentChange(
                                    payment.id,
                                    "paymentDate",
                                    e.target.value,
                                  )
                                }
                                readOnly={isViewMode}
                              />
                            </td>
                            <td>
                              <select
                                className="form-select form-select-sm modern-input"
                                value={payment.paymentMethod}
                                onChange={(e) =>
                                  handlePaymentChange(
                                    payment.id,
                                    "paymentMethod",
                                    e.target.value,
                                  )
                                }
                                disabled={isViewMode}
                              >
                                {paymentMethodOptions.map((option) => (
                                  <option key={option} value={option}>
                                    {option}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td>
                              <input
                                type="text"
                                className="form-control modern-input form-control-sm"
                                value={payment.amount}
                                onChange={(e) =>
                                  handlePaymentChange(
                                    payment.id,
                                    "amount",
                                    e.target.value,
                                  )
                                }
                                readOnly={isViewMode}
                                placeholder="0.00"
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                className="form-control modern-input form-control-sm"
                                value={payment.tax}
                                onChange={(e) =>
                                  handlePaymentChange(
                                    payment.id,
                                    "tax",
                                    e.target.value,
                                  )
                                }
                                readOnly={isViewMode}
                                placeholder="0.00"
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                className="form-control modern-input form-control-sm"
                                value={payment.totalAmount}
                                onChange={(e) =>
                                  handlePaymentChange(
                                    payment.id,
                                    "totalAmount",
                                    e.target.value,
                                  )
                                }
                                readOnly={isViewMode}
                                placeholder="0.00"
                              />
                            </td>
                            <td className="text-center align-middle">
                              {!isViewMode && (
                                <button
                                  type="button"
                                  className="btn btn-danger btn-sm"
                                  onClick={() => removePaymentRow(payment.id)}
                                  disabled={paymentDetails.length === 1}
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
                      onClick={addPaymentRow}
                    >
                      <i className="fas fa-plus me-2"></i>
                      Add Payment
                    </button>
                  )}
                </div>
              </div>

              <div className="row mb-4">
                <div className="col-12">
                  <h6 className="border-bottom pb-2 mb-3">
                    <i className="fas fa-user-tie me-2 text-warning"></i>
                    Add Transaction (Developer Payout)
                  </h6>
                  {errors.developerTransactions && (
                    <div className="alert alert-danger">
                      {errors.developerTransactions}
                    </div>
                  )}
                </div>

                <div className="col-12">
                  <div className="table-responsive">
                    <table className="table table-bordered table-hover">
                      <thead className="table-success">
                        <tr>
                          <th style={{ width: "50px" }}>S.N</th>
                          <th style={{ width: "220px" }}>Staff Name</th>
                          <th style={{ width: "250px" }}>Description</th>
                          <th style={{ width: "140px" }}>Payout Date</th>
                          <th style={{ width: "140px" }}>Payout Amount (₹)</th>
                          <th style={{ width: "170px" }}>Payout Method</th>
                          <th style={{ width: "170px" }}>Payment Source</th>
                          <th style={{ width: "80px" }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {developerTransactions.map((transaction, index) => {
                          const selectedStaffOption = transaction.staffRefId
                            ? {
                                value: transaction.staffRefId,
                                label: transaction.staffName,
                              }
                            : null;

                          return (
                            <tr key={transaction.id}>
                              <td className="text-center align-middle">
                                <strong>{index + 1}</strong>
                              </td>
                              <td>
                                <Select
                                  classNamePrefix="react-select"
                                  styles={compactSelectStyles}
                                  menuPortalTarget={selectMenuPortalTarget}
                                  menuPosition="fixed"
                                  value={selectedStaffOption}
                                  onChange={(selectedOption) =>
                                    handleStaffSelect(
                                      transaction.id,
                                      selectedOption,
                                    )
                                  }
                                  isDisabled={isViewMode}
                                  isClearable
                                  isSearchable
                                  placeholder="Select staff"
                                  options={staffOptions.map((staff) => ({
                                    value: staff.id || staff._id,
                                    label: `${staff.developerName || ""} (${staff.phoneNumber || ""})`,
                                  }))}
                                />
                              </td>
                              <td>
                                <input
                                  type="text"
                                  className="form-control modern-input form-control-sm"
                                  value={transaction.description}
                                  onChange={(e) =>
                                    handlePayoutChange(
                                      transaction.id,
                                      "description",
                                      e.target.value,
                                    )
                                  }
                                  readOnly={isViewMode}
                                  placeholder="Description"
                                />
                              </td>
                              <td>
                                <input
                                  type="date"
                                  className="form-control modern-input form-control-sm"
                                  value={transaction.payoutDate}
                                  onChange={(e) =>
                                    handlePayoutChange(
                                      transaction.id,
                                      "payoutDate",
                                      e.target.value,
                                    )
                                  }
                                  readOnly={isViewMode}
                                />
                              </td>
                              <td>
                                <input
                                  type="text"
                                  className="form-control modern-input form-control-sm"
                                  value={transaction.payoutAmount}
                                  onChange={(e) =>
                                    handlePayoutChange(
                                      transaction.id,
                                      "payoutAmount",
                                      e.target.value,
                                    )
                                  }
                                  readOnly={isViewMode}
                                  placeholder="0.00"
                                />
                              </td>
                              <td>
                                <select
                                  className="form-select form-select-sm modern-input"
                                  value={transaction.payoutMethod}
                                  onChange={(e) =>
                                    handlePayoutChange(
                                      transaction.id,
                                      "payoutMethod",
                                      e.target.value,
                                    )
                                  }
                                  disabled={isViewMode}
                                >
                                  {payoutMethodOptions.map((option) => (
                                    <option key={option} value={option}>
                                      {option}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <select
                                  className="form-select form-select-sm modern-input"
                                  value={
                                    transaction.payoutSource ||
                                    "Business Account"
                                  }
                                  onChange={(e) =>
                                    handlePayoutChange(
                                      transaction.id,
                                      "payoutSource",
                                      e.target.value,
                                    )
                                  }
                                  disabled={isViewMode}
                                >
                                  <option value="Business Account">
                                    🏦 Business Account
                                  </option>
                                  <option value="Owner Personal Account">
                                    👤 Owner Personal Account
                                  </option>
                                </select>
                              </td>
                              <td className="text-center align-middle">
                                {!isViewMode && (
                                  <button
                                    type="button"
                                    className="btn btn-danger btn-sm"
                                    onClick={() =>
                                      removeDeveloperTransactionRow(
                                        transaction.id,
                                      )
                                    }
                                    disabled={
                                      developerTransactions.length === 1
                                    }
                                  >
                                    <i className="fas fa-trash"></i>
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {!isViewMode && (
                    <button
                      type="button"
                      className="btn btn-success btn-sm mt-2"
                      onClick={addDeveloperTransactionRow}
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
                            Total Project Account Without Tax
                          </label>
                          <div className="input-group">
                            <span className="input-group-text bg-info text-white">
                              ₹
                            </span>
                            <input
                              type="text"
                              className="form-control modern-input fw-bold"
                              value={formatCurrency(
                                summary.totalProjectAmountWithoutTax,
                              )}
                              readOnly
                            />
                          </div>
                        </div>

                        <div className="col-md-4 mb-3">
                          <label className="form-label fw-bold">
                            Total Amount with Tax ({summary.taxPercentage}%)
                          </label>
                          <div className="input-group">
                            <span className="input-group-text bg-primary text-white">
                              ₹
                            </span>
                            <input
                              type="text"
                              className="form-control modern-input fw-bold"
                              value={formatCurrency(summary.totalAmountWithTax)}
                              readOnly
                            />
                          </div>
                          <small className="text-muted">
                            FY: {summary.applicableFinancialYear}
                          </small>
                        </div>

                        <div className="col-md-4 mb-3">
                          <label className="form-label fw-bold">
                            Total Client Payable
                          </label>
                          <div className="input-group">
                            <span className="input-group-text bg-success text-white">
                              ₹
                            </span>
                            <input
                              type="text"
                              className="form-control modern-input fw-bold"
                              value={formatCurrency(summary.totalClientPayable)}
                              readOnly
                            />
                          </div>
                        </div>

                        <div className="col-md-4 mb-3">
                          <label className="form-label fw-bold">
                            Total Developer Payable
                          </label>
                          <div className="input-group">
                            <span className="input-group-text bg-warning text-white">
                              ₹
                            </span>
                            <input
                              type="text"
                              className="form-control modern-input fw-bold"
                              value={formatCurrency(
                                summary.totalDeveloperPayable,
                              )}
                              readOnly
                            />
                          </div>
                        </div>

                        <div className="col-md-4 mb-3">
                          <label className="form-label fw-bold">
                            Remaining Amount
                          </label>
                          <div className="input-group">
                            <span className="input-group-text bg-danger text-white">
                              ₹
                            </span>
                            <input
                              type="text"
                              className={`form-control modern-input fw-bold ${summary.remainingAmount < 0 ? "text-danger" : "text-success"}`}
                              value={formatCurrency(summary.remainingAmount)}
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
                form="projectForm"
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
                    {editingRecord ? "Update Project" : "Save Project"}
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
      `}</style>
    </div>
  );
};

export default CreateProject;
