import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  MessageSquareText,
  Users,
  Bot,
  Inbox,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  CalendarDays,
  Radio,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ChatFacil — Atendimento com IA no WhatsApp" },
      {
        name: "description",
        content:
          "Atendimento, Inbox, CRM e IA treinada com os dados da sua empresa para operar no WhatsApp.",
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
      <AccessSection />
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
          <span className="font-display text-lg font-extrabold tracking-tight">ChatFacil</span>
        </Link>
        <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
          <a href="#como-funciona" className="hover:text-foreground">Como funciona</a>
          <a href="#recursos" className="hover:text-foreground">Recursos</a>
          <a href="#acesso" className="hover:text-foreground">Acesso</a>
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
            Crie sua conta de teste sem cartão de crédito
          </p>
        </div>

        <ProductFlow />
      </div>
    </section>
  );
}

function ProductFlow() {
  const items = [
    { title: "Sua empresa", text: "Conta, dados e agente separados por empresa." },
    { title: "Seu WhatsApp", text: "Autorização guiada pela integração oficial da Meta." },
    { title: "Seu atendimento", text: "Mensagens na Inbox com IA e transferência para humano." },
  ];

  return (
    <div className="mx-auto mt-14 grid max-w-5xl gap-4 md:grid-cols-3">
      {items.map((item, index) => (
        <div key={item.title} className="rounded-2xl border border-border bg-card p-6 text-left shadow-lg shadow-primary/5">
          <div className="text-xs font-semibold text-success">0{index + 1}</div>
          <div className="mt-2 font-display text-lg font-bold">{item.title}</div>
          <p className="mt-2 text-sm text-muted-foreground">{item.text}</p>
        </div>
      ))}
    </div>
  );
}

function LogosStrip() {
  return (
    <section className="border-y border-border/60 bg-surface/60 py-6">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-2 px-4 text-xs font-medium uppercase tracking-widest text-muted-foreground">
        <span>WhatsApp</span><span>·</span>
        <span>IA por empresa</span><span>·</span>
        <span>Inbox</span><span>·</span>
        <span>CRM</span><span>·</span>
        <span>Agenda</span>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    { n: "01", t: "Cadastre sua empresa", d: "Crie a conta e informe serviços, horários e forma de atendimento." },
    { n: "02", t: "Treine sua IA", d: "Cadastre serviços, preços e horários. A IA responde com base neles." },
    { n: "03", t: "Conecte e teste", d: "Conecte seu WhatsApp e valide o recebimento antes de iniciar o atendimento." },
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
    { icon: Inbox, title: "Inbox de atendimento", desc: "Acompanhe conversas, mensagens, status e a alternância entre IA e humano." },
    { icon: Bot, title: "IA treinada com sua empresa", desc: "Responde usando só seus dados. Quando não sabe, transfere para o humano." },
    { icon: Users, title: "CRM de contatos", desc: "Tags, etapa do funil, valor potencial e histórico completo por cliente." },
    { icon: CalendarDays, title: "Agenda", desc: "Cadastre compromissos e acompanhe horários ligados ao atendimento." },
    { icon: MessageSquareText, title: "Respostas rápidas", desc: "Salve mensagens frequentes e use-as no atendimento humano." },
    { icon: Radio, title: "Conexão do WhatsApp", desc: "Autorize o número no fluxo oficial da Meta; a infraestrutura fica por conta do ChatFacil." },
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

function AccessSection() {
  return (
    <section id="acesso" className="mx-auto max-w-4xl px-4 py-20">
      <div className="rounded-3xl border border-border bg-card p-8 text-center md:p-12">
        <SectionHeading eyebrow="Acesso de teste" title="Valide o ChatFacil com a sua empresa" />
        <p className="mx-auto mt-4 max-w-2xl text-sm text-muted-foreground">
          O cadastro de teste não exige cartão. Planos e cobrança automática só serão publicados depois da validação comercial completa.
        </p>
        <Button asChild size="lg" className="mt-7">
          <Link to="/auth">Criar conta de teste</Link>
        </Button>
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
          <span className="font-display text-sm font-bold">ChatFacil</span>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> Dados separados por empresa</span>
        </div>
        <div className="text-xs text-muted-foreground">© {new Date().getFullYear()} ChatFacil</div>
      </div>
    </footer>
  );
}
