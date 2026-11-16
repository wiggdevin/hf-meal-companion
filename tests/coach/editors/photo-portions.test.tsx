// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CaptureDraftEditor from "@/components/coach/editors/CaptureDraftEditor";
import { buildDraft } from "@/lib/capture/propose";
import { deterministicSanity } from "@/lib/log/sanity";
import { captureProposal } from "@/tests/coach/editors/fixtures";

afterEach(cleanup);
const noop = () => {};
const notice = /Photo portions are estimates/;

describe("photo portion review", () => {
  it("identifies even a high-confidence photo mass as estimated and saves the measured correction", () => {
    const onCommit = vi.fn();
    const item = { ...captureProposal.items[0], confidence: 0.95 };
    const proposal = buildDraft({ items: [item], notes: [] }, [item], [item.policy],
      { draftId: captureProposal.draftId, method: "photo", spend: captureProposal.spend }, deterministicSanity);
    render(<CaptureDraftEditor draft={{ proposal, portions: {} }} onCommit={onCommit}
      onDismiss={noop} onSearchManually={noop} />);
    expect(screen.getByText(notice)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Exact grams of Roast chicken"), { target: { value: "73" } });
    fireEvent.click(screen.getByRole("button", { name: "Log it" }));
    expect(onCommit.mock.calls[0][0].items[0]).toMatchObject({ grams: 73, qty: 73, unit: "g", portionId: null });
  });

  it("does not describe a stated text amount as a photo estimate", () => {
    render(<CaptureDraftEditor draft={{ proposal: { ...captureProposal, method: "text" }, portions: {} }}
      onCommit={noop} onDismiss={noop} onSearchManually={noop} />);
    expect(screen.queryByText(notice)).toBeNull();
  });
});
