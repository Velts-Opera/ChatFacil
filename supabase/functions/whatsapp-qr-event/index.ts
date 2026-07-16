import { adminClient } from "../_shared/auth.ts";
import { json, text } from "../_shared/http.ts";
import { upsertContactAndConversation } from "../_shared/whatsapp.ts";
import { getBridgeConfig } from "../_shared/bridge-config.ts";

const GEMINI_MODEL = Deno.env.get("GEMINI_MODEL") ?? "gemini-1.5-flash";

Deno.serve(async (req) => {
  if (req.method !== "POST") return text("Method Not Allowed", 405);

  const admin = adminClient();
  const { secret: bridgeSecret } = await getBridgeConfig(admin);
  const incomingSecret = req.headers.get("x-bridge-secret") ?? "";

  if (!bridgeSecret || incomingSecret !== bridgeSecret) {
    return text("Unauthorized", 401);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { event, channelId } = body;
  if (!event || !channelId) return json({ error: "event e channelId obrigatórios" }, 400);

  try {
    if (event === "connected") {
      const { phoneNumber } = body;
      await admin.from("channels").update({
        status: "connected",
        phone_number: phoneNumber ?? null,
        connected_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      }).eq("id", channelId);

      return json({ ok: true });
    }

    if (event === "disconnected" || event === "reconnecting") {
      const newStatus = event === "reconnecting" ? "connecting" : "disconnected";
      await admin.from("channels").update({
        status: newStatus,
        updated_at: new Date().toISOString(),
      }).eq("id", channelId);

      return json({ ok: true });
    }

    if (event === "message_received") {
      const { waId, rawJid, pushName, content, messageId, timestamp } = body;
      if (!waId || !content) return json({ error: "waId e content obrigatórios" }, 400);

      // Ignora mensagens de status/broadcast do WhatsApp
      if (waId === "status@broadcast" || waId.endsWith("@broadcast")) {
        return json({ ok: true, skipped: "broadcast" });
      }

      // rawJid preserva o JID original (incluindo @lid) sem conversão errada
      const replyTo = rawJid ?? waId;

      const { data: channel, error: chErr } = await admin
        .from("channels")
        .select("id, company_id, auto_reply_enabled, ai_enabled, greeting_message, out_of_hours_message, business_hours")
        .eq("id", channelId)
        .maybeSingle();

      if (chErr || !channel) return json({ error: "Canal não encontrado" }, 404);

      const { contactId, conversationId } = await upsertContactAndConversation(admin, {
        companyId: channel.company_id,
        channelId: channel.id,
        waId,
        name: pushName,
        inbound: true,
        lastMessage: content,
      });

      // Dedupe pelo messageId
      if (messageId) {
        const { data: existing } = await admin
          .from("messages")
          .select("id")
          .eq("channel_id", channelId)
          .eq("meta_message_id", messageId)
          .maybeSingle();

        if (existing) return json({ ok: true, duplicate: true });
      }

      await admin.from("messages").insert({
        company_id: channel.company_id,
        channel_id: channel.id,
        conversation_id: conversationId,
        contact_id: contactId,
        direction: "inbound",
        sender_type: "contact",
        content,
        message_type: "text",
        status: "received",
        meta_message_id: messageId ?? null,
        created_at: timestamp ?? new Date().toISOString(),
      });

      await admin.from("webhook_events").insert({
        channel_id: channel.id,
        company_id: channel.company_id,
        event_type: "message_received",
        status: "ok",
        source: "qr_bridge",
        payload: body,
        processed_at: new Date().toISOString(),
      });

      if (!channel.ai_enabled || !channel.auto_reply_enabled) {
        return json({ ok: true });
      }

      // ── Regras keyword (antes da IA) ────────────────────────────────────────
      const { data: keywordRules } = await admin
        .from("automation_rules")
        .select("keyword, response, assign_to_human")
        .eq("company_id", channel.company_id)
        .eq("trigger_type", "keyword")
        .eq("is_active", true);

      if (keywordRules?.length) {
        const lowerContent = content.toLowerCase();
        const matched = keywordRules.find((r: any) =>
          r.keyword && lowerContent.includes(r.keyword.toLowerCase())
        );
        if (matched?.response) {
          await saveOutbound(admin, channel, conversationId, contactId, matched.response, "agent");
          if (matched.assign_to_human) {
            await admin.from("conversations").update({
              ai_handling: false,
              status: "pendente",
              handoff_reason: "Regra solicitou humano",
            }).eq("id", conversationId);
          }
          return json({ ok: true, reply: matched.response, to: replyTo });
        }
      }

      // ── Agente IA exclusivo da empresa (prompt, ativação e handoff) ─────────
      const { data: agentSettings } = await admin
        .from("ai_agent_settings")
        .select("is_enabled, agent_name, system_prompt, temperature, max_tokens, handoff_keywords")
        .eq("company_id", channel.company_id)
        .maybeSingle();

      if (agentSettings && !agentSettings.is_enabled) {
        await admin.from("conversations").update({
          ai_handling: false,
          status: "pendente",
          handoff_reason: "Agente IA desativado para esta empresa",
        }).eq("id", conversationId);
        return json({ ok: true });
      }

      const lowerForHandoff = content.toLowerCase();
      const handoffHit = (agentSettings?.handoff_keywords ?? []).find(
        (k: string) => k && lowerForHandoff.includes(k.toLowerCase()),
      );
      if (handoffHit) {
        await admin.from("conversations").update({
          ai_handling: false,
          status: "pendente",
          handoff_reason: `Cliente pediu atendimento humano ("${handoffHit}")`,
        }).eq("id", conversationId);
        return json({ ok: true });
      }

      // ── Resposta automática com Gemini ──────────────────────────────────────
      console.log(`[AI] ai_enabled=${channel.ai_enabled} auto_reply=${channel.auto_reply_enabled}`);
      const geminiKey = Deno.env.get("GEMINI_API_KEY") ?? "";

      if (!geminiKey) {
        console.warn("[whatsapp-qr-event] GEMINI_API_KEY não configurada — resposta automática desativada.");
        return json({ ok: true });
      }

      try {
        const aiReply = await generateGeminiReply({
          admin,
          companyId: channel.company_id,
          channelId: channel.id,
          conversationId,
          userMessage: content,
          businessHours: channel.business_hours,
          greetingMessage: channel.greeting_message,
          agentName: agentSettings?.agent_name ?? null,
          customPrompt: agentSettings?.system_prompt ?? null,
          temperature: agentSettings?.temperature ?? null,
          maxTokens: agentSettings?.max_tokens ?? null,
        }, geminiKey);

        console.log(`[AI] resposta gerada: ${aiReply ? aiReply.slice(0, 80) : "null"}`);
        if (aiReply) {
          await saveOutbound(admin, channel, conversationId, contactId, aiReply, "ai");
          return json({ ok: true, reply: aiReply, to: replyTo });
        }
      } catch (aiErr) {
        console.error("[whatsapp-qr-event] Gemini erro:", aiErr);
      }

      return json({ ok: true });
    }

    return json({ error: `Evento desconhecido: ${event}` }, 400);
  } catch (err) {
    console.error("[whatsapp-qr-event] erro:", err);
    return json({ error: String(err) }, 500);
  }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

async function saveOutbound(
  admin: any,
  channel: any,
  conversationId: string,
  contactId: string,
  reply: string,
  senderType: "ai" | "agent",
) {
  const now = new Date().toISOString();

  await admin.from("messages").insert({
    company_id: channel.company_id,
    channel_id: channel.id,
    conversation_id: conversationId,
    contact_id: contactId,
    direction: "outbound",
    sender_type: senderType,
    content: reply,
    message_type: "text",
    status: "sent",
    ai_generated: senderType === "ai",
  });

  await admin.from("conversations").update({
    last_message: reply,
    last_message_direction: "outbound",
    last_message_at: now,
    updated_at: now,
  }).eq("id", conversationId);
}

// ── Gemini ──────────────────────────────────────────────────────────────────

async function generateGeminiReply(
  ctx: {
    admin: any;
    companyId: string;
    channelId: string;
    conversationId: string;
    userMessage: string;
    businessHours: string | null;
    greetingMessage: string | null;
    agentName: string | null;
    customPrompt: string | null;
    temperature: number | null;
    maxTokens: number | null;
  },
  apiKey: string,
): Promise<string | null> {
  const { data: company } = await ctx.admin
    .from("companies")
    .select("name, communication_tone, services_description")
    .eq("id", ctx.companyId)
    .maybeSingle();

  const { data: knowledge } = await ctx.admin
    .from("ai_knowledge_items")
    .select("title, content")
    .eq("company_id", ctx.companyId)
    .eq("is_active", true)
    .limit(20);

  const { data: quickReplies } = await ctx.admin
    .from("quick_replies")
    .select("title, message")
    .eq("company_id", ctx.companyId)
    .eq("is_active", true)
    .limit(10);

  // 8 mensagens de histórico
  const { data: history } = await ctx.admin
    .from("messages")
    .select("direction, content, created_at")
    .eq("conversation_id", ctx.conversationId)
    .order("created_at", { ascending: false })
    .limit(8);

  const knowledgeText = knowledge && knowledge.length > 0
    ? knowledge.map((k: any) => `## ${k.title}\n${k.content}`).join("\n\n")
    : "Nenhuma base de conhecimento cadastrada. Responda de forma genérica e educada.";

  const quickRepliesText = quickReplies && quickReplies.length > 0
    ? "\n\nRespostas rápidas disponíveis:\n" +
      quickReplies.map((r: any) => `- ${r.title}: ${r.message}`).join("\n")
    : "";

  const tone = company?.communication_tone ?? "profissional";
  const companyName = company?.name ?? "nossa empresa";
  const services = company?.services_description
    ? `\n\nServiços/produtos: ${company.services_description}`
    : "";
  const hours = ctx.businessHours ? `\n\nHorário de atendimento: ${ctx.businessHours}` : "";

  const agentIdentity = ctx.agentName?.trim()
    ? `Você é "${ctx.agentName.trim()}", assistente virtual de atendimento ao cliente da empresa "${companyName}".`
    : `Você é o assistente virtual de atendimento ao cliente da empresa "${companyName}".`;

  const customPrompt = ctx.customPrompt?.trim()
    ? `\n\nInstruções exclusivas desta empresa (siga com prioridade máxima):\n${ctx.customPrompt.trim()}`
    : "";

  const systemPrompt =
    `${agentIdentity}${customPrompt}

Tom de comunicação: ${tone}. Seja sempre claro, objetivo e respeitoso.${services}${hours}

Base de conhecimento (use APENAS estas informações para responder):
${knowledgeText}${quickRepliesText}

Regras obrigatórias:
- Responda em PT-BR, máximo 3 frases curtas e diretas.
- Responda APENAS com base nas informações cadastradas acima.
- Se não souber a resposta, diga educadamente que vai transferir para um atendente humano.
- Não invente informações, preços ou prazos que não estejam cadastrados.
- Não mencione que é uma IA a não ser que o cliente pergunte diretamente.`;

  const chatHistory = (history ?? [])
    .reverse()
    .slice(0, -1)
    .map((m: any) => ({
      role: m.direction === "inbound" ? "user" : "model",
      parts: [{ text: m.content }],
    }));

  const requestBody = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [
      ...chatHistory,
      { role: "user", parts: [{ text: ctx.userMessage }] },
    ],
    generationConfig: {
      temperature: ctx.temperature ?? 0.4,
      maxOutputTokens: ctx.maxTokens ?? 400,
    },
    safetySettings: [
      { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
      { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
    ],
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    },
  );

  if (!res.ok) {
    const errText = await res.text();
    const errorMsg = `HTTP ${res.status}: ${errText}`;
    console.error("[Gemini] erro HTTP:", res.status, errText);

    await ctx.admin.from("ai_interactions").insert({
      company_id: ctx.companyId,
      channel_id: ctx.channelId,
      conversation_id: ctx.conversationId,
      status: "error",
      error_message: errorMsg,
      model: GEMINI_MODEL,
      created_at: new Date().toISOString(),
    }).catch(() => {});

    return null;
  }

  const data = await res.json();
  const replyText = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
  return replyText || null;
}
