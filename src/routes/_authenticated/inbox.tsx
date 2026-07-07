import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, Send, Zap, UserCheck, CheckCircle2, ArrowLeft, Bot, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/inbox")({
  head: () => ({ meta: [{ title: "Inbox — Comunica AI" }] }),
  component: InboxPage,
});

type Filter = "abertas" | "pendentes" | "resolvidas" | "ia" | "humano";

type Conversation = {
  id: string;
  status: string;
  ai_handling: boolean;
  channel: string;
  channel_id: string | null;
  last_message: string | null;
  last_message_direction?: string | null;
  unread_count?: number | null;
  handoff_reason?: string | null;
  last_message_at: string | null;
  contacts?: { id: string; name: string; phone: string | null; wa_id?: string | null; funnel_stage?: string | null; notes?: string | null } | null;
};

type Message = {
  id: string;
  direction: "inbound" | "outbound" | null;
  sender_type: string | null;
  content: string;
  status: string | null;
  message_type: string | null;
  ai_generated?: boolean | null;
  created_at: string;
};

function InboxPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("abertas");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<"list" | "chat">("list");
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  const { data: conversations = [], isLoading: loadingConversations } = useQuery({
    queryKey: ["conversations", filter, search],
    refetchInterval: 8000,
    queryFn: async () => {
      let q = supabase
        .from("conversations")
        .select("id, status, ai_handling, channel, channel_id, last_message, last_message_direction, unread_count, handoff_reason, last_message_at, contacts(id, name, phone, wa_id, funnel_stage, notes)")
        .order("last_message_at", { ascending: false })
        .limit(80);
      if (filter === "abertas") q = q.eq("status", "aberta");
      else if (filter === "pendentes") q = q.eq("status", "pendente");
      else if (filter === "resolvidas") q = q.eq("status", "resolvida");
      else if (filter === "ia") q = q.eq("ai_handling", true).neq("status", "resolvida");
      else if (filter === "humano") q = q.eq("ai_handling", false).neq("status", "resolvida");
      const { data, error } = await q;
      if (error) throw error;
      const list = ((data ?? []) as any[]).map((c) => ({ ...c, contacts: Array.isArray(c.contacts) ? c.contacts[0] : c.contacts })) as Conversation[];
      const term = search.trim().toLowerCase();
      return term ? list.filter((c) => `${c.contacts?.name ?? ""} ${c.contacts?.phone ?? ""}`.toLowerCase().includes(term)) : list;
    },
  });

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  const { data: quickReplies = [] } = useQuery({
    queryKey: ["quick_replies"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quick_replies")
        .select("id, title, message, category")
        .order("category");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: messages = [], isLoading: loadingMessages } = useQuery({
    queryKey: ["messages", selectedId],
    enabled: Boolean(selectedId),
    refetchInterval: selectedId ? 5000 : false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id, direction, sender_type, content, status, message_type, ai_generated, created_at")
        .eq("conversation_id", selectedId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Message[];
    },
  });

  useEffect(() => {
    if (!selectedId && conversations[0]) setSelectedId(conversations[0].id);
  }, [conversations, selectedId]);

  const filters: { key: Filter; label: string }[] = [
    { key: "abertas", label: "Abertas" },
    { key: "pendentes", label: "Pendentes" },
    { key: "resolvidas", label: "Resolvidas" },
    { key: "ia", label: "IA" },
    { key: "humano", label: "Humano" },
  ];

  async function markAsHuman() {
    if (!selected) return;
    const { error } = await supabase.from("conversations").update({ ai_handling: false, status: "pendente", unread_count: 0, handoff_reason: "Atendimento assumido manualmente" }).eq("id", selected.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Atendimento assumido.");
      qc.invalidateQueries({ queryKey: ["conversations"] });
    }
  }

  async function closeConversation() {
    if (!selected) return;
    const { error } = await supabase.from("conversations").update({ status: "resolvida", ai_handling: false, unread_count: 0 }).eq("id", selected.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Conversa encerrada.");
      qc.invalidateQueries({ queryKey: ["conversations"] });
    }
  }

  async function sendReply() {
    if (!selected?.channel_id) { toast.error("Conversa sem canal conectado."); return; }
    if (!reply.trim()) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("whatsapp-send-message", {
        body: { channel_id: selected.channel_id, conversation_id: selected.id, message: reply.trim() },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error ?? "Falha ao enviar mensagem.");
      setReply("");
      toast.success("Resposta enviada pelo WhatsApp.");
      qc.invalidateQueries({ queryKey: ["messages", selected.id] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    } catch (e: any) {
      toast.error(e.message ?? "Erro inesperado.");
    } finally {
      setSending(false);
    }
  }

  const selectedPhone = selected?.contacts?.wa_id || selected?.contacts?.phone || "—";

  async function saveNotes(notes: string) {
    const contactId = selected?.contacts?.id;
    if (!contactId || notes === (selected?.contacts?.notes ?? "")) return;
    const { error } = await supabase.from("contacts").update({ notes }).eq("id", contactId);
    if (error) toast.error(error.message);
    else {
      toast.success("Observações salvas.");
      qc.invalidateQueries({ queryKey: ["conversations"] });
    }
  }

  return (
    <div className="grid h-[calc(100vh-3.25rem)] grid-cols-1 md:h-screen md:grid-cols-[320px_1fr_300px]">
      <div className={cn("flex min-h-0 flex-col border-r border-border bg-card", mobileView === "chat" && "hidden md:flex")}>
        <div className="border-b border-border p-4">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-lg font-bold">Inbox</h1>
            <Button variant="ghost" size="icon" onClick={() => qc.invalidateQueries({ queryKey: ["conversations"] })}><RefreshCw className="h-4 w-4" /></Button>
          </div>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar contato…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="mt-3 flex flex-wrap gap-1">
            {filters.map((f) => (
              <button key={f.key} onClick={() => setFilter(f.key)} className={cn("rounded-full px-2.5 py-1 text-xs font-medium", filter === f.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70")}>
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loadingConversations && <div className="p-6 text-center text-sm text-muted-foreground">Carregando conversas…</div>}
          {!loadingConversations && conversations.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Nenhuma conversa real ainda.</div>}
          {conversations.map((c) => (
            <button
              key={c.id}
              onClick={() => { setSelectedId(c.id); setMobileView("chat"); }}
              className={cn("flex w-full items-start gap-3 border-b border-border/60 px-4 py-3 text-left hover:bg-muted/50", selectedId === c.id && "bg-muted/60")}
            >
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">{(c.contacts?.name ?? "?").slice(0, 2).toUpperCase()}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{c.contacts?.name ?? "Sem nome"}</span>
                  <span className="text-[10px] text-muted-foreground">{c.channel}</span>
                </div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">{c.last_message ?? "Sem mensagem"}</div>
                <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                  <span className={cn("rounded-full px-1.5 py-0.5", c.status === "aberta" ? "bg-success/10 text-success" : c.status === "pendente" ? "bg-amber-100 text-amber-800" : "bg-muted")}>{c.status}</span>
                  {c.ai_handling && <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-primary">IA</span>}
                  {Number(c.unread_count ?? 0) > 0 && <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-red-700">{c.unread_count}</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className={cn("flex min-h-0 flex-col bg-background", mobileView === "list" && "hidden md:flex")}>
        {!selected ? (
          <div className="grid flex-1 place-items-center p-8 text-center text-sm text-muted-foreground">Selecione uma conversa para começar.</div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 border-b border-border bg-card px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <button className="md:hidden" onClick={() => setMobileView("list")}><ArrowLeft className="h-5 w-5" /></button>
                <div className="grid h-10 w-10 place-items-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">{(selected.contacts?.name ?? "?").slice(0, 2).toUpperCase()}</div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{selected.contacts?.name}</div>
                  <div className="text-[11px] text-muted-foreground">{selectedPhone}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={markAsHuman}><UserCheck className="mr-1 h-3.5 w-3.5" /> Assumir</Button>
                <Button size="sm" variant="outline" onClick={closeConversation}><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Encerrar</Button>
              </div>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto bg-surface p-4">
              {loadingMessages && <div className="grid place-items-center py-10 text-xs text-muted-foreground">Carregando histórico…</div>}
              {!loadingMessages && messages.length === 0 && <div className="grid place-items-center py-10 text-xs text-muted-foreground">Histórico de mensagens aparecerá aqui.</div>}
              {messages.map((m) => {
                const outbound = m.direction === "outbound";
                return (
                  <div key={m.id} className={cn("flex", outbound ? "justify-end" : "justify-start")}>
                    <div className={cn("max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm", outbound ? "bg-primary text-primary-foreground" : "bg-card border border-border")}>
                      <div className="whitespace-pre-wrap break-words">{m.content}</div>
                      <div className={cn("mt-1 flex items-center gap-1 text-[10px]", outbound ? "text-primary-foreground/70" : "text-muted-foreground")}>
                        {m.ai_generated && <Bot className="h-3 w-3" />}
                        <span>{fmtTime(m.created_at)}</span>
                        {m.status && <span>· {m.status}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-border bg-card p-3">
              <div className="flex items-end gap-2">
                <Textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Escreva sua resposta…" rows={2} className="resize-none" onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) sendReply(); }} />
                <div className="flex flex-col gap-2">
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button size="icon" variant="outline" title="Resposta rápida"><Zap className="h-4 w-4" /></Button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="max-h-72 w-80 overflow-y-auto p-2">
                      {quickReplies.length === 0 ? (
                        <div className="p-3 text-center text-xs text-muted-foreground">
                          Nenhuma resposta rápida cadastrada. Crie em “Respostas rápidas”.
                        </div>
                      ) : (
                        quickReplies.map((r: any) => (
                          <button
                            key={r.id}
                            onClick={() => setReply((prev) => (prev ? `${prev} ${r.message}` : r.message))}
                            className="block w-full rounded-md px-2 py-1.5 text-left hover:bg-muted"
                          >
                            <div className="text-xs font-medium">{r.title}</div>
                            <div className="line-clamp-2 text-[11px] text-muted-foreground">{r.message}</div>
                          </button>
                        ))
                      )}
                    </PopoverContent>
                  </Popover>
                  <Button size="icon" title="Enviar" onClick={sendReply} disabled={sending || !reply.trim()}>{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
                </div>
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">Ctrl + Enter envia. A mensagem sai pela WhatsApp Cloud API real.</div>
            </div>
          </>
        )}
      </div>

      <aside className="hidden min-h-0 flex-col border-l border-border bg-card md:flex">
        {selected ? (
          <div className="space-y-4 p-5">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contato</div>
              <div className="mt-1 font-display text-lg font-bold">{selected.contacts?.name}</div>
              <div className="text-xs text-muted-foreground">{selectedPhone}</div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Badge variant={selected.ai_handling ? "default" : "outline"}>{selected.ai_handling ? "IA atendendo" : "Humano/pendente"}</Badge>
              <Badge variant="outline">{selected.status}</Badge>
            </div>
            {selected.handoff_reason && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                <div className="font-medium">Motivo do handoff</div>
                <div>{selected.handoff_reason}</div>
              </div>
            )}
            <InfoBlock label="Etapa do funil" value={selected.contacts?.funnel_stage ?? "Novo"} />
            <InfoBlock label="Origem" value={selected.channel} />
            <InfoBlock label="Última mensagem" value={selected.last_message ?? "—"} />
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Observações</div>
              <Textarea
                key={selected.contacts?.id ?? selected.id}
                placeholder="Anotações internas…"
                rows={4}
                className="mt-2"
                defaultValue={selected.contacts?.notes ?? ""}
                onBlur={(e) => saveNotes(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className="grid flex-1 place-items-center p-6 text-center text-xs text-muted-foreground">Detalhes do contato aparecerão aqui.</div>
        )}
      </aside>
    </div>
  );
}

function fmtTime(value: string) {
  try { return new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }); } catch { return value; }
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return <div><div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div><div className="mt-1 text-sm">{value}</div></div>;
}
