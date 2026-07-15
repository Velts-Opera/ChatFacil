import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Trash2, Bot, BookOpen } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/agente-ia")({
  head: () => ({ meta: [{ title: "Agente IA — Comunica AI" }] }),
  component: AiAgentPage,
});

async function getCompanyId() {
  const { data: profile } = await supabase.from("profiles").select("company_id").maybeSingle();
  if (!profile?.company_id) throw new Error("Empresa não encontrada");
  return profile.company_id;
}

function AiAgentPage() {
  const qc = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ["ai-agent-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("ai_agent_settings").select("*").maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState({
    agent_name: "Assistente",
    is_enabled: true,
    system_prompt: "",
    handoff_keywords: "humano, atendente, pessoa",
  });

  useEffect(() => {
    if (settings) {
      setForm({
        agent_name: settings.agent_name ?? "Assistente",
        is_enabled: settings.is_enabled ?? true,
        system_prompt: settings.system_prompt ?? "",
        handoff_keywords: (settings.handoff_keywords ?? []).join(", "),
      });
    }
  }, [settings]);

  const saveSettings = useMutation({
    mutationFn: async () => {
      const company_id = await getCompanyId();
      const payload = {
        company_id,
        agent_name: form.agent_name || "Assistente",
        is_enabled: form.is_enabled,
        system_prompt: form.system_prompt,
        handoff_keywords: form.handoff_keywords
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean),
      };
      const { error } = await supabase
        .from("ai_agent_settings")
        .upsert(payload, { onConflict: "company_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Agente IA atualizado");
      qc.invalidateQueries({ queryKey: ["ai-agent-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Base de conhecimento
  const { data: knowledge = [] } = useQuery({
    queryKey: ["ai-knowledge"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_knowledge_items")
        .select("id, title, content, is_active")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [kbOpen, setKbOpen] = useState(false);
  const [kbForm, setKbForm] = useState({ title: "", content: "" });

  const createItem = useMutation({
    mutationFn: async () => {
      const company_id = await getCompanyId();
      const { error } = await supabase.from("ai_knowledge_items").insert({
        company_id,
        title: kbForm.title,
        content: kbForm.content,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Conhecimento adicionado");
      setKbForm({ title: "", content: "" });
      setKbOpen(false);
      qc.invalidateQueries({ queryKey: ["ai-knowledge"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleItem = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from("ai_knowledge_items")
        .update({ is_active: active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-knowledge"] }),
  });

  const deleteItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ai_knowledge_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-knowledge"] }),
  });

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold">Agente de IA</h1>
        <p className="text-sm text-muted-foreground">
          Prompt e base de conhecimento exclusivos desta empresa. O agente responde no WhatsApp
          usando apenas o que estiver aqui.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        {/* Configurações do agente */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveSettings.mutate();
          }}
          className="space-y-4 rounded-2xl border border-border bg-card p-6"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-success" />
              <h2 className="font-display text-lg font-bold">Configuração do agente</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {form.is_enabled ? "Ativo" : "Desligado"}
              </span>
              <Switch
                checked={form.is_enabled}
                onCheckedChange={(v) => setForm({ ...form, is_enabled: v })}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="an">Nome do agente</Label>
            <Input
              id="an"
              value={form.agent_name}
              onChange={(e) => setForm({ ...form, agent_name: e.target.value })}
            />
          </div>

          <div>
            <Label htmlFor="sp">Prompt exclusivo (personalidade e regras)</Label>
            <Textarea
              id="sp"
              rows={10}
              value={form.system_prompt}
              onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
              placeholder={
                "Você é o assistente virtual da Clínica A. Atenda com simpatia, agende consultas e tire dúvidas sobre os serviços. Nunca invente preços..."
              }
            />
          </div>

          <div>
            <Label htmlFor="hk">Palavras que transferem para humano (separadas por vírgula)</Label>
            <Input
              id="hk"
              value={form.handoff_keywords}
              onChange={(e) => setForm({ ...form, handoff_keywords: e.target.value })}
            />
          </div>

          <Button type="submit" disabled={saveSettings.isPending}>
            Salvar agente
          </Button>
        </form>

        {/* Base de conhecimento */}
        <div className="rounded-2xl border border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-success" />
              <h2 className="font-display text-lg font-bold">Base de conhecimento</h2>
            </div>
            <Dialog open={kbOpen} onOpenChange={setKbOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <Plus className="mr-1 h-4 w-4" /> Adicionar
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Novo conhecimento</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="kt">Título</Label>
                    <Input
                      id="kt"
                      value={kbForm.title}
                      onChange={(e) => setKbForm({ ...kbForm, title: e.target.value })}
                      placeholder="Horários de atendimento"
                    />
                  </div>
                  <div>
                    <Label htmlFor="kc">Conteúdo</Label>
                    <Textarea
                      id="kc"
                      rows={6}
                      value={kbForm.content}
                      onChange={(e) => setKbForm({ ...kbForm, content: e.target.value })}
                      placeholder="Atendemos de segunda a sexta, das 8h às 18h..."
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={() => createItem.mutate()}
                    disabled={!kbForm.title || !kbForm.content || createItem.isPending}
                  >
                    Salvar
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="space-y-3">
            {knowledge.length === 0 && (
              <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Nenhum conhecimento cadastrado. Adicione serviços, preços, horários e políticas.
              </div>
            )}
            {knowledge.map((k) => (
              <div
                key={k.id}
                className={`rounded-xl border border-border p-4 ${k.is_active ? "" : "opacity-60"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium">{k.title}</div>
                  <div className="flex items-center gap-1">
                    <Switch
                      checked={k.is_active}
                      onCheckedChange={(v) => toggleItem.mutate({ id: k.id, active: v })}
                    />
                    <Button size="icon" variant="ghost" onClick={() => deleteItem.mutate(k.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground line-clamp-3">
                  {k.content}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
