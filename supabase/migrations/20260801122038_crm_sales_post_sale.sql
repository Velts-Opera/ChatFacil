-- CRM operacional: avaliacao do lead, venda efetivada e acompanhamento pos-venda.
-- A tabela e as funcoes respeitam o company_id do usuario autenticado via RLS.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS closed_value NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS won_at TIMESTAMPTZ;

ALTER TABLE public.contacts DROP CONSTRAINT IF EXISTS contacts_closed_value_nonnegative;
ALTER TABLE public.contacts ADD CONSTRAINT contacts_closed_value_nonnegative
  CHECK (closed_value IS NULL OR closed_value >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_company_id_id
  ON public.contacts(company_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_company_id_id
  ON public.conversations(company_id, id);

CREATE TABLE IF NOT EXISTS public.crm_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL,
  conversation_id UUID,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (amount >= 0),
  potential_value_at_close NUMERIC(12,2) CHECK (
    potential_value_at_close IS NULL OR potential_value_at_close >= 0
  ),
  notes TEXT,
  sold_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  post_sale_due_on DATE,
  post_sale_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (post_sale_status IN ('pending', 'completed', 'cancelled')),
  post_sale_completed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (company_id, contact_id)
    REFERENCES public.contacts(company_id, id) ON DELETE CASCADE,
  FOREIGN KEY (company_id, conversation_id)
    REFERENCES public.conversations(company_id, id) ON DELETE SET NULL (conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_sales_company_sold_at
  ON public.crm_sales(company_id, sold_at DESC);
CREATE INDEX IF NOT EXISTS idx_crm_sales_company_post_sale
  ON public.crm_sales(company_id, post_sale_status, post_sale_due_on)
  WHERE post_sale_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_crm_sales_contact
  ON public.crm_sales(contact_id, sold_at DESC);

DROP TRIGGER IF EXISTS trg_crm_sales_updated_at ON public.crm_sales;
CREATE TRIGGER trg_crm_sales_updated_at
  BEFORE UPDATE ON public.crm_sales
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

ALTER TABLE public.crm_sales ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.crm_sales FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.crm_sales TO authenticated;
GRANT ALL ON public.crm_sales TO service_role;

DROP POLICY IF EXISTS "crm sales - all own" ON public.crm_sales;
CREATE POLICY "crm sales - all own" ON public.crm_sales
  FOR ALL TO authenticated
  USING (company_id = public.get_user_company_id())
  WITH CHECK (company_id = public.get_user_company_id());

CREATE OR REPLACE FUNCTION public.register_crm_sale(
  _contact_id UUID,
  _amount NUMERIC,
  _conversation_id UUID DEFAULT NULL,
  _sold_at TIMESTAMPTZ DEFAULT now(),
  _post_sale_due_on DATE DEFAULT NULL,
  _notes TEXT DEFAULT NULL
)
RETURNS public.crm_sales
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  _company_id UUID;
  _sale public.crm_sales;
BEGIN
  IF _amount IS NULL OR _amount < 0 THEN
    RAISE EXCEPTION 'O valor da venda deve ser maior ou igual a zero'
      USING ERRCODE = '22023';
  END IF;

  SELECT c.company_id
    INTO _company_id
  FROM public.contacts c
  WHERE c.id = _contact_id
    AND c.company_id = public.get_user_company_id();

  IF _company_id IS NULL THEN
    RAISE EXCEPTION 'Contato nao encontrado para a empresa ativa'
      USING ERRCODE = '42501';
  END IF;

  IF _conversation_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.conversations cv
    WHERE cv.id = _conversation_id
      AND cv.company_id = _company_id
      AND cv.contact_id = _contact_id
  ) THEN
    RAISE EXCEPTION 'A conversa nao pertence ao contato informado'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.crm_sales (
    company_id,
    contact_id,
    conversation_id,
    amount,
    potential_value_at_close,
    notes,
    sold_at,
    post_sale_due_on,
    post_sale_status,
    created_by
  )
  SELECT
    c.company_id,
    c.id,
    _conversation_id,
    _amount,
    c.potential_value,
    NULLIF(btrim(_notes), ''),
    COALESCE(_sold_at, now()),
    _post_sale_due_on,
    CASE WHEN _post_sale_due_on IS NULL THEN 'completed' ELSE 'pending' END,
    auth.uid()
  FROM public.contacts c
  WHERE c.id = _contact_id
    AND c.company_id = _company_id
  RETURNING * INTO _sale;

  UPDATE public.contacts
  SET funnel_stage = 'cliente_efetivado',
      closed_value = _amount,
      won_at = COALESCE(_sold_at, now()),
      updated_at = now()
  WHERE id = _contact_id
    AND company_id = _company_id;

  IF _conversation_id IS NOT NULL THEN
    UPDATE public.conversations
    SET status = 'resolvida',
        ai_handling = false,
        unread_count = 0,
        updated_at = now()
    WHERE id = _conversation_id
      AND company_id = _company_id
      AND contact_id = _contact_id;
  END IF;

  RETURN _sale;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.register_crm_sale(UUID, NUMERIC, UUID, TIMESTAMPTZ, DATE, TEXT)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_crm_sale(UUID, NUMERIC, UUID, TIMESTAMPTZ, DATE, TEXT)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_crm_post_sale(_sale_id UUID)
RETURNS public.crm_sales
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  _sale public.crm_sales;
BEGIN
  UPDATE public.crm_sales
  SET post_sale_status = 'completed',
      post_sale_completed_at = now(),
      updated_at = now()
  WHERE id = _sale_id
    AND company_id = public.get_user_company_id()
  RETURNING * INTO _sale;

  IF _sale.id IS NULL THEN
    RAISE EXCEPTION 'Venda nao encontrada para a empresa ativa'
      USING ERRCODE = '42501';
  END IF;

  RETURN _sale;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_crm_post_sale(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_crm_post_sale(UUID) TO authenticated;

COMMENT ON TABLE public.crm_sales IS
  'Vendas reais ligadas ao contato, com valor fechado e acompanhamento pos-venda.';
COMMENT ON COLUMN public.contacts.potential_value IS
  'Estimativa comercial editavel antes do fechamento.';
COMMENT ON COLUMN public.contacts.closed_value IS
  'Valor da venda mais recente efetivada para o contato.';
