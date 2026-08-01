import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { decryptSecret } from "../_shared/crypto.ts";

const headers = { "Content-Type": "application/json" };
const cleanPhone = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const graphBase = () => `https://graph.facebook.com/${Deno.env.get("META_GRAPH_VERSION") ?? "v25.0"}`;
const errorText = (error: unknown) => error instanceof Error ? error.message : JSON.stringify(error);

function adminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function authorize(admin: any, req: Request) {
  const token = req.headers.get("x-chatfacil-worker-token")?.trim();
  if (!token || token.length < 32) return false;
  const hash = await sha256Hex(token);
  const { data, error } = await admin
    .from("internal_worker_tokens")
    .select("token_hash")
    .eq("token_hash", hash)
    .eq("enabled", true)
    .maybeSingle();
  if (error || !data) return false;
  await admin.from("internal_worker_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("token_hash", hash);
  return true;
}

async function getAccessToken(admin: any, channelId: string) {
  const { data, error } = await admin
    .from("channel_secrets")
    .select("access_token,access_token_enc")
    .eq("channel_id", channelId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return data.access_token_enc
    ? await decryptSecret(data.access_token_enc)
    : data.access_token;
}

async function metaSend(channel: any, accessToken: string, to: string, row: any) {
  let body: Record<string, unknown>;
  if (row.kind === "text") {
    const message = String(row.payload?.message ?? "").trim();
    if (!message) throw new Error("Mensagem de texto vazia");
    body = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: cleanPhone(to),
      type: "text",
      text: { preview_url: false, body: message },
    };
  } else if (row.kind === "template") {
    if (!row.payload?.template_name) throw new Error("Template não informado");
    const parameters = Array.isArray(row.payload?.body_parameters)
      ? row.payload.body_parameters.map((text: unknown) => ({
          type: "text",
          text: String(text ?? ""),
        }))
      : [];
    const template: Record<string, unknown> = {
      name: row.payload.template_name,
      language: { code: row.payload.language ?? "pt_BR" },
    };
    if (parameters.length) template.components = [{ type: "body", parameters }];
    body = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: cleanPhone(to),
      type: "template",
      template,
    };
  } else {
    throw new Error(`Tipo de envio não suportado: ${row.kind}`);
  }

  const response = await fetch(
    `${graphBase()}/${encodeURIComponent(channel.phone_number_id)}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12_000),
    },
  );
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.error?.message ?? `Meta HTTP ${response.status}`);
  }
  return result;
}

async function ensureConversation(admin: any, row: any, preview: string) {
  const now = new Date().toISOString();
  const phone = cleanPhone(row.to_phone);
  let contactId = row.contact_id as string | null;
  if (!contactId) {
    const { data } = await admin.from("contacts")
      .select("id")
      .eq("company_id", row.company_id)
      .eq("channel_id", row.channel_id)
      .eq("wa_id", phone)
      .maybeSingle();
    contactId = data?.id ?? null;
  }
  if (!contactId) {
    const { data, error } = await admin.from("contacts").insert({
      company_id: row.company_id,
      channel_id: row.channel_id,
      name: phone,
      phone,
      wa_id: phone,
      source: "automation",
      last_interaction_at: now,
    }).select("id").single();
    if (error) throw error;
    contactId = data.id;
  }

  let conversationId = row.conversation_id as string | null;
  if (!conversationId) {
    const { data } = await admin.from("conversations")
      .select("id")
      .eq("company_id", row.company_id)
      .eq("channel_id", row.channel_id)
      .eq("contact_id", contactId)
      .neq("status", "resolvida")
      .maybeSingle();
    conversationId = data?.id ?? null;
  }
  if (!conversationId) {
    const businessFlow = row.payload?.source === "business_conversation";
    const { data, error } = await admin.from("conversations").insert({
      company_id: row.company_id,
      channel_id: row.channel_id,
      contact_id: contactId,
      channel: "whatsapp",
      status: "aberta",
      ai_handling: !businessFlow,
      human_handling: businessFlow,
      ai_paused_until: businessFlow
        ? new Date(Date.now() + 30 * 60_000).toISOString()
        : null,
      last_message: preview,
      last_message_direction: "outbound",
      unread_count: 0,
      last_message_at: now,
    }).select("id").single();
    if (error) throw error;
    conversationId = data.id;
  }
  return { contactId, conversationId };
}

async function markFailure(admin: any, row: any, error: unknown) {
  const message = errorText(error);
  const retry = Number(row.attempts ?? 0) < Number(row.max_attempts ?? 3);
  const delayMinutes = Math.min(
    240,
    5 * 2 ** Math.max(0, Number(row.attempts ?? 1) - 1),
  );
  await admin.from("outbound_queue").update({
    status: retry ? "queued" : "failed",
    last_error: message,
    next_attempt_at: retry
      ? new Date(Date.now() + delayMinutes * 60_000).toISOString()
      : row.next_attempt_at,
    updated_at: new Date().toISOString(),
  }).eq("id", row.id);
  if (!retry && row.business_opportunity_id) {
    await admin.from("business_opportunities")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", row.business_opportunity_id);
  }
}

async function processRow(admin: any, row: any) {
  try {
    const { data: channel, error } = await admin.from("channels")
      .select("id,company_id,status,provider,phone_number_id")
      .eq("id", row.channel_id)
      .eq("company_id", row.company_id)
      .maybeSingle();
    if (error) throw error;
    if (
      !channel ||
      channel.status !== "connected" ||
      channel.provider !== "meta_cloud_api" ||
      !channel.phone_number_id
    ) {
      throw new Error("Canal oficial conectado não encontrado");
    }
    const accessToken = await getAccessToken(admin, channel.id);
    if (!accessToken) throw new Error("Token Meta não encontrado");

    const preview = row.kind === "text"
      ? String(row.payload?.message ?? "")
      : String(row.payload?.preview ?? `[template] ${row.payload?.template_name ?? ""}`);
    const meta = await metaSend(channel, accessToken, row.to_phone, row);
    const { contactId, conversationId } = await ensureConversation(admin, row, preview);
    const { data: message, error: messageError } = await admin.from("messages").insert({
      company_id: row.company_id,
      channel_id: row.channel_id,
      conversation_id: conversationId,
      contact_id: contactId,
      direction: "outbound",
      message_type: row.kind,
      content: preview,
      sender_type: "automation",
      meta_message_id: meta?.messages?.[0]?.id ?? null,
      status: "sent",
      raw_payload: meta,
      ai_generated: false,
    }).select("id").single();
    if (messageError) throw messageError;

    const now = new Date().toISOString();
    const businessFlow = row.payload?.source === "business_conversation";
    await admin.from("conversations").update({
      ai_handling: businessFlow ? false : true,
      human_handling: businessFlow,
      ai_paused_until: businessFlow
        ? new Date(Date.now() + 30 * 60_000).toISOString()
        : null,
      status: "aberta",
      handoff_reason: businessFlow
        ? "Fluxo automático de agenda em andamento"
        : null,
      last_message: preview,
      last_message_direction: "outbound",
      unread_count: 0,
      last_message_at: now,
      updated_at: now,
    }).eq("id", conversationId);
    await admin.from("outbound_queue").update({
      status: "sent",
      sent_message_id: message.id,
      last_error: null,
      updated_at: now,
    }).eq("id", row.id);

    if (row.business_opportunity_id) {
      const { data: opportunity } = await admin.from("business_opportunities")
        .select("opportunity_type,appointment_id")
        .eq("id", row.business_opportunity_id)
        .maybeSingle();
      await admin.from("business_opportunities").update({
        status: "contacted",
        contacted_at: now,
        updated_at: now,
      }).eq("id", row.business_opportunity_id);
      const { data: contact } = await admin.from("contacts")
        .select("reactivation_attempts")
        .eq("id", contactId)
        .maybeSingle();
      await admin.from("contacts").update({
        last_reactivation_at: now,
        reactivation_attempts: Number(contact?.reactivation_attempts ?? 0) + 1,
        updated_at: now,
      }).eq("id", contactId);
      if (
        opportunity?.opportunity_type === "appointment_reminder" &&
        opportunity.appointment_id
      ) {
        await admin.from("appointments")
          .update({ reminder_24h_sent_at: now })
          .eq("id", opportunity.appointment_id);
      }
    }
    return true;
  } catch (error) {
    console.error("business worker row failed", {
      queue_id: row.id,
      error: errorText(error),
    });
    await markFailure(admin, row, error);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers,
    });
  }
  const admin = adminClient();
  if (!(await authorize(admin, req))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers,
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(100, Number(body?.limit ?? 20)));
    const stale = new Date(Date.now() - 15 * 60_000).toISOString();
    await admin.from("outbound_queue").update({
      status: "queued",
      next_attempt_at: new Date().toISOString(),
      last_error: "Processamento anterior expirou",
    })
      .eq("status", "processing")
      .lt("updated_at", stale)
      .or("business_opportunity_id.not.is.null,payload->>source.eq.business_conversation");

    let detected = 0;
    let enqueued = 0;
    let rows: any[] = [];
    if (body?.job_id) {
      const { data, error } = await admin.rpc("business_claim_outbound_job", {
        _job_id: body.job_id,
      });
      if (error) throw error;
      rows = data ?? [];
    } else {
      const detection = await admin.rpc("business_detect_opportunities", {
        _company_id: null,
      });
      if (detection.error) throw detection.error;
      detected = Number(detection.data ?? 0);

      const enqueue = await admin.rpc("business_enqueue_due_outreach", {
        _company_id: null,
      });
      if (enqueue.error) throw enqueue.error;
      enqueued = Number(enqueue.data ?? 0);

      const claim = await admin.rpc("business_claim_outbound_queue", {
        _limit: limit,
      });
      if (claim.error) throw claim.error;
      rows = claim.data ?? [];
    }

    let sent = 0;
    for (const row of rows) {
      if (await processRow(admin, row)) sent += 1;
    }
    return new Response(JSON.stringify({
      ok: true,
      detected,
      enqueued,
      claimed: rows.length,
      sent,
      failed: rows.length - sent,
    }), { headers });
  } catch (error) {
    console.error("business-automation-worker", error);
    return new Response(JSON.stringify({ error: errorText(error) }), {
      status: 500,
      headers,
    });
  }
});
