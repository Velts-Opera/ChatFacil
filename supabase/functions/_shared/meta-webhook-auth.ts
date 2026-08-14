export type MetaSignatureFailure = "missing_signature" | "missing_secret" | "invalid_signature";

export type MetaSignatureResult = { ok: true } | { ok: false; reason: MetaSignatureFailure };

const encoder = new TextEncoder();

function constantTimeEqual(left: string, right: string) {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  const length = Math.max(a.length, b.length);
  let mismatch = a.length ^ b.length;
  for (let index = 0; index < length; index += 1) {
    mismatch |= (a[index] ?? 0) ^ (b[index] ?? 0);
  }
  return mismatch === 0;
}

async function hmacSha256Hex(secret: string, payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function extractPhoneNumberIds(payload: unknown, limit = 20) {
  const ids = new Set<string>();
  const entries = Array.isArray((payload as any)?.entry) ? (payload as any).entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const value = change?.value?.metadata?.phone_number_id;
      if (value) ids.add(String(value));
      if (ids.size >= limit) return [...ids];
    }
  }
  return [...ids];
}

export function extractUniqueInboundMessageIds(payload: unknown) {
  const ids = new Set<string>();
  const entries = Array.isArray((payload as any)?.entry) ? (payload as any).entry : [];
  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      const messages = Array.isArray(change?.value?.messages) ? change.value.messages : [];
      for (const message of messages) {
        if (message?.id) ids.add(String(message.id));
      }
    }
  }
  return [...ids];
}

export async function validateMetaWebhookSignature(input: {
  rawBody: string;
  signature: string | null;
  candidateSecrets: Array<string | null | undefined>;
}): Promise<MetaSignatureResult> {
  if (!input.signature?.startsWith("sha256=")) {
    return { ok: false, reason: "missing_signature" };
  }

  const secrets = [
    ...new Set(input.candidateSecrets.map((value) => value?.trim()).filter(Boolean)),
  ] as string[];
  if (secrets.length === 0) return { ok: false, reason: "missing_secret" };

  for (const secret of secrets) {
    const expected = `sha256=${await hmacSha256Hex(secret, input.rawBody)}`;
    if (constantTimeEqual(input.signature, expected)) return { ok: true };
  }
  return { ok: false, reason: "invalid_signature" };
}
