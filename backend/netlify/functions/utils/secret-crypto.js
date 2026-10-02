import crypto from "crypto";

const ENCRYPTED_PREFIX = "enc:v1:";

// One cached entry per distinct env snapshot, so rotating the key inside a
// long-lived process (or a test) never reuses a stale derived key.
let cachedKeySet = null;
let cachedKeySetSignature = "";

const parseKeyList = (rawValue) =>
  String(rawValue || "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

const assertValidKeyRaw = (raw) => {
  if (!/^[a-fA-F0-9]{128}$/.test(raw)) {
    throw new Error(
      "CREDENTIALS_ENCRYPTION_KEY entries must be exactly 128 hex characters.",
    );
  }
};

const deriveKey = (raw) =>
  crypto.createHash("sha256").update(Buffer.from(raw, "hex")).digest();

/**
 * Key set in decryption order: the primary key first, then every previous key
 * from CREDENTIALS_ENCRYPTION_KEY_OLD (comma separated). Keeping the previous
 * keys around lets values encrypted before a rotation keep decrypting, and
 * rotateEncryptedSecret() moves them onto the primary key over time.
 */
const getEncryptionKeys = () => {
  const primaryRaw = String(process.env.CREDENTIALS_ENCRYPTION_KEY || "").trim();
  const previousRawList = parseKeyList(process.env.CREDENTIALS_ENCRYPTION_KEY_OLD);

  const signature = JSON.stringify([primaryRaw, previousRawList]);
  if (!cachedKeySet || cachedKeySetSignature !== signature) {
    if (!primaryRaw) {
      throw new Error(
        "CREDENTIALS_ENCRYPTION_KEY is missing. Set a strong 128-char hex key.",
      );
    }
    assertValidKeyRaw(primaryRaw);
    previousRawList.forEach(assertValidKeyRaw);

    cachedKeySet = {
      primary: deriveKey(primaryRaw),
      previous: previousRawList.map(deriveKey),
    };
    cachedKeySetSignature = signature;
  }

  return cachedKeySet;
};

const encryptWithKey = (key, plaintext) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${ENCRYPTED_PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
};

export const isEncryptedSecret = (value = "") =>
  String(value || "")
    .trim()
    .startsWith(ENCRYPTED_PREFIX);

export const encryptSecretForStorage = (value = "") => {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  if (isEncryptedSecret(normalized)) return normalized;

  return encryptWithKey(getEncryptionKeys().primary, normalized);
};

/**
 * AES-GCM auth failure means "wrong key", so every candidate key is tried in
 * order and the first one that authenticates wins.
 */
const decryptWithKeySet = (iv, tag, encrypted, keySet) => {
  let lastError = null;
  for (const key of [keySet.primary, ...keySet.previous]) {
    try {
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(encrypted), decipher.final()]);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Unable to decrypt secret");
};

const parseEncryptedPayload = (value = "") => {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  if (!isEncryptedSecret(normalized)) return null;

  const parts = normalized.slice(ENCRYPTED_PREFIX.length).split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted secret format");
  }

  return {
    iv: Buffer.from(parts[0], "base64"),
    tag: Buffer.from(parts[1], "base64"),
    encrypted: Buffer.from(parts[2], "base64"),
  };
};

const decryptToBuffer = (value = "") => {
  const payload = parseEncryptedPayload(value);
  if (!payload) return null;
  return decryptWithKeySet(payload.iv, payload.tag, payload.encrypted, getEncryptionKeys());
};

export const decryptSecretFromStorage = (value = "") => {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  if (!isEncryptedSecret(normalized)) return normalized;

  const decrypted = decryptToBuffer(normalized);
  return decrypted.toString("utf8").trim();
};

/**
 * Decrypts and reports whether the value still depends on a previous key.
 * `rotatedValue` is the same secret re-encrypted under the primary key, or
 * null when no rewrite is needed. Callers that persist it convert old-key
 * ciphertext to the current key lazily, so the previous key can eventually
 * be dropped without losing data.
 */
export const decryptSecretWithRotation = (value = "") => {
  const normalized = String(value || "").trim();
  if (!normalized) return { value: "", rotatedValue: null };
  if (!isEncryptedSecret(normalized)) {
    return { value: normalized, rotatedValue: null };
  }

  const keySet = getEncryptionKeys();
  const payload = parseEncryptedPayload(normalized);

  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", keySet.primary, payload.iv);
    decipher.setAuthTag(payload.tag);
    const decrypted = Buffer.concat([
      decipher.update(payload.encrypted),
      decipher.final(),
    ]);
    return { value: decrypted.toString("utf8").trim(), rotatedValue: null };
  } catch {
    // Fall through to the previous keys below.
  }

  let lastError = null;
  for (const key of keySet.previous) {
    try {
      const decipher = crypto.createDecipheriv("aes-256-gcm", key, payload.iv);
      decipher.setAuthTag(payload.tag);
      const decrypted = Buffer.concat([
        decipher.update(payload.encrypted),
        decipher.final(),
      ]);
      return {
        value: decrypted.toString("utf8").trim(),
        rotatedValue: encryptWithKey(keySet.primary, decrypted.toString("utf8").trim()),
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Unable to decrypt secret with any configured key");
};

/**
 * Returns `value` re-encrypted under the current primary key when it was
 * encrypted with a previous key; otherwise returns it untouched (plaintext,
 * empty, or already on the primary key). Never throws for undecryptable
 * values — the next decrypt call will surface that.
 */
export const rotateEncryptedSecret = (value = "") => {
  const normalized = String(value || "").trim();
  if (!normalized || !isEncryptedSecret(normalized)) return normalized;

  try {
    const { rotatedValue } = decryptSecretWithRotation(normalized);
    return rotatedValue || normalized;
  } catch {
    return normalized;
  }
};
