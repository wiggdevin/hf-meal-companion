import { describe, expect, it } from "vitest";
import { buildScenario, intakeErrorScenarios, replayScenario, START_DATE, toScenarioDay }
  from "@/lib/expenditure.fixtures";

describe("intake-error fixtures keep eaten energy separate from recorded energy", () => {
  it("a logging bias changes recorded intake without creating tissue loss", () => {
    const scenario = buildScenario({ label: "biased log", seed: 3001, days: 3,
      noiseKg: 0, noiseKcal: 0, tdee: () => 2130, intake: () => 2130,
      loggedIntake: (_day, eaten) => eaten * 0.85 });
    expect(scenario.intake.map((day) => day.kcal)).toEqual([1811, 1811, 1811]);
    expect(scenario.weighIns.map((day) => day.kg)).toEqual([57.6, 57.6, 57.6]);
  });

  it("an incomplete log can carry an explicit (possibly false) complete mark", () => {
    const scenario = buildScenario({ label: "false mark", seed: 3002, days: 1,
      noiseKg: 0, noiseKcal: 0, tdee: () => 2130, intake: () => 2130,
      loggedIntake: () => 1600, energyCoverage: () => 0.75,
      userMarkedComplete: () => true });
    expect(scenario.intake).toEqual([{ date: "2026-06-01", kcal: 1600,
      energyCoverage: 0.75, userMarkedComplete: true }]);
    expect(scenario.weighIns[0].kg).toBe(57.6);
  });
});

// Known synthetic truth: 2,130 kcal eaten and expended daily; no weight noise or fluid cycle.
// A log-only change must not be mistaken for a true physiological change in this experiment.
// With a flat scale and a fully faded seed, observed TDEE is mean(logged kcal), rounded to 10.
const scenarios = intakeErrorScenarios();
const runs = Object.fromEntries(Object.entries(scenarios).map(([key, scenario]) =>
  [key, replayScenario(scenario, { marksStartedOn: key === "falseComplete"
    || key === "incompleteControl" ? START_DATE : null })])) as
  Record<keyof typeof scenarios, ReturnType<typeof replayScenario>>;
const mature = (key: keyof typeof scenarios) =>
  runs[key].filter((run) => toScenarioDay(run.date) >= 42);
const on = (key: keyof typeof scenarios, day: number) => {
  const run = runs[key].find((run) => toScenarioDay(run.date) === day);
  if (!run) throw new Error(`missing replay day ${day}`);
  return run.result;
};

