-- Internal ops dashboard access (OpenDashboards, internal use only): a read-only login role and
-- a small `ops` schema of aggregate views. NEEDS PRODUCTION APPLY by the release owner (a Mac
-- session), with the manual password step at the bottom. Nothing in the app reads this schema.
--
--   * `ops_readonly` can log in, but this file sets NO password, so it cannot connect until the
--     release owner runs `alter role ops_readonly password '<generated>'` and stores the full
--     connection string in ZS Vault as `hf_ops_readonly_db_url`. Never commit or paste the password.
--   * Its only grants are `usage` on schema `ops` and `select` on the views below. It holds no
--     grant on any `public` or `auth` table; those tables keep RLS on regardless.
--   * The views are owned by the migration role (not security_invoker), so they read the base
--     tables as the owner. They expose counts, sums and latency percentiles by UTC day and a
--     short category (capture method, ai purpose, status, timing path and step). They expose no
--     user id, name, email, free-text note, food description, health value, media reference,
--     ai error text or feedback message.
--   * `ops` is not in config.toml `[api] schemas`, and `anon` and `authenticated` get nothing
--     there, so the Data API never serves it.
--   * The role is capped: 3 connections, a 15 s statement timeout, read-only transactions.
--
-- Live-safe: new schema, views and role only; no existing object is altered.
-- Apply order: this file alone, its own transaction. Down: supabase/migrations/down/20270109090000_ops_readonly_role.down.sql.
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $$
begin
  if to_regnamespace('ops') is not null then
    raise exception '20270109090000_ops_readonly_role: already applied';
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'ops_readonly') then
    create role ops_readonly login nosuperuser nocreatedb nocreaterole noinherit
      noreplication nobypassrls connection limit 3;
  end if;
end $$;

alter role ops_readonly set statement_timeout = '15s';
alter role ops_readonly set idle_in_transaction_session_timeout = '30s';
alter role ops_readonly set default_transaction_read_only = on;
alter role ops_readonly set search_path = ops;

create schema ops;
revoke all on schema ops from public, anon, authenticated;
grant usage on schema ops to ops_readonly;

-- Accounts created per UTC day.
create view ops.signups_by_day as
  select (created_at at time zone 'UTC')::date as day, count(*)::bigint as signups
  from auth.users
  group by 1;

-- One row: total accounts and how many logged food in the last 7 and 30 UTC days.
create view ops.account_totals as
  select
    (select count(*) from auth.users)::bigint as total_accounts,
    (select count(distinct user_id) from public.log_entries
       where deleted_at is null and local_date >= current_date - 6)::bigint as active_7d,
    (select count(distinct user_id) from public.log_entries
       where deleted_at is null and local_date >= current_date - 29)::bigint as active_30d;

-- Accounts that logged at least one entry on a day, and the entries they logged.
create view ops.active_accounts_by_day as
  select local_date as day, count(distinct user_id)::bigint as active_accounts,
         count(*)::bigint as entries
  from public.log_entries
  where deleted_at is null
  group by 1;

-- Log entries per day by capture method (search, barcode, label, photo, voice, text, plan).
create view ops.log_entries_by_day_method as
  select local_date as day, method, count(*)::bigint as entries,
         count(distinct user_id)::bigint as accounts
  from public.log_entries
  where deleted_at is null
  group by 1, 2;

-- Model calls per UTC day, purpose and status: volume, tokens, estimated cost, latency.
create view ops.ai_calls_by_day as
  select (created_at at time zone 'UTC')::date as day, purpose, status,
         count(*)::bigint as calls,
         coalesce(sum(input_tokens), 0)::bigint as input_tokens,
         coalesce(sum(output_tokens), 0)::bigint as output_tokens,
         coalesce(sum(cost_estimate), 0)::numeric as cost_estimate,
         percentile_cont(0.5) within group (order by latency_ms) as p50_latency_ms,
         percentile_cont(0.95) within group (order by latency_ms) as p95_latency_ms
  from public.ai_calls
  group by 1, 2, 3;

-- Failed and total coach model calls per day (purposes that start with "coach").
create view ops.coach_failures_by_day as
  select (created_at at time zone 'UTC')::date as day, purpose,
         count(*) filter (where status <> 'ok')::bigint as failed_calls,
         count(*)::bigint as total_calls
  from public.ai_calls
  where purpose like 'coach%'
  group by 1, 2;

-- Coach intent routing per day: which fallback fired and how long it took. No intent text.
create view ops.coach_fallbacks_by_day as
  select (created_at at time zone 'UTC')::date as day, fallback_reason, fast_path_taken,
         count(*)::bigint as events,
         percentile_cont(0.5) within group (order by latency_ms) as p50_latency_ms,
         percentile_cont(0.95) within group (order by latency_ms) as p95_latency_ms
  from public.coach_intent_events
  group by 1, 2, 3;

-- Capture latency the phone measured, per day, path and step.
create view ops.client_timings_by_day as
  select (at at time zone 'UTC')::date as day, path, step, count(*)::bigint as samples,
         percentile_cont(0.5) within group (order by ms) as p50_ms,
         percentile_cont(0.95) within group (order by ms) as p95_ms
  from public.client_timings
  group by 1, 2, 3;

-- Tester feedback volume per day. The message, screen and build are never selected.
create view ops.feedback_by_day as
  select (created_at at time zone 'UTC')::date as day, count(*)::bigint as feedback_count
  from public.feedback
  group by 1;

revoke all on all tables in schema ops from public, anon, authenticated;
grant select on all tables in schema ops to ops_readonly;

-- MANUAL STEP (release owner, after applying; never in a migration or in git):
--   alter role ops_readonly password '<generated>';
-- then store the connection string in ZS Vault as `hf_ops_readonly_db_url`. Through the Supabase
-- pooler the user name is `ops_readonly.<project ref>`.
