// Motor de respostas automáticas via Google Gemini.
// A assistente sempre se apresenta como "Bia, assistente do Veltrani" (configurável
// por empresa) e nunca se identifica como IA/robô — ela é parte da equipe.
import { decryptSecret } from "./crypto.ts";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-2.5-flash";

export async function getIntegrationSettings(admin: any, companyId: string) {
  const { data } = await admin
    .from("integration_settings")
    .select("gemini_api_key_enc, gemini_key_hint, gemini_model, gateway_url, gateway_key_enc, gateway_key_hint")
    .eq("company_id", companyId)
    .maybeSingle();
  return data ?? null;
}

// Agente IA exclusivo por empresa (multitenant): prompt, nome, ativação,
// palavras de handoff e parâmetros de geração vêm de ai_agent_settings.
export async function getAgentSettings(admin: any, companyId: string) {
  const { data } = await admin
    .from("ai_agent_settings")
    .select("is_enabled, agent_name, system_prompt, temperature, max_tokens, handoff_keywords")
    .eq("company_id", companyId)
    .maybeSingle();
  return data ?? null;
}

export async function getGeminiConfig(admin: any, companyId: string) {
  const settings = await getIntegrationSettings(admin, companyId);
  const stored = settings?.gemini_api_key_enc ? await decryptSecret(settings.gemini_api_key_enc) : null;
  const apiKey = stored ?? Deno.env.get("GEMINI_API_KEY") ?? null;
  const model = settings?.gemini_model || Deno.env.get("GEMINI_MODEL") || DEFAULT_MODEL;
  return { apiKey, model };
}

function buildBiaSystemPrompt(company: any, channel: any, knowledge: any[], quickReplies: any[], agentSettings: any = null) {
  const assistantName = agentSettings?.agent_name?.trim() || company?.ai_assistant_name?.trim() || "Bia";
  const assistantIntro = company?.ai_assistant_intro?.trim() || "assistente do Veltrani";
  const customPrompt = agentSettings?.system_prompt?.trim() || "";
  return [
    `Você é a ${assistantName}, ${assistantIntro}, e faz parte da equipe de atendimento da empresa ${company?.name ?? "do cliente"} no WhatsApp.`,
    customPrompt ? `\nInstruções exclusivas desta empresa (siga com prioridade máxima):\n${customPrompt}\n` : "",
    `Na primeira resposta de uma conversa, apresente-se sempre assim: "${assistantName}, ${assistantIntro}".`,
    "REGRA ABSOLUTA: nunca diga que é uma inteligência artificial, IA, robô, chatbot, bot, assistente virtual, sistema automático ou modelo de linguagem. Se perguntarem se você é um robô ou IA, responda apenas que é a " + assistantName + ", da equipe de atendimento, e siga ajudando.",
    "Responda em português do Brasil, em tom humano, caloroso, objetivo e comercial. Mensagens curtas, como uma atendente real digitando no WhatsApp.",
    "Use somente as informações cadastradas abaixo. Não invente preço, prazo, endereço, link ou política.",
    "Se não souber responder com segurança, diga: 'Vou chamar uma pessoa da equipe para confirmar isso com você, um instante!'",
    `Tom de comunicação da empresa: ${company?.communication_tone ?? "profissional"}.`,
    `Horário de atendimento: ${company?.business_hours ?? channel?.business_hours ?? "não cadastrado"}.`,
    `Serviços da empresa: ${company?.services_description ?? "não cadastrado"}.`,
    channel?.greeting_message ? `Mensagem de saudação da empresa: ${channel.greeting_message}` : "",
    "\nBase de conhecimento da empresa:",
    ...(knowledge ?? []).map((k: any) => `- ${k.title}: ${k.content}`),
    "\nRespostas rápidas aprovadas:",
    ...(quickReplies ?? []).map((q: any) => `- ${q.title}: ${q.message}`),
  ].filter(Boolean).join("\n");
}

// Gera a resposta da Bia para uma mensagem recebida e registra em ai_interactions.
// Retorna null quando não é seguro responder (handoff para humano).
export async function generateBiaReply(
  admin: any,
  channel: any,
  conversationId: string,
  userMessage: string,
  inboundMessageId: string,
  agentSettings: any = null,
): Promise<string | null> {
  const { apiKey, model } = await getGeminiConfig(admin, channel.company_id);
  if (!apiKey) {
    await admin.from("conversations").update({
      ai_handling: false,
      status: "pendente",
      handoff_reason: "Chave do Gemini não configurada em Configurações > Inteligência da Bia",
    }).eq("id", conversationId);
    return null;
  }

  if (agentSettings === null) {
    agentSettings = await getAgentSettings(admin, channel.company_id);
  }

  const [{ data: company }, { data: quickReplies }, { data: knowledge }, { data: history }] = await Promise.all([
    admin.from("companies").select("name, segment, business_hours, services_description, communication_tone, ai_assistant_name, ai_assistant_intro").eq("id", channel.company_id).maybeSingle(),
    admin.from("quick_replies").select("title, message, category").eq("company_id", channel.company_id).limit(20),
    admin.from("ai_knowledge_items").select("title, content").eq("company_id", channel.company_id).eq("is_active", true).limit(30),
    admin.from("messages").select("direction, content, created_at").eq("conversation_id", conversationId).order("created_at", { ascending: false }).limit(10),
  ]);

  const system = buildBiaSystemPrompt(company, channel, knowledge ?? [], quickReplies ?? [], agentSettings);

  const turns = (history ?? [])
    .reverse()
    .filter((m: any) => m.content && !String(m.content).startsWith("["))
    .map((m: any) => ({
      role: m.direction === "inbound" ? "user" : "model",
      parts: [{ text: String(m.content) }],
    }));
  // Garante que a conversa termina com a mensagem atual do usuário.
  if (!turns.length || turns[turns.length - 1].role !== "user" || turns[turns.length - 1].parts[0].text !== userMessage) {
    turns.push({ role: "user", parts: [{ text: userMessage }] });
  }

  const res = await fetch(`${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: turns,
      generationConfig: {
        temperature: agentSettings?.temperature ?? 0.4,
        maxOutputTokens: agentSettings?.max_tokens ?? 1024,
      },
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
      error_message: out?.error?.message ?? `Gemini HTTP ${res.status}`,
    });
    return null;
  }

  const reply = String(
    (out?.candidates?.[0]?.content?.parts ?? [])
      .map((p: any) => p?.text ?? "")
      .join("")
  ).trim();

  await admin.from("ai_interactions").insert({
    company_id: channel.company_id,
    channel_id: channel.id,
    conversation_id: conversationId,
    inbound_message_id: inboundMessageId,
    status: reply ? "completed" : "empty",
    model,
    prompt_tokens: out?.usageMetadata?.promptTokenCount ?? null,
    completion_tokens: out?.usageMetadata?.candidatesTokenCount ?? null,
    input: userMessage,
    output: reply,
  });

  return reply || null;
}
