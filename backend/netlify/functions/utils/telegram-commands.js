import crypto from "crypto";
import { ObjectId } from "mongodb";
import {
  SOFTWARE_NAME,
  answerTelegramCallback,
  editTelegramMessage,
  escapeMarkdownV2,
  formatAmount,
  isTelegramUnchangedError,
  sendTelegramMessage,
  telegramRequest,
} from "./payment-verification-telegram.js";

const STATE_COLLECTION = "telegram_webhook_state";
const PAYMENT_LINKS_COLLECTION = "payment_links";
const CLIENTS_COLLECTION = "clients";

const CONVERSATION_PREFIX = "mcac";
const CONVERSATION_SOFTWARE = "mca-cmd";
const CONVERSATION_TTL_MINUTES = 30;

// Share links are served from the payment domain, not the billing dashboard.
const DEFAULT_DOMAIN = "https://pay.maxcode.in";

// How many saved customers fit on one picker screen. The rest stay reachable
// through the page buttons and the search box, so no customer is ever hidden.
const CLIENT_PICKER_LIMIT = 8;
// How many customers are loaded into the running task. This only bounds the
// size of the saved conversation; paging and search cover everything below it.
const CLIENT_SEARCH_LIMIT = 200;

/**
 * Every heading in this feature is rendered the same way: bold, and with the
 * software name inside the bold. Previously some screens put the name outside
 * the asterisks and some left it on its own line.
 */
const headingText = (title) =>
  `*${escapeMarkdownV2(`${title} — ${SOFTWARE_NAME}`)}*`;

const heading = (emoji, title) => headingText(`${emoji} ${title}`);

/**
 * One entry per Telegram slash command. Every name is namespaced under
 * "accounting" so other products sharing the router never collide.
 */
const FEATURES = {
  accounting_create_link: {
    title: "Create Payment Link",
    description: "Create a customer payment link step by step",
    aliases: [
      "create_payment_link",
      "create_paymentlink",
      "createlink",
      "newlink",
      "new_link",
      "payment_link",
      "paymentlink",
    ],
  },
  accounting_links: {
    title: "List Payment Links",
    description: "Show the 5 most recent payment links",
    aliases: ["links", "list_links", "listlinks"],
  },
  accounting_status: {
    title: "Payment Link Status",
    description: "Totals and counts by status",
    aliases: ["status"],
  },
  accounting_help: {
    title: "Help / Command List",
    description: "Show every available Telegram command",
    aliases: ["help", "start", "menu"],
  },
  accounting_cancel: {
    title: "Cancel Current Task",
    description: "Stop the running step-by-step task",
    aliases: ["cancel", "stop", "abort"],
  },
};

// Entry point: /accounting lists the software features.
const SOFTWARE_COMMAND = "accounting";
const SOFTWARE_MENU_DESCRIPTION = "MaxCode Accounting features menu";

const CANONICAL_COMMANDS = Object.entries(FEATURES).map(([command, feature]) => ({
  command,
  description: feature.description,
}));

// Alias -> canonical command map, built once so parsing stays a single lookup.
const COMMAND_LOOKUP = (() => {
  const lookup = new Map();
  for (const [command, feature] of Object.entries(FEATURES)) {
    lookup.set(command, command);
    for (const alias of feature.aliases || []) {
      lookup.set(alias, command);
    }
  }
  return lookup;
})();

// Ordered wizard steps. "manual_upi" shares the upi_account slot, "pick_client"
// offers the saved customers, and "confirm" is the review screen.
const STEPS = [
  "pick_client",
  "client_name",
  "business_name",
  "amount",
  "upi_account",
  "phone",
  "address",
  "expiry",
  "note",
  "alias",
];

const STEP_VIEW = {
  pick_client: {
    emoji: "👥",
    hint: "Pick a saved customer below, or tap Enter Manually to type the details.",
  },
  client_name: { emoji: "📝", hint: "Send the customer name." },
  business_name: {
    emoji: "🏢",
    hint: "Send the business name, or press Skip to leave it empty.",
  },
  amount: { emoji: "💰", hint: "Send the amount, for example: 12500 or Rs 12,500" },
  upi_account: {
    emoji: "🏦",
    hint: "Pick a UPI account below, send a new one, or tap Enter Manually.",
  },
  manual_upi: {
    emoji: "🏦",
    hint: "Send the UPI details as: Bank Name | upi@id",
  },
  phone: { emoji: "📱", hint: "Send the customer mobile number, or press Skip." },
  address: { emoji: "📍", hint: "Send the customer address, or press Skip." },
  expiry: { emoji: "📅", hint: "Send the expiry date as YYYY-MM-DD, or press Skip." },
  note: { emoji: "🗒️", hint: "Send a note for this payment, or press Skip." },
  alias: { emoji: "🔗", hint: "Send a link name using letters and numbers only." },
  confirm: { emoji: "✅", hint: "Review the details, then press Create Link." },
};

// Steps where the Skip button is meaningful.
const SKIPPABLE_STEPS = new Set([
  "business_name",
  "phone",
  "address",
  "expiry",
  "note",
  "alias",
]);

const toNumber = (value) => {
  const cleaned = String(value || "")
    .replace(/,/g, "")
    .replace(/[^0-9.]/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseAmount = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const parsed = toNumber(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
};

const parseManualUpi = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const [bankPart, upiPart] = raw.split("|");
  const accountName = String(bankPart || "").trim();
  const upiId = String(upiPart || "").trim().toLowerCase();
  if (!accountName || !upiId || !upiId.includes("@")) return null;
  return { accountName, upiId };
};

const isDateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));

/** Telegram link names allow letters, digits, dash and underscore only. */
const cleanAlias = (value = "") =>
  String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 80);

const slugify = (value = "") =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

/** Today in IST, as YYYY-MM-DD. Used when the user skips the expiry step. */
const todayIstDateOnly = () => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!year || !month || !day) return "";
  return `${year}-${month}-${day}`;
};

