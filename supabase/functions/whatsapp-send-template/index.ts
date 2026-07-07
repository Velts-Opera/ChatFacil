import { corsHeaders, cleanPhone, json } from "../_shared/http.ts";
import { requireUser } from "../_shared/auth.ts";
import { getChannelSecret, graphBase, upsertContactAndConversation } from "../_shared/whatsapp.ts";

interface Body {
  channel_id: string;
  to: string;
  template_name: string;
  language?: string;
  body_parameters?: string[];
}

function buildComponents(params?: string[]) {
  if (!params?.length) return undefined;
  return [{
    type: "body",
    parameters: params.map((text) => ({ type: "text", text })),
  }];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { user, companyId, admin } = await requireUser(req);
    const body = (await req.json().catch(() => ({}))) as Body;
    const to = cleanPhone(body.to ?? "");
    if (!body.channel_id || !to || !body.template_name) return json({ error: "channel_id, to e template_name são obrigatórios." }, 400);

    const { data: channel, error: channelError } = await admin
      .from("channels")
      .select("id, company_id, status, phone_number_id")
      .eq("id", body.channel_id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (channelError) throw channelError;
    if (!channel) return json({ error: "Canal não encontrado." }, 404);
    if (channel.status !== "connected") return json({ error: "Canal não está conectado." }, 400);

    const secret = await getChannelSecret(admin, channel.id);
    if (!secret?.access_token || !channel.phone_number_id) return json({ error: "Credenciais do canal não encontradas." }, 400);

    const language = body.language || "pt_BR";
    const payload: Record<string, unknown> = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template: {
        name: body.template_name,
        language: { code: language },
        components: buildComponents(body.body_parameters),
      },
    };

    const res = await fetch(`${graphBase()}/${encodeURIComponent(channel.phone_number_id)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secret.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const meta = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errMsg = meta?.error?.message || `Meta HTTP ${res.status}`;
      await admin.from("webhook_events").insert({
        company_id: companyId, channel_id: channel.id, event_type: "send_template_failed", status: "error", source: "app",
        payload: { request: payload, response: meta }, error_message: errMsg, processed_at: new Date().toISOString(),
      });
      return json({ ok: false, error: errMsg, meta }, 200);
    }

    const { contactId, conversationId } = await upsertContactAndConversation(admin, {
      companyId, channelId: channel.id, waId: to, name: to, inbound: false,
      lastMessage: `[template] ${body.template_name}`,
    });
    const metaMessageId = meta?.messages?.[0]?.id ?? null;
    const { data: savedMessage, error: messageError } = await admin.from("messages").insert({
      company_id: companyId,
      channel_id: channel.id,
      conversation_id: conversationId,
      contact_id: contactId,
      direction: "outbound",
      message_type: "template",
      content: `[template] ${body.template_name}`,
      sender_type: "agent",
      meta_message_id: metaMessageId,
      status: "sent",
      raw_payload: meta,
    }).select("id").single();
    if (messageError) throw messageError;

    await admin.from("audit_logs").insert({
      company_id: companyId, user_id: user.id, action: "whatsapp_template_sent",
      resource_type: "message", resource_id: savedMessage.id, metadata: { to, template_name: body.template_name, language },
    });
    await admin.from("webhook_events").insert({
      company_id: companyId, channel_id: channel.id, event_type: "template_sent", status: "ok", source: "app",
      payload: { to, template_name: body.template_name, meta_message_id: metaMessageId, response: meta }, processed_at: new Date().toISOString(),
    });

    return json({ ok: true, conversation_id: conversationId, message_id: savedMessage.id, meta_message_id: metaMessageId });
  } catch (e) {
    console.error("whatsapp-send-template error", e);
    return json({ error: (e as Error).message ?? "Erro inesperado" }, 500);
  }
});
