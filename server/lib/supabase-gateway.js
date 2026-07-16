import { ApiError } from "./api-error.js";

function encode(value) {
  return encodeURIComponent(String(value));
}

function cleanPhone(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function serverHeaders(key) {
  return {
    apikey: key,
    ...(key.startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${key}` }),
    "Content-Type": "application/json",
  };
}

async function responseBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function createSupabaseGateway({
  supabaseUrl,
  anonKey,
  serviceRoleKey,
  fetchImpl = globalThis.fetch,
}) {
  const baseUrl = String(supabaseUrl ?? "").replace(/\/$/, "");
  if (!baseUrl || !anonKey || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL, SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY são obrigatórias.",
    );
  }

  async function rest(path, init = {}) {
    const response = await fetchImpl(`${baseUrl}/rest/v1/${path}`, {
      ...init,
      headers: { ...serverHeaders(serviceRoleKey), ...(init.headers ?? {}) },
    });
    const body = await responseBody(response);
    if (!response.ok) {
      const message =
        typeof body === "string" ? body : body?.message || body?.hint || JSON.stringify(body);
      const error = new Error(`Supabase ${response.status}: ${message}`);
      error.publicMessage = "Falha ao consultar os dados do canal no Supabase.";
      throw error;
    }
    return body;
  }

  async function one(path, init) {
    const body = await rest(path, init);
    return Array.isArray(body) ? (body[0] ?? null) : body;
  }

  async function validateAccessToken(token) {
    const response = await fetchImpl(`${baseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    });
    const body = await responseBody(response);
    if (!response.ok || !body?.id) {
      throw new ApiError(
        401,
        "INVALID_ACCESS_TOKEN",
        "Token de acesso inválido ou expirado. Entre novamente.",
      );
    }
    return body;
  }

  async function getCompanyId(userId) {
    const profile = await one(`profiles?select=company_id&id=eq.${encode(userId)}&limit=1`);
    if (!profile?.company_id) {
      throw new ApiError(
        403,
        "COMPANY_NOT_ASSIGNED",
        "O usuário autenticado não está associado a uma empresa.",
      );
    }
    return profile.company_id;
  }

  async function getChannel(channelId) {
    return one(
      `channels?select=id,company_id,provider,status,phone_number,phone_number_id,waba_id,agent_id,ai_enabled,auto_reply_enabled&id=eq.${encode(channelId)}&limit=1`,
    );
  }

  async function authorizeChannel(token, channelId) {
    const user = await validateAccessToken(token);
    const companyId = await getCompanyId(user.id);
    const channel = await getChannel(channelId);
    if (!channel) {
      throw new ApiError(404, "CHANNEL_NOT_FOUND", "Canal não encontrado.");
    }
    if (channel.company_id !== companyId) {
      throw new ApiError(403, "CHANNEL_FORBIDDEN", "Este canal pertence a outra empresa.");
    }
    return { user, companyId, channel, token };
  }

  async function updateChannel(channelId, values) {
    await rest(`channels?id=eq.${encode(channelId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ ...values, updated_at: new Date().toISOString() }),
    });
  }

  async function resolveDestination({ companyId, channelId, to, conversationId }) {
    let phone = cleanPhone(to);
    let contactName;
    let resolvedConversationId = conversationId ?? null;
    if (conversationId) {
      const conversation = await one(
        `conversations?select=id,contact_id&company_id=eq.${encode(companyId)}&channel_id=eq.${encode(channelId)}&id=eq.${encode(conversationId)}&limit=1`,
      );
      if (!conversation)
        throw new ApiError(
          404,
          "CONVERSATION_NOT_FOUND",
          "Conversa não encontrada para este canal.",
        );
      const contact = await one(
        `contacts?select=id,wa_id,phone,name&company_id=eq.${encode(companyId)}&id=eq.${encode(conversation.contact_id)}&limit=1`,
      );
      phone = cleanPhone(contact?.wa_id || contact?.phone || phone);
      contactName = contact?.name;
    }
    if (!phone || phone.length < 10) {
      throw new ApiError(
        400,
        "INVALID_DESTINATION",
        "Telefone destino inválido. Use DDI + DDD + número.",
      );
    }
    return { to: phone, contactName, conversationId: resolvedConversationId };
  }

  async function recordQrOutbound({ channel, destination, message, providerMessageId }) {
    const now = new Date().toISOString();
    let contact = await one(
      `contacts?select=id&company_id=eq.${encode(channel.company_id)}&channel_id=eq.${encode(channel.id)}&wa_id=eq.${encode(destination.to)}&limit=1`,
    );
    if (!contact) {
      contact = await one("contacts", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          company_id: channel.company_id,
          channel_id: channel.id,
          name: destination.contactName || destination.to,
          profile_name: destination.contactName || destination.to,
          phone: destination.to,
          wa_id: destination.to,
          source: "whatsapp_qr",
          last_interaction_at: now,
        }),
      });
    }

    let conversation = destination.conversationId
      ? await one(
          `conversations?select=id&company_id=eq.${encode(channel.company_id)}&channel_id=eq.${encode(channel.id)}&id=eq.${encode(destination.conversationId)}&limit=1`,
        )
      : await one(
          `conversations?select=id&company_id=eq.${encode(channel.company_id)}&channel_id=eq.${encode(channel.id)}&contact_id=eq.${encode(contact.id)}&status=neq.resolvida&limit=1`,
        );
    if (!conversation) {
      conversation = await one("conversations", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({
          company_id: channel.company_id,
          channel_id: channel.id,
          contact_id: contact.id,
          channel: "whatsapp",
          status: "aberta",
          ai_handling: false,
          last_message: message,
          last_message_direction: "outbound",
          unread_count: 0,
          last_message_at: now,
        }),
      });
    } else {
      await rest(
        `conversations?id=eq.${encode(conversation.id)}&company_id=eq.${encode(channel.company_id)}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            last_message: message,
            last_message_direction: "outbound",
            last_message_at: now,
            updated_at: now,
          }),
        },
      );
    }

    const saved = await one("messages", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        company_id: channel.company_id,
        channel_id: channel.id,
        conversation_id: conversation.id,
        contact_id: contact.id,
        direction: "outbound",
        sender_type: "agent",
        content: message,
        message_type: "text",
        status: "sent",
        meta_message_id: providerMessageId ?? null,
        raw_payload: { provider: "baileys" },
      }),
    });
    await updateChannel(channel.id, { last_sync_at: now });
    return { conversationId: conversation.id, messageId: saved?.id ?? null };
  }

  async function sendMetaMessage(token, body) {
    const response = await fetchImpl(`${baseUrl}/functions/v1/whatsapp-send-message`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const data = await responseBody(response);
    if (!response.ok || !data?.ok) {
      const message = data?.error || `API oficial da Meta retornou HTTP ${response.status}.`;
      const status =
        response.status === 429 ? 429 : response.status >= 500 ? 500 : response.status || 409;
      throw new ApiError(status, "META_SEND_FAILED", message);
    }
    return data;
  }

  return {
    authorizeChannel,
    getChannel,
    recordQrOutbound,
    resolveDestination,
    sendMetaMessage,
    updateChannel,
    async canRestoreChannel(channelId) {
      const channel = await getChannel(channelId);
      return channel?.provider === "qr_code";
    },
  };
}
