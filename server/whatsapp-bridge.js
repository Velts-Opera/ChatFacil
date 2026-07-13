/**
 * ChatFacil — WhatsApp Bridge Server
 * Responsável pela conexão via QR Code usando Baileys.
 * Rode com: node whatsapp-bridge.js
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { makeWASocket, DisconnectReason, useMultiFileAuthState, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode';
import pino from 'pino';
import { extractText, toJid } from './lib/wa-helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT ?? '3001', 10);
const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const BRIDGE_SECRET = process.env.BRIDGE_SECRET ?? '';
const SESSIONS_DIR = path.resolve(__dirname, process.env.SESSIONS_DIR ?? './sessions');

const logger = pino({ level: 'info' });

/** @type {Map<string, Session>} */
const sessions = new Map();

/**
 * @typedef {Object} Session
 * @property {string} channelId
 * @property {'disconnected'|'qr_pending'|'connected'|'reconnecting'|'error'} status
 * @property {string|null} qr             - base64 data URL do QR code atual
 * @property {string|null} phoneNumber    - número conectado
 * @property {any} socket                 - instância Baileys
 * @property {NodeJS.Timeout|null} sendTimer
 * @property {Array<{to:string,message:string,resolve:Function,reject:Function}>} sendQueue
 * @property {boolean} sendBusy
 */

function sessionDir(channelId) {
  return path.join(SESSIONS_DIR, channelId);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** Notifica Supabase sobre eventos da sessão e retorna o JSON de resposta */
async function notifySupabase(event, payload) {
  if (!SUPABASE_URL || !BRIDGE_SECRET) {
    logger.warn('[bridge] SUPABASE_URL ou BRIDGE_SECRET não configurados — callback ignorado');
    return null;
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-qr-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-bridge-secret': BRIDGE_SECRET,
      },
      body: JSON.stringify({ event, ...payload }),
    });
    if (!res.ok) {
      const bodyText = await res.text().catch(() => '');
      logger.warn({ status: res.status, body: bodyText }, '[bridge] notifySupabase erro');
      return null;
    }
    return await res.json().catch(() => null);
  } catch (err) {
    logger.error({ err }, '[bridge] notifySupabase falhou');
    return null;
  }
}

/** Inicia ou reconecta uma sessão Baileys */
async function startSession(channelId) {
  if (sessions.has(channelId)) {
    const existing = sessions.get(channelId);
    if (existing.status === 'connected') return existing;
    await stopSession(channelId, false);
  }

  const dir = sessionDir(channelId);
  ensureDir(dir);

  /** @type {Session} */
  const session = {
    channelId,
    status: 'qr_pending',
    qr: null,
    phoneNumber: null,
    socket: null,
    sendQueue: [],
    sendBusy: false,
    sendTimer: null,
  };
  sessions.set(channelId, session);

  const { state, saveCreds } = await useMultiFileAuthState(dir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' }),
    browser: ['ChatFacil', 'Chrome', '120.0.0'],
  });

  session.socket = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        session.qr = await qrcode.toDataURL(qr, { width: 300, margin: 2 });
        session.status = 'qr_pending';
        logger.info({ channelId }, '[bridge] QR gerado');
      } catch (err) {
        logger.error({ err }, '[bridge] Erro ao gerar QR');
      }
    }

    if (connection === 'open') {
      session.status = 'connected';
      session.qr = null;
      const jid = sock.user?.id ?? '';
      session.phoneNumber = jid.replace(/:\d+@.*/, '').replace('@s.whatsapp.net', '');
      logger.info({ channelId, phone: session.phoneNumber }, '[bridge] Conectado');
      await notifySupabase('connected', {
        channelId,
        phoneNumber: session.phoneNumber,
      });
    }

    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error).output?.statusCode;
      const shouldReconnect = reason !== DisconnectReason.loggedOut;

      if (shouldReconnect) {
        session.status = 'reconnecting';
        logger.info({ channelId, reason }, '[bridge] Reconectando...');
        await notifySupabase('reconnecting', { channelId });
        setTimeout(() => startSession(channelId), 5000);
      } else {
        session.status = 'disconnected';
        logger.info({ channelId }, '[bridge] Sessão encerrada (logout)');
        await notifySupabase('disconnected', { channelId, reason: 'logout' });
        sessions.delete(channelId);
        // Apaga estado de auth salvo para forçar novo QR
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;

      const from = msg.key.remoteJid ?? '';
      if (from.endsWith('@g.us')) continue; // ignora grupos por ora

      const content = extractText(msg.message);
      const waId = from.replace('@s.whatsapp.net', '');
      const pushName = msg.pushName ?? waId;

      logger.info({ channelId, from: waId, content }, '[bridge] Mensagem recebida');

      const result = await notifySupabase('message_received', {
        channelId,
        waId,
        rawJid: msg.key.remoteJid,
        pushName,
        content,
        messageId: msg.key.id,
        timestamp: msg.messageTimestamp
          ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
          : new Date().toISOString(),
      });

      if (result?.reply) {
        const replyTo = toJid(result.to ?? from);
        const jitter = 800 + Math.floor(Math.random() * 1400);
        setTimeout(() => {
          queueSend(session, replyTo, result.reply).catch((err) =>
            logger.error({ err }, '[bridge] Erro ao enviar resposta da IA'),
          );
        }, jitter);
      }
    }
  });

  return session;
}

