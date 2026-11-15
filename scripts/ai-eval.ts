/** Capture evaluation. --dry-run is an offline inventory and makes no database/provider calls.
 * Live runs bill existing provider keys and require an explicit branch SUPABASE_TEST_* target:
 * pnpm exec tsx --conditions=react-server scripts/ai-eval.ts [--set PATH] [--method text]
 * pnpm exec tsx scripts/ai-eval.ts --dry-run [--out PATH]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { CaptureMethod } from "@/lib/capture/flags";
import type { ProposeResponse } from "@/lib/capture/types";
import { scoreCases, type CaptureCase, type CaptureMethodScore, type CapturePrediction,
  type MethodScore } from "./eval/capture-score";
import { createEvalManifest, renderEvalManifest, sha256, type EvalManifest,
  type ObservedRoute } from "./eval/capture-manifest";
import { validateCaptureLiveTarget } from "./eval/capture-live-target";
export { scoreMethod } from "./eval/capture-score";
export type { EvalResult, MethodScore } from "./eval/capture-score";

const METHODS: CaptureMethod[] = ["text", "voice", "label", "photo"];
const SET_PATH = "scripts/eval/phase-4-capture.jsonl";
const lineSchema = z.object({
  id: z.string().trim().min(1).optional(), method: z.enum(["text", "voice", "label", "photo"]),
  slot: z.string(), localDate: z.string(), tz: z.string().optional(),
  text: z.string().optional(), media: z.string().optional(),
  expect: z.array(z.object({ label: z.string().min(1), grams: z.number().nonnegative().nullable(),
    ids: z.array(z.string().regex(/^[^:]+:.+$/)).min(1).optional(),
    aliases: z.array(z.string().trim().min(1)).min(1).optional(),
    quantitySource: z.enum(["stated_mass", "weighed", "printed_label", "reference_portion", "unknown"]).optional(),
  })),
}).refine((line) => line.method === "text" ? Boolean(line.text) && line.media === undefined
  : Boolean(line.media) && line.text === undefined,
  "text captures need only text; other methods need only a local media fixture");
export type EvalLine = z.infer<typeof lineSchema>;

export function readSet(path = SET_PATH): EvalLine[] {
  const lines = readFileSync(path, "utf8").split(/\r?\n/).filter((line) => line.trim())
    .map((line, index) => {
      const parsed = lineSchema.safeParse(JSON.parse(line));
      if (!parsed.success) throw new Error(`${path}:${index + 1}: ${parsed.error.message}`);
      return { ...parsed.data, id: parsed.data.id ?? `${parsed.data.method}-${index + 1}` };
    });
  if (new Set(lines.map((line) => line.id)).size !== lines.length) throw new Error(`${path}: duplicate case IDs`);
  return lines;
}

export function inventoryCases(lines: EvalLine[]): CaptureCase[] {
  return lines.map((line, index) => ({
    id: line.id ?? `${line.method}-${index + 1}`, method: line.method,
    expected: line.expect, predictions: [],
    status: line.media && !existsSync(line.media) ? "media_missing" : "not_run",
    ...(line.media ? { mediaPresent: existsSync(line.media) } : {}),
  }));
}

const pct = (value: number | null) => value === null ? "not measured" : `${(value * 100).toFixed(1)} %`;
const amount = (value: number | null, suffix = " g") => value === null ? "not measured" : `${value.toFixed(1)}${suffix}`;
export function renderReport(scores: MethodScore[], at: string, manifest?: EvalManifest): string {
  const lines = [`# Capture eval — ${at}`, "",
    manifest?.execution === "offline_inventory" ? "Mode: offline inventory; no database or model calls."
      : "Identity and quantity are separate measurements. Missing evidence is not a zero error.", "",
    renderEvalManifest(manifest), "",
    "| Method | lines | labelled | unlabelled | media present | media missing | not run | confirmed provider failures | scored cases | unavailable service (unattributed) |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const score of scores) {
    const full = score as Partial<CaptureMethodScore>;
    const c = full.cases;
    lines.push(`| ${score.method} | ${c?.total ?? "unknown"} | ${c?.labelled ?? "unknown"} | ${c?.unlabelled ?? "unknown"} | ${c?.mediaPresent ?? "unknown"} | ${c?.mediaMissing ?? "unknown"} | ${c?.notRun ?? "unknown"} | ${c?.providerFailure ?? "unknown"} | ${c?.scored ?? "unknown"} | ${c?.serviceUnavailable ?? "unknown"} |`);
  }
  lines.push("", "Gold includes skipped cases; evaluated gold is the identity denominator. Provider/setup failures retain their gold misses.",
    "Unmatched predictions fill misidentified gold slots first; remaining predictions are extras and remaining gold is missing.", "",
    "| Method | all gold | evaluated gold | correct | misidentified | missing | extras | extras/case | failed items | failed cases | parsed identity accuracy | canonical matches | label-only matches |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  );
  for (const score of scores) {
    const s = score as Partial<CaptureMethodScore>;
    lines.push(`| ${score.method} | ${s.goldItems ?? "unknown"} | ${score.n} | ${s.correct ?? "unknown"} | ${s.misidentified ?? "unknown"} | ${s.missing ?? "unknown"} | ${s.extra ?? "unknown"} | ${s.extraPerCase == null ? "not measured" : s.extraPerCase.toFixed(2)} | ${score.failed} | ${s.taskFailureCases ?? "unknown"} | ${pct(score.itemAccuracy)} | ${s.canonicalMatches ?? "unknown"} | ${s.labelOnlyMatches ?? "unknown"} |`);
  }
  lines.push("", "QTY requires unambiguous identity pairing and stated_mass, weighed or printed_label gold. Reference portions alone and legacy gram guesses remain unscored.",
    "Percentiles use linear interpolation. These descriptive values have no confidence intervals or accuracy gate.", "",
    "Catalog grounding and top-3 require complete canonical gold/observable automatic IDs; extraction labels cannot certify an automatic catalog choice.",
    "| Method | QTY n | QTY unscored | ambiguous identities | gram MAE | median abs | P90 abs | median % error | P90 % error | canonical auto precision | auto coverage/gold | top-3 containment | top-3 n | canonical incomplete cases |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|",
  );
  for (const score of scores) {
    const s = score as Partial<CaptureMethodScore>;
    const auto = score.autoResolvePrecision === null ? `${score.autoResolved} auto-resolved of ${score.n}; precision not measured`
      : `${pct(score.autoResolvePrecision)} over ${score.autoResolveMeasured} canonically measured auto-resolved (${score.autoResolved} observed)`;
    lines.push(`| ${score.method} | ${s.quantityN ?? "unknown"} | ${s.quantityUnscored ?? "unknown"} | ${s.quantityAmbiguous ?? "unknown"} | ${amount(score.gramMae)} | ${amount(s.quantityMedianAbs ?? null)} | ${amount(s.quantityP90Abs ?? null)} | ${amount(s.quantityMedianPercent ?? null, " %")} | ${amount(s.quantityP90Percent ?? null, " %")} | ${auto} | ${pct(s.autoResolveCoverage ?? null)} (${score.autoResolveGold} canonical gold) | top-3 containment ${pct(score.top3Containment)} | ${score.top3N} | ${s.canonicalIncomplete ?? "unknown"} |`);
  }
  lines.push("", "Error codes by method (unattributed service errors do not prove provider failure):", "",
    "| Method | Error code | Cases |", "|---|---|---:|");
  for (const score of scores) for (const [code, count] of Object.entries((score as Partial<CaptureMethodScore>).errorCodes ?? {})) {
    lines.push(`| ${score.method} | ${code} | ${count} |`);
  }
  return `${lines.join("\n")}\n`;
}

/** Resolve only the supplied draft references. RLS client, never a time-window identity guess. */
async function predictionItems(client: SupabaseClient, draft: ProposeResponse): Promise<CapturePrediction[]> {
  const refs = [...new Set(draft.items.flatMap((item) =>
    [item.foodRefId, ...item.alternatives.map((alternative) => alternative.foodRefId)]).filter((id): id is string => Boolean(id)))];
  const canonicalByRef = new Map<string, string[]>();
  if (refs.length > 0) {
    const resolved = await client.from("food_refs").select("id,catalog_food_id").in("id", refs);
    if (resolved.error) throw new Error("could not read draft food references");
    const rows = resolved.data ?? [];
    const catalogIds = [...new Set(rows.map((row) => row.catalog_food_id).filter((id) => id !== null))];
    if (catalogIds.length > 0) {
      const catalog = await client.from("catalog_foods").select("id,source,source_id").in("id", catalogIds);
      if (catalog.error) throw new Error("could not read draft canonical catalog identities");
      const byCatalog = new Map((catalog.data ?? []).map((row) => [row.id, `${row.source}:${row.source_id}`]));
      for (const row of rows) {
        const id = byCatalog.get(row.catalog_food_id);
        if (id) canonicalByRef.set(row.id, [id]);
      }
    }
  }
  return draft.items.map((item) => ({ label: item.label, grams: item.grams,
    ids: item.foodRefId ? canonicalByRef.get(item.foodRefId) : undefined,
    autoResolved: item.autoResolved,
    alternatives: item.alternatives.map((alternative) => ({ label: alternative.label, grams: null,
      ids: canonicalByRef.get(alternative.foodRefId) })),
  }));
}

