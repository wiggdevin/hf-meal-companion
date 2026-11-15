import { describe, expect, it } from "vitest";
import { renderReportMarkdown } from "@/scripts/eval/coach-streak-report";
import type { StreakRunConfig, StreakState } from "@/scripts/eval/coach-streak-state";
import { createEvalManifest, routeFromCoachResponse, unknownManifest } from "@/scripts/eval/capture-manifest";

describe("eval provenance", () => {
  it("does not stamp a historical coach run with the current commit or configured route", () => {
    const state: StreakState = { version: 1, seed: "seed", branch: "test", startedAt: "old",
      updatedAt: "old", status: "success", streak: 1, totalTurns: 0, turns: [], failures: [] };
    const config: StreakRunConfig = { category: null, branch: "test", streakTarget: 1,
      turnLimit: 1, statePath: "missing", reportPath: "missing", turnDir: "missing", title: "Historical" };
    const report = renderReportMarkdown(state, config, []);
    expect(report).toContain("Commit SHA: unknown");
    expect(report).toContain("Prompt hash: unknown");
    expect(report).toContain("Schema hash: unknown");
    expect(report).toContain("Catalog snapshot: unknown");
    expect(report).toContain("route unknown");
    expect(report).toContain("Configured lanes: unknown");
    expect(unknownManifest().configuredLanes).toBeNull();
    expect(unknownManifest().configuredOpenRouterPins).toBeNull();
  });

  it('keeps missing historical fallback evidence unknown while preserving the observed model', () => {
    expect(routeFromCoachResponse('old', { model: { provider: 'openrouter', modelId: 'observed-model' } }))
      .toEqual({ caseId: 'old', provider: 'openrouter', model: 'observed-model', fallbackUsed: null, source: 'response' });
    expect(routeFromCoachResponse('current', { model: { provider: 'openrouter', modelId: 'observed-model' } }, true)
      .fallbackUsed).toBe(false);
    expect(routeFromCoachResponse('fallback', { model: { provider: 'gemini', modelId: 'observed-model',
      fellBackBecause: 'capacity' } }).fallbackUsed).toBe(true);
    expect(routeFromCoachResponse('fast', { model: { provider: 'gemini', modelId: '' } }).source).toBe('unknown');
  });

  it('names the exact source fingerprints and marks a local catalog snapshot as unknown', () => {
    const manifest = createEvalManifest({ kind: 'capture', execution: 'offline_inventory',
      datasetPath: 'scripts/eval/phase-4-capture.jsonl' });
    expect(manifest.commitSha).toMatch(/^[0-9a-f]{40}$/);
    expect(manifest.promptHash).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.schemaHash).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.sourceFiles.prompt).toEqual(['lib/ai/prompts.ts']);
    expect(manifest.sourceFiles.schema).toContain('lib/ai/schemas.ts');
    expect(manifest.catalogSnapshot).toBe('unknown');
    expect(manifest.routes).toEqual([]);
  });

  it('does not infer no auxiliary model calls from a blank coach answer model', () => {
    const route = routeFromCoachResponse('photo-attachment', { model: { provider: 'gemini', modelId: '' },
      provenance: { ai: true, source: 'model', purpose: 'photoToItems' }, timings: { model: 0, ground: 0, attach: 900 } });
    expect(route.source).toBe('unknown');
    expect(route.provider).toBeNull();
  });

  it('fingerprints the per-action definitions that build coach prompts and provider fields', () => {
    const manifest = createEvalManifest({ kind: 'coach', execution: 'live',
      datasetPath: 'scripts/eval/coach-corpus.json' });
    expect(manifest.sourceFiles.prompt).toContain('lib/coach/actions/log-meal.ts');
    expect(manifest.sourceFiles.schema).toContain('lib/coach/actions/wire-fields.ts');
  });
});
