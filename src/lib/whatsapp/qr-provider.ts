import { whatsappApi } from "./api-client";
import type { ConnectionStatus, QrState, WhatsAppProvider } from "./provider";

export interface QrProvider extends WhatsAppProvider {
  getQrCode(): Promise<QrState>;
  requestPairingCode(phoneNumber: string): Promise<string | null>;
  checkHealth(): Promise<boolean>;
}

export class RailwayQrProvider implements QrProvider {
  constructor(private channelId: string) {}

  async checkHealth(): Promise<boolean> {
    const data = await whatsappApi.health();
    return data.ok === true;
  }

  async connect(): Promise<void> {
    await whatsappApi.connect(this.channelId);
  }

  async getQrCode(): Promise<QrState> {
    const data = await whatsappApi.qr(this.channelId);
    return {
      status: data.status as ConnectionStatus,
      qr: data.qr ?? null,
      pairingCode: data.pairingCode ?? null,
      qrExpiresAt: data.qrExpiresAt ?? null,
      phoneNumber: data.phoneNumber ?? null,
    };
  }

  async requestPairingCode(phoneNumber: string): Promise<string | null> {
    const data = await whatsappApi.pair(this.channelId, phoneNumber);
    return data.pairingCode ?? null;
  }

  async getConnectionStatus(): Promise<ConnectionStatus> {
    const data = await whatsappApi.status(this.channelId);
    return data.status as ConnectionStatus;
  }

  async sendMessage(to: string, message: string): Promise<void> {
    await whatsappApi.send(this.channelId, { to, message });
  }

  async disconnect(): Promise<void> {
    await whatsappApi.disconnect(this.channelId);
  }
}

export function createQrProvider(channelId: string): QrProvider {
  return new RailwayQrProvider(channelId);
}