describe("offline intake-error propagation — numerical limits, not clinical validation", () => {
  it("all five probes leave true tissue unchanged and reproduce without unseeded noise", () => {
    expect(intakeErrorScenarios()).toEqual(scenarios);
    for (const scenario of Object.values(scenarios)) {
      expect(scenario.weighIns).toHaveLength(120);
      expect(scenario.weighIns.every((reading) => reading.kg === 57.6)).toBe(true);
    }
    expect(new Set(scenarios.randomError.intake.map((day) => day.kcal)).size).toBeGreaterThan(1);
    expect(mature("control").length).toBe(79);
    expect(mature("control").every((run) => run.result.tdeeKcal === 2130
      && run.result.proposalEligible)).toBe(true);
  });

  it("constant −15 % bias becomes a −320 kcal learned bias and does not block proposals", () => {
    expect(scenarios.constantBias.intake.every((day) => day.kcal === 1811)).toBe(true);
    // round(2130 × .85) = 1811 in the recorded log; nearest-10 display is 1810.
    for (const { result } of mature("constantBias")) {
      expect(result.tdeeKcal).toBe(1810);
      expect(result.tdeeKcal! - 2130).toBe(-320);
      expect(result.proposalEligible).toBe(true);
      expect(result.reviewFlag).toBeNull();
    }
    expect(runs.constantBias.filter((run) => toScenarioDay(run.date) < 39)
      .every((run) => !run.result.proposalEligible)).toBe(true);
  });

  it("a day-45 method switch creates a false −320 kcal step; its transient disagreement blocks day 59", () => {
    expect(scenarios.methodSwitch.intake.slice(0, 45).every((day) => day.kcal === 2130)).toBe(true);
    expect(scenarios.methodSwitch.intake.slice(45).every((day) => day.kcal === 1811)).toBe(true);
    expect(on("methodSwitch", 45).tdeeKcal).toBe(2130);
    for (const { date, result } of mature("methodSwitch")) {
      expect(result.tdeeKcal).not.toBeNull();
      expect(result.tdeeKcal! - 2130).toBeGreaterThanOrEqual(-320);
      expect(result.tdeeKcal! - 2130).toBeLessThanOrEqual(0);
      // Day 59: 14 biased vs 14 clean days in the long window. Short-long difference
      // 159.5 exceeds 8% × 1970.5 = 157.64; all other mature nights agree.
      expect(result.proposalEligible).toBe(toScenarioDay(date) !== 59);
    }
    expect(on("methodSwitch", 59).reason).toContain("disagree");
    for (const { result } of runs.methodSwitch.filter((run) => toScenarioDay(run.date) >= 73)) {
      expect(result.tdeeKcal).toBe(1810);
      expect(result.proposalEligible).toBe(true);
    }
  });

  it("seeded ±120 kcal random error stays within its input envelope plus 5 kcal rounding", () => {
    expect(scenarios.randomError.intake.every((day) => Math.abs(day.kcal - 2130) <= 120)).toBe(true);
    for (const { date, result } of mature("randomError")) {
      const day = toScenarioDay(date);
      const loggedMean = scenarios.randomError.intake.slice(day - 28, day)
        .reduce((sum, row) => sum + row.kcal, 0) / 28;
      expect(result.tdeeKcal).not.toBeNull();
      expect(Math.abs(result.tdeeKcal! - 2130)).toBeLessThanOrEqual(125);
      expect(Math.abs(result.tdeeKcal! - loggedMean)).toBeLessThanOrEqual(5);
      // Adjacent 14-day means in ±120 differ by at most 240; short-minus-long is
      // half that (≤120), below the ≥150 agreement floor. The range also stays ≤200.
      expect(result.proposalEligible).toBe(true);
    }
  });

  it("omitting 120 kcal of daily cooking fat becomes a −120 kcal eligible estimate", () => {
    expect(scenarios.omittedFat.intake.every((day) => day.kcal === 2010)).toBe(true);
    for (const { result } of mature("omittedFat")) {
      expect(result.tdeeKcal).toBe(2010);
      expect(result.proposalEligible).toBe(true);
    }
  });

  it("false completeness admits a 600 kcal omission on 20 % of days and biases mature TDEE by 110–130 kcal", () => {
    expect(scenarios.falseComplete.intake.filter((day) => day.kcal === 1530)).toHaveLength(24);
    expect(scenarios.falseComplete.intake.every((day) => day.userMarkedComplete)).toBe(true);
    for (const { date, result } of mature("falseComplete")) {
      // Any 28-day window has 5 or 6 false marks: 600 × {5,6}/28 = 107.14–128.57
      // kcal/day of missing intake, rounded to 110 or 130 kcal at the point estimate.
      expect(result.qualifiedDays).toBe(28);
      expect(result.tdeeKcal).not.toBeNull();
      expect(result.tdeeKcal! - 2130).toBeGreaterThanOrEqual(-130);
      expect(result.tdeeKcal! - 2130).toBeLessThanOrEqual(-110);
      expect(result.proposalEligible).toBe(true);
      const honest = on("incompleteControl", toScenarioDay(date));
      expect([22, 23]).toContain(honest.qualifiedDays);
      expect(honest.tdeeKcal).toBe(2130);
      expect(honest.proposalEligible).toBe(true);
    }
  });
});