/** Link expiry always means end of that day, in IST. */
const toEndOfDayIst = (dateOnly) => {
  if (!isDateOnly(dateOnly)) return null;
  const endOfDay = new Date(`${dateOnly}T23:59:59.999+05:30`);
  return Number.isNaN(endOfDay.getTime()) ? null : endOfDay;
};

const stateId = (chatId) => `mca:cmd:${chatId}`;

const readSettings = async (db) => {
  const collection = db.collection("business_settings");
  return (
    (await collection.findOne({ scope: "global" })) ||
    (await collection.findOne({}, { sort: { updatedAt: -1, createdAt: -1 } }))
  );
};

const readConversation = async (db, chatId) => {
  const state = await db.collection(STATE_COLLECTION).findOne({ _id: stateId(chatId) });
  if (!state) return null;
  if (state.software && state.software !== CONVERSATION_SOFTWARE) return null;
  return state;
};

const writeConversation = async (db, chatId, state) => {
  await db
    .collection(STATE_COLLECTION)
    .updateOne(
      { _id: stateId(chatId) },
      {
        $set: {
          ...state,
          software: CONVERSATION_SOFTWARE,
          updatedAt: new Date(),
          expiresAt: new Date(Date.now() + CONVERSATION_TTL_MINUTES * 60 * 1000),
        },
      },
      { upsert: true },
    );
};

const clearConversation = async (db, chatId) => {
  await db.collection(STATE_COLLECTION).deleteOne({ _id: stateId(chatId) });
};

/** Rejects and drops conversations that sat unanswered for too long. */
const loadLiveConversation = async (db, chatId) => {
  const state = await readConversation(db, chatId);
  if (!state) return null;
  if (state.expiresAt && new Date(state.expiresAt).getTime() < Date.now()) {
    await clearConversation(db, chatId);
    return null;
  }
  return state;
};

const saveStep = async ({ db, chatId, step, draft }) => {
  await writeConversation(db, chatId, { step, draft });
};

const sendText = async (botToken, chatId, text, extra = {}) => {
  await sendTelegramMessage(botToken, {
    chat_id: chatId,
    text,
    parse_mode: "MarkdownV2",
    ...extra,
  });
};

const editText = async (botToken, chatId, messageId, text, extra = {}) => {
  await editTelegramMessage(botToken, {
    chat_id: chatId,
    message_id: messageId,
    text,
    parse_mode: "MarkdownV2",
    ...extra,
  });
};

/**
 * Users type commands in many ways: "/createlink", "/create_link",
 * "/accounting/create-payment-link". This turns any of those into
 * lowercase underscore words so one lookup covers every spelling.
 */
const normalizeCommandName = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

/** Two-row Levenshtein, used only to forgive small typing mistakes. */
const editDistance = (a, b) => {
  if (a === b) return 0;
  if (!a || !b) return Math.max(a.length, b.length);

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let row = 1; row <= a.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= b.length; column += 1) {
      const cost = a[row - 1] === b[column - 1] ? 0 : 1;
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + cost,
      );
    }
    previous = current;
  }
  return previous[b.length];
};

// Every accepted spelling, canonical names first so an exact hit always wins.
const ALL_COMMAND_NAMES = (() => {
  const names = [SOFTWARE_COMMAND];
  for (const [command, feature] of Object.entries(FEATURES)) {
    names.push(command);
    names.push(...(feature.aliases || []));
  }
  return names;
})();

// Short words get less slack so a wrong short command is never "guessed".
const FUZZY_MIN_LENGTH = 4;
const FUZZY_DISTANCE_FOR = (length) => (length <= 5 ? 1 : 2);

const fuzzyMatchCommand = (value) => {
  if (value.length < FUZZY_MIN_LENGTH) return "";
  const limit = FUZZY_DISTANCE_FOR(value.length);
  let best = "";
  let bestDistance = limit + 1;
  for (const name of ALL_COMMAND_NAMES) {
    const distance = editDistance(value, name);
    if (distance < bestDistance) {
      best = name;
      bestDistance = distance;
    }
  }
  return bestDistance <= limit ? best : "";
};

/** Maps any spelling of a command onto its canonical name, or "". */
const resolveCommand = (rawName) => {
  const name = normalizeCommandName(rawName);
  if (!name) return "";
  if (name === SOFTWARE_COMMAND) return SOFTWARE_COMMAND;
  if (COMMAND_LOOKUP.has(name)) return COMMAND_LOOKUP.get(name);

  const fuzzy = fuzzyMatchCommand(name);
  if (!fuzzy) return "";
  return fuzzy === SOFTWARE_COMMAND ? SOFTWARE_COMMAND : COMMAND_LOOKUP.get(fuzzy) || "";
};

/**
 * Returns the canonical command for a message. Unknown slash commands and
 * plain chat text return "" so normal conversation is never hijacked.
 *
 * Accepted shapes:
 *   /createlink
 *   /create_link  extra words are ignored
 *   /accounting/create-payment-link
 *   /accounting@MyBot
 */
export const extractCommand = ({ text } = {}) => {
  const raw = String(text || "").trim();
  if (!raw.startsWith("/")) return "";

  const isPath = raw.slice(1).includes("/");
  const parts = raw
    .slice(1)
    .split(/[\s/]+/)
    .map((token) => token.split("@")[0])
    .filter(Boolean);
  if (!parts.length) return "";

  // In a path a feature always wins over the plain software menu, so
  // /accounting/createlink runs the wizard and not the menu.
  if (isPath || parts.length > 1) {
    let softwareFallback = "";
    for (const part of parts) {
      const command = resolveCommand(part);
      if (!command) continue;
      if (command === SOFTWARE_COMMAND) {
        softwareFallback = SOFTWARE_COMMAND;
        continue;
      }
      return command;
    }
    return softwareFallback;
  }

  return resolveCommand(parts[0]);
};

const stepTitle = (step) => {
  const view = STEP_VIEW[step] || STEP_VIEW.client_name;
  // "manual_upi" occupies the upi_account slot, so it reports that step number.
  const index = STEPS.indexOf(step === "manual_upi" ? "upi_account" : step);
  const position = index === -1 ? STEPS.length : index + 1;
  return `Create Payment Link — Step ${position} of ${STEPS.length}`;
};

