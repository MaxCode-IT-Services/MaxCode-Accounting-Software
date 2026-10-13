/**
 * Loads environment variables before any other module is evaluated.
 *
 * ESM imports are hoisted, so a `dotenv.config()` call in the body of
 * server.js runs *after* every imported module has already been evaluated.
 * Modules such as backend/netlify/functions/utils/auth.js read process.env at
 * module scope and throw when JWT_SECRET is not yet present, so the env file
 * must be loaded by a module that is imported first.
 */
import dotenv from "dotenv";
import { join } from "path";

dotenv.config({ path: join(process.cwd(), "backend", ".env") });
dotenv.config();
