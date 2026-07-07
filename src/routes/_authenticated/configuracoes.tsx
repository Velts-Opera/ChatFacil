import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/configuracoes")({
  head: () => ({ meta: [{ title: "Configurações — Comunica AI" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const { data: company } = useQuery({
    queryKey: ["my-company"],
    queryFn: async () => {
      const { data: profile } = await supabase.from("profiles").select("company_id").maybeSingle();
      if (!profile?.company_id) return null;
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("id", profile.company_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState({
    name: "",
    segment: "",
    phone: "",
    email: "",
    contact_name: "",
    business_hours: "",
    services_description: "",
    communication_tone: "profissional",
  });

  useEffect(() => {
    if (company) {
      setForm({
        name: company.name ?? "",
        segment: company.segment ?? "",
        phone: company.phone ?? "",
        email: company.email ?? "",
        contact_name: company.contact_name ?? "",
        business_hours: company.business_hours ?? "",
        services_description: company.services_description ?? "",
        communication_tone: company.communication_tone ?? "profissional",
      });
    }
  }, [company]);

  const save = useMutation({
    mutationFn: async () => {
      if (!company) throw new Error("Empresa não encontrada");
      const { error } = await supabase.from("companies").update(form).eq("id", company.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configurações salvas");
      qc.invalidateQueries({ queryKey: ["my-company"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="font-display text-2xl font-bold">Configurações da empresa</h1>
        <p className="text-sm text-muted-foreground">Esses dados alimentam a IA e aparecem no seu atendimento.</p>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); save.mutate(); }}
        className="max-w-3xl space-y-6 rounded-2xl border border-border bg-card p-6"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label>Nome da empresa</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><Label>Segmento</Label><Input value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })} /></div>
          <div><Label>Responsável</Label><Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></div>
          <div><Label>Telefone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label>E-mail de contato</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label>Horário de atendimento</Label><Input value={form.business_hours} onChange={(e) => setForm({ ...form, business_hours: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label>Descrição dos serviços</Label><Textarea rows={4} value={form.services_description} onChange={(e) => setForm({ ...form, services_description: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label>Tom de comunicação</Label><Input value={form.communication_tone} onChange={(e) => setForm({ ...form, communication_tone: e.target.value })} /></div>
        </div>
        <Button type="submit" disabled={save.isPending}>Salvar alterações</Button>
      </form>
    </div>
  );
}