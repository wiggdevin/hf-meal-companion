/** Pure preflight for a live capture eval. Nested services must also fall back to TEST credentials. */
import { KNOWN_PRODUCTION_REF } from "../priors/import-guard";

export function validateCaptureLiveTarget(env: Record<string, string | undefined>): void {
  for (const name of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL"]) {
    if (env[name]) throw new Error("Live eval refuses ambient primary Supabase variables; use an isolated TEST environment.");
  }
  for (const name of ["SUPABASE_TEST_URL", "SUPABASE_TEST_ANON_KEY", "SUPABASE_TEST_SERVICE_ROLE_KEY",
    "SEARCH_EVAL_EMAIL", "SEARCH_EVAL_PASSWORD"]) {
    if (!env[name]) throw new Error(`Live eval requires ${name}; no production fallback.`);
  }
  if (env.SUPABASE_TEST_URL!.toLowerCase().includes(KNOWN_PRODUCTION_REF)) {
    throw new Error("Live eval refuses the production Supabase project.");
  }
  let url: URL;
  try { url = new URL(env.SUPABASE_TEST_URL!); }
  catch { throw new Error("Live eval requires a valid Supabase origin."); }
  const originOnly = !url.username && !url.password && !url.search && !url.hash && url.pathname === "/";
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && Boolean(url.port)
    && ["http:", "https:"].includes(url.protocol);
  const hosted = /^[a-z0-9]{20}\.supabase\.co$/.test(url.hostname) && url.protocol === "https:" && !url.port;
  if (!originOnly || !(local || hosted)) throw new Error("Live eval requires a loopback origin with a port or an HTTPS Supabase branch origin.");
  if (!/^[^@\s]+@(?:[a-z0-9-]+\.)+test$/i.test(env.SEARCH_EVAL_EMAIL!)) {
    throw new Error("Live eval requires a synthetic .test account.");
  }
}
