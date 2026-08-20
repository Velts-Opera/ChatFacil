-- Phase 2: harden business-module tenant access and retire QR legacy data.
-- The official Meta/Stella channel and its data are intentionally untouched.

-- Platform admins manage tenant metadata from dedicated admin RPCs; they are not
-- members of every tenant. Global automation remains reserved to service_role.
CREATE OR REPLACE FUNCTION public.business_can_access_company(_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    COALESCE(current_setting('request.jwt.claim.role', true), '') = 'service_role'
    OR _company_id = public.get_user_company_id();
$$;

REVOKE EXECUTE ON FUNCTION public.business_can_access_company(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.business_can_access_company(uuid) TO authenticated, service_role;

-- Platform-admin membership must be explicit. Do not recreate privilege from a
-- hard-coded e-mail address on auth.users INSERT.
DROP TRIGGER IF EXISTS on_auth_user_created_platform_admin ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_platform_admin();

-- Safety gate: QR channels are retired only when they have no secrets, rules or
-- pending outbound work that would be destroyed by the channel FK cascades.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.channel_secrets s
    JOIN public.channels ch ON ch.id = s.channel_id
    WHERE ch.provider = 'qr_code'
  ) THEN
    RAISE EXCEPTION 'QR retirement blocked: channel_secrets still exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.automation_rules r
    JOIN public.channels ch ON ch.id = r.channel_id
    WHERE ch.provider = 'qr_code'
  ) THEN
    RAISE EXCEPTION 'QR retirement blocked: automation_rules still exist';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.outbound_queue q
    JOIN public.channels ch ON ch.id = q.channel_id
    WHERE ch.provider = 'qr_code'
  ) THEN
    RAISE EXCEPTION 'QR retirement blocked: outbound_queue rows still exist';
  END IF;
END;
$$;

-- Preserve old QR-specific knowledge for audit/history without making it part of
-- the current Meta agent prompt.
UPDATE public.ai_knowledge_items k
SET channel_id = NULL,
    is_active = false,
    updated_at = now()
WHERE k.channel_id IN (
  SELECT id FROM public.channels WHERE provider = 'qr_code'
);

-- Preserve historical telemetry instead of letting ON DELETE CASCADE erase it.
UPDATE public.ai_interactions x
SET channel_id = NULL
WHERE x.channel_id IN (SELECT id FROM public.channels WHERE provider = 'qr_code');

UPDATE public.webhook_events x
SET channel_id = NULL
WHERE x.channel_id IN (SELECT id FROM public.channels WHERE provider = 'qr_code');

UPDATE public.integration_health_checks x
SET channel_id = NULL
WHERE x.channel_id IN (SELECT id FROM public.channels WHERE provider = 'qr_code');

UPDATE public.whatsapp_templates x
SET channel_id = NULL
WHERE x.channel_id IN (SELECT id FROM public.channels WHERE provider = 'qr_code');

UPDATE public.whatsapp_onboarding_sessions x
SET channel_id = NULL
WHERE x.channel_id IN (SELECT id FROM public.channels WHERE provider = 'qr_code');

-- contacts/conversations/messages use ON DELETE SET NULL, so their history is
-- preserved automatically. All retired QR channel rows can now be removed.
DELETE FROM public.channels
WHERE provider = 'qr_code';
