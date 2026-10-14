/**
 * Server-side verification of the invoice's payment processing fee line.
 *
 * The client calculates the fee, but the server must not trust that value: a
 * crafted request could otherwise understate (or inflate) the amount that
 * feeds payment status, receivables and the transaction snapshot.
 *
 * The fee is recomputed from the *invoice's own items* plus the trusted charge
 * configuration held in the Payment Method Charges master, then compared with
 * what the client submitted. Configuration is looked up by payment method id,
 * so a client cannot invent a cheaper rate.
 *
 * This mirrors the client logic in
 * `maxcode-invoice-software/src/utils/paymentProcessingFee.js`; keep both in
 * step when the rules change.
 */

export const PAYMENT_PROCESSING_FEE_TYPE = "payment-processing-fee";
export const PAYMENT_PROCESSING_FEE_LABEL = "Payment Processing Fee";

// Tolerance for float noise across the client/server boundary (paise level).
const AMOUNT_TOLERANCE = 0.02;

const toNumber = (value) => {
  const num = Number.parseFloat(value);
  return Number.isFinite(num) ? num : 0;
};

const round2 = (value) => Math.round(toNumber(value) * 100) / 100;

export const isPaymentProcessingFeeItem = (item) =>
  item?.itemType === PAYMENT_PROCESSING_FEE_TYPE;

const computeComponent = (enabled, percent, cap, base) => {
  if (enabled !== true) return 0;
  const rate = toNumber(percent);
  if (rate <= 0) return 0;

  const raw = (base * rate) / 100;
  const capValue = toNumber(cap);
  return round2(capValue > 0 ? Math.min(raw, capValue) : raw);
};

// A component applies only above its threshold; 0/blank means no threshold.
const computeWithThreshold = (enabled, percent, cap, minAmount, base) => {
  if (enabled !== true) return 0;

  const threshold = toNumber(minAmount);
  if (threshold > 0 && toNumber(base) <= threshold) return 0;

  return computeComponent(true, percent, cap, base);
};

const computeGatewayFee = (feeConfig = {}, base = 0) =>
  computeWithThreshold(
    feeConfig.processingFeeEnabled === true,
    feeConfig.processingFeePercent,
    feeConfig.processingFeeCap,
    feeConfig.processingFeeMinAmount,
    base,
  );

const computeMdr = (feeConfig = {}, base = 0) =>
  computeWithThreshold(
    feeConfig.mdrEnabled === true,
    feeConfig.mdrPercent,
    feeConfig.mdrCap,
    feeConfig.mdrMinAmount,
    base,
  );

export const computeEligibleSubtotal = (items = []) =>
  round2(
    (Array.isArray(items) ? items : []).reduce(
      (sum, item) =>
        isPaymentProcessingFeeItem(item) ? sum : sum + toNumber(item?.amount),
      0,
    ),
  );

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

/**
 * Re-price every fee line from trusted configuration and return the corrected
 * items array plus a list of discrepancies.
 *
 * `getTrustedMethod(id)` must return the Payment Method Charges record for that
 * id (or null). Returning null for an unknown id is a hard failure: the client
 * referenced a method the server cannot verify.
 */
export const verifyAndRepriceFeeItems = ({
  items = [],
  taxPercentage = 0,
  getTrustedMethod,
} = {}) => {
  const list = Array.isArray(items) ? items : [];
  const feeIndexes = list
    .map((item, index) => (isPaymentProcessingFeeItem(item) ? index : -1))
    .filter((index) => index >= 0);

  if (feeIndexes.length === 0) {
    return { items: list, discrepancies: [], hasFee: false };
  }

  const discrepancies = [];

  if (feeIndexes.length > 1) {
    discrepancies.push("Multiple Payment Processing Fee lines submitted");
  }

  const repriced = list.map((item, index) => {
    if (!isPaymentProcessingFeeItem(item)) return item;

    const trustedMethod = getTrustedMethod
      ? getTrustedMethod(item.paymentMethodId)
      : null;

    if (!trustedMethod) {
      discrepancies.push(
        `Payment method ${item.paymentMethodId || "(missing id)"} could not be verified`,
      );
      return item;
    }

    // Trusted rates win over anything the client sent.
    const feeConfig = {
      processingFeeEnabled: trustedMethod.processingFeeEnabled === true,
      processingFeePercent: toNumber(trustedMethod.processingFeePercent),
      processingFeeCap: toNumber(trustedMethod.processingFeeCap),
      processingFeeMinAmount: toNumber(trustedMethod.processingFeeMinAmount),
      mdrEnabled: trustedMethod.mdrEnabled === true,
      mdrPercent: toNumber(trustedMethod.mdrPercent),
      mdrCap: toNumber(trustedMethod.mdrCap),
      mdrMinAmount: toNumber(trustedMethod.mdrMinAmount),
      chargeMode:
        trustedMethod.chargeMode === "included" ? "included" : "extra",
    };

    const breakdown = computePaymentProcessingFee({
      items: list,
      taxPercentage,
      feeConfig,
    });

    const submitted = round2(item.amount);
    if (Math.abs(submitted - breakdown.taxableValue) > AMOUNT_TOLERANCE) {
      discrepancies.push(
        `Processing fee mismatch on "${item.itemDescription || item.itemName}": submitted ${submitted}, expected ${breakdown.taxableValue}`,
      );
    }

    return {
      ...item,
      itemType: PAYMENT_PROCESSING_FEE_TYPE,
      itemName: PAYMENT_PROCESSING_FEE_LABEL,
      qty: 1,
      price: breakdown.taxableValue,
      amount: breakdown.taxableValue,
      paymentMethodId: String(item.paymentMethodId || ""),
      feeConfig,
      feeBreakdown: breakdown,
    };
  });

  return { items: repriced, discrepancies, hasFee: true };
};
