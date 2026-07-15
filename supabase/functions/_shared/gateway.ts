// Cliente do gateway WhatsApp via QR Code (protocolo Evolution API v2, com fallback v1).
// O gateway mantém a sessão do WhatsApp Web; estas funções orquestram instância, QR,
// status, webhook e envio de mensagens.
import { cleanPhone } from "./http.ts";
import { decryptSecret } from "./crypto.ts";

export type GatewayConfig = { url: string; apiKey: string };

function baseUrl(url: string) {
  return url.replace(/\/+$/, "");
}

async function gwFetch(cfg: GatewayConfig, path: string, init?: RequestInit) {
  const res = await fetch(`${baseUrl(cfg.url)}${path}`, {
    ...init,
    headers: {
      apikey: cfg.apiKey,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

export function gatewayErrorMessage(result: { status: number; json: any }, fallback: string) {
  const j = result.json ?? {};
  const raw = j?.response?.message ?? j?.message ?? j?.error ?? fallback;
  const msg = Array.isArray(raw) ? raw.map((m) => (typeof m === "string" ? m : JSON.stringify(m))).join("; ") : String(raw);
  return `${msg} (HTTP ${result.status})`;
}

// Configuração do gateway: primeiro os segredos do canal, depois o padrão da empresa,
// por fim variáveis de ambiente do projeto.
export async function getGatewayConfig(admin: any, channelId: string | null, companyId: string): Promise<GatewayConfig | null> {
  if (channelId) {
    const { data } = await admin
      .from("channel_secrets")
      .select("gateway_url, gateway_key_enc")
      .eq("channel_id", channelId)
      .maybeSingle();
    if (data?.gateway_url && data?.gateway_key_enc) {
      const apiKey = await decryptSecret(data.gateway_key_enc);
      if (apiKey) return { url: data.gateway_url, apiKey };
    }
  }

  const { data: settings } = await admin
    .from("integration_settings")
    .select("gateway_url, gateway_key_enc")
    .eq("company_id", companyId)
    .maybeSingle();
  if (settings?.gateway_url && settings?.gateway_key_enc) {
    const apiKey = await decryptSecret(settings.gateway_key_enc);
    if (apiKey) return { url: settings.gateway_url, apiKey };
  }

  const envUrl = Deno.env.get("EVOLUTION_API_URL");
  const envKey = Deno.env.get("EVOLUTION_API_KEY");
  if (envUrl && envKey) return { url: envUrl, apiKey: envKey };

  return null;
}

export async function createInstance(cfg: GatewayConfig, instanceName: string) {
  // v2 aceita "integration"; v1 ignora campos extras conhecidos, mas pode rejeitar — tenta com e sem.
  let result = await gwFetch(cfg, "/instance/create", {
    method: "POST",
    body: JSON.stringify({ instanceName, qrcode: true, integration: "WHATSAPP-BAILEYS" }),
  });
  if (!result.ok && result.status === 400) {
    result = await gwFetch(cfg, "/instance/create", {
      method: "POST",
      body: JSON.stringify({ instanceName, qrcode: true }),
    });
  }
  // 403/409 com "already in use" = instância já existe; tratamos como sucesso idempotente.
  if (!result.ok) {
    const msg = JSON.stringify(result.json ?? {}).toLowerCase();
    if (msg.includes("already") || msg.includes("in use") || msg.includes("exists")) {
      return { ok: true, status: result.status, json: result.json, existed: true };
    }
  }
  return { ...result, existed: false };
}

export async function connectInstance(cfg: GatewayConfig, instanceName: string) {
  // Retorna QR: { base64?, code?, pairingCode? } (v2) ou { qrcode: { base64, code } } (variações)
  const result = await gwFetch(cfg, `/instance/connect/${encodeURIComponent(instanceName)}`);
  const j = result.json ?? {};
  const base64 = j?.base64 ?? j?.qrcode?.base64 ?? null;
  const code = j?.code ?? j?.qrcode?.code ?? null;
  const pairingCode = j?.pairingCode ?? j?.qrcode?.pairingCode ?? null;
  return { ...result, qr: { base64, code, pairingCode } };
}

export async function connectionState(cfg: GatewayConfig, instanceName: string) {
  const result = await gwFetch(cfg, `/instance/connectionState/${encodeURIComponent(instanceName)}`);
  const j = result.json ?? {};
  const state: string | null = j?.instance?.state ?? j?.state ?? null;
  return { ...result, state };
}

export async function fetchInstanceInfo(cfg: GatewayConfig, instanceName: string) {
  const result = await gwFetch(cfg, `/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`);
  const j = result.json;
  const item = Array.isArray(j) ? j[0] : j;
  const inst = item?.instance ?? item ?? {};
  const ownerJid: string | null = inst?.ownerJid ?? inst?.owner ?? null;
  const profileName: string | null = inst?.profileName ?? inst?.profile?.name ?? null;
  const number = ownerJid ? cleanPhone(String(ownerJid).split("@")[0]) : null;
  return { ...result, number, profileName };
}

export async function setInstanceWebhook(cfg: GatewayConfig, instanceName: string, url: string) {
  const events = ["QRCODE_UPDATED", "CONNECTION_UPDATE", "MESSAGES_UPSERT"];
  // v2: { webhook: { enabled, url, events, base64 } }
  let result = await gwFetch(cfg, `/webhook/set/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({ webhook: { enabled: true, url, byEvents: false, base64: true, events } }),
  });
  if (!result.ok) {
    // v1: campos na raiz
    result = await gwFetch(cfg, `/webhook/set/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      body: JSON.stringify({ enabled: true, url, webhook_by_events: false, webhook_base64: true, events }),
    });
  }
  return result;
}

export async function sendGatewayText(cfg: GatewayConfig, instanceName: string, to: string, message: string) {
  const number = cleanPhone(to);
  // v2: { number, text }
  let result = await gwFetch(cfg, `/message/sendText/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({ number, text: message }),
  });
  if (!result.ok && result.status === 400) {
    // v1: { number, options, textMessage: { text } }
    result = await gwFetch(cfg, `/message/sendText/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      body: JSON.stringify({ number, options: { delay: 0, presence: "composing" }, textMessage: { text: message } }),
    });
  }
  const messageId: string | null = result.json?.key?.id ?? result.json?.messageId ?? null;
  return { ...result, messageId };
}

