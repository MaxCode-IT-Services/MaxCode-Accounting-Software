import React, { useEffect, useMemo, useRef, useState } from "react";
import Select from "react-select";
import ReusableTable from "../Components/ReusableTable";
import ConfirmationModal from "../Components/ConfirmationModal";
import { showError, showSuccess } from "../Components/ToastNotification";
import { apiGet, apiPost, apiPut, apiDelete } from "../utils/api";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { getUnifiedSelectStyles } from "../utils/reactSelectStyles";
import {
  fetchSelectableClients,
  filterActiveSelectableRows,
} from "../utils/fetchAllEntities";
import { hasActionPermission } from "../utils/permissions";

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

const REFUND_DATE_FILTER_KEYS = ["refundDate", "advanceReceiptDate", "createdDateTime"];

const formatDateTimeForDisplay = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

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

  return `${day}-${month}-${year} | ${formattedHours}:${minutes}:${seconds} ${ampm}`;
};

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

  const formatDateTimeForDisplay = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const sanitizeAmountValue = (raw) => {
    let v = String(raw || "");
    v = v.replace(/[^\d.]/g, "");
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
    const editingAmount = editingRecord
      ? toNumber(editingRecord.amount || 0)
      : 0;

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
        const nextNumber = response?.data?.nextNumber || response?.data?.refundNumber || "";
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
    () =>
      advanceOptions.map((advance) => ({
        value: advance.advanceReceiptId || advance.id,
        label: `${advance.receiptNumber || "Advance"} - Available ₹${toNumber(advance.availableAmount).toLocaleString("en-IN", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`,
        advance,
      })),
    [advanceOptions],
  );

  const refundMethodOptions = PAYMENT_METHOD_OPTIONS;

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    const nextValue = name === "amount" ? sanitizeAmountValue(value) : String(value || "");

    setFormData((prev) => ({
      ...prev,
      [name]: nextValue,
    }));

    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: "",
      }));
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

  // Helpers to resolve the select option objects for client and advance when editing/viewing
  const resolveClientOptionValue = () => {
    const candidates = [formData.clientRefId, formData.clientId, editingRecord?.clientRefId, editingRecord?.clientId].map((v) => String(v || "").trim()).filter(Boolean);
    if (!candidates.length) return null;
    return clientOptions.find((opt) => {
      const val = String(opt.value || "").trim();
      if (candidates.includes(val)) return true;
      const client = opt.client || {};
      if (String(client.clientId || "").trim() && candidates.includes(String(client.clientId || "").trim())) return true;
      if (String(client._id || client.id || "").trim() && candidates.includes(String(client._id || client.id || "").trim())) return true;
      return false;
    }) || null;
  };

  const resolveAdvanceOptionValue = () => {
    const candidates = [formData.advanceReceiptId, formData.advanceReceiptNumber, editingRecord?.advanceReceiptId, editingRecord?.advanceReceiptNumber].map((v) => String(v || "").trim()).filter(Boolean);
    if (!candidates.length) return null;
    return advanceReceiptOptions.find((opt) => {
      const val = String(opt.value || "").trim();
      if (candidates.includes(val)) return true;
      const adv = opt.advance || {};
      if (String(adv.advanceReceiptId || adv.id || adv._id || "").trim() && candidates.includes(String(adv.advanceReceiptId || adv.id || adv._id || "").trim())) return true;
      if (String(adv.receiptNumber || "").trim() && candidates.includes(String(adv.receiptNumber || "").trim())) return true;
      return false;
    }) || null;
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

    ["refundNumber", "refundDate", "clientName", "advanceReceiptId", "amount", "refundMethod"].forEach(
      (field) => {
        if (!String(formData[field] || "").trim()) {
          if (field === "clientName") {
            nextErrors[field] = "Select Client is required";
          } else {
            nextErrors[field] = `${field
              .replace(/([A-Z])/g, " $1")
              .replace(/^./, (c) => c.toUpperCase())} is required`;
          }
        }
      },
    );

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
        await apiPut(API_ENDPOINTS.PAYMENT_REFUNDS.UPDATE(editingRecord._id || editingRecord.id), payload);
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

  const modalTitle = editingRecord
    ? `Edit Refund - ${editingRecord.refundNumber || "Refund"}`
    : "Add New Refund";

  const clientSelectStyles = getUnifiedSelectStyles({ hasError: Boolean(errors.clientName) });
  const advanceSelectStyles = getUnifiedSelectStyles({ hasError: Boolean(errors.advanceReceiptId) });
  const methodSelectStyles = getUnifiedSelectStyles({ hasError: Boolean(errors.refundMethod) });

  // When in readOnly mode, ensure the displayed select value text is dark like in edit mode
  const clientSelectStylesFinal = readOnly
    ? {
        ...clientSelectStyles,
        singleValue: (base) => ({ ...base, color: "#212529" }),
        placeholder: (base) => ({ ...base, color: "#6c757d" }),
      }
    : clientSelectStyles;

  const advanceSelectStylesFinal = readOnly
    ? {
        ...advanceSelectStyles,
        singleValue: (base) => ({ ...base, color: "#212529" }),
        placeholder: (base) => ({ ...base, color: "#6c757d" }),
      }
    : advanceSelectStyles;

  const methodSelectStylesFinal = readOnly
    ? {
        ...methodSelectStyles,
        singleValue: (base) => ({ ...base, color: "#212529" }),
        placeholder: (base) => ({ ...base, color: "#6c757d" }),
      }
    : methodSelectStyles;

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
            <form id="refundForm" onSubmit={handleSubmit} noValidate>
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
                    readOnly={Boolean(readOnly) || isGeneratingNumber}
                    disabled={isGeneratingNumber}
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
                    readOnly={Boolean(readOnly)}
                    required
                  />
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="clientName" className="form-label">
                    Select Client <span className="text-danger">*</span>
                  </label>
                  <Select
                    id="clientName"
                    name="clientName"
                    value={resolveClientOptionValue() || clientOptions.find((option) => option.value === formData.clientRefId) || null}
                    onChange={handleClientChange}
                    options={clientOptions}
                    isLoading={isClientsLoading}
                    isClearable={!readOnly}
                    isDisabled={isClientsLoading || Boolean(readOnly)}
                    placeholder="Select client"
                    styles={clientSelectStylesFinal}
                  />
                  {errors.clientName && (
                    <div className="invalid-feedback d-block">{errors.clientName}</div>
                  )}
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="advanceReceiptId" className="form-label">
                    Advance Receipt <span className="text-danger">*</span>
                  </label>
                  <Select
                    id="advanceReceiptId"
                    name="advanceReceiptId"
                    value={resolveAdvanceOptionValue() || advanceReceiptOptions.find((option) => option.value === formData.advanceReceiptId) || null}
                    onChange={handleAdvanceChange}
                    options={advanceReceiptOptions}
                    isLoading={isAdvancesLoading}
                    isClearable={!readOnly}
                    placeholder={formData.clientRefId ? (readOnly ? "Selected advance" : "Select advance receipt") : "Select client first"}
                    isDisabled={!formData.clientRefId || Boolean(readOnly)}
                    styles={advanceSelectStylesFinal}
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
                    <i className="fas fa-building me-2 text-success"></i>
                    Client Details (Auto-filled)
                  </h6>
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="clientId" className="form-label"> Client ID</label>
                  <input
                    type="text"
                    id="clientId"
                    name="clientId"
                    className="form-control modern-input"
                    value={formData.clientId}
                    readOnly
                    style={{ backgroundColor: "#e9ecef", color: "#212529" }}
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
                    style={{ backgroundColor: "#e9ecef", color: "#212529" }}
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
                    style={{ backgroundColor: "#e9ecef", color: "#212529" }}
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
                    style={{ backgroundColor: "#e9ecef", color: "#212529" }}
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
                    style={{ backgroundColor: "#e9ecef", color: "#212529" }}
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
                    style={{ backgroundColor: "#e9ecef", color: "#212529" }}
                  />
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
                    style={{ backgroundColor: "#e9ecef", color: "#212529" }}
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
                    style={{ backgroundColor: "#e9ecef", color: "#212529" }}
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
                    style={{ backgroundColor: "#e9ecef", color: "#212529" }}
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
                    readOnly={Boolean(readOnly)}
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
                    isClearable={!readOnly}
                    isDisabled={Boolean(readOnly)}
                    placeholder={readOnly ? "Selected method" : "Select refund method"}
                    styles={methodSelectStylesFinal}
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
                        readOnly={readOnly}
                        disabled={readOnly}
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
                    readOnly={readOnly}
                    disabled={readOnly}
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
                    readOnly={readOnly}
                    disabled={readOnly}
                    placeholder="Optional refund note"
                  />
                </div>
              </div>

              <div className="d-flex justify-content-end gap-2 pt-2">
                <button type="button" className="btn btn-light" onClick={onClose}>
                  {readOnly ? "Close" : "Cancel"}
                </button>
                {!readOnly && (
                  <button type="submit" className="btn btn-primary" disabled={submitting || isGeneratingNumber}>
                    {submitting ? "Saving..." : editingRecord ? "Update Refund" : "Create Refund"}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

const RefundManagement = () => {
  const moduleKey = "refundManagement";
  const canCreate = hasActionPermission(moduleKey, "create");

  const [serverSide, setServerSide] = useState(true);
  const [prefLoading, setPrefLoading] = useState(true);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(10);
  const [filters, setFilters] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState("refundNumber");
  const [sortDirection, setSortDirection] = useState("descending");
  const [selectedFinancialYear, setSelectedFinancialYear] = useState(
    localStorage.getItem("selectedFinancialYear") || "ALL",
  );
  const [activeCardFilter, setActiveCardFilter] = useState("total");
  const [statistics, setStatistics] = useState({
    total: 0,
    partial: 0,
    full: 0,
    cash: 0,
    bank: 0,
    totalAmount: 0,
    fullAmount: 0,
    partialAmount: 0,
    cashAmount: 0,
    bankAmount: 0,
  });
  const [dynamicFilterOptions, setDynamicFilterOptions] = useState({});

  const debounceTimeoutRef = useRef(null);
  const debounceColumnTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null);

  useEffect(() => {
    document.title = "Refund Management | MaxCode IT Services";
    const fetchPreference = async () => {
      try {
        const res = await apiGet("/user-preferences");
        if (typeof res.data?.refundManagementServerSide === "boolean") {
          setServerSide(res.data.refundManagementServerSide);
        }
      } catch {
      } finally {
        setPrefLoading(false);
      }
    };
    fetchPreference();
  }, []);

  useEffect(() => {
    if (prefLoading) return;
    const save = async () => {
      try {
        await apiPost("/user-preferences", {
          refundManagementServerSide: serverSide,
        });
      } catch {}
    };
    save();
  }, [serverSide, prefLoading]);

  useEffect(() => {
    const handler = (event) => {
      const selectedYear =
        event?.detail?.selectedFinancialYear ||
        localStorage.getItem("selectedFinancialYear") ||
        "ALL";
      setSelectedFinancialYear(selectedYear);
      if (serverSide) setCurrentPage(1);
    };
    window.addEventListener("financialYearSelectionChanged", handler);
    return () =>
      window.removeEventListener("financialYearSelectionChanged", handler);
  }, [serverSide]);

  const fetchRefunds = async () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (prefLoading) return;
    setLoading(true);

    try {
      let url = API_ENDPOINTS.PAYMENT_REFUNDS.LIST;
      const params = new URLSearchParams();

      if (serverSide) {
        params.append("page", currentPage);
        params.append("limit", recordsPerPage);
        if (searchTerm) params.append("search", searchTerm);
        if (selectedFinancialYear && selectedFinancialYear !== "ALL") {
          params.append("financialYear", selectedFinancialYear);
        }
        if (activeCardFilter && activeCardFilter !== "total" && activeCardFilter !== "addNew") {
          params.append("filter", activeCardFilter);
        }
        Object.entries(filters).forEach(([key, value]) => {
          if (["sn", "action"].includes(key)) return;
          if (
            value === undefined ||
            value === null ||
            value === "" ||
            value === "All"
          )
            return;
          if (REFUND_DATE_FILTER_KEYS.includes(key) && value && typeof value === "object") {
            const backendKey = key === "createdDateTime" ? "createdAt" : key;
            if (value.startDate) params.append(`${backendKey}_start`, value.startDate);
            if (value.endDate) params.append(`${backendKey}_end`, value.endDate);
            return;
          }
          params.append(key, value);
        });
        params.append("sortBy", sortField || "refundNumber");
        params.append("sortOrder", sortDirection === "ascending" ? "asc" : "desc");
        params.append("includeMeta", "true");
        url = `${url}?${params.toString()}`;
      } else {
        params.append("limit", "all");
        if (selectedFinancialYear && selectedFinancialYear !== "ALL") {
          params.append("financialYear", selectedFinancialYear);
        }
        params.append("includeMeta", "true");
        url = `${url}?${params.toString()}`;
      }

      const response = await apiGet(url, { signal: controller.signal });
      const payload = response?.data || {};
      const data = Array.isArray(payload.records) ? payload.records : [];
      const total = payload.total || data.length;

      // Build dynamic filter options (refund methods and createdBy)

      const mapped = data.map((record, index) => {
        const amount = Number(record.amount || 0);
        const status = String(record.status || "").trim() || (amount > 0 ? "Partial Refund" : "Pending");
        return {
          ...record,
          id: record._id || record.id,
          sn: (currentPage - 1) * recordsPerPage + index + 1,
          refundDate: record.refundDate ? String(record.refundDate).slice(0, 10) : "",
          advanceReceiptDate: record.advanceReceiptDate ? String(record.advanceReceiptDate).slice(0, 10) : "",
          advanceAmountFormatted: `₹${Number(record.advanceAmount || 0).toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`,
          advanceAdjustedAmountFormatted: `₹${Number(record.advanceAdjustedAmount || 0).toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`,
          advanceRefundedAmountFormatted: `₹${Number(record.advanceRefundedAmount || 0).toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`,
          amountFormatted: `₹${amount.toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`,
          createdBy: record.createdBy || record.createdByName || "-",
          createdDateTime: formatDateTimeForDisplay(record.createdAt || record.createdDateTime),
          statusBadge: status,
          refundMethodBadge: record.refundMethod || "-",
        };
      });

      // Prepare dynamic filter options for refundMethod and createdBy
      const refundMethods = payload.meta?.refundMethods
        ? Array.isArray(payload.meta.refundMethods)
          ? payload.meta.refundMethods
          : []
        : Array.from(
            new Set(data.map((record) => String(record.refundMethod || "").trim()).filter(Boolean)),
          ).sort((a, b) => a.localeCompare(b));

      const createdByList = payload.meta?.createdBy
        ? Array.isArray(payload.meta.createdBy)
          ? payload.meta.createdBy
          : []
        : Array.from(new Set(mapped.map((r) => String(r.createdBy || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));

      setDynamicFilterOptions({
        refundMethod: ["All", ...refundMethods],
        createdBy: ["All", ...createdByList],
      });

      const totals = serverSide && payload.statistics
        ? payload.statistics
        : mapped.reduce(
            (acc, record) => {
              const amount = Number(record.amount || 0);
              const statusValue = String(record.statusBadge || "").toLowerCase();
              const methodValue = String(record.refundMethodBadge || "").toLowerCase();
              acc.totalAmount += amount;
              if (statusValue.includes("full")) {
                acc.full += 1;
                acc.fullAmount += amount;
              } else if (statusValue.includes("partial")) {
                acc.partial += 1;
                acc.partialAmount += amount;
              }
              if (methodValue === "cash") {
                acc.cash += 1;
                acc.cashAmount += amount;
              }
              if (methodValue.includes("bank")) {
                acc.bank += 1;
                acc.bankAmount += amount;
              }
              return acc;
            },
            {
              total: mapped.length,
              partial: 0,
              full: 0,
              cash: 0,
              bank: 0,
              totalAmount: 0,
              fullAmount: 0,
              partialAmount: 0,
              cashAmount: 0,
              bankAmount: 0,
            },
          );

      setStatistics({
        total: totals.total || mapped.length,
        partial: totals.partial || 0,
        full: totals.full || 0,
        cash: totals.cash || 0,
        bank: totals.bank || 0,
        totalAmount: totals.totalAmount || 0,
        fullAmount: totals.fullAmount || 0,
        partialAmount: totals.partialAmount || 0,
        cashAmount: totals.cashAmount || 0,
        bankAmount: totals.bankAmount || 0,
      });
      setRecords(mapped);
      setTotalRecords(total);
    } catch (error) {
      if (error.name === "CanceledError" || error.name === "AbortError") return;
      console.error("Failed to fetch refunds:", error);
      showError("Failed to fetch refunds");
      setRecords([]);
      setTotalRecords(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (prefLoading) return;
    fetchRefunds();
    return () => {
      if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
      if (debounceColumnTimeoutRef.current) clearTimeout(debounceColumnTimeoutRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefLoading, serverSide, currentPage, recordsPerPage, searchTerm, filters, sortField, sortDirection, selectedFinancialYear, activeCardFilter]);

  const preparedData = useMemo(() => {
    return records.map((record, index) => ({
      ...record,
      sn: (currentPage - 1) * recordsPerPage + index + 1,
    }));
  }, [records, currentPage, recordsPerPage]);

  const filteredClientSideData = useMemo(() => {
    let data = preparedData.filter((record) => record.isDeleted !== true);

    if (!serverSide) {
      if (activeCardFilter === "full") {
        data = data.filter((record) =>
          String(record.statusBadge || "").toLowerCase().includes("full"),
        );
      } else if (activeCardFilter === "partial") {
        data = data.filter((record) =>
          String(record.statusBadge || "").toLowerCase().includes("partial"),
        );
      } else if (activeCardFilter === "cash") {
        data = data.filter(
          (record) => String(record.refundMethodBadge || "").toLowerCase() === "cash",
        );
      } else if (activeCardFilter === "bank") {
        data = data.filter((record) =>
          String(record.refundMethodBadge || "").toLowerCase().includes("bank"),
        );
      }

      Object.entries(filters).forEach(([key, value]) => {
        if (value === undefined || value === null || value === "") return;
        const values = Array.isArray(value) ? value : [value];
        data = data.filter((row) => {
          const rowValue = row[key];
          return values.some((item) =>
            String(rowValue || "").toLowerCase().includes(String(item || "").toLowerCase()),
          );
        });
      });

      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        data = data.filter((row) =>
          [
            row.refundNumber,
            row.refundDate,
            row.clientName,
            row.advanceReceiptNumber,
            row.amountFormatted,
            row.refundMethodBadge,
            row.statusBadge,
          ]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(term)),
        );
      }
    }

    return data;
  }, [preparedData, activeCardFilter, filters, searchTerm, serverSide]);

  const cards = [
    { icon: "fa-solid fa-rotate-right", title: "Total Refunds", key: "total", color: "primary", amount: statistics.totalAmount },
    { icon: "fas fa-circle-check", title: "Full Refunds", key: "full", color: "success", amount: statistics.fullAmount },
    { icon: "fa-solid fa-circle-half-stroke", title: "Partial Refunds", key: "partial", color: "warning", amount: statistics.partialAmount },
    { icon: "fa-solid fa-money-bill-wave", title: "Cash Refunds", key: "cash", color: "info", amount: statistics.cashAmount },
    { icon: "fa-solid fa-building-columns", title: "Bank Refunds", key: "bank", color: "danger", amount: statistics.bankAmount },
    { icon: "fas fa-plus-circle", title: "Add New Refund", key: "addNew", color: "success" },
  ];

  const handleCardClick = (cardKey) => {
    if (cardKey === "addNew") {
      if (!canCreate) {
        showError("You don't have permission to add refund records");
        return;
      }
      setEditingRecord(null);
      setShowCreateForm(true);
      return;
    }

    setActiveCardFilter(cardKey);
    if (serverSide) {
      setCurrentPage(1);
    }
  };

  const getCardNumber = (index) => (index % 8) + 1;

  const formatCurrency = (value) =>
    `₹${Number(value || 0).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const filterOptions = useMemo(() => {
    const methods = dynamicFilterOptions.refundMethod || [
      "All",
      ...Array.from(new Set(records.map((record) => record.refundMethodBadge).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b),
      ),
    ];
    const createdByOptions = dynamicFilterOptions.createdBy || [
      "All",
      ...Array.from(new Set(records.map((record) => record.createdBy).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    ];
    return {
      refundMethod: methods,
      createdBy: createdByOptions,
    };
  }, [dynamicFilterOptions, records]);

  const columns = [
    { key: "sn", label: "S.N", sortable: false, filterable: false, width: 70, resizable: true },
    {
      key: "refundNumber",
      label: "Refund Number",
      sortable: true,
      filterable: true,
      filterType: "search",
      width: 180,
      resizable: true,
    },
    {
      key: "refundDate",
      label: "Refund Date",
      sortable: true,
      filterable: true,
      filterType: "date",
      width: 130,
      resizable: true,
    },
    {
      key: "clientName",
      label: "Client Name",
      sortable: true,
      filterable: true,
      filterType: "search",
      width: 180,
      resizable: true,
    },
    {
      key: "clientId",
      label: "Client ID",
      sortable: true,
      filterable: true,
      filterType: "search",
      width: 150,
      resizable: true,
    },
    {
      key: "businessName",
      label: "Business Name",
      sortable: true,
      filterable: true,
      filterType: "search",
      width: 180,
      resizable: true,
    },
    {
      key: "gstin",
      label: "GSTIN",
      sortable: true,
      filterable: true,
      filterType: "search",
      width: 160,
      resizable: true,
    },
    {
      key: "phoneNumber",
      label: "Phone Number",
      sortable: true,
      filterable: true,
      filterType: "search",
      width: 150,
      resizable: true,
    },
    {
      key: "email",
      label: "Email ID",
      sortable: true,
      filterable: true,
      filterType: "search",
      width: 200,
      resizable: true,
    },
    {
      key: "address",
      label: "Address",
      sortable: true,
      filterable: true,
      filterType: "search",
      width: 220,
      resizable: true,
    },
    {
      key: "advanceReceiptNumber",
      label: "Advance Receipt Number",
      sortable: true,
      filterable: true,
      filterType: "search",
      width: 180,
      resizable: true,
    },
    {
      key: "advanceReceiptDate",
      label: "Advance Receipt Date",
      sortable: true,
      filterable: true,
      filterType: "date",
      width: 140,
      resizable: true,
    },
    {
      key: "advanceAmountFormatted",
      label: "Advance Amount",
      sortable: true,
      filterable: true,
      filterType: "search",
      width: 150,
      resizable: true,
    },
    {
      key: "advanceAdjustedAmountFormatted",
      label: "Advance Adjusted Amount",
      sortable: true,
      filterable: true,
      filterType: "search",
      width: 180,
      resizable: true,
    },
    {
      key: "advanceRefundedAmountFormatted",
      label: "Advance Refunded Amount",
      sortable: true,
      filterable: true,
      filterType: "search",
      width: 180,
      resizable: true,
    },
    {
      key: "amountFormatted",
      label: "Refund Amount",
      sortable: true,
      filterable: true,
      filterType: "search",
      width: 140,
      resizable: true,
    },
    {
      key: "refundMethodBadge",
      label: "Refund Method",
      sortable: true,
      filterable: true,
      filterType: "dropdown",
      filterOptions: filterOptions.refundMethod,
      width: 150,
      resizable: true,
    },
    {
      key: "createdBy",
      label: "Created By",
      sortable: true,
      filterable: true,
      filterType: "search",
      width: 160,
      resizable: true,
      render: (value) => value || "-",
    },
    {
      key: "createdDateTime",
      label: "Create Date & Time",
      sortable: true,
      filterable: true,
      filterType: "dateRange",
      width: 190,
      resizable: true,
      render: (value) => value || "-",
    },
    {
      key: "referenceNumber",
      label: "Reference Number",
      sortable: true,
      filterable: true,
      filterType: "search",
      width: 180,
      resizable: true,
    },
    {
      key: "bankName",
      label: "Bank Name",
      sortable: true,
      filterable: true,
      filterType: "search",
      width: 170,
      resizable: true,
    },
    {
      key: "chequeNumber",
      label: "Cheque Number",
      sortable: true,
      filterable: true,
      filterType: "search",
      width: 170,
      resizable: true,
    },
    {
      key: "action",
      label: "Action",
      sortable: false,
      filterable: false,
      width: 170,
      resizable: true,
    },
  ];

  const handleDebouncedSearch = (term) => {
    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
    debounceTimeoutRef.current = setTimeout(() => {
      setSearchTerm(term);
      setCurrentPage(1);
    }, 300);
  };

  const handleDebouncedColumnFilterChange = (nextFilters) => {
    if (debounceColumnTimeoutRef.current) clearTimeout(debounceColumnTimeoutRef.current);
    debounceColumnTimeoutRef.current = setTimeout(() => {
      setFilters(nextFilters);
      setCurrentPage(1);
    }, 200);
  };

  const handleDelete = async () => {
    if (!recordToDelete) return;
    try {
      await apiDelete(API_ENDPOINTS.PAYMENT_REFUNDS.DELETE(recordToDelete._id || recordToDelete.id));
      showSuccess("Refund deleted successfully");
      setShowDeleteConfirm(false);
      setRecordToDelete(null);
      fetchRefunds();
    } catch (error) {
      showError(error?.response?.data?.error || "Failed to delete refund");
    }
  };

  return (
    <div className="container-fluid">
      <div
        className="py-3 d-flex justify-content-between align-items-center flex-wrap"
        style={{ marginTop: "70px" }}
      >
        <h4 className="fs-18 fw-semibold m-0">Refund Management</h4>

        <div className="form-check form-switch m-0">
          <input
            className="form-check-input"
            type="checkbox"
            checked={serverSide}
            onChange={(e) => {
              setServerSide(e.target.checked);
              setCurrentPage(1);
              setFilters({});
              setSearchTerm("");
              setSortField("refundNumber");
              setSortDirection("descending");
              setActiveCardFilter("total");
            }}
            id="refundServerSideToggle"
          />
          <label className="form-check-label ms-2" htmlFor="refundServerSideToggle">
            Server-side Mode {serverSide ? "(Enabled)" : "(Disabled)"}
          </label>
        </div>
      </div>

      <div className="row">
        {cards.map((card, index) => {
          const cardNumber = getCardNumber(index);
          const cardClass = `card${cardNumber}`;
          const cardIconBgClass = `card-icon-bg${cardNumber}`;
          const isActive = activeCardFilter === card.key && card.key !== "addNew";
          const isAddNewDisabled = card.key === "addNew" && !canCreate;

          return (
            <div key={card.key} className="col-md-6 col-xl-2 mb-4">
              <div
                className={`card border-0 overflow-hidden ${cardClass} modern-card hover-elevate`}
                style={{
                  cursor: isAddNewDisabled ? "not-allowed" : "pointer",
                  opacity: isAddNewDisabled ? 0.6 : 1,
                  borderRadius: "12px",
                  height: "100%",
                  border: isActive ? "2px solid #0d6efd" : undefined,
                }}
                onClick={() => !isAddNewDisabled && handleCardClick(card.key)}
              >
                <div className="card-body text-center p-2">
                  <div className="mb-3 mt-2 d-flex justify-content-center">
                    <span
                      className={`avatar-md rounded-circle ${cardIconBgClass} d-inline-flex justify-content-center align-items-center kpi-icon`}
                      style={{ width: "56px", height: "56px" }}
                    >
                      <i className={`${card.icon} fs-4 text-white`} />
                    </span>
                  </div>
                  <h5 className="mb-2 fw-bold">{card.title}</h5>
                  <h6 className="mb-0 text-muted fw-bold">
                    {card.key === "addNew"
                      ? "+ Add New"
                      : card.amount !== undefined
                        ? formatCurrency(card.amount)
                        : 0}
                  </h6>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <ReusableTable
        moduleKey={moduleKey}
        columns={columns}
        data={filteredClientSideData}
        loading={loading}
        totalRecords={totalRecords}
        tableTitle="Refunds"
        showColumnSelector={true}
        showExport={true}
        showRefresh={true}
        showAdvancedFilter={true}
        enableColumnResizing={true}
        showSearch={true}
        exportFileName="Refunds"
        exportTitle="Refund Report"
        activeCardFilter={activeCardFilter}
        cards={cards}
        fixedColumns={["sn", "action"]}
        defaultVisibleColumns={[
          "sn",
          "refundNumber",
          "refundDate",
          "clientName",
          "businessName",
          "createdBy",
          "createdDateTime",
          "action",
        ]}
        serverSide={serverSide}
        onServerSideSearch={handleDebouncedSearch}
        onServerSideFilter={(nextFilters) => {
          setFilters(nextFilters);
          setCurrentPage(1);
        }}
        onServerSideSort={(field, direction) => {
          setSortField(field);
          setSortDirection(direction);
          setCurrentPage(1);
        }}
        onServerSidePageChange={setCurrentPage}
        onServerSideRecordsPerPageChange={(value) => {
          setRecordsPerPage(value);
          setCurrentPage(1);
        }}
        onColumnFilterChange={handleDebouncedColumnFilterChange}
        currentPage={currentPage}
        recordsPerPage={recordsPerPage}
        onPageChange={setCurrentPage}
        onRecordsPerPageChange={(value) => {
          setRecordsPerPage(value);
          setCurrentPage(1);
        }}
        columnsWithDateFilter={REFUND_DATE_FILTER_KEYS}
        columnsWithDropdownFilter={["refundMethodBadge", "createdBy"]}
        filterOptions={filterOptions}
        ensureCreatedByColumn={true}
        createdByLabel="Created By"
        onRefresh={() => {
          setFilters({});
          setSearchTerm("");
          setSortField("refundNumber");
          setSortDirection("descending");
          setCurrentPage(1);
          setActiveCardFilter("total");
          fetchRefunds();
        }}
        onView={(record) => {
          setEditingRecord({ ...record, isViewMode: true });
          setShowCreateForm(true);
        }}
        onEdit={(record) => {
          setEditingRecord(record);
          setShowCreateForm(true);
        }}
        onDelete={(record) => {
          setRecordToDelete(record);
          setShowDeleteConfirm(true);
        }}
        showActions={true}
        actions={["view", "edit", "delete"]}
      />

      <CreateRefund
        show={showCreateForm}
        onClose={() => {
          setShowCreateForm(false);
          setEditingRecord(null);
        }}
        onSubmit={() => {
          fetchRefunds();
        }}
        editingRecord={editingRecord}
        readOnly={Boolean(editingRecord?.isViewMode)}
        defaultFinancialYear={{ financialYear: selectedFinancialYear }}
      />

      <ConfirmationModal
        show={showDeleteConfirm}
        title="Delete Refund"
        message={`Are you sure you want to delete ${recordToDelete?.refundNumber || "this refund"}?`}
        onConfirm={handleDelete}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setRecordToDelete(null);
        }}
      />
    </div>
  );
};

export default RefundManagement;
