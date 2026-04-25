const SETTINGS_COLLECTION = "business_settings";
const GLOBAL_SETTINGS_SCOPE = "global";
const TERMS_VERSIONS_COLLECTION = "terms_conditions_versions";

const TERMS_SETTINGS_CONFIG = {
  invoice: {
    settingsField: "invoiceTermsConditions",
    settingsAliases: [
      "invoiceTermsConditions",
      "invoiceTerms",
      "termsConditions",
    ],
    versionField: "invoiceTermsVersion",
  },
  selfInvoice: {
    settingsField: "selfInvoiceTermsConditions",
    settingsAliases: [
      "selfInvoiceTermsConditions",
      "selfInvoiceTerms",
      "selfTermsConditions",
    ],
    versionField: "selfInvoiceTermsVersion",
  },
  performaInvoice: {
    settingsField: "performaInvoiceTermsConditions",
    settingsAliases: [
      "performaInvoiceTermsConditions",
      "performaInvoiceTerms",
      "performaTermsConditions",
      "proformaInvoiceTermsConditions",
      "proformaInvoiceTerms",
      "proformaTermsConditions",
    ],
    versionField: "performaInvoiceTermsVersion",
  },
  creditDebitNote: {
    settingsField: "creditDebitNoteTermsConditions",
    settingsAliases: [
      "creditDebitNoteTermsConditions",
      "creditDebitNoteTerms",
      "noteTermsConditions",
      "creditDebitTermsConditions",
    ],
    versionField: "creditDebitNoteTermsVersion",
  },
};

const DEFAULT_SEMVER_VERSION = "V1.0.0";

const toPositiveInteger = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return fallback;
};

const parseSemanticVersion = (value) => {
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

const formatSemanticVersion = ({ major, minor, patch }) =>
  `V${major}.${minor}.${patch}`;

const normalizeSemanticVersion = (value, fallback = DEFAULT_SEMVER_VERSION) => {
  const parsed = parseSemanticVersion(value);
  if (parsed) return formatSemanticVersion(parsed);

  const numeric = toPositiveInteger(value, 0);
  if (numeric > 0) {
    return `V1.0.${Math.max(numeric - 1, 0)}`;
  }

  return fallback;
};

const incrementSemanticPatch = (value) => {
  const parsed = parseSemanticVersion(normalizeSemanticVersion(value));
  if (!parsed) return DEFAULT_SEMVER_VERSION;
  return formatSemanticVersion({
    major: parsed.major,
    minor: parsed.minor,
    patch: parsed.patch + 1,
  });
};

const normalizeTermsArray = (value) => {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
};

const normalizeTermsForCompare = (value) =>
  normalizeTermsArray(value).join("\n");

const getFirstDefinedValue = (source, keys = []) => {
  if (!source || typeof source !== "object") return undefined;

  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      return source[key];
    }
  }

  return undefined;
};

const getTermsConfig = (termsKind) => TERMS_SETTINGS_CONFIG[termsKind] || null;

const getSharedBusinessSettings = async (db) => {
  const settingsCollection = db.collection(SETTINGS_COLLECTION);

  const globalSettings = await settingsCollection.findOne({
    scope: GLOBAL_SETTINGS_SCOPE,
  });

  if (globalSettings) {
    return globalSettings;
  }

  return settingsCollection.findOne(
    {},
    {
      sort: {
        updatedAt: -1,
        createdAt: -1,
        _id: -1,
      },
    },
  );
};

const getTermsBindingFromSettingsDocument = (settingsDocument, termsKind) => {
  const config = getTermsConfig(termsKind);
  if (!config) {
    return null;
  }

  const rawTerms = getFirstDefinedValue(
    settingsDocument || {},
    config.settingsAliases,
  );
  const terms = normalizeTermsArray(rawTerms);
  const version = normalizeSemanticVersion(
    settingsDocument?.[config.versionField],
  );

  return {
    termsKind,
    settingsField: config.settingsField,
    settingsAliases: [...config.settingsAliases],
    versionField: config.versionField,
    terms,
    version,
  };
};

const getTermsBindingFromDatabase = async (db, termsKind) => {
  const settingsDocument = await getSharedBusinessSettings(db);
  return getTermsBindingFromSettingsDocument(settingsDocument, termsKind);
};

const buildTermsVersionPatch = (document, binding) => {
  if (!document || typeof document !== "object" || !binding) {
    return null;
  }

  const versionField = binding.versionField;
  const existingVersion = parseSemanticVersion(document?.[versionField]);
  if (existingVersion) {
    return null;
  }

  return {
    [versionField]: normalizeSemanticVersion(binding.version),
  };
};

const applyTermsBindingToDocument = (document, binding) => {
  if (!document || typeof document !== "object") {
    return {
      document,
      patch: null,
    };
  }

  const patch = buildTermsVersionPatch(document, binding);
  if (!patch) {
    return {
      document,
      patch: null,
    };
  }

  return {
    document: {
      ...document,
      ...patch,
    },
    patch,
  };
};

const computeNextTermsVersion = ({
  incomingValue,
  existingValue,
  existingVersion,
}) => {
  const currentVersion = normalizeSemanticVersion(existingVersion);

  const incomingNormalized = normalizeTermsForCompare(incomingValue);
  const existingNormalized = normalizeTermsForCompare(existingValue);

  if (incomingNormalized !== existingNormalized) {
    return incrementSemanticPatch(currentVersion);
  }

  return currentVersion;
};

const upsertTermsVersionDocument = async (
  db,
  { termsKind, version, terms = [] },
) => {
  if (!db || !termsKind) return;

  const normalizedVersion = normalizeSemanticVersion(version);
  const normalizedTerms = normalizeTermsArray(terms);
  const termsVersionsCollection = db.collection(TERMS_VERSIONS_COLLECTION);

  await termsVersionsCollection.updateOne(
    {
      termsKind,
      version: normalizedVersion,
    },
    {
      $set: {
        terms: normalizedTerms,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        termsKind,
        version: normalizedVersion,
        createdAt: new Date(),
      },
    },
    {
      upsert: true,
    },
  );
};

const getTermsForVersion = async (db, { termsKind, version }) => {
  if (!db || !termsKind) return null;

  const normalizedVersion = normalizeSemanticVersion(version);
  const termsVersionsCollection = db.collection(TERMS_VERSIONS_COLLECTION);

  const doc = await termsVersionsCollection.findOne({
    termsKind,
    version: normalizedVersion,
  });

  if (!doc) return null;

  return {
    termsKind,
    version: normalizedVersion,
    terms: normalizeTermsArray(doc.terms),
  };
};

const ensureTermsVersionDocument = async (db, binding) => {
  if (!db || !binding) return;
  await upsertTermsVersionDocument(db, {
    termsKind: binding.termsKind,
    version: binding.version,
    terms: binding.terms,
  });
};

export {
  TERMS_SETTINGS_CONFIG,
  TERMS_VERSIONS_COLLECTION,
  DEFAULT_SEMVER_VERSION,
  normalizeTermsArray,
  normalizeTermsForCompare,
  toPositiveInteger,
  parseSemanticVersion,
  formatSemanticVersion,
  normalizeSemanticVersion,
  incrementSemanticPatch,
  getFirstDefinedValue,
  getTermsConfig,
  getSharedBusinessSettings,
  getTermsBindingFromSettingsDocument,
  getTermsBindingFromDatabase,
  buildTermsVersionPatch,
  applyTermsBindingToDocument,
  computeNextTermsVersion,
  upsertTermsVersionDocument,
  getTermsForVersion,
  ensureTermsVersionDocument,
};
