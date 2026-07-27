import { requireUser } from "../_shared/auth.ts";
import { corsHeaders, json } from "../_shared/http.ts";
import { getChannelSecret, graphBase } from "../_shared/whatsapp.ts";

type Action =
  | "status"
  | "check_eligibility"
  | "onboard"
  | "configure_from_chatfacil"
  | "set_rollout";

type RequestBody = {
  action?: Action;
  channel_id?: string;
  enabled?: boolean;
  audience?: "ALLOWLISTED_ONLY" | "NEW_CUSTOMERS" | "ALL";
};

type MetaApiResult = {
  ok: boolean;
  status: number;
  body: any;
};

function businessAgentBase() {
  return (Deno.env.get("META_BUSINESS_AGENT_API_BASE_URL") ?? "https://api.facebook.com").replace(/\/+$/, "");
}

function businessAgentVersion() {
  return Deno.env.get("META_BUSINESS_AGENT_API_VERSION") ?? "2.0.0";
}

async function metaAgentRequest(
  phoneNumberId: string,
  path: string,
  accessToken: string,
  init: RequestInit = {},
): Promise<MetaApiResult> {
  const url = `${businessAgentBase()}/${encodeURIComponent(phoneNumberId)}/${path.replace(/^\/+/, "")}`;
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.set("X-API-Version", businessAgentVersion());
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");

  const response = await fetch(url, { ...init, headers });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body };
}

function errorMessage(result: MetaApiResult) {
  return String(
    result.body?.error?.message ??
      result.body?.message ??
      `Meta Business Agent API retornou HTTP ${result.status}`,
  );
}

function readEligibility(body: any): boolean | null {
  const candidates = [
    body?.eligible,
    body?.is_eligible,
    body?.data?.eligible,
    body?.data?.is_eligible,
    body?.agent_eligible,
  ];
  for (const value of candidates) {
    if (typeof value === "boolean") return value;
  }

  const status = String(body?.status ?? body?.data?.status ?? "").toLowerCase();
  if (["eligible", "available", "ready"].includes(status)) return true;
  if (["ineligible", "unavailable", "not_eligible"].includes(status)) return false;
  return null;
}

function managerUrl(channel: any) {
  if (!channel?.business_portfolio_id || !channel?.waba_id) return null;
  const params = new URLSearchParams({
    business_id: channel.business_portfolio_id,
    asset_id: channel.waba_id,
  });
  return `https://business.facebook.com/latest/whatsapp_manager/business_ai?${params.toString()}`;
}

async function loadChannel(admin: any, companyId: string, channelId?: string) {
  let query = admin
    .from("channels")
    .select("id, company_id, provider, status, phone_number, phone_number_id, waba_id, business_portfolio_id, ai_enabled, auto_reply_enabled, meta_business_agent_status, meta_business_agent_eligible, meta_business_agent_enabled, meta_business_agent_last_checked_at, meta_business_agent_last_error, meta_business_agent_previous_ai_enabled, meta_business_agent_previous_auto_reply_enabled")
    .eq("company_id", companyId)
    .eq("type", "whatsapp")
    .eq("provider", "meta_cloud_api");

  query = channelId
    ? query.eq("id", channelId)
    : query.order("created_at", { ascending: false }).limit(1);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Canal WhatsApp oficial não encontrado");
  if (!data.phone_number_id || !data.waba_id) throw new Error("Canal oficial sem Phone Number ID ou WABA ID");
  return data;
}

