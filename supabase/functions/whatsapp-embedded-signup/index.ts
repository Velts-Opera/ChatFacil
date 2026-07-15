import { adminClient, requireUser } from "../_shared/auth.ts";
import { encryptSecret } from "../_shared/crypto.ts";
import { corsHeaders, json, requiredEnv } from "../_shared/http.ts";
import { graphBase, maskToken } from "../_shared/whatsapp.ts";

type Action = "create" | "status" | "complete";

interface RequestBody {
  action?: Action;
  token?: string;
  code?: string;
  waba_id?: string;
  phone_number_id?: string;
}

interface MetaConfig {
  appId: string;
  appSecret: string;
  configurationId: string;
  graphVersion: string;
  webhookVerifyToken: string;
}

class OnboardingConflictError extends Error {}

function metaConfig(): MetaConfig {
  return {
    appId: requiredEnv("META_APP_ID"),
    appSecret: requiredEnv("META_APP_SECRET"),
    configurationId: requiredEnv("META_EMBEDDED_SIGNUP_CONFIG_ID"),
    graphVersion: Deno.env.get("META_GRAPH_VERSION") ?? "v25.0",
    webhookVerifyToken: requiredEnv("META_WEBHOOK_VERIFY_TOKEN"),
  };
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function loadSession(admin: any, token: string) {
  if (!token || token.length < 32) return null;
  const tokenHash = await hashToken(token);
  const { data, error } = await admin
    .from("whatsapp_onboarding_sessions")
    .select("*")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  if (["pending", "authorizing"].includes(data.status) && new Date(data.expires_at).getTime() <= Date.now()) {
    await admin
      .from("whatsapp_onboarding_sessions")
      .update({ status: "expired", last_error: "Link de onboarding expirado" })
      .eq("id", data.id);
    return { ...data, status: "expired", last_error: "Link de onboarding expirado" };
  }

  return data;
}

async function metaJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error?.message || `Meta API retornou HTTP ${response.status}`;
    throw new Error(message);
  }
  return body;
}

async function exchangeCode(config: MetaConfig, code: string) {
  const query = new URLSearchParams({
    client_id: config.appId,
    client_secret: config.appSecret,
    code,
  });
  const result = await metaJson(`${graphBase()}/oauth/access_token?${query.toString()}`);
  if (!result?.access_token) throw new Error("A Meta não retornou o token da empresa");
  return result.access_token as string;
}

