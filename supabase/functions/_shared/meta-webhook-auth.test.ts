import assert from "node:assert/strict";
import { test } from "node:test";
import {
  extractPhoneNumberIds,
  extractUniqueInboundMessageIds,
  validateMetaWebhookSignature,
} from "./meta-webhook-auth.ts";

const encoder = new TextEncoder();
const rawBody = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
const secret = "meta-app-secret-for-tests";

async function signatureFor(body: string, signingSecret = secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return `sha256=${Buffer.from(signature).toString("hex")}`;
}

test("POST Meta sem HMAC é negado", async () => {
  assert.deepEqual(
    await validateMetaWebhookSignature({ rawBody, signature: null, candidateSecrets: [secret] }),
    { ok: false, reason: "missing_signature" },
  );
});

test("POST Meta com HMAC inválido é negado", async () => {
  assert.deepEqual(
    await validateMetaWebhookSignature({
      rawBody,
      signature: await signatureFor(rawBody, "wrong-secret"),
      candidateSecrets: [secret],
    }),
    { ok: false, reason: "invalid_signature" },
  );
});

test("POST Meta com HMAC válido é aceito", async () => {
  assert.deepEqual(
    await validateMetaWebhookSignature({
      rawBody,
      signature: await signatureFor(rawBody),
      candidateSecrets: [secret],
    }),
    { ok: true },
  );
});

test("payload desconhecido não contorna autenticação", async () => {
  const unknown = JSON.stringify({ unexpected: true });
  assert.deepEqual(extractPhoneNumberIds(JSON.parse(unknown)), []);
  assert.deepEqual(
    await validateMetaWebhookSignature({ rawBody: unknown, signature: null, candidateSecrets: [] }),
    { ok: false, reason: "missing_signature" },
  );
});

test("segredo do canal conhecido valida quando a primeira entrada é desconhecida", async () => {
  const payload = {
    entry: [
      { changes: [{ value: { unknown: true } }] },
      { changes: [{ value: { metadata: { phone_number_id: "known-phone" } } }] },
    ],
  };
  const body = JSON.stringify(payload);
  assert.deepEqual(extractPhoneNumberIds(payload), ["known-phone"]);
  assert.deepEqual(
    await validateMetaWebhookSignature({
      rawBody: body,
      signature: await signatureFor(body),
      candidateSecrets: [null, secret],
    }),
    { ok: true },
  );
});

test("evento duplicado/retry produz um único identificador de persistência", () => {
  const message = { id: "wamid.retry-1", from: "5511999999999", type: "text" };
  const payload = {
    entry: [
      {
        changes: [{ value: { messages: [message, message] } }, { value: { messages: [message] } }],
      },
    ],
  };
  assert.deepEqual(extractUniqueInboundMessageIds(payload), ["wamid.retry-1"]);
});
