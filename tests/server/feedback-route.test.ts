/**
 * Readiness audit 2026-11-17 A1, `POST /api/feedback`: zod refuses any other shape, the session is
 * required, 10 per day per account, the row goes through the admin client with the session user id, and the
 * one `[feedback]` log line carries the user id and the length, never the text.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/server/auth";
import { resetRateLimits } from "@/lib/server/ratelimit";
import { FEEDBACK_DAILY_LIMIT, FEEDBACK_LOG_PREFIX, FEEDBACK_MAX_CHARS } from "@/lib/feedback";

vi.mock("@/lib/server/auth", async (original) => ({
  ...(await original<typeof import("@/lib/server/auth")>()),
  requireUser: vi.fn(),
}));

const { insert, from } = vi.hoisted(() => {
  const insert = vi.fn();
  return { insert, from: vi.fn(() => ({ insert })) };
});

vi.mock("@/lib/server/admin", () => ({ adminClient: () => ({ from }) }));
vi.mock("server-only", () => ({}));

const { requireUser } = await import("@/lib/server/auth");
const { POST } = await import("@/app/api/feedback/route");

const sessionFrom = vi.fn(() => { throw new Error("the session client must not write feedback"); });
const USER = "6f1d0c1e-4a52-4c39-9a8e-3b2c1d0e9f11";

function post(body: unknown, raw?: string): Request {
  return new Request("https://app.test/api/feedback", {
    method: "POST", headers: { "content-type": "application/json" }, body: raw ?? JSON.stringify(body),
  });
}

beforeEach(() => {
  resetRateLimits();
  insert.mockReset();
  from.mockClear();
  insert.mockResolvedValue({ error: null });
  vi.mocked(requireUser).mockResolvedValue({ userId: USER, client: { from: sessionFrom } as never });
});
afterEach(() => { vi.restoreAllMocks(); });

describe("validation", () => {
  const bad: [string, unknown][] = [
    ["an empty message", { message: "" }],
    ["a whitespace-only message", { message: "   \n " }],
    ["a message over 2,000 characters", { message: "x".repeat(FEEDBACK_MAX_CHARS + 1) }],
    ["a missing message", { screen: "/foods" }],
    ["a screen with a query string", { message: "hi", screen: "/foods?email=a@b.c" }],
    ["a screen that is not a path", { message: "hi", screen: "https://evil.test/" }],
    ["a malformed build", { message: "hi", appBuild: "abc def" }],
    ["an unknown field", { message: "hi", email: "a@b.c" }],
    ["a non-object body", ["hi"]],
  ];
  it.each(bad)("refuses %s with 400 and writes nothing", async (_, body) => {
    const res = await POST(post(body));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("bad_request");
    expect(insert).not.toHaveBeenCalled();
  });

  it("refuses a body that is not JSON", async () => {
    const res = await POST(post(null, "not json"));
    expect(res.status).toBe(400);
  });

  it("refuses a declared oversize body with 413 before reading it", async () => {
    const req = new Request("https://app.test/api/feedback", {
      method: "POST", headers: { "content-type": "application/json", "content-length": "100000" },
      body: JSON.stringify({ message: "hi" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect(insert).not.toHaveBeenCalled();
  });

  it("accepts exactly 2,000 characters", async () => {
    const res = await POST(post({ message: "y".repeat(FEEDBACK_MAX_CHARS) }));
    expect(res.status).toBe(201);
  });
});

describe("auth", () => {
  it("answers 401 without a session and writes nothing", async () => {
    vi.mocked(requireUser).mockRejectedValueOnce(new HttpError(401, "unauthorized", "Sign in to continue."));
    const res = await POST(post({ message: "hello" }));
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(insert).not.toHaveBeenCalled();
  });
});

describe("the write and the log line", () => {
  it("inserts the caller's row through the admin client with the session user id and answers 201", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const message = "  The swap sheet closed on its own when I tapped rice.  ";
    const res = await POST(post({ message, screen: "/foods", appBuild: "abc123" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ status: "sent" });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(from).toHaveBeenCalledWith("feedback");
    expect(insert).toHaveBeenCalledWith({
      user_id: USER, message: message.trim(), screen: "/foods", app_build: "abc123",
    });
    expect(log).toHaveBeenCalledTimes(1);
    const [prefix, line] = log.mock.calls[0] as [string, string];
    expect(prefix).toBe(FEEDBACK_LOG_PREFIX);
    expect(JSON.parse(line)).toEqual({ userId: USER, length: message.trim().length, screen: true });
    expect(line).not.toContain("swap sheet");
  });

  it("stores null for a screen and build the phone did not send", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    await POST(post({ message: "hello", screen: null }));
    expect(insert).toHaveBeenCalledWith({ user_id: USER, message: "hello", screen: null, app_build: null });
  });

  it("answers 503 feedback_unavailable when the insert fails, with no text in the error log", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => undefined);
    insert.mockResolvedValueOnce({ error: { code: "42P01", message: "relation \"feedback\" does not exist" } });
    const res = await POST(post({ message: "secret words" }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("feedback_unavailable");
    for (const call of err.mock.calls) expect(JSON.stringify(call)).not.toContain("secret words");
  });
});

describe("rate limit", () => {
  it(`allows ${FEEDBACK_DAILY_LIMIT} a day per account, then answers 429`, async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    for (let i = 0; i < FEEDBACK_DAILY_LIMIT; i += 1) {
      expect((await POST(post({ message: `note ${i}` }))).status).toBe(201);
    }
    const res = await POST(post({ message: "one more" }));
    expect(res.status).toBe(429);
    expect(insert).toHaveBeenCalledTimes(FEEDBACK_DAILY_LIMIT);
  });

  it("does not spend the daily count on a refused shape", async () => {
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    for (let i = 0; i < FEEDBACK_DAILY_LIMIT + 2; i += 1) await POST(post({ message: "" }));
    expect((await POST(post({ message: "still allowed" }))).status).toBe(201);
  });
});
