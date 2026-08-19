import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/app-shell";

type ActivationState = {
  status: "pending" | "active" | "suspended";
  company_id: string | null;
  company_is_active: boolean | null;
};

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    const { data: activationData, error: activationError } = await (supabase.rpc as any)(
      "get_account_activation_state",
    );
    const activation = (Array.isArray(activationData) ? activationData[0] : activationData) as
      | ActivationState
      | undefined;

    if (
      activationError ||
      !activation ||
      activation.status !== "active" ||
      !activation.company_id ||
      activation.company_is_active === false
    ) {
      throw redirect({ to: "/pending-activation" });
    }

    return { user: data.user, companyId: activation.company_id };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
