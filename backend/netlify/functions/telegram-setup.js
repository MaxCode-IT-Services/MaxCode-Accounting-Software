import { connectToDatabase, createResponse } from "./utils/mongodb.js";
import { verifyRequestToken } from "./utils/auth.js";
import {
  loadTelegramCredentials,
  sendTelegramMessage,
  telegramRequest,
} from "./utils/payment-verification-telegram.js";
import {
  registerCommandsWithRouter,
  buildMenuCommands,
} from "./utils/telegram-commands.js";

const getBaseUrl = (event) => {
  const headers = event.headers || {};
  const host = headers["x-forwarded-host"] || headers.host || "localhost:8888";
  const isLocalHost = host.includes("localhost") || host.includes("127.0.0.1");
  const proto = headers["x-forwarded-proto"] || (isLocalHost ? "http" : "https");
  return `${proto}://${host}`;
};

const getWebhookUrl = (event) => `${getBaseUrl(event)}/api/telegram-hook`;

export const handler = async (event) => {
  const origin = getBaseUrl(event);

  if (event.httpMethod !== "POST") {
    return createResponse(405, { error: "Method not allowed" }, origin, event);
  }

  try {
    verifyRequestToken(event);
  } catch (error) {
    return createResponse(401, { error: error?.message || "Unauthorized" }, origin, event);
  }

  let body = {};
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return createResponse(400, { error: "Invalid JSON body" }, origin, event);
  }

  const action = String(body.action || "set-webhook").trim();

  try {
    const { db } = await connectToDatabase();
    const config = await loadTelegramCredentials(db);

    if (!config) {
      return createResponse(400,
        { error: "Bot token or chat id is missing. Save Telegram settings first." },
        origin, event);
    }

    const webhookUrl = getWebhookUrl(event);

    if (action === "set-webhook") {
      if (config.sharedSecret) {
        return createResponse(200,
          {
            success: true,
            skipped: true,
            reason: "router-mode",
            webhookUrl,
            message:
              "Router mode is enabled. Paste this Target URL into MaxCode Telegram Webhook instead of setting Telegram's webhook here.",
          },
          origin, event);
      }

      const secretToken = String(
        process.env.TELEGRAM_WEBHOOK_SECRET || "",
      ).trim();
      const payload = {
        url: webhookUrl,
        allowed_updates: ["message", "callback_query"],
      };
      if (secretToken) payload.secret_token = secretToken;

      const result = await telegramRequest(config.botToken, "setWebhook", payload);
      return createResponse(200,
        { success: true, webhookUrl, result: result?.result ?? true },
        origin, event);
    }

    if (action === "delete-webhook") {
      const result = await telegramRequest(config.botToken, "deleteWebhook", {});
      return createResponse(200, { success: true, result: result?.result ?? true }, origin, event);
    }

    if (action === "webhook-info") {
      const result = await telegramRequest(config.botToken, "getWebhookInfo", {});
      return createResponse(200,
        { success: true, webhookUrl, info: result?.result || {} },
        origin, event);
    }

    if (action === "sync-commands") {
      // Register our commands with the shared Telegram Webhook software
      // instead of Telegram: it publishes ONE combined menu for the bot, so
      // syncing here can never erase another software's commands.
      const result = await registerCommandsWithRouter(
        config,
        buildMenuCommands(),
      );
      return createResponse(200,
        {
          success: true,
          // `commands` keeps the existing toast's count working.
          commands: result.registered ?? result.menuCount ?? 0,
          ...result,
        },
        origin, event);
    }

    if (action === "send-test") {
      const result = await sendTelegramMessage(config.botToken, {
        chat_id: config.chatId,
        // Same shape as every other message: bold "emoji Title — Software"
        // heading, then a plain line — matching the NotifyFlow style.
        text: "*✅ MaxCode Accounting Telegram connected*\n\nPayment notifications will arrive in this chat",
        parse_mode: "MarkdownV2",
      });
      return createResponse(200,
        { success: true, messageId: result?.result?.message_id || null },
        origin, event);
    }

    return createResponse(400, { error: "Unknown action" }, origin, event);
  } catch (error) {
    console.error("Telegram setup error:", error);
    return createResponse(500,
      { error: error?.message || "Telegram setup failed" },
      origin, event);
  }
};
