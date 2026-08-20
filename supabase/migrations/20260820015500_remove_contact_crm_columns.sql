-- Phase 4 bot-only cleanup: contacts remain an address book for WhatsApp,
-- not a sales/CRM entity.

ALTER TABLE public.contacts
  DROP COLUMN IF EXISTS funnel_stage,
  DROP COLUMN IF EXISTS potential_value,
  DROP COLUMN IF EXISTS normalized_name,
  DROP COLUMN IF EXISTS automation_opt_out,
  DROP COLUMN IF EXISTS last_service_at,
  DROP COLUMN IF EXISTS expected_return_at,
  DROP COLUMN IF EXISTS lifetime_value_cents,
  DROP COLUMN IF EXISTS last_reactivation_at,
  DROP COLUMN IF EXISTS reactivation_attempts,
  DROP COLUMN IF EXISTS closed_value,
  DROP COLUMN IF EXISTS won_at;
