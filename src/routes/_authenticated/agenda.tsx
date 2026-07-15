import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Trash2, CalendarDays, Clock } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/agenda")({
  head: () => ({ meta: [{ title: "Agenda — Comunica AI" }] }),
  component: AgendaPage,
});

const STATUS = [
  { value: "agendado", label: "Agendado", className: "bg-sky-500/15 text-sky-600" },
  { value: "confirmado", label: "Confirmado", className: "bg-success/15 text-success" },
  { value: "concluido", label: "Concluído", className: "bg-muted text-muted-foreground" },
  { value: "cancelado", label: "Cancelado", className: "bg-destructive/15 text-destructive" },
] as const;

const EMPTY_FORM = { title: "", description: "", contact_id: "", starts_at: "", ends_at: "" };

function AgendaPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: appointments = [] } = useQuery({
    queryKey: ["appointments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, title, description, starts_at, ends_at, status, contact_id, contacts(name)")
        .order("starts_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts-for-agenda"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contacts").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: profile } = await supabase.from("profiles").select("company_id").maybeSingle();
      if (!profile?.company_id) throw new Error("Empresa não encontrada");
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from("appointments").insert({
        company_id: profile.company_id,
        title: form.title,
        description: form.description || null,
        contact_id: form.contact_id || null,
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
        created_by: auth.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Agendamento criado");
      setForm(EMPTY_FORM);
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("appointments").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointments"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("appointments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["appointments"] }),
  });

  const fmt = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Agenda</h1>
          <p className="text-sm text-muted-foreground">Agendamentos exclusivos desta empresa.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-1 h-4 w-4" /> Novo agendamento
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Novo agendamento</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label htmlFor="at">Título</Label>
                <Input
                  id="at"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="Consulta, visita, corte..."
                />
              </div>
              <div>
                <Label htmlFor="ac">Contato (opcional)</Label>
                <select
                  id="ac"
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.contact_id}
                  onChange={(e) => setForm({ ...form, contact_id: e.target.value })}
                >
                  <option value="">Sem contato vinculado</option>
                  {contacts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="as">Início</Label>
                  <Input
                    id="as"
                    type="datetime-local"
                    value={form.starts_at}
                    onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="ae">Fim (opcional)</Label>
                  <Input
                    id="ae"
                    type="datetime-local"
                    value={form.ends_at}
                    onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="ad">Observações</Label>
                <Textarea
                  id="ad"
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => create.mutate()}
                disabled={!form.title || !form.starts_at || create.isPending}
              >
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-3">
        {appointments.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            Nenhum agendamento ainda.
          </div>
        )}
        {appointments.map((a) => {
          const st = STATUS.find((s) => s.value === a.status) ?? STATUS[0];
          return (
            <div key={a.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                    <CalendarDays className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-display text-base font-bold">{a.title}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" />
                      <span>
                        {fmt.format(new Date(a.starts_at))}
                        {a.ends_at ? ` — ${fmt.format(new Date(a.ends_at))}` : ""}
                      </span>
                      {(a as { contacts?: { name: string } | null }).contacts?.name && (
                        <span>
                          · {(a as { contacts?: { name: string } | null }).contacts!.name}
                        </span>
                      )}
                    </div>
                    {a.description && (
                      <p className="mt-1 text-sm text-muted-foreground">{a.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${st.className}`}
                  >
                    {st.label}
                  </span>
                  <select
                    className="rounded-md border border-input bg-background px-2 py-1 text-xs"
                    value={a.status}
                    onChange={(e) => setStatus.mutate({ id: a.id, status: e.target.value })}
                  >
                    {STATUS.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <Button size="icon" variant="ghost" onClick={() => del.mutate(a.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
