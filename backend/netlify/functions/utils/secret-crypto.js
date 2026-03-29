import crypto from "crypto";

const ENCRYPTED_PREFIX = "enc:v1:";
let cachedEncryptionKey = null;

const getEncryptionKey = () => {
  if (cachedEncryptionKey) return cachedEncryptionKey;

  const raw = String(process.env.CREDENTIALS_ENCRYPTION_KEY || "").trim();
  if (!raw) {
    throw new Error(
      "CREDENTIALS_ENCRYPTION_KEY is missing. Set a strong 128-char hex key.",
    );
  }

  if (!/^[a-fA-F0-9]{128}$/.test(raw)) {
    throw new Error(
      "CREDENTIALS_ENCRYPTION_KEY must be exactly 128 hex characters.",
    );
  }

  const keyMaterial = Buffer.from(raw, "hex");
  const keyBuffer = crypto.createHash("sha256").update(keyMaterial).digest();

  cachedEncryptionKey = keyBuffer;
  return cachedEncryptionKey;
};

export const isEncryptedSecret = (value = "") =>
  String(value || "")
    .trim()
    .startsWith(ENCRYPTED_PREFIX);

export const encryptSecretForStorage = (value = "") => {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  if (isEncryptedSecret(normalized)) return normalized;

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(normalized, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return `${ENCRYPTED_PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
};

export const decryptSecretFromStorage = (value = "") => {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  if (!isEncryptedSecret(normalized)) return normalized;

  const payload = normalized.slice(ENCRYPTED_PREFIX.length);
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted secret format");
  }

  const [ivBase64, tagBase64, encryptedBase64] = parts;
  const key = getEncryptionKey();
  const iv = Buffer.from(ivBase64, "base64");
  const tag = Buffer.from(tagBase64, "base64");
  const encrypted = Buffer.from(encryptedBase64, "base64");

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString("utf8").trim();
};
