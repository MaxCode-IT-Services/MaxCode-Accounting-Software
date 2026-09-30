import {
  SOFTWARE_NAME,
  answerTelegramCallback,
  editTelegramMessage,
  escapeMarkdownV2,
  formatAmount,
  sendTelegramMessage,
  telegramRequest,
} from "./payment-verification-telegram.js";

const STATE_COLLECTION = "telegram_webhook_state";
const PAYMENT_LINKS_COLLECTION = "payment_links";

const CONVERSATION_PREFIX = "mcac";
const CONVERSATION_SOFTWARE = "mca-cmd";
const CONVERSATION_TTL_MINUTES = 30;

const DEFAULT_DOMAIN = "https://billing.maxcode.in";

const heading = (emoji, title) =>
  `*${emoji} ${title}* ${escapeMarkdownV2(`— ${SOFTWARE_NAME}`)}`;

/**
 * One entry per Telegram slash command. Every name is namespaced with the
 * software name so other products sharing the router never collide.
 */
const FEATURES = {
  maxcode_accounting_create_link: {
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
  maxcode_accounting_links: {
    title: "List Payment Links",
    description: "Show the 5 most recent payment links",
    aliases: ["links", "list_links", "listlinks"],
  },
  maxcode_accounting_stats: {
    title: "Payment Link Stats",
    description: "Totals and counts by status",
    aliases: ["stats", "statistics", "status"],
  },
  maxcode_accounting_help: {
    title: "Help / Command List",
    description: "Show every available Telegram command",
    aliases: ["help", "start", "menu"],
  },
  maxcode_accounting_cancel: {
    title: "Cancel Current Task",
    description: "Stop the running step-by-step task",
    aliases: ["cancel", "stop", "abort"],
  },
};

// Entry point: /maxcode_accounting lists the software features.
const SOFTWARE_COMMAND = "maxcode_accounting";
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

// Ordered wizard steps. "manual_upi" shares the upi_account slot, and
// "confirm" is the review screen that closes the flow.
const STEPS = [
  "client_name",
  "amount",
  "upi_account",
  "phone",
  "expiry",
  "alias",
];

const STEP_VIEW = {
  client_name: { emoji: "📝", hint: "Send the customer name." },
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
  expiry: { emoji: "📅", hint: "Send the expiry date as YYYY-MM-DD, or press Skip." },
  alias: { emoji: "🔗", hint: "Send a link name using letters and numbers only." },
  confirm: { emoji: "✅", hint: "Review the details, then press Create Link." },
};

// Steps where the Skip button is meaningful.
const SKIPPABLE_STEPS = new Set(["phone", "expiry", "alias"]);

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
 * "/maxcode-accounting/create-payment-link". This turns any of those into
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
 *   /maxcode-accounting/create-payment-link
 *   /maxcode_accounting@MyBot
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
  // /maxcode-accounting/createlink runs the wizard and not the menu.
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
  const index = STEPS.indexOf(step === "manual_upi" ? "upi_account" : step);
  const position = index === -1 ? STEPS.length : index + 1;
  return `${view.emoji} Create Payment Link — Step ${position} of ${STEPS.length}`;
};

const buildStepView = (step, draft = {}) => {
  const view = STEP_VIEW[step] || STEP_VIEW.client_name;
  const lines = [
    `*${escapeMarkdownV2(stepTitle(step))}*`,
    escapeMarkdownV2(`— ${SOFTWARE_NAME}`),
    "",
    escapeMarkdownV2(view.hint),
  ];

  if (step === "confirm") {
    lines.push(
      "",
      `*${escapeMarkdownV2("Client:")}* ${escapeMarkdownV2(draft.clientName || "-")}`,
      `*${escapeMarkdownV2("Amount:")}* ${escapeMarkdownV2(formatAmount(draft.amount))}`,
      `*${escapeMarkdownV2("UPI:")}* ${escapeMarkdownV2(draft.upiId || "-")}`,
      `*${escapeMarkdownV2("Phone:")}* ${escapeMarkdownV2(draft.phoneNumber || "-")}`,
      `*${escapeMarkdownV2("Expiry:")}* ${escapeMarkdownV2(draft.linkExpiry || "-")}`,
      `*${escapeMarkdownV2("Link name:")}* ${escapeMarkdownV2(draft.alias || "-")}`,
    );
  }

  const inlineKeyboard = [];

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

const buildCreatedMessage = (record) => ({
  text: [
    `*✅ Payment Link Created* ${escapeMarkdownV2(`— ${SOFTWARE_NAME}`)}`,
    "",
    `*${escapeMarkdownV2("Client:")}* ${escapeMarkdownV2(record.clientName || "-")}`,
    `*${escapeMarkdownV2("Amount:")}* ${escapeMarkdownV2(formatAmount(record.amount))}`,
    "",
    escapeMarkdownV2("Share this link with your customer:"),
  ].join("\n"),
  inlineKeyboard: [
    [{ text: "Open Payment Link", url: record.shareUrl }],
    [{ text: "Create Another Link", callback_data: `${CONVERSATION_PREFIX}:create` }],
  ],
});

const buildLinksMessage = (links) =>
  [
    heading("📋", "Recent Payment Links"),
    "",
    ...(links.length > 0
      ? links.flatMap((link, index) => [
          `*${index + 1}.* ${escapeMarkdownV2(link.clientName || "-")}`,
          `${escapeMarkdownV2(formatAmount(link.amount))} • ${escapeMarkdownV2(
            link.status || "pending",
          )}`,
          `${escapeMarkdownV2(link.shareUrl || "-")}`,
          "",
        ])
      : [escapeMarkdownV2("No payment links yet."), ""]),
    escapeMarkdownV2("Showing the 5 most recent."),
  ].join("\n");

const buildStatsMessage = ({ total, groups }) =>
  [
    heading("📊", "Payment Link Stats"),
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
      "Short forms also work: /createlink, /links, /stats, /cancel.",
    ),
    escapeMarkdownV2(
      "Write it however you like — /maxcode-accounting/create-link also works.",
    ),
  ].join("\n");

