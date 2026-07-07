import { corsHeaders, json } from "../_shared/http.ts";
import { requireUser } from "../_shared/auth.ts";
import { getChannelSecret, metaGet } from "../_shared/whatsapp.ts";

interface Body { channel_id: string }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const started = Date.now();
  try {
    const { companyId, admin } = await requireUser(req);
    const body = (await req.json().catch(() => ({}))) as Body;
    if (!body.channel_id) return json({ error: "channel_id é obrigatório." }, 400);

    const { data: channel, error } = await admin.from("channels")
      .select("id, company_id, status, phone_number_id")
      .eq("id", body.channel_id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (error) throw error;
    if (!channel) return json({ error: "Canal não encontrado." }, 404);

    const secret = await getChannelSecret(admin, channel.id);
    if (!secret?.access_token || !channel.phone_number_id) return json({ ok: false, error: "Credenciais ausentes." }, 200);

    const result = await metaGet(`/${encodeURIComponent(channel.phone_number_id)}?fields=id,display_phone_number,verified_name,quality_rating`, secret.access_token);
    const now = new Date().toISOString();
    const status = result.ok ? "ok" : "error";
    const errorMessage = result.ok ? null : result.json?.error?.message ?? `Meta HTTP ${result.status}`;
    await admin.from("integration_health_checks").insert({
      company_id: companyId, channel_id: channel.id, check_type: "meta_phone_number", status,
      latency_ms: Date.now() - started, error_message: errorMessage, payload: result.json,
    });
    await admin.from("channels").update({
      status: result.ok ? "connected" : "error",
      last_error: errorMessage,
      last_sync_at: now,
      quality_rating: result.json?.quality_rating ?? null,
      verified_name: result.json?.verified_name ?? null,
    }).eq("id", channel.id);

    return json({ ok: result.ok, error: errorMessage, meta: result.json, latency_ms: Date.now() - started });
  } catch (e) {
    console.error("whatsapp-health-check error", e);
    return json({ error: (e as Error).message ?? "Erro inesperado" }, 500);
  }
});
