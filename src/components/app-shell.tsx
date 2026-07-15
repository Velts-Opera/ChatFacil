import { type ReactNode } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Inbox,
  Users,
  MessagesSquare,
  Settings,
  LogOut,
  MessageSquareText,
  Menu,
  X,
  Radio,
  Bot,
  CalendarDays,
  Building2,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/contatos", label: "Contatos", icon: Users },
  { to: "/agenda", label: "Agenda", icon: CalendarDays },
  { to: "/agente-ia", label: "Agente IA", icon: Bot },
  { to: "/respostas-rapidas", label: "Respostas rápidas", icon: MessagesSquare },
  { to: "/canais", label: "Canais", icon: Radio },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const { data: isSuperAdmin = false } = useQuery({
    queryKey: ["is-super-admin"],
    queryFn: async () => {
      const { data } = await supabase.rpc("is_super_admin");
      return data ?? false;
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: activeCompany } = useQuery({
    queryKey: ["active-company-name"],
    queryFn: async () => {
      const { data: profile } = await supabase.from("profiles").select("company_id").maybeSingle();
      if (!profile?.company_id) return null;
      const { data } = await supabase
        .from("companies")
        .select("name")
        .eq("id", profile.company_id)
        .maybeSingle();
      return data?.name ?? null;
    },
  });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex min-h-screen w-full bg-surface">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-transform md:sticky md:top-0 md:h-screen md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between px-5 py-4">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-success text-success-foreground">
              <MessageSquareText className="h-4 w-4" />
            </div>
            <span className="font-display text-base font-extrabold">Comunica AI</span>
          </Link>
          <button onClick={() => setOpen(false)} className="md:hidden" aria-label="Fechar menu">
            <X className="h-5 w-5" />
          </button>
        </div>
        {activeCompany && (
          <div className="mx-3 mb-2 rounded-lg bg-sidebar-accent/40 px-3 py-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-sidebar-foreground/50">
              Empresa ativa
            </div>
            <div className="truncate text-sm font-medium text-sidebar-foreground">
              {activeCompany}
            </div>
          </div>
        )}
        <nav className="flex-1 space-y-0.5 px-3">
          {isSuperAdmin && (
            <Link
              to="/admin"
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
                pathname.startsWith("/admin")
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )}
            >
              <Building2 className="h-4 w-4" />
              <span>Painel Admin</span>
            </Link>
          )}
          {nav.map((item) => {
            const active = pathname === item.to || pathname.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                )}
              >
                <item.icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-3">
          <Button
            variant="ghost"
            onClick={signOut}
            className="w-full justify-start text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
          >
            <LogOut className="mr-2 h-4 w-4" /> Sair
          </Button>
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-background/80 px-4 py-3 backdrop-blur md:hidden">
          <button onClick={() => setOpen(true)} aria-label="Abrir menu">
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-display text-sm font-bold">Comunica AI</span>
        </header>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
