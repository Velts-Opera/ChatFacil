import { corsHeaders, cleanPhone, json } from "../_shared/http.ts";
import { requireUser } from "../_shared/auth.ts";
import { getChannelSecret, sendWhatsAppText, upsertContactAndConversation } from "../_shared/whatsapp.ts";

const BRIDGE_URL = Deno.env.get("BRIDGE_URL") ?? "";
const BRIDGE_SECRET = Deno.env.get("BRIDGE_SECRET") ?? "";

interface Body {
  channel_id: string;
  to?: string;
  message: string;
  conversation_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { companyId, admin } = await requireUser(req);
    const body = (await req.json().catch(() => ({}))) as Body;

    if (!body.channel_id || !body.message?.trim()) {
      return json({ error: "channel_id e message são obrigatórios." }, 400);
    }

    const { data: channel, error: channelError } = await admin
      .from("channels")
      .select("id, company_id, status, phone_number_id, provider")
      .eq("id", body.channel_id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (channelError) throw channelError;
    if (!channel) return json({ error: "Canal não encontrado." }, 404);
    if (channel.status !== "connected") return json({ error: "Canal não está conectado." }, 400);

    // ── Roteamento por provider ──────────────────────────────────────────────
    if (channel.provider === "qr_code") {
      if (!BRIDGE_URL || !BRIDGE_SECRET) {
        return json({ error: "Bridge Railway não configurado no servidor." }, 503);
      }
      let toQr = cleanPhone(body.to ?? "");
      if (body.conversation_id) {
        const { data: conv } = await admin
          .from("conversations")
          .select("contacts(phone, wa_id)")
          .eq("id", body.conversation_id)
          .eq("company_id", companyId)
          .maybeSingle();
        const c = Array.isArray(conv?.contacts) ? conv.contacts[0] : conv?.contacts;
        toQr = cleanPhone(c?.wa_id || c?.phone || toQr);
      }
      if (!toQr || toQr.length < 10) return json({ error: "Telefone destino inválido." }, 400);

      const bridgeRes = await fetch(`${BRIDGE_URL}/session/${channel.id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-bridge-secret": BRIDGE_SECRET },
        body: JSON.stringify({ to: toQr, message: body.message.trim() }),
      });
      const bridgeData = await bridgeRes.json().catch(() => ({}));
      if (!bridgeRes.ok) {
        return json({ ok: false, error: bridgeData?.error ?? `Bridge retornou HTTP ${bridgeRes.status}` }, 200);
      }

      const { contactId, conversationId } = await upsertContactAndConversation(admin, {
        companyId,
        channelId: channel.id,
        waId: toQr,
        name: toQr,
        inbound: false,
        lastMessage: body.message.trim(),
      });

      const { data: savedMsg, error: msgErr } = await admin.from("messages").insert({
        company_id: companyId,
        channel_id: channel.id,
        conversation_id: conversationId,
        contact_id: contactId,
        direction: "outbound",
        message_type: "text",
        content: body.message.trim(),
        sender_type: "agent",
        status: "sent",
      }).select("id").single();
      if (msgErr) throw msgErr;

      return json({ ok: true, conversation_id: conversationId, message_id: savedMsg.id });
    }

    const secret = await getChannelSecret(admin, channel.id);
    if (!secret?.access_token || !channel.phone_number_id) {
      return json({ error: "Credenciais do canal não encontradas." }, 400);
    }

    let to = cleanPhone(body.to ?? "");
    let contactName: string | undefined;
    let conversationIdFromBody = body.conversation_id;

    if (conversationIdFromBody) {
      const { data: conversation, error } = await admin
        .from("conversations")
        .select("id, contact_id, contacts(phone, wa_id, name)")
        .eq("id", conversationIdFromBody)
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      if (!conversation) return json({ error: "Conversa não encontrada." }, 404);
      const contact = Array.isArray(conversation.contacts) ? conversation.contacts[0] : conversation.contacts;
      to = cleanPhone(contact?.wa_id || contact?.phone || to);
      contactName = contact?.name;
    }

    if (!to || to.length < 10) return json({ error: "Telefone destino inválido. Use DDI + DDD + número." }, 400);

    const meta = await sendWhatsAppText(secret.access_token, channel.phone_number_id, to, body.message.trim());
    if (!meta.ok) {
      const errMsg = meta.json?.error?.message || `Meta API retornou HTTP ${meta.status}`;
      await admin.from("webhook_events").insert({
        company_id: companyId,
        channel_id: channel.id,
        event_type: "send_message_failed",
        status: "error",
        source: "app",
        payload: { request: { to, message: body.message }, response: meta.json },
        error_message: errMsg,
        processed_at: new Date().toISOString(),
      });
      return json({ ok: false, error: errMsg, meta: meta.json }, 200);
    }

    const { contactId, conversationId } = await upsertContactAndConversation(admin, {
      companyId,
      channelId: channel.id,
      waId: to,
      name: contactName ?? to,
      inbound: false,
      lastMessage: body.message.trim(),
    });

    const metaMessageId = meta.json?.messages?.[0]?.id ?? null;
    const { data: savedMessage, error: messageError } = await admin.from("messages").insert({
      company_id: companyId,
      channel_id: channel.id,
      conversation_id: conversationId,
      contact_id: contactId,
      direction: "outbound",
      message_type: "text",
      content: body.message.trim(),
      sender_type: "agent",
      meta_message_id: metaMessageId,
      status: "sent",
      raw_payload: meta.json,
    }).select("id").single();
    if (messageError) throw messageError;

    const now = new Date().toISOString();
    await admin.from("webhook_events").insert({
      company_id: companyId,
      channel_id: channel.id,
      event_type: "message_sent",
      status: "ok",
      source: "app",
      payload: { to, meta_message_id: metaMessageId, response: meta.json },
      processed_at: now,
    });
    await admin.from("channels").update({ last_sync_at: now }).eq("id", channel.id);

    return json({ ok: true, conversation_id: conversationId, message_id: savedMessage.id, meta_message_id: metaMessageId });
  } catch (e) {
    console.error("whatsapp-send-message error", e);
    const msg = (e as Error).message ?? "Erro inesperado";
    const status = msg === "Unauthorized" || msg.includes("Authorization") ? 401 : 500;
    return json({ error: msg }, status);
  }
});
