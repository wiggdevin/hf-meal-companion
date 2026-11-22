/**
 * Spec 3.5 canary for lib/server/ops-metrics.ts, the service-role reader behind
 * `GET /api/ops/metrics`. B's account, its logged note and its email are the canary: the route
 * returns aggregates only, so none of B's row data (id, email, note) can appear in the response,
 * and the right bearer is the only way to any data at all.
 */
// Refuses any non-local database before anything else runs (review r8).
import "./local-only";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient as testAdmin } from "@/tests/helpers/supabase";

const routeAdmin = vi.hoisted(() => ({ client: null as SupabaseClient | null }));
vi.mock("@/lib/server/admin", () => ({ adminClient: () => routeAdmin.client }));

import { GET as METRICS } from "@/app/api/ops/metrics/route";
import { resetRateLimits } from "@/lib/server/ratelimit";

const url = process.env.SUPABASE_TEST_URL ?? "";
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? "";
const LOCAL = url.startsWith("http://127.0.0.1") && Boolean(serviceKey);
const TOKEN = "c".repeat(48);

describe.skipIf(!LOCAL)("ops metrics (canary)", () => {
  let admin: SupabaseClient;
  let bId = "";
  const canary = `canary-${crypto.randomUUID()}`;
  const email = `${canary}@example.test`;

  beforeAll(async () => {
    admin = testAdmin();
    routeAdmin.client = admin;
    vi.stubEnv("OPS_METRICS_TOKEN", TOKEN);
    const created = await admin.auth.admin.createUser({ email, password: `local-${crypto.randomUUID()}-A1!`, email_confirm: true });
    if (created.error || !created.data.user) throw created.error ?? new Error("user create failed");
    bId = created.data.user.id;
    const day = new Date().toISOString().slice(0, 10);
    const entry = await admin.from("log_entries").insert({
      id: crypto.randomUUID(), user_id: bId, note: canary, eaten_at: new Date().toISOString(),
      tz: "UTC", local_date: day, slot: "lunch", method: "text",
    });
    if (entry.error) throw entry.error;
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    if (bId) await admin.auth.admin.deleteUser(bId);
  });

  it("returns aggregates with none of B's row data", async () => {
    resetRateLimits();
    const res = await METRICS(new Request("https://app.test/api/ops/metrics?days=7", {
      headers: { authorization: `Bearer ${TOKEN}` },
    }));
    expect(res.status).toBe(200);
    const text = await res.text();
    for (const secret of [canary, email, bId]) expect(text).not.toContain(secret);
    expect(JSON.parse(text)).toHaveProperty("log_entries_by_day_method");
  });

  it("returns no data without the bearer", async () => {
    resetRateLimits();
    const res = await METRICS(new Request("https://app.test/api/ops/metrics"));
    expect(res.status).toBe(401);
    expect(await res.text()).not.toContain("signups");
  });
});
