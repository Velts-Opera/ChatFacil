export type ConnectionStatus =
  "disconnected" | "connecting" | "qr_pending" | "connected" | "reconnecting" | "expired" | "error";

export interface QrState {
  status: ConnectionStatus;
  qr: string | null;
  pairingCode: string | null;
  qrExpiresAt: number | null;
  phoneNumber: string | null;
}

export interface WhatsAppProvider {
  connect(): Promise<void>;
  getQrCode(): Promise<QrState>;
  getConnectionStatus(): Promise<ConnectionStatus>;
  sendMessage(to: string, message: string): Promise<void>;
  disconnect(): Promise<void>;
}
