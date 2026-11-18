-- Tester feedback (readiness audit 2026-11-17, item A1): one row per "Send feedback" from
-- Settings. The user's own words, an optional screen path and the build sha. Nothing else.
--
--   * Service-role writes only (the W070 pattern): `POST /api/feedback` inserts with the admin
--     client and the session-verified user id, so the route's 10-per-day limit is the only way in.
--     `anon` and `authenticated` hold no grant at all: no direct Data API insert, no read back.
--     RLS is on with no policy, so a grant added by mistake still exposes nothing.
--   * `message` is 1 to 2,000 characters; `screen` is an app path of at most 200 characters;
--     `app_build` at most 64. The route (`app/api/feedback/route.ts`) validates the same limits
--     with zod first; these checks are defence in depth.
--   * `created_at` is the server's clock: the column-level insert grant leaves it out.
--   * Account deletion cascades.
--
-- Live-safe: a new, empty table; nothing existing is altered.
-- Apply order: this file alone, its own transaction. Apply before the code that writes it merges;
-- until then POST /api/feedback answers 503 and the phone keeps the typed text.
-- Down: supabase/migrations/down/20270108090000_feedback.down.sql.
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $$
begin
  if to_regclass('public.feedback') is not null then
    raise exception '20270108090000_feedback: already applied';
  end if;
end $$;

create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  message text not null check (char_length(message) between 1 and 2000),
  screen text check (screen is null or char_length(screen) between 1 and 200),
  app_build text check (app_build is null or char_length(app_build) between 1 and 64),
  created_at timestamptz not null default now()
);

create index feedback_user_id_idx on public.feedback (user_id);
create index feedback_created_at_idx on public.feedback (created_at);

alter table public.feedback enable row level security;

revoke all on table public.feedback from public, anon, authenticated;
grant insert (user_id, message, screen, app_build), select, delete
  on table public.feedback to service_role;
