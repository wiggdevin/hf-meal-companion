-- Reverse of 20270108090000_feedback.sql. Deploy the code that no longer writes feedback first:
-- POST /api/feedback answers 503 once the table is gone. Dropping it loses the testers' feedback
-- rows; export them first (service_role select) if they are still needed.
set local lock_timeout = '3s';
set local statement_timeout = '30s';

drop table if exists public.feedback;
