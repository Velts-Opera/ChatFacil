import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Loader2, PhoneOff, QrCode, TriangleAlert, Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { createQrProvider } from "@/lib/whatsapp/qr-provider";
import { formatWhatsAppApiError } from "@/lib/whatsapp/api-client";
import type { ConnectionStatus } from "@/lib/whatsapp/provider";

interface Props {
  channelId: string;
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

export function WhatsAppQrConnect({ channelId, initialStatus, onConnected, onDisconnected }: Props) {
  const [status, setStatus] = useState<ConnectionStatus>(initialStatus ?? "disconnected");
  const [qr, setQr] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const provider = useRef(createQrProvider(channelId));

  useEffect(() => {
    provider.current = createQrProvider(channelId);
  }, [channelId]);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const poll = useCallback(async () => {
    try {
      const data = await provider.current.getQrCode();
      setApiOnline(true);
      setLastError(null);
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
    } catch (error) {
      setApiOnline(false);
      setStatus("error");
      setLastError(formatWhatsAppApiError(error));
    }
  }, [stopPoll, onConnected, onDisconnected]);

  const startPoll = useCallback(() => {
    stopPoll();
    pollRef.current = setInterval(poll, 3000);
    poll();
  }, [poll, stopPoll]);

  // O health check usa a mesma API Railway configurada para todas as operações.
  useEffect(() => {
    let cancelled = false;
    const check = () => provider.current.checkHealth()
      .then((ok) => { if (!cancelled) setApiOnline(ok); })
      .catch((error) => {
        if (!cancelled) {
          setApiOnline(false);
          setLastError(formatWhatsAppApiError(error));
        }
      });
    check();
    const timer = setInterval(check, 8000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [channelId]);

  useEffect(() => {
    if (apiOnline && (status === "qr_pending" || status === "reconnecting") && !pollRef.current) {
      startPoll();
    }
  }, [apiOnline, status, startPoll]);

  // Se já estava conectado, inicia polling para detectar desconexão
  useEffect(() => {
    if (initialStatus === "connected" || initialStatus === "qr_pending" || initialStatus === "reconnecting") {
      startPoll();
    }
    return stopPoll;
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  async function handleConnect() {
    setLoading(true);
    setLastError(null);
    try {
      await provider.current.connect();
      setStatus("qr_pending");
      startPoll();
    } catch (err) {
      setStatus("error");
      setLastError(formatWhatsAppApiError(err));
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
    } catch (error) {
      setLastError(formatWhatsAppApiError(error));
    } finally {
      setLoading(false);
    }
  }

  const isActive = status === "connected" || status === "reconnecting";

  return (
    <div className="space-y-5">
      {lastError && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="text-red-800">{lastError}</p>
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
          <Button onClick={handleConnect} disabled={loading || apiOnline === false} className="gap-2">
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
