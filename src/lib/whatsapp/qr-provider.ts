import type { ConnectionStatus, WhatsAppProvider } from "./provider";

export class QrCodeProvider implements WhatsAppProvider {
  private bridgeUrl: string;
  private channelId: string;

  constructor(channelId: string, bridgeUrl = "http://127.0.0.1:3001") {
    this.channelId = channelId;
    this.bridgeUrl = bridgeUrl.replace(/\/$/, "");
  }

  async connect(): Promise<void> {
    const res = await fetch(`${this.bridgeUrl}/session/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channelId: this.channelId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error ?? "Erro ao iniciar sessão");
    }
  }

  async getQrCode(): Promise<{ status: ConnectionStatus; qr: string | null; phoneNumber: string | null }> {
    const res = await fetch(`${this.bridgeUrl}/session/${this.channelId}/qr`);
    if (!res.ok) return { status: "error", qr: null, phoneNumber: null };
    return res.json();
  }

  async getConnectionStatus(): Promise<ConnectionStatus> {
    const res = await fetch(`${this.bridgeUrl}/session/${this.channelId}/status`);
    if (!res.ok) return "error";
    const data = await res.json();
    return data.status as ConnectionStatus;
  }

  async sendMessage(to: string, message: string): Promise<void> {
    const res = await fetch(`${this.bridgeUrl}/session/${this.channelId}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, message }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error ?? "Erro ao enviar mensagem");
    }
  }

  async disconnect(): Promise<void> {
    await fetch(`${this.bridgeUrl}/session/${this.channelId}/disconnect`, {
      method: "POST",
    });
  }
}
