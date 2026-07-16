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
import { makeWASocket, DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode';
import pino from 'pino';
import {
  extractText,
  hasStaleUnregisteredCredentials,
  shouldResetAuth,
  toJid,
} from './lib/wa-helpers.js';
import { createTenantAgent } from './lib/tenant-agent.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT ?? '3001', 10);
const BRIDGE_HOST = process.env.BRIDGE_HOST ?? '0.0.0.0';
const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? '';
const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-1.5-flash';
// O segredo efetivo vem da tabela bridge_settings do Supabase (fonte da
// verdade, carregado no boot); a env BRIDGE_SECRET é apenas fallback.
let bridgeSecret = process.env.BRIDGE_SECRET ?? '';
let bridgeSecretSource = bridgeSecret ? 'env' : 'none';
const QR_EVENT_MODE = process.env.QR_EVENT_MODE ?? 'webhook';
// SESSION_DATA_PATH é o nome preferido em produção; SESSIONS_DIR mantido por compatibilidade
const SESSIONS_DIR = process.env.SESSION_DATA_PATH
  ? path.resolve(process.env.SESSION_DATA_PATH)
  : path.resolve(__dirname, process.env.SESSIONS_DIR ?? './sessions');
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);
const BAILEYS_VERSION_URL = 'https://raw.githubusercontent.com/WhiskeySockets/Baileys/master/src/Defaults/baileys-version.json';

const logger = pino({ level: 'info' });
const tenantAgent = createTenantAgent({
  supabaseUrl: SUPABASE_URL,
  serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
  geminiApiKey: GEMINI_API_KEY,
  model: GEMINI_MODEL,
  logger,
});

/** @type {Map<string, Session>} */
const sessions = new Map();

/**
 * Carrega o segredo compartilhado da tabela bridge_settings (service role).
 * Mantém bridge e Edge Functions sempre com o MESMO segredo sem nenhuma
 * configuração manual; a env BRIDGE_SECRET fica como fallback.
 */
async function loadBridgeSecret() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return;
  try {
    const authorization = SUPABASE_SERVICE_ROLE_KEY.startsWith('sb_secret_')
      ? {}
      : { Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` };
    const res = await fetch(`${SUPABASE_URL}/rest/v1/bridge_settings?id=eq.1&select=bridge_secret`, {
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, ...authorization },
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, '[bridge] Não foi possível ler bridge_settings');
      return;
    }
    const rows = await res.json().catch(() => []);
    const secret = rows?.[0]?.bridge_secret;
    if (secret) {
      bridgeSecret = secret;
      bridgeSecretSource = 'database';
    }
  } catch (err) {
    logger.warn({ err }, '[bridge] Falha ao carregar segredo do Supabase');
  }
}

/**
 * @typedef {Object} Session
 * @property {string} channelId
 * @property {'disconnected'|'qr_pending'|'connected'|'reconnecting'|'error'} status
 * @property {string|null} qr             - base64 data URL do QR code atual
 * @property {string|null} phoneNumber    - número conectado
 * @property {any} socket                 - instância Baileys
 * @property {NodeJS.Timeout|null} sendTimer
 * @property {NodeJS.Timeout|null} reconnectTimer
 * @property {Array<{to:string,message:string,resolve:Function,reject:Function}>} sendQueue
 * @property {boolean} sendBusy
 * @property {boolean} stopped
 */

function sessionDir(channelId) {
  return path.join(SESSIONS_DIR, channelId);
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

async function fetchBaileysVersion() {
  const response = await fetch(BAILEYS_VERSION_URL, {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Baileys version request failed with HTTP ${response.status}`);
  }
  const payload = await response.json();
  if (!Array.isArray(payload?.version) || payload.version.length !== 3) {
    throw new Error('Baileys version response is invalid');
  }
  return payload.version;
}

