
-- ============ CHANNELS ============
CREATE TABLE public.channels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'whatsapp',
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'disconnected', -- disconnected | connecting | connected | error
  phone_number TEXT,
  phone_number_id TEXT,
  waba_id TEXT,
  access_token TEXT,
  verify_token TEXT,
  webhook_url TEXT,
  last_error TEXT,
  connected_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_channels_company ON public.channels(company_id);
CREATE INDEX idx_channels_phone_number_id ON public.channels(phone_number_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.channels TO authenticated;
GRANT ALL ON public.channels TO service_role;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view channels"
  ON public.channels FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id());
CREATE POLICY "Company members can insert channels"
  ON public.channels FOR INSERT TO authenticated
  WITH CHECK (company_id = public.get_user_company_id());
CREATE POLICY "Company members can update channels"
  ON public.channels FOR UPDATE TO authenticated
  USING (company_id = public.get_user_company_id())
  WITH CHECK (company_id = public.get_user_company_id());
CREATE POLICY "Company members can delete channels"
  ON public.channels FOR DELETE TO authenticated
  USING (company_id = public.get_user_company_id());

CREATE TRIGGER trg_channels_updated_at
  BEFORE UPDATE ON public.channels
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============ WEBHOOK_EVENTS ============
CREATE TABLE public.webhook_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES public.channels(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'received',
  source TEXT NOT NULL DEFAULT 'meta',
  payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_webhook_events_channel ON public.webhook_events(channel_id, created_at DESC);
CREATE INDEX idx_webhook_events_company ON public.webhook_events(company_id, created_at DESC);

GRANT SELECT ON public.webhook_events TO authenticated;
GRANT ALL ON public.webhook_events TO service_role;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view webhook events"
  ON public.webhook_events FOR SELECT TO authenticated
  USING (company_id = public.get_user_company_id());

-- ============ CONTACTS additions ============
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES public.channels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS wa_id TEXT;
CREATE INDEX IF NOT EXISTS idx_contacts_wa_id ON public.contacts(company_id, wa_id);

-- ============ CONVERSATIONS additions ============
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES public.channels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_message TEXT;

-- ============ MESSAGES additions ============
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS channel_id UUID REFERENCES public.channels(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS direction TEXT, -- inbound | outbound
  ADD COLUMN IF NOT EXISTS message_type TEXT DEFAULT 'text',
  ADD COLUMN IF NOT EXISTS meta_message_id TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT,
  ADD COLUMN IF NOT EXISTS raw_payload JSONB;
CREATE INDEX IF NOT EXISTS idx_messages_meta_message_id ON public.messages(meta_message_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(conversation_id, created_at DESC);

-- Loosen messages RLS to allow company members to view all their messages
-- (existing policies already scope by conversation; we keep them).
