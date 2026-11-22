-- Reverse of 20270109100000_w060_checked_target_writer.sql. Deploy the app build that no longer
-- calls the checked writer first (it would get "function does not exist"), then run this.
-- approve_target_proposal is put back to write_target_revision (the old, unchecked writer).
set local lock_timeout = '3s';

do $migration$
declare
  definition text;
  from_text constant text := 'null::target_profiles, write_target_revision_checked(p_user_id, v_payload));';
  to_text constant text := 'null::target_profiles, write_target_revision(p_user_id, v_payload));';
begin
  select pg_get_functiondef('public.approve_target_proposal(uuid,uuid)'::regprocedure)
    into definition;
  if position(from_text in definition) > 0 then
    execute replace(definition, from_text, to_text);
  end if;
end;
$migration$;

drop function if exists public.write_target_revision_if_active_checked(uuid, jsonb, uuid, bigint);
drop function if exists public.write_target_revision_checked(uuid, jsonb, jsonb);
drop function if exists public.account_floor(uuid, numeric, jsonb);
drop function if exists public.account_body_mass_kg(uuid, date);
