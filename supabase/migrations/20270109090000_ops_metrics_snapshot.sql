-- Internal ops metrics (for a local OpenDashboards instance; GET /api/ops/metrics). NEEDS A
-- PRODUCTION APPLY by the release owner. Nothing else reads this function.
--
-- ONE function, `public.ops_metrics_snapshot(p_days int default 30) returns jsonb`, and no role,
-- no schema, no view. A dashboard never gets a Postgres login: the route calls this with the
-- service client, so the database exposes aggregates only and no connection string leaves the app.
--
--   * security definer, stable, `set search_path = pg_catalog, public, pg_temp`; every object is
--     schema-qualified. EXECUTE is revoked from public, anon and authenticated and granted to
--     service_role only (the W070 pattern).
--   * Days are UTC (`(now() at time zone 'UTC')::date`). `p_days` is clamped to 1..90. Every window
--     has an upper bound (today, UTC); a future `local_date` or `created_at` is excluded.
--   * Small-count suppression: a count of 1 to 4 becomes null (a zero stays 0; it identifies no
--     one). A row's sums are null when its main count is below 5. p50 and p95 are null below 10
--     samples.
--   * `ai_calls.purpose` is mapped to the fixed allowlist in `lib/ai/call-registry.ts`
--     (CALL_REGISTRY); any other value becomes 'other'. Status is 'ok' or 'failed'. No raw
--     text is emitted: no user id, name, email, note, food text, health value, media reference,
--     error text or feedback message.
--   * `accounts_created_surviving` counts surviving `auth.users` rows: the repo records no signup or
--     deletion event, so deleted accounts drop out of history (said in the JSON `notes` too).
--   * Coach failures are per allowlisted purpose (a call that failed then recovered still counts);
--     `coach_fallbacks_by_day` (coach_intent_events) is the turn-level view. No pooled coach% rate.
--   * `client_timings` is bucketed by the server's `created_at`, never the client's `at`.
--
-- Live-safe: one new function; nothing existing is altered.
-- Apply order: this file alone, its own transaction. Down: supabase/migrations/down/20270109090000_ops_metrics_snapshot.down.sql.
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create or replace function public.ops_metrics_snapshot(p_days int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $fn$
declare
  v_days int := least(greatest(coalesce(p_days, 30), 1), 90);
  v_today date := (now() at time zone 'UTC')::date;
  v_from date;
  v_from_ts timestamptz;
  v_to_ts timestamptz;
  -- Keep in step with lib/ai/call-registry.ts CALL_REGISTRY (tests/migrations/ops-metrics-snapshot-db.test.ts checks it).
  v_purposes text[] := array[
    'coach-intent','profile-prefs','profile-taste','coach-verify','suggest-options',
    'meal-component-role','log_sanity','food_facets','jev_facets_eval','jev_occasion_eval',
    'day_completeness','pair_plausibility','shopping-build-rank','coach','weeklyReview',
    'coach-transcribe','photoToIdeas-gemini','documentToPlan-gemini','textToItems','voiceToItems',
    'labelToNutrients','photoToItems','lookup','onboarding-extract','coach-openrouter',
    'photoToIdeas','documentToPlan','textToItems-openrouter','photoToItems-openrouter',
    'labelToNutrients-openrouter','onboarding-extract-openrouter','voiceToItems-openrouter',
    'coach-transcribe-openrouter'];
  v_signups jsonb;
  v_active jsonb;
  v_methods jsonb;
  v_ai jsonb;
  v_coach jsonb;
  v_fallbacks jsonb;
  v_timings jsonb;
  v_feedback jsonb;
  v_totals jsonb;
begin
  v_from := v_today - (v_days - 1);
  v_from_ts := v_from::timestamp at time zone 'UTC';
  v_to_ts := (v_today + 1)::timestamp at time zone 'UTC';

  select coalesce(jsonb_agg(jsonb_build_object('day', day,
           'accounts_created_surviving', case when n >= 5 or n = 0 then n end) order by day), '[]'::jsonb)
    into v_signups
    from (select (created_at at time zone 'UTC')::date as day, count(*) as n
            from auth.users where created_at >= v_from_ts and created_at < v_to_ts
            group by 1) s;

  select jsonb_build_object(
      'total_accounts', (select case when n >= 5 or n = 0 then n end from (select count(*) as n
          from auth.users where created_at < v_to_ts) t),
      'active_7d', (select case when n >= 5 or n = 0 then n end from (select count(distinct user_id) as n
          from public.log_entries where deleted_at is null
            and local_date between v_today - 6 and v_today) t),
      'active_30d', (select case when n >= 5 or n = 0 then n end from (select count(distinct user_id) as n
          from public.log_entries where deleted_at is null
            and local_date between v_today - 29 and v_today) t))
    into v_totals;

  select coalesce(jsonb_agg(jsonb_build_object('day', day,
           'active_accounts', case when accounts >= 5 then accounts end,
           'entries', case when accounts >= 5 then entries end) order by day), '[]'::jsonb)
    into v_active
    from (select local_date as day, count(distinct user_id) as accounts, count(*) as entries
            from public.log_entries
            where deleted_at is null and local_date between v_from and v_today
            group by 1) s;

  select coalesce(jsonb_agg(jsonb_build_object('day', day, 'method', method,
           'entries', case when entries >= 5 then entries end,
           'accounts', case when accounts >= 5 then accounts end) order by day, method), '[]'::jsonb)
    into v_methods
    from (select local_date as day, method, count(*) as entries, count(distinct user_id) as accounts
            from public.log_entries
            where deleted_at is null and local_date between v_from and v_today
            group by 1, 2) s;

  select coalesce(jsonb_agg(jsonb_build_object('day', day, 'purpose', purpose, 'status', status,
           'calls', case when calls >= 5 then calls end,
           'input_tokens', case when calls >= 5 then input_tokens end,
           'output_tokens', case when calls >= 5 then output_tokens end,
           'cost_estimate', case when calls >= 5 then cost end,
           'p50_latency_ms', case when lat_n >= 10 then p50 end,
           'p95_latency_ms', case when lat_n >= 10 then p95 end) order by day, purpose, status), '[]'::jsonb)
    into v_ai
    from (select (created_at at time zone 'UTC')::date as day,
                 case when purpose = any (v_purposes) then purpose else 'other' end as purpose,
                 case when status = 'ok' then 'ok' else 'failed' end as status,
                 count(*) as calls, count(latency_ms) as lat_n,
                 coalesce(sum(input_tokens), 0) as input_tokens,
                 coalesce(sum(output_tokens), 0) as output_tokens,
                 coalesce(sum(cost_estimate), 0) as cost,
                 percentile_cont(0.5) within group (order by latency_ms) as p50,
                 percentile_cont(0.95) within group (order by latency_ms) as p95
            from public.ai_calls
            where created_at >= v_from_ts and created_at < v_to_ts
            group by 1, 2, 3) s;

  select coalesce(jsonb_agg(jsonb_build_object('day', day, 'purpose', purpose,
           'total_calls', case when total >= 5 then total end,
           'failed_calls', case when total >= 5 and (failed >= 5 or failed = 0) then failed end)
           order by day, purpose), '[]'::jsonb)
    into v_coach
    from (select (created_at at time zone 'UTC')::date as day, purpose,
                 count(*) as total, count(*) filter (where status <> 'ok') as failed
            from (select created_at, status, purpose from public.ai_calls
                   where created_at >= v_from_ts and created_at < v_to_ts
                     and purpose = any (v_purposes) and purpose like 'coach%') c
            group by 1, 2) s;

  select coalesce(jsonb_agg(jsonb_build_object('day', day, 'fallback_reason', fallback_reason,
           'fast_path_taken', fast_path_taken,
           'events', case when events >= 5 then events end,
           'p50_latency_ms', case when events >= 10 then p50 end,
           'p95_latency_ms', case when events >= 10 then p95 end)
           order by day, fallback_reason, fast_path_taken), '[]'::jsonb)
    into v_fallbacks
    from (select (created_at at time zone 'UTC')::date as day, fallback_reason, fast_path_taken,
                 count(*) as events,
                 percentile_cont(0.5) within group (order by latency_ms) as p50,
                 percentile_cont(0.95) within group (order by latency_ms) as p95
            from public.coach_intent_events
            where created_at >= v_from_ts and created_at < v_to_ts
            group by 1, 2, 3) s;

  select coalesce(jsonb_agg(jsonb_build_object('day', day, 'path', path, 'step', step,
           'samples', case when samples >= 5 then samples end,
           'p50_ms', case when samples >= 10 then p50 end,
           'p95_ms', case when samples >= 10 then p95 end) order by day, path, step), '[]'::jsonb)
    into v_timings
    from (select (created_at at time zone 'UTC')::date as day, path, step, count(*) as samples,
                 percentile_cont(0.5) within group (order by ms) as p50,
                 percentile_cont(0.95) within group (order by ms) as p95
            from public.client_timings
            where created_at >= v_from_ts and created_at < v_to_ts
            group by 1, 2, 3) s;

  select coalesce(jsonb_agg(jsonb_build_object('day', day,
           'feedback_count', case when n >= 5 then n end) order by day), '[]'::jsonb)
    into v_feedback
    from (select (created_at at time zone 'UTC')::date as day, count(*) as n
            from public.feedback where created_at >= v_from_ts and created_at < v_to_ts
            group by 1) s;

  return jsonb_build_object(
    'generated_at', (now() at time zone 'UTC'),
    'days', v_days, 'from', v_from, 'to', v_today,
    'suppression', jsonb_build_object('min_count', 5, 'min_samples_for_percentiles', 10),
    'notes', jsonb_build_object(
      'accounts_created_surviving', 'Counts auth.users rows that still exist. The repo records no signup or deletion event, so deleted accounts drop out and past days can shrink.',
      'coach_call_failures_by_purpose_by_day', 'Model-call attempts per allowlisted purpose, never one pooled coach rate. A call that failed and then recovered still counts as failed. For turn-level outcomes read coach_fallbacks_by_day.'),
    'totals', v_totals,
    'signups_by_day', v_signups,
    'active_accounts_by_day', v_active,
    'log_entries_by_day_method', v_methods,
    'ai_calls_by_day', v_ai,
    'coach_call_failures_by_purpose_by_day', v_coach,
    'coach_fallbacks_by_day', v_fallbacks,
    'client_timings_by_day', v_timings,
    'feedback_by_day', v_feedback);
end
$fn$;

revoke all on function public.ops_metrics_snapshot(int) from public, anon, authenticated;
grant execute on function public.ops_metrics_snapshot(int) to service_role;
