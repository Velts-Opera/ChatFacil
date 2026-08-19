import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
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
  Pencil,
  Smartphone,
  Bot,
  BookOpen,
  MessagesSquare,
  Building2,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Painel do Administrador — ChatFacil" }] }),
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
  conversations_count: number;
};

type AccountOverview = {
  user_id: string;
  email: string | null;
  requested_company_name: string | null;
  status: "pending" | "active" | "suspended";
  company_id: string | null;
  company_name: string | null;
  company_is_active: boolean | null;
  account_created_at: string;
  authorized_at: string | null;
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [activationNames, setActivationNames] = useState<Record<string, string>>({});

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["admin-companies"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_company_overview");
      if (error) throw error;
      return (data ?? []) as CompanyOverview[];
    },
  });

  const { data: accounts = [], isLoading: accountsLoading } = useQuery({
    queryKey: ["admin-account-overview"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("admin_account_overview");
      if (error) throw error;
      return (data ?? []) as AccountOverview[];
    },
  });

  const pendingAccounts = accounts.filter((account) => account.status === "pending");

  useEffect(() => {
    if (!pendingAccounts.length) return;
    setActivationNames((current) => {
      const next = { ...current };
      for (const account of pendingAccounts) {
        if (!(account.user_id in next)) {
          next[account.user_id] = account.requested_company_name ?? "";
        }
      }
      return next;
    });
  }, [accounts]);

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
      if (!editingId) throw new Error("Empresa não selecionada");
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
    },
    onSuccess: () => {
      toast.success("Empresa atualizada");
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-companies"] });
      qc.invalidateQueries({ queryKey: ["admin-account-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const activateAccount = useMutation({
    mutationFn: async ({ userId, companyName }: { userId: string; companyName: string }) => {
      if (!companyName.trim()) throw new Error("Informe o nome da empresa");
      const { error } = await (supabase.rpc as any)("admin_activate_account", {
        _user_id: userId,
        _company_name: companyName.trim(),
        _plan: "start",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Conta ativada e empresa provisionada");
      qc.invalidateQueries({ queryKey: ["admin-account-overview"] });
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
      toast.success(v.active ? "Empresa ativada" : "Empresa desativada — acesso suspenso");
      qc.invalidateQueries({ queryKey: ["admin-companies"] });
      qc.invalidateQueries({ queryKey: ["admin-account-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold">Painel do Administrador</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ativação de clientes, status do WhatsApp e saúde do bot. O painel não abre o ambiente nem a Inbox dos clientes.
          </p>
        </div>
        <Badge variant="outline" className="gap-1.5 py-1.5">
          <ShieldCheck className="h-3.5 w-3.5" /> Privacidade por tenant
        </Badge>
      </div>

      <section className="mb-8 rounded-2xl border bg-card p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-bold">Contas aguardando ativação</h2>
            <p className="text-sm text-muted-foreground">
              A empresa só é criada depois da autorização manual abaixo.
            </p>
          </div>
          <Badge variant={pendingAccounts.length ? "default" : "secondary"}>{pendingAccounts.length} pendente(s)</Badge>
        </div>

        {accountsLoading ? (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Carregando contas…</div>
        ) : pendingAccounts.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhuma conta aguardando ativação.</div>
        ) : (
          <div className="space-y-3">
            {pendingAccounts.map((account) => (
              <div key={account.user_id} className="grid gap-3 rounded-xl border p-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
                <div>
                  <div className="text-xs text-muted-foreground">Conta</div>
                  <div className="mt-1 text-sm font-medium">{account.email || "E-mail indisponível"}</div>
                </div>
                <div>
                  <Label htmlFor={`company-${account.user_id}`}>Empresa a provisionar</Label>
                  <Input
                    id={`company-${account.user_id}`}
                    value={activationNames[account.user_id] ?? ""}
                    onChange={(e) => setActivationNames((current) => ({ ...current, [account.user_id]: e.target.value }))}
                    placeholder="Nome da empresa"
                  />
                </div>
                <Button
                  onClick={() => activateAccount.mutate({
                    userId: account.user_id,
                    companyName: activationNames[account.user_id] ?? "",
                  })}
                  disabled={activateAccount.isPending || !(activationNames[account.user_id] ?? "").trim()}
                >
                  <UserCheck className="mr-2 h-4 w-4" /> Ativar conta
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="mb-4">
        <h2 className="font-display text-lg font-bold">Empresas provisionadas</h2>
        <p className="text-sm text-muted-foreground">Visão operacional sem acesso ao conteúdo das conversas.</p>
      </div>

      {isLoading && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Carregando empresas...
        </div>
      )}

      {!isLoading && companies.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Nenhuma empresa provisionada.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {companies.map((c) => {
          const wa = WHATSAPP_LABEL[c.whatsapp_status ?? "disconnected"] ?? WHATSAPP_LABEL.disconnected;
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
                <div className="flex items-center gap-2" title={c.is_active ? "Suspender acesso" : "Reativar acesso"}>
                  <Switch checked={c.is_active} onCheckedChange={(active) => toggleActive.mutate({ id: c.id, active })} />
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-2">
                  <Smartphone className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${wa.className}`}>{wa.label}</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-2">
                  <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="text-xs">IA {c.ai_enabled ? "ativa" : "desligada"}{c.has_prompt ? " · prompt ok" : " · sem prompt"}</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-2">
                  <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="text-xs">{c.knowledge_count} item(ns) na base</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-2">
                  <MessagesSquare className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="text-xs">{c.conversations_count} conversas</span>
                </div>
              </div>

              {c.whatsapp_phone && <div className="mt-2 text-xs text-muted-foreground">WhatsApp: {c.whatsapp_phone}</div>}
              {!c.is_active && <Badge variant="outline" className="mt-2 border-destructive/40 text-destructive">Suspensa</Badge>}

              <div className="mt-4">
                <Button size="sm" variant="outline" onClick={() => openEdit(c)}>
                  <Pencil className="mr-1 h-4 w-4" /> Editar dados administrativos
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar empresa</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="cn">Nome da empresa</Label>
              <Input id="cn" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="cs">Segmento</Label>
                <Input id="cs" value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })} />
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
                <Input id="cr" value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="ct">Telefone</Label>
                <Input id="ct" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <div>
              <Label htmlFor="ce">E-mail</Label>
              <Input id="ce" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => save.mutate()} disabled={!form.name || save.isPending}>Salvar alterações</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
