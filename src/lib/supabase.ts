import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `[supabase] Missing environment variable: ${name}. ` +
        `Add it to .env.local before running the app or the ingest script.`,
    );
  }
  return value;
}

const SUPABASE_URL = requireEnv("NEXT_PUBLIC_SUPABASE_URL");

/**
 * Public client (anon key). Safe to use from the browser and respects Row Level
 * Security. The chat API route uses this to call the `match_chunks` RPC.
 */
export const supabasePublic: SupabaseClient = createClient(
  SUPABASE_URL,
  requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  { auth: { persistSession: false } },
);

/**
 * Admin client (service_role key). BYPASSES Row Level Security: SERVER ONLY.
 * Never import this into a Client Component. `SUPABASE_SERVICE_ROLE_KEY` has no
 * `NEXT_PUBLIC_` prefix, so Next.js keeps it out of the browser bundle.
 * The ingestion script uses this to bulk-insert chunks.
 */
export const supabaseAdmin: SupabaseClient = createClient(
  SUPABASE_URL,
  requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);
