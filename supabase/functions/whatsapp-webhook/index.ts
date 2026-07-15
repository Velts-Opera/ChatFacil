import { adminClient } from "../_shared/auth.ts";
import { constantTimeEqual, json, sha256HmacHex, text } from "../_shared/http.ts";
import {
  extractMessageText,
  getChannelSecret,
  sendWhatsAppText,
  upsertContactAndConversation,
} from "../_shared/whatsapp.ts";

Deno.serve(async (req) => {
  const admin = adminClient();
  const url = new URL(req.url);

  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode !== "subscribe" || !token || !challenge) return text("Bad Request", 400);

    const { data: channel, error } = await admin
      .from("channels")
      .select("id, status")
      .eq("type", "whatsapp")
      .eq("verify_token", token)
      .limit(1)
      .maybeSingle();

    if (error) return text("Database error", 500);
    if (!channel) return text("Forbidden", 403);

    await admin.from("webhook_events").insert({
      channel_id: channel.id,
      event_type: "webhook_verified",
      status: "ok",
      source: "meta",
      payload: { mode },
      processed_at: new Date().toISOString(),
    });

    return text(challenge, 200);
  }

  if (req.method !== "POST") return text("Method Not Allowed", 405);

  const rawBody = await req.text();
  let payload: any = {};
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  try {
    const firstPhoneNumberId = findFirstPhoneNumberId(payload);
    let firstChannel: any = null;
    let firstSecret: any = null;

    if (firstPhoneNumberId) {
      const { data } = await admin
        .from("channels")
        .select("*")
        .eq("type", "whatsapp")
        .eq("phone_number_id", firstPhoneNumberId)
        .maybeSingle();
      firstChannel = data;
      if (firstChannel) firstSecret = await getChannelSecret(admin, firstChannel.id);
    }

    const signature = req.headers.get("x-hub-signature-256");
    if (firstSecret?.app_secret) {
      if (!signature?.startsWith("sha256=")) {
        await logWebhook(admin, firstChannel, "signature_missing", "error", payload, "Header x-hub-signature-256 ausente.");
        return text("Forbidden", 403);
      }
      const expected = `sha256=${await sha256HmacHex(firstSecret.app_secret, rawBody)}`;
      if (!constantTimeEqual(signature, expected)) {
        await logWebhook(admin, firstChannel, "signature_invalid", "error", payload, "Assinatura HMAC inválida.");
        return text("Forbidden", 403);
      }
    }

    const entries = Array.isArray(payload?.entry) ? payload.entry : [];
    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change?.value ?? {};
        const phoneNumberId: string | undefined = value?.metadata?.phone_number_id;

        const { data: channel } = phoneNumberId
          ? await admin.from("channels").select("*").eq("type", "whatsapp").eq("phone_number_id", phoneNumberId).maybeSingle()
          : { data: null };

        await logWebhook(admin, channel, change?.field ?? "unknown", "received", value);
        if (!channel) continue;

        const messages = Array.isArray(value?.messages) ? value.messages : [];
        const contacts = Array.isArray(value?.contacts) ? value.contacts : [];

        for (const msg of messages) {
          await processIncomingMessage(admin, channel, msg, contacts, value);
        }

        const statuses = Array.isArray(value?.statuses) ? value.statuses : [];
        for (const st of statuses) {
          await processStatus(admin, channel, st);
        }

        await admin.from("channels").update({ last_sync_at: new Date().toISOString() }).eq("id", channel.id);
      }
    }
  } catch (e) {
    console.error("whatsapp-webhook processing error", e);
    await admin.from("webhook_events").insert({
      event_type: "webhook_processing_error",
      status: "error",
      source: "app",
      payload,
      error_message: (e as Error).message,
      processed_at: new Date().toISOString(),
    });
  }

  // Meta expects a fast 200. Processing errors are logged internally.
  return text("ok", 200);
});

function findFirstPhoneNumberId(payload: any): string | null {
  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const id = change?.value?.metadata?.phone_number_id;
      if (id) return id;
    }
  }
  return null;
}

async function logWebhook(admin: any, channel: any, eventType: string, status: string, payload: unknown, errorMessage?: string) {
  await admin.from("webhook_events").insert({
    company_id: channel?.company_id ?? null,
    channel_id: channel?.id ?? null,
    event_type: eventType,
    status,
    source: "meta",
    payload,
    error_message: errorMessage ?? null,
    processed_at: new Date().toISOString(),
  });
}

