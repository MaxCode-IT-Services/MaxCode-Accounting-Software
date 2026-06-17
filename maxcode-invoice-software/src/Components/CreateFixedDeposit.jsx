import React, { useState, useEffect } from "react";
import Select from "react-select";
import { showSuccess, showError } from "./ToastNotification";
import { apiGet, apiPost, apiPut } from "../utils/api";
import API_ENDPOINTS from "../utils/apiEndpoints";
import { getUnifiedSelectStyles } from "../utils/reactSelectStyles";

const CreateFixedDeposit = ({ show, onClose, onSubmit, editingRecord = null }) => {
    const [formData, setFormData] = useState({
        fdNumber: "",
        bankName: "",
        transferredFromAccountType: "Bank Account",
        transferredFromAccount: "",
        principalAmount: "",
        amount: "",
        rateOfInterest: "",
        startDate: "",
        maturityDate: "",
        tenure: "",
        fdStatus: "Active",
        interestPayoutMode: "Maturity",
        financialYear: "",
        fdAdviceLink: "",
        remarks: "",
        // Closure fields
        closureDate: "",
        totalInterestEarned: "",
        penaltyAmount: "",
        closurePaymentMethod: "Bank Account",
        closureRemarks: "",
    });

    const [errors, setErrors] = useState({});
    const [isGeneratingFdNumber, setIsGeneratingFdNumber] = useState(false);
    const [financialYears, setFinancialYears] = useState([]);
    const [selectedFinancialYear, setSelectedFinancialYear] = useState(null);
    const [defaultFinancialYear, setDefaultFinancialYear] = useState(null);

    const fieldNames = {
        fdNumber: "FD Number",
        bankName: "Bank Name",
        transferredFromAccountType: "Transferred From Account Type",
        transferredFromAccount: "Transferred From Account",
        amount: "Amount",
        rateOfInterest: "Rate of Interest (%)",
        startDate: "Start Date",
        maturityDate: "Maturity Date",
        tenure: "Tenure",
        fdStatus: "FD Status",
        interestPayoutMode: "Interest Payout Mode",
        financialYear: "Financial Year",
        fdAdviceLink: "FD Advice Google Drive Link",
        remarks: "Remarks",
    };

    const FD_STATUS_OPTIONS = [
        { value: "Active", label: "Active" },
        { value: "Matured", label: "Matured" },
        { value: "Closed", label: "Closed Early" },
        { value: "Renewed", label: "Renewed" },
    ];

    const INTEREST_PAYOUT_OPTIONS = [
        { value: "Maturity", label: "At Maturity" },
        { value: "Quarterly", label: "Quarterly" },
        { value: "Half-yearly", label: "Half-yearly" },
        { value: "Annually", label: "Annually" },
    ];

    const CLOSURE_PAYMENT_OPTIONS = [
        { value: "Bank Account", label: "Bank Account" },
        { value: "Cash Account", label: "Cash Account" },
    ];

    const SOURCE_ACCOUNT_OPTIONS = [
        { value: "Bank Account", label: "Bank Account" },
        { value: "Cash Account", label: "Cash Account" },
    ];

    // Fetch financial years
    useEffect(() => {
        const fetchYears = async () => {
            try {
                const response = await apiGet(API_ENDPOINTS.YEARS.LIST);
                const years = response.data?.data || response.data || [];
                const filteredYears = years.filter((y) => !y.isDeleted);
                setFinancialYears(
                    filteredYears.map((y) => ({
                        value: y.financialYear || y.year,
                        label: y.financialYear || y.year,
                    }))
                );

                // Find and set the default financial year
                const defaultYear = filteredYears.find((y) => y.isDefault);
                if (defaultYear) {
                    const defaultValue = defaultYear.financialYear || defaultYear.year;
                    setDefaultFinancialYear(defaultValue);
                }
            } catch (error) {
                console.error("Error fetching financial years:", error);
            }
        };
        fetchYears();
    }, []);

    useEffect(() => {
        if (show) {
            document.body.style.overflow = "hidden";
        } else {
            document.body.style.overflow = "auto";
        }

        return () => {
            document.body.style.overflow = "auto";
        };
    }, [show]);

    // Initialize form
    useEffect(() => {
        if (editingRecord) {
            const principal = editingRecord.principalAmount || editingRecord.amount || "";
            setFormData({
                fdNumber: editingRecord.fdNumber || "",
                bankName: editingRecord.bankName || "",
                transferredFromAccountType:
                    editingRecord.transferredFromAccountType || "Bank Account",
                transferredFromAccount: editingRecord.transferredFromAccount || "",
                principalAmount: principal,
                amount: principal,
                rateOfInterest: editingRecord.rateOfInterest || "",
                startDate: editingRecord.startDate ? editingRecord.startDate.split("T")[0] : "",
                maturityDate: editingRecord.maturityDate ? editingRecord.maturityDate.split("T")[0] : "",
                tenure: editingRecord.tenure || "",
                fdStatus: editingRecord.fdStatus || "Active",
                interestPayoutMode: editingRecord.interestPayoutMode || "Maturity",
                financialYear: editingRecord.financialYear || "",
                fdAdviceLink: editingRecord.fdAdviceLink || "",
                remarks: editingRecord.remarks || "",
                // Closure fields
                closureDate: editingRecord.closureDate ? editingRecord.closureDate.split("T")[0] : "",
                totalInterestEarned: editingRecord.totalInterestEarned ?? "",
                penaltyAmount: editingRecord.penaltyAmount ?? "",
                closurePaymentMethod: editingRecord.closurePaymentMethod || "Bank Account",
                closureRemarks: editingRecord.closureRemarks || "",
            });
            setSelectedFinancialYear(editingRecord.financialYear || null);
        } else {
            setFormData({
                fdNumber: "",
                bankName: "",
                transferredFromAccountType: "Bank Account",
                transferredFromAccount: "",
                principalAmount: "",
                amount: "",
                rateOfInterest: "",
                startDate: "",
                maturityDate: "",
                tenure: "",
                fdStatus: "Active",
                interestPayoutMode: "Maturity",
                financialYear: defaultFinancialYear || "",
                fdAdviceLink: "",
                remarks: "",
                closureDate: "",
                totalInterestEarned: "",
                penaltyAmount: "",
                closurePaymentMethod: "Bank Account",
                closureRemarks: "",
            });
            setSelectedFinancialYear(defaultFinancialYear || null);
            setErrors({});
        }
    }, [editingRecord, show, defaultFinancialYear]);

    // Auto-fetch next FD number when form opens
    useEffect(() => {
        const autoFetchFdNumber = async () => {
            if (show && !editingRecord && selectedFinancialYear) {
                setIsGeneratingFdNumber(true);
                try {
                    const response = await apiGet(
                        API_ENDPOINTS.FIXED_DEPOSITS.NEXT_NUMBER(selectedFinancialYear),
                    );
                    if (response.data?.fdNumber) {
                        setFormData((prev) => ({
                            ...prev,
                            fdNumber: response.data.fdNumber,
                        }));
                    }
                } catch (error) {
                    console.error("Error fetching next FD number:", error);
                } finally {
                    setIsGeneratingFdNumber(false);
                }
            }
        };

        autoFetchFdNumber();
    }, [show, selectedFinancialYear, editingRecord]);

    // Listen for financial year changes from other sources
    useEffect(() => {
        const handleFinancialYearChange = (event) => {
            const newYear = event.detail?.financialYear;
            if (newYear && show && !editingRecord) {
                setSelectedFinancialYear(newYear);
            }
        };

        window.addEventListener("financialYearChanged", handleFinancialYearChange);
        return () => window.removeEventListener("financialYearChanged", handleFinancialYearChange);
    }, [show, editingRecord]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;

        const numericFields = ["amount", "principalAmount", "rateOfInterest", "tenure", "totalInterestEarned", "penaltyAmount"];

        if (numericFields.includes(name)) {
            const numericValue = value.replace(/[^\d.]/g, "");
            setFormData((prev) => {
                const updated = { ...prev, [name]: numericValue };
                // Keep amount and principalAmount in sync
                if (name === "amount") updated.principalAmount = numericValue;
                if (name === "principalAmount") updated.amount = numericValue;
                return updated;
            });
        } else if (name === "transferredFromAccount") {
            const alphanumericValue = value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
            setFormData((prev) => ({ ...prev, [name]: alphanumericValue }));
        } else {
            setFormData((prev) => ({ ...prev, [name]: value }));
        }

        if (errors[name]) {
            setErrors((prev) => ({ ...prev, [name]: "" }));
        }
    };

    const handleSelectChange = (name, selectedOption) => {
        setFormData((prev) => ({
            ...prev,
            [name]: selectedOption ? selectedOption.value : "",
        }));
        if (errors[name]) {
            setErrors((prev) => ({
                ...prev,
                [name]: "",
            }));
        }
    };

    const isClosureStatus = formData.fdStatus === "Matured" || formData.fdStatus === "Closed";

    const validateForm = () => {
        const newErrors = {};

        const requiredFields = [
            "fdNumber",
            "bankName",
            "transferredFromAccountType",
            "transferredFromAccount",
            "amount",
            "rateOfInterest",
            "startDate",
            "maturityDate",
            "tenure",
            "financialYear",
        ];

        requiredFields.forEach((field) => {
            if (!formData[field] || formData[field].toString().trim() === "") {
                newErrors[field] = `${fieldNames[field]} is required`;
            }
        });

        // Closure fields required when status is Matured/Closed
        if (isClosureStatus) {
            if (!formData.closureDate) newErrors.closureDate = "Closure Date is required";
            if (formData.totalInterestEarned === "" || formData.totalInterestEarned === null)
                newErrors.totalInterestEarned = "Total Interest Earned is required";
            if (!formData.closurePaymentMethod)
                newErrors.closurePaymentMethod = "Closure Payment Method is required";
        }

        if (formData.amount && isNaN(parseFloat(formData.amount))) {
            newErrors.amount = "Amount must be a valid number";
        }
        if (formData.rateOfInterest && isNaN(parseFloat(formData.rateOfInterest))) {
            newErrors.rateOfInterest = "Rate of Interest must be a valid number";
        }
        if (formData.tenure && isNaN(parseInt(formData.tenure))) {
            newErrors.tenure = "Tenure must be a valid number";
        }
        if (formData.startDate && formData.maturityDate) {
            if (new Date(formData.startDate) >= new Date(formData.maturityDate)) {
                newErrors.maturityDate = "Maturity Date must be after Start Date";
            }
        }

        setErrors(newErrors);

        if (Object.keys(newErrors).length > 0) {
            const firstErrorField = Object.keys(newErrors)[0];
            showError(`Please fill ${fieldNames[firstErrorField] || firstErrorField} field correctly`);
            return false;
        }

        return true;
    };

    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (validateForm()) {
            setSubmitting(true);
            try {
                const principal = parseFloat(formData.amount);
                const submitData = {
                    ...formData,
                    principalAmount: principal,
                    amount: principal,
                    rateOfInterest: parseFloat(formData.rateOfInterest),
                    tenure: parseInt(formData.tenure),
                    totalInterestEarned: isClosureStatus ? parseFloat(formData.totalInterestEarned || 0) : 0,
                    penaltyAmount: isClosureStatus ? parseFloat(formData.penaltyAmount || 0) : 0,
                    closureDate: isClosureStatus ? formData.closureDate : null,
                    closurePaymentMethod: isClosureStatus ? formData.closurePaymentMethod : null,
                    closureRemarks: isClosureStatus ? formData.closureRemarks : "",
                };

                if (editingRecord && !editingRecord.isViewMode) {
                    const fdId = editingRecord._id || editingRecord.id;
                    const { _id, id, ...cleanData } = submitData;
                    await apiPut(API_ENDPOINTS.FIXED_DEPOSITS.UPDATE(fdId), cleanData);
                    showSuccess("Fixed Deposit updated successfully!");
                } else {
                    await apiPost(API_ENDPOINTS.FIXED_DEPOSITS.CREATE, submitData);
                    showSuccess("Fixed Deposit created successfully!");
                }

                onSubmit(submitData);
            } catch (error) {
                console.error("Error saving FD:", error);
                showError(
                    error.response?.data?.message ||
                        error.response?.data?.error ||
                        "Failed to save Fixed Deposit. Please try again."
                );
            } finally {
                setSubmitting(false);
            }
        }
    };

    const RequiredStar = () => <span className="text-danger">*</span>;

    if (!show) return null;

    const modalTitle = editingRecord
        ? editingRecord.isViewMode
            ? `View Fixed Deposit - ${editingRecord.fdNumber}`
            : `Edit Fixed Deposit - ${editingRecord.fdNumber}`
        : "Add New Fixed Deposit";

    const isViewMode = editingRecord?.isViewMode;

    const fdStatusSelectStyles = getUnifiedSelectStyles({
        hasError: Boolean(errors.fdStatus),
    });

    const interestPayoutSelectStyles = getUnifiedSelectStyles({
        hasError: Boolean(errors.interestPayoutMode),
    });

    const financialYearSelectStyles = getUnifiedSelectStyles({
        hasError: Boolean(errors.financialYear),
    });

    return (
        <div
            className={`modal ${show ? "show d-block" : "d-none"}`}
            tabIndex="-1"
            role="dialog"
            style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
        >
            <div className="modal-dialog modal-lg" role="document">
                <div className="modal-content">
                    <div className="modal-header">
                        <h5 className="modal-title">{modalTitle}</h5>
                        <button type="button" className="btn-close" onClick={onClose}></button>
                    </div>

                    <div className="modal-body">
                        <form id="fdForm" onSubmit={handleSubmit} noValidate>
                            <div className="row">
                                {/* FD Number */}
                                <div className="col-lg-4 mb-3">
                                    <label htmlFor="fdNumber" className="form-label">
                                        <i className="fas fa-receipt me-2 text-primary"></i>
                                        FD Number <RequiredStar />
                                    </label>
                                    <input
                                        type="text"
                                        className={`form-control modern-input ${errors.fdNumber ? "is-invalid" : ""}`}
                                        id="fdNumber"
                                        name="fdNumber"
                                        value={formData.fdNumber}
                                        onChange={handleInputChange}
                                        placeholder="Enter FD Number"
                                        readOnly={isViewMode}
                                        maxLength="20"
                                    />
                                    {errors.fdNumber && (
                                        <div className="invalid-feedback d-block">{errors.fdNumber}</div>
                                    )}
                                </div>

                                {/* Bank Name */}
                                <div className="col-lg-4 mb-3">
                                    <label htmlFor="bankName" className="form-label">
                                        <i className="fas fa-building me-2 text-primary"></i>
                                        Bank Name <RequiredStar />
                                    </label>
                                    <input
                                        type="text"
                                        className={`form-control modern-input ${errors.bankName ? "is-invalid" : ""}`}
                                        id="bankName"
                                        name="bankName"
                                        value={formData.bankName}
                                        onChange={handleInputChange}
                                        placeholder="Enter Bank Name"
                                        readOnly={isViewMode}
                                    />
                                    {errors.bankName && (
                                        <div className="invalid-feedback d-block">{errors.bankName}</div>
                                    )}
                                </div>

                                <div className="col-lg-4 mb-3">
                                    <label htmlFor="transferredFromAccountType" className="form-label">
                                        <i className="fas fa-wallet me-2 text-primary"></i>
                                        Transferred From Account Type <RequiredStar />
                                    </label>
                                    <Select
                                        inputId="transferredFromAccountType"
                                        name="transferredFromAccountType"
                                        classNamePrefix="react-select"
                                        styles={getUnifiedSelectStyles({
                                            hasError: Boolean(errors.transferredFromAccountType),
                                        })}
                                        value={SOURCE_ACCOUNT_OPTIONS.find(
                                            (opt) => opt.value === formData.transferredFromAccountType,
                                        )}
                                        onChange={(selectedOption) =>
                                            handleSelectChange(
                                                "transferredFromAccountType",
                                                selectedOption,
                                            )
                                        }
                                        options={SOURCE_ACCOUNT_OPTIONS}
                                        isDisabled={isViewMode}
                                        isClearable={false}
                                    />
                                    {errors.transferredFromAccountType && (
                                        <div className="invalid-feedback d-block">
                                            {errors.transferredFromAccountType}
                                        </div>
                                    )}
                                </div>

                                {/* Transferred From Account */}
                                <div className="col-lg-4 mb-3">
                                    <label htmlFor="transferredFromAccount" className="form-label">
                                        <i className="fas fa-credit-card me-2 text-primary"></i>
                                        Transferred From Account <RequiredStar />
                                    </label>
                                    <input
                                        type="text"
                                        className={`form-control modern-input ${errors.transferredFromAccount ? "is-invalid" : ""}`}
                                        id="transferredFromAccount"
                                        name="transferredFromAccount"
                                        value={formData.transferredFromAccount}
                                        onChange={handleInputChange}
                                        placeholder="Enter Account Number"
                                        readOnly={isViewMode}
                                        maxLength="20"
                                    />
                                    {errors.transferredFromAccount && (
                                        <div className="invalid-feedback d-block">{errors.transferredFromAccount}</div>
                                    )}
                                </div>

                                {/* Amount */}
                                <div className="col-lg-4 mb-3">
                                    <label htmlFor="amount" className="form-label">
                                        <i className="fas fa-indian-rupee-sign me-2 text-primary"></i>
                                        Amount (₹) <RequiredStar />
                                    </label>
                                    <input
                                        type="text"
                                        className={`form-control modern-input ${errors.amount ? "is-invalid" : ""}`}
                                        id="amount"
                                        name="amount"
                                        value={formData.amount}
                                        onChange={handleInputChange}
                                        placeholder="Enter Amount"
                                        readOnly={isViewMode}
                                    />
                                    {errors.amount && (
                                        <div className="invalid-feedback d-block">{errors.amount}</div>
                                    )}
                                </div>

                                {/* Rate of Interest */}
                                <div className="col-lg-4 mb-3">
                                    <label htmlFor="rateOfInterest" className="form-label">
                                        <i className="fas fa-percent me-2 text-primary"></i>
                                        Rate of Interest (%) <RequiredStar />
                                    </label>
                                    <input
                                        type="text"
                                        className={`form-control modern-input ${errors.rateOfInterest ? "is-invalid" : ""}`}
                                        id="rateOfInterest"
                                        name="rateOfInterest"
                                        value={formData.rateOfInterest}
                                        onChange={handleInputChange}
                                        placeholder="Enter Interest Rate"
                                        readOnly={isViewMode}
                                    />
                                    {errors.rateOfInterest && (
                                        <div className="invalid-feedback d-block">{errors.rateOfInterest}</div>
                                    )}
                                </div>

                                {/* Tenure */}
                                <div className="col-lg-4 mb-3">
                                    <label htmlFor="tenure" className="form-label">
                                        <i className="fas fa-hourglass me-2 text-primary"></i>
                                        Tenure (Days) <RequiredStar />
                                    </label>
                                    <input
                                        type="text"
                                        className={`form-control modern-input ${errors.tenure ? "is-invalid" : ""}`}
                                        id="tenure"
                                        name="tenure"
                                        value={formData.tenure}
                                        onChange={handleInputChange}
                                        placeholder="Enter Tenure in Days"
                                        readOnly={isViewMode}
                                    />
                                    {errors.tenure && (
                                        <div className="invalid-feedback d-block">{errors.tenure}</div>
                                    )}
                                </div>

                                {/* Start Date */}
                                <div className="col-lg-4 mb-3">
                                    <label htmlFor="startDate" className="form-label">
                                        <i className="fas fa-calendar-alt me-2 text-primary"></i>
                                        Start Date <RequiredStar />
                                    </label>
                                    <input
                                        type="date"
                                        className={`form-control modern-input ${errors.startDate ? "is-invalid" : ""}`}
                                        id="startDate"
                                        name="startDate"
                                        value={formData.startDate}
                                        onChange={handleInputChange}
                                        readOnly={isViewMode}
                                    />
                                    {errors.startDate && (
                                        <div className="invalid-feedback d-block">{errors.startDate}</div>
                                    )}
                                </div>

                                {/* Maturity Date */}
                                <div className="col-lg-4 mb-3">
                                    <label htmlFor="maturityDate" className="form-label">
                                        <i className="fas fa-calendar-check me-2 text-primary"></i>
                                        Maturity Date <RequiredStar />
                                    </label>
                                    <input
                                        type="date"
                                        className={`form-control modern-input ${errors.maturityDate ? "is-invalid" : ""}`}
                                        id="maturityDate"
                                        name="maturityDate"
                                        value={formData.maturityDate}
                                        onChange={handleInputChange}
                                        readOnly={isViewMode}
                                    />
                                    {errors.maturityDate && (
                                        <div className="invalid-feedback d-block">{errors.maturityDate}</div>
                                    )}
                                </div>

                                {/* FD Status */}
                                <div className="col-lg-4 mb-3">
                                    <label htmlFor="fdStatus" className="form-label">
                                        <i className="fas fa-info-circle me-2 text-primary"></i>
                                        FD Status
                                    </label>
                                    <Select
                                        inputId="fdStatus"
                                        name="fdStatus"
                                        classNamePrefix="react-select"
                                        styles={fdStatusSelectStyles}
                                        value={FD_STATUS_OPTIONS.find((opt) => opt.value === formData.fdStatus)}
                                        onChange={(selectedOption) => handleSelectChange("fdStatus", selectedOption)}
                                        options={FD_STATUS_OPTIONS}
                                        isDisabled={isViewMode}
                                        isClearable={false}
                                    />
                                </div>

                                {/* Interest Payout Mode */}
                                <div className="col-lg-4 mb-3">
                                    <label htmlFor="interestPayoutMode" className="form-label">
                                        <i className="fas fa-money-bill me-2 text-primary"></i>
                                        Interest Payout Mode
                                    </label>
                                    <Select
                                        inputId="interestPayoutMode"
                                        name="interestPayoutMode"
                                        classNamePrefix="react-select"
                                        styles={interestPayoutSelectStyles}
                                        value={INTEREST_PAYOUT_OPTIONS.find((opt) => opt.value === formData.interestPayoutMode)}
                                        onChange={(selectedOption) => handleSelectChange("interestPayoutMode", selectedOption)}
                                        options={INTEREST_PAYOUT_OPTIONS}
                                        isDisabled={isViewMode}
                                        isClearable={false}
                                    />
                                </div>

                                {/* Financial Year */}
                                <div className="col-lg-4 mb-3">
                                    <label htmlFor="financialYear" className="form-label">
                                        <i className="fas fa-calendar me-2 text-primary"></i>
                                        Financial Year <RequiredStar />
                                    </label>
                                    <Select
                                        inputId="financialYear"
                                        name="financialYear"
                                        classNamePrefix="react-select"
                                        styles={financialYearSelectStyles}
                                        value={financialYears.find((opt) => opt.value === formData.financialYear)}
                                        onChange={(selectedOption) => handleSelectChange("financialYear", selectedOption)}
                                        options={financialYears}
                                        isDisabled={isViewMode}
                                        isClearable
                                        isSearchable
                                        placeholder="Select Financial Year"
                                    />
                                    {errors.financialYear && (
                                        <div className="invalid-feedback d-block">{errors.financialYear}</div>
                                    )}
                                </div>

                                {/* FD Advice Google Drive Link */}
                                <div className="col-lg-4 mb-3">
                                    <label htmlFor="fdAdviceLink" className="form-label">
                                        <i className="fas fa-link me-2 text-primary"></i>
                                        FD Advice Google Drive Link
                                    </label>
                                    <input
                                        type="url"
                                        className={`form-control modern-input ${errors.fdAdviceLink ? "is-invalid" : ""}`}
                                        id="fdAdviceLink"
                                        name="fdAdviceLink"
                                        value={formData.fdAdviceLink}
                                        onChange={handleInputChange}
                                        placeholder="Paste Google Drive Link"
                                        readOnly={isViewMode}
                                    />
                                    {errors.fdAdviceLink && (
                                        <div className="invalid-feedback d-block">{errors.fdAdviceLink}</div>
                                    )}
                                </div>

                                {/* Remarks */}
                                <div className="col-12 mb-3">
                                    <label htmlFor="remarks" className="form-label">
                                        <i className="fas fa-sticky-note me-2 text-primary"></i>
                                        Remarks
                                    </label>
                                    <textarea
                                        className={`form-control modern-input ${errors.remarks ? "is-invalid" : ""}`}
                                        id="remarks"
                                        name="remarks"
                                        value={formData.remarks}
                                        onChange={handleInputChange}
                                        placeholder="Enter Remarks (Optional)"
                                        rows="1"
                                        readOnly={isViewMode}
                                        maxLength="500"
                                    />
                                    <small className="text-muted">
                                        {(formData.remarks || "").length}/500 characters
                                    </small>
                                </div>
                            </div>

                            {/* ── FD Closure Details (shown only when Matured or Closed) ── */}
                            {isClosureStatus && (
                                <div className="mt-2">
                                    <div className="alert alert-warning py-2 px-3 mb-3 d-flex align-items-center gap-2">
                                        <i className="fas fa-lock me-1"></i>
                                        <strong>FD Closure Details</strong>
                                        <span className="ms-1 text-muted small">— Required for {formData.fdStatus} status</span>
                                    </div>
                                    <div className="row">
                                        {/* Closure Date */}
                                        <div className="col-lg-4 mb-3">
                                            <label htmlFor="closureDate" className="form-label">
                                                <i className="fas fa-calendar-times me-2 text-warning"></i>
                                                Closure Date <RequiredStar />
                                            </label>
                                            <input
                                                type="date"
                                                className={`form-control modern-input ${errors.closureDate ? "is-invalid" : ""}`}
                                                id="closureDate"
                                                name="closureDate"
                                                value={formData.closureDate}
                                                onChange={handleInputChange}
                                                readOnly={isViewMode}
                                            />
                                            {errors.closureDate && (
                                                <div className="invalid-feedback d-block">{errors.closureDate}</div>
                                            )}
                                        </div>

                                        {/* Total Interest Earned */}
                                        <div className="col-lg-4 mb-3">
                                            <label htmlFor="totalInterestEarned" className="form-label">
                                                <i className="fas fa-coins me-2 text-warning"></i>
                                                Total Interest Earned <RequiredStar />
                                            </label>
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                className={`form-control modern-input ${errors.totalInterestEarned ? "is-invalid" : ""}`}
                                                id="totalInterestEarned"
                                                name="totalInterestEarned"
                                                value={formData.totalInterestEarned}
                                                onChange={handleInputChange}
                                                placeholder="e.g. 5000"
                                                readOnly={isViewMode}
                                            />
                                            {errors.totalInterestEarned && (
                                                <div className="invalid-feedback d-block">{errors.totalInterestEarned}</div>
                                            )}
                                        </div>

                                        {/* Penalty Amount */}
                                        <div className="col-lg-4 mb-3">
                                            <label htmlFor="penaltyAmount" className="form-label">
                                                <i className="fas fa-exclamation-triangle me-2 text-danger"></i>
                                                Penalty Amount (if any)
                                            </label>
                                            <input
                                                type="text"
                                                inputMode="decimal"
                                                className={`form-control modern-input ${errors.penaltyAmount ? "is-invalid" : ""}`}
                                                id="penaltyAmount"
                                                name="penaltyAmount"
                                                value={formData.penaltyAmount}
                                                onChange={handleInputChange}
                                                placeholder="0 if no penalty"
                                                readOnly={isViewMode}
                                            />
                                            {errors.penaltyAmount && (
                                                <div className="invalid-feedback d-block">{errors.penaltyAmount}</div>
                                            )}
                                        </div>

                                        {/* Closure Payment Method */}
                                        <div className="col-lg-4 mb-3">
                                            <label htmlFor="closurePaymentMethod" className="form-label">
                                                <i className="fas fa-university me-2 text-warning"></i>
                                                Closure Payment Method <RequiredStar />
                                            </label>
                                            <Select
                                                inputId="closurePaymentMethod"
                                                name="closurePaymentMethod"
                                                classNamePrefix="react-select"
                                                styles={getUnifiedSelectStyles({ hasError: Boolean(errors.closurePaymentMethod) })}
                                                value={CLOSURE_PAYMENT_OPTIONS.find((opt) => opt.value === formData.closurePaymentMethod)}
                                                onChange={(selectedOption) => handleSelectChange("closurePaymentMethod", selectedOption)}
                                                options={CLOSURE_PAYMENT_OPTIONS}
                                                isDisabled={isViewMode}
                                                isClearable={false}
                                            />
                                            {errors.closurePaymentMethod && (
                                                <div className="invalid-feedback d-block">{errors.closurePaymentMethod}</div>
                                            )}
                                        </div>

                                        {/* Net Amount Received (read-only calculated) */}
                                        <div className="col-lg-4 mb-3">
                                            <label className="form-label">
                                                <i className="fas fa-hand-holding-usd me-2 text-success"></i>
                                                Net Amount Received
                                            </label>
                                            <input
                                                type="text"
                                                className="form-control modern-input bg-light fw-bold text-success"
                                                readOnly
                                                value={(() => {
                                                    const principal = parseFloat(formData.amount || 0);
                                                    const interest = parseFloat(formData.totalInterestEarned || 0);
                                                    const penalty = parseFloat(formData.penaltyAmount || 0);
                                                    const net = principal + interest - penalty;
                                                    return isNaN(net) ? "—" : `₹ ${net.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
                                                })()}
                                            />
                                            <small className="text-muted">Principal + Interest − Penalty</small>
                                        </div>

                                        {/* Closure Remarks */}
                                        <div className="col-lg-4 mb-3">
                                            <label htmlFor="closureRemarks" className="form-label">
                                                <i className="fas fa-comment-alt me-2 text-warning"></i>
                                                Closure Remarks
                                            </label>
                                            <input
                                                type="text"
                                                className="form-control modern-input"
                                                id="closureRemarks"
                                                name="closureRemarks"
                                                value={formData.closureRemarks}
                                                onChange={handleInputChange}
                                                placeholder="Optional closure notes"
                                                readOnly={isViewMode}
                                                maxLength="300"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </form>
                    </div>

                    <div className="modal-footer">
                        <button type="button" className="btn btn-secondary" onClick={onClose}>
                            <i className="fas fa-times me-2"></i>
                            {isViewMode ? "Close" : "Cancel"}
                        </button>
                        {!isViewMode && (
                            <button
                                type="submit"
                                form="fdForm"
                                className="btn btn-success"
                                disabled={submitting}
                            >
                                {submitting ? (
                                    <>
                                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                        Saving...
                                    </>
                                ) : (
                                    <>
                                        <i className="fas fa-check me-2"></i>
                                        {editingRecord ? "Update FD" : "Save FD"}
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <style>{`
                .invalid-feedback.d-block {
                    display: block !important;
                    margin-top: 5px;
                }

                .input-group > .form-control {
                    border-radius: 0;
                }

                .input-group > .form-control:focus {
                    z-index: 0;
                }
            `}</style>
        </div>
    );
};

export default CreateFixedDeposit;
