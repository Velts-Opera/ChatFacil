function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveKey() {
  const configuredSecret = Deno.env.get("APP_ENCRYPTION_KEY")?.trim();
  if (configuredSecret && configuredSecret.length < 32) {
    throw new Error("APP_ENCRYPTION_KEY deve ter pelo menos 32 caracteres.");
  }

  // APP_ENCRYPTION_KEY remains the preferred override. Hosted Supabase Edge
  // Functions always receive SUPABASE_SERVICE_ROLE_KEY, so use a namespaced
  // derivation of that backend-only secret when no dedicated key was set.
  // This keeps credentials encrypted without exposing key material to Vercel
  // or to the browser.
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  const secret = configuredSecret || (serviceRoleKey ? `chatfacil:app-encryption:v1:${serviceRoleKey}` : null);
  if (!secret) {
    throw new Error("Missing APP_ENCRYPTION_KEY/SUPABASE_SERVICE_ROLE_KEY");
  }

  const material = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", material, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(plain: string | null | undefined) {
  if (!plain) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey();
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain)));
  return `v1:${bytesToBase64(iv)}:${bytesToBase64(cipher)}`;
}

export async function decryptSecret(cipherText: string | null | undefined) {
  if (!cipherText) return null;
  if (!cipherText.startsWith("v1:")) throw new Error("Formato de segredo inválido.");
  const [, ivB64, cipherB64] = cipherText.split(":");
  if (!ivB64 || !cipherB64) throw new Error("Formato de segredo inválido.");
  const key = await deriveKey();
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(ivB64) }, key, base64ToBytes(cipherB64));
  return new TextDecoder().decode(plain);
}
