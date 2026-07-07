import { corsHeaders, json } from "../_shared/http.ts";
import { requireUser } from "../_shared/auth.ts";

interface Body { channel_id: string }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST" && req.method !== "DELETE") return json({ error: "Method not allowed" }, 405);
  try {
    const { user, companyId, admin } = await requireUser(req);
    const body = (await req.json().catch(() => ({}))) as Body;
    if (!body.channel_id) return json({ error: "channel_id é obrigatório." }, 400);

    const { data: channel, error } = await admin.from("channels")
      .select("id, company_id")
      .eq("id", body.channel_id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (error) throw error;
    if (!channel) return json({ error: "Canal não encontrado." }, 404);

    await admin.from("channel_secrets").delete().eq("channel_id", channel.id);
    await admin.from("channels").update({
      status: "disconnected",
      connected_at: null,
      last_error: null,
      last_error_code: null,
      app_secret_present: false,
      access_token: null,
      updated_at: new Date().toISOString(),
    }).eq("id", channel.id);
    await admin.from("audit_logs").insert({
      company_id: companyId, user_id: user.id, action: "whatsapp_channel_disconnected",
      resource_type: "channel", resource_id: channel.id,
    });
    return json({ ok: true });
  } catch (e) {
    console.error("whatsapp-disconnect-channel error", e);
    return json({ error: (e as Error).message ?? "Erro inesperado" }, 500);
  }
});
