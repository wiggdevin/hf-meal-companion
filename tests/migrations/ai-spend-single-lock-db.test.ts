/**
 * W043, migration 20270109090100 `ai_spend_single_lock`: ONE advisory lock, taken first by every
 * spend writer (reserve, settle, sweep, delete_account), before any row lock; the clock is read once
 * after it. Totals are settled spend plus ALL unsettled holds, expired or not, until reconciled.
 * The text half runs in every unit shard; the database half runs on the migrated local stack (the
 * CI Integration job). Nothing here can reach production (tests/tenancy/local-only).
 */
import "../tenancy/local-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HAS_BRANCH, HAS_DB, adminClient, ensureUser, runSql, type TestUser } from "../helpers/supabase";

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const UP = read("supabase/migrations/20270109090100_ai_spend_single_lock.sql");
const DOWN = read("supabase/migrations/down/20270109090100_ai_spend_single_lock.down.sql");
const code = (sql: string) => sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");

/** One function's body, from its create statement to the next one. */
function body(sql: string, name: string): string {
  const c = code(sql);
  const start = c.search(new RegExp(`create (or replace )?function public\\.${name}\\(`));
  expect(start, `${name} is defined`).toBeGreaterThan(-1);
  const rest = c.slice(start + 10);
  const next = rest.search(/create (or replace )?function /);
  return next === -1 ? c.slice(start) : c.slice(start, start + 10 + next);
}

const SIGNATURES = [
  "ai_spend_reserve_split(uuid, numeric, numeric, numeric, integer, boolean, numeric, numeric)",
  "ai_spend_reserve(uuid, numeric, numeric, numeric, integer)",
  "ai_spend_settle(uuid, numeric)", "ai_spend_sweep(integer)", "ai_spend_expired_count()",
  "delete_account(uuid)",
];

type Reserve = { reservation_id: string | null; allowed: boolean; reason: string | null };

async function reserve(user: string, amount: number, background: boolean,
  opts: { globalCap?: number; backgroundCap?: number; userCap?: number; reserveUsd?: number } = {}): Promise<Reserve> {
  const { data, error } = await adminClient().rpc("ai_spend_reserve_split", { p_user_id: user,
    p_amount_usd: amount, p_user_cap_usd: opts.userCap ?? 2, p_global_cap_usd: opts.globalCap ?? 1,
    p_ttl_seconds: 300, p_background: background, p_background_cap_usd: opts.backgroundCap ?? 10,
    p_interactive_reserve_usd: opts.reserveUsd ?? 1 });
  if (error) throw new Error(error.message);
  return (data as Reserve[])[0];
}
const settle = async (id: string, actual: number) => {
  const { error } = await adminClient().rpc("ai_spend_settle", { p_reservation_id: id, p_actual_usd: actual });
  if (error) throw new Error(error.message);
};
const sweep = async () => {
  const { error } = await adminClient().rpc("ai_spend_sweep", { p_max: 2000 });
  if (error) throw new Error(error.message);
};

