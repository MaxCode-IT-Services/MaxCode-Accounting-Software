/**
 * Netlify Edge Function: payment-link-og
 *
 * Purpose: When WhatsApp / Telegram / Facebook / Twitter / any link-preview
 *          crawler opens a payment link like https://pay.maxcode.in/PAY7D733
 *          the React SPA cannot set OG meta tags at crawl time because JS is
 *          not executed. This edge function intercepts those requests, fetches
 *          the payment record from the backend API and injects proper Open
 *          Graph + Twitter Card meta tags into the HTML before the browser /
 *          crawler receives it.
 *
 * Flow:
 *   1. Check if the request User-Agent looks like a bot / link-preview crawler.
 *   2. If yes  → fetch payment data from the existing /api/payment-links endpoint,
 *               build a static HTML page with proper <meta> tags and return it.
 *   3. If no   → pass the request through unmodified (normal React app).
 */

// ─── Bot / crawler User-Agent patterns ────────────────────────────────────────
const BOT_PATTERNS = [
  "whatsapp",
  "facebookexternalhit",
  "twitterbot",
  "telegrambot",
  "linkedinbot",
  "slackbot",
  "discordbot",
  "googlebot",
  "bingbot",
  "pinterestbot",
  "applebot",
  "ia_archiver",
  "semrushbot",
  "ahrefsbot",
  "screaming frog",
  "preview",
  "crawler",
  "spider",
  "bot/",
  "bot ",
  "embedly",
  "quora link preview",
  "outbrain",
  "rogerbot",
  "vkshare",
  "w3c_validator",
  "curl/",
  "wget/",
  "python-requests",
  "axios/",
  "node-fetch",
];

function isBotOrCrawler(userAgent = "") {
  const ua = userAgent.toLowerCase();
  return BOT_PATTERNS.some((p) => ua.includes(p));
}

// ─── Payment alias extractor ──────────────────────────────────────────────────
// Matches paths like /PAY7D733  /PAY-ABC123  /PAYXYZ  etc.
const ALIAS_REGEX = /^\/([A-Za-z0-9_-]{3,80})\/?$/;

function extractAlias(pathname = "") {
  const match = pathname.match(ALIAS_REGEX);
  return match ? match[1] : null;
}

// ─── Amount formatter ─────────────────────────────────────────────────────────
function formatAmount(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num) || num <= 0) return null;
  return "₹" + num.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ─── Status label ─────────────────────────────────────────────────────────────
function statusLabel(status = "") {
  const s = String(status).toLowerCase();
  if (s === "success") return "✅ Payment Successful";
  if (s === "failed") return "❌ Payment Failed";
  if (s === "under_verification") return "⏳ Payment Under Verification";
  if (s === "expired") return "⏰ Payment Link Expired";
  return "💳 Pay Now";
}

