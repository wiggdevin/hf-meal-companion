# Live accuracy remediation

User request: fix coach failures, meal suggestions and photo portions, rerun tests, and show measured improvement.

Historical R0 baseline: `e3f605d8`, with the separately archived experimental OpenRouter 3 Flash pins. Frozen capture set: 100 development + 100 holdout inputs; coach: 38 cases ×3. Results: 197 usable captures, text50/50, label50/50, voice47/50, strict photo names12/50; coach35/114 all checks,48/114 excluding latency/path,8/38 cases passing all repeats. All baseline artifacts remain unchanged.

## Success criteria

1. Confirmed defects have behavioral regressions that fail before the fix and pass afterwards. Preserve admission, allergy/diet and reply verification boundaries.
2. Successful server food searches retain their real identities and policy evidence through composition and final action grounding. Failed lookups, model-only IDs and unrelated foods remain untrusted.
3. Pure list-membership confirmations survive the reply scan; advice attached to those confirmations remains scanned.
4. Photo instructions distinguish total edible mass from counts and avoid unsupported weight confidence. The review sheet identifies photo masses as estimates and permits measured correction. Do not use reference answers, image IDs, food-specific multipliers or scorer changes in runtime.
5. For the historical R3 comparison, repeat the frozen200 capture inputs and all114 coach attempts with the same pin overlay, fixed clock, original assertions and fixture settings. Report measured changes, uncertainty, service failures and unresolved failures. Original meal expectations that conflict with dietary fixtures remain visible and are not counted as corrected by changing policy.
6. Preserve source/prompt/corpus hashes, per-turn outputs, provider usage and cleanup receipts. The comparison is an integration experiment on the isolated coach-eval database, not a production-UI accuracy benchmark. A previously inspected holdout is a repeated benchmark, not a fresh validation set.
7. Independent code/security review, targeted tests, one full unit run, lint and type check pass before the branch is offered for integration. Do not ship the experimental provider overlay or relax retention settings.

## Sequence and ownership

1. Coach worker: membership confirmation parser and action regressions; investigate unsupported recipe output without loosening the schema speculatively.
2. Suggestion worker: turn-local evidence capture from successful search and own-food resolution, retained through final grounding; regression tests include negative controls.
3. Photo worker: grounded prompt correction and existing capture tests. Root: review-sheet copy and behavioral edit/save checks.
4. Root: review integrated diff, run checks and independent review, freeze the rerun protocol, execute isolated live runs with account cap$2 and shared cap$5, and verify cleanup. Use existing approved credit; no top-up.
5. Root plus independent verifier: publish a before/after report with matching denominators and failure details. Preserve raw and conditional metrics even when they do not improve.

## Decisions already made

- Keep current nutrition/policy authority and all current safety gates.
- No new model vendor, calibration on the benchmark answers, inferred physical scale or unverified numerical correction.
- Product code and benchmark-fixture defects are different findings. A later corrected fixture suite must receive its own version and baseline; it cannot replace this original score.
- Current scope is implementation plus reviewable results; production retains its deployed code until an eligible integration is completed.

## Status

### Follow-up authorized after the first comparison

The user requests remaining coach, suggestion and photo repairs, followed by a new live comparison **before deployment**. Reuse this branch and draft PR257. The previous results below remain historical evidence; do not overwrite their artifacts.

1. Diagnose every remaining failed assertion against raw turns and governing rules. Coach worker owns coach/meal runtime and regressions; photo worker owns generalized photo extraction fixes; the independent verifier owns failure adjudication. Root owns provider availability, evaluation protocol and integration.
2. Prove confirmed runtime defects with failing regressions, then apply the smallest fixes. Keep account/policy/identity checks, original gold, scorer, assertions and fixtures intact. Record fixture contradictions separately; supplemental corrected cases must never replace original scores.
3. Check the actual default provider route as well as the prior experimental configuration. No new vendor, retention relaxation, production database writes, additional top-up or deployment.
4. Use bounded development checks before freezing the final candidate. Repeat all200capture inputs and114coach turns; add independent validation where available without teaching runtime the benchmark answers. Report photo identity and mass separately, including every failure and matching denominators.
5. Obtain independent code/security review, run focused regressions, one full local suite plus lint/types and CI, then publish a new comparison with source/gold hashes, exact coverage, costs and verified cleanup. Show results to the user before any deployment.

### Current R4 follow-up: repair verification in progress

