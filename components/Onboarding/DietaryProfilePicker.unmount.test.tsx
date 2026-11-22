// @vitest-environment jsdom
/**
 * W062 verify round: closing the rule editor must never leave its owner waiting on a write the
 * picker no longer reports. The container sends one last "nothing pending" report on unmount.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import DietaryProfilePicker from "@/components/Onboarding/DietaryProfilePicker";

afterEach(cleanup);

describe("DietaryProfilePicker unmount", () => {
  it("reports no pending write when it unmounts, without waiting on any earlier state", () => {
    const onWriteState = vi.fn();
    const { unmount } = render(<DietaryProfilePicker onWriteState={onWriteState} />);
    const before = onWriteState.mock.calls.length;
    unmount();
    expect(onWriteState.mock.calls.length).toBe(before + 1);
    expect(onWriteState).toHaveBeenLastCalledWith({ pending: false, error: null });
  });

  it("a re-render with a new callback identity does not fire a false 'settled' report", () => {
    const first = vi.fn();
    const { rerender, unmount } = render(<DietaryProfilePicker onWriteState={first} />);
    const second = vi.fn();
    rerender(<DietaryProfilePicker onWriteState={second} />);
    expect(first).not.toHaveBeenLastCalledWith(expect.objectContaining({ pending: true }));
    const callsAfterRerender = second.mock.calls.length;
    unmount();
    expect(second.mock.calls.length).toBe(callsAfterRerender + 1);
  });
});
