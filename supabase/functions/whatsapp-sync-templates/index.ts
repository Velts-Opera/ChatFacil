import { corsHeaders, json } from "../_shared/http.ts";
import { requireUser } from "../_shared/auth.ts";
import { getChannelSecret, graphBase } from "../_shared/whatsapp.ts";

interface Body { channel_id: string }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const started = Date.now();
  try {
    const { user, companyId, admin } = await requireUser(req);
    const body = (await req.json().catch(() => ({}))) as Body;
    if (!body.channel_id) return json({ error: "channel_id é obrigatório." }, 400);

    const { data: channel, error: channelError } = await admin
      .from("channels")
      .select("id, company_id, status, waba_id")
      .eq("id", body.channel_id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (channelError) throw channelError;
    if (!channel) return json({ error: "Canal não encontrado." }, 404);
    if (channel.status !== "connected") return json({ error: "Canal não está conectado." }, 400);
    if (!channel.waba_id) return json({ error: "WABA ID ausente." }, 400);

    const secret = await getChannelSecret(admin, channel.id);
    if (!secret?.access_token) return json({ error: "Credenciais do canal não encontradas." }, 400);

    const url = `${graphBase()}/${encodeURIComponent(channel.waba_id)}/message_templates?fields=id,name,language,status,category,components&limit=250`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${secret.access_token}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.error?.message ?? `Meta HTTP ${res.status}`;
      await admin.from("integration_health_checks").insert({
        company_id: companyId, channel_id: channel.id, check_type: "templates_sync", status: "error",
        latency_ms: Date.now() - started, error_message: msg, payload: data,
      });
      return json({ ok: false, error: msg, meta: data }, 200);
    }

    const templates = Array.isArray(data?.data) ? data.data : [];
    const now = new Date().toISOString();
    for (const t of templates) {
      await admin.from("whatsapp_templates").upsert({
        company_id: companyId,
        channel_id: channel.id,
        meta_template_id: t.id ?? null,
        name: t.name,
        language: t.language ?? "pt_BR",
        category: t.category ?? null,
        status: t.status ?? null,
        components: t.components ?? [],
        raw_payload: t,
        last_synced_at: now,
        updated_at: now,
      }, { onConflict: "channel_id,name,language" });
    }

    await admin.from("channels").update({ last_sync_at: now }).eq("id", channel.id);
    await admin.from("audit_logs").insert({
      company_id: companyId, user_id: user.id, action: "whatsapp_templates_synced",
      resource_type: "channel", resource_id: channel.id, metadata: { count: templates.length },
    });
    await admin.from("integration_health_checks").insert({
      company_id: companyId, channel_id: channel.id, check_type: "templates_sync", status: "ok",
      latency_ms: Date.now() - started, payload: { count: templates.length },
    });

    return json({ ok: true, count: templates.length });
  } catch (e) {
    console.error("whatsapp-sync-templates error", e);
    return json({ error: (e as Error).message ?? "Erro inesperado" }, 500);
  }
});
