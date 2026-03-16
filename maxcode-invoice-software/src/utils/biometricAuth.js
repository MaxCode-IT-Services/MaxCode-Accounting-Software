const BIOMETRIC_STORAGE_KEY = "maxcode_biometric_credentials";
const PASSKEY_TRANSPORTS = ["internal", "hybrid", "ble", "nfc", "usb"];

const randomChallenge = (length = 32) => {
  const buffer = new Uint8Array(length);
  window.crypto.getRandomValues(buffer);
  return buffer;
};

const toBase64Url = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

const fromBase64Url = (value) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const buffer = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i += 1) {
    buffer[i] = binary.charCodeAt(i);
  }

  return buffer;
};

const readStoredCredentials = () => {
  try {
    return JSON.parse(localStorage.getItem(BIOMETRIC_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
};

const writeStoredCredentials = (data) => {
  localStorage.setItem(BIOMETRIC_STORAGE_KEY, JSON.stringify(data));
};

const normalizeCredentialIds = (
  config = {},
  explicitIds = [],
  explicitId = "",
) => {
  const merged = [
    ...(Array.isArray(explicitIds) ? explicitIds : []),
    ...(Array.isArray(config?.credentialIds) ? config.credentialIds : []),
  ];

  if (typeof explicitId === "string" && explicitId.trim()) {
    merged.unshift(explicitId.trim());
  }

  if (typeof config?.credentialId === "string" && config.credentialId.trim()) {
    merged.unshift(config.credentialId.trim());
  }

  return [
    ...new Set(merged.filter((id) => typeof id === "string" && id.trim())),
  ];
};

export const isBiometricSupported = () => {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.credentials
  );
};

export const getStoredBiometricConfig = (phone = "") => {
  if (!phone) return null;
  const credentials = readStoredCredentials();
  return credentials[phone] || null;
};

export const removeStoredBiometricConfig = (phone = "") => {
  if (!phone) return;

  const credentials = readStoredCredentials();
  delete credentials[phone];
  writeStoredCredentials(credentials);
};

export const registerBiometricForDevice = async ({
  phone,
  userId,
  displayName,
}) => {
  if (!isBiometricSupported()) {
    throw new Error(
      "Fingerprint authentication is not supported on this device",
    );
  }

  if (!phone) {
    throw new Error("User phone is required for fingerprint setup");
  }

  const userHandle = new TextEncoder().encode(
    String(userId || phone).slice(0, 64),
  );

  const publicKey = {
    challenge: randomChallenge(32),
    rp: {
      name: "MaxCode Accounting",
      id: window.location.hostname,
    },
    user: {
      id: userHandle,
      name: String(phone),
      displayName: String(displayName || phone),
    },
    pubKeyCredParams: [
      { type: "public-key", alg: -7 },
      { type: "public-key", alg: -257 },
    ],
    timeout: 60000,
    authenticatorSelection: {
      userVerification: "required",
      residentKey: "preferred",
    },
    hints: ["client-device", "hybrid"],
    attestation: "none",
  };

  const credential = await navigator.credentials.create({ publicKey });
  if (!credential) {
    throw new Error("Fingerprint registration was cancelled");
  }

  const credentialId = toBase64Url(credential.rawId);
  const credentials = readStoredCredentials();
  const existing = credentials[phone] || {};
  const credentialIds = normalizeCredentialIds(
    existing,
    [credentialId],
    credentialId,
  );

  credentials[phone] = {
    credentialId: credentialIds[0],
    credentialIds,
    enabled: true,
    updatedAt: new Date().toISOString(),
  };

  writeStoredCredentials(credentials);

  return credentials[phone];
};

export const verifyDeviceBiometric = async ({
  phone,
  credentialId,
  credentialIds,
}) => {
  if (!isBiometricSupported()) {
    throw new Error(
      "Fingerprint authentication is not supported on this device",
    );
  }

  const storedConfig = getStoredBiometricConfig(phone);
  const resolvedCredentialIds = normalizeCredentialIds(
    storedConfig,
    credentialIds,
    credentialId,
  );

  if (resolvedCredentialIds.length === 0) {
    throw new Error("No fingerprint setup found for this device");
  }

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: randomChallenge(32),
      rpId: window.location.hostname,
      allowCredentials: resolvedCredentialIds.map((id) => ({
        id: fromBase64Url(id),
        type: "public-key",
        transports: PASSKEY_TRANSPORTS,
      })),
      timeout: 60000,
      userVerification: "required",
      hints: ["client-device", "hybrid"],
    },
  });

  if (!assertion) {
    throw new Error("Fingerprint verification failed");
  }

  return true;
};
