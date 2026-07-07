import { corsHeaders, json } from "../_shared/http.ts";
import { requireUser } from "../_shared/auth.ts";
import { graphBase, getChannelSecret, maskToken, metaGet } from "../_shared/whatsapp.ts";
import { encryptSecret } from "../_shared/crypto.ts";

interface Body {
  channel_id?: string;
  name?: string;
  access_token?: string;
  app_secret?: string;
  phone_number_id?: string;
  waba_id?: string;
  verify_token?: string;
  ai_enabled?: boolean;
  auto_reply_enabled?: boolean;
  human_handoff_enabled?: boolean;
  handoff_when_unknown?: boolean;
  greeting_message?: string;
  out_of_hours_message?: string;
  business_hours?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { user, companyId, admin } = await requireUser(req);
    const body = (await req.json().catch(() => ({}))) as Body;

    let existingChannel: any = null;
    if (body.channel_id) {
      const { data, error } = await admin
        .from("channels")
        .select("*")
        .eq("id", body.channel_id)
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return json({ error: "Canal não encontrado para essa empresa." }, 404);
      existingChannel = data;
    }

    const accessToken = body.access_token?.trim();
    const phoneNumberId = (body.phone_number_id || existingChannel?.phone_number_id || "").trim();
    const wabaId = (body.waba_id || existingChannel?.waba_id || "").trim();
    const verifyToken = (body.verify_token || existingChannel?.verify_token || crypto.randomUUID()).trim();
    const name = (body.name || existingChannel?.name || "WhatsApp principal").trim();
    const appSecret = body.app_secret?.trim() || null;

    if (!phoneNumberId || !wabaId || !verifyToken) {
      return json({ error: "Nome, WABA ID, Phone Number ID e Verify Token são obrigatórios." }, 400);
    }
    if (!accessToken && !existingChannel?.id) {
      return json({ error: "Access Token é obrigatório na primeira conexão." }, 400);
    }

    let tokenToTest = accessToken;
    if (!tokenToTest && existingChannel?.id) {
      const secret = await getChannelSecret(admin, existingChannel.id);
      tokenToTest = secret?.access_token;
    }
    if (!tokenToTest) return json({ error: "Access Token não encontrado. Informe um novo token." }, 400);

