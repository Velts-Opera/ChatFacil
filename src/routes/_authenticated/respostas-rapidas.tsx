import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/respostas-rapidas")({
  head: () => ({ meta: [{ title: "Respostas rápidas — Comunica AI" }] }),
  component: QuickRepliesPage,
});

const CATEGORIES = ["saudação", "preço", "horário", "endereço", "pagamento", "prazo", "agradecimento", "pós-venda", "geral"] as const;

function QuickRepliesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", message: "", category: "geral" });

  const { data: replies = [] } = useQuery({
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

  const create = useMutation({
    mutationFn: async () => {
      const { data: profile } = await supabase.from("profiles").select("company_id").maybeSingle();
      if (!profile?.company_id) throw new Error("Empresa não encontrada");
      const { error } = await supabase.from("quick_replies").insert({
        company_id: profile.company_id,
        title: form.title,
        message: form.message,
        category: form.category,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Resposta criada");
      setForm({ title: "", message: "", category: "geral" });
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["quick_replies"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quick_replies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["quick_replies"] }),
  });

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Respostas rápidas</h1>
          <p className="text-sm text-muted-foreground">Mensagens prontas para agilizar o atendimento.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-1 h-4 w-4" /> Nova resposta</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova resposta rápida</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div><Label htmlFor="rt">Título</Label><Input id="rt" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
              <div>
                <Label htmlFor="rc">Categoria</Label>
                <select
                  id="rc"
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                >
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div><Label htmlFor="rm">Mensagem</Label><Textarea id="rm" rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></div>
            </div>
            <DialogFooter>
              <Button onClick={() => create.mutate()} disabled={!form.title || !form.message || create.isPending}>Salvar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {replies.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            Nenhuma resposta cadastrada ainda.
          </div>
        )}
        {replies.map((r: any) => (
          <div key={r.id} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-success">{r.category}</div>
                <div className="mt-1 font-display text-base font-bold">{r.title}</div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => del.mutate(r.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <p className="mt-3 text-sm text-muted-foreground line-clamp-4 whitespace-pre-wrap">{r.message}</p>
          </div>
        ))}
      </div>
    </div>
  );
}