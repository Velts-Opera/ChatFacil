/**
 * whatsapp-qr-bridge — Proxy seguro entre o frontend e o bridge Railway.
 *
 * O frontend nunca chama o bridge diretamente.
 * Toda chamada passa aqui, que:
 *   1. Verifica o JWT do usuário Supabase
 *   2. Garante que o channel_id pertence à empresa do usuário
 *   3. Encaminha ao bridge com o BRIDGE_SECRET (jamais exposto ao frontend)
 */

import { corsHeaders, json } from "../_shared/http.ts";
import { requireUser } from "../_shared/auth.ts";

const BRIDGE_URL = Deno.env.get("BRIDGE_URL") ?? "";
const BRIDGE_SECRET = Deno.env.get("BRIDGE_SECRET") ?? "";

type Action = "start" | "qr" | "status" | "disconnect" | "send";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (!BRIDGE_URL || !BRIDGE_SECRET) {
    return json({ error: "Bridge não configurado no servidor." }, 503);
  }

  let body: Record<string, unknown> = {};
  if (req.method === "POST") {
    body = await req.json().catch(() => ({})) as Record<string, unknown>;
  }

  const url = new URL(req.url);
  const action = (url.searchParams.get("action") ?? body["action"]) as Action | null;
  const channelId = (url.searchParams.get("channel_id") ?? body["channel_id"]) as string | null;

  if (!action || !channelId) {
    return json({ error: "action e channel_id são obrigatórios." }, 400);
  }

  try {
    const { companyId, admin } = await requireUser(req);

    // Garante que o canal pertence à empresa do usuário autenticado
    const { data: channel, error: chErr } = await admin
      .from("channels")
      .select("id, company_id, provider")
      .eq("id", channelId)
      .eq("company_id", companyId)
      .maybeSingle();

    if (chErr) throw chErr;
    if (!channel) return json({ error: "Canal não encontrado." }, 404);
    if (channel.provider !== "qr_code") {
      return json({ error: "Este canal não usa QR Code." }, 400);
    }

    const bridgeHeaders: HeadersInit = {
      "Content-Type": "application/json",
      "x-bridge-secret": BRIDGE_SECRET,
    };

    let bridgeRes: Response;

    switch (action) {
      case "start": {
        bridgeRes = await fetch(`${BRIDGE_URL}/session/start`, {
          method: "POST",
          headers: bridgeHeaders,
          body: JSON.stringify({ channelId }),
        });
        break;
      }
      case "qr": {
        bridgeRes = await fetch(`${BRIDGE_URL}/session/${channelId}/qr`, {
          headers: bridgeHeaders,
        });
        break;
      }
      case "status": {
        bridgeRes = await fetch(`${BRIDGE_URL}/session/${channelId}/status`, {
          headers: bridgeHeaders,
        });
        break;
      }
      case "disconnect": {
        bridgeRes = await fetch(`${BRIDGE_URL}/session/${channelId}/disconnect`, {
          method: "POST",
          headers: bridgeHeaders,
          body: JSON.stringify({}),
        });
        break;
      }
      case "send": {
        const { to, message } = body as { to?: string; message?: string };
        if (!to || !message) return json({ error: "to e message são obrigatórios para send." }, 400);
        bridgeRes = await fetch(`${BRIDGE_URL}/session/${channelId}/send`, {
          method: "POST",
          headers: bridgeHeaders,
          body: JSON.stringify({ to, message }),
        });
        break;
      }
      default:
        return json({ error: `Ação desconhecida: ${action}` }, 400);
    }

    const data = await bridgeRes.json().catch(() => null);
    return json(data ?? {}, bridgeRes.status);
  } catch (e) {
    console.error("[whatsapp-qr-bridge] erro:", e);
    const msg = (e as Error).message ?? "Erro inesperado";
    const status = msg === "Unauthorized" || msg.includes("Authorization") ? 401 : 500;
    return json({ error: msg }, status);
  }
});