// ─── Build OG HTML page ───────────────────────────────────────────────────────
function buildOgHtml({
  alias,
  title,
  description,
  imageUrl,
  pageUrl,
  amount,
  clientName,
  note,
  status,
  companyName,
}) {
  // Escape HTML special chars to prevent injection
  const esc = (str = "") =>
    String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const safeTitle = esc(title);
  const safeDesc = esc(description);
  const safePageUrl = esc(pageUrl);
  const safeImage = esc(imageUrl);
  const safeCompany = esc(companyName);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <!-- Primary -->
  <title>${safeTitle}</title>
  <meta name="title" content="${safeTitle}" />
  <meta name="description" content="${safeDesc}" />
  <meta name="robots" content="noindex, nofollow" />

  <!-- Open Graph (WhatsApp, Facebook, LinkedIn, etc.) -->
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${safePageUrl}" />
  <meta property="og:site_name" content="${safeCompany}" />
  <meta property="og:title" content="${safeTitle}" />
  <meta property="og:description" content="${safeDesc}" />
  <meta property="og:image" content="${safeImage}" />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:type" content="image/png" />
  <meta property="og:locale" content="en_IN" />

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:url" content="${safePageUrl}" />
  <meta name="twitter:title" content="${safeTitle}" />
  <meta name="twitter:description" content="${safeDesc}" />
  <meta name="twitter:image" content="${safeImage}" />

  <!-- WhatsApp specifically reads og:image for thumbnail -->
  <!-- Redirect real users to the React app immediately -->
  <meta http-equiv="refresh" content="0; url=${safePageUrl}" />
  <link rel="canonical" href="${safePageUrl}" />
</head>
<body>
  <p>Redirecting to payment page... <a href="${safePageUrl}">Click here if not redirected</a></p>
  <script>window.location.replace("${safePageUrl}");</script>
</body>
</html>`;
}

// ─── Edge Function handler ────────────────────────────────────────────────────
export default async function handler(request, context) {
  const url = new URL(request.url);
  const userAgent = request.headers.get("user-agent") || "";
  const alias = extractAlias(url.pathname);

  // Only process if this looks like a payment alias path
  if (!alias) {
    return context.next();
  }

  // Always let real users through — only intercept bots
  if (!isBotOrCrawler(userAgent)) {
    return context.next();
  }

  // ── Fetch payment record from backend API ────────────────────────────────
  // Use the same Netlify function that the React app uses
  const apiBase = url.origin || "https://billing.maxcode.in";

  const apiUrl = `${apiBase}/.netlify/functions/payment-links?action=public&alias=${encodeURIComponent(alias)}`;

  let record = null;
  let branding = {
    companyName: "MaxCode IT Services",
    logoUrl: "",
  };

  try {
    const apiRes = await fetch(apiUrl, {
      headers: {
        "User-Agent": "MaxCode-OG-Bot/1.0 (link preview generator)",
        // Pass a known allowed origin so the backend CORS check passes
        "Origin": apiBase,
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (apiRes.ok) {
      const json = await apiRes.json();
      record = json?.record || null;
      if (json?.branding) branding = json.branding;
    }
  } catch {
    // If API fails, fall through to next() so the React app can handle it
    return context.next();
  }

  if (!record) {
    // Payment link not found — serve a minimal "not found" OG page
    const pageUrl = request.url;
    const companyName = branding.companyName || "MaxCode IT Services";
    const imageUrl = `${apiBase}/Banner.png`;

    const html = buildOgHtml({
      alias,
      title: `Payment Link Not Found | ${companyName}`,
      description: `The payment link you are looking for does not exist or has been removed.`,
      imageUrl,
      pageUrl,
      companyName,
    });

    return new Response(html, {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  // ── Build rich meta content from record ──────────────────────────────────
  const companyName = branding.companyName || "MaxCode IT Services";
  const logoUrl = branding.logoUrl || "";
  const pageUrl = record.shareUrl || request.url;

  const amountFormatted = formatAmount(record.amount);
  const statusStr = statusLabel(record.status);
  const clientName = String(record.clientName || "").trim();
  const businessName = String(record.businessName || "").trim();
  const note = String(record.note || "").trim();

  // OG Title: "Pay ₹5,000.00 | MaxCode IT Services" or with client name
  let ogTitle = "";
  if (amountFormatted) {
    if (record.status === "success") {
      ogTitle = `${amountFormatted} Payment Successful | ${companyName}`;
    } else if (record.status === "failed") {
      ogTitle = `${amountFormatted} Payment Failed | ${companyName}`;
    } else if (record.status === "under_verification") {
      ogTitle = `${amountFormatted} Under Verification | ${companyName}`;
    } else if (record.status === "expired") {
      ogTitle = `${amountFormatted} Payment Link Expired | ${companyName}`;
    } else {
      ogTitle = `Pay ${amountFormatted} | ${companyName}`;
    }
  } else {
    ogTitle = `Payment Request | ${companyName}`;
  }

  // OG Description: combine client name, note, status
  const descParts = [];
  if (clientName) descParts.push(`To: ${clientName}`);
  if (businessName && businessName !== clientName) descParts.push(`(${businessName})`);
  if (amountFormatted) descParts.push(`Amount: ${amountFormatted}`);
  if (note) descParts.push(`Note: ${note}`);
  descParts.push(statusStr);

  const ogDescription = descParts.join(" | ");

  // OG Image: prefer company logo, fallback to banner
  const imageUrl = logoUrl
    ? logoUrl
    : `${new URL(request.url).origin}/Banner.png`;

  const html = buildOgHtml({
    alias,
    title: ogTitle,
    description: ogDescription,
    imageUrl,
    pageUrl,
    amount: amountFormatted,
    clientName,
    note,
    status: record.status,
    companyName,
  });

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, no-cache",
    },
  });
}

export const config = {
  // Match all top-level paths that look like payment aliases: /PAYxxxx
  // We keep it broad (/*) and do alias filtering inside the function
  path: "/*",
};