// Envia áudio (voz da atendente) como mensagem de voz. Aceita base64 do arquivo.
// encoding: true pede ao gateway para converter em opus/ptt (nota de voz do WhatsApp).
export async function sendGatewayAudio(cfg: GatewayConfig, instanceName: string, to: string, base64Audio: string) {
  const number = cleanPhone(to);
  // v2: { number, audio, encoding }
  let result = await gwFetch(cfg, `/message/sendWhatsAppAudio/${encodeURIComponent(instanceName)}`, {
    method: "POST",
    body: JSON.stringify({ number, audio: base64Audio, encoding: true }),
  });
  if (!result.ok && result.status === 400) {
    // v1: { number, options, audioMessage: { audio } }
    result = await gwFetch(cfg, `/message/sendWhatsAppAudio/${encodeURIComponent(instanceName)}`, {
      method: "POST",
      body: JSON.stringify({ number, options: { delay: 0, presence: "recording", encoding: true }, audioMessage: { audio: base64Audio } }),
    });
  }
  const messageId: string | null = result.json?.key?.id ?? result.json?.messageId ?? null;
  return { ...result, messageId };
}

export async function logoutInstance(cfg: GatewayConfig, instanceName: string) {
  return gwFetch(cfg, `/instance/logout/${encodeURIComponent(instanceName)}`, { method: "DELETE" });
}

export async function deleteInstance(cfg: GatewayConfig, instanceName: string) {
  return gwFetch(cfg, `/instance/delete/${encodeURIComponent(instanceName)}`, { method: "DELETE" });
}

// Extrai texto de uma mensagem no formato Baileys/Evolution.
export function extractGatewayMessageText(message: any): string {
  if (!message) return "";
  return (
    message.conversation ??
    message.extendedTextMessage?.text ??
    message.imageMessage?.caption ??
    message.videoMessage?.caption ??
    message.documentMessage?.fileName ??
    (message.audioMessage ? "[áudio]" : null) ??
    (message.stickerMessage ? "[figurinha]" : null) ??
    (message.imageMessage ? "[imagem]" : null) ??
    (message.videoMessage ? "[vídeo]" : null) ??
    (message.documentMessage ? "[documento]" : null) ??
    (message.locationMessage ? "[localização]" : null) ??
    (message.contactMessage ? "[contato]" : null) ??
    ""
  );
}
