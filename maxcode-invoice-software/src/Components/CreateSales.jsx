import React, { useEffect, useRef, useState } from "react";
import Select from "react-select";
import SelectRightLoader from "./SelectRightLoader";
import { showError } from "./ToastNotification";
import { apiGet } from "../utils/api";
import API_ENDPOINTS from "../utils/apiEndpoints";
import {
  fetchSelectableClients,
  filterRowsBySearch,
  filterActiveSelectableRows,
} from "../utils/fetchAllEntities";
import { getUnifiedSelectStyles } from "../utils/reactSelectStyles";

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

const CreateSales = ({
  show,
  onClose,
  onSubmit,
  editingRecord = null,
  clients = [],
  defaultFinancialYear = null,
  existingInvoices = [],
}) => {
  const [formData, setFormData] = useState({
    invoiceNumber: "",
    invoiceDate: "",
    clientRefId: "",
    clientId: "",
    clientName: "",
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
    amountReceived: "",
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
  const [clientOptions, setClientOptions] = useState([]);
  const [serviceOptions, setServiceOptions] = useState([]);
  const [isClientLoading, setIsClientLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const clientSearchDebounceRef = useRef(null);
  const clientAbortControllerRef = useRef(null);
  const clientLoadingResetRef = useRef(null);
  const knownClientRowsRef = useRef([]);

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
    if (Array.isArray(clients) && clients.length > 0) {
      const activeClients = filterActiveSelectableRows(clients);
      knownClientRowsRef.current = activeClients;
      setClientOptions(activeClients);
    }
  }, [clients]);

  useEffect(() => {
    if (!show) return;

    const fetchClients = async () => {
      if (clientAbortControllerRef.current) {
        clientAbortControllerRef.current.abort();
      }

      const controller = new AbortController();
      clientAbortControllerRef.current = controller;
      setIsClientLoading(true);

      try {
        const clientData = await fetchSelectableClients({
          limit: 50,
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        const activeClients = filterActiveSelectableRows(clientData);
        knownClientRowsRef.current = activeClients;
        setClientOptions(activeClients);
      } catch (error) {
        if (error?.name !== "CanceledError" && error?.code !== "ERR_CANCELED") {
          console.error("Failed to fetch clients:", error);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsClientLoading(false);
        }
      }
    };

    fetchClients();

    return () => {
      if (clientSearchDebounceRef.current) {
        clearTimeout(clientSearchDebounceRef.current);
      }
      if (clientLoadingResetRef.current) {
        clearTimeout(clientLoadingResetRef.current);
      }
      if (clientAbortControllerRef.current) {
        clientAbortControllerRef.current.abort();
      }
    };
  }, [show]);

  const handleClientSearchInput = (inputValue, meta) => {
    if (meta?.action !== "input-change") {
      return inputValue;
    }

    const searchText = String(inputValue || "").trim();

    if (clientLoadingResetRef.current) {
      clearTimeout(clientLoadingResetRef.current);
    }

    setIsClientLoading(Boolean(searchText));

    if (clientSearchDebounceRef.current) {
      clearTimeout(clientSearchDebounceRef.current);
    }

    if (!searchText) {
      setClientOptions(knownClientRowsRef.current.slice(0, 50));
      setIsClientLoading(false);
      if (clientAbortControllerRef.current) {
        clientAbortControllerRef.current.abort();
      }
      return inputValue;
    }

    const localMatches = filterRowsBySearch(
      knownClientRowsRef.current,
      searchText,
      [
        "clientName",
        "businessName",
        "clientId",
        "phoneNumber",
        "email",
        "gstin",
      ],
    );

    if (localMatches.length > 0) {
      setClientOptions(localMatches);
      if (clientAbortControllerRef.current) {
        clientAbortControllerRef.current.abort();
      }
      clientLoadingResetRef.current = setTimeout(() => {
        setIsClientLoading(false);
      }, 180);
      return inputValue;
    }

    clientSearchDebounceRef.current = setTimeout(async () => {
      if (clientAbortControllerRef.current) {
        clientAbortControllerRef.current.abort();
      }

      const controller = new AbortController();
      clientAbortControllerRef.current = controller;
      setIsClientLoading(true);

      try {
        const rows = await fetchSelectableClients({
          search: searchText,
          limit: 50,
          signal: controller.signal,
        });

        if (controller.signal.aborted) return;

        const activeRows = filterActiveSelectableRows(rows);
        const mergedRows = filterActiveSelectableRows([
          ...knownClientRowsRef.current,
          ...activeRows,
        ]);

        knownClientRowsRef.current = mergedRows;
        setClientOptions(activeRows);
      } catch (error) {
        if (error?.name !== "CanceledError" && error?.code !== "ERR_CANCELED") {
          console.error("Failed to search clients:", error);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsClientLoading(false);
        }
      }
    }, 350);

    return inputValue;
  };

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
      } catch (error) {
        console.error("Failed to fetch business settings:", error);
        setServiceOptions([]);
      }
    };

    fetchBusinessSettings();
  }, [show]);

  useEffect(() => {
    if (editingRecord) {
      setFormData({
        invoiceNumber: editingRecord.invoiceNumber || "",
        invoiceDate: editingRecord.invoiceDate || "",
        clientRefId: editingRecord.clientRefId || "",
        clientId: editingRecord.clientId || "",
        clientName: editingRecord.clientName || "",
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
        amountReceived: editingRecord.amountReceived || "",
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

    const fetchNextInvoiceNumber = async () => {
      try {
        const response = await apiGet(API_ENDPOINTS.INVOICES.NEXT_NUMBER, {
          params: {
            ...(defaultFinancialYear?.financialYear
              ? { financialYear: defaultFinancialYear.financialYear }
              : {}),
            ...(defaultFinancialYear?.invoiceFormat
              ? { invoiceFormat: defaultFinancialYear.invoiceFormat }
              : {}),
          },
        });

        if (cancelled) return;

        const nextInvoiceNumber =
          response?.data?.invoiceNumber || response?.data?.nextNumber || "";

        setFormData((prev) => ({
          ...prev,
          invoiceNumber: nextInvoiceNumber || prev.invoiceNumber,
        }));
      } catch (error) {
        if (cancelled) return;

        const fallbackNumber = getNextInvoiceNumberFromLocal(
          defaultFinancialYear?.invoiceFormat,
          existingInvoices,
        );

        if (fallbackNumber) {
          setFormData((prev) => ({
            ...prev,
            invoiceNumber: fallbackNumber,
          }));
        }
      }
    };

    fetchNextInvoiceNumber();

    return () => {
      cancelled = true;
    };
  }, [defaultFinancialYear, editingRecord, show, existingInvoices]);

  const resetForm = () => {
    setFormData({
      invoiceNumber: "",
      invoiceDate: "",
      clientRefId: "",
      clientId: "",
      clientName: "",
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
      amountReceived: "",
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
  };

  const toNumber = (value) => {
    const num = parseFloat(value);
    return Number.isNaN(num) ? 0 : num;
  };

  const escapeRegExp = (value) => {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  };

  const getNextInvoiceNumberFromLocal = (format, invoices) => {
    if (!format) return "";

    const match = String(format).match(/^(.*?)(\d+)$/);
    if (!match) return String(format);

    const prefix = match[1];
    const seed = match[2];
    const width = seed.length;
    const seedNumber = parseInt(seed, 10) || 1;
    const pattern = new RegExp(`^${escapeRegExp(prefix)}(\\d+)$`);

    let maxNumber = 0;
    (invoices || []).forEach((invoice) => {
      const invoiceNumber = String(invoice?.invoiceNumber || "").trim();
      const invoiceMatch = invoiceNumber.match(pattern);
      if (!invoiceMatch) return;

      const current = parseInt(invoiceMatch[1], 10);
      if (!Number.isNaN(current) && current > maxNumber) {
        maxNumber = current;
      }
    });

    const nextNumber = Math.max(seedNumber, maxNumber + 1);
    return `${prefix}${String(nextNumber).padStart(width, "0")}`;
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

  const computeTdsAmount = (totalAmount, tdsPercent) => {
    const total = toNumber(totalAmount);
    const percent = toNumber(tdsPercent);
    return ((total * percent) / 100).toFixed(2);
  };

  const calculateTotals = (
    itemsList,
    taxPercentage,
    manualRoundingAmount = null,
    placeOfSupplyOverride = null,
  ) => {
    const subtotal = itemsList.reduce(
      (sum, item) => sum + (toNumber(item.amount) || 0),
      0,
    );
    const taxAmount = (subtotal * toNumber(taxPercentage)) / 100;
    const placeToUse =
      placeOfSupplyOverride !== null
        ? placeOfSupplyOverride
        : formData.placeOfSupply;
    const isRajasthan = placeToUse.toLowerCase().includes("rajasthan");

    let cgst = 0;
    let sgst = 0;
    let igst = 0;

    if (isRajasthan) {
      cgst = taxAmount / 2;
      sgst = taxAmount / 2;
    } else {
      igst = taxAmount;
    }

    const subtotalWithTax = subtotal + taxAmount;

    // Auto-calculate rounding to nearest integer
    let roundValue;
    if (manualRoundingAmount !== null && manualRoundingAmount !== undefined) {
      roundValue = toNumber(manualRoundingAmount);
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

  const handleClientChange = (selectedOption) => {
    const selectedRefId = selectedOption?.value || "";
    const selectedClient = clientOptions.find(
      (c) =>
        String(c.id || c._id || c.clientId || "") === String(selectedRefId),
    );

    if (selectedClient) {
      // Normalize and safely extract all fields
      const clientId = String(
        selectedClient.clientId ||
          selectedClient.id ||
          selectedClient._id ||
          "",
      ).trim();
      const clientName = String(selectedClient.clientName || "").trim();
      const businessName = String(selectedClient.businessName || "").trim();
      const gstin =
        selectedClient.gstin && String(selectedClient.gstin).trim() !== ""
          ? String(selectedClient.gstin).trim()
          : "Unregistered";
      const phoneNumber = String(selectedClient.phoneNumber || "").trim();
      const email = String(selectedClient.email || "").trim();
      const address = String(selectedClient.address || "").trim();
      const nextPlace = String(selectedClient.placeOfSupply || "").trim();

      setFormData((prev) => ({
        ...prev,
        clientRefId: selectedRefId,
        clientId: clientId,
        clientName: clientName,
        businessName: businessName,
        gstin: gstin,
        phoneNumber: phoneNumber,
        email: email,
        address: address,
        placeOfSupply: nextPlace,
      }));
      calculateTotals(items, taxData.taxPercentage, null, nextPlace);
    } else {
      setFormData((prev) => ({
        ...prev,
        clientRefId: selectedRefId,
        clientId: "",
        clientName: "",
        businessName: "",
        gstin: "",
        phoneNumber: "",
        email: "",
        address: "",
        placeOfSupply: "",
      }));
      calculateTotals(items, taxData.taxPercentage, null, "");
    }

    if (errors.clientRefId) {
      setErrors((prev) => ({ ...prev, clientRefId: "" }));
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
    calculateTotals(updatedItems, taxData.taxPercentage, null);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

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

  const handleTdsPercentChange = (e) => {
    const value = e.target.value;
    setFormData((prev) => ({
      ...prev,
      tdsPercent: value,
      tdsAmount: computeTdsAmount(taxData.totalAmount, value),
    }));
  };

  const handleItemChange = (id, field, value) => {
    const updatedItems = items.map((item) => {
      if (item.id === id) {
        const updatedItem = { ...item, [field]: value };
        if (field === "qty" || field === "price") {
          const qty = toNumber(field === "qty" ? value : updatedItem.qty);
          const price = toNumber(field === "price" ? value : updatedItem.price);
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

  const handleTaxChange = (e) => {
    const newTaxPercentage = e.target.value;
    calculateTotals(items, newTaxPercentage, null);
  };

  const fieldNames = {
    invoiceNumber: "Invoice Number",
    invoiceDate: "Invoice Date",
    clientRefId: "Client",
    paymentStatus: "Payment Status",
  };

  const validateForm = () => {
    const newErrors = {};
    const requiredFields = [
      "invoiceNumber",
      "invoiceDate",
      "clientRefId",
      "paymentStatus",
    ];

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

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = "Please enter a valid email address";
    }

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
      ? `View Sales - ${editingRecord.invoiceNumber}`
      : `Edit Sales - ${editingRecord.invoiceNumber}`
    : "Add New Sales";

  const isViewMode = editingRecord?.isViewMode;
  const isRajasthan = formData.placeOfSupply
    .toLowerCase()
    .includes("rajasthan");
  const selectMenuPortalTarget =
    typeof document !== "undefined" ? document.body : null;
  const selectedClientOption = clientOptions
    .map((client) => {
      const clientValue = client.id || client._id || client.clientId;
      return {
        value: clientValue,
        label: `${client.clientName || ""} - ${client.businessName || ""}`,
      };
    })
    .find((option) => String(option.value) === String(formData.clientRefId));

  const selectComponents = {
    LoadingIndicator: SelectRightLoader,
    IndicatorSeparator: null,
  };

  const clientSelectStyles = getUnifiedSelectStyles({
    hasError: Boolean(errors.clientRefId),
  });

  const placeOfSupplySelectStyles = getUnifiedSelectStyles();

  const itemServiceSelectStyles = getUnifiedSelectStyles({
    compact: true,
  });

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
            <form id="salesForm" onSubmit={handleSubmit} noValidate>
              <div className="row mb-4">
                <div className="col-12">
                  <h6 className="border-bottom pb-2 mb-3">
                    <i className="fas fa-info-circle me-2 text-primary"></i>
                    Basic Information
                  </h6>
                </div>

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
                    readOnly={isViewMode || !editingRecord}
                  />
                  {errors.invoiceNumber && (
                    <div className="invalid-feedback d-block">
                      {errors.invoiceNumber}
                    </div>
                  )}
                </div>

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

                <div className="col-md-4 mb-3">
                  <label htmlFor="clientRefId" className="form-label">
                    <i className="fas fa-user me-2 text-primary"></i>
                    Select Client <RequiredStar />
                  </label>
                  <Select
                    inputId="clientRefId"
                    name="clientRefId"
                    className={errors.clientRefId ? "is-invalid" : ""}
                    classNamePrefix="react-select"
                    styles={clientSelectStyles}
                    components={selectComponents}
                    isLoading={isClientLoading}
                    menuPortalTarget={selectMenuPortalTarget}
                    menuPosition="fixed"
                    value={selectedClientOption || null}
                    onChange={handleClientChange}
                    onInputChange={handleClientSearchInput}
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
                  <label htmlFor="clientId" className="form-label">
                    <i className="fas fa-id-card me-2 text-primary"></i>
                    Client ID
                  </label>
                  <input
                    type="text"
                    className="form-control modern-input"
                    id="clientId"
                    name="clientId"
                    value={formData.clientId}
                    readOnly
                    style={{ backgroundColor: "#e9ecef" }}
                  />
                </div>

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

                <div className="col-md-4 mb-3">
                  <label htmlFor="placeOfSupply" className="form-label">
                    <i className="fas fa-map-marked-alt me-2 text-primary"></i>
                    Place of Supply
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
                    isDisabled={isViewMode || Boolean(formData.clientRefId)}
                    isClearable
                    isSearchable
                    placeholder="Select Place of Supply"
                  />
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
                                styles={itemServiceSelectStyles}
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
                              onClick={() => handleRemoveItem(item.id)}
                              disabled={items.length === 1}
                            >
                              <i className="fas fa-trash"></i>
                            </button>
                          )}
                        </div>
                        <div className="card-body">
                          <div className="row">
                            {/* Row 1: Service Name */}
                            <div className="col-12 mb-3">
                              <label className="form-label fw-semibold">
                                Service Name
                              </label>
                              <Select
                                classNamePrefix="react-select"
                                styles={itemServiceSelectStyles}
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
                            </div>

                            {/* Row 2: Description */}
                            <div className="col-12 mb-3">
                              <label className="form-label fw-semibold">
                                Description
                              </label>
                              <input
                                type="text"
                                className="form-control modern-input"
                                value={item.itemDescription}
                                onChange={(e) =>
                                  handleItemChange(
                                    item.id,
                                    "itemDescription",
                                    e.target.value,
                                  )
                                }
                                placeholder="Item Description"
                                readOnly={isViewMode}
                              />
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
                    <div className="card-header bg-success rounded-top-3 text-white">
                      <h6 className="mb-0">
                        <i className="fas fa-receipt me-2"></i>Amount
                        Calculation
                      </h6>
                    </div>
                    <div className="card-body">
                      <div className="row">
                        {/* Subtotal Amount */}
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
                              style={{
                                backgroundColor: "#ffffff",
                              }}
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
                              style={{
                                backgroundColor: "#fff",
                              }}
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
                              style={{
                                backgroundColor: "#fff",
                              }}
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

                        {/* Amount Received */}
                        <div className="col-md-4 mb-3">
                          <label
                            htmlFor="amountReceived"
                            className="form-label fw-bold"
                          >
                            <i className="fas fa-hand-holding-usd me-2 text-success"></i>
                            Amount Received
                          </label>
                          <div className="input-group">
                            <span className="input-group-text bg-success text-white">
                              ₹
                            </span>
                            <input
                              type="text"
                              className="form-control modern-input"
                              id="amountReceived"
                              name="amountReceived"
                              value={formData.amountReceived}
                              onChange={(e) => {
                                handleNumberInput(e);
                                handleInputChange(e);
                              }}
                              readOnly={isViewMode}
                            />
                          </div>
                        </div>

                        {/* TDS Percent */}
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

                        {/* TDS Amount */}
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
                form="salesForm"
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
                    {editingRecord ? "Update Sale" : "Save Sale"}
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      <style>{`
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

export default CreateSales;
