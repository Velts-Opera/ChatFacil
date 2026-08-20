-- Correct the Phase 3 legacy-account archive cutoff.
-- account_access rows were backfilled during Phase 1, so use the original
-- auth.users.created_at timestamp to identify pre-activation-gate identities.

UPDATE public.account_access aa
SET archived_at = now(),
    archived_reason = 'phase3_legacy_tenant_cleanup'
FROM auth.users u
WHERE u.id = aa.user_id
  AND aa.status = 'pending'
  AND aa.company_id IS NULL
  AND aa.archived_at IS NULL
  AND u.created_at < TIMESTAMPTZ '2026-08-19 21:45:00+00';
