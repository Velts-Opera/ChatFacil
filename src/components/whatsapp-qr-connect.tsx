import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, PhoneOff, QrCode, TriangleAlert, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { QrCodeProvider } from "@/lib/whatsapp/qr-provider";
import type { ConnectionStatus } from "@/lib/whatsapp/provider";

interface Props {
  channelId: string;
  bridgeUrl?: string;
  initialStatus?: ConnectionStatus;
  onConnected?: (phoneNumber: string) => void;
  onDisconnected?: () => void;
}

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  disconnected: "Desconectado",
  qr_pending: "Aguardando leitura do QR Code",
  connected: "Conectado",
  reconnecting: "Reconectando...",
  error: "Erro de conexão",
};

const STATUS_COLOR: Record<ConnectionStatus, string> = {
  disconnected: "bg-muted text-muted-foreground",
  qr_pending: "bg-amber-100 text-amber-800",
  connected: "bg-green-100 text-green-800",
  reconnecting: "bg-blue-100 text-blue-800",
  error: "bg-red-100 text-red-800",
};

export function WhatsAppQrConnect({ channelId, bridgeUrl, initialStatus, onConnected, onDisconnected }: Props) {
  const [status, setStatus] = useState<ConnectionStatus>(initialStatus ?? "disconnected");
  const [qr, setQr] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [bridgeOnline, setBridgeOnline] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const provider = useRef(new QrCodeProvider(channelId, bridgeUrl));

  useEffect(() => {
    provider.current = new QrCodeProvider(channelId, bridgeUrl);
  }, [channelId, bridgeUrl]);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const poll = useCallback(async () => {
    try {
      const data = await provider.current.getQrCode();
      setStatus(data.status);
      setQr(data.qr);
      if (data.phoneNumber) setPhoneNumber(data.phoneNumber);

      if (data.status === "connected") {
        stopPoll();
        onConnected?.(data.phoneNumber ?? "");
      }
      if (data.status === "disconnected") {
        stopPoll();
        setQr(null);
        onDisconnected?.();
      }
    } catch {
      // Bridge offline — para o polling silenciosamente
      stopPoll();
      setBridgeOnline(false);
    }
  }, [stopPoll, onConnected, onDisconnected]);

  const startPoll = useCallback(() => {
    stopPoll();
    pollRef.current = setInterval(poll, 3000);
    poll();
  }, [poll, stopPoll]);

  // Verifica se o bridge está online ao montar
  useEffect(() => {
    let cancelled = false;
    const url = (bridgeUrl ?? "http://localhost:3001").replace(/\/$/, "");
    fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) })
      .then((r) => { if (!cancelled) setBridgeOnline(r.ok); })
      .catch(() => { if (!cancelled) setBridgeOnline(false); });
    return () => { cancelled = true; };
  }, [bridgeUrl]);

  // Se já estava conectado, inicia polling para detectar desconexão
  useEffect(() => {
    if (initialStatus === "connected" || initialStatus === "qr_pending" || initialStatus === "reconnecting") {
      startPoll();
    }
    return stopPoll;
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  async function handleConnect() {
    setLoading(true);
    try {
      await provider.current.connect();
      setStatus("qr_pending");
      startPoll();
    } catch (err) {
      setStatus("error");
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    setLoading(true);
    try {
      await provider.current.disconnect();
      setStatus("disconnected");
      setQr(null);
      setPhoneNumber(null);
      stopPoll();
      onDisconnected?.();
    } catch {
      // Ignora erro de desconexão
    } finally {
      setLoading(false);
    }
  }

  const isActive = status === "connected" || status === "reconnecting";

  return (
    <div className="space-y-5">
      {/* Status do bridge */}
      {bridgeOnline === false && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div>
            <p className="font-medium text-amber-900">Bridge não encontrado em {bridgeUrl ?? "http://localhost:3001"}</p>
            <p className="mt-1 text-amber-700">
              Abra um terminal separado e execute:
              <code className="ml-1 rounded bg-amber-100 px-1 font-mono text-xs">
                cd ChatFacil/server && npm install && node whatsapp-bridge.js
              </code>
            </p>
          </div>
        </div>
      )}

      {/* Badge de status */}
      <div className="flex items-center gap-3">
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium", STATUS_COLOR[status])}>
          {status === "qr_pending" && <Loader2 className="h-3 w-3 animate-spin" />}
          {status === "connected" && <CheckCircle2 className="h-3 w-3" />}
          {status === "reconnecting" && <Loader2 className="h-3 w-3 animate-spin" />}
          {status === "error" && <TriangleAlert className="h-3 w-3" />}
          {status === "disconnected" && <WifiOff className="h-3 w-3" />}
          {STATUS_LABEL[status]}
        </span>
        {phoneNumber && status === "connected" && (
          <Badge variant="outline" className="font-mono text-xs">+{phoneNumber}</Badge>
        )}
      </div>

      {/* QR Code */}
      {status === "qr_pending" && (
        <div className="flex flex-col items-center gap-4 rounded-xl border bg-white p-8 shadow-sm">
          {qr ? (
            <>
              <img src={qr} alt="QR Code WhatsApp" className="h-56 w-56 rounded-lg" />
              <p className="max-w-xs text-center text-sm text-muted-foreground">
                Abra o WhatsApp no celular → <strong>Dispositivos conectados</strong> → <strong>Conectar dispositivo</strong> e escaneie o código acima.
              </p>
              <p className="text-xs text-muted-foreground">O código atualiza automaticamente.</p>
            </>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Gerando QR Code...</p>
            </div>
          )}
        </div>
      )}

      {/* Conectado */}
      {status === "connected" && (
        <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
          <Wifi className="h-5 w-5 text-green-600" />
          <div>
            <p className="text-sm font-medium text-green-900">WhatsApp conectado</p>
            {phoneNumber && <p className="text-xs text-green-700">Número: +{phoneNumber}</p>}
            <p className="text-xs text-green-700">Mensagens serão recebidas automaticamente na Caixa de Entrada.</p>
          </div>
        </div>
      )}

      {/* Reconectando */}
      {status === "reconnecting" && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          <div>
            <p className="text-sm font-medium text-blue-900">Reconectando...</p>
            <p className="text-xs text-blue-700">A conexão caiu. Tentando reconectar automaticamente.</p>
          </div>
        </div>
      )}

      {/* Ações */}
      <div className="flex flex-wrap gap-3">
        {!isActive && status !== "qr_pending" && (
          <Button onClick={handleConnect} disabled={loading || bridgeOnline === false} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
            Gerar QR Code
          </Button>
        )}
        {(isActive || status === "qr_pending") && (
          <Button variant="destructive" onClick={handleDisconnect} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneOff className="h-4 w-4" />}
            Desconectar
          </Button>
        )}
      </div>
    </div>
  );
}
