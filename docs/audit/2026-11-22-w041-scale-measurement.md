# W041 scale step 1: measurement report (2026-11-22)

Read-only. Production Postgres via `PGOPTIONS='-c default_transaction_read_only=on'` and an explicit
`set default_transaction_read_only = on; begin read only; ... rollback;` in every script (the Supabase
pooler drops the startup option: `show transaction_read_only` read `off` with the option alone, `on`
inside the explicit read-only transaction). Supabase Management API: GET only. No connection string,
token or user data was printed or stored. The DB URL and token came from ZS Vault.

Project: `sasha-meal-companion` (`fivatgdpuenszxxnijpc`, org Zerosumsolutions-Projects, us-west-1).
The project id was matched by name and region to the vault entry; the vault URL itself is not
introspectable, so this match is by name, not proven by URL.

## Not done (and why)
- **200-op `/api/sync/ops` benchmark and branch backup run (p50/p95):** not run. It writes; the brief bars
  load tests against production. It needs a branch or local stack. The local Supabase ports (54321-54324)
  are held by another project's stack on this Mac. Open for a branch run.
- **Hosted `ai_spend_reserve` latency:** not measured. The RPC inserts a reservation row, so it is a
  write. Passive evidence only: `rate_limit_hit` (a one-statement upsert RPC through PostgREST) has
  mean 2.07 ms over 23,443 calls (max 29 ms), the closest read-only proxy.
- Vercel logs and env (W050 token): not touched.

## Plan, tier, limits
| Item | Value | Source |
|---|---|---|
| Org plan | `pro` | `GET /v1/organizations/{org}` |
| Compute add-on | Micro | `GET /v1/projects/{ref}/billing/addons` |
| Postgres | 17.6 (project image 17.6.1.166) | `select version()`, project GET |
| `max_connections` | 60 | `current_setting` |
| `shared_buffers` / `work_mem` | 256 MB / 3500 kB | `current_setting` |
| Pooler (Supavisor, port 6543) | transaction mode; `default_pool_size` null (API reports no explicit value) | `config/database/pooler` |
| pgbouncer block | transaction, `server_idle_timeout` 600, `server_lifetime` 3600, `query_wait_timeout` 80, `reserve_pool_size` 1 | `config/database/pgbouncer` |
| JWT mode | asymmetric: ES256 `in_use`, HS256 `previously_used`; `jwt_exp` 3600 s | `config/auth`, `config/auth/signing-keys` |
| Backups | daily (7 backups listed), PITR **off** | `database/backups` |
| Extensions | pg_stat_statements 1.11, pg_trgm, pgcrypto, unaccent, uuid-ossp, supabase_vault | `pg_extension` |

## Sizes
Database: **112 MB** total, 147 user tables. Auth users: **10**.

| Table | Est. rows | Total | Heap | Indexes |
|---|---:|---:|---:|---:|
| catalog_food_revisions | 13,695 | 35 MB | 12 MB | 23 MB |
| catalog_food_nutrients | 259,397 | 29 MB | 14 MB | 15 MB |
| food_nutrient | 103,189 | 7.1 MB | 6.0 MB | 0.9 MB |
| catalog_portions | 36,681 | 5.0 MB | 3.0 MB | 2.0 MB |
| food_facets | 10,536 | 3.1 MB | 1.5 MB | 1.6 MB |
| food_portion | 22,046 | 2.7 MB | 2.2 MB | 0.4 MB |
| catalog_foods | 13,695 | 2.0 MB | 0.9 MB | 1.1 MB |
| change_log | 1,261 | 1.6 MB | 1.3 MB | 0.2 MB |
| coach_messages | 413 | 656 kB | 232 kB | 256 kB |
| ai_calls | 721 | 624 kB | 264 kB | 328 kB |

The catalog tables (about 80 MB of 112 MB) are shared reference data, not per-user growth.

Exact counts (`count(*)`): change_log 1,261; ai_calls 721; client_timings 950; job_runs 768;
sync_op_receipts 1,255; coach_messages 413; log_items 25; ai_spend_reservations 11; recipe_plan_previews 0.
Largest per-user `change_log`: 871 rows (one tester).

`pg_column_size(change_log.current)`: n 1,261; avg **787 B**, p50 970 B, p95 1,458 B, max 1,983 B,
sum 962 kB. A 2 MB `sync_changes` page (W045 target) therefore holds roughly 2,100 average rows.

`ai_calls` status mix: ok 673, provider_error 28, timeout 15, schema_invalid 4, error 1
(2026-09-12 to 2026-11-22).

