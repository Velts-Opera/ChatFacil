import { supabase } from "@/integrations/supabase/client";

type ApiErrorBody = {
  error?: string | { code?: string; message?: string };
};

export class WhatsAppApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "WhatsAppApiError";
  }
}

function apiBaseUrl() {
  const value = (import.meta.env.VITE_WA_API_URL as string | undefined)?.trim().replace(/\/$/, "");
  if (!value) {
    throw new WhatsAppApiError(
      500,
      "WA_API_URL_MISSING",
      "VITE_WA_API_URL não está configurada no Vercel.",
    );
  }
  return value;
}

async function currentAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new WhatsAppApiError(
      401,
      "AUTH_REQUIRED",
      error?.message || "Sessão expirada. Entre novamente.",
    );
  }
  return data.session.access_token;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const accessToken = await currentAccessToken();
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new WhatsAppApiError(
      0,
      "NETWORK_ERROR",
      `Falha de rede ao acessar a API do WhatsApp: ${detail}`,
    );
  }

  const body = (await response.json().catch(() => null)) as (T & ApiErrorBody) | null;
  if (!response.ok) {
    const backendError = body?.error;
    const message =
      typeof backendError === "string"
        ? backendError
        : backendError?.message || `API do WhatsApp retornou HTTP ${response.status}.`;
    const code =
      typeof backendError === "object" && backendError?.code
        ? backendError.code
        : `HTTP_${response.status}`;
    throw new WhatsAppApiError(response.status, code, message);
  }
  return body as T;
}

export function formatWhatsAppApiError(error: unknown) {
  if (!(error instanceof WhatsAppApiError)) {
    return error instanceof Error ? error.message : String(error);
  }
  const prefix: Record<number, string> = {
    0: "Falha de rede",
    401: "Sessão não autorizada",
    403: "Acesso negado",
    404: "Recurso não encontrado",
    409: "Operação em conflito",
    429: "Limite de requisições atingido",
    500: "Erro interno da API",
  };
  return `${prefix[error.status] ?? `Erro HTTP ${error.status}`}: ${error.message}`;
}

export const whatsappApi = {
  health: () => request<{ ok: boolean }>("/health"),
  connect: (channelId: string) =>
    request<{ status: string; qr: string | null; phoneNumber: string | null }>(
      `/api/whatsapp/channels/${encodeURIComponent(channelId)}/connect`,
      { method: "POST" },
    ),
  status: (channelId: string) =>
    request<{ status: string; phoneNumber: string | null }>(
      `/api/whatsapp/channels/${encodeURIComponent(channelId)}/status`,
    ),
  qr: (channelId: string) =>
    request<{ status: string; qr: string | null; phoneNumber: string | null }>(
      `/api/whatsapp/channels/${encodeURIComponent(channelId)}/qr`,
    ),
  disconnect: (channelId: string) =>
    request<{ ok: boolean; status: string }>(
      `/api/whatsapp/channels/${encodeURIComponent(channelId)}/disconnect`,
      { method: "POST" },
    ),
  send: (channelId: string, body: { to?: string; message: string; conversation_id?: string }) =>
    request<{
      ok: boolean;
      conversation_id?: string;
      message_id?: string;
    }>(`/api/whatsapp/channels/${encodeURIComponent(channelId)}/send`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};

export const sendWhatsAppMessage = whatsappApi.send;
