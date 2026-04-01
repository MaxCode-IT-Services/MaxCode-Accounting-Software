import React, { useEffect, useMemo, useState } from "react";
import { showError } from "./ToastNotification";
import { apiGet } from "../utils/api";
import API_ENDPOINTS from "../utils/apiEndpoints";
import {
  isDateWithinFinancialYear,
  normalizeFinancialYearValue,
  resolveFinancialYearRecord,
} from "../utils/financialYearUtils";

const toBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : "";
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });

const RequiredStar = () => <span className="text-danger ms-1">*</span>;

const CreateCompanyExpense = ({
  show,
  onClose,
  onSubmit,
  editingRecord = null,
  defaultFinancialYear = null,
  financialYears = [],
  selectedFinancialYear = "ALL",
}) => {
  const [formData, setFormData] = useState({
    expenseNumber: "",
    expenseDate: "",
    expenseURL: "",
    expenseTitle: "",
    expenseFor: "",
    referenceNumber: "",
    entrySource: "No Bill",
    partyName: "",
    description: "",
    amount: "",
    paymentStatus: "Paid",
    paymentSource: "Business Account",
    paymentMethod: "Cash",
    paymentDate: "",
    paidAmount: "",
    financialYear: "",
    notes: "",
    paymentProof: "",
  });

  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [selectedExpenseFile, setSelectedExpenseFile] = useState(null);

  useEffect(() => {
    if (show) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "auto";
      setSubmitting(false);
    }

    return () => {
      document.body.style.overflow = "auto";
    };
  }, [show]);

  const getActiveFinancialYearRecord = () => {
    return resolveFinancialYearRecord({
      financialYears,
      selectedFinancialYear,
      defaultFinancialYear,
    });
  };

  const resetForm = () => {
    const activeFinancialYear = getActiveFinancialYearRecord();
    const activeFinancialYearValue =
      normalizeFinancialYearValue(activeFinancialYear);

    setFormData({
      expenseNumber: "",
      expenseDate: new Date().toISOString().slice(0, 10),
      expenseURL: "",
      expenseTitle: "",
      expenseFor: "",
      referenceNumber: "",
      entrySource: "",
      partyName: "",
      description: "",
      amount: "",
      paymentStatus: "",
      paymentSource: "Business Account",
      paymentMethod: "",
      paymentDate: new Date().toISOString().slice(0, 10),
      paidAmount: "",
      financialYear: activeFinancialYearValue,
      notes: "",
      paymentProof: "",
    });
    setErrors({});
  };

  useEffect(() => {
    if (!show || editingRecord) return;

    const activeFinancialYear = getActiveFinancialYearRecord();
    const activeFinancialYearValue =
      normalizeFinancialYearValue(activeFinancialYear);
    let cancelled = false;

    const fetchNextExpenseNumber = async () => {
      try {
        const response = await apiGet(
          API_ENDPOINTS.COMPANY_EXPENSES.NEXT_NUMBER,
          {
            params: activeFinancialYearValue
              ? { financialYear: activeFinancialYearValue }
              : {},
          },
        );

        if (cancelled) return;

        const nextExpenseNumber =
          response?.data?.expenseNumber || response?.data?.nextNumber || "";

        setFormData((prev) => ({
          ...prev,
          expenseNumber: nextExpenseNumber || prev.expenseNumber,
          financialYear: activeFinancialYearValue,
        }));
      } catch (error) {
        if (cancelled) return;
        setFormData((prev) => ({
          ...prev,
          financialYear: activeFinancialYearValue,
        }));
      }
    };

    fetchNextExpenseNumber();

    return () => {
      cancelled = true;
    };
  }, [
    show,
    editingRecord,
    selectedFinancialYear,
    defaultFinancialYear,
    financialYears,
  ]);

  useEffect(() => {
    if (!show) return;

    if (editingRecord) {
      setFormData({
        expenseNumber: editingRecord.expenseNumber || "",
        expenseDate:
          editingRecord.expenseDate || editingRecord.invoiceDate || "",
        expenseURL: editingRecord.expenseURL || editingRecord.invoiceURL || "",
        expenseTitle: editingRecord.expenseTitle || "",
        expenseFor: editingRecord.expenseFor || "",
        referenceNumber:
          editingRecord.referenceNumber || editingRecord.voucherNumber || "",
        entrySource: editingRecord.entrySource || "",
        partyName:
          editingRecord.partyName ||
          editingRecord.businessName ||
          editingRecord.vendorName ||
          "",
        description: editingRecord.description || "",
        amount: String(
          editingRecord.amount || editingRecord?.taxData?.totalAmount || "",
        ),
        paymentStatus: editingRecord.paymentStatus || "",
        paymentSource: editingRecord.paymentSource || "Business Account",
        paymentMethod: editingRecord.paymentMethod || "",
        paymentDate: editingRecord.paymentDate || "",
        paidAmount: String(
          editingRecord.paidAmount || editingRecord.amountPaid || "",
        ),
        financialYear:
          editingRecord.financialYear ||
          normalizeFinancialYearValue(getActiveFinancialYearRecord()) ||
          "",
        notes: editingRecord.notes || "",
        paymentProof: editingRecord.paymentProof || "",
      });
      setSelectedExpenseFile(null);
      setErrors({});
      return;
    }

    resetForm();
  }, [
    editingRecord,
    show,
    selectedFinancialYear,
    defaultFinancialYear,
    financialYears,
  ]);

  const isViewMode = Boolean(editingRecord?.isViewMode);
  const uploadedExpenseViewUrl =
    editingRecord?.expenseFileURL ||
    editingRecord?.expenseFileLink ||
    (editingRecord?.expenseFilePath
      ? formData.expenseURL || editingRecord?.expenseURL || ""
      : "") ||
    "";

  const modalTitle = useMemo(() => {
    if (editingRecord?.isViewMode) {
      return `View Company Expense - ${editingRecord.expenseNumber || ""}`;
    }

    if (editingRecord) {
      return `Edit Company Expense - ${editingRecord.expenseNumber || ""}`;
    }

    return "Add Company Expense";
  }, [editingRecord]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    const normalizedValue =
      name === "amount" || name === "paidAmount"
        ? value.replace(/[^0-9.]/g, "")
        : value;

    setFormData((prev) => {
      const updated = {
        ...prev,
        [name]: normalizedValue,
      };

      if (name === "paymentStatus") {
        if (normalizedValue === "Unpaid") {
          updated.paymentDate = "";
          updated.paidAmount = "";
        }

        if (normalizedValue === "Paid") {
          updated.paidAmount = updated.amount || "";
          if (!updated.paymentDate) {
            updated.paymentDate = new Date().toISOString().slice(0, 10);
          }
        }
      }

      if (name === "amount" && prev.paymentStatus === "Paid") {
        updated.paidAmount = normalizedValue;
      }

      return updated;
    });

    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: "",
      }));
    }
  };

  const handleExpenseFileChange = (e) => {
    const file = e.target.files?.[0] || null;
    if (!file) {
      setSelectedExpenseFile(null);
      return;
    }

    const isAllowedType =
      file.type === "application/pdf" || file.type.startsWith("image/");

    if (!isAllowedType) {
      showError("Please upload only image or PDF expense file");
      e.target.value = "";
      setSelectedExpenseFile(null);
      return;
    }

    setSelectedExpenseFile(file);
  };

  const openExpenseUrl = () => {
    const link = String(formData.expenseURL || "").trim();
    if (!link) {
      showError("Please enter invoice URL first");
      return;
    }

    if (!/^https?:\/\//i.test(link)) {
      showError("Please enter a valid URL starting with http:// or https://");
      return;
    }

    window.open(link, "_blank", "noopener,noreferrer");
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.expenseNumber.trim()) {
      newErrors.expenseNumber = "Expense Number is required";
    }

    if (!formData.expenseDate) {
      newErrors.expenseDate = "Expense Date is required";
    }

    const activeFinancialYear = getActiveFinancialYearRecord();
    const activeFinancialYearValue =
      normalizeFinancialYearValue(activeFinancialYear);

    if (!activeFinancialYear?.startDate || !activeFinancialYear?.endDate) {
      newErrors.expenseDate =
        "Selected/default financial year is not configured. Please set financial year first";
    } else if (
      !isDateWithinFinancialYear(formData.expenseDate, activeFinancialYear)
    ) {
      newErrors.expenseDate = `Expense Date must be between ${activeFinancialYear.startDate} and ${activeFinancialYear.endDate} for financial year ${activeFinancialYearValue}.`;
    }

    if (!formData.expenseTitle.trim()) {
      newErrors.expenseTitle = "Expense title is required";
    }

    if (!formData.paymentStatus) {
      newErrors.paymentStatus = "Payment status is required";
    }

    if (
      ["Paid", "Partial"].includes(formData.paymentStatus) &&
      !String(formData.paymentSource || "").trim()
    ) {
      newErrors.paymentSource = "Payment source is required";
    }

    if (
      ["Paid", "Partial"].includes(formData.paymentStatus) &&
      !String(formData.paymentMethod || "").trim()
    ) {
      newErrors.paymentMethod = "Payment method is required";
    }

    const amount = parseFloat(formData.amount || 0);
    if (Number.isNaN(amount) || amount <= 0) {
      newErrors.amount = "Valid expense amount is required";
    }

    const paidAmount = parseFloat(formData.paidAmount || 0);
    if (
      formData.paymentStatus === "Partial" &&
      (Number.isNaN(paidAmount) || paidAmount <= 0)
    ) {
      newErrors.paidAmount = "Partial payment me paid amount required hai";
    }

    if (formData.paymentStatus === "Paid" && !formData.paymentDate) {
      newErrors.paymentDate = "Paid expense ke liye payment date required hai";
    }

    if (formData.paymentStatus === "Partial" && !formData.paymentDate) {
      newErrors.paymentDate =
        "Partial payment ke liye payment date required hai";
    }

    if (formData.expenseURL && !/^https?:\/\//i.test(formData.expenseURL)) {
      newErrors.expenseURL = "Please enter a valid URL";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isViewMode || submitting) return;

    if (!validateForm()) {
      showError("Please fix form errors before submit");
      return;
    }

    setSubmitting(true);

    try {
      const amount = parseFloat(formData.amount || 0);
      const explicitPaid = parseFloat(formData.paidAmount || 0);
      let resolvedPaidAmount = 0;

      if (formData.paymentStatus === "Paid") {
        resolvedPaidAmount = amount;
      } else if (formData.paymentStatus === "Partial") {
        resolvedPaidAmount = Math.min(explicitPaid || 0, amount);
      }

      const payload = {
        expenseNumber: formData.expenseNumber.trim(),
        expenseDate: formData.expenseDate,
        invoiceDate: formData.expenseDate,
        expenseURL: formData.expenseURL.trim(),
        expenseTitle: formData.expenseTitle.trim(),
        expenseFor: formData.expenseFor.trim(),
        referenceNumber: formData.referenceNumber.trim(),
        entrySource: formData.entrySource,
        partyName: formData.partyName.trim(),
        businessName: formData.partyName.trim(),
        vendorName: formData.partyName.trim(),
        description: formData.description.trim(),
        amount,
        paymentStatus: formData.paymentStatus,
        paymentSource: formData.paymentSource,
        paymentMethod: formData.paymentMethod,
        paymentDate: formData.paymentDate || "",
        paidAmount: resolvedPaidAmount,
        amountPaid: resolvedPaidAmount,
        gstin: "Unregistered",
        invoiceType: "No GST",
        financialYear: formData.financialYear || "",
        notes: formData.notes.trim(),
        paymentProof: formData.paymentProof.trim(),
        taxData: {
          taxableAmount: amount,
          subtotal: amount,
          totalAmount: amount,
          cgst: 0,
          sgst: 0,
          igst: 0,
          taxPercentage: 0,
        },
      };

      const expenseUpload = selectedExpenseFile
        ? {
            fileName: selectedExpenseFile.name,
            fileType: selectedExpenseFile.type || "application/octet-stream",
            fileDataBase64: await toBase64(selectedExpenseFile),
          }
        : null;

      if (expenseUpload) {
        payload.expenseUpload = expenseUpload;
      }

      await onSubmit(payload);
    } finally {
      setSubmitting(false);
    }
  };

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

          <form onSubmit={handleSubmit} noValidate>
            <div
              className="modal-body"
              style={{ maxHeight: "78vh", overflowY: "auto" }}
            >
              <div className="row g-3">
                <div className="col-md-4">
                  <label htmlFor="expenseNumber" className="form-label">
                    Expense Number
                    <RequiredStar />
                  </label>
                  <input
                    id="expenseNumber"
                    name="expenseNumber"
                    className={`form-control modern-input ${errors.expenseNumber ? "is-invalid" : ""}`}
                    value={formData.expenseNumber}
                    readOnly
                  />
                  {errors.expenseNumber && (
                    <div className="invalid-feedback">
                      {errors.expenseNumber}
                    </div>
                  )}
                </div>

                <div className="col-md-4">
                  <label htmlFor="expenseDate" className="form-label">
                    Expense Date
                    <RequiredStar />
                  </label>
                  <input
                    type="date"
                    id="expenseDate"
                    name="expenseDate"
                    className={`form-control modern-input ${errors.expenseDate ? "is-invalid" : ""}`}
                    value={formData.expenseDate}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                  />
                  {errors.expenseDate && (
                    <div className="invalid-feedback">{errors.expenseDate}</div>
                  )}
                </div>

                <div className="col-md-4">
                  <label htmlFor="expenseTitle" className="form-label">
                    Expense Title
                    <RequiredStar />
                  </label>
                  <input
                    id="expenseTitle"
                    name="expenseTitle"
                    className={`form-control modern-input ${errors.expenseTitle ? "is-invalid" : ""}`}
                    value={formData.expenseTitle}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                    placeholder="Example: Transport Charge"
                  />
                  {errors.expenseTitle && (
                    <div className="invalid-feedback">
                      {errors.expenseTitle}
                    </div>
                  )}
                </div>

                <div className="col-md-4">
                  <label htmlFor="expenseFor" className="form-label">
                    Expense For
                  </label>
                  <input
                    id="expenseFor"
                    name="expenseFor"
                    className="form-control modern-input"
                    value={formData.expenseFor}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                    placeholder="Example: Office rent / Internet / Travel"
                  />
                </div>

                <div className="col-md-4">
                  <label htmlFor="referenceNumber" className="form-label">
                    Reference No.
                  </label>
                  <input
                    id="referenceNumber"
                    name="referenceNumber"
                    className="form-control modern-input"
                    value={formData.referenceNumber}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                    placeholder="Optional voucher/entry reference"
                  />
                </div>

                <div className="col-md-4">
                  <label htmlFor="entrySource" className="form-label">
                    Entry Source
                  </label>
                  <select
                    id="entrySource"
                    name="entrySource"
                    className="form-select modern-input"
                    value={formData.entrySource}
                    onChange={handleInputChange}
                    disabled={isViewMode}
                  >
                    <option value="">-- Select Entry Source --</option>
                    <option value="No Bill">No Bill</option>
                    <option value="Self Note">Self Note</option>
                    <option value="Cash Memo">Cash Memo</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="col-md-4">
                  <label htmlFor="partyName" className="form-label">
                    Party/Vendor Name
                  </label>
                  <input
                    id="partyName"
                    name="partyName"
                    className="form-control modern-input"
                    value={formData.partyName}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                    placeholder="Optional"
                  />
                </div>

                <div className="col-md-4">
                  <label htmlFor="amount" className="form-label">
                    Amount
                    <RequiredStar />
                  </label>
                  <input
                    id="amount"
                    name="amount"
                    className={`form-control modern-input ${errors.amount ? "is-invalid" : ""}`}
                    value={formData.amount}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                    placeholder="0.00"
                  />
                  {errors.amount && (
                    <div className="invalid-feedback">{errors.amount}</div>
                  )}
                </div>

                <div className="col-md-4">
                  <label htmlFor="paymentStatus" className="form-label">
                    Payment Status
                    <RequiredStar />
                  </label>
                  <select
                    id="paymentStatus"
                    name="paymentStatus"
                    className={`form-select modern-input ${errors.paymentStatus ? "is-invalid" : ""}`}
                    value={formData.paymentStatus}
                    onChange={handleInputChange}
                    disabled={isViewMode}
                  >
                    <option value="">-- Select Payment Status --</option>
                    <option value="Paid">Paid</option>
                    <option value="Unpaid">Unpaid</option>
                    <option value="Partial">Partial</option>
                  </select>
                  {errors.paymentStatus && (
                    <div className="invalid-feedback">
                      {errors.paymentStatus}
                    </div>
                  )}
                </div>

                <div className="col-md-4">
                  <label htmlFor="paymentSource" className="form-label">
                    Payment Source
                    {formData.paymentStatus !== "Unpaid" && <RequiredStar />}
                  </label>
                  <select
                    id="paymentSource"
                    name="paymentSource"
                    className={`form-select modern-input ${errors.paymentSource ? "is-invalid" : ""}`}
                    value={formData.paymentSource}
                    onChange={handleInputChange}
                    disabled={isViewMode}
                  >
                    <option value="Business Account">Business Account</option>
                    <option value="Owner Personal Account">
                      Owner Personal Account
                    </option>
                  </select>
                  {errors.paymentSource && (
                    <div className="invalid-feedback">
                      {errors.paymentSource}
                    </div>
                  )}
                </div>

                <div className="col-md-4">
                  <label htmlFor="paymentMethod" className="form-label">
                    Payment Method
                    {formData.paymentStatus !== "Unpaid" && <RequiredStar />}
                  </label>
                  <select
                    id="paymentMethod"
                    name="paymentMethod"
                    className={`form-select modern-input ${errors.paymentMethod ? "is-invalid" : ""}`}
                    value={formData.paymentMethod}
                    onChange={handleInputChange}
                    disabled={isViewMode}
                  >
                    <option value="">-- Select Payment Method --</option>
                    <option value="Cash">Cash</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="UPI">UPI</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Credit Card">Credit Card</option>
                    <option value="Debit Card">Debit Card</option>
                  </select>
                  {errors.paymentMethod && (
                    <div className="invalid-feedback">
                      {errors.paymentMethod}
                    </div>
                  )}
                </div>

                <div className="col-md-4">
                  <label htmlFor="paymentDate" className="form-label">
                    Payment Date
                    {formData.paymentStatus !== "Unpaid" && <RequiredStar />}
                  </label>
                  <input
                    type="date"
                    id="paymentDate"
                    name="paymentDate"
                    className={`form-control modern-input ${errors.paymentDate ? "is-invalid" : ""}`}
                    value={formData.paymentDate}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                  />
                  {errors.paymentDate && (
                    <div className="invalid-feedback">{errors.paymentDate}</div>
                  )}
                </div>

                {formData.paymentStatus === "Partial" && (
                  <div className="col-md-4">
                    <label htmlFor="paidAmount" className="form-label">
                      Paid Amount
                    </label>
                    <input
                      id="paidAmount"
                      name="paidAmount"
                      className={`form-control modern-input ${errors.paidAmount ? "is-invalid" : ""}`}
                      value={formData.paidAmount}
                      onChange={handleInputChange}
                      readOnly={isViewMode}
                      placeholder="0.00"
                    />
                    {errors.paidAmount && (
                      <div className="invalid-feedback">
                        {errors.paidAmount}
                      </div>
                    )}
                  </div>
                )}

                <div className="col-md-4">
                  <label htmlFor="paymentProof" className="form-label">
                    Payment Proof / UTR / Txn ID
                  </label>
                  <input
                    id="paymentProof"
                    name="paymentProof"
                    className="form-control modern-input"
                    value={formData.paymentProof}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                    placeholder="Optional"
                  />
                </div>

                <div className="col-md-4">
                  <label
                    htmlFor="expenseURL"
                    className="form-label fw-semibold"
                  >
                    <i className="fas fa-link me-2 text-primary"></i>
                    Invoice URL
                  </label>
                  <div className="input-group">
                    <input
                      type="url"
                      id="expenseURL"
                      name="expenseURL"
                      className={`form-control modern-input ${errors.expenseURL ? "is-invalid" : ""}`}
                      value={formData.expenseURL}
                      onChange={handleInputChange}
                      readOnly={isViewMode}
                      placeholder="Paste invoice URL"
                    />
                    <button
                      type="button"
                      className="btn btn-outline-primary"
                      onClick={openExpenseUrl}
                      title="Open invoice URL"
                    >
                      <i className="fas fa-eye"></i>
                    </button>
                  </div>
                  {errors.expenseURL && (
                    <div className="invalid-feedback d-block">
                      {errors.expenseURL}
                    </div>
                  )}
                </div>

                <div className="col-md-4">
                  <label className="form-label fw-semibold">
                    <i className="fas fa-file-upload me-2 text-warning"></i>
                    Upload Expense Document (Image/PDF)
                  </label>

                  {!isViewMode && (
                    <input
                      type="file"
                      className="form-control modern-input file-picker-input"
                      accept="image/*,application/pdf"
                      onChange={handleExpenseFileChange}
                    />
                  )}

                  {uploadedExpenseViewUrl ? (
                    <div className="mt-2">
                      <a
                        href={uploadedExpenseViewUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-sm btn-outline-primary"
                        title="Open uploaded expense document in new tab"
                      >
                        <i class="fa-solid fa-file-contract"></i>
                      </a>
                    </div>
                  ) : (
                    isViewMode && (
                      <span className="text-muted small">
                        No uploaded expense file
                      </span>
                    )
                  )}
                </div>

                <div className="col-md-4">
                  <label htmlFor="description" className="form-label">
                    Description
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    rows={1}
                    className="form-control modern-input"
                    value={formData.description}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                  />
                </div>

                <div className="col-md-4">
                  <label htmlFor="notes" className="form-label">
                    Notes
                  </label>
                  <textarea
                    id="notes"
                    name="notes"
                    rows={1}
                    className="form-control modern-input"
                    value={formData.notes}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                  />
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
              >
                Close
              </button>

              {!isViewMode && (
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submitting}
                >
                  {submitting
                    ? "Saving..."
                    : editingRecord
                      ? "Update Expense"
                      : "Save Expense"}
                </button>
              )}
            </div>
          </form>
        </div>
      </div>

      <style>{`
        .file-picker-input::file-selector-button,
        .file-picker-input::-webkit-file-upload-button {
          margin-right: 10px;
          border: 0;
          border-radius: 8px;
          background: linear-gradient(135deg, #007026 0, #09a98d 100%);
          color: #fff;
          padding: 8px 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .file-picker-input::file-selector-button:hover,
        .file-picker-input::-webkit-file-upload-button:hover {
          filter: brightness(1.08);
        }
      `}</style>
    </div>
  );
};

export default CreateCompanyExpense;
