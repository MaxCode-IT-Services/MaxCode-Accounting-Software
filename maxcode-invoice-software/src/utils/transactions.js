export const TRANSACTION_SOURCE_TYPES = {
  INVOICE: "invoice",
  PURCHASE: "purchase",
  COMPANY_EXPENSE: "company-expense",
  CREDIT_DEBIT_NOTE: "credit-debit-note",
  PAYMENT_RECEIPT: "payment-receipt",
  RCM: "rcm",
  OWNER_INVESTMENT: "owner-investment",
  OWNER_WITHDRAWAL: "owner-withdrawal",
  PROJECT: "project",
};

export const filterTransactionsBySourceType = (
  transactions = [],
  sourceType,
) => {
  if (!Array.isArray(transactions)) return [];
  if (!sourceType) return transactions;
  return transactions.filter(
    (transaction) => transaction?.sourceType === sourceType,
  );
};

export const flattenTransactionRecord = (transaction = {}) => {
  return {
    ...transaction,
    ...(transaction?.sourceRecord || {}),
    sourceRecord: transaction?.sourceRecord || {},
  };
};
