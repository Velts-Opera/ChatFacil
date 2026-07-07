import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  MessageSquareText,
  Users,
  Bot,
  Workflow,
  Megaphone,
  BarChart3,
  Check,
  Inbox,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Instagram,
  MessageCircle,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Comunica AI — Transforme seu WhatsApp em uma máquina de vendas" },
      {
        name: "description",
        content:
          "Plataforma de atendimento, CRM e automação para WhatsApp e Instagram. Automatize respostas, qualifique leads e venda mais com IA.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteHeader />
      <Hero />
      <LogosStrip />
      <HowItWorks />
      <FeatureGrid />
      <PlansSection />
      <FinalCTA />
      <SiteFooter />
    </div>
  );
}

function Logo() {
  return (
    <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
      <MessageSquareText className="h-4 w-4" />
    </div>
  );
}

function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <Logo />
          <span className="font-display text-lg font-extrabold tracking-tight">Comunica AI</span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <a href="#como-funciona" className="hover:text-foreground">Como funciona</a>
          <a href="#recursos" className="hover:text-foreground">Recursos</a>
          <a href="#planos" className="hover:text-foreground">Planos</a>
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <Link to="/auth">Entrar</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/auth">Começar agora</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-surface via-background to-background" />
      <div className="mx-auto max-w-6xl px-4 pt-16 pb-20 md:pt-24 md:pb-28">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-success" />
            IA treinada com os dados da sua empresa
          </div>
          <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
            Transforme seu WhatsApp em uma máquina de{" "}
            <span className="text-primary">atendimento</span> e{" "}
            <span className="text-success">vendas</span>.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg">
            Automatize respostas, organize clientes, qualifique leads e deixe a IA atender por você quando sua equipe não puder.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link to="/auth">
                Começar agora <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
              <a href="#como-funciona">Ver demonstração</a>
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Sem cartão de crédito · Cancele quando quiser
          </p>
        </div>

        <div className="relative mx-auto mt-14 max-w-5xl">
          <div className="rounded-2xl border border-border bg-card p-2 shadow-2xl shadow-primary/10">
            <div className="rounded-xl bg-surface p-4">
              <MockInbox />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MockInbox() {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-[220px_1fr_200px]">
      <div className="rounded-lg bg-background p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conversas</div>
        {[
          { name: "Contato WhatsApp", msg: "Mensagem recebida pela Cloud API" },
          { name: "Cliente em atendimento", msg: "Resposta enviada pelo painel" },
          { name: "Lead novo", msg: "IA consultando base cadastrada" },
        ].map((c, i) => (
          <div key={i} className={`rounded-md p-2 text-left ${i === 0 ? "bg-accent" : ""}`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">{c.name}</span>
              <span className="text-[10px] text-muted-foreground">2m</span>
            </div>
            <div className="truncate text-xs text-muted-foreground">{c.msg}</div>
          </div>
        ))}
      </div>
      <div className="min-h-[220px] rounded-lg bg-background p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">WA</div>
            <div>
              <div className="text-sm font-semibold">Contato real do WhatsApp</div>
              <div className="text-[10px] text-muted-foreground">Cloud API · evento recebido</div>
            </div>
          </div>
          <span className="rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">IA atendendo</span>
        </div>
        <div className="space-y-2">
          <div className="max-w-[75%] rounded-2xl rounded-tl-sm bg-muted px-3 py-2 text-sm">Mensagem recebida pelo webhook oficial.</div>
          <div className="ml-auto max-w-[75%] rounded-2xl rounded-tr-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
            Resposta gerada com a base de conhecimento da empresa.
          </div>
          <div className="max-w-[75%] rounded-2xl rounded-tl-sm bg-muted px-3 py-2 text-sm">Cliente responde e a conversa aparece no Inbox.</div>
        </div>
      </div>
      <div className="hidden rounded-lg bg-background p-3 md:block">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contato</div>
        <div className="mt-2 text-sm font-semibold">Contato real</div>
        <div className="text-xs text-muted-foreground">Telefone recebido pela Meta</div>
        <div className="mt-3 flex flex-wrap gap-1">
          <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive">lead quente</span>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-foreground">Instagram</span>
        </div>
        <div className="mt-4 text-[11px] text-muted-foreground">Etapa do funil</div>
        <div className="text-sm">Agendamento</div>
      </div>
    </div>
  );
}

