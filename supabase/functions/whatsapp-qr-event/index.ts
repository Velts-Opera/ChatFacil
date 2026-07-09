import { adminClient } from "../_shared/auth.ts";
import { json, text } from "../_shared/http.ts";
import { upsertContactAndConversation } from "../_shared/whatsapp.ts";

const GEMINI_MODEL = "gemini-1.5-flash";

Deno.serve(async (req) => {
  if (req.method !== "POST") return text("Method Not Allowed", 405);

  const bridgeSecret = Deno.env.get("BRIDGE_SECRET") ?? "";
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

  const admin = adminClient();

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
      const { waId, pushName, content, messageId, timestamp } = body;
      if (!waId || !content) return json({ error: "waId e content obrigatórios" }, 400);

      // Ignora mensagens de status/broadcast do WhatsApp
      if (waId === "status@broadcast" || waId.endsWith("@broadcast")) {
        return json({ ok: true, skipped: "broadcast" });
      }

      // Normaliza waId: converte @lid para @s.whatsapp.net para envio funcionar
      const sendToId = waId.endsWith("@lid")
        ? waId.replace("@lid", "@s.whatsapp.net")
        : waId;

      const { data: channel, error: chErr } = await admin
        .from("channels")
        .select("id, company_id, bridge_url, auto_reply_enabled, ai_enabled, greeting_message, out_of_hours_message, business_hours")
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

      // Evita duplicatas pelo messageId
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

      // ── Resposta automática com Gemini ──────────────────────────────────────
      console.log(`[AI] ai_enabled=${channel.ai_enabled} auto_reply=${channel.auto_reply_enabled}`);
      if (channel.ai_enabled && channel.auto_reply_enabled) {
        const geminiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
        const bridgeUrl = (channel.bridge_url ?? "http://localhost:3001").replace(/\/$/, "");
        console.log(`[AI] geminiKey presente=${!!geminiKey} sendTo=${sendToId}`);

        if (geminiKey) {
          try {
            const aiReply = await generateGeminiReply({
              admin,
              companyId: channel.company_id,
              conversationId,
              userMessage: content,
              businessHours: channel.business_hours,
              greetingMessage: channel.greeting_message,
            }, geminiKey);

            console.log(`[AI] resposta gerada: ${aiReply ? aiReply.slice(0, 80) : "null"}`);
            if (aiReply) {
              // Envia pelo bridge
              const sendRes = await fetch(`${bridgeUrl}/session/${channelId}/send`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "x-bridge-secret": bridgeSecret,
                },
                body: JSON.stringify({ to: sendToId, message: aiReply }),
              });
              console.log(`[AI] bridge send status=${sendRes.status}`);

              const sentOk = sendRes.ok;

              // Salva mensagem de saída no banco
              await admin.from("messages").insert({
                company_id: channel.company_id,
                channel_id: channel.id,
                conversation_id: conversationId,
                contact_id: contactId,
                direction: "outbound",
                sender_type: "ai",
                content: aiReply,
                message_type: "text",
                status: sentOk ? "sent" : "failed",
                ai_generated: true,
              });

              // Atualiza última mensagem da conversa
              await admin.from("conversations").update({
                last_message: aiReply,
                last_message_direction: "outbound",
                last_message_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              }).eq("id", conversationId);
            }
          } catch (aiErr) {
            console.error("[whatsapp-qr-event] Gemini erro:", aiErr);
          }
        } else {
          console.warn("[whatsapp-qr-event] GEMINI_API_KEY não configurada — resposta automática desativada.");
        }
      }

      return json({ ok: true });
    }

    return json({ error: `Evento desconhecido: ${event}` }, 400);
  } catch (err) {
    console.error("[whatsapp-qr-event] erro:", err);
    return json({ error: String(err) }, 500);
  }
});

// ── Gemini ──────────────────────────────────────────────────────────────────

async function generateGeminiReply(
  ctx: {
    admin: any;
    companyId: string;
    conversationId: string;
    userMessage: string;
    businessHours: string | null;
    greetingMessage: string | null;
  },
  apiKey: string,
): Promise<string | null> {
  // Busca empresa
  const { data: company } = await ctx.admin
    .from("companies")
    .select("name, communication_tone, services_description")
    .eq("id", ctx.companyId)
    .maybeSingle();

  // Busca base de conhecimento
  const { data: knowledge } = await ctx.admin
    .from("ai_knowledge_items")
    .select("title, content")
    .eq("company_id", ctx.companyId)
    .eq("is_active", true)
    .limit(20);

  // Busca histórico da conversa (últimas 10 mensagens)
  const { data: history } = await ctx.admin
    .from("messages")
    .select("direction, content, created_at")
    .eq("conversation_id", ctx.conversationId)
    .order("created_at", { ascending: false })
    .limit(10);

  const knowledgeText = knowledge && knowledge.length > 0
    ? knowledge.map((k: any) => `## ${k.title}\n${k.content}`).join("\n\n")
    : "Nenhuma base de conhecimento cadastrada. Responda de forma genérica e educada.";

  const tone = company?.communication_tone ?? "profissional";
  const companyName = company?.name ?? "nossa empresa";
  const services = company?.services_description ? `\n\nServiços/produtos: ${company.services_description}` : "";
  const hours = ctx.businessHours ? `\n\nHorário de atendimento: ${ctx.businessHours}` : "";

  const systemPrompt = `Você é o assistente virtual de atendimento ao cliente da empresa "${companyName}".

Tom de comunicação: ${tone}. Seja sempre claro, objetivo e respeitoso.${services}${hours}

Base de conhecimento (use APENAS estas informações para responder):
${knowledgeText}

Regras obrigatórias:
- Responda APENAS com base nas informações cadastradas acima.
- Se não souber a resposta, diga educadamente que vai transferir para um atendente humano.
- Não invente informações, preços ou prazos que não estejam cadastrados.
- Respostas curtas e diretas. Máximo 3 parágrafos.
- Não mencione que é uma IA a não ser que o cliente pergunte diretamente.`;

  // Monta histórico de conversa para o Gemini
  const chatHistory = (history ?? [])
    .reverse()
    .slice(0, -1) // Remove a última (que é a mensagem atual)
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
      temperature: 0.4,
      maxOutputTokens: 512,
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
    console.error("[Gemini] erro HTTP:", res.status, errText);
    return null;
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? null;
  return text || null;
}