/**
 * Narrows the picker to one screenful of customers, honouring any search term
 * and the current page offset. Keeping this pure makes the button layout easy
 * to reason about: the keyboard is the only place customers are listed.
 */
const pageClientOptions = (draft = {}) => {
  const all = Array.isArray(draft.clientOptions) ? draft.clientOptions : [];
  const searched = Boolean(String(draft.clientSearch || "").trim());
  const matches = filterClientOptions(all, draft.clientSearch);
  const start = Math.min(
    Math.max(0, Number(draft.clientPage) || 0),
    Math.max(0, matches.length - 1),
  );

  return {
    items: matches.slice(start, start + CLIENT_PICKER_LIMIT),
    total: matches.length,
    start,
    searched,
  };
};

const buildStepView = (step, draft = {}) => {
  const view = STEP_VIEW[step] || STEP_VIEW.client_name;
  const lines = [
    headingText(`${view.emoji} ${stepTitle(step)}`),
    "",
    escapeMarkdownV2(view.hint),
  ];

  // Picking a saved customer prefills the business name, so show it back and
  // let the user accept it with one tap instead of typing it again.
  if (step === "business_name" && draft.businessName) {
    lines.push(
      "",
      `*${escapeMarkdownV2("Business Name:")}* ${escapeMarkdownV2(draft.businessName)}`,
      "",
      escapeMarkdownV2(
        "Send a different business name to change it, tap the button below to keep it, or press Skip to leave it empty.",
      ),
    );
  }

  if (step === "pick_client" && (draft.clientOptions || []).length > 0) {
    // Customers appear only as buttons, never as a typed list in the message.
    const page = pageClientOptions(draft);
    lines.push(
      "",
      escapeMarkdownV2(
        page.total > 1
          ? `Showing ${page.start + 1}-${page.start + page.items.length} of ${page.total} saved customers. Type part of a name or number to search.`
          : "Tap a customer below, or type part of a name or number to search.",
      ),
    );
    if (page.searched) {
      lines.push("", escapeMarkdownV2("Clear the search to see everyone again."));
    }
  }

  if (step === "confirm") {
    lines.push(
      "",
      `*${escapeMarkdownV2("Client:")}* ${escapeMarkdownV2(draft.clientName || "-")}`,
      `*${escapeMarkdownV2("Business:")}* ${escapeMarkdownV2(draft.businessName || "-")}`,
      `*${escapeMarkdownV2("Amount:")}* ${escapeMarkdownV2(formatAmount(draft.amount))}`,
      `*${escapeMarkdownV2("UPI:")}* ${escapeMarkdownV2(draft.upiId || "-")}`,
      `*${escapeMarkdownV2("Phone:")}* ${escapeMarkdownV2(draft.phoneNumber || "-")}`,
      `*${escapeMarkdownV2("Address:")}* ${escapeMarkdownV2(draft.address || "-")}`,
      `*${escapeMarkdownV2("Expiry:")}* ${escapeMarkdownV2(draft.linkExpiry || "-")}`,
      `*${escapeMarkdownV2("Note:")}* ${escapeMarkdownV2(draft.note || "-")}`,
      `*${escapeMarkdownV2("Link name:")}* ${escapeMarkdownV2(draft.alias || "-")}`,
    );
  }

  const inlineKeyboard = [];

  if (step === "business_name" && draft.businessName) {
    inlineKeyboard.push([
      {
        text: `✅ ${draft.businessName}`.slice(0, 60),
        callback_data: `${CONVERSATION_PREFIX}:keep_business`,
      },
    ]);
  }

  if (step === "pick_client") {
    const page = pageClientOptions(draft);
    for (const client of page.items) {
      inlineKeyboard.push([
        {
          text: [client.clientName, client.businessName]
            .filter(Boolean)
            .join(" — ")
            .slice(0, 60) || "Customer",
          callback_data: `${CONVERSATION_PREFIX}:client:${client.key}`,
        },
      ]);
    }

    // Paging keeps every customer reachable without one huge message.
    const navRow = [];
    if (page.start > 0) {
      navRow.push({
        text: "◀️ Back",
        callback_data: `${CONVERSATION_PREFIX}:clients_page:${Math.max(0, page.start - CLIENT_PICKER_LIMIT)}`,
      });
    }
    if (page.start + page.items.length < page.total) {
      navRow.push({
        text: "Next ▶️",
        callback_data: `${CONVERSATION_PREFIX}:clients_page:${page.start + CLIENT_PICKER_LIMIT}`,
      });
    }
    if (navRow.length) inlineKeyboard.push(navRow);

    if (page.searched) {
      inlineKeyboard.push([
        {
          text: "✖️ Clear search",
          callback_data: `${CONVERSATION_PREFIX}:clients_clear`,
        },
      ]);
    }

    inlineKeyboard.push([
      {
        text: "👤 Enter Manually",
        callback_data: `${CONVERSATION_PREFIX}:manual_client`,
      },
    ]);
  }

  if (step === "upi_account") {
    // The first saved account is applied automatically; buttons switch to the rest.
    (draft.upiOptions || []).forEach((option, index) => {
      if (index === 0) return;
      inlineKeyboard.push([
        {
          text: option.accountName || option.upiId,
          callback_data: `${CONVERSATION_PREFIX}:upi:${index}`,
        },
      ]);
    });
    inlineKeyboard.push([
      {
        text: "Enter Manually",
        callback_data: `${CONVERSATION_PREFIX}:manual_upi`,
      },
    ]);
  }

  if (SKIPPABLE_STEPS.has(step) || step === "confirm") {
    inlineKeyboard.push([
      {
        text: "Skip",
        callback_data: `${CONVERSATION_PREFIX}:skip`,
      },
    ]);
  }

  // A customer picked from the saved list should still be able to change the
  // business name, so offer it as a button instead of forcing a restart.
  if (step === "client_name" && draft.clientRefId) {
    inlineKeyboard.push([
      {
        text: "Change Business Name",
        callback_data: `${CONVERSATION_PREFIX}:edit_business`,
      },
    ]);
  }

  if (step === "confirm") {
    inlineKeyboard.push([
      {
        text: "Revise",
        callback_data: `${CONVERSATION_PREFIX}:revise`,
      },
      {
        text: "Create Link",
        callback_data: `${CONVERSATION_PREFIX}:create`,
      },
    ]);
  }

  return { text: lines.join("\n"), inlineKeyboard };
};

