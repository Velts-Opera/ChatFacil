import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { validateNewPassword } from "./auth";

export const Route = createFileRoute("/reset-password")({
  head: () => ({ meta: [{ title: "Redefinir senha — ChatFacil" }] }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const missing = validateNewPassword(password);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const requirements = validateNewPassword(password);
    if (requirements.length) return toast.error(`A senha precisa ter ${requirements.join(", ")}.`);
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Senha atualizada!");
    navigate({ to: "/dashboard" });
  }

  return (
    <div className="grid min-h-screen place-items-center bg-surface p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-card p-6">
        <h1 className="font-display text-2xl font-bold">Redefinir senha</h1>
        <div>
          <Label htmlFor="np">Nova senha</Label>
          <Input id="np" type="password" autoComplete="new-password" required minLength={12} value={password} onChange={(e) => setPassword(e.target.value)} />
          <p className={`mt-1 text-xs ${password && missing.length === 0 ? "text-green-700" : "text-muted-foreground"}`}>
            {password && missing.length === 0 ? "Senha forte." : "Use 12+ caracteres com maiúscula, minúscula, número e símbolo."}
          </p>
        </div>
        <Button type="submit" className="w-full" disabled={loading}>Salvar</Button>
      </form>
    </div>
  );
}
