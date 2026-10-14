/**
 * Payment Processing Fee — calculation rules shared by the sales form and the
 * invoice API.
 *
 * The fee is charged on the GST-inclusive payable value of the invoice's
 * regular (non-fee) items:
 *
 *   Payment Base = eligible items subtotal + GST on those items
 *
 * Only then are the configured gateway fee and MDR applied. The fee itself is
 * deliberately excluded from the base, otherwise it would compound on itself.
 *
 * The resulting amount is the GST-EXCLUSIVE taxable value of the fee line. The
 * invoice engine then applies the invoice tax rate to it like any other line,
 * so the fee's GST lands in the normal CGST/SGST/IGST summary instead of a
 * separate block.
 *
 * Configured percentages are treated as GST-exclusive, which is what the
 * Payment Method Charges data model stores. A cap of 0 (or blank) means "no
 * cap".
 */

export const PAYMENT_PROCESSING_FEE_TYPE = "payment-processing-fee";
export const PAYMENT_PROCESSING_FEE_LABEL = "Payment Processing Fee";

const toNumber = (value) => {
  const num = Number.parseFloat(value);
  return Number.isNaN(num) ? 0 : num;
};

export const round2 = (value) => Math.round(toNumber(value) * 100) / 100;

/**
 * A row is a fee row only when it carries the explicit type marker. Matching on
 * the name alone would hijack a legitimate service that happens to be called
 * "Payment Processing Fee".
 */
export const isPaymentProcessingFeeItem = (item) =>
  item?.itemType === PAYMENT_PROCESSING_FEE_TYPE;

// Sum of every regular line. Fee lines are excluded so the base never includes
// the fee it is about to produce.
export const computeEligibleSubtotal = (items = []) =>
  round2(
    (Array.isArray(items) ? items : []).reduce(
      (sum, item) =>
        isPaymentProcessingFeeItem(item) ? sum : sum + toNumber(item?.amount),
      0,
    ),
  );

// One charge component: percentage of the base, clamped by the cap when set.
const computeComponent = (enabled, percent, cap, base) => {
  if (enabled !== true) return 0;
  const rate = toNumber(percent);
  if (rate <= 0) return 0;

  const raw = (base * rate) / 100;
  const capValue = toNumber(cap);
  return round2(capValue > 0 ? Math.min(raw, capValue) : raw);
};

/**
 * A component applies only above its threshold amount, e.g. UPI charges 0.40%
 * MDR (capped) only when the payment exceeds ₹2,000.
 *
 * A threshold of 0 (or blank) means "no threshold" — the component applies at
 * any amount, which is the behaviour for every method configured before this
 * field existed.
 */
const computeWithThreshold = (enabled, percent, cap, minAmount, base) => {
  if (enabled !== true) return 0;

  const threshold = toNumber(minAmount);
  if (threshold > 0 && toNumber(base) <= threshold) return 0;

  return computeComponent(true, percent, cap, base);
};

export const computeGatewayFee = (feeConfig = {}, base = 0) =>
  computeWithThreshold(
    feeConfig.processingFeeEnabled === true,
    feeConfig.processingFeePercent,
    feeConfig.processingFeeCap,
    feeConfig.processingFeeMinAmount,
    base,
  );

export const computeMdr = (feeConfig = {}, base = 0) =>
  computeWithThreshold(
    feeConfig.mdrEnabled === true,
    feeConfig.mdrPercent,
    feeConfig.mdrCap,
    feeConfig.mdrMinAmount,
    base,
  );

/**
 * Full breakdown for one fee line.
 *
 * Returns the GST-exclusive `taxableValue` that goes into the item row, plus
 * the intermediate figures for display and for server-side verification.
 */
export const computePaymentProcessingFee = ({
  items = [],
  taxPercentage = 0,
  feeConfig = {},
} = {}) => {
  const eligibleSubtotal = computeEligibleSubtotal(items);
  const taxRate = toNumber(taxPercentage);
  const eligibleGst = round2((eligibleSubtotal * taxRate) / 100);
  const paymentBase = round2(eligibleSubtotal + eligibleGst);

  const gatewayFee = computeGatewayFee(feeConfig, paymentBase);
  const mdr = computeMdr(feeConfig, paymentBase);

  // Both components are GST-exclusive, so the line's taxable value is their sum.
  const taxableValue = round2(gatewayFee + mdr);
  const gstOnFee = round2((taxableValue * taxRate) / 100);

  return {
    eligibleSubtotal,
    eligibleGst,
    paymentBase,
    gatewayFee,
    mdr,
    taxableValue,
    gstOnFee,
    totalWithGst: round2(taxableValue + gstOnFee),
    taxRate,
  };
};

// "UPI — 2% + 0.4% (max ₹300) above ₹2000" style summary for the dropdown.
export const buildPaymentMethodLabel = (method = {}) => {
  const parts = [];

  const describe = (percent, cap, minAmount) => {
    const capLabel = toNumber(cap) > 0 ? ` (max ₹${toNumber(cap)})` : "";
    const thresholdLabel =
      toNumber(minAmount) > 0 ? ` above ₹${toNumber(minAmount)}` : "";
    return `${toNumber(percent)}%${capLabel}${thresholdLabel}`;
  };

  if (method.processingFeeEnabled === true && toNumber(method.processingFeePercent) > 0) {
    parts.push(
      describe(
        method.processingFeePercent,
        method.processingFeeCap,
        method.processingFeeMinAmount,
      ),
    );
  }

  if (method.mdrEnabled === true && toNumber(method.mdrPercent) > 0) {
    parts.push(
      describe(method.mdrPercent, method.mdrCap, method.mdrMinAmount),
    );
  }

  const name = String(method.name || "").trim();
  if (!parts.length) return name ? `${name} — No charge` : "Unnamed method";
  return `${name} — ${parts.join(" + ")}`;
};

// Snapshot of a payment method's charge rules, stored on the fee line so the
// invoice can be reproduced even after the master configuration changes.
export const buildFeeConfigSnapshot = (method = {}) => ({
  processingFeeEnabled: method.processingFeeEnabled === true,
  processingFeePercent: toNumber(method.processingFeePercent),
  processingFeeCap: toNumber(method.processingFeeCap),
  processingFeeMinAmount: toNumber(method.processingFeeMinAmount),
  mdrEnabled: method.mdrEnabled === true,
  mdrPercent: toNumber(method.mdrPercent),
  mdrCap: toNumber(method.mdrCap),
  mdrMinAmount: toNumber(method.mdrMinAmount),
  chargeMode: method.chargeMode === "included" ? "included" : "extra",
});

/**
 * Recompute every fee line against the current regular items and return a new
 * items array. Regular lines are returned untouched.
 *
 * `resolveConfig` lets callers supply a fee line's config from the stored
 * snapshot (normal case) instead of a live lookup.
 */
export const recalculateFeeItems = (items = [], taxPercentage = 0) => {
  const list = Array.isArray(items) ? items : [];
  if (!list.some(isPaymentProcessingFeeItem)) return list;

  return list.map((item) => {
    if (!isPaymentProcessingFeeItem(item)) return item;

    const { taxableValue } = computePaymentProcessingFee({
      items: list,
      taxPercentage,
      feeConfig: item.feeConfig || {},
    });

    return {
      ...item,
      qty: 1,
      price: taxableValue,
      amount: taxableValue,
    };
  });
};
