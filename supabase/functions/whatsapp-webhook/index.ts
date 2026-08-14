import { adminClient } from "../_shared/auth.ts";
import {
  AI_REQUEST_TIMEOUT_MS,
  isAiAutoReplyEnabled,
  parseRetryAfterMs,
  resolveAiProviderConfig,
  type AiProviderConfig,
} from "../_shared/ai-provider.ts";
import { constantTimeEqual, json, text } from "../_shared/http.ts";
import {
  extractPhoneNumberIds,
  validateMetaWebhookSignature,
} from "../_shared/meta-webhook-auth.ts";
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

    const appLevelToken = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN");
    if (appLevelToken && constantTimeEqual(token, appLevelToken)) return text(challenge, 200);

    const { data: channel, error } = await admin
      .from("channels")
      .select("id")
      .eq("type", "whatsapp")
      .eq("verify_token", token)
      .limit(1)
      .maybeSingle();
    if (error) return text("Database error", 500);
    if (!channel) return text("Forbidden", 403);
    return text(challenge, 200);
  }

  if (req.method !== "POST") return text("Method Not Allowed", 405);

  const rawBody = await req.text();
  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  try {
    const phoneNumberIds = extractPhoneNumberIds(payload);
    const { data: channels, error: channelError } = phoneNumberIds.length
      ? await admin
          .from("channels")
          .select("*")
          .eq("type", "whatsapp")
          .in("phone_number_id", phoneNumberIds)
      : { data: [], error: null };
    if (channelError) throw channelError;

    const knownChannels = channels ?? [];
    const firstChannel = knownChannels[0] ?? null;
    const channelSecrets = await Promise.all(
      knownChannels.map(
        async (channel: any) => (await getChannelSecret(admin, channel.id))?.app_secret ?? null,
      ),
    );
    const signatureResult = await validateMetaWebhookSignature({
      rawBody,
      signature: req.headers.get("x-hub-signature-256"),
      candidateSecrets: [Deno.env.get("META_APP_SECRET"), ...channelSecrets],
    });
    if (!signatureResult.ok) {
      const eventType =
        signatureResult.reason === "invalid_signature" ? "signature_invalid" : "signature_missing";
      await logWebhook(
        admin,
        firstChannel,
        eventType,
        "error",
        { phone_number_ids: phoneNumberIds },
        `Assinatura Meta recusada: ${signatureResult.reason}.`,
      );
      return text("Forbidden", 403);
    }

    const processing = processWebhookPayload(admin, payload);
    const edgeRuntime = (
      globalThis as typeof globalThis & {
        EdgeRuntime?: { waitUntil(promise: Promise<unknown>): void };
      }
    ).EdgeRuntime;
    if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(processing);
    else await processing;
  } catch (error) {
    console.error("whatsapp-webhook processing error", error);
    await admin.from("webhook_events").insert({
      event_type: "webhook_processing_error",
      status: "error",
      source: "app",
      payload: { object: payload?.object ?? null },
      error_message: error instanceof Error ? error.message : String(error),
      processed_at: new Date().toISOString(),
    });
  }

  return text("ok", 200);
});

async function logWebhook(
  admin: any,
  channel: any,
  eventType: string,
  status: string,
  payload: unknown,
  errorMessage?: string,
  source = "meta",
) {
  await admin.from("webhook_events").insert({
    company_id: channel?.company_id ?? null,
    channel_id: channel?.id ?? null,
    event_type: eventType,
    status,
    source,
    payload,
    error_message: errorMessage ?? null,
    processed_at: new Date().toISOString(),
  });
}

