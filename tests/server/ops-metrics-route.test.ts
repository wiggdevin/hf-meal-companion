/**
 * GET /api/ops/metrics: 404 until OPS_METRICS_TOKEN is set (32+ characters), 401 on a wrong or
 * missing bearer, 200 with the function's JSON and no-store, the day count clamped, and a database
 * failure answered 503 without the cause.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimits } from "@/lib/server/ratelimit";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/server/admin", () => ({ adminClient: () => ({ rpc }) }));
vi.mock("server-only", () => ({}));

const { GET } = await import("@/app/api/ops/metrics/route");
const TOKEN = "t".repeat(40);
const SNAPSHOT = { days: 30, totals: { total_accounts: null }, signups_by_day: [] };

function get(headers: Record<string, string> = {}, query = ""): Request {
  return new Request(`https://app.test/api/ops/metrics${query}`, { headers });
}
const bearer = (t = TOKEN) => ({ authorization: `Bearer ${t}` });

beforeEach(() => {
  resetRateLimits();
  rpc.mockReset();
  rpc.mockResolvedValue({ data: SNAPSHOT, error: null });
  vi.stubEnv("OPS_METRICS_TOKEN", TOKEN);
});
afterEach(() => { vi.unstubAllEnvs(); });

describe("GET /api/ops/metrics", () => {
  it("answers 404 when the token is unset or shorter than 32 characters, and never calls the database", async () => {
    for (const value of ["", "short-token", "x".repeat(31)]) {
      vi.stubEnv("OPS_METRICS_TOKEN", value);
      const res = await GET(get(bearer(value || "x")));
      expect(res.status).toBe(404);
      expect(res.headers.get("cache-control")).toBe("no-store");
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("answers 401 on a missing, malformed or wrong bearer", async () => {
    for (const headers of [{}, { authorization: "Basic abc" }, bearer("w".repeat(40)), bearer("t".repeat(39)), bearer(TOKEN + "x")]) {
      expect((await GET(get(headers))).status).toBe(401);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("answers 200 with the snapshot, no-store, and 30 days by default", async () => {
    const res = await GET(get(bearer()));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual(SNAPSHOT);
    expect(rpc).toHaveBeenCalledWith("ops_metrics_snapshot", { p_days: 30 });
  });

  it("clamps ?days= to 1..90 and ignores junk", async () => {
    for (const [q, days] of [["?days=7", 7], ["?days=0", 1], ["?days=500", 90], ["?days=abc", 30], ["?days=2.5", 30]] as const) {
      rpc.mockClear();
      await GET(get(bearer(), q));
      expect(rpc).toHaveBeenCalledWith("ops_metrics_snapshot", { p_days: days });
    }
  });

  it("answers 503 and leaks no database detail when the function fails", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501", message: "secret detail" } });
    const res = await GET(get(bearer()));
    expect(res.status).toBe(503);
    expect(JSON.stringify(await res.json())).not.toContain("secret detail");
  });

  it("is limited per IP", async () => {
    let last = 200;
    for (let i = 0; i < 61; i++) last = (await GET(get(bearer()))).status;
    expect(last).toBe(429);
  });
});
