import React, { useState, useEffect } from "react";
import ReusableTable from "../Components/ReusableTable";
import CreatePurchase from "../Components/CreatePurchase";
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

const PurchaseManagement = () => {
  const moduleKey = "purchaseManagement";
  const canCreate = hasActionPermission(moduleKey, "create");

  useEffect(() => {
    document.title = "Purchase Management | MaxCode IT Services";
  }, []);

  // State for records and loading
  const [allRecords, setAllRecords] = useState([]);
  const [records, setRecords] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [financialYears, setFinancialYears] = useState([]);
  const [selectedFinancialYear, setSelectedFinancialYear] = useState(
    localStorage.getItem("selectedFinancialYear") || "ALL",
  );
  const [financialPeriodMode, setFinancialPeriodMode] = useState("yearly");
  const [loading, setLoading] = useState(false);
  const [showCreatePurchaseForm, setShowCreatePurchaseForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [activeCardFilter, setActiveCardFilter] = useState("total");
  const [filteredRecords, setFilteredRecords] = useState([]);

  // Statistics state
  const [statistics, setStatistics] = useState({
    total: 0,
    paid: 0,
    unpaid: 0,
    partial: 0,
    totalAmount: 0,
  });

  // Card data array
  const cards = [
    {
      icon: "fas fa-rupee-sign",
      title: "Total Amount",
      key: "totalAmount",
      color: "info",
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
      icon: "fa-regular fa-calendar-days",
      title: "Financial Period",
      key: "period",
      color: "warning",
    },
    {
      icon: "fas fa-plus-circle",
      title: "Add New",
      key: "addNew",
      color: "success",
    },
  ];

  // Format date for display (DD/MM/YYYY)
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

  // Format date for display (DD/MM/YYYY | HH:MM:SS AM/PM)
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

  const toNumber = (value) => {
    const number = parseFloat(value);
    return Number.isNaN(number) ? 0 : number;
  };

  const formatCurrency = (value) => {
    return `₹ ${toNumber(value).toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const getDateOnly = (value) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  };

  const isWithinPeriodMode = (dateValue) => {
    const dateOnly = getDateOnly(dateValue);
    const today = getDateOnly(new Date());

    if (!dateOnly || !today) return false;

    if (financialPeriodMode === "daily") {
      return dateOnly.getTime() === today.getTime();
    }

    if (financialPeriodMode === "monthly") {
      return (
        dateOnly.getFullYear() === today.getFullYear() &&
        dateOnly.getMonth() === today.getMonth()
      );
    }

    if (financialPeriodMode === "quarterly") {
      const getQuarter = (date) => Math.floor(date.getMonth() / 3) + 1;
      return (
        dateOnly.getFullYear() === today.getFullYear() &&
        getQuarter(dateOnly) === getQuarter(today)
      );
    }

    if (financialPeriodMode === "halfYearly") {
      const getHalf = (date) => (date.getMonth() < 6 ? 1 : 2);
      return (
        dateOnly.getFullYear() === today.getFullYear() &&
        getHalf(dateOnly) === getHalf(today)
      );
    }

    if (financialPeriodMode === "yearly") {
      return dateOnly.getFullYear() === today.getFullYear();
    }

    return true;
  };

  useEffect(() => {
    fetchFinancialYears();
    fetchPurchases();
    fetchVendors();

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

  useEffect(() => {
    // Apply period filter when financialPeriodMode changes
    if (records.length > 0) {
      applyPeriodFilter(records);
    }
  }, [financialPeriodMode]);

  const applyPeriodFilter = (sourceRecords) => {
    if (!Array.isArray(sourceRecords)) {
      setFilteredRecords([]);
      return;
    }

    const periodFiltered = sourceRecords.filter((record) => {
      const recordDate = record.invoiceDate || record.createdDate;
      return isWithinPeriodMode(recordDate);
    });

    setFilteredRecords(periodFiltered);
  };

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
      setFilteredRecords([]);
      updateStatistics([]);
      return;
    }

    if (!selectedYear || selectedYear === "ALL") {
      setRecords(sourceRecords);
      updateStatistics(sourceRecords);
      applyPeriodFilter(sourceRecords);
      return;
    }

    const matchedYear = financialYears.find(
      (year) => year.value === selectedYear,
    );

    if (!matchedYear?.startDate || !matchedYear?.endDate) {
      setRecords(sourceRecords);
      updateStatistics(sourceRecords);
      applyPeriodFilter(sourceRecords);
      return;
    }

    const startDate = getDateOnly(matchedYear.startDate);
    const endDate = getDateOnly(matchedYear.endDate);

    if (!startDate || !endDate) {
      setRecords(sourceRecords);
      updateStatistics(sourceRecords);
      applyPeriodFilter(sourceRecords);
      return;
    }

    const filteredRecords = sourceRecords.filter((record) => {
      const invoiceDate = getDateOnly(record.invoiceDate);
      if (!invoiceDate) return false;
      return invoiceDate >= startDate && invoiceDate <= endDate;
    });

    setRecords(filteredRecords);
    updateStatistics(filteredRecords);
    applyPeriodFilter(filteredRecords);
  };

  const fetchPurchases = async () => {
    setLoading(true);
    try {
      const response = await apiGet(API_ENDPOINTS.PURCHASES.LIST);
      const purchasesData = Array.isArray(response.data)
        ? response.data
        : response.data?.purchases || [];

      const normalizedPurchases = purchasesData.map((purchase) => ({
        ...purchase,
        id: purchase._id || purchase.id,
      }));

      setAllRecords(normalizedPurchases);
    } catch (err) {
      console.error("API fetch error:", err);
      showError("Failed to fetch purchases");
      setAllRecords([]);
      setRecords([]);
      setFilteredRecords([]);
      updateStatistics([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchVendors = async () => {
    try {
      const response = await apiGet(API_ENDPOINTS.VENDORS.LIST);
      const vendorsData = Array.isArray(response.data)
        ? response.data
        : response.data?.vendors || [];

      const activeVendors = vendorsData
        .filter((v) => v?.isDeleted !== true)
        .map((vendor) => ({
          ...vendor,
          id: vendor.id || vendor._id,
        }));
      setVendors(activeVendors);
    } catch (err) {
      console.error("Vendors API fetch error:", err);
      showError("Failed to fetch vendors");
      setVendors([]);
    }
  };

  // Update statistics
  const updateStatistics = (data) => {
    // Calculate total purchase amount, total paid amount, and unpaid amount
    const totalAmount = data.reduce(
      (sum, r) => sum + parseFloat(r.taxData?.totalAmount || 0),
      0,
    );
    // Paid amount: sum of paid and partial records' paid amount (if available, else fallback to totalAmount for paid)
    const paidAmount = data
      .filter(
        (r) => r.paymentStatus === "Paid" || r.paymentStatus === "Partial",
      )
      .reduce((sum, r) => {
        // If amountReceived exists, use it, else for Paid use totalAmount, for Partial use half of totalAmount as fallback
        if (r.amountReceived !== undefined && r.amountReceived !== null) {
          return sum + parseFloat(r.amountReceived || 0);
        } else if (r.paymentStatus === "Paid") {
          return sum + parseFloat(r.taxData?.totalAmount || 0);
        } else if (r.paymentStatus === "Partial") {
          return sum + parseFloat(r.taxData?.totalAmount || 0) / 2;
        }
        return sum;
      }, 0);
    const unpaidAmount = totalAmount - paidAmount;

    const stats = {
      total: data.length,
      paid: paidAmount.toFixed(2),
      unpaid: unpaidAmount.toFixed(2),
      partial: data.filter((r) => r.paymentStatus === "Partial").length,
      totalAmount: totalAmount.toFixed(2),
    };
    setStatistics(stats);
  };

  // Prepare data for table (add serial number and formatted dates)
  const prepareTableData = () => {
    return filteredRecords.map((record, index) => ({
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

  // Columns configuration
  const columns = [
    { key: "sn", label: "S.No", width: 70 },
    { key: "invoiceNumber", label: "Invoice No.", width: 130 },
    {
      key: "invoiceDateFormatted",
      label: "Invoice Date",
      width: 130,
    },
    { key: "vendorName", label: "Vendor Name", width: 150 },
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
    {
      key: "paymentDateFormatted",
      label: "Payment Date",
      width: 130,
    },
    {
      key: "invoiceType",
      label: "Invoice Type",
      width: 130,
      render: (value) => {
        let badgeClass = "bg-secondary";
        if (value === "ITC") badgeClass = "bg-success";
        else if (value === "Not ITC") badgeClass = "bg-warning";
        else if (value === "RCM") badgeClass = "bg-info";
        else if (value === "RCM + ITC") badgeClass = "bg-primary";
        return <span className={`badge ${badgeClass}`}>{value}</span>;
      },
    },
    { key: "createdDateTime", label: "Created Date & Time", width: 200 },
    { key: "action", label: "Actions", width: 150 },
  ];

  const fixedColumns = ["sn"];
  const defaultVisibleColumns = [
    "sn",
    "invoiceNumber",
    "invoiceDateFormatted",
    "vendorName",
    "businessName",
    "itemCount",
    "totalAmount",
    "roundingAmount",
    "paymentStatus",
    "paymentMethod",
    "invoiceType",
    "createdDateTime",
    "action",
  ];

  // Columns with dropdown filter
  const columnsWithDropdownFilter = [
    "paymentStatus",
    "paymentMethod",
    "invoiceType",
  ];

  // Columns with date range filter
  const columnsWithDateFilter = [
    "createdDateTime",
    "invoiceDateFormatted",
    "paymentDateFormatted",
  ];

  // Filter options
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
    invoiceType: ["All", "Not ITC", "ITC", "RCM", "RCM + ITC"],
  };

  // Handle card click
  const handleCardClick = (cardKey) => {
    if (cardKey === "addNew") {
      if (!canCreate) {
        showError("You don't have permission to add purchases");
        return;
      }
      setEditingRecord(null);
      setShowCreatePurchaseForm(true);
    } else if (cardKey === "period") {
      const periodCycle = [
        "daily",
        "monthly",
        "quarterly",
        "halfYearly",
        "yearly",
      ];

      setFinancialPeriodMode((prev) => {
        const currentIndex = periodCycle.indexOf(prev);
        if (currentIndex === -1) return "daily";
        return periodCycle[(currentIndex + 1) % periodCycle.length];
      });
    } else {
      setActiveCardFilter(cardKey);
    }
  };

  // Get card number for styling
  const getCardNumber = (index) => {
    return (index % 8) + 1;
  };

  // Handle form submit
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
          `Please select default financial year ${defaultFinancialYear.value} in navbar before creating purchase.`,
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
    }

    const selectedVendor = vendors.find(
      (v) => v.id == formData.vendorId || v._id == formData.vendorId,
    );

    const vendorName =
      selectedVendor?.vendorName || editingRecord?.vendorName || "";

    try {
      if (editingRecord && !editingRecord.isViewMode) {
        const purchaseId = editingRecord._id || editingRecord.id;
        const payload = {
          ...formData,
          vendorName,
          createdDate: editingRecord.createdDate,
        };

        await apiPut(API_ENDPOINTS.PURCHASES.UPDATE(purchaseId), payload);
        showSuccess("Purchase updated successfully!");
      } else {
        const payload = {
          ...formData,
          vendorName,
          createdDate: new Date().toISOString(),
        };

        await apiPost(API_ENDPOINTS.PURCHASES.CREATE, payload);
        showSuccess("Purchase added successfully!");
      }

      await fetchPurchases();
      setShowCreatePurchaseForm(false);
      setEditingRecord(null);
    } catch (error) {
      console.error("Error saving purchase:", error);
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to save purchase",
      );
      throw error;
    }
  };

  // Handle edit
  const handleEdit = (record) => {
    setEditingRecord(record);
    setShowCreatePurchaseForm(true);
    showInfo(`Editing purchase: ${record.invoiceNumber}`);
  };

  // Handle view
  const handleView = (record) => {
    setEditingRecord({ ...record, isViewMode: true });
    setShowCreatePurchaseForm(true);
    showInfo(`Viewing purchase: ${record.invoiceNumber}`);
  };

  // Handle delete
  const handleDelete = async (id) => {
    try {
      // Soft delete: set isDeleted true
      await apiPut(API_ENDPOINTS.PURCHASES.UPDATE(id), {
        isDeleted: true,
        deletedAt: new Date().toISOString(),
      });
      await fetchPurchases();
      showSuccess("Purchase deleted successfully!");
    } catch (error) {
      console.error("Error deleting purchase:", error);
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to delete purchase",
      );
    }
  };

  // Handle refresh
  const handleRefresh = () => {
    fetchFinancialYears();
    fetchPurchases();
    fetchVendors();
    setActiveCardFilter("total");
    setFinancialPeriodMode("yearly");
    showInfo("Data refreshed!");
  };

  const handleExportItemWiseExcel = () => {
    if (!filteredRecords.length) {
      showError("No purchase invoices found for the selected filters.");
      return;
    }

    try {
      exportItemWiseExcel({
        records: filteredRecords,
        exportFileName: "Purchase_Management",
        sheetName: "Purchase Item Wise",
        reportTitle: "Purchase_Item_Wise",
        invoiceNumberKey: "invoiceNumber",
        partyNameKey: "vendorName",
        partyLabel: "Vendor Name",
        dateKey: "invoiceDate",
        partyDetails: {
          gstinKey: "gstin",
          addressKey: "address",
          placeOfSupplyKey: "placeOfSupply",
        },
      });
      showSuccess("Purchase item-wise Excel exported successfully!");
    } catch (error) {
      console.error("Purchase item-wise Excel export error:", error);
      showError("Failed to export Purchase item-wise Excel.");
    }
  };

  const handleExportItemWisePDF = () => {
    if (!filteredRecords.length) {
      showError("No purchase invoices found for the selected filters.");
      return;
    }

    try {
      exportItemWisePDF({
        records: filteredRecords,
        exportFileName: "Purchase_Management",
        reportTitle: "Purchase Report",
        invoiceNumberKey: "invoiceNumber",
        partyNameKey: "vendorName",
        partyLabel: "Vendor Name",
        dateKey: "invoiceDate",
        partyDetails: {
          gstinKey: "gstin",
          addressKey: "address",
          placeOfSupplyKey: "placeOfSupply",
        },
      });
      showSuccess("Purchase item-wise PDF exported successfully!");
    } catch (error) {
      console.error("Purchase item-wise PDF export error:", error);
      showError("Failed to export Purchase item-wise PDF.");
    }
  };

  // Get the current period display value
  const getPeriodDisplayValue = () => {
    return financialPeriodMode === "daily"
      ? "Daily"
      : financialPeriodMode === "monthly"
        ? "Monthly"
        : financialPeriodMode === "quarterly"
          ? "Quarterly"
          : financialPeriodMode === "halfYearly"
            ? "Half Yearly"
            : "Yearly";
  };

  return (
    <>
      <div className="container-fluid">
        <div
          className="py-3 d-flex align-items-sm-center flex-sm-row flex-column"
          style={{ marginTop: "70px" }}
        >
          <div className="flex-grow-1">
            <h4 className="fs-18 fw-semibold m-0">Purchase Management</h4>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="row">
          {cards.map((card, index) => {
            const cardNumber = getCardNumber(index);
            const cardClass = `card${cardNumber}`;
            const cardIconBgClass = `card-icon-bg${cardNumber}`;
            const isActive =
              activeCardFilter === card.key &&
              card.key !== "addNew" &&
              card.key !== "period";
            const isAddNewDisabled = card.key === "addNew" && !canCreate;

            // Determine the value to display
            let displayValue;
            if (card.key === "addNew") {
              displayValue = "+ Add New";
            } else if (card.key === "period") {
              displayValue = `${
                selectedFinancialYear === "ALL"
                  ? "All Year"
                  : selectedFinancialYear
              } • ${getPeriodDisplayValue()}`;
            } else if (card.key === "totalAmount") {
              displayValue = `₹ ${parseFloat(
                statistics[card.key] || 0,
              ).toLocaleString("en-IN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`;
            } else {
              displayValue = statistics[card.key];
            }

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
                    if (
                      (card.key === "addNew" && !isAddNewDisabled) ||
                      card.key === "period"
                    ) {
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
                        {displayValue}
                      </h6>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Reusable Table */}
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
          tableTitle="Purchase Records"
          showColumnSelector={true}
          showExport={true}
          showRefresh={true}
          showAdvancedFilter={true}
          showSearch={true}
          exportFileName="Purchase_Management"
          exportTitle="Purchase Management Report"
          extraExportItems={[
            {
              label: "Export Excel with Item",
              onClick: handleExportItemWiseExcel,
            },
            {
              label: "PDF with Item",
              onClick: handleExportItemWisePDF,
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
        />

        {/* Create/Edit Purchase Modal */}
        <CreatePurchase
          show={showCreatePurchaseForm}
          onClose={() => {
            setShowCreatePurchaseForm(false);
            setEditingRecord(null);
          }}
          onSubmit={handleFormSubmit}
          editingRecord={editingRecord}
          vendors={vendors}
        />
      </div>
    </>
  );
};

export default PurchaseManagement;