/** Sends the step prompt, editing in place when it answers a button press. */
const pushStep = async ({ botToken, chatId, messageId, step, draft }) => {
  const view = buildStepView(step, draft);

  if (messageId) {
    try {
      await editText(botToken, chatId, messageId, view.text, {
        reply_markup: { inline_keyboard: view.inlineKeyboard },
      });
      return;
    } catch {
      // The old message can no longer be edited; send a fresh prompt instead.
    }
  }

  await sendText(botToken, chatId, view.text, {
    reply_markup: { inline_keyboard: view.inlineKeyboard },
  });
};

/**
 * The finished-link screen. A URL button cannot be copied from the Telegram
 * desktop app, so the raw link is also shown as selectable monospace text and a
 * dedicated Copy Link button is offered.
 */
const buildCreatedMessage = (record) => ({
  text: [
    headingText("✅ Payment Link Created"),
    "",
    `*${escapeMarkdownV2("Client:")}* ${escapeMarkdownV2(record.clientName || "-")}`,
    `*${escapeMarkdownV2("Business:")}* ${escapeMarkdownV2(record.businessName || "-")}`,
    `*${escapeMarkdownV2("Amount:")}* ${escapeMarkdownV2(formatAmount(record.amount))}`,
    "",
    escapeMarkdownV2("Share this link with your customer:"),
    `\`${escapeMarkdownV2(record.shareUrl || "-")}\``,
  ].join("\n"),
  inlineKeyboard: [
    [
      { text: "Open Payment Link", url: record.shareUrl },
      {
        text: "Copy Link",
        callback_data: `${CONVERSATION_PREFIX}:copy:${record._id}`,
      },
    ],
    [{ text: "Create Another Link", callback_data: `${CONVERSATION_PREFIX}:create` }],
  ],
});

const buildLinksMessage = (links) =>
  [
    heading("📋", "Recent Payment Links"),
    "",
    ...(links.length > 0
      ? links.flatMap((link, index) => [
          `*${index + 1}\\.* ${escapeMarkdownV2(link.clientName || "-")}`,
          `${escapeMarkdownV2(formatAmount(link.amount))} • ${escapeMarkdownV2(
            link.status || "pending",
          )}`,
          `\`${escapeMarkdownV2(link.shareUrl || "-")}\``,
          "",
        ])
      : [escapeMarkdownV2("No payment links yet."), ""]),
    escapeMarkdownV2("Showing the 5 most recent."),
  ].join("\n");

const buildStatsMessage = ({ total, groups }) =>
  [
    heading("📊", "Payment Link Status"),
    "",
    `*Total Links:* ${total}`,
    "",
    ...(groups.length > 0
      ? groups.map((group) => {
          const raw = String(group._id || "pending").replace(/_/g, " ");
          const label = raw.charAt(0).toUpperCase() + raw.slice(1);
          return `• ${escapeMarkdownV2(label)}: ${group.count}`;
        })
      : [escapeMarkdownV2("No payment links yet.")]),
  ].join("\n");

const buildHelpMessage = () =>
  [
    heading("📖", "Commands"),
    "",
    ...CANONICAL_COMMANDS.flatMap((entry) => [
      `/${escapeMarkdownV2(entry.command)}`,
      `   ${escapeMarkdownV2(entry.description)}`,
    ]),
    "",
    `/${escapeMarkdownV2(SOFTWARE_COMMAND)}`,
    `   ${escapeMarkdownV2(SOFTWARE_MENU_DESCRIPTION)}`,
    "",
    escapeMarkdownV2(
      "Short forms also work: /createlink, /links, /status, /cancel.",
    ),
    escapeMarkdownV2(
      "Write it however you like — /accounting/create-link also works.",
    ),
  ].join("\n");

const buildSoftwareMenuMessage = () => ({
  text: [
    heading("🧭", "Software Menu"),
    "",
    escapeMarkdownV2("Pick the work you want to do:"),
  ].join("\n"),
  inlineKeyboard: CANONICAL_COMMANDS.filter(
    (entry) => entry.command !== "accounting_cancel",
  ).map((entry) => [
    {
      text: entry.description,
      callback_data: `${CONVERSATION_PREFIX}:menu:${entry.command}`,
    },
  ]),
});

const showHelp = async ({ botToken, chatId }) => {
  await sendText(botToken, chatId, buildHelpMessage());
};

