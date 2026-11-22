// Internal ops dashboard role (20270109090000): a login role that reads aggregate views only.
// Static checks run in every unit shard; the database half runs on the local stack and rolls back.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HAS_DB, runSql } from "../helpers/supabase";

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");
const sqlOnly = (t: string) => t.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
const NAME = "20270109090000_ops_readonly_role";
const UP = read(`supabase/migrations/${NAME}.sql`);
const DOWN = read(`supabase/migrations/down/${NAME}.down.sql`);
const UP_SQL = sqlOnly(UP);
const VIEWS = ["signups_by_day", "account_totals", "active_accounts_by_day", "log_entries_by_day_method",
  "ai_calls_by_day", "coach_failures_by_day", "coach_fallbacks_by_day", "client_timings_by_day", "feedback_by_day"];

describe("ops_readonly role migration (static)", () => {
  it("is live-safe and sets no password", () => {
    expect(UP).toContain("set local lock_timeout = '3s';");
    expect(UP_SQL).not.toMatch(/\bpassword\b/i);
    expect(UP_SQL).toMatch(/create role ops_readonly login nosuperuser nocreatedb nocreaterole noinherit/);
    expect(UP_SQL).toContain("nobypassrls connection limit 3");
    expect(UP_SQL).toContain("default_transaction_read_only = on");
  });

  it("grants only schema usage and select on the ops views", () => {
    const grants = UP_SQL.split("\n").filter((l) => /^\s*grant\b/.test(l)).map((l) => l.trim());
    expect(grants).toEqual([
      "grant usage on schema ops to ops_readonly;",
      "grant select on all tables in schema ops to ops_readonly;",
    ]);
    expect(UP_SQL).toContain("revoke all on all tables in schema ops from public, anon, authenticated;");
  });

  it("defines every view and none of them selects a sensitive column", () => {
    for (const v of VIEWS) expect(UP_SQL).toContain(`create view ops.${v} as`);
    for (const col of ["email", "note", "media_ref", "message", "error", "snapshot", "user_id as", "input_hash"]) {
      expect(UP_SQL).not.toMatch(new RegExp(`select[^;]*\\b${col}\\b`, "i"));
    }
    expect(UP_SQL).not.toMatch(/security_invoker|security definer/i);
  });

  it("has a down that drops the schema and the role", () => {
    expect(DOWN).toContain("drop schema if exists ops cascade;");
    expect(DOWN).toContain("drop role if exists ops_readonly;");
  });
});

describe.skipIf(!HAS_DB)("ops_readonly on the database (rolled back)", () => {
  it("reads the views, cannot read base tables, cannot write, and down removes everything", () => {
    const probe = (label: string, sql: string) => [
      "do $t$ begin", `  ${sql}`, `  perform set_config('test.${label}', 'allowed', true);`,
      `exception when others then perform set_config('test.${label}', 'denied', true);`,
      "end $t$;", `select '${label}:' || current_setting('test.${label}', true);`,
    ].join("\n");
    const out = runSql([
      "begin;", UP, "grant ops_readonly to current_user;",
      "set local role ops_readonly;",
      ...VIEWS.map((v) => probe(`view_${v}`, `perform count(*) from ops.${v};`)),
      probe("base_log_entries", "perform 1 from public.log_entries limit 1;"),
      probe("base_auth_users", "perform 1 from auth.users limit 1;"),
      probe("base_feedback", "perform 1 from public.feedback limit 1;"),
      probe("write_ops", "insert into ops.feedback_by_day values (now()::date, 1);"),
      "reset role;", DOWN,
      "select 'role_gone:' || not exists (select 1 from pg_roles where rolname = 'ops_readonly');",
      "select 'schema_gone:' || (to_regnamespace('ops') is null);",
      "rollback;",
    ].join("\n")).split("\n");
    for (const v of VIEWS) expect(out).toContain(`view_${v}:allowed`);
    for (const l of ["base_log_entries", "base_auth_users", "base_feedback", "write_ops"]) {
      expect(out).toContain(`${l}:denied`);
    }
    expect(out).toContain("role_gone:true");
    expect(out).toContain("schema_gone:true");
  });
});
