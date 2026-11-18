# Feedback migration applied to production, 2026-11-18

Project `fivatgdpuenszxxnijpc`. Migration `20270108090000_feedback` (PR #260), applied before the
code that writes it merges, as its header requires.

## Backup
`~/Backups/supabase/meal-companion/2026-11-18T083313Z-9dda8905.sql` (24,074,972 bytes,
sha256 `04a1d94a752080bcef77d9d5a22f0fbfa46d9676210626a4b7e1d48ba4a0c8e3`), taken by `scripts/backup.sh`.

## Applied
The dry run from `feat/tester-feedback-privacy` listed only this file. `--commit` applied and
recorded it. A second dry run reported 196 of 196 recorded.

## Verified (read-only SQL)
- `public.feedback` exists with RLS on and 0 rows.
- `authenticated` cannot insert; `anon` cannot select.
