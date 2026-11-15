# Accuracy REA implementation: local verification receipt

Prepared 2026-11-14 on `feat/accuracy-rea`, based on `70c5be1d7ae24786219d8a986ade1040e6177fc8`. This receipt records local checks and a failed provider-access smoke test. The PR checks own the subsequent full-suite and build result. It is not an accuracy certification or a competitor comparison.

## Implemented scope

- [Capture evaluation](capture-evaluation.md): exact normalized labels or adjudicated aliases; canonical identity precedence; maximum one-to-one matching; independent canonical automatic-grounding metrics; quantity provenance and ambiguous-pair abstention; complete modality inventory; reproducibility metadata and explicit unknowns.
- Fraction, mass and portion arithmetic: mixed/Unicode fractions, fraction slash, aliases, exact pound/ounce factors, explicit volume preservation, bounded physical mass, shared schema limits, and no invented density. Preview sums at snapshot precision before rounding the meal display.
- [Intake-error and status reconciliation](2026-11-14-status-reconciliation.md): deterministic logging-error scenarios, current-engine backtest, threshold provenance and preserved dated receipts. No expenditure coefficient or search threshold was retuned.
- [Public smoke corpus](../../scripts/eval/public-capture/README.md): seven authored text cases, two synthetic labels, two local speech fixtures and two licensed Nutrition5k images. Product-name, arithmetic and hash regressions protect the authored gold. This is a small smoke set, not an independent holdout.
- Test harness repairs: browser-local shopping dates now have fixed LA/Tokyo cases; coach deadline tests isolate cold imports and ambient provider configuration, complete the database fake, and prove the existing five-second context timeout. Runtime deadline constants did not change.

## Independent review and resolution

Opus 5.5 and Gemini 4 Carbon reviewed the initial diff. The non-clean result triggered one parallel full-scope audit of snapshot `e3298c078758422764a5fe18045870f71758b451` by GPT-6.1 Sol, Gemini 4 Carbon, DeepSeek V4.1 Flash and Grok 4.7 (packet review). All four processes exited 0; Grok ended with `end_turn`. Opus resumed the same review session, verified and deduplicated the findings, then specified one fix batch. TypeSafe Jev's dedup helper supplemented that source verification.

The verified fixes cover corrupt synthetic product names, false catalog-grounding credit, phrase collisions, blocked augmenting paths, amount-dependent duplicate pairing, weak quantity provenance, incomplete quantity parsing and schema caps, historical pin attribution, blank coach route attribution, missing action hash inputs, indirect production-client selection, ambiguous input/ID validation, service-error attribution and rounding precision. Original owners implemented the fixes with failing-before/passing-after regressions.

Parent verification corrected two details in the review wording: 500 mg was refused by the old per-unit cap of 100, rather than the blanket cap of 5,000; the reproducible rounding counterexample was 0.7 + 0.35, while 0.3 + 0.15 already displayed correctly. The revised bounds also support valid milligram quantities above the old blanket cap. Unit-name prototype properties cannot bypass the cap lookup.

No model pin, automatic-grounding threshold, dietary admission rule, database migration, production setting, or credential changed. The branch contains independently written code; the [REA study](../research/accuracy-rea.md) distinguishes recovered public artifacts from documentation-only observations and proprietary unknowns.

## Local checks

| Check | Observed result |
|---|---|
| One early local full-suite run | 1,531 files / 16,291 tests passed; 107 files / 1,409 tests skipped; two existing harness tests failed. Both harnesses were repaired and their 15 tests passed under LA and UTC. The full suite was not repeated locally. |
| Combined final focused run | 23 files / 336 tests passed. Later prototype-name regressions and their affected quantity/schema files passed separately: 2 files / 102 tests. |
| TypeScript | Exit 0 after the evaluator fix batch. |
| Offline CLI | Historical and public inventories exit 0 without sign-in, upload, database or model calls. Missing/unrun evidence stays unmeasured. |
| Historical integrity | All 289 pre-existing evaluation/search-receipt files in the checked set retain their SHA-256 values. |
| REA | Two real analyses exit 0; selected public Mealie/Tandoor artifacts and evidence IDs are recorded in the study. No proprietary backend was recovered. |

Red/green logs, review outputs, hash checks and the machine-readable documentation/security evidence are retained in the implementation worktree's ignored scratch directory. These local artifacts supplement the committed tests and subsequent PR checks; they are not published benchmark results.

## Bounded live attempt and access blocker

One 13-case smoke pass used only public/synthetic inputs on the existing nondefault `coach-eval` branch with a newly created, exclusive synthetic account. It did not reset an existing account, seed catalog data, apply migrations or touch production. The two label names in its ignored corpus copy were independently corrected from the printed PNG headings before the run. The exact amended corpus hash is `6425737e39ee64427273ce60917e5d32137a4b70b0e5ce4d85a3102f3b0d8102`.

All 13 captures failed before useful outputs. Retained diagnostics show OpenRouter HTTP 401 and Gemini HTTP 429 `RESOURCE_EXHAUSTED`, timeouts and later circuit-open guards. The test account had 15 persisted logical AI-call rows: 10 provider errors and five timeouts, with recorded cost zero. This is not an observed count of HTTP requests; internal retries were not separately counted. The account's absence and zero remaining owned live media were verified after cleanup.

Non-generative credential checks found that the configured project OpenRouter key returns 401. The canonical vault key returns 200, but its account credits are zero; its positive per-key allowance is not funded balance. The app-specific Gemini key matches the approved project configuration. Retained evidence does not identify its quota tier or prove a retired model. No key was replaced, account was funded, provider was changed, or model-call retry was made after this smoke pass.

There is no new live capture or coach accuracy baseline. Restoring approved provider access is required before the planned development/holdout runs and any evidence-led changes to questions, thresholds, preparation selection or vendor routing. Successful capture-route and catalog snapshot metadata also remain unknown in the current response contract; the evaluator reports that limitation explicitly.
