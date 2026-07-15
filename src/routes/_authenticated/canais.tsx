import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Bot, CheckCircle2, Copy, Globe, Instagram, KeyRound, Loader2,
  MessageCircle, MessagesSquare, Plus, QrCode, Radio, RefreshCw, Send, ShieldCheck,
  Trash2, TriangleAlert, Workflow, Zap,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { WhatsAppQrConnect } from "@/components/whatsapp-qr-connect";
import { MetaOnboardingLink } from "@/components/meta-embedded-signup";
import type { ConnectionStatus } from "@/lib/whatsapp/provider";

export const Route = createFileRoute("/_authenticated/canais")({
  head: () => ({
    meta: [
      { title: "Canais — Comunica AI" },
      { name: "description", content: "Conexão real com WhatsApp Cloud API, webhook, IA e caixa de entrada." },
    ],
  }),
  component: CanaisPage,
});

type ChannelStatus = "disconnected" | "connecting" | "connected" | "error";

type Channel = {
  id: string;
  company_id: string;
  type: string;
  provider?: string | null;
  name: string;
  status: ChannelStatus;
  phone_number: string | null;
  phone_number_id: string | null;
  waba_id: string | null;
  verify_token: string | null;
  webhook_url: string | null;
  last_error: string | null;
  last_error_code?: string | null;
  connected_at: string | null;
  last_sync_at: string | null;
  verified_name?: string | null;
  quality_rating?: string | null;
  ai_enabled?: boolean | null;
  auto_reply_enabled?: boolean | null;
  human_handoff_enabled?: boolean | null;
  handoff_when_unknown?: boolean | null;
  greeting_message?: string | null;
  out_of_hours_message?: string | null;
  business_hours?: string | null;
  app_secret_present?: boolean | null;
  created_at: string;
  updated_at: string;
};

type WebhookEvent = {
  id: string;
  event_type: string;
  status: string;
  source: string;
  payload: any;
  error_message?: string | null;
  created_at: string;
};

type MessageRow = {
  id: string;
  direction: string | null;
  sender_type?: string | null;
  content: string;
  status: string | null;
  message_type: string | null;
  meta_message_id?: string | null;
  ai_generated?: boolean | null;
  error_message?: string | null;
  created_at: string;
};

type AiInteraction = {
  id: string;
  status: string;
  model: string | null;
  input: string | null;
  output: string | null;
  error_message: string | null;
  created_at: string;
};

type KnowledgeItem = {
  id: string;
  title: string;
  content: string;
  is_active: boolean;
  created_at: string;
};

type WhatsAppTemplate = {
  id: string;
  name: string;
  language: string;
  category: string | null;
  status: string | null;
  last_synced_at: string | null;
};

