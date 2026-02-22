import React, { useState, useEffect } from "react";
import ReusableTable from "../Components/ReusableTable";
import CreateRcm from "../Components/CreateRcm";
import SelfInvoicePreview from "../Components/SelfInvoicePreview";
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

const RcmManagement = () => {
  const moduleKey = "rcmManagement";
  const canCreate = hasActionPermission(moduleKey, "create");

  useEffect(() => {
    document.title = "RCM Management | MaxCode IT Services";
  }, []);

  const [allRecords, setAllRecords] = useState([]);
  const [records, setRecords] = useState([]);
  const [financialYears, setFinancialYears] = useState([]);
  const [selectedFinancialYear, setSelectedFinancialYear] = useState(
    localStorage.getItem("selectedFinancialYear") || "ALL",
  );
  const [loading, setLoading] = useState(false);
  const [showCreateRcmForm, setShowCreateRcmForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [activeCardFilter, setActiveCardFilter] = useState("total");
  const [showSelfInvoicePreview, setShowSelfInvoicePreview] = useState(false);
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
    email: "",
    phone: "",
    website: "",
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
      title: "Total RCM",
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

  const dummyRcmData = [
    {
      id: 1,
      selfInvoiceNumber: "RCM001",
      invoiceDate: "2024-01-15",
      originalRefNo: "ORIG-001",
      serviceProviderBusinessName: "Tech Solutions Pvt Ltd",
      gstin: "08ABCDE1234F1Z5",
      noGSTIN: false,
      address: "123 Business Park, Sitapura, Jaipur - 302022",
      placeOfSupply: "Rajasthan (08)",
      roundingAmount: "0",
      items: [
        {
          id: 1,
          itemName: "Consulting Service",
          itemDescription: "Monthly IT consulting",
          hsnCode: "998313",
          qty: 1,
          price: 30000,
          amount: 30000,
        },
      ],
      taxData: {
        subtotal: 30000,
        taxPercentage: 18,
        cgst: 0,
        sgst: 0,
        igst: 5400,
        totalAmount: 35400,
      },
      paymentStatus: "Paid",
      paymentMethod: "Bank Transfer",
      paymentDate: "2024-01-20",
      paidAmount: "35400",
      tdsPercent: "2",
      tdsAmount: "708",
      createdDate: "2024-01-15T10:30:00",
      createdDateTime: "15/01/2024 | 10:30:00 AM",
    },
    {
      id: 2,
      selfInvoiceNumber: "RCM002",
      invoiceDate: "2024-02-10",
      originalRefNo: "ORIG-002",
      serviceProviderBusinessName: "Bright Network Pvt Ltd",
      gstin: "27FGHIJ5678K2Z9",
      noGSTIN: false,
      address: "456, Park Avenue, Mumbai - 400001",
      placeOfSupply: "Rajasthan (08)",
      roundingAmount: "-0.50",
      items: [
        {
          id: 1,
          itemName: "Network Maintenance",
          itemDescription: "Quarterly support",
          hsnCode: "998316",
          qty: 2,
          price: 12000,
          amount: 24000,
        },
      ],
      taxData: {
        subtotal: 24000,
        taxPercentage: 18,
        cgst: 0,
        sgst: 0,
        igst: 4320,
        totalAmount: 28319.5,
      },
      paymentStatus: "Paid",
      paymentMethod: "",
      paymentDate: "",
      paidAmount: "",
      tdsPercent: "0",
      tdsAmount: "0",
      createdDate: "2024-02-10T14:45:00",
      createdDateTime: "10/02/2024 | 02:45:00 PM",
    },
  ];

  useEffect(() => {
    setAllRecords(dummyRcmData);
    setRecords(dummyRcmData);
    updateStatistics(dummyRcmData);

    fetchFinancialYears();
    fetchRcm();
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
    if (!showSelfInvoicePreview || !previewRecord) return;

    const previewId = previewRecord._id || previewRecord.id;
    if (!previewId) return;

    const latestRecord = allRecords.find(
      (record) => (record._id || record.id) === previewId,
    );

    if (latestRecord) {
      setPreviewRecord(latestRecord);
    }
  }, [allRecords, showSelfInvoicePreview, previewRecord]);

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

    const filteredData = sourceRecords.filter((record) => {
      const invoiceDate = getDateOnly(record.invoiceDate);
      if (!invoiceDate) return false;
      return invoiceDate >= startDate && invoiceDate <= endDate;
    });

    setRecords(filteredData);
    updateStatistics(filteredData);
  };

  const fetchRcm = async () => {
    setLoading(true);
    try {
      const response = await apiGet(API_ENDPOINTS.RCM.LIST);
      const rcmData = Array.isArray(response.data)
        ? response.data
        : response.data?.records || response.data?.rcm || [];

      const normalizedRecords = rcmData.map((record) => ({
        ...record,
        id: record._id || record.id,
      }));

      setAllRecords(normalizedRecords);
    } catch (err) {
      showError("Failed to fetch RCM");
      setAllRecords([]);
      setRecords([]);
      updateStatistics([]);
    } finally {
      setLoading(false);
    }
  };

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
    { key: "selfInvoiceNumber", label: "Self Invoice No.", width: 150 },
    { key: "invoiceDateFormatted", label: "Invoice Date", width: 130 },
    { key: "originalRefNo", label: "Original Ref. No", width: 150 },
    {
      key: "serviceProviderBusinessName",
      label: "Service Provider",
      width: 200,
    },
    { key: "gstin", label: "GSTIN", width: 150 },
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
    "selfInvoiceNumber",
    "invoiceDateFormatted",
    "originalRefNo",
    "serviceProviderBusinessName",
    "gstin",
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
        showError("You don't have permission to add RCM invoices");
        return;
      }
      setEditingRecord(null);
      setShowCreateRcmForm(true);
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
          `Please select default financial year ${defaultFinancialYear.value} in navbar before creating RCM invoice.`,
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
        (record) => record.selfInvoiceNumber === formData.selfInvoiceNumber,
      );

      if (invoiceExists) {
        showError(
          "Self invoice number already exists. Please refresh and try again.",
        );
        return;
      }
    }

    try {
      if (editingRecord && !editingRecord.isViewMode) {
        const rcmId = editingRecord._id || editingRecord.id;
        await apiPut(API_ENDPOINTS.RCM.UPDATE(rcmId), {
          ...formData,
          createdDate: editingRecord.createdDate,
          placeOfSupply: "Rajasthan (08)",
        });
        showSuccess("RCM updated successfully!");
      } else if (!editingRecord) {
        await apiPost(API_ENDPOINTS.RCM.CREATE, {
          ...formData,
          createdDate: new Date().toISOString(),
          placeOfSupply: "Rajasthan (08)",
        });
        showSuccess("RCM added successfully!");
      }

      await fetchRcm();
      setShowCreateRcmForm(false);
      setEditingRecord(null);
    } catch (error) {
      console.error("Error saving RCM:", error);
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to save RCM",
      );
    }
  };

  const handleEdit = (record) => {
    setEditingRecord(record);
    setShowCreateRcmForm(true);
    showInfo(`Editing RCM: ${record.selfInvoiceNumber}`);
  };

  const handleView = (record) => {
    setEditingRecord({ ...record, isViewMode: true });
    setShowCreateRcmForm(true);
    showInfo(`Viewing RCM: ${record.selfInvoiceNumber}`);
  };

  const handleDelete = async (id) => {
    try {
      await apiDelete(API_ENDPOINTS.RCM.DELETE(id));
      await fetchRcm();
      showSuccess("RCM deleted successfully!");
    } catch (error) {
      console.error("Error deleting RCM:", error);
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to delete RCM",
      );
    }
  };

  const handleRefresh = () => {
    fetchFinancialYears();
    fetchRcm();
    fetchBusinessSettings();
    setActiveCardFilter("total");
    showInfo("Data refreshed!");
  };

  const openSelfInvoicePreview = (record) => {
    setPreviewRecord(record);
    setShowSelfInvoicePreview(true);
  };

  const closeSelfInvoicePreview = () => {
    setShowSelfInvoicePreview(false);
    setPreviewRecord(null);
  };

  const getSelfInvoiceElementId = (record, index) => {
    return `self-invoice-print-${record.id || record.selfInvoiceNumber || index}`;
  };

  const exportSelfInvoicesPdf = async () => {
    if (!filteredRecords.length) {
      showError("No self invoices found for the selected filters.");
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
        const elementId = getSelfInvoiceElementId(record, i);
        const element = document.getElementById(elementId);

        if (!element) {
          throw new Error(`Self invoice element not found: ${elementId}`);
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
      pdf.save(`Self_Invoices_${fileDate}.pdf`);
      showSuccess("Self invoices PDF downloaded successfully!");
    } catch (error) {
      console.error("Multi self-invoice PDF error:", error);
      showError("Failed to generate self invoices PDF.");
    } finally {
      setExportingInvoices(false);
    }
  };

  const handleExportItemWiseExcel = () => {
    if (!filteredRecords.length) {
      showError("No RCM invoices found for the selected filters.");
      return;
    }

    try {
      exportItemWiseExcel({
        records: filteredRecords,
        exportFileName: "RCM_Management",
        sheetName: "RCM Item Wise",
        reportTitle: "RCM_Item_Wise",
        invoiceNumberKey: "selfInvoiceNumber",
        partyNameKey: "serviceProviderBusinessName",
        partyLabel: "Service Provider",
        dateKey: "invoiceDate",
        partyDetails: {
          gstinKey: "gstin",
          addressKey: "address",
          placeOfSupplyKey: "placeOfSupply",
        },
      });
      showSuccess("RCM item-wise Excel exported successfully!");
    } catch (error) {
      console.error("RCM item-wise Excel export error:", error);
      showError("Failed to export RCM item-wise Excel.");
    }
  };

  const handleExportItemWisePDF = () => {
    if (!filteredRecords.length) {
      showError("No RCM invoices found for the selected filters.");
      return;
    }

    try {
      exportItemWisePDF({
        records: filteredRecords,
        exportFileName: "RCM_Management",
        reportTitle: "RCM Report",
        invoiceNumberKey: "selfInvoiceNumber",
        partyNameKey: "serviceProviderBusinessName",
        partyLabel: "Service Provider",
        dateKey: "invoiceDate",
        partyDetails: {
          gstinKey: "gstin",
          addressKey: "address",
          placeOfSupplyKey: "placeOfSupply",
        },
      });
      showSuccess("RCM item-wise PDF exported successfully!");
    } catch (error) {
      console.error("RCM item-wise PDF export error:", error);
      showError("Failed to export RCM item-wise PDF.");
    }
  };

  const getStatusLabel = (status) => {
    if (status === "Paid") return "PAID";
    if (status === "Partial") return "PARTIAL";
    return "UNPAID";
  };

  const buildSelfInvoiceData = (record) => {
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
    const cgstPercent = 0;
    const sgstPercent = 0;
    const igstPercent = taxPercent;

    return {
      companyName: businessSettings.companyName || "",
      companyAddress: businessSettings.companyAddress || "",
      companyEmail: businessSettings.email || "",
      companyPhone: businessSettings.phone || "",
      companyWebsite: businessSettings.website || "",
      companyGstin: businessSettings.gstin || "",
      accountName: businessSettings.accountName || "",
      bankName: businessSettings.bankName || "",
      accountNumber: businessSettings.accountNumber || "",
      ifscCode: businessSettings.ifscCode || "",
      branchAddress: businessSettings.branchAddress || "",
      selfInvoiceNumber: record.selfInvoiceNumber || "",
      invoiceNumber: record.selfInvoiceNumber || "",
      invoiceDate: formatDateForDisplay(record.invoiceDate),
      createdDateTime:
        record.createdDateTime || formatDateTimeForDisplay(record.createdDate),
      originalRefNo: record.originalRefNo || "",
      orderNumber: record.originalRefNo || "",
      placeOfSupply: "Rajasthan (08)",
      clientName: record.serviceProviderBusinessName || "",
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
      amountReceived: toNumber(record.paidAmount || 0),
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
            <h4 className="fs-18 fw-semibold m-0">RCM Management</h4>
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
          tableTitle="RCM Records"
          showColumnSelector={true}
          showExport={true}
          showRefresh={true}
          showAdvancedFilter={true}
          showSearch={true}
          exportFileName="RCM_Management"
          exportTitle="RCM Management Report"
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
                ? "Generating Self Invoices PDF..."
                : "Self Invoices PDF",
              onClick: exportSelfInvoicesPdf,
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
              onClick={() => openSelfInvoicePreview(record)}
              title="Self Invoice Preview"
            >
              <i className="far fa-file-alt"></i>
            </button>
          )}
        />

        <CreateRcm
          show={showCreateRcmForm}
          onClose={() => {
            setShowCreateRcmForm(false);
            setEditingRecord(null);
          }}
          onSubmit={handleFormSubmit}
          editingRecord={editingRecord}
          defaultFinancialYear={getDefaultFinancialYearRecord()}
          existingInvoices={allRecords}
        />
      </div>

      {/* Self Invoice Preview Modal */}
      <SelfInvoicePreview
        show={showSelfInvoicePreview}
        onClose={closeSelfInvoicePreview}
        invoiceData={buildSelfInvoiceData(previewRecord)}
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
          <SelfInvoicePreview
            key={record.id || record.selfInvoiceNumber || index}
            id={getSelfInvoiceElementId(record, index)}
            show={true}
            renderMode="print"
            invoiceData={buildSelfInvoiceData(record)}
          />
        ))}
      </div>
    </>
  );
};

export default RcmManagement;