describe("20270109090100 ai_spend_single_lock (text)", () => {
  it("is live-safe, asserts its predecessors and replaces bodies only", () => {
    for (const file of [UP, DOWN]) {
      expect(file).toContain("set local lock_timeout = '3s';");
      expect(file).toContain("set local statement_timeout = '30s';");
      expect(code(file)).not.toMatch(/create table|alter table/i);
    }
    expect(code(UP)).toContain("to_regprocedure('public.ai_spend_reserve_split(");
    expect(code(UP)).toContain("to_regprocedure('public.ai_spend_settle(uuid, numeric)')");
    expect(code(UP)).toContain("to_regprocedure('public.delete_account(uuid)')");
    expect(code(UP).indexOf("to_regprocedure")).toBeLessThan(code(UP).indexOf("create function public._ai_spend_lock()"));
  });

  it.each(["ai_spend_reserve_split", "ai_spend_settle", "ai_spend_sweep", "delete_account"])(
    "%s takes the budget lock before any row lock or read", (fn) => {
      const b = body(UP, fn);
      const lock = b.indexOf("public._ai_spend_lock()");
      expect(lock).toBeGreaterThan(-1);
      for (const later of ["_ai_spend_lock_day(", "for update", "from public.ai_spend_", "update public.",
        "delete from", "insert into", "_ai_spend_reconcile(", "clock_timestamp()", "auth.users"]) {
        const at = b.indexOf(later);
        if (at !== -1) expect(lock, `${fn}: lock before ${later}`).toBeLessThan(at);
      }
    });

  it("reads the clock once, after the lock, and never uses now() or the live-hold filter", () => {
    for (const fn of ["ai_spend_reserve_split", "ai_spend_settle", "ai_spend_sweep"]) {
      const b = body(UP, fn);
      expect(b.match(/clock_timestamp\(\)/g), fn).toHaveLength(1);
      expect(b, fn).not.toMatch(/\bnow\(\)/);
    }
    expect(code(UP)).not.toMatch(/expires_at\s*>\s*(now\(\)|clock_timestamp\(\)|v_now)/);
    expect(code(UP)).not.toMatch(/expires_at\s*<\s/);
    // Every expiry test is the same `<=` against the one instant.
    expect(body(UP, "ai_spend_reserve_split")).toContain("r.expires_at <= v_now");
    expect(body(UP, "ai_spend_sweep")).toContain("x.expires_at <= v_now");
    expect(body(UP, "_ai_spend_reconcile")).toContain("r.expires_at <= p_now");
    expect(body(UP, "ai_spend_expired_count")).toContain("expires_at <= clock_timestamp()");
    expect(body(UP, "ai_spend_reserve_split")).toContain("v_now + make_interval(secs => p_ttl_seconds)");
  });

  it("counts every unsettled hold: the totals carry no expiry filter at all", () => {
    const b = body(UP, "ai_spend_reserve_split");
    const statement = b.slice(b.indexOf("select u.spent_usd,"));
    expect(statement.slice(0, statement.indexOf(";"))).not.toMatch(/expires_at/);
  });

  it("re-asserts service_role-only EXECUTE after the last function change, in both files", () => {
    for (const file of [UP, DOWN]) {
      const c = code(file);
      const lastCreate = c.lastIndexOf("create ");
      for (const sig of SIGNATURES) {
        const revoke = c.indexOf(`revoke all on function public.${sig.split("(")[0]}(`);
        expect(revoke, `${sig} revoke`).toBeGreaterThan(lastCreate);
        expect(c.indexOf(`grant execute on function public.${sig.split("(")[0]}(`, revoke)).toBeGreaterThan(revoke);
      }
      expect(c).toMatch(/from public, anon, authenticated;/);
      expect(c).not.toMatch(/grant execute[^;]*to (public|anon|authenticated)/);
    }
  });

  it("the down file restores the old bodies: row locks only, the sweep's try-lock, the one-argument reconcile", () => {
    const d = code(DOWN);
    expect(d).toContain("create or replace function public._ai_spend_reconcile(p_reservation_id uuid)");
    expect(d).toContain("pg_try_advisory_xact_lock(hashtext('public.ai_spend_sweep'))");
    expect(d).toContain("create or replace function public.delete_account(p_user_id uuid)");
    expect(d).not.toMatch(/perform public\._ai_spend_lock\(\)/);
    expect(d).toContain("drop function public._ai_spend_reconcile(uuid, timestamptz);");
    expect(d).toContain("drop function public._ai_spend_lock();");
  });
});