async function resolveBusinessPortfolioId(admin: any, channel: any, accessToken: string) {
  if (channel.business_portfolio_id) return channel.business_portfolio_id as string;

  const response = await fetch(
    `${graphBase()}/${encodeURIComponent(channel.waba_id)}?fields=owner_business_info`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const body = await response.json().catch(() => ({}));
  const businessId = body?.owner_business_info?.id;
  if (!response.ok || !businessId) return null;

  await admin
    .from("channels")
    .update({ business_portfolio_id: String(businessId), updated_at: new Date().toISOString() })
    .eq("id", channel.id)
    .eq("company_id", channel.company_id);

  channel.business_portfolio_id = String(businessId);
  return String(businessId);
}

async function saveAgentState(admin: any, channel: any, patch: Record<string, unknown>) {
  const now = new Date().toISOString();
  const { error } = await admin
    .from("channels")
    .update({ ...patch, meta_business_agent_last_checked_at: now, updated_at: now })
    .eq("id", channel.id)
    .eq("company_id", channel.company_id);
  if (error) throw error;
  Object.assign(channel, patch, { meta_business_agent_last_checked_at: now });
}

async function checkEligibility(admin: any, channel: any, accessToken: string) {
  const result = await metaAgentRequest(channel.phone_number_id, "agent_eligibility", accessToken);
  if (!result.ok) {
    const message = errorMessage(result);
    const termsRequired = result.status === 403 && /terms|termos|service must be accepted/i.test(message);
    await saveAgentState(admin, channel, {
      meta_business_agent_status: termsRequired ? "terms_required" : "error",
      meta_business_agent_eligible: null,
      meta_business_agent_last_error: message.slice(0, 1000),
    });
    return { ok: false, terms_required: termsRequired, error: message, meta_status: result.status };
  }

  const eligible = readEligibility(result.body);
  await saveAgentState(admin, channel, {
    meta_business_agent_status: eligible === false ? "ineligible" : "eligible",
    meta_business_agent_eligible: eligible,
    meta_business_agent_last_error: null,
  });
  return { ok: true, eligible, response: result.body };
}

async function configureFromChatFacil(admin: any, channel: any, accessToken: string) {
  const [{ data: company, error: companyError }, { data: agent, error: agentError }] = await Promise.all([
    admin
      .from("companies")
      .select("name, segment, business_hours, services_description, communication_tone")
      .eq("id", channel.company_id)
      .maybeSingle(),
    admin
      .from("ai_agent_settings")
      .select("agent_name, system_prompt, handoff_keywords")
      .eq("company_id", channel.company_id)
      .maybeSingle(),
  ]);
  if (companyError) throw companyError;
  if (agentError) throw agentError;

  const description = [
    company?.name ? `Empresa: ${company.name}.` : null,
    company?.segment ? `Segmento: ${company.segment}.` : null,
    company?.services_description ? `Serviços: ${company.services_description}` : null,
  ].filter(Boolean).join("\n");

  const businessInfo = await metaAgentRequest(channel.phone_number_id, "agent_config/business_info", accessToken, {
    method: "PUT",
    body: JSON.stringify({
      business_description: description || "Informações comerciais cadastradas no ChatFacil.",
      hours_of_operation: company?.business_hours ?? undefined,
    }),
  });
  if (!businessInfo.ok) throw new Error(errorMessage(businessInfo));

  // Skills are created only while moving from onboarding to configured, avoiding
  // duplicate skills if the user re-syncs the idempotent business/settings data.
  const instructions = [
    agent?.agent_name ? `Você se apresenta como ${agent.agent_name}.` : null,
    company?.communication_tone ? `Use tom ${company.communication_tone}.` : null,
    agent?.system_prompt || null,
    Array.isArray(agent?.handoff_keywords) && agent.handoff_keywords.length
      ? `Transfira para humano quando houver: ${agent.handoff_keywords.join(", ")}.`
      : null,
  ].filter(Boolean).join("\n");

  if (instructions && channel.meta_business_agent_status === "onboarding") {
    const skill = await metaAgentRequest(channel.phone_number_id, "agent_config/skills", accessToken, {
      method: "POST",
      body: JSON.stringify({
        title: "chatfacil-core-behavior",
        description: "Regras de atendimento importadas do ChatFacil.",
        skill: instructions,
      }),
    });
    if (!skill.ok) throw new Error(errorMessage(skill));
  }

  const settings = await metaAgentRequest(channel.phone_number_id, "agent_config/settings", accessToken, {
    method: "PUT",
    body: JSON.stringify({
      rollout: { enabled: false },
      ai_audience: "ALLOWLISTED_ONLY",
      handoff: { enabled: true, message: "Vou transferir você para uma pessoa da equipe." },
      followup: { enabled: false },
    }),
  });
  if (!settings.ok) throw new Error(errorMessage(settings));

  await saveAgentState(admin, channel, {
    meta_business_agent_status: "configured",
    meta_business_agent_enabled: false,
    meta_business_agent_last_error: null,
  });

  return { business_info: businessInfo.body, settings: settings.body };
}

async function saveRolloutState(admin: any, channel: any, enabled: boolean) {
  if (enabled) {
    const previousAiEnabled = channel.meta_business_agent_enabled
      ? channel.meta_business_agent_previous_ai_enabled
      : Boolean(channel.ai_enabled);
    const previousAutoReplyEnabled = channel.meta_business_agent_enabled
      ? channel.meta_business_agent_previous_auto_reply_enabled
      : Boolean(channel.auto_reply_enabled);

    await saveAgentState(admin, channel, {
      meta_business_agent_status: "enabled",
      meta_business_agent_enabled: true,
      meta_business_agent_previous_ai_enabled: previousAiEnabled,
      meta_business_agent_previous_auto_reply_enabled: previousAutoReplyEnabled,
      ai_enabled: false,
      auto_reply_enabled: false,
      meta_business_agent_last_error: null,
    });
    return;
  }

  await saveAgentState(admin, channel, {
    meta_business_agent_status: "configured",
    meta_business_agent_enabled: false,
    ai_enabled: channel.meta_business_agent_previous_ai_enabled ?? Boolean(channel.ai_enabled),
    auto_reply_enabled: channel.meta_business_agent_previous_auto_reply_enabled ?? Boolean(channel.auto_reply_enabled),
    meta_business_agent_previous_ai_enabled: null,
    meta_business_agent_previous_auto_reply_enabled: null,
    meta_business_agent_last_error: null,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const context = await requireUser(req);
    const body = (await req.json().catch(() => ({}))) as RequestBody;
    const channel = await loadChannel(context.admin, context.companyId, body.channel_id);
    const secret = await getChannelSecret(context.admin, channel.id);
    if (!secret?.access_token) return json({ error: "Token oficial da Meta não encontrado para este canal" }, 409);

    await resolveBusinessPortfolioId(context.admin, channel, secret.access_token);

    if (body.action === "status" || !body.action) {
      return json({ ok: true, channel, manager_url: managerUrl(channel), api_version: businessAgentVersion() });
    }

    if (body.action === "check_eligibility") {
      const result = await checkEligibility(context.admin, channel, secret.access_token);
      return json({ ...result, manager_url: managerUrl(channel) }, result.ok ? 200 : result.terms_required ? 409 : 502);
    }

    if (body.action === "onboard") {
      const eligibility = await checkEligibility(context.admin, channel, secret.access_token);
      if (!eligibility.ok) {
        return json({ ...eligibility, manager_url: managerUrl(channel) }, eligibility.terms_required ? 409 : 502);
      }
      if (eligibility.eligible === false) return json({ error: "Este número não está elegível para o Meta Business Agent" }, 409);

      const result = await metaAgentRequest(channel.phone_number_id, "agent_onboarding?channel=whatsapp", secret.access_token, { method: "POST" });
      if (!result.ok) {
        const message = errorMessage(result);
        await saveAgentState(context.admin, channel, {
          meta_business_agent_status: "error",
          meta_business_agent_last_error: message.slice(0, 1000),
        });
        return json({ error: message, response: result.body }, 502);
      }

      await saveAgentState(context.admin, channel, {
        meta_business_agent_status: "onboarding",
        meta_business_agent_eligible: true,
        meta_business_agent_last_error: null,
      });
      return json({ ok: true, response: result.body, manager_url: managerUrl(channel) });
    }

    if (body.action === "configure_from_chatfacil") {
      const result = await configureFromChatFacil(context.admin, channel, secret.access_token);
      return json({ ok: true, ...result, manager_url: managerUrl(channel) });
    }

    if (body.action === "set_rollout") {
      if (typeof body.enabled !== "boolean") return json({ error: "enabled deve ser boolean" }, 400);
      const audience = body.audience ?? "ALLOWLISTED_ONLY";
      const result = await metaAgentRequest(channel.phone_number_id, "agent_config/settings", secret.access_token, {
        method: "PUT",
        body: JSON.stringify({
          rollout: { enabled: body.enabled },
          ai_audience: audience,
          handoff: { enabled: true, message: "Vou transferir você para uma pessoa da equipe." },
        }),
      });
      if (!result.ok) return json({ error: errorMessage(result), response: result.body }, 502);

      await saveRolloutState(context.admin, channel, body.enabled);
      return json({ ok: true, enabled: body.enabled, audience, response: result.body });
    }

    return json({ error: "Ação inválida" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("meta-business-agent error", error);
    const status = /Unauthorized|Missing Authorization/i.test(message) ? 401 : 500;
    return json({ error: message }, status);
  }
});