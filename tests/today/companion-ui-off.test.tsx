// @vitest-environment jsdom
// The companion is off the UI (owner, 2026-11-17): the Overview slot draws nothing even when the
// account shows it. Its wiring stays; lib/today/companion-ui.ts turns it back on.
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import CompanionSlot from "@/components/today/overview/CompanionSlot";
import type { OverviewData } from "@/components/today/overview/types";
import { COMPANION_UI_ENABLED } from "@/lib/today/companion-ui";

vi.mock("@/lib/today/companion-visibility", () => ({
  useCompanionShown: () => true,
  setCompanionShown: vi.fn(),
}));

describe("companion off the UI", () => {
  it("is switched off", () => expect(COMPANION_UI_ENABLED).toBe(false));
  it("draws no companion card on Overview", () => {
    const { container } = render(<CompanionSlot data={{} as OverviewData} active />);
    expect(container.querySelector("[data-mascot], button")).toBeNull();
  });
});