type HealthCheck = {
  id: string;
  check_type: string;
  status: string;
  latency_ms: number | null;
  error_message: string | null;
  created_at: string;
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const WEBHOOK_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/whatsapp-webhook` : "Configure VITE_SUPABASE_URL";

function CanaisPage() {
  const [selected, setSelected] = useState<null | "whatsapp" | "whatsapp-qr" | "instagram" | "messenger" | "webchat">(null);
  const [whatsChannel, setWhatsChannel] = useState<Channel | null>(null);
  const [qrChannel, setQrChannel] = useState<Channel | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadChannel() {
    setLoading(true);
    const { data, error } = await supabase
      .from("channel_public_view" as any)
      .select("*")
      .eq("type", "whatsapp")
      .eq("provider", "meta_cloud_api")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) toast.error(error.message);
    const ch = (data as Channel | null) ?? null;
    if (ch && (ch as any).provider === "qr_code") {
      setQrChannel(ch);
    } else {
      setWhatsChannel(ch);
    }
    setLoading(false);
  }

  async function loadQrChannel() {
    const { data } = await supabase
      .from("channels" as any)
      .select("*")
      .eq("type", "whatsapp")
      .eq("provider", "qr_code")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setQrChannel((data as Channel | null) ?? null);
  }

  useEffect(() => {
    loadChannel();
    loadQrChannel();
  }, []);

  if (selected === "whatsapp") {
    return <WhatsAppPanel channel={whatsChannel} loading={loading} onBack={() => setSelected(null)} onChanged={loadChannel} />;
  }

  if (selected === "whatsapp-qr") {
    return <WhatsAppQrPanel channel={qrChannel} onBack={() => setSelected(null)} onChanged={loadQrChannel} />;
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Canais</h1>
        <p className="text-sm text-muted-foreground">Conecte canais reais de atendimento. WhatsApp já usa Cloud API, webhook, banco e caixa de entrada.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ChannelCard
          icon={<MessageCircle className="h-5 w-5" />}
          name="WhatsApp"
          description="Cloud API oficial, webhook e IA."
          status={whatsChannel?.status ?? "disconnected"}
          onClick={() => setSelected("whatsapp")}
        />
        <ChannelCard
          icon={<QrCode className="h-5 w-5" />}
          name="WhatsApp Web (QR legado)"
          description="Sessão local; não é Cloud API nem Calling API."
          status={(qrChannel?.status as ChannelStatus) ?? "disconnected"}
          onClick={() => setSelected("whatsapp-qr")}
        />
        <ChannelCard icon={<Instagram className="h-5 w-5" />} name="Instagram" description="Em breve — Instagram Graph API." status="disconnected" disabled />
        <ChannelCard icon={<MessagesSquare className="h-5 w-5" />} name="Messenger" description="Em breve — Messenger Platform." status="disconnected" disabled />
      </div>
    </div>
  );
}

// ─── Painel WhatsApp QR Code ─────────────────────────────────────────────────

function WhatsAppQrPanel({
  channel,
  onBack,
  onChanged,
}: {
  channel: Channel | null;
  onBack: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const BRIDGE_URL = import.meta.env.VITE_WA_BRIDGE_URL as string | undefined ?? "http://127.0.0.1:3001";
  const [saving, setSaving] = useState(false);
  const [channelId, setChannelId] = useState<string | null>(channel?.id ?? null);
  const [currentStatus, setCurrentStatus] = useState<ConnectionStatus>((channel?.status as ConnectionStatus) ?? "disconnected");

  async function ensureChannel(): Promise<string> {
    if (channelId) return channelId;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id")
        .eq("id", user.id)
        .maybeSingle();
      if (!profile?.company_id) throw new Error("Empresa não encontrada");

      const { data, error } = await supabase
        .from("channels")
        .insert({
          company_id: profile.company_id,
          type: "whatsapp",
          name: "WhatsApp QR Code",
          status: "disconnected",
          provider: "qr_code",
          bridge_url: BRIDGE_URL,
        } as any)
        .select("id")
        .single();
      if (error) throw error;
      setChannelId(data.id);
      await onChanged();
      return data.id;
    } finally {
      setSaving(false);
    }
  }

  async function handleConnected(phoneNumber: string) {
    setCurrentStatus("connected");
    if (channelId) {
      await supabase.from("channels").update({
        status: "connected",
        phone_number: phoneNumber || null,
        connected_at: new Date().toISOString(),
      } as any).eq("id", channelId);
    }
    await onChanged();
  }

  async function handleDisconnected() {
    setCurrentStatus("disconnected");
    if (channelId) {
      await supabase.from("channels").update({ status: "disconnected" } as any).eq("id", channelId);
    }
    await onChanged();
  }

  async function getResolvedChannelId(): Promise<string> {
    if (channelId) return channelId;
    return ensureChannel();
  }

  const [resolvedId, setResolvedId] = useState<string | null>(channel?.id ?? null);

  useEffect(() => {
    if (!resolvedId) {
      ensureChannel().then((id) => setResolvedId(id)).catch(() => {});
    }
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="-ml-2">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-xl font-semibold tracking-tight">WhatsApp Web via QR (legado)</h1>
          <p className="text-sm text-muted-foreground">Sessão local separada do onboarding oficial da Meta e sem suporte à Calling API.</p>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <div className="mb-4">
          <h2 className="font-medium">Conexão via QR Code</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Certifique-se de que o bridge server está rodando. Clique em <strong>Gerar QR Code</strong> e escaneie com o seu WhatsApp.
          </p>
        </div>

        {saving && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Criando canal...
          </div>
        )}

        {resolvedId && (
          <WhatsAppQrConnect
            channelId={resolvedId}
            bridgeUrl={BRIDGE_URL}
            initialStatus={currentStatus}
            onConnected={handleConnected}
            onDisconnected={handleDisconnected}
          />
        )}
      </div>

      {resolvedId && <QrAiSettings channelId={resolvedId} />}

      <div className="rounded-xl border bg-muted/30 p-5">
        <h3 className="font-medium text-sm mb-3">Como iniciar o bridge server</h3>
        <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
          <li>Abra um terminal separado (não o Claude Code)</li>
          <li>
            <code className="rounded bg-muted px-1 font-mono text-xs">cd C:\Users\Veltrani\ChatFacil\server</code>
          </li>
          <li>
            <code className="rounded bg-muted px-1 font-mono text-xs">npm install</code>
          </li>
          <li>
            <code className="rounded bg-muted px-1 font-mono text-xs">node whatsapp-bridge.js</code>
          </li>
        </ol>
      </div>
    </div>
  );
}

function QrAiSettings({ channelId }: { channelId: string }) {
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [autoReply, setAutoReply] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("channels" as any).select("ai_enabled, auto_reply_enabled").eq("id", channelId).maybeSingle()
      .then(({ data }: any) => {
        if (data) { setAiEnabled(data.ai_enabled ?? false); setAutoReply(data.auto_reply_enabled ?? false); }
      });
  }, [channelId]);

  async function save(field: "ai_enabled" | "auto_reply_enabled", value: boolean) {
    setSaving(true);
    const { error } = await supabase.from("channels" as any).update({ [field]: value } as any).eq("id", channelId);
    if (error) toast.error(error.message);
    else {
      if (field === "ai_enabled") setAiEnabled(value);
      else setAutoReply(value);
      toast.success("Configuração salva.");
    }
    setSaving(false);
  }

  if (aiEnabled === null || autoReply === null) return null;

  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Bot className="h-4 w-4 text-primary" />
        <h2 className="font-medium">IA de atendimento (Gemini)</h2>
      </div>
      <div className="space-y-3">
        <ToggleRow
          title="Habilitar IA nesse canal"
          description="Permite que o Gemini processe as mensagens recebidas."
          checked={aiEnabled}
          onCheckedChange={(v) => save("ai_enabled", v)}
        />
        <ToggleRow
          title="Responder automaticamente com IA"
          description="Quando ativado, o Gemini responde cada mensagem recebida automaticamente."
          checked={autoReply}
          onCheckedChange={(v) => save("auto_reply_enabled", v)}
        />
        {saving && <p className="text-xs text-muted-foreground">Salvando...</p>}
        {autoReply && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            Configure a base de conhecimento na seção abaixo para que a IA responda com precisão.
            Certifique-se de que <strong>GEMINI_API_KEY</strong> e <strong>SUPABASE_SERVICE_ROLE_KEY</strong> estão configurados no <code>server/.env</code> do servidor-mãe.
          </p>
        )}
      </div>
    </div>
  );
}

function ChannelCard({ icon, name, description, status, disabled, onClick }: {
  icon: React.ReactNode;
  name: string;
  description: string;
  status: ChannelStatus;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn("text-left rounded-xl border bg-card p-5 shadow-sm transition hover:shadow-md", disabled && "cursor-not-allowed opacity-60 hover:shadow-sm")}
    >
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary">{icon}</div>
        <div className="flex-1">
          <div className="font-medium">{name}</div>
          <div className="text-xs text-muted-foreground">{description}</div>
        </div>
        <StatusBadge status={status} />
      </div>
    </button>
  );
}

function StatusBadge({ status }: { status: ChannelStatus }) {
  const map: Record<ChannelStatus, { label: string; cls: string; icon?: React.ReactNode }> = {
    disconnected: { label: "Desconectado", cls: "bg-muted text-muted-foreground" },
    connecting: { label: "Conectando", cls: "bg-amber-100 text-amber-800", icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    connected: { label: "Conectado", cls: "bg-green-100 text-green-800", icon: <CheckCircle2 className="h-3 w-3" /> },
    error: { label: "Erro", cls: "bg-red-100 text-red-800", icon: <TriangleAlert className="h-3 w-3" /> },
  };
  const s = map[status];
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", s.cls)}>{s.icon}{s.label}</span>;
}

function WhatsAppPanel({ channel, loading, onBack, onChanged }: {
  channel: Channel | null;
  loading: boolean;
  onBack: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const [name, setName] = useState(channel?.name ?? "WhatsApp principal");
  const [accessToken, setAccessToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState(channel?.phone_number_id ?? "");
  const [wabaId, setWabaId] = useState(channel?.waba_id ?? "");
  const [verifyToken, setVerifyToken] = useState(channel?.verify_token ?? crypto.randomUUID());
  const [aiEnabled, setAiEnabled] = useState(channel?.ai_enabled ?? true);
  const [autoReplyEnabled, setAutoReplyEnabled] = useState(channel?.auto_reply_enabled ?? false);
  const [humanHandoffEnabled, setHumanHandoffEnabled] = useState(channel?.human_handoff_enabled ?? true);
  const [handoffWhenUnknown, setHandoffWhenUnknown] = useState(channel?.handoff_when_unknown ?? true);
  const [greetingMessage, setGreetingMessage] = useState(channel?.greeting_message ?? "Olá! Recebemos sua mensagem. Vou te ajudar por aqui.");
  const [outOfHoursMessage, setOutOfHoursMessage] = useState(channel?.out_of_hours_message ?? "Olá! Estamos fora do horário de atendimento. Já recebemos sua mensagem e responderemos assim que possível.");
  const [businessHours, setBusinessHours] = useState(channel?.business_hours ?? "Segunda a sexta, 09:00 às 18:00");
  const [testing, setTesting] = useState(false);
  const [healthChecking, setHealthChecking] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);

  useEffect(() => {
    if (!channel) return;
    setName(channel.name);
    setAccessToken("");
    setAppSecret("");
    setPhoneNumberId(channel.phone_number_id ?? "");
    setWabaId(channel.waba_id ?? "");
    setVerifyToken(channel.verify_token ?? crypto.randomUUID());
    setAiEnabled(channel.ai_enabled ?? true);
    setAutoReplyEnabled(channel.auto_reply_enabled ?? false);
    setHumanHandoffEnabled(channel.human_handoff_enabled ?? true);
    setHandoffWhenUnknown(channel.handoff_when_unknown ?? true);
    setGreetingMessage(channel.greeting_message ?? "Olá! Recebemos sua mensagem. Vou te ajudar por aqui.");
    setOutOfHoursMessage(channel.out_of_hours_message ?? "Olá! Estamos fora do horário de atendimento. Já recebemos sua mensagem e responderemos assim que possível.");
    setBusinessHours(channel.business_hours ?? "Segunda a sexta, 09:00 às 18:00");
  }, [channel?.id]);

  const status = channel?.status ?? "disconnected";
  const readyToTest = name && phoneNumberId && wabaId && verifyToken && (accessToken || channel?.status === "connected");

  async function handleTest() {
    if (!readyToTest) {
      toast.error(channel?.status === "connected" ? "Preencha os dados obrigatórios." : "Preencha todos os dados, incluindo Access Token.");
      return;
    }
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-test-connection", {
        body: {
          channel_id: channel?.id,
          name,
          access_token: accessToken || undefined,
          app_secret: appSecret || undefined,
          phone_number_id: phoneNumberId,
          waba_id: wabaId,
          verify_token: verifyToken,
          ai_enabled: aiEnabled,
          auto_reply_enabled: autoReplyEnabled,
          human_handoff_enabled: humanHandoffEnabled,
          handoff_when_unknown: handoffWhenUnknown,
          greeting_message: greetingMessage,
          out_of_hours_message: outOfHoursMessage,
          business_hours: businessHours,
        },
      });
      if (error) throw error;
      if (data?.ok) {
        toast.success("Conexão real validada com a Meta.");
        setAccessToken("");
        setAppSecret("");
      } else toast.error(data?.error ?? "Falha ao validar conexão.");
      await onChanged();
    } catch (e: any) {
      toast.error(e.message ?? "Erro inesperado.");
    } finally {
      setTesting(false);
    }
  }

  async function handleDisconnect() {
    if (!channel) return;
    if (!confirm("Desconectar este canal? Isso remove credenciais criptografadas e interrompe o envio de mensagens.")) return;
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-disconnect-channel", { body: { channel_id: channel.id } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? "Falha ao desconectar canal.");
      toast.success("Canal desconectado com segurança.");
      await onChanged();
    } catch (e: any) {
      toast.error(e.message ?? "Erro inesperado.");
    }
  }

  async function handleHealthCheck() {
    if (!channel) return;
    setHealthChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-health-check", { body: { channel_id: channel.id } });
      if (error) throw error;
      if (data?.ok) toast.success(`Canal saudável. Latência: ${data.latency_ms ?? "—"}ms`);
      else toast.error(data?.error ?? "Falha no health check.");
      await onChanged();
    } catch (e: any) {
      toast.error(e.message ?? "Erro inesperado.");
    } finally {
      setHealthChecking(false);
    }
  }

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="mr-1 h-4 w-4" />Voltar</Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">Conectar WhatsApp</h1>
          <p className="text-sm text-muted-foreground">Cloud API oficial por Embedded Signup ou configuração manual de credenciais.</p>
        </div>
        <StatusBadge status={status} />
      </div>

      {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>}

      <MetaOnboardingLink onComplete={onChanged} />

      {status === "error" && channel?.last_error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <div className="flex items-center gap-2 font-medium"><TriangleAlert className="h-4 w-4" />Erro real da API da Meta</div>
          <div className="mt-1">{channel.last_error}</div>
          {channel.last_error_code && <div className="mt-1 text-xs">Código: {channel.last_error_code}</div>}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h2 className="font-medium">Configuração manual (alternativa)</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Nome do canal"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Atendimento principal" /></Field>
            <Field label="Phone Number ID"><Input value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} placeholder="123456789012345" /></Field>
            <Field label="WhatsApp Business Account ID"><Input value={wabaId} onChange={(e) => setWabaId(e.target.value)} placeholder="123456789012345" /></Field>
            <Field label="Verify Token do Webhook"><Input value={verifyToken} onChange={(e) => setVerifyToken(e.target.value)} placeholder="Segredo forte que você define" /></Field>
            <Field label={channel?.status === "connected" ? "Access Token novo (opcional para trocar)" : "Access Token da Meta"}>
              <Input value={accessToken} onChange={(e) => setAccessToken(e.target.value)} placeholder="EAA..." type="password" autoComplete="off" />
            </Field>
            <Field label={channel?.app_secret_present ? "App Secret novo (opcional para trocar)" : "App Secret do app Meta (recomendado)"}>
              <Input value={appSecret} onChange={(e) => setAppSecret(e.target.value)} placeholder="Usado para validar assinatura do webhook" type="password" autoComplete="off" />
            </Field>
          </div>

          <div className="mt-5 rounded-lg border bg-muted/30 p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium"><KeyRound className="h-4 w-4" />Checklist na Meta</div>
            <ol className="space-y-1 text-xs text-muted-foreground">
              <li>1. Configure o Webhook Callback URL abaixo no Meta Developers.</li>
              <li>2. Use exatamente o mesmo Verify Token salvo aqui.</li>
              <li>3. Assine o campo <span className="font-mono">messages</span>.</li>
              <li>4. Teste conexão. Só vira “Conectado” se a Meta responder com sucesso.</li>
            </ol>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={handleTest} disabled={testing || !readyToTest}>
              {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              {channel ? "Salvar e testar API real" : "Conectar e testar API real"}
            </Button>
            {channel && (
              <>
                <Button variant="outline" onClick={() => setSendOpen(true)} disabled={status !== "connected"}>
                  <Send className="mr-2 h-4 w-4" />Enviar teste real
                </Button>
                <Button variant="outline" onClick={handleHealthCheck} disabled={status !== "connected" || healthChecking}>
                  {healthChecking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Health check
                </Button>
                <Button variant="ghost" className="text-red-600 hover:text-red-700" onClick={handleDisconnect}>
                  <Trash2 className="mr-2 h-4 w-4" />Desconectar
                </Button>
              </>
            )}
          </div>
        </section>

        <section className="rounded-xl border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2"><Radio className="h-4 w-4 text-primary" /><h2 className="font-medium">Webhook e status</h2></div>
          <div className="space-y-3 text-sm">
            <Field label="Callback URL"><CopyBox value={WEBHOOK_URL} /></Field>
            <Field label="Verify Token salvo"><CopyBox value={channel?.verify_token ?? verifyToken ?? "—"} /></Field>
            {channel && (
              <div className="grid grid-cols-2 gap-3 pt-2">
                <Info label="Número" value={channel.phone_number ?? "—"} />
                <Info label="Nome verificado" value={channel.verified_name ?? "—"} />
                <Info label="Qualidade" value={channel.quality_rating ?? "—"} />
                <Info label="Phone Number ID" value={channel.phone_number_id ?? "—"} />
                <Info label="WABA ID" value={channel.waba_id ?? "—"} />
                <Info label="Última sincronização" value={fmt(channel.last_sync_at)} />
                <Info label="Conectado em" value={fmt(channel.connected_at)} />
                <Info label="App Secret" value={channel.app_secret_present ? "Configurado" : "Não configurado"} />
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2"><Bot className="h-4 w-4 text-primary" /><h2 className="font-medium">IA de atendimento</h2></div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <ToggleRow title="Habilitar IA nesse canal" description="Permite usar regras e IA dentro das conversas desse WhatsApp." checked={aiEnabled} onCheckedChange={setAiEnabled} />
            <ToggleRow title="Responder automaticamente com IA" description="Quando ligado, a IA responde clientes no WhatsApp. Quando desligado, ela apenas organiza a conversa." checked={autoReplyEnabled} onCheckedChange={setAutoReplyEnabled} />
            <ToggleRow title="Transferir para humano" description="Mantém conversas pendentes quando a IA não souber responder com segurança." checked={humanHandoffEnabled} onCheckedChange={setHumanHandoffEnabled} />
            <ToggleRow title="Transferir quando não souber" description="Evita resposta inventada e joga a conversa para atendimento humano." checked={handoffWhenUnknown} onCheckedChange={setHandoffWhenUnknown} />
          </div>
          <div className="grid gap-3">
            <Field label="Horário de atendimento"><Input value={businessHours} onChange={(e) => setBusinessHours(e.target.value)} /></Field>
            <Field label="Mensagem de saudação"><Textarea value={greetingMessage} onChange={(e) => setGreetingMessage(e.target.value)} rows={2} /></Field>
            <Field label="Mensagem fora do horário"><Textarea value={outOfHoursMessage} onChange={(e) => setOutOfHoursMessage(e.target.value)} rows={2} /></Field>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button variant="outline" onClick={handleTest} disabled={testing || !readyToTest}>
            {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Salvar configurações
          </Button>
        </div>
      </section>

      {channel && (
        <>
          <KnowledgeManager channel={channel} />
          <TemplatesManager channel={channel} />
          <HealthChecksTable channelId={channel.id} />
          <WebhookEventsTable channelId={channel.id} />
          <MessagesTable channelId={channel.id} />
          <AiInteractionsTable channelId={channel.id} />
          <SendMessageDialog open={sendOpen} onOpenChange={setSendOpen} channelId={channel.id} onSent={onChanged} />
        </>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs font-medium">{label}</Label>{children}</div>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs text-muted-foreground">{label}</div><div className="truncate font-mono text-xs">{value}</div></div>;
}

function CopyBox({ value }: { value: string }) {
  return (
    <div className="flex gap-2">
      <Input readOnly value={value} />
      <Button variant="outline" onClick={() => { navigator.clipboard.writeText(value); toast.success("Copiado"); }}><Copy className="h-4 w-4" /></Button>
    </div>
  );
}

function ToggleRow({ title, description, checked, onCheckedChange }: { title: string; description: string; checked: boolean; onCheckedChange: (value: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function fmt(v: string | null | undefined) {
  if (!v) return "—";
  try { return new Date(v).toLocaleString("pt-BR"); } catch { return v; }
}

function short(v: string | null | undefined, max = 80) {
  if (!v) return "—";
  return v.length > max ? `${v.slice(0, max)}…` : v;
}

function WebhookEventsTable({ channelId }: { channelId: string }) {
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("webhook_events")
      .select("id, event_type, status, source, payload, error_message, created_at")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) toast.error(error.message);
    setEvents((data as WebhookEvent[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [channelId]);

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div><h2 className="font-medium">Eventos recebidos pelo Webhook</h2><p className="text-xs text-muted-foreground">Eventos reais gravados pela Edge Function.</p></div>
        <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="mr-1 h-3.5 w-3.5" />Atualizar</Button>
      </div>
      {loading ? <div className="text-sm text-muted-foreground">Carregando…</div> : events.length === 0 ? (
        <div className="text-sm text-muted-foreground">Nenhum evento ainda. Configure a Callback URL na Meta e envie uma mensagem para o número.</div>
      ) : (
        <ResponsiveTable>
          <TableHeader><TableRow><TableHead>Quando</TableHead><TableHead>Evento</TableHead><TableHead>Origem</TableHead><TableHead>Status</TableHead><TableHead>Erro</TableHead></TableRow></TableHeader>
          <TableBody>
            {events.map((e) => <TableRow key={e.id}><TableCell className="text-xs">{fmt(e.created_at)}</TableCell><TableCell className="text-xs font-mono">{e.event_type}</TableCell><TableCell className="text-xs">{e.source}</TableCell><TableCell><Badge variant="outline" className="text-xs">{e.status}</Badge></TableCell><TableCell className="max-w-[220px] truncate text-xs text-red-600">{e.error_message ?? "—"}</TableCell></TableRow>)}
          </TableBody>
        </ResponsiveTable>
      )}
    </section>
  );
}

function MessagesTable({ channelId }: { channelId: string }) {
  const [msgs, setMsgs] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("messages")
      .select("id, direction, sender_type, content, status, message_type, meta_message_id, ai_generated, error_message, created_at")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) toast.error(error.message);
    setMsgs((data as MessageRow[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [channelId]);

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between"><h2 className="font-medium">Últimas mensagens reais</h2><Button variant="ghost" size="sm" onClick={load}><RefreshCw className="mr-1 h-3.5 w-3.5" />Atualizar</Button></div>
      {loading ? <div className="text-sm text-muted-foreground">Carregando…</div> : msgs.length === 0 ? <div className="text-sm text-muted-foreground">Nenhuma mensagem ainda.</div> : (
        <ResponsiveTable>
          <TableHeader><TableRow><TableHead>Quando</TableHead><TableHead>Direção</TableHead><TableHead>Agente</TableHead><TableHead>Conteúdo</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
          <TableBody>
            {msgs.map((m) => <TableRow key={m.id}><TableCell className="text-xs">{fmt(m.created_at)}</TableCell><TableCell className="text-xs">{m.direction ?? "—"}</TableCell><TableCell className="text-xs">{m.ai_generated ? "IA" : m.sender_type ?? "—"}</TableCell><TableCell className="max-w-[420px] truncate text-xs">{m.content}</TableCell><TableCell className="text-xs">{m.status ?? m.error_message ?? "—"}</TableCell></TableRow>)}
          </TableBody>
        </ResponsiveTable>
      )}
    </section>
  );
}

function AiInteractionsTable({ channelId }: { channelId: string }) {
  const [items, setItems] = useState<AiInteraction[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("ai_interactions")
      .select("id, status, model, input, output, error_message, created_at")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) toast.error(error.message);
    setItems((data as AiInteraction[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [channelId]);

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between"><div><h2 className="font-medium">Processos da IA</h2><p className="text-xs text-muted-foreground">Acompanhe quando a IA analisou e respondeu clientes.</p></div><Button variant="ghost" size="sm" onClick={load}><RefreshCw className="mr-1 h-3.5 w-3.5" />Atualizar</Button></div>
      {loading ? <div className="text-sm text-muted-foreground">Carregando…</div> : items.length === 0 ? <div className="text-sm text-muted-foreground">Nenhum processo de IA ainda. Ative resposta automática e envie uma mensagem real para testar.</div> : (
        <ResponsiveTable>
          <TableHeader><TableRow><TableHead>Quando</TableHead><TableHead>Status</TableHead><TableHead>Modelo</TableHead><TableHead>Entrada</TableHead><TableHead>Saída/erro</TableHead></TableRow></TableHeader>
          <TableBody>
            {items.map((i) => <TableRow key={i.id}><TableCell className="text-xs">{fmt(i.created_at)}</TableCell><TableCell><Badge variant="outline" className="text-xs">{i.status}</Badge></TableCell><TableCell className="text-xs">{i.model ?? "—"}</TableCell><TableCell className="max-w-[260px] truncate text-xs">{short(i.input)}</TableCell><TableCell className="max-w-[320px] truncate text-xs">{short(i.output ?? i.error_message)}</TableCell></TableRow>)}
          </TableBody>
        </ResponsiveTable>
      )}
    </section>
  );
}

function KnowledgeManager({ channel }: { channel: Channel }) {
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data, error } = await supabase
      .from("ai_knowledge_items")
      .select("id, title, content, is_active, created_at")
      .eq("company_id", channel.company_id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) toast.error(error.message);
    setItems((data as KnowledgeItem[]) ?? []);
  }

  useEffect(() => { load(); }, [channel.company_id]);

  async function createItem() {
    if (!title.trim() || !content.trim()) { toast.error("Informe título e conteúdo."); return; }
    setSaving(true);
    const { error } = await supabase.from("ai_knowledge_items" as any).insert({
      company_id: channel.company_id,
      channel_id: channel.id,
      title: title.trim(),
      content: content.trim(),
      is_active: true,
    });
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Conhecimento adicionado para a IA.");
      setTitle("");
      setContent("");
      setOpen(false);
      load();
    }
  }

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div><h2 className="font-medium">Base de conhecimento da IA</h2><p className="text-xs text-muted-foreground">Cadastre regras, preços, serviços, políticas e limites. A IA só deve responder com base nisso.</p></div>
        <Button variant="outline" onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" />Adicionar</Button>
      </div>
      {items.length === 0 ? <div className="text-sm text-muted-foreground">Nenhum item cadastrado. Adicione serviços, preços e perguntas frequentes para a IA responder melhor.</div> : (
        <div className="grid gap-2 md:grid-cols-2">
          {items.map((item) => <div key={item.id} className="rounded-lg border p-3"><div className="flex items-center gap-2"><Zap className="h-3.5 w-3.5 text-primary" /><div className="text-sm font-medium">{item.title}</div></div><p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{item.content}</p></div>)}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo conhecimento para IA</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Título"><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Preços, Horários, Política de entrega" /></Field>
            <Field label="Conteúdo"><Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={6} placeholder="Escreva a informação exata que a IA pode usar." /></Field>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={createItem} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}


function TemplatesManager({ channel }: { channel: Channel }) {
  const [items, setItems] = useState<WhatsAppTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateLanguage, setTemplateLanguage] = useState("pt_BR");
  const [to, setTo] = useState("");
  const [params, setParams] = useState("");
  const [sending, setSending] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("whatsapp_templates")
      .select("id, name, language, category, status, last_synced_at")
      .eq("channel_id", channel.id)
      .order("name", { ascending: true });
    if (error) toast.error(error.message);
    setItems((data as WhatsAppTemplate[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [channel.id]);

  async function syncTemplates() {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-sync-templates", { body: { channel_id: channel.id } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? "Falha ao sincronizar templates.");
      toast.success(`${data.count ?? 0} templates sincronizados da Meta.`);
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "Erro inesperado.");
    } finally {
      setSyncing(false);
    }
  }

  function openSend(t?: WhatsAppTemplate) {
    setTemplateName(t?.name ?? "");
    setTemplateLanguage(t?.language ?? "pt_BR");
    setSendOpen(true);
  }

  async function sendTemplate() {
    if (!templateName.trim() || !to.trim()) { toast.error("Informe template e telefone."); return; }
    setSending(true);
    try {
      const body_parameters = params.split("\n").map((p) => p.trim()).filter(Boolean);
      const { data, error } = await supabase.functions.invoke("whatsapp-send-template", {
        body: { channel_id: channel.id, to, template_name: templateName.trim(), language: templateLanguage.trim() || "pt_BR", body_parameters },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? "Falha ao enviar template.");
      toast.success("Template enviado pela Cloud API.");
      setSendOpen(false);
    } catch (e: any) {
      toast.error(e.message ?? "Erro inesperado.");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium">Templates oficiais do WhatsApp</h2>
          <p className="text-xs text-muted-foreground">Sincronize templates aprovados pela Meta e envie mensagens fora da janela de 24h.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => openSend()} disabled={channel.status !== "connected"}><Send className="mr-1 h-4 w-4" />Enviar template</Button>
          <Button onClick={syncTemplates} disabled={syncing || channel.status !== "connected"}>{syncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Sincronizar Meta</Button>
        </div>
      </div>
      {loading ? <div className="text-sm text-muted-foreground">Carregando…</div> : items.length === 0 ? (
        <div className="text-sm text-muted-foreground">Nenhum template sincronizado ainda. Aprove templates no Meta Business e clique em “Sincronizar Meta”.</div>
      ) : (
        <ResponsiveTable>
          <TableHeader><TableRow><TableHead>Template</TableHead><TableHead>Idioma</TableHead><TableHead>Categoria</TableHead><TableHead>Status</TableHead><TableHead>Sync</TableHead><TableHead></TableHead></TableRow></TableHeader>
          <TableBody>
            {items.map((t) => <TableRow key={t.id}><TableCell className="text-xs font-medium">{t.name}</TableCell><TableCell className="text-xs">{t.language}</TableCell><TableCell className="text-xs">{t.category ?? "—"}</TableCell><TableCell><Badge variant="outline" className="text-xs">{t.status ?? "—"}</Badge></TableCell><TableCell className="text-xs">{fmt(t.last_synced_at)}</TableCell><TableCell className="text-right"><Button size="sm" variant="ghost" onClick={() => openSend(t)}>Enviar</Button></TableCell></TableRow>)}
          </TableBody>
        </ResponsiveTable>
      )}

      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Enviar template oficial</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Field label="Telefone destino (DDI + DDD + número)"><Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="5522999999999" /></Field>
            <Field label="Nome do template"><Input value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="nome_aprovado_na_meta" /></Field>
            <Field label="Idioma"><Input value={templateLanguage} onChange={(e) => setTemplateLanguage(e.target.value)} placeholder="pt_BR" /></Field>
            <Field label="Parâmetros do corpo, um por linha"><Textarea value={params} onChange={(e) => setParams(e.target.value)} rows={4} placeholder="João\nPedido 123\nR$ 97,00" /></Field>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setSendOpen(false)}>Cancelar</Button><Button onClick={sendTemplate} disabled={sending}>{sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Enviar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function HealthChecksTable({ channelId }: { channelId: string }) {
  const [items, setItems] = useState<HealthCheck[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("integration_health_checks")
      .select("id, check_type, status, latency_ms, error_message, created_at")
      .eq("channel_id", channelId)
      .order("created_at", { ascending: false })
      .limit(10);
    if (error) toast.error(error.message);
    setItems((data as HealthCheck[]) ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [channelId]);

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between"><div><h2 className="font-medium">Saúde da integração</h2><p className="text-xs text-muted-foreground">Histórico real de testes contra a API da Meta.</p></div><Button variant="ghost" size="sm" onClick={load}><RefreshCw className="mr-1 h-3.5 w-3.5" />Atualizar</Button></div>
      {loading ? <div className="text-sm text-muted-foreground">Carregando…</div> : items.length === 0 ? <div className="text-sm text-muted-foreground">Nenhum health check registrado.</div> : (
        <ResponsiveTable>
          <TableHeader><TableRow><TableHead>Quando</TableHead><TableHead>Tipo</TableHead><TableHead>Status</TableHead><TableHead>Latência</TableHead><TableHead>Erro</TableHead></TableRow></TableHeader>
          <TableBody>{items.map((i) => <TableRow key={i.id}><TableCell className="text-xs">{fmt(i.created_at)}</TableCell><TableCell className="text-xs font-mono">{i.check_type}</TableCell><TableCell><Badge variant="outline" className="text-xs">{i.status}</Badge></TableCell><TableCell className="text-xs">{i.latency_ms ? `${i.latency_ms}ms` : "—"}</TableCell><TableCell className="max-w-[260px] truncate text-xs text-red-600">{i.error_message ?? "—"}</TableCell></TableRow>)}</TableBody>
        </ResponsiveTable>
      )}
    </section>
  );
}

function ResponsiveTable({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto"><Table>{children}</Table></div>;
}

function SendMessageDialog({ open, onOpenChange, channelId, onSent }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channelId: string;
  onSent: () => void | Promise<void>;
}) {
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("Olá! Mensagem de teste enviada pela Comunica AI.");
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!to || !message) { toast.error("Preencha telefone e mensagem."); return; }
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-send-message", { body: { channel_id: channelId, to, message } });
      if (error) throw error;
      if (data?.ok) { toast.success("Mensagem real enviada pela Cloud API."); onOpenChange(false); await onSent(); }
      else toast.error(data?.error ?? "Falha ao enviar.");
    } catch (e: any) {
      toast.error(e.message ?? "Erro inesperado.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Enviar mensagem de teste real</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Field label="Telefone destino (DDI + DDD + número)"><Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="5522999999999" /></Field>
          <Field label="Mensagem"><Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} /></Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSend} disabled={sending}>{sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}Enviar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