async function processWebhookPayload(admin: any, payload: any) {
  try {
    for (const entry of Array.isArray(payload?.entry) ? payload.entry : []) {
      for (const change of Array.isArray(entry?.changes) ? entry.changes : []) {
        const value = change?.value ?? {};
        const field = String(change?.field ?? "unknown");
        const phoneNumberId = value?.metadata?.phone_number_id
          ? String(value.metadata.phone_number_id)
          : null;
        const { data: channel } = phoneNumberId
          ? await admin
              .from("channels")
              .select("*")
              .eq("type", "whatsapp")
              .eq("phone_number_id", phoneNumberId)
              .maybeSingle()
          : { data: null };

        await logWebhook(admin, channel, field, "received", value);
        if (!channel) continue;

        if (field === "smb_message_echoes") {
          const echoes = [
            ...(Array.isArray(value?.message_echoes) ? value.message_echoes : []),
            ...(Array.isArray(value?.echoes) ? value.echoes : []),
            ...(Array.isArray(value?.messages) ? value.messages : []),
          ];
          for (const echo of echoes) await processHumanAppEcho(admin, channel, echo, value);
        } else if (field === "smb_app_state_sync") {
          const now = new Date().toISOString();
          await admin
            .from("channels")
            .update({
              connection_mode: "coexistence",
              coexistence_active: true,
              coexistence_last_sync_at: now,
              last_sync_at: now,
            })
            .eq("id", channel.id);
        } else if (field === "history") {
          const now = new Date().toISOString();
          await admin
            .from("channels")
            .update({
              connection_mode: "coexistence",
              coexistence_active: true,
              coexistence_last_sync_at: now,
              last_sync_at: now,
            })
            .eq("id", channel.id);
        } else {
          const messages = Array.isArray(value?.messages) ? value.messages : [];
          const contacts = Array.isArray(value?.contacts) ? value.contacts : [];
          for (const msg of messages)
            await processIncomingMessage(admin, channel, msg, contacts, value);

          const statuses = Array.isArray(value?.statuses) ? value.statuses : [];
          for (const status of statuses) await processStatus(admin, channel, status);
        }

        await admin
          .from("channels")
          .update({ last_sync_at: new Date().toISOString() })
          .eq("id", channel.id);
      }
    }
  } catch (error) {
    console.error("whatsapp-webhook background processing error", error);
    await admin.from("webhook_events").insert({
      event_type: "webhook_processing_error",
      status: "error",
      source: "app",
      payload: { object: payload?.object ?? null },
      error_message: error instanceof Error ? error.message : String(error),
      processed_at: new Date().toISOString(),
    });
  }
}

async function processIncomingMessage(
  admin: any,
  channel: any,
  msg: any,
  contacts: any[],
  rawValue: any,
) {
  const waId = String(msg?.from ?? contacts?.[0]?.wa_id ?? "").replace(/\D/g, "");
  if (!waId) return;

  if (msg?.id) {
    const { data: existing } = await admin
      .from("messages")
      .select("id")
      .eq("meta_message_id", msg.id)
      .maybeSingle();
    if (existing?.id) {
      await logWebhook(
        admin,
        channel,
        "duplicate_inbound_message_ignored",
        "ok",
        { meta_message_id: msg.id },
        undefined,
        "app",
      );
      return;
    }
  }

  const contactMeta = contacts.find((contact) => contact?.wa_id === waId) ?? contacts?.[0] ?? {};
  const profileName = String(contactMeta?.profile?.name ?? waId);
  const type = String(msg?.type ?? "text");
  const content = extractMessageText(msg);

  const { contactId, conversationId } = await upsertContactAndConversation(admin, {
    companyId: channel.company_id,
    channelId: channel.id,
    waId,
    name: profileName,
    inbound: true,
    lastMessage: content,
  });

  const { data: inbound, error } = await admin
    .from("messages")
    .insert({
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
    })
    .select("id")
    .single();
  if (error) throw error;

  await tryAutomationOrAiReply(
    admin,
    channel,
    conversationId,
    contactId,
    waId,
    inbound.id,
    content,
    rawValue,
  );
}