const showStats = async ({ db, botToken, chatId }) => {
  // One grouping pass answers both the total and the per-status counts.
  const groups = await db
    .collection(PAYMENT_LINKS_COLLECTION)
    .aggregate([
      { $match: { isDeleted: { $ne: true } } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ])
    .toArray();

  const total = groups.reduce((sum, group) => sum + (Number(group?.count) || 0), 0);

  await sendText(botToken, chatId, buildStatsMessage({ total, groups }));
};

const showLinks = async ({ db, botToken, chatId }) => {
  const links = await db
    .collection(PAYMENT_LINKS_COLLECTION)
    .find({ isDeleted: { $ne: true } })
    .sort({ createdAt: -1 })
    .limit(5)
    .toArray();

  await sendText(botToken, chatId, buildLinksMessage(links));
};

const showSoftwareMenu = async ({ botToken, chatId }) => {
  const menu = buildSoftwareMenuMessage();
  await sendText(botToken, chatId, menu.text, {
    reply_markup: { inline_keyboard: menu.inlineKeyboard },
  });
};

const cancelConversation = async ({ db, botToken, chatId }) => {
  const existing = await readConversation(db, chatId);
  await clearConversation(db, chatId);

  await sendText(botToken, chatId, [
    headingText("🚫 Cancelled"),
    "",
    escapeMarkdownV2(
      existing ? "The running task was stopped." : "Nothing was running.",
    ),
  ].join("\n"));

  return true;
};

/**
 * Saved customers from the accounting software, most recently created first.
 * The picker only needs enough to prefill the wizard, so no secrets or
 * documents are pulled in here.
 */
const readClientOptions = async (db) => {
  const docs = await db
    .collection(CLIENTS_COLLECTION)
    .find({ isDeleted: { $ne: true } })
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(CLIENT_SEARCH_LIMIT)
    .toArray();
  return docs.map((doc, index) => ({
    // A short positional key keeps the callback payload small, which Telegram
    // caps at 64 bytes.
    key: String(index),
    clientRefId: String(doc.clientId || ""),
    clientName: String(doc.clientName || "").trim(),
    businessName: String(doc.businessName || "").trim(),
    phoneNumber: String(doc.phoneNumber || "").trim(),
    address: String(doc.address || "").trim(),
  }));
};

/**
 * Narrows the picker to customers matching what the user typed. An empty term
 * keeps every loaded customer so the plain list still works.
 */
const filterClientOptions = (options, term) => {
  const needle = String(term || "").trim().toLowerCase();
  if (!needle) return options;

  return options.filter((client) =>
    [client.clientName, client.businessName, client.phoneNumber, client.clientRefId]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle)),
  );
};

/** Turns the saved-customer step into the manual name step when it is empty. */
const resolveClientStep = async ({ db, draft }) => {
  const clientOptions = await readClientOptions(db);
  const next = { ...draft, clientOptions };

  if (clientOptions.length === 0) return { step: "client_name", draft: next };
  return { step: "pick_client", draft: next };
};

/** Inserts the link exactly like the web form does, so both paths stay equal. */
const insertPaymentLink = async (db, draft) => {
  const collection = db.collection(PAYMENT_LINKS_COLLECTION);

  const alias = cleanAlias(draft.alias);
  if (!alias) return { error: "link-name" };

  const domain = DEFAULT_DOMAIN;
  const shareUrl = `${domain}/${alias}`;

  const existing = await collection.findOne({ shareUrl });
  if (existing) return { error: "duplicate" };

  const now = new Date();
  const document = {
    clientRefId: String(draft.clientRefId || ""),
    clientName: String(draft.clientName || "").trim(),
    businessName: String(draft.businessName || "").trim(),
    phoneNumber: String(draft.phoneNumber || "").trim(),
    address: String(draft.address || "").trim(),
    accountName: String(draft.accountName || "").trim(),
    upiId: String(draft.upiId || "").trim().toLowerCase(),
    amount: Number(draft.amount || 0),
    domain,
    alias,
    shareUrl,
    status: "pending",
    paymentDate: now,
    utrNumber: "",
    failedReason: "",
    linkExpiry: toEndOfDayIst(draft.linkExpiry),
    linkStatus: "active",
    note: String(draft.note || "").trim(),
    temporaryClient: false,
    createdBy: "Telegram",
    createdAt: now,
    updatedAt: now,
  };

  const result = await collection.insertOne(document);
  return { record: { ...document, _id: result?.insertedId } };
};

/** Every run offers the saved customers first, then collects the name. */
const startWizard = async ({ db, botToken, chatId }) => {
  const draft = { clientName: "", amount: 0, upiOptions: [], clientOptions: [] };
  const next = await resolveClientStep({ db, draft });

  await saveStep({ db, chatId, step: next.step, draft: next.draft });
  await pushStep({ botToken, chatId, messageId: null, step: next.step, draft: next.draft });
};

/**
 * Active company UPI accounts. Malformed rows are dropped so a bad settings
 * document can never break the wizard.
 */
const readActiveUpiOptions = async (db) => {
  const settings = await readSettings(db);
  const entries = Array.isArray(settings?.upiIds) ? settings.upiIds : [];

  return entries
    .filter((entry) => entry && typeof entry === "object")
    .filter(
      (entry) => String(entry.status ?? "active").toLowerCase() !== "inactive",
    )
    .map((entry) => ({
      upiId: String(entry.upiId || "").trim().toLowerCase(),
      accountName: String(entry.accountName || "").trim(),
    }))
    .filter((entry) => entry.upiId.includes("@"));
};

/** Advances to the UPI step using the freshly saved company accounts. */
const resolveUpiStep = async ({ db, draft }) => {
  const upiOptions = await readActiveUpiOptions(db);
  const next = { ...draft, upiOptions };

  if (upiOptions.length === 0) return { step: "manual_upi", draft: next };

  next.upiId = upiOptions[0].upiId;
  next.accountName = upiOptions[0].accountName;

  return {
    step: upiOptions.length === 1 ? "phone" : "upi_account",
    draft: next,
  };
};

const moveTo = async ({ db, botToken, chatId, messageId, step, draft }) => {
  await saveStep({ db, chatId, step, draft });
  await pushStep({ botToken, chatId, messageId, step, draft });
};

const confirmCreation = async ({ db, botToken, chatId, messageId, draft, answer }) => {
  const notify = typeof answer === "function" ? answer : async () => {};

  if (!draft?.alias) {
    await notify("The link details are not complete yet.");
    return true;
  }

  const { record, error } = await insertPaymentLink(db, draft);

  if (error === "duplicate") {
    await notify("That link name is already in use.");
    await moveTo({
      db,
      botToken,
      chatId,
      messageId,
      step: "alias",
      draft: { ...draft, alias: "" },
    });
    return true;
  }

  if (error) {
    await notify("The link details are not complete yet.");
    return true;
  }

  await clearConversation(db, chatId);

  const created = buildCreatedMessage(record);
  const extra = { reply_markup: { inline_keyboard: created.inlineKeyboard } };

  if (messageId) {
    try {
      await editText(botToken, chatId, messageId, created.text, extra);
      return true;
    } catch {
      // Fall back to a new message when the prompt cannot be edited.
    }
  }

  await sendText(botToken, chatId, created.text, extra);
  return true;
};

