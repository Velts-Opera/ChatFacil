import test from "node:test";
import assert from "node:assert/strict";
import { reconcileGhostChannels } from "../lib/reconcile-channels.js";

test("marca como disconnected canais presos em estado não-terminal sem sessão restaurada", async () => {
  const updates = [];
  const result = await reconcileGhostChannels({
    staleChannels: [
      { id: "a", status: "qr_pending" },
      { id: "b", status: "connecting" },
      { id: "c", status: "reconnecting" },
    ],
    restoredChannelIds: new Set(["c"]), // c tem sessão viva (restaurada com sucesso)
    updateChannel: async (channelId, values) => updates.push({ channelId, values }),
  });

  assert.deepEqual(result.reconciled.sort(), ["a", "b"]);
  assert.equal(updates.length, 2);
  for (const u of updates) {
    assert.equal(u.values.status, "disconnected");
    assert.match(u.values.last_error, /reinício|reiniciad/i);
  }
});

test("não toca em canais cuja sessão foi restaurada com sucesso", async () => {
  const updates = [];
  await reconcileGhostChannels({
    staleChannels: [{ id: "a", status: "qr_pending" }],
    restoredChannelIds: new Set(["a"]),
    updateChannel: async (channelId, values) => updates.push({ channelId, values }),
  });
  assert.equal(updates.length, 0);
});

test("uma falha isolada de updateChannel não interrompe a reconciliação dos demais", async () => {
  const updates = [];
  const result = await reconcileGhostChannels({
    staleChannels: [
      { id: "a", status: "qr_pending" },
      { id: "b", status: "qr_pending" },
    ],
    restoredChannelIds: new Set(),
    updateChannel: async (channelId) => {
      if (channelId === "a") throw new Error("falha de rede");
      updates.push(channelId);
    },
  });
  assert.deepEqual(updates, ["b"]);
  assert.deepEqual(result.reconciled, ["b"]);
  assert.deepEqual(result.failed, ["a"]);
});
