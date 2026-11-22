-- W043 (scale step 3, audit batch): ONE budget lock for every spend writer, taken before any row lock.
--
-- Why. The ceiling is the sum of 16 shard rows plus every open hold. reserve_split read that sum
-- after locking only the caller's shard, so two accounts on different shards could each read a
-- total below the cap and both reserve (a cross-shard overshoot). And delete_account deleted a
-- user's reservation rows before it ever took a shard lock, while settle takes the shard first and
-- the reservation second: a lock-order deadlock. Row-level order cannot fix both. A transaction
-- advisory lock taken FIRST makes every spend writer serial: ai_spend_reserve_split (and the
-- five-argument wrapper through it), ai_spend_settle, ai_spend_sweep and delete_account. Spend
-- calls are a few per second at most and each critical section is a handful of indexed statements,
-- so the serialisation costs microseconds. `_ai_spend_lock()` is the single place the key lives.
--
-- Time. After the lock each function reads clock_timestamp() ONCE and derives the UTC budget day,
-- the hold's expires_at, settled_at and every expiry comparison from it. An unsettled hold is
-- expired when expires_at <= that instant, in reserve, reconcile, sweep and the expired count.
--
-- Counting (unchanged from 20270103090000; an earlier draft of this PR filtered expired holds out
-- and was dropped because an expired hold may still be running): the totals are
-- settled spend plus ALL unsettled holds, expired or not. An expired hold stops counting only when
-- reconcile settles it at its real cost, so a function that died still counts its full hold until
-- the sweep or the account's next reserve reconciles it. The ceiling can only over-refuse by
-- the unswept holds, never over-spend; the spend-sweep cron now sweeps every tick.
--
-- Replaces function bodies only (no table change): _ai_spend_lock (new), _ai_spend_reconcile
-- (now takes the shared instant; the one-argument form is dropped, nothing but these functions
-- called it), ai_spend_reserve_split, ai_spend_settle, ai_spend_sweep, ai_spend_expired_count,
-- delete_account. EXECUTE stays service_role only on every one. Live-safe; old and new builds
-- call the same signatures. Down: supabase/migrations/down/20270109090100_ai_spend_single_lock.down.sql.
set local lock_timeout = '3s';
set local statement_timeout = '30s';

-- The predecessors must exist exactly as the earlier migrations created them.
do $$
begin
  if to_regprocedure('public.ai_spend_reserve_split(uuid, numeric, numeric, numeric, integer, boolean, numeric, numeric)') is null
     or to_regprocedure('public.ai_spend_reserve(uuid, numeric, numeric, numeric, integer)') is null
     or to_regprocedure('public.ai_spend_settle(uuid, numeric)') is null
     or to_regprocedure('public.ai_spend_sweep(integer)') is null
     or to_regprocedure('public.ai_spend_expired_count()') is null
     or to_regprocedure('public._ai_spend_reconcile(uuid)') is null
     or to_regprocedure('public._ai_spend_lock_day(uuid, date, boolean)') is null
     or to_regprocedure('public._ai_spend_charge(uuid, date, numeric)') is null
     or to_regprocedure('public.delete_account(uuid)') is null then
    raise exception 'ai_spend_single_lock: predecessor spend functions (20261218090100, 20270103090000, 20270104140000, 20261231230000) are missing';
  end if;
end $$;

-- The one budget lock. Every spend writer calls it before touching any spend row.
create function public._ai_spend_lock() returns void
  language sql security definer set search_path = '' as $$
  select pg_advisory_xact_lock(7740430001::bigint);
$$;

-- Reconciles one expired, unsettled hold at the caller's instant p_now: charges the call's ai_calls
-- cost when a row names the reservation, else the whole hold. The caller holds _ai_spend_lock().
-- Never creates a day row (a missing day means its history was pruned: nothing is charged).
create function public._ai_spend_reconcile(p_reservation_id uuid, p_now timestamptz) returns boolean
  language plpgsql security definer set search_path = '' as $$
declare
  v_user_id uuid;
  v_day date;
  v_amount numeric;
  v_present boolean;
  v_charge numeric;