const parseCallback = (data = "") => {
  const parts = String(data || "").split(":");
  if (parts[0] !== CONVERSATION_PREFIX || parts.length < 2) return null;
  return { action: parts[1], argument: parts[2] };
};

/**
 * Handles a typed reply for the running wizard.
 * Returns false when there is no live task, so other handlers can try.
 */
export const handleConversationMessage = async ({ db, config, message }) => {
  const { botToken } = config;
  const chatId = message?.chat?.id;
  const text = String(message?.text || "").trim();
  if (!chatId || !text) return false;

  const state = await loadLiveConversation(db, chatId);
  if (!state?.step) return false;

  const { step } = state;
  const draft = { ...(state.draft || {}) };

  if (step === "pick_client") {
    // Typing here is a search, not a new customer name. An explicit Enter
    // Manually press is what starts the manual path.
    const term = text.trim();
    const next = {
      ...draft,
      clientSearch: term,
      clientPage: 0,
    };
    await moveTo({ db, botToken, chatId, messageId: null, step: "pick_client", draft: next });

    if (filterClientOptions(draft.clientOptions || [], term).length === 0) {
      await sendText(botToken, chatId, [
        headingText("🔍 No customer found"),
        "",
        escapeMarkdownV2(
          `Nothing matched "${term}". Press Clear search to see everyone, or tap Enter Manually to type a new customer.`,
        ),
      ].join("\n"));
    }
    return true;
  }

  if (step === "client_name") {
    // A saved customer was just picked, so the name is already filled in. Only
    // ask again when it is genuinely empty.
    if (!draft.clientName) {
      draft.clientName = text;
      draft.clientRefId = "";
    }
    await moveTo({ db, botToken, chatId, messageId: null, step: "business_name", draft });
    return true;
  }

  if (step === "business_name") {
    draft.businessName = text;
    await moveTo({ db, botToken, chatId, messageId: null, step: "amount", draft });
    return true;
  }

  if (step === "amount") {
    const amount = parseAmount(text);
    if (amount === null) {
      await sendText(botToken, chatId, [
        headingText("⚠️ Invalid Amount"),
        "",
        escapeMarkdownV2("Send a number greater than zero, for example: 12500"),
      ].join("\n"));
      return true;
    }

    draft.amount = amount;
    const next = await resolveUpiStep({ db, draft });
    await moveTo({
      db,
      botToken,
      chatId,
      messageId: null,
      step: next.step,
      draft: next.draft,
    });
    return true;
  }

  if (step === "upi_account") {
    // Typing here means the user wants a brand new UPI account.
    const parsed = parseManualUpi(text);
    if (!parsed) {
      await sendText(botToken, chatId, [
        headingText("⚠️ Invalid UPI Details"),
        "",
        escapeMarkdownV2("Send them as: Bank Name | upi@id"),
      ].join("\n"));
      return true;
    }

    draft.accountName = parsed.accountName;
    draft.upiId = parsed.upiId;
    await moveTo({ db, botToken, chatId, messageId: null, step: "phone", draft });
    return true;
  }

  if (step === "manual_upi") {
    const parsed = parseManualUpi(text);
    if (!parsed) {
      await sendText(botToken, chatId, [
        headingText("⚠️ Invalid UPI Details"),
        "",
        escapeMarkdownV2("Send them as: Bank Name | upi@id"),
      ].join("\n"));
      return true;
    }

    draft.accountName = parsed.accountName;
    draft.upiId = parsed.upiId;
    await moveTo({ db, botToken, chatId, messageId: null, step: "phone", draft });
    return true;
  }

  if (step === "phone") {
    draft.phoneNumber = text;
    await moveTo({ db, botToken, chatId, messageId: null, step: "address", draft });
    return true;
  }

  if (step === "address") {
    draft.address = text;
    await moveTo({ db, botToken, chatId, messageId: null, step: "expiry", draft });
    return true;
  }

  if (step === "expiry") {
    const raw = text.replace(/[\/\-\.]/g, "-");
    if (!isDateOnly(raw)) {
      await sendText(botToken, chatId, [
        headingText("⚠️ Invalid Date"),
        "",
        escapeMarkdownV2("Send the expiry date as YYYY-MM-DD, for example: 2026-12-31"),
      ].join("\n"));
      return true;
    }

    draft.linkExpiry = raw;
    await moveTo({ db, botToken, chatId, messageId: null, step: "note", draft });
    return true;
  }

  if (step === "note") {
    draft.note = text;
    await moveTo({ db, botToken, chatId, messageId: null, step: "alias", draft });
    return true;
  }

  if (step === "alias") {
    draft.alias = cleanAlias(text);
    if (!draft.alias) {
      await sendText(botToken, chatId, [
        headingText("⚠️ Invalid Link Name"),
        "",
        escapeMarkdownV2("Use letters and numbers only."),
      ].join("\n"));
      return true;
    }

    await moveTo({ db, botToken, chatId, messageId: null, step: "confirm", draft });
    return true;
  }

  if (step === "confirm") {
    const answer = text.toLowerCase();
    if (["yes", "y", "haan", "ha", "ok", "create", "confirm"].includes(answer)) {
      return confirmCreation({ db, botToken, chatId, messageId: null, draft });
    }

    if (["no", "n", "nahi", "back", "revise", "change"].includes(answer)) {
      await moveTo({
        db,
        botToken,
        chatId,
        messageId: null,
        step: "client_name",
        draft: { ...draft, upiOptions: draft.upiOptions || [] },
      });
      return true;
    }
    await sendText(botToken, chatId, [
      heading("❓", "Confirm or Revise"),
      "",
      escapeMarkdownV2("Send yes to create the link, or no to change the details."),
    ].join("\n"));
    return true;
  }

  await clearConversation(db, chatId);
  return false;
};

