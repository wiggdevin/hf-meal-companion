/**
 * Migration 20270109090000 `ops_metrics_snapshot`: the INSTALLED function (the migration is never
 * re-run here), seeded and rolled back inside one transaction on the local stack. Nothing here can
 * reach production (tests/tenancy/local-only). The text half runs in every unit shard.
 */
import "../tenancy/local-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CALL_REGISTRY } from "@/lib/ai/call-registry";
import { HAS_DB, runSql } from "../helpers/supabase";

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const sqlOnly = (t: string) => t.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
const UP = sqlOnly(read("supabase/migrations/20270109090000_ops_metrics_snapshot.sql"));
const DOWN = sqlOnly(read("supabase/migrations/down/20270109090000_ops_metrics_snapshot.down.sql"));

type Row = Record<string, string | number | boolean | null>;

describe("ops_metrics_snapshot (static)", () => {
  it("is one security-definer function with a pinned search_path and service_role-only execute", () => {
    expect(UP).toContain("create or replace function public.ops_metrics_snapshot(p_days int default 30)");
    expect(UP).toMatch(/stable\s+security definer\s+set search_path = pg_catalog, public, pg_temp/);
    expect(UP).toContain("revoke all on function public.ops_metrics_snapshot(int) from public, anon, authenticated;");
    expect(UP).toContain("grant execute on function public.ops_metrics_snapshot(int) to service_role;");
    expect(UP.match(/\bgrant\b/g)).toHaveLength(1);
    expect(UP).not.toMatch(/create (role|schema|view)|\bpassword\b/i);
  });

  it("allowlists exactly the purposes in CALL_REGISTRY", () => {
    const listed = [...(UP.match(/v_purposes text\[\] := array\[([\s\S]*?)\];/)?.[1] ?? "").matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect([...listed].sort()).toEqual(Object.keys(CALL_REGISTRY).sort());
  });

  it("selects no sensitive column and the down only drops the function", () => {
    for (const col of ["email", "media_ref", "message", "snapshot", "input_hash", "\\berror\\b", "\\bnote\\b"]) {
      expect(UP).not.toMatch(new RegExp(`(select|from)[^;]*${col}`, "i"));
    }
    expect(DOWN.trim().split("\n").filter((l) => l && !l.startsWith("set local"))).toEqual(
      ["drop function if exists public.ops_metrics_snapshot(integer);"]);
  });
});

describe.skipIf(!HAS_DB)("ops_metrics_snapshot on the installed database (rolled back)", () => {
  const D = (n: number) => `(((now() at time zone 'UTC')::date - ${n})::timestamp at time zone 'UTC' + interval '12 hours')`;
  const DAY = (n: number) => `((now() at time zone 'UTC')::date - ${n})`;
  const uid = (i: number) => `00000000-0000-4000-8000-00000a5000${String(i).padStart(2, "0")}`;
  const users = (n: number, daysAgo: number, from = 1) => Array.from({ length: n }, (_, i) =>
    `insert into auth.users (id, email, created_at) values ('${uid(from + i)}', 'ops-${from + i}@meal-companion.test', ${D(daysAgo)});`);

  const snapshot = (seed: string[]) => {
    const out = runSql(["begin;", ...seed, "select 'json:' || public.ops_metrics_snapshot(90)::text;", "rollback;"].join("\n"));
    const line = out.split("\n").find((l) => l.startsWith("json:"));
    return { raw: line!, json: JSON.parse(line!.slice(5)) as Record<string, Row[]> & { notes: Record<string, string> } };
  };
  const dayOf = (n: number) => runSql(`select ${DAY(n)}::text;`);

  it("nulls a count under 5 and keeps one of 5 or more", () => {
    const { json } = snapshot([...users(3, 85), ...users(5, 86, 10)]);
    const by = Object.fromEntries(json.signups_by_day.map((r: Row) => [r.day, r.accounts_created_surviving]));
    expect(by[dayOf(85)]).toBeNull();
    expect(by[dayOf(86)]).toBe(5);
    expect(json.notes.accounts_created_surviving).toMatch(/deleted accounts drop out/);
    expect(json.notes.rule).toMatch(/Completed UTC days only[\s\S]*fewer than 5[\s\S]*null[\s\S]*No totals are published/);
  });

  it("maps an unknown ai purpose to 'other', emits no raw purpose text, and nulls a cell under 5 accounts", () => {
    const calls = (purpose: string, users: number, daysAgo: number, from: number) => Array.from({ length: users }, (_, i) =>
      `insert into public.ai_calls (purpose, user_id, provider, model_id, sdk_version, created_at, latency_ms) values ('${purpose}', '${uid(from + i)}', 'p', 'm', 's${i}', ${D(daysAgo)}, ${100 + i});`);
    const { json, raw } = snapshot([...users(5, 80, 30), ...calls("zz-secret-purpose", 5, 84, 30), ...calls("lookup", 4, 83, 30)]);
    const rows = json.ai_calls_by_day;
    expect(raw).not.toContain("zz-secret-purpose");
    expect(rows.find((r) => r.day === dayOf(84))).toMatchObject({ purpose: "other", status: "ok", calls: 5, p50_latency_ms: null });
    expect(rows.find((r) => r.day === dayOf(83))).toMatchObject({ purpose: "lookup", calls: null, cost_estimate: null, p50_latency_ms: null, p95_latency_ms: null });
  });

  it("nulls EVERY value of a cell one account dominates (5+ entries, 1 account)", () => {
    const entry = () =>
      `insert into public.log_entries (id, user_id, eaten_at, tz, local_date, slot, method) values (gen_random_uuid(), '${uid(20)}', now(), 'UTC', ${DAY(75)}, 'lunch', 'voice');`;
    const { json } = snapshot([...users(1, 70, 20), ...[0, 1, 2, 3, 4, 5, 6].map(() => entry())]);
    expect(json.log_entries_by_day_method.find((r: Row) => r.day === dayOf(75))).toMatchObject({ method: "voice", entries: null, accounts: null });
    expect(json.active_accounts_by_day.find((r: Row) => r.day === dayOf(75))).toMatchObject({ active_accounts: null });
  });

  it("publishes ok and failed coach calls as separate cells, each on its own accounts, with no total", () => {
    const call = (i: number, status: string) =>
      `insert into public.ai_calls (purpose, user_id, provider, model_id, sdk_version, created_at, status) values ('coach', '${uid(70 + i)}', 'p', 'm', 'c${i}', ${D(74)}, '${status}');`;
    const { json } = snapshot([...users(5, 70, 70), ...[0, 1, 2, 3, 4].map((i) => call(i, "ok")), call(0, "provider_error"), call(1, "provider_error")]);
    const row = json.coach_call_failures_by_purpose_by_day.find((r: Row) => r.day === dayOf(74))!;
    expect(row).toMatchObject({ purpose: "coach", ok_calls: 5, failed_calls: null });
    expect(row).not.toHaveProperty("total_calls");
  });

  it("has no totals block, no entries beside active accounts, and no total_calls anywhere", () => {
    const { json, raw } = snapshot([...users(5, 60, 80)]);
    expect(json).not.toHaveProperty("totals");
    expect(raw).not.toMatch(/total_accounts|active_7d|active_30d|total_calls/);
    const entry = (i: number) =>
      `insert into public.log_entries (id, user_id, eaten_at, tz, local_date, slot, method) values (gen_random_uuid(), '${uid(80 + i)}', now(), 'UTC', ${DAY(65)}, 'lunch', 'text');`;
    const day65 = snapshot([...users(5, 60, 80), ...[0, 1, 2, 3, 4].map(entry)]).json.active_accounts_by_day.find((r: Row) => r.day === dayOf(65))!;
    expect(day65).toEqual({ day: dayOf(65), active_accounts: 5 });
  });

  it("excludes today: the window ends yesterday (UTC)", () => {
    const entry = (i: number) =>
      `insert into public.log_entries (id, user_id, eaten_at, tz, local_date, slot, method) values (gen_random_uuid(), '${uid(90 + i)}', now(), 'UTC', ${DAY(0)}, 'lunch', 'text');`;
    const signup = users(5, 0, 90);
    const { json } = snapshot([...signup, ...[0, 1, 2, 3, 4].map(entry)]);
    expect(json.to).toBe(dayOf(1));
    for (const key of ["active_accounts_by_day", "log_entries_by_day_method", "signups_by_day"]) {
      expect(json[key].map((r: Row) => r.day)).not.toContain(dayOf(0));
    }
  });

  it("excludes a future local_date and reports past days", () => {
    const entry = (i: number, ldDaysAgo: number) =>
      `insert into public.log_entries (id, user_id, eaten_at, tz, local_date, slot, method) values (gen_random_uuid(), '${uid(40 + i)}', now(), 'UTC', ${DAY(ldDaysAgo)}, 'lunch', 'text');`;
    const { json } = snapshot([...users(5, 70, 40), ...[0, 1, 2, 3, 4].map((i) => entry(i, 84)), entry(0, -5)]);
    const days = json.active_accounts_by_day.map((r) => r.day);
    expect(days).not.toContain(dayOf(-5));
    expect(json.log_entries_by_day_method.map((r: Row) => r.day)).not.toContain(dayOf(-5));
    expect(json.active_accounts_by_day.find((r: Row) => r.day === dayOf(84))).toEqual({ day: dayOf(84), active_accounts: 5 });
  });

  it("buckets client_timings by the server's created_at and nulls percentiles under 10 samples", () => {
    const timing = (i: number, createdAgo: number, atAgo: number) =>
      `insert into public.client_timings (user_id, run_id, path, step, ms, at, created_at) values ('${uid(60 + (i % 5))}', gen_random_uuid(), 'barcode', 'lookup', ${100 + i}, ${D(atAgo)}, ${D(createdAgo)});`;
    const ten = Array.from({ length: 10 }, (_, i) => timing(i, 82, 10));
    const nine = Array.from({ length: 9 }, (_, i) => timing(i, 81, 10));
    const { json } = snapshot([...users(5, 80, 60), ...ten, ...nine]);
    const rows = json.client_timings_by_day;
    expect(rows.find((r) => r.day === dayOf(10))).toBeUndefined();
    expect(rows.find((r) => r.day === dayOf(82))).toMatchObject({ samples: 10 });
    expect(rows.find((r) => r.day === dayOf(82))?.p50_ms).toEqual(expect.any(Number));
    expect(rows.find((r) => r.day === dayOf(81))).toMatchObject({ samples: 9, p50_ms: null, p95_ms: null });
  });

  it("clamps p_days and reports the window", () => {
    const out = runSql([
      "select (public.ops_metrics_snapshot(0)->>'days') || ',' || (public.ops_metrics_snapshot(500)->>'days') || ',' || (public.ops_metrics_snapshot(null)->>'days');"].join("\n"));
    expect(out).toBe("1,90,30");
  });

  it("grants EXECUTE to nobody but service_role (has_function_privilege)", () => {
    const has = (role: string) =>
      runSql(`select has_function_privilege('${role}', 'public.ops_metrics_snapshot(integer)', 'EXECUTE')::text;`);
    expect(has("public")).toBe("false");
    expect(has("anon")).toBe("false");
    expect(has("authenticated")).toBe("false");
    expect(has("service_role")).toBe("true");
  });

  it("refuses anon and authenticated with SQLSTATE 42501 and lets service_role run it", () => {
    const attempt = (role: string) => [
      "begin;",
      "do $t$ begin",
      `  execute 'set local role ${role}';`,
      "  perform public.ops_metrics_snapshot(7);",
      "  perform set_config('test.state', 'allowed', true);",
      "exception when others then perform set_config('test.state', sqlstate, true);",
      "end $t$;",
      "select 'state:' || current_setting('test.state', true);",
      "rollback;",
    ].join("\n");
    const state = (role: string) => runSql(attempt(role)).split("\n").find((l) => l.startsWith("state:"));
    expect(state("anon")).toBe("state:42501");
    expect(state("authenticated")).toBe("state:42501");
    expect(state("service_role")).toBe("state:allowed");
  });
});
