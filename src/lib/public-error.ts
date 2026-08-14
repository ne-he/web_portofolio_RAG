import { isQuotaError } from "./gemini";

/**
 * Turn any thrown error into a sentence a visitor can read.
 *
 * Why this exists: the chat route used to forward `err.message` straight to the
 * browser. When Gemini's free-tier daily quota ran out, visitors got Google's
 * raw 429 JSON — internal quota metric names and a link to the billing console.
 * That is both unreadable and an information leak. Everything specific now goes
 * to the server log; the visitor gets plain Indonesian.
 */
export function toPublicError(err: unknown, where: string): string {
  const raw = err instanceof Error ? err.message : String(err);
  console.error(`[${where}]`, raw);

  if (isQuotaError(err)) {
    return "Jatah harian AI Nehemiah lagi habis nih 😅 Coba lagi besok ya, atau langsung kontak Nehemiah di nehewj@gmail.com.";
  }
  if (/\b50\d\b|overload|unavailable|fetch failed|ECONNRESET|ETIMEDOUT|abort/i.test(raw)) {
    return "Lagi ada gangguan koneksi ke AI-nya. Coba kirim ulang pesannya bentar lagi ya. 🙏";
  }
  if (/supabase|pgvector|match_chunks|PGRST/i.test(raw)) {
    return "Lagi ada kendala pas ngambil data dari knowledge base. Coba lagi bentar ya. 🙏";
  }
  return "Waduh, ada yang error di sisi Nehemiah. Coba lagi bentar ya, atau kontak nehewj@gmail.com kalau kejadian terus. 🙏";
}
