import React, { useEffect, useMemo, useState } from "react";
import Select from "react-select";
import { showError, showSuccess } from "./ToastNotification";
import { apiGet, apiPost, apiPut } from "../utils/api";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { getUnifiedSelectStyles } from "../utils/reactSelectStyles";
import {
  fetchSelectableClients,
  filterActiveSelectableRows,
} from "../utils/fetchAllEntities";

const PAYMENT_METHOD_OPTIONS = [
  "Cash",
  "Bank Transfer",
  "UPI",
  "Cheque",
  "NEFT",
  "RTGS",
  "IMPS",
  "Card",
];

const CreateRefund = ({
  show,
  onClose,
  onSubmit,
  editingRecord = null,
  defaultFinancialYear = null,
  readOnly = false,
}) => {
  const selectedFinancialYear =
    defaultFinancialYear?.financialYear ||
    localStorage.getItem("selectedFinancialYear") ||
    "ALL";

  const [formData, setFormData] = useState({
    refundNumber: "",
    refundDate: "",
    clientRefId: "",
    clientId: "",
    clientName: "",
    businessName: "",
    gstin: "",
    phoneNumber: "",
    email: "",
    address: "",
    advanceReceiptId: "",
    advanceReceiptNumber: "",
    advanceReceiptDate: "",
    advanceAmount: "",
    advanceAdjustedAmount: "",
    advanceRefundedAmount: "",
    amount: "",
    refundMethod: "",
    bankName: "",
    chequeNumber: "",
    referenceNumber: "",
    note: "",
    financialYear: selectedFinancialYear,
  });

  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [isGeneratingNumber, setIsGeneratingNumber] = useState(false);
  const [clients, setClients] = useState([]);
  const [advanceOptions, setAdvanceOptions] = useState([]);
  const [isClientsLoading, setIsClientsLoading] = useState(false);
  const [isAdvancesLoading, setIsAdvancesLoading] = useState(false);

  const toNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const sanitizeAmountValue = (raw) => {
    let v = String(raw || "");
    // keep only digits and dots
    v = v.replace(/[^\d.]/g, "");
    // allow only a single dot: keep first dot and remove others
    const parts = v.split(".");
    if (parts.length <= 1) return parts[0];
    const first = parts.shift();
    const rest = parts.join("");
    return `${first}.${rest}`;
  };

  const normalizeDateValue = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
    return date.toISOString().slice(0, 10);
  };

  const isChequeMethod = String(formData.refundMethod || "") === "Cheque";
  const isViewMode = readOnly || Boolean(editingRecord?.isViewMode);
  const getAdvanceOptionById = (advanceId) => {
    const normalizedId = String(advanceId || "").trim();
    return advanceOptions.find(
      (item) => String(item.advanceReceiptId || item.id || "").trim() === normalizedId,
    );
  };

  const getMaxRefundAmount = () => {
    const selectedAdvance = getAdvanceOptionById(formData.advanceReceiptId);
    if (!selectedAdvance) return 0;

    const available = toNumber(selectedAdvance.availableAmount);
    const editingAmount = editingRecord ? toNumber(editingRecord.amount || 0) : 0;

    if (
      editingRecord &&
      String(selectedAdvance.advanceReceiptId || selectedAdvance.id || "") ===
        String(editingRecord.advanceReceiptId || "")
    ) {
      return available + editingAmount;
    }

    return available;
  };

  useEffect(() => {
    document.body.style.overflow = show ? "hidden" : "auto";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [show]);

  useEffect(() => {
    if (!show) return;

    const loadClients = async () => {
      setIsClientsLoading(true);
      try {
        const rows = await fetchSelectableClients({ fetchAll: true });
        const activeRows = filterActiveSelectableRows(rows);
        setClients(activeRows);
      } catch (error) {
        console.error("Failed to load clients:", error);
        setClients([]);
      } finally {
        setIsClientsLoading(false);
      }
    };

    loadClients();
  }, [show]);

  useEffect(() => {
    if (!show) return;

    if (editingRecord) {
      setFormData({
        refundNumber: editingRecord.refundNumber || "",
        refundDate: editingRecord.refundDate
          ? String(editingRecord.refundDate).slice(0, 10)
          : "",
        clientRefId: editingRecord.clientRefId || editingRecord.clientId || "",
        clientId: editingRecord.clientId || editingRecord.clientRefId || "",
        clientName: editingRecord.clientName || "",
        businessName: editingRecord.businessName || "",
        gstin: editingRecord.gstin || "",
        phoneNumber: editingRecord.phoneNumber || "",
        email: editingRecord.email || "",
        address: editingRecord.address || "",
        advanceReceiptId: editingRecord.advanceReceiptId || "",
        advanceReceiptNumber: editingRecord.advanceReceiptNumber || "",
        advanceReceiptDate: editingRecord.advanceReceiptDate
          ? String(editingRecord.advanceReceiptDate).slice(0, 10)
          : "",
        advanceAmount: editingRecord.advanceAmount !== undefined ? String(editingRecord.advanceAmount) : "",
        advanceAdjustedAmount: editingRecord.advanceAdjustedAmount !== undefined ? String(editingRecord.advanceAdjustedAmount) : "",
        advanceRefundedAmount: editingRecord.advanceRefundedAmount !== undefined ? String(editingRecord.advanceRefundedAmount) : "",
        amount:
          editingRecord.amount !== undefined ? String(editingRecord.amount) : "",
        refundMethod: editingRecord.refundMethod || "",
        bankName: editingRecord.bankName || "",
        chequeNumber: editingRecord.chequeNumber || "",
        referenceNumber: editingRecord.referenceNumber || "",
        note: editingRecord.note || "",
        financialYear:
          editingRecord.financialYear || selectedFinancialYear || "ALL",
      });
      setErrors({});
      return;
    }

    const today = new Date().toISOString().slice(0, 10);
    setFormData({
      refundNumber: "",
      refundDate: today,
      clientRefId: "",
      clientId: "",
      clientName: "",
      businessName: "",
      gstin: "",
      phoneNumber: "",
      email: "",
      address: "",
      advanceReceiptId: "",
      advanceReceiptNumber: "",
      advanceReceiptDate: "",
      advanceAmount: "",
      advanceAdjustedAmount: "",
      advanceRefundedAmount: "",
      amount: "",
      refundMethod: "",
      bankName: "",
      chequeNumber: "",
      referenceNumber: "",
      note: "",
      financialYear: selectedFinancialYear || "ALL",
    });
    setErrors({});
  }, [editingRecord, show, selectedFinancialYear]);

  useEffect(() => {
    if (!show || editingRecord) return;

    const generateNumber = async () => {
      setIsGeneratingNumber(true);
      try {
        const response = await apiGet(
          API_ENDPOINTS.PAYMENT_REFUNDS.NEXT_NUMBER(formData.financialYear),
        );
        const nextNumber =
          response?.data?.nextNumber || response?.data?.refundNumber || "";
        const resolvedYear = response?.data?.financialYear || formData.financialYear;
        setFormData((prev) => ({
          ...prev,
          refundNumber: nextNumber,
          financialYear: resolvedYear,
        }));
      } catch (error) {
        console.error("Failed to generate refund number:", error);
      } finally {
        setIsGeneratingNumber(false);
      }
    };

    generateNumber();
  }, [editingRecord, formData.financialYear, show]);

  useEffect(() => {
    if (!show || !formData.clientRefId) {
      setAdvanceOptions([]);
      return;
    }

    const loadAdvances = async () => {
      setIsAdvancesLoading(true);
      try {
        const response = await apiGet(
          API_ENDPOINTS.PAYMENT_RECEIPTS.AVAILABLE_ADVANCES(
            formData.clientRefId || formData.clientId || "",
          ),
        );
        const advances = Array.isArray(response?.data?.advances)
          ? response.data.advances
          : [];

        setAdvanceOptions(
          advances.map((advance) => ({
            ...advance,
            id: advance.id || advance.advanceReceiptId,
            advanceReceiptId: advance.id || advance.advanceReceiptId,
            advanceReceiptDate: advance.receiptDate || "",
            advanceAmount: advance.amount || 0,
          })),
        );
      } catch (error) {
        console.error("Failed to load advance receipts:", error);
        setAdvanceOptions([]);
      } finally {
        setIsAdvancesLoading(false);
      }
    };

    loadAdvances();
  }, [show, formData.clientRefId, formData.clientId]);

  useEffect(() => {
    if (!editingRecord || !show) return;
    if (!formData.clientRefId) return;

    const loadAdvancesForEdit = async () => {
      setIsAdvancesLoading(true);
      try {
        const response = await apiGet(
          API_ENDPOINTS.PAYMENT_RECEIPTS.AVAILABLE_ADVANCES(
            formData.clientRefId || formData.clientId || "",
          ),
        );
        const advances = Array.isArray(response?.data?.advances)
          ? response.data.advances
          : [];
        let mapped = advances.map((advance) => ({
          ...advance,
          id: advance.id || advance.advanceReceiptId,
          advanceReceiptId: advance.id || advance.advanceReceiptId,
          advanceReceiptDate: advance.receiptDate || "",
          advanceAmount: advance.amount || 0,
        }));

        // If the advance linked to the editing record is not returned (maybe fully consumed),
        // fetch it directly and include it so the editing workflow can still show the original
        // advance while preventing selection changes.
        const editingAdvanceId = String(editingRecord.advanceReceiptId || "").trim();
        const found = mapped.find(
          (a) => String(a.id || a.advanceReceiptId || "") === editingAdvanceId,
        );

        if (!found && editingAdvanceId) {
          try {
            const singleResp = await apiGet(
              API_ENDPOINTS.PAYMENT_RECEIPTS.GET(editingAdvanceId),
            );
            const single = singleResp?.data || singleResp?.data?.receipt || null;
            if (single) {
              mapped = [
                {
                  ...single,
                  id: single._id || single.id || editingAdvanceId,
                  advanceReceiptId: single._id || single.id || editingAdvanceId,
                  availableAmount:
                    Number(single.amount || 0) -
                    Number(single.adjustedAmount || 0) -
                    Number(single.refundedAmount || 0),
                },
                ...mapped,
              ];
            }
          } catch (err) {
            // ignore fetch error for the single receipt
          }
        }

        setAdvanceOptions(mapped);
      } catch (error) {
        console.error("Failed to load advance receipts:", error);
        setAdvanceOptions([]);
      } finally {
        setIsAdvancesLoading(false);
      }
    };

    loadAdvancesForEdit();
  }, [editingRecord, formData.clientRefId, formData.clientId, show]);

  const clientOptions = useMemo(
    () =>
      clients.map((client) => ({
        value: client.clientId || client.id || client._id,
        label: `${client.clientName || "Unnamed Client"}${client.clientId ? ` (${client.clientId})` : ""}`,
        client,
      })),
    [clients],
  );

  const advanceReceiptOptions = useMemo(
    () => {
      const filtered = advanceOptions.filter((advance) => {
        const available = toNumber(advance.availableAmount);
        if (editingRecord) {
          const advId = String(advance.advanceReceiptId || advance.id || "");
          const editingAdvId = String(editingRecord.advanceReceiptId || "");
          if (advId && editingAdvId && advId === editingAdvId) return true;
        }
        return available > 0;
      });

      return filtered.map((advance) => ({
        value: advance.advanceReceiptId || advance.id,
        label: `${advance.receiptNumber || "Advance"} - Available ₹${toNumber(advance.availableAmount).toLocaleString("en-IN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`,
        advance,
      }));
    },
    [advanceOptions, editingRecord],
  );

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    const nextValue = name === "amount" ? sanitizeAmountValue(value) : String(value || "");

    setFormData((prev) => ({
      ...prev,
      [name]: nextValue,
    }));

    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: "" }));
    }
  };

  const handleClientChange = (selectedOption) => {
    const selectedClient = selectedOption?.client || null;
    setFormData((prev) => ({
      ...prev,
      clientRefId: selectedOption?.value || "",
      clientId: selectedOption?.value || "",
      clientName: selectedClient?.clientName || "",
      businessName: selectedClient?.businessName || "",
      gstin: selectedClient?.gstin || "",
      phoneNumber: selectedClient?.phoneNumber || "",
      email: selectedClient?.email || "",
      address: selectedClient?.address || "",
      advanceReceiptId: "",
      advanceReceiptNumber: "",
      advanceReceiptDate: "",
      advanceAmount: "",
      advanceAdjustedAmount: "",
      advanceRefundedAmount: "",
      amount: "",
    }));
    setAdvanceOptions([]);
  };

  const handleAdvanceChange = (selectedOption) => {
    const selectedAdvance = selectedOption?.advance || null;
    setFormData((prev) => ({
      ...prev,
      advanceReceiptId: selectedOption?.value || "",
      advanceReceiptNumber: selectedAdvance?.receiptNumber || "",
      advanceReceiptDate: normalizeDateValue(selectedAdvance?.receiptDate || ""),
      advanceAmount: String(selectedAdvance?.amount || ""),
      advanceAdjustedAmount: String(selectedAdvance?.adjustedAmount || ""),
      advanceRefundedAmount: String(selectedAdvance?.refundedAmount || ""),
      amount:
        prev.amount && toNumber(prev.amount) > 0
          ? prev.amount
          : String(selectedAdvance?.availableAmount || ""),
      clientRefId: prev.clientRefId || selectedAdvance?.clientRefId || selectedAdvance?.clientId || "",
      clientId: prev.clientId || selectedAdvance?.clientId || selectedAdvance?.clientRefId || "",
      clientName: prev.clientName || selectedAdvance?.clientName || "",
      businessName: prev.businessName || selectedAdvance?.businessName || "",
      gstin: prev.gstin || selectedAdvance?.gstin || "",
      phoneNumber: prev.phoneNumber || selectedAdvance?.phoneNumber || "",
      email: prev.email || selectedAdvance?.email || "",
      address: prev.address || selectedAdvance?.address || "",
      refundMethod: prev.refundMethod || selectedAdvance?.paymentMethod || "",
    }));
  };

  const handleRefundMethodChange = (selectedOption) => {
    const selectedMethod = selectedOption?.value || "";
    setFormData((prev) => ({
      ...prev,
      refundMethod: selectedMethod,
      bankName: selectedMethod === "Cheque" ? prev.bankName : "",
      chequeNumber: selectedMethod === "Cheque" ? prev.chequeNumber : "",
    }));
  };

  const scrollToField = (fieldId) => {
    const fieldElement = document.getElementById(fieldId);
    if (fieldElement) {
      fieldElement.scrollIntoView({ behavior: "smooth", block: "center" });
      fieldElement.focus();
    }
  };

  const validateForm = () => {
    const nextErrors = {};

    [
      "refundNumber",
      "refundDate",
      "clientName",
      "advanceReceiptId",
      "amount",
      "refundMethod",
    ].forEach((field) => {
      if (!String(formData[field] || "").trim()) {
        nextErrors[field] = `${field
          .replace(/([A-Z])/g, " $1")
          .replace(/^./, (c) => c.toUpperCase())} is required`;
      }
    });

    const amount = toNumber(formData.amount);
    if (amount <= 0) {
      nextErrors.amount = "Refund amount must be greater than zero";
    }

    const maxAllowed = getMaxRefundAmount();
    if (amount > maxAllowed && maxAllowed > 0) {
      nextErrors.amount = `Refund amount cannot exceed ₹${maxAllowed.toFixed(2)}`;
    }

    if (String(formData.refundMethod || "") === "Cheque") {
      if (!String(formData.bankName || "").trim()) {
        nextErrors.bankName = "Bank Name is required for cheque refunds";
      }
      if (!String(formData.chequeNumber || "").trim()) {
        nextErrors.chequeNumber = "Cheque Number is required for cheque refunds";
      }
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      const firstField = Object.keys(nextErrors)[0];
      showError(nextErrors[firstField]);
      setTimeout(() => scrollToField(firstField), 100);
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
      const payload = {
        ...formData,
        amount: toNumber(formData.amount),
      };

      if (editingRecord) {
        await apiPut(
          API_ENDPOINTS.PAYMENT_REFUNDS.UPDATE(editingRecord._id || editingRecord.id),
          payload,
        );
        showSuccess("Refund updated successfully!");
      } else {
        await apiPost(API_ENDPOINTS.PAYMENT_REFUNDS.CREATE, payload);
        showSuccess("Refund created successfully!");
      }

      onSubmit?.(payload);
      onClose?.();
    } catch (error) {
      console.error("Refund save failed:", error);
      showError(
        error?.response?.data?.message ||
          error?.response?.data?.error ||
          "Failed to save refund",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!show) return null;

  const modalTitle = isViewMode
    ? `View Refund - ${editingRecord?.refundNumber || "Refund"}`
    : editingRecord
      ? `Edit Refund - ${editingRecord.refundNumber || "Refund"}`
      : "Add New Refund";

  const clientSelectStyles = getUnifiedSelectStyles({
    hasError: Boolean(errors.clientName),
  });
  const advanceSelectStyles = getUnifiedSelectStyles({
    hasError: Boolean(errors.advanceReceiptId),
  });
  const methodSelectStyles = getUnifiedSelectStyles({
    hasError: Boolean(errors.refundMethod),
  });

  return (
    <div
      className={`modal ${show ? "show d-block" : "d-none"}`}
      tabIndex="-1"
      role="dialog"
      style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
    >
      <div className="modal-dialog modal-xl modal-dialog-scrollable" role="document">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{modalTitle}</h5>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>

          <div className="modal-body">
            <form
              id="refundForm"
              onSubmit={isViewMode ? (e) => e.preventDefault() : handleSubmit}
              noValidate
            >
              <div className="row">
                <div className="col-md-2 mb-3">
                  <label htmlFor="refundNumber" className="form-label">
                    Refund Number <span className="text-danger">*</span>
                  </label>
                  <input
                    id="refundNumber"
                    name="refundNumber"
                    className={`form-control modern-input ${errors.refundNumber ? "is-invalid" : ""}`}
                    value={formData.refundNumber}
                    onChange={handleInputChange}
                    readOnly={Boolean(editingRecord) || isGeneratingNumber || isViewMode}
                    placeholder="Auto generated"
                    required
                  />
                </div>

                <div className="col-md-2 mb-3">
                  <label htmlFor="refundDate" className="form-label">
                    Refund Date <span className="text-danger">*</span>
                  </label>
                  <input
                    type="date"
                    id="refundDate"
                    name="refundDate"
                    className={`form-control modern-input ${errors.refundDate ? "is-invalid" : ""}`}
                    value={formData.refundDate}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                    required
                  />
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="clientName" className="form-label">
                    Client <span className="text-danger">*</span>
                  </label>
                  <Select
                    id="clientName"
                    name="clientName"
                    value={
                      clientOptions.find(
                        (option) => option.value === formData.clientRefId,
                      ) || null
                    }
                    onChange={handleClientChange}
                    options={clientOptions}
                    isLoading={isClientsLoading}
                    isClearable
                    placeholder="Select client"
                    isDisabled={isViewMode}
                    styles={clientSelectStyles}
                  />
                  {errors.clientName && (
                    <div className="invalid-feedback d-block">{errors.clientName}</div>
                  )}
                </div>

                <div className="col-12 mb-1 mt-0">
                  <h6 className="border-bottom pb-1 mb-1">
                    <i className="fas fa-building me-2 text-success"></i>
                    Client Details (Auto-filled)
                  </h6>
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="clientId" className="form-label">Client ID</label>
                  <input
                    type="text"
                    id="clientId"
                    name="clientId"
                    className="form-control modern-input"
                    value={formData.clientId}
                    readOnly
                    style={{ backgroundColor: "#e9ecef" }}
                  />
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="businessName" className="form-label">Business Name</label>
                  <input
                    type="text"
                    id="businessName"
                    name="businessName"
                    className="form-control modern-input"
                    value={formData.businessName}
                    readOnly
                    style={{ backgroundColor: "#e9ecef" }}
                  />
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="gstin" className="form-label">GSTIN</label>
                  <input
                    type="text"
                    id="gstin"
                    name="gstin"
                    className="form-control modern-input"
                    value={formData.gstin}
                    readOnly
                    style={{ backgroundColor: "#e9ecef" }}
                  />
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="phoneNumber" className="form-label">Phone Number</label>
                  <input
                    type="text"
                    id="phoneNumber"
                    name="phoneNumber"
                    className="form-control modern-input"
                    value={formData.phoneNumber}
                    readOnly
                    style={{ backgroundColor: "#e9ecef" }}
                  />
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="email" className="form-label">Email ID</label>
                  <input
                    type="text"
                    id="email"
                    name="email"
                    className="form-control modern-input"
                    value={formData.email}
                    readOnly
                    style={{ backgroundColor: "#e9ecef" }}
                  />
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="address" className="form-label">Address</label>
                  <input
                    type="text"
                    id="address"
                    name="address"
                    className="form-control modern-input"
                    value={formData.address}
                    readOnly
                    style={{ backgroundColor: "#e9ecef" }}
                  />
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="advanceReceiptId" className="form-label">
                    Advance Receipt <span className="text-danger">*</span>
                  </label>
                  <Select
                    id="advanceReceiptId"
                    name="advanceReceiptId"
                    value={
                      advanceReceiptOptions.find(
                        (option) => option.value === formData.advanceReceiptId,
                      ) || null
                    }
                    onChange={handleAdvanceChange}
                    options={advanceReceiptOptions}
                    isLoading={isAdvancesLoading}
                    isClearable
                    placeholder={
                      formData.clientRefId
                        ? "Select advance receipt"
                        : "Select client first"
                    }
                    isDisabled={isViewMode || !formData.clientRefId || Boolean(editingRecord)}
                    styles={advanceSelectStyles}
                  />
                  {errors.advanceReceiptId && (
                    <div className="invalid-feedback d-block">{errors.advanceReceiptId}</div>
                  )}
                  {formData.advanceReceiptNumber ? (
                    <small className="text-muted">
                      Selected advance: {formData.advanceReceiptNumber}
                    </small>
                  ) : null}
                </div>

                <div className="col-12 mb-1 mt-0">
                  <h6 className="border-bottom pb-1 mb-1">
                    <i className="fas fa-receipt me-2 text-info"></i>
                    Advance Receipt Details (Auto-filled)
                  </h6>
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="advanceReceiptDate" className="form-label">Payment Receipt Date</label>
                  <input
                    type="date"
                    id="advanceReceiptDate"
                    name="advanceReceiptDate"
                    className="form-control modern-input"
                    value={formData.advanceReceiptDate}
                    readOnly
                    style={{ backgroundColor: "#e9ecef" }}
                  />
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="advanceReceiptNumber" className="form-label">Payment Receipt Number</label>
                  <input
                    type="text"
                    id="advanceReceiptNumber"
                    name="advanceReceiptNumber"
                    className="form-control modern-input"
                    value={formData.advanceReceiptNumber}
                    readOnly
                    style={{ backgroundColor: "#e9ecef" }}
                  />
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="advanceAmount" className="form-label">Payment Receipt Amount</label>
                  <input
                    type="text"
                    id="advanceAmount"
                    name="advanceAmount"
                    className="form-control modern-input"
                    value={formData.advanceAmount}
                    readOnly
                    style={{ backgroundColor: "#e9ecef" }}
                  />
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="amount" className="form-label">
                    Refund Amount <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    id="amount"
                    name="amount"
                    inputMode="decimal"
                    pattern="\d*(\.\d*)?"
                    className={`form-control modern-input ${errors.amount ? "is-invalid" : ""}`}
                    value={formData.amount}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                    placeholder="0.00"
                    required
                    aria-required="true"
                  />
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="refundMethod" className="form-label">
                    Refund Method <span className="text-danger">*</span>
                  </label>
                  <Select
                    id="refundMethod"
                    name="refundMethod"
                    value={
                      refundMethodOptions
                        .map((option) => ({ value: option, label: option }))
                        .find((option) => option.value === formData.refundMethod) || null
                    }
                    onChange={handleRefundMethodChange}
                    options={refundMethodOptions.map((option) => ({
                      value: option,
                      label: option,
                    }))}
                    isClearable
                    isDisabled={isViewMode}
                    placeholder="Select refund method"
                    styles={methodSelectStyles}
                  />
                  {errors.refundMethod && (
                    <div className="invalid-feedback d-block">{errors.refundMethod}</div>
                  )}
                </div>

                {isChequeMethod ? (
                  <>
                    <div className="col-12 mb-2 mt-1">
                      <h6 className="border-bottom pb-2 mb-3">
                        <i className="fas fa-university me-2 text-warning"></i>
                        Cheque Details
                      </h6>
                    </div>

                    <div className="col-md-4 mb-3">
                      <label htmlFor="bankName" className="form-label">
                        Bank Name <span className="text-danger">*</span>
                      </label>
                      <input
                        id="bankName"
                        name="bankName"
                        className={`form-control modern-input ${errors.bankName ? "is-invalid" : ""}`}
                        value={formData.bankName}
                        onChange={handleInputChange}
                        readOnly={isViewMode}
                        placeholder="If refund via cheque"
                        required
                      />
                      {errors.bankName && (
                        <div className="invalid-feedback d-block">{errors.bankName}</div>
                      )}
                    </div>

                    <div className="col-md-4 mb-3">
                      <label htmlFor="chequeNumber" className="form-label">
                        Cheque Number <span className="text-danger">*</span>
                      </label>
                      <input
                        id="chequeNumber"
                        name="chequeNumber"
                        className={`form-control modern-input ${errors.chequeNumber ? "is-invalid" : ""}`}
                        value={formData.chequeNumber}
                        onChange={handleInputChange}
                        readOnly={isViewMode}
                        required
                      />
                      {errors.chequeNumber && (
                        <div className="invalid-feedback d-block">{errors.chequeNumber}</div>
                      )}
                    </div>
                  </>
                ) : null}

                <div className="col-md-4 mb-3">
                  <label htmlFor="referenceNumber" className="form-label">
                    Reference Number
                  </label>
                  <input
                    id="referenceNumber"
                    name="referenceNumber"
                    className="form-control modern-input"
                    value={formData.referenceNumber}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                    placeholder="UTR / transaction id"
                  />
                </div>

                <div className="col-md-12 mb-3">
                  <label htmlFor="note" className="form-label">
                    Note
                  </label>
                  <textarea
                    id="note"
                    name="note"
                    className="form-control modern-input"
                    rows="2"
                    value={formData.note}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                    placeholder="Optional refund note"
                  />
                </div>
              </div>

              <div className="d-flex justify-content-end gap-2 pt-2">
                <button type="button" className="btn btn-light" onClick={onClose}>
                  {isViewMode ? "Close" : "Cancel"}
                </button>
                {!isViewMode ? (
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={submitting || isGeneratingNumber}
                  >
                    {submitting ? "Saving..." : editingRecord ? "Update Refund" : "Create Refund"}
                  </button>
                ) : null}
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateRefund;
