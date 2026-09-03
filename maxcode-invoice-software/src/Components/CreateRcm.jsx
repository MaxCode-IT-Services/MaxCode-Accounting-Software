import React, { useState, useEffect } from "react";
import Select from "react-select";
import ConfirmationModal from "./ConfirmationModal";
import UploadedFilePreviewBox from "./UploadedFilePreviewBox";
import { showError } from "./ToastNotification";
import { apiGet } from "../utils/api";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { getUnifiedSelectStyles } from "../utils/reactSelectStyles";
import { normalizePaymentMethod } from "../utils/paymentMethods";

const SELF_INVOICE_SINGLE_LINE_ADDRESS_MAX_LENGTH = 57;
const RCM_ITEM_NAME_MAX_LENGTH = 25;
const RCM_ITEM_DESCRIPTION_MAX_LENGTH = 27;

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

const CreateRcm = ({
  show,
  onClose,
  onSubmit,
  editingRecord = null,
  defaultFinancialYear = null,
}) => {
  const [formData, setFormData] = useState({
    selfInvoiceNumber: "",
    invoiceDate: "",
    originalRefNo: "",
    rcmURL: "",
    serviceProviderBusinessName: "",
    gstin: "",
    noGSTIN: false,
    address: "",
    placeOfSupply: "Rajasthan (08)",
    roundingAmount: "0",
    paymentStatus: "Unpaid",
    paymentMethod: "",
    paymentSource: "Business Account",
    paymentDate: "",
    paidAmount: "",
    tdsPercent: "0",
    tdsAmount: "0",
  });

  const [items, setItems] = useState([
    {
      id: 1,
      itemName: "",
      itemDescription: "",
      hsnCode: "",
      qty: "",
      price: "",
      amount: 0,
    },
  ]);

  const [taxData, setTaxData] = useState({
    subtotal: "0.00",
    taxPercentage: 18,
    cgst: "0.00",
    sgst: "0.00",
    igst: "0.00",
    totalAmount: "0.00",
  });

  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [selectedRcmFile, setSelectedRcmFile] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const [roundingEnabled, setRoundingEnabled] = useState(true);

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

  // GSTIN validation function
  const validateGSTIN = (gstin) => {
    if (!gstin || formData.noGSTIN) return true;

    const gstinPattern =
      /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}[Z]{1}[0-9A-Z]{1}$/;

    if (!gstinPattern.test(gstin)) {
      return false;
    }

    return validateGSTINChecksum(gstin);
  };

  const validateGSTINChecksum = (gstin) => {
    if (gstin.length !== 15) return false;

    const GSTIN_CODEPOINT_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let factor = 2;
    let sum = 0;

    for (let i = gstin.length - 2; i >= 0; i--) {
      let codePoint = GSTIN_CODEPOINT_CHARS.indexOf(gstin[i]);
      if (codePoint === -1) return false;

      let digit = factor * codePoint;
      factor = factor === 2 ? 1 : 2;
      digit = Math.floor(digit / 36) + (digit % 36);
      sum += digit;
    }

    sum = sum % 36;
    let checkCodePoint = (36 - sum) % 36;

    return gstin[gstin.length - 1] === GSTIN_CODEPOINT_CHARS[checkCodePoint];
  };

  // Indian states list for Place of Supply dropdown
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
    { code: "37", name: "Andhra Pradesh (New)" },
    { code: "38", name: "Ladakh" },
  ];

  useEffect(() => {
    if (editingRecord) {
      setFormData({
        selfInvoiceNumber: editingRecord.selfInvoiceNumber || "",
        invoiceDate: editingRecord.invoiceDate || "",
        originalRefNo: editingRecord.originalRefNo || "",
        rcmURL: editingRecord.rcmURL || editingRecord.invoiceURL || "",
        serviceProviderBusinessName:
          editingRecord.serviceProviderBusinessName || "",
        gstin: editingRecord.gstin || "",
        noGSTIN: editingRecord.noGSTIN || false,
        address: editingRecord.address || "",
        placeOfSupply: "Rajasthan (08)",
        roundingAmount: editingRecord.roundingAmount || "0",
        paymentStatus: editingRecord.paymentStatus || "Unpaid",
        paymentMethod: normalizePaymentMethod(editingRecord.paymentMethod),
        paymentSource: editingRecord.paymentSource || "Business Account",
        paymentDate: editingRecord.paymentDate || "",
        paidAmount: editingRecord.paidAmount || "",
        tdsPercent: editingRecord.tdsPercent || "0",
        tdsAmount: editingRecord.tdsAmount || "0",
      });
      setItems(
        editingRecord.items || [
          {
            id: 1,
            itemName: "",
            itemDescription: "",
            hsnCode: "",
            qty: "",
            price: "",
            amount: 0,
          },
        ],
      );
      if (editingRecord.taxData) {
        setTaxData(editingRecord.taxData);
      }
      setSelectedRcmFile(null);
      setRoundingEnabled(editingRecord.roundingEnabled !== false);
    } else {
      resetForm();
    }
  }, [editingRecord, show]);

  useEffect(() => {
    if (!show || editingRecord || !defaultFinancialYear) return;

    if (defaultFinancialYear.taxPercentage !== undefined) {
      setTaxData((prev) => ({
        ...prev,
        taxPercentage: Number(defaultFinancialYear.taxPercentage) || 0,
      }));
      calculateTotals(items, defaultFinancialYear.taxPercentage, null);
    }

    let cancelled = false;

    const fetchNextSelfInvoiceNumber = async () => {
      try {
        const response = await apiGet(API_ENDPOINTS.RCM.NEXT_NUMBER, {
          params: defaultFinancialYear?.financialYear
            ? { financialYear: defaultFinancialYear.financialYear }
            : {},
        });

        if (cancelled) return;

        const nextInvoiceNumber =
          response?.data?.selfInvoiceNumber || response?.data?.nextNumber || "";

        setFormData((prev) => ({
          ...prev,
          selfInvoiceNumber: nextInvoiceNumber || prev.selfInvoiceNumber,
          placeOfSupply: "Rajasthan (08)",
        }));
      } catch (error) {
        // Keep form usable even if sequence API fails.
      }
    };

    fetchNextSelfInvoiceNumber();

    return () => {
      cancelled = true;
    };
  }, [defaultFinancialYear, editingRecord, show]);

  const resetForm = () => {
    setFormData({
      selfInvoiceNumber: "",
      invoiceDate: "",
      originalRefNo: "",
      rcmURL: "",
      serviceProviderBusinessName: "",
      gstin: "",
      noGSTIN: false,
      address: "",
      placeOfSupply: "Rajasthan (08)",
      roundingAmount: "0",
      paymentStatus: "Unpaid",
      paymentMethod: "",
      paymentSource: "Business Account",
      paymentDate: "",
      paidAmount: "",
      tdsPercent: "0",
      tdsAmount: "0",
    });
    setItems([
      {
        id: 1,
        itemName: "",
        itemDescription: "",
        hsnCode: "",
        qty: "",
        price: "",
        amount: 0,
      },
    ]);
    setTaxData({
      subtotal: "0.00",
      taxPercentage: 18,
      cgst: "0.00",
      sgst: "0.00",
      igst: "0.00",
      totalAmount: "0.00",
    });
    setErrors({});
    setSelectedRcmFile(null);
    setRoundingEnabled(true);
  };

  const handleRcmFileChange = (e) => {
    const file = e.target.files?.[0] || null;
    if (!file) {
      setSelectedRcmFile(null);
      return;
    }

    const isAllowedType =
      file.type === "application/pdf" || file.type.startsWith("image/");

    if (!isAllowedType) {
      showError("Please upload only image or PDF RCM file");
      e.target.value = "";
      setSelectedRcmFile(null);
      return;
    }

    setSelectedRcmFile(file);
  };

  const openRcmUrl = () => {
    const link = String(formData.rcmURL || "").trim();
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

  const toNumber = (value) => {
    const num = parseFloat(value);
    return Number.isNaN(num) ? 0 : num;
  };

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

  const computeTdsAmount = (totalAmount, tdsPercent) => {
    const total = toNumber(totalAmount);
    const percent = toNumber(tdsPercent);
    return ((total * percent) / 100).toFixed(2);
  };

  const calculateTotals = (
    itemsList,
    taxPercentage,
    manualRoundingAmount = null,
  ) => {
    const subtotal = itemsList.reduce(
      (sum, item) => sum + (toNumber(item.amount) || 0),
      0,
    );
    const taxAmount = (subtotal * toNumber(taxPercentage)) / 100;
    const round2 = (value) => Math.round(value * 100) / 100;
    const cgst = 0;
    const sgst = 0;
    const igst = round2(taxAmount);

    // Derived from the stored 2-decimal components so that
    // subtotal + igst + roundingAmount === totalAmount exactly.
    const subtotalWithTax = round2(round2(subtotal) + igst);

    let roundValue;
    if (manualRoundingAmount !== null && manualRoundingAmount !== undefined) {
      roundValue = toNumber(manualRoundingAmount);
    } else if (!roundingEnabled) {
      roundValue = 0;
    } else {
      const decimalPart = round2(subtotalWithTax - Math.floor(subtotalWithTax));
      if (decimalPart <= 0.5) {
        roundValue = -decimalPart;
      } else {
        roundValue = round2(1 - decimalPart);
      }
    }

    const totalAmount = round2(subtotalWithTax + roundValue);

    setTaxData({
      subtotal: subtotal.toFixed(2),
      taxPercentage: toNumber(taxPercentage),
      cgst: cgst.toFixed(2),
      sgst: sgst.toFixed(2),
      igst: igst.toFixed(2),
      totalAmount: totalAmount.toFixed(2),
    });

    setFormData((prev) => ({
      ...prev,
      roundingAmount: roundValue.toFixed(2),
      tdsAmount: computeTdsAmount(totalAmount, prev.tdsPercent),
    }));
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;

    if (name === "gstin") {
      const upperValue = value.toUpperCase();
      setFormData((prev) => ({
        ...prev,
        [name]: upperValue,
      }));

      if (upperValue && !validateGSTIN(upperValue) && !formData.noGSTIN) {
        setErrors((prev) => ({
          ...prev,
          gstin: "Invalid GSTIN format. Example: 08KIBTK1234A1ZU",
        }));
      } else {
        setErrors((prev) => ({
          ...prev,
          gstin: "",
        }));
      }
    } else if (name === "noGSTIN") {
      setFormData((prev) => ({
        ...prev,
        [name]: checked,
        gstin: checked ? "Unregistered" : "",
      }));

      if (checked) {
        setErrors((prev) => ({
          ...prev,
          gstin: "",
        }));
      }
    } else {
      const nextValue =
        name === "address"
          ? String(value || "")
              .replace(/\s+/g, " ")
              .trimStart()
              .slice(0, SELF_INVOICE_SINGLE_LINE_ADDRESS_MAX_LENGTH)
          : value;

      setFormData((prev) => ({
        ...prev,
        [name]: name === "placeOfSupply" ? "Rajasthan (08)" : nextValue,
      }));
    }

    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: "",
      }));
    }
  };

  const handleRoundingChange = (e) => {
    const value = e.target.value;
    setFormData((prev) => ({
      ...prev,
      roundingAmount: value,
    }));
    calculateTotals(items, taxData.taxPercentage, value);
  };

  // Recalculate when rounding toggle changes
  useEffect(() => {
    if (!show) return;
    calculateTotals(items, taxData.taxPercentage, null);
  }, [roundingEnabled]);

  const handleTdsPercentChange = (e) => {
    const value = e.target.value;
    setFormData((prev) => ({
      ...prev,
      tdsPercent: value,
      tdsAmount: computeTdsAmount(taxData.totalAmount, value),
    }));
  };

  const handleItemChange = (id, field, value) => {
    let nextValue = value;
    if (field === "itemName") {
      nextValue = String(value || "").slice(0, RCM_ITEM_NAME_MAX_LENGTH);
    } else if (field === "itemDescription") {
      nextValue = String(value || "").slice(0, RCM_ITEM_DESCRIPTION_MAX_LENGTH);
    }

    const updatedItems = items.map((item) => {
      if (item.id === id) {
        const updatedItem = { ...item, [field]: nextValue };
        if (field === "qty" || field === "price") {
          const qty = toNumber(field === "qty" ? nextValue : updatedItem.qty);
          const price = toNumber(
            field === "price" ? nextValue : updatedItem.price,
          );
          updatedItem.amount = qty * price;
        }
        return updatedItem;
      }
      return item;
    });

    setItems(updatedItems);
    calculateTotals(updatedItems, taxData.taxPercentage, null);
  };

  const handleAddItem = () => {
    const newItem = {
      id: items.length > 0 ? Math.max(...items.map((i) => i.id)) + 1 : 1,
      itemName: "",
      itemDescription: "",
      hsnCode: "",
      qty: "",
      price: "",
      amount: 0,
    };
    setItems((prev) => [...prev, newItem]);
  };

  const handleRemoveItem = (id) => {
    if (items.length === 1) {
      showError("At least one item is required");
      return;
    }
    const updatedItems = items.filter((item) => item.id !== id);
    setItems(updatedItems);
    calculateTotals(
      updatedItems,
      taxData.taxPercentage,
      formData.roundingAmount,
    );
  };

  const requestRemoveItem = (id) => {
    if (items.length <= 1) {
      showError("At least one item is required");
      return;
    }
    setItemToDelete(id);
    setShowDeleteConfirm(true);
  };

  const confirmRemoveItem = () => {
    if (!itemToDelete) return;
    handleRemoveItem(itemToDelete);
    setItemToDelete(null);
  };

  const handleTaxChange = (e) => {
    const newTaxPercentage = e.target.value;
    calculateTotals(items, newTaxPercentage, null);
  };

  const fieldNames = {
    selfInvoiceNumber: "Self Invoice Number",
    invoiceDate: "Invoice Date",
    originalRefNo: "Original Ref. No",
    serviceProviderBusinessName: "Service Provider Business Name",
    gstin: "GSTIN",
    address: "Address",
    placeOfSupply: "Place of Supply",
    paymentStatus: "Payment Status",
  };

  const validateForm = () => {
    const newErrors = {};
    const requiredFields = [
      "selfInvoiceNumber",
      "invoiceDate",
      "originalRefNo",
      "serviceProviderBusinessName",
      "address",
      "placeOfSupply",
      "paymentStatus",
    ];

    if (!formData.noGSTIN) {
      requiredFields.push("gstin");
    }

    requiredFields.forEach((field) => {
      if (!formData[field] || formData[field].toString().trim() === "") {
        newErrors[field] = `${fieldNames[field]} is required`;
      }
    });

    let hasValidItem = false;
    items.forEach((item) => {
      if (item.itemName && item.qty && item.price) {
        hasValidItem = true;
      }
    });

    if (!hasValidItem) {
      newErrors.items =
        "At least one item with name, quantity, and price is required";
      showError("Please add at least one item with complete details");
    }

    if (!formData.noGSTIN && formData.gstin && !validateGSTIN(formData.gstin)) {
      newErrors.gstin = "Please enter a valid GSTIN number";
    }

    if (formData.rcmURL && !/^https?:\/\//i.test(formData.rcmURL)) {
      newErrors.rcmURL = "Please enter a valid URL";
    }

    if (
      formData.address &&
      formData.address.trim().length >
        SELF_INVOICE_SINGLE_LINE_ADDRESS_MAX_LENGTH
    ) {
      newErrors.address = `Address must be ${SELF_INVOICE_SINGLE_LINE_ADDRESS_MAX_LENGTH} characters or less`;
    }

    setErrors(newErrors);

    if (Object.keys(newErrors).length > 0) {
      const firstErrorField = Object.keys(newErrors)[0];
      if (firstErrorField !== "items") {
        const firstFieldName = fieldNames[firstErrorField];
        showError(`Please fill ${firstFieldName} field correctly`);
      }
      return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (submitting) return;

    if (validateForm()) {
      try {
        setSubmitting(true);
        const rcmUpload = selectedRcmFile
          ? {
              fileName: selectedRcmFile.name,
              fileType: selectedRcmFile.type || "application/octet-stream",
              fileDataBase64: await toBase64(selectedRcmFile),
            }
          : null;

        const submitData = {
          ...formData,
          placeOfSupply: "Rajasthan (08)",
          roundingEnabled: roundingEnabled,
          items: items,
          taxData: {
            ...taxData,
            cgst: "0.00",
            sgst: "0.00",
            igst: (
              (toNumber(taxData.subtotal) * toNumber(taxData.taxPercentage)) /
              100
            ).toFixed(2),
          },
          ...(rcmUpload ? { rcmUpload } : {}),
          id: editingRecord?.id || Date.now(),
          createdDate: editingRecord?.createdDate || new Date().toISOString(),
        };

        await onSubmit(submitData);
      } catch (error) {
        console.error("RCM submit failed:", error);
      } finally {
        setSubmitting(false);
      }
    }
  };

  const RequiredStar = () => <span className="text-danger">*</span>;

  if (!show) return null;

  const modalTitle = editingRecord
    ? editingRecord.isViewMode
      ? `View RCM - ${formData.selfInvoiceNumber || ""}`
      : `Edit RCM - ${formData.selfInvoiceNumber || ""}`
    : "Add New RCM";

  const isViewMode = editingRecord?.isViewMode;
  const uploadedRcmViewUrl =
    editingRecord?.rcmFileURL ||
    editingRecord?.rcmFileLink ||
    (editingRecord?.rcmFilePath
      ? formData.rcmURL || editingRecord?.rcmURL || ""
      : "") ||
    "";
  const placeOfSupplySelectStyles = getUnifiedSelectStyles({
    hasError: Boolean(errors.placeOfSupply),
  });
  const isRajasthan = false;

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
            <form id="rcmForm" onSubmit={handleSubmit} noValidate>
              <div className="row mb-4">
                <div className="col-12">
                  <h6 className="border-bottom pb-2 mb-3">
                    <i className="fas fa-info-circle me-2 text-primary"></i>
                    Basic Information
                  </h6>
                </div>

                <div className="col-md-3 mb-3">
                  <label htmlFor="selfInvoiceNumber" className="form-label">
                    <i className="fas fa-file-invoice me-2 text-primary"></i>
                    Self Invoice Number <RequiredStar />
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.selfInvoiceNumber ? "is-invalid" : ""}`}
                    id="selfInvoiceNumber"
                    name="selfInvoiceNumber"
                    value={formData.selfInvoiceNumber}
                    placeholder="Auto Generated Self Invoice Number"
                    readOnly
                  />
                  {errors.selfInvoiceNumber && (
                    <div className="invalid-feedback d-block">
                      {errors.selfInvoiceNumber}
                    </div>
                  )}
                </div>

                <div className="col-md-3 mb-3">
                  <label htmlFor="invoiceDate" className="form-label">
                    <i className="fas fa-calendar me-2 text-primary"></i>
                    Invoice Date <RequiredStar />
                  </label>
                  <input
                    type="date"
                    className={`form-control modern-input ${errors.invoiceDate ? "is-invalid" : ""}`}
                    id="invoiceDate"
                    name="invoiceDate"
                    value={formData.invoiceDate}
                    onChange={handleInputChange}
                    readOnly={isViewMode}
                  />
                  {errors.invoiceDate && (
                    <div className="invalid-feedback d-block">
                      {errors.invoiceDate}
                    </div>
                  )}
                </div>

                <div className="col-md-3 mb-3">
                  <label htmlFor="originalRefNo" className="form-label">
                    <i className="fas fa-receipt me-2 text-primary"></i>
                    Original Ref. No <RequiredStar />
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.originalRefNo ? "is-invalid" : ""}`}
                    id="originalRefNo"
                    name="originalRefNo"
                    value={formData.originalRefNo}
                    onChange={handleInputChange}
                    placeholder="Enter Original Ref. No"
                    readOnly={isViewMode}
                  />
                  {errors.originalRefNo && (
                    <div className="invalid-feedback d-block">
                      {errors.originalRefNo}
                    </div>
                  )}
                </div>

                <div className="col-md-3 mb-3">
                  <label htmlFor="placeOfSupply" className="form-label">
                    <i className="fas fa-map-marked-alt me-2 text-primary"></i>
                    Place of Supply <RequiredStar />
                  </label>
                  <Select
                    inputId="placeOfSupply"
                    name="placeOfSupply"
                    classNamePrefix="react-select"
                    styles={placeOfSupplySelectStyles}
                    value={
                      INDIAN_STATES.map((s) => ({
                        value: `${s.name} (${s.code})`,
                        label: `${s.name} (${s.code})`,
                      })).find((opt) => opt.value === formData.placeOfSupply) ||
                      null
                    }
                    onChange={(selectedOption) => {
                      setFormData((prev) => ({
                        ...prev,
                        placeOfSupply: selectedOption
                          ? selectedOption.value
                          : "",
                      }));
                    }}
                    options={INDIAN_STATES.map((s) => ({
                      value: `${s.name} (${s.code})`,
                      label: `${s.name} (${s.code})`,
                    }))}
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
              </div>

              <div className="row mb-4">
                <div className="col-12">
                  <h6 className="border-bottom pb-2 mb-3">
                    <i className="fas fa-building me-2 text-success"></i>
                    Supplier/Service Provider Details
                  </h6>
                </div>

                <div className="col-md-4 mb-3">
                  <label
                    htmlFor="serviceProviderBusinessName"
                    className="form-label"
                  >
                    <i className="fas fa-building me-2 text-primary"></i>
                    Service Provider Business Name <RequiredStar />
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.serviceProviderBusinessName ? "is-invalid" : ""}`}
                    id="serviceProviderBusinessName"
                    name="serviceProviderBusinessName"
                    value={formData.serviceProviderBusinessName}
                    onChange={handleInputChange}
                    placeholder="Enter Business Name"
                    readOnly={isViewMode}
                  />
                  {errors.serviceProviderBusinessName && (
                    <div className="invalid-feedback d-block">
                      {errors.serviceProviderBusinessName}
                    </div>
                  )}
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="gstin" className="form-label">
                    <i className="fas fa-file-invoice me-2 text-primary"></i>
                    GSTIN&nbsp;
                    {!formData.noGSTIN && <RequiredStar />}
                    {formData.noGSTIN && (
                      <span className="text-muted ms-2">(Not Applicable)</span>
                    )}
                  </label>

                  <div className="input-group">
                    {/* Left Validation Icon */}
                    <span className="input-group-text gstin-icon-left">
                      {!formData.noGSTIN && formData.gstin && (
                        <>
                          {validateGSTIN(formData.gstin) ? (
                            <i className="fas fa-check-circle text-success"></i>
                          ) : (
                            <i className="fas fa-times-circle text-danger"></i>
                          )}
                        </>
                      )}
                      {formData.noGSTIN && (
                        <i className="fas fa-ban text-secondary"></i>
                      )}
                      {!formData.gstin && !formData.noGSTIN && (
                        <i className="fas fa-file-invoice text-muted"></i>
                      )}
                    </span>

                    {/* GSTIN Input */}
                    <input
                      type="text"
                      className={`form-control modern-input ${
                        errors.gstin ? "is-invalid" : ""
                      } ${formData.noGSTIN ? "disabled-input" : ""}`}
                      id="gstin"
                      name="gstin"
                      value={formData.gstin}
                      onChange={handleInputChange}
                      placeholder={
                        formData.noGSTIN
                          ? "GSTIN not required"
                          : "22AAAAA0000A1Z5"
                      }
                      maxLength="15"
                      readOnly={isViewMode || formData.noGSTIN}
                      disabled={formData.noGSTIN}
                      style={{ textTransform: "uppercase" }}
                    />

                    {/* Right Side Checkbox */}
                    <span className="input-group-text no-gst-checkbox">
                      <input
                        className="form-check-input mt-0"
                        type="checkbox"
                        id="noGSTIN"
                        name="noGSTIN"
                        checked={formData.noGSTIN}
                        onChange={handleInputChange}
                        disabled={isViewMode}
                        aria-label="No GST"
                      />
                      <label
                        htmlFor="noGSTIN"
                        className="ms-1 mb-0 no-gst-label"
                      >
                        No GST
                      </label>
                    </span>
                  </div>

                  {/* Error Message */}
                  {errors.gstin && (
                    <div className="invalid-feedback d-block">
                      {errors.gstin}
                    </div>
                  )}
                </div>

                <div className="col-md-4 mb-3">
                  <label htmlFor="address" className="form-label">
                    <i className="fas fa-map-marker-alt me-2 text-primary"></i>
                    Address <RequiredStar />
                  </label>
                  <div className="position-relative">
                    <input
                      type="text"
                      className={`form-control modern-input ${errors.address ? "is-invalid" : ""}`}
                      id="address"
                      name="address"
                      value={formData.address}
                      onChange={handleInputChange}
                      placeholder="Enter Address"
                      maxLength={SELF_INVOICE_SINGLE_LINE_ADDRESS_MAX_LENGTH}
                      readOnly={isViewMode}
                      style={{ paddingRight: "64px" }}
                    />
                    <span
                      className="position-absolute top-50 end-0 translate-middle-y me-2 rounded-circle d-inline-flex align-items-center justify-content-center"
                      style={{
                        width: "34px",
                        height: "34px",
                        fontSize: "10px",
                        fontWeight: 700,
                        backgroundColor: "#e9f8ef",
                        color: "#0f5132",
                        border: "1px solid #b7e4c7",
                      }}
                      aria-label="Address character count"
                    >
                      {(formData.address || "").length}
                    </span>
                  </div>
                  {errors.address && (
                    <div className="invalid-feedback d-block">
                      {errors.address}
                    </div>
                  )}
                </div>
              </div>

              <div className="row mb-4">
                <div className="col-12">
                  <h6 className="border-bottom pb-2 mb-3">
                    <i className="fas fa-th-list me-2 text-info"></i>
                    Items Details
                  </h6>
                  {errors.items && (
                    <div className="alert alert-danger">{errors.items}</div>
                  )}
                </div>

                <div className="col-12">
                  {/* Desktop view - Table layout */}
                  <div className="table-responsive d-none d-lg-block">
                    <table className="table table-bordered table-hover">
                      <thead className="table-success">
                        <tr>
                          <th style={{ width: "50px" }}>S.N</th>
                          <th style={{ width: "200px" }}>Item Name</th>
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
                              <div className="position-relative">
                                <input
                                  type="text"
                                  className="form-control modern-input form-control-sm"
                                  value={item.itemName}
                                  maxLength={RCM_ITEM_NAME_MAX_LENGTH}
                                  onChange={(e) =>
                                    handleItemChange(
                                      item.id,
                                      "itemName",
                                      e.target.value,
                                    )
                                  }
                                  placeholder="Item Name"
                                  readOnly={isViewMode}
                                  style={{ paddingRight: "38px" }}
                                />
                                <span
                                  className="position-absolute top-50 end-0 translate-middle-y me-2 rounded-circle d-inline-flex align-items-center justify-content-center"
                                  style={{
                                    width: "24px",
                                    height: "24px",
                                    fontSize: "9px",
                                    fontWeight: 700,
                                    backgroundColor: "#e9f8ef",
                                    color: "#0f5132",
                                    border: "1px solid #b7e4c7",
                                  }}
                                  aria-label="Item name character count"
                                >
                                  {(item.itemName || "").length}
                                </span>
                              </div>
                            </td>
                            <td>
                              <div className="position-relative">
                                <input
                                  type="text"
                                  className="form-control modern-input form-control-sm"
                                  value={item.itemDescription}
                                  maxLength={RCM_ITEM_DESCRIPTION_MAX_LENGTH}
                                  onChange={(e) =>
                                    handleItemChange(
                                      item.id,
                                      "itemDescription",
                                      e.target.value,
                                    )
                                  }
                                  placeholder="Description"
                                  readOnly={isViewMode}
                                  style={{ paddingRight: "38px" }}
                                />
                                <span
                                  className="position-absolute top-50 end-0 translate-middle-y me-2 rounded-circle d-inline-flex align-items-center justify-content-center"
                                  style={{
                                    width: "24px",
                                    height: "24px",
                                    fontSize: "9px",
                                    fontWeight: 700,
                                    backgroundColor: "#e9f8ef",
                                    color: "#0f5132",
                                    border: "1px solid #b7e4c7",
                                  }}
                                  aria-label="Item description character count"
                                >
                                  {(item.itemDescription || "").length}
                                </span>
                              </div>
                            </td>
                            <td>
                              <input
                                type="text"
                                className="form-control modern-input form-control-sm"
                                value={item.hsnCode}
                                onChange={(e) =>
                                  handleItemChange(
                                    item.id,
                                    "hsnCode",
                                    e.target.value,
                                  )
                                }
                                placeholder="HSN Code"
                                readOnly={isViewMode}
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                className="form-control modern-input form-control-sm"
                                value={item.qty}
                                onChange={(e) => {
                                  handleNumberInput(e);
                                  handleItemChange(
                                    item.id,
                                    "qty",
                                    e.target.value,
                                  );
                                }}
                                placeholder="QTY"
                                readOnly={isViewMode}
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                className="form-control modern-input form-control-sm"
                                value={item.price}
                                onChange={(e) => {
                                  handleNumberInput(e);
                                  handleItemChange(
                                    item.id,
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
                                  onClick={() => requestRemoveItem(item.id)}
                                  disabled={items.length === 1}
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

                  {/* Mobile & Tablet view - Card layout */}
                  <div className="d-lg-none">
                    {items.map((item, index) => (
                      <div key={item.id} className="card border mb-3 shadow-sm">
                        <div className="card-header d-flex justify-content-between align-items-center bg-light">
                          <strong>Item {index + 1}</strong>
                          {!isViewMode && (
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              onClick={() => requestRemoveItem(item.id)}
                              disabled={items.length === 1}
                            >
                              <i className="fas fa-trash"></i>
                            </button>
                          )}
                        </div>
                        <div className="card-body">
                          <div className="row">
                            {/* Row 1: Item Name */}
                            <div className="col-12 mb-3">
                              <label className="form-label fw-semibold">
                                Item Name
                              </label>
                              <div className="position-relative">
                                <input
                                  type="text"
                                  className="form-control modern-input"
                                  value={item.itemName}
                                  maxLength={RCM_ITEM_NAME_MAX_LENGTH}
                                  onChange={(e) =>
                                    handleItemChange(
                                      item.id,
                                      "itemName",
                                      e.target.value,
                                    )
                                  }
                                  placeholder="Item Name"
                                  readOnly={isViewMode}
                                  style={{ paddingRight: "44px" }}
                                />
                                <span
                                  className="position-absolute top-50 end-0 translate-middle-y me-2 rounded-circle d-inline-flex align-items-center justify-content-center"
                                  style={{
                                    width: "28px",
                                    height: "28px",
                                    fontSize: "10px",
                                    fontWeight: 700,
                                    backgroundColor: "#e9f8ef",
                                    color: "#0f5132",
                                    border: "1px solid #b7e4c7",
                                  }}
                                  aria-label="Item name character count"
                                >
                                  {(item.itemName || "").length}
                                </span>
                              </div>
                            </div>

                            {/* Row 2: Description */}
                            <div className="col-12 mb-3">
                              <label className="form-label fw-semibold">
                                Description
                              </label>
                              <div className="position-relative">
                                <input
                                  type="text"
                                  className="form-control modern-input"
                                  value={item.itemDescription}
                                  maxLength={RCM_ITEM_DESCRIPTION_MAX_LENGTH}
                                  onChange={(e) =>
                                    handleItemChange(
                                      item.id,
                                      "itemDescription",
                                      e.target.value,
                                    )
                                  }
                                  placeholder="Item Description"
                                  readOnly={isViewMode}
                                  style={{ paddingRight: "44px" }}
                                />
                                <span
                                  className="position-absolute top-50 end-0 translate-middle-y me-2 rounded-circle d-inline-flex align-items-center justify-content-center"
                                  style={{
                                    width: "28px",
                                    height: "28px",
                                    fontSize: "10px",
                                    fontWeight: 700,
                                    backgroundColor: "#e9f8ef",
                                    color: "#0f5132",
                                    border: "1px solid #b7e4c7",
                                  }}
                                  aria-label="Item description character count"
                                >
                                  {(item.itemDescription || "").length}
                                </span>
                              </div>
                            </div>

                            {/* Row 3: HSN Code and QTY - Side by Side */}
                            <div className="col-6 mb-3">
                              <label className="form-label fw-semibold">
                                HSN Code
                              </label>
                              <input
                                type="text"
                                className="form-control modern-input"
                                value={item.hsnCode}
                                onChange={(e) =>
                                  handleItemChange(
                                    item.id,
                                    "hsnCode",
                                    e.target.value,
                                  )
                                }
                                placeholder="HSN Code"
                                readOnly={isViewMode}
                              />
                            </div>
                            <div className="col-6 mb-3">
                              <label className="form-label fw-semibold">
                                QTY
                              </label>
                              <input
                                type="text"
                                className="form-control modern-input"
                                value={item.qty}
                                onChange={(e) => {
                                  handleNumberInput(e);
                                  handleItemChange(
                                    item.id,
                                    "qty",
                                    e.target.value,
                                  );
                                }}
                                placeholder="Quantity"
                                readOnly={isViewMode}
                              />
                            </div>

                            {/* Row 4: Price and Amount - Side by Side */}
                            <div className="col-6 mb-3">
                              <label className="form-label fw-semibold">
                                Price (₹)
                              </label>
                              <input
                                type="text"
                                className="form-control modern-input"
                                value={item.price}
                                onChange={(e) => {
                                  handleNumberInput(e);
                                  handleItemChange(
                                    item.id,
                                    "price",
                                    e.target.value,
                                  );
                                }}
                                placeholder="Price"
                                readOnly={isViewMode}
                              />
                            </div>
                            <div className="col-6 mb-3">
                              <label className="form-label fw-semibold">
                                Amount (₹)
                              </label>
                              <input
                                type="text"
                                className="form-control modern-input fw-bold"
                                value={toNumber(item.amount).toFixed(2)}
                                readOnly
                                style={{ backgroundColor: "#f8f9fa" }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
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
              </div>

              <div className="row mb-4">
                <div className="col-12">
                  <h6 className="border-bottom pb-2 mb-3">
                    <i className="fas fa-calculator me-2 text-warning"></i>
                    Amount Calculation
                  </h6>
                </div>

                <div className="col-md-6">
                  <div
                    className="card shadow-sm border-0"
                    style={{ backgroundColor: "#f8f9fa" }}
                  >
                    <div className="card-header bg-success rounded-top-3 text-white d-flex justify-content-between align-items-center">
                      <h6 className="mb-0">
                        <i className="fas fa-receipt me-2"></i>Amount
                        Calculation
                      </h6>
                      <div className="form-check form-switch mb-0">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id="rcmRoundingToggle"
                          checked={roundingEnabled}
                          onChange={(e) => setRoundingEnabled(e.target.checked)}
                          disabled={isViewMode}
                          style={{ cursor: isViewMode ? "not-allowed" : "pointer" }}
                        />
                        <label
                          className="form-check-label text-white ms-1"
                          htmlFor="rcmRoundingToggle"
                          style={{ fontSize: "0.8rem", cursor: isViewMode ? "not-allowed" : "pointer" }}
                        >
                          {roundingEnabled ? "Rounding ON" : "Rounding OFF"}
                        </label>
                      </div>
                    </div>
                    <div className="card-body">
                      <div className="row">
                        <div className="col-md-4 mb-3">
                          <label className="form-label fw-bold">
                            <i className="fas fa-coins me-2 text-info"></i>
                            Subtotal Amount
                          </label>
                          <div className="input-group">
                            <span className="input-group-text bg-info text-white">
                              ₹
                            </span>
                            <input
                              type="text"
                              className="form-control modern-input fw-bold"
                              value={taxData.subtotal}
                              readOnly
                              style={{
                                backgroundColor: "#e3f2fd",
                              }}
                            />
                          </div>
                        </div>

                        <div className="col-md-4 mb-3">
                          <label
                            htmlFor="taxPercentage"
                            className="form-label fw-bold"
                          >
                            <i className="fas fa-percentage me-2 text-warning"></i>
                            Tax Percentage
                          </label>
                          <div className="input-group">
                            <span className="input-group-text bg-warning text-white">
                              %
                            </span>
                            <input
                              type="text"
                              className="form-control modern-input"
                              id="taxPercentage"
                              value={taxData.taxPercentage}
                              onChange={(e) => {
                                handleNumberInput(e);
                                handleTaxChange(e);
                              }}
                              readOnly={isViewMode}
                              style={{ fontWeight: "600" }}
                            />
                          </div>
                        </div>

                        <div className="col-md-4 mb-3">
                          <label className="form-label fw-bold">
                            <i className="fas fa-file-invoice me-2 text-success"></i>
                            CGST ({isRajasthan ? taxData.taxPercentage / 2 : 0}
                            %)
                          </label>
                          <div className="input-group">
                            <span className="input-group-text bg-success text-white">
                              ₹
                            </span>
                            <input
                              type="text"
                              className={`form-control modern-input fw-bold ${isRajasthan ? "text-success" : "text-muted"}`}
                              value={taxData.cgst}
                              readOnly
                              style={{
                                backgroundColor: "#ffffff",
                              }}
                            />
                          </div>
                        </div>

                        <div className="col-md-4 mb-3">
                          <label className="form-label fw-bold">
                            <i className="fas fa-file-invoice me-2 text-success"></i>
                            SGST ({isRajasthan ? taxData.taxPercentage / 2 : 0}
                            %)
                          </label>
                          <div className="input-group">
                            <span className="input-group-text bg-success text-white">
                              ₹
                            </span>
                            <input
                              type="text"
                              className={`form-control modern-input fw-bold ${isRajasthan ? "text-success" : "text-muted"}`}
                              value={taxData.sgst}
                              readOnly
                              style={{
                                backgroundColor: "#fff",
                              }}
                            />
                          </div>
                        </div>

                        <div className="col-md-4 mb-3">
                          <label className="form-label fw-bold">
                            <i className="fas fa-file-invoice me-2 text-primary"></i>
                            IGST ({!isRajasthan ? taxData.taxPercentage : 0}%)
                          </label>
                          <div className="input-group">
                            <span className="input-group-text bg-success text-white">
                              ₹
                            </span>
                            <input
                              type="text"
                              className={`form-control modern-input fw-bold ${!isRajasthan ? "text-primary" : "text-muted"}`}
                              value={taxData.igst}
                              readOnly
                              style={{
                                backgroundColor: "#fff",
                              }}
                            />
                          </div>
                        </div>

                        <div className="col-md-4 mb-3">
                          <label
                            htmlFor="roundingAmount"
                            className="form-label fw-bold"
                          >
                            <i className="fas fa-adjust me-2 text-secondary"></i>
                            Rounding Amount
                            {!roundingEnabled && (
                              <span className="badge bg-warning text-dark ms-2" style={{ fontSize: "0.65rem" }}>
                                Disabled
                              </span>
                            )}
                          </label>
                          <div className="input-group">
                            <span className={`input-group-text ${!roundingEnabled ? "bg-light text-muted" : "bg-secondary text-white"}`}>
                              ₹
                            </span>
                            <input
                              type="text"
                              className={`form-control modern-input ${!roundingEnabled ? "bg-light" : ""}`}
                              id="roundingAmount"
                              name="roundingAmount"
                              value={formData.roundingAmount}
                              onChange={(e) => {
                                handleNumberInput(e);
                                handleRoundingChange(e);
                              }}
                              readOnly={isViewMode || !roundingEnabled}
                            />
                          </div>
                        </div>

                        <div className="col-md-4 mb-3">
                          <label className="form-label fw-bold">
                            <i className="fas fa-rupee-sign me-2 text-danger"></i>
                            Total Amount
                          </label>
                          <div className="input-group">
                            <span className="input-group-text bg-danger text-white">
                              ₹
                            </span>
                            <input
                              type="text"
                              className="form-control modern-input fw-bold text-danger"
                              value={taxData.totalAmount}
                              readOnly
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="col-md-6">
                  <div
                    className="card shadow-sm border-0"
                    style={{ backgroundColor: "#f8f9fa" }}
                  >
                    <div className="card-header bg-success rounded-top-3 text-white">
                      <h6 className="mb-0">
                        <i className="fas fa-credit-card me-2"></i>Payment
                        Information
                      </h6>
                    </div>
                    <div className="card-body">
                      <div className="row">
                        <div className="col-md-4 mb-3">
                          <label
                            htmlFor="paymentStatus"
                            className="form-label fw-bold"
                          >
                            <i className="fas fa-money-check-alt me-2 text-primary"></i>
                            Payment Status <RequiredStar />
                          </label>
                          <select
                            id="paymentStatus"
                            name="paymentStatus"
                            className={`form-select modern-input ${errors.paymentStatus ? "is-invalid" : ""}`}
                            value={formData.paymentStatus}
                            onChange={handleInputChange}
                            disabled={isViewMode}
                            style={{ fontWeight: "600" }}
                          >
                            <option value="Paid">✓ Paid</option>
                            <option value="Unpaid">✗ Unpaid</option>
                            <option value="Partial">⧗ Partial</option>
                          </select>
                          {errors.paymentStatus && (
                            <div className="invalid-feedback d-block">
                              {errors.paymentStatus}
                            </div>
                          )}
                        </div>

                        <div className="col-md-4 mb-3">
                          <label
                            htmlFor="paymentMethod"
                            className="form-label fw-bold"
                          >
                            <i className="fas fa-wallet me-2 text-success"></i>
                            Payment Method
                          </label>
                          <select
                            id="paymentMethod"
                            name="paymentMethod"
                            className="form-select modern-input"
                            value={formData.paymentMethod}
                            onChange={handleInputChange}
                            disabled={isViewMode}
                            style={{ fontWeight: "500" }}
                          >
                            <option value="">Select Payment Method</option>
                            <option value="Cash">💵 Cash</option>
                            <option value="Bank Transfer">
                              🏦 Bank Transfer
                            </option>
                            <option value="Card">💳 Card</option>
                            <option value="UPI">📱 UPI</option>
                            <option value="Cheque">📝 Cheque</option>
                            <option value="IMPS">🏦 IMPS</option>
                            <option value="RTGS">🏦 RTGS</option>
                            <option value="Zoho Payment Gateway">
                              🌐 Zoho Payment Gateway
                            </option>
                            <option value="Cashfree Payment Gateway">
                              🌐 Cashfree Payment Gateway
                            </option>
                            <option value="PayU Payment Gateway">
                              🌐 PayU Payment Gateway
                            </option>
                          </select>
                        </div>

                        <div className="col-md-4 mb-3">
                          <label
                            htmlFor="paymentSource"
                            className="form-label fw-bold"
                          >
                            <i className="fas fa-user-circle me-2 text-warning"></i>
                            Payment Source
                          </label>
                          <select
                            id="paymentSource"
                            name="paymentSource"
                            className="form-select modern-input"
                            value={formData.paymentSource}
                            onChange={handleInputChange}
                            disabled={isViewMode}
                            style={{ fontWeight: "500" }}
                          >
                            <option value="Business Account">
                              🏦 Business Account
                            </option>
                            <option value="Owner Personal Account">
                              👤 Owner Personal Account
                            </option>
                          </select>
                        </div>

                        <div className="col-md-4 mb-3">
                          <label
                            htmlFor="paymentDate"
                            className="form-label fw-bold"
                          >
                            <i className="fas fa-calendar-check me-2 text-info"></i>
                            Payment Date
                          </label>
                          <input
                            type="date"
                            className="form-control modern-input"
                            id="paymentDate"
                            name="paymentDate"
                            value={formData.paymentDate}
                            onChange={handleInputChange}
                            readOnly={isViewMode}
                            style={{ fontWeight: "500" }}
                          />
                        </div>

                        <div className="col-md-4 mb-3">
                          <label
                            htmlFor="paidAmount"
                            className="form-label fw-bold"
                          >
                            <i className="fas fa-hand-holding-usd me-2 text-success"></i>
                            Paid Amount
                          </label>
                          <div className="input-group">
                            <span className="input-group-text bg-success text-white">
                              ₹
                            </span>
                            <input
                              type="text"
                              className="form-control modern-input"
                              id="paidAmount"
                              name="paidAmount"
                              value={formData.paidAmount}
                              onChange={(e) => {
                                handleNumberInput(e);
                                handleInputChange(e);
                              }}
                              readOnly={isViewMode}
                            />
                          </div>
                        </div>

                        <div className="col-md-4 mb-3">
                          <label
                            htmlFor="tdsPercent"
                            className="form-label fw-bold"
                          >
                            <i className="fas fa-percentage me-2 text-warning"></i>
                            TDS (%)
                          </label>
                          <div className="input-group">
                            <span className="input-group-text bg-warning text-white">
                              %
                            </span>
                            <input
                              type="text"
                              className="form-control modern-input"
                              id="tdsPercent"
                              name="tdsPercent"
                              value={formData.tdsPercent}
                              onChange={(e) => {
                                handleNumberInput(e);
                                handleTdsPercentChange(e);
                              }}
                              readOnly={isViewMode}
                            />
                          </div>
                        </div>

                        <div className="col-md-4 mb-3">
                          <label
                            htmlFor="tdsAmount"
                            className="form-label fw-bold"
                          >
                            <i className="fas fa-file-invoice me-2 text-danger"></i>
                            TDS Amount
                          </label>
                          <div className="input-group">
                            <span className="input-group-text bg-danger text-white">
                              ₹
                            </span>
                            <input
                              type="text"
                              className="form-control modern-input fw-bold text-danger"
                              id="tdsAmount"
                              name="tdsAmount"
                              value={formData.tdsAmount}
                              readOnly
                            />
                          </div>
                        </div>

                        <div className="col-md-8 mb-3">
                          <label
                            htmlFor="rcmURL"
                            className="form-label fw-bold"
                          >
                            <i className="fas fa-link me-2 text-primary"></i>
                            Invoice URL
                          </label>
                          <div className="input-group">
                            <input
                              type="url"
                              className={`form-control modern-input ${errors.rcmURL ? "is-invalid" : ""}`}
                              id="rcmURL"
                              name="rcmURL"
                              value={formData.rcmURL}
                              onChange={handleInputChange}
                              readOnly={isViewMode}
                              placeholder="Paste invoice URL"
                            />
                            <button
                              type="button"
                              className="btn btn-outline-primary"
                              onClick={openRcmUrl}
                              title="Open invoice URL"
                            >
                              <i className="fas fa-eye"></i>
                            </button>
                          </div>
                          {errors.rcmURL && (
                            <div className="invalid-feedback d-block">
                              {errors.rcmURL}
                            </div>
                          )}
                        </div>

                        <div className="col-md-12 mb-3">
                          <label className="form-label fw-semibold">
                            <i className="fas fa-file-upload me-2 text-warning"></i>
                            Upload RCM Document (Image/PDF)
                          </label>

                          {!isViewMode && (
                            <input
                              type="file"
                              className="form-control modern-input file-picker-input"
                              accept="image/*,application/pdf"
                              onChange={handleRcmFileChange}
                            />
                          )}

                          {uploadedRcmViewUrl ? (
                            <div>
                              <UploadedFilePreviewBox
                                fileUrl={uploadedRcmViewUrl}
                                fileType={selectedRcmFile?.type}
                                title="Open uploaded RCM in new tab"
                                iconClassName="fa-solid fa-file-contract"
                              />
                            </div>
                          ) : (
                            isViewMode && (
                              <span className="text-muted small">
                                No uploaded RCM file
                              </span>
                            )
                          )}
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
                form="rcmForm"
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
                    {editingRecord ? "Update RCM" : "Save RCM"}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      <ConfirmationModal
        show={showDeleteConfirm}
        onHide={() => {
          setShowDeleteConfirm(false);
          setItemToDelete(null);
        }}
        onConfirm={confirmRemoveItem}
        title="Delete Item"
        message="Are you sure you want to delete this item row?"
        confirmText="Delete"
        variant="danger"
        confirmationText="delete"
      />

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

        .modal-body::-webkit-scrollbar-thumb:hover {
          background: #555;
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

export default CreateRcm;
