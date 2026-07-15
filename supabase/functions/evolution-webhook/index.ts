// Webhook do gateway WhatsApp QR (Evolution API).
// Autentica pelo token do canal (?token=verify_token). Recebe QR atualizado,
// mudanças de conexão e mensagens; dispara automações e a resposta da Bia.
import { adminClient } from "../_shared/auth.ts";
import { cleanPhone, json, text } from "../_shared/http.ts";
import { upsertContactAndConversation } from "../_shared/whatsapp.ts";
import { generateBiaReply, getAgentSettings } from "../_shared/ai.ts";
import { audioToBase64, fishAudioConfigured, synthesizeSpeech } from "../_shared/fishaudio.ts";
import {
  extractGatewayMessageText,
  fetchInstanceInfo,
  gatewayErrorMessage,
  getGatewayConfig,
  sendGatewayAudio,
  sendGatewayText,
} from "../_shared/gateway.ts";

Deno.serve(async (req) => {
  if (req.method === "GET") return text("ok", 200);
  if (req.method !== "POST") return text("Method Not Allowed", 405);

  const admin = adminClient();
  const url = new URL(req.url);
  const token = url.searchParams.get("token");

  let payload: any = {};
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const instanceName: string | null = payload?.instance ?? null;

  // Localiza o canal pelo token e, quando presente, valida a instância.
  let channelQuery = admin.from("channels").select("*").eq("type", "whatsapp").eq("provider", "evolution");
  if (token) channelQuery = channelQuery.eq("verify_token", token);
  else if (instanceName) channelQuery = channelQuery.eq("instance_name", instanceName);
  else return text("Forbidden", 403);

  const { data: channel } = await channelQuery.limit(1).maybeSingle();
  if (!channel) return text("Forbidden", 403);
  if (instanceName && channel.instance_name && instanceName !== channel.instance_name) return text("Forbidden", 403);

  const event = String(payload?.event ?? "unknown").toLowerCase().replace(/_/g, ".");
  const data = payload?.data ?? {};
  const now = new Date().toISOString();

  try {
    if (event === "qrcode.updated") {
      const base64 = data?.qrcode?.base64 ?? data?.base64 ?? null;
      const pairingCode = data?.qrcode?.pairingCode ?? data?.pairingCode ?? null;
      if (base64 || pairingCode) {
        await admin.from("channels").update({
          status: "connecting",
          qr_code: base64,
          qr_pairing_code: pairingCode,
          qr_updated_at: now,
          last_sync_at: now,
        }).eq("id", channel.id);
      }
      await logEvent(admin, channel, "qrcode_updated", "ok", { hasQr: Boolean(base64) });
    } else if (event === "connection.update") {
      const state = String(data?.state ?? "").toLowerCase();
      if (state === "open") {
        let phoneNumber = channel.phone_number;
        let profileName = channel.verified_name;
        const cfg = await getGatewayConfig(admin, channel.id, channel.company_id);
        if (cfg && channel.instance_name) {
          const info = await fetchInstanceInfo(cfg, channel.instance_name);
          phoneNumber = info.number ?? phoneNumber;
          profileName = info.profileName ?? profileName;
        }
        await admin.from("channels").update({
          status: "connected",
          connected_at: channel.connected_at ?? now,
          phone_number: phoneNumber,
          verified_name: profileName,
          qr_code: null,
          qr_pairing_code: null,
          last_error: null,
          last_error_code: null,
          last_sync_at: now,
        }).eq("id", channel.id);
      } else if (state === "close") {
        await admin.from("channels").update({
          status: channel.status === "connected" ? "disconnected" : channel.status,
          qr_code: null,
          qr_pairing_code: null,
          last_sync_at: now,
        }).eq("id", channel.id);
      }
      await logEvent(admin, channel, `connection_${state || "update"}`, "ok", data);
    } else if (event === "messages.upsert") {
      const items: any[] = Array.isArray(data) ? data : Array.isArray(data?.messages) ? data.messages : [data];
      for (const item of items) {
        await processGatewayMessage(admin, channel, item);
      }
      await admin.from("channels").update({ last_sync_at: now }).eq("id", channel.id);
    } else {
      await logEvent(admin, channel, event.replace(/\./g, "_"), "ignored", summarize(data));
    }
  } catch (e) {
    console.error("evolution-webhook processing error", e);
    await logEvent(admin, channel, "webhook_processing_error", "error", summarize(payload), (e as Error).message);
  }

  return text("ok", 200);
});

