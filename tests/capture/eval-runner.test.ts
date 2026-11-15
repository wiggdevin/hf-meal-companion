import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { inventoryCases, readSet, renderReport } from "@/scripts/ai-eval";
import { scoreCases } from "@/scripts/eval/capture-score";
import { validateCaptureLiveTarget } from "@/scripts/eval/capture-live-target";

describe("capture evaluation inventory", () => {
  it.each(['http://127.0.0.1:56321', 'http://localhost:56321', 'https://abcdefghijklmnopqrst.supabase.co'])(
    'accepts an isolated synthetic test target %s without authenticating', (url) => {
      expect(() => validateCaptureLiveTarget({ SUPABASE_TEST_URL: url, SUPABASE_TEST_ANON_KEY: 'fake-anon',
        SUPABASE_TEST_SERVICE_ROLE_KEY: 'fake-admin', SEARCH_EVAL_EMAIL: 'capture@meal-companion.test',
        SEARCH_EVAL_PASSWORD: 'synthetic-only' })).not.toThrow();
    });

  it("renders a missing photo method as unmeasured with its independent counts", () => {
    const report = renderReport([scoreCases("photo", [{ method: "photo", status: "media_missing",
      expected: [], predictions: [], mediaPresent: false }])], "2026-11-14");
    expect(report).toContain("| photo | 1 | 0 | 1 | 0 | 1 | 0 | 0 | 0 |");
    expect(report).toContain("not measured");
    expect(report).toContain("route unknown");
    expect(report).toContain("Commit SHA");
    expect(report).toContain("Prompt hash");
    expect(report).toContain("Schema hash");
    expect(report).toContain("Catalog snapshot");
  });

  it("runs the real dry-run CLI offline, including old JSONL without canonical IDs", () => {
    const directory = mkdtempSync(join(tmpdir(), "capture-eval-"));
    try {
      const corpus = join(directory, "capture.jsonl");
      const out = join(directory, "report.md");
      writeFileSync(corpus, [
        { method: "text", slot: "meal-1", localDate: "2026-11-14", text: "egg",
          expect: [{ label: "egg", grams: 100 }] },
        { method: "photo", slot: "meal-1", localDate: "2026-11-14",
          media: join(directory, "missing.jpg"), expect: [] },
      ].map((item) => JSON.stringify(item)).join("\n"));
      const execution = spawnSync(process.execPath, ["--import", "tsx", "scripts/ai-eval.ts",
        "--dry-run", "--set", corpus, "--out", out], {
        cwd: process.cwd(), encoding: "utf8",
        env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "test" }, timeout: 15_000,
      });
      expect(execution.status, execution.stderr).toBe(0);
      const report = readFileSync(out, "utf8");
      expect(report).toContain("offline inventory");
      for (const method of ["text", "photo", "voice", "label"]) expect(report).toContain(`| ${method} |`);
      expect(report).toContain("| photo | 1 | 0 | 1 | 0 | 1 | 0 | 0 | 0 |");
      const manifest = JSON.parse(readFileSync(`${out}.json`, "utf8"));
      expect(manifest.execution).toBe("offline_inventory");
      expect(manifest.dataset.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(manifest.cases).toHaveLength(2);
      expect(manifest.cases[0].status).toBe("not_run");
      expect(manifest.cases[1].status).toBe("media_missing");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('rejects text with an unrelated media file instead of uploading that file', () => {
    const directory = mkdtempSync(join(tmpdir(), 'capture-input-'));
    try {
      const path = join(directory, 'cases.jsonl');
      writeFileSync(path, JSON.stringify({ method: 'text', slot: 'meal-1', localDate: '2026-11-14',
        text: '100 g egg', media: 'unrelated-private-file.png', expect: [] }));
      expect(() => readSet(path)).toThrow();
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it('keeps generated case identity stable when selecting a method', () => {
    const directory = mkdtempSync(join(tmpdir(), 'capture-id-'));
    try {
      const path = join(directory, 'cases.jsonl');
      writeFileSync(path, [{ method: 'text', text: 'egg' }, { method: 'photo', media: 'missing.png' }]
        .map((input) => JSON.stringify({ ...input, slot: 'meal-1', localDate: '2026-11-14', expect: [] })).join('\n'));
      const parsed = readSet(path);
      expect(inventoryCases(parsed)[1].id).toBe(inventoryCases(parsed.filter((line) => line.method === 'photo'))[0].id);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it.each(['', 'same'])('rejects blank or duplicate explicit case ID %s', (id) => {
    const directory = mkdtempSync(join(tmpdir(), 'capture-id-'));
    try {
      const path = join(directory, 'cases.jsonl');
      const line = { id, method: 'text', slot: 'meal-1', localDate: '2026-11-14', text: 'egg', expect: [] };
      writeFileSync(path, [line, line].map((item) => JSON.stringify(item)).join('\n'));
      expect(() => readSet(path)).toThrow();
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it.each([
    { title: 'ambient primary credentials', overrides: { SUPABASE_URL: 'https://primary.invalid',
      SUPABASE_SERVICE_ROLE_KEY: 'fake-primary' }, reason: /primary|mixed|ambient/i },
    { title: 'production project in TEST variable', overrides: {
      SUPABASE_TEST_URL: 'https://fivatgdpuenszxxnijpc.supabase.co' }, reason: /production/i },
    { title: 'arbitrary remote URL', overrides: { SUPABASE_TEST_URL: 'https://unrelated.invalid' },
      reason: /origin|supabase|loopback/i },
    { title: 'remote insecure URL', overrides: { SUPABASE_TEST_URL: 'http://abcdefghijklmnopqrst.supabase.co' },
      reason: /origin|https|loopback/i },
    { title: 'non-synthetic account', overrides: { SEARCH_EVAL_EMAIL: 'person@example.com' },
      reason: /synthetic|\.test|test account/i },
  ])('refuses $title before any authentication fetch', ({ overrides, reason }) => {
    const directory = mkdtempSync(join(tmpdir(), 'capture-target-'));
    try {
      const path = join(directory, 'cases.jsonl'); const marker = join(directory, 'fetch-attempted');
      const blocker = join(directory, 'block-fetch.mjs');
      writeFileSync(path, JSON.stringify({ method: 'text', slot: 'meal-1', localDate: '2026-11-14',
        text: '100 g egg', expect: [{ label: 'egg', grams: 100, quantitySource: 'stated_mass' }] }));
      writeFileSync(blocker, `import {writeFileSync} from 'node:fs'; globalThis.fetch=async()=>{writeFileSync(${JSON.stringify(marker)},'blocked');throw new Error('fetch forbidden in target regression');};`);
      const execution = spawnSync(process.execPath, ['--import', blocker, '--import', 'tsx',
        'scripts/ai-eval.ts', '--set', path], { cwd: process.cwd(), encoding: 'utf8', timeout: 10_000,
        env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'test',
          SUPABASE_TEST_URL: 'http://127.0.0.1:56321', SUPABASE_TEST_ANON_KEY: 'fake-anon',
          SUPABASE_TEST_SERVICE_ROLE_KEY: 'fake-admin', SEARCH_EVAL_EMAIL: 'capture@meal-companion.test',
          SEARCH_EVAL_PASSWORD: 'synthetic-only', ...overrides } });
      expect(existsSync(marker), execution.stderr).toBe(false);
      expect(execution.status).toBe(1);
      expect(execution.stderr).toMatch(reason);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
