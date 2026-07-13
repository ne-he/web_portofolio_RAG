// CORS support for the public chat API, so the SAME backend can power chatbots
// embedded on Nehemiah's OTHER sites (different domains).
//
// Configure with env `ALLOWED_ORIGINS` — comma-separated origins, e.g.:
//   ALLOWED_ORIGINS=https://armory-hall.vercel.app,https://iceberg-cv.vercel.app
//
// When the env var is unset the API stays same-origin only (no CORS headers),
// which is the safe default for the portfolio site itself. Same-origin requests
// (the site's own fetch("/api/chat")) never need CORS, so nothing breaks.

const allowed = new Set(
  (process.env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim().replace(/\/$/, ""))
    .filter(Boolean),
);

/**
 * Headers to attach to every /api/chat response. Empty object when the request
 * origin isn't in the allowlist (browser then blocks cross-origin reads).
 */
export function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !allowed.has(origin.replace(/\/$/, ""))) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    // Origin-dependent response — make caches key on it.
    Vary: "Origin",
  };
}

/** Response for the CORS preflight (OPTIONS) request. */
export function preflight(req: Request): Response {
  const cors = corsHeaders(req.headers.get("origin"));
  if (Object.keys(cors).length === 0) {
    // Not an allowed cross-origin caller — plain 204, no CORS grants.
    return new Response(null, { status: 204 });
  }
  return new Response(null, {
    status: 204,
    headers: {
      ...cors,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400", // cache the preflight for a day
    },
  });
}
