import fs from "node:fs";
import path from "node:path";
import qrcode from "qrcode";
import { ApiError } from "./api-error.js";
import { createBaileysConnection } from "./baileys-connection.js";

function safeChannelId(channelId) {
  if (!/^[a-zA-Z0-9_-]+$/.test(channelId)) {
    throw new ApiError(400, "INVALID_CHANNEL_ID", "channelId inválido.");
  }
  return channelId;
}

export class SessionManager {
  constructor({
    dataPath,
    connectionFactory = createBaileysConnection,
    qrEncoder = (value) => qrcode.toDataURL(value, { width: 300, margin: 2 }),
    onStateChange = async () => {},
    onMessage = async () => null,
    logger,
    reconnectDelayMs = 5000,
    sendDelayMs = 1200,
  }) {
    this.dataPath = path.resolve(dataPath);
    this.connectionFactory = connectionFactory;
    this.qrEncoder = qrEncoder;
    this.onStateChange = onStateChange;
    this.onMessage = onMessage;
    this.logger = logger;
    this.reconnectDelayMs = reconnectDelayMs;
    this.sendDelayMs = sendDelayMs;
    this.sessions = new Map();
    fs.mkdirSync(this.dataPath, { recursive: true });
  }

  get count() {
    return this.sessions.size;
  }

  directory(channelId) {
    return path.join(this.dataPath, safeChannelId(channelId));
  }

  snapshot(channelId) {
    const session = this.sessions.get(channelId);
    return {
      status: session?.status ?? "disconnected",
      qr: session?.qr ?? null,
      phoneNumber: session?.phoneNumber ?? null,
    };
  }

  async emitState(channelId, values) {
    try {
      await this.onStateChange(channelId, values);
    } catch (error) {
      this.logger?.warn?.({ error, channelId }, "Falha ao persistir o estado da sessão");
    }
  }

  async connect(channelId) {
    safeChannelId(channelId);
    const existing = this.sessions.get(channelId);
    if (
      existing &&
      ["connected", "qr_pending", "reconnecting", "connecting"].includes(existing.status)
    ) {
      return this.snapshot(channelId);
    }
    if (existing) await this.disconnect(channelId, { clearAuth: false, persist: false });

    const authDir = this.directory(channelId);
    fs.mkdirSync(authDir, { recursive: true });
    const session = {
      channelId,
      status: "connecting",
      qr: null,
      phoneNumber: null,
      connection: null,
      stopped: false,
      reconnectTimer: null,
      sendChain: Promise.resolve(),
      lastSentAt: 0,
    };
    this.sessions.set(channelId, session);
    await this.emitState(channelId, { status: "connecting", last_error: null });

    try {
      session.connection = await this.connectionFactory({
        channelId,
        authDir,
        onQr: async (rawQr) => {
          if (session.stopped || this.sessions.get(channelId) !== session) return;
          session.qr = await this.qrEncoder(rawQr);
          session.status = "qr_pending";
          await this.emitState(channelId, { status: "qr_pending", last_error: null });
        },
        onOpen: async (phoneNumber) => {
          if (session.stopped || this.sessions.get(channelId) !== session) return;
          session.status = "connected";
          session.qr = null;
          session.phoneNumber = phoneNumber || null;
          await this.emitState(channelId, {
            status: "connected",
            phone_number: session.phoneNumber,
            connected_at: new Date().toISOString(),
            last_error: null,
          });
        },
        onClose: (details) => this.handleClose(session, details),
        onMessage: (message) => this.handleInbound(session, message),
      });
      return this.snapshot(channelId);
    } catch (error) {
      session.status = "error";
      await this.emitState(channelId, {
        status: "error",
        last_error: error instanceof Error ? error.message : String(error),
      });
      if (error instanceof ApiError) throw error;
      const detail = error instanceof Error ? error.message : String(error);
      throw new ApiError(
        500,
        "BAILEYS_CONNECT_FAILED",
        `Falha ao iniciar a sessão Baileys: ${detail}`,
      );
    }
  }