async function processIncomingMessage(admin: any, channel: any, msg: any, contacts: any[], rawValue: any) {
  const waId: string = msg?.from ?? contacts?.[0]?.wa_id ?? "";
  if (!waId) return;

  const contactMeta = contacts.find((c) => c.wa_id === waId) ?? contacts?.[0] ?? {};
  const profileName: string = contactMeta?.profile?.name ?? waId;
  const type = msg?.type ?? "text";
  const content = extractMessageText(msg);

  const { contactId, conversationId } = await upsertContactAndConversation(admin, {
    companyId: channel.company_id,
    channelId: channel.id,
    waId,
    name: profileName,
    inbound: true,
    lastMessage: content,
  });

  if (msg?.id) {
    const { data: existing } = await admin
      .from("messages")
      .select("id")
      .eq("meta_message_id", msg.id)
      .maybeSingle();
    if (existing?.id) {
      await admin.from("webhook_events").insert({
        company_id: channel.company_id,
        channel_id: channel.id,
        event_type: "duplicate_inbound_message_ignored",
        status: "ok",
        source: "app",
        payload: { meta_message_id: msg.id },
        processed_at: new Date().toISOString(),
      });
      return;
    }
  }

  const { data: inbound, error: inboundError } = await admin.from("messages").insert({
    company_id: channel.company_id,
    channel_id: channel.id,
    conversation_id: conversationId,
    contact_id: contactId,
    direction: "inbound",
    message_type: type,
    content,
    sender_type: "contact",
    meta_message_id: msg?.id ?? null,
    status: "received",
    raw_payload: msg,
  }).select("id").single();
  if (inboundError) throw inboundError;

  await tryAutomationOrAiReply(admin, channel, conversationId, contactId, waId, inbound.id, content, rawValue);
}

async function processStatus(admin: any, channel: any, st: any) {
  const metaId = st?.id;
  if (!metaId) return;
  const status = st?.status ?? null;
  const timestampSeconds = st?.timestamp ? Number(st.timestamp) : null;
  const date = timestampSeconds ? new Date(timestampSeconds * 1000).toISOString() : new Date().toISOString();

  const patch: Record<string, unknown> = { status, raw_payload: st };
  if (status === "delivered") patch.delivered_at = date;
  if (status === "read") patch.read_at = date;
  if (status === "failed") patch.error_message = st?.errors?.[0]?.message ?? "Falha informada pela Meta";

  await admin.from("messages").update(patch).eq("meta_message_id", metaId);
  await admin.from("webhook_events").insert({
    company_id: channel.company_id,
    channel_id: channel.id,
    event_type: `message_${status ?? "status"}`,
    status: status ?? "received",
    source: "meta",
    payload: st,
    error_message: status === "failed" ? st?.errors?.[0]?.message ?? null : null,
    processed_at: new Date().toISOString(),
  });
}

async function tryAutomationOrAiReply(
  admin: any,
  channel: any,
  conversationId: string,
  contactId: string,
  waId: string,
  inboundMessageId: string,
  userMessage: string,
  rawValue: any,
) {
  if (!channel.ai_enabled && !channel.auto_reply_enabled) return;
  if (!userMessage || userMessage.startsWith("[")) return;

  // 1) Deterministic keyword automation has priority over LLM.
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
    await sendBotReply(admin, channel, conversationId, contactId, waId, inboundMessageId, matchingRule.response, "automation_rule", rawValue);
    if (matchingRule.assign_to_human) {
      await admin.from("conversations").update({ ai_handling: false, status: "pendente", handoff_reason: "Regra solicitou humano" }).eq("id", conversationId);
    }
    return;
  }

  if (!channel.auto_reply_enabled) {
    await admin.from("conversations").update({ ai_handling: false, status: "pendente", handoff_reason: "IA desativada para resposta automática" }).eq("id", conversationId);
    return;
  }

  // Agente IA exclusivo da empresa (prompt, ativação e handoff)
  const { data: agentSettings } = await admin
    .from("ai_agent_settings")
    .select("is_enabled, agent_name, system_prompt, temperature, max_tokens, handoff_keywords")
    .eq("company_id", channel.company_id)
    .maybeSingle();

  if (agentSettings && !agentSettings.is_enabled) {
    await admin.from("conversations").update({ ai_handling: false, status: "pendente", handoff_reason: "Agente IA desativado para esta empresa" }).eq("id", conversationId);
    return;
  }

  const handoffHit = (agentSettings?.handoff_keywords ?? []).find((k: string) => k && lower.includes(k.toLowerCase()));
  if (handoffHit) {
    await admin.from("conversations").update({ ai_handling: false, status: "pendente", handoff_reason: `Cliente pediu atendimento humano ("${handoffHit}")` }).eq("id", conversationId);
    return;
  }

  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    await admin.from("conversations").update({ ai_handling: false, status: "pendente", handoff_reason: "OPENAI_API_KEY ausente" }).eq("id", conversationId);
    return;
  }

  const reply = await generateAiReply(admin, channel, conversationId, userMessage, apiKey, inboundMessageId, agentSettings);
  if (!reply) {
    await admin.from("conversations").update({ ai_handling: false, status: "pendente", handoff_reason: "IA não respondeu com segurança" }).eq("id", conversationId);
    return;
  }

  await sendBotReply(admin, channel, conversationId, contactId, waId, inboundMessageId, reply, "ai", rawValue);
}

