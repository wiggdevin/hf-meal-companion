/**
 * Fast logging: the `/log` page itself and the share-target fallback route.
 * The middleware still guards `/log` (a signed-out visit goes to sign-in with `next`), so the page
 * only forwards to Today.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const redirect = vi.fn((to: string) => { throw new Error(`REDIRECT ${to}`); });
vi.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));

describe("/log", () => {
  it("forwards to Today with the capture to open", async () => {
    const { default: LogPage } = await import("@/app/log/page");
    await expect(LogPage({ searchParams: Promise.resolve({ mode: "barcode", slot: "meal-4" }) }))
      .rejects.toThrow("REDIRECT /?log=barcode&slot=meal-4");
  });

  it("is not excluded from the middleware's sign-in guard", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../../../middleware.ts"), "utf8");
    const matcher = /matcher: \["([^"]+)"\]/.exec(source)?.[1]?.replace(/\\\\/g, "\\");
    const guarded = new RegExp(`^${matcher}$`);
    expect(guarded.test("/log")).toBe(true);
    expect(guarded.test("/log/share")).toBe(true);
  });
});

describe("POST /log/share without a service worker", () => {
  it("still lands on the photo capture, without the image", async () => {
    const { POST } = await import("@/app/log/share/route");
    const response = await POST(new Request("https://hf.example/log/share", { method: "POST" }));
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location") ?? "").pathname + new URL(response.headers.get("location") ?? "").search)
      .toBe("/?log=photo");
  });
});
