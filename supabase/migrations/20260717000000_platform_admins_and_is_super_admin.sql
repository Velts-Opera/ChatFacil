-- Cria a tabela platform_admins e a RPC is_super_admin usada pelo frontend.
-- Esta migration é idempotente: segura para re-executar.

CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.platform_admins FROM anon, authenticated;
GRANT SELECT ON public.platform_admins TO authenticated;
GRANT ALL ON public.platform_admins TO service_role;

DROP POLICY IF EXISTS "platform admins - see self" ON public.platform_admins;
CREATE POLICY "platform admins - see self" ON public.platform_admins
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- RPC chamada pelo frontend: supabase.rpc("is_super_admin")
-- SECURITY DEFINER necessário para acessar platform_admins com RLS ativo.
-- search_path fixo evita ataques de substituição de schema.
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid());
$$;

REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

-- Garante que o proprietário da conta é super admin
INSERT INTO public.platform_admins (user_id)
SELECT id FROM auth.users WHERE email = 'veltrani@gmail.com'
ON CONFLICT (user_id) DO NOTHING;

-- Promove automaticamente veltrani@gmail.com se cadastrar depois
CREATE OR REPLACE FUNCTION public.handle_new_platform_admin()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.email = 'veltrani@gmail.com' THEN
    INSERT INTO public.platform_admins (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_platform_admin() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created_platform_admin ON auth.users;
CREATE TRIGGER on_auth_user_created_platform_admin
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_platform_admin();
