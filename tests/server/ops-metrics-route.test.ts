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
const SNAPSHOT = { days: 30, signups_by_day: [] };

function get(headers: Record<string, string> = {}, query = ""): Request {
  return new Request(`https://app.test/api/ops/metrics${query}`, { headers: { "x-real-ip": "203.0.113.1", ...headers } });
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
    for (const [q, days] of [["?days=7", 7], ["?days=0", 1], ["?days=500", 90], ["?days=abc", 30], ["?days=2.5", 30], ["?days=", 30], ["?days=%20", 30]] as const) {
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

  it("limits a valid caller to 60 per minute per x-real-ip", async () => {
    let last = 200;
    for (let i = 0; i < 61; i++) last = (await GET(get(bearer()))).status;
    expect(last).toBe(429);
    expect((await GET(get({ ...bearer(), "x-real-ip": "203.0.113.77" }))).status).toBe(200);
  });

  it("charges bad tokens to a stricter bucket (10 per minute), separate per x-real-ip", async () => {
    const bad = (ip: string, extra: Record<string, string> = {}) =>
      GET(get({ ...bearer("w".repeat(40)), "x-real-ip": ip, ...extra }));
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await bad("198.51.100.1")).status);
    expect(statuses.slice(0, 10)).toEqual(Array(10).fill(401));
    expect(statuses[10]).toBe(429);
    // another x-real-ip has its own bucket
    expect((await bad("198.51.100.2")).status).toBe(401);
    // a spoofed x-forwarded-for neither shares nor escapes the bucket
    expect((await bad("198.51.100.1", { "x-forwarded-for": "198.51.100.99" })).status).toBe(429);
    expect((await bad("198.51.100.3", { "x-forwarded-for": "198.51.100.1" })).status).toBe(401);
    // guessing never locks out the real caller on the same IP: valid requests use the other bucket
    expect((await GET(get({ ...bearer(), "x-real-ip": "198.51.100.1" }))).status).toBe(200);
  });

  it("authenticates before charging the normal bucket", async () => {
    for (let i = 0; i < 5; i++) await GET(get({ authorization: "Bearer nope", "x-real-ip": "192.0.2.5" }));
    const ok = await GET(get({ ...bearer(), "x-real-ip": "192.0.2.5" }));
    expect(ok.status).toBe(200);
  });
});