begin
  select r.user_id, r.day, r.amount_usd into v_user_id, v_day, v_amount
    from public.ai_spend_reservations r
   where r.id = p_reservation_id and r.settled_at is null and r.expires_at <= p_now;
  if not found then
    return false;
  end if;
  select l.present into v_present from public._ai_spend_lock_day(v_user_id, v_day, false) l;
  perform 1 from public.ai_spend_reservations
   where id = p_reservation_id and settled_at is null for update;
  if not found then
    return false;
  end if;
  select sum(greatest(c.cost_estimate, 0)) into v_charge from public.ai_calls c
   where c.spend_reservation_id = p_reservation_id;
  v_charge := coalesce(v_charge, v_amount);
  update public.ai_spend_reservations
     set settled_at = p_now, actual_usd = v_charge, settled_by = 'reconcile'
   where id = p_reservation_id;
  if v_present then
    perform public._ai_spend_charge(v_user_id, v_day, v_charge);
  end if;
  return true;
end $$;

create or replace function public.ai_spend_reserve_split(
  p_user_id uuid, p_amount_usd numeric, p_user_cap_usd numeric, p_global_cap_usd numeric,
  p_ttl_seconds integer, p_background boolean, p_background_cap_usd numeric,
  p_interactive_reserve_usd numeric)
  returns table (reservation_id uuid, allowed boolean, reason text,
                 user_committed_usd numeric, global_committed_usd numeric)
  language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz;
  v_day date;
  v_user_spent numeric;
  v_global_spent numeric;
  v_user numeric;
  v_global numeric;
  v_user_background numeric;
  v_background numeric;
  v_expired uuid;
  v_id uuid;
begin
  if p_user_id is null then
    raise exception 'ai_spend_reserve_split: user required' using errcode = '22023';
  end if;
  if p_amount_usd is null or p_amount_usd < 0 or p_amount_usd = 'NaN'::numeric
     or p_user_cap_usd is null or p_user_cap_usd = 'NaN'::numeric
     or p_global_cap_usd is null or p_global_cap_usd = 'NaN'::numeric
     or p_background is null
     or p_background_cap_usd is null or p_background_cap_usd = 'NaN'::numeric
     or p_interactive_reserve_usd is null or p_interactive_reserve_usd < 0
     or p_interactive_reserve_usd = 'NaN'::numeric then
    raise exception 'ai_spend_reserve_split: amount, caps and reserve must be numbers, amount and reserve >= 0'
      using errcode = '22023';
  end if;
  if p_ttl_seconds is null or p_ttl_seconds not between 30 and 900 then
    raise exception 'ai_spend_reserve_split: ttl 30-900 s' using errcode = '22023';
  end if;

  perform public._ai_spend_lock();
  v_now := clock_timestamp();
  v_day := (v_now at time zone 'utc')::date;
  perform public._ai_spend_lock_day(p_user_id, v_day, true);
  -- The caller's own abandoned holds for today, reconciled under the locks already held.
  for v_expired in
    select r.id from public.ai_spend_reservations r
     where r.user_id = p_user_id and r.day = v_day and r.settled_at is null and r.expires_at <= v_now
     order by r.expires_at limit 100
  loop
    perform public._ai_spend_reconcile(v_expired, v_now);
  end loop;

  -- ONE statement, one snapshot: settled spend and every open hold (expired or not, until
  -- reconciled), the user's and everyone's, and what background calls have committed (settled
  -- actuals plus open holds), the user's and everyone's.
  select u.spent_usd,
         u.spent_usd + coalesce((select sum(r.amount_usd) from public.ai_spend_reservations r
           where r.user_id = p_user_id and r.day = v_day and r.settled_at is null), 0),
         (select coalesce(sum(g.spent_usd), 0) from public.ai_spend_global_days g where g.day = v_day),
         (select coalesce(sum(g.spent_usd), 0) from public.ai_spend_global_days g where g.day = v_day)
           + coalesce((select sum(r.amount_usd) from public.ai_spend_reservations r
               where r.day = v_day and r.settled_at is null), 0),
         coalesce((select sum(coalesce(r.actual_usd, r.amount_usd)) from public.ai_spend_reservations r
           where r.background and r.day = v_day and r.user_id = p_user_id), 0),
         coalesce((select sum(coalesce(r.actual_usd, r.amount_usd)) from public.ai_spend_reservations r
           where r.background and r.day = v_day), 0)
    into v_user_spent, v_user, v_global_spent, v_global, v_user_background, v_background
    from public.ai_spend_user_days u where u.user_id = p_user_id and u.day = v_day;

  if p_user_cap_usd <= 0 or v_user_spent >= p_user_cap_usd
     or v_user + p_amount_usd > p_user_cap_usd then
    return query select null::uuid, false, 'user_cap'::text, v_user, v_global;
    return;
  end if;
  if p_global_cap_usd <= 0 or v_global_spent >= p_global_cap_usd
     or v_global + p_amount_usd > p_global_cap_usd then
    return query select null::uuid, false, 'global_cap'::text, v_user, v_global;
    return;
  end if;
  if p_background then
    if p_user_cap_usd - p_interactive_reserve_usd <= 0
       or v_user_background + p_amount_usd > p_user_cap_usd - p_interactive_reserve_usd then
      return query select null::uuid, false, 'background_user_cap'::text, v_user, v_global;
      return;
    end if;
    if p_background_cap_usd <= 0 or v_background + p_amount_usd > p_background_cap_usd then
      return query select null::uuid, false, 'background_cap'::text, v_user, v_global;
      return;
    end if;
  end if;

  insert into public.ai_spend_reservations (user_id, day, amount_usd, expires_at, background)
  values (p_user_id, v_day, p_amount_usd, v_now + make_interval(secs => p_ttl_seconds), p_background)
  returning id into v_id;
  return query select v_id, true, null::text, v_user + p_amount_usd, v_global + p_amount_usd;
