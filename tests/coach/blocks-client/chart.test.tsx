// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import ChartBlock from "@/components/coach/blocks/chart";
import { renderBlock } from "@/components/coach/blocks";
import { uiBlockSchema, type ChartBlockV1 } from "@/lib/coach/ui-blocks";
import { averageText, trendColumns, trendDays, type TrendDay } from "@/components/coach/blocks/nutrition-trend";
import { VALID_TREND } from "@/tests/fixtures/coach-chart-blocks";

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

  describe("nutrition trends", () => {
    const kcalWeek = (dates: string[], extra: Partial<ChartBlockV1> = {}): ChartBlockV1 => ({
      ...base, chart: "kcal_week", unit: "kcal", days: dates.length, start: dates[0], end: dates.at(-1),
      caption: "Calories, a test window",
      series: [
        { label: "Consumed", points: dates.map((x, i) => ({ x, y: 1500 + i * 10 })) },
        { label: "Target", points: dates.map((x) => ({ x, y: 2100 })) },
      ],
      ...extra,
    });
    const isoDays = (start: string, n: number) => Array.from({ length: n }, (_, i) =>
      new Date(Date.parse(`${start}T12:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10));
    const axis = (container: HTMLElement) =>
      [...container.querySelectorAll("svg text")].map((node) => node.textContent);

    it("renders a populated week of calories: one edged bar and target per day, weekday axis, full-date rows", () => {
      const dates = isoDays("2026-09-10", 7);
      const { container } = render(renderBlock(kcalWeek(dates), {} as never));
      const bars = [...container.querySelectorAll("[data-bar]")];
      expect(bars).toHaveLength(7);
      for (const bar of bars) expect(bar.getAttribute("class")).toMatch(/edged/);
      expect(container.querySelectorAll("[data-target]")).toHaveLength(7);
      expect(axis(container)).toEqual(["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"]);
      expect(screen.getByRole("columnheader", { name: "Day" })).toBeTruthy();
      expect(screen.getByRole("rowheader", { name: "Thu, Sep 10, 2026" })).toBeTruthy();
      // The table's caption names the series, the figure caption is the block's own.
      expect(screen.getByText("Calories: Calories, a test window")).toBeTruthy();
      expect(screen.getByText("Calories, a test window")).toBeTruthy();
      expect(screen.getByRole("figure", { name: /last logged day Sep 16: 1,560 kcal$/ })).toBeTruthy();
      expect(screen.queryByText(/Dashed bars/)).toBeNull();
    });

    it("thins a fortnight's axis from the last day and keeps the month across a boundary", () => {
      const { container } = render(renderBlock(kcalWeek(isoDays("2026-08-28", 10)), {} as never));
      expect(axis(container)).toEqual(["", "Aug 29", "", "31", "", "Sep 2", "", "4", "", "6"]);
    });

    it("buckets ninety days into weeks counted back from the end, the first one clipped", () => {
      const dates = isoDays("2026-07-01", 90);
      const { container } = render(renderBlock(kcalWeek(dates, {
        series: [
          { label: "Consumed", points: dates.map((x) => ({ x, y: 1500 })) },
          { label: "Target", points: dates.map((x) => ({ x, y: 2000 })) },
        ],
      }), {} as never));
      const bars = [...container.querySelectorAll("[data-bar]")];
      expect(bars).toHaveLength(13);
      expect(screen.getByRole("columnheader", { name: "Week" })).toBeTruthy();
      expect(screen.getByRole("rowheader", { name: "Jul 1 – Jul 6, 2026" })).toBeTruthy();
      expect(screen.getByRole("rowheader", { name: "Sep 22 – Sep 28, 2026" })).toBeTruthy();
      expect(screen.getByLabelText(
        "Week Jul 1 – Jul 6, 2026 · 1,500 kcal · target 2,000 kcal a day · 6 measured of 6 logged · 6 of 7 days",
      )).toBeTruthy();
      expect(screen.getByRole("group", { name: "Choose a week" })).toBeTruthy();
    });

    it("draws a week's target only when every measured day in it has one", () => {
      const dates = isoDays("2026-09-01", 20);
      const { container } = render(renderBlock(kcalWeek(dates, {
        series: [
          { label: "Consumed", points: dates.map((x) => ({ x, y: x === "2026-09-09" ? null : 1500 })) },
          // No target on Sep 3 (first week), and none on Sep 9, which measured nothing.
          { label: "Target", points: dates.filter((x) => x !== "2026-09-03" && x !== "2026-09-09")
            .map((x) => ({ x, y: 2000 })) },
        ],
      }), {} as never));
      expect(container.querySelectorAll("[data-bar]")).toHaveLength(3);
      expect([...container.querySelectorAll("[data-target]")].map((line) => line.getAttribute("data-target")))
        .toEqual(["1", "2"]);
    });

    it("floors an 'at least' value and rounds a measured one", () => {
      const days: TrendDay[] = [
        { date: "2026-09-17", value: 89.7, target: 120, partial: true },
        { date: "2026-09-18", value: 89.7, target: 120, partial: false },
      ];
      const { cols } = trendColumns(days, "protein", { start: "2026-09-17", end: "2026-09-18" });
      expect(cols.map((col) => col.describe)).toEqual([
        "Thu Sep 17 · at least 89 g protein · target 120 g",
        "Fri Sep 18 · 90 g protein · target 120 g",
      ]);
    });

    it("names the average's sample and count", () => {
      const day = (date: string, value: number | null, partial = false): TrendDay =>
        ({ date, value, target: 120, partial });
      expect(averageText([day("2026-09-16", 80), day("2026-09-17", 100), day("2026-09-18", 40, true),
        day("2026-09-19", null)], "protein")).toBe("Average 90 g protein a day over 2 days fully measured");
      expect(averageText([day("2026-09-18", 40.9, true), day("2026-09-19", 50.9, true)], "protein"))
        .toBe("At least 45 g protein a day over 2 days logged");
      expect(averageText([day("2026-09-19", null)], "fat")).toBe("No measured fat in these days.");
    });

    it("steps through the days with the previous and next buttons", () => {
      render(renderBlock(kcalWeek(isoDays("2026-09-10", 3)), {} as never));
      const next = screen.getByRole("button", { name: "Next day" });
      const previous = screen.getByRole("button", { name: "Previous day" });
      expect(next.getAttribute("class")).toMatch(/min-h-11/);
      expect(next.getAttribute("class")).toMatch(/min-w-11/);
      fireEvent.click(next);
      expect(screen.getByText("Thu Sep 10 · 1,500 kcal · target 2,100 kcal", { selector: "p" })).toBeTruthy();
      expect((previous as HTMLButtonElement).disabled).toBe(true);
      fireEvent.click(next);
      expect(screen.getByText("Fri Sep 11 · 1,510 kcal · target 2,100 kcal", { selector: "p" })).toBeTruthy();
    });

    it("replays a stored block: it validates, and a day nothing measured is blank, not 0", () => {
      const block = uiBlockSchema.parse(VALID_TREND) as ChartBlockV1;
      const { container } = render(renderBlock(block, {} as never));
      expect(container.querySelectorAll("[data-bar]")).toHaveLength(1);
      expect(screen.getByLabelText("Fri Sep 18 · protein not measured")).toBeTruthy();
      expect(screen.getByLabelText("Sat Sep 19 · 91 g protein · target 135 g")).toBeTruthy();
      expect(trendDays(block, "protein").map((day) => day.value)).toEqual([null, 90.5]);
    });
  });

  describe("macros_trend", () => {
    const dates = ["2026-09-15", "2026-09-17", "2026-09-19"];
    const trend = (overrides: Partial<ChartBlockV1> = {}): ChartBlockV1 => ({
      ...base, chart: "macros_trend", unit: "g", days: 14, start: "2026-09-06", end: "2026-09-19",
      caption: "Protein, carbs and fat, Sep 6 – Sep 19, 2026 (3 logged days)",
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
        name: /last logged day Sep 19: 100 g protein, 150 g carbs, 55 g fat$/,
      })).toBeTruthy();
      expect(screen.getByRole("img", {
        name: "Protein by logged day: last logged day Sep 19 · 100 g protein · target 120 g.",
      })).toBeTruthy();
      expect(screen.getByText("Protein: Protein, carbs and fat, Sep 6 – Sep 19, 2026 (3 logged days)"))
        .toBeTruthy();
      expect(screen.getByLabelText("Sat Sep 19 · 100 g protein · target 120 g")).toBeTruthy();
      expect(screen.getByText("Average 90 g protein a day over 3 days fully measured")).toBeTruthy();
    });

    it("switches the drawn macro with the chips", () => {
      render(renderBlock(trend(), {} as never));
      fireEvent.click(screen.getByRole("button", { name: "Fat" }));
      expect(screen.getByRole("button", { name: "Fat" }).getAttribute("aria-pressed")).toBe("true");
      expect(screen.getByLabelText("Sat Sep 19 · 55 g fat · target 60 g")).toBeTruthy();
    });

    it("opens on the macro the request named", () => {
      render(renderBlock(trend({ focus: "carbs" }), {} as never));
      expect(screen.getByRole("button", { name: "Carbs" }).getAttribute("aria-pressed")).toBe("true");
      expect(screen.getByLabelText("Sat Sep 19 · 150 g carbs · target 200 g")).toBeTruthy();
    });

    it("outlines a partial day, says it is a lower bound, and shows the legend", () => {
      const { container } = render(renderBlock(trend({ partial: true, series: [
        { label: "Protein", points: [{ x: "2026-09-15", y: 80 }, { x: "2026-09-17", y: 90.8, partial: true },
          { x: "2026-09-19", y: 100 }] },
        { label: "Protein target", points: dates.slice(1).map((x) => ({ x, y: 120 })) },
      ] }), {} as never));
      expect(container.querySelectorAll("[data-partial]")).toHaveLength(1);
      expect(screen.getByLabelText("Thu Sep 17 · at least 90 g protein · target 120 g")).toBeTruthy();
      expect(screen.getByText(/partly measured/)).toBeTruthy();
    });

    it("hides the legend when only another macro has a partial day", () => {
      render(renderBlock(trend({ partial: true, series: [
        ...trend().series.filter((row) => row.label !== "Fat"),
        { label: "Fat", points: dates.map((x) => ({ x, y: 55, partial: true as const })) },
      ] }), {} as never));
      expect(screen.queryByText(/Dashed bars/)).toBeNull();
    });

    it("draws weekly means past fourteen logged days", () => {
      const many = Array.from({ length: 30 }, (_, index) =>
        new Date(Date.UTC(2026, 7, 21 + index)).toISOString().slice(0, 10));
      const block = trend({ days: 30, start: "2026-08-21", end: "2026-09-19", series: [
        { label: "Protein", points: many.map((x) => ({ x, y: 100 })) },
        { label: "Protein target", points: many.map((x) => ({ x, y: 120 })) },
      ] });
      const { container } = render(renderBlock(block, {} as never));
      expect(container.querySelectorAll("[data-bar]")).toHaveLength(5);
      expect(screen.getAllByLabelText(/^Week .* · 100 g protein · target 120 g a day · 7 measured of 7 logged · 7 of 7 days$/))
        .toHaveLength(4);
      expect(screen.getByLabelText(
        "Week Aug 21 – Aug 22, 2026 · 100 g protein · target 120 g a day · 2 measured of 2 logged · 2 of 7 days",
      )).toBeTruthy();
    });

    it("keeps the macro chips with the empty state when no day was logged", () => {
      render(renderBlock(trend({ series: [] }), {} as never));
      expect(screen.getByText("No logged days for protein yet.")).toBeTruthy();
      expect(screen.getByRole("group", { name: "Macro" })).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Fat" }));
      expect(screen.getByText("No logged days for fat yet.")).toBeTruthy();
    });
  });

  it("renders nothing for an empty series", () => {
    const block: ChartBlockV1 = { ...base, chart: "weight_trend",
      series: [{ label: "Weight", points: [] }] };
    const { container } = render(<ChartBlock block={block} />);
    expect(container.innerHTML).toBe("");
  });
});
