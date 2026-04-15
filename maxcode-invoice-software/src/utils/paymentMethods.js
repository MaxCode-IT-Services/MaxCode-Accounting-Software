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

  return PAYMENT_METHOD_CANONICAL_MAP.get(trimmed.toLowerCase()) || trimmed;
};

export const normalizePaymentMethodOptions = (values = []) => {
  const normalized = values
    .map((value) => normalizePaymentMethod(value))
    .filter(Boolean);

  return [...new Set(normalized)];
};
