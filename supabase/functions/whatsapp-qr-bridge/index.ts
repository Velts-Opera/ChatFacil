// Proxy autenticado entre o frontend e o WhatsApp Bridge (Baileys).
// Cada usuário só consegue operar canais QR da PRÓPRIA empresa:
// o JWT é validado, o canal é conferido contra company_id e só então
// a chamada é repassada ao bridge com o segredo compartilhado (que nunca
// chega ao navegador).
import { corsHeaders, json } from "../_shared/http.ts";
import { requireUser } from "../_shared/auth.ts";
import { getBridgeConfig } from "../_shared/bridge-config.ts";

type Action = "start" | "qr" | "status" | "send" | "disconnect" | "health";

interface Body {
  action: Action;
  channel_id?: string;
  to?: string;
  message?: string;
}

async function bridgeFetch(config: { url: string; secret: string }, path: string, init: RequestInit = {}) {
  const res = await fetch(`${config.url}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-bridge-secret": config.secret,
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(15_000),
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let auth;
  try {
    auth = await requireUser(req);
  } catch (e) {
    return json({ error: (e as Error).message ?? "Unauthorized" }, 401);
  }

  try {
    const config = await getBridgeConfig(auth.admin);
    if (!config.url || !config.secret) {
      return json({
        error: "Bridge não configurado. Cadastre a tabela bridge_settings ou os secrets WA_BRIDGE_URL/BRIDGE_SECRET.",
        code: "bridge_not_configured",
      }, 503);
    }

    const body = (await req.json().catch(() => ({}))) as Body;
    const { action } = body;

    if (action === "health") {
      const { status, body: result } = await bridgeFetch(config, "/health");
      return json({ ok: status === 200, bridge: result }, 200);
    }

    if (!body.channel_id) return json({ error: "channel_id é obrigatório." }, 400);

    // Isolamento por tenant: o canal precisa ser QR e pertencer à empresa do usuário.
    const { data: channel, error } = await auth.admin
      .from("channels")
      .select("id, company_id, provider")
      .eq("id", body.channel_id)
      .eq("company_id", auth.companyId)
      .eq("provider", "qr_code")
      .maybeSingle();
    if (error) throw error;
    if (!channel) return json({ error: "Canal não encontrado para a sua empresa." }, 404);

    switch (action) {
      case "start": {
        const { status, body: result } = await bridgeFetch(config, "/session/start", {
          method: "POST",
          body: JSON.stringify({ channelId: channel.id }),
        });
        return json(result ?? { error: "Bridge sem resposta" }, status);
      }
      case "qr": {
        const { status, body: result } = await bridgeFetch(config, `/session/${channel.id}/qr`);
        return json(result ?? { error: "Bridge sem resposta" }, status);
      }
      case "status": {
        const { status, body: result } = await bridgeFetch(config, `/session/${channel.id}/status`);
        return json(result ?? { error: "Bridge sem resposta" }, status);
      }
      case "send": {
        if (!body.to || !body.message) return json({ error: "to e message são obrigatórios." }, 400);
        const { status, body: result } = await bridgeFetch(config, `/session/${channel.id}/send`, {
          method: "POST",
          body: JSON.stringify({ to: body.to, message: body.message }),
        });
        return json(result ?? { error: "Bridge sem resposta" }, status);
      }
      case "disconnect": {
        const { status, body: result } = await bridgeFetch(config, `/session/${channel.id}/disconnect`, {
          method: "POST",
          body: JSON.stringify({}),
        });
        await auth.admin.from("channels").update({
          status: "disconnected",
          updated_at: new Date().toISOString(),
        }).eq("id", channel.id);
        return json(result ?? { error: "Bridge sem resposta" }, status);
      }
      default:
        return json({ error: `Ação inválida: ${String(action)}` }, 400);
    }
  } catch (e) {
    const message = (e as Error).message ?? "Erro inesperado";
    const isTimeout = /timed? ?out|abort/i.test(message);
    console.error("whatsapp-qr-bridge error", e);
    return json({
      error: isTimeout ? "Bridge não respondeu. Verifique se o serviço do bridge está no ar." : message,
      code: isTimeout ? "bridge_unreachable" : "internal_error",
    }, isTimeout ? 502 : 500);
  }
});