end $$;

create or replace function public.ai_spend_settle(p_reservation_id uuid, p_actual_usd numeric)
  returns boolean
  language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz;
  v_user_id uuid;
  v_day date;
  v_present boolean;
  v_by text;
  v_prior numeric;
begin
  if p_reservation_id is null or p_actual_usd is null or p_actual_usd < 0
     or p_actual_usd = 'NaN'::numeric then
    raise exception 'ai_spend_settle: reservation and actual >= 0 required' using errcode = '22023';
  end if;
  perform public._ai_spend_lock();
  v_now := clock_timestamp();
  select r.user_id, r.day into v_user_id, v_day from public.ai_spend_reservations r
   where r.id = p_reservation_id;
  if not found then
    return false;
  end if;
  select l.present into v_present from public._ai_spend_lock_day(v_user_id, v_day, false) l;
  select r.settled_by, r.actual_usd into v_by, v_prior from public.ai_spend_reservations r
   where r.id = p_reservation_id for update;
  if v_by = 'client' then
    return false;
  end if;
  update public.ai_spend_reservations
     set settled_at = coalesce(settled_at, v_now), actual_usd = p_actual_usd, settled_by = 'client'
   where id = p_reservation_id;
  -- Unsettled: charge the actual cost. Reconciled: charge only the difference from what the sweep
  -- charged, so nothing is counted twice.
  if v_present then
    perform public._ai_spend_charge(v_user_id, v_day, p_actual_usd - coalesce(v_prior, 0));
  end if;
  return true;
end $$;

-- Returns how many expired holds it reconciled plus rows it pruned. The cron runs one bounded
-- sweep every tick and loops while ai_spend_expired_count reports more.
create or replace function public.ai_spend_sweep(p_max integer default 200) returns integer
  language plpgsql security definer set search_path = '' as $$
declare
  v_max integer := greatest(1, least(coalesce(p_max, 200), 2000));
  v_now timestamptz;
  v_done integer := 0;
  v_deleted integer;
  r record;
begin
  perform public._ai_spend_lock();
  v_now := clock_timestamp();
  -- Oldest day first, so a hold older than the 40-day history is reconciled (and later pruned)
  -- before its day rows can go.
  for r in
    select x.id from public.ai_spend_reservations x
     where x.settled_at is null and x.expires_at <= v_now
     order by x.day, public._ai_spend_shard(x.user_id), x.user_id, x.id limit v_max
  loop
    if public._ai_spend_reconcile(r.id, v_now) then
      v_done := v_done + 1;
    end if;
  end loop;

  delete from public.ai_spend_reservations x
   where x.ctid = any (array(
     select y.ctid from public.ai_spend_reservations y
      where y.settled_at is not null and y.created_at < v_now - interval '2 days'
      order by y.created_at limit v_max for update skip locked));
  get diagnostics v_deleted = row_count;
  v_done := v_done + v_deleted;
  -- History older than 40 days, only once no reservation names that day.
  delete from public.ai_spend_user_days u
   where u.ctid = any (array(
     select y.ctid from public.ai_spend_user_days y
      where y.day < (v_now at time zone 'utc')::date - 40
        and not exists (select 1 from public.ai_spend_reservations x where x.day = y.day)
      limit v_max for update skip locked));
  get diagnostics v_deleted = row_count;
  v_done := v_done + v_deleted;
  delete from public.ai_spend_global_days g
   where g.day < (v_now at time zone 'utc')::date - 40
     and not exists (select 1 from public.ai_spend_reservations x where x.day = g.day)
     and not exists (select 1 from public.ai_spend_user_days u where u.day = g.day);
  get diagnostics v_deleted = row_count;
  return v_done + v_deleted;
