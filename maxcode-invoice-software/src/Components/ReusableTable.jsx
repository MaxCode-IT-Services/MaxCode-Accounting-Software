import React, { useState, useEffect, useRef, useMemo } from "react";
import ColumnSelectorOffcanvas from "./ColumnSelectorOffcanvas";
import AdvancedFilterOffcanvas from "./AdvancedFilterOffcanvas";
import ConfirmationModal from "./ConfirmationModal";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { showSuccess, showError, showInfo } from "./ToastNotification";
import { hasActionPermission } from "../utils/permissions";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
dayjs.extend(customParseFormat);

const ReusableTable = ({
  onColumnFilterChange,
  // Core props
  columns = [],
  data = [],
  loading = false,
  totalRecords: propTotalRecords = 0,

  // Actions
  onEdit,
  onDelete,
  onView,
  onStatusToggle,
  onRefresh: propOnRefresh,
  onAddNew,

  // Server-side props
  serverSide = false,
  onServerSideSearch,
  onServerSideFilter,
  onServerSideSort,
  onServerSidePageChange,
  onServerSideRecordsPerPageChange,

  // Configuration
  showActions = true,
  actions = ["view", "edit", "delete", "status"],
  fixedColumns = ["sn", "action"],
  defaultVisibleColumns = [],
  columnsWithDropdownFilter = [],
  columnsWithDateFilter = [],
  filterOptions: propFilterOptions = {},
  tableTitle = "Records",
  skipDeleteConfirmation = false,

  // UI Controls
  showColumnSelector = true,
  showExport = true,
  showRefresh = true,
  showAdvancedFilter = true,
  showSearch = true,

  // Pagination
  currentPage: propCurrentPage = 1,
  recordsPerPage: propRecordsPerPage = 10,
  onPageChange,
  onRecordsPerPageChange,

  // Export options
  exportFileName = "export",
  exportTitle = "Report",
  extraExportItems = [],

  // Additional
  customActions,
  getBadgeClass,
  onFilteredDataChange,

  // Card filter
  activeCardFilter,
  cards,
  moduleKey = null,
}) => {
  // State management

  // Filtering state
  const [columnFilters, setColumnFilters] = useState(() => {
    const filters = {};
    columns.forEach((col) => {
      if (columnsWithDropdownFilter.includes(col.key)) {
        filters[col.key] = ["All"];
      } else {
        filters[col.key] = "";
      }
    });
    return filters;
  });

  // Ensure filter applies when columnFilters change (for AdvancedFilterOffcanvas)
  useEffect(() => {
    if (serverSide) {
      triggerServerSideFilter(columnFilters);
    } else {
      setCurrentPage(1);
      if (onPageChange) onPageChange(1);
    }
  }, [columnFilters]);

  const [tableColumns, setTableColumns] = useState(columns);
  const [allData, setAllData] = useState(data);
  const [visibleColumns, setVisibleColumns] = useState(() => {
    const initialVisible = {};
    columns.forEach((col) => {
      initialVisible[col.key] = fixedColumns.includes(col.key)
        ? true
        : defaultVisibleColumns.includes(col.key);
    });
    return initialVisible;
  });

  // Sorting state
  const [sortConfig, setSortConfig] = useState({
    key: null,
    direction: "normal",
  });

  // Date range filters
  const [dateFilters, setDateFilters] = useState(() => {
    const filters = {};
    columnsWithDateFilter.forEach((key) => {
      filters[key] = {
        startDate: "",
        endDate: "",
      };
    });
    return filters;
  });

  // Global search
  const [searchTerm, setSearchTerm] = useState("");

  // Pagination state
  const [currentPage, setCurrentPage] = useState(propCurrentPage);
  const [recordsPerPage, setRecordsPerPage] = useState(propRecordsPerPage);

  // UI state
  const [pinnedColumns, setPinnedColumns] = useState({
    left: [],
    right: [],
  });
  const [resizing, setResizing] = useState({
    isResizing: false,
    columnKey: null,
    startX: 0,
    startWidth: 0,
  });
  const [dragging, setDragging] = useState({
    isDragging: false,
    columnKey: null,
    startX: 0,
    startIndex: 0,
  });
  const [showColumnSelectorOffcanvas, setShowColumnSelectorOffcanvas] =
    useState(false);
  const [showFilterOffcanvas, setShowFilterOffcanvas] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [showAllPages, setShowAllPages] = useState(false);
  const [originalWidths, setOriginalWidths] = useState({});
  const [currentColumnFilter, setCurrentColumnFilter] = useState(null);
  const [openFilterDropdown, setOpenFilterDropdown] = useState(null);
  const [dropdownPosition, setDropdownPosition] = useState({
    top: 0,
    left: 0,
    width: 300,
  });
  const [filterSearchTerm, setFilterSearchTerm] = useState("");
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [modalConfig, setModalConfig] = useState({
    action: null,
    recordId: null,
    recordData: null,
    currentStatus: null,
  });

  // Debounce timer for search
  const searchDebounceTimer = useRef(null);

  const tableRef = useRef(null);
  const headerRowRef = useRef(null);
  const tableContainerRef = useRef(null);
  const dropdownRefs = useRef({});
  const onFilteredDataChangeRef = useRef(onFilteredDataChange);
  const prevSortedDataRef = useRef(null);

  const canRead = moduleKey ? hasActionPermission(moduleKey, "read") : true;
  const canUpdate = moduleKey ? hasActionPermission(moduleKey, "update") : true;
  const canDelete = moduleKey ? hasActionPermission(moduleKey, "delete") : true;
  const canExport = moduleKey ? hasActionPermission(moduleKey, "export") : true;

  const getDisabledActionStyle = (isAllowed) => ({
    opacity: isAllowed ? 1 : 0.5,
    cursor: isAllowed ? "pointer" : "not-allowed",
  });

  // Update callback ref
  useEffect(() => {
    onFilteredDataChangeRef.current = onFilteredDataChange;
  }, [onFilteredDataChange]);

  // Update allData when data prop changes
  useEffect(() => {
    setAllData(data);
  }, [data]);

  // Update currentPage when prop changes
  useEffect(() => {
    setCurrentPage(propCurrentPage);
  }, [propCurrentPage]);

  // Update recordsPerPage when prop changes
  useEffect(() => {
    setRecordsPerPage(propRecordsPerPage);
  }, [propRecordsPerPage]);

  // Dynamic filter options
  const [dynamicFilterOptions, setDynamicFilterOptions] = useState(() => {
    if (serverSide) {
      return propFilterOptions;
    }

    const options = {};
    columnsWithDropdownFilter.forEach((key) => {
      options[key] = ["All"];
    });

    return { ...propFilterOptions, ...options };
  });

  // Helper function to parse date
  const parseDate = (dateStr) => {
    if (!dateStr) return null;

    if (dayjs(dateStr, "DD/MM/YYYY | hh:mm:ss A").isValid()) {
      return dayjs(dateStr, "DD/MM/YYYY | hh:mm:ss A").toDate();
    }
    if (dayjs(dateStr, "DD/MM/YYYY").isValid()) {
      return dayjs(dateStr, "DD/MM/YYYY").toDate();
    }
    if (dayjs(dateStr).isValid()) {
      return dayjs(dateStr).toDate();
    }
    return null;
  };

  // Helper function to format date for display
  const formatDateForDisplay = (dateString) => {
    if (!dateString) return "";

    try {
      if (
        typeof dateString === "string" &&
        /^\d{2}\/\d{2}\/\d{4}$/.test(dateString)
      ) {
        return dateString;
      }

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

  // Update filter options based on data (for client-side)
  useEffect(() => {
    if (serverSide) {
      setDynamicFilterOptions((prevOptions) => {
        const hasChanged =
          JSON.stringify(prevOptions) !== JSON.stringify(propFilterOptions);
        return hasChanged ? propFilterOptions : prevOptions;
      });
      return;
    }

    if (!serverSide && allData.length > 0) {
      const newOptions = { ...propFilterOptions };

      columnsWithDropdownFilter.forEach((key) => {
        const uniqueValues = Array.from(
          new Set(
            allData
              .map((r) => r[key])
              .filter((val) => val !== null && val !== undefined && val !== ""),
          ),
        ).sort();

        newOptions[key] = ["All", ...uniqueValues];
      });

      setDynamicFilterOptions((prevOptions) => {
        const hasChanged =
          JSON.stringify(prevOptions) !== JSON.stringify(newOptions);
        return hasChanged ? newOptions : prevOptions;
      });
    }
  }, [allData, columnsWithDropdownFilter, serverSide, propFilterOptions]);

  // Handle click outside dropdown
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        !e.target.closest(".dropdown-menu") &&
        !e.target.closest(".dropdown-toggle1")
      ) {
        setOpenFilterDropdown(null);
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => {
      document.removeEventListener("click", handleClickOutside);
    };
  }, []);

  // Apply card filter (client-side)
  const getCardFilteredData = useMemo(() => {
    if (serverSide) {
      return allData;
    }

    if (
      !activeCardFilter ||
      activeCardFilter === "total" ||
      activeCardFilter === "addNew"
    ) {
      return allData;
    }

    let filtered = [...allData];

    if (activeCardFilter === "active") {
      filtered = filtered.filter((r) => r.status === "Active");
    } else if (activeCardFilter === "inactive") {
      filtered = filtered.filter((r) => r.status === "Inactive");
    } else if (activeCardFilter === "withGST") {
      filtered = filtered.filter((r) => r.hasGSTIN === true);
    } else if (activeCardFilter === "withoutGST") {
      filtered = filtered.filter((r) => r.hasGSTIN === false);
    }

    return filtered;
  }, [allData, activeCardFilter, serverSide]);

  // Apply global search and column filters (client-side)
  const filteredData = useMemo(() => {
    if (serverSide) {
      return getCardFilteredData;
    }

    return getCardFilteredData.filter((record) => {
      // Global search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = Object.keys(record).some((key) => {
          if (!visibleColumns[key]) return false;
          const value = record[key];
          if (value === null || value === undefined) return false;
          return String(value).toLowerCase().includes(searchLower);
        });
        if (!matchesSearch) return false;
      }

      // Date range filters
      for (const [key, dateRange] of Object.entries(dateFilters)) {
        if (!dateRange.startDate && !dateRange.endDate) continue;

        const recordDate = parseDate(record[key]);

        if (!recordDate) continue;

        const startDate = dateRange.startDate
          ? new Date(dateRange.startDate)
          : null;
        const endDate = dateRange.endDate ? new Date(dateRange.endDate) : null;

        if (startDate) {
          startDate.setHours(0, 0, 0, 0);
        }
        if (endDate) {
          endDate.setHours(23, 59, 59, 999);
        }

        if (startDate && recordDate < startDate) return false;
        if (endDate && recordDate > endDate) return false;
      }

      // Column filters
      for (const [key, filterValue] of Object.entries(columnFilters)) {
        if (!filterValue || filterValue.length === 0) continue;

        const recordValue = record[key];

        // Dropdown filter
        if (columnsWithDropdownFilter.includes(key)) {
          if (filterValue.includes("All") || filterValue.length === 0) {
            continue;
          }
          if (Array.isArray(filterValue)) {
            if (!filterValue.includes(recordValue)) {
              return false;
            }
          } else if (filterValue !== recordValue) {
            return false;
          }
        }
        // Text filter
        else if (filterValue) {
          const recordValueStr = recordValue
            ? String(recordValue).toLowerCase()
            : "";
          const filterValueStr = String(filterValue).toLowerCase();
          if (!recordValueStr.includes(filterValueStr)) {
            return false;
          }
        }
      }

      return true;
    });
  }, [
    getCardFilteredData,
    searchTerm,
    columnFilters,
    dateFilters,
    visibleColumns,
    columnsWithDropdownFilter,
    serverSide,
  ]);

  // Apply sorting (client-side)
  const sortedData = useMemo(() => {
    if (serverSide) {
      return filteredData;
    }

    if (sortConfig.key && sortConfig.direction !== "normal") {
      return [...filteredData].sort((a, b) => {
        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        if (aValue === null || aValue === undefined) return 1;
        if (bValue === null || bValue === undefined) return -1;

        // Handle date sorting
        if (columnsWithDateFilter.includes(sortConfig.key)) {
          const aDate = parseDate(aValue);
          const bDate = parseDate(bValue);

          if (!aDate && !bDate) return 0;
          if (!aDate) return 1;
          if (!bDate) return -1;

          return sortConfig.direction === "ascending"
            ? aDate - bDate
            : bDate - aDate;
        }

        // Handle number sorting
        if (!isNaN(parseFloat(aValue)) && !isNaN(parseFloat(bValue))) {
          return sortConfig.direction === "ascending"
            ? parseFloat(aValue) - parseFloat(bValue)
            : parseFloat(bValue) - parseFloat(aValue);
        }

        // Handle string sorting
        const comparison = String(aValue).localeCompare(String(bValue));
        return sortConfig.direction === "ascending" ? comparison : -comparison;
      });
    }
    return filteredData;
  }, [filteredData, sortConfig, columnsWithDateFilter, serverSide]);

  // Call onFilteredDataChange only when sortedData actually changes (client-side)
  useEffect(() => {
    if (!serverSide && onFilteredDataChangeRef.current) {
      const hasChanged =
        JSON.stringify(prevSortedDataRef.current) !==
        JSON.stringify(sortedData);
      if (hasChanged) {
        prevSortedDataRef.current = sortedData;
        onFilteredDataChangeRef.current(sortedData);
      }
    }
  }, [sortedData, serverSide]);

  // Apply pagination
  const paginatedData = useMemo(() => {
    if (serverSide) {
      return data;
    }

    const start = (currentPage - 1) * recordsPerPage;
    const end = start + recordsPerPage;
    return sortedData.slice(start, end);
  }, [sortedData, currentPage, recordsPerPage, serverSide, data]);

  // Calculate total records
  const totalRecords = serverSide ? propTotalRecords : filteredData.length;

  // Server-side filter change handler
  const triggerServerSideFilter = (updatedFilters) => {
    if (!serverSide || !onServerSideFilter) return;

    setCurrentPage(1);
    if (onPageChange) onPageChange(1);

    const filterParams = {};

    Object.entries(updatedFilters || columnFilters).forEach(([key, value]) => {
      if (columnsWithDropdownFilter.includes(key)) {
        if (value && !value.includes("All") && value.length > 0) {
          filterParams[key] = Array.isArray(value) ? value.join(",") : value;
        }
      } else {
        if (value && value.trim() !== "") {
          filterParams[key] = value;
        }
      }
    });

    Object.entries(dateFilters).forEach(([key, range]) => {
      if (range.startDate) {
        // Format date to YYYY-MM-DD for API
        const formattedStartDate = range.startDate.split("T")[0];
        filterParams[`${key}_start`] = formattedStartDate;
      }
      if (range.endDate) {
        const formattedEndDate = range.endDate.split("T")[0];
        filterParams[`${key}_end`] = formattedEndDate;
      }
    });

    if (
      activeCardFilter &&
      activeCardFilter !== "total" &&
      activeCardFilter !== "addNew"
    ) {
      filterParams.filter = activeCardFilter;
    }

    onServerSideFilter(filterParams);
  };

  // Debounced search handler for server-side
  const handleServerSideSearch = (value) => {
    if (!serverSide || !onServerSideSearch) return;

    setCurrentPage(1);
    if (onPageChange) onPageChange(1);

    if (searchDebounceTimer.current) {
      clearTimeout(searchDebounceTimer.current);
    }

    searchDebounceTimer.current = setTimeout(() => {
      onServerSideSearch(value);
    }, 500);
  };

  // Handle date range filter change
  const handleDateFilterChange = (key, type, value, e) => {
    if (e) e.stopPropagation();

    // Get the raw input value (already in YYYY-MM-DD format from date input)
    let dateValue = value;

    // Ensure we're working with the correct format
    if (dateValue && dateValue.includes("T")) {
      dateValue = dateValue.split("T")[0];
    }

    const updatedDateFilters = {
      ...dateFilters,
      [key]: {
        ...dateFilters[key],
        [type]: dateValue,
      },
    };

    setDateFilters(updatedDateFilters);

    if (serverSide) {
      // Build filter params with all current filters
      const filterParams = {};

      // Add column filters
      Object.entries(columnFilters).forEach(([colKey, colValue]) => {
        if (columnsWithDropdownFilter.includes(colKey)) {
          if (colValue && !colValue.includes("All") && colValue.length > 0) {
            filterParams[colKey] = Array.isArray(colValue)
              ? colValue.join(",")
              : colValue;
          }
        } else {
          if (colValue && colValue.trim() !== "") {
            filterParams[colKey] = colValue;
          }
        }
      });

      // Add date filters (using the updated ones)
      Object.entries(updatedDateFilters).forEach(([dateKey, range]) => {
        if (range.startDate) {
          filterParams[`${dateKey}_start`] = range.startDate;
        }
        if (range.endDate) {
          filterParams[`${dateKey}_end`] = range.endDate;
        }
      });

      // Add card filter
      if (
        activeCardFilter &&
        activeCardFilter !== "total" &&
        activeCardFilter !== "addNew"
      ) {
        filterParams.cardFilter = activeCardFilter;
      }

      setCurrentPage(1);
      if (onPageChange) onPageChange(1);
      if (onServerSideFilter) onServerSideFilter(filterParams);
    } else {
      setCurrentPage(1);
      if (onPageChange) onPageChange(1);
    }
  };

  // Handle column filter change
  const handleColumnFilterChange = (key, value, e) => {
    if (e) e.stopPropagation();
    console.log("[handleColumnFilterChange] key:", key, "value:", value);
    setColumnFilters((prev) => {
      const updated = { ...prev, [key]: value };
      console.log("[handleColumnFilterChange] new columnFilters:", updated);
      return updated;
    });
    if (onColumnFilterChange) {
      onColumnFilterChange(key, value);
    } else {
      if (!serverSide) {
        setCurrentPage(1);
        if (onPageChange) onPageChange(1);
      }
    }
  };

  // Handle select filter change
  const handleSelectFilterChange = (key, value, isChecked, e) => {
    e.stopPropagation();

    setColumnFilters((prev) => {
      const currentFilters = [...(prev[key] || [])];

      if (value === "All") {
        return {
          ...prev,
          [key]: isChecked ? ["All"] : [],
        };
      } else {
        let newFilters;
        if (isChecked) {
          newFilters = [...currentFilters.filter((v) => v !== "All"), value];
        } else {
          newFilters = currentFilters.filter((v) => v !== value);
        }

        if (newFilters.length === 0) {
          newFilters = ["All"];
        }

        return {
          ...prev,
          [key]: newFilters,
        };
      }
    });

    if (serverSide) {
      const filterParams = {};

      Object.entries(columnFilters).forEach(([colKey, colValue]) => {
        if (columnsWithDropdownFilter.includes(colKey)) {
          if (colKey === key) {
            const updatedValue = [...(columnFilters[key] || [])];
            if (value === "All") {
              // Handled in next state
            } else {
              if (isChecked) {
                updatedValue.push(value);
              } else {
                const index = updatedValue.indexOf(value);
                if (index > -1) updatedValue.splice(index, 1);
              }
            }
            if (updatedValue.length > 0 && !updatedValue.includes("All")) {
              filterParams[colKey] = updatedValue.join(",");
            }
          } else {
            if (colValue && !colValue.includes("All") && colValue.length > 0) {
              filterParams[colKey] = Array.isArray(colValue)
                ? colValue.join(",")
                : colValue;
            }
          }
        } else {
          if (colValue && colValue.trim() !== "") {
            filterParams[colKey] = colValue;
          }
        }
      });

      Object.entries(dateFilters).forEach(([dateKey, range]) => {
        if (range.startDate) {
          filterParams[`${dateKey}_start`] = range.startDate;
        }
        if (range.endDate) {
          filterParams[`${dateKey}_end`] = range.endDate;
        }
      });

      if (
        activeCardFilter &&
        activeCardFilter !== "total" &&
        activeCardFilter !== "addNew"
      ) {
        filterParams.cardFilter = activeCardFilter;
      }

      setCurrentPage(1);
      if (onPageChange) onPageChange(1);
      if (onServerSideFilter) onServerSideFilter(filterParams);
    } else {
      setCurrentPage(1);
      if (onPageChange) onPageChange(1);
    }
  };

  // Handle global search
  const handleGlobalSearch = (value) => {
    setSearchTerm(value);

    if (serverSide) {
      handleServerSideSearch(value);
    } else {
      setCurrentPage(1);
      if (onPageChange) onPageChange(1);
    }
  };

  // Handle sort
  const handleSort = (key, e) => {
    if (e) e.stopPropagation();
    if (key === "action") return;

    let direction;

    if (sortConfig.key !== key) {
      direction = "ascending";
    } else {
      switch (sortConfig.direction) {
        case "normal":
          direction = "ascending";
          break;
        case "ascending":
          direction = "descending";
          break;
        case "descending":
          direction = "normal";
          break;
        default:
          direction = "ascending";
      }
    }

    const newSortConfig = { key, direction };
    setSortConfig(newSortConfig);

    if (serverSide && onServerSideSort) {
      setCurrentPage(1);
      if (onPageChange) onPageChange(1);
      onServerSideSort(key, direction);
    }
  };

  // Handle refresh
  const handleRefresh = () => {
    const resetFilters = {};
    Object.keys(columnFilters).forEach((key) => {
      if (columnsWithDropdownFilter.includes(key)) {
        resetFilters[key] = ["All"];
      } else {
        resetFilters[key] = "";
      }
    });

    const resetDateFilters = {};
    columnsWithDateFilter.forEach((key) => {
      resetDateFilters[key] = {
        startDate: "",
        endDate: "",
      };
    });

    setColumnFilters(resetFilters);
    setDateFilters(resetDateFilters);
    setSearchTerm("");
    setSortConfig({ key: null, direction: "normal" });

    if (serverSide) {
      setCurrentPage(1);
      if (onPageChange) onPageChange(1);

      if (onServerSideFilter) {
        onServerSideFilter({});
      }

      if (onServerSideSearch) {
        onServerSideSearch("");
      }

      if (onServerSideSort) {
        onServerSideSort(null, "normal");
      }
    } else {
      setCurrentPage(1);
      if (onPageChange) onPageChange(1);
    }

    if (propOnRefresh) propOnRefresh();
    showInfo("Filters cleared and data refreshed!");
  };

  // Handle clear filters
  const handleClearFilters = () => {
    const resetFilters = {};
    Object.keys(columnFilters).forEach((key) => {
      if (columnsWithDropdownFilter.includes(key)) {
        resetFilters[key] = ["All"];
      } else {
        resetFilters[key] = "";
      }
    });

    const resetDateFilters = {};
    columnsWithDateFilter.forEach((key) => {
      resetDateFilters[key] = {
        startDate: "",
        endDate: "",
      };
    });

    setColumnFilters(resetFilters);
    setDateFilters(resetDateFilters);
    setSearchTerm("");

    if (serverSide) {
      setCurrentPage(1);
      if (onPageChange) onPageChange(1);

      if (onServerSideFilter) {
        onServerSideFilter({});
      }

      if (onServerSideSearch) {
        onServerSideSearch("");
      }
    } else {
      setCurrentPage(1);
      if (onPageChange) onPageChange(1);
    }

    showInfo("All filters cleared!");
  };

  // Handle page change
  const handlePageChange = (page) => {
    setCurrentPage(page);

    if (serverSide && onServerSidePageChange) {
      onServerSidePageChange(page);
    }

    if (onPageChange) onPageChange(page);
  };

  // Handle records per page change
  const handleRecordsPerPageChange = (value) => {
    setRecordsPerPage(value);
    setCurrentPage(1);

    if (serverSide && onServerSideRecordsPerPageChange) {
      onServerSideRecordsPerPageChange(value);
    }

    if (onRecordsPerPageChange) onRecordsPerPageChange(value);
    if (onPageChange) onPageChange(1);
  };

  // Get sort icon
  const getSortIcon = (key) => {
    if (key === "action") return null;

    if (sortConfig.key !== key || sortConfig.direction === "normal") {
      return (
        <i className="fa-solid fa-arrow-right-arrow-left ms-1 text-muted fa-rotate-90"></i>
      );
    }

    return sortConfig.direction === "ascending" ? (
      <i className="fa-solid fa-arrow-up-short-wide ms-1"></i>
    ) : (
      <i className="fas fa-sort-down ms-1"></i>
    );
  };

  // Get filter display text
  const getFilterDisplayText = (key) => {
    const filters = columnFilters[key];

    if (columnsWithDropdownFilter.includes(key)) {
      if (
        !filters ||
        filters.length === 0 ||
        (filters.length === 1 && filters[0] === "All")
      ) {
        return "All";
      }
      return filters.join(", ");
    } else {
      return filters || "";
    }
  };

  // Clear column filters
  const clearColumnFilters = (key, e) => {
    e.stopPropagation();

    if (columnsWithDateFilter.includes(key)) {
      const updatedDateFilters = {
        ...dateFilters,
        [key]: {
          startDate: "",
          endDate: "",
        },
      };

      setDateFilters(updatedDateFilters);

      if (serverSide) {
        const filterParams = {};

        Object.entries(columnFilters).forEach(([colKey, colValue]) => {
          if (columnsWithDropdownFilter.includes(colKey)) {
            if (colValue && !colValue.includes("All") && colValue.length > 0) {
              filterParams[colKey] = Array.isArray(colValue)
                ? colValue.join(",")
                : colValue;
            }
          } else {
            if (colValue && colValue.trim() !== "") {
              filterParams[colKey] = colValue;
            }
          }
        });

        Object.entries(updatedDateFilters).forEach(([dateKey, range]) => {
          if (dateKey !== key) {
            if (range.startDate) {
              filterParams[`${dateKey}_start`] = range.startDate;
            }
            if (range.endDate) {
              filterParams[`${dateKey}_end`] = range.endDate;
            }
          }
        });

        if (
          activeCardFilter &&
          activeCardFilter !== "total" &&
          activeCardFilter !== "addNew"
        ) {
          filterParams.cardFilter = activeCardFilter;
        }

        setCurrentPage(1);
        if (onPageChange) onPageChange(1);
        if (onServerSideFilter) onServerSideFilter(filterParams);
      }
    } else {
      const updatedFilters = {
        ...columnFilters,
        [key]: columnsWithDropdownFilter.includes(key) ? ["All"] : "",
      };

      setColumnFilters(updatedFilters);

      if (serverSide) {
        triggerServerSideFilter(updatedFilters);
      }
    }
  };

  // Open advanced filter
  const openAdvancedFilter = (key, e) => {
    e.stopPropagation();
    setCurrentColumnFilter(key);
    setShowFilterOffcanvas(true);
  };

  // Toggle filter dropdown
  const toggleFilterDropdown = (key, e) => {
    e.stopPropagation();
    setFilterSearchTerm("");

    if (openFilterDropdown === key) {
      setOpenFilterDropdown(null);
      return;
    }

    const buttonRect = e.currentTarget.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const spaceRight = viewportWidth - buttonRect.right;
    const spaceLeft = buttonRect.left;
    const spaceBottom = viewportHeight - buttonRect.bottom;
    const spaceTop = buttonRect.top;

    let left = buttonRect.left;
    let top = buttonRect.bottom;
    let width = 300;

    if (spaceRight < width) {
      if (buttonRect.width > width) {
        left = buttonRect.left + (buttonRect.width - width) / 2;
      } else {
        left = buttonRect.right - width;
      }
      left = Math.max(0, left);
    }

    const estimatedDropdownHeight = 400;
    if (spaceBottom < estimatedDropdownHeight) {
      if (spaceTop >= estimatedDropdownHeight) {
        top = buttonRect.top - estimatedDropdownHeight;
      }
    }

    left = Math.max(0, Math.min(left, viewportWidth - width));
    top = Math.max(0, top);

    setDropdownPosition({
      top,
      left,
      width: Math.min(width, viewportWidth - 20),
    });
    setOpenFilterDropdown(key);
  };

  // Toggle pin column
  const togglePinColumn = (columnKey, position) => {
    setPinnedColumns((prev) => {
      const newPinned = { ...prev };
      newPinned.left = newPinned.left.filter((key) => key !== columnKey);
      newPinned.right = newPinned.right.filter((key) => key !== columnKey);
      const isCurrentlyPinned = prev[position].includes(columnKey);
      if (!isCurrentlyPinned) {
        newPinned[position] = [...newPinned[position], columnKey];
      }
      return newPinned;
    });
  };

  // Start resizing
  const startResizing = (columnKey, e) => {
    e.preventDefault();
    e.stopPropagation();
    const column = tableColumns.find((col) => col.key === columnKey);
    setResizing({
      isResizing: true,
      columnKey,
      startX: e.clientX,
      startWidth: column.width,
    });
  };

  // Handle resize
  const handleResize = (e) => {
    if (!resizing.isResizing) return;
    const deltaX = e.clientX - resizing.startX;
    const newWidth = Math.max(50, resizing.startWidth + deltaX);
    setTableColumns((prevColumns) =>
      prevColumns.map((column) =>
        column.key === resizing.columnKey
          ? { ...column, width: newWidth }
          : column,
      ),
    );
  };

  // Stop resizing
  const stopResizing = () => {
    setResizing({
      isResizing: false,
      columnKey: null,
      startX: 0,
      startWidth: 0,
    });
  };

  // Start dragging
  const startDragging = (columnKey, e) => {
    e.preventDefault();
    e.stopPropagation();
    const columnIndex = tableColumns.findIndex((col) => col.key === columnKey);
    setDragging({
      isDragging: true,
      columnKey,
      startX: e.clientX,
      startIndex: columnIndex,
    });
  };

  // Handle drag
  const handleDrag = (e) => {
    if (!dragging.isDragging) return;
    const thElements = headerRowRef.current.querySelectorAll("th");
    let targetIndex = -1;
    thElements.forEach((th, index) => {
      const rect = th.getBoundingClientRect();
      if (e.clientX >= rect.left && e.clientX <= rect.right) {
        targetIndex = index;
      }
    });
    if (targetIndex !== -1 && targetIndex !== dragging.startIndex) {
      setTableColumns((prevColumns) => {
        const newColumns = [...prevColumns];
        const [movedColumn] = newColumns.splice(dragging.startIndex, 1);
        newColumns.splice(targetIndex, 0, movedColumn);
        return newColumns;
      });
      setDragging((prev) => ({
        ...prev,
        startIndex: targetIndex,
      }));
    }
  };

  // Stop dragging
  const stopDragging = () => {
    setDragging({
      isDragging: false,
      columnKey: null,
      startX: 0,
      startIndex: 0,
    });
  };

  useEffect(() => {
    if (resizing.isResizing) {
      document.addEventListener("mousemove", handleResize);
      document.addEventListener("mouseup", stopResizing);
      return () => {
        document.removeEventListener("mousemove", handleResize);
        document.removeEventListener("mouseup", stopResizing);
      };
    }
  }, [resizing.isResizing]);

  useEffect(() => {
    if (dragging.isDragging) {
      document.addEventListener("mousemove", handleDrag);
      document.addEventListener("mouseup", stopDragging);
      return () => {
        document.removeEventListener("mousemove", handleDrag);
        document.removeEventListener("mouseup", stopDragging);
      };
    }
  }, [dragging.isDragging]);

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (searchDebounceTimer.current) {
        clearTimeout(searchDebounceTimer.current);
      }
    };
  }, []);

  // Handle auto resize all
  const handleAutoResizeAll = () => {
    const table = tableRef.current;
    if (!table) return;

    const currentAutoResizeState = tableColumns.some(
      (col) => col.width === "auto",
    );

    if (!currentAutoResizeState) {
      const widths = {};
      tableColumns.forEach((col) => {
        widths[col.key] = col.width;
      });
      setOriginalWidths(widths);
    }

    const headerCells = table.querySelectorAll("thead th");
    const bodyRows = table.querySelectorAll("tbody tr");

    const newColumns = tableColumns.map((col) => {
      if (!visibleColumns[col.key]) return col;

      const colIndex = Array.from(headerCells).findIndex(
        (cell) => cell.getAttribute("data-column-key") === col.key,
      );

      if (colIndex === -1) return col;

      let maxWidth = 0;

      const headerCell = headerCells[colIndex];
      const headerWidth = headerCell.scrollWidth;
      maxWidth = Math.max(maxWidth, headerWidth);

      bodyRows.forEach((row) => {
        const cell = row.querySelectorAll("td")[colIndex];
        if (cell) {
          maxWidth = Math.max(maxWidth, cell.scrollWidth);
        }
      });

      maxWidth = Math.min(maxWidth + 20, 800);

      return {
        ...col,
        width: currentAutoResizeState
          ? originalWidths[col.key] || col.width
          : maxWidth,
      };
    });

    setTableColumns(newColumns);
  };

  // Handle auto resize column
  const handleAutoResizeColumn = (columnKey) => {
    const table = tableRef.current;
    if (!table) return;

    const column = tableColumns.find((col) => col.key === columnKey);
    const isCurrentlyAutoResized = column?.width === "auto";

    if (isCurrentlyAutoResized) {
      setTableColumns((prevColumns) =>
        prevColumns.map((col) =>
          col.key === columnKey
            ? { ...col, width: originalWidths[columnKey] || col.width }
            : col,
        ),
      );
    } else {
      setOriginalWidths((prev) => ({
        ...prev,
        [columnKey]: column.width,
      }));

      const headerCells = table.querySelectorAll("thead th");
      const bodyRows = table.querySelectorAll("tbody tr");

      const colIndex = Array.from(headerCells).findIndex(
        (cell) => cell.getAttribute("data-column-key") === columnKey,
      );

      if (colIndex === -1) return;

      let maxWidth = 0;

      const headerCell = headerCells[colIndex];
      maxWidth = Math.max(maxWidth, headerCell.scrollWidth);

      bodyRows.forEach((row) => {
        const cell = row.querySelectorAll("td")[colIndex];
        if (cell) {
          maxWidth = Math.max(maxWidth, cell.scrollWidth);
        }
      });

      maxWidth = Math.min(maxWidth + 20, 800);

      setTableColumns((prevColumns) =>
        prevColumns.map((col) =>
          col.key === columnKey ? { ...col, width: maxWidth } : col,
        ),
      );
    }
  };

  // Confirm delete
  const confirmDelete = (record) => {
    setModalConfig({
      action: "delete",
      recordId: record?._id || record?.id,
      recordData: record || null,
    });
    setShowConfirmModal(true);
  };

  const getDeleteEntityLabel = () => {
    const normalizedTitle = String(tableTitle || "")
      .replace(/records?/gi, "")
      .replace(/management/gi, "")
      .trim();

    if (normalizedTitle === "RCM" || normalizedTitle === "Self") {
      return "Self Invoice (RCM)";
    }

    return normalizedTitle || "record";
  };

  const getDeleteRecordMeta = (record) => {
    const safeRecord = record || {};

    const primaryCandidates = [
      { key: "selfInvoiceNumber", label: "Self Invoice Number" },
      { key: "invoiceNumber", label: "Invoice Number" },
      { key: "vendorId", label: "Vendor ID" },
      { key: "clientId", label: "Client ID" },
      { key: "id", label: "ID" },
    ];

    const secondaryCandidates = [
      {
        key: "serviceProviderBusinessName",
        label: "Service Provider Business Name",
      },
      { key: "businessName", label: "Business Name" },
      { key: "clientName", label: "Client Name" },
      { key: "vendorName", label: "Vendor Name" },
      { key: "name", label: "Name" },
    ];

    const firstAvailable = (candidates) => {
      return (
        candidates.find(({ key }) => {
          const value = safeRecord[key];
          return value !== undefined && value !== null && String(value) !== "";
        }) || null
      );
    };

    const primary = firstAvailable(primaryCandidates);
    const secondary = firstAvailable(secondaryCandidates);

    return {
      entityLabel: getDeleteEntityLabel(),
      primaryLabel: primary?.label || "Record",
      primaryValue: primary ? safeRecord[primary.key] : "-",
      secondaryLabel: secondary?.label || "Name",
      secondaryValue: secondary ? safeRecord[secondary.key] : "-",
    };
  };

  // Handle confirm action
  const handleConfirmAction = () => {
    const { action, recordId } = modalConfig;
    if (action === "delete" && onDelete) {
      onDelete(recordId);
      setShowConfirmModal(false);
    }
  };

  // Get ordered columns
  const getOrderedColumns = () => {
    const leftPinned = tableColumns.filter((col) =>
      pinnedColumns.left.includes(col.key),
    );
    const rightPinned = tableColumns.filter((col) =>
      pinnedColumns.right.includes(col.key),
    );
    const unpinned = tableColumns.filter(
      (col) =>
        !pinnedColumns.left.includes(col.key) &&
        !pinnedColumns.right.includes(col.key),
    );
    return [...leftPinned, ...unpinned, ...rightPinned];
  };

  // Check if column is pinned
  const isPinned = (columnKey) => {
    if (pinnedColumns.left.includes(columnKey)) return "left";
    if (pinnedColumns.right.includes(columnKey)) return "right";
    return false;
  };

  // Get pagination info
  const paginationInfo = () => {
    const total = serverSide ? propTotalRecords : filteredData.length;
    const startRecord = total > 0 ? (currentPage - 1) * recordsPerPage + 1 : 0;
    const endRecord = Math.min(currentPage * recordsPerPage, total);

    return {
      startRecord,
      endRecord,
      totalRecords: total,
      isPrevDisabled: currentPage === 1,
      isNextDisabled: currentPage * recordsPerPage >= total,
    };
  };

  // Get pagination items
  const getPaginationItems = () => {
    const items = [];
    const totalPages = Math.ceil(
      (serverSide ? propTotalRecords : filteredData.length) / recordsPerPage,
    );

    const createPageButton = (i) => (
      <li key={i} className={`page-item ${i === currentPage ? "active" : ""}`}>
        <button className="page-link" onClick={() => handlePageChange(i)}>
          {i}
        </button>
      </li>
    );

    if (showAllPages) {
      for (let i = 1; i <= totalPages; i++) {
        items.push(createPageButton(i));
      }
    } else {
      let startPage = Math.max(1, currentPage - 1);
      let endPage = Math.min(startPage + 2, totalPages);

      if (startPage > 2) {
        items.push(createPageButton(1));
        items.push(
          <li key="start-ellipsis" className="page-item">
            <button className="page-link" onClick={() => setShowAllPages(true)}>
              ...
            </button>
          </li>,
        );
      } else if (startPage > 1) {
        items.push(createPageButton(1));
      }

      for (let i = startPage; i <= endPage; i++) {
        if (i >= 1 && i <= totalPages) {
          items.push(createPageButton(i));
        }
      }

      if (endPage < totalPages - 1) {
        items.push(
          <li key="end-ellipsis" className="page-item">
            <button className="page-link" onClick={() => setShowAllPages(true)}>
              ...
            </button>
          </li>,
        );
        items.push(createPageButton(totalPages));
      } else if (endPage < totalPages) {
        items.push(createPageButton(totalPages));
      }
    }

    return items;
  };

  // Get status badge class
  const getStatusBadgeClass = (value) => {
    if (getBadgeClass) return getBadgeClass(value);
    if (!value) return "bg-secondary";
    const lowerValue = value.toLowerCase();
    if (lowerValue === "active") return "bg-success";
    if (lowerValue === "inactive" || lowerValue === "deactive")
      return "bg-danger";
    if (lowerValue === "pending") return "bg-warning";
    return "bg-primary";
  };

  // Format column name for export
  const formatColumnName = (key) => {
    const columnConfig = tableColumns.find((col) => col.key === key);
    if (columnConfig && columnConfig.label) {
      return columnConfig.label;
    }
    const result = key.replace(/([A-Z])/g, " $1");
    return result.charAt(0).toUpperCase() + result.slice(1);
  };

  // Format date time for export
  const formatDateTime = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
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
    return `${day}-${month}-${year} | ${formattedHours}.${minutes}.${seconds} ${ampm}`;
  };

  // Export to PDF
  const exportToPDF = () => {
    try {
      const visibleColumnKeys = getOrderedColumns()
        .filter((col) => visibleColumns[col.key])
        .map((col) => col.key);

      const columnLabels = visibleColumnKeys.map((key) => {
        const column = tableColumns.find((col) => col.key === key);
        return column ? column.label : formatColumnName(key);
      });

      const exportData = filteredData.map((record, index) => {
        return visibleColumnKeys.map((key) => {
          if (key === "sn") {
            return (index + 1).toString();
          }
          if (columnsWithDateFilter.includes(key)) {
            return formatDateForDisplay(record[key]);
          }
          const value = record[key] || "";
          return typeof value === "string" ? value : String(value);
        });
      });

      const doc = new jsPDF({
        orientation: visibleColumnKeys.length > 6 ? "landscape" : "portrait",
        unit: "mm",
        format: "a4",
      });

      const now = new Date();
      const formattedDate = formatDateTime(now.toISOString());
      const pageWidth = doc.internal.pageSize.getWidth();

      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      const title = exportTitle;
      const titleWidth =
        (doc.getStringUnitWidth(title) * doc.internal.getFontSize()) /
        doc.internal.scaleFactor;
      const titleX = (pageWidth - titleWidth) / 2;
      doc.text(title, titleX, 12);

      doc.setDrawColor(255, 204, 0);
      doc.setLineWidth(1);
      doc.line(8, 17, pageWidth - 8, 17);

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.text(`Generated on: ${formattedDate}`, 8, 25);
      doc.text(`Total Records: ${filteredData.length}`, pageWidth - 8, 25, {
        align: "right",
      });

      const dynamicFontSize = 8;

      autoTable(doc, {
        head: [columnLabels],
        body: exportData,
        startY: 30,
        styles: {
          fontSize: dynamicFontSize,
          cellPadding: 2,
          overflow: "linebreak",
          lineWidth: 0.1,
          lineColor: [200, 200, 200],
          textColor: [0, 0, 0],
        },
        headStyles: {
          fillColor: [255, 204, 0],
          textColor: [0, 0, 0],
          fontStyle: "bold",
          fontSize: dynamicFontSize + 1,
        },
        alternateRowStyles: {
          fillColor: [245, 245, 245],
        },
        margin: {
          top: 30,
          bottom: 5,
          left: 8,
          right: 8,
        },
        tableWidth: "auto",
        horizontalPageBreak: true,
        showHead: "everyPage",
        pageBreak: "auto",
        theme: "grid",
      });

      doc.save(`${exportFileName}_${now.toISOString().slice(0, 10)}.pdf`);
      showSuccess("PDF exported successfully!");
    } catch (error) {
      console.error("PDF Export Error:", error);
      showError(`Failed to export PDF: ${error.message}`);
    }
  };

  // Export to Excel
  const exportToExcel = () => {
    try {
      const visibleColumnKeys = getOrderedColumns()
        .filter((col) => visibleColumns[col.key])
        .map((col) => col.key);

      const exportData = filteredData.map((record, index) => {
        const row = {};
        visibleColumnKeys.forEach((key) => {
          const columnName = formatColumnName(key);
          if (key === "sn") {
            row[columnName] = index + 1;
          } else if (columnsWithDateFilter.includes(key)) {
            row[columnName] = formatDateForDisplay(record[key]);
          } else {
            row[columnName] = record[key] || "";
          }
        });
        return row;
      });

      const ws = XLSX.utils.json_to_sheet(exportData);

      if (!ws["!cols"]) ws["!cols"] = [];

      visibleColumnKeys.forEach((key, index) => {
        const colLetter = XLSX.utils.encode_col(index);
        const columnConfig = tableColumns.find((col) => col.key === key);
        const width = columnConfig ? Math.min(columnConfig.width / 7, 50) : 15;
        ws["!cols"][index] = { width };
        const headerCell = XLSX.utils.encode_cell({ r: 0, c: index });
        if (!ws[headerCell]) return;
        ws[headerCell].s = {
          fill: { fgColor: { rgb: "FFFF00" } },
          font: { bold: true },
          alignment: { horizontal: "center" },
        };
      });

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

      XLSX.writeFile(
        wb,
        `${exportFileName}_${new Date().toISOString().slice(0, 10)}.xlsx`,
      );
      showSuccess("Excel exported successfully!");
    } catch (error) {
      showError(`Failed to export Excel: ${error.message}`);
    }
  };

  // Export to JSON
  const exportToJSON = () => {
    try {
      const visibleColumnKeys = getOrderedColumns()
        .filter((col) => visibleColumns[col.key])
        .map((col) => col.key);

      const exportData = filteredData.map((record, index) => {
        const row = {};
        visibleColumnKeys.forEach((key) => {
          if (key === "sn") {
            row[key] = index + 1;
          } else if (columnsWithDateFilter.includes(key)) {
            row[key] = formatDateForDisplay(record[key]);
          } else {
            row[key] = record[key] || "";
          }
        });
        return row;
      });

      const json = JSON.stringify(exportData, null, 2);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `${exportFileName}_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      showSuccess("JSON exported successfully!");
    } catch (error) {
      showError(`Failed to export JSON: ${error.message}`);
    }
  };

  // Handle export
  const handleExport = (type) => {
    if (!canExport) {
      showError("You don't have export permission for this module");
      return;
    }
    switch (type) {
      case "PDF":
        exportToPDF();
        break;
      case "Excel":
        exportToExcel();
        break;
      case "JSON":
        exportToJSON();
        break;
      default:
        showError(`Export type ${type} not supported`);
    }
  };

  const renderExtraExportItems = () => {
    if (!extraExportItems.length) return null;
    return extraExportItems.map((item, index) => (
      <li key={`extra-export-${index}`}>
        <button
          className="dropdown-item"
          onClick={item.onClick}
          disabled={!canExport}
        >
          {item.label}
        </button>
      </li>
    ));
  };

  const pageInfo = paginationInfo();
  const paginationItems = getPaginationItems();

  return (
    <>
      <div className="card">
        <div className="card-header">
          <div className="row align-items-center">
            <div className="col-md-3">
              <h4 className="mb-0">{tableTitle}</h4>
              {activeCardFilter && cards && activeCardFilter !== "addNew" && (
                <small className="text-muted">
                  Filtered by:{" "}
                  {cards.find((card) => card.key === activeCardFilter)?.title}
                </small>
              )}
            </div>
            <div className="col-md-9">
              <div className="d-md-none mobile-icons mt-2">
                <div className="d-flex flex-wrap gap-2">
                  {showSearch && (
                    <button
                      className="btn btn-sm btn-danger flex-grow-1"
                      onClick={() => setShowMobileSearch(!showMobileSearch)}
                    >
                      <i className="fas fa-search"></i>
                    </button>
                  )}
                  {showAdvancedFilter && (
                    <button
                      className="btn btn-md btn-outline-danger me-2"
                      onClick={() => {
                        setShowFilterOffcanvas(true);
                        setCurrentColumnFilter(null);
                      }}
                      title="Advanced Filters"
                    >
                      <i className="fas fa-filter me-1"></i>
                    </button>
                  )}
                  {showRefresh && (
                    <button
                      className="btn btn-sm btn-warning flex-grow-1"
                      onClick={handleRefresh}
                    >
                      <i className="fas fa-sync-alt"></i>
                    </button>
                  )}
                  {showColumnSelector && (
                    <button
                      className="btn btn-sm btn-info flex-grow-1"
                      onClick={() => setShowColumnSelectorOffcanvas(true)}
                    >
                      <i className="fas fa-columns"></i>
                    </button>
                  )}
                  {showExport && (
                    <div className="dropdown flex-grow-1">
                      <button
                        className="btn btn-sm btn-secondary w-100 dropdown-toggle"
                        type="button"
                        data-bs-toggle="dropdown"
                        disabled={!canExport}
                      >
                        <i className="fas fa-download"></i>
                      </button>
                      <ul className="dropdown-menu">
                        {renderExtraExportItems()}
                        <li>
                          <button
                            className="dropdown-item"
                            onClick={() => handleExport("Excel")}
                            disabled={!canExport}
                          >
                            Excel
                          </button>
                        </li>
                        <li>
                          <button
                            className="dropdown-item"
                            onClick={() => handleExport("JSON")}
                            disabled={!canExport}
                          >
                            JSON
                          </button>
                        </li>
                        <li>
                          <button
                            className="dropdown-item"
                            onClick={() => handleExport("PDF")}
                            disabled={!canExport}
                          >
                            PDF
                          </button>
                        </li>
                      </ul>
                    </div>
                  )}
                  <div className="flex-grow-1">
                    <select
                      className="form-select form-select-sm"
                      value={recordsPerPage}
                      onChange={(e) =>
                        handleRecordsPerPageChange(Number(e.target.value))
                      }
                    >
                      <option value="10">10</option>
                      <option value="25">25</option>
                      <option value="50">50</option>
                      <option value="100">100</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="d-none d-md-flex justify-content-end align-items-center">
                {showSearch && (
                  <div
                    className="input-group me-2"
                    style={{ maxWidth: "300px" }}
                  >
                    <input
                      type="text"
                      className="form-control form-control-sm"
                      placeholder="Search..."
                      value={searchTerm}
                      onChange={(e) => handleGlobalSearch(e.target.value)}
                    />
                    <button className="btn btn-info" type="button">
                      <i className="fas fa-search"></i>
                    </button>
                  </div>
                )}

                <div className="me-2">
                  <select
                    className="form-select form-select-md"
                    value={recordsPerPage}
                    onChange={(e) =>
                      handleRecordsPerPageChange(Number(e.target.value))
                    }
                  >
                    <option value="10">10</option>
                    <option value="25">25</option>
                    <option value="50">50</option>
                    <option value="100">100</option>
                    <option value="250">250</option>
                    <option value="500">500</option>
                  </select>
                </div>

                {showAdvancedFilter && (
                  <button
                    className="btn btn-md btn-outline-danger me-2"
                    onClick={() => {
                      setShowFilterOffcanvas(true);
                      setCurrentColumnFilter(null);
                    }}
                    title="Advanced Filters"
                  >
                    <i className="fas fa-filter me-1"></i>
                  </button>
                )}

                {showRefresh && (
                  <button
                    className="btn btn-md btn-danger me-2"
                    onClick={handleRefresh}
                  >
                    <i className="fas fa-sync-alt me-1"></i> Refresh
                  </button>
                )}

                {showColumnSelector && (
                  <button
                    className="btn btn-md btn-success me-2"
                    onClick={() => setShowColumnSelectorOffcanvas(true)}
                  >
                    <i className="fas fa-columns me-1"></i> Select Column
                  </button>
                )}

                {showExport && (
                  <div className="dropdown">
                    <button
                      className="btn btn-md btn-warning dropdown-toggle"
                      type="button"
                      data-bs-toggle="dropdown"
                      disabled={!canExport}
                    >
                      <i className="fas fa-download me-1"></i> Export
                    </button>
                    <ul className="dropdown-menu">
                      {renderExtraExportItems()}
                      <li>
                        <button
                          className="dropdown-item"
                          onClick={() => handleExport("Excel")}
                          disabled={!canExport}
                        >
                          Excel
                        </button>
                      </li>
                      <li>
                        <button
                          className="dropdown-item"
                          onClick={() => handleExport("JSON")}
                          disabled={!canExport}
                        >
                          JSON
                        </button>
                      </li>
                      <li>
                        <button
                          className="dropdown-item"
                          onClick={() => handleExport("PDF")}
                          disabled={!canExport}
                        >
                          PDF
                        </button>
                      </li>
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>

          {showMobileSearch && showSearch && (
            <div className="row mt-2 d-md-none">
              <div className="col-12">
                <div className="input-group">
                  <input
                    type="text"
                    className="form-control form-control-sm"
                    placeholder="Search..."
                    value={searchTerm}
                    onChange={(e) => handleGlobalSearch(e.target.value)}
                  />
                  <button className="btn btn-info" type="button">
                    <i className="fas fa-search"></i>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="card-body">
          <div
            className="table-responsive"
            style={{ overflowX: "auto", position: "relative" }}
            ref={tableContainerRef}
          >
            <table
              className="table table-hover table-striped table-bordered"
              style={{ minWidth: "100%" }}
              ref={tableRef}
            >
              <thead className="table-light">
                <tr ref={headerRowRef}>
                  {getOrderedColumns().map(
                    (column) =>
                      visibleColumns[column.key] && (
                        <th
                          key={column.key}
                          scope="col"
                          data-column-key={column.key}
                          style={{
                            cursor:
                              column.key !== "action" ? "pointer" : "default",
                            width: column.width,
                            minWidth: column.width,
                            whiteSpace: "nowrap",
                            position: isPinned(column.key)
                              ? "sticky"
                              : "relative",
                            userSelect: "none",
                            left:
                              isPinned(column.key) === "left" ? "0" : undefined,
                            right:
                              isPinned(column.key) === "right"
                                ? "0"
                                : undefined,
                            zIndex: isPinned(column.key) ? 2 : 1,
                            transform:
                              isPinned(column.key) === "left" ||
                              isPinned(column.key) === "right"
                                ? "translateX(-1px)"
                                : undefined,
                          }}
                        >
                          <div className="d-flex flex-column">
                            <div
                              className="d-flex align-items-center"
                              onClick={(e) => handleSort(column.key, e)}
                              onMouseDown={(e) => startDragging(column.key, e)}
                              style={{
                                cursor:
                                  column.key !== "action"
                                    ? "pointer"
                                    : "default",
                              }}
                            >
                              {column.label}
                              {getSortIcon(column.key)}
                            </div>

                            {column.key !== "action" && column.key !== "sn" && (
                              <>
                                {columnsWithDateFilter.includes(column.key) ? (
                                  <div className="d-flex gap-1 mt-1 position-relative">
                                    <input
                                      type="date"
                                      className="form-control form-control-sm"
                                      placeholder="Start Date"
                                      value={
                                        dateFilters[column.key]?.startDate || ""
                                      }
                                      onChange={(e) =>
                                        handleDateFilterChange(
                                          column.key,
                                          "startDate",
                                          e.target.value,
                                          e,
                                        )
                                      }
                                      onClick={(e) => e.stopPropagation()}
                                      style={{ width: "110px" }}
                                    />
                                    <input
                                      type="date"
                                      className="form-control form-control-sm"
                                      placeholder="End Date"
                                      value={
                                        dateFilters[column.key]?.endDate || ""
                                      }
                                      onChange={(e) =>
                                        handleDateFilterChange(
                                          column.key,
                                          "endDate",
                                          e.target.value,
                                          e,
                                        )
                                      }
                                      onClick={(e) => e.stopPropagation()}
                                      style={{ width: "110px" }}
                                    />
                                  </div>
                                ) : (
                                  <div className="input-group mt-1">
                                    <input
                                      type="text"
                                      className="form-control form-control-sm"
                                      placeholder={`Filter ${column.label}`}
                                      value={
                                        columnsWithDropdownFilter.includes(
                                          column.key,
                                        )
                                          ? getFilterDisplayText(column.key)
                                          : columnFilters[column.key] || ""
                                      }
                                      onChange={(e) =>
                                        handleColumnFilterChange(
                                          column.key,
                                          e.target.value,
                                          e,
                                        )
                                      }
                                      onClick={(e) => e.stopPropagation()}
                                    />
                                    {columnsWithDropdownFilter.includes(
                                      column.key,
                                    ) && (
                                      <button
                                        className="btn btn-outline-secondary btn-sm dropdown-toggle1 rounded-end-1"
                                        type="button"
                                        onClick={(e) => {
                                          setShowFilterOffcanvas(true);
                                          setCurrentColumnFilter(column.key);
                                        }}
                                        title="Advanced Filter"
                                      >
                                        <i className="fas fa-filter"></i>
                                      </button>
                                    )}
                                  </div>
                                )}
                              </>
                            )}
                          </div>

                          <div
                            className="column-resize-handle"
                            onMouseDown={(e) => startResizing(column.key, e)}
                            style={{
                              position: "absolute",
                              right: 0,
                              top: 0,
                              bottom: 0,
                              width: "4px",
                              cursor: "col-resize",
                              backgroundColor:
                                resizing.columnKey === column.key
                                  ? "#0d6efd"
                                  : "transparent",
                              zIndex: 3,
                            }}
                          />
                        </th>
                      ),
                  )}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={getOrderedColumns().length}
                      className="text-center py-5"
                    >
                      <div
                        className="spinner-border text-primary"
                        role="status"
                      >
                        <span className="visually-hidden">Loading...</span>
                      </div>
                      <p className="mt-2 mb-0">Loading data...</p>
                    </td>
                  </tr>
                ) : paginatedData.length > 0 ? (
                  paginatedData.map((record, index) => {
                    const displayIndex = serverSide
                      ? (currentPage - 1) * recordsPerPage + index + 1
                      : (currentPage - 1) * recordsPerPage + index + 1;

                    return (
                      <tr key={record.id || record._id || index}>
                        {getOrderedColumns().map(
                          (column) =>
                            visibleColumns[column.key] && (
                              <td
                                key={`${record.id || record._id || index}-${column.key}`}
                                style={{
                                  whiteSpace: "nowrap",
                                  width: column.width,
                                  minWidth: column.width,
                                  position: isPinned(column.key)
                                    ? "sticky"
                                    : undefined,
                                  left:
                                    isPinned(column.key) === "left"
                                      ? "0"
                                      : undefined,
                                  right:
                                    isPinned(column.key) === "right"
                                      ? "0"
                                      : undefined,
                                  marginLeft:
                                    isPinned(column.key) === "left"
                                      ? "-2px"
                                      : undefined,
                                  marginRight:
                                    isPinned(column.key) === "right"
                                      ? "-2px"
                                      : undefined,
                                  zIndex: isPinned(column.key) ? 2 : 1,
                                  transform:
                                    isPinned(column.key) === "left" ||
                                    isPinned(column.key) === "right"
                                      ? "translateX(-1px)"
                                      : undefined,
                                }}
                              >
                                {column.key === "sn" ? (
                                  displayIndex
                                ) : column.key === "action" && showActions ? (
                                  <div className="d-flex">
                                    {actions.includes("view") && onView && (
                                      <button
                                        className="btn btn-sm btn-outline-info me-1"
                                        onClick={() =>
                                          canRead && onView(record)
                                        }
                                        title="View"
                                        disabled={!canRead}
                                        style={getDisabledActionStyle(canRead)}
                                      >
                                        <i className="fa-solid fa-eye"></i>
                                      </button>
                                    )}
                                    {actions.includes("edit") && onEdit && (
                                      <button
                                        className="btn btn-sm btn-outline-primary me-1"
                                        onClick={() =>
                                          canUpdate && onEdit(record)
                                        }
                                        title="Edit"
                                        disabled={!canUpdate}
                                        style={getDisabledActionStyle(
                                          canUpdate,
                                        )}
                                      >
                                        <i className="fas fa-edit"></i>
                                      </button>
                                    )}
                                    {actions.includes("delete") && onDelete && (
                                      <button
                                        className="btn btn-sm btn-outline-danger me-1"
                                        onClick={() =>
                                          canDelete &&
                                          (skipDeleteConfirmation
                                            ? onDelete(record._id || record.id)
                                            : confirmDelete(record))
                                        }
                                        title="Delete"
                                        disabled={!canDelete}
                                        style={getDisabledActionStyle(
                                          canDelete,
                                        )}
                                      >
                                        <i className="fas fa-trash"></i>
                                      </button>
                                    )}
                                    {customActions && customActions(record)}
                                  </div>
                                ) : column.render ? (
                                  column.render(record[column.key], record)
                                ) : column.key === "status" &&
                                  actions.includes("status") &&
                                  onStatusToggle ? (
                                  <div className="form-check form-switch">
                                    <input
                                      className="form-check-input"
                                      type="checkbox"
                                      checked={
                                        record.status === "Active" ||
                                        record.status === "active"
                                      }
                                      onChange={() =>
                                        canUpdate &&
                                        onStatusToggle(record._id || record.id)
                                      }
                                      style={getDisabledActionStyle(canUpdate)}
                                      disabled={!canUpdate}
                                    />
                                    <label className="form-check-label">
                                      {record.status}
                                    </label>
                                  </div>
                                ) : column.key === "status" &&
                                  !onStatusToggle ? (
                                  <span
                                    className={`badge ${getStatusBadgeClass(record.status)}`}
                                  >
                                    {record.status}
                                  </span>
                                ) : columnsWithDateFilter.includes(
                                    column.key,
                                  ) ? (
                                  formatDateForDisplay(record[column.key])
                                ) : (
                                  record[column.key]
                                )}
                              </td>
                            ),
                        )}
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td
                      colSpan={getOrderedColumns().length}
                      className="text-center py-4"
                    >
                      No records found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {openFilterDropdown && (
            <div
              className="dropdown-menu p-0 show"
              style={{
                width: `${dropdownPosition.width}px`,
                maxWidth: "100vw",
                zIndex: 1060,
                position: "fixed",
                top: `${dropdownPosition.top}px`,
                left: `${dropdownPosition.left}px`,
                boxShadow: "0 0.5rem 1rem rgba(0, 0, 0, 0.15)",
                border: "1px solid rgba(0, 0, 0, 0.15)",
                borderRadius: "0.375rem",
                maxHeight: "min(70vh, calc(100vh - 20px))",
                overflowY: "auto",
              }}
              ref={(el) => (dropdownRefs.current[openFilterDropdown] = el)}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="p-3"
                style={{ borderBottom: "1px solid #dee2e6" }}
              >
                <div className="d-flex justify-content-between align-items-center mb-3">
                  <span className="fw-bold fs-14">
                    {
                      tableColumns.find((c) => c.key === openFilterDropdown)
                        ?.label
                    }{" "}
                    Filter
                  </span>
                  <div>
                    <button
                      className="btn btn-sm btn-outline-danger me-1"
                      onClick={(e) => {
                        clearColumnFilters(openFilterDropdown, e);
                        setFilterSearchTerm("");
                      }}
                      title="Clear all filters for this column"
                    >
                      <i className="fa-solid fa-eraser"></i>
                    </button>
                    <button
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() => setOpenFilterDropdown(null)}
                      title="Close filter menu"
                    >
                      <i className="fas fa-times"></i>
                    </button>
                  </div>
                </div>

                <div className="d-flex align-items-center gap-2">
                  <input
                    type="text"
                    className="form-control form-control-sm flex-grow-1"
                    placeholder="Search options..."
                    value={filterSearchTerm}
                    onChange={(e) => setFilterSearchTerm(e.target.value)}
                    style={{ minWidth: "180px" }}
                  />
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id={`${openFilterDropdown}-all`}
                      checked={
                        Array.isArray(columnFilters[openFilterDropdown]) &&
                        columnFilters[openFilterDropdown].includes("All")
                      }
                      onChange={(e) =>
                        handleSelectFilterChange(
                          openFilterDropdown,
                          "All",
                          e.target.checked,
                          e,
                        )
                      }
                    />
                    <label
                      className="form-check-label"
                      htmlFor={`${openFilterDropdown}-all`}
                    >
                      All
                    </label>
                  </div>
                </div>
              </div>

              <div
                style={{
                  maxHeight: "300px",
                  overflowY: "auto",
                  padding: "0 20px",
                }}
              >
                {(dynamicFilterOptions[openFilterDropdown] || [])
                  .filter((opt) => opt !== "All")
                  .filter(
                    (opt) =>
                      filterSearchTerm === "" ||
                      opt
                        .toLowerCase()
                        .includes(filterSearchTerm.toLowerCase()),
                  ).length > 0 ? (
                  (dynamicFilterOptions[openFilterDropdown] || [])
                    .filter((opt) => opt !== "All")
                    .filter(
                      (opt) =>
                        filterSearchTerm === "" ||
                        opt
                          .toLowerCase()
                          .includes(filterSearchTerm.toLowerCase()),
                    )
                    .map((option) => (
                      <div
                        key={`${openFilterDropdown}-${option}`}
                        className="form-check py-1"
                      >
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id={`${openFilterDropdown}-${option}`}
                          checked={
                            Array.isArray(columnFilters[openFilterDropdown]) &&
                            columnFilters[openFilterDropdown].includes(option)
                          }
                          onChange={(e) =>
                            handleSelectFilterChange(
                              openFilterDropdown,
                              option,
                              e.target.checked,
                              e,
                            )
                          }
                        />
                        <label
                          className="form-check-label"
                          htmlFor={`${openFilterDropdown}-${option}`}
                        >
                          {option}
                        </label>
                      </div>
                    ))
                ) : (
                  <div className="text-center py-2 text-muted">
                    No options found
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="row align-items-center mt-3">
            <div className="col-12 col-lg-6 text-start text-lg-start mb-2 mb-lg-0">
              <p className="mb-0">
                Showing{" "}
                <span className="font-medium">{pageInfo.startRecord}</span> to{" "}
                <span className="font-medium">{pageInfo.endRecord}</span> of{" "}
                <span className="font-medium">{pageInfo.totalRecords}</span>{" "}
                results
              </p>
            </div>
            <div className="col-12 col-lg-6 d-flex justify-content-start justify-content-lg-end">
              <nav>
                <ul className="pagination mb-0">
                  <li
                    className={`page-item ${
                      pageInfo.isPrevDisabled ? "disabled" : ""
                    }`}
                  >
                    <button
                      className="page-link"
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={pageInfo.isPrevDisabled}
                    >
                      <i className="fas fa-chevron-left"></i>
                    </button>
                  </li>
                  {paginationItems}
                  <li
                    className={`page-item ${
                      pageInfo.isNextDisabled ? "disabled" : ""
                    }`}
                  >
                    <button
                      className="page-link"
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={pageInfo.isNextDisabled}
                    >
                      <i className="fas fa-chevron-right"></i>
                    </button>
                  </li>
                </ul>
              </nav>
            </div>
          </div>
        </div>
      </div>

      {showColumnSelectorOffcanvas && (
        <ColumnSelectorOffcanvas
          show={showColumnSelectorOffcanvas}
          onHide={() => setShowColumnSelectorOffcanvas(false)}
          columns={tableColumns}
          setColumns={setTableColumns}
          visibleColumns={visibleColumns}
          setVisibleColumns={setVisibleColumns}
          fixedColumns={fixedColumns}
          pinnedColumns={pinnedColumns}
          setPinnedColumns={setPinnedColumns}
          handleAutoResizeAll={handleAutoResizeAll}
          handleAutoResizeColumn={handleAutoResizeColumn}
        />
      )}

      {showFilterOffcanvas && (
        <AdvancedFilterOffcanvas
          show={showFilterOffcanvas}
          onHide={() => setShowFilterOffcanvas(false)}
          columns={tableColumns}
          columnFilters={columnFilters}
          setColumnFilters={setColumnFilters}
          filterOptions={dynamicFilterOptions}
          currentColumnFilter={currentColumnFilter}
          setCurrentColumnFilter={setCurrentColumnFilter}
        />
      )}

      {showConfirmModal && (
        <ConfirmationModal
          show={showConfirmModal}
          onHide={() => setShowConfirmModal(false)}
          onConfirm={handleConfirmAction}
          title="Confirm Deletion"
          message={(() => {
            const details = getDeleteRecordMeta(modalConfig?.recordData);
            return (
              <>
                Are you sure you want to delete this{" "}
                {details.entityLabel.toLowerCase()}?
                <br />
                {details.primaryLabel}:{" "}
                <strong>{details.primaryValue || "-"}</strong>
                <br />
                {details.secondaryLabel}:{" "}
                <strong>{details.secondaryValue || "-"}</strong>
              </>
            );
          })()}
          confirmText="Delete"
          variant="danger"
        />
      )}
    </>
  );
};

export default ReusableTable;