## `pg_stat_statements` top 20 by total time
Stats since 2026-09-09; 1,045,209 calls in all. Query text is the normalized text, trimmed to 150 chars.
Rows 4, 6, 8, 10, 11, 12, 16, 19 are catalog loads, staging copies and dumps (batch work, not user traffic).

| # | Calls | Total ms | Mean ms | Max ms | What |
|--:|--:|--:|--:|--:|---|
| 1 | 1,396 | 1,539,049 | 1,102 | 5,202 | PostgREST RPC with `p_q, p_brand, p_prep, p_limit` (food search) |
| 2 | 907 | 569,312 | 628 | 4,480 | same search RPC, second call shape |
| 3 | 3,263 | 90,180 | 27.6 | 81 | RPC `p_user, p_name_norm, p_status` |
| 4 | 124 | 82,697 | 667 | 2,526 | `COPY catalog_food_nutrients TO stdout` (dump) |
| 5 | 216 | 56,602 | 262 | 1,992 | food search RPC, third shape |
| 6 | 3 | 55,030 | 18,343 | 28,559 | `copy catalog_staging.food_nutrient` (load) |
| 7 | 1,296 | 51,796 | 40.0 | 659 | RPC `p_user_id, p_op` (sync op apply) |
| 8 | 3 | 48,625 | 16,208 | 39,855 | `copy catalog_staging.food` (load) |
| 9 | 23,443 | 48,452 | 2.07 | 29 | `rate_limit_hit` RPC |
| 10 | 124 | 40,959 | 330 | 1,114 | `COPY catalog_staging.food_nutrient TO stdout` |
| 11 | 118 | 27,506 | 233 | 1,016 | `COPY catalog_food_revisions TO stdout` |
| 12 | 193 | 26,642 | 138 | 938 | `SELECT name FROM pg_timezone_names` |
| 13 | 9,743 | 18,879 | 1.94 | 81 | RPC `p_user_id, p_kind, p_catalog_fo...` |
| 14 | 109 | 17,833 | 164 | 585 | RPC `p_user_id, p_local_date, p_zone...` |
| 15 | 83 | 16,891 | 204 | 556 | RPC `p_user, p_families` |
| 16 | 3 | 14,409 | 4,803 | 6,121 | `copy catalog_staging.food_portion` |
| 17 | 3,282 | 13,809 | 4.21 | 72 | `food_allergen_evidence` select |
| 18 | 1,913 | 12,988 | 6.79 | 142 | `catalog_food_revisions` select |
| 19 | 1 | 12,687 | 12,687 | 12,687 | catalog `with q(i, raw, brand, prep...)` bulk match |
| 20 | 14,061 | 12,327 | 0.88 | 44 | RPC `p_user_id, p_since, p_limit` (sync changes pull) |

Findings:
- The food-search RPC family (rows 1, 2, 5) is the one user-facing hot spot: 2,519 calls, about
  2,165 s total, mean 0.26 to 1.1 s, max 5.2 s. It is the first thing to index or cache in W044.
- Sync (rows 7, 20) is cheap per call: apply 40 ms mean, changes pull 0.88 ms mean.
- `SELECT name FROM pg_timezone_names` (row 12) costs 138 ms per call and is called by the app
  (193 times); a hard-coded or cached zone list removes it.

## Spend state at measurement time (read-only; context for W043)
- `ai_spend_reservations`: 11 rows, all today (2026-11-22), all settled; **0 open, 0 stale**, 0 background.
- Settled global spend today: $0.034. Earlier days: $0.000 to $0.008. Production already has the
  `background` column (migration 20270103090000 is applied).
- So no false trip was live at measurement time. The failure mode needs concurrent holds with dead
  functions. W043 does not hide such holds from the ceiling (an expired hold may still be running,
  so it counts in full until reconciled). It shortens how long one can linger: interactive holds
  now live 90 s instead of 300 s, the sweep cron runs on every tick, and one budget lock makes the
  ceiling exact across the 16 shards. The residual: a dead function's hold still counts until the
  next sweep (at most one cron interval after its 90 s) and can over-refuse, never over-spend.

## Follow-ups (out of scope for W043; not fixed here)
- `lib/ai/call.ts` settles a timed-out or cancelled attempt at $0, though the provider may still
  bill it.
- `delete_account` drops an account's unsettled reservations before their charge lands, so a call
  still running at deletion time is never counted.
- A late settle after the row was pruned (older than 2 days) is a no-op: that spend is not added.
- The OpenRouter `policy.attempts` setting with `abandonOnCapacity` can make more attempts than the
  one-attempt allowance a call reserves.

