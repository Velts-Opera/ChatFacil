import { useCallback } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { MessageSquareText } from "lucide-react";
import { MetaEmbeddedSignup } from "@/components/meta-embedded-signup";

export const Route = createFileRoute("/onboarding/$token")({
  head: () => ({
    meta: [
      { title: "Conectar WhatsApp — Comunica AI" },
      { name: "description", content: "Onboarding oficial do WhatsApp Business pela Meta." },
      { name: "robots", content: "noindex,nofollow" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: WhatsAppOnboardingPage,
});

function WhatsAppOnboardingPage() {
  const { token } = Route.useParams();
  const completed = useCallback(() => undefined, []);

  return (
    <main className="min-h-screen bg-surface px-4 py-8 sm:py-14">
      <div className="mx-auto w-full max-w-xl">
        <Link to="/" className="mb-8 flex items-center justify-center gap-2 text-foreground">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-success text-success-foreground">
            <MessageSquareText className="h-5 w-5" />
          </div>
          <span className="font-display text-xl font-extrabold">Comunica AI</span>
        </Link>

        <div className="rounded-2xl border bg-background p-5 shadow-sm sm:p-8">
          <div className="mb-6 text-center">
            <h1 className="font-display text-2xl font-bold">Ative o WhatsApp da sua empresa</h1>
            <p className="mt-2 text-sm text-muted-foreground">A conexão usa o fluxo oficial da Meta. Nenhuma senha da sua conta é armazenada pela Comunica AI.</p>
          </div>
          <MetaEmbeddedSignup token={token} onComplete={completed} />
        </div>

        <p className="mt-5 text-center text-xs text-muted-foreground">Este link é temporário, de uso único e vinculado apenas à empresa que o gerou.</p>
      </div>
    </main>
  );
}
