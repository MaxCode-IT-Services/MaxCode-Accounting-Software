import crypto from "crypto";
import { ObjectId } from "mongodb";
import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import {
  PAYMENT_CALLBACK_PREFIX,
  SOFTWARE_NAME,
  answerTelegramCallback,
  buildModifyUtrPromptMessage,
  buildStatusKeyboard,
  buildTelegramStatusMessage,
  buildTelegramSuccessMessage,
  buildUpdateSuccessMessage,
  buildUtrConfirmKeyboard,
  buildUtrConfirmMessage,
  editTelegramMessage,
  escapeMarkdownV2,
  formatStatusLabel,
  loadTelegramConfig,
  sendTelegramMessage,
} from "./utils/payment-verification-telegram.js";
import {
  handleCommandCallback,
  handleCommandMessage,
  handleConversationMessage,
} from "./utils/telegram-commands.js";

const PAYMENT_LINKS_COLLECTION = "payment_links";
const STATE_COLLECTION = "telegram_webhook_state";
const ROUTER_SOURCE = "maxcode-telegram-router";
const SOFTWARE_STATE = "mca";

const normalizeStatus = (value = "") => {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "success") return "success";
  if (raw === "failed") return "failed";
  if (raw === "under_verification" || raw === "under verification") {
    return "under_verification";
  }
  if (raw === "expired") return "expired";
  return "pending";
};

const getOrigin = (event) => {
  const headers = event.headers || {};
  const host = headers["x-forwarded-host"] || headers.host || "";
  if (!host) return "*";
  const proto = headers["x-forwarded-proto"] || "https";
  return `${proto}://${host}`;
};

const getHeader = (headers = {}, name = "") => {
  const wanted = String(name || "").toLowerCase();
  const match = Object.entries(headers || {}).find(
    ([key]) => String(key || "").toLowerCase() === wanted,
  );
  return match ? String(match[1] || "").trim() : "";
};

