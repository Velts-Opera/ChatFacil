export type ConnectionStatus =
  | "disconnected"
  | "qr_pending"
  | "connected"
  | "reconnecting"
  | "error";

export interface WhatsAppProvider {
  connect(): Promise<void>;
  getQrCode(): Promise<{ status: ConnectionStatus; qr: string | null; phoneNumber: string | null }>;
  getConnectionStatus(): Promise<ConnectionStatus>;
  sendMessage(to: string, message: string): Promise<void>;
  disconnect(): Promise<void>;
}
