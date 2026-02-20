import React, { useEffect, useMemo, useState } from "react";
import ReusableTable from "../Components/ReusableTable";
import CreateCompanyExpense from "../Components/CreateCompanyExpense";
import {
  showError,
  showInfo,
  showSuccess,
} from "../Components/ToastNotification";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { apiDelete, apiGet, apiPost, apiPut } from "../utils/api";

const CompanyExpenseManagement = () => {
  useEffect(() => {
    document.title = "Company Expense Management | MaxCode IT Services";
  }, []);

  const [allRecords, setAllRecords] = useState([]);
  const [records, setRecords] = useState([]);
  const [financialYears, setFinancialYears] = useState([]);
  const [selectedFinancialYear, setSelectedFinancialYear] = useState(
    localStorage.getItem("selectedFinancialYear") || "ALL",
  );
  const [loading, setLoading] = useState(false);
  const [showCreateExpenseForm, setShowCreateExpenseForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [activeCardFilter, setActiveCardFilter] = useState("total");

  const [statistics, setStatistics] = useState({
    total: 0,
    paid: 0,
    unpaid: 0,
    partial: 0,
    totalAmount: 0,
  });

  const cards = [
    {
      icon: "fa-solid fa-receipt",
      title: "Total Expenses",
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

  const formatDateForDisplay = (dateString) => {
    if (!dateString) return "";

    try {
      const date = new Date(dateString);
      if (!Number.isNaN(date.getTime())) {
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
      if (!Number.isNaN(date.getTime())) {
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

  const getDateOnly = (value) => {
    if (!value) return null;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  };

  const updateStatistics = (data) => {
    const totalAmount = data.reduce(
      (sum, record) =>
        sum + parseFloat(record?.taxData?.totalAmount || record?.amount || 0),
      0,
    );

    setStatistics({
      total: data.length,
      paid: data.filter((record) => record.paymentStatus === "Paid").length,
      unpaid: data.filter((record) => record.paymentStatus === "Unpaid").length,
      partial: data.filter((record) => record.paymentStatus === "Partial")
        .length,
      totalAmount,
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
      const expenseDate = getDateOnly(record.expenseDate || record.invoiceDate);
      if (!expenseDate) return false;
      return expenseDate >= startDate && expenseDate <= endDate;
    });

    setRecords(filteredRecords);
    updateStatistics(filteredRecords);
  };

  useEffect(() => {
    fetchFinancialYears();
    fetchCompanyExpenses();

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

  const fetchCompanyExpenses = async () => {
    setLoading(true);
    try {
      const response = await apiGet(API_ENDPOINTS.COMPANY_EXPENSES.LIST);
      const recordsData = Array.isArray(response.data)
        ? response.data
        : response.data?.companyExpenses || response.data?.expenses || [];

      const normalized = recordsData.map((record) => ({
        ...record,
        id: record._id || record.id,
      }));

      setAllRecords(normalized);
    } catch (error) {
      console.error("Company expenses API fetch error:", error);
      showError("Failed to fetch company expenses");
      setAllRecords([]);
      setRecords([]);
      updateStatistics([]);
    } finally {
      setLoading(false);
    }
  };

  const getDefaultFinancialYearRecord = () => {
    return financialYears.find((year) => year?.isDefault === true) || null;
  };

  const isExpenseDateWithinFinancialYear = (
    expenseDate,
    financialYearRecord,
  ) => {
    const expenseDateOnly = getDateOnly(expenseDate);
    const startDate = getDateOnly(financialYearRecord?.startDate);
    const endDate = getDateOnly(financialYearRecord?.endDate);

    if (!expenseDateOnly || !startDate || !endDate) {
      return false;
    }

    return expenseDateOnly >= startDate && expenseDateOnly <= endDate;
  };

  const handleFormSubmit = async (payload) => {
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
          `Please select default financial year ${defaultFinancialYear.value} in navbar before creating company expense.`,
        );
        return;
      }

      const isValidDate = isExpenseDateWithinFinancialYear(
        payload.expenseDate || payload.invoiceDate,
        defaultFinancialYear,
      );

      if (!isValidDate) {
        showError(
          `Expense Date must be between ${formatDateForDisplay(defaultFinancialYear.startDate)} and ${formatDateForDisplay(defaultFinancialYear.endDate)} for financial year ${defaultFinancialYear.value}.`,
        );
        return;
      }
    }

    try {
      if (editingRecord && !editingRecord.isViewMode) {
        const expenseId = editingRecord._id || editingRecord.id;

        await apiPut(API_ENDPOINTS.COMPANY_EXPENSES.UPDATE(expenseId), {
          ...payload,
          createdDate: editingRecord.createdDate,
        });
        showSuccess("Company expense updated successfully!");
      } else {
        await apiPost(API_ENDPOINTS.COMPANY_EXPENSES.CREATE, {
          ...payload,
          createdDate: new Date().toISOString(),
        });
        showSuccess("Company expense added successfully!");
      }

      await fetchCompanyExpenses();
      setShowCreateExpenseForm(false);
      setEditingRecord(null);
    } catch (error) {
      console.error("Error saving company expense:", error);
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to save company expense",
      );
      throw error;
    }
  };

  const handleEdit = (record) => {
    setEditingRecord(record);
    setShowCreateExpenseForm(true);
    showInfo(`Editing expense: ${record.expenseNumber}`);
  };

  const handleView = (record) => {
    setEditingRecord({ ...record, isViewMode: true });
    setShowCreateExpenseForm(true);
    showInfo(`Viewing expense: ${record.expenseNumber}`);
  };

  const handleDelete = async (id) => {
    try {
      await apiDelete(API_ENDPOINTS.COMPANY_EXPENSES.DELETE(id));
      await fetchCompanyExpenses();
      showSuccess("Company expense deleted successfully!");
    } catch (error) {
      console.error("Error deleting company expense:", error);
      showError(
        error.response?.data?.message ||
          error.response?.data?.error ||
          "Failed to delete company expense",
      );
    }
  };

  const prepareTableData = useMemo(() => {
    return records.map((record, index) => {
      const amount = parseFloat(
        record?.taxData?.totalAmount || record?.amount || 0,
      );
      return {
        ...record,
        sn: index + 1,
        expenseDateFormatted: formatDateForDisplay(
          record.expenseDate || record.invoiceDate,
        ),
        paymentDateFormatted: record.paymentDate
          ? formatDateForDisplay(record.paymentDate)
          : "-",
        createdDateTime:
          record.createdDateTime ||
          formatDateTimeForDisplay(record.createdDate),
        amount,
      };
    });
  }, [records]);

  const columns = [
    { key: "sn", label: "S.No", width: 70 },
    { key: "expenseNumber", label: "Expense No.", width: 140 },
    { key: "expenseDateFormatted", label: "Expense Date", width: 130 },
    { key: "expenseCategory", label: "Category", width: 130 },
    { key: "expenseTitle", label: "Expense Title", width: 180 },
    { key: "partyName", label: "Party/Vendor", width: 180 },
    {
      key: "amount",
      label: "Amount",
      width: 130,
      render: (value) => (
        <span className="fw-bold text-success">
          ₹{" "}
          {parseFloat(value || 0).toLocaleString("en-IN", {
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
    { key: "action", label: "Actions", width: 150 },
  ];

  const fixedColumns = ["sn", "action"];
  const defaultVisibleColumns = [
    "sn",
    "expenseNumber",
    "expenseDateFormatted",
    "expenseCategory",
    "expenseTitle",
    "partyName",
    "amount",
    "paymentStatus",
    "paymentMethod",
    "paymentDateFormatted",
    "createdDateTime",
    "action",
  ];

  const columnsWithDropdownFilter = [
    "expenseCategory",
    "paymentStatus",
    "paymentMethod",
  ];
  const columnsWithDateFilter = [
    "createdDateTime",
    "expenseDateFormatted",
    "paymentDateFormatted",
  ];

  const filterOptions = {
    expenseCategory: [
      "All",
      "General",
      "Travel",
      "Food",
      "Maintenance",
      "Office",
      "Utility",
      "Other",
    ],
    paymentStatus: ["All", "Paid", "Unpaid", "Partial"],
    paymentMethod: [
      "All",
      "Cash",
      "Bank Transfer",
      "UPI",
      "Cheque",
      "Credit Card",
      "Debit Card",
    ],
  };

  const handleCardClick = (cardKey) => {
    if (cardKey === "addNew") {
      setEditingRecord(null);
      setShowCreateExpenseForm(true);
      return;
    }

    setActiveCardFilter(cardKey);
  };

  const getCardNumber = (index) => {
    return (index % 8) + 1;
  };

  const handleRefresh = async () => {
    await fetchFinancialYears();
    await fetchCompanyExpenses();
    setActiveCardFilter("total");
    showInfo("Company expense data refreshed!");
  };

  return (
    <div className="container-fluid">
      <div
        className="py-3 d-flex align-items-sm-center flex-sm-row flex-column"
        style={{ marginTop: "70px" }}
      >
        <div className="flex-grow-1">
          <h4 className="fs-18 fw-semibold m-0">Company Expense Management</h4>
        </div>
      </div>

      <div className="row">
        {cards.map((card, index) => {
          const cardNumber = getCardNumber(index);
          const cardClass = `card${cardNumber}`;
          const cardIconBgClass = `card-icon-bg${cardNumber}`;
          const isActive =
            activeCardFilter === card.key && card.key !== "addNew";

          return (
            <div key={card.key} className="col-md-6 col-xl-2 mb-4">
              <div
                className={`card border-0 shadow-sm overflow-hidden ${cardClass} ${isActive ? "border-primary" : ""}`}
                style={{
                  transition: "all 0.3s ease",
                  cursor: "pointer",
                  height: "100%",
                  borderRadius: "12px",
                  border: isActive ? "2px solid #0d6efd" : "1px solid #dee2e6",
                }}
                onClick={() => handleCardClick(card.key)}
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
                          ? `₹ ${parseFloat(
                              statistics[card.key] || 0,
                            ).toLocaleString("en-IN", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}`
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
        columns={columns}
        data={prepareTableData}
        loading={loading}
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
        tableTitle="Company Expense Records"
        showColumnSelector={true}
        showExport={true}
        showRefresh={true}
        showAdvancedFilter={true}
        showSearch={true}
        exportFileName="Company_Expense_Management"
        exportTitle="Company Expense Management Report"
        activeCardFilter={activeCardFilter}
        cards={cards}
      />

      <CreateCompanyExpense
        show={showCreateExpenseForm}
        onClose={() => {
          setShowCreateExpenseForm(false);
          setEditingRecord(null);
        }}
        onSubmit={handleFormSubmit}
        editingRecord={editingRecord}
        existingRecords={allRecords}
      />
    </div>
  );
};

export default CompanyExpenseManagement;
