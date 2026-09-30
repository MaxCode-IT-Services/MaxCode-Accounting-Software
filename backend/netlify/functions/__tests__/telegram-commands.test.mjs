// Offline smoke test for the Telegram command engine.
// Network calls are stubbed via global fetch; no Telegram/DB is touched.
// Run:  node netlify/functions/utils/__cmd_smoke.test.mjs

const sent = [];
globalThis.fetch = async (url, options = {}) => {
  const body = JSON.parse(options.body || "{}");
  sent.push({ method: url.split("/").pop(), body });
  return {
    ok: true,
    status: 200,
    json: async () => ({ ok: true, result: { message_id: sent.length } }),
  };
};

const store = { commands: new Map(), links: [], settings: {} };
let failed = 0;

const ok = (label, actual, expected) => {
  const pass = String(actual) === String(expected);
  if (!pass) failed += 1;
  console.log(
    `${pass ? "PASS" : "FAIL"}  ${label}` +
      (pass ? "" : `\n        expected: ${expected}\n        actual:   ${actual}`),
  );
};

const makeCollection = (name) => ({
  findOne: async (filter) => {
    if (name === "business_settings") return store.settings || null;
    if (name === "telegram_webhook_state") return store.commands.get(filter._id) || null;
    if (name === "payment_links") {
      return (
        store.links.find((item) => String(item.shareUrl) === String(filter.shareUrl)) || null
      );
    }
    return null;
  },
  updateOne: async (filter, update) => {
    if (name === "telegram_webhook_state") {
      store.commands.set(filter._id, {
        _id: filter._id,
        ...(store.commands.get(filter._id) || {}),
        ...update.$set,
      });
    }
  },
  deleteOne: async (filter) => {
    if (name === "telegram_webhook_state") store.commands.delete(filter._id);
  },
  insertOne: async (doc) => {
    const inserted = { _id: `id${store.links.length + 1}`, ...doc };
    store.links.push(inserted);
    return { insertedId: inserted._id };
  },
  find: () => ({
    sort: () => ({ limit: () => ({ toArray: async () => store.links.slice().reverse() }) }),
  }),
  aggregate: () => ({
    toArray: async () => {
      const grouped = new Map();
      for (const link of store.links) {
        const current = grouped.get(link.status) || { count: 0, total: 0 };
        grouped.set(link.status, {
          _id: link.status,
          count: current.count + 1,
          total: current.total + Number(link.amount || 0),
        });
      }
      return [...grouped.values()];
    },
  }),
});

const db = { collection: (name) => makeCollection(name) };

store.settings = {
  scope: "global",
  companyName: "MaxCode Pvt Ltd",
  upiIds: [
    { id: "1", accountName: "HDFC Current", upiId: "maxcode@hdfcbank", status: "active" },
    { id: "2", accountName: "ICICI Saver", upiId: "maxcode@icicibank", status: "active" },
  ],
};

const config = { botToken: "TEST", chatId: 999 };
const chatId = 999;
const KEY = `mca:cmd:${chatId}`;

const cmds = await import("../utils/telegram-commands.js");

const state = () => store.commands.get(KEY)?.step;
const say = (text) =>
  cmds.handleConversationMessage({ db, config, message: { chat: { id: chatId }, text } });
const cmd = (text) =>
  cmds.handleCommandMessage({ db, config, message: { chat: { id: chatId }, text } });
const press = (data, messageId = 1) =>
  cmds.handleCommandCallback({
    db,
    config,
    callbackQuery: {
      id: `cb${sent.length}`,
      data,
      message: { chat: { id: chatId }, message_id: messageId },
    },
  });
const lastSend = () => sent.filter((s) => s.method === "sendMessage").at(-1)?.body.text || "";
const lastEdit = () => sent.filter((s) => s.method === "editMessageText").at(-1)?.body.text || "";
const alert = () =>
  sent.filter((s) => s.method === "answerCallbackQuery").at(-1)?.body.text || "";

