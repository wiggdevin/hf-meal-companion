/**
 * Spec 3.5 canary for lib/server/feedback.ts, the service-role writer behind `POST /api/feedback`
 * (readiness audit 2026-11-17, A1). The route stamps the session user's id, so B's row is the
 * canary: A's post lands under A only, even when A's body names B, and B's row stays as it was.
 * A's own session client cannot write the table at all.
 */
// Refuses any non-local database before anything else runs (review r8).
import "./local-only";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookieJar, createRequestClient } from "@/lib/supabase/server";
import { accountHeaderFromCookie } from "@/tests/helpers/account-header";
import { adminClient as testAdmin } from "@/tests/helpers/supabase";

const routeAdmin = vi.hoisted(() => ({ client: null as SupabaseClient | null }));
vi.mock("@/lib/server/admin", () => ({ adminClient: () => routeAdmin.client }));

import { POST as FEEDBACK } from "@/app/api/feedback/route";
import { resetRateLimits } from "@/lib/server/ratelimit";

const url = process.env.SUPABASE_TEST_URL ?? "";
const anonKey = process.env.SUPABASE_TEST_ANON_KEY ?? "";
const serviceKey = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? "";
const LOCAL = url.startsWith("http://127.0.0.1") && Boolean(anonKey && serviceKey);

type Account = { id: string; client: SupabaseClient; cookie: string };

async function cookieFor(client: SupabaseClient): Promise<string> {
  const { data } = await client.auth.getSession();
  const session = data.session!;
  const seed = new Request("https://app.test/seed");
  await createRequestClient(seed).auth.setSession({
    access_token: session.access_token, refresh_token: session.refresh_token,
  });
  return cookieJar(seed).map((c) => `${c.name}=${encodeURIComponent(c.value)}`).join("; ");
}

describe.skipIf(!LOCAL)("feedback store (canary)", () => {
  let admin: SupabaseClient;
  let a: Account;
  let b: Account;
  const ids: string[] = [];
  const canary = `canary-${crypto.randomUUID()}`;

  async function createAccount(label: string): Promise<Account> {
    const email = `feedback-${label}-${crypto.randomUUID()}@example.test`;
    const password = `local-${crypto.randomUUID()}-A1!`;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw created.error ?? new Error("user create failed");
    ids.push(created.data.user.id);
    const client = createClient(url, anonKey, { auth: { persistSession: false } });
    const signed = await client.auth.signInWithPassword({ email, password });
    if (signed.error) throw signed.error;
    return { id: created.data.user.id, client, cookie: await cookieFor(client) };
  }

  async function rowsOf(owner: string): Promise<Record<string, unknown>[]> {
    const { data, error } = await admin.from("feedback").select("*").eq("user_id", owner);
    if (error) throw error;
    return (data ?? []) as Record<string, unknown>[];
  }

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = url;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = anonKey;
    admin = testAdmin();
    routeAdmin.client = admin;
    [a, b] = await Promise.all([createAccount("a"), createAccount("b")]);
    const { error } = await admin.from("feedback").insert({ user_id: b.id, message: canary });
    if (error) throw error;
  });

  afterAll(async () => {
    for (const id of ids) await admin.auth.admin.deleteUser(id);
  });

  it("A's post lands under A only, and B's canary row is unchanged", async () => {
    const before = await rowsOf(b.id);
    resetRateLimits();
    const res = await FEEDBACK(new Request("https://app.test/api/feedback", {
      method: "POST",
      headers: { cookie: a.cookie, ...accountHeaderFromCookie(a.cookie),
        "content-type": "application/json", "x-real-ip": "10.0.0.8" },
      body: JSON.stringify({ message: `from A ${canary}`, screen: "/foods" }),
    }));
    expect(res.status).toBe(201);
    expect(await rowsOf(b.id)).toEqual(before);
    expect(await rowsOf(a.id)).toEqual([
      expect.objectContaining({ user_id: a.id, message: `from A ${canary}`, screen: "/foods" }),
    ]);
  });

  it("A's session client cannot write the table, for A or for B", async () => {
    for (const owner of [a.id, b.id]) {
      const { error } = await a.client.from("feedback").insert({ user_id: owner, message: "direct" });
      expect(error?.code).toBe("42501");
    }
    expect(await rowsOf(b.id)).toHaveLength(1);
  });
});
