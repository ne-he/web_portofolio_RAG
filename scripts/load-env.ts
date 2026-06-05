import { config } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Next.js auto-loads .env.local for the app, but standalone scripts run via tsx
// do NOT. Import this module FIRST (before supabase/gemini) so process.env is
// populated before those modules read it at import time.
const envLocal = resolve(process.cwd(), ".env.local");
config({ path: existsSync(envLocal) ? envLocal : resolve(process.cwd(), ".env") });
