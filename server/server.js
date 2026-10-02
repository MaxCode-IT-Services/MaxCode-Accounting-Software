/**
 * Express server that wraps Netlify functions.
 *
 * The backend is written as Netlify Functions (handler(event) → response).
 * This server adapts Express requests to the Netlify event format so the
 * exact same function code runs on:
 *   - Netlify (serverless functions)
 *   - Any Node.js platform (Azure, DigitalOcean, VPS, etc.)
 *
 * Build happens on GitHub Actions — the server only serves pre-built files.
 */
import express from "express";
import dotenv from "dotenv";
import { readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { startBackupScheduler } from "./backup-scheduler.js";

dotenv.config({ path: join(process.cwd(), "backend", ".env") });
dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ── Load Netlify function handlers ─────────────────────────────────────────
const FUNCTIONS_DIR = join(process.cwd(), "backend", "netlify", "functions");
const functionHandlers = new Map();

async function loadFunctions() {
  const files = readdirSync(FUNCTIONS_DIR).filter((f) => f.endsWith(".js"));
  for (const file of files) {
    const name = file.replace(".js", "");
    try {
      const module = await import(join(FUNCTIONS_DIR, file));
      if (typeof module.handler === "function") {
        functionHandlers.set(name, module.handler);
      }
    } catch (error) {
      console.error(`[server] Failed to load function ${file}:`, error.message);
    }
  }
  console.log(`[server] Loaded ${functionHandlers.size} API functions`);
}

// ── API adapter: Express request → Netlify event ───────────────────────────
function createNetlifyEvent(req) {
  return {
    httpMethod: req.method,
    headers: req.headers,
    queryStringParameters: req.query,
    body: JSON.stringify(req.body || {}),
    path: req.originalUrl.split("?")[0],
    requestContext: {
      identity: {
        sourceIp: req.ip,
      },
    },
  };
}

// ── API routes ─────────────────────────────────────────────────────────────
app.all("/api/:functionName", async (req, res) => {
  const { functionName } = req.params;
  const handler = functionHandlers.get(functionName);

  if (!handler) {
    return res.status(404).json({ error: `API function '${functionName}' not found` });
  }

  try {
    const event = createNetlifyEvent(req);
    const response = await handler(event);

    res.status(response.statusCode || 200);

    if (response.headers) {
      Object.entries(response.headers).forEach(([key, value]) => {
        res.setHeader(key, value);
      });
    }

    if (response.isBase64Encoded) {
      res.send(Buffer.from(response.body, "base64"));
    } else {
      res.send(response.body);
    }
  } catch (error) {
    console.error(`[server] Error in ${functionName}:`, error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── Static frontend ────────────────────────────────────────────────────────
const DIST_DIR = join(process.cwd(), "maxcode-invoice-software", "dist");
app.use(express.static(DIST_DIR));

// SPA fallback: all non-API routes serve index.html
app.get("*", (req, res) => {
  res.sendFile(join(DIST_DIR, "index.html"));
});

// ── Start ──────────────────────────────────────────────────────────────────
await loadFunctions();

app.listen(PORT, () => {
  console.log(`[server] MaxCode Accounting running on port ${PORT}`);
  console.log(`[server] API: http://localhost:${PORT}/api`);
  console.log(`[server] Frontend: http://localhost:${PORT}`);

  // Fallback backup cron: runs where the Netlify scheduled function can't
  // (Azure, DigitalOcean, VPS). Controlled by Settings → Backup & Restore.
  startBackupScheduler();
});