/** Entry point for every slash command sent to the bot. */
export const handleCommandMessage = async ({ db, config, message }) => {
  const { botToken } = config;
  const chatId = message?.chat?.id;
  const text = String(message?.text || "").trim();
  if (!chatId || !text) return false;

  const command = extractCommand({ text });
  if (!command) return false;

  if (command === "accounting_cancel") {
    return cancelConversation({ db, botToken, chatId });
  }

  if (command === "accounting_links") {
    await showLinks({ db, botToken, chatId });
    return true;
  }

  if (command === "accounting_status") {
    await showStats({ db, botToken, chatId });
    return true;
  }

  if (command === "accounting_help") {
    await showHelp({ botToken, chatId });
    return true;
  }

  if (command === SOFTWARE_COMMAND) {
    await showSoftwareMenu({ botToken, chatId });
    return true;
  }

  await startWizard({ db, botToken, chatId });
  return true;
};

/** Entry point for every inline button this feature owns. */
export const handleCommandCallback = async ({ db, config, callbackQuery }) => {
  const { botToken } = config;
  const parsed = parseCallback(callbackQuery?.data);
  if (!parsed) return false;

  const chatId = callbackQuery?.message?.chat?.id;
  const messageId = callbackQuery?.message?.message_id;
  const callbackId = callbackQuery?.id;
  const context = { botToken, chatId, callbackId, messageId };

  // Answering must never throw. Telegram discards an unanswered
  // callback_query after a short window, and a failed answer was aborting the
  // step transition, so a button press appeared to do nothing at all.
  const answer = async (text) => {
    const result = await answerTelegramCallback(botToken, {
      callback_query_id: callbackId,
      ...(text ? { text } : {}),
    });
    if (result?.ok === false) {
      console.error("[telegram] answerCallbackQuery failed:", result?.description);
    }
    return result;
  };

  const sendAsReply = (replyText) =>
    sendText(botToken, chatId, [
      heading("💡", "Action Not Available"),
      "",
      escapeMarkdownV2(replyText),
    ].join("\n"));

  // Software menu buttons start the chosen feature straight away.
  if (parsed.action === "menu") {
    await answer("Starting");
    if (parsed.argument === "accounting_create_link") {
      await startWizard({ db, botToken, chatId });
      return true;
    }
    if (parsed.argument === "accounting_links") {
      await showLinks({ db, botToken, chatId });
      return true;
    }
    if (parsed.argument === "accounting_status") {
      await showStats({ db, botToken, chatId });
      return true;
    }
    await showHelp({ botToken, chatId });
    return true;
  }

  const state = await loadLiveConversation(db, chatId);
  const step = state?.step;
  const draft = { ...(state?.draft || {}) };

  if (parsed.action === "clients_page" || parsed.action === "clients_clear") {
    if (step !== "pick_client") {
      await answer("Please send your answer as a message instead.");
      return true;
    }

    const next = { ...draft };
    if (parsed.action === "clients_clear") {
      next.clientSearch = "";
      next.clientPage = 0;
    } else {
      next.clientPage = Math.max(0, Number(parsed.argument) || 0);
    }

    await answer("Showing customers");
    await moveTo({ db, botToken, chatId, messageId, step: "pick_client", draft: next });
    return true;
  }

  if (parsed.action === "manual_client") {
    if (step !== "pick_client") {
      await answer("Please send your answer as a message instead.");
      return true;
    }
    await answer("Enter the customer details manually");
    await moveTo({ db, botToken, chatId, messageId, step: "client_name", draft });
    return true;
  }

  if (parsed.action === "client") {
    if (step !== "pick_client") {
      await answer("Please send your answer as a message instead.");
      return true;
    }

    const index = String(parsed.argument ?? "");
    const options = Array.isArray(draft.clientOptions) ? draft.clientOptions : [];
    const client = options.find((option) => option.key === index) || null;

    if (!client) {
      await answer("Please send your answer as a message instead.");
      return true;
    }

    await answer(`${client.clientName || "Customer"} selected`);
    // Go straight to the business name step: the name, phone and address are
    // already filled from the saved record, so nothing else needs asking.
    await moveTo({
      db,
      botToken,
      chatId,
      messageId,
      step: "business_name",
      draft: {
        ...draft,
        clientName: client.clientName,
        businessName: client.businessName,
        phoneNumber: client.phoneNumber,
        address: client.address,
        // Kept so the link points back at the saved customer record.
        clientRefId: client.clientRefId,
      },
    });
    return true;
  }

  if (parsed.action === "keep_business") {
    if (step !== "business_name") {
      await answer("Nothing to change right now.");
      return true;
    }
    await answer("Business name kept");
    await moveTo({ db, botToken, chatId, messageId, step: "amount", draft });
    return true;
  }

  if (parsed.action === "edit_business") {
    if (step !== "client_name") {
      await answer("Nothing to change right now.");
      return true;
    }
    await answer("Change the business name");
    await moveTo({ db, botToken, chatId, messageId, step: "business_name", draft });
    return true;
  }

  if (parsed.action === "copy") {
    // A bot cannot write to the user's clipboard, so the link is sent again as
    // a fresh selectable message that is easy to copy by hand.
    const recordId = String(parsed.argument || "");
    if (!ObjectId.isValid(recordId)) {
      await answer("That link is no longer available.");
      return true;
    }

    const record = await db
      .collection(PAYMENT_LINKS_COLLECTION)
      .findOne({ _id: new ObjectId(recordId), isDeleted: { $ne: true } });

    if (!record?.shareUrl) {
      await answer("That link is no longer available.");
      return true;
    }

    await answer("Copy the link below");
    await sendText(botToken, chatId, [
      escapeMarkdownV2("Payment link — long-press and select Copy:"),
      `\`${escapeMarkdownV2(record.shareUrl)}\``,
    ].join("\n"));
    return true;
  }

  if (parsed.action === "manual_upi") {
    if (step !== "upi_account") {
      await answer("Please send your answer as a message instead.");
      return true;
    }
    await answer("Enter the UPI details");
    await moveTo({ db, botToken, chatId, messageId, step: "manual_upi", draft });
    return true;
  }

  if (parsed.action === "upi") {
    if (step !== "upi_account") {
      await answer("Please send your answer as a message instead.");
      return true;
    }

    const index = Number(parsed.argument);
    const options = draft.upiOptions || [];
    const option = Number.isInteger(index) && index > 0 ? options[index] : null;

    if (!option) {
      await answer("Please send your answer as a message instead.");
      return true;
    }

    await answer(`${option.accountName || option.upiId} selected`);
    draft.accountName = option.accountName;
    draft.upiId = option.upiId;
    await moveTo({ db, botToken, chatId, messageId, step: "phone", draft });
    return true;
  }

  if (parsed.action === "skip") {
    if (!SKIPPABLE_STEPS.has(step) && step !== "confirm") {
      await answer("Nothing to skip at this step.");
      return true;
    }

    await answer("Skipped");

    if (step === "confirm") {
      return confirmCreation({
        db,
        botToken,
        chatId,
        messageId,
        draft: { ...draft, alias: cleanAlias(draft.alias || slugify(draft.clientName)) },
      });
    }

    if (step === "business_name") {
      draft.businessName = "";
      await moveTo({ db, botToken, chatId, messageId, step: "amount", draft });
      return true;
    }

    if (step === "phone") {
      await moveTo({ db, botToken, chatId, messageId, step: "address", draft });
      return true;
    }

    if (step === "address") {
      await moveTo({ db, botToken, chatId, messageId, step: "expiry", draft });
      return true;
    }

    if (step === "expiry") {
      draft.linkExpiry = todayIstDateOnly();
      await moveTo({ db, botToken, chatId, messageId, step: "note", draft });
      return true;
    }

    if (step === "note") {
      draft.note = "";
      await moveTo({ db, botToken, chatId, messageId, step: "alias", draft });
      return true;
    }

    draft.alias = cleanAlias(slugify(draft.clientName));
    await moveTo({ db, botToken, chatId, messageId, step: "confirm", draft });
    return true;
  }

  if (parsed.action === "revise") {
    if (step !== "confirm") {
      await answer("Nothing to revise right now.");
      return true;
    }
    await answer("Revising");
    await moveTo({ db, botToken, chatId, messageId, step: "client_name", draft });
    return true;
  }

  if (parsed.action === "create") {
    if (step === "confirm") {
      await answer("Creating your payment link");
      return confirmCreation({
        db,
        botToken,
        chatId,
        messageId,
        draft: { ...draft, alias: cleanAlias(draft.alias || slugify(draft.clientName)) },
      });
    }

    // The finished-link button starts a fresh link for the next customer.
    if (!step) {
      await answer("Starting a new payment link");
      await startWizard({ db, botToken, chatId });
      return true;
    }

    await answer("The link details are not complete yet.");
    return true;
  }

  await answer("Done");
  await sendAsReply("Please send your answer as a message.");
  return true;
};