describe.skipIf(!HAS_DB || !HAS_BRANCH)("20270109090100 ai_spend_single_lock (database)", () => {
  let a: TestUser;
  let b: TestUser;
  // Every account's spend rows go (the concurrency users' too), so each case starts from zero.
  const reset = () => runSql(`delete from public.ai_spend_reservations;
    delete from public.ai_spend_user_days;
    delete from public.ai_spend_global_days;
    insert into public.ai_spend_global_days (day, shard, spent_usd)
      select (now() at time zone 'utc')::date, g, 0 from generate_series(0, 15) g;
    insert into public.ai_spend_user_days (user_id, day, spent_usd) values
      ('${a.id}', (now() at time zone 'utc')::date, 0), ('${b.id}', (now() at time zone 'utc')::date, 0);`);
  const expireAll = (user: string) => runSql(`update public.ai_spend_reservations
    set expires_at = now() - interval '1 minute' where user_id = '${user}' and settled_at is null`);
  /** Backdates a SETTLED row into the past, as the day goes on: expiry, creation and settle time. */
  const backdateSettled = (user: string) => runSql(`update public.ai_spend_reservations
    set expires_at = now() - interval '2 hours', created_at = now() - interval '3 hours',
        settled_at = now() - interval '2 hours' where user_id = '${user}' and settled_at is not null`);
  const todayUtc = "(now() at time zone 'utc')::date";

  beforeAll(async () => { a = await ensureUser("a"); b = await ensureUser("b"); });
  afterAll(() => {
    reset();
    runSql(`delete from public.ai_spend_user_days where user_id in ('${a.id}', '${b.id}'); delete from public.ai_spend_global_days`);
  });

  it("executes for service_role only: anon, authenticated and public have no EXECUTE on any of them", () => {
    for (const sig of [...SIGNATURES, "_ai_spend_lock()", "_ai_spend_reconcile(uuid, timestamptz)"]) {
      for (const role of ["anon", "authenticated"]) {
        expect(runSql(`select has_function_privilege('${role}', 'public.${sig}', 'execute')`), `${role} ${sig}`).toBe("f");
      }
      expect(runSql(`select has_function_privilege('service_role', 'public.${sig}', 'execute')`)).toBe("t");
      expect(runSql(`select count(*) from pg_proc p, aclexplode(p.proacl) x
        where p.oid = 'public.${sig}'::regprocedure and x.grantee = 0`), `public ${sig}`).toBe("0");
    }
  });

  it("an expired, unsettled hold STILL counts against the global ceiling until it is reconciled", async () => {
    reset();
    expect((await reserve(a.id, 0.9, false)).allowed).toBe(true);
    expireAll(a.id); // the function that made the hold died; nothing swept it yet
    expect(await reserve(b.id, 0.5, false)).toMatchObject({ allowed: false, reason: "global_cap" });
    await sweep(); // settles the dead hold at its cost (no ledger row: the whole hold)
    expect(await reserve(b.id, 0.5, false)).toMatchObject({ allowed: false, reason: "global_cap" });
  });

  it("an expired background hold keeps counting against the background ceiling until reconciled", async () => {
    reset();
    const o = { globalCap: 1000, backgroundCap: 0.8 };
    expect((await reserve(a.id, 0.5, true, o)).allowed).toBe(true);
    expireAll(a.id);
    expect(await reserve(b.id, 0.4, true, o)).toMatchObject({ allowed: false, reason: "background_cap" });
  });

  it("settled spend still counts after the hold's expiry: interactive", async () => {
    reset();
    const held = await reserve(a.id, 0.5, false);
    await settle(held.reservation_id as string, 0.9);
    backdateSettled(a.id);
    expect(runSql(`select count(*) from public.ai_spend_reservations where user_id = '${a.id}'
      and settled_at is not null and expires_at < now() - interval '1 hour'`)).toBe("1");
    expect(await reserve(b.id, 0.5, false)).toMatchObject({ allowed: false, reason: "global_cap" });
    expect((await reserve(b.id, 0.1, false)).allowed).toBe(true);
  });

  it("settled spend still counts after the hold's expiry: background", async () => {
    reset();
    const o = { globalCap: 1000, backgroundCap: 0.8 };
    const held = await reserve(a.id, 0.5, true, o);
    await settle(held.reservation_id as string, 0.7);
    backdateSettled(a.id);
    expect(await reserve(b.id, 0.2, true, o)).toMatchObject({ allowed: false, reason: "background_cap" });
    expect((await reserve(b.id, 0.1, true, o)).allowed).toBe(true);
  });

  it("background spend at its cap does not refuse an interactive turn", async () => {
    reset();
    const o = { globalCap: 1000, backgroundCap: 0.8 };
    expect((await reserve(a.id, 0.8, true, o)).allowed).toBe(true);
    expect(await reserve(b.id, 0.1, true, o)).toMatchObject({ allowed: false, reason: "background_cap" });
    expect((await reserve(b.id, 0.1, false, o)).allowed).toBe(true);
  });

  it("same account: $0.60 of background blocks more background work, a $1.40 interactive hold still fits", async () => {
    reset();
    const o = { globalCap: 1000, backgroundCap: 1000, userCap: 2, reserveUsd: 1.4 };
    expect((await reserve(a.id, 0.6, true, o)).allowed).toBe(true);
    expect(await reserve(a.id, 0.01, true, o)).toMatchObject({ allowed: false, reason: "background_user_cap" });
    expect((await reserve(a.id, 1.4, false, o)).allowed).toBe(true);
    // The account is now exactly at its $2 cap: nothing more of either kind.
    expect(await reserve(a.id, 0.01, false, o)).toMatchObject({ allowed: false, reason: "user_cap" });
  });

  it("holds last exactly the TTL the caller asks for, from the one clock reading", async () => {
    reset();
    for (const ttl of [90, 300]) {
      const { data, error } = await adminClient().rpc("ai_spend_reserve_split", { p_user_id: a.id,
        p_amount_usd: 0.01, p_user_cap_usd: 2, p_global_cap_usd: 1000, p_ttl_seconds: ttl,
        p_background: ttl === 300, p_background_cap_usd: 1000, p_interactive_reserve_usd: 0 });
      expect(error).toBeNull();
      const id = (data as Reserve[])[0].reservation_id;
      const secs = Number(runSql(`select extract(epoch from expires_at - created_at) from public.ai_spend_reservations where id = '${id}'`));
      expect(secs).toBeGreaterThanOrEqual(ttl);
      expect(secs).toBeLessThan(ttl + 5);
    }
  });

  describe("cross-shard concurrency (ONE lock across every shard)", () => {
    const N = 24;
    let ids: string[] = [];
    const makeUsers = () => {
      const out = runSql(`insert into auth.users (id, aud, role, email)
        select gen_random_uuid(), 'authenticated', 'authenticated', 'lock-' || g || '@meal-companion.test'
          from generate_series(1, ${N}) g returning id`);
      ids = out.split("\n").filter((l) => /^[0-9a-f-]{36}$/.test(l));
      expect(ids).toHaveLength(N);
    };
    const dropUsers = () => {
      if (ids.length === 0) return;
      const list = ids.map((i) => `'${i}'`).join(",");
      runSql(`delete from public.ai_spend_reservations where user_id in (${list});
        delete from public.ai_spend_user_days where user_id in (${list});
        delete from auth.users where id in (${list})`);
      ids = [];
    };
    beforeAll(() => { runSql("delete from auth.users where email like 'lock-%@meal-companion.test'"); makeUsers(); });
    afterAll(dropUsers);

    it("the test users span many global shards", () => {
      const shards = Number(runSql(`select count(distinct public._ai_spend_shard(u)) from unnest(array[${
        ids.map((i) => `'${i}'::uuid`).join(",")}]) u`));
      expect(shards).toBeGreaterThanOrEqual(8);
    });

    it("parallel reserves from different users near the global cap never overshoot it", async () => {
      reset();
      const results = await Promise.all(ids.flatMap((u) => [reserve(u, 0.1, false, { globalCap: 1, userCap: 5 }),
        reserve(u, 0.1, false, { globalCap: 1, userCap: 5 })]));
      expect(results.filter((r) => r.allowed)).toHaveLength(10); // exactly the ceiling, not 10 + shards - 1
      expect(results.filter((r) => !r.allowed).every((r) => r.reason === "global_cap")).toBe(true);
      expect(Number(runSql(`select coalesce(sum(amount_usd), 0) from public.ai_spend_reservations
        where day = ${todayUtc} and settled_at is null`))).toBeLessThanOrEqual(1);
    });

    it("the background ceiling holds under concurrency across accounts", async () => {
      reset();
      const o = { globalCap: 1000, backgroundCap: 0.8, userCap: 5, reserveUsd: 0 };
      const results = await Promise.all(ids.flatMap((u) => [reserve(u, 0.1, true, o), reserve(u, 0.1, true, o)]));
      expect(results.filter((r) => r.allowed)).toHaveLength(8);
      expect(results.filter((r) => !r.allowed).every((r) => r.reason === "background_cap")).toBe(true);
      // Interactive turns of the same accounts are untouched by the full background ceiling.
      expect((await reserve(ids[0], 0.1, false, o)).allowed).toBe(true);
    });

    it("settle racing delete_account never deadlocks", async () => {
      for (let round = 0; round < 4; round += 1) {
        reset();
        const victim = ids[round];
        const holds = await Promise.all([0, 1, 2].map(() => reserve(victim, 0.01, false, { globalCap: 1000, userCap: 5 })));
        const attempts = await Promise.all([
          ...holds.map((h) => adminClient().rpc("ai_spend_settle", { p_reservation_id: h.reservation_id, p_actual_usd: 0.005 })),
          adminClient().rpc("delete_account", { p_user_id: victim }),
          ...ids.slice(10, 14).map((u) => reserve(u, 0.01, false, { globalCap: 1000, userCap: 5 })),
        ]);
        for (const r of attempts) {
          const err = (r as { error?: { message?: string; code?: string } | null }).error;
          expect(err?.code, err?.message).not.toBe("40P01");
        }
        // The account is gone; recreate a user in its slot so later rounds keep N accounts.
        dropUsers();
        makeUsers();
      }
    });

    it("a sweep racing reserves on every shard finishes and never loses spend", async () => {
      reset();
      const o = { globalCap: 1000, userCap: 5 };
      const held = await Promise.all(ids.map((u) => reserve(u, 0.1, false, o)));
      runSql(`update public.ai_spend_reservations set expires_at = now() - interval '1 minute'
        where user_id in (${ids.map((i) => `'${i}'`).join(",")}) and settled_at is null`);
      await Promise.all([sweep(), ...ids.map((u) => reserve(u, 0.1, false, o))]);
      expect(held.every((h) => h.allowed)).toBe(true);
      expect(Number(runSql(`select coalesce(sum(spent_usd), 0) from public.ai_spend_global_days where day = ${todayUtc}`)))
        .toBeCloseTo(0.1 * N, 6);
    });
  });

  it("down then up re-applies (rolled back) and the down restores service_role-only grants", () => {
    const out = runSql(`begin; ${DOWN} select 't';
      select 'down:' || has_function_privilege('anon', 'public.ai_spend_settle(uuid, numeric)', 'execute')
        || has_function_privilege('authenticated', 'public.ai_spend_sweep(integer)', 'execute')
        || has_function_privilege('service_role', 'public.ai_spend_reserve_split(uuid, numeric, numeric, numeric, integer, boolean, numeric, numeric)', 'execute');
      ${UP} select 't'; rollback;`);
    expect(out.split("\n").filter((l) => l === "t")).toHaveLength(2);
    expect(out).toContain("down:falsefalsetrue");
  });
});
