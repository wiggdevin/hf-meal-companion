# Public and synthetic capture smoke set

This is a small pipeline smoke set, not a representative accuracy benchmark. It contains authored text, two synthetic nutrition panels, two locally generated voice clips, and two licensed Nutrition5k images. No account data or private media are included.

## Run

From the repository root:

```sh
python3 scripts/eval/generate-public-media.py
mise exec -- pnpm exec tsx scripts/ai-eval.ts --set scripts/eval/public-capture/cases.jsonl --dry-run --out .work/accuracy-rea/public-inventory.md
```

The optional generator uses Python Pillow for the panels and macOS `say` for local speech. Speech is ignored by Git and must be generated after checkout. Missing speech remains visible in the inventory on other operating systems. The panels and public images are committed. Dry-run performs no sign-in, upload, database query or model call. Live runs use the existing test-project access and budget controls; they are not part of normal CI.

The text amounts are explicitly stated mass, except the mixed-fraction cup and vague rice cases. Those have no gram gold: converting a volume to mass requires food-specific portion evidence. Do not replace null with a guessed number. The ounce reference uses the exact international avoirdupois definition.

`label-gold.json` records authored printed fields and their independently calculated per-100-g values. Unprinted nutrients are unknown, not zero. These assets can test printed-field extraction and deterministic conversion; they do not establish accuracy on real curved, reflective or blurred packages. Ingredient text containing apple is not a default exclusion: any blocked-case test must configure its own account restriction and include a clear-account control.

`expectedLabel`, `referenceTranscript`, and `referenceNutrients` are reference annotations. The item scorer does not turn them into nutrient-transcription or speech-recognition accuracy claims. A separate dimension-specific comparison must consume them before reporting such results.

## Nutrition5k attribution and limits

The two plate images and copied annotation rows are from **Nutrition5k**, Thames et al., Google Research, CVPR 2021. Source: <https://github.com/google-research-datasets/Nutrition5k>. License: **Creative Commons Attribution 4.0**, <https://creativecommons.org/licenses/by/4.0/>. The images are unmodified. The smoke set selects two single-ingredient records and retains their identifiers, original annotation rows, exact download URLs and image SHA-256 hashes in `manifest.json`.

The source consists of selected California cafeteria dishes captured with a scanning rig. It is not representative of all users, cuisines or phone-camera conditions. Its ingredient masses provide quantity references; its nutrient annotations derive from USDA food composition and are not independent laboratory measurements. All views of the same dish must stay in the same development/holdout partition. Excluded source rows labelled `deprecated` are not ground truth.

The manifest also hashes the authored corpus and panels. This set is deliberately labelled a smoke set; do not tune a model on it and then call its results an independent holdout.
