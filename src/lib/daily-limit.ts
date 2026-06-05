import { createHash } from "node:crypto";
import { supabaseAdmin } from "./supabase";

// Per-day usage cap backed by Supabase. Unlike the in-memory burst limiter
// (rate-limit.ts), this survives serverless cold starts, so "N per day" is
// actually enforceable on Vercel.
//
// FAILS OPEN: if the RPC/table isn't available (e.g. supabase/rate-limit.sql
// hasn't been run yet), we allow the request rather than breaking chat. Enforce
// it by running that SQL once + setting the DAILY_LIMIT_* env vars.

const IP_LIMIT = Number(process.env.DAILY_LIMIT_PER_IP ?? 8);
const GLOBAL_LIMIT = Number(process.env.DAILY_LIMIT_GLOBAL ?? 0); // 0 = no global cap
const SALT = process.env.DAILY_LIMIT_SALT ?? "ai-nehemiah";

export interface DailyLimitResult {
  ok: boolean;
  ipCount: number;
  ipLimit: number;
  /** Which cap blocked the request (undefined when allowed). */
  reason?: "ip" | "global";
}

/** Hash the IP so we never persist a raw address (privacy-friendly key). */
function hashIp(ip: string): string {
  return "ip:" + createHash("sha256").update(SALT + ip).digest("hex").slice(0, 32);
}

interface UsageRow {
  allowed: boolean;
  ip_count: number;
  global_count: number;
}

export async function checkDailyLimit(ip: string): Promise<DailyLimitResult> {
  const allow: DailyLimitResult = { ok: true, ipCount: 0, ipLimit: IP_LIMIT };
  try {
    const { data, error } = await supabaseAdmin.rpc("check_and_bump_usage", {
      p_ip_key: hashIp(ip),
      p_ip_limit: IP_LIMIT,
      p_global_limit: GLOBAL_LIMIT,
    });
    if (error || !Array.isArray(data) || !data[0]) return allow; // fail open
    const row = data[0] as UsageRow;
    return {
      ok: row.allowed,
      ipCount: row.ip_count,
      ipLimit: IP_LIMIT,
      reason: row.allowed ? undefined : row.ip_count > IP_LIMIT ? "ip" : "global",
    };
  } catch {
    return allow; // fail open — never let the limiter take down chat
  }
}
