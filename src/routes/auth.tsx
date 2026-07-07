import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { MessageSquareText, Loader2 } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar ou cadastrar — Comunica AI" },
      { name: "description", content: "Acesse ou crie sua conta na Comunica AI." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 lg:grid-cols-2">
        <div className="hidden flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-success text-success-foreground">
              <MessageSquareText className="h-4 w-4" />
            </div>
            <span className="font-display text-lg font-extrabold">Comunica AI</span>
          </Link>
          <div>
            <h1 className="font-display text-4xl font-extrabold leading-tight">
              Transforme seu WhatsApp em uma máquina de atendimento e vendas.
            </h1>
            <p className="mt-4 text-primary-foreground/80">
              Inbox multiatendente, CRM, IA treinada com seus dados e automações sem código — tudo em um só lugar.
            </p>
          </div>
          <p className="text-xs text-primary-foreground/60">© {new Date().getFullYear()} Comunica AI</p>
        </div>

        <div className="flex items-center justify-center p-6">
          <div className="w-full max-w-md">
            <Link to="/" className="mb-6 flex items-center gap-2 lg:hidden">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground">
                <MessageSquareText className="h-4 w-4" />
              </div>
              <span className="font-display text-lg font-extrabold">Comunica AI</span>
            </Link>
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Entrar</TabsTrigger>
                <TabsTrigger value="signup">Criar conta</TabsTrigger>
              </TabsList>
              <TabsContent value="login"><LoginForm /></TabsContent>
              <TabsContent value="signup"><SignupForm /></TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </div>
  );
}

function LoginForm() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Bem-vindo de volta!");
    navigate({ to: "/dashboard" });
  }

  async function onGoogle() {
    const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (res.error) toast.error("Falha ao entrar com Google");
    else if (!res.redirected) navigate({ to: "/dashboard" });
  }

  async function onForgot() {
    if (!email) return toast.error("Informe seu e-mail acima primeiro");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) toast.error(error.message);
    else toast.success("Enviamos um link de recuperação para seu e-mail.");
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      <h2 className="font-display text-2xl font-bold">Entrar</h2>
      <div>
        <Label htmlFor="li-email">E-mail</Label>
        <Input id="li-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="li-pass">Senha</Label>
        <Input id="li-pass" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Entrar
      </Button>
      <button type="button" onClick={onForgot} className="block w-full text-center text-xs text-muted-foreground hover:text-foreground">
        Esqueci minha senha
      </button>
      <div className="relative py-2">
        <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
        <div className="relative flex justify-center"><span className="bg-background px-2 text-xs text-muted-foreground">ou</span></div>
      </div>
      <Button type="button" variant="outline" className="w-full" onClick={onGoogle}>
        Continuar com Google
      </Button>
    </form>
  );
}

function SignupForm() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    company_name: "",
    segment: "",
    phone: "",
    email: "",
    password: "",
    contact_name: "",
    business_hours: "",
    services_description: "",
    communication_tone: "profissional",
  });

  function upd<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          company_name: form.company_name,
          segment: form.segment,
          phone: form.phone,
          contact_name: form.contact_name,
          business_hours: form.business_hours,
          services_description: form.services_description,
          communication_tone: form.communication_tone,
        },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Conta criada! Verifique seu e-mail se necessário.");
    navigate({ to: "/dashboard" });
  }

  async function onGoogle() {
    const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (res.error) toast.error("Falha ao entrar com Google");
    else if (!res.redirected) navigate({ to: "/dashboard" });
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-3">
      <h2 className="font-display text-2xl font-bold">Criar conta da empresa</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="s-company">Nome da empresa</Label>
          <Input id="s-company" required value={form.company_name} onChange={(e) => upd("company_name", e.target.value)} />
        </div>
        <div>
          <Label htmlFor="s-seg">Segmento</Label>
          <Input id="s-seg" placeholder="Ex: estética, moda, restaurante" value={form.segment} onChange={(e) => upd("segment", e.target.value)} />
        </div>
        <div>
          <Label htmlFor="s-name">Nome do responsável</Label>
          <Input id="s-name" required value={form.contact_name} onChange={(e) => upd("contact_name", e.target.value)} />
        </div>
        <div>
          <Label htmlFor="s-phone">Telefone</Label>
          <Input id="s-phone" value={form.phone} onChange={(e) => upd("phone", e.target.value)} />
        </div>
        <div>
          <Label htmlFor="s-email">E-mail</Label>
          <Input id="s-email" type="email" required value={form.email} onChange={(e) => upd("email", e.target.value)} />
        </div>
        <div>
          <Label htmlFor="s-pass">Senha</Label>
          <Input id="s-pass" type="password" required minLength={6} value={form.password} onChange={(e) => upd("password", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="s-hours">Horário de atendimento</Label>
          <Input id="s-hours" placeholder="Seg a Sex, 9h às 18h" value={form.business_hours} onChange={(e) => upd("business_hours", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="s-desc">Descrição dos serviços</Label>
          <Textarea id="s-desc" rows={3} value={form.services_description} onChange={(e) => upd("services_description", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="s-tone">Tom de comunicação</Label>
          <Input id="s-tone" placeholder="Ex: profissional, amigável, descontraído" value={form.communication_tone} onChange={(e) => upd("communication_tone", e.target.value)} />
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Criar conta
      </Button>
      <div className="relative py-2">
        <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
        <div className="relative flex justify-center"><span className="bg-background px-2 text-xs text-muted-foreground">ou</span></div>
      </div>
      <Button type="button" variant="outline" className="w-full" onClick={onGoogle}>
        Continuar com Google
      </Button>
    </form>
  );
}