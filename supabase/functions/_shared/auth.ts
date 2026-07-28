import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requiredEnv } from "./http.ts";

export function adminClient() {
  return createClient(requiredEnv("SUPABASE_URL"), requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
}

export async function requireUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Missing Authorization header");

  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!anonKey) throw new Error("Missing SUPABASE_ANON_KEY/SUPABASE_PUBLISHABLE_KEY");

  const userClient = createClient(requiredEnv("SUPABASE_URL"), anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });

  const { data, error } = await userClient.auth.getUser();
  if (error || !data.user) throw new Error("Unauthorized");

  const admin = adminClient();
  const [{ data: profile, error: profileError }, { data: platformAdmin, error: adminError }] = await Promise.all([
    admin
      .from("profiles")
      .select("company_id, companies(is_active)")
      .eq("id", data.user.id)
      .maybeSingle(),
    admin
      .from("platform_admins")
      .select("user_id")
      .eq("user_id", data.user.id)
      .maybeSingle(),
  ]);

  if (profileError) throw profileError;
  if (adminError) throw adminError;
  if (!profile?.company_id) throw new Error("Company not found for authenticated user");

  const company = Array.isArray((profile as any).companies)
    ? (profile as any).companies[0]
    : (profile as any).companies;
  const isSuperAdmin = Boolean(platformAdmin?.user_id);
  if (company?.is_active !== true && !isSuperAdmin) {
    throw new Error("Company access disabled");
  }

  return { user: data.user, companyId: profile.company_id as string, admin, isSuperAdmin };
}
