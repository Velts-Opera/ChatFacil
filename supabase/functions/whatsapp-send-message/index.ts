import { corsHeaders, cleanPhone, json } from "../_shared/http.ts";
import { requireUser } from "../_shared/auth.ts";
import {
  getChannelSecret,
  sendWhatsAppText,
  upsertContactAndConversation,
} from "../_shared/whatsapp.ts";
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
    if (!body.channel_id || !body.message?.trim())
      return json({ error: "channel_id e message são obrigatórios." }, 400);
    const { data: channel, error: channelError } = await admin
      .from("channels")
      .select("id, company_id, status, phone_number_id, provider")
      .eq("id", body.channel_id)
      .eq("company_id", companyId)
      .maybeSingle();
    if (channelError) throw channelError;
    if (!channel) return json({ error: "Canal não encontrado." }, 404);
    if (channel.status !== "connected") return json({ error: "Canal não está conectado." }, 400);
    if (channel.provider !== "meta_cloud_api")
      return json(
        { error: "Este endpoint envia somente por canais oficiais da Meta Cloud API." },
        409,
      );
    const secret = await getChannelSecret(admin, channel.id);
    if (!secret?.access_token || !channel.phone_number_id)
      return json({ error: "Credenciais do canal não encontradas." }, 400);
    let to = cleanPhone(body.to ?? "");
    let contactName: string | undefined;
    if (body.conversation_id) {
      const { data: conversation, error } = await admin
        .from("conversations")
        .select("id, contact_id, contacts(phone, wa_id, name)")
        .eq("id", body.conversation_id)
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      if (!conversation) return json({ error: "Conversa não encontrada." }, 404);
      const contact = Array.isArray(conversation.contacts)
        ? conversation.contacts[0]
        : conversation.contacts;
      to = cleanPhone(contact?.wa_id || contact?.phone || to);
      contactName = contact?.name;
    }
    if (!to || to.length < 10)
      return json({ error: "Telefone destino inválido. Use DDI + DDD + número." }, 400);
    const message = body.message.trim();
    const meta = await sendWhatsAppText(
      secret.access_token,
      channel.phone_number_id,
      to,
      message,
      AbortSignal.timeout(10_000),
    );
    if (!meta.ok) {
      const errMsg = meta.json?.error?.message || `Meta API retornou HTTP ${meta.status}`;
      await admin
        .from("webhook_events")
        .insert({
          company_id: companyId,
          channel_id: channel.id,
          event_type: "send_message_failed",
          status: "error",
          source: "app",
          payload: { request: { to }, response: meta.json },
          error_message: errMsg,
          processed_at: new Date().toISOString(),
        });
      return json({ ok: false, error: errMsg }, 200);
    }
    const { contactId, conversationId } = await upsertContactAndConversation(admin, {
      companyId,
      channelId: channel.id,
      waId: to,
      name: contactName ?? to,
      inbound: false,
      lastMessage: message,
    });
    const metaMessageId = meta.json?.messages?.[0]?.id ?? null;
    const { data: savedMessage, error: messageError } = await admin
      .from("messages")
      .insert({
        company_id: companyId,
        channel_id: channel.id,
        conversation_id: conversationId,
        contact_id: contactId,
        direction: "outbound",
        message_type: "text",
        content: message,
        sender_type: "human",
        meta_message_id: metaMessageId,
        status: "sent",
        raw_payload: meta.json,
        ai_generated: false,
      })
      .select("id")
      .single();
    if (messageError) throw messageError;
    const { data: agentSettings } = await admin
      .from("ai_agent_settings")
      .select("human_takeover_minutes")
      .eq("company_id", companyId)
      .maybeSingle();
    const minutes = Math.max(
      5,
      Math.min(10080, Number(agentSettings?.human_takeover_minutes ?? 480)),
    );
    const now = new Date();
    const pauseUntil = new Date(now.getTime() + minutes * 60_000).toISOString();
    await admin
      .from("conversations")
      .update({
        ai_handling: false,
        human_handling: true,
        human_last_replied_at: now.toISOString(),
        ai_paused_until: pauseUntil,
        status: "pendente",
        handoff_reason: "Atendimento assumido por uma pessoa",
        last_message: message,
        last_message_direction: "outbound",
        unread_count: 0,
        last_message_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq("id", conversationId)
      .eq("company_id", companyId);
    await admin
      .from("webhook_events")
      .insert({
        company_id: companyId,
        channel_id: channel.id,
        event_type: "human_reply_sent",
        status: "ok",
        source: "app",
        payload: {
          to,
          meta_message_id: metaMessageId,
          conversation_id: conversationId,
          ai_paused_until: pauseUntil,
        },
        processed_at: now.toISOString(),
      });
    await admin.from("channels").update({ last_sync_at: now.toISOString() }).eq("id", channel.id);
    return json({
      ok: true,
      conversation_id: conversationId,
      message_id: savedMessage.id,
      meta_message_id: metaMessageId,
      ai_paused_until: pauseUntil,
    });
  } catch (e) {
    console.error("whatsapp-send-message error", e);
    const msg = (e as Error).message ?? "Erro inesperado";
    const status =
      msg === "Unauthorized" ||
      msg.includes("Authorization") ||
      msg.includes("Company access disabled")
        ? 401
        : 500;
    return json({ error: msg }, status);
  }
});
