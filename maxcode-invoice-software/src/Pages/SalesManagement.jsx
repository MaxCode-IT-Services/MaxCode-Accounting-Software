import React, { useState, useEffect } from "react";
import ReusableTable from "../Components/ReusableTable";
import CreateSales from "../Components/CreateSales";
import InvoicePreview from "../Components/InvoicePreview"; // Ensure this import is correct
import {
  showSuccess,
  showError,
  showInfo,
} from "../Components/ToastNotification";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { apiDelete, apiGet, apiPost, apiPut } from "../utils/api";
import { hasActionPermission } from "../utils/permissions";
import {
  exportItemWiseExcel,
  exportItemWisePDF,
} from "../utils/itemWiseExport";

const SalesManagement = () => {
  const moduleKey = "salesManagement";
  const canCreate = hasActionPermission(moduleKey, "create");

  useEffect(() => {
    document.title = "Sales Management | MaxCode IT Services";
  }, []);

  const [allRecords, setAllRecords] = useState([]);
  const [records, setRecords] = useState([]);
  const [clients, setClients] = useState([]);
  const [financialYears, setFinancialYears] = useState([]);
  const [selectedFinancialYear, setSelectedFinancialYear] = useState(
    localStorage.getItem("selectedFinancialYear") || "ALL",
  );
  const [loading, setLoading] = useState(false);
  const [showCreateSalesForm, setShowCreateSalesForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [activeCardFilter, setActiveCardFilter] = useState("total");
  const [showInvoicePreview, setShowInvoicePreview] = useState(false);
  const [previewRecord, setPreviewRecord] = useState(null);
  const [filteredRecords, setFilteredRecords] = useState([]);
  const [exportingInvoices, setExportingInvoices] = useState(false);
  const [businessSettings, setBusinessSettings] = useState({
    companyName: "",
    companyAddress: "",
    gstin: "",
    accountName: "",
    accountNumber: "",
    bankName: "",
    ifscCode: "",
    branchAddress: "",
  });

  const [statistics, setStatistics] = useState({
    total: 0,
    paid: 0,
    unpaid: 0,
    partial: 0,
    totalAmount: 0,
  });

  const cards = [
    {
      icon: "fa-solid fa-file-invoice",
      title: "Total Sales",
      key: "total",
      color: "primary",
    },
    {
      icon: "fas fa-check-circle",
      title: "Paid",
      key: "paid",
      color: "success",
    },
    {
      icon: "fa-solid fa-times-circle",
      title: "Unpaid",
      key: "unpaid",
      color: "danger",
    },
    {
      icon: "fas fa-hourglass-half",
      title: "Partial",
      key: "partial",
      color: "warning",
    },
    {
      icon: "fas fa-rupee-sign",
      title: "Total Amount",
      key: "totalAmount",
      color: "info",
    },
    {
      icon: "fas fa-plus-circle",
      title: "Add New",
      key: "addNew",
      color: "success",
    },
  ];

  const toNumber = (value) => {
    const num = parseFloat(value);
    return Number.isNaN(num) ? 0 : num;
  };

  const formatDateForDisplay = (dateString) => {
    if (!dateString) return "";

    try {
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        const day = String(date.getDate()).padStart(2, "0");
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
      }
      return dateString;
    } catch (e) {
      return dateString;
    }
  };

  const formatDateTimeForDisplay = (dateString) => {
    if (!dateString) return "";

    try {
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
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

        return `${day}/${month}/${year} | ${formattedHours}:${minutes}:${seconds} ${ampm}`;
      }

      return dateString;
    } catch (e) {
      return dateString;
    }
  };

  useEffect(() => {
    fetchFinancialYears();
    fetchSales();
    fetchClients();
    fetchBusinessSettings();

    const handleFinancialYearSelectionChanged = (event) => {
      const selectedYear =
        event?.detail?.selectedFinancialYear ||
        localStorage.getItem("selectedFinancialYear") ||
        "ALL";
      setSelectedFinancialYear(selectedYear);
    };

    window.addEventListener(
      "financialYearSelectionChanged",
      handleFinancialYearSelectionChanged,
    );

    return () => {
      window.removeEventListener(
        "financialYearSelectionChanged",
        handleFinancialYearSelectionChanged,
      );
    };
  }, []);

  useEffect(() => {
    applySelectedFinancialYearFilter(allRecords, selectedFinancialYear);
  }, [allRecords, selectedFinancialYear, financialYears]);

  const fetchFinancialYears = async () => {
    try {
      const response = await apiGet(API_ENDPOINTS.YEARS.LIST);
      const yearsData = Array.isArray(response.data)
        ? response.data
        : response.data?.years || [];

      const normalizedYears = yearsData
        .filter((yearRecord) => yearRecord?.isDeleted !== true)
        .map((yearRecord) => ({
          ...yearRecord,
          id: yearRecord.id || yearRecord._id,
          value: yearRecord.financialYear || yearRecord.year,
        }));

      setFinancialYears(normalizedYears);
    } catch (error) {
      console.error("Financial years API fetch error:", error);
      setFinancialYears([]);
    }
  };

  const getDateOnly = (value) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  };

  const getDefaultFinancialYearRecord = () => {
    return financialYears.find((year) => year?.isDefault === true) || null;
  };

  const isInvoiceDateWithinFinancialYear = (
    invoiceDate,
    financialYearRecord,
  ) => {
    const invoiceDateOnly = getDateOnly(invoiceDate);
    const startDate = getDateOnly(financialYearRecord?.startDate);
    const endDate = getDateOnly(financialYearRecord?.endDate);

    if (!invoiceDateOnly || !startDate || !endDate) {
      return false;
    }

    return invoiceDateOnly >= startDate && invoiceDateOnly <= endDate;
  };

  const applySelectedFinancialYearFilter = (sourceRecords, selectedYear) => {
    if (!Array.isArray(sourceRecords)) {
      setRecords([]);
      updateStatistics([]);
      return;
    }

    if (!selectedYear || selectedYear === "ALL") {
      setRecords(sourceRecords);
      updateStatistics(sourceRecords);
      return;
    }

    const matchedYear = financialYears.find(
      (year) => year.value === selectedYear,
    );

    if (!matchedYear?.startDate || !matchedYear?.endDate) {
      setRecords(sourceRecords);
      updateStatistics(sourceRecords);
      return;
    }

    const startDate = getDateOnly(matchedYear.startDate);
    const endDate = getDateOnly(matchedYear.endDate);

    if (!startDate || !endDate) {
      setRecords(sourceRecords);
      updateStatistics(sourceRecords);
      return;
    }

    const filteredRecords = sourceRecords.filter((record) => {
      const invoiceDate = getDateOnly(record.invoiceDate);
      if (!invoiceDate) return false;
      return invoiceDate >= startDate && invoiceDate <= endDate;
    });

    setRecords(filteredRecords);
    updateStatistics(filteredRecords);
  };

  const fetchSales = async () => {
    setLoading(true);
    try {
      const response = await apiGet(API_ENDPOINTS.INVOICES.LIST);
      const invoicesData = Array.isArray(response.data)
        ? response.data
        : response.data?.invoices || [];

      const normalizedInvoices = invoicesData.map((invoice) => ({
        ...invoice,
        id: invoice._id || invoice.id,
      }));

      setAllRecords(normalizedInvoices);
    } catch (err) {
      showError("Failed to fetch sales");
      setAllRecords([]);
      setRecords([]);
      updateStatistics([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchClients = async () => {
    try {
      const response = await apiGet(API_ENDPOINTS.CLIENTS.LIST);
      const clientsData = Array.isArray(response.data)
        ? response.data
        : response.data?.clients || [];

      const activeClients = clientsData
        .filter((client) => client?.isDeleted !== true)
        .map((client) => ({
          ...client,
          id: client.id || client._id,
        }));
      setClients(activeClients);
    } catch (err) {
      showError("Failed to fetch clients");
      setClients([]);
    }
  };

  const fetchBusinessSettings = async () => {
    const cached = localStorage.getItem("business_settings");

    if (cached) {
      try {
        const parsedCache = JSON.parse(cached);
        setBusinessSettings((prev) => ({
          ...prev,
          ...parsedCache,
        }));
      } catch (error) {
        console.error("Failed to parse cached business settings:", error);
      }
    }

    try {
      const response = await apiGet(API_ENDPOINTS.BUSINESS_SETTINGS.GET);
      const remoteSettings = response?.data?.settings;

      if (remoteSettings && typeof remoteSettings === "object") {
        setBusinessSettings((prev) => ({
          ...prev,
          ...remoteSettings,
        }));
      }
    } catch (error) {
      console.error("Failed to fetch business settings:", error);
    }
  };

  useEffect(() => {
    if (!showInvoicePreview || !previewRecord) return;

    const previewId = previewRecord._id || previewRecord.id;
    if (!previewId) return;

    const latestRecord = allRecords.find(
      (record) => (record._id || record.id) === previewId,
    );

    if (latestRecord) {
      setPreviewRecord(latestRecord);
    }
  }, [allRecords, showInvoicePreview, previewRecord]);

  const updateStatistics = (data) => {
    const stats = {
      total: data.length,
      paid: data.filter((r) => r.paymentStatus === "Paid").length,
      unpaid: data.filter((r) => r.paymentStatus === "Unpaid").length,
      partial: data.filter((r) => r.paymentStatus === "Partial").length,
      totalAmount: data
        .reduce((sum, r) => sum + toNumber(r.taxData?.totalAmount || 0), 0)
        .toFixed(2),
    };
    setStatistics(stats);
  };

  const prepareTableData = () => {
    return records.map((record, index) => ({
      ...record,
      sn: index + 1,
      invoiceDateFormatted: formatDateForDisplay(record.invoiceDate),
      paymentDateFormatted: record.paymentDate
        ? formatDateForDisplay(record.paymentDate)
        : "-",
      createdDateTime:
        record.createdDateTime || formatDateTimeForDisplay(record.createdDate),
      createdDateFilter: record.createdDate,
      totalAmount: record.taxData?.totalAmount || 0,
      roundingAmount: record.roundingAmount || 0,
      itemCount: record.items?.length || 0,
    }));
  };

  const columns = [
    { key: "sn", label: "S.No", width: 70 },
    { key: "invoiceNumber", label: "Invoice No.", width: 130 },
    { key: "invoiceDateFormatted", label: "Invoice Date", width: 130 },
    { key: "clientName", label: "Client Name", width: 160 },
    { key: "clientId", label: "Client ID", width: 120 },
    { key: "businessName", label: "Business Name", width: 180 },
    { key: "placeOfSupply", label: "Place of Supply", width: 180 },
    {
      key: "itemCount",
      label: "Items",
      width: 80,
      render: (value) => (
        <span className="badge bg-info">
          {value} item{value !== 1 ? "s" : ""}
        </span>
      ),
    },
    {
      key: "totalAmount",
      label: "Total Amount",
      width: 130,
      render: (value) => (
        <span className="fw-bold text-success">
          ₹{" "}
          {parseFloat(value).toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      ),
    },
    {
      key: "roundingAmount",
      label: "Rounding Amount",
      width: 130,
      render: (value) => (
        <span className="fw-bold text-info">
          ₹{" "}
          {parseFloat(value).toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      ),
    },
    {
      key: "paymentStatus",
      label: "Payment Status",
      width: 130,
      render: (value) => {
        let badgeClass = "bg-secondary";
        if (value === "Paid") badgeClass = "bg-success";
        else if (value === "Unpaid") badgeClass = "bg-danger";
        else if (value === "Partial") badgeClass = "bg-warning";
        return <span className={`badge ${badgeClass}`}>{value}</span>;
      },
    },
    { key: "paymentMethod", label: "Payment Method", width: 130 },
    { key: "paymentDateFormatted", label: "Payment Date", width: 130 },
    { key: "createdDateTime", label: "Created Date & Time", width: 200 },
    { key: "action", label: "Actions", width: 180 },
  ];

  const fixedColumns = ["sn"];
  const defaultVisibleColumns = [
    "sn",
    "invoiceNumber",
    "invoiceDateFormatted",
    "clientName",
    "clientId",
    "businessName",
    "itemCount",
    "totalAmount",
    "roundingAmount",
    "paymentStatus",
    "paymentMethod",
    "createdDateTime",
    "action",
  ];

  const columnsWithDropdownFilter = ["paymentStatus", "paymentMethod"];
  const columnsWithDateFilter = [
    "createdDateTime",
    "invoiceDateFormatted",
    "paymentDateFormatted",
  ];

  const filterOptions = {
    paymentStatus: ["All", "Paid", "Unpaid", "Partial"],
    paymentMethod: [
      "All",
      "Cash",
      "Bank Transfer",
      "Credit Card",
      "Debit Card",
      "UPI",
      "Cheque",
    ],
  };

  const handleCardClick = (cardKey) => {
    if (cardKey === "addNew") {
      if (!canCreate) {
        showError("You don't have permission to add sales invoices");
        return;
      }
      setEditingRecord(null);
      setShowCreateSalesForm(true);
    } else {
      setActiveCardFilter(cardKey);
    }
  };

  const getCardNumber = (index) => {
    return (index % 8) + 1;
  };

  const handleFormSubmit = async (formData) => {
    if (!editingRecord) {
      const defaultFinancialYear = getDefaultFinancialYearRecord();

      if (!defaultFinancialYear?.value) {
        showError(
          "Default financial year is not configured. Please set default financial year first.",
        );
        return;
      }

      if (selectedFinancialYear !== defaultFinancialYear.value) {
        showError(
          `Please select default financial year ${defaultFinancialYear.value} in navbar before creating sales invoice.`,
        );
        return;
      }

      const isValidInvoiceDate = isInvoiceDateWithinFinancialYear(
        formData.invoiceDate,
        defaultFinancialYear,
      );

      if (!isValidInvoiceDate) {
        showError(
          `Invoice Date must be between ${formatDateForDisplay(defaultFinancialYear.startDate)} and ${formatDateForDisplay(defaultFinancialYear.endDate)} for financial year ${defaultFinancialYear.value}.`,
        );
        return;
      }

      const invoiceExists = allRecords.some(
        (record) => record.invoiceNumber === formData.invoiceNumber,
      );

      if (invoiceExists) {
        showError(
          "Invoice number already exists. Please refresh and try again.",
        );
        return;
      }
    }

    const selectedClient = clients.find(
      (c) =>
        c.id == formData.clientRefId ||
        c._id == formData.clientRefId ||
        c.clientId == formData.clientRefId,
    );

    const clientName =
      selectedClient?.clientName || editingRecord?.clientName || "";

    try {
      if (editingRecord && !editingRecord.isViewMode) {
        const invoiceId = editingRecord._id || editingRecord.id;
        const payload = {
          ...formData,
          clientName,
          createdDate: editingRecord.createdDate,
        };

        await apiPut(API_ENDPOINTS.INVOICES.UPDATE(invoiceId), payload);
        showSuccess("Sales updated successfully!");
      } else {
        const payload = {
          ...formData,
          clientName,
          createdDate: new Date().toISOString(),
        };

        await apiPost(API_ENDPOINTS.INVOICES.CREATE, payload);
        showSuccess("Sales added successfully!");
      }

      await fetchSales();
      setShowCreateSalesForm(false);
      setEditingRecord(null);
    } catch (error) {
      console.error("Error saving sales:", error);
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to save sales",
      );
      throw error;
    }
  };

  const handleEdit = (record) => {
    setEditingRecord(record);
    setShowCreateSalesForm(true);
    showInfo(`Editing sales: ${record.invoiceNumber}`);
  };

  const handleView = (record) => {
    setEditingRecord({ ...record, isViewMode: true });
    setShowCreateSalesForm(true);
    showInfo(`Viewing sales: ${record.invoiceNumber}`);
  };

  const handleDelete = (id) => {
    handleDeleteInvoice(id);
  };

  const handleDeleteInvoice = async (id) => {
    try {
      // Soft delete: set isDeleted true
      await apiPut(API_ENDPOINTS.INVOICES.UPDATE(id), {
        isDeleted: true,
        deletedAt: new Date().toISOString(),
      });
      await fetchSales();
      showSuccess("Sales deleted successfully!");
    } catch (error) {
      console.error("Error deleting invoice:", error);
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to delete invoice",
      );
    }
  };

  const handleRefresh = () => {
    fetchFinancialYears();
    fetchSales();
    fetchClients();
    fetchBusinessSettings();
    setActiveCardFilter("total");
    showInfo("Data refreshed!");
  };

  const openInvoicePreview = (record) => {
    setPreviewRecord(record);
    setShowInvoicePreview(true);
  };

  const closeInvoicePreview = () => {
    setShowInvoicePreview(false);
    setPreviewRecord(null);
  };

  const getInvoiceElementId = (record, index) => {
    return `invoice-print-${record.id || record.invoiceNumber || index}`;
  };

  const exportInvoicesPdf = async () => {
    if (!filteredRecords.length) {
      showError("No invoices found for the selected filters.");
      return;
    }

    setExportingInvoices(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const jsPDF = (await import("jspdf")).default;

      await new Promise((resolve) => requestAnimationFrame(resolve));

      const pdf = new jsPDF({
        orientation: "p",
        unit: "mm",
        format: "a4",
        compress: true,
      });

      for (let i = 0; i < filteredRecords.length; i += 1) {
        const record = filteredRecords[i];
        const elementId = getInvoiceElementId(record, i);
        const element = document.getElementById(elementId);

        if (!element) {
          throw new Error(`Invoice element not found: ${elementId}`);
        }

        const canvas = await html2canvas(element, {
          scale: 3,
          useCORS: true,
          allowTaint: true,
          width: element.offsetWidth,
          height: element.offsetHeight,
          logging: false,
          backgroundColor: "#ffffff",
        });

        const imgData = canvas.toDataURL("image/jpeg", 1.0);
        if (i > 0) pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, 0, 210, 297);
      }

      const now = new Date();
      const day = String(now.getDate()).padStart(2, "0");
      const month = String(now.getMonth() + 1).padStart(2, "0");
      const year = now.getFullYear();
      const fileDate = `${day}-${month}-${year}`;
      pdf.save(`Invoices_${fileDate}.pdf`);
      showSuccess("Invoices PDF downloaded successfully!");
    } catch (error) {
      console.error("Multi-invoice PDF error:", error);
      showError("Failed to generate invoices PDF.");
    } finally {
      setExportingInvoices(false);
    }
  };

  const handleExportItemWiseExcel = () => {
    if (!filteredRecords.length) {
      showError("No sales invoices found for the selected filters.");
      return;
    }

    try {
      exportItemWiseExcel({
        records: filteredRecords,
        exportFileName: "Sales_Management",
        sheetName: "Sales Item Wise",
        reportTitle: "Sales_Item_Wise",
        invoiceNumberKey: "invoiceNumber",
        partyNameKey: ["clientName", "businessName"],
        partyLabel: "Client Name",
        dateKey: "invoiceDate",
        partyDetails: {
          gstinKey: "gstin",
          addressKey: "address",
          placeOfSupplyKey: "placeOfSupply",
        },
      });
      showSuccess("Sales item-wise Excel exported successfully!");
    } catch (error) {
      console.error("Sales item-wise Excel export error:", error);
      showError("Failed to export Sales item-wise Excel.");
    }
  };

  const handleExportItemWisePDF = () => {
    if (!filteredRecords.length) {
      showError("No sales invoices found for the selected filters.");
      return;
    }

    try {
      exportItemWisePDF({
        records: filteredRecords,
        exportFileName: "Sales_Management",
        reportTitle: "Sales Report",
        invoiceNumberKey: "invoiceNumber",
        partyNameKey: ["clientName", "businessName"],
        partyLabel: "Client Name",
        dateKey: "invoiceDate",
        partyDetails: {
          gstinKey: "gstin",
          addressKey: "address",
          placeOfSupplyKey: "placeOfSupply",
        },
      });
      showSuccess("Sales item-wise PDF exported successfully!");
    } catch (error) {
      console.error("Sales item-wise PDF export error:", error);
      showError("Failed to export Sales item-wise PDF.");
    }
  };

  const getStatusLabel = (status) => {
    if (status === "Paid") return "PAID";
    if (status === "Partial") return "PARTIAL";
    return "UNPAID";
  };

  const buildInvoiceData = (record) => {
    if (!record) return null;

    const subtotal = toNumber(record.taxData?.subtotal || 0);
    const discountPercent = toNumber(record.discountPercent || 0);
    const discountAmount =
      toNumber(record.discountAmount || 0) ||
      (discountPercent > 0 ? (subtotal * discountPercent) / 100 : 0);
    const taxableAmount =
      toNumber(record.taxData?.taxableAmount || 0) || subtotal - discountAmount;
    const taxPercent = toNumber(record.taxData?.taxPercentage || 0);
    const cgst = toNumber(record.taxData?.cgst || 0);
    const sgst = toNumber(record.taxData?.sgst || 0);
    const igst = toNumber(record.taxData?.igst || 0);
    const roundingAmount = toNumber(record.roundingAmount || 0);
    const totalAmountFromRecord = toNumber(record.taxData?.totalAmount || 0);
    const computedTotalAmount =
      taxableAmount + cgst + sgst + igst + roundingAmount;
    const totalAmount = totalAmountFromRecord || computedTotalAmount;
    const tdsPercent = toNumber(record.tdsPercent || 0);
    const tdsAmount =
      toNumber(record.tdsAmount || 0) ||
      (tdsPercent > 0 ? (totalAmount * tdsPercent) / 100 : 0);
    const isRajasthan = (record.placeOfSupply || "")
      .toLowerCase()
      .includes("rajasthan");
    const cgstPercent = isRajasthan ? taxPercent / 2 : 0;
    const sgstPercent = isRajasthan ? taxPercent / 2 : 0;
    const igstPercent = !isRajasthan ? taxPercent : 0;

    return {
      companyName: businessSettings.companyName || "",
      companyAddress: businessSettings.companyAddress || "",
      companyGstin: businessSettings.gstin || "",
      accountName: businessSettings.accountName || "",
      bankName: businessSettings.bankName || "",
      accountNumber: businessSettings.accountNumber || "",
      ifscCode: businessSettings.ifscCode || "",
      branchAddress: businessSettings.branchAddress || "",
      invoiceNumber: record.invoiceNumber || "",
      invoiceDate: formatDateForDisplay(record.invoiceDate),
      createdDateTime:
        record.createdDateTime || formatDateTimeForDisplay(record.createdDate),
      orderNumber: record.clientId || record.clientRefId || "",
      clientId: record.clientId || record.clientRefId || "",
      placeOfSupply: record.placeOfSupply || "",
      clientName: record.clientName || record.businessName || "",
      clientAddress: record.address || "",
      clientPhone: record.phoneNumber || "",
      clientEmail: record.email || "",
      clientGstin: record.gstin || "",
      paymentDate: record.paymentDate
        ? formatDateForDisplay(record.paymentDate)
        : "",
      paymentMethod: record.paymentMethod || "",
      discountPercent,
      discountAmount,
      taxableAmount,
      taxPercent,
      cgst,
      sgst,
      igst,
      cgstPercent,
      sgstPercent,
      igstPercent,
      subtotal,
      totalAmount,
      roundingAmount,
      amountReceived: toNumber(record.amountReceived || 0),
      hasTds: tdsPercent > 0,
      tdsPercent,
      tdsAmount,
      status: getStatusLabel(record.paymentStatus),
      items: (record.items || []).map((item) => ({
        serviceName: item.itemName || "",
        description: item.itemDescription || "",
        hsnCode: item.hsnCode || "",
        qty: toNumber(item.qty || 0),
        price: toNumber(item.price || 0),
        amount: toNumber(item.amount || (item.qty || 0) * (item.price || 0)),
      })),
    };
  };

  return (
    <>
      <div className="container-fluid">
        <div
          className="py-3 d-flex align-items-sm-center flex-sm-row flex-column"
          style={{ marginTop: "70px" }}
        >
          <div className="flex-grow-1">
            <h4 className="fs-18 fw-semibold m-0">Sales Management</h4>
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
                  className={`card border-0 shadow-sm overflow-hidden ${cardClass} ${isActive ? "border-primary" : ""}`}
                  style={{
                    transition: "all 0.3s ease",
                    cursor: isAddNewDisabled ? "not-allowed" : "pointer",
                    opacity: isAddNewDisabled ? 0.6 : 1,
                    height: "100%",
                    borderRadius: "12px",
                    border: isActive
                      ? "2px solid #0d6efd"
                      : "1px solid #dee2e6",
                  }}
                  onMouseEnter={(e) => {
                    if (card.key === "addNew" && !isAddNewDisabled) {
                      e.currentTarget.style.transform = "translateY(-5px)";
                      e.currentTarget.style.boxShadow =
                        "0 10px 20px rgba(0,0,0,0.1)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow =
                      "0 2px 4px rgba(0,0,0,0.1)";
                  }}
                  onClick={() => !isAddNewDisabled && handleCardClick(card.key)}
                >
                  <div className="card-body text-center p-2">
                    <div className="mb-3 mt-2 d-flex justify-content-center">
                      <span
                        className={`avatar-md rounded-circle ${cardIconBgClass} d-inline-flex justify-content-center align-items-center`}
                        style={{
                          boxShadow: "0 4px 8px rgba(0,0,0,0.1)",
                          width: "60px",
                          height: "60px",
                        }}
                      >
                        <i className={`${card.icon} fs-3 text-white`}></i>
                      </span>
                    </div>
                    <div>
                      <h5 className="mb-2 fw-bold">{card.title}</h5>
                      <h6
                        className="mb-0 text-muted fs-6 fw-bold"
                        style={{ marginBottom: "-10px" }}
                      >
                        {card.key === "addNew"
                          ? "+ Add New"
                          : card.key === "totalAmount"
                            ? `₹ ${parseFloat(statistics[card.key]).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : statistics[card.key]}
                      </h6>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <ReusableTable
          moduleKey={moduleKey}
          columns={columns}
          data={prepareTableData()}
          loading={loading}
          onFilteredDataChange={setFilteredRecords}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onView={handleView}
          onRefresh={handleRefresh}
          showActions={true}
          actions={["view", "edit", "delete"]}
          fixedColumns={fixedColumns}
          defaultVisibleColumns={defaultVisibleColumns}
          columnsWithDropdownFilter={columnsWithDropdownFilter}
          columnsWithDateFilter={columnsWithDateFilter}
          filterOptions={filterOptions}
          tableTitle="Sales Records"
          showColumnSelector={true}
          showExport={true}
          showRefresh={true}
          showAdvancedFilter={true}
          showSearch={true}
          exportFileName="Sales_Management"
          exportTitle="Sales Management Report"
          extraExportItems={[
            {
              label: "Export Excel with Item",
              onClick: handleExportItemWiseExcel,
            },
            {
              label: "PDF with Item",
              onClick: handleExportItemWisePDF,
            },
            {
              label: exportingInvoices
                ? "Generating Invoices PDF..."
                : "Invoices PDF",
              onClick: exportInvoicesPdf,
            },
          ]}
          activeCardFilter={activeCardFilter}
          cards={cards}
          getBadgeClass={(value) => {
            if (value === "Paid") return "bg-success";
            if (value === "Unpaid") return "bg-danger";
            if (value === "Partial") return "bg-warning";
            return "bg-primary";
          }}
          customActions={(record) => (
            <button
              type="button"
              className="btn btn-sm btn-outline-dark me-1"
              onClick={() => openInvoicePreview(record)}
              title="Invoice Preview"
            >
              <i className="fas fa-file-invoice"></i>
            </button>
          )}
        />

        <CreateSales
          show={showCreateSalesForm}
          onClose={() => {
            setShowCreateSalesForm(false);
            setEditingRecord(null);
          }}
          onSubmit={handleFormSubmit}
          editingRecord={editingRecord}
          clients={clients}
          defaultFinancialYear={getDefaultFinancialYearRecord()}
          existingInvoices={allRecords}
        />
      </div>

      {/* Invoice Preview Modal */}
      <InvoicePreview
        show={showInvoicePreview}
        onClose={closeInvoicePreview}
        invoiceData={buildInvoiceData(previewRecord)}
      />

      <div
        style={{
          position: "absolute",
          left: "-10000px",
          top: 0,
          width: 0,
          height: 0,
          overflow: "hidden",
        }}
      >
        {filteredRecords.map((record, index) => (
          <InvoicePreview
            key={record.id || record.invoiceNumber || index}
            id={getInvoiceElementId(record, index)}
            show={true}
            renderMode="print"
            invoiceData={buildInvoiceData(record)}
          />
        ))}
      </div>
    </>
  );
};

export default SalesManagement;
