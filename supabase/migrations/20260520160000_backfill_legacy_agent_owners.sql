-- 20260520160000_backfill_legacy_agent_owners.sql
-- Backfill provisioned_by_user_id for legacy agents that were created BEFORE
-- the operator-system migration (20260519120000) added the column. Assigns
-- them to Yauheni since he's the only operator who could have provisioned
-- them in the pre-operator-auth era.
--
-- Safe-rerun: only updates rows where provisioned_by_user_id IS NULL.
-- Targets the user_id of yauheni.futryn@gmail.com by joining auth.users.

update agents
   set provisioned_by_user_id = (
     select id from auth.users where lower(email) = 'yauheni.futryn@gmail.com' limit 1
   )
 where provisioned_by_user_id is null
   and exists (select 1 from auth.users where lower(email) = 'yauheni.futryn@gmail.com');

update tenants
   set provisioned_by_user_id = (
     select id from auth.users where lower(email) = 'yauheni.futryn@gmail.com' limit 1
   )
 where provisioned_by_user_id is null
   and exists (select 1 from auth.users where lower(email) = 'yauheni.futryn@gmail.com');