/** Notifica Supabase sobre eventos da sessão e retorna o JSON de resposta */
async function notifySupabase(event, payload) {
  if (!SUPABASE_URL || !bridgeSecret) {
    logger.warn('[bridge] SUPABASE_URL ou BRIDGE_SECRET não configurados — callback ignorado');
    return null;
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/whatsapp-qr-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-bridge-secret': bridgeSecret,
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

async function persistChannelStatus(channelId, values) {
  if (!tenantAgent.describe().hasSupabaseKey) return;
  try {
    await tenantAgent.updateChannel(channelId, values);
  } catch (err) {
    logger.warn({ err, channelId }, '[bridge] Não foi possível persistir status do canal');
  }
}

/** Inicia ou reconecta uma sessão Baileys */
async function startSession(channelId) {
  if (sessions.has(channelId)) {
    const existing = sessions.get(channelId);
    if (existing.status === 'connected') return existing;
    await stopSession(channelId, { notify: false });
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
    reconnectTimer: null,
    stopped: false,
  };
  sessions.set(channelId, session);

  let authState = await useMultiFileAuthState(dir);
  if (hasStaleUnregisteredCredentials(authState.state.creds)) {
    logger.warn({ channelId }, '[bridge] Credenciais incompletas detectadas; gerando uma nova sessão QR');
    fs.rmSync(dir, { recursive: true, force: true });
    ensureDir(dir);
    authState = await useMultiFileAuthState(dir);
  }

  const { state, saveCreds } = authState;
  const version = await fetchBaileysVersion();

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
      await persistChannelStatus(channelId, {
        status: 'connected',
        phone_number: session.phoneNumber,
        connected_at: new Date().toISOString(),
        last_error: null,
      });
      if (QR_EVENT_MODE === 'webhook') {
        await notifySupabase('connected', { channelId, phoneNumber: session.phoneNumber });
      }
    }

    if (connection === 'close') {
      const reason = new Boom(lastDisconnect?.error).output?.statusCode;
      const errorMessage = lastDisconnect?.error instanceof Error
        ? lastDisconnect.error.message
        : String(lastDisconnect?.error ?? 'unknown');

      if (session.stopped || sessions.get(channelId) !== session) {
        return;
      }

      if (!shouldResetAuth(reason)) {
        session.status = 'reconnecting';
        logger.info({ channelId, reason, errorMessage }, '[bridge] Reconectando...');
        await persistChannelStatus(channelId, { status: 'connecting', last_error: errorMessage });
        if (QR_EVENT_MODE === 'webhook') await notifySupabase('reconnecting', { channelId });
        const delay = reason === DisconnectReason.restartRequired ? 250 : 5000;
        session.reconnectTimer = setTimeout(() => {
          session.reconnectTimer = null;
          if (session.stopped || sessions.get(channelId) !== session) return;
          startSession(channelId).catch((err) => {
            logger.error({ err, channelId }, '[bridge] Falha ao reiniciar sessão');
          });
        }, delay);
      } else {
        session.status = 'disconnected';
        session.stopped = true;
        logger.warn({ channelId, reason, errorMessage }, '[bridge] Sessão inválida; novo QR será necessário');
        await persistChannelStatus(channelId, { status: 'disconnected', last_error: errorMessage });
        if (QR_EVENT_MODE === 'webhook') await notifySupabase('disconnected', { channelId, reason: 'invalid_auth' });
        sessions.delete(channelId);
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

      const messagePayload = {
        channelId,
        waId,
        rawJid: msg.key.remoteJid,
        pushName,
        content,
        messageId: msg.key.id,
        timestamp: msg.messageTimestamp
          ? new Date(Number(msg.messageTimestamp) * 1000).toISOString()
          : new Date().toISOString(),
      };
      let result = null;
      if (QR_EVENT_MODE === 'webhook') {
        result = await notifySupabase('message_received', messagePayload);
      } else if (tenantAgent.enabled) {
        try {
          result = await tenantAgent.processMessage(messagePayload);
        } catch (err) {
          logger.error({ err, channelId, from: waId }, '[bridge] Roteamento direto da IA falhou');
        }
      } else {
        logger.warn({ channelId }, '[bridge] Persistência direta desabilitada: configure SUPABASE_SERVICE_ROLE_KEY');
      }

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
async function stopSession(channelId, { notify = true, clearAuth = false } = {}) {
  const session = sessions.get(channelId);
  if (session) {
    session.stopped = true;
    session.status = 'disconnected';
    if (session.sendTimer) clearTimeout(session.sendTimer);
    if (session.reconnectTimer) clearTimeout(session.reconnectTimer);
    sessions.delete(channelId);
    try {
      session.socket?.end(undefined);
    } catch {}
  }
  if (clearAuth) {
    fs.rmSync(sessionDir(channelId), { recursive: true, force: true });
  }
  if (notify) {
    await persistChannelStatus(channelId, { status: 'disconnected', last_error: null });
    if (QR_EVENT_MODE === 'webhook') await notifySupabase('disconnected', { channelId, reason: 'user_request' });
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

// ALLOWED_ORIGINS (produção) e CORS_ORIGINS (legado) são aceitos; sem nenhum,
// libera apenas as origens de desenvolvimento local.
const DEFAULT_CORS_ORIGINS = ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173', 'http://localhost:8080', 'http://127.0.0.1:8080'];
const corsOrigins = [
  ...ALLOWED_ORIGINS,
  ...(process.env.CORS_ORIGINS ?? '').split(',').map((origin) => origin.trim()).filter(Boolean),
];

app.use(cors({
  origin: corsOrigins.length > 0 ? corsOrigins : DEFAULT_CORS_ORIGINS,
  methods: ['GET', 'POST', 'OPTIONS'],
}));
app.use(express.json());

app.use('/session', (req, res, next) => {
  if (!bridgeSecret || req.headers['x-bridge-secret'] !== bridgeSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return next();
});

app.get('/health', (_req, res) => {
  res.json({ ok: true, sessions: sessions.size, uptime: process.uptime(), eventMode: QR_EVENT_MODE, secretSource: bridgeSecretSource, tenantAgent: tenantAgent.describe() });
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
  if (!bridgeSecret || req.headers['x-bridge-secret'] !== bridgeSecret) {
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
  await stopSession(channelId, { clearAuth: true });
  res.json({ ok: true });
});

ensureDir(SESSIONS_DIR);

/**
 * Restaura no boot todas as sessões de tenants que já haviam conectado.
 * Sem isso, um restart do serviço derruba o WhatsApp de todos os clientes
 * até cada um clicar em "Gerar QR Code" de novo.
 */
async function restoreSessions() {
  let entries = [];
  try {
    entries = fs.readdirSync(SESSIONS_DIR, { withFileTypes: true });
  } catch (err) {
    logger.warn({ err }, '[bridge] Não foi possível ler o diretório de sessões');
    return;
  }
  const channelIds = entries
    .filter((entry) => entry.isDirectory())
    .filter((entry) => fs.existsSync(path.join(SESSIONS_DIR, entry.name, 'creds.json')))
    .map((entry) => entry.name);

  if (channelIds.length === 0) {
    logger.info('[bridge] Nenhuma sessão anterior para restaurar');
    return;
  }

  logger.info({ count: channelIds.length }, '[bridge] Restaurando sessões de tenants');
  for (const channelId of channelIds) {
    try {
      await startSession(channelId);
      logger.info({ channelId }, '[bridge] Sessão restaurada');
    } catch (err) {
      logger.error({ err, channelId }, '[bridge] Falha ao restaurar sessão');
    }
  }
}

await loadBridgeSecret();
if (!bridgeSecret) {
  throw new Error('Nenhum segredo disponível: configure a tabela bridge_settings no Supabase ou a env BRIDGE_SECRET.');
}

app.listen(PORT, BRIDGE_HOST, () => {
  logger.info(`[bridge] ChatFacil WhatsApp Bridge rodando em http://${BRIDGE_HOST}:${PORT}`);
  logger.info(`[bridge] Supabase URL: ${SUPABASE_URL || '(não configurado)'}`);
  logger.info(`[bridge] Session data path: ${SESSIONS_DIR}`);
  logger.info(`[bridge] Segredo carregado de: ${bridgeSecretSource}`);
  restoreSessions().catch((err) => logger.error({ err }, '[bridge] Restauração de sessões falhou'));
});
