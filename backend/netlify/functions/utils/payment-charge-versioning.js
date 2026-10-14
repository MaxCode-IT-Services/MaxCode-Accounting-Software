/**
 * Versioned storage for Payment Method Charges.
 *
 * Charge rates change over time (e.g. UPI MDR goes from 0.40% to 0.90%). An
 * invoice issued under the old rates must keep those rates forever, so the
 * rate table is snapshotted into its own versioned collection whenever it
 * changes — the same idea as the terms & conditions versioning.
 *
 * Flow:
 *   1. Settings save compares the incoming rate table with the stored one.
 *   2. If anything differs, a new semantic version (V1.0.1, V1.0.2, …) is
 *      written to `payment_method_charge_versions` with the full table.
 *   3. `business_settings` keeps a pointer to the current version.
 *   4. An invoice stores the version it was created with, and the API prices
 *      its fee from THAT version — never from the live table.
 *
 * Existing invoices have no version stamp; they keep the per-line `feeConfig`
 * snapshot written when they were created, so they stay reproducible.
 */

const SETTINGS_COLLECTION = "business_settings";
const GLOBAL_SETTINGS_SCOPE = "global";
export const PAYMENT_CHARGE_VERSIONS_COLLECTION =
  "payment_method_charge_versions";

export const PAYMENT_CHARGE_VERSION_FIELD = "paymentMethodChargesVersion";
const DEFAULT_VERSION = "V1.0.0";

const toPositiveInteger = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return fallback;
};

export const parseChargeVersion = (value) => {
  const normalized = String(value || "")
    .trim()
    .replace(/^v/i, "V");
  const match = normalized.match(/^V(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
  };
};

const formatChargeVersion = ({ major, minor, patch }) =>
  `V${major}.${minor}.${patch}`;

export const normalizeChargeVersion = (value, fallback = DEFAULT_VERSION) => {
  const parsed = parseChargeVersion(value);
  if (parsed) return formatChargeVersion(parsed);

  const numeric = toPositiveInteger(value, 0);
  if (numeric > 0) return `V1.0.${Math.max(numeric - 1, 0)}`;

  return fallback;
};

export const incrementChargeVersion = (value) => {
  const parsed = parseChargeVersion(normalizeChargeVersion(value));
  if (!parsed) return DEFAULT_VERSION;
  return formatChargeVersion({
    major: parsed.major,
    minor: parsed.minor,
    patch: parsed.patch + 1,
  });
};

// Rate tables are compared field by field so a reordered save or a
// whitespace-only change does not create a spurious version.
const normalizeChargeRow = (row = {}) => ({
  id: String(row?.id || ""),
  name: String(row?.name || "").trim(),
  status: row?.status === "inactive" ? "inactive" : "active",
  processingFeeEnabled: row?.processingFeeEnabled === true,
  processingFeePercent: Number(row?.processingFeePercent) || 0,
  processingFeeCap: Number(row?.processingFeeCap) || 0,
  processingFeeMinAmount: Number(row?.processingFeeMinAmount) || 0,
  mdrEnabled: row?.mdrEnabled === true,
  mdrPercent: Number(row?.mdrPercent) || 0,
  mdrCap: Number(row?.mdrCap) || 0,
  mdrMinAmount: Number(row?.mdrMinAmount) || 0,
  chargeMode: row?.chargeMode === "included" ? "included" : "extra",
});

export const normalizeChargeTable = (value) =>
  (Array.isArray(value) ? value : [])
    .map(normalizeChargeRow)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));

// Deleted rows are excluded: a soft delete is a table change worth versioning,
// but the tombstone itself carries no pricing.
export const normalizeActiveChargeTable = (value) =>
  normalizeChargeTable(value).filter((row) => row.status !== "inactive");

export const chargeTablesDiffer = (a, b) =>
  JSON.stringify(normalizeActiveChargeTable(a)) !==
  JSON.stringify(normalizeActiveChargeTable(b));

const getSharedBusinessSettings = async (db) => {
  const settingsCollection = db.collection(SETTINGS_COLLECTION);
  const globalSettings = await settingsCollection.findOne({
    scope: GLOBAL_SETTINGS_SCOPE,
  });
  if (globalSettings) return globalSettings;

  return settingsCollection.findOne(
    {},
    { sort: { updatedAt: -1, createdAt: -1, _id: -1 } },
  );
};

export const getCurrentChargeVersion = async (db) => {
  const settings = await getSharedBusinessSettings(db);
  return normalizeChargeVersion(settings?.[PAYMENT_CHARGE_VERSION_FIELD]);
};

export const upsertChargeVersionDocument = async (
  db,
  { version, charges = [] },
) => {
  if (!db || !version) return;

  const normalizedVersion = normalizeChargeVersion(version);
  const normalizedCharges = normalizeChargeTable(charges);
  const collection = db.collection(PAYMENT_CHARGE_VERSIONS_COLLECTION);

  await collection.updateOne(
    { version: normalizedVersion },
    {
      $set: {
        charges: normalizedCharges,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        version: normalizedVersion,
        createdAt: new Date(),
      },
    },
    { upsert: true },
  );
};

export const getChargesForVersion = async (db, version) => {
  if (!db || !version) return null;

  const normalizedVersion = normalizeChargeVersion(version);
  const doc = await db
    .collection(PAYMENT_CHARGE_VERSIONS_COLLECTION)
    .findOne({ version: normalizedVersion });

  if (!doc) return null;

  return {
    version: normalizedVersion,
    charges: normalizeChargeTable(doc.charges),
  };
};

/**
 * Decide the version an incoming save should use and persist it.
 *
 * Returns the version the settings document should point at. When the table is
 * unchanged the current version is reused; when it changed a new one is
 * created and the snapshot stored.
 */
export const resolveChargeVersionForSave = async (
  db,
  { incomingCharges, existingCharges, existingVersion },
) => {
  const hasExistingVersion = Boolean(parseChargeVersion(existingVersion));
  const existingTable = normalizeActiveChargeTable(existingCharges);
  const incomingTable = normalizeActiveChargeTable(incomingCharges);

  // First ever save: seed the baseline version rather than counting the jump
  // from "nothing configured" to the first table as a change.
  if (!hasExistingVersion && existingTable.length === 0) {
    await upsertChargeVersionDocument(db, {
      version: DEFAULT_VERSION,
      charges: incomingCharges,
    });
    return DEFAULT_VERSION;
  }

  const currentVersion = normalizeChargeVersion(existingVersion);
  const hasChanged =
    JSON.stringify(incomingTable) !== JSON.stringify(existingTable);

  if (!hasChanged) {
    // Make sure the snapshot exists (a version created before this feature was
    // introduced, or a document saved by an older build).
    await upsertChargeVersionDocument(db, {
      version: currentVersion,
      charges: incomingCharges,
    });
    return currentVersion;
  }

  const nextVersion = incrementChargeVersion(currentVersion);
  await upsertChargeVersionDocument(db, {
    version: nextVersion,
    charges: incomingCharges,
  });
  return nextVersion;
};

export const listChargeVersions = async (db, { limit = 50 } = {}) => {
  if (!db) return [];

  return db
    .collection(PAYMENT_CHARGE_VERSIONS_COLLECTION)
    .find({})
    .sort({ createdAt: -1 })
    .limit(Math.max(1, Math.min(Number(limit) || 50, 200)))
    .toArray();
};
