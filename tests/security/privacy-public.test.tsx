/**
 * Readiness audit 2026-11-17 A2: /privacy is public. A signed-out visitor gets the page (no
 * redirect to /sign-in) with the page CSP; the page names every processor from the Settings list,
 * says "Test version", and points export, deletion and questions at Settings.
 */
import { NextRequest } from "next/server";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getClaims: async () => { auth.calls += 1; return { data: null }; } },
  }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/privacy", useRouter: () => ({}) }));

import middleware from "@/middleware";
import PrivacyPage from "@/app/privacy/page";
import { PROCESSORS } from "@/components/settings/ProcessorsSection";
import { PAGE_CSP_HEADER } from "@/lib/security-headers";

afterEach(() => { vi.unstubAllEnvs(); auth.calls = 0; });

describe("/privacy signed out", () => {
  it("is served without a session: no redirect, no auth read, page CSP on", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "pk");
    const res = await middleware(new NextRequest("https://example.test/privacy"));
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get(PAGE_CSP_HEADER)).toMatch(/'nonce-/);
    expect(auth.calls).toBe(0);
  });

  it("still sends a signed-out visitor on any other page to /sign-in", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "pk");
    for (const path of ["/privacy/extra", "/privacyx", "/settings"]) {
      const res = await middleware(new NextRequest(`https://example.test${path}`));
      expect(new URL(res.headers.get("location") ?? "").pathname).toBe("/sign-in");
    }
  });
});

describe("the privacy page", () => {
  it("renders the test-version notice, every processor and the in-app contact", () => {
    const html = renderToStaticMarkup(<PrivacyPage />);
    expect(html).toContain("Test version");
    for (const { name } of PROCESSORS) expect(html).toContain(name.replace(/&/g, "&amp;"));
    expect(html).toContain("Send feedback");
    expect(html).toContain("Export");
    expect(html).not.toMatch(/GDPR|HIPAA|compliant|certified/i);
  });

  it("does not claim health text never reaches Jev", () => {
    const html = renderToStaticMarkup(<PrivacyPage />);
    expect(html).not.toMatch(/never attached/);
    expect(html).toContain("can include health details you wrote");
  });

  it("points deletion at Settings only when ACCOUNT_DELETION_ENABLED=1", () => {
    vi.stubEnv("ACCOUNT_DELETION_ENABLED", "1");
    const on = renderToStaticMarkup(<PrivacyPage />);
    expect(on).toContain("Delete account removes your account");
    expect(on).toContain("older copies age out");
    vi.stubEnv("ACCOUNT_DELETION_ENABLED", "");
    expect(renderToStaticMarkup(<PrivacyPage />)).toContain("Self-serve deletion is not switched on");
  });
});
