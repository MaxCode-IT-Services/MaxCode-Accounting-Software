import { ObjectId } from "mongodb";
import { decryptSecretFromStorage } from "./secret-crypto.js";

const TELEGRAM_API_BASE = "https://api.telegram.org";
export const SOFTWARE_NAME = "MaxCode Accounting";
export const PAYMENT_CALLBACK_PREFIX = "mca";

const escapeMarkdownV2 = (value = "") =>
  String(value ?? "").replace(/([_\-*\[\]()~`>#+=|{}.!\\])/g, "\\$1");

const formatAmount = (value) => {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "Rs 0.00";
  return `Rs ${amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatDate = (value) => {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
};

const readSharedSettings = async (db) => {
  const collection = db.collection("business_settings");
  return (
    (await collection.findOne({ scope: "global" })) ||
    (await collection.findOne({}, { sort: { updatedAt: -1, createdAt: -1 } }))
  );
};

const readEnvValue = (name) => String(process.env[name] || "").trim();

// Env is in-memory (faster). Decrypt DB only when that env var is empty.
const resolveCredential = (envName, storedValue) =>
  readEnvValue(envName) || decryptSecretFromStorage(storedValue);

export const loadTelegramCredentials = async (db) => {
  const settings = await readSharedSettings(db);
  const telegram = settings?.telegramSettings || {};

  const botToken = decryptSecretFromStorage(telegram.botToken);
  const chatId = decryptSecretFromStorage(telegram.chatId);
  const sharedSecret = resolveCredential(
    "MAXCODE_SHARED_SECRET",
    telegram.sharedSecret,
  );
  const routerBotId = resolveCredential("MAXCODE_BOT_ID", telegram.routerBotId);
  const routerConnectionId = resolveCredential(
    "MAXCODE_CONNECTION_ID",
    telegram.routerConnectionId,
  );

  if (!botToken || !chatId) return null;

  return {
    botToken,
    chatId,
    sharedSecret,
    routerBotId,
    routerConnectionId,
    enabled: telegram.enabled === true,
  };
};

const getTelegramConfig = async (db) => {
  const credentials = await loadTelegramCredentials(db);
  if (!credentials || credentials.enabled !== true) return null;
  return credentials;
};

const telegramRequest = async (botToken, method, body) => {
  const response = await fetch(
    `${TELEGRAM_API_BASE}/bot${encodeURIComponent(botToken)}/${method}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok !== true) {
    throw new Error(data?.description || `Telegram API failed with ${response.status}`);
  }
  return data;
};

/**
 * Outbound Telegram calls must never take the whole feature down. A malformed
 * message, a revoked token or a "query is too old" callback used to throw and
 * leave the user with no reply at all, so every helper logs and swallows.
 */
const safeTelegramCall = async (label, botToken, method, body) => {
  try {
    // The raw Telegram payload is returned unchanged so existing callers that
    // read `result?.result?.message_id` keep working.
    return await telegramRequest(botToken, method, body);
  } catch (error) {
    console.error(`[telegram] ${label} failed:`, error?.message || error);
    return { ok: false, description: error?.message || "telegram-failed" };
  }
};

export const sendTelegramMessage = async (botToken, body) =>
  safeTelegramCall("sendMessage", botToken, "sendMessage", body);

export const editTelegramMessage = async (botToken, body) =>
  safeTelegramCall("editMessageText", botToken, "editMessageText", body);

export const answerTelegramCallback = async (botToken, body) =>
  safeTelegramCall("answerCallbackQuery", botToken, "answerCallbackQuery", body);

/**
 * Telegram rejects an editMessageText call whose text and markup are
 * identical to the current ones ("message is not modified"). The wizard
 * relies on in-place editing, so treat that case as a success.
 */
export const isTelegramUnchangedError = (error) =>
  /message is not modified/i.test(String(error || ""));

const isLocalUrl = (value = "") =>
  /localhost|127\.0\.0\.1|0\.0\.0\.0/i.test(String(value || ""));

/**
 * Automatically registers the Telegram webhook for this deployment.
 * Safe to call repeatedly; Telegram simply overwrites the existing webhook.
 * Router mode skips setWebhook so the central router keeps the bot webhook.
 */
export const ensureTelegramWebhook = async ({ db, baseUrl }) => {
  const credentials = await loadTelegramCredentials(db);
  if (!credentials || credentials.enabled !== true) {
    return { success: false, skipped: true, reason: "telegram-disabled" };
  }

  if (credentials.sharedSecret) {
    return { success: false, skipped: true, reason: "router-mode" };
  }

  if (!baseUrl || isLocalUrl(baseUrl)) {
    return { success: false, skipped: true, reason: "local-url" };
  }

  const url = `${String(baseUrl).replace(/\/+$/, "")}/api/telegram-hook`;
  const secretToken = String(process.env.TELEGRAM_WEBHOOK_SECRET || "").trim();
  const payload = { url, allowed_updates: ["message", "callback_query"] };
  if (secretToken) payload.secret_token = secretToken;

  await telegramRequest(credentials.botToken, "setWebhook", payload);
  return { success: true, url };
};

export const formatStatusLabel = (value = "") => {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "success") return "Success";
  if (raw === "failed") return "Failed";
  if (raw === "under_verification" || raw === "under verification") {
    return "Under Verification";
  }
  if (raw === "expired") return "Expired";
  return "Pending";
};

const headingLine = (emoji, title) =>
  `*${emoji} ${escapeMarkdownV2(title)} — ${escapeMarkdownV2(SOFTWARE_NAME)}*`;

const paymentDetailLines = (record = {}, statusOverride = "") => [
  `*Client Name:* ${escapeMarkdownV2(record.clientName || "-")}`,
  `*Business Name:* ${escapeMarkdownV2(record.businessName || "-")}`,
  `*Amount:* ${escapeMarkdownV2(formatAmount(record.amount))}`,
  `*Payment Date:* ${escapeMarkdownV2(formatDate(record.paymentDate || record.updatedAt))}`,
  `*Status:* ${escapeMarkdownV2(statusOverride || formatStatusLabel(record.status))}`,
  `*UTR Number:* ${escapeMarkdownV2(record.utrNumber || "-")}`,
  `*Payment Link:* ${escapeMarkdownV2(record.alias || record.shareUrl || "-")}`,
];

export const buildStatusKeyboard = (recordId) => ({
  inline_keyboard: [
    [
      {
        text: "Success",
        callback_data: `${PAYMENT_CALLBACK_PREFIX}:${recordId}:success`,
      },
      {
        text: "Failed",
        callback_data: `${PAYMENT_CALLBACK_PREFIX}:${recordId}:failed`,
      },
      {
        text: "Pending",
        callback_data: `${PAYMENT_CALLBACK_PREFIX}:${recordId}:pending`,
      },
    ],
  ],
});

export const buildUtrConfirmKeyboard = (recordId) => ({
  inline_keyboard: [
    [
      {
        text: "Yes",
        callback_data: `${PAYMENT_CALLBACK_PREFIX}:${recordId}:utr_yes`,
      },
      {
        text: "Modify",
        callback_data: `${PAYMENT_CALLBACK_PREFIX}:${recordId}:utr_modify`,
      },
    ],
  ],
});

export const buildTelegramPaymentMessage = (record = {}) =>
  [
    headingLine("🔔", "Payment Paid Request"),
    "",
    ...paymentDetailLines(record, "Under Verification"),
  ].join("\n");

export const buildTelegramSuccessMessage = (record = {}) =>
  [
    headingLine("✅", "Payment Success"),
    "",
    ...paymentDetailLines(record, "Success"),
  ].join("\n");

export const buildTelegramStatusMessage = (record = {}) =>
  [
    headingLine("🔔", "Payment Paid Request"),
    "",
    ...paymentDetailLines(record),
  ].join("\n");

export const buildUtrConfirmMessage = (record = {}) =>
  [
    headingLine("🧾", "UTR Verification"),
    "",
    `*UTR Number:* ${escapeMarkdownV2(record.utrNumber || "-")}`,
    "",
    escapeMarkdownV2("Is this UTR number correct, or do you want to modify it?"),
  ].join("\n");

export const buildUpdateSuccessMessage = ({
  title = "Update Successful",
  changes = [],
  record = {},
} = {}) => {
  const changeLines = (Array.isArray(changes) ? changes : [])
    .filter(Boolean)
    .map((line) => `• ${escapeMarkdownV2(line)}`);

  return [
    headingLine("✅", title),
    "",
    `*Software:* ${escapeMarkdownV2(SOFTWARE_NAME)}`,
    `*Client Name:* ${escapeMarkdownV2(record.clientName || "-")}`,
    `*Payment Link:* ${escapeMarkdownV2(record.alias || record.shareUrl || "-")}`,
    "",
    `*What was updated:*`,
    ...(changeLines.length > 0
      ? changeLines
      : [`• ${escapeMarkdownV2("No fields changed")}`]),
  ].join("\n");
};

export const buildModifyUtrPromptMessage = () =>
  [
    headingLine("✏️", "Modify UTR"),
    "",
    escapeMarkdownV2("Please send the correct UTR number in your next message."),
  ].join("\n");

export const sendPaymentVerificationTelegram = async ({ db, record }) => {
  const config = await getTelegramConfig(db);
  if (!config) return { success: false, skipped: true, reason: "feature-disabled" };

  const recordId = String(record?._id || record?.recordId || "");
  if (!ObjectId.isValid(recordId)) {
    return { success: false, skipped: true, reason: "missing-record-id" };
  }

  const result = await sendTelegramMessage(config.botToken, {
    chat_id: config.chatId,
    text: buildTelegramPaymentMessage(record),
    parse_mode: "MarkdownV2",
    reply_markup: buildStatusKeyboard(recordId),
  });

  return { success: true, messageId: result?.result?.message_id || null };
};

export const loadTelegramConfig = getTelegramConfig;
export { escapeMarkdownV2, telegramRequest, formatAmount, formatDate };
