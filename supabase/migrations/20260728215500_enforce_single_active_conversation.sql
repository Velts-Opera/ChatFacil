CREATE UNIQUE INDEX IF NOT EXISTS uq_conversations_active_contact_channel
ON public.conversations(company_id, channel_id, contact_id)
WHERE status <> 'resolvida';
