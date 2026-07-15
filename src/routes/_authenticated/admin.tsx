import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Plus,
  Pencil,
  LogIn,
  Smartphone,
  Bot,
  BookOpen,
  CalendarDays,
  Users,
  MessagesSquare,
  Building2,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Painel do Administrador — Comunica AI" }] }),
  beforeLoad: async () => {
    const { data, error } = await supabase.rpc("is_super_admin");
    if (error || !data) throw redirect({ to: "/dashboard" });
  },
  component: AdminPage,
});

type CompanyOverview = {
  id: string;
  name: string;
  segment: string | null;
  plan: string;
  is_active: boolean;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  created_at: string;
  whatsapp_status: string | null;
  whatsapp_phone: string | null;
  ai_enabled: boolean;
  has_prompt: boolean;
  knowledge_count: number;
  appointments_count: number;
  contacts_count: number;
  conversations_count: number;
};

const EMPTY_FORM = { name: "", segment: "", phone: "", email: "", contact_name: "", plan: "start" };

const WHATSAPP_LABEL: Record<string, { label: string; className: string }> = {
  connected: { label: "Conectado", className: "bg-success/15 text-success" },
  connecting: { label: "Conectando", className: "bg-amber-500/15 text-amber-600" },
  error: { label: "Erro", className: "bg-destructive/15 text-destructive" },
  disconnected: { label: "Desconectado", className: "bg-muted text-muted-foreground" },
};

function AdminPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["admin-companies"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_company_overview");
      if (error) throw error;
      return (data ?? []) as CompanyOverview[];
    },
  });

  function openCreate() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(c: CompanyOverview) {
    setEditingId(c.id);
    setForm({
      name: c.name ?? "",
      segment: c.segment ?? "",
      phone: c.phone ?? "",
      email: c.email ?? "",
      contact_name: c.contact_name ?? "",
      plan: c.plan ?? "start",
    });
    setDialogOpen(true);
  }

  const save = useMutation({
    mutationFn: async () => {
      if (editingId) {
        const { error } = await supabase
          .from("companies")
          .update({
            name: form.name,
            segment: form.segment || null,
            phone: form.phone || null,
            email: form.email || null,
            contact_name: form.contact_name || null,
            plan: form.plan,
          })
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc("admin_create_company", {
          _name: form.name,
          _segment: form.segment || null,
          _phone: form.phone || null,
          _email: form.email || null,
          _contact_name: form.contact_name || null,
          _plan: form.plan,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Empresa atualizada" : "Empresa cadastrada com ambiente completo");
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-companies"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("companies").update({ is_active: active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(
        v.active ? "Empresa ativada" : "Empresa desativada — o acesso dela foi suspenso",
      );
      qc.invalidateQueries({ queryKey: ["admin-companies"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const enterCompany = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("admin_enter_company", { _company_id: id });
      if (error) throw error;
    },
    onSuccess: (_d, id) => {
      const company = companies.find((c) => c.id === id);
      toast.success(`Você entrou no ambiente de ${company?.name ?? "empresa"}`);
      qc.clear();
      navigate({ to: "/dashboard" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Painel do Administrador</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie todas as empresas da plataforma. Cada uma tem WhatsApp, IA, prompt, base de
            conhecimento e agenda exclusivos.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="mr-1 h-4 w-4" /> Nova empresa
        </Button>
      </div>

      {isLoading && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Carregando empresas...
        </div>
      )}

      {!isLoading && companies.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Nenhuma empresa cadastrada ainda. Clique em "Nova empresa" para criar a primeira.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {companies.map((c) => {
          const wa =
            WHATSAPP_LABEL[c.whatsapp_status ?? "disconnected"] ?? WHATSAPP_LABEL.disconnected;
          return (
            <div
              key={c.id}
              className={`rounded-2xl border border-border bg-card p-5 transition ${c.is_active ? "" : "opacity-60"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-display text-base font-bold">{c.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.segment || "Sem segmento"} · plano {c.plan}
                    </div>
                  </div>
                </div>
                <div
                  className="flex items-center gap-2"
                  title={c.is_active ? "Desativar empresa" : "Ativar empresa"}
                >
                  <Switch
                    checked={c.is_active}
                    onCheckedChange={(active) => toggleActive.mutate({ id: c.id, active })}
                  />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-2">
                  <Smartphone className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${wa.className}`}
                  >
                    {wa.label}
                  </span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-2">
                  <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="text-xs">
                    IA {c.ai_enabled ? "ativa" : "desligada"}
                    {c.has_prompt ? " · prompt ok" : " · sem prompt"}
                  </span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-2">
                  <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="text-xs">{c.knowledge_count} na base</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-2">
                  <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="text-xs">{c.appointments_count} agendamentos</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-2">
                  <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="text-xs">{c.contacts_count} contatos</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-2">
                  <MessagesSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="text-xs">{c.conversations_count} conversas</span>
                </div>
              </div>

              {c.whatsapp_phone && (
                <div className="mt-2 text-xs text-muted-foreground">
                  WhatsApp: {c.whatsapp_phone}
                </div>
              )}
              {!c.is_active && (
                <Badge variant="outline" className="mt-2 text-destructive border-destructive/40">
                  Desativada
                </Badge>
              )}

              <div className="mt-4 flex gap-2">
                <Button
                  size="sm"
                  onClick={() => enterCompany.mutate(c.id)}
                  disabled={enterCompany.isPending}
                >
                  <LogIn className="mr-1 h-4 w-4" /> Entrar no ambiente
                </Button>
                <Button size="sm" variant="outline" onClick={() => openEdit(c)}>
                  <Pencil className="mr-1 h-4 w-4" /> Editar
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar empresa" : "Nova empresa"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="cn">Nome da empresa</Label>
              <Input
                id="cn"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Clínica A"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="cs">Segmento</Label>
                <Input
                  id="cs"
                  value={form.segment}
                  onChange={(e) => setForm({ ...form, segment: e.target.value })}
                  placeholder="Saúde, beleza, imóveis..."
                />
              </div>
              <div>
                <Label htmlFor="cp">Plano</Label>
                <select
                  id="cp"
                  className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={form.plan}
                  onChange={(e) => setForm({ ...form, plan: e.target.value })}
                >
                  <option value="start">start</option>
                  <option value="pro">pro</option>
                  <option value="business">business</option>
                </select>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="cr">Responsável</Label>
                <Input
                  id="cr"
                  value={form.contact_name}
                  onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="ct">Telefone</Label>
                <Input
                  id="ct"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="ce">E-mail</Label>
              <Input
                id="ce"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            {!editingId && (
              <p className="text-xs text-muted-foreground">
                A empresa nasce com ambiente completo: tags, respostas rápidas, base de conhecimento
                inicial e agente de IA prontos para configurar.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => save.mutate()} disabled={!form.name || save.isPending}>
              {editingId ? "Salvar alterações" : "Cadastrar empresa"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
