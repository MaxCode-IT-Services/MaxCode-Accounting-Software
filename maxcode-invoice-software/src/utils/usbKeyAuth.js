const USB_KEY_FILENAME = "MaxCode-Accounting.sec";
const USB_KEY_VERSION = 1;
const PBKDF2_ITERATIONS = 120000;
const APP_SECRET_CONTEXT = "maxcode-usb-key-v1";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const toBase64Url = (input) => {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = "";

  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

const fromBase64Url = (value = "") => {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
};

const randomBytes = (length = 32) => {
  const bytes = new Uint8Array(length);
  window.crypto.getRandomValues(bytes);
  return bytes;
};

const deriveKeyMaterial = async (phone = "", salt = new Uint8Array()) => {
  const password = textEncoder.encode(
    `${APP_SECRET_CONTEXT}:${String(phone || "").trim()}`,
  );

  const baseKey = await window.crypto.subtle.importKey(
    "raw",
    password,
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  return window.crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations: PBKDF2_ITERATIONS,
    },
    baseKey,
    {
      name: "AES-GCM",
      length: 256,
    },
    false,
    ["encrypt", "decrypt"],
  );
};

const sha256Hex = async (value = "") => {
  const digest = await window.crypto.subtle.digest(
    "SHA-256",
    textEncoder.encode(String(value)),
  );

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const downloadTextFile = (fileName, content) => {
  const blob = new Blob([content], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

export const createUsbKeyFileForUser = async ({ phone, userId, userName }) => {
  if (!phone) {
    throw new Error("Phone number is required for USB key setup");
  }

  const token = toBase64Url(randomBytes(32));
  const salt = randomBytes(16);
  const iv = randomBytes(12);

  const key = await deriveKeyMaterial(phone, salt);

  const encryptedPayload = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    textEncoder.encode(
      JSON.stringify({
        token,
        issuedAt: new Date().toISOString(),
        userId: String(userId || ""),
        userName: String(userName || ""),
        phone: String(phone),
      }),
    ),
  );

  const fileBody = {
    type: "MAXCODE_USB_KEY",
    version: USB_KEY_VERSION,
    kdf: "PBKDF2-SHA256",
    iterations: PBKDF2_ITERATIONS,
    encryption: "AES-256-GCM",
    salt: toBase64Url(salt),
    iv: toBase64Url(iv),
    data: toBase64Url(encryptedPayload),
  };

  const content = JSON.stringify(fileBody, null, 2);
  downloadTextFile(USB_KEY_FILENAME, content);

  return {
    token,
    tokenHash: await sha256Hex(token),
    fileName: USB_KEY_FILENAME,
  };
};

export const extractTokenFromUsbKeyFile = async ({ fileText, phone }) => {
  if (!phone) {
    throw new Error("Phone number is required to read USB key");
  }

  let parsed;
  try {
    parsed = JSON.parse(String(fileText || ""));
  } catch {
    throw new Error("Invalid USB key file format");
  }

  if (
    parsed?.type !== "MAXCODE_USB_KEY" ||
    !parsed?.salt ||
    !parsed?.iv ||
    !parsed?.data
  ) {
    throw new Error("Invalid MAXCODE USB key file");
  }

  const salt = fromBase64Url(parsed.salt);
  const iv = fromBase64Url(parsed.iv);
  const encrypted = fromBase64Url(parsed.data);

  const key = await deriveKeyMaterial(phone, salt);

  let decrypted;
  try {
    decrypted = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv,
      },
      key,
      encrypted,
    );
  } catch {
    throw new Error("USB key does not match this phone/account");
  }

  let payload;
  try {
    payload = JSON.parse(textDecoder.decode(decrypted));
  } catch {
    throw new Error("USB key payload is corrupted");
  }

  if (!payload?.token || typeof payload.token !== "string") {
    throw new Error("USB key token missing in file");
  }

  return payload.token;
};
