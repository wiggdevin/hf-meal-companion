/** @vitest-environment jsdom */
/**
 * Fast logging (2026-11-21): a photo shared into the app (manifest share_target) opens in the plate
 * capture already loaded. It still waits for "Use this photo": a share never starts a model call
 * on its own, and the confirm step after it is unchanged (F-073).
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));
vi.mock("@/lib/media/resize", () => ({ resizeImage: vi.fn(async (file: Blob) => file) }));
vi.mock("@/lib/media/exif-time", () => ({ shotTimeOf: vi.fn(async () => null) }));
const captureMedia = vi.fn();
vi.mock("@/lib/capture-client", async (original) => ({
  ...(await original<typeof import("@/lib/capture-client")>()),
  captureMedia: (...args: unknown[]) => captureMedia(...args),
}));

import CaptureSheet from "@/components/CaptureSheet";

afterEach(() => cleanup());
const noop = () => {};

describe("CaptureSheet with a shared photo", () => {
  it("shows the shared photo ready to use, without sending it", async () => {
    globalThis.URL.createObjectURL ??= () => "blob:shared";
    globalThis.URL.revokeObjectURL ??= () => {};
    const file = new File([new Uint8Array([1])], "shared-photo", { type: "image/jpeg" });
    render(<CaptureSheet open initialMode="photo" initialFile={file} onClose={noop} onLogged={noop}
      onOpenSearch={noop} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Use this photo" })).toBeTruthy());
    expect(captureMedia).not.toHaveBeenCalled();
  });

  it("opens empty as before when nothing was shared", () => {
    render(<CaptureSheet open initialMode="photo" onClose={noop} onLogged={noop} onOpenSearch={noop} />);
    expect(screen.getByRole("button", { name: "Photograph the plate" })).toBeTruthy();
  });
});
