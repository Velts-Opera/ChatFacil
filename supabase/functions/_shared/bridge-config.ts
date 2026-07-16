// Configuração do bridge de WhatsApp: a tabela bridge_settings (service-role
// only) é a fonte da verdade — o bridge no Railway lê o mesmo registro no boot,
// então os dois lados ficam sincronizados sem nenhum secret manual.
// As envs WA_BRIDGE_URL/BRIDGE_URL/BRIDGE_SECRET ficam como fallback.
let cached: { url: string; secret: string } | null = null;

export async function getBridgeConfig(admin: any): Promise<{ url: string; secret: string }> {
  if (cached) return cached;
  let dbUrl = "";
  let dbSecret = "";
  try {
    const { data } = await admin
      .from("bridge_settings")
      .select("bridge_url, bridge_secret")
      .eq("id", 1)
      .maybeSingle();
    dbUrl = data?.bridge_url ?? "";
    dbSecret = data?.bridge_secret ?? "";
  } catch (_e) {
    // tabela pode não existir em instalações antigas — segue para o fallback
  }
  const url = (dbUrl || Deno.env.get("WA_BRIDGE_URL") || Deno.env.get("BRIDGE_URL") || "").replace(/\/$/, "");
  const secret = dbSecret || Deno.env.get("BRIDGE_SECRET") || "";
  if (url && secret) cached = { url, secret };
  return { url, secret };
}