const buildSoftwareMenuMessage = () => ({
  text: [
    heading("🧭", "Software Menu"),
    "",
    escapeMarkdownV2("Pick the work you want to do:"),
  ].join("\n"),
  inlineKeyboard: CANONICAL_COMMANDS.filter(
    (entry) => entry.command !== "maxcode_accounting_cancel",
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
    `*🚫 Cancelled* ${escapeMarkdownV2(`— ${SOFTWARE_NAME}`)}`,
    "",
    escapeMarkdownV2(
      existing ? "The running task was stopped." : "Nothing was running.",
    ),
  ].join("\n"));

  return true;
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
    clientRefId: "",
    clientName: String(draft.clientName || "").trim(),
    businessName: String(draft.businessName || "").trim(),
    phoneNumber: String(draft.phoneNumber || "").trim(),
    address: "",
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
    note: "",
    temporaryClient: false,
    createdBy: "Telegram",
    createdAt: now,
    updatedAt: now,
  };

  const result = await collection.insertOne(document);
  return { record: { ...document, _id: result?.insertedId } };
};

// Every run starts at step 1 so the customer name is always captured first.
const startWizard = async ({ db, botToken, chatId }) => {
  const step = "client_name";
  const draft = { clientName: "", amount: 0, upiOptions: [] };

  await saveStep({ db, chatId, step, draft });
  await pushStep({ botToken, chatId, messageId: null, step, draft });
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

  if (step === "client_name") {
    draft.clientName = text;
    await moveTo({ db, botToken, chatId, messageId: null, step: "amount", draft });
    return true;
  }

  if (step === "amount") {
    const amount = parseAmount(text);
    if (amount === null) {
      await sendText(botToken, chatId, [
        `*⚠️ Invalid Amount* ${escapeMarkdownV2(`— ${SOFTWARE_NAME}`)}`,
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
        `*⚠️ Invalid UPI Details* ${escapeMarkdownV2(`— ${SOFTWARE_NAME}`)}`,
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
        `*⚠️ Invalid UPI Details* ${escapeMarkdownV2(`— ${SOFTWARE_NAME}`)}`,
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
    await moveTo({ db, botToken, chatId, messageId: null, step: "expiry", draft });
    return true;
  }

  if (step === "expiry") {
    const raw = text.replace(/[\/\-\.]/g, "-");
    if (!isDateOnly(raw)) {
      await sendText(botToken, chatId, [
        `*⚠️ Invalid Date* ${escapeMarkdownV2(`— ${SOFTWARE_NAME}`)}`,
        "",
        escapeMarkdownV2("Send the expiry date as YYYY-MM-DD, for example: 2026-12-31"),
      ].join("\n"));
      return true;
    }

    draft.linkExpiry = raw;
    await moveTo({ db, botToken, chatId, messageId: null, step: "alias", draft });
    return true;
  }

  if (step === "alias") {
    draft.alias = cleanAlias(text);
    if (!draft.alias) {
      await sendText(botToken, chatId, [
        `*⚠️ Invalid Link Name* ${escapeMarkdownV2(`— ${SOFTWARE_NAME}`)}`,
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

  if (command === "maxcode_accounting_cancel") {
    return cancelConversation({ db, botToken, chatId });
  }

  if (command === "maxcode_accounting_links") {
    await showLinks({ db, botToken, chatId });
    return true;
  }

  if (command === "maxcode_accounting_stats") {
    await showStats({ db, botToken, chatId });
    return true;
  }

  if (command === "maxcode_accounting_help") {
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

  const answer = (text) =>
    answerTelegramCallback(botToken, { callback_query_id: callbackId, text });

  const sendAsReply = (replyText) =>
    sendText(botToken, chatId, [
      heading("💡", "Action Not Available"),
      "",
      escapeMarkdownV2(replyText),
    ].join("\n"));

  // Software menu buttons start the chosen feature straight away.
  if (parsed.action === "menu") {
    await answer("Starting");
    if (parsed.argument === "maxcode_accounting_create_link") {
      await startWizard({ db, botToken, chatId });
      return true;
    }
    if (parsed.argument === "maxcode_accounting_links") {
      await showLinks({ db, botToken, chatId });
      return true;
    }
    if (parsed.argument === "maxcode_accounting_stats") {
      await showStats({ db, botToken, chatId });
      return true;
    }
    await showHelp({ botToken, chatId });
    return true;
  }

  const state = await loadLiveConversation(db, chatId);
  const step = state?.step;
  const draft = { ...(state?.draft || {}) };

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

    if (step === "phone") {
      await moveTo({ db, botToken, chatId, messageId, step: "expiry", draft });
      return true;
    }

    if (step === "expiry") {
      draft.linkExpiry = todayIstDateOnly();
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
 * Publishes the command list so Telegram's "/" menu shows the software name
 * and every feature. Safe to call on every save.
 */
export const syncBotCommands = async (botToken) => {
  const commands = [
    { command: SOFTWARE_COMMAND, description: SOFTWARE_MENU_DESCRIPTION },
    ...CANONICAL_COMMANDS,
  ];

  await telegramRequest(botToken, "setMyCommands", {
    commands,
    scope: { type: "default" },
  });

  return { commands: commands.length };
};

export { FEATURES, SOFTWARE_COMMAND, CONVERSATION_PREFIX };
