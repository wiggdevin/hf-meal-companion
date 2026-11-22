-- W060 / Phase 12 (docs/specs/phase-12-coach-tools.md section 1): the checked target writer.
--
-- Until now every target write trusted the macros and the floors the caller sent. The app clamped
-- a request to the floors in TypeScript (lib/server/targets.ts) and a stored `kcal_min` of 1,650
-- was a default, not a rule. This file puts the floor rule into the database, in one place that
-- every app path calls, and makes a value below it a refusal instead of a silent raise.
--
-- WHAT IT ADDS (nothing existing is dropped or changed, except approve_target_proposal, below)
--   account_body_mass_kg(uuid, date)  the weight the floors use (device over manual, last of the
--                                     local day, kg, on or before the date; else the profile weight)
--   account_floor(uuid, numeric, jsonb)  protein, fat and kcal minimum for that weight
--   write_target_revision_checked(uuid, jsonb, jsonb)
--   write_target_revision_if_active_checked(uuid, jsonb, uuid, bigint)
--   approve_target_proposal  now writes through the checked writer
--
-- THE FLOOR RULE (same as lib/profile/energy.ts deriveTargets and lib/profile/rate-goal.ts)
--   protein minimum = round(proteinBasisKg(weight, height) x 2.0)  for lose_fat and recomp,
--                     x 1.8 for the other goals, x 0.8 under a kidney pace hold (standard protein)
--   fat minimum     = 50 g
--   kcal minimum    = 4 x protein minimum + 9 x 50 + 4 x 100   (macroMinimumKcal)
--   carbohydrate: not checked (stored minimum 100)
--   proteinBasisKg  = least(weight, 30 x (height in m)^2)
--
-- THE CHECKS (in one transaction, under the user_settings lock and the per-user target lock)
--   0. a request_id already in change_log returns the stored result, before any other check
--   1. no profile (sex, birth year, height, goal, a weight)  -> SF002 profile_required
--   2. a pin below the calorie or protein minimum            -> SF001 below_floor
--   3. a negative macro, or kcal off 4p+4c+9f by more than 9 -> SF004 (detail.reason)
--   4. kcal, fat or protein below the minimum                -> SF001 below_floor, first failing
--      value only, detail {"floor","dayType","minimum"}
--   The row is then stored by write_target_revision with the minima this function computed
--   (kcal_min_source = 'macro_minimum'); any minimum the caller sent is ignored.
--   In a pair write (p_predecessor) only p_row is checked; the predecessor is the row an Undo would
--   restore, and is checked if and when it is restored. It may not be dated after p_row (the
--   active reader takes the newest date first), and a replay never inserts a predecessor.
--   A day with a missing macro or a non-object macros value is SF004 invalid_macros.
--
-- Profile the floors are judged on. A derive request reaches the server before the phone has
-- synced the profile edit it was derived from (onboarding, or a goal or height change). The route
-- therefore sends the settings the target was derived from as p_row.floor_profile
-- {sex, birth_year, height_cm, weight_kg, goal}. For height and goal the floor_profile value wins
-- over the stored one (the target is judged against the profile it was derived from, so a
-- lose_fat to maintain edit is not refused at the old goal's protein); sex and birth year are
-- only checked present; the weight is the weigh-in log first, then floor_profile.weight_kg.
-- Pace-cleared copy. A row with floor_exempt = 'pace_cleared_copy' and a pace of 0 skips the
-- profile and floor checks (macros are still checked for NULLs, negatives and the Atwater sum) and
-- keeps its own minima. The server recompute uses it to end a paced revision's pace when a hold
-- begins on an account whose profile cannot derive: ending the pace must never be refused.
--
-- PRIVILEGES. service_role only, like the old writers (20261228090000). account_floor gets no
-- grant: the writer is its only caller.
--
-- ORDER OF APPLY (release owner): apply this file BEFORE deploying the app build that calls these
-- functions. The previous build keeps working after it (the old writers stay callable by
-- service_role). Applying it to production is not part of the PR that adds it.
set local lock_timeout = '3s';

-- ---------------------------------------------------------------------------------------------
-- The weight the floors use. Mirrors lib/health/daily.ts rollUpDay (a scale reading beats a typed
-- one on the same local date; the last of the day wins) and lib/today/water-and-weight.ts
-- latestWeighInKg (the latest date on or before the effective date), in kg to three decimals.
create or replace function public.account_body_mass_kg(
  p_user_id uuid, p_effective_date date default null
) returns table (kg numeric, sample_id uuid)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_day date := coalesce(p_effective_date, public._account_local_date(p_user_id));
  v_profile_kg numeric;
begin
  return query
    with s as (
      select hs.id, hs.start_time,
        (hs.start_time at time zone hs.tz)::date as local_date,
        coalesce(src.kind, 'unknown') <> 'manual' as ingest,
        case lower(btrim(hs.unit))
          when 'kg' then hs.value
          when 'lb' then round(hs.value / 2.2046226218, 6)
          when 'lbs' then round(hs.value / 2.2046226218, 6)
          when 'g' then round(hs.value / 1000, 6)
        end as kg6
      from public.health_samples hs
      left join public.health_sources src on src.id = hs.source_id
      where hs.user_id = p_user_id and hs.type = 'body_mass'
    ), per_day as (
      select distinct on (s.local_date) s.id, s.local_date, s.kg6
      from s
      where s.kg6 is not null and s.kg6 > 0
      order by s.local_date, s.ingest desc, s.start_time desc, s.id
    )
    select round(d.kg6, 3), d.id
    from per_day d
    where d.local_date <= v_day
    order by d.local_date desc
    limit 1;
  if found then return; end if;
  select us.weight_kg into v_profile_kg from public.user_settings us where us.user_id = p_user_id;
  return query select case when v_profile_kg > 0 then v_profile_kg end, null::uuid;
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- The three minima for one weight. Height and goal come from the stored profile, else from
-- p_profile (the first-write fallback described above). A kidney pace hold (the words in
-- lib/profile/rate-eligibility.ts CONDITION_PATTERNS.kidney, or the ckd dietary profiles) takes
-- standard protein, as deriveTargets does.
create or replace function public.account_floor(
  p_user_id uuid, p_weight_kg numeric, p_profile jsonb default null
) returns table (protein_g_min numeric, fat_g_min numeric, kcal_min integer)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_height numeric;
  v_goal text;
  v_kidney boolean;
  v_factor double precision;
  v_protein numeric;
begin
  select coalesce(nullif(p_profile->>'height_cm', '')::numeric, us.height_cm),
         coalesce(nullif(p_profile->>'goal', ''), us.goal)
    into v_height, v_goal
    from (select 1) one
    left join public.user_settings us on us.user_id = p_user_id;
  if p_weight_kg is null or p_weight_kg <= 0 or v_height is null or v_height <= 0
     or v_goal is null then
    raise exception 'profile_required' using errcode = 'SF002';
  end if;
  v_kidney :=
    exists (select 1 from public.constraint_profiles cp, unnest(cp.conditions) as c(text)
              where cp.user_id = p_user_id
                and c.text ~* '\ykidney|\yrenal\y|dialysis|\yckd\y')
    or exists (select 1 from public.user_dietary_profiles dp
                 where dp.user_id = p_user_id and dp.profile_id in ('ckd', 'ckd_dialysis'));
  v_factor := case when v_kidney then 0.8
                   when v_goal in ('lose_fat', 'recomp') then 2.0
                   else 1.8 end;
  -- Math.round(min(weight, 30 x (height/100)^2) x factor): half rounds up, in double precision.
  v_protein := floor(least(p_weight_kg::double precision,
                           30 * power(v_height::double precision / 100, 2)) * v_factor
                     + 0.5)::numeric;
  return query select v_protein, 50::numeric, (4 * v_protein + 9 * 50 + 4 * 100)::integer;
end;
$$;

-- ---------------------------------------------------------------------------------------------
create or replace function public.write_target_revision_checked(
  p_user_id uuid, p_row jsonb, p_predecessor jsonb default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_settings user_settings%rowtype;
  v_fallback jsonb := case when jsonb_typeof(p_row->'floor_profile') = 'object'
                           then p_row->'floor_profile' else '{}'::jsonb end;
  v_request_id uuid := nullif(p_row->>'request_id', '')::uuid;
  v_pred_request_id uuid := nullif(p_predecessor->>'request_id', '')::uuid;
  v_existing jsonb;
  v_existing_pred jsonb;
  v_weight numeric;
  v_floor record;
  v_floors jsonb;
  v_day text;
  v_macros jsonb;
  v_pin_kcal numeric;
  v_kcal numeric;
  v_protein numeric;
  v_carbs numeric;
  v_fat numeric;
  v_macro_kcal numeric;
  v_pred jsonb;
  v_rev jsonb;
  v_exempt boolean;
begin
  perform _sync_assert_caller(p_user_id);
  if p_row->'training_macros' is null or p_row->'rest_macros' is null then
    raise exception 'target_macros_required' using errcode = '22023';
  end if;
  -- Same order as apply_sync_op and the other settings writers: settings lock, then target lock.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':user_settings:settings', 0));
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  -- 0. A retry of a write that committed returns its result, whatever the profile says now.
  if v_request_id is not null then
    select current into v_existing from change_log
      where user_id = p_user_id and entity = 'target_profiles' and op_id = v_request_id;
    if found then
      if p_predecessor is null then return v_existing; end if;
      if v_pred_request_id is not null then
        select current into v_existing_pred from change_log
          where user_id = p_user_id and entity = 'target_profiles' and op_id = v_pred_request_id;
      end if;
      -- A replay never inserts: the predecessor is the revision written just before this one.
      if v_existing_pred is null then
        select to_jsonb(tp) into v_existing_pred from target_profiles tp
          where tp.user_id = p_user_id and tp.rev = (v_existing->>'rev')::integer - 1;
      end if;
      return jsonb_build_object('predecessor', v_existing_pred, 'revision', v_existing);
    end if;
  end if;

  -- 1. The profile the floors need.
  select * into v_settings from user_settings where user_id = p_user_id;
  v_exempt := coalesce(p_row->>'floor_exempt', '') = 'pace_cleared_copy'
    and coalesce((p_row->>'goal_rate_bp_week')::integer, 0) = 0;
  if not v_exempt and (
     coalesce(v_settings.sex, nullif(v_fallback->>'sex', '')) is null
     or coalesce(v_settings.birth_year, nullif(v_fallback->>'birth_year', '')::integer) is null
     or coalesce(nullif(v_fallback->>'height_cm', '')::numeric, v_settings.height_cm) is null
     or coalesce(nullif(v_fallback->>'goal', ''), v_settings.goal) is null) then
    raise exception 'profile_required' using errcode = 'SF002';
  end if;
  -- The predecessor is history: it is never judged, so it must never be the active revision. It
  -- may not be dated after the revision, or the active reader (newest date first) would pick it.
  if p_predecessor is not null
     and (p_predecessor->>'effective_from')::date > (p_row->>'effective_from')::date then
    raise exception 'predecessor_after_revision' using errcode = '22023';
  end if;
  if not v_exempt then
    select w.kg into v_weight
      from account_body_mass_kg(p_user_id, (p_row->>'effective_from')::date) w;
    v_weight := coalesce(v_weight, nullif(v_fallback->>'weight_kg', '')::numeric);
    select * into v_floor from account_floor(p_user_id, v_weight, v_fallback);
  else
    select null::numeric as protein_g_min, null::numeric as fat_g_min,
           null::integer as kcal_min into v_floor;
  end if;

  -- 2. A pin below a minimum is refused even when the resolved day was clamped above it.
  v_pin_kcal := (p_row->>'pin_training_kcal')::numeric;
  if not v_exempt and v_pin_kcal is not null and v_pin_kcal < v_floor.kcal_min then
    raise exception 'below_floor' using errcode = 'SF001', detail = jsonb_build_object(
      'floor', 'kcal', 'dayType', 'training', 'minimum', v_floor.kcal_min)::text;
  end if;
  v_pin_kcal := (p_row->>'pin_rest_kcal')::numeric;
  if not v_exempt and v_pin_kcal is not null and v_pin_kcal < v_floor.kcal_min then
    raise exception 'below_floor' using errcode = 'SF001', detail = jsonb_build_object(
      'floor', 'kcal', 'dayType', 'rest', 'minimum', v_floor.kcal_min)::text;
  end if;
  if not v_exempt and (p_row->>'pin_protein_g')::numeric is not null
     and (p_row->>'pin_protein_g')::numeric < v_floor.protein_g_min then
    raise exception 'below_floor' using errcode = 'SF001', detail = jsonb_build_object(
      'floor', 'protein', 'dayType', 'training', 'minimum', v_floor.protein_g_min)::text;
  end if;

  -- 3 and 4. Each day of p_row (never the predecessor).
  foreach v_day in array array['training', 'rest'] loop
    v_macros := p_row->(v_day || '_macros');
    v_kcal := (v_macros->>'kcal')::numeric;
    v_protein := (v_macros->>'protein')::numeric;
    v_carbs := (v_macros->>'carbs')::numeric;
    v_fat := (v_macros->>'fat')::numeric;
    -- A day without all four numbers cannot be judged (a NULL compares as neither true nor false).
    if jsonb_typeof(v_macros) is distinct from 'object'
       or v_kcal is null or v_protein is null or v_carbs is null or v_fat is null then
      raise exception 'invalid_macros' using errcode = 'SF004', detail = jsonb_build_object(
        'reason', 'invalid_macros', 'dayType', v_day)::text;
    end if;
    if v_protein < 0 or v_carbs < 0 or v_fat < 0 then
      raise exception 'invalid_macros' using errcode = 'SF004', detail = jsonb_build_object(
        'reason', 'negative_macro', 'dayType', v_day, 'kcal', v_kcal,
        'protein', v_protein, 'carbs', v_carbs, 'fat', v_fat)::text;
    end if;
    v_macro_kcal := 4 * v_protein + 4 * v_carbs + 9 * v_fat;
    if abs(v_kcal - v_macro_kcal) > 9 then
      raise exception 'kcal_mismatch' using errcode = 'SF004', detail = jsonb_build_object(
        'reason', 'kcal_mismatch', 'dayType', v_day, 'kcal', v_kcal,
        'macroKcal', v_macro_kcal)::text;
    end if;
    if not v_exempt and v_kcal < v_floor.kcal_min then
      raise exception 'below_floor' using errcode = 'SF001', detail = jsonb_build_object(
        'floor', 'kcal', 'dayType', v_day, 'minimum', v_floor.kcal_min)::text;
    end if;
    if not v_exempt and v_fat < v_floor.fat_g_min then
      raise exception 'below_floor' using errcode = 'SF001', detail = jsonb_build_object(
        'floor', 'fat', 'dayType', v_day, 'minimum', v_floor.fat_g_min)::text;
    end if;
    if not v_exempt and v_protein < v_floor.protein_g_min then
      raise exception 'below_floor' using errcode = 'SF001', detail = jsonb_build_object(
        'floor', 'protein', 'dayType', v_day, 'minimum', v_floor.protein_g_min)::text;
    end if;
  end loop;

  -- 6. Store with the minima this function computed; the caller's own are replaced.
  -- A pace-cleared copy keeps the minima of the revision it copies.
  v_floors := case when v_exempt then '{}'::jsonb else jsonb_build_object(
    'kcal_min', v_floor.kcal_min, 'protein_g_min', v_floor.protein_g_min,
    'fat_g_min', v_floor.fat_g_min, 'carb_g_min', 100, 'kcal_min_source', 'macro_minimum') end;
  if p_predecessor is not null then
    v_pred := write_target_revision(p_user_id, p_predecessor || v_floors);
  end if;
  v_rev := write_target_revision(p_user_id, p_row || v_floors);
  if p_predecessor is null then return v_rev; end if;
  return jsonb_build_object('predecessor', v_pred, 'revision', v_rev);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- The server recompute's conditional write (20261208100000), through the checked writer. It takes