async function completeOnboarding(admin: any, session: any, body: RequestBody, config: MetaConfig) {
  const code = body.code?.trim();
  const wabaId = body.waba_id?.trim();
  const phoneNumberId = body.phone_number_id?.trim();
  if (!code || !wabaId || !phoneNumberId) {
    throw new Error("Código, WABA ID e Phone Number ID são obrigatórios");
  }

  const { data: locked, error: lockError } = await admin
    .from("whatsapp_onboarding_sessions")
    .update({ status: "authorizing", last_error: null })
    .eq("id", session.id)
    .in("status", ["pending", "error"])
    .select("id")
    .maybeSingle();
  if (lockError) throw lockError;
  if (!locked) throw new OnboardingConflictError("Este onboarding já está sendo processado ou foi concluído");

  const accessToken = await exchangeCode(config, code);
  const phone = await metaJson(
    `${graphBase()}/${encodeURIComponent(phoneNumberId)}?fields=id,display_phone_number,verified_name,quality_rating`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  await metaJson(`${graphBase()}/${encodeURIComponent(wabaId)}/subscribed_apps`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const { data: existing, error: existingError } = await admin
    .from("channels")
    .select("id, company_id, connected_at")
    .eq("phone_number_id", phoneNumberId)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing && existing.company_id !== session.company_id) {
    throw new Error("Este número já está vinculado a outra empresa");
  }

  const now = new Date().toISOString();
  const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-webhook`;
  const channelPayload = {
    company_id: session.company_id,
    type: "whatsapp",
    provider: "meta_cloud_api",
    name: phone.verified_name || "WhatsApp oficial",
    status: "connecting",
    phone_number: phone.display_phone_number ?? null,
    phone_number_id: phoneNumberId,
    waba_id: wabaId,
    verify_token: config.webhookVerifyToken,
    webhook_url: webhookUrl,
    verified_name: phone.verified_name ?? null,
    quality_rating: phone.quality_rating ?? null,
    app_secret_present: true,
    access_token: null,
    last_error: null,
    last_error_code: null,
    connected_at: existing?.connected_at ?? now,
    last_sync_at: now,
    created_by: session.created_by,
  };

  let channelId = existing?.id as string | undefined;
  if (channelId) {
    const { error } = await admin
      .from("channels")
      .update(channelPayload)
      .eq("id", channelId)
      .eq("company_id", session.company_id);
    if (error) throw error;
  } else {
    const { data, error } = await admin
      .from("channels")
      .insert(channelPayload)
      .select("id")
      .single();
    if (error) throw error;
    channelId = data.id;
  }

  const { error: secretError } = await admin.from("channel_secrets").upsert({
    channel_id: channelId,
    access_token: null,
    app_secret: null,
    access_token_enc: await encryptSecret(accessToken),
    app_secret_enc: await encryptSecret(config.appSecret),
    token_hint: maskToken(accessToken),
    encryption_version: "v1:aes-gcm",
    updated_at: now,
  }, { onConflict: "channel_id" });
  if (secretError) throw secretError;

  const { error: connectedError } = await admin
    .from("channels")
    .update({ status: "connected", last_error: null, last_error_code: null })
    .eq("id", channelId)
    .eq("company_id", session.company_id);
  if (connectedError) throw connectedError;

  const { error: sessionError } = await admin
    .from("whatsapp_onboarding_sessions")
    .update({
      status: "completed",
      channel_id: channelId,
      waba_id: wabaId,
      phone_number_id: phoneNumberId,
      completed_at: now,
      last_error: null,
    })
    .eq("id", session.id);
  if (sessionError) throw sessionError;

  await admin.from("audit_logs").insert({
    company_id: session.company_id,
    user_id: session.created_by,
    action: existing ? "whatsapp_embedded_signup_reconnected" : "whatsapp_embedded_signup_connected",
    resource_type: "channel",
    resource_id: channelId,
    metadata: { waba_id: wabaId, phone_number_id: phoneNumberId },
  });

  return {
    channel_id: channelId,
    phone_number: phone.display_phone_number ?? null,
    verified_name: phone.verified_name ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let sessionId: string | null = null;
  let admin: any = null;
  try {
    const body = (await req.json().catch(() => ({}))) as RequestBody;

    if (body.action === "create") {
      const context = await requireUser(req);
      const config = metaConfig();
      requiredEnv("APP_ENCRYPTION_KEY");
      admin = context.admin;

      const token = randomToken();
      const expiresAt = new Date(Date.now() + 20 * 60 * 1000).toISOString();
      const { data, error } = await admin
        .from("whatsapp_onboarding_sessions")
        .insert({
          company_id: context.companyId,
          created_by: context.user.id,
          token_hash: await hashToken(token),
          status: "pending",
          expires_at: expiresAt,
        })
        .select("id")
        .single();
      if (error) throw error;

      return json({
        ok: true,
        onboarding_token: token,
        expires_at: expiresAt,
        meta: {
          app_id: config.appId,
          configuration_id: config.configurationId,
          graph_version: config.graphVersion,
        },
      });
    }

    if (body.action === "status") {
      admin = adminClient();
      const session = await loadSession(admin, body.token ?? "");
      if (!session) return json({ error: "Onboarding não encontrado" }, 404);
      const config = metaConfig();
      return json({
        ok: true,
        status: session.status,
        expires_at: session.expires_at,
        phone_number_id: session.status === "completed" ? session.phone_number_id : null,
        last_error: session.last_error,
        meta: {
          app_id: config.appId,
          configuration_id: config.configurationId,
          graph_version: config.graphVersion,
        },
      });
    }

    if (body.action === "complete") {
      admin = adminClient();
      const session = await loadSession(admin, body.token ?? "");
      if (!session) return json({ error: "Onboarding não encontrado" }, 404);
      sessionId = session.id;
      if (session.status === "completed") return json({ ok: true, status: "completed", channel_id: session.channel_id });
      if (session.status === "expired") return json({ error: "Link de onboarding expirado" }, 410);

      const result = await completeOnboarding(admin, session, body, metaConfig());
      return json({ ok: true, status: "completed", ...result });
    }

    return json({ error: "Ação inválida" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("whatsapp-embedded-signup error", error);
    if (admin && sessionId && !(error instanceof OnboardingConflictError)) {
      await admin
        .from("whatsapp_onboarding_sessions")
        .update({ status: "error", last_error: message.slice(0, 500) })
        .eq("id", sessionId)
        .neq("status", "completed");
    }
    const status = error instanceof OnboardingConflictError
      ? 409
      : message === "Unauthorized" || message.includes("Authorization")
        ? 401
        : 500;
    return json({ error: message }, status);
  }
});
