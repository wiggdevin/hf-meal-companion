import { timingSafeEqual } from "node:crypto";
import { jsonError } from "@/lib/server/http";
import { HttpError } from "@/lib/server/auth";
import { enforceRateLimit } from "@/lib/server/ratelimit";
import { requestIp } from "@/lib/server/request-ip";
import { opsMetricsSnapshot, parseDays } from "@/lib/server/ops-metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const MIN_TOKEN_CHARS = 32;

function bearerOk(req: Request, expected: string): boolean {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

/**
 * GET /api/ops/metrics?days=30 — aggregate ops metrics for the internal OpenDashboards instance.
 *
 * `Authorization: Bearer <OPS_METRICS_TOKEN>`, compared in constant time. 404 when the variable is
 * unset or shorter than 32 characters (the route does not exist until it is configured), 401 on a
 * mismatch. 60 per minute per IP (shared Postgres limiter, fail closed). The JSON comes from
 * `public.ops_metrics_snapshot` (service_role only): counts under 5 are null, percentiles under 10
 * samples are null, no row-level data. Always `Cache-Control: no-store`.
 */
export async function GET(req: Request): Promise<Response> {
  const expected = process.env.OPS_METRICS_TOKEN ?? "";
  if (expected.length < MIN_TOKEN_CHARS) {
    return Response.json({ error: "not_found" }, { status: 404, headers: NO_STORE });
  }
  try {
    await enforceRateLimit(`ops-metrics:ip:${requestIp(req)}`, 60, 60);
    if (!bearerOk(req, expected)) throw new HttpError(401, "unauthorized", "Unauthorized");
    const days = parseDays(new URL(req.url).searchParams.get("days"));
    let body: unknown;
    try {
      body = await opsMetricsSnapshot(days);
    } catch (cause) {
      throw new HttpError(503, "ops_metrics_unavailable", "Metrics are unavailable.", { cause });
    }
    return Response.json(body, { status: 200, headers: NO_STORE });
  } catch (error) {
    const res = jsonError(error);
    res.headers.set("Cache-Control", "no-store");
    return res;
  }
}
