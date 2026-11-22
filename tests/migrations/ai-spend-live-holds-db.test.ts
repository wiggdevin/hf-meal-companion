/**
 * W043, migration 20270109090100 `ai_spend_live_holds`: the global ceiling and the background
 * splits count settled spend plus LIVE (unexpired, unsettled) holds only. An abandoned hold past its
 * expiry stops counting at once, before the sweep reconciles it, so stale $0.25 OpenRouter
 * allowances cannot trip "daily AI spend cap reached" for every account. The text half runs in
 * every unit shard; the database half runs on the migrated local stack (the CI Integration job).
 */
import "../tenancy/local-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HAS_BRANCH, HAS_DB, adminClient, ensureUser, runSql, type TestUser } from "../helpers/supabase";

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const UP = read("supabase/migrations/20270109090100_ai_spend_live_holds.sql");
const DOWN = read("supabase/migrations/down/20270109090100_ai_spend_live_holds.down.sql");
const code = (sql: string) => sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");

type Reserve = { reservation_id: string | null; allowed: boolean; reason: string | null };

async function reserve(user: string, amount: number, background: boolean,
  opts: { globalCap?: number; backgroundCap?: number } = {}): Promise<Reserve> {
  const { data, error } = await adminClient().rpc("ai_spend_reserve_split", { p_user_id: user,
    p_amount_usd: amount, p_user_cap_usd: 2, p_global_cap_usd: opts.globalCap ?? 1, p_ttl_seconds: 300,
    p_background: background, p_background_cap_usd: opts.backgroundCap ?? 10,
    p_interactive_reserve_usd: 1 });
  if (error) throw new Error(error.message);
  return (data as Reserve[])[0];
}

describe("20270109090100 ai_spend_live_holds (text)", () => {
  it("is live-safe and replaces one function only", () => {
    for (const file of [UP, DOWN]) {
      expect(file).toContain("set local lock_timeout = '3s';");
      expect(file).toContain("set local statement_timeout = '30s';");
      expect(code(file)).toContain("create or replace function public.ai_spend_reserve_split(");
    }
    expect(code(UP)).not.toMatch(/create table|alter table|drop function/i);
  });

  it("counts only live unsettled holds in every global and background sum; the down file restores the old sums", () => {
    const body = code(UP).slice(code(UP).indexOf("select u.spent_usd,"));
    const statement = body.slice(0, body.indexOf(";"));
    expect(statement.match(/r\.expires_at > now\(\)/g)?.length).toBeGreaterThanOrEqual(4);
    expect(code(DOWN).slice(code(DOWN).indexOf("select u.spent_usd,"))).not.toMatch(/expires_at > now\(\)/);
  });
});

describe.skipIf(!HAS_DB || !HAS_BRANCH)("20270109090100 ai_spend_live_holds (database)", () => {
  let a: TestUser;
  let b: TestUser;
  const reset = () => runSql(`delete from public.ai_spend_reservations where user_id in ('${a.id}', '${b.id}');
    delete from public.ai_spend_user_days where user_id in ('${a.id}', '${b.id}');
    delete from public.ai_spend_global_days;
    insert into public.ai_spend_global_days (day, shard, spent_usd)
      select (now() at time zone 'utc')::date, g, 0 from generate_series(0, 15) g;
    insert into public.ai_spend_user_days (user_id, day, spent_usd) values
      ('${a.id}', (now() at time zone 'utc')::date, 0), ('${b.id}', (now() at time zone 'utc')::date, 0);`);
  const expireAll = (user: string) => runSql(`update public.ai_spend_reservations
    set expires_at = now() - interval '1 minute' where user_id = '${user}' and settled_at is null`);

  beforeAll(async () => { a = await ensureUser("a"); b = await ensureUser("b"); });
  afterAll(() => { reset(); runSql(`delete from public.ai_spend_user_days where user_id in ('${a.id}', '${b.id}'); delete from public.ai_spend_global_days`); });

  it("false-trip regression: another account's expired hold does not count against the global ceiling", async () => {
    reset();
    expect((await reserve(a.id, 0.9, false)).allowed).toBe(true);
    expect(await reserve(b.id, 0.5, false)).toMatchObject({ allowed: false, reason: "global_cap" });
    expireAll(a.id); // the function that made the hold died; nothing swept it yet
    expect((await reserve(b.id, 0.5, false)).allowed).toBe(true);
  });

  it("an expired background hold stops counting against the background ceiling too", async () => {
    reset();
    const o = { globalCap: 1000, backgroundCap: 0.8 };
    expect((await reserve(a.id, 0.5, true, o)).allowed).toBe(true);
    expect(await reserve(b.id, 0.4, true, o)).toMatchObject({ allowed: false, reason: "background_cap" });
    expireAll(a.id);
    expect((await reserve(b.id, 0.4, true, o)).allowed).toBe(true);
  });

  it("settled spend still counts after the hold's expiry", async () => {
    reset();
    const held = await reserve(a.id, 0.5, false);
    const { error } = await adminClient().rpc("ai_spend_settle", { p_reservation_id: held.reservation_id, p_actual_usd: 0.9 });
    expect(error).toBeNull();
    expireAll(a.id);
    expect(await reserve(b.id, 0.5, false)).toMatchObject({ allowed: false, reason: "global_cap" });
  });

  it("background spend at its cap does not refuse an interactive turn", async () => {
    reset();
    const o = { globalCap: 1000, backgroundCap: 0.8 };
    expect((await reserve(a.id, 0.8, true, o)).allowed).toBe(true);
    expect(await reserve(b.id, 0.1, true, o)).toMatchObject({ allowed: false, reason: "background_cap" });
    expect((await reserve(b.id, 0.1, false, o)).allowed).toBe(true);
  });

  it("down then up re-applies (rolled back)", () => {
    const out = runSql(`begin; ${DOWN} select 't'; ${UP} select 't'; rollback;`);
    expect(out.split("\n").filter((l) => l === "t")).toHaveLength(2);
  });
});
