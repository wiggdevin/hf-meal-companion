// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const motion = vi.hoisted(() => ({ reduce: false }));
vi.mock("motion/react", async (original) => ({
  ...await original<typeof import("motion/react")>(),
  useReducedMotion: () => motion.reduce,
}));
import HfMark from "@/components/coach/HfMark";

afterEach(() => { cleanup(); motion.reduce = false; });

/** U21 (2026-10-04): the living mark (the HF monogram) breathes at rest, speeds up while High Frequency works, and is a still
 *  emblem under reduced motion. It is decoration: the transcript's thinking line announces. */
describe("the living mark", () => {
  it("is decorative and says when High Frequency is working", () => {
    const { container, rerender } = render(<HfMark />);
    const mark = container.firstElementChild!;
    expect(mark.getAttribute("aria-hidden")).toBe("true");
    expect(mark.getAttribute("data-thinking")).toBeNull();
    expect(mark.querySelectorAll("img")).toHaveLength(1);
    rerender(<HfMark thinking />);
    expect(mark.getAttribute("data-thinking")).toBe("true");
  });

  it("holds still under reduced motion", () => {
    motion.reduce = true;
    const { container } = render(<HfMark thinking />);
    expect(container.firstElementChild!.getAttribute("data-motion")).toBe("reduced");
  });
});
