import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SessionManager } from "../lib/session-manager.js";
import { ApiError } from "../lib/api-error.js";

const CHANNEL = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function tempDataPath() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "chatfacil-engine-"));
}

function makeManager(t, overrides = {}) {
  const dataPath = tempDataPath();
  t.after(() => fs.rmSync(dataPath, { recursive: true, force: true }));
  return new SessionManager({
    dataPath,
    qrEncoder: async (raw) => `data:${raw}`,
    ...overrides,
  });
}

test("requestPairingCode retorna e armazena o código quando a sessão aguarda QR", async (t) => {
  const manager = makeManager(t, {
    connectionFactory: async ({ onQr }) => {
      await onQr("raw-qr");
      return {
        sendMessage: async () => ({}),
        close() {},
        requestPairingCode: async (phone) => `CODE-${phone}`,
      };
    },
  });

  await manager.connect(CHANNEL);
  const state = await manager.requestPairingCode(CHANNEL, "5522999998888");
  assert.equal(state.pairingCode, "CODE-5522999998888");
  assert.equal(manager.getQr(CHANNEL).pairingCode, "CODE-5522999998888");
});

test("requestPairingCode rejeita telefone inválido e sessão inexistente", async (t) => {
  const manager = makeManager(t, {
    connectionFactory: async ({ onQr }) => {
      await onQr("raw-qr");
      return { sendMessage: async () => ({}), close() {}, requestPairingCode: async () => "X" };
    },
  });

  await assert.rejects(
    () => manager.requestPairingCode(CHANNEL, "5522999998888"),
    (e) => e instanceof ApiError && e.status === 409,
  );
  await manager.connect(CHANNEL);
  await assert.rejects(
    () => manager.requestPairingCode(CHANNEL, "abc"),
    (e) => e instanceof ApiError && e.status === 400,
  );
});

test("QR expira após o TTL: status vira expired, qr é limpo e estado persiste", async (t) => {
  const states = [];
  const manager = makeManager(t, {
    qrTtlMs: 30,
    onStateChange: async (_id, values) => states.push(values.status),
    connectionFactory: async ({ onQr }) => {
      await onQr("raw-qr");
      return { sendMessage: async () => ({}), close() {}, requestPairingCode: async () => "X" };
    },
  });

  await manager.connect(CHANNEL);
  assert.equal(manager.getQr(CHANNEL).status, "qr_pending");
  assert.ok(manager.getQr(CHANNEL).qrExpiresAt > Date.now());
  await new Promise((r) => setTimeout(r, 80));
  assert.equal(manager.getQr(CHANNEL).status, "expired");
  assert.equal(manager.getQr(CHANNEL).qr, null);
  assert.ok(states.includes("expired"));
});

test("conexão bem-sucedida cancela o timer de expiração", async (t) => {
  let openSession;
  const manager = makeManager(t, {
    qrTtlMs: 30,
    connectionFactory: async ({ onQr, onOpen }) => {
      await onQr("raw-qr");
      openSession = onOpen;
      return { sendMessage: async () => ({}), close() {} };
    },
  });

  await manager.connect(CHANNEL);
  await openSession("5522999990000");
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(manager.getQr(CHANNEL).status, "connected");
});

test("connect concorrente para o mesmo canal cria uma única conexão", async (t) => {
  let factoryCalls = 0;
  const manager = makeManager(t, {
    connectionFactory: async ({ onQr }) => {
      factoryCalls += 1;
      await new Promise((r) => setTimeout(r, 20));
      await onQr("raw-qr");
      return { sendMessage: async () => ({}), close() {} };
    },
  });

  await Promise.all([manager.connect(CHANNEL), manager.connect(CHANNEL), manager.connect(CHANNEL)]);
  assert.equal(factoryCalls, 1);
});