// --- command parsing ---------------------------------------------------------
console.log("\n## command parsing");
ok("alias create_payment_link", cmds.extractCommand({ text: "/create_payment_link" }), "maxcode_accounting_create_link");
ok("canonical + @botname", cmds.extractCommand({ text: "/maxcode_accounting_create_link@MyBot" }), "maxcode_accounting_create_link");
ok("short alias createlink", cmds.extractCommand({ text: "/createlink" }), "maxcode_accounting_create_link");
ok("plain text ignored", JSON.stringify(cmds.extractCommand({ text: "hello" })), '""');
ok("unknown slash ignored", JSON.stringify(cmds.extractCommand({ text: "/nope" })), '""');

// --- forgiving spellings -----------------------------------------------------
console.log("\n## forgiving spellings");
ok(
  "software path + feature",
  cmds.extractCommand({ text: "/maxcode-accounting/createlink" }),
  "maxcode_accounting_create_link",
);
ok(
  "software path + full feature",
  cmds.extractCommand({ text: "/Maxcode-Accounting/Create-Payment-Link" }),
  "maxcode_accounting_create_link",
);
ok("dash form", cmds.extractCommand({ text: "/maxcode-accounting/create-link" }), "maxcode_accounting_create_link");
ok("underscore software only", cmds.extractCommand({ text: "/maxcode-accounting" }), "maxcode_accounting");
ok("trailing feature wins", cmds.extractCommand({ text: "/maxcode_accounting/stats" }), "maxcode_accounting_stats");
ok("links path", cmds.extractCommand({ text: "/maxcode-accounting/links" }), "maxcode_accounting_links");
ok("cancel path", cmds.extractCommand({ text: "/maxcode-accounting/cancel" }), "maxcode_accounting_cancel");
ok("typo createlnk", cmds.extractCommand({ text: "/createlnk" }), "maxcode_accounting_create_link");
ok("typo hel", cmds.extractCommand({ text: "/halp" }), "maxcode_accounting_help");
ok("trailing typo still matched", cmds.extractCommand({ text: "/statsx" }), "maxcode_accounting_stats");
ok("three letter word not guessed", JSON.stringify(cmds.extractCommand({ text: "/lnk" })), '""');
ok("unrelated word not guessed", JSON.stringify(cmds.extractCommand({ text: "/zzzzzz" })), '""');
ok("extra words ignored", cmds.extractCommand({ text: "/createlink for Rahul" }), "maxcode_accounting_create_link");
ok("at bot name kept", cmds.extractCommand({ text: "/createlink@MaxCodeBot" }), "maxcode_accounting_create_link");

// --- happy path with UPI buttons --------------------------------------------
console.log("\n## happy path (button UPI + all skips)");
await cmd("/maxcode_accounting_create_link");
ok("step 1 prompt", lastSend().startsWith("*📝 Create Payment Link — Step 1 of 6"), "true");
ok("state after step 1", state(), "client_name");

await say("Rahul Traders");
ok("step 2 prompt", lastSend().startsWith("*💰 Create Payment Link — Step 2 of 6"), "true");

await say("Rs 12,500");
ok("amount parsed with Rs/comma", state(), "upi_account");

await press("mcac:upi:1");
ok("upi button advances past picker", state(), "phone");
ok("upi account stored", store.commands.get(KEY).draft.upiId, "maxcode@icicibank");

await press("mcac:skip");
ok("phone skip -> expiry", state(), "expiry");
ok("phone blank stays blank", store.commands.get(KEY).draft.phoneNumber, undefined);

await press("mcac:skip");
ok("expiry skip -> alias", state(), "alias");
ok("expiry defaulted", /^\d{4}-\d{2}-\d{2}$/.test(store.commands.get(KEY).draft.linkExpiry), "true");

await press("mcac:skip");
ok("alias skip -> confirm", state(), "confirm");