function echoRecipient(echo: any) {
  const candidates = [
    echo?.to,
    echo?.recipient_id,
    echo?.recipient?.wa_id,
    echo?.recipient?.id,
    echo?.contact?.wa_id,
  ];
  for (const value of candidates) {
    const phone = String(value ?? "").replace(/\D/g, "");
    if (phone.length >= 10) return phone;
  }
  return "";
}

async function processHumanAppEcho(admin: any, channel: any, echo: any, rawValue: any) {
  const waId = echoRecipient(echo);
  if (!waId) {
    await logWebhook(
      admin,
      channel,
      "human_app_echo_unmapped",
      "error",
      { id: echo?.id ?? null },
      "Eco do WhatsApp Business sem destinatário reconhecível.",
      "app",
    );
    return;
  }

  if (echo?.id) {
    const { data: existing } = await admin
      .from("messages")
      .select("id")
      .eq("meta_message_id", echo.id)
      .maybeSingle();
    if (existing?.id) return;
  }

  const content = extractMessageText(echo);
  const { contactId, conversationId } = await upsertContactAndConversation(admin, {
    companyId: channel.company_id,
    channelId: channel.id,
    waId,
    name: waId,
    inbound: false,
    lastMessage: content,
  });

  const { data: settings } = await admin
    .from("ai_agent_settings")
    .select("human_takeover_minutes")
    .eq("company_id", channel.company_id)
    .maybeSingle();
  const takeoverMinutes = Math.max(
    5,
    Math.min(10080, Number(settings?.human_takeover_minutes ?? 480)),
  );
  const now = new Date();
  const pauseUntil = new Date(now.getTime() + takeoverMinutes * 60_000).toISOString();

  const { error } = await admin.from("messages").insert({
    company_id: channel.company_id,
    channel_id: channel.id,
    conversation_id: conversationId,
    contact_id: contactId,
    direction: "outbound",
    message_type: echo?.type ?? "text",
    content,
    sender_type: "human_app",
    meta_message_id: echo?.id ?? null,
    status: "sent",
    raw_payload: echo,
    ai_generated: false,
  });
  if (error) throw error;

  await admin
    .from("conversations")
    .update({
      ai_handling: false,
      human_handling: true,
      human_last_replied_at: now.toISOString(),
      ai_paused_until: pauseUntil,
      status: "pendente",
      handoff_reason: "Atendimento assumido pelo WhatsApp Business",
      last_message: content,
      last_message_direction: "outbound",
      unread_count: 0,
      last_message_at: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq("id", conversationId);

  await admin
    .from("channels")
    .update({
      connection_mode: "coexistence",
      coexistence_active: true,
      coexistence_last_echo_at: now.toISOString(),
      coexistence_last_sync_at: now.toISOString(),
    })
    .eq("id", channel.id);

  await logWebhook(
    admin,
    channel,
    "human_app_reply_synced",
    "ok",
    {
      conversation_id: conversationId,
      meta_message_id: echo?.id ?? null,
      pause_until: pauseUntil,
      raw: rawValue,
    },
    undefined,
    "app",
  );
}

async function processStatus(admin: any, channel: any, statusPayload: any) {
  const metaId = statusPayload?.id;
  if (!metaId) return;
  const status = statusPayload?.status ?? null;
  const timestampSeconds = statusPayload?.timestamp ? Number(statusPayload.timestamp) : null;
  const date = timestampSeconds
    ? new Date(timestampSeconds * 1000).toISOString()
    : new Date().toISOString();
  const patch: Record<string, unknown> = { status, raw_payload: statusPayload };
  if (status === "delivered") patch.delivered_at = date;
  if (status === "read") patch.read_at = date;
  if (status === "failed")
    patch.error_message = statusPayload?.errors?.[0]?.message ?? "Falha informada pela Meta";
  await admin.from("messages").update(patch).eq("meta_message_id", metaId);
  await logWebhook(
    admin,
    channel,
    `message_${status ?? "status"}`,
    status ?? "received",
    statusPayload,
    status === "failed" ? (statusPayload?.errors?.[0]?.message ?? null) : undefined,
  );
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

  const [{ data: conversation }, { data: agentSettings }] = await Promise.all([
    admin
      .from("conversations")
      .select("human_handling, ai_paused_until")
      .eq("id", conversationId)
      .maybeSingle(),
    admin
      .from("ai_agent_settings")
      .select(
        "is_enabled, agent_name, system_prompt, temperature, max_tokens, handoff_keywords, human_takeover_minutes",
      )
      .eq("company_id", channel.company_id)
      .maybeSingle(),
  ]);

  if (conversation?.human_handling) {
    const pauseUntil = conversation.ai_paused_until
      ? new Date(conversation.ai_paused_until).getTime()
      : Number.POSITIVE_INFINITY;
    if (pauseUntil > Date.now()) {
      await logWebhook(
        admin,
        channel,
        "ai_reply_skipped_human_takeover",
        "ok",
        {
          conversation_id: conversationId,
          ai_paused_until: conversation.ai_paused_until ?? null,
        },
        undefined,
        "app",
      );
      return;
    }
    await admin
      .from("conversations")
      .update({
        human_handling: false,
        ai_paused_until: null,
        handoff_reason: null,
      })
      .eq("id", conversationId);
  }

  const { data: rules } = await admin
    .from("automation_rules")
    .select("*")
    .eq("company_id", channel.company_id)
    .eq("is_active", true)
    .or(`channel_id.is.null,channel_id.eq.${channel.id}`)
    .limit(20);

  const lower = userMessage.toLowerCase();
  const matchingRule = (rules ?? []).find(
    (rule: any) =>
      rule.trigger_type === "keyword" &&
      rule.keyword &&
      lower.includes(String(rule.keyword).toLowerCase()),
  );
  if (matchingRule?.response) {
    await sendBotReply(
      admin,
      channel,
      conversationId,
      contactId,
      waId,
      inboundMessageId,
      matchingRule.response,
      "automation_rule",
      rawValue,
    );
    if (matchingRule.assign_to_human)
      await pauseForHuman(admin, conversationId, agentSettings, "Regra solicitou humano");
    return;
  }

  if (!isAiAutoReplyEnabled(channel)) {
    const reason =
      channel.ai_enabled !== true
        ? "IA desativada neste canal"
        : "IA desativada para resposta automática";
    await admin
      .from("conversations")
      .update({ ai_handling: false, status: "pendente", handoff_reason: reason })
      .eq("id", conversationId);
    return;
  }

  if (agentSettings && !agentSettings.is_enabled) {
    await admin
      .from("conversations")
      .update({
        ai_handling: false,
        status: "pendente",
        handoff_reason: "Agente IA desativado para esta empresa",
      })
      .eq("id", conversationId);
    return;
  }

  const handoffHit = (agentSettings?.handoff_keywords ?? []).find(
    (keyword: string) => keyword && lower.includes(keyword.toLowerCase()),
  );
  if (handoffHit) {
    await pauseForHuman(
      admin,
      conversationId,
      agentSettings,
      `Cliente pediu atendimento humano ("${handoffHit}")`,
    );
    return;
  }

  const apiKey = Deno.env.get("AI_API_KEY") ?? Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    await admin
      .from("conversations")
      .update({ ai_handling: false, status: "pendente", handoff_reason: "AI_API_KEY ausente" })
      .eq("id", conversationId);
    return;
  }

  let aiConfig: AiProviderConfig;
  try {
    aiConfig = resolveAiProviderConfig({
      AI_PROVIDER: Deno.env.get("AI_PROVIDER") ?? undefined,
      AI_BASE_URL: Deno.env.get("AI_BASE_URL") ?? undefined,
      AI_MODEL: Deno.env.get("AI_MODEL") ?? undefined,
      AI_API_KEY: apiKey,
      OPENAI_MODEL: Deno.env.get("OPENAI_MODEL") ?? undefined,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Configuração de IA inválida";
    await recordAiInteraction(admin, {
      company_id: channel.company_id,
      channel_id: channel.id,
      conversation_id: conversationId,
      inbound_message_id: inboundMessageId,
      status: "error",
      input: userMessage,
      error_message: errorMessage,
    });
    await admin
      .from("conversations")
      .update({ ai_handling: false, status: "pendente", handoff_reason: errorMessage })
      .eq("id", conversationId);
    return;
  }

  const reply = await generateAiReply(
    admin,
    channel,
    conversationId,
    userMessage,
    aiConfig,
    inboundMessageId,
    agentSettings,
  );
  if (!reply) {
    await admin
      .from("conversations")
      .update({
        ai_handling: false,
        status: "pendente",
        handoff_reason: "IA não respondeu com segurança",
      })
      .eq("id", conversationId);
    return;
  }

  await sendBotReply(
    admin,
    channel,
    conversationId,
    contactId,
    waId,
    inboundMessageId,
    reply,
    "ai",
    rawValue,
  );
}

async function pauseForHuman(
  admin: any,
  conversationId: string,
  agentSettings: any,
  reason: string,
) {
  const minutes = Math.max(
    5,
    Math.min(10080, Number(agentSettings?.human_takeover_minutes ?? 480)),
  );
  const pauseUntil = new Date(Date.now() + minutes * 60_000).toISOString();
  await admin
    .from("conversations")
    .update({
      ai_handling: false,
      human_handling: true,
      ai_paused_until: pauseUntil,
      status: "pendente",
      handoff_reason: reason,
    })
    .eq("id", conversationId);
}

async function generateAiReply(
  admin: any,
  channel: any,
  conversationId: string,
  userMessage: string,
  aiConfig: AiProviderConfig,
  inboundMessageId: string,
  agentSettings: any = null,
) {
  const [{ data: company }, { data: quickReplies }, { data: knowledge }, { data: history }] =
    await Promise.all([
      admin
        .from("companies")
        .select("name, segment, business_hours, services_description, communication_tone")
        .eq("id", channel.company_id)
        .maybeSingle(),
      admin
        .from("quick_replies")
        .select("title, message, category")
        .eq("company_id", channel.company_id)
        .limit(20),
      admin
        .from("ai_knowledge_items")
        .select("title, content")
        .eq("company_id", channel.company_id)
        .eq("is_active", true)
        .limit(50),
      admin
        .from("messages")
        .select("direction, content, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(24),
    ]);

  const agentName = agentSettings?.agent_name?.trim();
  const customPrompt = agentSettings?.system_prompt?.trim();
  const system = [
    agentName
      ? `Você é "${agentName}", agente de atendimento da empresa ${company?.name ?? "do cliente"}.`
      : `Você é o agente de atendimento da empresa ${company?.name ?? "do cliente"}.`,
    customPrompt
      ? `\nInstruções exclusivas desta empresa (prioridade máxima):\n${customPrompt}\n`
      : "",
    "REGRA CENTRAL: use somente informações confirmadas pela empresa ou pela base de conhecimento. Não invente fatos, preços, prazos, estoque, políticas, diagnósticos, direitos ou promessas.",
    "Colete informações de forma natural, uma ou duas perguntas por vez. Nunca repita pergunta já respondida na conversa.",
    "Quando faltar informação, houver decisão profissional, exceção, risco ou pedido de humano, encaminhe para uma pessoa em vez de improvisar.",
    `Tom: ${company?.communication_tone ?? "profissional"}.`,
    `Horário informado: ${company?.business_hours ?? channel.business_hours ?? "não cadastrado"}.`,
    `Serviços cadastrados: ${company?.services_description ?? "não cadastrado"}.`,
    channel.greeting_message ? `Mensagem de saudação aprovada: ${channel.greeting_message}` : "",
    "\nBase de conhecimento:",
    ...(knowledge ?? []).map((item: any) => `- ${item.title}: ${item.content}`),
    "\nRespostas rápidas aprovadas:",
    ...(quickReplies ?? []).map((item: any) => `- ${item.title}: ${item.message}`),
  ]
    .filter(Boolean)
    .join("\n");

  const turns = (history ?? [])
    .reverse()
    .filter((message: any) => message.content)
    .map((message: any) => ({
      role: message.direction === "inbound" ? "user" : "assistant",
      content: String(message.content),
    }));
  if (
    !turns.length ||
    turns[turns.length - 1].role !== "user" ||
    turns[turns.length - 1].content !== userMessage
  ) {
    turns.push({ role: "user", content: userMessage });
  }

  const { provider, model, apiKey, chatCompletionsUrl } = aiConfig;
  let response: Response;
  try {
    response = await fetchAiWithRetry(chatCompletionsUrl, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: agentSettings?.temperature ?? 0.2,
        max_tokens: agentSettings?.max_tokens ?? 640,
        messages: [{ role: "system", content: system }, ...turns],
      }),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "erro de rede desconhecido";
    await recordAiInteraction(admin, {
      company_id: channel.company_id,
      channel_id: channel.id,
      conversation_id: conversationId,
      inbound_message_id: inboundMessageId,
      status: "error",
      model,
      input: userMessage,
      error_message: `Falha de rede ao chamar ${provider}: ${detail}`,
    });
    return null;
  }

  const out = await response.json().catch(() => ({}));
  if (!response.ok) {
    await recordAiInteraction(admin, {
      company_id: channel.company_id,
      channel_id: channel.id,
      conversation_id: conversationId,
      inbound_message_id: inboundMessageId,
      status: "error",
      model,
      input: userMessage,
      error_message: out?.error?.message ?? `${provider} HTTP ${response.status}`,
    });
    return null;
  }

  const reply = String(out?.choices?.[0]?.message?.content ?? "").trim();
  const recorded = await recordAiInteraction(admin, {
    company_id: channel.company_id,
    channel_id: channel.id,
    conversation_id: conversationId,
    inbound_message_id: inboundMessageId,
    status: reply ? "generated" : "empty",
    model,
    prompt_tokens: out?.usage?.prompt_tokens ?? null,
    completion_tokens: out?.usage?.completion_tokens ?? null,
    input: userMessage,
    output: reply,
  });
  return recorded ? reply || null : null;
}

async function fetchAiWithRetry(url: string, init: RequestInit): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const signal = AbortSignal.timeout(AI_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { ...init, signal });
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt === 2) return response;
      const retryAfterMs = parseRetryAfterMs(response.headers.get("retry-after"));
      if (retryAfterMs !== null && retryAfterMs > 2_000) return response;
      await response.body?.cancel().catch(() => undefined);
      await new Promise((resolve) =>
        setTimeout(resolve, retryAfterMs ?? 250 + Math.floor(Math.random() * 250)),
      );
    } catch (error) {
      lastError = error;
      if (attempt === 2 || signal.aborted) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 + Math.floor(Math.random() * 250)));
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Falha desconhecida ao chamar o provedor de IA");
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
  if (!secret?.access_token || !channel.phone_number_id) {
    if (source === "ai")
      await markAiDeliveryFailed(
        admin,
        inboundMessageId,
        "Canal sem credenciais Meta completas para envio",
      );
    await admin
      .from("conversations")
      .update({
        ai_handling: false,
        status: "pendente",
        handoff_reason: "Canal sem credenciais Meta completas para envio",
      })
      .eq("id", conversationId);
    return;
  }

  const now = new Date().toISOString();
  let meta: Awaited<ReturnType<typeof sendWhatsAppText>>;
  try {
    meta = await sendWhatsAppText(
      secret.access_token,
      channel.phone_number_id,
      waId,
      reply,
      AbortSignal.timeout(10_000),
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "erro de rede desconhecido";
    if (source === "ai")
      await markAiDeliveryFailed(
        admin,
        inboundMessageId,
        `Falha de rede ao chamar Meta: ${detail}`,
      );
    await logWebhook(
      admin,
      channel,
      `${source}_reply_failed`,
      "error",
      { to: waId },
      `Falha de rede ao chamar Meta: ${detail}`,
      "app",
    );
    await admin
      .from("conversations")
      .update({
        ai_handling: false,
        status: "pendente",
        handoff_reason: "Falha ao enviar resposta automática",
      })
      .eq("id", conversationId);
    return;
  }

  if (!meta.ok) {
    if (source === "ai")
      await markAiDeliveryFailed(
        admin,
        inboundMessageId,
        meta.json?.error?.message ?? `Meta HTTP ${meta.status}`,
      );
    await logWebhook(
      admin,
      channel,
      `${source}_reply_failed`,
      "error",
      { request: { to: waId }, response: meta.json },
      meta.json?.error?.message ?? `Meta HTTP ${meta.status}`,
      "app",
    );
    await admin
      .from("conversations")
      .update({
        ai_handling: false,
        status: "pendente",
        handoff_reason: "Falha ao enviar resposta automática",
      })
      .eq("id", conversationId);
    return;
  }

  const { data: outbound, error } = await admin
    .from("messages")
    .insert({
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
    })
    .select("id")
    .single();

  if (error) {
    if (source === "ai")
      await markAiPersistenceFailed(
        admin,
        inboundMessageId,
        "Resposta enviada pela Meta, mas não foi gravada no banco",
      );
    await logWebhook(
      admin,
      channel,
      `${source}_reply_persistence_failed`,
      "error",
      { meta_message_id: meta.json?.messages?.[0]?.id ?? null },
      error.message,
      "app",
    );
    return;
  }

  if (source === "ai") await markAiDeliveryCompleted(admin, inboundMessageId, outbound?.id ?? null);
  await admin
    .from("conversations")
    .update({
      ai_handling: source === "ai",
      human_handling: false,
      ai_paused_until: null,
      status: "aberta",
      last_message: reply,
      last_message_direction: "outbound",
      unread_count: 0,
      ai_last_replied_at: source === "ai" ? now : null,
      last_message_at: now,
      updated_at: now,
    })
    .eq("id", conversationId);

  await logWebhook(
    admin,
    channel,
    `${source}_reply_sent`,
    "ok",
    { to: waId, meta: meta.json },
    undefined,
    "app",
  );
}

