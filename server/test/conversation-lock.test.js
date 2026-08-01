import test from "node:test";
import assert from "node:assert/strict";
import { createConversationLock } from "../lib/conversation-lock.js";

test("serializa execuções concorrentes com a mesma chave", async () => {
  const lock = createConversationLock();
  const order = [];
  let running = 0;
  let maxConcurrent = 0;

  async function task(id) {
    return lock.run("chat-1", async () => {
      running += 1;
      maxConcurrent = Math.max(maxConcurrent, running);
      await new Promise((r) => setTimeout(r, 20));
      order.push(id);
      running -= 1;
    });
  }

  await Promise.all([task("a"), task("b"), task("c")]);
  assert.equal(maxConcurrent, 1, "nunca deve haver duas execuções simultâneas para a mesma chave");
  assert.deepEqual(order, ["a", "b", "c"], "a ordem de chegada deve ser preservada (FIFO)");
});

test("chaves diferentes não bloqueiam uma à outra", async () => {
  const lock = createConversationLock();
  let concurrentDifferentKeys = false;
  let activeA = false;
  let activeB = false;

  await Promise.all([
    lock.run("chat-a", async () => {
      activeA = true;
      await new Promise((r) => setTimeout(r, 20));
      if (activeB) concurrentDifferentKeys = true;
      activeA = false;
    }),
    lock.run("chat-b", async () => {
      activeB = true;
      await new Promise((r) => setTimeout(r, 20));
      if (activeA) concurrentDifferentKeys = true;
      activeB = false;
    }),
  ]);

  assert.equal(concurrentDifferentKeys, true);
});

test("erro em uma execução não trava a fila para as próximas", async () => {
  const lock = createConversationLock();
  const results = [];
  await assert.rejects(() =>
    lock.run("chat-1", async () => {
      throw new Error("boom");
    }),
  );
  await lock.run("chat-1", async () => results.push("ok"));
  assert.deepEqual(results, ["ok"]);
});