await press("mcac:create");
ok("link created", store.links.length, 1);
ok("share url", store.links[0].shareUrl.startsWith("https://billing.maxcode.in/rahultraders"), "true");
ok("status pending", store.links[0].status, "pending");
ok("createdBy Telegram", store.links[0].createdBy, "Telegram");
ok("confirm msg edited into result", lastEdit().startsWith("*✅ Payment Link Created"), "true");
ok("open button present", sent.at(-1).body.reply_markup.inline_keyboard[0][0].url, store.links[0].shareUrl);
ok("state cleared", store.commands.has(KEY), "false");

// --- manual UPI + all text + confirm by text ---------------------------------
console.log("\n## manual UPI, free text, confirm by typing");
await cmd("/createlink");
await say("Amit Sons");
await say("2500");
await press("mcac:manual_upi");
ok("manual upi step", state(), "manual_upi");
ok("prompt edited in place", lastEdit().startsWith("*🏦 Create Payment Link — Step 3 of 6"), "true");

await say("Yes Bank | amit@okaxis");
await say("9876543210");
await say("2027-01-31");
await say("my custom link");
ok("alias sanitised", store.commands.get(KEY).draft.alias, "mycustomlink");
await say("yes");
ok("confirm by text works", store.links.length, 2);
ok("custom alias used", store.links[1].alias, "mycustomlink");
ok("expiry end-of-day IST", new Date(store.links[1].linkExpiry).toISOString(), "2027-01-31T18:29:59.999Z");

// --- single saved UPI account auto-selects -----------------------------------
console.log("\n## single saved UPI auto-selected");
store.settings.upiIds = [store.settings.upiIds[0]];
await cmd("/newlink");
await say("Single Co");
await say("100");
ok("skips picker automatically", state(), "phone");
await press("mcac:skip");
await press("mcac:skip");
await press("mcac:skip");
await say("haan");
ok("auto upi applied", store.links[2].upiId, "maxcode@hdfcbank");

// --- no saved UPI accounts falls back to typing ------------------------------
console.log("\n## zero saved UPI accounts");
store.settings.upiIds = [];
await cmd("/newlink");
await say("No Upi Co");
await say("700");
ok("falls back to manual entry", state(), "manual_upi");
await say("Bank X | x@ybank");
ok("reaches phone", state(), "phone");

// --- invalid input handling --------------------------------------------------
console.log("\n## invalid input handling");
await say("junk");
ok("phone accepts anything (free text)", state(), "expiry");
await say("32-14-99");
ok("bad date rejected", lastSend().startsWith("*⚠️ Invalid Date"), "true");
ok("still on expiry", state(), "expiry");
await press("mcac:skip");
await press("mcac:skip");
await press("mcac:create");
ok("created after recovery", store.links.length, 4);

await cmd("/newlink");
await say("Amount Co");
await say("not-a-number");
ok("bad amount rejected", lastSend().startsWith("*⚠️ Invalid Amount"), "true");
ok("still on amount", state(), "amount");
await say("0");
ok("zero rejected", state(), "amount");
await say("250");
// No UPI accounts are saved at this point, so entry is free text.
ok("recovers with valid amount", state(), "manual_upi");

await press("mcac:manual_upi");
await say("garbage");
ok("bad upi rejected", lastSend().startsWith("*⚠️ Invalid UPI Details"), "true");
ok("still on manual_upi", state(), "manual_upi");

// --- stale buttons from older messages are rejected --------------------------
console.log("\n## stale button guards");
ok("stale skip on upi step rejected", await press("mcac:skip"), true);
ok("stale skip message", alert(), "Nothing to skip at this step.");
ok("stale upi button rejected", await press("mcac:upi:0"), true);
ok("stale upi message", alert(), "Please send your answer as a message instead.");
ok("still on manual_upi", state(), "manual_upi");

