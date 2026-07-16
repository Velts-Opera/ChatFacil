import fs from "node:fs";
import { makeWASocket, useMultiFileAuthState } from "@whiskeysockets/baileys";
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

async function baileysVersion(fetchImpl) {
  const response = await fetchImpl(VERSION_URL, { headers: { accept: "application/json" } });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(payload?.version) || payload.version.length !== 3) {
    throw new Error(`Não foi possível obter a versão do Baileys (HTTP ${response.status}).`);
  }
  return payload.version;
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
    browser: ["ChatFacil", "Chrome", "120.0.0"],
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