-- the settings lock BEFORE the target lock, as the checked writer does, so the two cannot
-- deadlock. Otherwise the body is write_target_revision_if_active's.
create or replace function public.write_target_revision_if_active_checked(
  p_user_id uuid, p_row jsonb, p_expected_id uuid, p_expected_settings_rev bigint default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_active uuid;
  v_settings_rev bigint;
begin
  perform _sync_assert_caller(p_user_id);
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':user_settings:settings', 0));
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));
  select id into v_active from target_profiles
    where user_id = p_user_id and effective_from <= (p_row->>'effective_from')::date
    order by effective_from desc, rev desc
    limit 1;
  if p_expected_settings_rev is not null then
    select rev into v_settings_rev from user_settings where user_id = p_user_id for update;
  end if;
  if v_active is distinct from p_expected_id
     or (p_expected_settings_rev is not null and v_settings_rev is distinct from p_expected_settings_rev)
     or exists (select 1 from target_profiles where user_id = p_user_id
                and effective_from > (p_row->>'effective_from')::date) then
    return jsonb_build_object('conflict', true, 'active_id', v_active);
  end if;
  return write_target_revision_checked(p_user_id, p_row, null);
end;
$$;

-- ---------------------------------------------------------------------------------------------
-- Proposal approval writes through the checked writer. The body is patched from the live
-- definition (the same anchored pattern as 20261231130000): one anchor, which must occur once.
-- A refusal inside the transaction rolls the approval back and leaves the proposal pending.
do $migration$
declare
  definition text;
  patched text;
  write_from constant text := 'null::target_profiles, write_target_revision(p_user_id, v_payload));';
  write_to constant text := 'null::target_profiles, write_target_revision_checked(p_user_id, v_payload));';
  lock_from constant text := 'perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));';
  lock_to constant text :=
    'perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || '':user_settings:settings'', 0));'
    || E'\n  ' || lock_from;
  occurrences integer;
