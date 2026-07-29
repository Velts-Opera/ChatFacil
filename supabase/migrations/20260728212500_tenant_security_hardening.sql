-- Harden tenant isolation after audit.
-- Signup/profile creation remains handled by the auth.users SECURITY DEFINER trigger.

DROP POLICY IF EXISTS "own profile - insert" ON public.profiles;
DROP POLICY IF EXISTS "own profile - update" ON public.profiles;
CREATE POLICY "own profile - update"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = (SELECT auth.uid()))
  WITH CHECK (
    id = (SELECT auth.uid())
    AND company_id = (SELECT public.get_user_company_id())
  );

-- Tenants are provisioned by the signup trigger or the super-admin RPC, not direct client INSERTs.
DROP POLICY IF EXISTS "own company - insert" ON public.companies;

-- Two permissive ALL policies previously meant OR semantics. A caller could satisfy
-- the conversation policy while supplying a different company_id. Require both.
DROP POLICY IF EXISTS "messages - all own" ON public.messages;
DROP POLICY IF EXISTS "messages - all own company direct" ON public.messages;
DROP POLICY IF EXISTS "messages - all own company" ON public.messages;
CREATE POLICY "messages - all own company"
  ON public.messages FOR ALL TO authenticated
  USING (
    company_id = (SELECT public.get_user_company_id())
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND c.company_id = (SELECT public.get_user_company_id())
    )
  )
  WITH CHECK (
    company_id = (SELECT public.get_user_company_id())
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id
        AND c.company_id = (SELECT public.get_user_company_id())
    )
  );

-- This helper is not needed by current RLS and otherwise exposes role probes by arbitrary UUID.
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM authenticated;

CREATE OR REPLACE FUNCTION public.enforce_message_tenant_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE related_company UUID;
BEGIN
  SELECT company_id INTO related_company FROM public.conversations WHERE id = NEW.conversation_id;
  IF related_company IS NULL OR related_company IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'message conversation tenant mismatch';
  END IF;

  IF NEW.contact_id IS NOT NULL THEN
    SELECT company_id INTO related_company FROM public.contacts WHERE id = NEW.contact_id;
    IF related_company IS NULL OR related_company IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'message contact tenant mismatch';
    END IF;
  END IF;

  IF NEW.channel_id IS NOT NULL THEN
    SELECT company_id INTO related_company FROM public.channels WHERE id = NEW.channel_id;
    IF related_company IS NULL OR related_company IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'message channel tenant mismatch';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_tenant_consistency ON public.messages;
CREATE TRIGGER trg_messages_tenant_consistency
  BEFORE INSERT OR UPDATE OF company_id, conversation_id, contact_id, channel_id ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.enforce_message_tenant_consistency();

CREATE OR REPLACE FUNCTION public.enforce_conversation_tenant_consistency()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE related_company UUID;
BEGIN
  IF NEW.contact_id IS NOT NULL THEN
    SELECT company_id INTO related_company FROM public.contacts WHERE id = NEW.contact_id;
    IF related_company IS NULL OR related_company IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'conversation contact tenant mismatch';
    END IF;
  END IF;

  IF NEW.channel_id IS NOT NULL THEN
    SELECT company_id INTO related_company FROM public.channels WHERE id = NEW.channel_id;
    IF related_company IS NULL OR related_company IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION 'conversation channel tenant mismatch';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_conversations_tenant_consistency ON public.conversations;
CREATE TRIGGER trg_conversations_tenant_consistency
  BEFORE INSERT OR UPDATE OF company_id, contact_id, channel_id ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_conversation_tenant_consistency();

NOTIFY pgrst, 'reload schema';
