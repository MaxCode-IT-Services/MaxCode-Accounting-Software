export const getDateOnly = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

export const isDateWithinFinancialYear = (dateValue, financialYearRecord) => {
  const selectedDate = getDateOnly(dateValue);
  const startDate = getDateOnly(financialYearRecord?.startDate);
  const endDate = getDateOnly(financialYearRecord?.endDate);

  if (!selectedDate || !startDate || !endDate) return false;
  return selectedDate >= startDate && selectedDate <= endDate;
};

export const normalizeFinancialYearValue = (financialYearRecord) => {
  return (
    String(
      financialYearRecord?.value ||
        financialYearRecord?.financialYear ||
        financialYearRecord?.year ||
        "",
    ).trim() || ""
  );
};

export const getFinancialYearToken = (financialYearValue) => {
  const value = String(financialYearValue || "").trim();
  if (/^\d{4}-\d{2}$/.test(value)) {
    return `${value.slice(2, 4)}-${value.slice(-2)}`;
  }
  if (/^\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  return "";
};

export const resolveFinancialYearRecord = ({
  financialYears = [],
  selectedFinancialYear = "ALL",
  defaultFinancialYear = null,
}) => {
  const activeYears = (financialYears || []).filter(
    (year) => year?.isDeleted !== true,
  );

  if (selectedFinancialYear && selectedFinancialYear !== "ALL") {
    const selectedMatch = activeYears.find(
      (year) => normalizeFinancialYearValue(year) === selectedFinancialYear,
    );
    if (selectedMatch) return selectedMatch;
  }

  if (defaultFinancialYear) return defaultFinancialYear;

  return (
    activeYears.find(
      (year) => year?.isDefault === true && year?.status !== "Inactive",
    ) || null
  );
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const buildNextNumberFromSeedFormat = ({
  format,
  records,
  numberField,
}) => {
  const normalizedFormat = String(format || "").trim();
  if (!normalizedFormat || !numberField) return "";

  const match = normalizedFormat.match(/^(.*?)(\d+)$/);
  if (!match) return normalizedFormat;

  const prefix = match[1];
  const seed = match[2];
  const width = seed.length;
  const seedNumber = parseInt(seed, 10) || 1;
  const pattern = new RegExp(`^${escapeRegExp(prefix)}(\\d+)$`);

  let maxSerial = 0;
  (records || []).forEach((record) => {
    const raw = String(record?.[numberField] || "").trim();
    const serialMatch = raw.match(pattern);
    if (!serialMatch) return;

    const serial = parseInt(serialMatch[1], 10);
    if (!Number.isNaN(serial) && serial > maxSerial) {
      maxSerial = serial;
    }
  });

  const nextSerial = Math.max(seedNumber, maxSerial + 1);
  return `${prefix}${String(nextSerial).padStart(width, "0")}`;
};

export const buildFinancialSequenceNumber = ({
  code,
  financialYearValue,
  records,
  numberField,
}) => {
  const yearToken = getFinancialYearToken(financialYearValue);
  if (!code || !yearToken || !numberField) return "";

  const prefix = `MC/${code}/${yearToken}/`;
  const pattern = new RegExp(`^${escapeRegExp(prefix)}(\\d+)$`, "i");

  let maxSerial = 0;
  (records || []).forEach((record) => {
    const raw = String(record?.[numberField] || "").trim();
    const match = raw.match(pattern);
    if (!match) return;

    const serial = parseInt(match[1], 10);
    if (!Number.isNaN(serial) && serial > maxSerial) {
      maxSerial = serial;
    }
  });

  const nextSerial = String(maxSerial + 1).padStart(4, "0");
  return `${prefix}${nextSerial}`;
};
