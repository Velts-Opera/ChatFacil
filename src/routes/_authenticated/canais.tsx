import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Bot,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Send,
  ShieldCheck,
  Smartphone,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MetaDirectOnboarding } from "@/components/meta-embedded-signup";
import { useSuperAdmin } from "@/hooks/use-super-admin";
import { formatWhatsAppApiError, sendWhatsAppMessage } from "@/lib/whatsapp/api-client";

export const Route = createFileRoute("/_authenticated/canais")({
  head: () => ({
    meta: [
      { title: "Canais — ChatFacil" },
      {
        name: "description",
        content: "Conecte o WhatsApp ao agente ChatFacil pelo fluxo oficial da Meta.",
      },
    ],
  }),
  component: CanaisPage,
});

type ChannelStatus = "disconnected" | "connecting" | "connected" | "error";
type ConnectionMode = "cloud_api" | "coexistence";

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
  connected_at: string | null;
  last_sync_at: string | null;
  verified_name?: string | null;
  quality_rating?: string | null;
  ai_enabled?: boolean | null;
  auto_reply_enabled?: boolean | null;
  human_handoff_enabled?: boolean | null;
  connection_mode?: ConnectionMode | null;
  coexistence_active?: boolean | null;
};

async function edgeFunctionErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "context" in error) {
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        const payload = await context.clone().json();
        if (payload && typeof payload === "object" && "error" in payload) {
          const message = (payload as { error?: unknown }).error;
          if (typeof message === "string" && message.trim()) return message;
        }
      } catch {
        // usa o fallback abaixo
      }
    }
  }
  if (error instanceof Error && error.message && !error.message.includes("non-2xx status code"))
    return error.message;
  return fallback;
}

function CanaisPage() {
  const { isSuperAdmin } = useSuperAdmin();
  const [metaChannel, setMetaChannel] = useState<Channel | null>(null);
  const [loading, setLoading] = useState(true);

  async function loadChannels() {
    setLoading(true);
    const metaResult = await supabase
      .from("channel_public_view" as any)
      .select("*")
      .eq("type", "whatsapp")
      .eq("provider", "meta_cloud_api")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (metaResult.error) toast.error(metaResult.error.message);
    setMetaChannel((metaResult.data as Channel | null) ?? null);
    setLoading(false);
  }

  useEffect(() => {
    loadChannels();
  }, []);

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Canais</h1>
        <p className="text-sm text-muted-foreground">
          Autorize o WhatsApp da sua empresa na integração oficial da Meta. O cliente não precisa
          criar API, webhook ou aplicativo próprio.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border bg-card p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando WhatsApp…
        </div>
      ) : (
        <>
          {metaChannel && (
            <OfficialChannel
              channel={metaChannel}
              onChanged={loadChannels}
              isSuperAdmin={isSuperAdmin}
            />
          )}

          {!metaChannel && (
            <MetaDirectOnboarding onComplete={loadChannels} />
          )}
        </>
      )}

      <section className="rounded-xl border bg-card p-5">
        <div className="flex items-start gap-3">
          <Bot className="mt-0.5 h-5 w-5 text-primary" />
          <div className="flex-1">
            <div className="font-medium">Agente conectado automaticamente</div>
            <p className="mt-1 text-sm text-muted-foreground">
              O WhatsApp conectado nesta empresa usa o agente configurado para ela. Profissão,
              instruções, base de conhecimento e regras continuam sendo configurados na página do
              agente.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-3">
              <Link to="/agente-ia">Configurar meu agente</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

