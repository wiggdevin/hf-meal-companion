-- Reverse of 20270109090000_ops_metrics_snapshot.sql. Deploy the code without GET /api/ops/metrics
-- first: the route answers 503 once the function is gone.
set local lock_timeout = '3s';
set local statement_timeout = '30s';

drop function if exists public.ops_metrics_snapshot(integer);
