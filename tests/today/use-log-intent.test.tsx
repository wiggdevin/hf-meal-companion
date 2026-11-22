/** @vitest-environment jsdom */
/**
 * Fast logging (2026-11-21): Today opens what a `/log` link asked for, once, and clears it from the
 * address so a reload or Back does not open it again.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const takeSharedImage = vi.fn(async () => null as File | null);
vi.mock("@/lib/log/shared-image", () => ({ takeSharedImage: () => takeSharedImage() }));

import { useLogIntent } from "@/components/today/useLogIntent";

const enabled = { methods: ["text", "voice", "photo"] as const, scan: false };

afterEach(() => {
  window.history.replaceState(null, "", "/");
  takeSharedImage.mockReset();
});

describe("useLogIntent", () => {
  it("opens the asked capture for the asked slot and clears the address", async () => {
    window.history.replaceState(null, "", "/?d=2026-11-21&log=voice&slot=meal-2");
    const open = vi.fn();
    renderHook(() => useLogIntent(true, enabled, open));
    await waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    expect(open).toHaveBeenCalledWith({ open: { kind: "capture", method: "voice" }, slot: "meal-2", file: null });
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

  it("hands over the shared photo", async () => {
    const file = new File([new Uint8Array([1])], "shared-photo", { type: "image/jpeg" });
    takeSharedImage.mockResolvedValue(file);
    window.history.replaceState(null, "", "/?log=photo&shared=1");
    const open = vi.fn();
    renderHook(() => useLogIntent(true, enabled, open));
    await waitFor(() => expect(open).toHaveBeenCalledWith({ open: { kind: "capture", method: "photo" }, slot: null, file }));
  });

  it("does nothing without a log request", async () => {
    window.history.replaceState(null, "", "/?d=2026-11-21");
    const open = vi.fn();
    renderHook(() => useLogIntent(true, enabled, open));
    await new Promise((r) => setTimeout(r, 5));
    expect(open).not.toHaveBeenCalled();
    expect(takeSharedImage).not.toHaveBeenCalled();
  });

  it("opens the log sheet for a switched-off scanner", async () => {
    window.history.replaceState(null, "", "/?log=barcode");
    const open = vi.fn();
    renderHook(() => useLogIntent(true, enabled, open));
    await waitFor(() => expect(open).toHaveBeenCalledWith({ open: { kind: "sheet" }, slot: null, file: null }));
  });
});
