import React, { useState, useEffect, useMemo, useRef } from "react";
import ReusableTable from "../Components/ReusableTable";
import CreatePaymentReceipt from "../Components/CreatePaymentReceipt";
import PaymentReceiptPreview from "../Components/PaymentReceiptPreview";
import ConfirmationModal from "../Components/ConfirmationModal";
import { showSuccess, showError } from "../Components/ToastNotification";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { apiGet, apiDelete, apiPost } from "../utils/api";
import { hasActionPermission } from "../utils/permissions";

const AdvancePaymentManagement = () => {
  const moduleKey = "advancePaymentManagement";
  const canCreate = hasActionPermission(moduleKey, "create");

  const [serverSide, setServerSide] = useState(true);
  const [prefLoading, setPrefLoading] = useState(true);
  const [dynamicFilterOptions, setDynamicFilterOptions] = useState({});

  useEffect(() => {
    document.title = "Advance Payments | MaxCode IT Services";
    const fetchPreference = async () => {
      try {
        const res = await apiGet("/user-preferences");
        if (typeof res.data?.advancePaymentManagementServerSide === "boolean") {
          setServerSide(res.data.advancePaymentManagementServerSide);
        }
      } catch {
      } finally {
        setPrefLoading(false);
      }
    };
    fetchPreference();
  }, []);

  useEffect(() => {
    if (prefLoading) return;
    const save = async () => {
      try {
        await apiPost("/user-preferences", {
          advancePaymentManagementServerSide: serverSide,
        });
      } catch {}
    };
    save();
  }, [serverSide, prefLoading]);

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [activeCardFilter, setActiveCardFilter] = useState("total");
  const [showPreview, setShowPreview] = useState(false);
  const [previewRecord, setPreviewRecord] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState(null);
  const [businessSettings, setBusinessSettings] = useState({});

  const [selectedFinancialYear, setSelectedFinancialYear] = useState(
    localStorage.getItem("selectedFinancialYear") || "ALL",
  );
  const [financialPeriodMode, setFinancialPeriodMode] = useState("yearly");

  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(10);
  const [filters, setFilters] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState(null);
  const [sortDirection, setSortDirection] = useState("normal");

  const debounceTimeoutRef = useRef(null);
  const debounceColumnTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null);

  const [statistics, setStatistics] = useState({
    total: 0,
    unapplied: 0,
    partiallyApplied: 0,
    fullyApplied: 0,
    totalAmount: 0,
    pendingAmount: 0,
  });

  const columnsWithDateFilter = ["createdDateTime", "receiptDateFormatted"];

  useEffect(() => {
    const handler = (event) => {
      const selectedYear =
        event?.detail?.selectedFinancialYear ||
        localStorage.getItem("selectedFinancialYear") ||
        "ALL";
      setSelectedFinancialYear(selectedYear);
      if (serverSide) setCurrentPage(1);
    };
    window.addEventListener("financialYearSelectionChanged", handler);
    return () =>
      window.removeEventListener("financialYearSelectionChanged", handler);
  }, [serverSide]);

  useEffect(() => {
    const fetchBizSettings = async () => {
      try {
        const res = await apiGet(API_ENDPOINTS.BUSINESS_SETTINGS.GET);
        if (res?.data?.settings) setBusinessSettings(res.data.settings);
      } catch {}
    };
    fetchBizSettings();
  }, []);

  const fetchAdvances = async () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    if (prefLoading) return;
    setLoading(true);

    try {
      let url = API_ENDPOINTS.PAYMENT_RECEIPTS.LIST;
      const params = new URLSearchParams();
      // Always filter to advance only
      params.append("paymentType", "advance");

      if (serverSide) {
        params.append("page", currentPage);
        params.append("limit", recordsPerPage);
        if (searchTerm) params.append("search", searchTerm);
        if (selectedFinancialYear && selectedFinancialYear !== "ALL")
          params.append("financialYear", selectedFinancialYear);
        if (financialPeriodMode && financialPeriodMode !== "yearly")
          params.append("period", financialPeriodMode);

        Object.entries(filters).forEach(([key, value]) => {
          if (["sn", "action"].includes(key)) return;
          if (
            value === undefined ||
            value === null ||
            value === "" ||
            value === "All"
          )
            return;
          if (columnsWithDateFilter.includes(key)) {
            if (value && typeof value === "object") {
              const backendKey =
                key === "receiptDateFormatted"
                  ? "receiptDate"
                  : key === "createdDateTime"
                    ? "createdAt"
                    : key;
              if (value.startDate)
                params.append(`${backendKey}_start`, value.startDate);
              if (value.endDate)
                params.append(`${backendKey}_end`, value.endDate);
            }
          } else {
            if (Array.isArray(value) && value.length > 0)
              params.append(key, value.join(","));
            else if (!Array.isArray(value)) params.append(key, value);
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
      } else {
        url = `${url}?${params.toString()}`;
      }

      const response = await apiGet(url, { signal: controller.signal });
      let data, total;

      if (serverSide) {
        data = response.data?.records || [];
        total = response.data?.total || data.length;
        if (response.data?.meta) {
          const meta = response.data.meta;
          setDynamicFilterOptions({
            paymentMethod: meta.paymentMethods
              ? ["All", ...meta.paymentMethods]
              : [],
          });
        }
      } else {
        data = Array.isArray(response.data?.records)
          ? response.data.records
          : [];
        total = data.length;
      }

      // Compute per-row stats
      let unapplied = 0,
        partiallyApplied = 0,
        fullyApplied = 0,
        totalAmount = 0,
        pendingAmount = 0;
      const mapped = data.map((r, idx) => {
        const amt = Number(r.amount || 0);
        const adjusted = Number(r.adjustedAmount || 0);
        const refunded = Number(r.refundedAmount || 0);
        const available = Math.max(0, amt - adjusted - refunded);
        let status;
        if (adjusted >= amt) {
          status = "Fully Applied";
          fullyApplied++;
        } else if (adjusted > 0) {
          status = "Partially Applied";
          partiallyApplied++;
        } else {
          status = "Unapplied";
          unapplied++;
        }
        totalAmount += amt;
        pendingAmount += available;

        return {
          ...r,
          id: r._id || r.id,
          sn: (currentPage - 1) * recordsPerPage + idx + 1,
          receiptDateFormatted: r.receiptDate || "",
          amountFormatted: `₹${amt.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
          adjustedAmountFormatted: `₹${adjusted.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
          refundedAmountFormatted: `₹${refunded.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
          availableAmountFormatted: `₹${available.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
          adjustmentStatus: status,
          linkedInvoiceDisplay:
            r.linkedInvoiceNumber || (r.linkedInvoiceId ? "Linked" : "—"),
        };
      });

      setStatistics({
        total: total,
        unapplied,
        partiallyApplied,
        fullyApplied,
        totalAmount,
        pendingAmount,
      });

      setRecords(mapped);
      setTotalRecords(total);
    } catch (err) {
      if (err.name === "CanceledError" || err.name === "AbortError") return;
      console.error("Failed to fetch advance payments:", err);
      showError("Failed to fetch advance payments");
      setRecords([]);
      setTotalRecords(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (prefLoading) return;
    if (debounceTimeoutRef.current) clearTimeout(debounceTimeoutRef.current);
    debounceTimeoutRef.current = setTimeout(
      fetchAdvances,
      serverSide ? 400 : 0,
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
    selectedFinancialYear,
    financialPeriodMode,
    prefLoading,
  ]);

  const handleDelete = async () => {
    if (!recordToDelete) return;
    try {
      await apiDelete(
        API_ENDPOINTS.PAYMENT_RECEIPTS.DELETE(
          recordToDelete.id || recordToDelete._id,
        ),
      );
      showSuccess("Advance payment deleted successfully");
      setShowDeleteConfirm(false);
      setRecordToDelete(null);
      fetchAdvances();
    } catch (err) {
      showError(
        err?.response?.data?.error || "Failed to delete advance payment",
      );
    }
  };

  const handleCardClick = (key) => {
    if (key === "addNew") {
      if (canCreate) setShowCreateForm(true);
      return;
    }
    setActiveCardFilter(key);
    setCurrentPage(1);
  };

  const cards = [
    {
      icon: "fa-solid fa-hand-holding-dollar",
      title: "Total Advances",
      key: "total",
      color: "primary",
      count: statistics.total,
    },
    {
      icon: "fas fa-rupee-sign",
      title: "Total Amount",
      key: "totalAmount",
      color: "info",
      count: statistics.totalAmount,
      isCurrency: true,
    },
    {
      icon: "fa-solid fa-hourglass-start",
      title: "Unapplied",
      key: "unapplied",
      color: "warning",
      count: statistics.unapplied,
    },
    {
      icon: "fa-solid fa-hourglass-half",
      title: "Partial",
      key: "partial",
      color: "orange",
      count: statistics.partiallyApplied,
    },
    {
      icon: "fa-solid fa-circle-check",
      title: "Fully Applied",
      key: "fullyApplied",
      color: "success",
      count: statistics.fullyApplied,
    },
    {
      icon: "fa-regular fa-calendar-days",
      title: "Financial Period",
      key: "period",
      color: "warning",
    },
    {
      icon: "fas fa-plus-circle",
      title: "New Advance",
      key: "addNew",
      color: "success",
    },
  ];

  const columns = [
    { key: "sn", label: "S.No", sortable: false, filterable: false },
    {
      key: "receiptNumber",
      label: "Receipt No.",
      sortable: true,
      filterable: true,
    },
    {
      key: "receiptDateFormatted",
      label: "Date",
      sortable: true,
      filterable: true,
      filterType: "dateRange",
    },
    {
      key: "clientName",
      label: "Client Name",
      sortable: true,
      filterable: true,
    },
    {
      key: "businessName",
      label: "Business Name",
      sortable: true,
      filterable: true,
    },
    {
      key: "amountFormatted",
      label: "Advance Amount",
      sortable: false,
      filterable: false,
    },
    {
      key: "adjustedAmountFormatted",
      label: "Applied",
      sortable: false,
      filterable: false,
    },
    {
      key: "availableAmountFormatted",
      label: "Balance",
      sortable: false,
      filterable: false,
    },
    {
      key: "adjustmentStatus",
      label: "Status",
      sortable: false,
      filterable: true,
      filterType: "dropdown",
      filterOptions: ["All", "Unapplied", "Partially Applied", "Fully Applied"],
    },
    {
      key: "paymentMethod",
      label: "Payment Method",
      sortable: true,
      filterable: true,
      filterType: "dropdown",
      filterOptions: dynamicFilterOptions.paymentMethod || [],
    },
    {
      key: "linkedInvoiceDisplay",
      label: "Linked Invoice",
      sortable: false,
      filterable: false,
    },
    { key: "note", label: "Note", sortable: false, filterable: false },
    { key: "action", label: "Actions", sortable: false, filterable: false },
  ];

  const buildReceiptPreviewData = (record) => ({
    companyName: businessSettings.companyName || "MaxCode IT Services",
    companyAddress: businessSettings.companyAddress || "Jaipur, Rajasthan",
    companyPhone: businessSettings.phone || "",
    companyEmail: businessSettings.email || "",
    companyWebsite: businessSettings.website || "www.maxcode.in",
    receiptNo: record.receiptNumber || "RCPT/0001",
    memoNo: record.receiptNumber || "RCPT/0001",
    receiptDate: record.receiptDate || "",
    clientName: record.clientName || "",
    businessName: record.businessName || "",
    contactNo: record.phoneNumber || "",
    paymentMethod: record.paymentMethod || "",
    bankName: record.bankName || "",
    purpose: record.purpose || "Advance Payment",
    amount: Number(record.amount || 0),
    invoiceNumber: "Advance Payment",
    note: record.note || "",
    receivedBy: businessSettings.companyName || "MaxCode IT Services",
    invoiceTermsVersion:
      record.invoiceTermsVersion || businessSettings.invoiceTermsVersion || "",
     invoiceTermsConditionsSnapshot: record.invoiceTermsConditionsSnapshot || null,
  });

  const preparedData = useMemo(() => records, [records]);

  const getCardNumber = (index) => (index % 8) + 1;

  const getPeriodDisplayValue = () => {
    if (financialPeriodMode === "daily") return "Daily";
    if (financialPeriodMode === "monthly") return "Monthly";
    if (financialPeriodMode === "quarterly") return "Quarterly";
    if (financialPeriodMode === "halfYearly") return "Half Yearly";
    return "Yearly";
  };

  const handleDebouncedColumnFilterChange = (key, value) => {
    if (serverSide) {
      if (debounceColumnTimeoutRef.current)
        clearTimeout(debounceColumnTimeoutRef.current);
      debounceColumnTimeoutRef.current = setTimeout(() => {
        setFilters((prev) => ({ ...prev, [key]: value }));
        setCurrentPage(1);
      }, 500);
    } else {
      setFilters((prev) => ({ ...prev, [key]: value }));
    }
  };

  return (
    <div className="container-fluid">
      <div
        className="py-3 d-flex justify-content-between align-items-center flex-wrap"
        style={{ marginTop: "70px" }}
      >
        <h4 className="fs-18 fw-semibold m-0">Advance Payment Management</h4>
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
              setFinancialPeriodMode("yearly");
            }}
            id="advancePaymentServerSideToggle"
          />
          <label
            className="form-check-label ms-2"
            htmlFor="advancePaymentServerSideToggle"
          >
            Server-side Mode {serverSide ? "(Enabled)" : "(Disabled)"}
          </label>
        </div>
      </div>

      {/* Info Banner */}
      <div className="alert alert-info border-0 mb-3 d-flex align-items-start gap-2">
        <i className="fa-solid fa-circle-info mt-1 flex-shrink-0" />
        <div>
          <strong>Advance Payment Management</strong> — Record advance payments
          from clients. When you create the final invoice for a client, any
          unapplied advance amounts will be shown for auto-adjustment. The
          balance sheet and ledger will reflect the adjustment automatically.
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

          let displayValue;
          if (card.key === "addNew") {
            displayValue = "+ Add New";
          } else if (card.key === "period") {
            displayValue = `${
              selectedFinancialYear === "ALL"
                ? "All Year"
                : selectedFinancialYear
            } • ${getPeriodDisplayValue()}`;
          } else if (card.isCurrency) {
            displayValue = `₹ ${parseFloat(card.count || 0).toLocaleString(
              "en-IN",
              {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              },
            )}`;
          } else {
            displayValue = card.count || 0;
          }

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
                  <h5 className="mb-2 fw-bold" style={{ fontSize: "16px" }}>{card.title}</h5>
                  <h6 className="mb-0 text-muted fw-bold">{displayValue}</h6>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Table */}
      <ReusableTable
        moduleKey={moduleKey}
        columns={columns}
        data={preparedData}
        loading={loading}
        totalRecords={totalRecords}
        tableTitle="Advance Payments"
        showColumnSelector={true}
        showExport={true}
        showRefresh={true}
        showAdvancedFilter={true}
        showSearch={true}
        exportFileName="Advance_Payments"
        exportTitle="Advance Payment Report"
        serverSide={serverSide}
        onServerSideSearch={(term) => {
          setSearchTerm(term);
          setCurrentPage(1);
        }}
        onServerSideFilter={(f) => {
          setFilters(f);
          setCurrentPage(1);
        }}
        onServerSideSort={(field, dir) => {
          setSortField(field);
          setSortDirection(dir);
          setCurrentPage(1);
        }}
        onServerSidePageChange={setCurrentPage}
        onServerSideRecordsPerPageChange={(val) => {
          setRecordsPerPage(val);
          setCurrentPage(1);
        }}
        onColumnFilterChange={handleDebouncedColumnFilterChange}
        currentPage={currentPage}
        recordsPerPage={recordsPerPage}
        onPageChange={setCurrentPage}
        onRecordsPerPageChange={(val) => {
          setRecordsPerPage(val);
          setCurrentPage(1);
        }}
        columnsWithDateFilter={columnsWithDateFilter}
        filterOptions={dynamicFilterOptions}
        onRefresh={() => {
          setFilters({});
          setSearchTerm("");
          setSortField(null);
          setSortDirection("normal");
          setCurrentPage(1);
          setActiveCardFilter("total");
          setFinancialPeriodMode("yearly");
          fetchAdvances();
        }}
        skipDeleteConfirmation={true}
        onDelete={(record) => {
          if (record.adjustmentStatus !== "Unapplied") return;
          setRecordToDelete(record);
          setShowDeleteConfirm(true);
        }}
        onEdit={(record) => {
          if (record.adjustmentStatus !== "Unapplied") return;
          setEditingRecord(record);
          setShowCreateForm(true);
        }}
        showActions={true}
        actions={["edit", "delete"]}
        customActions={(record) => (
          <button
            type="button"
            className="btn btn-sm btn-outline-primary me-1"
            title="Preview Receipt"
            onClick={() => {
              setPreviewRecord(buildReceiptPreviewData(record));
              setShowPreview(true);
            }}
          >
            <i className="fa-solid fa-eye"></i>
          </button>
        )}
        rowClassName={(record) => {
          if (record.adjustmentStatus === "Fully Applied")
            return "table-success";
          if (record.adjustmentStatus === "Partially Applied")
            return "table-warning";
          if (record.adjustmentStatus === "Unapplied") return "table-info";
          return "";
        }}
        exportApi={API_ENDPOINTS.PAYMENT_RECEIPTS.LIST}
      />

      {/* Create / Edit Form (advance type forced) */}
      {showCreateForm && (
        <CreatePaymentReceipt
          show={showCreateForm}
          onClose={() => {
            setShowCreateForm(false);
            setEditingRecord(null);
          }}
          onSubmit={() => fetchAdvances()}
          editingRecord={editingRecord}
          defaultPaymentType="advance"
        />
      )}

      {/* Preview */}
      {showPreview && previewRecord && (
        <PaymentReceiptPreview
          id="advance-payment-receipt-preview"
          receiptData={previewRecord}
          show={showPreview}
          onClose={() => {
            setShowPreview(false);
            setPreviewRecord(null);
          }}
          renderMode="modal"
        />
      )}

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <ConfirmationModal
          show={showDeleteConfirm}
          title="Delete Advance Payment"
          message={`Are you sure you want to delete advance receipt "${recordToDelete?.receiptNumber}"?`}
          confirmText="Delete"
          confirmVariant="danger"
          onConfirm={handleDelete}
          onCancel={() => {
            setShowDeleteConfirm(false);
            setRecordToDelete(null);
          }}
        />
      )}
    </div>
  );
};

export default AdvancePaymentManagement;
