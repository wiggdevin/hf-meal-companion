import "server-only";

/**
 * The store behind `GET /api/ops/metrics`: one call to `public.ops_metrics_snapshot` (migration
 * 20270109090000) with the service client. EXECUTE is granted to service_role only, and the
 * function returns aggregates with small-count suppression, never rows.
 */
import { adminClient } from "@/lib/server/admin";

export class OpsMetricsError extends Error {
  constructor(public readonly code: string) {
    super(`ops_metrics_snapshot failed (${code})`);
    this.name = "OpsMetricsError";
  }
}

export const OPS_DAYS_DEFAULT = 30;

/** `?days=` clamped to 1..90 like the function; anything unreadable is the default. */
export function parseDays(raw: string | null): number {
  const n = raw === null ? NaN : Number(raw);
  if (!Number.isInteger(n)) return OPS_DAYS_DEFAULT;
  return Math.min(90, Math.max(1, n));
}

export async function opsMetricsSnapshot(days: number): Promise<unknown> {
  const { data, error } = await adminClient().rpc("ops_metrics_snapshot", { p_days: days });
  if (error) throw new OpsMetricsError(error.code ?? "unknown");
  if (data === null || typeof data !== "object") throw new OpsMetricsError("bad_shape");
  return data;
}
