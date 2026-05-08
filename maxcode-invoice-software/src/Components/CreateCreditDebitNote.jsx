import React, { useState, useEffect } from "react";
import Select from "react-select";
import { getUnifiedSelectStyles } from "../utils/reactSelectStyles";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { apiGet } from "../utils/api";

const DEFAULT_NOTE_ITEM = {
  id: 1,
  itemName: "",
  itemDescription: "",
  hsnCode: "",
  qty: "",
  price: "",
  amount: 0,
};

const NOTE_TYPE_REASONS = {
  "Credit Note": [
    "Overbilling Correction",
    "Partial Service Delivery",
    "Project Cancellation",
    "Refund Adjustment",
    "Partial Refund",
    "SLA Compensation",
    "Advance Adjustment",
  ],
  "Debit Note": [
    "Scope Change Adjustment",
    "Pricing Negotiation Adjustment",
    "Milestone Delay/Pause",
    "Milestone Not Approved",
    "Tax Adjustment",
    "Duplicate Invoice Correction",
  ],
};

const NOTE_TYPE_STATUSES = {
  "Credit Note": [
    "Draft",
    "Pending",
    "Approved",
    "Applied",
    "Refunded",
    "Cancelled",
  ],
  "Debit Note": ["Draft", "Pending", "Approved", "Applied", "Cancelled"],
};

const REFUND_STATUS_OPTIONS = ["Full Refund", "Partial Refund", "Pending"];
const PAYMENT_STATUS_OPTIONS = ["Paid", "Unpaid", "Partial"];
const PAYMENT_METHOD_OPTIONS = [
  "Cash",
  "Bank Transfer",
  "Card",
  "UPI",
  "Cheque",
  "IMPS",
  "RTGS",
  "Zoho Payment Gateway",
  "Cashfree Payment Gateway",
  "PayU Payment Gateway",
];

const INITIAL_FORM_STATE = {
  invoiceId: "",
  invoiceNumber: "",
  clientId: "",
  noteNumber: "",
  noteType: "",
  reasonAdjustmentType: "",
  clientName: "",
  businessName: "",
  address: "",
  placeOfSupply: "",
  phoneNumber: "",
  gstin: "",
  noGSTIN: false,
  noteDate: "",
  amount: "",
  taxRate: "18",
  taxAmount: "",
  totalAmount: "",
  status: "",
  remarks: "",
  refundStatus: "",
  refundDate: "",
  refundAmount: "",
  refundMethod: "",
  referenceNumber: "",
  paymentStatus: "",
  paymentDate: "",
  receivedAmount: "",
  paymentMethod: "",
};

const INDIAN_STATES = [
  { code: "01", name: "Jammu & Kashmir" },
  { code: "02", name: "Himachal Pradesh" },
  { code: "03", name: "Punjab" },
  { code: "04", name: "Chandigarh" },
  { code: "05", name: "Uttarakhand" },
  { code: "06", name: "Haryana" },
  { code: "07", name: "NCT of Delhi" },
  { code: "08", name: "Rajasthan" },
  { code: "09", name: "Uttar Pradesh" },
  { code: "10", name: "Bihar" },
  { code: "11", name: "Sikkim" },
  { code: "12", name: "Arunachal Pradesh" },
  { code: "13", name: "Nagaland" },
  { code: "14", name: "Manipur" },
  { code: "15", name: "Mizoram" },
  { code: "16", name: "Tripura" },
  { code: "17", name: "Meghalaya" },
  { code: "18", name: "Assam" },
  { code: "19", name: "West Bengal" },
  { code: "20", name: "Jharkhand" },
  { code: "21", name: "Odisha" },
  { code: "22", name: "Chhattisgarh" },
  { code: "23", name: "Madhya Pradesh" },
  { code: "24", name: "Gujarat" },
  { code: "25", name: "Daman and Diu" },
  { code: "26", name: "Dadra and Nagar Haveli" },
  { code: "27", name: "Maharashtra" },
  { code: "28", name: "Andhra Pradesh" },
  { code: "29", name: "Karnataka" },
  { code: "30", name: "Goa" },
  { code: "31", name: "Lakshadweep" },
  { code: "32", name: "Kerala" },
  { code: "33", name: "Tamil Nadu" },
  { code: "34", name: "Puducherry" },
  { code: "35", name: "Andaman and Nicobar Islands" },
  { code: "36", name: "Telangana" },
  { code: "37", name: "Andhra Pradesh" },
  { code: "38", name: "Ladakh" },
  { code: "97", name: "Other Territory" },
  { code: "99", name: "Other Country" },
];

