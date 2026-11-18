/**
 * Readiness audit 2026-11-17 A1: the `feedback` table (migration 20270108090000). Service-role
 * writes only: an account cannot insert any row (its own or another's) nor read one back through
 * the Data API, so `POST /api/feedback` and its daily limit are the only way in. The length checks
 * hold; `created_at` is the server's.
 *
 * Text checks run in every shard. The database check needs a verified local stack and is skipped
 * without one (tests/tenancy/local-only).
 */
import "../tenancy/local-only";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  HAS_BRANCH, HAS_DB, ensureUser, runSql, userClient, type TestUser,
} from "../helpers/supabase";
import { assertLocalTargets } from "../tenancy/target-guard";

const code = (sql: string) => sql.split("\n").filter((l) => !l.trimStart().startsWith("--")).join("\n");
const UP = code(readFileSync("supabase/migrations/20270108090000_feedback.sql", "utf8"));
const DOWN = code(readFileSync("supabase/migrations/down/20270108090000_feedback.down.sql", "utf8"));

describe("20270108090000 feedback (text)", () => {
  it("runs under a 3 s lock timeout, up and down", () => {
    for (const sql of [UP, DOWN]) expect(sql).toContain("set local lock_timeout = '3s';");
  });

  it("enables RLS, grants accounts nothing and lets only the service role write", () => {
    expect(UP).toContain("alter table public.feedback enable row level security;");
    expect(UP).not.toMatch(/create policy/);
    expect(UP).toContain("revoke all on table public.feedback from public, anon, authenticated;");
    expect(UP).not.toMatch(/grant[^;]*to (anon|authenticated)/);
    expect(UP).toMatch(/grant insert \(user_id, message, screen, app_build\), select, delete\s+on table public\.feedback to service_role;/);
  });

  it("caps the message at 2,000 characters", () => {
    expect(UP).toContain("check (char_length(message) between 1 and 2000)");
  });

  it("down drops the table", () => {
    expect(DOWN).toContain("drop table if exists public.feedback;");
  });
});

describe.skipIf(!HAS_BRANCH || !HAS_DB)("feedback grants (database)", () => {
  let a: TestUser;
  const clear = () => runSql(`delete from public.feedback where user_id = '${a.id}'`);

  beforeAll(async () => {
    assertLocalTargets();
    a = await ensureUser("a");
    clear();
  });
  afterAll(() => clear());

  it("refuses an account's direct insert of its own row, and any read", async () => {
    const client = await userClient(a);
    const { error } = await client.from("feedback").insert({ user_id: a.id, message: "hello" });
    expect(error?.code).toBe("42501");
    const read = await client.from("feedback").select("*");
    expect(read.error?.code ?? null).toBe("42501");
    expect(runSql(`select count(*) from public.feedback where user_id = '${a.id}'`)).toBe("0");
  });

  it("lets the service role insert, and the length check holds", () => {
    expect(runSql(`set role service_role; insert into public.feedback (user_id, message, screen)
      values ('${a.id}', 'hello', '/foods') returning 'ok'`)).toContain("ok");
    expect(() => runSql(`insert into public.feedback (user_id, message)
      values ('${a.id}', repeat('x', 2001))`)).toThrow(/feedback_message_check|check constraint/);
  });
});