begin
  select pg_get_functiondef('public.approve_target_proposal(uuid,uuid)'::regprocedure)
    into definition;
  patched := definition;
  if position('write_target_revision_checked' in patched) = 0 then
    occurrences := (length(patched) - length(replace(patched, write_from, ''))) / length(write_from);
    if occurrences <> 1 then
      raise exception 'w060 (approve_target_proposal): write anchor occurs % times, expected once; refusing a partial function',
        occurrences;
    end if;
    patched := replace(patched, write_from, write_to);
  end if;
  -- The checked writer takes the settings lock, then the target lock. Approval took the target
  -- lock first, so a concurrent checked write and approval could each wait on the other (40P01).
  -- Approval now takes the settings lock first, in the same order as every other writer.
  if position(':user_settings:settings' in patched) = 0 then
    occurrences := (length(patched) - length(replace(patched, lock_from, ''))) / length(lock_from);
    if occurrences <> 1 then
      raise exception 'w060 (approve_target_proposal): lock anchor occurs % times, expected once; refusing a partial function',
        occurrences;
    end if;
    patched := replace(patched, lock_from, lock_to);
  end if;
  if patched <> definition then
    execute patched;
  end if;
end;
$migration$;

-- ---------------------------------------------------------------------------------------------
-- Privileges. PostgreSQL grants EXECUTE to PUBLIC on a new function; take it away explicitly.
revoke all on function public.account_body_mass_kg(uuid, date) from public, anon, authenticated;
revoke all on function public.account_floor(uuid, numeric, jsonb) from public, anon, authenticated;
revoke all on function public.write_target_revision_checked(uuid, jsonb, jsonb)
  from public, anon, authenticated;
revoke all on function public.write_target_revision_if_active_checked(uuid, jsonb, uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.account_body_mass_kg(uuid, date) to service_role;
grant execute on function public.write_target_revision_checked(uuid, jsonb, jsonb) to service_role;
grant execute on function public.write_target_revision_if_active_checked(uuid, jsonb, uuid, bigint)
  to service_role;
-- approve_target_proposal keeps its grants: create or replace does not reset them.