function summarize(value: any) {
  try {
    const s = JSON.stringify(value);
    return s.length > 4000 ? { truncated: s.slice(0, 4000) } : value;
  } catch {
    return {};
  }
}

async function logEvent(admin: any, channel: any, eventType: string, status: string, payload: unknown, errorMessage?: string) {
  await admin.from("webhook_events").insert({
    company_id: channel.company_id,
    channel_id: channel.id,
    event_type: eventType,
    status,
    source: "evolution",
    payload,
    error_message: errorMessage ?? null,
    processed_at: new Date().toISOString(),
  });
}

async function processGatewayMessage(admin: any, channel: any, item: any) {
  const key = item?.key ?? {};
  const remoteJid: string = key?.remoteJid ?? "";
  if (!remoteJid) return;
  // Grupos e broadcasts ficam fora do atendimento automático.
  if (remoteJid.endsWith("@g.us") || remoteJid.includes("broadcast")) return;

  const waId = cleanPhone(remoteJid.split("@")[0]);
  if (!waId) return;

  const messageId: string | null = key?.id ?? null;
  const fromMe: boolean = Boolean(key?.fromMe);
  const pushName: string = item?.pushName ?? waId;
  const content = extractGatewayMessageText(item?.message) || `[${item?.messageType ?? "mensagem"}]`;

  // Idempotência por id do WhatsApp.
  if (messageId) {
    const { data: existing } = await admin.from("messages").select("id").eq("meta_message_id", messageId).maybeSingle();
    if (existing?.id) return;
  }

  const { contactId, conversationId } = await upsertContactAndConversation(admin, {
    companyId: channel.company_id,
    channelId: channel.id,
    waId,
    name: fromMe ? undefined : pushName,
    inbound: !fromMe,
    lastMessage: content,
  });

  const { data: saved, error: insertError } = await admin.from("messages").insert({
    company_id: channel.company_id,
    channel_id: channel.id,
    conversation_id: conversationId,
    contact_id: contactId,
    direction: fromMe ? "outbound" : "inbound",
    message_type: item?.messageType ?? "text",
    content,
    sender_type: fromMe ? "agent" : "contact",
    meta_message_id: messageId,
    status: fromMe ? "sent" : "received",
    raw_payload: summarize(item),
  }).select("id").single();
  if (insertError) throw insertError;

  await logEvent(admin, channel, fromMe ? "message_synced_from_phone" : "message_received", "ok", { waId, messageId });

  if (!fromMe) {
    await tryAutomationOrBiaReply(admin, channel, conversationId, contactId, waId, saved.id, content);
  }
}

async function tryAutomationOrBiaReply(
  admin: any,
  channel: any,
  conversationId: string,
  contactId: string,
  waId: string,
  inboundMessageId: string,
  userMessage: string,
) {
  if (!channel.ai_enabled && !channel.auto_reply_enabled) return;
  if (!userMessage || userMessage.startsWith("[")) return;

  // 1) Regras determinísticas por palavra-chave têm prioridade sobre a Bia.
  const { data: rules } = await admin
    .from("automation_rules")
    .select("*")
    .eq("company_id", channel.company_id)
    .eq("is_active", true)
    .or(`channel_id.is.null,channel_id.eq.${channel.id}`)
    .limit(20);

  const lower = userMessage.toLowerCase();
  const matchingRule = (rules ?? []).find((r: any) => r.trigger_type === "keyword" && r.keyword && lower.includes(String(r.keyword).toLowerCase()));
  if (matchingRule?.response) {
    await sendBiaReply(admin, channel, conversationId, contactId, waId, inboundMessageId, matchingRule.response, "automation_rule");
    if (matchingRule.assign_to_human) {
      await admin.from("conversations").update({ ai_handling: false, status: "pendente", handoff_reason: "Regra solicitou humano" }).eq("id", conversationId);
    }
    return;
  }

  // 2) Agente IA exclusivo da empresa: ativação e palavras de handoff.
  const agentSettings = await getAgentSettings(admin, channel.company_id);

  if (agentSettings && !agentSettings.is_enabled) {
    await admin.from("conversations").update({ ai_handling: false, status: "pendente", handoff_reason: "Agente IA desativado para esta empresa" }).eq("id", conversationId);
    return;
  }

  const handoffHit = (agentSettings?.handoff_keywords ?? []).find((k: string) => k && lower.includes(k.toLowerCase()));
  if (handoffHit) {
    await admin.from("conversations").update({ ai_handling: false, status: "pendente", handoff_reason: `Cliente pediu atendimento humano ("${handoffHit}")` }).eq("id", conversationId);
    return;
  }

  if (!channel.auto_reply_enabled) {
    await admin.from("conversations").update({ ai_handling: false, status: "pendente", handoff_reason: "Resposta automática desativada" }).eq("id", conversationId);
    return;
  }

  const reply = await generateBiaReply(admin, channel, conversationId, userMessage, inboundMessageId, agentSettings);
  if (!reply) {
    await admin.from("conversations").update({ ai_handling: false, status: "pendente", handoff_reason: "Bia não respondeu com segurança" }).eq("id", conversationId);
    return;
  }

  await sendBiaReply(admin, channel, conversationId, contactId, waId, inboundMessageId, reply, "ai");
}

