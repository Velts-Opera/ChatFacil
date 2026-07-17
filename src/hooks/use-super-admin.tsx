import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Retorna se o usuário logado é admin da plataforma (servidor-mãe).
 * Usado para esconder configuração técnica (tokens, IDs da Meta) do cliente final.
 */
export function useSuperAdmin() {
  const { data: isSuperAdmin = false, isLoading } = useQuery({
    queryKey: ["is-super-admin"],
    queryFn: async () => {
      const { data } = await supabase.rpc("is_super_admin");
      return data ?? false;
    },
    staleTime: 5 * 60 * 1000,
  });

  return { isSuperAdmin, isLoading };
}