function OfficialChannel({
  channel,
  onChanged,
  isSuperAdmin,
}: {
  channel: Channel;
  onChanged: () => Promise<void>;
  isSuperAdmin: boolean;
}) {
  const [healthChecking, setHealthChecking] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(channel.ai_enabled ?? true);
  const [autoReply, setAutoReply] = useState(channel.auto_reply_enabled ?? true);

  useEffect(() => {
    setAiEnabled(channel.ai_enabled ?? true);
    setAutoReply(channel.auto_reply_enabled ?? true);
  }, [channel.id, channel.ai_enabled, channel.auto_reply_enabled]);

  const coexistence = channel.connection_mode === "coexistence";

  async function saveAiSettings(nextAi: boolean, nextAuto: boolean) {
    setSavingSettings(true);
    const { error } = await supabase
      .from("channels")
      .update({ ai_enabled: nextAi, auto_reply_enabled: nextAuto })
      .eq("id", channel.id);
    setSavingSettings(false);
    if (error) return toast.error(error.message);
    setAiEnabled(nextAi);
    setAutoReply(nextAuto);
    toast.success("Configuração do agente salva.");
    await onChanged();
  }

  async function healthCheck() {
    setHealthChecking(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-health-check", {
        body: { channel_id: channel.id },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? "A Meta não confirmou a conexão.");
      toast.success(`WhatsApp saudável${data.latency_ms ? ` · ${data.latency_ms}ms` : ""}`);
      await onChanged();
    } catch (error) {
      toast.error(await edgeFunctionErrorMessage(error, "Falha ao verificar o WhatsApp."));
    } finally {
      setHealthChecking(false);
    }
  }

  async function disconnect() {
    if (
      !confirm(
        "Desconectar este WhatsApp do ChatFacil? O agente deixará de responder por esse número.",
      )
    )
      return;
    setDisconnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-disconnect-channel", {
        body: { channel_id: channel.id },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? "Não foi possível desconectar.");
      toast.success("Canal desconectado. Faça uma nova autorização oficial para reconectar.");
      await onChanged();
    } catch (error) {
      toast.error(await edgeFunctionErrorMessage(error, "Falha ao desconectar."));
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="rounded-lg bg-green-100 p-2 text-green-800">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-semibold">
                  {channel.verified_name || channel.name || "WhatsApp"}
                </h2>
                <StatusBadge status={channel.status} />
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {channel.phone_number || "Número ainda não sincronizado"}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={healthCheck}
              disabled={healthChecking || channel.status !== "connected"}
            >
              {healthChecking ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Verificar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSendOpen(true)}
              disabled={channel.status !== "connected"}
            >
              <Send className="mr-2 h-4 w-4" />
              Enviar teste
            </Button>
          </div>
        </div>

        {channel.last_error && (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <strong>Erro:</strong> {channel.last_error}
            </div>
          </div>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Info label="Modo" value={coexistence ? "WhatsApp Business + IA" : "Meta Cloud API"} />
          <Info label="Qualidade" value={channel.quality_rating || "—"} />
          <Info label="Última sincronização" value={fmt(channel.last_sync_at)} />
          <Info
            label="Celular"
            value={
              coexistence
                ? channel.coexistence_active
                  ? "Sincronizado"
                  : "Aguardando confirmação"
                : "Número dedicado"
            }
          />
        </div>

        {coexistence && (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
            <Smartphone className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              O WhatsApp Business pode continuar no celular. Uma resposta humana pausa a IA naquela
              conversa.
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          <h2 className="font-medium">Atendimento automático</h2>
        </div>
        <div className="space-y-4">
          <ToggleRow
            title="Agente habilitado neste número"
            description="Permite que o agente processe novas mensagens."
            checked={aiEnabled}
            disabled={savingSettings}
            onCheckedChange={(value) => saveAiSettings(value, value ? autoReply : false)}
          />
          <ToggleRow
            title="Responder automaticamente"
            description="Quando a conversa não está em atendimento humano, o agente responde sozinho."
            checked={autoReply}
            disabled={savingSettings || !aiEnabled}
            onCheckedChange={(value) => saveAiSettings(aiEnabled, value)}
          />
        </div>
      </section>

      {isSuperAdmin && <AdminDiagnostics channel={channel} onChanged={onChanged} />}

      {channel.status === "connected" && (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed p-4">
          <div className="text-sm text-muted-foreground">
            Use a desconexão somente para remover este número. Depois disso, será necessária uma
            nova autorização oficial da Meta.
          </div>
          <Button variant="destructive" size="sm" onClick={disconnect} disabled={disconnecting}>
            {disconnecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Desconectar
          </Button>
        </section>
      )}

      <SendTestDialog open={sendOpen} onOpenChange={setSendOpen} channelId={channel.id} />
    </div>
  );
}

function AdminDiagnostics({
  channel,
  onChanged,
}: {
  channel: Channel;
  onChanged: () => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const [accessToken, setAccessToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState(channel.phone_number_id ?? "");
  const [wabaId, setWabaId] = useState(channel.waba_id ?? "");
  const [verifyToken, setVerifyToken] = useState(channel.verify_token ?? "");

  async function saveAndTest() {
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-test-connection", {
        body: {
          channel_id: channel.id,
          name: channel.name,
          access_token: accessToken || undefined,
          app_secret: appSecret || undefined,
          phone_number_id: phoneNumberId,
          waba_id: wabaId,
          verify_token: verifyToken,
          ai_enabled: channel.ai_enabled ?? true,
          auto_reply_enabled: channel.auto_reply_enabled ?? true,
          human_handoff_enabled: channel.human_handoff_enabled ?? true,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? "A Meta recusou a configuração.");
      setAccessToken("");
      setAppSecret("");
      toast.success("Credenciais validadas e canal sincronizado.");
      await onChanged();
    } catch (error) {
      toast.error(await edgeFunctionErrorMessage(error, "Falha ao validar configuração manual."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <details className="rounded-xl border bg-card p-5">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium">
        <Wrench className="h-4 w-4" />
        Diagnóstico técnico do administrador
      </summary>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Phone Number ID">
          <Input value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} />
        </Field>
        <Field label="WABA ID">
          <Input value={wabaId} onChange={(e) => setWabaId(e.target.value)} />
        </Field>
        <Field label="Verify Token">
          <Input value={verifyToken} onChange={(e) => setVerifyToken(e.target.value)} />
        </Field>
        <Field label="Access Token novo">
          <Input
            type="password"
            autoComplete="off"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder="Deixe vazio para manter o atual"
          />
        </Field>
        <Field label="App Secret novo">
          <Input
            type="password"
            autoComplete="off"
            value={appSecret}
            onChange={(e) => setAppSecret(e.target.value)}
            placeholder="Deixe vazio para manter o atual"
          />
        </Field>
      </div>
      <Button
        className="mt-4"
        onClick={saveAndTest}
        disabled={saving || !phoneNumberId || !wabaId || !verifyToken}
      >
        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar e testar API real
      </Button>
    </details>
  );
}

function SendTestDialog({
  open,
  onOpenChange,
  channelId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channelId: string;
}) {
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("Olá! Esta é uma mensagem de teste do ChatFacil.");
  const [sending, setSending] = useState(false);

  async function send() {
    if (!to.trim() || !message.trim()) return toast.error("Informe o telefone e a mensagem.");
    setSending(true);
    try {
      const result = await sendWhatsAppMessage(channelId, {
        to: to.trim(),
        message: message.trim(),
      });
      if (!result.ok) throw new Error("A API não confirmou o envio.");
      toast.success("Mensagem enviada pela Meta.");
      onOpenChange(false);
    } catch (error) {
      toast.error(formatWhatsAppApiError(error));
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enviar teste real</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Destino com DDI + DDD">
            <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="5521999999999" />
          </Field>
          <Field label="Mensagem">
            <Input value={message} onChange={(e) => setMessage(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button onClick={send} disabled={sending}>
            {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function StatusBadge({ status }: { status: ChannelStatus }) {
  const style =
    status === "connected"
      ? "bg-green-100 text-green-800"
      : status === "error"
        ? "bg-red-100 text-red-800"
        : status === "connecting"
          ? "bg-amber-100 text-amber-800"
          : "bg-muted text-muted-foreground";
  const label =
    status === "connected"
      ? "Conectado"
      : status === "error"
        ? "Erro"
        : status === "connecting"
          ? "Conectando"
          : "Desconectado";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${style}`}
    >
      {status === "connected" && <CheckCircle2 className="h-3 w-3" />}
      {label}
    </span>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

function fmt(value?: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("pt-BR");
  } catch {
    return value;
  }
}