function LogosStrip() {
  return (
    <section className="border-y border-border/60 bg-surface/60 py-6">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-2 px-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
        <span>WhatsApp</span><span>·</span>
        <span>Instagram</span><span>·</span>
        <span>Messenger</span><span>·</span>
        <span>Webchat</span><span>·</span>
        <span>Multi-atendente</span>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { n: "01", t: "Conecte seus canais", d: "WhatsApp, Instagram, Messenger e Webchat em um só lugar." },
    { n: "02", t: "Treine sua IA", d: "Cadastre serviços, preços e horários. A IA responde com base neles." },
    { n: "03", t: "Automatize e venda", d: "Fluxos por gatilhos, respostas rápidas e transferência para humano quando precisar." },
  ];
  return (
    <section id="como-funciona" className="mx-auto max-w-6xl px-4 py-20">
      <SectionHeading eyebrow="Como funciona" title="Comece a vender pelo WhatsApp em minutos" />
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {steps.map((s) => (
          <div key={s.n} className="rounded-2xl border border-border bg-card p-6">
            <div className="text-xs font-semibold text-success">{s.n}</div>
            <div className="mt-2 font-display text-xl font-bold">{s.t}</div>
            <p className="mt-2 text-sm text-muted-foreground">{s.d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function FeatureGrid() {
  const features = [
    { icon: Inbox, title: "Inbox multiatendente", desc: "Sua equipe atende junto, sem confusão. Filtros por status, IA ou humano." },
    { icon: Bot, title: "IA treinada com sua empresa", desc: "Responde usando só seus dados. Quando não sabe, transfere para o humano." },
    { icon: Workflow, title: "Automações sem código", desc: "Gatilhos por palavra-chave, primeira mensagem, tags, horário e mais." },
    { icon: Users, title: "CRM de contatos", desc: "Tags, etapa do funil, valor potencial e histórico completo por cliente." },
    { icon: Megaphone, title: "Campanhas e mensagens", desc: "Envie mensagens para segmentos por tag, sempre com consentimento." },
    { icon: BarChart3, title: "Relatórios", desc: "Taxa de resposta, conversas convertidas, desempenho da equipe e da IA." },
  ];
  return (
    <section id="recursos" className="bg-surface/50 py-20">
      <div className="mx-auto max-w-6xl px-4">
        <SectionHeading eyebrow="Recursos" title="Tudo que sua operação precisa em um só lugar" />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-2xl border border-border bg-card p-6 transition hover:shadow-md">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <div className="mt-4 font-display text-lg font-bold">{f.title}</div>
              <p className="mt-2 text-sm text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function PlansSection() {
  const plans = [
    {
      name: "Start",
      price: "R$ 97",
      desc: "Para começar a organizar seu atendimento.",
      features: ["1 canal", "2 atendentes", "Inbox", "CRM", "Respostas rápidas", "IA básica"],
      cta: "Começar",
      highlight: false,
    },
    {
      name: "Pro",
      price: "R$ 247",
      desc: "Automações e time crescendo.",
      features: ["Tudo do Start", "Automações", "Campanhas", "Tags avançadas", "Relatórios", "Múltiplos atendentes"],
      cta: "Assinar Pro",
      highlight: true,
    },
    {
      name: "Agência",
      price: "R$ 697",
      desc: "Para gerenciar várias empresas.",
      features: ["Múltiplas empresas", "White label", "Painel de clientes", "Permissões avançadas"],
      cta: "Falar com vendas",
      highlight: false,
    },
  ];
  return (
    <section id="planos" className="mx-auto max-w-6xl px-4 py-20">
      <SectionHeading eyebrow="Planos" title="Escolha o plano ideal para o seu negócio" />
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {plans.map((p) => (
          <div
            key={p.name}
            className={`rounded-2xl border p-6 ${
              p.highlight
                ? "border-primary bg-primary text-primary-foreground shadow-xl shadow-primary/20"
                : "border-border bg-card"
            }`}
          >
            <div className="flex items-baseline justify-between">
              <div className="font-display text-xl font-bold">{p.name}</div>
              {p.highlight && (
                <span className="rounded-full bg-success px-2 py-0.5 text-[10px] font-semibold text-success-foreground">
                  Popular
                </span>
              )}
            </div>
            <div className="mt-2 text-3xl font-extrabold">
              {p.price}
              <span className={`text-sm font-normal ${p.highlight ? "text-primary-foreground/70" : "text-muted-foreground"}`}>/mês</span>
            </div>
            <p className={`mt-1 text-sm ${p.highlight ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{p.desc}</p>
            <ul className="mt-5 space-y-2 text-sm">
              {p.features.map((f) => (
                <li key={f} className="flex items-center gap-2">
                  <Check className={`h-4 w-4 ${p.highlight ? "text-success-foreground" : "text-success"}`} />
                  {f}
                </li>
              ))}
            </ul>
            <Button
              asChild
              className={`mt-6 w-full ${p.highlight ? "bg-success text-success-foreground hover:bg-success/90" : ""}`}
              variant={p.highlight ? "default" : "outline"}
            >
              <Link to="/auth">{p.cta}</Link>
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-20">
      <div className="overflow-hidden rounded-3xl bg-primary p-10 text-primary-foreground md:p-14">
        <div className="grid gap-6 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <h2 className="font-display text-3xl font-extrabold leading-tight sm:text-4xl">
              Pronto para atender melhor e vender mais?
            </h2>
            <p className="mt-3 max-w-xl text-primary-foreground/80">
              Cadastre sua empresa em menos de 2 minutos e comece a organizar seu WhatsApp hoje.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg" className="bg-success text-success-foreground hover:bg-success/90">
              <Link to="/auth">Começar agora</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10">
              <a href="#como-funciona">Ver demonstração</a>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <div className="text-xs font-semibold uppercase tracking-widest text-success">{eyebrow}</div>
      <h2 className="mt-2 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{title}</h2>
    </div>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface/60 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-4 px-4 md:flex-row md:items-center">
        <div className="flex items-center gap-2">
          <Logo />
          <span className="font-display text-sm font-bold">Comunica AI</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> Dados protegidos</span>
          <span className="inline-flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5" /> Suporte humano</span>
          <span className="inline-flex items-center gap-1"><Instagram className="h-3.5 w-3.5" /> @comunica.ai</span>
        </div>
        <div className="text-xs text-muted-foreground">© {new Date().getFullYear()} Comunica AI</div>
      </div>
    </footer>
  );
}