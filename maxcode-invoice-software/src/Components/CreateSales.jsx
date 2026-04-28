import React, { useEffect, useRef, useState } from "react";
import Select from "react-select";
import SelectRightLoader from "./SelectRightLoader";
import ConfirmationModal from "./ConfirmationModal";
import { showError } from "./ToastNotification";
import { apiGet } from "../utils/api";
import API_ENDPOINTS from "../utils/apiEndpoints";
import {
  fetchSelectableClients,
  filterRowsBySearch,
  filterActiveSelectableRows,
} from "../utils/fetchAllEntities";
import { getUnifiedSelectStyles } from "../utils/reactSelectStyles";
import { normalizePaymentMethod } from "../utils/paymentMethods";

const SALES_ITEM_DESCRIPTION_MAX_LENGTH = 27;

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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [itemToDelete, setItemToDelete] = useState(null);
  const clientSearchDebounceRef = useRef(null);
  const clientAbortControllerRef = useRef(null);
  const clientLoadingResetRef = useRef(null);
  const knownClientRowsRef = useRef([]);

  // Advance payment state
  const [availableAdvances, setAvailableAdvances] = useState([]);
  const [appliedAdvances, setAppliedAdvances] = useState([]); // [{advanceId, receiptNumber, appliedAmount, maxAmount}]
  const [isLoadingAdvances, setIsLoadingAdvances] = useState(false);
  const baseRegularReceivedRef = useRef(0);
  const lockedRegularPaymentDateRef = useRef("");
  const lockedRegularPaymentMethodRef = useRef("");

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
      const existingAppliedAdvances = Array.isArray(
        editingRecord.appliedAdvances,
      )
        ? editingRecord.appliedAdvances
        : [];

      const originalAdvanceAdjusted = existingAppliedAdvances.reduce(
        (sum, adv) => sum + Number(adv.appliedAmount || 0),
        0,
      );
      const originalReceivedAmount = toNumber(editingRecord.amountReceived);
      const baseRegularReceived = Math.max(
        0,
        originalReceivedAmount - originalAdvanceAdjusted,
      );

      baseRegularReceivedRef.current = baseRegularReceived;
      lockedRegularPaymentDateRef.current =
        baseRegularReceived > 0 ? editingRecord.paymentDate || "" : "";
      lockedRegularPaymentMethodRef.current =
        baseRegularReceived > 0
          ? normalizePaymentMethod(editingRecord.paymentMethod || "")
          : "";

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
        paymentMethod: normalizePaymentMethod(editingRecord.paymentMethod),
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
      // Restore applied advances from editing record so they show in view/edit modes
      if (
        Array.isArray(editingRecord.appliedAdvances) &&
        editingRecord.appliedAdvances.length > 0
      ) {
        const restored = editingRecord.appliedAdvances.map((a) => ({
          advanceId: normalizeAdvanceId(a.advanceId || a.id || a._id),
          receiptNumber: a.receiptNumber || "",
          receiptDate: a.receiptDate || a.receipt_date || a.date || null,
          paymentMethod: normalizePaymentMethod(a.paymentMethod || ""),
          appliedAmount: Number(a.appliedAmount || 0),
          maxAmount: Number(a.maxAmount || a.appliedAmount || 0),
        }));
        setAppliedAdvances(restored);
      }
    } else {
      baseRegularReceivedRef.current = 0;
      lockedRegularPaymentDateRef.current = "";
      lockedRegularPaymentMethodRef.current = "";
      resetForm();
    }
  }, [editingRecord, show]);

  useEffect(() => {
    if (!show || !editingRecord) return;

    const totalAmount = toNumber(taxData.totalAmount);
    const totalAdvanceAmount = (appliedAdvances || []).reduce(
      (sum, adv) => sum + Number(adv.appliedAmount || 0),
      0,
    );
    const baseRegularReceived = toNumber(baseRegularReceivedRef.current);
    const nextReceivedAmount = Math.max(
      0,
      baseRegularReceived + totalAdvanceAmount,
    );
    const nextStatus = derivePaymentStatus(totalAmount, nextReceivedAmount);
    const latestAdvanceMeta = getLatestAppliedAdvanceMeta(appliedAdvances);

    const hasRegularComponent = baseRegularReceived > 0;
    const nextPaymentDate = hasRegularComponent
      ? lockedRegularPaymentDateRef.current
      : latestAdvanceMeta.receiptDate || "";
    const nextPaymentMethod = hasRegularComponent
      ? lockedRegularPaymentMethodRef.current
      : latestAdvanceMeta.paymentMethod || "";

    setFormData((prev) => {
      const nextReceivedAsText =
        nextReceivedAmount > 0 ? String(nextReceivedAmount) : "";

      if (
        prev.amountReceived === nextReceivedAsText &&
        prev.paymentStatus === nextStatus &&
        (prev.paymentDate || "") === (nextPaymentDate || "") &&
        normalizePaymentMethod(prev.paymentMethod || "") ===
          normalizePaymentMethod(nextPaymentMethod || "")
      ) {
        return prev;
      }

      return {
        ...prev,
        amountReceived: nextReceivedAsText,
        paymentStatus: nextStatus,
        paymentDate: nextPaymentDate,
        paymentMethod: nextPaymentMethod,
      };
    });
  }, [show, editingRecord, taxData.totalAmount, appliedAdvances]);

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
    setAvailableAdvances([]);
    setAppliedAdvances([]);
  };

  const toNumber = (value) => {
    const num = parseFloat(value);
    return Number.isNaN(num) ? 0 : num;
  };

  const normalizeAdvanceId = (value) => String(value || "");

  const derivePaymentStatus = (invoiceTotal, receivedAmount) => {
    const total = toNumber(invoiceTotal);
    const received = toNumber(receivedAmount);

    if (received <= 0) return "Unpaid";
    if (total > 0 && received >= total) return "Paid";
    return "Partial";
  };

  const computeDueAmount = (invoiceTotal, receivedAmount) => {
    return Math.max(0, toNumber(invoiceTotal) - toNumber(receivedAmount));
  };

  const escapeRegExp = (value) => {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  };

  const parseDateFlexible = (value) => {
    if (!value) return null;

    const raw = String(value).trim();
    if (!raw) return null;

    const direct = new Date(raw);
    if (!Number.isNaN(direct.getTime())) return direct;

    // Supports DD-MM-YYYY
    const dashMatch = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (dashMatch) {
      const parsed = new Date(
        Number(dashMatch[3]),
        Number(dashMatch[2]) - 1,
        Number(dashMatch[1]),
      );
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    // Supports DD/MM/YYYY
    const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
      const parsed = new Date(
        Number(slashMatch[3]),
        Number(slashMatch[2]) - 1,
        Number(slashMatch[1]),
      );
      if (!Number.isNaN(parsed.getTime())) return parsed;
    }

    return null;
  };

  const formatDateHyphen = (dateString) => {
    if (!dateString) return "";
    try {
      const d = new Date(dateString);
      if (isNaN(d.getTime())) return dateString;
      const day = String(d.getDate()).padStart(2, "0");
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const year = d.getFullYear();
      return `${day}-${month}-${year}`;
    } catch (e) {
      return dateString;
    }
  };

  const getLatestAppliedAdvanceMeta = (advances = []) => {
    const candidates = advances
      .filter((adv) => toNumber(adv.appliedAmount) > 0)
      .map((adv) => ({
        receiptDate: adv.receiptDate || "",
        paymentMethod: normalizePaymentMethod(adv.paymentMethod || ""),
      }));

    if (candidates.length === 0) {
      return { receiptDate: "", paymentMethod: "" };
    }

    const withDate = candidates.filter((c) => c.receiptDate);
    if (withDate.length === 0) {
      return candidates[candidates.length - 1];
    }

    withDate.sort((a, b) => {
      const aTime = new Date(a.receiptDate).getTime() || 0;
      const bTime = new Date(b.receiptDate).getTime() || 0;
      return aTime - bTime;
    });

    return withDate[withDate.length - 1];
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

  // Fetch available advance payments when client is selected
  useEffect(() => {
    if (!formData.clientRefId || !show) {
      setAvailableAdvances([]);
      setAppliedAdvances([]);
      return;
    }
    const fetchAdvances = async () => {
      setIsLoadingAdvances(true);
      try {
        const res = await apiGet(
          API_ENDPOINTS.PAYMENT_RECEIPTS.AVAILABLE_ADVANCES(
            formData.clientRefId,
          ),
        );
        const advances = res?.data?.advances || [];
        // Merge server advances with any previously applied advances (editing case)
        let mergedAdvances = Array.isArray(advances) ? [...advances] : [];
        if (editingRecord?.appliedAdvances?.length > 0) {
          const restored = editingRecord.appliedAdvances.map((a) => ({
            advanceId: normalizeAdvanceId(a.advanceId || a.id || a._id),
            receiptNumber: a.receiptNumber || "",
            receiptDate: a.receiptDate || a.receipt_date || a.date || null,
            paymentMethod: normalizePaymentMethod(a.paymentMethod || ""),
            appliedAmount: Number(a.appliedAmount || 0),
            maxAmount: Number(a.maxAmount || a.appliedAmount || 0),
          }));
          const missingMetaAdvances = restored.filter(
            (r) => !r.receiptDate || !r.paymentMethod,
          );

          if (missingMetaAdvances.length > 0) {
            const hydrated = await Promise.all(
              restored.map(async (r) => {
                if (r.receiptDate && r.paymentMethod) {
                  return r;
                }

                try {
                  const response = await apiGet(
                    API_ENDPOINTS.PAYMENT_RECEIPTS.GET(r.advanceId),
                  );
                  const receipt = response?.data || {};
                  return {
                    ...r,
                    receiptNumber:
                      r.receiptNumber || receipt.receiptNumber || "",
                    receiptDate: r.receiptDate || receipt.receiptDate || null,
                    paymentMethod:
                      r.paymentMethod ||
                      normalizePaymentMethod(receipt.paymentMethod || ""),
                  };
                } catch {
                  return r;
                }
              }),
            );
            setAppliedAdvances(hydrated);
          } else {
            setAppliedAdvances(restored);
          }

          // Ensure restored advances appear in available list so unchecking doesn't remove them
          for (const r of missingMetaAdvances.length > 0
            ? await Promise.all(
                restored.map(async (row) => {
                  if (row.receiptDate && row.paymentMethod) return row;
                  try {
                    const response = await apiGet(
                      API_ENDPOINTS.PAYMENT_RECEIPTS.GET(row.advanceId),
                    );
                    const receipt = response?.data || {};
                    return {
                      ...row,
                      receiptNumber:
                        row.receiptNumber || receipt.receiptNumber || "",
                      receiptDate:
                        row.receiptDate || receipt.receiptDate || null,
                      paymentMethod:
                        row.paymentMethod ||
                        normalizePaymentMethod(receipt.paymentMethod || ""),
                    };
                  } catch {
                    return row;
                  }
                }),
              )
            : restored) {
            const exists = mergedAdvances.some(
              (m) =>
                normalizeAdvanceId(m.id || m._id) ===
                normalizeAdvanceId(r.advanceId),
            );
            if (!exists) {
              mergedAdvances.push({
                id: r.advanceId,
                receiptNumber: r.receiptNumber,
                receiptDate: r.receiptDate,
                paymentMethod: normalizePaymentMethod(r.paymentMethod || ""),
                amount: r.maxAmount || r.appliedAmount || 0,
                availableAmount: r.maxAmount || r.appliedAmount || 0,
              });
            }
          }
        }

        setAvailableAdvances(mergedAdvances);
      } catch (err) {
        console.error("Failed to fetch advances:", err);
        setAvailableAdvances([]);
      } finally {
        setIsLoadingAdvances(false);
      }
    };
    fetchAdvances();
  }, [formData.clientRefId, show]);

  const getAdvanceAdjustmentCapacity = () => {
    const invoiceTotal = toNumber(taxData.totalAmount);
    const regularReceivedAmount = toNumber(baseRegularReceivedRef.current);
    return Math.max(0, invoiceTotal - regularReceivedAmount);
  };

  const getRemainingAdvanceCapacity = (excludeAdvanceId = "") => {
    const normalizedExcludeId = normalizeAdvanceId(excludeAdvanceId);
    const selectedAdvanceTotal = (appliedAdvances || []).reduce((sum, adv) => {
      if (
        normalizedExcludeId &&
        normalizeAdvanceId(adv.advanceId) === normalizedExcludeId
      ) {
        return sum;
      }
      return sum + toNumber(adv.appliedAmount);
    }, 0);
    return Math.max(0, getAdvanceAdjustmentCapacity() - selectedAdvanceTotal);
  };

  const handleToggleAdvance = (advance) => {
    const normalizedId = normalizeAdvanceId(
      advance.id || advance._id || advance.advanceId,
    );

    setAppliedAdvances((prev) => {
      const existing = prev.find(
        (a) => normalizeAdvanceId(a.advanceId) === normalizedId,
      );
      if (existing) {
        return prev.filter(
          (a) => normalizeAdvanceId(a.advanceId) !== normalizedId,
        );
      }
      const remainingInvoiceCapacity = Math.max(
        0,
        getAdvanceAdjustmentCapacity() -
          prev.reduce((sum, a) => sum + toNumber(a.appliedAmount), 0),
      );
      if (remainingInvoiceCapacity <= 0) {
        showError("Invoice already paid. You can’t apply more advance.");
        return prev;
      }

      const availableAmount = toNumber(advance.availableAmount);
      return [
        ...prev,
        {
          advanceId: normalizedId,
          receiptNumber: advance.receiptNumber,
          receiptDate: advance.receiptDate || "",
          paymentMethod: normalizePaymentMethod(advance.paymentMethod || ""),
          appliedAmount: Math.min(availableAmount, remainingInvoiceCapacity),
          maxAmount: availableAmount,
        },
      ];
    });
  };

  const handleAdvanceAmountChange = (advanceId, value) => {
    const normalizedId = normalizeAdvanceId(advanceId);
    const enteredAmount = Number(value) || 0;
    const remainingForThisAdvance = getRemainingAdvanceCapacity(normalizedId);

    setAppliedAdvances((prev) =>
      prev.map((a) => {
        if (normalizeAdvanceId(a.advanceId) !== normalizedId) return a;
        const maxAllowed = Math.max(
          0,
          Math.min(toNumber(a.maxAmount), remainingForThisAdvance),
        );
        const parsed = Math.min(enteredAmount, maxAllowed);
        return { ...a, appliedAmount: parsed };
      }),
    );

    if (enteredAmount > remainingForThisAdvance) {
      showError(
        `Is invoice me sirf ₹${remainingForThisAdvance.toLocaleString(
          "en-IN",
        )} advance aur apply ho sakta hai.`,
      );
    }
  };

  const totalAdvanceAdjusted = appliedAdvances.reduce(
    (sum, a) => sum + Number(a.appliedAmount || 0),
    0,
  );

  const isViewMode = editingRecord?.isViewMode;

  // View mode: show only applied advances. Create/Edit mode: merge available + applied.
  const displayAdvances = (() => {
    const map = new Map();
    const sourceRows = isViewMode ? [] : availableAdvances || [];

    sourceRows.forEach((a) => {
      map.set(normalizeAdvanceId(a.id || a._id), {
        ...a,
        id: normalizeAdvanceId(a.id || a._id),
        paymentMethod: normalizePaymentMethod(a.paymentMethod || ""),
      });
    });

    (appliedAdvances || []).forEach((ap) => {
      const advanceId = normalizeAdvanceId(ap.advanceId);
      if (map.has(advanceId)) {
        const existing = map.get(advanceId);
        map.set(advanceId, {
          ...existing,
          // preserve available fields but mark applied amounts
          appliedAmount: ap.appliedAmount,
          maxAmount: ap.maxAmount || existing.availableAmount || 0,
          receiptDate: ap.receiptDate || existing.receiptDate || null,
          paymentMethod:
            normalizePaymentMethod(ap.paymentMethod || "") ||
            normalizePaymentMethod(existing.paymentMethod || ""),
        });
      } else {
        map.set(advanceId, {
          id: advanceId,
          receiptNumber: ap.receiptNumber || "",
          receiptDate: ap.receiptDate || null,
          paymentMethod: normalizePaymentMethod(ap.paymentMethod || ""),
          amount: ap.maxAmount || ap.appliedAmount || 0,
          availableAmount: ap.maxAmount || ap.appliedAmount || 0,
          appliedAmount: ap.appliedAmount,
          maxAmount: ap.maxAmount || ap.appliedAmount || 0,
        });
      }
    });

    const extractReceiptSequence = (receiptNumber) => {
      const matched = String(receiptNumber || "").match(/(\d+)(?!.*\d)/);
      return matched ? Number(matched[1]) : 0;
    };

    return Array.from(map.values()).sort((a, b) => {
      const aDate = parseDateFlexible(a.receiptDate)?.getTime() || 0;
      const bDate = parseDateFlexible(b.receiptDate)?.getTime() || 0;

      if (aDate !== bDate) {
        return aDate - bDate;
      }

      const aSeq = extractReceiptSequence(a.receiptNumber);
      const bSeq = extractReceiptSequence(b.receiptNumber);
      if (aSeq !== bSeq) {
        return aSeq - bSeq;
      }

      return String(a.receiptNumber || "").localeCompare(
        String(b.receiptNumber || ""),
      );
    });
  })();

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
    const nextValue =
      field === "itemDescription"
        ? String(value || "").slice(0, SALES_ITEM_DESCRIPTION_MAX_LENGTH)
        : value;

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
      const advanceCapacity = getAdvanceAdjustmentCapacity();
      const totalAppliedAdvance = (appliedAdvances || []).reduce(
        (sum, a) => sum + toNumber(a.appliedAmount),
        0,
      );
      if (totalAppliedAdvance > advanceCapacity) {
        showError(
          `Advance adjust amount invoice limit se zyada hai. Max allowed: ₹${advanceCapacity.toLocaleString(
            "en-IN",
          )}.`,
        );
        return;
      }

      const overAppliedReceipt = (appliedAdvances || []).find(
        (a) => toNumber(a.appliedAmount) > toNumber(a.maxAmount),
      );
      if (overAppliedReceipt) {
        showError(
          `Receipt ${overAppliedReceipt.receiptNumber || ""} ka apply amount available advance se zyada hai.`,
        );
        return;
      }

      setSubmitting(true);
      try {
        const resolvedId = editingRecord?._id || editingRecord?.id;
        // Build submitData but do NOT include _id (MongoDB does not allow updating _id)
        const submitData = {
          ...formData,
          dueAmount: dueAmount.toFixed(2),
          items: items,
          taxData: taxData,
          id: resolvedId || Date.now(),
          createdDate: editingRecord?.createdDate || new Date().toISOString(),
          appliedAdvances: appliedAdvances
            .filter((a) => a.appliedAmount > 0)
            .map((a) => ({
              advanceId: a.advanceId,
              receiptNumber: a.receiptNumber,
              receiptDate: a.receiptDate || null,
              paymentMethod: normalizePaymentMethod(a.paymentMethod || ""),
              appliedAmount: Number(a.appliedAmount),
              maxAmount: Number(a.maxAmount),
            })),
          advanceAdjustedTotal: totalAdvanceAdjusted,
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

  const dueAmount = computeDueAmount(
    taxData.totalAmount,
    formData.amountReceived,
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
                              <div className="position-relative">
                                <input
                                  type="text"
                                  className="form-control modern-input form-control-sm"
                                  value={item.itemDescription}
                                  maxLength={SALES_ITEM_DESCRIPTION_MAX_LENGTH}
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
                              <div className="position-relative">
                                <input
                                  type="text"
                                  className="form-control modern-input"
                                  value={item.itemDescription}
                                  maxLength={SALES_ITEM_DESCRIPTION_MAX_LENGTH}
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

                        {/* Due Amount */}
                        <div className="col-md-4 mb-3">
                          <label className="form-label fw-bold">
                            <i className="fas fa-balance-scale me-2 text-secondary"></i>
                            Due Amount
                          </label>
                          <div className="input-group">
                            <span className="input-group-text bg-secondary text-white">
                              ₹
                            </span>
                            <input
                              type="text"
                              className="form-control modern-input fw-bold"
                              value={dueAmount.toLocaleString("en-IN", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                              readOnly
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

              {/* Advance Payment Adjustment Section */}
              {(displayAdvances.length > 0 || isLoadingAdvances) && (
                <div className="row mb-4">
                  <div className="col-12">
                    <div className="card shadow-sm border-0 mb-3">
                      <div className="card-header bg-white border-bottom-0 pb-0 d-flex align-items-center">
                        <i className="fa-solid fa-hand-holding-dollar me-2 text-success fs-5"></i>
                        <span className="fw-bold fs-6">
                          Advance Payment Adjustment
                        </span>
                      </div>
                      <div className="card-body pt-2">
                        {isLoadingAdvances ? (
                          <div className="text-muted small">
                            <span
                              className="spinner-border spinner-border-sm me-2"
                              role="status"
                              aria-hidden="true"
                            ></span>
                            Checking advance payments...
                          </div>
                        ) : (
                          <>
                            <div className="alert alert-info py-2 mb-3">
                              <i className="fas fa-info-circle me-2"></i>
                              This client has{" "}
                              <strong>{displayAdvances.length}</strong> advance
                              payment(s). Select advances to adjust against this
                              invoice.
                            </div>
                            <div className="advance-list">
                              <div className="advance-list-header">
                                <div className="col apply-col">Apply</div>
                                <div className="col receipt-col">
                                  Receipt No.
                                </div>
                                <div className="col date-col">Date</div>
                                <div className="col amount-col">
                                  Advance Amount
                                </div>
                                <div className="col available-col">
                                  Available
                                </div>
                                <div className="col apply-amount-col text-end">
                                  Apply Amount (₹)
                                </div>
                              </div>

                              <div className="advance-list-body">
                                {displayAdvances.map((adv) => {
                                  const normalizedId = normalizeAdvanceId(
                                    adv.id || adv._id,
                                  );
                                  const isChecked = appliedAdvances.some(
                                    (a) =>
                                      normalizeAdvanceId(a.advanceId) ===
                                      normalizedId,
                                  );
                                  const entry = appliedAdvances.find(
                                    (a) =>
                                      normalizeAdvanceId(a.advanceId) ===
                                      normalizedId,
                                  );
                                  return (
                                    <div
                                      key={normalizedId}
                                      className={`advance-item ${isChecked ? "selected" : ""}`}
                                    >
                                      <div className="col apply-col text-center">
                                        <input
                                          type="checkbox"
                                          className="form-check-input"
                                          checked={isChecked}
                                          onChange={() =>
                                            handleToggleAdvance(adv)
                                          }
                                          disabled={isViewMode}
                                        />
                                      </div>
                                      <div className="col receipt-col">
                                        <span className="badge bg-success fs-6 px-3 py-2 shadow-sm">
                                          {adv.receiptNumber}
                                        </span>
                                      </div>
                                      <div className="col date-col small">
                                        {adv.receiptDate
                                          ? `${formatDateHyphen(adv.receiptDate)}${adv.financialYear ? ` (FY ${adv.financialYear})` : ""}`
                                          : "-"}
                                      </div>
                                      <div className="col amount-col">
                                        ₹
                                        {Number(
                                          adv.amount ||
                                            adv.availableAmount ||
                                            0,
                                        ).toLocaleString("en-IN")}
                                      </div>
                                      <div className="col available-col">
                                        <span className="text-success fw-semibold">
                                          ₹
                                          {Number(
                                            adv.availableAmount || 0,
                                          ).toLocaleString("en-IN")}
                                        </span>
                                      </div>
                                      <div className="col apply-amount-col">
                                        {isChecked ? (
                                          <input
                                            type="text"
                                            inputMode="decimal"
                                            pattern="^\\d*(\\.\\d{0,2})?$"
                                            className="form-control form-control-sm modern-input text-end"
                                            max={entry?.maxAmount}
                                            value={entry?.appliedAmount ?? ""}
                                            onChange={(e) => {
                                              handleNumberInput(e);
                                              handleAdvanceAmountChange(
                                                adv.id,
                                                e.target.value,
                                              );
                                            }}
                                            placeholder="Amount"
                                            disabled={isViewMode}
                                          />
                                        ) : (
                                          <span className="text-muted small">
                                            —
                                          </span>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              {totalAdvanceAdjusted > 0 && (
                                <div className="advance-list-footer">
                                  <div className="footer-row muted">
                                    <div className="label">Invoice Total:</div>
                                    <div className="value">
                                      ₹
                                      {Number(
                                        taxData.totalAmount || 0,
                                      ).toLocaleString("en-IN")}
                                    </div>
                                  </div>

                                  <div className="footer-row">
                                    <div className="label">
                                      Total Advance Adjusted:
                                    </div>
                                    <div
                                      className={
                                        "value " +
                                        (totalAdvanceAdjusted > 0
                                          ? "text-danger fw-bold"
                                          : "fw-bold")
                                      }
                                    >
                                      {totalAdvanceAdjusted > 0
                                        ? `-₹${totalAdvanceAdjusted.toLocaleString("en-IN")}`
                                        : `₹${totalAdvanceAdjusted.toLocaleString("en-IN")}`}
                                    </div>
                                  </div>

                                  <div className="footer-row highlighted">
                                    <div className="label">
                                      Balance Due After Adjustment:
                                    </div>
                                    <div className="value">
                                      ₹
                                      {Math.max(
                                        0,
                                        Number(taxData.totalAmount || 0) -
                                          totalAdvanceAdjusted,
                                      ).toLocaleString("en-IN")}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
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

        /* Modern layout for Advance Payment list */
        .advance-list {
          border: 2px solid #e9ecef;
          border-radius: 8px;
          overflow: hidden;
          background: #ffffff;
          font-weight: 700;
          color: #000;
        }

        .advance-list-header,
        .advance-item {
          display: grid;
          grid-template-columns: 60px 1fr 180px 140px 140px 180px;
          gap: 12px;
          align-items: center;
          padding: 12px 16px;
        }

        .advance-list-header {
          background: #b6f2a8; /* header same as first row */
          border-bottom: 2px solid #f1f3f5;
          font-weight: 700;
          color: #000;
        }

        .advance-list-body .advance-item {
          border: 1px solid #f6f7f8;
          transition: background .15s ease, box-shadow .15s ease;
        }

        .advance-list-body .advance-item.selected {
          background: rgba(13, 253, 109, 0.03);
        }

        .advance-item .badge {
          border-radius: 6px;
        }

        .advance-list-footer {
          padding: 0px 12px 16px;
        }

        .advance-list-footer .footer-row {
          display: grid;
          grid-template-columns: 60px 1fr 160px 140px 140px 180px;
          gap: 12px;
          align-items: center;
          padding: 8px 16px;
          border-top: 2px solid #f1f3f5;
        }

        .advance-list-footer .footer-row .label {
          grid-column: 1 / 6; /* span first five columns so label lines up with body */
          align-self: center;
          color: #000;
          font-weight: 600;
        }

        .advance-list-footer .footer-row .value {
          grid-column: 6 / 7; /* put value into last column to align with Apply Amount */
          text-align: right;
          align-self: center;
          font-weight: 600;
        }

        .advance-list-footer .footer-row.muted .label,
        .advance-list-footer .footer-row.muted .value {
          color: #000;
        }

        .advance-list-footer .footer-row.highlighted {
          background: #b6f2a8;
          font-weight: 700;
          padding: 10px 16px;
          border-radius: 6px;
          margin-top: 8px;
        }

        /* Right-align apply amount inputs */
        .advance-item input.modern-input,
        .advance-item input.text-end {
          text-align: right;
          border-radius: 6px;
          padding: .325rem .5rem;
        }
      `}</style>
    </div>
  );
};

export default CreateSales;
