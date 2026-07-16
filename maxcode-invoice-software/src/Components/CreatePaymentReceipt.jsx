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

const ADVANCE_REFERENCE_INVOICE_NUMBER =
  "Advance Payment (Final Invoice Not Generated)";

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
  againstType: "",
  invoiceId: "",
  invoiceNumber: "",
  invoiceIds: [],
  invoiceNumbers: [],
  debitNoteId: "",
  debitNoteNumber: "",
  financialYear: "",
};

const againstTypeOptions = [
  { value: "invoice", label: "Invoice" },
  { value: "debit_note", label: "Debit Note" },
];

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

  useEffect(() => {
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
  const [debitNoteOptions, setDebitNoteOptions] = useState([]);
  const [isDebitNoteLoading, setIsDebitNoteLoading] = useState(false);

  const toNumber = (value) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const getInvoiceDueAmount = (invoice) => {
    const totalAmount = toNumber(
      invoice?.taxData?.totalAmount || invoice?.totalAmount || 0,
    );
    const amountReceived = toNumber(invoice?.amountReceived || 0);
    const tdsAmount = toNumber(invoice?.tdsAmount || 0);
    return Math.max(0, totalAmount - amountReceived - tdsAmount);
  };

  const clientSearchDebounceRef = useRef(null);
  const clientAbortControllerRef = useRef(null);
  const knownClientRowsRef = useRef([]);

  useEffect(() => {
    document.body.style.overflow = show ? "hidden" : "auto";
    return () => {
      document.body.style.overflow = "auto";
    };
  }, [show]);

  // Init form - FIXED for editing mode
  useEffect(() => {
    if (!show) return;

    if (editingRecord) {
      // Extract invoice allocations properly
      const invoiceAllocations = editingRecord.invoiceAllocations || [];
      const invoiceIdsFromAllocations = invoiceAllocations
        .map((alloc) => alloc.invoiceId)
        .filter(Boolean);
      const invoiceNumbersFromAllocations = invoiceAllocations
        .map((alloc) => alloc.invoiceNumber)
        .filter(Boolean);
      const totalAllocatedAmount = invoiceAllocations.reduce(
        (sum, alloc) => sum + toNumber(alloc.amount || 0),
        0,
      );

      // Determine againstType from allocations
      let againstTypeValue = editingRecord.againstType || "";
      if (!againstTypeValue && invoiceAllocations.length > 0) {
        againstTypeValue = "invoice";
      }

      setFormData({
        ...emptyForm,
        ...editingRecord,
        amount:
          editingRecord.amount !== undefined
            ? String(editingRecord.amount)
            : totalAllocatedAmount > 0
              ? String(totalAllocatedAmount)
              : "",
        clientRefId: editingRecord.clientRefId || editingRecord.clientId || "",
        clientId: editingRecord.clientId || editingRecord.clientRefId || "",
        clientName: editingRecord.clientName || "",
        businessName: editingRecord.businessName || "",
        phoneNumber: editingRecord.phoneNumber || "",
        email: editingRecord.email || "",
        address: editingRecord.address || "",
        paymentType: editingRecord.paymentType || defaultPaymentType,
        againstType: againstTypeValue,
        invoiceId: editingRecord.invoiceId || "",
        invoiceNumber: editingRecord.invoiceNumber || "",
        invoiceIds:
          invoiceIdsFromAllocations.length > 0
            ? invoiceIdsFromAllocations
            : Array.isArray(editingRecord.invoiceIds) &&
                editingRecord.invoiceIds.length > 0
              ? editingRecord.invoiceIds
              : editingRecord.invoiceId
                ? [editingRecord.invoiceId]
                : [],
        invoiceNumbers:
          invoiceNumbersFromAllocations.length > 0
            ? invoiceNumbersFromAllocations
            : Array.isArray(editingRecord.invoiceNumbers) &&
                editingRecord.invoiceNumbers.length > 0
              ? editingRecord.invoiceNumbers
              : editingRecord.invoiceNumber
                ? [editingRecord.invoiceNumber]
                : [],
        debitNoteId: editingRecord.debitNoteId || "",
        debitNoteNumber: editingRecord.debitNoteNumber || "",
        financialYear:
          editingRecord.financialYear ||
          defaultFinancialYear?.financialYear ||
          "",
        purpose:
          editingRecord.purpose ||
          (invoiceNumbersFromAllocations.length > 0
            ? `Against Invoice ${invoiceNumbersFromAllocations.join(", ")}`
            : ""),
      });
      setErrors({});
    } else {
      const today = new Date();
      const dateStr = today.toISOString().split("T")[0];
      setFormData({
        ...emptyForm,
        paymentType: defaultPaymentType,
        receiptDate: dateStr,
        financialYear: defaultFinancialYear?.financialYear || "",
        againstType: "",
      });
      setErrors({});
      generateReceiptNumber(null, defaultFinancialYear);
    }
  }, [editingRecord, show, defaultPaymentType, defaultFinancialYear]);

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

  // Fetch invoices when client is selected and againstType is "invoice"
  useEffect(() => {
    if (
      !formData.clientRefId ||
      formData.paymentType !== "regular" ||
      formData.againstType !== "invoice"
    ) {
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
        let clientInvoices = all
          .filter(
            (inv) =>
              inv.clientRefId === formData.clientRefId ||
              inv.clientId === formData.clientId,
          )
          .map((inv) => ({
            value: inv._id || inv.id,
            dueAmount: getInvoiceDueAmount(inv),
            totalAmount: toNumber(
              inv.taxData?.totalAmount || inv.totalAmount || 0,
            ),
            currentReceivedAmount: toNumber(inv.amountReceived || 0),
            label: `${inv.invoiceNumber} — Due ₹${getInvoiceDueAmount(inv).toLocaleString("en-IN")} / Total ₹${toNumber(inv.taxData?.totalAmount || inv.totalAmount || 0).toLocaleString("en-IN")}`,
            invoiceNumber: inv.invoiceNumber,
          }));
        // Sort by invoiceNumber ascending
        clientInvoices = clientInvoices.sort((a, b) =>
          (a.invoiceNumber || "").localeCompare(b.invoiceNumber || ""),
        );

        // For editing mode, ensure selected invoices are included even if fully paid
        if (editingRecord && formData.paymentType === "regular") {
          const selectedIds = Array.isArray(formData.invoiceIds)
            ? formData.invoiceIds
            : formData.invoiceId
              ? [formData.invoiceId]
              : [];
          const selectedNumbers = Array.isArray(formData.invoiceNumbers)
            ? formData.invoiceNumbers
            : formData.invoiceNumber
              ? [formData.invoiceNumber]
              : [];

          const existingKeys = new Set(
            clientInvoices.map(
              (option) =>
                `${String(option.value)}::${String(option.invoiceNumber || "")}`,
            ),
          );

          const fallbackOptions = selectedIds.map((id, index) => {
            const invoiceNumber = selectedNumbers[index] || "";
            const key = `${String(id)}::${String(invoiceNumber)}`;
            if (existingKeys.has(key)) return null;

            return {
              value: id,
              dueAmount: 0,
              totalAmount: 0,
              currentReceivedAmount: 0,
              label: invoiceNumber
                ? `${invoiceNumber} — Due ₹0 / Total ₹0`
                : `Invoice ${id}`,
              invoiceNumber,
            };
          });

          const sortedFallback = fallbackOptions
            .filter(Boolean)
            .sort((a, b) =>
              (a.invoiceNumber || "").localeCompare(b.invoiceNumber || ""),
            );
          setInvoiceOptions([...clientInvoices, ...sortedFallback]);
        } else {
          setInvoiceOptions(clientInvoices);
        }
      } catch (err) {
        console.error("Failed to fetch invoices:", err);
      } finally {
        setIsInvoiceLoading(false);
      }
    };
    fetchInvoices();
  }, [
    formData.clientRefId,
    formData.paymentType,
    formData.againstType,
    editingRecord,
  ]);

  // Fetch debit notes when client is selected and againstType is "debit_note"
  useEffect(() => {
    if (
      !formData.clientRefId ||
      formData.paymentType !== "regular" ||
      formData.againstType !== "debit_note"
    ) {
      setDebitNoteOptions([]);
      return;
    }

    const fetchDebitNotes = async () => {
      setIsDebitNoteLoading(true);
      try {
        const url = `${API_ENDPOINTS.PAYMENT_RECEIPTS.LIST}?action=available-debit-notes&clientRefId=${encodeURIComponent(formData.clientRefId)}`;
        const res = await apiGet(url);
        const all =
          res?.data?.records ||
          res?.data?.data ||
          (Array.isArray(res?.data) ? res.data : []);
        const options = all.map((note) => ({
          value: note.id || note.noteId,
          noteNumber: note.noteNumber || "",
          dueAmount: toNumber(note.dueAmount || 0),
          totalAmount: toNumber(note.totalAmount || 0),
          receivedAmount: toNumber(note.receivedAmount || 0),
          label: `${note.noteNumber} — Due ₹${toNumber(note.dueAmount || 0).toLocaleString("en-IN")} / Total ₹${toNumber(note.totalAmount || 0).toLocaleString("en-IN")}`,
        }));
        setDebitNoteOptions(options);
      } catch (err) {
        console.error("Failed to fetch debit notes:", err);
        setDebitNoteOptions([]);
      } finally {
        setIsDebitNoteLoading(false);
      }
    };

    fetchDebitNotes();
  }, [
    formData.clientRefId,
    formData.paymentType,
    formData.againstType,
    editingRecord,
  ]);

  // FIXED: Auto-fill amount when invoice selection changes
  useEffect(() => {
    if (
      formData.paymentType !== "regular" ||
      formData.againstType !== "invoice"
    )
      return;

    const selectedIds = Array.isArray(formData.invoiceIds)
      ? formData.invoiceIds
      : formData.invoiceId
        ? [formData.invoiceId]
        : [];

    if (selectedIds.length === 0) return;

    const optionIdSet = new Set(
      invoiceOptions.map((option) => String(option.value)),
    );
    const validSelectedIds = selectedIds.filter((id) =>
      optionIdSet.has(String(id)),
    );

    const selectedOptions = invoiceOptions.filter((option) =>
      validSelectedIds.includes(String(option.value)),
    );

    const dueTotal = selectedOptions.reduce(
      (sum, option) => sum + toNumber(option.dueAmount || 0),
      0,
    );

    // Only update amount if it's editing mode or the amount hasn't been manually set
    if (dueTotal > 0) {
      setFormData((prev) => ({
        ...prev,
        invoiceIds: validSelectedIds,
        invoiceNumbers: selectedOptions.map((option) => option.invoiceNumber),
        invoiceId: validSelectedIds[0] || "",
        invoiceNumber: selectedOptions[0]?.invoiceNumber || "",
        amount: String(dueTotal),
        purpose:
          selectedOptions.length > 0
            ? `Against Invoice ${selectedOptions.map((opt) => opt.invoiceNumber).join(", ")}`
            : prev.purpose,
      }));
    }
  }, [invoiceOptions, formData.invoiceIds, formData.invoiceId]);

  // Auto-fill financial year and receipt number
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
        invoiceId: "",
        invoiceNumber: "",
        invoiceIds: [],
        invoiceNumbers: [],
        debitNoteId: "",
        debitNoteNumber: "",
        againstType: "",
        amount: prev.paymentType === "regular" ? "" : prev.amount,
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
      invoiceId: "",
      invoiceNumber: "",
      invoiceIds: [],
      invoiceNumbers: [],
      debitNoteId: "",
      debitNoteNumber: "",
      againstType: "",
      amount: prev.paymentType === "regular" ? "" : prev.amount,
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
      againstType: "",
      invoiceId: "",
      invoiceNumber: "",
      invoiceIds: [],
      invoiceNumbers: [],
      debitNoteId: "",
      debitNoteNumber: "",
      amount: "",
      purpose: type === "advance" ? "Advance Payment" : "",
    }));
  };

  const handleAgainstTypeSelect = (selectedOption) => {
    const selectedValue = selectedOption?.value || "";
    setFormData((prev) => ({
      ...prev,
      againstType: selectedValue,
      invoiceId: "",
      invoiceNumber: "",
      invoiceIds: [],
      invoiceNumbers: [],
      debitNoteId: "",
      debitNoteNumber: "",
      amount: editingRecord ? prev.amount : "",
      purpose: "",
    }));
  };

  // FIXED: Completely rewritten invoice selection handler for better multi-select performance
  const handleInvoiceSelectionChange = (selectedOptions) => {
    const normalizedSelection = Array.isArray(selectedOptions)
      ? selectedOptions
      : selectedOptions
        ? [selectedOptions]
        : [];

    // Sort selection by invoiceNumber ascending
    const sortedSelection = [...normalizedSelection].sort((a, b) =>
      (a.invoiceNumber || "").localeCompare(b.invoiceNumber || ""),
    );

    const invoiceIds = sortedSelection.map((option) => option.value);
    const invoiceNumbers = sortedSelection.map(
      (option) => option.invoiceNumber,
    );
    const dueTotal = sortedSelection.reduce(
      (sum, option) => sum + toNumber(option.dueAmount || 0),
      0,
    );

    // Prepare note string
    let note = "";
    if (sortedSelection.length > 0) {
      note = sortedSelection
        .map(
          (opt) =>
            `₹${toNumber(opt.dueAmount || 0).toLocaleString("en-IN")} paid against Invoice ${opt.invoiceNumber}`,
        )
        .join(", ");
    }

    setFormData((prev) => ({
      ...prev,
      invoiceIds: invoiceIds,
      invoiceNumbers: invoiceNumbers,
      invoiceId: invoiceIds[0] || "",
      invoiceNumber: invoiceNumbers[0] || "",
      amount: dueTotal > 0 ? String(dueTotal) : prev.amount,
      purpose:
        invoiceNumbers.length > 0
          ? `Against Invoice ${invoiceNumbers.join(", ")}`
          : prev.paymentType === "advance"
            ? "Advance Payment"
            : "",
      note: note,
    }));
  };

  const handleDebitNoteSelectionChange = (selectedOption) => {
    if (!selectedOption) {
      setFormData((prev) => ({
        ...prev,
        debitNoteId: "",
        debitNoteNumber: "",
        amount: "",
        purpose: "",
        note: "",
      }));
      return;
    }

    // Prepare note string
    let note = "";
    if (selectedOption.noteNumber) {
      note = `₹${toNumber(selectedOption.dueAmount || 0).toLocaleString("en-IN")} paid against Debit Note ${selectedOption.noteNumber}`;
    }

    setFormData((prev) => ({
      ...prev,
      debitNoteId: selectedOption.value,
      debitNoteNumber: selectedOption.noteNumber || "",
      amount:
        toNumber(selectedOption.dueAmount || 0) > 0
          ? String(toNumber(selectedOption.dueAmount || 0))
          : "",
      purpose: selectedOption.noteNumber
        ? `Against Debit Note ${selectedOption.noteNumber}`
        : "Against Debit Note",
      note: note,
    }));
  };

  const validate = () => {
    const errs = {};
    if (!formData.clientName && !formData.clientRefId)
      errs.clientName = "Client is required";
    if (!formData.receiptDate) errs.receiptDate = "Receipt date is required";

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

    if (formData.paymentType === "regular" && !formData.againstType) {
      errs.againstType = "Please select Against Type";
    }

    if (
      formData.paymentType === "regular" &&
      formData.againstType === "debit_note" &&
      !formData.debitNoteId
    ) {
      errs.amount = errs.amount || "Please select a debit note";
    }

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
      }
    }

    try {
      const normalizedInvoiceIds = Array.isArray(formData.invoiceIds)
        ? formData.invoiceIds
        : formData.invoiceId
          ? [formData.invoiceId]
          : [];

      const normalizedInvoiceNumbers = Array.isArray(formData.invoiceNumbers)
        ? formData.invoiceNumbers
        : formData.invoiceNumber
          ? [formData.invoiceNumber]
          : [];

      const computedReferenceInvoiceNumber =
        normalizedInvoiceNumbers.length > 0
          ? normalizedInvoiceNumbers.join(", ")
          : formData.paymentType === "advance"
            ? ADVANCE_REFERENCE_INVOICE_NUMBER
            : formData.referenceInvoiceNumber || "";

      const payload = {
        ...formData,
        amount: Number(formData.amount),
        invoiceIds: normalizedInvoiceIds,
        invoiceNumbers: normalizedInvoiceNumbers,
        invoiceId: normalizedInvoiceIds[0] || "",
        invoiceNumber: normalizedInvoiceNumbers[0] || "",
        referenceInvoiceNumber: computedReferenceInvoiceNumber,
        againstType: formData.againstType || "",
        debitNoteId: formData.debitNoteId || "",
        debitNoteNumber: formData.debitNoteNumber || "",
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
        const createdRecords = Array.isArray(res?.data?.createdRecords)
          ? res.data.createdRecords
          : [res?.data].filter(Boolean);

        const regularRecord =
          createdRecords.find(
            (record) => String(record?.paymentType || "") !== "advance",
          ) || null;
        const autoAdvanceRecord =
          createdRecords.find(
            (record) => String(record?.paymentType || "") === "advance",
          ) || null;

        if (formData.paymentType === "advance") {
          showSuccess("Advance payment receipt created successfully!");
        } else if (regularRecord && autoAdvanceRecord) {
          const allocatedInvoiceCount = Array.isArray(
            regularRecord.invoiceAllocations,
          )
            ? regularRecord.invoiceAllocations.length
            : 0;
          showSuccess(
            `Regular receipt ₹${toNumber(regularRecord.amount).toLocaleString("en-IN")} saved for ${allocatedInvoiceCount || 1} invoice(s), and extra ₹${toNumber(autoAdvanceRecord.amount).toLocaleString("en-IN")} auto-moved to advance (${autoAdvanceRecord.receiptNumber || "New Advance Receipt"}).`,
          );
        } else {
          showSuccess("Payment receipt created successfully!");
        }
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
  const calmSelectStyles = {
    ...selectStyles,
    control: (base, state) => ({
      ...selectStyles.control(base, state),
      border: "2px solid #e9ecef",
      borderColor: "#e9ecef",
      boxShadow: "none",
      "&:hover": {
        borderColor: "#e9ecef",
      },
    }),
    valueContainer: (base, state) => ({
      ...selectStyles.valueContainer(base, state),
      overflowX: "hidden",
    }),
    // FIXED: Improved menu and option styles for better multi-select interaction
    menu: (base) => ({
      ...base,
      zIndex: 9999,
      maxHeight: "300px",
      overflowY: "auto",
    }),
    option: (base, state) => ({
      ...base,
      cursor: "pointer",
      padding: "8px 12px",
      backgroundColor: state.isSelected
        ? "#d4edda"
        : state.isFocused
          ? "#f0f8ff"
          : "white",
      color: "#333",
      "&:active": {
        backgroundColor: "#c8e6d9",
      },
    }),
  };

  const clientSelectComponents = {
    LoadingIndicator: () => <SelectRightLoader />,
    IndicatorSeparator: null,
    ClearIndicator: null,
  };

  const invoiceSelectComponents = {
    IndicatorSeparator: null,
    ClearIndicator: null,
    // FIXED: Add custom Option component for better click handling
    Option: (props) => {
      const { innerRef, innerProps, isSelected, data, isFocused } = props;
      return (
        <div
          ref={innerRef}
          {...innerProps}
          style={{
            padding: "10px 12px",
            cursor: "pointer",
            backgroundColor: isSelected
              ? "#d4edda"
              : isFocused
                ? "#f0f8ff"
                : "white",
            borderBottom: "1px solid #f0f0f0",
            transition: "all 0.2s ease",
          }}
          className="invoice-option"
        >
          <div style={{ display: "flex", alignItems: "center" }}>
            <input
              type="checkbox"
              checked={isSelected}
              readOnly
              style={{
                marginRight: "10px",
                cursor: "pointer",
                width: "16px",
                height: "16px",
              }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500, fontSize: "14px" }}>
                {data.label}
              </div>
              {data.dueAmount > 0 && data.totalAmount > 0 && (
                <div
                  style={{
                    fontSize: "11px",
                    color: "#666",
                    marginTop: "2px",
                  }}
                >
                  Due: ₹{data.dueAmount.toLocaleString("en-IN")}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    },
    MultiValue: (props) => {
      const { data, removeProps, children } = props;
      return (
        <div
          style={{
            backgroundColor: "#e9ecef",
            borderRadius: "4px",
            display: "inline-flex",
            alignItems: "center",
            margin: "2px",
            padding: "2px 6px",
            fontSize: "12px",
          }}
        >
          <span>{children}</span>
          <span
            {...removeProps}
            style={{
              marginLeft: "6px",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: "bold",
              color: "#666",
            }}
          >
            ×
          </span>
        </div>
      );
    },
  };

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

  const selectedInvoiceIds = Array.isArray(formData.invoiceIds)
    ? formData.invoiceIds
    : formData.invoiceId
      ? [formData.invoiceId]
      : [];

  // Always show selected invoices sorted by invoiceNumber ascending
  const selectedInvoiceOptions = invoiceOptions
    .filter((option) =>
      selectedInvoiceIds.map((id) => String(id)).includes(String(option.value)),
    )
    .sort((a, b) =>
      (a.invoiceNumber || "").localeCompare(b.invoiceNumber || ""),
    );

  const selectedDebitNoteOption = debitNoteOptions.find(
    (option) => String(option.value) === String(formData.debitNoteId || ""),
  );

  const selectedAgainstTypeOption = againstTypeOptions.find(
    (option) => option.value === formData.againstType,
  );

  if (!show) return null;

  return (
    <>
      <div
        className="modal-backdrop fade show"
        style={{ zIndex: 1040 }}
        onClick={onClose}
      />
      <div
        className="modal fade show d-block"
        tabIndex="-1"
        style={{ zIndex: 1050 }}
        role="dialog"
      >
        <div className="modal-dialog modal-lg modal-dialog-scrollable modal-dialog-centered">
          <div className="modal-content">
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
            <div>
              <div
                className="modal-body"
                style={{ maxHeight: "65vh", overflowY: "auto" }}
              >
                <form onSubmit={handleSubmit} noValidate>
                  <div className="row g-3">
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
                          isClearable={false}
                          styles={calmSelectStyles}
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
                          components={clientSelectComponents}
                          isDisabled={readOnly}
                        />
                      </div>
                      {errors.clientName && (
                        <div className="text-danger small mt-1">
                          {errors.clientName}
                        </div>
                      )}
                    </div>

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

                    {formData.paymentType === "regular" && (
                      <div className="col-md-6">
                        <label className="form-label">
                          <i className="fas fa-link me-2 text-primary"></i>
                          Against Type <span className="text-danger">*</span>
                        </label>
                        <Select
                          options={againstTypeOptions}
                          value={selectedAgainstTypeOption || null}
                          onChange={handleAgainstTypeSelect}
                          isClearable={true}
                          placeholder="Select Against Type"
                          styles={calmSelectStyles}
                          isDisabled={readOnly}
                          classNamePrefix="react-select"
                        />
                        {errors.againstType && (
                          <div className="text-danger small mt-1">
                            {errors.againstType}
                          </div>
                        )}
                      </div>
                    )}

                    {formData.paymentType === "regular" &&
                      formData.againstType === "invoice" && (
                        <div className="col-md-6">
                          <label className="form-label">
                            <i className="fas fa-file-invoice-dollar me-2 text-primary"></i>
                            Against Invoice{" "}
                            <span className="text-muted small">
                              (Optional, Multi Select)
                            </span>
                          </label>
                          <Select
                            options={invoiceOptions}
                            value={selectedInvoiceOptions}
                            onChange={handleInvoiceSelectionChange}
                            isMulti={true}
                            closeMenuOnSelect={false}
                            hideSelectedOptions={false}
                            isLoading={isInvoiceLoading}
                            isClearable={false}
                            placeholder={
                              formData.clientRefId
                                ? "Select due invoice(s)"
                                : "Select a client first"
                            }
                            isDisabled={!formData.clientRefId || readOnly}
                            styles={{
                              ...calmSelectStyles,
                              menu: (base) => ({
                                ...base,
                                zIndex: 9999,
                                maxHeight: "300px",
                                overflowY: "auto",
                              }),
                            }}
                            components={invoiceSelectComponents}
                            noOptionsMessage={() =>
                              isInvoiceLoading
                                ? "Loading..."
                                : formData.clientRefId
                                  ? "No due invoices found for this client"
                                  : "Select a client first"
                            }
                          />
                          {selectedInvoiceOptions.length > 0 && (
                            <div className="form-text mt-1">
                              Total selected due amount: ₹
                              {selectedInvoiceOptions
                                .reduce(
                                  (sum, option) =>
                                    sum + toNumber(option.dueAmount || 0),
                                  0,
                                )
                                .toLocaleString("en-IN")}
                            </div>
                          )}
                        </div>
                      )}

                    {formData.paymentType === "regular" &&
                      formData.againstType === "debit_note" && (
                        <div className="col-md-6">
                          <label className="form-label">
                            <i className="fas fa-file-invoice-dollar me-2 text-primary"></i>
                            Debit Note Number{" "}
                            <span className="text-danger">*</span>
                          </label>
                          <Select
                            options={debitNoteOptions}
                            value={selectedDebitNoteOption || null}
                            onChange={handleDebitNoteSelectionChange}
                            isMulti={false}
                            isLoading={isDebitNoteLoading}
                            isClearable={false}
                            placeholder={
                              formData.clientRefId
                                ? "Select due debit note"
                                : "Select a client first"
                            }
                            isDisabled={!formData.clientRefId || readOnly}
                            styles={calmSelectStyles}
                            components={invoiceSelectComponents}
                            noOptionsMessage={() =>
                              isDebitNoteLoading
                                ? "Loading..."
                                : formData.clientRefId
                                  ? "No due debit notes found for this client"
                                  : "Select a client first"
                            }
                          />
                        </div>
                      )}

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
        
        .invoice-option:hover {
          background-color: #f0f8ff !important;
        }
      `}</style>
      </div>
    </>
  );
};

export default CreatePaymentReceipt;