const MIME: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
  ".m4a": "audio/mp4", ".aac": "audio/aac", ".mp3": "audio/mpeg", ".wav": "audio/wav" };
export async function runLine(client: SupabaseClient, admin: SupabaseClient, userId: string,
  line: EvalLine, inventory: CaptureCase): Promise<CaptureCase> {
  if (inventory.status === "media_missing") return inventory;
  const { proposeDraft } = await import("@/lib/server/capture");
  const { signUpload, deleteMedia } = await import("@/lib/server/media");
  const { validateAudio, validateImage } = await import("@/lib/media/validate");
  const { putSignedUpload } = await import("@/lib/capture/upload");
  let mediaPath: string | null = null;
  let captureInvoked = false;
  let stage: "setup_failure" | "capture_failure" | "evaluation_failure" = "setup_failure";
  let result: CaptureCase;
  try {
    if (line.media) {
      const bytes = readFileSync(line.media); const contentType = MIME[extname(line.media).toLowerCase()];
      const validation = line.method === "voice" ? validateAudio(bytes, contentType) : validateImage(bytes, contentType);
      if (!validation.ok) throw new Error(`fixture validation failed: ${validation.reason}`);
      const signed = await signUpload(admin, userId, {
        kind: line.method === "voice" ? "audio" : "image", contentType, bytes: bytes.length,
      });
      mediaPath = signed.path;
      const status = await putSignedUpload(signed.uploadUrl, new Blob([bytes], { type: contentType }), fetch);
      if (status !== null) throw new Error(`fixture upload failed (${status})`);
    }
    stage = "capture_failure";
    const context = { localDate: line.localDate, tz: line.tz ?? "UTC", slot: line.slot };
    captureInvoked = true;
    const draft = await proposeDraft(client, admin, userId, line.method === "text"
      ? { ...context, method: "text", text: line.text! }
      : { ...context, method: line.method, mediaPath: mediaPath! });
    stage = "evaluation_failure";
    result = { ...inventory, captureInvoked, status: line.expect.length === 0 ? "unlabelled" : "scored",
      predictions: await predictionItems(client, draft) };
  } catch (error) {
    // Do not log provider bodies, signed URLs or credentials. Status alone is reproducible here.
    const code = (error as { code?: unknown } | null)?.code;
    const errorCode = typeof code === "string" && /^[a-z0-9_]{1,64}$/.test(code) ? code : "unknown";
    result = { ...inventory, captureInvoked, errorCode,
      status: stage === "capture_failure" && errorCode === "provider_unavailable" ? "service_unavailable" : stage,
      error: error instanceof Error ? error.name : "UnknownError" };
  }
  if (mediaPath !== null) {
    try { await deleteMedia(admin, mediaPath); }
    catch { result.cleanupError = "temporary fixture cleanup failed; test bucket sweep must retry"; }
  }
  return result;
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${name} needs a value`);
  return value;
}
async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  if (!dryRun) validateCaptureLiveTarget(process.env);
  const setPath = option("--set") ?? SET_PATH;
  const only = option("--method");
  if (only && !METHODS.includes(only as CaptureMethod)) throw new Error("unknown --method");
  const lines = readSet(setPath).filter((line) => !only || line.method === only);
  let cases = inventoryCases(lines);
  const manifest = createEvalManifest({ kind: "capture", execution: dryRun ? "offline_inventory" : "live",
    datasetPath: setPath });
  if (!dryRun && cases.some((item) => item.status !== "media_missing")) {
    const { createClient } = await import("@supabase/supabase-js");
    const { adminClientForCli } = await import("@/lib/server/admin");
    const client = createClient(process.env.SUPABASE_TEST_URL!, process.env.SUPABASE_TEST_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } });
    const signed = await client.auth.signInWithPassword({ email: process.env.SEARCH_EVAL_EMAIL!,
      password: process.env.SEARCH_EVAL_PASSWORD! });
    if (signed.error || !signed.data.user) throw new Error("test-account sign-in failed");
    const admin = adminClientForCli();
    const executed: CaptureCase[] = [];
    for (const [index, line] of lines.entries()) executed.push(await runLine(client, admin, signed.data.user.id, line, cases[index]));
    cases = executed;
  }
  manifest.routes = cases.map((item): ObservedRoute => ({ caseId: item.id!, provider: null, model: null,
    fallbackUsed: null, source: item.captureInvoked === true ? "unknown" : "not_called" }));
  const scores = METHODS.map((method) => scoreCases(method, cases));
  const at = new Date().toISOString();
  let report = renderReport(scores, at, manifest);
  const setupFailures = cases.filter((item) => item.status === "setup_failure").length;
  report += `\nMethod scope: ${only ?? "all four methods"}.\n`;
  report += `\nSetup failures (separate from provider failures): ${setupFailures}.\n`;
  report += `Capture refusals/errors (not attributed to provider failure): ${cases.filter((item) => item.status === "capture_failure").length}.\n`;
  report += `Post-draft evaluation failures: ${cases.filter((item) => item.status === "evaluation_failure").length}.\n`;
  report += `Temporary-media cleanup failures: ${cases.filter((item) => item.cleanupError).length}.\n`;
  console.log(report);
  const out = option("--out") ?? (dryRun ? undefined : `docs/evals/${at.slice(0, 10)}-capture-${at.slice(11, 19).replaceAll(":", "")}.md`);
  if (out) {
    mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, report);
    writeFileSync(`${out}.json`, `${JSON.stringify({ ...manifest, at, methodFilter: only ?? null, scores,
      cases: cases.map((item, index) => ({ ...item, mediaSha256: lines[index].media && item.mediaPresent
        ? sha256(readFileSync(lines[index].media!)) : null })) }, null, 2)}\n`);
  }
}
if (process.argv[1]?.endsWith("ai-eval.ts")) {
  main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : "evaluation failed"); process.exitCode = 1; });
}
