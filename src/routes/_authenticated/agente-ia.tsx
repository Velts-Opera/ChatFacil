import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useMemo, useState } from "react";
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
import { Plus, Trash2, Bot, BookOpen, Sparkles, LockKeyhole } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/agente-ia")({
  head: () => ({ meta: [{ title: "Agente IA — ChatFacil" }] }),
  component: AiAgentPage,
});

type ProfessionTemplate = {
  slug: string;
  name: string;
  description: string;
  base_instructions: string;
  discovery_questions: string[];
};

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
      return data as any;
    },
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["agent-profession-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("agent_profession_templates" as any)
        .select("slug, name, description, base_instructions, discovery_questions")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ProfessionTemplate[];
    },
  });

  const [form, setForm] = useState({
    agent_name: "Assistente",
    is_enabled: true,
    system_prompt: "",
    handoff_keywords: "humano, atendente, pessoa",
    profession: "geral",
    business_context: "",
    human_takeover_minutes: 480,
  });

  useEffect(() => {
    if (!settings) return;
    setForm({
      agent_name: settings.agent_name ?? "Assistente",
      is_enabled: settings.is_enabled ?? true,
      system_prompt: settings.system_prompt ?? "",
      handoff_keywords: (settings.handoff_keywords ?? []).join(", "),
      profession: settings.profession ?? "geral",
      business_context: settings.business_context ?? "",
      human_takeover_minutes: settings.human_takeover_minutes ?? 480,
    });
  }, [settings]);

  const isLocked = Boolean(settings?.is_system_locked);
  const selectedTemplate = useMemo(
    () => templates.find((item) => item.slug === form.profession) ?? null,
    [form.profession, templates],
  );

  const saveSettings = useMutation({
    mutationFn: async () => {
      const company_id = await getCompanyId();
      const payload: Record<string, unknown> = {
        company_id,
        agent_name: form.agent_name || "Assistente",
        is_enabled: form.is_enabled,
        handoff_keywords: form.handoff_keywords.split(",").map((k) => k.trim()).filter(Boolean),
        human_takeover_minutes: Math.max(5, Math.min(10080, Number(form.human_takeover_minutes) || 480)),
      };
      if (!isLocked) {
        payload.system_prompt = form.system_prompt;
        payload.profession = form.profession;
        payload.business_context = form.business_context;
        payload.prompt_source = settings?.prompt_source === "ai_generated" ? "ai_generated" : "manual";
      }
      const { error } = await supabase.from("ai_agent_settings").upsert(payload as any, { onConflict: "company_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Agente atualizado");
      qc.invalidateQueries({ queryKey: ["ai-agent-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const generatePrompt = useMutation({
    mutationFn: async () => {
      if (isLocked) throw new Error("Este agente usa instruções fixas e não pode ser sobrescrito pelo gerador.");
      const { data, error } = await supabase.functions.invoke("generate-agent-prompt", {
        body: {
          profession: form.profession,
          business_context: form.business_context,
          agent_name: form.agent_name,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.prompt) throw new Error("A IA não retornou as instruções do agente.");
      return data as { prompt: string };
    },
    onSuccess: (data) => {
      setForm((old) => ({ ...old, system_prompt: data.prompt }));
      toast.success("Agente criado com base no seu negócio.");
      qc.invalidateQueries({ queryKey: ["ai-agent-settings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

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
      const { error } = await supabase.from("ai_knowledge_items").insert({ company_id, title: kbForm.title, content: kbForm.content });
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
      const { error } = await supabase.from("ai_knowledge_items").update({ is_active: active }).eq("id", id);
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
    <div className="p-4 sm:p-6">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold">Seu Agente</h1>
        <p className="text-sm text-muted-foreground">
          Conte o que sua empresa faz. O ChatFacil monta as instruções e você ajusta até ficar do seu jeito.
        </p>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <form
          onSubmit={(e) => { e.preventDefault(); saveSettings.mutate(); }}
          className="space-y-5 rounded-2xl border border-border bg-card p-5 sm:p-6"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-success" />
              <h2 className="font-display text-lg font-bold">Configuração do agente</h2>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{form.is_enabled ? "Ativo" : "Desligado"}</span>
              <Switch checked={form.is_enabled} onCheckedChange={(v) => setForm({ ...form, is_enabled: v })} />
            </div>
          </div>

          {isLocked && (
            <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
              <div><strong>Instruções operacionais fixas.</strong> Este agente pertence à operação principal e o gerador não sobrescreve suas regras.</div>
            </div>
          )}

          <div>
            <Label htmlFor="an">Nome do agente</Label>
            <Input id="an" value={form.agent_name} onChange={(e) => setForm({ ...form, agent_name: e.target.value })} />
          </div>

          {!isLocked && (
            <>
              <div>
                <Label htmlFor="profession">Qual é o tipo do seu negócio?</Label>
                <select
                  id="profession"
                  value={form.profession}
                  onChange={(e) => setForm({ ...form, profession: e.target.value })}
                  className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {templates.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
                </select>
                {selectedTemplate?.description && <p className="mt-1 text-xs text-muted-foreground">{selectedTemplate.description}</p>}
              </div>

              <div>
                <Label htmlFor="context">Explique como seu atendente deve trabalhar</Label>
                <Textarea
                  id="context"
                  rows={7}
                  value={form.business_context}
                  onChange={(e) => setForm({ ...form, business_context: e.target.value })}
                  placeholder="Ex.: Somos uma imobiliária de Niterói. Atendemos compra e aluguel. Pergunte região, faixa de valor e quantidade de quartos. Quando o cliente escolher um imóvel, marque uma visita e chame um corretor."
                />
                {selectedTemplate && Array.isArray(selectedTemplate.discovery_questions) && selectedTemplate.discovery_questions.length > 0 && (
                  <div className="mt-3 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                    <div className="mb-1 font-medium text-foreground">Para deixar melhor, responda no texto acima:</div>
                    {selectedTemplate.discovery_questions.map((question) => <div key={question}>• {question}</div>)}
                  </div>
                )}
              </div>

              <Button type="button" variant="default" onClick={() => generatePrompt.mutate()} disabled={generatePrompt.isPending || !form.agent_name.trim()}>
                <Sparkles className="mr-2 h-4 w-4" />
                {generatePrompt.isPending ? "Criando seu agente..." : form.system_prompt ? "Recriar instruções com IA" : "Criar meu agente com IA"}
              </Button>
            </>
          )}

          <details open={isLocked || Boolean(form.system_prompt)} className="rounded-xl border border-border p-4">
            <summary className="cursor-pointer text-sm font-medium">Instruções completas do agente</summary>
            <div className="mt-3">
              <Label htmlFor="sp">Regras e personalidade</Label>
              <Textarea
                id="sp"
                rows={12}
                readOnly={isLocked}
                value={form.system_prompt}
                onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
                placeholder="As instruções serão criadas automaticamente a partir do seu negócio."
              />
            </div>
          </details>

          <div>
            <Label htmlFor="hk">Palavras que chamam uma pessoa (separadas por vírgula)</Label>
            <Input id="hk" value={form.handoff_keywords} onChange={(e) => setForm({ ...form, handoff_keywords: e.target.value })} />
          </div>

          <div>
            <Label htmlFor="takeover">Quando uma pessoa assumir, manter a IA pausada por quantos minutos?</Label>
            <Input id="takeover" type="number" min={5} max={10080} value={form.human_takeover_minutes} onChange={(e) => setForm({ ...form, human_takeover_minutes: Number(e.target.value) })} />
          </div>

          <Button type="submit" disabled={saveSettings.isPending}>Salvar agente</Button>
        </form>

        <div className="rounded-2xl border border-border bg-card p-5 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-success" />
              <h2 className="font-display text-lg font-bold">Base de conhecimento</h2>
            </div>
            <Dialog open={kbOpen} onOpenChange={setKbOpen}>
              <DialogTrigger asChild><Button size="sm"><Plus className="mr-1 h-4 w-4" /> Adicionar</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Novo conhecimento</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label htmlFor="kt">Título</Label><Input id="kt" value={kbForm.title} onChange={(e) => setKbForm({ ...kbForm, title: e.target.value })} placeholder="Horários de atendimento" /></div>
                  <div><Label htmlFor="kc">Conteúdo</Label><Textarea id="kc" rows={6} value={kbForm.content} onChange={(e) => setKbForm({ ...kbForm, content: e.target.value })} placeholder="Atendemos de segunda a sexta, das 8h às 18h..." /></div>
                </div>
                <DialogFooter><Button onClick={() => createItem.mutate()} disabled={!kbForm.title || !kbForm.content || createItem.isPending}>Salvar</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <p className="mb-4 text-sm text-muted-foreground">Cadastre serviços, produtos, horários, políticas, objeções e informações que o agente pode usar nas respostas.</p>
          <div className="space-y-3">
            {knowledge.length === 0 && <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Nenhum conhecimento cadastrado.</div>}
            {knowledge.map((k) => (
              <div key={k.id} className={`rounded-xl border border-border p-4 ${k.is_active ? "" : "opacity-60"}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="font-medium">{k.title}</div>
                  <div className="flex items-center gap-1">
                    <Switch checked={k.is_active} onCheckedChange={(v) => toggleItem.mutate({ id: k.id, active: v })} />
                    <Button size="icon" variant="ghost" onClick={() => deleteItem.mutate(k.id)}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground line-clamp-3">{k.content}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
