import React, { useEffect, useMemo, useRef, useState } from "react";
import ReusableTable from "../Components/ReusableTable";
import ConfirmationModal from "../Components/ConfirmationModal";
import CreateCreditDebitNote from "../Components/CreateCreditDebitNote";
import CreditDebitNotePreview from "../Components/CreditDebitNotePreview";
import {
  showSuccess,
  showError,
  showInfo,
} from "../Components/ToastNotification";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { apiDelete, apiGet, apiPost, apiPut } from "../utils/api";
import { hasActionPermission } from "../utils/permissions";
import { fetchAllPaginatedEntities } from "../utils/fetchAllEntities";

const CreditDebitNotesManagement = () => {
  const moduleKey = "creditDebitNotesManagement";
  const canCreate = hasActionPermission(moduleKey, "create");

  const [serverSide, setServerSide] = useState(true);
  const [prefLoading, setPrefLoading] = useState(true);
  const [dynamicFilterOptions, setDynamicFilterOptions] = useState({});
  const [invoiceOptions, setInvoiceOptions] = useState([]);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [showNotePreview, setShowNotePreview] = useState(false);
  const [notePreviewRecord, setNotePreviewRecord] = useState(null);
  const [activeCardFilter, setActiveCardFilter] = useState("total");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [noteToDelete, setNoteToDelete] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(10);
  const [filters, setFilters] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState(null);
  const [sortDirection, setSortDirection] = useState("normal");
  const [statistics, setStatistics] = useState({
    total: 0,
    creditNotes: 0,
    debitNotes: 0,
    pending: 0,
    approved: 0,
  });

  const debounceTimeoutRef = useRef(null);
  const debounceColumnTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null);

  const columnsWithDateFilter = ["noteDateTime", "createdDateTime"];

  useEffect(() => {
    document.title = "Credit/Debit Notes | MaxCode IT Services";

    const fetchPreference = async () => {
      try {
        const res = await apiGet("/user-preferences");
        if (
          typeof res.data?.creditDebitNotesManagementServerSide === "boolean"
        ) {
          setServerSide(res.data.creditDebitNotesManagementServerSide);
        }
      } catch {
        // keep default mode
      } finally {
        setPrefLoading(false);
      }
    };

    fetchPreference();
  }, []);

  useEffect(() => {
    const fetchInvoices = async () => {
      setInvoiceLoading(true);
      try {
        const response = await fetchAllPaginatedEntities({
          endpoint: API_ENDPOINTS.INVOICES.LIST,
          fallbackKeys: ["data"],
          pageSize: 100,
          fetchAll: true,
          queryParams: { includeDebug: "false" },
          forceRefresh: true,
        });

        const invoices = Array.isArray(response)
          ? response
          : response?.data || [];

        const normalizedInvoices = invoices
          .filter((invoice) => invoice && invoice.isDeleted !== true)
          .map((invoice) => ({
            ...invoice,
            value: invoice._id || invoice.id || invoice.invoiceNumber,
            label:
              `${invoice.clientName || invoice.businessName || "Unknown Client"} - ${invoice.invoiceNumber || ""}`.trim(),
          }))
          .filter((invoice) => Boolean(invoice.value));

        setInvoiceOptions(normalizedInvoices);
      } catch (error) {
        console.error("Failed to fetch invoices:", error);
        setInvoiceOptions([]);
      } finally {
        setInvoiceLoading(false);
      }
    };

    fetchInvoices();
  }, []);

  useEffect(() => {
    if (prefLoading) return;

    const savePreference = async () => {
      try {
        await apiPost("/user-preferences", {
          creditDebitNotesManagementServerSide: serverSide,
        });
      } catch {
        // ignore preference write failures
      }
    };

    savePreference();
  }, [serverSide, prefLoading]);

  const formatDateTimeForDisplay = (dateValue) => {
    if (!dateValue) return "";

    try {
      const date = new Date(dateValue);
      if (Number.isNaN(date.getTime())) return dateValue;

      const day = String(date.getDate()).padStart(2, "0");
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const year = date.getFullYear();
      let hours = date.getHours();
      const minutes = String(date.getMinutes()).padStart(2, "0");
      const seconds = String(date.getSeconds()).padStart(2, "0");
      const ampm = hours >= 12 ? "PM" : "AM";

      hours = hours % 12;
      hours = hours || 12;

      return `${day}-${month}-${year} | ${String(hours).padStart(2, "0")}:${minutes}:${seconds} ${ampm}`;
    } catch {
      return dateValue;
    }
  };

  const resolveAmountCalculationStatus = (note = {}) => {
    const noteType = String(note?.noteType || "")
      .trim()
      .toLowerCase();

    if (noteType === "credit note") {
      const explicit = String(note?.refundStatus || "").trim();
      if (explicit) return explicit;

      const total = Number(note?.totalAmount || note?.amount || 0);
      const refunded = Number(note?.refundAmount || 0);
      if (refunded > 0 && total > 0) {
        return refunded >= total ? "Full Refund" : "Partial Refund";
      }
      return "Pending";
    }

    if (noteType === "debit note") {
      const explicit = String(note?.paymentStatus || "").trim();
      if (explicit) return explicit;

      const total = Number(note?.totalAmount || note?.amount || 0);
      const received = Number(note?.receivedAmount || 0);
      if (received <= 0) return "Unpaid";
      if (total > 0 && received >= total) return "Paid";
      return "Partial";
    }

    return String(note?.status || "").trim() || "-";
  };

  const fetchNotes = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (prefLoading) return;
    setLoading(true);

    try {
      let url = API_ENDPOINTS.CREDIT_DEBIT_NOTES.LIST;
      const params = new URLSearchParams();

      if (serverSide) {
        params.append("page", currentPage);
        params.append("limit", recordsPerPage);

        if (searchTerm) {
          params.append("search", searchTerm);
        }

        Object.entries(filters).forEach(([key, value]) => {
          if (["sn", "action"].includes(key)) return;
          if (
            value === undefined ||
            value === null ||
            value === "" ||
            value === "All"
          ) {
            return;
          }

          if (columnsWithDateFilter.includes(key)) {
            if (value && typeof value === "object") {
              if (value.startDate) {
                const backendKey =
                  key === "noteDateTime" ? "noteDate" : "createdAt";
                params.append(`${backendKey}_start`, value.startDate);
              }
              if (value.endDate) {
                const backendKey =
                  key === "noteDateTime" ? "noteDate" : "createdAt";
                params.append(`${backendKey}_end`, value.endDate);
              }
            }
            return;
          }

          if (Array.isArray(value) && value.length > 0) {
            params.append(key, value.join(","));
          } else if (!Array.isArray(value)) {
            params.append(key, value);
          }
        });

        if (sortField && sortDirection !== "normal") {
          params.append("sortBy", sortField);
          params.append(
            "sortOrder",
            sortDirection === "ascending" ? "asc" : "desc",
          );
        }

        if (
          activeCardFilter &&
          activeCardFilter !== "total" &&
          activeCardFilter !== "addNew"
        ) {
          params.append("filter", activeCardFilter);
        }

        url = `${url}?${params.toString()}`;
      }

      const response = await apiGet(url, {
        signal: controller.signal,
      });

      let noteData;
      let total;

      if (serverSide) {
        noteData = response.data?.data || response.data?.notes || [];
        total =
          response.data?.pagination?.totalRecords ||
          response.data?.total ||
          noteData.length;

        if (response.data?.statistics) {
          setStatistics(response.data.statistics);
        }
        if (response.data?.filterOptions) {
          setDynamicFilterOptions(response.data.filterOptions);
        }
      } else {
        noteData =
          response.data?.data ||
          response.data?.notes ||
          (Array.isArray(response.data) ? response.data : []);
        total = noteData.length;
      }

      const mappedData = noteData.map((note) => {
        const amount = Number(note.amount || 0);
        const taxAmount = Number(note.taxAmount || 0);
        const totalAmount = Number(note.totalAmount || amount + taxAmount);

        return {
          ...note,
          id: note._id || note.id,
          amountCalculationStatus: resolveAmountCalculationStatus(note),
          referenceNumber:
            note.referenceNumber ||
            note.referenceInvoiceNo ||
            note.invoiceNumber ||
            note.invoiceNo ||
            "",
          amount,
          taxAmount,
          totalAmount,
          noteDateTime: note.noteDate || note.noteDateTime || note.createdAt,
          createdDateTime: note.createdAt || note.createdDateTime,
        };
      });

      setRecords(mappedData);
      setTotalRecords(total);

      if (!serverSide) {
        updateStatistics(mappedData);
      }
    } catch (error) {
      if (error.name === "CanceledError" || error.name === "AbortError") {
        return;
      }

      console.error("Failed to fetch notes:", error);
      showError("Failed to fetch notes");
      setRecords([]);
      setTotalRecords(0);
      updateStatistics([]);
    } finally {
      setLoading(false);
    }
  };

  const updateStatistics = (data) => {
    const stats = {
      total: data.filter((record) => record.isDeleted !== true).length,
      creditNotes: data.filter((record) => record.noteType === "Credit Note")
        .length,
      debitNotes: data.filter((record) => record.noteType === "Debit Note")
        .length,
      pending: data.filter((record) => record.status === "Pending").length,
      approved: data.filter((record) => record.status === "Approved").length,
    };

    setStatistics(stats);
  };

  useEffect(() => {
    if (prefLoading) return;

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(
      () => {
        fetchNotes();
      },
      serverSide ? 500 : 0,
    );

    return () => clearTimeout(debounceTimeoutRef.current);
  }, [
    serverSide,
    currentPage,
    recordsPerPage,
    searchTerm,
    filters,
    sortField,
    sortDirection,
    activeCardFilter,
    prefLoading,
  ]);

  const cards = [
    {
      icon: "fa-solid fa-file-invoice",
      title: "Total Notes",
      key: "total",
      color: "primary",
      count: statistics.total,
    },
    {
      icon: "fa-solid fa-circle-arrow-up",
      title: "Credit Notes",
      key: "credit",
      color: "success",
      count: statistics.creditNotes,
    },
    {
      icon: "fa-solid fa-circle-arrow-down",
      title: "Debit Notes",
      key: "debit",
      color: "warning",
      count: statistics.debitNotes,
    },
    {
      icon: "fa-solid fa-clock",
      title: "Pending",
      key: "pending",
      color: "info",
      count: statistics.pending,
    },
    {
      icon: "fa-solid fa-circle-check",
      title: "Approved",
      key: "approved",
      color: "success",
      count: statistics.approved,
    },
    {
      icon: "fas fa-plus-circle",
      title: "Add New Note",
      key: "addNew",
      color: "success",
    },
  ];

  const getCardNumber = (index) => (index % 8) + 1;

  const preparedData = useMemo(() => {
    const invoiceNumberById = new Map(
      invoiceOptions
        .filter((invoice) => invoice?.value)
        .map((invoice) => [String(invoice.value), invoice.invoiceNumber || ""]),
    );

    return records.map((record, index) => {
      const refFromRecord =
        record.referenceNumber ||
        record.referenceInvoiceNo ||
        record.invoiceNumber ||
        record.invoiceNo ||
        "";
      const refFromInvoiceMap = invoiceNumberById.get(
        String(record.invoiceId || record.invoiceRefId || ""),
      );

      return {
        ...record,
        sn: (currentPage - 1) * recordsPerPage + index + 1,
        amountCalculationStatus:
          record.amountCalculationStatus ||
          resolveAmountCalculationStatus(record),
        referenceNumber: refFromRecord || refFromInvoiceMap || "",
        noteDateTime:
          record.noteDateTime || record.noteDate || record.createdAt || "",
        createdDateTime:
          record.createdDateTime ||
          record.createdAt ||
          record.createdDate ||
          "",
      };
    });
  }, [records, currentPage, recordsPerPage, invoiceOptions]);

  const filteredClientSideData = useMemo(() => {
    if (serverSide) {
      return preparedData.filter((record) => !record.isDeleted);
    }

    let data = preparedData.filter((record) => record.isDeleted !== true);

    Object.entries(filters).forEach(([key, value]) => {
      if (
        value === undefined ||
        value === null ||
        value === "" ||
        value === "All"
      ) {
        return;
      }

      if (
        columnsWithDateFilter.includes(key) &&
        value &&
        typeof value === "object"
      ) {
        const startDate = value.startDate ? new Date(value.startDate) : null;
        const endDate = value.endDate ? new Date(value.endDate) : null;

        data = data.filter((record) => {
          const rawDate =
            key === "noteDateTime"
              ? record.noteDateTime
              : record.createdDateTime;
          const recordDate = rawDate ? new Date(rawDate) : null;

          if (!recordDate || Number.isNaN(recordDate.getTime())) return false;
          if (startDate && recordDate < startDate) return false;
          if (endDate) {
            const endBoundary = new Date(endDate);
            endBoundary.setHours(23, 59, 59, 999);
            if (recordDate > endBoundary) return false;
          }
          return true;
        });

        return;
      }

      if (Array.isArray(value) && value.length > 0) {
        data = data.filter((record) => value.includes(record[key]));
        return;
      }

      if (typeof value === "string") {
        data = data.filter((record) =>
          String(record[key] || "")
            .toLowerCase()
            .includes(value.toLowerCase()),
        );
      }
    });

    return data;
  }, [preparedData, filters, serverSide]);

  const handleDebouncedColumnFilterChange = (key, value) => {
    if (serverSide) {
      if (debounceColumnTimeoutRef.current) {
        clearTimeout(debounceColumnTimeoutRef.current);
      }

      debounceColumnTimeoutRef.current = setTimeout(() => {
        setFilters((prev) => ({ ...prev, [key]: value }));
        setCurrentPage(1);
      }, 500);
    } else {
      setFilters((prev) => ({ ...prev, [key]: value }));
    }
  };

  const columns = [
    { key: "sn", label: "S.No", width: 70 },
    { key: "noteNumber", label: "Note No.", width: 140 },
    {
      key: "noteType",
      label: "Note Type",
      width: 130,
      render: (value) => {
        const badgeClass =
          value === "Credit Note"
            ? "bg-success"
            : value === "Debit Note"
              ? "bg-danger"
              : "bg-secondary";

        return <span className={`badge ${badgeClass}`}>{value || "-"}</span>;
      },
    },
    { key: "clientName", label: "Client Name", width: 170 },
    { key: "businessName", label: "Business Name", width: 180 },
    { key: "referenceNumber", label: "Reference No.", width: 150 },
    { key: "noteDateTime", label: "Note Date & Time", width: 200 },
    { key: "amount", label: "Amount", width: 120 },
    { key: "taxAmount", label: "Tax Amount", width: 120 },
    { key: "totalAmount", label: "Total Amount", width: 120 },
    {
      key: "status",
      label: "Status",
      width: 120,
      render: (_, record) => {
        const value =
          record?.amountCalculationStatus ||
          resolveAmountCalculationStatus(record);
        const normalized = String(value || "")
          .trim()
          .toLowerCase();
        const statusClass = [
          "approved",
          "paid",
          "full refund",
          "refunded",
        ].includes(normalized)
          ? "bg-success"
          : ["rejected", "cancelled", "failed"].includes(normalized)
            ? "bg-danger"
            : ["pending", "unpaid", "draft", "under verification"].includes(
                  normalized,
                )
              ? "bg-warning"
              : ["partial", "partial refund", "partial payment"].includes(
                    normalized,
                  )
                ? "bg-info"
                : "bg-secondary";

        return <span className={`badge ${statusClass}`}>{value || "-"}</span>;
      },
    },
    { key: "remarks", label: "Remarks", width: 240 },
    {
      key: "createdDateTime",
      label: "Created Date & Time",
      width: 200,
      render: (value) => formatDateTimeForDisplay(value) || "-",
    },
    { key: "action", label: "Actions", width: 150 },
  ];

  const fixedColumns = ["sn", "noteNumber"];
  const defaultVisibleColumns = [
    "sn",
    "noteNumber",
    "noteType",
    "clientName",
    "totalAmount",
    "status",
    "action",
  ];
  const columnsWithDropdownFilter = ["noteType"];

  const getFilterOptions = () => {
    const uniqueNoteTypes = [
      ...new Set(records.map((item) => item.noteType).filter(Boolean)),
    ].sort();
    const uniqueStatuses = [
      ...new Set(
        records
          .map((item) => item.amountCalculationStatus || item.status)
          .filter(Boolean),
      ),
    ].sort();

    return {
      noteType: ["All", ...uniqueNoteTypes],
      status: ["All", ...uniqueStatuses],
    };
  };

  const handleCardClick = (cardKey) => {
    if (cardKey === "addNew") {
      if (!canCreate) {
        showError("You don't have permission to add notes");
        return;
      }

      handleAddNewNote();
      return;
    }

    setActiveCardFilter(cardKey);
    if (serverSide) {
      setCurrentPage(1);
    }
  };

  const handleFormSubmit = async (payload) => {
    try {
      const { id, _id, sn, createdDateTime, noteDateTime, ...body } = payload;
      const normalizedBody = {
        ...body,
        amount: Number(body.amount || 0),
        taxRate: Number(body.taxRate || 0),
        taxAmount: Number(body.taxAmount || 0),
        totalAmount: Number(body.totalAmount || 0),
      };

      if (id) {
        await apiPut(
          API_ENDPOINTS.CREDIT_DEBIT_NOTES.UPDATE(id),
          normalizedBody,
        );
        showSuccess("Note updated successfully!");
      } else {
        await apiPost(API_ENDPOINTS.CREDIT_DEBIT_NOTES.CREATE, normalizedBody);
        showSuccess("Note created successfully!");
      }

      setShowCreateForm(false);
      setEditingRecord(null);
      await fetchNotes();
    } catch (error) {
      console.error("Error saving note:", error);
      showError(
        error.response?.data?.error ||
          error.response?.data?.message ||
          "Failed to save note",
      );
    }
  };

  const handleEdit = (record) => {
    setEditingRecord(record);
    setShowCreateForm(true);
    showInfo(`Editing note: ${record.noteNumber}`);
  };

  const handleView = (record) => {
    setEditingRecord({ ...record, isViewMode: true });
    setShowCreateForm(true);
    showInfo(`Viewing note: ${record.noteNumber}`);
  };

  const openNotePreview = (record) => {
    setNotePreviewRecord(record);
    setShowNotePreview(true);
  };

  const closeNotePreview = () => {
    setShowNotePreview(false);
    setNotePreviewRecord(null);
  };

  const handleDelete = (id) => {
    const record = records.find((item) => item.id === id || item._id === id);
    if (!record) return;

    setNoteToDelete(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!noteToDelete) return;

    try {
      await apiDelete(API_ENDPOINTS.CREDIT_DEBIT_NOTES.DELETE(noteToDelete));
      showSuccess("Note deleted successfully!");
      await fetchNotes();
      setShowDeleteConfirm(false);
      setNoteToDelete(null);
    } catch (error) {
      console.error("Error deleting note:", error);
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to delete note",
      );
    }
  };

  const handleStatusToggle = async (id) => {
    const record = records.find((item) => item.id === id || item._id === id);
    if (!record) return;

    const statusCycle = ["Pending", "Approved", "Rejected"];
    const currentIndex = statusCycle.indexOf(record.status);
    const newStatus =
      currentIndex === -1
        ? "Approved"
        : statusCycle[(currentIndex + 1) % statusCycle.length];

    try {
      const {
        _id,
        id: recordId,
        sn,
        createdDateTime,
        noteDateTime,
        ...updateData
      } = record;
      updateData.status = newStatus;

      await apiPut(API_ENDPOINTS.CREDIT_DEBIT_NOTES.UPDATE(id), updateData);
      showSuccess("Status updated successfully!");
      await fetchNotes();
    } catch (error) {
      console.error("Error updating status:", error);
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to update status",
      );
    }
  };

  const handleRefresh = () => {
    if (serverSide) {
      setFilters({});
      setSearchTerm("");
      setSortField(null);
      setSortDirection("normal");
      setCurrentPage(1);
      setActiveCardFilter("total");
    }

    fetchNotes();
    showInfo("Data refreshed!");
  };

  const handleServerSideSearch = (term) => {
    setSearchTerm(term);
    setCurrentPage(1);
  };

  const handleServerSideFilter = (filterParams) => {
    setFilters(filterParams);
    setCurrentPage(1);
  };

  const handleServerSideSort = (field, direction) => {
    setSortField(field);
    setSortDirection(direction);
    setCurrentPage(1);
  };

  const handleServerSidePageChange = (page) => {
    setCurrentPage(page);
  };

  const handleServerSideRecordsPerPageChange = (limit) => {
    setRecordsPerPage(limit);
    setCurrentPage(1);
  };

  const handleAddNewNote = () => {
    setEditingRecord(null);
    setShowCreateForm(true);
  };

  const buildNotePreviewData = (record) => {
    if (!record) return null;

    const noteDateValue =
      record.noteDate || record.noteDateTime || record.createdAt;
    const taxRate = Number(record.taxRate || 0);
    const amount = Number(record.amount || 0);
    const taxAmount = Number(record.taxAmount || 0);
    const totalAmount = Number(record.totalAmount || amount + taxAmount);
    const isRajasthan = String(record.placeOfSupply || "")
      .toLowerCase()
      .includes("rajasthan");
    const cgst = isRajasthan ? Number((taxAmount / 2).toFixed(2)) : 0;
    const sgst = isRajasthan ? Number((taxAmount / 2).toFixed(2)) : 0;
    const igst = isRajasthan ? 0 : taxAmount;

    return {
      invoiceNumber: record.noteNumber || "",
      invoiceDate: noteDateValue || "",
      orderNumber: record.referenceNumber || record.invoiceNumber || "",
      clientId: record.clientId || record.invoiceId || "",
      placeOfSupply: record.placeOfSupply || "",
      clientName: record.clientName || "",
      businessName: record.businessName || "",
      clientAddress: record.address || "",
      clientPhone: record.phoneNumber || "",
      clientEmail: record.email || "",
      clientGstin: record.gstin || "",
      paymentDate: noteDateValue || "",
      paymentMethod: record.noteType || "",
      status: record.status || "",
      subtotal: amount,
      taxPercent: taxRate,
      cgst,
      sgst,
      igst,
      cgstPercent: isRajasthan ? taxRate / 2 : 0,
      sgstPercent: isRajasthan ? taxRate / 2 : 0,
      igstPercent: isRajasthan ? 0 : taxRate,
      totalAmount,
      taxAmount,
      items: Array.isArray(record.items)
        ? record.items.map((item) => ({
            serviceName: item.itemName || item.serviceName || "",
            description: item.itemDescription || item.description || "",
            hsnCode: item.hsnCode || "",
            qty: Number(item.qty || 0),
            price: Number(item.price || 0),
            amount: Number(item.amount || 0),
          }))
        : [],
    };
  };

  return (
    <>
      <div className="container-fluid">
        <div
          className="py-3 d-flex justify-content-between align-items-center flex-wrap"
          style={{ marginTop: "70px" }}
        >
          <h4 className="fs-18 fw-semibold m-0">Credit/Debit Notes</h4>

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
                setSortField(null);
                setSortDirection("normal");
                setActiveCardFilter("total");
              }}
              id="creditDebitNotesServerSideToggle"
            />
            <label
              className="form-check-label ms-2"
              htmlFor="creditDebitNotesServerSideToggle"
            >
              Server-side Mode {serverSide ? "(Enabled)" : "(Disabled)"}
            </label>
          </div>
        </div>

        <div className="row">
          {cards.map((card, index) => {
            const cardNumber = getCardNumber(index);
            const cardClass = `card${cardNumber}`;
            const cardIconBgClass = `card-icon-bg${cardNumber}`;
            const isActive =
              activeCardFilter === card.key && card.key !== "addNew";
            const isAddNewDisabled = card.key === "addNew" && !canCreate;

            return (
              <div key={index} className="col-md-6 col-xl-2 mb-4">
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
                        : card.count !== undefined
                          ? card.count
                          : 0}
                    </h6>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <ReusableTable
          ensureCreatedByColumn={true}
          createdByLabel="Created By"
          moduleKey={moduleKey}
          columns={columns}
          data={filteredClientSideData}
          loading={loading}
          totalRecords={totalRecords}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onView={handleView}
          onStatusToggle={handleStatusToggle}
          onRefresh={handleRefresh}
          showActions={true}
          actions={["view", "edit", "delete", "status"]}
          skipDeleteConfirmation={true}
          fixedColumns={fixedColumns}
          defaultVisibleColumns={defaultVisibleColumns}
          columnsWithDropdownFilter={columnsWithDropdownFilter}
          columnsWithDateFilter={columnsWithDateFilter}
          filterOptions={serverSide ? dynamicFilterOptions : getFilterOptions()}
          tableTitle="Credit/Debit Notes Record"
          showColumnSelector={true}
          showExport={true}
          showRefresh={true}
          showAdvancedFilter={true}
          showSearch={true}
          exportFileName="Credit_Debit_Notes"
          exportTitle="Credit/Debit Notes Report"
          activeCardFilter={activeCardFilter}
          cards={cards}
          customActions={(record) => (
            <button
              type="button"
              className="btn btn-sm btn-outline-dark me-1"
              onClick={() => openNotePreview(record)}
              title={`${record.noteType || "Note"} Preview`}
            >
              <i className="fas fa-file-invoice"></i>
            </button>
          )}
          getBadgeClass={(value) => {
            if (value === "Credit Note") return "bg-success";
            if (value === "Debit Note") return "bg-warning";
            if (value === "Pending") return "bg-warning";
            if (value === "Approved") return "bg-success";
            if (value === "Rejected") return "bg-danger";
            return "bg-primary";
          }}
          serverSide={serverSide}
          onServerSideSearch={handleServerSideSearch}
          onServerSideFilter={handleServerSideFilter}
          onServerSideSort={handleServerSideSort}
          onServerSidePageChange={handleServerSidePageChange}
          onServerSideRecordsPerPageChange={
            handleServerSideRecordsPerPageChange
          }
          currentPage={currentPage}
          recordsPerPage={recordsPerPage}
          onPageChange={setCurrentPage}
          onRecordsPerPageChange={setRecordsPerPage}
          onColumnFilterChange={handleDebouncedColumnFilterChange}
          exportApi={API_ENDPOINTS.CREDIT_DEBIT_NOTES.LIST}
        />

        <CreateCreditDebitNote
          show={showCreateForm}
          onClose={() => {
            setShowCreateForm(false);
            setEditingRecord(null);
          }}
          onSubmit={handleFormSubmit}
          editingRecord={editingRecord}
          invoiceOptions={invoiceOptions}
          invoiceLoading={invoiceLoading}
        />

        <ConfirmationModal
          show={showDeleteConfirm}
          onHide={() => {
            setShowDeleteConfirm(false);
            setNoteToDelete(null);
          }}
          onConfirm={confirmDelete}
          title="Delete Note"
          message={
            <>
              Are you sure you want to delete note{" "}
              <strong>
                "
                {records.find(
                  (record) =>
                    record.id === noteToDelete || record._id === noteToDelete,
                )?.noteNumber || ""}
                "
              </strong>
              ? This action marks the note as deleted.
            </>
          }
          confirmText="Delete"
          cancelText="Cancel"
          variant="danger"
        />

        <CreditDebitNotePreview
          show={showNotePreview}
          onClose={closeNotePreview}
          id={notePreviewRecord?._id || notePreviewRecord?.id}
          noteData={notePreviewRecord}
        />
      </div>
    </>
  );
};

export default CreditDebitNotesManagement;