  async handleClose(session, details) {
    if (session.stopped || this.sessions.get(session.channelId) !== session) return;
    if (details.resetAuth) {
      session.stopped = true;
      this.sessions.delete(session.channelId);
      fs.rmSync(this.directory(session.channelId), { recursive: true, force: true });
      await this.emitState(session.channelId, {
        status: "disconnected",
        phone_number: null,
        last_error: details.errorMessage,
      });
      return;
    }
    session.status = "reconnecting";
    session.qr = null;
    await this.emitState(session.channelId, {
      status: "reconnecting",
      last_error: details.errorMessage,
    });
    // 515 (restartRequired) acontece logo após ler o QR: o WhatsApp exige reabrir NA HORA.
    // Esperar os 5s padrão invalida o handshake pendente e causa o loop "conectando e cai".
    const delay = details.reason === 515 ? 0 : this.reconnectDelayMs;
    session.reconnectTimer = setTimeout(async () => {
      if (session.stopped || this.sessions.get(session.channelId) !== session) return;
      this.sessions.delete(session.channelId);
      session.stopped = true;
      try {
        session.connection?.close();
      } catch {}
      try {
        await this.connect(session.channelId);
      } catch (error) {
        this.logger?.error?.({ error, channelId: session.channelId }, "Falha ao restaurar sessão");
      }
    }, delay);
  }

  async handleInbound(session, message) {
    if (session.stopped || this.sessions.get(session.channelId) !== session) return;
    try {
      const result = await this.onMessage({ channelId: session.channelId, ...message });
      if (result?.reply)
        await this.send(session.channelId, result.to || message.rawJid, result.reply);
    } catch (error) {
      this.logger?.error?.(
        { error, channelId: session.channelId },
        "Falha no roteamento da mensagem recebida",
      );
    }
  }

  getStatus(channelId) {
    const { status, phoneNumber } = this.snapshot(channelId);
    return { status, phoneNumber };
  }

  getQr(channelId) {
    return this.snapshot(channelId);
  }

  async send(channelId, to, message) {
    const session = this.sessions.get(channelId);
    if (!session || session.status !== "connected" || !session.connection) {
      throw new ApiError(
        409,
        "SESSION_NOT_CONNECTED",
        "A sessão Baileys deste canal não está conectada. Gere um novo QR Code.",
      );
    }
    const operation = session.sendChain.then(async () => {
      const waitMs = Math.max(0, this.sendDelayMs - (Date.now() - session.lastSentAt));
      if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
      try {
        const result = await session.connection.sendMessage(to, message);
        session.lastSentAt = Date.now();
        return result;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new ApiError(
          500,
          "BAILEYS_SEND_FAILED",
          `Falha ao enviar pela sessão Baileys deste canal: ${detail}`,
        );
      }
    });
    session.sendChain = operation.catch(() => {});
    return operation;
  }

  async disconnect(channelId, { clearAuth = true, persist = true } = {}) {
    const session = this.sessions.get(channelId);
    if (session) {
      session.stopped = true;
      if (session.reconnectTimer) clearTimeout(session.reconnectTimer);
      this.sessions.delete(channelId);
      try {
        session.connection?.close();
      } catch {}
    }
    if (clearAuth) fs.rmSync(this.directory(channelId), { recursive: true, force: true });
    if (persist)
      await this.emitState(channelId, {
        status: "disconnected",
        phone_number: null,
        connected_at: null,
        last_error: null,
      });
  }

  async restore({ canRestore = async () => true } = {}) {
    const entries = fs.readdirSync(this.dataPath, { withFileTypes: true });
    const restored = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const channelId = entry.name;
      if (!fs.existsSync(path.join(this.directory(channelId), "creds.json"))) continue;
      if (!(await canRestore(channelId))) continue;
      try {
        await this.connect(channelId);
        restored.push(channelId);
      } catch (error) {
        this.logger?.error?.({ error, channelId }, "Falha ao restaurar sessão persistida");
      }
    }
    return restored;
  }
}