const getTodayDateString = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getFinancialYearToken = (financialYearValue) => {
  const value = String(financialYearValue || "").trim();
  if (/^\d{4}-\d{4}$/.test(value)) {
    return `${value.slice(2, 4)}-${value.slice(-2)}`;
  }
  if (/^\d{4}-\d{2}$/.test(value)) {
    return `${value.slice(2, 4)}-${value.slice(-2)}`;
  }
  if (/^\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  return "";
};

const getFallbackSelectedFinancialYear = () => {
  const now = new Date();
  const month = now.getMonth() + 1;
  const startYear = month >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  const endYearShort = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}-${endYearShort}`;
};

const calculateAmounts = (amountValue, taxRateValue) => {
  const amount = Number(amountValue) || 0;
  const taxRate = Number(taxRateValue) || 0;
  const taxAmount = Number(((amount * taxRate) / 100).toFixed(2));
  const totalAmount = Number((amount + taxAmount).toFixed(2));

  return {
    amount,
    taxRate,
    taxAmount,
    totalAmount,
  };
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const sanitizeAmountText = (value) => {
  const onlyAllowedChars = String(value || "").replace(/[^0-9.]/g, "");
  const parts = onlyAllowedChars.split(".");
  if (parts.length <= 1) return onlyAllowedChars;
  return `${parts[0]}.${parts.slice(1).join("")}`;
};

const createAmountFallbackItem = (amount, itemName = "Adjustment") => ({
  ...DEFAULT_NOTE_ITEM,
  itemName,
  qty: "1",
  price: String(amount > 0 ? amount : ""),
  amount: Number((amount > 0 ? amount : 0).toFixed(2)),
});

const CreateCreditDebitNote = ({
  show,
  onClose,
  onSubmit,
  editingRecord = null,
  invoiceOptions = [],
  invoiceLoading = false,
}) => {
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);
  const [items, setItems] = useState([DEFAULT_NOTE_ITEM]);
  const [serviceOptions, setServiceOptions] = useState([]);
  const [errors, setErrors] = useState({});
  const [availableAdvances, setAvailableAdvances] = useState([]);
  const [appliedAdvances, setAppliedAdvances] = useState([]);
  const [isLoadingAdvances, setIsLoadingAdvances] = useState(false);
  const [financialYearDates, setFinancialYearDates] = useState({
    startDate: null,
    endDate: null,
  });
  const isViewMode = editingRecord?.isViewMode;
  const isEditMode = Boolean(editingRecord && !isViewMode);

  const recalculateFromItems = (nextItems, nextTaxRate) => {
    const subtotal = (nextItems || []).reduce((sum, item) => {
      const amount = toNumber(item?.amount);
      return sum + amount;
    }, 0);

    const amounts = calculateAmounts(subtotal, nextTaxRate);

    setFormData((prev) => ({
      ...prev,
      amount: String(amounts.amount),
      taxRate: String(amounts.taxRate),
      taxAmount: String(amounts.taxAmount),
      totalAmount: String(amounts.totalAmount),
    }));
  };

  const formatDateWithFinancialYear = (dateValue, financialYearValue) => {
    if (!dateValue) return "-";
    const d = new Date(dateValue);
    const datePart = Number.isNaN(d.getTime())
      ? String(dateValue)
      : `${String(d.getDate()).padStart(2, "0")}-${String(
          d.getMonth() + 1,
        ).padStart(2, "0")}-${d.getFullYear()}`;
    const fyPart = String(financialYearValue || "").trim();
    return fyPart ? `${datePart} (FY ${fyPart})` : datePart;
  };

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
    if (editingRecord) {
      const amount = Number(editingRecord.amount || 0);
      const taxRate = Number(editingRecord.taxRate || 18);
      const taxAmount = Number(
        editingRecord.taxAmount || ((amount * taxRate) / 100).toFixed(2),
      );
      const totalAmount = Number(
        editingRecord.totalAmount || (amount + taxAmount).toFixed(2),
      );

      setFormData({
        invoiceId: editingRecord.invoiceId || editingRecord.invoiceRefId || "",
        invoiceNumber: editingRecord.invoiceNumber || "",
        clientId: editingRecord.clientId || editingRecord.clientRefId || "",
        noteNumber: editingRecord.noteNumber || "",
        noteType: editingRecord.noteType || "Credit Note",
        reasonAdjustmentType: editingRecord.reasonAdjustmentType || "",
        clientName: editingRecord.clientName || "",
        businessName: editingRecord.businessName || "",
        address: editingRecord.address || "",
        placeOfSupply: editingRecord.placeOfSupply || "",
        phoneNumber: editingRecord.phoneNumber || "",
        gstin: editingRecord.gstin || "",
        noGSTIN: editingRecord.noGSTIN === true || !editingRecord.gstin,
        noteDate: editingRecord.noteDate
          ? String(editingRecord.noteDate).slice(0, 10)
          : "",
        amount: String(amount || ""),
        taxRate: String(taxRate || ""),
        taxAmount: String(taxAmount || ""),
        totalAmount: String(totalAmount || ""),
        status: editingRecord.status || "",
        remarks: editingRecord.remarks || "",
        refundStatus: editingRecord.refundStatus || "",
        refundDate: editingRecord.refundDate
          ? String(editingRecord.refundDate).slice(0, 10)
          : "",
        refundAmount:
          editingRecord.refundAmount !== undefined
            ? String(editingRecord.refundAmount)
            : "",
        refundMethod: editingRecord.refundMethod || "",
        referenceNumber: editingRecord.referenceNumber || "",
        paymentStatus: editingRecord.paymentStatus || "",
        paymentDate: editingRecord.paymentDate
          ? String(editingRecord.paymentDate).slice(0, 10)
          : "",
        receivedAmount:
          editingRecord.receivedAmount !== undefined
            ? String(editingRecord.receivedAmount)
            : "",
        paymentMethod: editingRecord.paymentMethod || "",
      });
      setItems(
        Array.isArray(editingRecord.items) && editingRecord.items.length > 0
          ? editingRecord.items.map((item, index) => {
              const qty = toNumber(item?.qty);
              const price = toNumber(item?.price);
              const amount =
                toNumber(item?.amount) || Number((qty * price).toFixed(2));

              return {
                id: item?.id || index + 1,
                itemName: String(item?.itemName || ""),
                itemDescription: String(item?.itemDescription || ""),
                hsnCode: String(item?.hsnCode || ""),
                qty: String(item?.qty ?? ""),
                price: String(item?.price ?? ""),
                amount,
              };
            })
          : [createAmountFallbackItem(amount)],
      );
      setAppliedAdvances(
        Array.isArray(editingRecord.appliedAdvances)
          ? editingRecord.appliedAdvances.map((a) => ({
              advanceId: a.advanceId || a.id || "",
              receiptNumber: a.receiptNumber || "",
              appliedAmount: toNumber(a.appliedAmount),
              maxAmount: toNumber(a.maxAmount || a.appliedAmount),
              paymentMethod: a.paymentMethod || "",
              receiptDate: a.receiptDate || "",
            }))
          : [],
      );
    } else {
      setFormData({
        ...INITIAL_FORM_STATE,
        noteDate: getTodayDateString(),
      });
      setItems([DEFAULT_NOTE_ITEM]);
      setAppliedAdvances([]);
      setAvailableAdvances([]);
      setErrors({});
    }
  }, [editingRecord, show]);

  useEffect(() => {
    const clientRef = formData.clientId || formData.clientRefId;
    if (!show || formData.noteType !== "Debit Note" || !clientRef) {
      setAvailableAdvances([]);
      return;
    }

    const fetchAdvances = async () => {
      setIsLoadingAdvances(true);
      try {
        const res = await apiGet(
          API_ENDPOINTS.PAYMENT_RECEIPTS.AVAILABLE_ADVANCES(clientRef),
        );
        const advances = Array.isArray(res?.data?.advances)
          ? res.data.advances
          : [];
        setAvailableAdvances(advances);
      } catch {
        setAvailableAdvances([]);
      } finally {
        setIsLoadingAdvances(false);
      }
    };

    fetchAdvances();
  }, [show, formData.noteType, formData.clientId, formData.clientRefId]);

  useEffect(() => {
    if (formData.noteType !== "Debit Note") return;
    const totalAmount = toNumber(formData.totalAmount);
    const advanceTotal = appliedAdvances.reduce(
      (sum, adv) => sum + toNumber(adv.appliedAmount),
      0,
    );
    const cappedReceived = Math.min(totalAmount, advanceTotal);
    const paymentStatus =
      cappedReceived <= 0
        ? "Unpaid"
        : cappedReceived >= totalAmount
          ? "Paid"
          : "Partial";
    const latestAdvance = [...appliedAdvances]
      .filter((adv) => toNumber(adv.appliedAmount) > 0)
      .sort(
        (a, b) =>
          new Date(a.receiptDate || 0).getTime() -
          new Date(b.receiptDate || 0).getTime(),
      )
      .pop();

    setFormData((prev) => ({
      ...prev,
      receivedAmount: String(cappedReceived > 0 ? cappedReceived : ""),
      paymentStatus: prev.paymentStatus || paymentStatus,
      paymentDate:
        cappedReceived > 0 && !prev.paymentDate
          ? latestAdvance?.receiptDate
            ? String(latestAdvance.receiptDate).slice(0, 10)
            : prev.noteDate
          : prev.paymentDate,
      paymentMethod:
        cappedReceived > 0 && !prev.paymentMethod
          ? latestAdvance?.paymentMethod || prev.paymentMethod
          : prev.paymentMethod,
    }));
  }, [
    appliedAdvances,
    formData.noteType,
    formData.totalAmount,
    formData.noteDate,
  ]);

  useEffect(() => {
    if (!show || editingRecord || !formData.noteType) return;

    const populateNextNoteNumber = async () => {
      try {
        const selectedFinancialYear =
          localStorage.getItem("selectedFinancialYear") ||
          getFallbackSelectedFinancialYear();

        const noteType = formData.noteType;

        const response = await apiGet(
          API_ENDPOINTS.CREDIT_DEBIT_NOTES.NEXT_NUMBER(
            selectedFinancialYear,
            noteType,
          ),
        );

        const nextNumber = String(
          response?.data?.noteNumber || response?.data?.nextNumber || "",
        ).trim();

        if (nextNumber) {
          setFormData((prev) => ({
            ...prev,
            noteNumber: nextNumber,
          }));
          return;
        }

        throw new Error("Next note number not received");
      } catch {
        const selectedFinancialYear =
          localStorage.getItem("selectedFinancialYear") ||
          getFallbackSelectedFinancialYear();
        const token = getFinancialYearToken(selectedFinancialYear);
        if (!token) return;

        const prefix = formData.noteType === "Debit Note" ? "DN" : "CN";
        setFormData((prev) => ({
          ...prev,
          noteNumber: `MC/${prefix}/${token}/001`,
        }));
      }
    };

    populateNextNoteNumber();
  }, [show, editingRecord, formData.noteType]);

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
            hsnCode: service.hsnCode || "",
          }));

        setServiceOptions(normalizedServices);
      } catch {
        setServiceOptions([]);
      }
    };

    fetchBusinessSettings();
  }, [show]);

  useEffect(() => {
    if (!show) return;

    const fetchFinancialYearDates = async () => {
      try {
        const selectedFinancialYear =
          localStorage.getItem("selectedFinancialYear") ||
          getFallbackSelectedFinancialYear();

        const response = await apiGet(API_ENDPOINTS.FINANCIAL_YEARS.GET_ALL);
        const yearRecord = Array.isArray(response?.data)
          ? response.data.find((y) => y.financialYear === selectedFinancialYear)
          : null;

        if (yearRecord && yearRecord.startDate && yearRecord.endDate) {
          setFinancialYearDates({
            startDate: String(yearRecord.startDate).slice(0, 10),
            endDate: String(yearRecord.endDate).slice(0, 10),
          });
        } else {
          setFinancialYearDates({ startDate: null, endDate: null });
        }
      } catch {
        setFinancialYearDates({ startDate: null, endDate: null });
      }
    };

    fetchFinancialYearDates();
  }, [show]);

  const invoiceSelectStyles = getUnifiedSelectStyles({
    hasError: Boolean(errors.invoiceId),
  });
  const itemServiceSelectStyles = getUnifiedSelectStyles({
    hasError: Boolean(errors.items),
  });

  const selectedInvoice = invoiceOptions.find(
    (invoice) =>
      String(invoice.value) === String(formData.invoiceId) ||
      String(invoice.invoiceNumber || "") === String(formData.invoiceNumber),
  );
  const reasonOptions =
    NOTE_TYPE_REASONS[formData.noteType] || NOTE_TYPE_REASONS["Credit Note"];
  const statusOptions =
    NOTE_TYPE_STATUSES[formData.noteType] || NOTE_TYPE_STATUSES["Credit Note"];
  const selectMenuPortalTarget =
    typeof document !== "undefined" ? document.body : null;

  const applyInvoiceAutofill = (invoice) => {
    if (!invoice) return;

    // User will add note items manually.
    setItems([DEFAULT_NOTE_ITEM]);

    setFormData((prev) => ({
      ...prev,
      invoiceId: invoice._id || invoice.id || invoice.invoiceNumber,
      invoiceNumber: invoice.invoiceNumber || prev.invoiceNumber,
      clientId: invoice.clientId || invoice.clientRefId || prev.clientId,
      clientName: invoice.clientName || prev.clientName,
      businessName: invoice.businessName || prev.businessName,
      address: invoice.address || prev.address,
      placeOfSupply: invoice.placeOfSupply || prev.placeOfSupply,
      phoneNumber: invoice.phoneNumber || prev.phoneNumber,
      gstin: invoice.gstin || "",
      noGSTIN: invoice.noGSTIN !== undefined ? invoice.noGSTIN : !invoice.gstin,
    }));
  };

  useEffect(() => {
    if (!show) return;
    recalculateFromItems(items, formData.taxRate);
  }, [items, formData.taxRate, show]);

  useEffect(() => {
    if (!show) return;

    const allowedReasons =
      NOTE_TYPE_REASONS[formData.noteType] || NOTE_TYPE_REASONS["Credit Note"];
    const allowedStatuses =
      NOTE_TYPE_STATUSES[formData.noteType] ||
      NOTE_TYPE_STATUSES["Credit Note"];

    setFormData((prev) => ({
      ...prev,
      reasonAdjustmentType: allowedReasons.includes(prev.reasonAdjustmentType)
        ? prev.reasonAdjustmentType
        : "",
      status: allowedStatuses.includes(prev.status)
        ? prev.status
        : prev.status || "Draft",
    }));
  }, [formData.noteType, show]);

  const handleItemChange = (id, field, value) => {
    const updatedItems = items.map((item) => {
      if (item.id !== id) return item;

      const updatedItem = {
        ...item,
        [field]: value,
      };

      if (field === "qty" || field === "price") {
        const qty = toNumber(field === "qty" ? value : updatedItem.qty);
        const price = toNumber(field === "price" ? value : updatedItem.price);
        updatedItem.amount = Number((qty * price).toFixed(2));
      }

      return updatedItem;
    });

    setItems(updatedItems);

    if (errors.items) {
      setErrors((prev) => ({
        ...prev,
        items: "",
      }));
    }
  };

  const handleServiceSelect = (id, selectedOption) => {
    const updatedItems = items.map((item) => {
      if (item.id !== id) return item;

      return {
        ...item,
        itemName: selectedOption?.value || "",
        hsnCode: selectedOption?.hsnCode || "",
      };
    });

    setItems(updatedItems);

    if (errors.items) {
      setErrors((prev) => ({
        ...prev,
        items: "",
      }));
    }
  };

  const handleAddItem = () => {
    const nextId =
      items.length > 0 ? Math.max(...items.map((item) => item.id)) + 1 : 1;

    setItems((prev) => [
      ...prev,
      {
        ...DEFAULT_NOTE_ITEM,
        id: nextId,
      },
    ]);
  };

  const handleRemoveItem = (id) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;

    if (name === "noteType") {
      setFormData((prev) => ({
        ...prev,
        noteType: value,
        noteNumber: value ? prev.noteNumber : "",
      }));
      return;
    }

    if (name === "invoiceId") {
      setFormData((prev) => ({
        ...prev,
        invoiceId: value,
      }));
      return;
    }

    if (name === "phoneNumber") {
      setFormData((prev) => ({
        ...prev,
        phoneNumber: value.replace(/\D/g, "").slice(0, 10),
      }));
      return;
    }

    if (name === "gstin") {
      setFormData((prev) => ({
        ...prev,
        gstin: value.toUpperCase(),
      }));
      return;
    }

    if (name === "taxRate") {
      const nextValue = value.replace(/[^0-9.]/g, "");
      setFormData((prev) => ({
        ...prev,
        taxRate: nextValue,
      }));
      return;
    }

    if (name === "refundAmount" || name === "receivedAmount") {
      setFormData((prev) => ({
        ...prev,
        [name]: sanitizeAmountText(value),
      }));
      return;
    }

    if (name === "noGSTIN") {
      setFormData((prev) => ({
        ...prev,
        noGSTIN: e.target.checked,
        gstin: e.target.checked ? "" : prev.gstin,
      }));
      return;
    }

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const validateForm = () => {
    const nextErrors = {};

    if (!formData.noteType.trim())
      nextErrors.noteType = "Note type is required";
    if (!formData.noteNumber.trim())
      nextErrors.noteNumber = "Note number is required";
    if (!formData.invoiceId.trim()) nextErrors.invoiceId = "Select an invoice";
    if (!formData.clientName.trim())
      nextErrors.clientName = "Client name is required";
    if (!formData.address.trim()) nextErrors.address = "Address is required";
    if (!formData.placeOfSupply.trim())
      nextErrors.placeOfSupply = "Place of supply is required";
    if (!formData.phoneNumber.trim())
      nextErrors.phoneNumber = "Phone number is required";
    if (!formData.noteDate) nextErrors.noteDate = "Note date is required";

    // Validate note date is within the financial year range
    if (
      formData.noteDate &&
      financialYearDates.startDate &&
      financialYearDates.endDate
    ) {
      const noteDate = new Date(formData.noteDate);
      const startDate = new Date(financialYearDates.startDate);
      const endDate = new Date(financialYearDates.endDate);

      if (noteDate < startDate || noteDate > endDate) {
        nextErrors.noteDate = `Note date must be between ${financialYearDates.startDate} and ${financialYearDates.endDate} (Selected Financial Year)`;
      }
    }

    if (!formData.amount || Number(formData.amount) <= 0)
      nextErrors.amount = "Amount must be greater than zero";

    const hasValidItem = items.some(
      (item) =>
        String(item.itemName || "").trim() !== "" &&
        toNumber(item.qty) > 0 &&
        toNumber(item.price) > 0,
    );
    if (!hasValidItem)
      nextErrors.items =
        "At least one item with name, quantity and price is required";
    if (!formData.reasonAdjustmentType.trim())
      nextErrors.reasonAdjustmentType = "Reason / adjustment type is required";
    if (!formData.status.trim()) nextErrors.status = "Status is required";
    if (formData.noteType === "Credit Note") {
      if (!formData.refundStatus.trim())
        nextErrors.refundStatus = "Refund status is required";
    }
    if (formData.noteType === "Debit Note") {
      if (!formData.paymentStatus.trim())
        nextErrors.paymentStatus = "Payment status is required";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (isViewMode) {
      onClose();
      return;
    }

    if (!validateForm()) return;

    // For new records (not editing), check for duplicate note number
    if (!isEditMode) {
      checkDuplicateNoteNumber();
    } else {
      // For edit mode, proceed directly with submission
      submitNote();
    }
  };

  const checkDuplicateNoteNumber = async () => {
    try {
      const response = await apiGet(
        `${API_ENDPOINTS.CREDIT_DEBIT_NOTES.GET_ALL}?action=check-duplicate&noteNumber=${encodeURIComponent(formData.noteNumber)}`,
      );

      if (response?.data?.exists) {
        setErrors((prev) => ({
          ...prev,
          noteNumber: `Note number "${formData.noteNumber}" already exists. Please use a different note number.`,
        }));
        return;
      }

      // No duplicate, proceed with submission
      submitNote();
    } catch (error) {
      console.error("Error checking duplicate note number:", error);
      // If there's an error checking duplicates, still allow submission
      // (network error, not necessarily a duplicate)
      submitNote();
    }
  };

  const submitNote = () => {
    const amounts = calculateAmounts(formData.amount, formData.taxRate);

    onSubmit({
      ...formData,
      items: items.map((item) => ({
        ...item,
        qty: toNumber(item.qty),
        price: toNumber(item.price),
        amount: toNumber(item.amount),
      })),
      amount: amounts.amount,
      taxRate: amounts.taxRate,
      taxAmount: amounts.taxAmount,
      totalAmount: amounts.totalAmount,
      refundAmount: toNumber(formData.refundAmount),
      receivedAmount: toNumber(formData.receivedAmount),
      appliedAdvances:
        formData.noteType === "Debit Note"
          ? appliedAdvances
              .filter((adv) => toNumber(adv.appliedAmount) > 0)
              .map((adv) => ({
                advanceId: adv.advanceId,
                receiptNumber: adv.receiptNumber,
                appliedAmount: toNumber(adv.appliedAmount),
                maxAmount: toNumber(adv.maxAmount),
                paymentMethod: adv.paymentMethod || "",
                receiptDate: adv.receiptDate || "",
              }))
          : [],
      noteDate: formData.noteDate,
      id: editingRecord?.id || editingRecord?._id || null,
    });
  };

  if (!show) return null;

  const modalTitle = editingRecord
    ? isViewMode
      ? `View Note - ${editingRecord.noteNumber}`
      : `Edit Note - ${editingRecord.noteNumber}`
    : "Add New Credit/Debit Note";

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
            <form id="creditDebitNoteForm" onSubmit={handleSubmit} noValidate>
              <div className="row">
                <div className="col-md-3 mb-3">
                  <label htmlFor="noteType" className="form-label">
                    <i className="fas fa-envelope-open-text me-2 text-primary"></i>
                    Note Type <span className="text-danger">*</span>
                  </label>
                  <select
                    className={`form-select modern-input ${errors.noteType ? "is-invalid" : ""}`}
                    id="noteType"
                    name="noteType"
                    value={formData.noteType}
                    onChange={handleInputChange}
                    disabled={isViewMode}
                  >
                    <option value="" disabled>
                      Select Note Type
                    </option>
                    <option value="Credit Note">Credit Note</option>
                    <option value="Debit Note">Debit Note</option>
                  </select>
                  {errors.noteType && (
                    <div className="invalid-feedback d-block">
                      {errors.noteType}
                    </div>
                  )}
                </div>

                <div className="col-md-3 mb-3">
                  <label htmlFor="noteNumber" className="form-label">
                    <i className="fas fa-id-card me-2 text-primary"></i>
                    Note Number <span className="text-danger">*</span>
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.noteNumber ? "is-invalid" : ""}`}
                    id="noteNumber"
                    name="noteNumber"
                    value={formData.noteNumber}
                    onChange={handleInputChange}
                    readOnly
                    placeholder="Enter Note Number"
                    maxLength="30"
                  />
                  {errors.noteNumber && (
                    <div className="invalid-feedback d-block">
                      {errors.noteNumber}
                    </div>
                  )}
                </div>

                <div className="col-md-3 mb-3">
                  <label htmlFor="noteDate" className="form-label">
                    <i className="fas fa-calendar-days me-2 text-primary"></i>
                    Note Date <span className="text-danger">*</span>
                  </label>
                  <input
                    type="date"
                    className={`form-control modern-input ${errors.noteDate ? "is-invalid" : ""}`}
                    id="noteDate"
                    name="noteDate"
                    value={formData.noteDate}
                    onChange={handleInputChange}
                    readOnly={isViewMode || Boolean(formData.invoiceId)}
                    disabled={isViewMode || Boolean(formData.invoiceId)}
                  />
                  {errors.noteDate && (
                    <div className="invalid-feedback d-block">
                      {errors.noteDate}
                    </div>
                  )}
                </div>

                <div className="col-md-3 mb-3">
                  <label htmlFor="reasonAdjustmentType" className="form-label">
                    <i className="fas fa-circle-info me-2 text-primary"></i>
                    Service Reason / Adjustment Type{" "}
                    <span className="text-danger">*</span>
                  </label>
                  <Select
                    inputId="reasonAdjustmentType"
                    name="reasonAdjustmentType"
                    classNamePrefix="react-select"
                    styles={getUnifiedSelectStyles({
                      hasError: Boolean(errors.reasonAdjustmentType),
                    })}
                    value={
                      reasonOptions
                        .map((option) => ({ value: option, label: option }))
                        .find(
                          (option) =>
                            option.value === formData.reasonAdjustmentType,
                        ) || null
                    }
                    onChange={(selectedOption) => {
                      setFormData((prev) => ({
                        ...prev,
                        reasonAdjustmentType: selectedOption
                          ? selectedOption.value
                          : "",
                      }));
                    }}
                    options={reasonOptions.map((option) => ({
                      value: option,
                      label: option,
                    }))}
                    isDisabled={isViewMode}
                    isClearable={false}
                    isSearchable
                    placeholder="Select Reason / Adjustment Type"
                  />
                  {errors.reasonAdjustmentType && (
                    <div className="invalid-feedback d-block">
                      {errors.reasonAdjustmentType}
                    </div>
                  )}
                </div>

                <div className="col-md-3 mb-3">
                  <label htmlFor="status" className="form-label">
                    <i className="fas fa-circle-check me-2 text-primary"></i>
                    Status <span className="text-danger">*</span>
                  </label>
                  <Select
                    inputId="status"
                    name="status"
                    classNamePrefix="react-select"
                    styles={getUnifiedSelectStyles({
                      hasError: Boolean(errors.status),
                    })}
                    value={
                      statusOptions
                        .map((option) => ({ value: option, label: option }))
                        .find((option) => option.value === formData.status) ||
                      null
                    }
                    onChange={(selectedOption) => {
                      setFormData((prev) => ({
                        ...prev,
                        status: selectedOption ? selectedOption.value : "",
                      }));
                    }}
                    options={statusOptions.map((option) => ({
                      value: option,
                      label: option,
                    }))}
                    isDisabled={isViewMode}
                    isClearable={false}
                    isSearchable
                    placeholder="Select Status"
                  />
                  {errors.status && (
                    <div className="invalid-feedback d-block">
                      {errors.status}
                    </div>
                  )}
                </div>

                <div className="col-md-3 mb-3">
                  <label htmlFor="invoiceId" className="form-label">
                    <i className="fas fa-file-invoice me-2 text-primary"></i>
                    Select Invoice Number <span className="text-danger">*</span>
                  </label>
                  <Select
                    inputId="invoiceId"
                    name="invoiceId"
                    classNamePrefix="react-select"
                    styles={invoiceSelectStyles}
                    isLoading={invoiceLoading}
                    value={selectedInvoice || null}
                    onChange={(selectedOption) => {
                      if (!selectedOption) {
                        setItems([DEFAULT_NOTE_ITEM]);
                        setFormData((prev) => ({
                          ...prev,
                          invoiceId: "",
                          invoiceNumber: "",
                          clientId: "",
                          clientName: "",
                          businessName: "",
                          address: "",
                          placeOfSupply: "",
                          phoneNumber: "",
                          gstin: "",
                          noGSTIN: false,
                          noteDate: getTodayDateString(),
                          amount: "",
                          taxRate: "18",
                          taxAmount: "",
                          totalAmount: "",
                        }));
                        return;
                      }

                      applyInvoiceAutofill(selectedOption);
                    }}
                    options={invoiceOptions}
                    isDisabled={isViewMode || isEditMode}
                    isClearable
                    isSearchable
                    placeholder="Search and select invoice"
                  />
                  {errors.invoiceId && (
                    <div className="invalid-feedback d-block">
                      {errors.invoiceId}
                    </div>
                  )}
                </div>

                <div className="col-md-3 mb-3">
                  <label htmlFor="invoiceNumber" className="form-label">
                    <i className="fas fa-hashtag me-2 text-primary"></i>
                    Invoice Number
                  </label>
                  <input
                    type="text"
                    className="form-control modern-input"
                    id="invoiceNumber"
                    name="invoiceNumber"
                    value={formData.invoiceNumber}
                    readOnly
                    disabled
                    placeholder="Selected invoice number"
                  />
                </div>

                <div className="col-md-3 mb-3">
                  <label htmlFor="clientId" className="form-label">
                    <i className="fas fa-id-badge me-2 text-primary"></i>
                    Client ID
                  </label>
                  <input
                    type="text"
                    className="form-control modern-input"
                    id="clientId"
                    name="clientId"
                    value={formData.clientId}
                    readOnly
                    disabled
                    placeholder="Auto-filled from invoice"
                  />
                </div>

                <div className="col-md-3 mb-3">
                  <label htmlFor="clientName" className="form-label">
                    <i className="fas fa-user me-2 text-primary"></i>
                    Client Name
                  </label>
                  <input
                    type="text"
                    className="form-control modern-input"
                    id="clientName"
                    name="clientName"
                    value={formData.clientName}
                    readOnly
                    disabled
                    placeholder="Auto-filled from invoice"
                  />
                </div>

                <div className="col-md-3 mb-3">
                  <label htmlFor="businessName" className="form-label">
                    <i className="fas fa-building me-2 text-primary"></i>
                    Business Name
                  </label>
                  <input
                    type="text"
                    className="form-control modern-input"
                    id="businessName"
                    name="businessName"
                    value={formData.businessName}
                    readOnly
                    disabled
                    placeholder="Auto-filled from invoice"
                  />
                </div>

                <div className="col-md-3 mb-3">
                  <label htmlFor="phoneNumber" className="form-label">
                    <i className="fas fa-phone me-2 text-primary"></i>
                    Phone Number <span className="text-danger">*</span>
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
                      className={`form-control modern-input rounded-end-3 ${errors.phoneNumber ? "is-invalid" : ""}`}
                      id="phoneNumber"
                      name="phoneNumber"
                      value={formData.phoneNumber}
                      onChange={handleInputChange}
                      minLength="10"
                      maxLength="10"
                      placeholder="10-digit mobile number"
                      readOnly={isViewMode || Boolean(formData.invoiceId)}
                      disabled={isViewMode || Boolean(formData.invoiceId)}
                    />
                  </div>
                  {errors.phoneNumber && (
                    <div className="invalid-feedback d-block mt-1">
                      {errors.phoneNumber}
                    </div>
                  )}
                </div>

                <div className="col-md-3 mb-3">
                  <label htmlFor="address" className="form-label">
                    <i className="fas fa-map-marker-alt me-2 text-primary"></i>
                    Address
                  </label>
                  <input
                    type="text"
                    className="form-control modern-input"
                    id="address"
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    placeholder="Enter Complete Address"
                    readOnly={isViewMode || Boolean(formData.invoiceId)}
                    disabled={isViewMode || Boolean(formData.invoiceId)}
                    onInput={(event) => {
                      event.target.value = event.target.value.replace(
                        /\b\w/g,
                        (char) => char.toUpperCase(),
                      );
                      handleInputChange(event);
                    }}
                  />
                </div>

                <div className="col-md-3 mb-3">
                  <label htmlFor="placeOfSupply" className="form-label">
                    <i className="fas fa-map-marked-alt me-2 text-primary"></i>
                    Place of Supply
                  </label>
                  <Select
                    inputId="placeOfSupply"
                    name="placeOfSupply"
                    classNamePrefix="react-select"
                    styles={getUnifiedSelectStyles({
                      hasError: Boolean(errors.placeOfSupply),
                    })}
                    value={
                      INDIAN_STATES.map((state) => ({
                        value: `${state.name} (${state.code})`,
                        label: `${state.name} (${state.code})`,
                      })).find(
                        (option) => option.value === formData.placeOfSupply,
                      ) || null
                    }
                    onChange={(selectedOption) => {
                      setFormData((prev) => ({
                        ...prev,
                        placeOfSupply: selectedOption
                          ? selectedOption.value
                          : "",
                      }));
                    }}
                    options={INDIAN_STATES.map((state) => ({
                      value: `${state.name} (${state.code})`,
                      label: `${state.name} (${state.code})`,
                    }))}
                    isDisabled={Boolean(formData.invoiceId) || isViewMode}
                    isClearable
                    isSearchable
                    placeholder="Select Place of Supply"
                  />
                  {errors.placeOfSupply && (
                    <div className="invalid-feedback d-block">
                      {errors.placeOfSupply}
                    </div>
                  )}
                </div>

                <div className="col-md-3 mb-3">
                  <label htmlFor="gstin" className="form-label">
                    <i className="fas fa-file-invoice me-2 text-primary"></i>
                    GSTIN Number
                  </label>
                  <div className="input-group">
                    <span className="input-group-text gstin-icon-left">
                      {formData.noGSTIN ? (
                        <i className="fas fa-ban text-secondary"></i>
                      ) : formData.gstin ? (
                        <i className="fas fa-check-circle text-success"></i>
                      ) : (
                        <i className="fas fa-file-alt text-muted"></i>
                      )}
                    </span>
                    <input
                      type="text"
                      className="form-control modern-input"
                      id="gstin"
                      name="gstin"
                      value={formData.gstin}
                      onChange={handleInputChange}
                      placeholder="Enter GSTIN Number"
                      readOnly={
                        isViewMode ||
                        formData.noGSTIN ||
                        Boolean(formData.invoiceId)
                      }
                      disabled={
                        isViewMode ||
                        formData.noGSTIN ||
                        Boolean(formData.invoiceId)
                      }
                      maxLength="15"
                    />
                  </div>
                </div>

                <div className="col-12 mb-3">
                  <h6 className="border-bottom pb-2 mb-3">
                    <i className="fas fa-th-list me-2 text-info"></i>
                    Items Details
                  </h6>

                  {errors.items && (
                    <div className="alert alert-danger">{errors.items}</div>
                  )}

                  <div className="table-responsive d-none d-lg-block">
                    <table className="table table-bordered table-hover">
                      <thead className="table-success">
                        <tr>
                          <th style={{ width: "50px" }}>S.N</th>
                          <th style={{ width: "200px" }}>Services Name</th>
                          <th style={{ width: "250px" }}>Item Description</th>
                          <th style={{ width: "120px" }}>HSN Code</th>
                          <th style={{ width: "100px" }}>QTY</th>
                          <th style={{ width: "120px" }}>Price (Rs)</th>
                          <th style={{ width: "120px" }}>Amount (Rs)</th>
                          <th style={{ width: "80px" }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item, index) => (
                          <tr key={item.id}>
                            <td className="text-center align-middle">
                              <strong>{index + 1}</strong>
                            </td>
                            <td>
                              <Select
                                classNamePrefix="react-select"
                                styles={{
                                  ...itemServiceSelectStyles,
                                  menuPortal: (base) => ({
                                    ...base,
                                    zIndex: 9999,
                                  }),
                                }}
                                menuPortalTarget={selectMenuPortalTarget}
                                menuPosition="fixed"
                                value={
                                  serviceOptions.find(
                                    (option) => option.value === item.itemName,
                                  ) ||
                                  (item.itemName
                                    ? {
                                        value: item.itemName,
                                        label: item.itemName,
                                        hsnCode: item.hsnCode || "",
                                      }
                                    : null)
                                }
                                onChange={(selectedOption) =>
                                  handleServiceSelect(item.id, selectedOption)
                                }
                                isDisabled={isViewMode}
                                isClearable
                                isSearchable
                                placeholder="Select Service..."
                                options={serviceOptions}
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                className="form-control modern-input form-control-sm"
                                value={item.itemDescription}
                                onChange={(event) =>
                                  handleItemChange(
                                    item.id,
                                    "itemDescription",
                                    event.target.value,
                                  )
                                }
                                readOnly={isViewMode}
                                placeholder="Description"
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                className="form-control modern-input form-control-sm"
                                value={item.hsnCode}
                                onChange={(event) =>
                                  handleItemChange(
                                    item.id,
                                    "hsnCode",
                                    event.target.value,
                                  )
                                }
                                readOnly={isViewMode}
                                placeholder="HSN Code"
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                className="form-control modern-input form-control-sm"
                                value={item.qty}
                                onChange={(event) =>
                                  handleItemChange(
                                    item.id,
                                    "qty",
                                    event.target.value,
                                  )
                                }
                                readOnly={isViewMode}
                                min="0"
                                step="0.01"
                                placeholder="QTY"
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                className="form-control modern-input form-control-sm"
                                value={item.price}
                                onChange={(event) =>
                                  handleItemChange(
                                    item.id,
                                    "price",
                                    event.target.value,
                                  )
                                }
                                readOnly={isViewMode}
                                min="0"
                                step="0.01"
                                placeholder="Price"
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                className="form-control modern-input form-control-sm"
                                value={toNumber(item.amount).toFixed(2)}
                                readOnly
                                style={{
                                  backgroundColor: "#f8f9fa",
                                  fontWeight: "bold",
                                }}
                              />
                            </td>
                            <td className="text-center align-middle">
                              {!isViewMode && (
                                <button
                                  type="button"
                                  className="btn btn-danger btn-sm"
                                  onClick={() => handleRemoveItem(item.id)}
                                  disabled={items.length <= 1}
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
                      onClick={handleAddItem}
                    >
                      <i className="fas fa-plus me-2"></i>
                      Add More
                    </button>
                  )}
                </div>

                {formData.noteType === "Debit Note" && formData.invoiceId && (
                  <div className="col-12 mb-3">
                    <div className="card shadow-sm border-0">
                      <div className="card-header bg-info text-white">
                        <h6 className="mb-0">
                          <i className="fas fa-wallet me-2"></i>
                          Advance Amount Adjustment
                        </h6>
                      </div>
                      <div className="card-body">
                        {isLoadingAdvances ? (
                          <div className="text-muted small">
                            Loading advances...
                          </div>
                        ) : availableAdvances.length === 0 ? (
                          <div className="text-muted small">
                            No available advance amount for this client.
                          </div>
                        ) : (
                          <div className="table-responsive">
                            <table className="table table-sm table-bordered align-middle mb-0">
                              <thead>
                                <tr>
                                  <th>Apply</th>
                                  <th>Receipt No.</th>
                                  <th>Date</th>
                                  <th>Available</th>
                                  <th>Apply Amount</th>
                                </tr>
                              </thead>
                              <tbody>
                                {availableAdvances.map((adv) => {
                                  const key = String(adv.id || "");
                                  const entry = appliedAdvances.find(
                                    (item) => String(item.advanceId) === key,
                                  );
                                  const checked = Boolean(entry);
                                  return (
                                    <tr key={key}>
                                      <td className="text-center">
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          disabled={isViewMode}
                                          onChange={(event) => {
                                            if (event.target.checked) {
                                              setAppliedAdvances((prev) => [
                                                ...prev,
                                                {
                                                  advanceId: key,
                                                  receiptNumber:
                                                    adv.receiptNumber || "",
                                                  appliedAmount: toNumber(
                                                    adv.availableAmount,
                                                  ),
                                                  maxAmount: toNumber(
                                                    adv.availableAmount,
                                                  ),
                                                  paymentMethod:
                                                    adv.paymentMethod || "",
                                                  receiptDate:
                                                    adv.receiptDate || "",
                                                },
                                              ]);
                                            } else {
                                              setAppliedAdvances((prev) =>
                                                prev.filter(
                                                  (item) =>
                                                    String(item.advanceId) !==
                                                    key,
                                                ),
                                              );
                                            }
                                          }}
                                        />
                                      </td>
                                      <td>{adv.receiptNumber || "-"}</td>
                                      <td>
                                        {formatDateWithFinancialYear(
                                          adv.receiptDate,
                                          adv.financialYear,
                                        )}
                                      </td>
                                      <td>
                                        ₹
                                        {toNumber(
                                          adv.availableAmount,
                                        ).toLocaleString("en-IN")}
                                      </td>
                                      <td style={{ width: "180px" }}>
                                        <input
                                          type="number"
                                          className="form-control form-control-sm"
                                          disabled={!checked || isViewMode}
                                          min="0"
                                          max={toNumber(adv.availableAmount)}
                                          step="0.01"
                                          value={entry?.appliedAmount || ""}
                                          onChange={(event) => {
                                            const raw = toNumber(
                                              event.target.value,
                                            );
                                            const next = Math.min(
                                              toNumber(adv.availableAmount),
                                              Math.max(0, raw),
                                            );
                                            setAppliedAdvances((prev) =>
                                              prev.map((item) =>
                                                String(item.advanceId) === key
                                                  ? {
                                                      ...item,
                                                      appliedAmount: next,
                                                    }
                                                  : item,
                                              ),
                                            );
                                          }}
                                        />
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                <div className="col-md-6 mb-3">
                  <div
                    className="card shadow-sm border-0 h-90"
                    style={{ backgroundColor: "#f8f9fa" }}
                  >
                    <div className="card-header bg-success rounded-top-3 text-white">
                      <h6 className="mb-0">
                        <i className="fas fa-note-sticky me-2"></i>
                        Remarks
                      </h6>
                    </div>
                    <div className="card-body d-flex">
                      <textarea
                        className="form-control modern-input flex-grow-1"
                        id="remarks"
                        name="remarks"
                        value={formData.remarks}
                        onChange={handleInputChange}
                        readOnly={isViewMode}
                        placeholder="Optional remarks"
                        style={{ minHeight: "285px" }}
                      />
                    </div>
                  </div>
                </div>

                <div className="col-md-6 mb-3">
                  <div
                    className="card shadow-sm border-0 h-90"
                    style={{ backgroundColor: "#f8f9fa" }}
                  >
                    <div className="card-header bg-success rounded-top-3 text-white">
                      <h6 className="mb-0">
                        <i className="fas fa-receipt me-2"></i>
                        Amount Calculation
                      </h6>
                    </div>
                    <div className="card-body">
                      <div className="row">
                        <div className="col-md-4 mb-3">
                          <label
                            htmlFor="amount"
                            className="form-label fw-bold"
                          >
                            Subtotal Amount
                          </label>
                          <div className="input-group">
                            <span className="input-group-text uniform-group-icon bg-info text-white">
                              ₹
                            </span>
                            <input
                              type="number"
                              className="form-control modern-input fw-bold"
                              id="amount"
                              value={formData.amount}
                              readOnly
                              disabled
                            />
                          </div>
                        </div>

                        <div className="col-md-4 mb-3">
                          <label
                            htmlFor="taxRate"
                            className="form-label fw-bold"
                          >
                            Tax Percentage
                          </label>
                          <div className="input-group">
                            <span className="input-group-text uniform-group-icon bg-warning text-white">
                              %
                            </span>
                            <input
                              type="number"
                              className="form-control modern-input"
                              id="taxRate"
                              name="taxRate"
                              value={formData.taxRate}
                              onChange={handleInputChange}
                              readOnly={isViewMode}
                              disabled={isViewMode}
                              min="0"
                              step="0.01"
                            />
                          </div>
                        </div>

                        <div className="col-md-4 mb-3">
                          <label
                            htmlFor="taxAmount"
                            className="form-label fw-bold"
                          >
                            Tax Amount
                          </label>
                          <div className="input-group">
                            <span className="input-group-text uniform-group-icon bg-success text-white">
                              ₹
                            </span>
                            <input
                              type="number"
                              className="form-control modern-input fw-bold"
                              id="taxAmount"
                              value={formData.taxAmount}
                              readOnly
                              disabled
                            />
                          </div>
                        </div>

                        <div className="col-md-4 mb-3">
                          <label
                            htmlFor="totalAmount"
                            className="form-label fw-bold"
                          >
                            Total Amount
                          </label>
                          <div className="input-group">
                            <span className="input-group-text uniform-group-icon bg-danger text-white">
                              ₹
                            </span>
                            <input
                              type="number"
                              className="form-control modern-input fw-bold text-danger"
                              id="totalAmount"
                              value={formData.totalAmount}
                              readOnly
                              disabled
                            />
                          </div>
                        </div>

                        {formData.noteType === "Credit Note" && (
                          <>
                            <div className="col-md-4 mb-3">
                              <label className="form-label fw-bold">
                                Refund Status
                              </label>
                              <div className="input-group">
                                <span className="input-group-text uniform-group-icon bg-primary text-white">
                                  <i className="fas fa-circle-check"></i>
                                </span>
                                <select
                                  className={`form-select modern-input ${errors.refundStatus ? "is-invalid" : ""}`}
                                  name="refundStatus"
                                  value={formData.refundStatus}
                                  onChange={handleInputChange}
                                  disabled={isViewMode}
                                >
                                  <option value="">Select Refund Status</option>
                                  {REFUND_STATUS_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                      {option === "Full Refund"
                                        ? "✓ Full Refund"
                                        : option === "Partial Refund"
                                          ? "⧗ Partial Refund"
                                          : "✗ Pending"}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div className="col-md-4 mb-3">
                              <label className="form-label fw-bold">
                                Refund Date
                              </label>
                              <input
                                type="date"
                                className="form-control modern-input"
                                name="refundDate"
                                value={formData.refundDate}
                                onChange={handleInputChange}
                                readOnly={isViewMode}
                                disabled={isViewMode}
                              />
                            </div>
                            <div className="col-md-4 mb-3">
                              <label className="form-label fw-bold">
                                Refund Amount
                              </label>
                              <div className="input-group">
                                <span className="input-group-text uniform-group-icon bg-success text-white">
                                  ₹
                                </span>
                                <input
                                  type="text"
                                  className="form-control modern-input"
                                  name="refundAmount"
                                  value={formData.refundAmount}
                                  onChange={handleInputChange}
                                  readOnly={isViewMode}
                                  inputMode="decimal"
                                  placeholder="0.00"
                                />
                              </div>
                            </div>
                            <div className="col-md-4 mb-3">
                              <label className="form-label fw-bold">
                                Refund Method
                              </label>
                              <div className="input-group">
                                <span className="input-group-text uniform-group-icon bg-warning text-white">
                                  <i className="fas fa-money-check-dollar"></i>
                                </span>
                                <select
                                  className="form-select modern-input"
                                  name="refundMethod"
                                  value={formData.refundMethod}
                                  onChange={handleInputChange}
                                  disabled={isViewMode}
                                >
                                  <option value="">Select Refund Method</option>
                                  {PAYMENT_METHOD_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                      {option === "Cash"
                                        ? "💵 Cash"
                                        : option === "Bank Transfer"
                                          ? "🏦 Bank Transfer"
                                          : option === "Card"
                                            ? "💳 Card"
                                            : option === "UPI"
                                              ? "📱 UPI"
                                              : option === "Cheque"
                                                ? "📝 Cheque"
                                                : option === "IMPS"
                                                  ? "🏦 IMPS"
                                                  : option === "RTGS"
                                                    ? "🏦 RTGS"
                                                    : option ===
                                                        "Zoho Payment Gateway"
                                                      ? "🌐 Zoho Payment Gateway"
                                                      : option ===
                                                          "Cashfree Payment Gateway"
                                                        ? "🌐 Cashfree Payment Gateway"
                                                        : "🌐 PayU Payment Gateway"}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div className="col-md-4 mb-3">
                              <label className="form-label fw-bold">
                                Reference Number
                              </label>
                              <input
                                type="text"
                                className="form-control modern-input"
                                name="referenceNumber"
                                value={formData.referenceNumber}
                                onChange={handleInputChange}
                                readOnly={isViewMode}
                                placeholder="Transaction reference"
                              />
                            </div>
                          </>
                        )}

                        {formData.noteType === "Debit Note" && (
                          <>
                            <div className="col-md-4 mb-3">
                              <label className="form-label fw-bold">
                                Payment Status
                              </label>
                              <div className="input-group">
                                <span className="input-group-text uniform-group-icon bg-primary text-white">
                                  <i className="fas fa-circle-check"></i>
                                </span>
                                <select
                                  className={`form-select modern-input ${errors.paymentStatus ? "is-invalid" : ""}`}
                                  name="paymentStatus"
                                  value={formData.paymentStatus}
                                  onChange={handleInputChange}
                                  disabled={isViewMode}
                                >
                                  <option value="">
                                    Select Payment Status
                                  </option>
                                  {PAYMENT_STATUS_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                      {option === "Paid"
                                        ? "✓ Paid"
                                        : option === "Unpaid"
                                          ? "✗ Unpaid"
                                          : "⧗ Partial"}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            <div className="col-md-4 mb-3">
                              <label className="form-label fw-bold">
                                Payment Date
                              </label>
                              <input
                                type="date"
                                className="form-control modern-input"
                                name="paymentDate"
                                value={formData.paymentDate}
                                onChange={handleInputChange}
                                readOnly={isViewMode}
                                disabled={isViewMode}
                              />
                            </div>
                            <div className="col-md-4 mb-3">
                              <label className="form-label fw-bold">
                                Recived Amount
                              </label>
                              <div className="input-group">
                                <span className="input-group-text uniform-group-icon bg-success text-white">
                                  ₹
                                </span>
                                <input
                                  type="text"
                                  className="form-control modern-input"
                                  name="receivedAmount"
                                  value={formData.receivedAmount}
                                  onChange={handleInputChange}
                                  readOnly={isViewMode}
                                  inputMode="decimal"
                                  placeholder="0.00"
                                />
                              </div>
                            </div>
                            <div className="col-md-4 mb-3">
                              <label className="form-label fw-bold">
                                Payment Method
                              </label>
                              <div className="input-group">
                                <span className="input-group-text uniform-group-icon bg-warning text-white">
                                  <i className="fas fa-money-check-dollar"></i>
                                </span>
                                <select
                                  className="form-select modern-input"
                                  name="paymentMethod"
                                  value={formData.paymentMethod}
                                  onChange={handleInputChange}
                                  disabled={isViewMode}
                                >
                                  <option value="">
                                    Select Payment Method
                                  </option>
                                  {PAYMENT_METHOD_OPTIONS.map((option) => (
                                    <option key={option} value={option}>
                                      {option === "Cash"
                                        ? "💵 Cash"
                                        : option === "Bank Transfer"
                                          ? "🏦 Bank Transfer"
                                          : option === "Card"
                                            ? "💳 Card"
                                            : option === "UPI"
                                              ? "📱 UPI"
                                              : option === "Cheque"
                                                ? "📝 Cheque"
                                                : option === "IMPS"
                                                  ? "🏦 IMPS"
                                                  : option === "RTGS"
                                                    ? "🏦 RTGS"
                                                    : option ===
                                                        "Zoho Payment Gateway"
                                                      ? "🌐 Zoho Payment Gateway"
                                                      : option ===
                                                          "Cashfree Payment Gateway"
                                                        ? "🌐 Cashfree Payment Gateway"
                                                        : "🌐 PayU Payment Gateway"}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="d-flex justify-content-end gap-2 mt-3">
                <button
                  type="button"
                  className="btn btn-light"
                  onClick={onClose}
                >
                  {isViewMode ? "Close" : "Cancel"}
                </button>
                {!isViewMode && (
                  <button type="submit" className="btn btn-primary">
                    {editingRecord ? "Update Note" : "Save Note"}
                  </button>
                )}
              </div>
            </form>
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

        .uniform-group-icon {
          width: 44px;
          min-width: 44px;
          justify-content: center;
          padding-left: 0;
          padding-right: 0;
        }
      `}</style>
    </div>
  );
};

export default CreateCreditDebitNote;
