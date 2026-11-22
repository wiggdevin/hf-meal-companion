/** @vitest-environment jsdom */
/**
 * Fast logging (2026-11-21): Today opens what a `/log` link asked for and clears it from the address,
 * so a reload or Back does not open it again. It answers every request, not just the first one: a
 * second link landing on a Today that is already mounted opens too.
 */
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let pathname = "/";
let query = "";
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useSearchParams: () => new URLSearchParams(query) }));

import { useLogIntent } from "@/components/today/useLogIntent";
import { holdLogIntent } from "@/lib/log/held-log-intent";

const enabled = { methods: ["text", "voice", "photo"] as const, scan: true };

beforeEach(() => { pathname = "/"; query = ""; window.sessionStorage.clear(); });
afterEach(() => { cleanup(); window.history.replaceState(null, "", "/"); });

describe("useLogIntent", () => {
  it("opens the asked capture for the asked slot and clears the address", async () => {
    window.history.replaceState(null, "", "/?d=2026-11-21&log=voice&slot=meal-2");
    const open = vi.fn();
    renderHook(() => useLogIntent(true, enabled, open));
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    expect(open).toHaveBeenCalledWith({ open: { kind: "capture", method: "voice" }, slot: "meal-2" });
    expect(window.location.search).toBe("?d=2026-11-21");
  });

  it("waits until Today is mounted", async () => {
    window.history.replaceState(null, "", "/?log=photo");
    const open = vi.fn();
    const { rerender } = renderHook(({ ready }) => useLogIntent(ready, enabled, open), { initialProps: { ready: false } });
    expect(open).not.toHaveBeenCalled();
    rerender({ ready: true });
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
  });

  it("does nothing without a log request, and does not latch", async () => {
    window.history.replaceState(null, "", "/?d=2026-11-21");
    const open = vi.fn();
    renderHook(() => useLogIntent(true, enabled, open));
    await new Promise((r) => setTimeout(r, 5));
    expect(open).not.toHaveBeenCalled();
    // A request arriving later on the same mounted page still opens.
    act(() => {
      window.history.pushState(null, "", "/?log=voice");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(open).toHaveBeenCalledWith({ open: { kind: "capture", method: "voice" }, slot: null });
  });

  it("answers a second /log link on a Today that is already mounted", async () => {
    window.history.replaceState(null, "", "/?log=voice");
    const open = vi.fn();
    const { rerender } = renderHook(() => useLogIntent(true, enabled, open));
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    // A client navigation from /log lands back on "/" with a new request.
    pathname = "/log";
    rerender();
    window.history.replaceState(null, "", "/?log=photo&slot=meal-3");
    pathname = "/";
    rerender();
    await waitFor(() => expect(open).toHaveBeenCalledTimes(2));
    expect(open).toHaveBeenLastCalledWith({ open: { kind: "capture", method: "photo" }, slot: "meal-3" });
  });

  it("answers two /?log= pushes in a row that change only the query (verify round)", async () => {
    window.history.replaceState(null, "", "/?log=voice");
    query = "log=voice";
    const open = vi.fn();
    const { rerender } = renderHook(() => useLogIntent(true, enabled, open));
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    // A client push onto the same path: only the search params change.
    window.history.pushState(null, "", "/?log=photo&slot=meal-2");
    query = "log=photo&slot=meal-2";
    rerender();
    await waitFor(() => expect(open).toHaveBeenCalledTimes(2));
    expect(open).toHaveBeenLastCalledWith({ open: { kind: "capture", method: "photo" }, slot: "meal-2" });
    window.history.pushState(null, "", "/?log=barcode");
    query = "log=barcode";
    rerender();
    await waitFor(() => expect(open).toHaveBeenCalledTimes(3));
    expect(open).toHaveBeenLastCalledWith({ open: { kind: "scan" }, slot: null });
  });

  it("drops a request held across onboarding when a fresh link supersedes it", async () => {
    holdLogIntent({ mode: "photo", slot: "meal-2" });
    window.history.replaceState(null, "", "/?log=voice");
    const open = vi.fn();
    const { rerender } = renderHook(() => useLogIntent(true, enabled, open));
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    expect(open).toHaveBeenCalledWith({ open: { kind: "capture", method: "voice" }, slot: null });
    rerender();
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));
    expect(open).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.length).toBe(0);
  });

  it("never opens the same request twice", async () => {
    window.history.replaceState(null, "", "/?log=voice");
    const open = vi.fn();
    const { rerender } = renderHook(() => useLogIntent(true, enabled, open));
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));
    rerender();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("stops answering once unmounted", async () => {
    window.history.replaceState(null, "", "/");
    const open = vi.fn();
    const { unmount } = renderHook(() => useLogIntent(true, enabled, open));
    unmount();
    window.history.pushState(null, "", "/?log=voice");
    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(open).not.toHaveBeenCalled();
  });

  it("reads the shell served at /log (offline) and moves the address to Today", async () => {
    window.history.replaceState(null, "", "/log?mode=voice&slot=meal-1");
    pathname = "/log";
    const open = vi.fn();
    renderHook(() => useLogIntent(true, enabled, open));
    await waitFor(() => expect(open).toHaveBeenCalledWith({ open: { kind: "capture", method: "voice" }, slot: "meal-1" }));
    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe("");
  });

  it("takes a request held across onboarding, once", async () => {
    holdLogIntent({ mode: "photo", slot: "meal-2" });
    const open = vi.fn();
    const { rerender } = renderHook(() => useLogIntent(true, enabled, open));
    await waitFor(() => expect(open).toHaveBeenCalledWith({ open: { kind: "capture", method: "photo" }, slot: "meal-2" }));
    rerender();
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("opens the barcode ready screen, not the camera, for a scan link", async () => {
    window.history.replaceState(null, "", "/?log=barcode");
    const open = vi.fn();
    renderHook(() => useLogIntent(true, enabled, open));
    await waitFor(() => expect(open).toHaveBeenCalledWith({ open: { kind: "scan" }, slot: null }));
  });

  it("opens the log sheet for a switched-off scanner", async () => {
    window.history.replaceState(null, "", "/?log=barcode");
    const open = vi.fn();
    renderHook(() => useLogIntent(true, { ...enabled, scan: false }, open));
    await waitFor(() => expect(open).toHaveBeenCalledWith({ open: { kind: "sheet" }, slot: null }));
  });
});
