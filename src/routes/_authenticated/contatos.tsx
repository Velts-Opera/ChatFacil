import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, MessageSquare } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/contatos")({
  head: () => ({ meta: [{ title: "Contatos — Comunica AI" }] }),
  component: ContactsPage,
});

function ContactsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", source: "" });
  const [tagName, setTagName] = useState("");

  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contacts")
        .select("id, name, phone, source, funnel_stage, potential_value, last_interaction_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: tags = [] } = useQuery({
    queryKey: ["tags"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tags").select("id, name, color").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const createContact = useMutation({
    mutationFn: async () => {
      const { data: profile } = await supabase.from("profiles").select("company_id").maybeSingle();
      if (!profile?.company_id) throw new Error("Empresa não encontrada");
      const { error } = await supabase.from("contacts").insert({
        company_id: profile.company_id,
        name: form.name,
        phone: form.phone,
        email: form.email || null,
        source: form.source || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contato criado");
      setForm({ name: "", phone: "", email: "", source: "" });
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createTag = useMutation({
    mutationFn: async () => {
      const { data: profile } = await supabase.from("profiles").select("company_id").maybeSingle();
      if (!profile?.company_id) throw new Error("Empresa não encontrada");
      const { error } = await supabase.from("tags").insert({
        company_id: profile.company_id,
        name: tagName,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tag criada");
      setTagName("");
      setTagOpen(false);
      qc.invalidateQueries({ queryKey: ["tags"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Contatos</h1>
          <p className="text-sm text-muted-foreground">CRM da sua base.</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={tagOpen} onOpenChange={setTagOpen}>
            <DialogTrigger asChild>
              <Button variant="outline"><Plus className="mr-1 h-4 w-4" /> Nova tag</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Criar tag</DialogTitle></DialogHeader>
              <div>
                <Label htmlFor="tn">Nome</Label>
                <Input id="tn" value={tagName} onChange={(e) => setTagName(e.target.value)} />
              </div>
              <DialogFooter>
                <Button onClick={() => createTag.mutate()} disabled={!tagName || createTag.isPending}>Criar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-1 h-4 w-4" /> Novo contato</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo contato</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label htmlFor="cn">Nome</Label><Input id="cn" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div><Label htmlFor="cp">Telefone</Label><Input id="cp" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div><Label htmlFor="ce">E-mail</Label><Input id="ce" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div><Label htmlFor="cs">Origem</Label><Input id="cs" placeholder="WhatsApp, Instagram…" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} /></div>
              </div>
              <DialogFooter>
                <Button onClick={() => createContact.mutate()} disabled={!form.name || createContact.isPending}>Criar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {tags.map((t: any) => (
          <span key={t.id} className="rounded-full border border-border bg-card px-2.5 py-1 text-xs" style={{ color: t.color }}>
            {t.name}
          </span>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Telefone</th>
              <th className="px-4 py-3 hidden md:table-cell">Origem</th>
              <th className="px-4 py-3 hidden md:table-cell">Etapa</th>
              <th className="px-4 py-3 hidden lg:table-cell">Valor potencial</th>
              <th className="px-4 py-3 hidden lg:table-cell">Última interação</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {contacts.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">Nenhum contato ainda.</td></tr>
            )}
            {contacts.map((c: any) => (
              <tr key={c.id} className="border-t border-border hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.phone}</td>
                <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{c.source ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{c.funnel_stage ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">R$ {Number(c.potential_value ?? 0).toFixed(2)}</td>
                <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                  {c.last_interaction_at ? new Date(c.last_interaction_at).toLocaleDateString("pt-BR") : "—"}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button size="sm" variant="ghost"><MessageSquare className="h-4 w-4" /></Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}