async function generateAiReply(admin: any, channel: any, conversationId: string, userMessage: string, apiKey: string, inboundMessageId: string, agentSettings: any = null) {
  const [{ data: company }, { data: quickReplies }, { data: knowledge }, { data: history }] = await Promise.all([
    admin.from("companies").select("name, segment, business_hours, services_description, communication_tone").eq("id", channel.company_id).maybeSingle(),
    admin.from("quick_replies").select("title, message, category").eq("company_id", channel.company_id).limit(20),
    admin.from("ai_knowledge_items").select("title, content").eq("company_id", channel.company_id).eq("is_active", true).limit(30),
    admin.from("messages").select("direction, content, created_at").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(8),
  ]);

  const agentName = agentSettings?.agent_name?.trim();
  const customPrompt = agentSettings?.system_prompt?.trim();

  const system = [
    agentName
      ? `Você é "${agentName}", a IA de atendimento da empresa ${company?.name ?? "do cliente"}.`
      : `Você é a IA de atendimento da empresa ${company?.name ?? "do cliente"}.`,
    ...(customPrompt ? [`\nInstruções exclusivas desta empresa (siga com prioridade máxima):\n${customPrompt}\n`] : []),
    "Responda em português do Brasil, de forma objetiva, educada e comercial.",
    "Use somente as informações cadastradas abaixo. Não invente preço, prazo, endereço ou política.",
    "Se não souber responder, diga: 'Vou chamar uma pessoa da equipe para confirmar isso com você.'",
    `Tom: ${company?.communication_tone ?? "profissional"}.`,
    `Horário informado: ${company?.business_hours ?? channel.business_hours ?? "não cadastrado"}.`,
    `Serviços cadastrados: ${company?.services_description ?? "não cadastrado"}.`,
    `Mensagem de saudação: ${channel.greeting_message ?? ""}`,
    "\nBase de conhecimento:",
    ...(knowledge ?? []).map((k: any) => `- ${k.title}: ${k.content}`),
    "\nRespostas rápidas:",
    ...(quickReplies ?? []).map((q: any) => `- ${q.title}: ${q.message}`),
  ].join("\n");

  const messages = [
    { role: "system", content: system },
    ...((history ?? []).reverse().map((m: any) => ({ role: m.direction === "inbound" ? "user" : "assistant", content: m.content }))),
    { role: "user", content: userMessage },
  ];

  const model = Deno.env.get("OPENAI_MODEL") ?? "gpt-4o-mini";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: agentSettings?.temperature ?? 0.2,
      max_tokens: agentSettings?.max_tokens ?? 320,
      messages,
    }),
  });

  const out = await res.json().catch(() => ({}));
  if (!res.ok) {
    await admin.from("ai_interactions").insert({
      company_id: channel.company_id,
      channel_id: channel.id,
      conversation_id: conversationId,
      inbound_message_id: inboundMessageId,
      status: "error",
      model,
      input: userMessage,
      error_message: out?.error?.message ?? `OpenAI HTTP ${res.status}`,
    });
    return null;
  }

  const reply = String(out?.choices?.[0]?.message?.content ?? "").trim();
  await admin.from("ai_interactions").insert({
    company_id: channel.company_id,
    channel_id: channel.id,
    conversation_id: conversationId,
    inbound_message_id: inboundMessageId,
    status: reply ? "completed" : "empty",
    model,
    prompt_tokens: out?.usage?.prompt_tokens ?? null,
    completion_tokens: out?.usage?.completion_tokens ?? null,
    input: userMessage,
    output: reply,
  });

  return reply || null;
}

async function sendBotReply(
  admin: any,
  channel: any,
  conversationId: string,
  contactId: string,
  waId: string,
  inboundMessageId: string,
  reply: string,
  source: "ai" | "automation_rule",
  rawValue: any,
) {
  const secret = await getChannelSecret(admin, channel.id);
  if (!secret?.access_token || !channel.phone_number_id) return;

  const meta = await sendWhatsAppText(secret.access_token, channel.phone_number_id, waId, reply);
  const now = new Date().toISOString();

  if (!meta.ok) {
    await admin.from("webhook_events").insert({
      company_id: channel.company_id,
      channel_id: channel.id,
      event_type: `${source}_reply_failed`,
      status: "error",
      source: "app",
      payload: { request: { to: waId, reply, rawValue }, response: meta.json },
      error_message: meta.json?.error?.message ?? `Meta HTTP ${meta.status}`,
      processed_at: now,
    });
    await admin.from("conversations").update({ ai_handling: false, status: "pendente", handoff_reason: "Falha ao enviar resposta automática" }).eq("id", conversationId);
    return;
  }

  const { data: outbound } = await admin.from("messages").insert({
    company_id: channel.company_id,
    channel_id: channel.id,
    conversation_id: conversationId,
    contact_id: contactId,
    direction: "outbound",
    message_type: "text",
    content: reply,
    sender_type: source === "ai" ? "ai" : "agent",
    meta_message_id: meta.json?.messages?.[0]?.id ?? null,
    status: "sent",
    raw_payload: meta.json,
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

  await admin.from("webhook_events").insert({
    company_id: channel.company_id,
    channel_id: channel.id,
    event_type: `${source}_reply_sent`,
    status: "ok",
    source: "app",
    payload: { to: waId, meta: meta.json },
    processed_at: now,
  });
}
