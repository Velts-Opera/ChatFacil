import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Inbox, UserPlus, Clock, Bot, TrendingUp, CheckCircle2, Megaphone, Radio, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Comunica AI" }] }),
  component: Dashboard,
});

function Dashboard() {
  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    refetchInterval: 10000,
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayIso = today.toISOString();

      const [open, pending, resolved, contacts, aiMessages, outbound, inbound, connectedChannels, webhookErrors] = await Promise.all([
        supabase.from("conversations").select("id", { count: "exact", head: true }).eq("status", "aberta"),
        supabase.from("conversations").select("id", { count: "exact", head: true }).eq("status", "pendente"),
        supabase.from("conversations").select("id", { count: "exact", head: true }).eq("status", "resolvida").gte("updated_at", todayIso),
        supabase.from("contacts").select("id", { count: "exact", head: true }).gte("created_at", todayIso),
        supabase.from("messages").select("id", { count: "exact", head: true }).eq("ai_generated", true).gte("created_at", todayIso),
        supabase.from("messages").select("id", { count: "exact", head: true }).eq("direction", "outbound").gte("created_at", todayIso),
        supabase.from("messages").select("id", { count: "exact", head: true }).eq("direction", "inbound").gte("created_at", todayIso),
        supabase.from("channel_public_view" as any).select("id", { count: "exact", head: true }).eq("status", "connected"),
        supabase.from("webhook_events").select("id", { count: "exact", head: true }).eq("status", "error").gte("created_at", todayIso),
      ]);

      const responseRate = inbound.count ? Math.round(((outbound.count ?? 0) / inbound.count) * 100) : 0;
      return {
        openConversations: open.count ?? 0,
        pendingConversations: pending.count ?? 0,
        resolvedToday: resolved.count ?? 0,
        newLeadsToday: contacts.count ?? 0,
        aiRepliesToday: aiMessages.count ?? 0,
        responseRate,
        connectedChannels: connectedChannels.count ?? 0,
        webhookErrorsToday: webhookErrors.count ?? 0,
      };
    },
  });

  const cards = [
    { label: "Conversas abertas", value: stats?.openConversations ?? 0, icon: Inbox, tone: "primary" },
    { label: "Leads novos hoje", value: stats?.newLeadsToday ?? 0, icon: UserPlus, tone: "success" },
    { label: "Atendimentos pendentes", value: stats?.pendingConversations ?? 0, icon: Clock, tone: "warning" },
    { label: "Respondidas pela IA hoje", value: stats?.aiRepliesToday ?? 0, icon: Bot, tone: "primary" },
    { label: "Taxa de resposta hoje", value: `${stats?.responseRate ?? 0}%`, icon: TrendingUp, tone: "muted" },
    { label: "Resolvidas hoje", value: stats?.resolvedToday ?? 0, icon: CheckCircle2, tone: "success" },
    { label: "Canais conectados", value: stats?.connectedChannels ?? 0, icon: Radio, tone: "primary" },
    { label: "Erros webhook hoje", value: stats?.webhookErrorsToday ?? 0, icon: AlertTriangle, tone: stats?.webhookErrorsToday ? "warning" : "muted" },
  ] as const;

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Visão real do atendimento, WhatsApp, webhook e IA.</p>
        </div>
        <Button asChild><Link to="/canais">Conectar WhatsApp</Link></Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{c.label}</span>
              <div className={iconClass(c.tone)}><c.icon className="h-4 w-4" /></div>
            </div>
            <div className="mt-3 font-display text-3xl font-extrabold">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="font-display text-lg font-bold">Fluxo profissional</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Mensagens entram pela Cloud API, caem no webhook, viram contato, conversa e histórico. A IA responde somente se estiver habilitada e com base cadastrada.
          </p>
        </div>
        <div className="rounded-2xl border border-dashed border-border bg-card p-6">
          <h2 className="font-display text-lg font-bold">Próximos passos</h2>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>1. Conecte o WhatsApp oficial em <span className="font-medium text-foreground">Canais</span>.</li>
            <li>2. Cadastre serviços, preços e regras na base de conhecimento da IA.</li>
            <li>3. Configure webhook na Meta e envie uma mensagem real para testar.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function iconClass(tone: "success" | "primary" | "muted" | "warning") {
  if (tone === "success") return "grid h-9 w-9 place-items-center rounded-lg bg-success/10 text-success";
  if (tone === "primary") return "grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary";
  if (tone === "warning") return "grid h-9 w-9 place-items-center rounded-lg bg-amber-100 text-amber-700";
  return "grid h-9 w-9 place-items-center rounded-lg bg-muted text-muted-foreground";
}
