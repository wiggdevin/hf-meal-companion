-- Reverse of 20270109090100_ai_spend_live_holds.sql: restores the 20270103090000 body, where every
-- unsettled hold counts against the global ceiling and the background splits, expired or not.
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create or replace function public.ai_spend_reserve_split(
  p_user_id uuid, p_amount_usd numeric, p_user_cap_usd numeric, p_global_cap_usd numeric,
  p_ttl_seconds integer, p_background boolean, p_background_cap_usd numeric,
  p_interactive_reserve_usd numeric)
  returns table (reservation_id uuid, allowed boolean, reason text,
                 user_committed_usd numeric, global_committed_usd numeric)
  language plpgsql security definer set search_path = '' as $$
declare
  v_day date := (now() at time zone 'utc')::date;
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

  perform public._ai_spend_lock_day(p_user_id, v_day, true);
  -- The caller's own abandoned holds for today, reconciled under the locks already held.
  for v_expired in
    select r.id from public.ai_spend_reservations r
     where r.user_id = p_user_id and r.day = v_day and r.settled_at is null and r.expires_at < now()
     order by r.expires_at limit 100
  loop
    perform public._ai_spend_reconcile(v_expired);
  end loop;

  -- ONE statement, one snapshot: settled spend and open holds, the user's and everyone's, and
  -- what background calls have committed (settled actuals plus open holds), the user's and everyone's.
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
  values (p_user_id, v_day, p_amount_usd, now() + make_interval(secs => p_ttl_seconds), p_background)
  returning id into v_id;
  return query select v_id, true, null::text, v_user + p_amount_usd, v_global + p_amount_usd;
end $$;
