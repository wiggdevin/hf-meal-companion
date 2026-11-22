-- Reverse of 20270109090000_ops_readonly_role.sql. Drops the ops schema (views only, no data)
-- and the ops_readonly role. Disconnect any dashboard using it first.
set local lock_timeout = '3s';
set local statement_timeout = '30s';

drop schema if exists ops cascade;
drop owned by ops_readonly;
drop role if exists ops_readonly;
