# Capture evaluation

The evaluator inventories capture inputs and scores labelled draft outputs. The current work has offline tests and fixture inventories. It has no new live capture accuracy result.

## CLI

Run from the repository root with its pinned runtime. This command reads the public smoke corpus and local media without signing in, uploading, querying a database or calling a model:

```sh
mise exec -- pnpm exec tsx scripts/ai-eval.ts --dry-run --set scripts/eval/public-capture/cases.jsonl
```

| Option | Behavior |
|---|---|
| `--dry-run` | Inventory only. Present inputs stay `not_run`; missing files become `media_missing`. Accuracy and quantity remain unmeasured. |
| `--set PATH` | Read a JSONL corpus. Default: `scripts/eval/phase-4-capture.jsonl`, the historical corpus with private fixture references. Resolve media paths from the repository root. |
| `--method text` | Select `text`, `voice`, `label` or `photo`. All four method rows remain visible; unselected methods have zero cases in this scope. |
| `--out PATH` | Write Markdown to `PATH` and a machine-readable receipt to `PATH.json`. Without it, dry-run prints only; a live run writes a timestamped report under `docs/evals/`. |

A live command uses the server module condition and existing provider access. It can spend provider credits and write temporary media and AI-call records to the test target. It does not confirm a draft or commit a meal:

```sh
mise exec -- pnpm exec tsx --conditions=react-server scripts/ai-eval.ts --set scripts/eval/public-capture/cases.jsonl
```

The live command above is an operator entry point; this work did not run it. Before a live run:

- Supply `SUPABASE_TEST_URL`, `SUPABASE_TEST_ANON_KEY` and `SUPABASE_TEST_SERVICE_ROLE_KEY` for the intended branch or local test database. The runner has no production credential fallback.
- Supply `SEARCH_EVAL_EMAIL` and `SEARCH_EVAL_PASSWORD` for an existing synthetic test account. The runner signs in that account; it does not create or seed one. The test target needs the app schema, catalog data and account rules required by the cases. See [the branch script](../../scripts/db-branch.sh).
- Configure the capture methods and provider clearance required by [the capture route](../../lib/server/capture.ts): `CAPTURE_METHODS`, `GEMINI_API_KEY`, `HEALTH_CONTEXT_PROVIDER=gemini` and `GEMINI_BILLING_ATTESTED=1`. Optional OpenRouter routing requires `OPENROUTER_API_KEY` and `OPENROUTER_ATTESTED=1`. Existing spend limits, duplicate checks and provider fallback rules still apply.
- Use media cleared for the configured providers. A corpus being readable locally does not establish upload permission for private files.

For media, the runner validates the local bytes, calls `signUpload`, uploads through the bounded `putSignedUpload`, and passes the resulting owned storage path to `proposeDraft`. It then calls `deleteMedia` after success or failure. The receipt records cleanup failures for the test bucket sweep to retry. Setup failures, provider failures and capture refusals/errors have separate counts. Missing fixture files cause no capture call. A line's `tz` controls its request; omission uses `UTC`.

## Gold and denominators

Each JSONL line has `method`, `slot`, `localDate`, and `expect`. Text cases need `text`; other methods need a local `media` path. `id` and `tz` are optional. Each expected item has a nonempty `label`, numeric or null `grams`, optional accepted `ids`, and optional `quantitySource`.

- `ids` is an adjudicated array of accepted `source:source_id` identities. With IDs present, a different or unavailable grounded ID is a miss, even when the labels match. The live runner resolves only the draft's supplied references through the signed-in client's catalog reads.
- Without IDs, the fallback compares normalized whole-word phrases and a small plural normalization. It rejects the coconut/almond/oat milk, sweet potato and rice cake collisions. This weaker tier has its own match count; it does not establish catalog or preparation-state correctness.
- `quantitySource` accepts `stated_mass`, `weighed`, `printed_label`, `reference_portion` or `unknown`. Old lines without this marker still parse, but their numeric grams do not become measured quantity gold.

The scorer assigns predictions one to one, independent of draft order. Canonical matches take priority over label-only matches. After identity matching, unmatched predictions fill misidentified gold slots; remaining predictions are extras and remaining gold items are missing. This is an accounting rule, not evidence of which wrong prediction meant which food.

