import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/meta-business-agent")({
  head: () => ({
    meta: [
      { title: "Meta Business Agent — Comunica AI" },
      { name: "description", content: "Integração nativa do agente da Meta com o WhatsApp Business Platform." },
    ],
  }),
  component: MetaBusinessAgentPage,
});

type AgentStatus =
  | "not_checked"
  | "eligible"
  | "ineligible"
  | "terms_required"
  | "onboarding"
  | "configured"
  | "enabled"
  | "error";

type Channel = {
  id: string;
  name: string;
  phone_number: string | null;
  verified_name: string | null;
  quality_rating: string | null;
  status: string;
  meta_business_agent_status: AgentStatus | null;
  meta_business_agent_eligible: boolean | null;
  meta_business_agent_enabled: boolean | null;
  meta_business_agent_last_checked_at: string | null;
  meta_business_agent_last_error: string | null;
};

type AgentResponse = {
  ok?: boolean;
  error?: string;
  terms_required?: boolean;
  eligible?: boolean | null;
  manager_url?: string | null;
};

const statusLabels: Record<AgentStatus, string> = {
  not_checked: "Não verificado",
  eligible: "Elegível",
  ineligible: "Não elegível",
  terms_required: "Termos pendentes",
  onboarding: "Onboarding iniciado",
  configured: "Configurado",
  enabled: "Ativo",
  error: "Erro",
};

function MetaBusinessAgentPage() {
  const [channel, setChannel] = useState<Channel | null>(null);
  const [managerUrl, setManagerUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);

  const invokeAgent = useCallback(async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke("meta-business-agent", { body });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data as AgentResponse;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("channel_public_view" as any)
        .select("id, name, phone_number, verified_name, quality_rating, status, meta_business_agent_status, meta_business_agent_eligible, meta_business_agent_enabled, meta_business_agent_last_checked_at, meta_business_agent_last_error")
        .eq("type", "whatsapp")
        .eq("provider", "meta_cloud_api")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      setChannel((data as Channel | null) ?? null);

      if (data?.id) {
        const status = await invokeAgent({ action: "status", channel_id: data.id });
        setManagerUrl(status.manager_url ?? null);
      } else {
        setManagerUrl(null);
      }
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Não foi possível carregar o agente da Meta.");
    } finally {
      setLoading(false);
    }
  }, [invokeAgent]);

  useEffect(() => {
    void load();
  }, [load]);

  async function runAction(name: string, body: Record<string, unknown>, success: string) {
    if (!channel) return;
    setAction(name);
    try {
      const result = await invokeAgent({ ...body, channel_id: channel.id });
      if (result.manager_url) setManagerUrl(result.manager_url);
      toast.success(success);
      await load();
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "A Meta não concluiu a operação.");
      await load();
    } finally {
      setAction(null);
    }
  }

  const status: AgentStatus = channel?.meta_business_agent_status ?? "not_checked";
  const busy = Boolean(action) || loading;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/canais"><ArrowLeft className="mr-1 h-4 w-4" />Canais</Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Bot className="h-6 w-6" />Meta Business Agent
          </h1>
          <p className="text-sm text-muted-foreground">Agente nativo da Meta sobre o seu WhatsApp Business Platform oficial.</p>
        </div>
        {channel && <Badge variant={status === "enabled" ? "default" : "secondary"}>{statusLabels[status]}</Badge>}
      </div>

      {loading && !channel ? (
        <div className="flex items-center gap-2 rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />Carregando canal oficial...
        </div>
      ) : !channel ? (
        <section className="rounded-xl border bg-card p-6 shadow-sm">
          <h2 className="font-semibold">Conecte primeiro o WhatsApp oficial</h2>
          <p className="mt-2 text-sm text-muted-foreground">O Meta Business Agent depende de uma WABA e de um Phone Number ID conectados pelo fluxo oficial da Meta.</p>
          <Button className="mt-4" asChild><Link to="/canais">Abrir canais</Link></Button>
        </section>
      ) : (
        <>
          <section className="rounded-xl border bg-card p-6 shadow-sm">
            <div className="flex flex-wrap items-start gap-4">
              <div className="rounded-lg bg-primary/10 p-2 text-primary"><ShieldCheck className="h-5 w-5" /></div>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold">{channel.verified_name ?? channel.name}</h2>
                <p className="text-sm text-muted-foreground">{channel.phone_number ?? "Número oficial"} · qualidade {channel.quality_rating ?? "não informada"}</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => void load()} disabled={busy}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Atualizar
              </Button>
            </div>
          </section>

          {channel.meta_business_agent_last_error && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <div><strong>Último retorno:</strong> {channel.meta_business_agent_last_error}</div>
            </div>
          )}

          <section className="rounded-xl border bg-card p-6 shadow-sm">
            <h2 className="font-semibold">Ativação segura</h2>
            <p className="mt-1 text-sm text-muted-foreground">O fluxo começa verificando elegibilidade, configura o agente com dados do ChatFacil e só depois libera o rollout para uma audiência controlada.</p>

            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                onClick={() => void runAction("eligibility", { action: "check_eligibility" }, "Elegibilidade verificada na Meta.")}
                disabled={busy}
              >
                {action === "eligibility" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Verificar elegibilidade
              </Button>

              {(status === "eligible" || status === "not_checked" || status === "error") && (
                <Button
                  variant="outline"
                  onClick={() => void runAction("onboard", { action: "onboard" }, "Onboarding nativo iniciado.")}
                  disabled={busy}
                >
                  {action === "onboard" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Iniciar onboarding nativo
                </Button>
              )}

              {(status === "onboarding" || status === "eligible" || status === "configured") && (
                <Button
                  variant="outline"
                  onClick={() => void runAction("configure", { action: "configure_from_chatfacil" }, "Configuração do ChatFacil enviada para o agente da Meta.")}
                  disabled={busy}
                >
                  {action === "configure" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Sincronizar configuração do ChatFacil
                </Button>
              )}

              {status === "configured" && (
                <Button
                  onClick={() => void runAction("enable", { action: "set_rollout", enabled: true, audience: "ALLOWLISTED_ONLY" }, "Meta Business Agent ativado em audiência controlada.")}
                  disabled={busy}
                >
                  {action === "enable" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Ativar em allowlist
                </Button>
              )}

              {status === "enabled" && (
                <Button
                  variant="destructive"
                  onClick={() => void runAction("disable", { action: "set_rollout", enabled: false, audience: "ALLOWLISTED_ONLY" }, "Meta Business Agent desativado e automação anterior restaurada.")}
                  disabled={busy}
                >
                  {action === "disable" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Desativar agente da Meta
                </Button>
              )}

              {managerUrl && (
                <Button variant="outline" asChild>
                  <a href={managerUrl} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Abrir no WhatsApp Manager</a>
                </Button>
              )}
            </div>

            {status === "terms_required" && (
              <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                A Meta informou que os termos do Business Agent precisam ser aceitos pelo portfólio empresarial antes da API liberar o onboarding.
              </div>
            )}

            {status === "ineligible" && (
              <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
                Este número ainda não está elegível no rollout da Meta. O WhatsApp Cloud API continua funcionando normalmente.
              </div>
            )}

            {status === "enabled" && (
              <div className="mt-5 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                O agente nativo está ligado. As respostas automáticas do agente próprio do ChatFacil ficam suspensas neste canal para evitar respostas duplicadas; atendimento humano e inbox continuam disponíveis.
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