The four-model escalation audit is complete. Opus checked the findings against the frozen source and consolidated one repair batch: food identity and preparation boundaries, grounded log retention, warning scan/display consistency, requested plan facts, truthful suggestion caveats, no-cook admission, catalog review binding and cancellation handling. The live benchmark, scorer and gold remain unchanged. At this source checkpoint, the final R4 live cohort has not started; no R4 accuracy gain is claimed here. The locked run protocol and the task report carry the subsequent measured results.

The first CI run found a spent-budget response regression and a provider-timeout/SDK-abort race in cancellation hardening. The initial live cohort was stopped after its current attempts and all five accounts were cleaned up. Its partial results and costs remain engineering evidence, outside the final accuracy score. The narrow deadline corrections pass the five existing CI failures and the new deterministic SDK-race regression; 484 focused checks pass. The final cohort requires a new committed source lock and fresh run IDs.

One full local unit run before this batch passed 16,489 tests, with 1,409 skipped. After the batch, run focused regressions, types, lint and size checks; the full suite runs in CI. The candidate uses its actual available source pins, without a temporary overlay. A fresh supplemental photo validation set stays sealed from the photo author until source freeze. Show the measured results before deployment.

### Final meal repair batch before the requested rerun

The completed intermediate cohort at `110a1d4` scored76/114coach turns and12/50photos under the original frozen assertions. Its source lock, run IDs, outputs and costs remain preserved. These are intermediate results; the following changes require their own full rerun.

`lib/coach/completed-plan.ts` now renders a pure requested meal read from one successful `get_plan`, using only its validated date, slot, time, title and gram items. It self-checks against the existing plan-report grammar and then passes through the normal reply guard. Mixed requests, missing or mismatched records and unsafe titles stay on the existing model path. The saved-plan dietary caveat appears only beside a retained factual report.

`lib/coach/wire.ts` discards a zero-gram suggestion only when its absent reference and exact normalized name duplicate an item in a structurally accepted `set_slot_meal`. It never turns a card into a quantity or reference. Other zero cards remain invalid, and actions still pass through grounding and policy checks. `lib/coach/portion-bands.ts` gives plain cooked oats a150/235/350g fallback band based on the bundled234g cup; explicit grams and actual catalog portions retain priority. Dry oats and prepared products retain their previous rules. This editable serving guess is not a measured photo portion.

Focused meal and composition checks pass without golden changes. Full lint/types, independent contract verification, a new clean-source lock and the complete200capture/114coach rerun are required before reporting final gains. Production remains unchanged.

### Historical R3 comparison

The prior implementation and frozen live rerun completed on `fix/live-accuracy-remediation`; these are R3 results, not the current R4 candidate. Production is unchanged.

| Original repeated benchmark | Before | Candidate |
|---|---:|---:|
| Coach, every assertion | 35/114 | 60/114 |
| Coach, excluding latency/path | 48/114 | 71/114 |
| Cases passing every repeat | 8/38 | 15/38 |
| Suggestion category, every assertion | 0/12 | 3/12 |
| Meal category, every assertion | 0/15 | 1/15 |
| Usable capture drafts | 197/200 | 199/200 |
| Frozen photo name/alias matches | 12/50 | 6/50 |

Photo portions on the exact five common eligible cases: MAE37.0→31.2g. Development improves (n3,52.67→40.33g), but holdout worsens (n2,13.5→17.5g). This small, selected comparison does not cancel the name regression. Photo instructions remain provisional; they have not earned deployment. Confirmation notices measure disclosure, not calibrated accuracy.

All200 capture attempts and114 unique coach attempts are retained, including54 remaining coach failures and one photo service failure. All five synthetic accounts were removed and absence verified; uploaded live media count is zero. Runtime1745-file hashes, harness hashes and frozen gold hashes matched at completion. The temporary model overlay was then restored and is excluded from release.

Validation:232 focused tests passed; TypeScript, lint, size guards and secrets scan passed. One full unit run recorded16,411 passes and two size-guard failures; both guards were corrected and passed the targeted rerun. No second full local suite was run. Independent source/security review and exact logging-advice regression closure are recorded with the evaluation evidence.

Final-cohort recorded costs: OpenRouter$0.8571, Google estimate$0.0465, TypeSafe estimate$0.0071. The final cohort plus interrupted engineering pass records OpenRouter$1.3970 and other-provider estimates$0.0926; coverage is retained ledger rows, not a complete billing reconciliation. No additional credit purchase. Source review, repeated benchmark limitations, differing fallback routes and incompatible original fixtures remain explicit in the report.
