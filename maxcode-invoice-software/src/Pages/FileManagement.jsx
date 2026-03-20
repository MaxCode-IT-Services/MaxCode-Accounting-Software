import React, { useEffect, useMemo, useRef, useState } from "react";
import ReusableTable from "../Components/ReusableTable";
import Createfile from "../Components/Createfile";
import ConfirmationModal from "../Components/ConfirmationModal";
import {
  showError,
  showInfo,
  showSuccess,
} from "../Components/ToastNotification";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { apiDelete, apiGet } from "../utils/api";
import { hasActionPermission } from "../utils/permissions";

const FileManagement = () => {
  const moduleKey = "fileManagement";
  const canCreate = hasActionPermission(moduleKey, "create");

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalRecords, setTotalRecords] = useState(0);
  const [statistics, setStatistics] = useState({
    total: 0,
    documents: 0,
    invoices: 0,
    purchases: 0,
    others: 0,
  });
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [fileToDelete, setFileToDelete] = useState(null);
  const [cloudflareSettings, setCloudflareSettings] = useState({});

  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(10);
  const [filters, setFilters] = useState({});
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState(null);
  const [sortDirection, setSortDirection] = useState("normal");
  const [activeCardFilter, setActiveCardFilter] = useState("total");
  const [dynamicFilterOptions, setDynamicFilterOptions] = useState({});

  const abortControllerRef = useRef(null);

  useEffect(() => {
    document.title = "File Management | MaxCode IT Services";
    loadCloudflareSettings();
  }, []);

  useEffect(() => {
    fetchFiles();
  }, [
    currentPage,
    recordsPerPage,
    filters,
    searchTerm,
    sortField,
    sortDirection,
    activeCardFilter,
  ]);

  const loadCloudflareSettings = async () => {
    try {
      const response = await apiGet(API_ENDPOINTS.BUSINESS_SETTINGS.GET);
      setCloudflareSettings(response?.data?.settings?.cloudflareSettings || {});
    } catch {
      setCloudflareSettings({});
    }
  };

  const fetchFiles = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setLoading(true);

    try {
      const params = new URLSearchParams();
      params.append("page", currentPage);
      params.append("limit", recordsPerPage);

      if (searchTerm) {
        params.append("search", searchTerm);
      }

      if (activeCardFilter && activeCardFilter !== "total") {
        params.append("filter", activeCardFilter);
      }

      Object.entries(filters).forEach(([key, value]) => {
        if (
          value === undefined ||
          value === null ||
          value === "" ||
          value === "All" ||
          key === "sn" ||
          key === "action"
        ) {
          return;
        }

        if (value && typeof value === "object") {
          if (value.startDate) {
            params.append(`${key}_start`, value.startDate);
          }
          if (value.endDate) {
            params.append(`${key}_end`, value.endDate);
          }
          return;
        }

        if (Array.isArray(value) && value.length > 0) {
          params.append(key, value.join(","));
          return;
        }

        params.append(key, value);
      });

      if (sortField && sortDirection !== "normal") {
        params.append("sortBy", sortField);
        params.append(
          "sortOrder",
          sortDirection === "ascending" ? "asc" : "desc",
        );
      }

      const response = await apiGet(
        `${API_ENDPOINTS.FILES.LIST}?${params.toString()}`,
        {
          signal: controller.signal,
        },
      );

      const list = response?.data?.data || [];
      setRecords(
        list.map((item) => ({
          ...item,
          id: item._id || item.id,
          uploadDate: item.uploadDate || item.createdAt,
        })),
      );
      setTotalRecords(response?.data?.pagination?.totalRecords || list.length);
      setStatistics(
        response?.data?.statistics || {
          total: list.length,
          documents: list.filter(
            (row) => String(row.folderName || "").toLowerCase() === "documents",
          ).length,
          invoices: list.filter(
            (row) => String(row.folderName || "").toLowerCase() === "invoices",
          ).length,
          purchases: list.filter(
            (row) => String(row.folderName || "").toLowerCase() === "purchases",
          ).length,
          others: list.filter(
            (row) =>
              !["documents", "invoices", "purchases"].includes(
                String(row.folderName || "").toLowerCase(),
              ),
          ).length,
        },
      );
      setDynamicFilterOptions(response?.data?.filterOptions || {});
    } catch (error) {
      if (error.name === "CanceledError" || error.name === "AbortError") return;
      showError(error?.response?.data?.error || "Failed to fetch files");
      setRecords([]);
      setTotalRecords(0);
      setStatistics({
        total: 0,
        documents: 0,
        invoices: 0,
        purchases: 0,
        others: 0,
      });
    } finally {
      setLoading(false);
    }
  };

  const formatDateTimeForDisplay = (dateString) => {
    if (!dateString) return "-";

    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return dateString;

    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();

    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12 || 12;

    return `${day}/${month}/${year} | ${String(hours).padStart(2, "0")}:${minutes} ${ampm}`;
  };

  const cards = [
    {
      icon: "fa-solid fa-folder-open",
      title: "Total Files",
      key: "total",
      color: "primary",
      count: statistics.total,
    },
    {
      icon: "fa-solid fa-folder-tree",
      title: "Documents",
      key: "documents",
      color: "info",
      count: statistics.documents,
    },
    {
      icon: "fa-solid fa-file-invoice",
      title: "Invoices",
      key: "invoices",
      color: "success",
      count: statistics.invoices,
    },
    {
      icon: "fa-solid fa-cart-plus",
      title: "Purchases",
      key: "purchases",
      color: "warning",
      count: statistics.purchases,
    },
    {
      icon: "fa-solid fa-layer-group",
      title: "Other Files",
      key: "others",
      color: "secondary",
      count: statistics.others,
    },
    {
      icon: "fas fa-plus-circle",
      title: "Upload New File",
      key: "addNew",
      color: "success",
    },
  ];

  const getCardNumber = (index) => {
    return (index % 8) + 1;
  };

  const preparedData = useMemo(
    () =>
      records.map((record, index) => ({
        ...record,
        sn: (currentPage - 1) * recordsPerPage + index + 1,
      })),
    [records, currentPage, recordsPerPage],
  );

  const columns = [
    { key: "sn", label: "S.No", width: 70 },
    { key: "fileName", label: "File Name", width: 220 },
    { key: "folderName", label: "Folder", width: 140 },
    { key: "fileType", label: "File Type", width: 200 },
    { key: "fileSize", label: "File Size", width: 120 },
    {
      key: "uploadDate",
      label: "Upload Date & Time",
      width: 200,
      render: (value) => formatDateTimeForDisplay(value),
    },
    {
      key: "file",
      label: "File",
      width: 90,
      render: (_, record) =>
        record.fileUrl ? (
          <a
            href={record.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-sm btn-outline-primary"
            title="Open file"
          >
            <i className="fas fa-file-alt"></i>
          </a>
        ) : (
          <span className="text-muted">-</span>
        ),
    },
    { key: "action", label: "Actions", width: 120 },
  ];

  const handleCardClick = (cardKey) => {
    if (cardKey === "addNew") {
      if (!canCreate) {
        showError("You don't have permission to upload files");
        return;
      }
      setShowCreateForm(true);
      return;
    }

    setActiveCardFilter(cardKey || "total");
    setCurrentPage(1);
  };

  const handleDelete = (id) => {
    setFileToDelete(id);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    if (!fileToDelete) return;

    try {
      await apiDelete(API_ENDPOINTS.FILES.DELETE(fileToDelete));
      showSuccess("File record deleted successfully");
      setShowDeleteConfirm(false);
      setFileToDelete(null);
      fetchFiles();
    } catch (error) {
      showError(error?.response?.data?.error || "Failed to delete file record");
    }
  };

  const handleRefresh = () => {
    setFilters({});
    setSearchTerm("");
    setSortField(null);
    setSortDirection("normal");
    setActiveCardFilter("total");
    setCurrentPage(1);
    fetchFiles();
    showInfo("Data refreshed");
  };

  return (
    <div className="container-fluid">
      <div
        className="py-3 d-flex justify-content-between align-items-center flex-wrap"
        style={{ marginTop: "70px" }}
      >
        <h4 className="fs-18 fw-semibold m-0">File Management</h4>
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
                  border: isActive ? "2px solid #0d6efd" : "1px solid #dee2e6",
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
                  e.currentTarget.style.boxShadow = "0 2px 4px rgba(0,0,0,0.1)";
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
                        ? "+ Upload"
                        : card.count !== undefined
                          ? card.count
                          : 0}
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
        data={preparedData}
        loading={loading}
        totalRecords={totalRecords}
        onDelete={handleDelete}
        onRefresh={handleRefresh}
        showActions={true}
        actions={["delete"]}
        skipDeleteConfirmation={true}
        fixedColumns={["sn"]}
        defaultVisibleColumns={[
          "sn",
          "fileName",
          "folderName",
          "fileType",
          "fileSize",
          "uploadDate",
          "file",
          "action",
        ]}
        columnsWithDropdownFilter={["folderName", "fileType"]}
        columnsWithDateFilter={["uploadDate"]}
        filterOptions={dynamicFilterOptions}
        tableTitle="Uploaded Files"
        showColumnSelector={true}
        showExport={true}
        showRefresh={true}
        showAdvancedFilter={true}
        showSearch={true}
        exportFileName="File_Management"
        exportTitle="File Management Report"
        activeCardFilter={activeCardFilter}
        cards={cards}
        serverSide={true}
        onServerSideSearch={(term) => {
          setSearchTerm(term);
          setCurrentPage(1);
        }}
        onServerSideFilter={(filterParams) => {
          setFilters(filterParams);
          setCurrentPage(1);
        }}
        onServerSideSort={(field, direction) => {
          setSortField(field);
          setSortDirection(direction);
          setCurrentPage(1);
        }}
        onServerSidePageChange={setCurrentPage}
        onServerSideRecordsPerPageChange={(limit) => {
          setRecordsPerPage(limit);
          setCurrentPage(1);
        }}
        currentPage={currentPage}
        recordsPerPage={recordsPerPage}
        onPageChange={setCurrentPage}
        onRecordsPerPageChange={setRecordsPerPage}
        exportApi={API_ENDPOINTS.FILES.LIST}
      />

      <Createfile
        show={showCreateForm}
        onClose={() => setShowCreateForm(false)}
        onSubmit={() => {
          fetchFiles();
          setShowCreateForm(false);
        }}
        cloudflareSettings={cloudflareSettings}
      />

      <ConfirmationModal
        show={showDeleteConfirm}
        onHide={() => {
          setShowDeleteConfirm(false);
          setFileToDelete(null);
        }}
        onConfirm={confirmDelete}
        title="Delete File"
        message="Are you sure you want to delete this file record?"
        confirmText="Delete"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
};

export default FileManagement;