end $$;

-- How many expired holds still wait for reconciliation. Read-only; the same <= test as the sweep.
create or replace function public.ai_spend_expired_count() returns integer
  language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.ai_spend_reservations
   where settled_at is null and expires_at <= clock_timestamp();
$$;

create or replace function public.delete_account(p_user_id uuid) returns jsonb
  language plpgsql security definer set search_path = '' as $$
declare
  v_table regclass;
  v_left regclass[];
  v_next regclass[];
begin
  if p_user_id is null then
    raise exception 'delete_account: a user id is required' using errcode = '22023';
  end if;
  -- The spend lock comes first: this function deletes the account's spend rows below, and every
  -- other spend writer takes the same lock before any row lock, so no lock order can invert.
  perform public._ai_spend_lock();
  perform pg_advisory_xact_lock(hashtextextended('delete_account:' || p_user_id::text, 0));
  if not exists (select 1 from auth.users where id = p_user_id) then
    return jsonb_build_object('status', 'already_gone');
  end if;
  perform public._clock_lock_evidence();
  perform public._clock_lock_rules(p_user_id);

  -- 2. The account's rows in every table with a user_id column, children before parents.
  select coalesce(array_agg(c.oid::regclass order by c.relname), '{}')
    into v_left
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'user_id' and not a.attisdropped
   where c.relkind = 'r';
  loop
    v_next := '{}';
    foreach v_table in array v_left loop
      begin
        execute format('delete from %s where user_id = $1', v_table) using p_user_id;
      exception when foreign_key_violation or raise_exception then
        v_next := v_next || v_table;
      end;
    end loop;
    exit when cardinality(v_next) = 0 or cardinality(v_next) = cardinality(v_left);
    v_left := v_next;
  end loop;

  -- 3. Pending work that names the account without a foreign key.
  update public.job_cursors set retry_keys = array_remove(retry_keys, p_user_id::text)
   where p_user_id::text = any (retry_keys);
  delete from public.rate_limits where right(key, 36) = p_user_id::text;

  -- 4. The account. Every account-owned table cascades from this one statement.
  delete from auth.users where id = p_user_id;
  return jsonb_build_object('status', 'deleted');
end $$;


-- The one-argument form is kept (not dropped) so a spend RPC still running the old body during the
-- cutover can finish; nothing new calls it. It is closed to every API role below.
revoke all on function public._ai_spend_reconcile(uuid) from public, anon, authenticated, service_role;

-- The spend functions and delete_account stay service_role only: revoke first, then grant.
-- Internal helpers: only the locked entry points (security definer) may call them.
revoke all on function public._ai_spend_lock() from public, anon, authenticated, service_role;
revoke all on function public._ai_spend_reconcile(uuid, timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.ai_spend_reserve_split(uuid, numeric, numeric, numeric, integer,
  boolean, numeric, numeric) from public, anon, authenticated;
revoke all on function public.ai_spend_reserve(uuid, numeric, numeric, numeric, integer)
  from public, anon, authenticated;
revoke all on function public.ai_spend_settle(uuid, numeric) from public, anon, authenticated;
revoke all on function public.ai_spend_sweep(integer) from public, anon, authenticated;
revoke all on function public.ai_spend_expired_count() from public, anon, authenticated;
revoke all on function public.delete_account(uuid) from public, anon, authenticated;
grant execute on function public.ai_spend_reserve_split(uuid, numeric, numeric, numeric, integer,
  boolean, numeric, numeric) to service_role;
grant execute on function public.ai_spend_reserve(uuid, numeric, numeric, numeric, integer)
  to service_role;
grant execute on function public.ai_spend_settle(uuid, numeric) to service_role;
grant execute on function public.ai_spend_sweep(integer) to service_role;
grant execute on function public.ai_spend_expired_count() to service_role;
grant execute on function public.delete_account(uuid) to service_role;