async function recordAiInteraction(admin: any, interaction: Record<string, unknown>) {
  const { error } = await admin.from("ai_interactions").insert(interaction);
  if (error) console.error("ai_interactions insert failed", { code: error.code ?? "unknown" });
  return !error;
}

async function markAiDeliveryFailed(admin: any, inboundMessageId: string, errorMessage: string) {
  const { error } = await admin
    .from("ai_interactions")
    .update({ status: "send_failed", error_message: errorMessage })
    .eq("inbound_message_id", inboundMessageId);
  if (error)
    console.error("ai_interactions delivery status update failed", {
      code: error.code ?? "unknown",
    });
}

async function markAiDeliveryCompleted(
  admin: any,
  inboundMessageId: string,
  outboundMessageId: string | null,
) {
  const { error } = await admin
    .from("ai_interactions")
    .update({ status: "completed", outbound_message_id: outboundMessageId, error_message: null })
    .eq("inbound_message_id", inboundMessageId);
  if (error)
    console.error("ai_interactions delivery status update failed", {
      code: error.code ?? "unknown",
    });
}

async function markAiPersistenceFailed(admin: any, inboundMessageId: string, errorMessage: string) {
  const { error } = await admin
    .from("ai_interactions")
    .update({ status: "persistence_failed", error_message: errorMessage })
    .eq("inbound_message_id", inboundMessageId);
  if (error)
    console.error("ai_interactions persistence status update failed", {
      code: error.code ?? "unknown",
    });
}
