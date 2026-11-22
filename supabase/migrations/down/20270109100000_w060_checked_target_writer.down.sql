-- Reverse of 20270109100000_w060_checked_target_writer.sql. Deploy the app build that no longer
-- calls the checked writer first (it would get "function does not exist"), then run this.
-- approve_target_proposal is put back to write_target_revision (the old, unchecked writer).
set local lock_timeout = '3s';

do $migration$
declare
  definition text;
  patched text;
  write_from constant text := 'null::target_profiles, write_target_revision_checked(p_user_id, v_payload));';
  write_to constant text := 'null::target_profiles, write_target_revision(p_user_id, v_payload));';
  lock_to constant text := 'perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));';
  lock_from constant text :=
    'perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || '':user_settings:settings'', 0));'
    || E'\n  ' || lock_to;
begin
  select pg_get_functiondef('public.approve_target_proposal(uuid,uuid)'::regprocedure)
    into definition;
  patched := replace(replace(definition, write_from, write_to), lock_from, lock_to);
  -- A body that does not match is left alone, but never silently: the functions below must not
  -- be dropped while approval still calls one of them.
  if position('write_target_revision_checked' in patched) > 0 then
    raise exception 'down: approve_target_proposal still calls the checked writer; fix by hand first';
  end if;
  if patched <> definition then
    execute patched;
  end if;
end;
$migration$;

drop function if exists public.write_target_revision_if_active_checked(uuid, jsonb, uuid, bigint);
drop function if exists public.write_target_revision_checked(uuid, jsonb, jsonb);
drop function if exists public.account_floor(uuid, numeric, jsonb);
drop function if exists public.account_body_mass_kg(uuid, date);