/**
 * This software's contribution to the bot's "/" menu.
 */
export const buildMenuCommands = () => [
  { command: SOFTWARE_COMMAND, description: SOFTWARE_MENU_DESCRIPTION },
  ...CANONICAL_COMMANDS,
];

// The shared Telegram Webhook software owns the bot's single command menu.
// Telegram's setMyCommands REPLACES the whole list, so calling it directly
// from here erased every other linked software's commands — and any sync in
// another software erased ours. Register our list with the router instead:
// it merges every connection's commands and publishes the union once.
const DEFAULT_ROUTER_URL = "https://botrouter.maxcodehub.com";

// Server-side request guard: https only, public host only.
const isPublicHttpsUrl = (value) => {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return false;
    const host = url.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host.endsWith(".internal")
    ) {
      return false;
    }
    const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (v4) {
      const [a, b] = v4.slice(1).map(Number);
      if ([a, b].some((n) => Number.isNaN(n) || n > 255)) return false;
      if (a === 0 || a === 10 || a === 127) return false;
      if (a === 169 && b === 254) return false;
      if (a === 172 && b >= 16 && b <= 31) return false;
      if (a === 192 && b === 168) return false;
      if (a === 100 && b >= 64 && b <= 127) return false;
      if (a >= 224) return false;
      return true;
    }
    if (host.includes(":")) return false;
    return host.includes(".");
  } catch {
    return false;
  }
};

/**
 * Register this software's commands with the shared Telegram Webhook
 * software over the same HMAC contract it uses when forwarding updates to us.
 * Throws a descriptive error; the caller decides how to surface it.
 */
export const registerCommandsWithRouter = async (config, commands) => {
  const routerBase = String(
    process.env.MAXCODE_ROUTER_URL || DEFAULT_ROUTER_URL,
  )
    .trim()
    .replace(/\/+$/, "");
  if (!isPublicHttpsUrl(routerBase)) {
    throw new Error(
      "The Telegram Webhook Software URL is not a public https address; commands were not registered.",
    );
  }
  const connectionId = String(config?.routerConnectionId || "").trim();
  const sharedSecret = String(config?.sharedSecret || "").trim();
  if (!connectionId) {
    throw new Error(
      "Router Connection ID is missing — fill the router fields in Settings → Telegram and save first.",
    );
  }
  if (!sharedSecret) {
    throw new Error(
      "Router Shared Secret is missing — fill the router fields in Settings → Telegram and save first.",
    );
  }

  const body = JSON.stringify({
    connectionId,
    botId: String(config?.routerBotId || "").trim(),
    commands,
  });
  const signature = `sha256=${crypto
    .createHmac("sha256", sharedSecret)
    .update(body)
    .digest("hex")}`;

  let response;
  try {
    response = await fetch(`${routerBase}/api/software-commands`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-maxcode-signature": signature,
      },
      body,
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      throw new Error(
        "The Telegram Webhook Software did not respond within 15 seconds — commands were not changed.",
      );
    }
    throw new Error(
      `The Telegram Webhook Software is unreachable: ${error?.message || "connection failed"}`,
    );
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `The router responded with ${response.status}`);
  }
  return data;
};

export { FEATURES, SOFTWARE_COMMAND, CONVERSATION_PREFIX };