| Measurement | Denominator and limits |
|---|---|
| Case inventory | Every case in the selected method scope. Labelled/unlabelled and media-present/missing counts are independent. All four modalities appear. |
| Identity accuracy | Correctly matched items divided by evaluated gold items. Labelled provider/setup/capture failures retain every gold miss. Missing media, cases never run and unlabelled cases stay outside this denominator and remain visible in the inventory. |
| Failed items/cases | Failed items are misidentified plus missing gold. Failed cases also include extras. Execution failures on unlabelled cases count as failed cases without inventing item gold. |
| Extras per case | Extra predictions divided by scored labelled cases, including failed labelled cases. |
| Quantity | Only identity-correct pairs with explicit gold provenance, positive finite gold grams and finite predicted grams. Report QTY sample count, unscored evaluated gold, MAE, median/P90 absolute error and per-item percentage error. Wrong foods and missing outputs contribute no zero gram errors. |
| Automatic grounding | Precision includes every automatically grounded prediction in scored cases, including extras. Coverage divides that count by evaluated gold, so extras can push it above 100%. These are draft grounding metrics; the user still confirms capture. |
| Top-3 containment | One-to-one matching against each prediction's first three alternatives, or its actual grounded identity when automatic. Automatic grounding alone earns no credit. |

An empty measurement returns `null` in JSON and “not measured” in Markdown. Quantity percentiles use linear interpolation. These descriptive metrics provide no confidence intervals or new accuracy gate. The capture scorer does not measure label-field transcription, nutrient truth, preparation state, speech recognition, correction effort or confirmed-log outcomes. Reference annotations need a separate comparison before anyone reports those dimensions.

## Reproducibility and routes

Each receipt records the checkout commit, tracked-dirty flag, named prompt/schema source fingerprints, corpus hash, present media hashes, case outcomes and configured lane entries. The prompt/schema hashes fingerprint the named source files; they do not hash every serialized dynamic request. A dirty checkout is not identified by its commit alone. The CLI records the catalog snapshot as `unknown`; it does not query a live snapshot marker.

Configured lanes do not prove which route answered. Capture currently returns no successful-call route linkage, so an attempted live capture reports its actual provider/model/fallback as unknown. Inventory rows report `not_called`. The coach live-pass report records answering-model metadata and directly observed OpenRouter responses. The coach streak renderer reads stored turn proofs; missing historical run metadata and fallback evidence stay unknown. Current lane entries describe the reporting checkout, not a recovered historical configuration.

## Entry points and assets

| Path | Responsibility |
|---|---|
| [`scripts/ai-eval.ts`](../../scripts/ai-eval.ts) | JSONL validation, inventory, test sign-in, live fixture lifecycle, report and JSON output. |
| [`scripts/eval/capture-score.ts`](../../scripts/eval/capture-score.ts) | Pure case assignment and identity/quantity metrics. `scoreCases` is the runner's entry point; `scoreMethod` preserves the older prepaired helper interface. |
| [`scripts/eval/capture-manifest.ts`](../../scripts/eval/capture-manifest.ts) | Source fingerprints, configured lanes and explicit observed/unknown route metadata. |
| [`scripts/eval/public-capture/README.md`](../../scripts/eval/public-capture/README.md) | Public smoke corpus, asset generation, Nutrition5k attribution and transfer limits. |

The smoke corpus contains seven authored text cases, two synthetic panels, two local voice clips and two licensed Nutrition5k plate images. Generate the ignored voice files after checkout with `scripts/eval/generate-public-media.py`; its README documents Pillow and macOS speech requirements. The corpus is a pipeline smoke set, not an independent holdout or a representative benchmark. `expectedLabel`, `referenceTranscript` and `referenceNutrients` remain annotations outside the item scorer.

The related deterministic runtime fixes parse mixed/vulgar fractions and explicit mass aliases, scale portion rows by the quantity their label names, and reject negative/range amounts in `parseAmount`. `gramsFor` returns null when a count or volume lacks a usable food-specific portion; the server can still retain the model's gram estimate. An explicit half of a whole no longer takes the “no amount given” follow-up path. Capture preview sums nutrient snapshots before rounding the meal once. These fixes do not calibrate model confidence or change automatic-grounding thresholds.

See [the bounded REA study](../research/accuracy-rea.md) for reference evidence and [the status reconciliation](2026-11-14-status-reconciliation.md) for search/coach history and expenditure receipts. Expenditure's synthetic error-propagation results are separate from capture accuracy.

## Focused verification

```sh
mise exec -- pnpm exec vitest run tests/capture/eval-scoring.test.ts tests/capture/eval-cases.test.ts tests/capture/eval-runner.test.ts tests/capture/eval-manifest.test.ts tests/capture/eval-media-runner.test.ts tests/eval/lane-bench-score.test.ts
mise exec -- pnpm exec tsc --noEmit
```

The runner test executes the real offline CLI with no credentials. Media lifecycle tests replace only the remote boundaries. Lane-bench retains its existing contract and tests. Run the runtime quantity, follow-up and preview regressions when changing those modules; these evaluator checks alone do not cover them.