async function sendBiaReply(
  admin: any,
  channel: any,
  conversationId: string,
  contactId: string,
  waId: string,
  inboundMessageId: string,
  reply: string,
  source: "ai" | "automation_rule",
) {
  const cfg = await getGatewayConfig(admin, channel.id, channel.company_id);
  if (!cfg || !channel.instance_name) return;

  // Voz feminina da Bia: quando ligada no canal, a resposta vai como áudio gerado
  // pela Fish Audio. Qualquer falha na voz cai para texto normal.
  let sent: { ok: boolean; status: number; json: any; messageId: string | null } | null = null;
  let sentAsVoice = false;
  if (channel.voice_reply_enabled && fishAudioConfigured()) {
    const voice = await trySendVoiceReply(admin, channel, cfg, waId, reply);
    if (voice) {
      sent = voice;
      sentAsVoice = true;
    }
  }
  if (!sent) {
    sent = await sendGatewayText(cfg, channel.instance_name, waId, reply);
  }
  const now = new Date().toISOString();

  if (!sent.ok) {
    const errMsg = gatewayErrorMessage(sent, "Falha ao enviar resposta pelo gateway.");
    await logEvent(admin, channel, `${source}_reply_failed`, "error", { to: waId, response: sent.json }, errMsg);
    await admin.from("conversations").update({ ai_handling: false, status: "pendente", handoff_reason: "Falha ao enviar resposta automática" }).eq("id", conversationId);
    return;
  }

  const { data: outbound } = await admin.from("messages").insert({
    company_id: channel.company_id,
    channel_id: channel.id,
    conversation_id: conversationId,
    contact_id: contactId,
    direction: "outbound",
    message_type: sentAsVoice ? "audio" : "text",
    content: reply,
    sender_type: source === "ai" ? "ai" : "agent",
    meta_message_id: sent.messageId,
    status: "sent",
    raw_payload: summarize(sent.json),
    ai_generated: source === "ai",
  }).select("id").single();

  await admin.from("ai_interactions")
    .update({ outbound_message_id: outbound?.id ?? null })
    .eq("inbound_message_id", inboundMessageId);

  await admin.from("conversations").update({
    ai_handling: source === "ai",
    status: "aberta",
    last_message: reply,
    last_message_direction: "outbound",
    unread_count: 0,
    ai_last_replied_at: source === "ai" ? now : null,
    last_message_at: now,
    updated_at: now,
  }).eq("id", conversationId);

  await logEvent(admin, channel, `${source}_reply_sent`, "ok", { to: waId, message_id: sent.messageId, voice: sentAsVoice });
}

async function trySendVoiceReply(admin: any, channel: any, cfg: any, waId: string, reply: string) {
  try {
    const tts = await synthesizeSpeech(reply, channel.voice_reference_id);
    if (!tts.ok) throw new Error(tts.error);

    const sent = await sendGatewayAudio(cfg, channel.instance_name, waId, audioToBase64(tts.audio));
    if (!sent.ok) throw new Error(gatewayErrorMessage(sent, "Falha ao enviar áudio pelo gateway."));

    await logEvent(admin, channel, "voice_reply_sent", "ok", { to: waId, bytes: tts.audio.byteLength });
    return sent;
  } catch (e) {
    await logEvent(admin, channel, "voice_reply_failed_fallback_text", "error", { to: waId }, (e as Error).message);
    return null;
  }
}
