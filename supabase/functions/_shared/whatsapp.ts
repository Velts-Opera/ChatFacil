import { cleanPhone } from "./http.ts";
import { decryptSecret } from "./crypto.ts";

export function graphBase() {
  const version = Deno.env.get("META_GRAPH_VERSION") ?? "v25.0";
  return `https://graph.facebook.com/${version}`;
}

export async function metaGet(path: string, accessToken: string) {
  const res = await fetch(`${graphBase()}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

export async function sendWhatsAppText(accessToken: string, phoneNumberId: string, to: string, message: string) {
  const res = await fetch(`${graphBase()}/${encodeURIComponent(phoneNumberId)}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: cleanPhone(to),
      type: "text",
      text: { preview_url: false, body: message },
    }),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

export async function upsertContactAndConversation(admin: any, params: {
  companyId: string;
  channelId: string;
  waId: string;
  name?: string;
  inbound?: boolean;
  lastMessage?: string;
}) {
  const now = new Date().toISOString();
  const waId = cleanPhone(params.waId);
  const displayName = params.name?.trim() || waId;

  let { data: contact } = await admin
    .from("contacts")
    .select("id")
    .eq("company_id", params.companyId)
    .eq("channel_id", params.channelId)
    .eq("wa_id", waId)
    .maybeSingle();

  if (!contact) {
    const { data, error } = await admin
      .from("contacts")
      .insert({
        company_id: params.companyId,
        channel_id: params.channelId,
        name: displayName,
        profile_name: displayName,
        phone: waId,
        wa_id: waId,
        source: "whatsapp",
        last_interaction_at: now,
      })
      .select("id")
      .single();
    if (error) throw error;
    contact = data;
  } else {
    await admin.from("contacts").update({
      name: displayName,
      profile_name: displayName,
      phone: waId,
      last_interaction_at: now,
      updated_at: now,
    }).eq("id", contact.id);
  }

  let { data: conversation } = await admin
    .from("conversations")
    .select("id, unread_count")
    .eq("company_id", params.companyId)
    .eq("channel_id", params.channelId)
    .eq("contact_id", contact.id)
    .neq("status", "resolvida")
    .maybeSingle();

  if (!conversation) {
    const { data, error } = await admin
      .from("conversations")
      .insert({
        company_id: params.companyId,
        channel_id: params.channelId,
        contact_id: contact.id,
        channel: "whatsapp",
        status: "aberta",
        ai_handling: false,
        last_message: params.lastMessage ?? null,
        last_message_direction: params.inbound ? "inbound" : "outbound",
        unread_count: params.inbound ? 1 : 0,
        last_message_at: now,
      })
      .select("id, unread_count")
      .single();
    if (error) throw error;
    conversation = data;
  } else if (params.lastMessage !== undefined) {
    await admin.from("conversations").update({
      status: "aberta",
      last_message: params.lastMessage,
      last_message_direction: params.inbound ? "inbound" : "outbound",
      unread_count: params.inbound ? Number(conversation.unread_count ?? 0) + 1 : 0,
      last_message_at: now,
      updated_at: now,
    }).eq("id", conversation.id);
  }

  return { contactId: contact.id as string, conversationId: conversation.id as string };
}

export function extractMessageText(msg: any) {
  const type = msg?.type ?? "text";
  if (type === "text") return msg?.text?.body ?? "";
  if (type === "button") return msg?.button?.text ?? "[botão]";
  if (type === "interactive") {
    return msg?.interactive?.button_reply?.title ?? msg?.interactive?.list_reply?.title ?? "[interativo]";
  }
  if (type === "image") return msg?.image?.caption ?? "[imagem]";
  if (type === "document") return msg?.document?.filename ?? "[documento]";
  if (type === "audio") return "[áudio]";
  if (type === "video") return msg?.video?.caption ?? "[vídeo]";
  if (type === "sticker") return "[figurinha]";
  return `[${type}]`;
}

export async function getChannelSecret(admin: any, channelId: string) {
  const { data, error } = await admin
    .from("channel_secrets")
    .select("access_token, app_secret, access_token_enc, app_secret_enc")
    .eq("channel_id", channelId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  // New production path: credentials encrypted with APP_ENCRYPTION_KEY.
  const encryptedAccessToken = data.access_token_enc ? await decryptSecret(data.access_token_enc) : null;
  const encryptedAppSecret = data.app_secret_enc ? await decryptSecret(data.app_secret_enc) : null;

  // Legacy fallback keeps old pilot installs working after migration. New connections write only encrypted values.
  return {
    access_token: encryptedAccessToken ?? data.access_token,
    app_secret: encryptedAppSecret ?? data.app_secret ?? null,
  } as { access_token: string; app_secret?: string | null };
}

export function maskToken(token: string) {
  if (!token) return null;
  if (token.length <= 10) return `${token.slice(0, 2)}...${token.slice(-2)}`;
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}
