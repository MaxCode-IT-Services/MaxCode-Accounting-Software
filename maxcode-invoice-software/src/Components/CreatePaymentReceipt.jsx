import React, { useState, useEffect, useRef } from "react";
import Select from "react-select";
import SelectRightLoader from "./SelectRightLoader";
import { showSuccess, showError } from "./ToastNotification";
import { apiGet, apiPost, apiPut } from "../utils/api";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { getUnifiedSelectStyles } from "../utils/reactSelectStyles";

import {
  fetchSelectableClients,
  filterRowsBySearch,
  filterActiveSelectableRows,
} from "../utils/fetchAllEntities";
import { normalizePaymentMethodOptions } from "../utils/paymentMethods";

const emptyForm = {
  receiptNumber: "",
  receiptDate: "",
  clientRefId: "",
  clientId: "",
  clientName: "",
  businessName: "",
  phoneNumber: "",
  email: "",
  address: "",
  amount: "",
  paymentMethod: "",
  bankName: "",
  chequeNumber: "",
  purpose: "",
  note: "",
  paymentType: "regular",
  invoiceId: "",
  invoiceNumber: "",
  financialYear: "",
};

const CreatePaymentReceipt = ({
  show,
  onClose,
  onSubmit,
  editingRecord = null,
  defaultPaymentType = "regular",
  defaultFinancialYear = null,
  readOnly = false,
}) => {
  const [formData, setFormData] = useState({
    ...emptyForm,
    paymentType: defaultPaymentType,
  });
  const [paymentMethodOptions, setPaymentMethodOptions] = useState([
    "Cash",
    "Bank Transfer",
    "UPI",
    "Cheque",
    "NEFT",
    "RTGS",
    "IMPS",
    "Card",
  ]);
  // On mount, get canonical payment methods from CreateSales
  useEffect(() => {
    // Simulate fetching all possible payment methods from CreateSales
    // In real app, you might fetch from API or business settings
    setPaymentMethodOptions(
      normalizePaymentMethodOptions([
        "Cash",
        "Bank Transfer",
        "UPI",
        "Cheque",
        "NEFT",
        "RTGS",
        "IMPS",
        "Card",
        "Zoho Payment Gateway",
        "Cashfree Payment Gateway",
        "PayU Payment Gateway",
      ]),
    );
  }, []);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [clientOptions, setClientOptions] = useState([]);
  const [isClientLoading, setIsClientLoading] = useState(false);
  const [isGeneratingNumber, setIsGeneratingNumber] = useState(false);
  const [invoiceOptions, setInvoiceOptions] = useState([]);
  const [isInvoiceLoading, setIsInvoiceLoading] = useState(false);

  const clientSearchDebounceRef = useRef(null);
  const clientAbortControllerRef = useRef(null);
  const knownClientRowsRef = useRef([]);

  useEffect(() => {
    document.body.style.overflow = show ? "hidden" : "auto";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [show]);

  // Init form
  useEffect(() => {
    if (!show) return;
    if (editingRecord) {
      // Patch: Always set all client fields, even if missing in editingRecord
      setFormData((prev) => ({
        ...emptyForm,
        ...editingRecord,
        amount:
          editingRecord.amount !== undefined
            ? String(editingRecord.amount)
            : "",
        clientRefId: editingRecord.clientRefId || editingRecord.clientId || "",
        clientId: editingRecord.clientId || editingRecord.clientRefId || "",
        clientName: editingRecord.clientName || "",
        businessName: editingRecord.businessName || "",
        phoneNumber: editingRecord.phoneNumber || "",
        email: editingRecord.email || "",
        address: editingRecord.address || "",
        paymentType: editingRecord.paymentType || defaultPaymentType,
        invoiceId: editingRecord.invoiceId || "",
        invoiceNumber: editingRecord.invoiceNumber || "",
        financialYear: editingRecord.financialYear || "",
      }));
    } else {
      // Autofill today's date and default financial year
      const today = new Date();
      const dateStr = today.toISOString().split("T")[0];
      setFormData({
        ...emptyForm,
        paymentType: defaultPaymentType,
        receiptDate: dateStr,
        financialYear: defaultFinancialYear?.financialYear || "",
      });
      setErrors({});
      generateReceiptNumber(null, defaultFinancialYear);
    }
  }, [editingRecord, show, defaultPaymentType]);

  // Fetch clients on open
  useEffect(() => {
    if (!show) return;
    const fetchClients = async () => {
      if (clientAbortControllerRef.current)
        clientAbortControllerRef.current.abort();
      const controller = new AbortController();
      clientAbortControllerRef.current = controller;
      setIsClientLoading(true);
      try {
        const data = await fetchSelectableClients({
          limit: 50,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const active = filterActiveSelectableRows(data);
        knownClientRowsRef.current = active;
        setClientOptions(active);
      } catch (err) {
        if (err?.name !== "CanceledError" && err?.code !== "ERR_CANCELED") {
          console.error("Failed to fetch clients:", err);
        }
      } finally {
        if (!controller.signal.aborted) setIsClientLoading(false);
      }
    };
    fetchClients();
    return () => {
      if (clientSearchDebounceRef.current)
        clearTimeout(clientSearchDebounceRef.current);
      if (clientAbortControllerRef.current)
        clientAbortControllerRef.current.abort();
    };
  }, [show]);

  // Fetch invoices when client is selected (for "regular" type)
  useEffect(() => {
    if (!formData.clientRefId || formData.paymentType !== "regular") {
      setInvoiceOptions([]);
      return;
    }
    const fetchInvoices = async () => {
      setIsInvoiceLoading(true);
      try {
        const url = `${API_ENDPOINTS.INVOICES.LIST}?limit=500&clientRefId=${encodeURIComponent(formData.clientRefId)}`;
        const res = await apiGet(url);
        const all =
          res?.data?.data ||
          res?.data?.invoices ||
          (Array.isArray(res?.data) ? res.data : []);
        const clientInvoices = all
          .filter(
            (inv) =>
              inv.clientRefId === formData.clientRefId ||
              inv.clientId === formData.clientId,
          )
          .map((inv) => ({
            value: inv._id || inv.id,
            label: `${inv.invoiceNumber} — ₹${Number(inv.taxData?.totalAmount || 0).toLocaleString("en-IN")} (${inv.paymentStatus || "Unpaid"})`,
            invoiceNumber: inv.invoiceNumber,
          }));
        setInvoiceOptions(clientInvoices);
      } catch (err) {
        console.error("Failed to fetch invoices:", err);
      } finally {
        setIsInvoiceLoading(false);
      }
    };
    fetchInvoices();
  }, [formData.clientRefId, formData.paymentType]);

  // Auto-fill financial year and receipt number from defaultFinancialYear on mount
  useEffect(() => {
    if (!show || editingRecord || !defaultFinancialYear) return;
    setFormData((prev) => ({
      ...prev,
      financialYear: defaultFinancialYear.financialYear || prev.financialYear,
    }));
  }, [show, editingRecord, defaultFinancialYear]);

  // Regenerate receipt number when financial year changes
  useEffect(() => {
    if (!show || editingRecord || !formData.financialYear) return;
    generateReceiptNumber(formData.financialYear);
  }, [formData.financialYear, show, editingRecord]);

  const generateReceiptNumber = async (
    financialYear = null,
    fallbackFY = null,
  ) => {
    setIsGeneratingNumber(true);
    try {
      let url = API_ENDPOINTS.PAYMENT_RECEIPTS.NEXT_NUMBER;
      const fyToUse = financialYear || fallbackFY?.financialYear;
      if (fyToUse) {
        url += `&financialYear=${encodeURIComponent(fyToUse)}`;
      }
      const res = await apiGet(url);
      const num = res?.data?.receiptNumber || res?.data?.nextNumber || "";
      if (num) {
        setFormData((prev) => ({ ...prev, receiptNumber: num }));
      }
    } catch (err) {
      console.error("Failed to generate receipt number:", err);
    } finally {
      setIsGeneratingNumber(false);
    }
  };

  const handleClientSearchInput = (inputValue, meta) => {
    if (meta?.action !== "input-change") return inputValue;
    const searchText = String(inputValue || "").trim();
    if (clientSearchDebounceRef.current)
      clearTimeout(clientSearchDebounceRef.current);
    setIsClientLoading(Boolean(searchText));

    if (!searchText) {
      setClientOptions(knownClientRowsRef.current.slice(0, 50));
      setIsClientLoading(false);
      return inputValue;
    }

    const localMatches = filterRowsBySearch(
      knownClientRowsRef.current,
      searchText,
      ["clientName", "businessName", "clientId", "phoneNumber", "email"],
    );
    if (localMatches.length > 0) {
      setClientOptions(localMatches);
      setIsClientLoading(false);
      return inputValue;
    }

    clientSearchDebounceRef.current = setTimeout(async () => {
      if (clientAbortControllerRef.current)
        clientAbortControllerRef.current.abort();
      const controller = new AbortController();
      clientAbortControllerRef.current = controller;
      try {
        const rows = await fetchSelectableClients({
          search: searchText,
          limit: 50,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        const active = filterActiveSelectableRows(rows);
        knownClientRowsRef.current = filterActiveSelectableRows([
          ...knownClientRowsRef.current,
          ...active,
        ]);
        setClientOptions(active);
      } catch (err) {
        if (err?.name !== "CanceledError" && err?.code !== "ERR_CANCELED")
          console.error(err);
      } finally {
        if (!controller.signal.aborted) setIsClientLoading(false);
      }
    }, 350);
    return inputValue;
  };

  const handleClientSelect = (option) => {
    if (!option) {
      setFormData((prev) => ({
        ...prev,
        clientRefId: "",
        clientId: "",
        clientName: "",
        businessName: "",
        phoneNumber: "",
        email: "",
        address: "",
      }));
      return;
    }
    setFormData((prev) => ({
      ...prev,
      clientRefId: option.id || option._id || option.clientId || "",
      clientId: option.clientId || "",
      clientName: option.clientName || "",
      businessName: option.businessName || "",
      phoneNumber: option.phoneNumber || "",
      email: option.email || "",
      address: option.address || "",
    }));
    if (errors.clientName) setErrors((prev) => ({ ...prev, clientName: "" }));
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handlePaymentTypeChange = (type) => {
    setFormData((prev) => ({
      ...prev,
      paymentType: type,
      invoiceId: "",
      invoiceNumber: "",
      purpose: type === "advance" ? "Advance Payment" : "",
    }));
  };

  const validate = () => {
    const errs = {};
    if (!formData.clientName && !formData.clientRefId)
      errs.clientName = "Client is required";
    if (!formData.receiptDate) errs.receiptDate = "Receipt date is required";

    // Validate that receipt date falls within the default financial year's date range
    if (formData.receiptDate && defaultFinancialYear) {
      const receiptDate = new Date(formData.receiptDate);
      const fyStartDate = new Date(defaultFinancialYear.startDate);
      const fyEndDate = new Date(defaultFinancialYear.endDate);

      if (receiptDate < fyStartDate || receiptDate > fyEndDate) {
        errs.receiptDate = `Receipt date must be between ${fyStartDate.toLocaleDateString("en-IN")} and ${fyEndDate.toLocaleDateString("en-IN")} (${defaultFinancialYear.financialYear})`;
      }
    }

    const amt = Number(formData.amount);
    if (!formData.amount || isNaN(amt) || amt <= 0)
      errs.amount = "Amount must be a positive number";
    if (!formData.paymentMethod)
      errs.paymentMethod = "Payment method is required";
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    // Check for duplicate receipt number (only for new records)
    if (!editingRecord && formData.receiptNumber) {
      setSubmitting(true);
      try {
        const checkRes = await apiGet(API_ENDPOINTS.PAYMENT_RECEIPTS.LIST, {
          params: {
            search: formData.receiptNumber,
            limit: 1,
          },
        });

        const existingRecords =
          checkRes?.data?.data || checkRes?.data?.receipts || [];
        const duplicate = existingRecords.find(
          (r) => r.receiptNumber === formData.receiptNumber,
        );

        if (duplicate) {
          showError(
            `Receipt number "${formData.receiptNumber}" already exists in the system`,
          );
          setSubmitting(false);
          return;
        }
      } catch (err) {
        console.error("Failed to check for duplicate receipt number:", err);
        // Continue with submission even if duplicate check fails
      }
    }

    try {
      const payload = {
        ...formData,
        amount: Number(formData.amount),
      };

      let res;
      if (editingRecord) {
        res = await apiPut(
          API_ENDPOINTS.PAYMENT_RECEIPTS.UPDATE(
            editingRecord.id || editingRecord._id,
          ),
          payload,
        );
        showSuccess("Payment receipt updated successfully!");
      } else {
        res = await apiPost(API_ENDPOINTS.PAYMENT_RECEIPTS.CREATE, payload);
        showSuccess(
          formData.paymentType === "advance"
            ? "Advance payment receipt created successfully!"
            : "Payment receipt created successfully!",
        );
      }

      if (onSubmit) onSubmit(res?.data);
      onClose();
    } catch (err) {
      console.error("Submit error:", err);
      showError(
        err?.response?.data?.error ||
          "Failed to save receipt. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const selectStyles = getUnifiedSelectStyles();

  // Patch: Always show a selected option for Select, even if not in clientOptions
  const selectedClientOption =
    formData.clientRefId || formData.clientName || formData.businessName
      ? clientOptions.find(
          (c) =>
            (c.id || c._id || c.clientId) === formData.clientRefId ||
            c.clientId === formData.clientId,
        ) || {
          value: formData.clientRefId || formData.clientId,
          label:
            formData.clientName ||
            formData.businessName ||
            formData.clientRefId ||
            formData.clientId,
          clientName: formData.clientName,
          businessName: formData.businessName,
          clientId: formData.clientId,
          phoneNumber: formData.phoneNumber,
          email: formData.email,
          address: formData.address,
        }
      : null;

  if (!show) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="modal-backdrop fade show"
        style={{ zIndex: 1040 }}
        onClick={onClose}
      />
      {/* Modal */}
      <div
        className="modal fade show d-block"
        tabIndex="-1"
        style={{ zIndex: 1050 }}
        role="dialog"
      >
        <div className="modal-dialog modal-lg modal-dialog-scrollable modal-dialog-centered">
          <div className="modal-content">
            {/* Header */}
            <div className="modal-header bg-success text-white">
              <h5 className="modal-title">
                <i
                  className={`me-2 fa-solid ${formData.paymentType === "advance" ? "fa-hand-holding-dollar" : "fa-receipt"}`}
                />
                {editingRecord
                  ? editingRecord.isViewMode || readOnly
                    ? `View Payment Receipt${formData.clientName ? ` - ${formData.clientName}` : ""}`
                    : `Edit Payment Receipt${formData.clientName ? ` - ${formData.clientName}` : ""}`
                  : formData.paymentType === "advance"
                    ? "New Advance Payment Receipt"
                    : "New Payment Receipt"}
              </h5>
              <button
                type="button"
                className="btn-close btn-close-white"
                onClick={onClose}
                aria-label="Close"
              />
            </div>
            {/* Body & Footer wrapped in one parent div for valid JSX */}
            <div>
              <div
                className="modal-body"
                style={{ maxHeight: "65vh", overflowY: "auto" }}
              >
                <form onSubmit={handleSubmit} noValidate>
                  <div className="row g-3">
                    {/* Payment Type Toggle */}
                    {!editingRecord && (
                      <div className="col-md-6 mb-3">
                        <label className="form-label">
                          <i className="fas fa-receipt me-2 text-primary"></i>
                          Receipt Type <span className="text-danger">*</span>
                        </label>
                        <div className="d-flex gap-2">
                          <button
                            type="button"
                            className={`btn flex-fill ${formData.paymentType === "regular" ? "btn-success" : "btn-outline-secondary"}`}
                            onClick={() => handlePaymentTypeChange("regular")}
                          >
                            <i className="fa-solid fa-receipt me-2" />
                            Regular Payment
                          </button>
                          <button
                            type="button"
                            className={`btn flex-fill ${formData.paymentType === "advance" ? "btn-warning" : "btn-outline-secondary"}`}
                            onClick={() => handlePaymentTypeChange("advance")}
                          >
                            <i className="fa-solid fa-hand-holding-dollar me-2" />
                            Advance Payment
                          </button>
                        </div>
                      </div>
                    )}
                    {/* Receipt Number */}
                    <div className="col-md-6">
                      <label className="form-label">
                        <i className="fas fa-hashtag me-2 text-primary"></i>
                        Receipt Number <span className="text-danger">*</span>
                      </label>
                      <div className="input-group">
                        <input
                          type="text"
                          className="form-control modern-input"
                          name="receiptNumber"
                          value={formData.receiptNumber}
                          onChange={handleChange}
                          placeholder="Auto-generated"
                          readOnly
                        />
                        {isGeneratingNumber && (
                          <span className="input-group-text">
                            <span className="spinner-border spinner-border-sm" />
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Receipt Date */}
                    <div className="col-md-6">
                      <label className="form-label">
                        <i className="fas fa-calendar me-2 text-primary"></i>
                        Receipt Date <span className="text-danger">*</span>
                      </label>
                      <input
                        type="date"
                        className={`form-control modern-input ${errors.receiptDate ? "is-invalid" : ""}`}
                        name="receiptDate"
                        value={formData.receiptDate}
                        onChange={handleChange}
                        readOnly={readOnly}
                        disabled={readOnly}
                      />
                      {errors.receiptDate && (
                        <div className="invalid-feedback d-block">
                          {errors.receiptDate}
                        </div>
                      )}
                    </div>

                    {/* Client */}
                    <div className="col-md-6">
                      <label className="form-label">
                        <i className="fas fa-user me-2 text-primary"></i>
                        Client <span className="text-danger">*</span>
                      </label>
                      <div className="position-relative">
                        <Select
                          options={clientOptions}
                          value={selectedClientOption}
                          onChange={handleClientSelect}
                          onInputChange={handleClientSearchInput}
                          isLoading={isClientLoading}
                          placeholder="Search client by name, business or phone..."
                          isClearable={!readOnly}
                          styles={selectStyles}
                          getOptionLabel={(o) =>
                            `${o.clientName || ""}${o.businessName ? ` (${o.businessName})` : ""}`
                          }
                          getOptionValue={(o) =>
                            o.id || o._id || o.clientId || o.clientName
                          }
                          noOptionsMessage={() =>
                            isClientLoading
                              ? "Searching..."
                              : "No clients found"
                          }
                          components={{
                            LoadingIndicator: () => <SelectRightLoader />,
                          }}
                          isDisabled={readOnly}
                        />
                      </div>
                      {errors.clientName && (
                        <div className="text-danger small mt-1">
                          {errors.clientName}
                        </div>
                      )}
                    </div>

                    {/* Patch: Always show client details section in view/edit mode if any info exists */}
                    {(formData.clientName ||
                      formData.businessName ||
                      formData.phoneNumber ||
                      formData.email ||
                      formData.address) && (
                      <>
                        <div className="col-12">
                          <h6 className="border-bottom pb-2 mb-0 text-success">
                            <i className="fas fa-building me-2"></i>
                            Client Details (Auto-filled)
                          </h6>
                        </div>
                        {formData.clientName && (
                          <div className="col-md-6">
                            <label className="form-label">
                              <i className="fas fa-user me-2 text-primary"></i>
                              Client Name
                            </label>
                            <input
                              type="text"
                              className="form-control modern-input"
                              value={formData.clientName}
                              readOnly
                              disabled
                              style={{ backgroundColor: "#e9ecef" }}
                            />
                          </div>
                        )}
                        {formData.businessName && (
                          <div className="col-md-6">
                            <label className="form-label">
                              <i className="fas fa-building me-2 text-primary"></i>
                              Business Name
                            </label>
                            <input
                              type="text"
                              className="form-control modern-input"
                              value={formData.businessName}
                              readOnly
                              disabled
                              style={{ backgroundColor: "#e9ecef" }}
                            />
                          </div>
                        )}
                        {formData.phoneNumber && (
                          <div className="col-md-6">
                            <label className="form-label">
                              <i className="fas fa-phone me-2 text-primary"></i>
                              Phone Number
                            </label>
                            <div className="input-group">
                              <span className="input-group-text flag-india">
                                <img
                                  src="https://flagcdn.com/w40/in.png"
                                  alt="India"
                                  className="flag-icon"
                                />
                                +91
                              </span>
                              <input
                                type="tel"
                                className="form-control modern-input rounded-end-3"
                                value={formData.phoneNumber}
                                readOnly
                                disabled
                                minLength="10"
                                maxLength="10"
                                placeholder="10-digit mobile number"
                                style={{ backgroundColor: "#e9ecef" }}
                              />
                            </div>
                          </div>
                        )}
                        {formData.email && (
                          <div className="col-md-6">
                            <label className="form-label">
                              <i className="fas fa-envelope me-2 text-primary"></i>
                              Email
                            </label>
                            <input
                              type="text"
                              className="form-control modern-input"
                              value={formData.email}
                              readOnly
                              disabled
                              style={{ backgroundColor: "#e9ecef" }}
                            />
                          </div>
                        )}
                        {formData.address && (
                          <div className="col-md-6">
                            <label className="form-label">
                              <i className="fas fa-map-marker-alt me-2 text-primary"></i>
                              Address
                            </label>
                            <input
                              type="text"
                              className="form-control modern-input"
                              value={formData.address}
                              readOnly
                              disabled
                              style={{ backgroundColor: "#e9ecef" }}
                            />
                          </div>
                        )}
                      </>
                    )}

                    {/* Amount */}
                    <div className="col-md-6">
                      <label className="form-label">
                        <i className="fas fa-rupee-sign me-2 text-primary"></i>
                        Amount (₹) <span className="text-danger">*</span>
                      </label>
                      <input
                        type="number"
                        className={`form-control modern-input ${errors.amount ? "is-invalid" : ""}`}
                        name="amount"
                        value={formData.amount}
                        onChange={handleChange}
                        placeholder="0.00"
                        min="0"
                        step="0.01"
                        readOnly={readOnly}
                        disabled={readOnly}
                      />
                      {errors.amount && (
                        <div className="invalid-feedback d-block">
                          {errors.amount}
                        </div>
                      )}
                    </div>

                    {/* Payment Method */}
                    <div className="col-md-6">
                      <label className="form-label">
                        <i className="fas fa-credit-card me-2 text-primary"></i>
                        Payment Method <span className="text-danger">*</span>
                      </label>
                      <Select
                        options={paymentMethodOptions.map((m) => ({
                          value: m,
                          label: m,
                        }))}
                        value={
                          formData.paymentMethod
                            ? {
                                value: formData.paymentMethod,
                                label: formData.paymentMethod,
                              }
                            : null
                        }
                        onChange={(option) =>
                          setFormData((prev) => ({
                            ...prev,
                            paymentMethod: option ? option.value : "",
                          }))
                        }
                        isClearable={!readOnly}
                        placeholder="Select Method"
                        styles={selectStyles}
                        name="paymentMethod"
                        classNamePrefix="react-select"
                        isDisabled={readOnly}
                      />
                      {errors.paymentMethod && (
                        <div className="invalid-feedback d-block">
                          {errors.paymentMethod}
                        </div>
                      )}
                    </div>

                    {/* Bank Name (if applicable) */}
                    {[
                      "Bank Transfer",
                      "NEFT",
                      "RTGS",
                      "IMPS",
                      "Cheque",
                      "Card",
                    ].includes(formData.paymentMethod) && (
                      <div className="col-md-6">
                        <label className="form-label">
                          <i className="fas fa-university me-2 text-primary"></i>
                          Bank Name
                        </label>
                        <input
                          type="text"
                          className="form-control modern-input"
                          name="bankName"
                          value={formData.bankName}
                          onChange={handleChange}
                          placeholder="Bank name"
                          readOnly={readOnly}
                          disabled={readOnly}
                        />
                      </div>
                    )}

                    {/* Cheque Number */}
                    {formData.paymentMethod === "Cheque" && (
                      <div className="col-md-6">
                        <label className="form-label">
                          <i className="fas fa-file-invoice me-2 text-primary"></i>
                          Cheque Number
                        </label>
                        <input
                          type="text"
                          className="form-control modern-input"
                          name="chequeNumber"
                          value={formData.chequeNumber}
                          onChange={handleChange}
                          placeholder="Cheque number"
                          readOnly={readOnly}
                          disabled={readOnly}
                        />
                      </div>
                    )}

                    {/* Invoice link — only for regular payments */}
                    {formData.paymentType === "regular" && (
                      <div className="col-md-6">
                        <label className="form-label">
                          <i className="fas fa-file-invoice-dollar me-2 text-primary"></i>
                          Against Invoice{" "}
                          <span className="text-muted small">(Optional)</span>
                        </label>
                        <Select
                          options={invoiceOptions}
                          value={
                            formData.invoiceId
                              ? invoiceOptions.find(
                                  (o) => o.value === formData.invoiceId,
                                ) || null
                              : null
                          }
                          onChange={(option) => {
                            setFormData((prev) => ({
                              ...prev,
                              invoiceId: option?.value || "",
                              invoiceNumber: option?.invoiceNumber || "",
                              purpose: option
                                ? `Against Invoice ${option.invoiceNumber}`
                                : prev.purpose,
                            }));
                          }}
                          isLoading={isInvoiceLoading}
                          isClearable={!readOnly}
                          placeholder={
                            formData.clientRefId
                              ? "Select invoice (optional)"
                              : "Select a client first"
                          }
                          isDisabled={!formData.clientRefId || readOnly}
                          styles={selectStyles}
                          noOptionsMessage={() =>
                            isInvoiceLoading
                              ? "Loading..."
                              : formData.clientRefId
                                ? "No invoices found for this client"
                                : "Select a client first"
                          }
                        />
                      </div>
                    )}

                    {/* Purpose */}
                    <div className="col-md-6">
                      <label className="form-label">
                        <i className="fas fa-align-left me-2 text-primary"></i>
                        Purpose / Description
                      </label>
                      <input
                        type="text"
                        className="form-control modern-input"
                        name="purpose"
                        value={formData.purpose}
                        onChange={handleChange}
                        placeholder={
                          formData.paymentType === "advance"
                            ? "Advance payment for future work"
                            : "Payment for services rendered"
                        }
                        readOnly={readOnly}
                        disabled={readOnly}
                      />
                    </div>

                    {/* Note */}
                    <div className="col-12">
                      <label className="form-label">
                        <i className="fas fa-sticky-note me-2 text-primary"></i>
                        Note
                      </label>
                      <textarea
                        className="form-control modern-input"
                        name="note"
                        value={formData.note}
                        onChange={handleChange}
                        rows={2}
                        placeholder="Additional note (optional)"
                        readOnly={readOnly}
                        disabled={readOnly}
                      />
                      {formData.paymentType === "advance" && (
                        <div className="alert alert-warning mt-2 py-2 px-3 small mb-0">
                          <i className="fa-solid fa-circle-info me-2" />
                          Advance payment receipt has no invoice. When you
                          create the final invoice later, the advance will be
                          auto-adjusted.
                        </div>
                      )}
                    </div>
                  </div>
                </form>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={onClose}
                  disabled={submitting}
                >
                  {readOnly ? "Close" : "Cancel"}
                </button>
                {!readOnly && (
                  <button
                    type="button"
                    className={`btn ${formData.paymentType === "advance" ? "btn-warning" : "btn-success"}`}
                    onClick={handleSubmit}
                    disabled={submitting}
                  >
                    {submitting ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" />
                        Saving...
                      </>
                    ) : editingRecord ? (
                      "Update Receipt"
                    ) : formData.paymentType === "advance" ? (
                      "Create Advance Receipt"
                    ) : (
                      "Create Receipt"
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
        <style>{`
        .flag-india {
          background: linear-gradient(135deg, #ff9933, #ffffff, #138808);
          border: 2px solid #e9ecef;
          border-right: none;
          border-radius: 10px 0 0 10px;
          font-weight: 600;
          color: #333;
        }

        .flag-icon {
          width: 20px;
          height: 15px;
          margin-right: 8px;
          border-radius: 2px;
        }
      `}</style>
      </div>
    </>
  );
};

export default CreatePaymentReceipt;
