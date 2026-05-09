import { decryptSecretFromStorage } from "./secret-crypto.js";

const normalizeStatus = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase();

const formatDateForNotification = (value) => {
  if (!value) return "-";

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";

  return parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
};

const formatAmountForNotification = (value) => {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "-";

  return `₹${amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatStatusForNotification = (value = "") => {
  const normalized = normalizeStatus(value);
  if (normalized === "under_verification") return "Under Verification";
  return normalized
    .replace(/_/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
};

const resolveGlobalBusinessSettings = async (db) => {
  const collection = db.collection("business_settings");

  return (
    (await collection.findOne({ scope: "global" })) ||
    (await collection.findOne(
      {},
      {
        sort: {
          updatedAt: -1,
          createdAt: -1,
          _id: -1,
        },
      },
    )) ||
    null
  );
};

export const getWhatsAppConfig = async (db) => {
  const settings = await resolveGlobalBusinessSettings(db);
  const wa = settings?.whatsappSettings || {};

  return {
    accessToken: decryptSecretFromStorage(String(wa.accessToken || "").trim()),
    phoneNumberId: decryptSecretFromStorage(
      String(wa.phoneNumberId || "").trim(),
    ),
    companyName: String(settings?.companyName || "MaxCode IT Services").trim(),
  };
};

export const sendPaymentVerificationTemplateMessage = async ({
  accessToken,
  phoneNumberId,
  to,
  bodyVariables = [],
  alias,
}) => {
  if (!accessToken || !phoneNumberId || !to) {
    throw new Error("WhatsApp Cloud API is not configured");
  }

  const endpoint = `https://graph.facebook.com/v23.0/${encodeURIComponent(phoneNumberId)}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: "payment_verification_request",
      language: {
        code: "en",
      },
      components: [
        {
          type: "body",
          parameters: bodyVariables.map((item) => ({
            type: "text",
            text: String(item || ""),
          })),
        },
        {
          type: "button",
          sub_type: "url",
          index: "1",
          parameters: [
            {
              type: "text",
              text: String(alias || "").trim(),
            },
          ],
        },
      ],
    },
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  let parsed = {};
  try {
    parsed = responseText ? JSON.parse(responseText) : {};
  } catch {
    parsed = { raw: responseText };
  }

  if (!response.ok) {
    throw new Error(parsed?.error?.message || "WhatsApp message send failed");
  }

  return parsed;
};

export const sendPaymentVerificationNotification = async ({ db, record }) => {
  const waConfig = await getWhatsAppConfig(db);
  if (!waConfig.accessToken || !waConfig.phoneNumberId) {
    return { success: false, skipped: true };
  }

  const bodyVariables = [
    "Vipin Khandelwal",
    record?.clientName || "-",
    record?.businessName || "-",
    record?.phoneNumber || "-",
    formatAmountForNotification(record?.amount),
    formatDateForNotification(record?.paymentDate),
    formatStatusForNotification(record?.status),
    record?.utrNumber || "-",
  ];

  const response = await sendPaymentVerificationTemplateMessage({
    accessToken: waConfig.accessToken,
    phoneNumberId: waConfig.phoneNumberId,
    to: "916377241446",
    bodyVariables,
    alias: record?.alias || "",
  });

  return {
    success: true,
    response,
  };
};
