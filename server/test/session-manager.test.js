import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { SessionManager } from "../lib/session-manager.js";

const CHANNEL_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHANNEL_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function tempDataPath() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "chatfacil-sessions-"));
}

test("gera QR independente para cada channel_id", async (t) => {
  const dataPath = tempDataPath();
  t.after(() => fs.rmSync(dataPath, { recursive: true, force: true }));
  const manager = new SessionManager({
    dataPath,
    qrEncoder: async (raw) => `data:image/png;base64,${raw}`,
    connectionFactory: async ({ channelId, onQr }) => {
      await onQr(`qr-${channelId}`);
      return { sendMessage: async () => ({}), close() {} };
    },
  });

  await manager.connect(CHANNEL_A);
  await manager.connect(CHANNEL_B);
  assert.equal(manager.getQr(CHANNEL_A).qr, `data:image/png;base64,qr-${CHANNEL_A}`);
  assert.equal(manager.getQr(CHANNEL_B).qr, `data:image/png;base64,qr-${CHANNEL_B}`);
  assert.notEqual(manager.getQr(CHANNEL_A).qr, manager.getQr(CHANNEL_B).qr);
});

test("restaura automaticamente apenas diretórios com credenciais e canal válido", async (t) => {
  const dataPath = tempDataPath();
  t.after(() => fs.rmSync(dataPath, { recursive: true, force: true }));
  for (const channelId of [CHANNEL_A, CHANNEL_B]) {
    const directory = path.join(dataPath, channelId);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, "creds.json"), "{}");
  }
  const opened = [];
  const manager = new SessionManager({
    dataPath,
    connectionFactory: async ({ channelId, onOpen }) => {
      opened.push(channelId);
      await onOpen(`phone-${channelId}`);
      return { sendMessage: async () => ({}), close() {} };
    },
  });

  const restored = await manager.restore({
    canRestore: async (channelId) => channelId === CHANNEL_A,
  });
  assert.deepEqual(restored, [CHANNEL_A]);
  assert.deepEqual(opened, [CHANNEL_A]);
  assert.equal(manager.getStatus(CHANNEL_A).status, "connected");
  assert.equal(manager.getStatus(CHANNEL_B).status, "disconnected");
});

test("envio usa a conexão Baileys do channel_id correto", async (t) => {
  const dataPath = tempDataPath();
  t.after(() => fs.rmSync(dataPath, { recursive: true, force: true }));
  const sends = [];
  const states = [];
  const manager = new SessionManager({
    dataPath,
    sendDelayMs: 0,
    onStateChange: async (channelId, values) => states.push({ channelId, values }),
    connectionFactory: async ({ channelId, onOpen }) => {
      await onOpen(`phone-${channelId}`);
      return {
        async sendMessage(to, message) {
          sends.push({ channelId, to, message });
          return { key: { id: `message-${channelId}` } };
        },
        close() {},
      };
    },
  });

  await manager.connect(CHANNEL_A);
  await manager.connect(CHANNEL_B);
  const result = await manager.send(CHANNEL_B, "5511999999999", "mensagem B");
  assert.equal(result.key.id, `message-${CHANNEL_B}`);
  assert.deepEqual(sends, [{ channelId: CHANNEL_B, to: "5511999999999", message: "mensagem B" }]);
  assert.ok(
    states.some((state) => state.channelId === CHANNEL_B && state.values.status === "connected"),
  );
});
