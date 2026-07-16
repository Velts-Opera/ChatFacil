import { supabase } from "@/integrations/supabase/client";
import type { ConnectionStatus, WhatsAppProvider } from "./provider";

type QrState = { status: ConnectionStatus; qr: string | null; phoneNumber: string | null };

export interface QrProvider extends WhatsAppProvider {
  getQrCode(): Promise<QrState>;
  checkHealth(): Promise<boolean>;
}

/**
 * Modo produção (padrão): todas as chamadas passam pela Edge Function
 * `whatsapp-qr-bridge`, que valida o login do usuário, garante que o canal
 * pertence à empresa dele e repassa ao bridge hospedado. O navegador nunca
 * fala com o bridge diretamente e nunca vê o BRIDGE_SECRET.
 */
export class EdgeQrProvider implements QrProvider {
  constructor(private channelId: string) {}

  private async invoke<T = any>(action: string, extra: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await supabase.functions.invoke("whatsapp-qr-bridge", {
      body: { action, channel_id: this.channelId, ...extra },
    });
    if (error) {
      const context = (error as any)?.context;
      let message = error.message ?? "Erro ao falar com o bridge";
      if (context && typeof context.json === "function") {
        const body = await context.json().catch(() => null);
        if (body?.error) message = body.error;
      }
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    return data as T;
  }

  async checkHealth(): Promise<boolean> {
    try {
      const data = await this.invoke<{ ok: boolean }>("health");
      return data?.ok === true;
    } catch {
      return false;
    }
  }

  async connect(): Promise<void> {
    await this.invoke("start");
  }

  async getQrCode(): Promise<QrState> {
    try {
      const data = await this.invoke<QrState>("qr");
      return {
        status: data.status ?? "disconnected",
        qr: data.qr ?? null,
        phoneNumber: data.phoneNumber ?? null,
      };
    } catch {
      return { status: "error", qr: null, phoneNumber: null };
    }
  }

  async getConnectionStatus(): Promise<ConnectionStatus> {
    try {
      const data = await this.invoke<{ status: ConnectionStatus }>("status");
      return data.status ?? "disconnected";
    } catch {
      return "error";
    }
  }

  async sendMessage(to: string, message: string): Promise<void> {
    await this.invoke("send", { to, message });
  }

  async disconnect(): Promise<void> {
    await this.invoke("disconnect");
  }
}

/**
 * Modo desenvolvimento: fala direto com um bridge local
 * (defina VITE_WA_BRIDGE_URL, ex: http://127.0.0.1:3001).
 */
export class DirectQrProvider implements QrProvider {
  private bridgeUrl: string;

  constructor(private channelId: string, bridgeUrl: string) {
    this.bridgeUrl = bridgeUrl.replace(/\/$/, "");
  }

  async checkHealth(): Promise<boolean> {
    try {
      const res = await fetch(`${this.bridgeUrl}/health`, { signal: AbortSignal.timeout(3000) });
      return res.ok;
    } catch {
      return false;
    }
  }

  async connect(): Promise<void> {
    await fetch(`${this.bridgeUrl}/session/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId: this.channelId }),
    });
  }

  async getQrCode(): Promise<QrState> {
    const res = await fetch(`${this.bridgeUrl}/session/${this.channelId}/qr`);
    if (!res.ok) return { status: "error", qr: null, phoneNumber: null };
    return res.json();
  }

  async getConnectionStatus(): Promise<ConnectionStatus> {
    try {
      const res = await fetch(`${this.bridgeUrl}/session/${this.channelId}/status`);
      if (!res.ok) return "error";
      const data = await res.json();
      return data.status ?? "error";
    } catch {
      return "error";
    }
  }

  async sendMessage(to: string, message: string): Promise<void> {
    await fetch(`${this.bridgeUrl}/session/${this.channelId}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, message }),
    });
  }

  async disconnect(): Promise<void> {
    await fetch(`${this.bridgeUrl}/session/${this.channelId}/disconnect`, { method: "POST" });
  }
}

/**
 * Escolhe o provider: com VITE_WA_BRIDGE_URL definido usa o bridge direto
 * (desenvolvimento local); sem ele usa a Edge Function (produção multi-tenant).
 */
export function createQrProvider(channelId: string, bridgeUrl?: string): QrProvider {
  const direct = bridgeUrl ?? (import.meta.env.VITE_WA_BRIDGE_URL as string | undefined);
  if (direct) return new DirectQrProvider(channelId, direct);
  return new EdgeQrProvider(channelId);
}

/** @deprecated use createQrProvider — mantido para compatibilidade */
export class QrCodeProvider extends DirectQrProvider {
  constructor(channelId: string, bridgeUrl = "http://127.0.0.1:3001") {
    super(channelId, bridgeUrl);
  }
}