const timingSafeEqualStrings = (left = "", right = "") => {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

const verifyRouterSignature = (rawBody, header, secret) => {
  if (!secret) return false;
  if (!header || !header.startsWith("sha256=")) return false;
  const expected = `sha256=${crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex")}`;
  return timingSafeEqualStrings(expected, header);
};

const isAuthorizedDirectWebhook = (event) => {
  const expected = String(process.env.TELEGRAM_WEBHOOK_SECRET || "").trim();
  if (!expected) {
    // Fail closed. A webhook without a shared secret would let anyone forge
    // payment status updates, so unauthenticated deliveries are rejected and
    // the deployment must set TELEGRAM_WEBHOOK_SECRET (registerWebhook sends
    // it to Telegram as secret_token automatically).
    console.error(
      "[telegram-webhook] TELEGRAM_WEBHOOK_SECRET is not configured; rejecting direct webhook delivery",
    );
    return false;
  }

  const headerSecret = getHeader(
    event.headers,
    "x-telegram-bot-api-secret-token",
  );
  const querySecret = String(event.queryStringParameters?.secret || "").trim();
  const headerOk =
    headerSecret && timingSafeEqualStrings(headerSecret, expected);
  const queryOk = querySecret && timingSafeEqualStrings(querySecret, expected);
  return Boolean(headerOk || queryOk);
};

const unwrapIncomingUpdate = (event) => {
  const rawBody = String(event.body || "");
  let parsed = {};
  try {
    parsed = JSON.parse(rawBody || "{}");
  } catch {
    return { error: "Invalid JSON body" };
  }

  if (parsed?.source === ROUTER_SOURCE) {
    return {
      mode: "router",
      rawBody,
      envelope: parsed,
      update: parsed.update && typeof parsed.update === "object" ? parsed.update : {},
    };
  }

  return {
    mode: "direct",
    rawBody,
    envelope: null,
    update: parsed,
  };
};

const setPendingState = async (db, chatId, state) => {
  await db.collection(STATE_COLLECTION).updateOne(
    { _id: String(chatId) },
    { $set: { ...state, software: SOFTWARE_STATE, updatedAt: new Date() } },
    { upsert: true },
  );
};

const clearPendingState = async (db, chatId) => {
  await db.collection(STATE_COLLECTION).deleteOne({
    _id: String(chatId),
    software: SOFTWARE_STATE,
  });
};

const getPendingState = async (db, chatId) => {
  const state = await db.collection(STATE_COLLECTION).findOne({
    _id: String(chatId),
  });
  if (!state?.awaitingUtr) return null;
  if (state.software && state.software !== SOFTWARE_STATE) return null;
  return state;
};

const findRecordById = async (db, recordId) => {
  if (!ObjectId.isValid(recordId)) return null;
  return db
    .collection(PAYMENT_LINKS_COLLECTION)
    .findOne({ _id: new ObjectId(recordId), isDeleted: { $ne: true } });
};

const updateRecord = async (db, recordId, fields = {}) => {
  if (!ObjectId.isValid(recordId)) return null;
  const result = await db.collection(PAYMENT_LINKS_COLLECTION).findOneAndUpdate(
    { _id: new ObjectId(recordId), isDeleted: { $ne: true } },
    { $set: { ...fields, updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  return result?.value ?? result;
};

const parseOwnCallback = (data = "") => {
  const parts = String(data || "").split(":");
  if (parts[0] !== PAYMENT_CALLBACK_PREFIX || parts.length < 3) {
    return null;
  }
  return { recordId: parts[1], action: parts[2] };
};

const handleCallbackQuery = async (db, config, callbackQuery) => {
  const { botToken } = config;
  const data = String(callbackQuery?.data || "");
  const chatId = callbackQuery?.message?.chat?.id;
  const messageId = callbackQuery?.message?.message_id;
  const callbackId = callbackQuery?.id;
  const parsed = parseOwnCallback(data);

  if (!parsed) {
    return { handled: false, ignored: true };
  }

  // A callback that does not come from the owner chat (or that carries no
  // message context at all, which a forged update can omit) must never touch
  // a payment record, so verify before any mutation.
  if (
    !chatId ||
    String(chatId).trim() !== String(config.chatId || "").trim()
  ) {
    console.error(
      "[telegram-webhook] callback_query rejected: chat id missing or does not match the owner chat",
    );
    return { handled: true, ignored: true };
  }

  const { recordId, action } = parsed;
  const existing = await findRecordById(db, recordId);
  if (!existing) {
    await answerTelegramCallback(botToken, {
      callback_query_id: callbackId,
      text: "Payment not found in MaxCode Accounting",
    });
    return { handled: true, ignored: true };
  }

  if (action === "success" || action === "pending" || action === "failed") {
    const nextStatus = normalizeStatus(action);
    const fields = { status: nextStatus };
    const changes = [`Status → ${formatStatusLabel(nextStatus)}`];

    if (nextStatus === "failed") {
      fields.utrNumber = "";
      changes.push("UTR Number → removed");
    }

    const updated = await updateRecord(db, recordId, fields);
    await answerTelegramCallback(botToken, {
      callback_query_id: callbackId,
      text: `Status updated to ${formatStatusLabel(nextStatus)}`,
    });

    if (updated && chatId && messageId) {
      try {
        await editTelegramMessage(botToken, {
          chat_id: chatId,
          message_id: messageId,
          text: buildTelegramStatusMessage(updated),
          parse_mode: "MarkdownV2",
          reply_markup: buildStatusKeyboard(recordId),
        });
      } catch (editError) {
        console.error("Telegram message edit failed:", editError);
      }
    }

    if (updated && chatId) {
      if (nextStatus === "success") {
        await sendTelegramMessage(botToken, {
          chat_id: chatId,
          text: buildTelegramSuccessMessage(updated),
          parse_mode: "MarkdownV2",
        });
        await sendTelegramMessage(botToken, {
          chat_id: chatId,
          text: buildUtrConfirmMessage(updated),
          parse_mode: "MarkdownV2",
          reply_markup: buildUtrConfirmKeyboard(recordId),
        });
      } else {
        await sendTelegramMessage(botToken, {
          chat_id: chatId,
          text: buildUpdateSuccessMessage({
            title:
              nextStatus === "failed"
                ? "Payment Marked Failed"
                : "Payment Marked Pending",
            changes,
            record: updated,
          }),
          parse_mode: "MarkdownV2",
        });
      }
    }

    return { handled: true };
  }

  if (action === "utr_yes") {
    await answerTelegramCallback(botToken, {
      callback_query_id: callbackId,
      text: "UTR confirmed",
    });
    if (chatId) {
      await sendTelegramMessage(botToken, {
        chat_id: chatId,
        text: buildUpdateSuccessMessage({
          title: "UTR Confirmed",
          changes: [
            `UTR Number kept as ${existing.utrNumber || "-"}`,
            "Status remains Success",
          ],
          record: existing,
        }),
        parse_mode: "MarkdownV2",
      });
    }
    return { handled: true };
  }

  if (action === "utr_modify") {
    await answerTelegramCallback(botToken, {
      callback_query_id: callbackId,
      text: "Send the new UTR",
    });
    if (chatId) {
      await setPendingState(db, chatId, {
        awaitingUtr: true,
        recordId,
        messageId: messageId || null,
      });
      await sendTelegramMessage(botToken, {
        chat_id: chatId,
        text: buildModifyUtrPromptMessage(),
        parse_mode: "MarkdownV2",
      });
    }
    return { handled: true };
  }

  await answerTelegramCallback(botToken, { callback_query_id: callbackId });
  return { handled: true };
};

const handleTextMessage = async (db, config, message) => {
  const { botToken } = config;
  const chatId = message?.chat?.id;
  const text = String(message?.text || "").trim();
  if (!chatId || !text) return { handled: false };

  const state = await getPendingState(db, chatId);
  if (!state?.awaitingUtr || !state?.recordId) {
    return { handled: false };
  }

  const updated = await updateRecord(db, state.recordId, { utrNumber: text });
  await clearPendingState(db, chatId);

  if (!updated) {
    await sendTelegramMessage(botToken, {
      chat_id: chatId,
      text: [
        `*⚠️ ${escapeMarkdownV2("Unable to update UTR")} — ${escapeMarkdownV2(SOFTWARE_NAME)}*`,
        "",
        escapeMarkdownV2("Payment link not found in this software."),
      ].join("\n"),
      parse_mode: "MarkdownV2",
    });
    return { handled: true };
  }

  await sendTelegramMessage(botToken, {
    chat_id: chatId,
    text: buildUpdateSuccessMessage({
      title: "UTR Updated",
      changes: [`UTR Number → ${updated.utrNumber || "-"}`],
      record: updated,
    }),
    parse_mode: "MarkdownV2",
  });
  return { handled: true };
};

const processTelegramUpdate = async (db, config, update) => {
  if (update.callback_query) {
    // Feature buttons (mca:) and payment buttons (mca:...) stay separate.
    const commandHandled = await handleCommandCallback({
      db,
      config,
      callbackQuery: update.callback_query,
    });
    if (commandHandled) return { handled: true, via: "command" };

    return handleCallbackQuery(db, config, update.callback_query);
  }

  if (update.message) {
    // A slash command always wins over the running conversation.
    const commandHandled = await handleCommandMessage({
      db,
      config,
      message: update.message,
    });
    if (commandHandled) return { handled: true, via: "command" };

    const conversationHandled = await handleConversationMessage({
      db,
      config,
      message: update.message,
    });
    if (conversationHandled) return { handled: true, via: "conversation" };

    return handleTextMessage(db, config, update.message);
  }

  return { handled: false, ignored: true };
};

export const handler = async (event) => {
  const origin = getOrigin(event);

  if (event.httpMethod === "GET") {
    return createResponse(
      200,
      {
        ok: true,
        software: SOFTWARE_NAME,
        message: "MaxCode Accounting Telegram receiver is active",
        webhookPath: "/api/telegram-hook",
      },
      origin,
    );
  }

  if (event.httpMethod !== "POST") {
    return createResponse(405, { error: "Method not allowed" }, origin);
  }

  const incoming = unwrapIncomingUpdate(event);
  if (incoming.error) {
    return createResponse(400, { error: incoming.error }, origin);
  }

  try {
    const { db } = await connectToDatabase();
    const config = await loadTelegramConfig(db);

    if (!config) {
      return createResponse(
        200,
        { ok: true, skipped: true, reason: "telegram-disabled" },
        origin,
      );
    }

    if (incoming.mode === "router") {
      // Fail closed: without a shared secret the signature cannot be checked
      // and anyone could post updates as the router. Configure sharedSecret
      // in Telegram settings (the router signs payloads with the same value).
      if (!config.sharedSecret) {
        console.error(
          "[telegram-webhook] sharedSecret is not configured; rejecting router webhook delivery",
        );
        return createResponse(
          401,
          { error: "Router shared secret is not configured" },
          origin,
        );
      }

      const signature = getHeader(event.headers, "x-maxcode-signature");
      if (
        !verifyRouterSignature(
          incoming.rawBody,
          signature,
          config.sharedSecret,
        )
      ) {
        return createResponse(401, { error: "Invalid signature" }, origin);
      }

      if (incoming.envelope?.source !== ROUTER_SOURCE) {
        return createResponse(400, { error: "Unknown source" }, origin);
      }

      if (
        config.routerConnectionId &&
        String(incoming.envelope.connectionId || "") !== config.routerConnectionId
      ) {
        return createResponse(200, { ok: true, ignored: true }, origin);
      }

      if (
        config.routerBotId &&
        String(incoming.envelope.botId || "") !== config.routerBotId
      ) {
        return createResponse(200, { ok: true, ignored: true }, origin);
      }
    } else if (!isAuthorizedDirectWebhook(event)) {
      return createResponse(401, { error: "Unauthorized" }, origin);
    }

    const incomingChatId = String(
      incoming.update.callback_query?.message?.chat?.id ??
        incoming.update.message?.chat?.id ??
        "",
    ).trim();

    // Every update this handler processes (callback_query / message) carries
    // a chat in real Telegram traffic. An update without one can never be
    // tied to the owner chat, so it is dropped instead of trusted.
    if (incoming.update.callback_query || incoming.update.message) {
      if (!incomingChatId) {
        return createResponse(
          200,
          { ok: true, skipped: true, reason: "missing-chat" },
          origin,
        );
      }

      if (incomingChatId !== String(config.chatId).trim()) {
        return createResponse(200, { ok: true, ignored: true }, origin);
      }
    }

    const result = await processTelegramUpdate(db, config, incoming.update);
    return createResponse(200, { ok: true, ...result }, origin);
  } catch (error) {
    console.error("Telegram webhook error:", error);
    return createResponse(
      200,
      { ok: false, error: error?.message || "Webhook processing failed" },
      origin,
    );
  }
};
