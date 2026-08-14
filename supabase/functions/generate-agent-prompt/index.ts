import { requireUser } from "../_shared/auth.ts";
import { corsHeaders, json } from "../_shared/http.ts";

type Body = { profession?: string; business_context?: string; agent_name?: string };
function aiConfig() {
  const apiKey = (Deno.env.get("AI_API_KEY") ?? Deno.env.get("OPENAI_API_KEY") ?? "").trim();
  if (!apiKey) throw new Error("O provedor de IA do ChatFacil não está configurado.");
  const provider = (Deno.env.get("AI_PROVIDER") ?? "openai").trim().toLowerCase();
  const model = (
    Deno.env.get("AI_MODEL") ??
    Deno.env.get("OPENAI_MODEL") ??
    (provider === "alibaba" ? "qwen-plus" : "gpt-4o-mini")
  ).trim();
  const rawBase = (Deno.env.get("AI_BASE_URL") ?? "https://api.openai.com/v1").trim();
  const base = new URL(rawBase);
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash)
    throw new Error("Configuração do provedor de IA inválida.");
  base.pathname = `${base.pathname.replace(/\/+$/, "")}/chat/completions`;
  return { apiKey, model, url: base.toString() };
}
function clean(value: unknown, max: number) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const { companyId, admin } = await requireUser(req);
    const body = (await req.json().catch(() => ({}))) as Body;
    const profession = clean(body.profession || "geral", 80) || "geral";
    const businessContext = clean(body.business_context, 8000);
    const requestedName = clean(body.agent_name || "Assistente", 80) || "Assistente";
    const [
      { data: settings, error: settingsError },
      { data: company, error: companyError },
      { data: template, error: templateError },
    ] = await Promise.all([
      admin
        .from("ai_agent_settings")
        .select("id, is_system_locked, prompt_version")
        .eq("company_id", companyId)
        .maybeSingle(),
      admin
        .from("companies")
        .select("name, segment, business_hours, services_description, communication_tone")
        .eq("id", companyId)
        .maybeSingle(),
      admin
        .from("agent_profession_templates")
        .select("slug, name, base_instructions, discovery_questions")
        .eq("slug", profession)
        .eq("is_active", true)
        .maybeSingle(),
    ]);
    if (settingsError) throw settingsError;
    if (companyError) throw companyError;
    if (templateError) throw templateError;
    if (settings?.is_system_locked)
      return json(
        {
          error:
            "Este agente usa instruções fixas da operação e não pode ser sobrescrito pelo gerador.",
        },
        409,
      );
    let selectedTemplate = template;
    if (!selectedTemplate) {
      const { data, error } = await admin
        .from("agent_profession_templates")
        .select("slug, name, base_instructions, discovery_questions")
        .eq("slug", "geral")
        .maybeSingle();
      if (error) throw error;
      selectedTemplate = data;
    }
    if (!selectedTemplate) throw new Error("Template de profissão não encontrado.");
    const { apiKey, model, url } = aiConfig();
    const source = {
      company_name: company?.name ?? "Empresa",
      segment: company?.segment ?? profession,
      business_hours: company?.business_hours ?? "não informado",
      services: company?.services_description ?? "não informado",
      communication_tone: company?.communication_tone ?? "profissional",
      profession_template: selectedTemplate.name,
      base_instructions: selectedTemplate.base_instructions,
      client_answers: businessContext || "nenhuma informação adicional",
      agent_name: requestedName,
    };
    const system = [
      "Você é um arquiteto de prompts de atendimento empresarial do ChatFacil.",
      "Gere SOMENTE o prompt final do agente, em português do Brasil, sem Markdown de introdução e sem explicar seu raciocínio.",
      "O prompt deve ser operacional, específico para a empresa e pronto para uso em WhatsApp, Instagram, e-mail e voz.",
      "Preserve os limites profissionais do template. Não invente capacidades, preços, agenda, políticas, integrações ou informações que não foram fornecidas.",
      "Inclua regras para: entender intenção, coletar dados progressivamente, não repetir perguntas já respondidas, qualificar novos interessados, usar apenas a base cadastrada, handoff humano e proteção contra promessas indevidas.",
      "Instrua o agente a ser transparente quando não souber algo e a encaminhar para humano quando houver decisão profissional, exceção ou informação ausente.",
      "Nunca coloque segredos, tokens, chaves, IDs técnicos ou credenciais no prompt.",
      "Não fixe o nome ChatFacil como empresa atendida; use os dados recebidos.",
    ].join("\n");
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.25,
        max_tokens: 1800,
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: `Dados para montar o agente:\n${JSON.stringify(source, null, 2)}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(
        result?.error?.message ?? `Falha ao gerar o agente (HTTP ${response.status}).`,
      );
    const generated = clean(result?.choices?.[0]?.message?.content, 24000);
    if (generated.length < 120)
      throw new Error("A IA não retornou um prompt válido. Tente novamente.");
    const now = new Date().toISOString();
    const nextVersion = Number(settings?.prompt_version ?? 0) + 1;
    const { error: saveError } = await admin
      .from("ai_agent_settings")
      .upsert(
        {
          company_id: companyId,
          agent_name: requestedName,
          profession,
          business_context: businessContext,
          system_prompt: generated,
          prompt_source: "ai_generated",
          prompt_generated_at: now,
          prompt_version: nextVersion,
          updated_at: now,
        },
        { onConflict: "company_id" },
      );
    if (saveError) throw saveError;
    await admin
      .from("audit_logs")
      .insert({
        company_id: companyId,
        action: "ai_agent_prompt_generated",
        resource_type: "ai_agent_settings",
        resource_id: settings?.id ?? null,
        metadata: { profession, model, prompt_version: nextVersion },
      });
    return json({ ok: true, prompt: generated, profession, prompt_version: nextVersion });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado";
    const status = message === "Unauthorized" || message.includes("Authorization") ? 401 : 500;
    return json({ error: message }, status);
  }
});
