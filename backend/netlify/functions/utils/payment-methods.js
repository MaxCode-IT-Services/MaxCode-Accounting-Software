const PAYMENT_METHOD_CANONICAL_MAP = new Map([
  ["cash", "Cash"],
  ["bank transfer", "Bank Transfer"],
  ["upi", "UPI"],
  ["cheque", "Cheque"],
  ["neft", "NEFT"],
  ["rtgs", "RTGS"],
  ["imps", "IMPS"],
  ["card", "Card"],
  ["credit card", "Card"],
  ["debit card", "Card"],
  ["zoho payment gateway", "Zoho Payment Gateway"],
  ["cashfree payment gateway", "Cashfree Payment Gateway"],
  ["payu payment gateway", "PayU Payment Gateway"],
]);

export const normalizePaymentMethod = (value) => {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";

  const canonical = PAYMENT_METHOD_CANONICAL_MAP.get(trimmed.toLowerCase());
  return canonical || trimmed;
};

export const normalizePaymentMethodsInRecord = (record = {}) => {
  if (!record || typeof record !== "object") return record;

  const normalizedRecord = { ...record };

  if ("paymentMethod" in normalizedRecord) {
    normalizedRecord.paymentMethod = normalizePaymentMethod(
      normalizedRecord.paymentMethod,
    );
  }

  if (Array.isArray(normalizedRecord.paymentDetails)) {
    normalizedRecord.paymentDetails = normalizedRecord.paymentDetails.map(
      (detail) => {
        if (!detail || typeof detail !== "object") return detail;
        const normalizedDetail = { ...detail };

        if ("paymentMethod" in normalizedDetail) {
          normalizedDetail.paymentMethod = normalizePaymentMethod(
            normalizedDetail.paymentMethod,
          );
        }

        return normalizedDetail;
      },
    );
  }

  if (Array.isArray(normalizedRecord.developerTransactions)) {
    normalizedRecord.developerTransactions =
      normalizedRecord.developerTransactions.map((transaction) => {
        if (!transaction || typeof transaction !== "object") {
          return transaction;
        }

        const normalizedTransaction = { ...transaction };

        if ("payoutMethod" in normalizedTransaction) {
          normalizedTransaction.payoutMethod = normalizePaymentMethod(
            normalizedTransaction.payoutMethod,
          );
        }

        return normalizedTransaction;
      });
  }

  return normalizedRecord;
};
