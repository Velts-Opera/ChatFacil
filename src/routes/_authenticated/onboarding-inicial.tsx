import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MetaDirectOnboarding } from "@/components/meta-embedded-signup";
import { Button } from "@/components/ui/button";
import type { ConnectionStatus } from "@/lib/whatsapp/provider";
import {
  Bot,
  CheckCircle2,
  Circle,
  Loader2,
  RefreshCw,
  Rocket,
  TriangleAlert,
} from "lucide-react";

type SetupChannel = {
  id: string;
  status: ConnectionStatus;
  phone_number: string | null;
  ai_enabled: boolean | null;
  auto_reply_enabled: boolean | null;
};

type SetupState = {
  companyName: string;
  agentReady: boolean;
  agentName: string;
  knowledgeCount: number;
  channel: SetupChannel | null;
  inboundCount: number;
  aiReplyCount: number;
};

export const Route = createFileRoute("/_authenticated/onboarding-inicial")({
  head: () => ({ meta: [{ title: "Primeiros passos — ChatFacil" }] }),
  component: InitialOnboardingPage,
});

async function loadSetup(): Promise<SetupState> {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("company_id")
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profile?.company_id) throw new Error("Sua conta ainda não está associada a uma empresa.");

  const companyId = profile.company_id;
  const [companyResult, agentResult, knowledgeResult, channelResult] = await Promise.all([
    supabase.from("companies").select("name").eq("id", companyId).maybeSingle(),
    supabase
      .from("ai_agent_settings")
      .select("agent_name,is_enabled")
      .eq("company_id", companyId)
      .maybeSingle(),
    supabase
      .from("ai_knowledge_items")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("is_active", true),
    supabase
      .from("channel_public_view" as any)
      .select("id,status,phone_number,ai_enabled,auto_reply_enabled")
      .eq("company_id", companyId)
      .eq("type", "whatsapp")
      .eq("provider", "meta_cloud_api")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (companyResult.error) throw companyResult.error;
  if (agentResult.error) throw agentResult.error;
  if (knowledgeResult.error) throw knowledgeResult.error;
  if (channelResult.error) throw channelResult.error;

  const channel = (channelResult.data as SetupChannel | null) ?? null;
  let inboundCount = 0;
  let aiReplyCount = 0;

  if (channel?.id) {
    const [inboundResult, aiResult] = await Promise.all([
      supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("channel_id", channel.id)
        .eq("direction", "inbound"),
      supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("channel_id", channel.id)
        .eq("sender_type", "ai")
        .eq("direction", "outbound"),
    ]);
    if (inboundResult.error) throw inboundResult.error;
    if (aiResult.error) throw aiResult.error;
    inboundCount = inboundResult.count ?? 0;
    aiReplyCount = aiResult.count ?? 0;
  }

  return {
    companyName: companyResult.data?.name ?? "Sua empresa",
    agentReady: Boolean(agentResult.data?.is_enabled),
    agentName: agentResult.data?.agent_name?.trim() || "Assistente",
    knowledgeCount: knowledgeResult.count ?? 0,
    channel,
    inboundCount,
    aiReplyCount,
  };
}

function InitialOnboardingPage() {
  const queryClient = useQueryClient();
  const setupQuery = useQuery({
    queryKey: ["initial-onboarding"],
    queryFn: loadSetup,
    refetchInterval: 5000,
  });

  if (setupQuery.isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Preparando sua operação…
        </div>
      </div>
    );
  }

  if (setupQuery.isError || !setupQuery.data) {
    const message = setupQuery.error instanceof Error ? setupQuery.error.message : "Falha ao carregar o onboarding.";
    return (
      <div className="p-6">
        <div className="mx-auto max-w-2xl rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900">
          <div className="flex items-start gap-3">
            <TriangleAlert className="mt-0.5 h-5 w-5" />
            <div className="flex-1">
              <div className="font-medium">Não foi possível preparar sua conta</div>
              <p className="mt-1 text-sm">{message}</p>
              <Button className="mt-4" variant="outline" onClick={() => setupQuery.refetch()}>
                <RefreshCw className="mr-2 h-4 w-4" /> Tentar novamente
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const setup = setupQuery.data;
  const whatsappConnected = setup.channel?.status === "connected";
  const autoReplyReady = whatsappConnected && setup.channel?.ai_enabled === true && setup.channel?.auto_reply_enabled === true;
  const firstInboundOk = setup.inboundCount > 0;
  const firstAiReplyOk = setup.aiReplyCount > 0;
  const completed = setup.agentReady && whatsappConnected && firstInboundOk && firstAiReplyOk;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6">
      <div className="rounded-2xl border bg-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Rocket className="h-3.5 w-3.5" /> Ativação inicial
            </div>
            <h1 className="font-display text-2xl font-bold">Coloque o ChatFacil para atender hoje</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Sua empresa, seu agente e seu canal já foram criados. Agora conecte o WhatsApp e confirme uma resposta real da IA.
            </p>
          </div>
          <div className="rounded-xl border px-4 py-3 text-sm">
            <div className="text-xs text-muted-foreground">Empresa</div>
            <div className="font-medium">{setup.companyName}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <StepCard
          number="1"
          title="Agente preparado"
          description={`${setup.agentName} está ${setup.agentReady ? "ativo" : "desativado"}. Base ativa: ${setup.knowledgeCount} item(ns).`}
          done={setup.agentReady}
          action={<Button asChild variant="outline" size="sm"><Link to="/agente-ia">Revisar agente</Link></Button>}
        />
        <StepCard
          number="2"
          title="WhatsApp conectado"
          description={whatsappConnected ? `Conectado oficialmente${setup.channel?.phone_number ? ` em ${setup.channel.phone_number}` : ""}.` : "Autorize seu número no fluxo oficial da Meta."}
          done={whatsappConnected}
        />
        <StepCard
          number="3"
          title="Primeira resposta validada"
          description={firstAiReplyOk ? "Já existe resposta real da IA neste canal." : "Envie uma mensagem de outro número e aguarde a IA responder."}
          done={firstInboundOk && firstAiReplyOk}
        />
      </div>

      {whatsappConnected ? (
        <section className="rounded-2xl border bg-card p-5 sm:p-6">
          <div className="mb-4 flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-700" />
            <div>
              <h2 className="font-display text-lg font-bold">WhatsApp oficial conectado</h2>
              <p className="text-sm text-muted-foreground">
                O número pertence à sua empresa e foi autorizado na integração oficial do ChatFacil.
              </p>
            </div>
          </div>
          <div className="rounded-xl border bg-muted/20 p-4 text-sm">
            <strong>{setup.channel?.phone_number || "Número conectado"}</strong>
            <p className="mt-1 text-muted-foreground">As mensagens recebidas pela Cloud API da Meta serão processadas pelo agente desta empresa.</p>
          </div>
        </section>
      ) : (
        <MetaDirectOnboarding
          onComplete={() => queryClient.invalidateQueries({ queryKey: ["initial-onboarding"] })}
        />
      )}

      {whatsappConnected && (
        <section className="rounded-2xl border bg-card p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <Bot className="mt-0.5 h-5 w-5 text-primary" />
            <div className="flex-1">
              <h2 className="font-display text-lg font-bold">Teste de primeira resposta</h2>
              <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
                <li>1. Pegue outro número de WhatsApp que não seja o número conectado.</li>
                <li>2. Envie uma mensagem simples, por exemplo: <span className="font-medium text-foreground">“Olá, preciso de atendimento.”</span></li>
                <li>3. Esta tela detecta automaticamente a mensagem recebida e a resposta enviada pela IA.</li>
              </ol>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <StatusBox label="Automação" ok={autoReplyReady} detail={autoReplyReady ? "IA e resposta automática ativas" : "Verifique IA e resposta automática em Canais"} />
                <StatusBox label="Mensagem recebida" ok={firstInboundOk} detail={firstInboundOk ? `${setup.inboundCount} recebida(s)` : "Aguardando mensagem real"} />
                <StatusBox label="Resposta da IA" ok={firstAiReplyOk} detail={firstAiReplyOk ? `${setup.aiReplyCount} resposta(s)` : "Aguardando resposta real"} />
              </div>
            </div>
          </div>
        </section>
      )}

      <div className={`rounded-2xl border p-5 ${completed ? "border-green-200 bg-green-50" : "bg-muted/20"}`}>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            {completed ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-700" /> : <Circle className="mt-0.5 h-5 w-5 text-muted-foreground" />}
            <div>
              <div className="font-medium">{completed ? "Operação validada" : "Falta concluir a ativação"}</div>
              <p className="mt-1 text-sm text-muted-foreground">
                {completed ? "WhatsApp conectado e primeira resposta automática confirmada. Você já pode acompanhar atendimentos na Inbox." : "O onboarding só termina depois de uma mensagem real entrar e a IA responder."}
              </p>
            </div>
          </div>
          <Button asChild disabled={!completed}>
            <Link to="/inbox">Ir para a Inbox</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function StepCard({ number, title, description, done, action }: { number: string; title: string; description: string; done: boolean; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-start gap-3">
        <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold ${done ? "bg-green-100 text-green-800" : "bg-muted text-muted-foreground"}`}>
          {done ? <CheckCircle2 className="h-4 w-4" /> : number}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium">{title}</div>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          {action && <div className="mt-3">{action}</div>}
        </div>
      </div>
    </div>
  );
}

function StatusBox({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <div className="rounded-xl border p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        {ok ? <CheckCircle2 className="h-4 w-4 text-green-700" /> : <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {label}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}
