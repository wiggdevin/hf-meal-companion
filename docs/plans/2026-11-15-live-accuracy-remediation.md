# Live accuracy remediation

User request: fix coach failures, meal suggestions and photo portions, rerun tests, and show measured improvement.

Baseline: `e3f605d8`, with the separately archived experimental OpenRouter 3 Flash pins. Frozen capture set: 100 development + 100 holdout inputs; coach: 38 cases ×3. Results: 197 usable captures, text50/50, label50/50, voice47/50, strict photo names12/50; coach35/114 all checks,48/114 excluding latency/path,8/38 cases passing all repeats. All baseline artifacts remain unchanged.

## Success criteria

1. Confirmed defects have behavioral regressions that fail before the fix and pass afterwards. Preserve admission, allergy/diet and reply verification boundaries.
2. Successful server food searches retain their real identities and policy evidence through composition and final action grounding. Failed lookups, model-only IDs and unrelated foods remain untrusted.
3. Pure list-membership confirmations survive the reply scan; advice attached to those confirmations remains scanned.
4. Photo instructions distinguish total edible mass from counts and avoid unsupported weight confidence. The review sheet identifies photo masses as estimates and permits measured correction. Do not use reference answers, image IDs, food-specific multipliers or scorer changes in runtime.
5. Repeat the frozen200 capture inputs and all114 coach attempts with the same pin overlay, fixed clock, original assertions and fixture settings. Report measured changes, uncertainty, service failures and unresolved failures. Original meal expectations that conflict with dietary fixtures remain visible and are not counted as corrected by changing policy.
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

Implementation and the frozen live rerun are complete on `fix/live-accuracy-remediation`; production is unchanged.

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
