import React, { useEffect, useRef, useState } from "react";
import { showSuccess, showError } from "./ToastNotification";
import { apiPost, apiPut } from "../utils/api";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { loadCarryForwardDefaults } from "../utils/financialYearCarryForward";

const CreateYear = ({
  show,
  onClose,
  onSubmit,
  editingRecord = null,
  existingYears = [],
  initialData = {},
}) => {
  const [formData, setFormData] = useState({
    financialYear: "",
    startDate: "",
    endDate: "",
    taxPercentage: 18,
    invoiceFormat: "",
    selfInvoiceFormat: "",
    performaInvoiceFormat: "",
    creditNoteFormat: "",
    debitNoteFormat: "",
    qutationFormat: "",
    serviceFormat: "",
    projectFormat: "",
    companyExpenseFormat: "",
    description: "",
    isDefault: false,
    status: "Active",
    openingCash: "",
    openingBank: "",
    openingCgstItc: "",
    openingSgstItc: "",
    openingIgstItc: "",
    paymentReceiptFormat: "",
  });

  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [isCarryForwardLoading, setIsCarryForwardLoading] = useState(false);
  const [carryForwardSourceYear, setCarryForwardSourceYear] = useState("");
  const carryForwardRequestRef = useRef(0);

  const getInvoiceYearPart = (financialYear) => {
    if (!financialYear || !/^\d{4}-\d{2}$/.test(financialYear)) return "";
    const [startYear, endYear] = financialYear.split("-");
    return `${startYear.slice(-2)}-${endYear}`;
  };

  const getFinancialYearDates = (financialYear) => {
    const value = String(financialYear || "").trim();
    if (!/^\d{4}-\d{2}$/.test(value)) return null;

    const [startYear, endYearShort] = value.split("-");
    const expectedEndYearShort = String(Number(startYear) + 1).slice(-2);
    if (endYearShort !== expectedEndYearShort) return null;

    return {
      startDate: `${startYear}-04-01`,
      endDate: `${Number(startYear) + 1}-03-31`,
    };
  };

  const isAutoInvoiceFormat = (value) => /^MC\/\d{2}-\d{2}\/0001$/.test(value);
  const isAutoSelfInvoiceFormat = (value) =>
    /^MCR\/\d{2}-\d{2}\/0001$/.test(value);
  const isAutoPerformaInvoiceFormat = (value) =>
    /^MC\/PI\/\d{2}-\d{2}\/0001$/.test(value);
  const isAutoCreditNoteFormat = (value) =>
    /^MC\/CN\/\d{2}-\d{2}\/0001$/.test(value);
  const isAutoDebitNoteFormat = (value) =>
    /^MC\/DN\/\d{2}-\d{2}\/0001$/.test(value);
  const isAutoQutationFormat = (value) =>
    /^MC\/QTN\/\d{2}-\d{2}\/0001$/.test(value);
  const isAutoServiceFormat = (value) =>
    /^MC\/SRV\/\d{2}-\d{2}\/0001$/.test(value);
  const isAutoProjectFormat = (value) =>
    /^MC\/PRJ\/\d{2}-\d{2}\/0001$/.test(value);
  const isAutoCompanyExpenseFormat = (value) =>
    /^MC\/CEXP\/\d{2}-\d{2}\/0001$/.test(value);
  const isAutoPaymentReceiptFormat = (value) =>
    /^MC\/RCPT\/\d{2}-\d{2}\/0001$/.test(value);

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

  // Initialize form with editing record data or empty form for new year
  useEffect(() => {
    if (editingRecord) {
      setFormData({
        financialYear: editingRecord.financialYear || "",
        startDate: editingRecord.startDate || "",
        endDate: editingRecord.endDate || "",
        taxPercentage: editingRecord.taxPercentage || 18,
        invoiceFormat: editingRecord.invoiceFormat || "",
        selfInvoiceFormat: editingRecord.selfInvoiceFormat || "",
        performaInvoiceFormat: editingRecord.performaInvoiceFormat || "",
        creditNoteFormat: editingRecord.creditNoteFormat || "",
        debitNoteFormat: editingRecord.debitNoteFormat || "",
        qutationFormat: editingRecord.qutationFormat || "",
        serviceFormat: editingRecord.serviceFormat || "",
        projectFormat: editingRecord.projectFormat || "",
        companyExpenseFormat: editingRecord.companyExpenseFormat || "",
        paymentReceiptFormat: editingRecord.paymentReceiptFormat || "",
        description: editingRecord.description || "",
        isDefault: editingRecord.isDefault || false,
        status: editingRecord.status || "Active",
        openingCash: editingRecord.openingCash || "",
        openingBank: editingRecord.openingBank || "",
        openingCgstItc:
          editingRecord.openingCgstItc || editingRecord.openingItcCgst || "",
        openingSgstItc:
          editingRecord.openingSgstItc || editingRecord.openingItcSgst || "",
        openingIgstItc:
          editingRecord.openingIgstItc || editingRecord.openingItcIgst || "",
      });
      setCarryForwardSourceYear("");
      setIsCarryForwardLoading(false);
    } else {
      setFormData({
        financialYear: "",
        startDate: "",
        endDate: "",
        taxPercentage: 18,
        invoiceFormat: "",
        selfInvoiceFormat: "",
        performaInvoiceFormat: "",
        creditNoteFormat: "",
        debitNoteFormat: "",
        qutationFormat: "",
        serviceFormat: "",
        projectFormat: "",
        companyExpenseFormat: "",
        paymentReceiptFormat: "",
        description: "",
        isDefault: false,
        status: "Active",
        openingCash: "",
        openingBank: "",
        openingCgstItc: "",
        openingSgstItc: "",
        openingIgstItc: "",
      });
      setErrors({});
      setCarryForwardSourceYear("");
      setIsCarryForwardLoading(false);
      if (initialData && typeof initialData === "object") {
        setFormData((prev) => ({ ...prev, ...initialData }));
      }
    }
  }, [editingRecord, show]);

  // Load carry forward data only when financial year changes and not in editing mode
  useEffect(() => {
    // Reset carry forward when in editing mode
    if (editingRecord) {
      setCarryForwardSourceYear("");
      setIsCarryForwardLoading(false);
      return;
    }

    const normalizedFinancialYear = String(formData.financialYear || "").trim();

    // Only proceed if financial year is valid
    if (!/^\d{4}-\d{2}$/.test(normalizedFinancialYear)) {
      setCarryForwardSourceYear("");
      setIsCarryForwardLoading(false);
      return;
    }

    const requestId = carryForwardRequestRef.current + 1;
    carryForwardRequestRef.current = requestId;

    const loadDefaults = async () => {
      setIsCarryForwardLoading(true);
      try {
        const carryForward = await loadCarryForwardDefaults({
          financialYearValue: normalizedFinancialYear,
          forceRefresh: true,
        });

        if (carryForwardRequestRef.current !== requestId) return;

        setCarryForwardSourceYear(carryForward.sourceFinancialYear || "");

        // Only update if there are values from carry forward
        if (carryForward.sourceFinancialYear) {
          setFormData((prev) => ({
            ...prev,
            openingCash:
              carryForward.openingCash !== ""
                ? carryForward.openingCash
                : prev.openingCash,
            openingBank:
              carryForward.openingBank !== ""
                ? carryForward.openingBank
                : prev.openingBank,
            openingCgstItc:
              carryForward.openingCgstItc !== ""
                ? carryForward.openingCgstItc
                : prev.openingCgstItc,
            openingSgstItc:
              carryForward.openingSgstItc !== ""
                ? carryForward.openingSgstItc
                : prev.openingSgstItc,
            openingIgstItc:
              carryForward.openingIgstItc !== ""
                ? carryForward.openingIgstItc
                : prev.openingIgstItc,
          }));
        }
      } catch (error) {
        if (carryForwardRequestRef.current === requestId) {
          console.error("Failed to load carry-forward defaults:", error);
        }
      } finally {
        if (carryForwardRequestRef.current === requestId) {
          setIsCarryForwardLoading(false);
        }
      }
    };

    loadDefaults();
  }, [editingRecord, formData.financialYear]);

  // Auto-fill invoice formats from financial year for new records
  useEffect(() => {
    if (editingRecord || !formData.financialYear) return;

    const yearPart = getInvoiceYearPart(formData.financialYear);
    if (!yearPart) return;

    const nextInvoiceFormat = `MC/${yearPart}/0001`;
    const nextSelfInvoiceFormat = `MCR/${yearPart}/0001`;
    const nextPerformaInvoiceFormat = `MC/PI/${yearPart}/0001`;
    const nextCreditNoteFormat = `MC/CN/${yearPart}/0001`;
    const nextDebitNoteFormat = `MC/DN/${yearPart}/0001`;
    const nextQutationFormat = `MC/QTN/${yearPart}/0001`;
    const nextServiceFormat = `MC/SRV/${yearPart}/0001`;
    const nextProjectFormat = `MC/PRJ/${yearPart}/0001`;
    const nextCompanyExpenseFormat = `MC/CEXP/${yearPart}/0001`;
    const nextPaymentReceiptFormat = `MC/RCPT/${yearPart}/0001`;

    const shouldUpdateInvoiceFormat =
      !formData.invoiceFormat || isAutoInvoiceFormat(formData.invoiceFormat);
    const shouldUpdateSelfInvoiceFormat =
      !formData.selfInvoiceFormat ||
      isAutoSelfInvoiceFormat(formData.selfInvoiceFormat);
    const shouldUpdatePerformaInvoiceFormat =
      !formData.performaInvoiceFormat ||
      isAutoPerformaInvoiceFormat(formData.performaInvoiceFormat);
    const shouldUpdateCreditNoteFormat =
      !formData.creditNoteFormat ||
      isAutoCreditNoteFormat(formData.creditNoteFormat);
    const shouldUpdateDebitNoteFormat =
      !formData.debitNoteFormat ||
      isAutoDebitNoteFormat(formData.debitNoteFormat);
    const shouldUpdateQutationFormat =
      !formData.qutationFormat || isAutoQutationFormat(formData.qutationFormat);
    const shouldUpdateServiceFormat =
      !formData.serviceFormat || isAutoServiceFormat(formData.serviceFormat);
    const shouldUpdateProjectFormat =
      !formData.projectFormat || isAutoProjectFormat(formData.projectFormat);
    const shouldUpdateCompanyExpenseFormat =
      !formData.companyExpenseFormat ||
      isAutoCompanyExpenseFormat(formData.companyExpenseFormat);
    const shouldUpdatePaymentReceiptFormat =
      !formData.paymentReceiptFormat ||
      isAutoPaymentReceiptFormat(formData.paymentReceiptFormat);

    if (
      !shouldUpdateInvoiceFormat &&
      !shouldUpdateSelfInvoiceFormat &&
      !shouldUpdatePerformaInvoiceFormat &&
      !shouldUpdateCreditNoteFormat &&
      !shouldUpdateDebitNoteFormat &&
      !shouldUpdateQutationFormat &&
      !shouldUpdateServiceFormat &&
      !shouldUpdateProjectFormat &&
      !shouldUpdateCompanyExpenseFormat &&
      !shouldUpdatePaymentReceiptFormat
    )
      return;

    setFormData((prev) => ({
      ...prev,
      invoiceFormat: shouldUpdateInvoiceFormat
        ? nextInvoiceFormat
        : prev.invoiceFormat,
      selfInvoiceFormat: shouldUpdateSelfInvoiceFormat
        ? nextSelfInvoiceFormat
        : prev.selfInvoiceFormat,
      performaInvoiceFormat: shouldUpdatePerformaInvoiceFormat
        ? nextPerformaInvoiceFormat
        : prev.performaInvoiceFormat,
      creditNoteFormat: shouldUpdateCreditNoteFormat
        ? nextCreditNoteFormat
        : prev.creditNoteFormat,
      debitNoteFormat: shouldUpdateDebitNoteFormat
        ? nextDebitNoteFormat
        : prev.debitNoteFormat,
      qutationFormat: shouldUpdateQutationFormat
        ? nextQutationFormat
        : prev.qutationFormat,
      serviceFormat: shouldUpdateServiceFormat
        ? nextServiceFormat
        : prev.serviceFormat,
      projectFormat: shouldUpdateProjectFormat
        ? nextProjectFormat
        : prev.projectFormat,
      companyExpenseFormat: shouldUpdateCompanyExpenseFormat
        ? nextCompanyExpenseFormat
        : prev.companyExpenseFormat,
      paymentReceiptFormat: shouldUpdatePaymentReceiptFormat
        ? nextPaymentReceiptFormat
        : prev.paymentReceiptFormat,
    }));
  }, [
    formData.financialYear,
    formData.invoiceFormat,
    formData.selfInvoiceFormat,
    formData.performaInvoiceFormat,
    formData.creditNoteFormat,
    formData.debitNoteFormat,
    formData.qutationFormat,
    formData.serviceFormat,
    formData.projectFormat,
    formData.companyExpenseFormat,
    formData.paymentReceiptFormat,
    editingRecord,
  ]);

  // Auto-set end date based on start date (March 31 of next year)
  useEffect(() => {
    if (formData.startDate && !formData.endDate && !editingRecord) {
      const startDate = new Date(formData.startDate);
      const endYear = startDate.getFullYear() + 1;
      setFormData((prev) => ({
        ...prev,
        endDate: `${endYear}-03-31`,
      }));
    }
  }, [formData.startDate, formData.endDate, editingRecord]);

  // Field names mapping for display
  const fieldNames = {
    financialYear: "Financial Year",
    startDate: "Start Date",
    endDate: "End Date",
    taxPercentage: "Tax Percentage",
    invoiceFormat: "Invoice Format",
    selfInvoiceFormat: "Self Invoice Format",
    performaInvoiceFormat: "Performa Invoice Format",
    creditNoteFormat: "Credit Note Format",
    debitNoteFormat: "Debit Note Format",
    qutationFormat: "Qutation Format",
    serviceFormat: "Service Number Format",
    projectFormat: "Project Number Format",
    companyExpenseFormat: "Company Expense Number Format",
    paymentReceiptFormat: "Payment Receipt Format",
    description: "Description",
    status: "Status",
    openingCash: "Opening Cash Balance",
    openingBank: "Opening Bank Balance",
    openingCgstItc: "Opening CGST ITC",
    openingSgstItc: "Opening SGST ITC",
    openingIgstItc: "Opening IGST ITC",
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;

    if (type === "checkbox") {
      setFormData((prev) => ({
        ...prev,
        [name]: checked,
      }));
    } else if (name === "taxPercentage") {
      const numericValue = value.replace(/[^0-9.]/g, "");
      setFormData((prev) => ({
        ...prev,
        [name]: numericValue === "" ? "" : parseFloat(numericValue) || 0,
      }));
    } else if (
      [
        "openingCash",
        "openingBank",
        "openingCgstItc",
        "openingSgstItc",
        "openingIgstItc",
      ].includes(name)
    ) {
      const numericValue = value.replace(/[^0-9.]/g, "");
      setFormData((prev) => ({
        ...prev,
        [name]: numericValue === "" ? "" : numericValue,
      }));
    } else if (name === "financialYear") {
      const normalizedFinancialYear = String(value || "")
        .replace(/[^0-9-]/g, "")
        .slice(0, 7);

      const fyDates = getFinancialYearDates(normalizedFinancialYear);

      setFormData((prev) => ({
        ...prev,
        [name]: normalizedFinancialYear,
        ...(fyDates ? fyDates : {}),
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: value,
      }));
    }

    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: "",
      }));
    }
  };

  const scrollToField = (fieldId) => {
    const fieldElement = document.getElementById(fieldId);
    if (fieldElement) {
      fieldElement.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
      fieldElement.focus();
    }
  };

  const validateForm = () => {
    const newErrors = {};

    const requiredFields = [
      "financialYear",
      "startDate",
      "endDate",
      "taxPercentage",
      "invoiceFormat",
      "selfInvoiceFormat",
      "performaInvoiceFormat",
      "creditNoteFormat",
      "debitNoteFormat",
      "qutationFormat",
      "serviceFormat",
      "projectFormat",
      "companyExpenseFormat",
      "paymentReceiptFormat",
    ];

    requiredFields.forEach((field) => {
      if (!formData[field] && formData[field] !== 0) {
        newErrors[field] = `${fieldNames[field]} is required`;
      }
    });

    if (
      formData.financialYear &&
      !/^\d{4}-\d{2}$/.test(formData.financialYear)
    ) {
      newErrors.financialYear =
        "Financial Year must be in format YYYY-YY (e.g., 2024-25)";
    }

    if (formData.financialYear && !editingRecord) {
      if (existingYears.includes(formData.financialYear)) {
        newErrors.financialYear = "This financial year already exists";
      }
    } else if (formData.financialYear && editingRecord) {
      if (
        formData.financialYear !== editingRecord.financialYear &&
        existingYears.includes(formData.financialYear)
      ) {
        newErrors.financialYear = "This financial year already exists";
      }
    }

    if (formData.startDate && formData.endDate) {
      const start = new Date(formData.startDate);
      const end = new Date(formData.endDate);

      if (start >= end) {
        newErrors.endDate = "End date must be after start date";
      }

      const diffTime = Math.abs(end - start);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (diffDays < 360 || diffDays > 370) {
        newErrors.endDate =
          "Financial year should be approximately 365 days (Apr 1 to Mar 31)";
      }

      if (start.getMonth() !== 3 || start.getDate() !== 1) {
        newErrors.startDate = "Financial year should start from April 1";
      }

      if (end.getMonth() !== 2 || end.getDate() !== 31) {
        newErrors.endDate = "Financial year should end on March 31";
      }
    }

    if (formData.taxPercentage === "" || formData.taxPercentage === null) {
      newErrors.taxPercentage = "Tax percentage is required";
    } else {
      const taxValue = parseFloat(formData.taxPercentage);
      if (isNaN(taxValue)) {
        newErrors.taxPercentage = "Please enter a valid number";
      } else if (taxValue < 0 || taxValue > 100) {
        newErrors.taxPercentage = "Tax percentage must be between 0 and 100";
      }
    }

    if (formData.invoiceFormat && formData.invoiceFormat.length < 3) {
      newErrors.invoiceFormat = "Invoice format must be at least 3 characters";
    }
    if (formData.selfInvoiceFormat && formData.selfInvoiceFormat.length < 3) {
      newErrors.selfInvoiceFormat =
        "Self invoice format must be at least 3 characters";
    }
    if (
      formData.performaInvoiceFormat &&
      formData.performaInvoiceFormat.length < 3
    ) {
      newErrors.performaInvoiceFormat =
        "Performa invoice format must be at least 3 characters";
    }
    if (formData.creditNoteFormat && formData.creditNoteFormat.length < 3) {
      newErrors.creditNoteFormat =
        "Credit note format must be at least 3 characters";
    }
    if (formData.debitNoteFormat && formData.debitNoteFormat.length < 3) {
      newErrors.debitNoteFormat =
        "Debit note format must be at least 3 characters";
    }
    if (formData.qutationFormat && formData.qutationFormat.length < 3) {
      newErrors.qutationFormat =
        "Qutation format must be at least 3 characters";
    }
    if (formData.serviceFormat && formData.serviceFormat.length < 3) {
      newErrors.serviceFormat = "Service format must be at least 3 characters";
    }
    if (formData.projectFormat && formData.projectFormat.length < 3) {
      newErrors.projectFormat = "Project format must be at least 3 characters";
    }
    if (
      formData.companyExpenseFormat &&
      formData.companyExpenseFormat.length < 3
    ) {
      newErrors.companyExpenseFormat =
        "Company expense format must be at least 3 characters";
    }
    if (
      formData.paymentReceiptFormat &&
      formData.paymentReceiptFormat.length < 3
    ) {
      newErrors.paymentReceiptFormat =
        "Payment receipt format must be at least 3 characters";
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      const firstErrorField = Object.keys(newErrors)[0];
      setTimeout(() => {
        scrollToField(firstErrorField);
      }, 100);

      const firstFieldName = fieldNames[firstErrorField] || firstErrorField;
      showError(`Please fill ${firstFieldName} field correctly`);

      return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (editingRecord?.isViewMode) return;

    if (validateForm()) {
      setSubmitting(true);
      try {
        const submitData = {
          ...formData,
          taxPercentage: Number(formData.taxPercentage),
        };

        if (editingRecord && !editingRecord.isViewMode) {
          const yearId = editingRecord._id || editingRecord.id;
          const { _id, id, ...cleanData } = submitData;
          await apiPut(API_ENDPOINTS.YEARS.UPDATE(yearId), cleanData);
          showSuccess("Financial Year updated successfully!");
        } else {
          await apiPost(API_ENDPOINTS.YEARS.CREATE, submitData);
          showSuccess("Financial Year added successfully!");
        }

        onSubmit(submitData);
      } catch (error) {
        console.error("Error saving financial year:", error);

        if (error.response?.status === 409) {
          const errorMessage =
            error.response?.data?.error || "Duplicate entry found";

          if (errorMessage.includes("Financial Year")) {
            setErrors((prev) => ({ ...prev, financialYear: errorMessage }));
            scrollToField("financialYear");
          } else if (errorMessage.includes("Invoice Format")) {
            setErrors((prev) => ({ ...prev, invoiceFormat: errorMessage }));
            scrollToField("invoiceFormat");
          } else if (errorMessage.includes("Self Invoice Format")) {
            setErrors((prev) => ({ ...prev, selfInvoiceFormat: errorMessage }));
            scrollToField("selfInvoiceFormat");
          } else if (errorMessage.includes("Performa Invoice Format")) {
            setErrors((prev) => ({
              ...prev,
              performaInvoiceFormat: errorMessage,
            }));
            scrollToField("performaInvoiceFormat");
          } else if (errorMessage.includes("Credit Note Format")) {
            setErrors((prev) => ({ ...prev, creditNoteFormat: errorMessage }));
            scrollToField("creditNoteFormat");
          } else if (errorMessage.includes("Debit Note Format")) {
            setErrors((prev) => ({ ...prev, debitNoteFormat: errorMessage }));
            scrollToField("debitNoteFormat");
          } else if (errorMessage.includes("Qutation Format")) {
            setErrors((prev) => ({ ...prev, qutationFormat: errorMessage }));
            scrollToField("qutationFormat");
          } else if (errorMessage.includes("Service Format")) {
            setErrors((prev) => ({ ...prev, serviceFormat: errorMessage }));
            scrollToField("serviceFormat");
          } else if (errorMessage.includes("Project Format")) {
            setErrors((prev) => ({ ...prev, projectFormat: errorMessage }));
            scrollToField("projectFormat");
          } else if (errorMessage.includes("Company Expense Format")) {
            setErrors((prev) => ({
              ...prev,
              companyExpenseFormat: errorMessage,
            }));
            scrollToField("companyExpenseFormat");
          }

          showError(errorMessage);
        } else {
          showError(
            error.response?.data?.message ||
              error.response?.data?.error ||
              "Failed to save financial year. Please try again.",
          );
        }
      } finally {
        setSubmitting(false);
      }
    }
  };

  const RequiredStar = () => <span className="text-danger">*</span>;

  if (!show) return null;

  const modalTitle = editingRecord
    ? editingRecord.isViewMode
      ? `View Financial Year - ${editingRecord.financialYear}`
      : `Edit Financial Year - ${editingRecord.financialYear}`
    : "Add New Financial Year";

  const isViewMode = editingRecord?.isViewMode;

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

          <div className="modal-body">
            <form id="yearForm" onSubmit={handleSubmit} noValidate>
              <div className="row">
                {/* Financial Year */}
                <div className="col-md-4 mb-3">
                  <label htmlFor="financialYear" className="form-label">
                    <i className="fas fa-calendar-alt me-2 text-primary"></i>
                    Financial Year <RequiredStar />
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.financialYear ? "is-invalid" : ""}`}
                    id="financialYear"
                    name="financialYear"
                    value={formData.financialYear}
                    onChange={handleInputChange}
                    placeholder="YYYY-YY (e.g., 2024-25)"
                    readOnly={isViewMode}
                    maxLength="7"
                  />
                  {errors.financialYear && (
                    <div className="invalid-feedback d-block">
                      {errors.financialYear}
                    </div>
                  )}
                </div>

                {/* Status */}
                <div className="col-md-4 mb-3">
                  <label htmlFor="status" className="form-label">
                    <i className="fas fa-toggle-on me-2 text-primary"></i>
                    Status
                  </label>
                  <select
                    className={`form-control modern-input ${errors.status ? "is-invalid" : ""}`}
                    id="status"
                    name="status"
                    value={formData.status}
                    onChange={handleInputChange}
                    disabled={isViewMode}
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                  </select>
                </div>

                {/* Start Date */}
                <div className="col-md-4 mb-3">
                  <label htmlFor="startDate" className="form-label">
                    <i className="fas fa-play me-2 text-primary"></i>
                    Start Date <RequiredStar />
                  </label>
                  <input
                    type="date"
                    className={`form-control modern-input ${errors.startDate ? "is-invalid" : ""}`}
                    id="startDate"
                    name="startDate"
                    value={formData.startDate}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                  />
                  {errors.startDate && (
                    <div className="invalid-feedback d-block">
                      {errors.startDate}
                    </div>
                  )}
                </div>

                {/* End Date */}
                <div className="col-md-4 mb-3">
                  <label htmlFor="endDate" className="form-label">
                    <i className="fas fa-stop me-2 text-primary"></i>
                    End Date <RequiredStar />
                  </label>
                  <input
                    type="date"
                    className={`form-control modern-input ${errors.endDate ? "is-invalid" : ""}`}
                    id="endDate"
                    name="endDate"
                    value={formData.endDate}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                  />
                  {errors.endDate && (
                    <div className="invalid-feedback d-block">
                      {errors.endDate}
                    </div>
                  )}
                </div>

                {/* Tax Percentage */}
                <div className="col-md-4 mb-3">
                  <label htmlFor="taxPercentage" className="form-label">
                    <i className="fas fa-percent me-2 text-primary"></i>
                    Tax Percentage (%) <RequiredStar />
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.taxPercentage ? "is-invalid" : ""}`}
                    id="taxPercentage"
                    name="taxPercentage"
                    value={formData.taxPercentage}
                    onChange={handleInputChange}
                    placeholder="Enter tax percentage (0-100)"
                    readOnly={isViewMode}
                  />
                  {errors.taxPercentage && (
                    <div className="invalid-feedback d-block">
                      {errors.taxPercentage}
                    </div>
                  )}
                </div>

                {/* Invoice Format */}
                <div className="col-md-4 mb-3">
                  <label htmlFor="invoiceFormat" className="form-label">
                    <i className="fas fa-file-invoice me-2 text-primary"></i>
                    Invoice Format <RequiredStar />
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.invoiceFormat ? "is-invalid" : ""}`}
                    id="invoiceFormat"
                    name="invoiceFormat"
                    value={formData.invoiceFormat}
                    onChange={handleInputChange}
                    placeholder="e.g., MC/25-26/0001"
                    readOnly={isViewMode}
                  />
                  {errors.invoiceFormat && (
                    <div className="invalid-feedback d-block">
                      {errors.invoiceFormat}
                    </div>
                  )}
                </div>

                {/* Self Invoice Format */}
                <div className="col-md-4 mb-3">
                  <label htmlFor="selfInvoiceFormat" className="form-label">
                    <i className="fas fa-file-invoice me-2 text-primary"></i>
                    Self Invoice Format <RequiredStar />
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.selfInvoiceFormat ? "is-invalid" : ""}`}
                    id="selfInvoiceFormat"
                    name="selfInvoiceFormat"
                    value={formData.selfInvoiceFormat}
                    onChange={handleInputChange}
                    placeholder="e.g., MCR/25-26/0001"
                    readOnly={isViewMode}
                  />
                  {errors.selfInvoiceFormat && (
                    <div className="invalid-feedback d-block">
                      {errors.selfInvoiceFormat}
                    </div>
                  )}
                </div>

                {/* Performa Invoice Format */}
                <div className="col-md-4 mb-3">
                  <label htmlFor="performaInvoiceFormat" className="form-label">
                    <i className="fas fa-file-invoice me-2 text-primary"></i>
                    Performa Invoice Format <RequiredStar />
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.performaInvoiceFormat ? "is-invalid" : ""}`}
                    id="performaInvoiceFormat"
                    name="performaInvoiceFormat"
                    value={formData.performaInvoiceFormat}
                    onChange={handleInputChange}
                    placeholder="e.g., MC/PI/25-26/0001"
                    readOnly={isViewMode}
                  />
                  {errors.performaInvoiceFormat && (
                    <div className="invalid-feedback d-block">
                      {errors.performaInvoiceFormat}
                    </div>
                  )}
                </div>

                {/* Credit Note Format */}
                <div className="col-md-4 mb-3">
                  <label htmlFor="creditNoteFormat" className="form-label">
                    <i className="fas fa-file-invoice me-2 text-success"></i>
                    Credit Note Format <RequiredStar />
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.creditNoteFormat ? "is-invalid" : ""}`}
                    id="creditNoteFormat"
                    name="creditNoteFormat"
                    value={formData.creditNoteFormat}
                    onChange={handleInputChange}
                    placeholder="e.g., MC/CN/25-26/0001"
                    readOnly={isViewMode}
                  />
                  {errors.creditNoteFormat && (
                    <div className="invalid-feedback d-block">
                      {errors.creditNoteFormat}
                    </div>
                  )}
                </div>

                {/* Debit Note Format */}
                <div className="col-md-4 mb-3">
                  <label htmlFor="debitNoteFormat" className="form-label">
                    <i className="fas fa-file-invoice me-2 text-danger"></i>
                    Debit Note Format <RequiredStar />
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.debitNoteFormat ? "is-invalid" : ""}`}
                    id="debitNoteFormat"
                    name="debitNoteFormat"
                    value={formData.debitNoteFormat}
                    onChange={handleInputChange}
                    placeholder="e.g., MC/DN/25-26/0001"
                    readOnly={isViewMode}
                  />
                  {errors.debitNoteFormat && (
                    <div className="invalid-feedback d-block">
                      {errors.debitNoteFormat}
                    </div>
                  )}
                </div>

                {/* Qutation Format */}
                <div className="col-md-4 mb-3">
                  <label htmlFor="qutationFormat" className="form-label">
                    <i className="fas fa-file-signature me-2 text-primary"></i>
                    Qutation Format <RequiredStar />
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.qutationFormat ? "is-invalid" : ""}`}
                    id="qutationFormat"
                    name="qutationFormat"
                    value={formData.qutationFormat}
                    onChange={handleInputChange}
                    placeholder="e.g., MC/QTN/25-26/0001"
                    readOnly={isViewMode}
                  />
                  {errors.qutationFormat && (
                    <div className="invalid-feedback d-block">
                      {errors.qutationFormat}
                    </div>
                  )}
                </div>

                {/* Service Format */}
                <div className="col-md-4 mb-3">
                  <label htmlFor="serviceFormat" className="form-label">
                    <i className="fas fa-gears me-2 text-primary"></i>
                    Service Format <RequiredStar />
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.serviceFormat ? "is-invalid" : ""}`}
                    id="serviceFormat"
                    name="serviceFormat"
                    value={formData.serviceFormat}
                    onChange={handleInputChange}
                    placeholder="e.g., MC/SRV/25-26/0001"
                    readOnly={isViewMode}
                  />
                  {errors.serviceFormat && (
                    <div className="invalid-feedback d-block">
                      {errors.serviceFormat}
                    </div>
                  )}
                </div>

                {/* Project Format */}
                <div className="col-md-4 mb-3">
                  <label htmlFor="projectFormat" className="form-label">
                    <i className="fas fa-diagram-project me-2 text-primary"></i>
                    Project Format <RequiredStar />
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.projectFormat ? "is-invalid" : ""}`}
                    id="projectFormat"
                    name="projectFormat"
                    value={formData.projectFormat}
                    onChange={handleInputChange}
                    placeholder="e.g., MC/PRJ/25-26/0001"
                    readOnly={isViewMode}
                  />
                  {errors.projectFormat && (
                    <div className="invalid-feedback d-block">
                      {errors.projectFormat}
                    </div>
                  )}
                </div>

                {/* Company Expense Format */}
                <div className="col-md-4 mb-3">
                  <label htmlFor="companyExpenseFormat" className="form-label">
                    <i className="fas fa-receipt me-2 text-primary"></i>
                    Company Expense Format <RequiredStar />
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.companyExpenseFormat ? "is-invalid" : ""}`}
                    id="companyExpenseFormat"
                    name="companyExpenseFormat"
                    value={formData.companyExpenseFormat}
                    onChange={handleInputChange}
                    placeholder="e.g., MC/CEXP/25-26/0001"
                    readOnly={isViewMode}
                  />
                  {errors.companyExpenseFormat && (
                    <div className="invalid-feedback d-block">
                      {errors.companyExpenseFormat}
                    </div>
                  )}
                </div>

                {/* Payment Receipt Format */}
                <div className="col-md-4 mb-3">
                  <label htmlFor="paymentReceiptFormat" className="form-label">
                    <i className="fas fa-receipt me-2 text-primary"></i>
                    Payment Receipt Format <RequiredStar />
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.paymentReceiptFormat ? "is-invalid" : ""}`}
                    id="paymentReceiptFormat"
                    name="paymentReceiptFormat"
                    value={formData.paymentReceiptFormat}
                    onChange={handleInputChange}
                    placeholder="e.g., MC/RCPT/25-26/0001"
                    readOnly={isViewMode}
                  />
                  {errors.paymentReceiptFormat && (
                    <div className="invalid-feedback d-block">
                      {errors.paymentReceiptFormat}
                    </div>
                  )}
                </div>

                {/* Opening Cash Balance */}
                <div className="col-md-4 mb-3">
                  <label htmlFor="openingCash" className="form-label">
                    <i className="fas fa-hand-holding-usd me-2 text-success"></i>
                    Opening Cash Balance
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.openingCash ? "is-invalid" : ""}`}
                    id="openingCash"
                    name="openingCash"
                    value={formData.openingCash}
                    onChange={handleInputChange}
                    placeholder="Enter opening cash (optional)"
                    readOnly={isViewMode}
                  />
                  {errors.openingCash && (
                    <div className="invalid-feedback d-block">
                      {errors.openingCash}
                    </div>
                  )}
                </div>

                {/* Opening Bank Balance */}
                <div className="col-md-4 mb-3">
                  <label htmlFor="openingBank" className="form-label">
                    <i className="fas fa-building-columns me-2 text-primary"></i>
                    Opening Bank Balance
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.openingBank ? "is-invalid" : ""}`}
                    id="openingBank"
                    name="openingBank"
                    value={formData.openingBank}
                    onChange={handleInputChange}
                    placeholder="Enter opening bank amount (optional)"
                    readOnly={isViewMode}
                  />
                  {errors.openingBank && (
                    <div className="invalid-feedback d-block">
                      {errors.openingBank}
                    </div>
                  )}
                </div>

                {/* Opening CGST ITC */}
                <div className="col-md-4 mb-3">
                  <label htmlFor="openingCgstItc" className="form-label">
                    <i className="fas fa-receipt me-2 text-success"></i>
                    Opening CGST ITC
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.openingCgstItc ? "is-invalid" : ""}`}
                    id="openingCgstItc"
                    name="openingCgstItc"
                    value={formData.openingCgstItc}
                    onChange={handleInputChange}
                    placeholder="Enter opening CGST ITC (optional)"
                    readOnly={isViewMode}
                  />
                  {errors.openingCgstItc && (
                    <div className="invalid-feedback d-block">
                      {errors.openingCgstItc}
                    </div>
                  )}
                </div>

                {/* Opening SGST ITC */}
                <div className="col-md-4 mb-3">
                  <label htmlFor="openingSgstItc" className="form-label">
                    <i className="fas fa-receipt me-2 text-primary"></i>
                    Opening SGST ITC
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.openingSgstItc ? "is-invalid" : ""}`}
                    id="openingSgstItc"
                    name="openingSgstItc"
                    value={formData.openingSgstItc}
                    onChange={handleInputChange}
                    placeholder="Enter opening SGST ITC (optional)"
                    readOnly={isViewMode}
                  />
                  {errors.openingSgstItc && (
                    <div className="invalid-feedback d-block">
                      {errors.openingSgstItc}
                    </div>
                  )}
                </div>

                {/* Opening IGST ITC */}
                <div className="col-md-4 mb-3">
                  <label htmlFor="openingIgstItc" className="form-label">
                    <i className="fas fa-receipt me-2 text-warning"></i>
                    Opening IGST ITC
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.openingIgstItc ? "is-invalid" : ""}`}
                    id="openingIgstItc"
                    name="openingIgstItc"
                    value={formData.openingIgstItc}
                    onChange={handleInputChange}
                    placeholder="Enter opening IGST ITC (optional)"
                    readOnly={isViewMode}
                  />
                  {errors.openingIgstItc && (
                    <div className="invalid-feedback d-block">
                      {errors.openingIgstItc}
                    </div>
                  )}
                </div>

                {/* Description */}
                <div className="col-12 mb-3">
                  <label htmlFor="description" className="form-label">
                    <i className="fas fa-align-left me-2 text-primary"></i>
                    Description
                  </label>
                  <textarea
                    className="form-control modern-input"
                    id="description"
                    name="description"
                    rows="1"
                    value={formData.description}
                    onChange={handleInputChange}
                    placeholder="Enter description (optional)"
                    readOnly={isViewMode}
                  ></textarea>
                </div>

                {/* Default Year Checkbox */}
                <div className="col-12 mb-3">
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="isDefault"
                      name="isDefault"
                      checked={formData.isDefault}
                      onChange={handleInputChange}
                      disabled={isViewMode}
                    />
                    <label className="form-check-label" htmlFor="isDefault">
                      <i className="fas fa-star text-warning me-2"></i>
                      Set as Default Financial Year
                    </label>
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
                form="yearForm"
                className="btn btn-success"
                disabled={submitting}
              >
                <i className="fas fa-check me-2"></i>
                {submitting
                  ? "Saving..."
                  : editingRecord
                    ? "Update Financial Year"
                    : "Save Financial Year"}
              </button>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .form-check-input {
          width: 18px;
          height: 18px;
          cursor: pointer;
        }

        .form-check-input:checked {
          background-color: #ffc107;
          border-color: #ffc107;
        }

        .form-check-label {
          font-weight: 500;
          color: #495057;
          cursor: pointer;
        }

        .invalid-feedback.d-block {
          display: block !important;
          margin-top: 5px;
        }

        /* Responsive adjustments */
        @media (max-width: 576px) {
          .modal-dialog {
            margin: 0.5rem;
          }
        }
      `}</style>
    </div>
  );
};

export default CreateYear;
