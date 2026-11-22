/** @vitest-environment jsdom */
/** Fast logging: a barcode link opens a ready screen; the camera waits for the Scan tap. */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ScanReadySheet from "@/components/today/ScanReadySheet";

afterEach(() => cleanup());

describe("ScanReadySheet", () => {
  it("asks for no camera until Scan is tapped", () => {
    const getUserMedia = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia }, configurable: true });
    const onScan = vi.fn();
    render(<ScanReadySheet onScan={onScan} onSearch={vi.fn()} onClose={vi.fn()} />);
    expect(getUserMedia).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Scan" }));
    expect(onScan).toHaveBeenCalledTimes(1);
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("offers search instead", () => {
    const onSearch = vi.fn();
    render(<ScanReadySheet onScan={vi.fn()} onSearch={onSearch} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Search instead" }));
    expect(onSearch).toHaveBeenCalledTimes(1);
  });
});