/** Para e remove uma sessão */
async function stopSession(channelId, notify = true) {
  const session = sessions.get(channelId);
  if (!session) return;
  try {
    if (session.sendTimer) clearTimeout(session.sendTimer);
    session.socket?.end(undefined);
  } catch {}
  session.status = 'disconnected';
  sessions.delete(channelId);
  if (notify) {
    await notifySupabase('disconnected', { channelId, reason: 'user_request' });
  }
}

/** Envia mensagem com rate limiting (mínimo 1.2s entre envios por sessão) */
async function queueSend(session, to, message) {
  return new Promise((resolve, reject) => {
    session.sendQueue.push({ to, message, resolve, reject });
    if (!session.sendBusy) processSendQueue(session);
  });
}

async function processSendQueue(session) {
  if (session.sendQueue.length === 0) {
    session.sendBusy = false;
    return;
  }
  session.sendBusy = true;
  const { to, message, resolve, reject } = session.sendQueue.shift();

  try {
    const jid = toJid(to);
    await session.socket.sendMessage(jid, { text: message });
    resolve({ ok: true });
  } catch (err) {
    reject(err);
  }

  session.sendTimer = setTimeout(() => processSendQueue(session), 1200);
}

// ─── Express App ────────────────────────────────────────────────────────────

const app = express();

app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173', 'http://localhost:8080', 'http://127.0.0.1:8080'],
  methods: ['GET', 'POST', 'OPTIONS'],
}));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, sessions: sessions.size, uptime: process.uptime() });
});

/** Inicia sessão para um canal */
app.post('/session/start', async (req, res) => {
  const { channelId } = req.body;
  if (!channelId) return res.status(400).json({ error: 'channelId obrigatório' });

  try {
    await startSession(channelId);
    res.json({ ok: true, status: sessions.get(channelId)?.status ?? 'qr_pending' });
  } catch (err) {
    logger.error({ err }, '[bridge] Erro ao iniciar sessão');
    res.status(500).json({ error: String(err) });
  }
});

/** Retorna QR code e status atual */
app.get('/session/:channelId/qr', (req, res) => {
  const { channelId } = req.params;
  const session = sessions.get(channelId);

  if (!session) {
    return res.json({ status: 'disconnected', qr: null });
  }

  res.json({
    status: session.status,
    qr: session.qr,
    phoneNumber: session.phoneNumber,
  });
});

/** Retorna status da sessão */
app.get('/session/:channelId/status', (req, res) => {
  const { channelId } = req.params;
  const session = sessions.get(channelId);
  res.json({
    status: session?.status ?? 'disconnected',
    phoneNumber: session?.phoneNumber ?? null,
  });
});

/** Envia mensagem */
app.post('/session/:channelId/send', async (req, res) => {
  if (BRIDGE_SECRET && req.headers['x-bridge-secret'] !== BRIDGE_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { channelId } = req.params;
  const { to, message } = req.body;

  if (!to || !message) return res.status(400).json({ error: 'to e message são obrigatórios' });

  const session = sessions.get(channelId);
  if (!session || session.status !== 'connected') {
    return res.status(409).json({ error: 'Sessão não conectada. Reconecte via QR.' });
  }

  try {
    await queueSend(session, to, message);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, '[bridge] Erro ao enviar mensagem');
    res.status(500).json({ error: String(err) });
  }
});

/** Desconecta sessão */
app.post('/session/:channelId/disconnect', async (req, res) => {
  const { channelId } = req.params;
  await stopSession(channelId, true);
  res.json({ ok: true });
});

ensureDir(SESSIONS_DIR);

app.listen(PORT, () => {
  logger.info(`[bridge] ChatFacil WhatsApp Bridge rodando em http://localhost:${PORT}`);
  logger.info(`[bridge] Supabase URL: ${SUPABASE_URL || '(não configurado)'}`);
});