    const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-webhook`;

    // Mark as connecting while validation runs.
    let channelId = existingChannel?.id as string | undefined;
    const connectingPayload = {
      company_id: companyId,
      type: "whatsapp",
      provider: "meta_cloud_api",
      name,
      status: "connecting",
      phone_number_id: phoneNumberId,
      waba_id: wabaId,
      verify_token: verifyToken,
      webhook_url: webhookUrl,
      ai_enabled: body.ai_enabled ?? existingChannel?.ai_enabled ?? true,
      auto_reply_enabled: body.auto_reply_enabled ?? existingChannel?.auto_reply_enabled ?? false,
      human_handoff_enabled: body.human_handoff_enabled ?? existingChannel?.human_handoff_enabled ?? true,
      handoff_when_unknown: body.handoff_when_unknown ?? existingChannel?.handoff_when_unknown ?? true,
      greeting_message: body.greeting_message ?? existingChannel?.greeting_message ?? "Olá! Recebemos sua mensagem. Vou te ajudar por aqui.",
      out_of_hours_message: body.out_of_hours_message ?? existingChannel?.out_of_hours_message ?? "Olá! Estamos fora do horário de atendimento. Já recebemos sua mensagem e responderemos assim que possível.",
      business_hours: body.business_hours ?? existingChannel?.business_hours ?? "Segunda a sexta, 09:00 às 18:00",
      created_by: user.id,
    };

    if (channelId) {
      const { error } = await admin.from("channels").update(connectingPayload).eq("id", channelId);
      if (error) throw error;
    } else {
      const { data, error } = await admin.from("channels").insert(connectingPayload).select("id").single();
      if (error) throw error;
      channelId = data.id;
    }

    const phoneResult = await metaGet(
      `/${encodeURIComponent(phoneNumberId)}?fields=id,display_phone_number,verified_name,quality_rating`,
      tokenToTest,
    );

    if (!phoneResult.ok) {
      const errMsg = phoneResult.json?.error?.message || `Meta API retornou HTTP ${phoneResult.status}`;
      await admin.from("channels").update({
        status: "error",
        last_error: errMsg,
        last_error_code: phoneResult.json?.error?.code ? String(phoneResult.json.error.code) : null,
        last_sync_at: new Date().toISOString(),
      }).eq("id", channelId);

      await admin.from("webhook_events").insert({
        company_id: companyId,
        channel_id: channelId,
        event_type: "connection_test_failed",
        status: "error",
        source: "meta",
        payload: { endpoint: `${graphBase()}/${phoneNumberId}`, response: phoneResult.json },
        error_message: errMsg,
        processed_at: new Date().toISOString(),
      });

      return json({ ok: false, error: errMsg, meta: phoneResult.json }, 200);
    }

    // Optional WABA sanity check. We don't fail the whole connection if Meta denies this
    // endpoint because some tokens can access the phone number but not the WABA listing.
    const wabaResult = await metaGet(
      `/${encodeURIComponent(wabaId)}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating`,
      tokenToTest,
    );

    const now = new Date().toISOString();
    const phone = phoneResult.json?.display_phone_number ?? null;
    await admin.from("channels").update({
      status: "connected",
      phone_number: phone,
      phone_number_id: phoneNumberId,
      waba_id: wabaId,
      verify_token: verifyToken,
      webhook_url: webhookUrl,
      verified_name: phoneResult.json?.verified_name ?? null,
      quality_rating: phoneResult.json?.quality_rating ?? null,
      app_secret_present: Boolean(appSecret || existingChannel?.app_secret_present),
      access_token: null,
      last_error: null,
      last_error_code: null,
      connected_at: existingChannel?.connected_at ?? now,
      last_sync_at: now,
    }).eq("id", channelId);

    if (accessToken || appSecret) {
      const secretPayload: Record<string, unknown> = {
        channel_id: channelId,
        access_token: null,
        token_hint: maskToken(tokenToTest),
        encryption_version: "v1:aes-gcm",
        updated_at: now,
      };
      if (accessToken) secretPayload.access_token_enc = await encryptSecret(tokenToTest);
      if (appSecret) {
        secretPayload.app_secret = null;
        secretPayload.app_secret_enc = await encryptSecret(appSecret);
      }
      const { error: upsertSecretError } = await admin
        .from("channel_secrets")
        .upsert(secretPayload, { onConflict: "channel_id" });
      if (upsertSecretError) throw upsertSecretError;
    }

    await admin.from("audit_logs").insert({
      company_id: companyId,
      user_id: user.id,
      action: existingChannel?.id ? "whatsapp_channel_reconnected" : "whatsapp_channel_connected",
      resource_type: "channel",
      resource_id: channelId,
      metadata: { phone_number_id: phoneNumberId, waba_id: wabaId, app_secret_present: Boolean(appSecret || existingChannel?.app_secret_present) },
    });

    await admin.from("webhook_events").insert({
      company_id: companyId,
      channel_id: channelId,
      event_type: "connection_test_success",
      status: "ok",
      source: "meta",
      payload: {
        phone_result: phoneResult.json,
        waba_check_ok: wabaResult.ok,
        waba_result: wabaResult.json,
      },
      processed_at: now,
    });

    const { data: channel } = await admin
      .from("channels")
      .select("*")
      .eq("id", channelId)
      .single();

    return json({ ok: true, channel, meta: phoneResult.json, waba_check_ok: wabaResult.ok });
  } catch (e) {
    console.error("whatsapp-test-connection error", e);
    const msg = (e as Error).message ?? "Erro inesperado";
    const status = msg === "Unauthorized" || msg.includes("Authorization") ? 401 : 500;
    return json({ error: msg }, status);
  }
});
