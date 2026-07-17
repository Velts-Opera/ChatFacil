import fs from "node:fs";
import {
  makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import {
  extractText,
  hasStaleUnregisteredCredentials,
  shouldResetAuth,
  toJid,
} from "./wa-helpers.js";

const VERSION_URL =
  "https://raw.githubusercontent.com/WhiskeySockets/Baileys/master/src/Defaults/baileys-version.json";

/**
 * Resolve a versão do WhatsApp Web para o handshake.
 * Ordem: helper oficial da lib -> JSON do repo -> versão embutida na lib instalada.
 * Puxar só do master quebra o pareamento quando o master avança além da lib instalada.
 */
async function baileysVersion(fetchImpl) {
  try {
    const { version } = await fetchLatestBaileysVersion();
    if (Array.isArray(version) && version.length === 3) return version;
  } catch {
    // segue para o fallback
  }

  try {
    const response = await fetchImpl(VERSION_URL, { headers: { accept: "application/json" } });
    const payload = await response.json().catch(() => null);
    if (response.ok && Array.isArray(payload?.version) && payload.version.length === 3) {
      return payload.version;
    }
  } catch {
    // segue para o fallback
  }

  // Último recurso: a versão que a própria lib instalada considera padrão
  const { DEFAULT_CONNECTION_CONFIG } = await import("@whiskeysockets/baileys");
  const fallback = DEFAULT_CONNECTION_CONFIG?.version;
  if (Array.isArray(fallback) && fallback.length === 3) return fallback;

  throw new Error("Não foi possível resolver a versão do WhatsApp Web.");
}

export async function createBaileysConnection({
  authDir,
  onQr,
  onOpen,
  onClose,
  onMessage,
  fetchImpl = globalThis.fetch,
}) {
  let authState = await useMultiFileAuthState(authDir);
  if (hasStaleUnregisteredCredentials(authState.state.creds)) {
    fs.rmSync(authDir, { recursive: true, force: true });
    fs.mkdirSync(authDir, { recursive: true });
    authState = await useMultiFileAuthState(authDir);
  }
  const version = await baileysVersion(fetchImpl);
  const socket = makeWASocket({
    version,
    auth: authState.state,
    printQRInTerminal: false,
    logger: pino({ level: "silent" }),
    // Fingerprint de navegador reconhecido: strings custom fazem o WhatsApp recusar o pareamento
    browser: ["Ubuntu", "Chrome", "120.0.0"],
    syncFullHistory: false,
    markOnlineOnConnect: false,
    connectTimeoutMs: 60_000,
    keepAliveIntervalMs: 25_000,
  });

  socket.ev.on("creds.update", authState.saveCreds);
  socket.ev.on("connection.update", (update) => {
    if (update.qr) Promise.resolve(onQr(update.qr)).catch(() => {});
    if (update.connection === "open") {
      const jid = socket.user?.id ?? "";
      const phoneNumber = jid.replace(/:\d+@.*/, "").replace("@s.whatsapp.net", "");
      Promise.resolve(onOpen(phoneNumber)).catch(() => {});
    }
    if (update.connection === "close") {
      const reason = new Boom(update.lastDisconnect?.error).output?.statusCode;
      const errorMessage =
        update.lastDisconnect?.error instanceof Error
          ? update.lastDisconnect.error.message
          : String(update.lastDisconnect?.error ?? "Conexão encerrada");
      Promise.resolve(onClose({ reason, errorMessage, resetAuth: shouldResetAuth(reason) })).catch(
        () => {},
      );
    }
  });
  socket.ev.on("messages.upsert", ({ messages, type }) => {
    if (type !== "notify") return;
    for (const message of messages) {
      const remoteJid = message.key.remoteJid ?? "";
      if (message.key.fromMe || remoteJid.endsWith("@g.us") || remoteJid.endsWith("@broadcast"))
        continue;
      Promise.resolve(
        onMessage({
          waId: remoteJid.replace("@s.whatsapp.net", ""),
          rawJid: remoteJid,
          pushName: message.pushName,
          content: extractText(message.message),
          messageId: message.key.id,
          timestamp: message.messageTimestamp
            ? new Date(Number(message.messageTimestamp) * 1000).toISOString()
            : new Date().toISOString(),
        }),
      ).catch(() => {});
    }
  });

  return {
    async sendMessage(to, message) {
      return socket.sendMessage(toJid(to), { text: message });
    },
    close() {
      socket.end(undefined);
    },
  };
}