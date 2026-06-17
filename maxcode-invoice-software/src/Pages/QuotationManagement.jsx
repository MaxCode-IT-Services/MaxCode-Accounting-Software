import React, { useEffect, useMemo, useRef, useState } from "react";
import ReusableTable from "../Components/ReusableTable";
import CreateQuotation from "../Components/CreateQuotation";
import ConfirmationModal from "../Components/ConfirmationModal";
import UploadedFilePreviewBox from "../Components/UploadedFilePreviewBox";
import {
  showError,
  showInfo,
  showSuccess,
} from "../Components/ToastNotification";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { apiDelete, apiGet, apiPost } from "../utils/api";
import { hasActionPermission } from "../utils/permissions";

const QuotationManagement = () => {
  const moduleKey = "quotationManagement";
  const canCreate = hasActionPermission(moduleKey, "create");

  const [serverSide, setServerSide] = useState(true);
  const [prefLoading, setPrefLoading] = useState(true);
  const [dynamicFilterOptions, setDynamicFilterOptions] = useState({});

  const [records, setRecords] = useState([]);
  const [financialYears, setFinancialYears] = useState([]);
  const [selectedFinancialYear, setSelectedFinancialYear] = useState(
    localStorage.getItem("selectedFinancialYear") || "ALL",
  );
  const [loading, setLoading] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);
  const [showCreateQuotationForm, setShowCreateQuotationForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [activeCardFilter, setActiveCardFilter] = useState("total");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [quotationToDelete, setQuotationToDelete] = useState(null);

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
    send: 0,
    approve: 0,
    reject: 0,
    expired: 0,
  });

  const columnsWithDateFilter = [
    "createdDateTime",
    "quotationDate",
    "quotationExpiryDate",
    "quotationSendDate",
    "quotationApproveDate",
    "quotationRejectDate",
  ];

  useEffect(() => {
    document.title = "Quotation Management | MaxCode IT Services";
    fetchFinancialYears();

    const fetchPreference = async () => {
      try {
        const response = await apiGet("/user-preferences");
        if (typeof response.data?.quotationManagementServerSide === "boolean") {
          setServerSide(response.data.quotationManagementServerSide);
        }
      } catch (error) {
        // keep defaults
      } finally {
        setPrefLoading(false);
      }
    };

    fetchPreference();

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
    if (prefLoading) return;

    const savePreference = async () => {
      try {
        await apiPost("/user-preferences", {
          quotationManagementServerSide: serverSide,
        });
      } catch (error) {
        // ignore
      }
    };

    savePreference();
  }, [serverSide, prefLoading]);

  const updateStatistics = (data) => {
    const activeRecords = data.filter((record) => record.isDeleted !== true);

    setStatistics({
      total: activeRecords.length,
      send: activeRecords.filter((record) =>
        ["Send", "Send + Approve"].includes(record.quotationStatus),
      ).length,
      approve: activeRecords.filter((record) =>
        ["Approve", "Send + Approve"].includes(record.quotationStatus),
      ).length,
      reject: activeRecords.filter(
        (record) => record.quotationStatus === "Reject",
      ).length,
      expired: activeRecords.filter(
        (record) => record.quotationStatus === "Expired",
      ).length,
    });
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

  const fetchQuotations = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (prefLoading) return;

    setLoading(true);

    try {
      let url = API_ENDPOINTS.QUOTATIONS.LIST;
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
          )
            return;

          if (
            columnsWithDateFilter.includes(key) &&
            typeof value === "object"
          ) {
            if (value.startDate) {
              const backendKey = key === "createdDateTime" ? "createdAt" : key;
              params.append(`${backendKey}_start`, value.startDate);
            }
            if (value.endDate) {
              const backendKey = key === "createdDateTime" ? "createdAt" : key;
              params.append(`${backendKey}_end`, value.endDate);
            }
            return;
          }

          if (Array.isArray(value) && value.length > 0) {
            params.append(key, value.join(","));
            return;
          }

          if (!Array.isArray(value)) {
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

      const responseBody = response?.data;

      let quotationsData;
      let total;

      if (serverSide) {
        quotationsData =
          responseBody?.data || responseBody?.quotations || responseBody || [];
        total =
          responseBody?.pagination?.totalRecords ||
          responseBody?.total ||
          (Array.isArray(quotationsData) ? quotationsData.length : 0);

        if (responseBody?.statistics) {
          setStatistics(responseBody.statistics);
        }

        if (responseBody?.filterOptions) {
          setDynamicFilterOptions(responseBody.filterOptions);
        }
      } else {
        quotationsData =
          responseBody?.data ||
          responseBody?.quotations ||
          (Array.isArray(responseBody) ? responseBody : []);
        total = Array.isArray(quotationsData) ? quotationsData.length : 0;
      }

      if (!Array.isArray(quotationsData)) {
        quotationsData = [];
      }

      const mappedData = quotationsData.map((record) => {
        const createdDate =
          record.createdDate || record.createdAt || record.created_on;
        const quotationFileLink = record.quotationFileURL || "";

        return {
          ...record,
          id: record._id || record.id,
          createdDate,
          quotationExpiryDate:
            record.quotationExpiryDate || record.quotationValidity || "",
          quotationTotalAmount: Number(record.quotationTotalAmount || 0),
          quotationFileLink,
        };
      });

      setRecords(mappedData);
      setTotalRecords(total);

      if (!serverSide) {
        updateStatistics(mappedData);
      }
    } catch (error) {
      if (error.name === "CanceledError" || error.name === "AbortError") return;

      const backendMessage =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.message ||
        "Failed to fetch quotations";

      showError(backendMessage);
      setRecords([]);
      setTotalRecords(0);
      updateStatistics([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (prefLoading) return;

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(
      () => {
        fetchQuotations();
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

  const formatDateTimeForDisplay = (dateString) => {
    if (!dateString) return "";

    try {
      const date = new Date(dateString);
      if (Number.isNaN(date.getTime())) return dateString;

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
    } catch (error) {
      return dateString;
    }
  };

  const cards = [
    {
      icon: "fa-solid fa-file-invoice-dollar",
      title: "Total Quotation",
      key: "total",
      color: "primary",
      count: statistics.total,
    },
    {
      icon: "fas fa-paper-plane",
      title: "Send Quotation",
      key: "send",
      color: "info",
      count: statistics.send,
    },
    {
      icon: "fas fa-circle-check",
      title: "Approved Quotation",
      key: "approve",
      color: "success",
      count: statistics.approve,
    },
    {
      icon: "fas fa-circle-xmark",
      title: "Rejected Quotation",
      key: "reject",
      color: "danger",
      count: statistics.reject,
    },
    {
      icon: "fas fa-calendar-times",
      title: "Expired Quotation",
      key: "expired",
      color: "warning",
      count: statistics.expired,
    },
    {
      icon: "fas fa-plus-circle",
      title: "Add New Quotation",
      key: "addNew",
      color: "success",
    },
  ];

  const preparedData = useMemo(() => {
    const sortedRecords = [...records].sort((a, b) => {
      const dateA = new Date(a.createdDate || a.createdDateTime || 0);
      const dateB = new Date(b.createdDate || b.createdDateTime || 0);
      return dateB - dateA;
    });
    return sortedRecords.map((record, index) => ({
      ...record,
      sn: (currentPage - 1) * recordsPerPage + index + 1,
      createdDateTime:
        record.createdDateTime || formatDateTimeForDisplay(record.createdDate),
    }));
  }, [records, currentPage, recordsPerPage]);

  const filteredClientSideData = useMemo(() => {
    if (serverSide) {
      return preparedData.filter((record) => record.isDeleted !== true);
    }

    let data = preparedData.filter((record) => record.isDeleted !== true);

    Object.entries(filters).forEach(([key, value]) => {
      if (!value || typeof value !== "string" || !value.trim()) return;

      data = data.filter((row) =>
        (row[key] || "").toString().toLowerCase().includes(value.toLowerCase()),
      );
    });

    return data;
  }, [preparedData, filters, serverSide]);

  const handleDebouncedColumnFilterChange = (key, value) => {
    if (!serverSide) {
      setFilters((prev) => ({ ...prev, [key]: value }));
      return;
    }

    if (debounceColumnTimeoutRef.current) {
      clearTimeout(debounceColumnTimeoutRef.current);
    }

    debounceColumnTimeoutRef.current = setTimeout(() => {
      setFilters((prev) => ({ ...prev, [key]: value }));
      setCurrentPage(1);
    }, 500);
  };

  const columns = [
    { key: "sn", label: "S.No", width: 70 },
    { key: "quotationNumber", label: "Quotation No.", width: 130 },
    { key: "clientName", label: "Client Name", width: 160 },
    { key: "phoneNumber", label: "Phone", width: 130 },
    { key: "projectName", label: "Project Name", width: 180 },
    { key: "projectType", label: "Project Type", width: 140 },
    { key: "quotationType", label: "Quotation Type", width: 180 },
    {
      key: "quotationFile",
      label: "Quotation File",
      width: 150,
      disableSort: true,
      disableFilter: true,
      render: (_, record) => (
        <div onClick={(event) => event.stopPropagation()} style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          {record.quotationFileLink ? (
            <UploadedFilePreviewBox
              fileUrl={record.quotationFileLink}
              title="Open uploaded quotation file"
              iconClassName="fa-solid fa-file-contract"
            />
          ) : (
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              title="No uploaded quotation file"
              disabled
            >
              <i className="fa-solid fa-file-contract"></i>
            </button>
          )}
          {record?.quotationGoogleDriveLink ? (
            <button
              type="button"
              className="btn btn-sm btn-outline-info"
              onClick={(event) => {
                event.stopPropagation();
                window.open(
                  record.quotationGoogleDriveLink,
                  "_blank",
                  "noopener,noreferrer",
                );
              }}
              title="Open Google Drive link"
            >
              <i className="fab fa-google-drive"></i>
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-sm btn-outline-secondary"
              title="No Google Drive link"
              disabled
            >
              <i className="fab fa-google-drive"></i>
            </button>
          )}
        </div>
      ),
    },
    { key: "quotationDate", label: "Quotation Date", width: 140 },
    {
      key: "quotationExpiryDate",
      label: "Quotation Expiry Date",
      width: 170,
    },
    {
      key: "quotationTotalAmount",
      label: "Total Amount",
      width: 150,
      render: (value) => `Rs. ${Number(value || 0).toLocaleString("en-IN")}`,
    },
    { key: "developmentTime", label: "Development Time", width: 150 },
    {
      key: "quotationStatus",
      label: "Quotation Status",
      width: 150,
      render: (value) => (
        <span className={`badge ${getBadgeClass(value)}`}>{value}</span>
      ),
    },
    { key: "quotationSendVia", label: "Send Via", width: 150 },
    { key: "quotationSendDate", label: "Send Date", width: 130 },
    { key: "quotationApproveDate", label: "Approve Date", width: 130 },
    { key: "quotationRejectDate", label: "Reject Date", width: 130 },
    { key: "createdDateTime", label: "Created Date & Time", width: 210 },
    { key: "action", label: "Actions", width: 150 },
  ];

  const fixedColumns = ["sn"];

  const defaultVisibleColumns = [
    "sn",
    "quotationNumber",
    "clientName",
    "phoneNumber",
    "quotationType",
    "quotationTotalAmount",
    "action",
  ];

  const columnsWithDropdownFilter = [
    "projectType",
    "quotationType",
    "quotationStatus",
    "quotationSendVia",
  ];

  const getFilterOptions = () => {
    const projectTypes = [
      ...new Set(records.map((r) => r.projectType).filter(Boolean)),
    ];
    const quotationTypes = [
      ...new Set(records.map((r) => r.quotationType).filter(Boolean)),
    ];
    const quotationStatus = [
      ...new Set(records.map((r) => r.quotationStatus).filter(Boolean)),
    ];
    const quotationSendVia = [
      ...new Set(records.map((r) => r.quotationSendVia).filter(Boolean)),
    ];

    return {
      projectType: ["All", ...projectTypes.sort()],
      quotationType: ["All", ...quotationTypes.sort()],
      quotationStatus: ["All", ...quotationStatus.sort()],
      quotationSendVia: ["All", ...quotationSendVia.sort()],
    };
  };

  const handleCardClick = (cardKey) => {
    if (cardKey === "addNew") {
      if (!canCreate) {
        showError("You don't have permission to add quotation records");
        return;
      }

      setEditingRecord(null);
      setShowCreateQuotationForm(true);
      return;
    }

    setActiveCardFilter(cardKey);
    if (serverSide) {
      setCurrentPage(1);
    }
  };

  const getCardNumber = (index) => (index % 8) + 1;

  const handleFormSubmit = () => {
    setShowCreateQuotationForm(false);
    setEditingRecord(null);
    fetchQuotations();
  };

  const handleEdit = (record) => {
    setEditingRecord(record);
    setShowCreateQuotationForm(true);
    showInfo(`Editing quotation: ${record.projectName}`);
  };

  const handleView = (record) => {
    setEditingRecord({ ...record, isViewMode: true });
    setShowCreateQuotationForm(true);
    showInfo(`Viewing quotation: ${record.projectName}`);
  };

  const handleDelete = (id) => {
    const record = records.find((item) => item.id === id || item._id === id);
    if (!record) return;

    setQuotationToDelete(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!quotationToDelete) return;

    try {
      await apiDelete(API_ENDPOINTS.QUOTATIONS.DELETE(quotationToDelete));
      showSuccess("Quotation deleted successfully!");
      await fetchQuotations();
      setShowDeleteConfirm(false);
      setQuotationToDelete(null);
    } catch (error) {
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to delete quotation",
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

    fetchQuotations();
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

  return (
    <>
      <div className="container-fluid">
        <div
          className="py-3 d-flex justify-content-between align-items-center flex-wrap"
          style={{ marginTop: "70px" }}
        >
          <h4 className="fs-18 fw-semibold m-0">Quotation Management</h4>

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
              id="serverSideToggleQuotation"
            />
            <label
              className="form-check-label ms-2"
              htmlFor="serverSideToggleQuotation"
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
              <div key={card.key} className="col-md-6 col-xl-2 mb-4">
                <div
                  className={`card border-0 overflow-hidden ${cardClass} modern-card hover-elevate`}
                  style={{
                    cursor: isAddNewDisabled ? "not-allowed" : "pointer",
                    opacity: isAddNewDisabled ? 0.6 : 1,
                    borderRadius: "12px",
                    height: "100%",
                    border: isActive
                      ? "2px solid #0d6efd"
                      : undefined,
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
                    <h6 className="mb-0 text-muted fw-bold">
                      {card.key === "addNew" ? "+ Add New" : card.count || 0}
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
          onRefresh={handleRefresh}
          showActions={true}
          actions={["view", "edit", "delete"]}
          skipDeleteConfirmation={true}
          fixedColumns={fixedColumns}
          defaultVisibleColumns={defaultVisibleColumns}
          columnsWithDropdownFilter={columnsWithDropdownFilter}
          columnsWithDateFilter={columnsWithDateFilter}
          filterOptions={serverSide ? dynamicFilterOptions : getFilterOptions()}
          tableTitle="Quotation Record"
          showColumnSelector={true}
          showExport={true}
          showRefresh={true}
          showAdvancedFilter={true}
          showSearch={true}
          exportFileName="Quotation_Management"
          exportTitle="Quotation Management Report"
          activeCardFilter={activeCardFilter}
          cards={cards}
          getBadgeClass={getBadgeClass}
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
          exportApi={API_ENDPOINTS.QUOTATIONS.LIST}
        />

        <CreateQuotation
          show={showCreateQuotationForm}
          onClose={() => {
            setShowCreateQuotationForm(false);
            setEditingRecord(null);
          }}
          onSubmit={handleFormSubmit}
          editingRecord={editingRecord}
          financialYears={financialYears}
          selectedFinancialYear={selectedFinancialYear}
          defaultFinancialYear={getDefaultFinancialYearRecord()}
        />

        <ConfirmationModal
          show={showDeleteConfirm}
          onHide={() => {
            setShowDeleteConfirm(false);
            setQuotationToDelete(null);
          }}
          onConfirm={confirmDelete}
          title="Delete Quotation"
          message={
            <>
              Are you sure you want to delete quotation{" "}
              <strong>
                "
                {records.find(
                  (r) =>
                    r.id === quotationToDelete || r._id === quotationToDelete,
                )?.projectName || ""}
                "
              </strong>
              ? This action marks the quotation as deleted.
            </>
          }
          confirmText="Delete"
          cancelText="Cancel"
          variant="danger"
        />
      </div>
    </>
  );
};

const getBadgeClass = (value) => {
  if (value === "Approve") return "bg-success";
  if (value === "Reject") return "bg-danger";
  if (value === "Send") return "bg-info";
  if (value === "Send + Approve") return "bg-primary";
  if (value === "Expired") return "bg-warning text-dark";
  if (value === "Pending") return "bg-secondary";
  return "bg-dark";
};

export default QuotationManagement;
