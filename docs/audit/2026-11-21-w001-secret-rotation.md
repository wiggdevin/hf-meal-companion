# W001 — secret rotation receipt (2026-11-21)

No secret values appear in this file.

## Supabase personal access token — rotated

| Step | Result |
|---|---|
| Old token | "Claude Terrior", legacy full-account PAT, prefix `sbp_390c…1e9c`. It was the value in ZS Vault `supabase_access_token`. It was printed into an agent transcript on 2026-11-21 and was never rotated after the October exposure. |
| New token | "zs-agents-2026-11-21", prefix `sbp_fcbc…49da`. Organization-scoped (LuckyListing, Rapid Revamp, rise-scheduling, TrainerIQ, Zerosumsolutions-Projects), full-access preset, expires 2027-02-19 (90 days). |
| New token checked | `GET /v1/projects` → 200, `GET /v1/organizations` → 200. |
| Stored | ZS Vault `supabase_access_token` updated (vault commit pushed). `zsvault unlock` regenerated the shell env file; a fresh shell loads the new prefix. The value never went through argv or logs: it moved browser → 0600 temp file → `zsvault edit --fields-stdin`, then the temp file was deleted. |
| Old token revoked | Deleted in the Supabase dashboard (Account → Access Tokens). The token list no longer shows it. |

Follow-up: the new token expires on 2027-02-19. Rotate before then. A legacy token is no longer needed for agent work.

## Other database URLs — no rotation needed

The Oct 6–10 transcripts were swept. The leaked pooler URLs held only a two-character placeholder password for `postgres.fivatgdpuenszxxnijpc` and a fake `postgres.abc` host. No real database password was exposed, so none was rotated.

## SASHA_SYNC_TOKEN — retired

No code in `app/`, `lib/` or `scripts/` reads it. It is not in ZS Vault and not in the shell env. Vercel env was not checked: the vault's Vercel token cannot see the team project (that is W050). When W050 lands, delete `SASHA_SYNC_TOKEN` from the Vercel project env if it is present.

## Still open

- Two other legacy full-account PATs remain on the account ("Paid subscriptions", "terroir-ci-types-drift"). They were not part of this leak. Replace them with scoped tokens when their owners next touch them.
