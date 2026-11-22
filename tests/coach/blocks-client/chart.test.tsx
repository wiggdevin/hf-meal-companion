// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import ChartBlock from "@/components/coach/blocks/chart";
import { renderBlock } from "@/components/coach/blocks";
import type { ChartBlockV1 } from "@/lib/coach/ui-blocks";

afterEach(cleanup);

const base = {
  kind: "chart", v: 1, id: "chart-1", unit: "lb", caption: "Weight this month",
} as const;

describe("chart block", () => {
  it("renders a weight sparkline with caption and the last value in its accessible name", () => {
    render(<ChartBlock block={{ ...base, chart: "weight_trend", series: [
      { label: "Forecast", points: [{ x: "2026-09-19", y: 140 }] },
      { label: "Weight", points: [{ x: "2026-09-18", y: 126.5 }, { x: "2026-09-19", y: 127 }] },
    ] }} />);

    expect(screen.getByText("Weight this month")).toBeTruthy();
    expect(screen.getAllByLabelText(/last value 127 lb/).length).toBeGreaterThan(0);
  });

  it("renders today's hydrated values through MacroRings", () => {
    render(<ChartBlock block={{ ...base, chart: "macros_today", unit: "g / kcal",
      caption: "Today's macros and calories", series: [
        { label: "Consumed", points: [
          { x: "protein", y: 80 }, { x: "carbs", y: 120 },
          { x: "kcal", y: 1300 }, { x: "fat", y: 40 },
        ] },
        { label: "Target", points: [
          { x: "protein", y: 130 }, { x: "carbs", y: 220 },
          { x: "fat", y: 65 }, { x: "kcal", y: 2100 },
        ] },
      ] }} />);

    expect(screen.getByLabelText("Calories: 1,300 of 2,100 kcal")).toBeTruthy();
    expect(screen.getByText("Today's macros and calories")).toBeTruthy();
    expect(screen.getByLabelText(/last value 1300 g \/ kcal/)).toBeTruthy();
    expect(screen.queryByText(/at most|at least/)).toBeNull();
  });

  /* t23 #6: an unknown-nutrient item leaves the day's macros_today chart a lower bound — mark it
     partial, never whole. */
  it("marks the day's macros as a lower bound when the chart is partial", () => {
    const points = { Consumed: [{ x: "protein", y: 80 }, { x: "carbs", y: 120 },
      { x: "kcal", y: 1300 }, { x: "fat", y: 40 }],
      Target: [{ x: "protein", y: 130 }, { x: "carbs", y: 220 }, { x: "fat", y: 65 }, { x: "kcal", y: 2100 }] };
    render(<ChartBlock block={{ ...base, chart: "macros_today", unit: "g / kcal",
      caption: "Today's macros and calories", partial: true,
      series: [{ label: "Consumed", points: points.Consumed }, { label: "Target", points: points.Target }] }} />);
    expect(screen.getByText(/at most/)).toBeTruthy();
  });

  it("renders a populated week: seven calorie bars and the target line", () => {
    const points = Array.from({ length: 7 }, (_, index) => ({
      x: `2026-09-${index + 10}`, y: 1500 + index * 10,
    }));
    const { container } = render(<ChartBlock block={{ ...base, chart: "kcal_week", unit: "kcal",
      caption: "Calories this week", series: [
        { label: "Target", points: points.map((point) => ({ ...point, y: 2100 })) },
        { label: "Consumed", points },
      ] }} />);

    expect(container.querySelectorAll("rect")).toHaveLength(7);
    expect(container.querySelector("path")).toBeTruthy();
    expect(screen.getAllByLabelText(/last value 1560 kcal/).length).toBeGreaterThan(0);
  });

  it("keeps every bar inside the chart at ninety calorie days", () => {
    const points = Array.from({ length: 90 }, (_, index) => ({
      x: new Date(Date.UTC(2026, 6, 1 + index)).toISOString().slice(0, 10), y: 1500,
    }));
    const { container } = render(<ChartBlock block={{ ...base, chart: "kcal_week", unit: "kcal", days: 90,
      caption: "Calories over 90 logged days", series: [
        { label: "Consumed", points }, { label: "Target", points: points.map((point) => ({ ...point, y: 2000 })) },
      ] }} />);
    const rects = [...container.querySelectorAll("rect")];
    expect(rects).toHaveLength(90);
    for (const rect of rects) {
      expect(Number(rect.getAttribute("width"))).toBeGreaterThan(0);
      expect(Number(rect.getAttribute("x")) + Number(rect.getAttribute("width"))).toBeLessThanOrEqual(280);
    }
  });

  describe("macros_trend", () => {
    const dates = ["2026-09-15", "2026-09-17", "2026-09-19"];
    const trend = (overrides: Partial<ChartBlockV1> = {}): ChartBlockV1 => ({
      ...base, chart: "macros_trend", unit: "g", days: 14,
      caption: "Protein, carbs and fat over 3 logged days in the last 14 days",
      series: [
        { label: "Protein", points: dates.map((x, i) => ({ x, y: 80 + i * 10 })) },
        { label: "Protein target", points: dates.slice(1).map((x) => ({ x, y: 120 })) },
        { label: "Carbs", points: dates.map((x) => ({ x, y: 150 })) },
        { label: "Carbs target", points: dates.slice(1).map((x) => ({ x, y: 200 })) },
        { label: "Fat", points: dates.map((x) => ({ x, y: 55 })) },
        { label: "Fat target", points: dates.slice(1).map((x) => ({ x, y: 60 })) },
      ],
      ...overrides,
    });

    it("draws one protein bar per logged day, a target rule only where a revision existed", () => {
      const { container } = render(renderBlock(trend(), {} as never));
      expect(container.querySelectorAll("[data-bar]")).toHaveLength(3);
      expect(container.querySelectorAll("[data-target]")).toHaveLength(2);
      expect(container.querySelector("[data-target='0']")).toBeNull();
      expect(screen.getByRole("figure", {
        name: /last logged day 2026-09-19: 100 g protein, 150 g carbs, 55 g fat/,
      })).toBeTruthy();
      expect(screen.getByRole("img", { name: /Protein by logged day: last logged day Sep 19 100 g of 120 g/ }))
        .toBeTruthy();
      // The figcaption, and the hidden table's caption under the chart.
      expect(screen.getAllByText("Protein, carbs and fat over 3 logged days in the last 14 days")).toHaveLength(2);
      expect(screen.getByLabelText("Sat Sep 19 · 100 g protein · target 120 g")).toBeTruthy();
    });

    it("switches the drawn macro with the chips", () => {
      render(renderBlock(trend(), {} as never));
      fireEvent.click(screen.getByRole("button", { name: "Fat" }));
      expect(screen.getByRole("button", { name: "Fat" }).getAttribute("aria-pressed")).toBe("true");
      expect(screen.getByLabelText("Sat Sep 19 · 55 g fat · target 60 g")).toBeTruthy();
    });

    it("outlines a partial day and says it is a lower bound", () => {
      const { container } = render(renderBlock(trend({ partial: true, partialDays: ["2026-09-17"] }), {} as never));
      expect(container.querySelectorAll("[data-partial]")).toHaveLength(1);
      expect(screen.getByLabelText("Thu Sep 17 · at least 90 g protein · target 120 g")).toBeTruthy();
      expect(screen.getByText(/partly measured/)).toBeTruthy();
    });

    it("draws weekly means past fourteen logged days", () => {
      const many = Array.from({ length: 30 }, (_, index) =>
        new Date(Date.UTC(2026, 7, 21 + index)).toISOString().slice(0, 10));
      const block = trend({ days: 30, series: [
        { label: "Protein", points: many.map((x) => ({ x, y: 100 })) },
        { label: "Protein target", points: many.map((x) => ({ x, y: 120 })) },
      ] });
      const { container } = render(renderBlock(block, {} as never));
      expect(container.querySelectorAll("[data-bar]")).toHaveLength(5);
      // 30 days from Aug 21: four whole weeks and a first span of two logged days.
      expect(screen.getAllByLabelText(/^Week of .* · 100 g protein a day · target 120 g · 7 of 7 days$/)).toHaveLength(4);
      expect(screen.getByLabelText("Week of Aug 16 · 100 g protein a day · target 120 g · 2 of 7 days")).toBeTruthy();
    });

    it("shows the empty state when no day was logged", () => {
      render(renderBlock(trend({ series: [] }), {} as never));
      expect(screen.getByText("No logged days yet.")).toBeTruthy();
    });
  });

  it("renders nothing for an empty series", () => {
    const block: ChartBlockV1 = { ...base, chart: "weight_trend",
      series: [{ label: "Weight", points: [] }] };
    const { container } = render(<ChartBlock block={block} />);
    expect(container.innerHTML).toBe("");
  });
});
