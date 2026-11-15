/** Reproducibility metadata. Configuration is never evidence of the route that answered. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { LANES, OPENROUTER_PINS } from "@/lib/ai/lanes";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const UNKNOWN = "unknown";
export type ObservedRoute = {
  caseId: string; provider: string | null; model: string | null; fallbackUsed: boolean | null;
  source: "response" | "provider-response" | "unknown" | "not_called";
};
export type EvalManifest = {
  version: 1; execution: "offline_inventory" | "live" | "offline_replay";
  commitSha: string; dirty: boolean | null; promptHash: string; schemaHash: string;
  sourceFiles: { prompt: string[]; schema: string[] };
  hashBasis: string; dataset: { path: string; sha256: string };
  configuredLanes: typeof LANES; configuredOpenRouterPins: typeof OPENROUTER_PINS;
  catalogSnapshot: string; routes: ObservedRoute[];
};

export function sha256(contents: string | Uint8Array): string {
  return createHash("sha256").update(contents).digest("hex");
}
function fingerprint(paths: string[]): string {
  return sha256(paths.map((path) => `${path}\n${sha256(readFileSync(resolve(ROOT, path)))}`).join("\n"));
}

export function createEvalManifest(options: {
  kind: "capture" | "coach"; execution: EvalManifest["execution"]; datasetPath: string;
  routes?: ObservedRoute[]; catalogSnapshot?: string;
}): EvalManifest {
  let commitSha = UNKNOWN; let dirty: boolean | null = null;
  try {
    commitSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
    dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"],
      { cwd: ROOT, encoding: "utf8" }).trim().length > 0;
  } catch { /* outside a checkout: metadata stays explicitly unknown */ }
  const capture = options.kind === "capture";
  const sourceFiles = {
    prompt: capture ? ["lib/ai/prompts.ts"] : ["lib/coach/prompt.ts", "lib/coach/registry.ts"],
    schema: capture ? ["lib/ai/schemas.ts", "lib/ai/json-schema.ts"]
      : ["lib/coach/wire.ts", "lib/coach/actions/schemas.ts", "lib/ai/json-schema.ts"],
  };
  return {
    version: 1, execution: options.execution, commitSha, dirty,
    promptHash: fingerprint(sourceFiles.prompt), schemaHash: fingerprint(sourceFiles.schema), sourceFiles,
    hashBasis: "SHA-256 of named prompt/schema source files; not a hash of each serialized live request",
    dataset: { path: options.datasetPath, sha256: sha256(readFileSync(options.datasetPath)) },
    configuredLanes: LANES, configuredOpenRouterPins: OPENROUTER_PINS,
    catalogSnapshot: options.catalogSnapshot ?? UNKNOWN, routes: options.routes ?? [],
  };
}

export function unknownManifest(): EvalManifest {
  return { version: 1, execution: "offline_replay", commitSha: UNKNOWN, dirty: null,
    promptHash: UNKNOWN, schemaHash: UNKNOWN, hashBasis: "run metadata was not recorded",
    sourceFiles: { prompt: [], schema: [] },
    dataset: { path: UNKNOWN, sha256: UNKNOWN }, catalogSnapshot: UNKNOWN,
    configuredLanes: LANES, configuredOpenRouterPins: OPENROUTER_PINS, routes: [] };
}

const cell = (value: string) => value.replace(/\|/g, "\\|").replace(/[\r\n]/g, " ");
export function renderEvalManifest(manifest: EvalManifest = unknownManifest()): string {
  const routeRows = manifest.routes.length === 0 ? ["| — | route unknown | unknown | unknown | unknown |"]
    : manifest.routes.map((route) => `| ${cell(route.caseId)} | `
      + `${route.source === "not_called" ? "not called" : cell(route.provider ?? "route unknown")} | `
      + `${cell(route.model ?? UNKNOWN)} | ${route.fallbackUsed === null ? UNKNOWN : String(route.fallbackUsed)} | ${route.source} |`);
  return [
    `- Commit SHA: ${manifest.commitSha}`,
    `- Tracked working tree dirty: ${manifest.dirty === null ? UNKNOWN : manifest.dirty}`,
    `- Prompt hash: ${manifest.promptHash}`, `- Schema hash: ${manifest.schemaHash}`,
    `- Hash basis: ${manifest.hashBasis}`,
    `- Prompt sources: ${manifest.sourceFiles.prompt.join(", ") || UNKNOWN}`,
    `- Schema sources: ${manifest.sourceFiles.schema.join(", ") || UNKNOWN}`,
    `- Dataset: ${manifest.dataset.path} (SHA-256 ${manifest.dataset.sha256})`,
    `- Catalog snapshot: ${manifest.catalogSnapshot}`, "",
    "Configured lanes (not observed routes):", "",
    "```json", JSON.stringify({ lanes: manifest.configuredLanes, openrouter: manifest.configuredOpenRouterPins }), "```", "",
    "| Case/call | Observed provider | Observed model | Fallback used | Evidence |",
    "|---|---|---|---|---|", ...routeRows, "",
  ].join("\n");
}

/** The coach response documents the answering model and explicit fallback reason. A blank model
 * ID is its non-model sentinel; it is not evidence that Gemini was called. */
export function routeFromCoachResponse(caseId: string, response: unknown, currentContract = false): ObservedRoute {
  const model = (response as { model?: { provider?: unknown; modelId?: unknown; fellBackBecause?: unknown } } | null)?.model;
  if (model?.modelId === "") return { caseId, provider: null, model: null, fallbackUsed: null, source: "not_called" };
  if (typeof model?.modelId !== "string" || typeof model.provider !== "string") {
    return { caseId, provider: null, model: null, fallbackUsed: null, source: "unknown" };
  }
  return { caseId, provider: model.provider, model: model.modelId,
    fallbackUsed: model.fellBackBecause === "capacity" || model.fellBackBecause === "failed" ? true
      : currentContract && model.fellBackBecause === undefined ? false : null, source: "response" };
}