await say("Bank Y | y@ybank");
ok("advance to phone", state(), "phone");
ok("stale manual_upi button rejected", await press("mcac:manual_upi"), true);
ok("still on phone", state(), "phone");

await press("mcac:skip");
await press("mcac:skip");
await press("mcac:create");
ok("created after stale-button recovery", store.links.length, 4);

store.settings.upiIds = [
  store.settings.upiIds[0],
  { id: "2", accountName: "ICICI Saver", upiId: "maxcode@icicibank", status: "active" },
];
await cmd("/newlink");
await say("Revise Co");
await say("10");
await press("mcac:upi:1");
await press("mcac:skip");
await press("mcac:skip");
await press("mcac:skip");
ok("reached confirm", state(), "confirm");
// Revise is valid on the confirm step and restarts at the client name.
await press("mcac:revise");
ok("revise jumps to client_name", state(), "client_name");
await say("New Name Co");
ok("revise continues to amount", state(), "amount");
await cmd("/cancel");

// --- no active conversation --------------------------------------------------
console.log("\n## no active conversation");
ok("/cancel reports nothing running", await cmd("/cancel"), true);
ok("plain reply falls through", await say("some text"), false);
ok("state untouched", store.commands.has(KEY), "false");

// --- cancel + expiry ---------------------------------------------------------
console.log("\n## cancel and expiry");
await cmd("/newlink");
await say("Cancel Co");
ok("mid-flow", state(), "amount");
await cmd("/cancel");
ok("cancelled", store.commands.has(KEY), "false");
ok("cancel message", lastSend().startsWith("*🚫 Cancelled"), "true");

await cmd("/newlink");
store.commands.get(KEY).expiresAt = new Date(Date.now() - 1000);
ok("expired state ignored", await say("late reply"), false);
ok("expired state purged", store.commands.has(KEY), "false");

// --- create on a non-confirm step -------------------------------------------
console.log("\n## create guard");
await cmd("/newlink");
ok("stale create on step 1 rejected", await press("mcac:create"), true);
ok("message", alert(), "The link details are not complete yet.");

// --- read-only commands ------------------------------------------------------
console.log("\n## list, stats, help, sync");
const total = store.links.length;
await cmd("/links");
ok("lists newest first", lastSend().indexOf("Revise Co") === -1, "true");
ok("footer", lastSend().includes("5 most recent"), "true");
ok("shows a real link", /https:\/\/billing\\?\.maxcode\\?\.in\//.test(lastSend()), "true");

await cmd("/stats");
ok("stats total count", lastSend().includes(`*Total Links:* ${total}`), "true");
ok("stats by status", lastSend().includes(`• Pending: ${total}`), "true");

await cmd("/help");
ok("help lists all commands", lastSend().includes("/maxcode\\_accounting\\_create\\_link"), "true");

const sync = await cmds.syncBotCommands("TEST");
ok("sync returns count", sync.commands, 6);
ok("sync calls setMyCommands", sent.at(-1).method, "setMyCommands");
ok("descriptions under 256 chars", sent.at(-1).body.commands.every((c) => c.description.length <= 256), "true");
ok("command names valid for Telegram", sent.at(-1).body.commands.every((c) => /^[a-z0-9_]{1,32}$/.test(c.command)), "true");

// --- state never collides with the UTR flow ----------------------------------
console.log("\n## isolation from the UTR flow");
await cmd("/newlink");
const cmdState = store.commands.get(KEY);
ok("conversation uses namespaced _id", cmdState._id, `mca:cmd:${chatId}`);
ok("conversation software tag", cmdState.software, "mca-cmd");
store.commands.set("999", { _id: "999", software: "mca", step: "await_utr" });
ok("both states coexist", store.commands.size, 2);
await cmd("/cancel");
ok("UTR state untouched", store.commands.has("999"), "true");

console.log(`\n${failed === 0 ? "ALL CHECKS PASSED" : `${failed} CHECK(S) FAILED`}`);
process.exit(failed === 0 ? 0 : 1);
