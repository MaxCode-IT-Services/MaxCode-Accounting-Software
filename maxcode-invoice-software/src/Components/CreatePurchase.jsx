import React, { useState, useEffect } from "react";
import Select from "react-select";
import { showError } from "./ToastNotification";
import { apiGet } from "../utils/api";
import API_ENDPOINTS from "../utils/apiEndpoints";
import {
  fetchAllVendors,
  filterActiveSelectableRows,
} from "../utils/fetchAllEntities";

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

const CreatePurchase = ({
  show,
  onClose,
  onSubmit,
  editingRecord = null,
  vendors = [],
}) => {
  const [formData, setFormData] = useState({
    invoiceNumber: "",
    invoiceDate: "",
    vendorId: "",
    businessName: "",
    gstin: "",
    phoneNumber: "",
    email: "",
    address: "",
    placeOfSupply: "",
    roundingAmount: "0",
    paymentStatus: "Unpaid",
    paymentMethod: "",
    paymentDate: "",
    invoiceURL: "",
    invoiceType: "",
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
    subtotal: 0,
    taxPercentage: 18, // Default GST 18%
    cgst: 0,
    sgst: 0,
    igst: 0,
    totalAmount: 0,
  });

  const [errors, setErrors] = useState({});
  const [vendorOptions, setVendorOptions] = useState([]);
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
    if (Array.isArray(vendors) && vendors.length > 0) {
      setVendorOptions(filterActiveSelectableRows(vendors));
    }
  }, [vendors]);

  useEffect(() => {
    if (!show) return;

    const fetchVendors = async () => {
      try {
        const vendorData = await fetchAllVendors();

        setVendorOptions(filterActiveSelectableRows(vendorData));
      } catch (error) {
        console.error("Failed to fetch vendors:", error);
      }
    };

    fetchVendors();
  }, [show]);

  // Initialize form with editing record data or empty form
  useEffect(() => {
    if (editingRecord) {
      setFormData({
        invoiceNumber: editingRecord.invoiceNumber || "",
        invoiceDate: editingRecord.invoiceDate || "",
        vendorId: editingRecord.vendorId || "",
        businessName: editingRecord.businessName || "",
        gstin: editingRecord.gstin || "",
        phoneNumber: editingRecord.phoneNumber || "",
        email: editingRecord.email || "",
        address: editingRecord.address || "",
        placeOfSupply: editingRecord.placeOfSupply || "",
        roundingAmount: editingRecord.roundingAmount || "0",
        paymentStatus: editingRecord.paymentStatus || "Unpaid",
        paymentMethod: editingRecord.paymentMethod || "",
        paymentDate: editingRecord.paymentDate || "",
        invoiceURL: editingRecord.invoiceURL || "",
        invoiceType: editingRecord.invoiceType || "",
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
    } else {
      resetForm();
    }
  }, [editingRecord, show]);

  const resetForm = () => {
    setFormData({
      invoiceNumber: "",
      invoiceDate: "",
      vendorId: "",
      businessName: "",
      gstin: "",
      phoneNumber: "",
      email: "",
      address: "",
      placeOfSupply: "",
      roundingAmount: "0",
      paymentStatus: "Unpaid",
      paymentMethod: "",
      paymentDate: "",
      invoiceURL: "",
      invoiceType: "",
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
      subtotal: 0,
      taxPercentage: 18,
      cgst: 0,
      sgst: 0,
      igst: 0,
      totalAmount: 0,
    });
    setErrors({});
  };

  // Handle vendor selection and autofill
  const handleVendorChange = (selectedOption) => {
    const vendorId = selectedOption?.value || "";
    const selectedVendor = vendorOptions.find(
      (v) => v.id == vendorId || v._id == vendorId,
    );

    if (selectedVendor) {
      const selectedPlaceOfSupply = selectedVendor.placeOfSupply || "";
      setFormData((prev) => ({
        ...prev,
        vendorId: vendorId,
        businessName: selectedVendor.businessName || "",
        gstin:
          selectedVendor.gstin && selectedVendor.gstin.toString().trim() !== ""
            ? selectedVendor.gstin
            : "Unregistered",
        phoneNumber: selectedVendor.phoneNumber || "",
        email: selectedVendor.email || "",
        address: selectedVendor.address || "",
        placeOfSupply: selectedPlaceOfSupply,
      }));

      calculateTotals(
        items,
        taxData.taxPercentage,
        null,
        selectedPlaceOfSupply,
      );
    } else {
      setFormData((prev) => ({
        ...prev,
        vendorId: vendorId,
        businessName: "",
        gstin: "",
        phoneNumber: "",
        email: "",
        address: "",
        placeOfSupply: "",
      }));

      calculateTotals(items, taxData.taxPercentage, null, "");
    }

    // Clear error for vendorId
    if (errors.vendorId) {
      setErrors((prev) => ({ ...prev, vendorId: "" }));
    }
  };

  // Handle input change
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    // Clear error when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: "",
      }));
    }
  };

  // Handle item field change
  const handleItemChange = (id, field, value) => {
    const updatedItems = items.map((item) => {
      if (item.id === id) {
        const updatedItem = { ...item, [field]: value };

        // Calculate amount if qty or price changes
        if (field === "qty" || field === "price") {
          const qty =
            parseFloat(field === "qty" ? value : updatedItem.qty) || 0;
          const price =
            parseFloat(field === "price" ? value : updatedItem.price) || 0;
          updatedItem.amount = qty * price;
        }

        return updatedItem;
      }
      return item;
    });

    setItems(updatedItems);
    calculateTotals(updatedItems, taxData.taxPercentage, null);
  };

  // Add new item row
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
    const updatedItems = [...items, newItem];
    setItems(updatedItems);
  };

  // Remove item row
  const handleRemoveItem = (id) => {
    if (items.length > 1) {
      const updatedItems = items.filter((item) => item.id !== id);
      setItems(updatedItems);
      calculateTotals(updatedItems, taxData.taxPercentage, null);
    } else {
      showError("At least one item is required");
    }
  };

  // Calculate totals and taxes
  const calculateTotals = (
    itemsList,
    taxPercentage,
    manualRoundingAmount = null,
    placeOfSupplyOverride = null,
  ) => {
    const subtotal = itemsList.reduce(
      (sum, item) => sum + (item.amount || 0),
      0,
    );
    const taxAmount = (subtotal * taxPercentage) / 100;

    // Check if Rajasthan for CGST/SGST or Other State for IGST
    const placeOfSupplyValue =
      placeOfSupplyOverride !== null
        ? placeOfSupplyOverride
        : formData.placeOfSupply;

    const isRajasthan = placeOfSupplyValue.toLowerCase().includes("rajasthan");

    let cgst = 0,
      sgst = 0,
      igst = 0;

    if (isRajasthan) {
      // CGST and SGST (split tax equally)
      cgst = taxAmount / 2;
      sgst = taxAmount / 2;
    } else {
      // IGST (full tax)
      igst = taxAmount;
    }

    const subtotalWithTax = subtotal + taxAmount;

    // Auto-calculate rounding to nearest integer
    let roundValue;
    if (manualRoundingAmount !== null && manualRoundingAmount !== undefined) {
      roundValue = parseFloat(manualRoundingAmount) || 0;
    } else {
      const decimalPart = subtotalWithTax - Math.floor(subtotalWithTax);
      if (decimalPart <= 0.5) {
        // Round down: negative rounding
        roundValue = -decimalPart;
      } else {
        // Round up: positive rounding
        roundValue = 1 - decimalPart;
      }
    }

    const totalAmount = subtotalWithTax + roundValue;

    setTaxData({
      subtotal: subtotal.toFixed(2),
      taxPercentage: taxPercentage,
      cgst: cgst.toFixed(2),
      sgst: sgst.toFixed(2),
      igst: igst.toFixed(2),
      totalAmount: totalAmount.toFixed(2),
    });

    setFormData((prev) => ({
      ...prev,
      roundingAmount: roundValue.toFixed(2),
    }));
  };

  // Handle tax percentage change
  const handleTaxChange = (e) => {
    const newTaxPercentage = parseFloat(e.target.value) || 0;
    calculateTotals(items, newTaxPercentage, null);
  };

  const handleRoundingChange = (e) => {
    const value = e.target.value;
    setFormData((prev) => ({
      ...prev,
      roundingAmount: value,
    }));
    calculateTotals(items, taxData.taxPercentage, value);
  };

  const handleNumberInput = (e) => {
    const value = e.target.value;
    // Allow only numbers and decimal point
    const filteredValue = value.replace(/[^0-9.]/g, "");
    // Ensure only one decimal point
    const parts = filteredValue.split(".");
    const validValue =
      parts.length > 2
        ? parts[0] + "." + parts.slice(1).join("")
        : filteredValue;
    e.target.value = validValue;
  };

  // Field names mapping for display
  const fieldNames = {
    invoiceNumber: "Invoice Number",
    invoiceDate: "Invoice Date",
    vendorId: "Vendor",
    businessName: "Business Name",
    gstin: "GSTIN",
    phoneNumber: "Phone Number",
    email: "Email ID",
    address: "Address",
    placeOfSupply: "Place of Supply",
    paymentStatus: "Payment Status",
    paymentMethod: "Payment Method",
    paymentDate: "Payment Date",
  };

  const validateForm = () => {
    const newErrors = {};

    // Required fields
    const requiredFields = [
      "invoiceNumber",
      "invoiceDate",
      "vendorId",
      "paymentStatus",
    ];

    requiredFields.forEach((field) => {
      if (!formData[field] || formData[field].toString().trim() === "") {
        newErrors[field] = `${fieldNames[field]} is required`;
      }
    });

    // Validate items
    let hasValidItem = false;
    items.forEach((item, index) => {
      if (item.itemName && item.qty && item.price) {
        hasValidItem = true;
      }
    });

    if (!hasValidItem) {
      newErrors.items =
        "At least one item with name, quantity, and price is required";
      showError("Please add at least one item with complete details");
    }

    // Email validation
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Please enter a valid email address";
    }

    // Phone validation
    if (formData.phoneNumber && !/^\d{10}$/.test(formData.phoneNumber)) {
      newErrors.phoneNumber = "Phone number must be exactly 10 digits";
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

    if (validateForm()) {
      setSubmitting(true);
      try {
        const submitData = {
          ...formData,
          items: items,
          taxData: taxData,
          id: editingRecord?.id || Date.now(),
          createdDate: editingRecord?.createdDate || new Date().toISOString(),
        };

        await onSubmit(submitData);
      } finally {
        setSubmitting(false);
      }
    }
  };

  const RequiredStar = () => <span className="text-danger">*</span>;

  if (!show) return null;

  const modalTitle = editingRecord
    ? editingRecord.isViewMode
      ? `View Purchase - ${editingRecord.invoiceNumber}`
      : `Edit Purchase - ${editingRecord.invoiceNumber}`
    : "Add New Purchase";

  const isViewMode = editingRecord?.isViewMode;
  const isRajasthan = formData.placeOfSupply
    .toLowerCase()
    .includes("rajasthan");

  const vendorSelectOptions = vendorOptions.map((vendor) => ({
    value: String(vendor.id || vendor._id || ""),
    label: `${vendor.vendorName || ""} - ${vendor.businessName || ""}`,
  }));

  const selectedVendorOption = vendorSelectOptions.find(
    (option) => option.value === String(formData.vendorId || ""),
  );

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
            <form id="purchaseForm" onSubmit={handleSubmit} noValidate>
              {/* Basic Information */}
              <div className="row mb-4">
                <div className="col-12">
                  <h6 className="border-bottom pb-2 mb-3">
                    <i className="fas fa-info-circle me-2 text-primary"></i>
                    Basic Information
                  </h6>
                </div>

                {/* Invoice Number */}
                <div className="col-md-4 mb-3">
                  <label htmlFor="invoiceNumber" className="form-label">
                    <i className="fas fa-file-invoice me-2 text-primary"></i>
                    Invoice Number <RequiredStar />
                  </label>
                  <input
                    type="text"
                    className={`form-control modern-input ${errors.invoiceNumber ? "is-invalid" : ""}`}
                    id="invoiceNumber"
                    name="invoiceNumber"
                    value={formData.invoiceNumber}
                    onChange={handleInputChange}
                    placeholder="Enter Invoice Number"
                    readOnly={isViewMode}
                  />
                  {errors.invoiceNumber && (
                    <div className="invalid-feedback d-block">
                      {errors.invoiceNumber}
                    </div>
                  )}
                </div>

                {/* Invoice Date */}
                <div className="col-md-4 mb-3">
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

                {/* Select Vendor */}
                <div className="col-md-4 mb-3">
                  <label htmlFor="vendorId" className="form-label">
                    <i className="fas fa-truck me-2 text-primary"></i>
                    Select Vendor <RequiredStar />
                  </label>
                  <Select
                    inputId="vendorId"
                    classNamePrefix="react-select"
                    options={vendorSelectOptions}
                    value={selectedVendorOption || null}
                    onChange={handleVendorChange}
                    placeholder="Select Vendor"
                    isDisabled={isViewMode}
                    isClearable={!isViewMode}
                  />
                  {errors.vendorId && (
                    <div className="invalid-feedback d-block">
                      {errors.vendorId}
                    </div>
                  )}
                </div>
              </div>

              {/* Vendor Details - Auto-filled */}
              <div className="row mb-4">
                <div className="col-12">
                  <h6 className="border-bottom pb-2 mb-3">
                    <i className="fas fa-building me-2 text-success"></i>
                    Vendor Details (Auto-filled)
                  </h6>
                </div>

                {/* Business Name */}
                <div className="col-md-4 mb-3">
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
                    style={{ backgroundColor: "#e9ecef" }}
                  />
                </div>

                {/* GSTIN */}
                <div className="col-md-4 mb-3">
                  <label htmlFor="gstin" className="form-label">
                    <i className="fas fa-file-invoice me-2 text-primary"></i>
                    GSTIN
                  </label>
                  <input
                    type="text"
                    className="form-control modern-input"
                    id="gstin"
                    name="gstin"
                    value={formData.gstin}
                    readOnly
                    style={{ backgroundColor: "#e9ecef" }}
                  />
                </div>

                {/* Phone Number */}
                <div className="col-md-4 mb-3">
                  <label htmlFor="phoneNumber" className="form-label">
                    <i className="fas fa-phone me-2 text-primary"></i>
                    Phone Number
                  </label>
                  <input
                    type="text"
                    className="form-control modern-input"
                    id="phoneNumber"
                    name="phoneNumber"
                    value={formData.phoneNumber}
                    readOnly
                    style={{ backgroundColor: "#e9ecef" }}
                  />
                </div>

                {/* Email ID */}
                <div className="col-md-4 mb-3">
                  <label htmlFor="email" className="form-label">
                    <i className="fas fa-envelope me-2 text-primary"></i>
                    Email ID
                  </label>
                  <input
                    type="email"
                    className="form-control modern-input"
                    id="email"
                    name="email"
                    value={formData.email}
                    readOnly
                    style={{ backgroundColor: "#e9ecef" }}
                  />
                </div>

                {/* Address */}
                <div className="col-md-4 mb-3">
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
                    readOnly
                    style={{ backgroundColor: "#e9ecef" }}
                  />
                </div>

                {/* Place of Supply */}
                <div className="col-md-4 mb-3">
                  <label htmlFor="placeOfSupply" className="form-label">
                    <i className="fas fa-map-marked-alt me-2 text-primary"></i>
                    Place of Supply
                  </label>
                  <Select
                    inputId="placeOfSupply"
                    name="placeOfSupply"
                    classNamePrefix="react-select"
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
                    isDisabled={isViewMode}
                    isClearable
                    isSearchable
                    placeholder="Select Place of Supply"
                  />
                </div>
              </div>

              {/* Items Table */}
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
                  <div className="table-responsive">
                    <table className="table table-bordered table-hover">
                      <thead className="table-primary">
                        <tr>
                          <th style={{ width: "50px" }}>S.N</th>
                          <th style={{ width: "200px" }}>Item Name</th>
                          <th style={{ width: "250px" }}>Item Description</th>
                          <th style={{ width: "120px" }}>HSN Code</th>
                          <th style={{ width: "100px" }}>QTY</th>
                          <th style={{ width: "120px" }}>Price (₹)</th>
                          <th style={{ width: "120px" }}>Amount (₹)</th>
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
                              <input
                                type="text"
                                className="form-control modern-input form-control-sm"
                                value={item.itemName}
                                onChange={(e) =>
                                  handleItemChange(
                                    item.id,
                                    "itemName",
                                    e.target.value,
                                  )
                                }
                                placeholder="Item Name"
                                readOnly={isViewMode}
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                className="form-control modern-input form-control-sm"
                                value={item.itemDescription}
                                onChange={(e) =>
                                  handleItemChange(
                                    item.id,
                                    "itemDescription",
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
                                value={item.amount.toFixed(2)}
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

                  {!isViewMode && (
                    <button
                      type="button"
                      className="btn btn-success btn-sm mt-2"
                      onClick={handleAddItem}
                    >
                      <i className="fas fa-plus me-2"></i>
                      Add New Item
                    </button>
                  )}
                </div>
              </div>

              {/* Tax and Total Section */}
              <div className="row mb-4">
                <div className="col-12">
                  <h6 className="border-bottom pb-2 mb-3">
                    <i className="fas fa-calculator me-2 text-warning"></i>
                    Tax & Total Calculation
                  </h6>
                </div>

                <div className="col-md-6">
                  <div
                    className="card shadow-sm border-0"
                    style={{ backgroundColor: "#f8f9fa" }}
                  >
                    <div className="card-header bg-success rounded-top-3 text-white">
                      <h6 className="mb-0">
                        <i className="fas fa-receipt me-2"></i>Amount
                        Calculation
                      </h6>
                    </div>
                    <div className="card-body">
                      {/* Row for Subtotal (full width) */}
                      <div className="row">
                        <div className="col-md-4 mb-3">
                          <div className="mb-2">
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
                        </div>

                        {/* Row for Tax, CGST, SGST, IGST in col-md-4 */}
                        {/* Tax Percentage */}
                        <div className="col-md-4 mb-3">
                          <label
                            htmlFor="taxPercentage"
                            className="form-label fw-bold"
                          >
                            <i className="fas fa-percentage me-2 text-warning"></i>
                            Tax Percentage
                          </label>
                          <div className="input-group">
                            <span className="input-group-text bg-success text-white">
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

                        {/* CGST */}
                        <div className="col-md-4 mb-3">
                          <label className="form-label fw-bold">
                            <i className="fas fa-file-invoice me-2 text-success"></i>
                            CGST ({isRajasthan ? taxData.taxPercentage / 2 : 0}
                            %)
                          </label>
                          <div className="input-group">
                            <span
                              className={`input-group-text bg-success text-white`}
                            >
                              ₹
                            </span>
                            <input
                              type="text"
                              className={`form-control modern-input fw-bold ${isRajasthan ? "text-success" : "text-muted"}`}
                              value={taxData.cgst}
                              readOnly
                            />
                          </div>
                        </div>

                        {/* SGST */}
                        <div className="col-md-4 mb-3">
                          <label className="form-label fw-bold">
                            <i className="fas fa-file-invoice me-2 text-success"></i>
                            SGST ({isRajasthan ? taxData.taxPercentage / 2 : 0}
                            %)
                          </label>
                          <div className="input-group">
                            <span
                              className={`input-group-text bg-success text-white`}
                            >
                              ₹
                            </span>
                            <input
                              type="text"
                              className={`form-control modern-input fw-bold ${isRajasthan ? "text-success" : "text-muted"}`}
                              value={taxData.sgst}
                              readOnly
                            />
                          </div>
                        </div>

                        {/* IGST */}
                        <div className="col-md-4 mb-3">
                          <label className="form-label fw-bold">
                            <i className="fas fa-file-invoice me-2 text-primary"></i>
                            IGST ({!isRajasthan ? taxData.taxPercentage : 0}%)
                          </label>
                          <div className="input-group">
                            <span
                              className={`input-group-text bg-success text-white`}
                            >
                              ₹
                            </span>
                            <input
                              type="text"
                              className={`form-control modern-input fw-bold ${!isRajasthan ? "text-primary" : "text-muted"}`}
                              value={taxData.igst}
                              readOnly
                            />
                          </div>
                        </div>

                        {/* Rounding Amount */}
                        <div className="col-md-4 mb-3">
                          <label
                            htmlFor="roundingAmount"
                            className="form-label fw-bold"
                          >
                            <i className="fas fa-adjust me-2 text-secondary"></i>
                            Rounding Amount
                          </label>
                          <div className="input-group">
                            <span className="input-group-text bg-secondary text-white">
                              ₹
                            </span>
                            <input
                              type="text"
                              className="form-control modern-input"
                              id="roundingAmount"
                              name="roundingAmount"
                              value={formData.roundingAmount}
                              onChange={(e) => {
                                handleNumberInput(e);
                                handleRoundingChange(e);
                              }}
                              readOnly={isViewMode}
                            />
                          </div>
                        </div>

                        {/* Total Amount */}
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
                              style={{
                                backgroundColor: "#ffebee",
                              }}
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
                        {/* Payment Status */}
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

                        {/* Payment Method */}
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
                            <option value="Credit Card">💳 Credit Card</option>
                            <option value="Debit Card">💳 Debit Card</option>
                            <option value="UPI">📱 UPI</option>
                            <option value="Cheque">📝 Cheque</option>
                          </select>
                        </div>

                        {/* Payment Date */}
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

                        {/* Invoice Type */}
                        <div className="col-md-6 mb-3">
                          <label
                            htmlFor="invoiceType"
                            className="form-label fw-bold"
                          >
                            <i className="fas fa-file-invoice me-2 text-primary"></i>
                            Invoice Type
                          </label>
                          <select
                            className="form-select modern-input"
                            id="invoiceType"
                            name="invoiceType"
                            value={formData.invoiceType}
                            onChange={handleInputChange}
                            disabled={isViewMode}
                            style={{ fontWeight: "500" }}
                          >
                            <option value="">Select Invoice Type</option>
                            <option value="Not ITC">Not ITC</option>
                            <option value="ITC">ITC</option>
                            <option value="RCM">RCM</option>
                            <option value="RCM + ITC">RCM + ITC</option>
                          </select>
                        </div>

                        {/* Invoice URL */}
                        <div className="col-md-6 mb-3">
                          <label
                            htmlFor="invoiceURL"
                            className="form-label fw-bold"
                          >
                            <i className="fas fa-link me-2 text-warning"></i>
                            Invoice URL
                          </label>
                          <input
                            type="url"
                            className="form-control modern-input"
                            id="invoiceURL"
                            name="invoiceURL"
                            value={formData.invoiceURL}
                            onChange={handleInputChange}
                            placeholder="https://example.com/invoice.pdf"
                            readOnly={isViewMode}
                            style={{ fontWeight: "500" }}
                          />
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
                form="purchaseForm"
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
                    {editingRecord ? "Update Purchase" : "Save Purchase"}
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

export default CreatePurchase;
