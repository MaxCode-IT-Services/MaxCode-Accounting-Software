import React, { useEffect, useMemo, useState } from "react";
import { showError } from "./ToastNotification";

const CreateCompanyExpense = ({
  show,
  onClose,
  onSubmit,
  editingRecord = null,
  existingRecords = [],
}) => {
  const [formData, setFormData] = useState({
    expenseNumber: "",
    expenseDate: "",
    expenseCategory: "General",
    expenseTitle: "",
    partyName: "",
    description: "",
    amount: "",
    paymentStatus: "Paid",
    paymentMethod: "Cash",
    paymentDate: "",
    paidAmount: "",
    financialYear: "",
    notes: "",
  });

  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

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

  const getNextExpenseNumber = (records) => {
    const maxNumber = (records || []).reduce((max, record) => {
      const match = String(record?.expenseNumber || "").match(/CEXP(\d+)/i);
      if (!match) return max;
      const value = parseInt(match[1], 10);
      return Number.isNaN(value) ? max : Math.max(max, value);
    }, 0);

    return `CEXP${String(maxNumber + 1).padStart(4, "0")}`;
  };

  const resetForm = () => {
    setFormData({
      expenseNumber: getNextExpenseNumber(existingRecords),
      expenseDate: new Date().toISOString().slice(0, 10),
      expenseCategory: "General",
      expenseTitle: "",
      partyName: "",
      description: "",
      amount: "",
      paymentStatus: "Paid",
      paymentMethod: "Cash",
      paymentDate: new Date().toISOString().slice(0, 10),
      paidAmount: "",
      financialYear: localStorage.getItem("selectedFinancialYear") || "",
      notes: "",
    });
    setErrors({});
  };

  useEffect(() => {
    if (!show) return;

    if (editingRecord) {
      setFormData({
        expenseNumber: editingRecord.expenseNumber || "",
        expenseDate:
          editingRecord.expenseDate || editingRecord.invoiceDate || "",
        expenseCategory: editingRecord.expenseCategory || "General",
        expenseTitle: editingRecord.expenseTitle || "",
        partyName:
          editingRecord.partyName ||
          editingRecord.businessName ||
          editingRecord.vendorName ||
          "",
        description: editingRecord.description || "",
        amount: String(
          editingRecord.amount || editingRecord?.taxData?.totalAmount || "",
        ),
        paymentStatus: editingRecord.paymentStatus || "Paid",
        paymentMethod: editingRecord.paymentMethod || "Cash",
        paymentDate: editingRecord.paymentDate || "",
        paidAmount: String(
          editingRecord.paidAmount || editingRecord.amountPaid || "",
        ),
        financialYear:
          editingRecord.financialYear ||
          localStorage.getItem("selectedFinancialYear") ||
          "",
        notes: editingRecord.notes || "",
      });
      setErrors({});
      return;
    }

    resetForm();
  }, [editingRecord, show]);

  const isViewMode = Boolean(editingRecord?.isViewMode);

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

    setFormData((prev) => ({
      ...prev,
      [name]: normalizedValue,
    }));

    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: "",
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.expenseNumber.trim()) {
      newErrors.expenseNumber = "Expense Number is required";
    }

    if (!formData.expenseDate) {
      newErrors.expenseDate = "Expense Date is required";
    }

    if (!formData.expenseTitle.trim()) {
      newErrors.expenseTitle = "Expense title is required";
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
        expenseCategory: formData.expenseCategory,
        expenseTitle: formData.expenseTitle.trim(),
        partyName: formData.partyName.trim(),
        businessName: formData.partyName.trim(),
        vendorName: formData.partyName.trim(),
        description: formData.description.trim(),
        amount,
        paymentStatus: formData.paymentStatus,
        paymentMethod: formData.paymentMethod,
        paymentDate: formData.paymentDate || "",
        paidAmount: resolvedPaidAmount,
        amountPaid: resolvedPaidAmount,
        gstin: "Unregistered",
        invoiceType: "No GST",
        financialYear: formData.financialYear || "",
        notes: formData.notes.trim(),
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
      <div className="modal-dialog modal-lg" role="document">
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
              style={{ maxHeight: "70vh", overflowY: "auto" }}
            >
              <div className="row g-3">
                <div className="col-md-6">
                  <label htmlFor="expenseNumber" className="form-label">
                    Expense Number *
                  </label>
                  <input
                    id="expenseNumber"
                    name="expenseNumber"
                    className={`form-control ${errors.expenseNumber ? "is-invalid" : ""}`}
                    value={formData.expenseNumber}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                  />
                  {errors.expenseNumber && (
                    <div className="invalid-feedback">
                      {errors.expenseNumber}
                    </div>
                  )}
                </div>

                <div className="col-md-6">
                  <label htmlFor="expenseDate" className="form-label">
                    Expense Date *
                  </label>
                  <input
                    type="date"
                    id="expenseDate"
                    name="expenseDate"
                    className={`form-control ${errors.expenseDate ? "is-invalid" : ""}`}
                    value={formData.expenseDate}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                  />
                  {errors.expenseDate && (
                    <div className="invalid-feedback">{errors.expenseDate}</div>
                  )}
                </div>

                <div className="col-md-6">
                  <label htmlFor="expenseCategory" className="form-label">
                    Category
                  </label>
                  <select
                    id="expenseCategory"
                    name="expenseCategory"
                    className="form-select"
                    value={formData.expenseCategory}
                    onChange={handleInputChange}
                    disabled={isViewMode}
                  >
                    <option value="General">General</option>
                    <option value="Travel">Travel</option>
                    <option value="Food">Food</option>
                    <option value="Maintenance">Maintenance</option>
                    <option value="Office">Office</option>
                    <option value="Utility">Utility</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="col-md-6">
                  <label htmlFor="expenseTitle" className="form-label">
                    Expense Title *
                  </label>
                  <input
                    id="expenseTitle"
                    name="expenseTitle"
                    className={`form-control ${errors.expenseTitle ? "is-invalid" : ""}`}
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

                <div className="col-md-6">
                  <label htmlFor="partyName" className="form-label">
                    Party/Vendor Name
                  </label>
                  <input
                    id="partyName"
                    name="partyName"
                    className="form-control"
                    value={formData.partyName}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                    placeholder="Optional"
                  />
                </div>

                <div className="col-md-6">
                  <label htmlFor="amount" className="form-label">
                    Amount *
                  </label>
                  <input
                    id="amount"
                    name="amount"
                    className={`form-control ${errors.amount ? "is-invalid" : ""}`}
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
                  </label>
                  <select
                    id="paymentStatus"
                    name="paymentStatus"
                    className="form-select"
                    value={formData.paymentStatus}
                    onChange={handleInputChange}
                    disabled={isViewMode}
                  >
                    <option value="Paid">Paid</option>
                    <option value="Unpaid">Unpaid</option>
                    <option value="Partial">Partial</option>
                  </select>
                </div>

                <div className="col-md-4">
                  <label htmlFor="paymentMethod" className="form-label">
                    Payment Method
                  </label>
                  <select
                    id="paymentMethod"
                    name="paymentMethod"
                    className="form-select"
                    value={formData.paymentMethod}
                    onChange={handleInputChange}
                    disabled={isViewMode}
                  >
                    <option value="Cash">Cash</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="UPI">UPI</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Credit Card">Credit Card</option>
                    <option value="Debit Card">Debit Card</option>
                  </select>
                </div>

                <div className="col-md-4">
                  <label htmlFor="paymentDate" className="form-label">
                    Payment Date
                  </label>
                  <input
                    type="date"
                    id="paymentDate"
                    name="paymentDate"
                    className={`form-control ${errors.paymentDate ? "is-invalid" : ""}`}
                    value={formData.paymentDate}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                  />
                  {errors.paymentDate && (
                    <div className="invalid-feedback">{errors.paymentDate}</div>
                  )}
                </div>

                {formData.paymentStatus === "Partial" && (
                  <div className="col-md-6">
                    <label htmlFor="paidAmount" className="form-label">
                      Paid Amount *
                    </label>
                    <input
                      id="paidAmount"
                      name="paidAmount"
                      className={`form-control ${errors.paidAmount ? "is-invalid" : ""}`}
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

                <div className="col-12">
                  <label htmlFor="description" className="form-label">
                    Description
                  </label>
                  <textarea
                    id="description"
                    name="description"
                    rows={2}
                    className="form-control"
                    value={formData.description}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                  />
                </div>

                <div className="col-12">
                  <label htmlFor="notes" className="form-label">
                    Notes
                  </label>
                  <textarea
                    id="notes"
                    name="notes"
                    rows={2}
                    className="form-control"
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
    </div>
  );
};

export default CreateCompanyExpense;
