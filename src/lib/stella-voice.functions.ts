import { createServerFn } from "@tanstack/react-start";
import { setResponseHeaders } from "@tanstack/react-start/server";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const STELLA_AGENT_NAME = "velts-bad";
const STELLA_IDENTITY = "velts";
const LIVEKIT_PRODUCTION_URL = "wss://veltsapp-j8mqf7tp.livekit.cloud";
const TOKEN_TTL_SECONDS = 5 * 60;

type StellaVoiceSession =
  | {
      ok: true;
      serverUrl: string;
      participantToken: string;
      expiresInSeconds: number;
    }
  | {
      ok: false;
      error: string;
    };

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64UrlEncodeJson(value: unknown): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(JSON.stringify(value)));
}

async function signLiveKitToken(apiKey: string, apiSecret: string, room: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncodeJson({ alg: "HS256", typ: "JWT" });
  const payload = base64UrlEncodeJson({
    video: {
      room,
      roomJoin: true,
      canPublish: true,
      canPublishSources: ["microphone"],
      canSubscribe: true,
      canPublishData: false,
      canUpdateOwnMetadata: false,
    },
    roomConfig: {
      agents: [{ agentName: STELLA_AGENT_NAME }],
    },
    iss: apiKey,
    sub: STELLA_IDENTITY,
    jti: crypto.randomUUID(),
    nbf: now,
    exp: now + TOKEN_TTL_SECONDS,
  });
  const unsignedToken = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(apiSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(unsignedToken)),
  );
  return `${unsignedToken}.${base64UrlEncodeBytes(signature)}`;
}

function getLiveKitUrl(): string | null {
  const configured = process.env.LIVEKIT_URL?.trim().replace(/^['"]|['"]$/g, "").replace(/\/$/, "");
  if (configured && configured !== LIVEKIT_PRODUCTION_URL) return null;
  return LIVEKIT_PRODUCTION_URL;
}

export const createStellaVoiceSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<StellaVoiceSession> => {
    setResponseHeaders(
      new Headers({
        "Cache-Control": "no-store, private",
        Pragma: "no-cache",
        Vary: "Authorization",
      }),
    );

    const { data: isSuperAdmin, error: adminError } = await context.supabase.rpc("is_super_admin");
    if (adminError || !isSuperAdmin) {
      return { ok: false, error: "Acesso negado." };
    }

    const apiKey = process.env.LIVEKIT_API_KEY?.trim();
    const apiSecret = process.env.LIVEKIT_API_SECRET?.trim();
    const serverUrl = getLiveKitUrl();
    if (!apiKey || !apiSecret || !serverUrl) {
      return {
        ok: false,
        error: "Stella voz ainda nao esta configurada no servidor do ChatFacil.",
      };
    }

    const room = `velts-bad-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const participantToken = await signLiveKitToken(apiKey, apiSecret, room);

    return {
      ok: true,
      serverUrl,
      participantToken,
      expiresInSeconds: TOKEN_TTL_SECONDS,
    };
  });