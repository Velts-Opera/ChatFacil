import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Clock3, Loader2, LogOut, MessageSquareText, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type ActivationState = {
  status: "pending" | "active" | "suspended";
  company_id: string | null;
  company_name: string | null;
  company_is_active: boolean | null;
  is_super_admin: boolean;
};

export const Route = createFileRoute("/pending-activation")({
  ssr: false,
  head: () => ({ meta: [{ title: "Ativação da conta — ChatFacil" }] }),
  component: PendingActivationPage,
});

async function loadActivationState(): Promise<ActivationState> {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error("AUTH_REQUIRED");

  const { data, error } = await (supabase.rpc as any)("get_account_activation_state");
  if (error) throw error;

  const state = Array.isArray(data) ? data[0] : data;
  if (!state) throw new Error("Não foi possível consultar o estado da conta.");
  return state as ActivationState;
}

function PendingActivationPage() {
  const navigate = useNavigate();
  const stateQuery = useQuery({
    queryKey: ["account-activation-state"],
    queryFn: loadActivationState,
    refetchInterval: 15_000,
    retry: false,
  });

  const state = stateQuery.data;

  if (state?.status === "active" && state.company_id && state.company_is_active !== false) {
    navigate({ to: "/onboarding-inicial", replace: true });
    return null;
  }

  if (stateQuery.error instanceof Error && stateQuery.error.message === "AUTH_REQUIRED") {
    navigate({ to: "/auth", replace: true });
    return null;
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const suspended = state?.status === "suspended";

  return (
    <div className="min-h-screen bg-surface px-4 py-10">
      <div className="mx-auto max-w-xl">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <MessageSquareText className="h-5 w-5" />
          </div>
          <span className="font-display text-lg font-extrabold">ChatFacil</span>
        </Link>

        <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          {stateQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Verificando sua conta…
            </div>
          ) : stateQuery.isError ? (
            <div className="text-center">
              <ShieldAlert className="mx-auto h-9 w-9 text-destructive" />
              <h1 className="mt-4 font-display text-xl font-bold">Não foi possível validar sua conta</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Tente novamente. Se o problema continuar, fale com o suporte do ChatFacil.
              </p>
            </div>
          ) : (
            <div className="text-center">
              {suspended ? (
                <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
              ) : (
                <Clock3 className="mx-auto h-10 w-10 text-primary" />
              )}
              <h1 className="mt-4 font-display text-2xl font-bold">
                {suspended ? "Acesso suspenso" : "Conta aguardando ativação"}
              </h1>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {suspended
                  ? "A empresa está temporariamente desativada. O acesso ao painel e ao bot permanece bloqueado até a reativação."
                  : "Seu cadastro foi recebido. A empresa e o ambiente do bot só serão criados depois que sua conta for autorizada."}
              </p>
              {!suspended && (
                <div className="mt-5 rounded-xl border bg-muted/30 p-4 text-left text-sm">
                  <strong>Depois da ativação:</strong>
                  <p className="mt-1 text-muted-foreground">
                    você conecta o WhatsApp pelo fluxo oficial da Meta e configura o bot da sua empresa.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
            <Button variant="outline" onClick={() => stateQuery.refetch()} disabled={stateQuery.isFetching}>
              {stateQuery.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              Verificar novamente
            </Button>
            <Button variant="ghost" onClick={signOut}>
              <LogOut className="mr-2 h-4 w-4" /> Sair
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
