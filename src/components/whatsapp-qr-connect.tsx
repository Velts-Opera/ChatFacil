import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  CheckCircle2,
  Loader2,
  PhoneOff,
  QrCode,
  RefreshCw,
  Smartphone,
  TriangleAlert,
  Wifi,
  WifiOff,
} from "lucide-react";
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
  connecting: "Iniciando conexão...",
  qr_pending: "Aguardando conexão",
  connected: "Conectado",
  reconnecting: "Reconectando...",
  expired: "Código expirado",
  error: "Erro de conexão",
};

const STATUS_COLOR: Record<ConnectionStatus, string> = {
  disconnected: "bg-muted text-muted-foreground",
  connecting: "bg-amber-100 text-amber-800",
  qr_pending: "bg-amber-100 text-amber-800",
  connected: "bg-green-100 text-green-800",
  reconnecting: "bg-blue-100 text-blue-800",
  expired: "bg-orange-100 text-orange-800",
  error: "bg-red-100 text-red-800",
};

// Ninguém consegue escanear um QR exibido na própria tela: no celular,
// oferecemos código de pareamento por número em vez do QR.
function isMobileDevice() {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

function useCountdown(expiresAt: number | null) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!expiresAt) {
      setSecondsLeft(null);
      return;
    }
    const tick = () => setSecondsLeft(Math.max(0, Math.round((expiresAt - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  return secondsLeft;
}

export function WhatsAppQrConnect({
  channelId,
  initialStatus,
  onConnected,
  onDisconnected,
}: Props) {
  const [status, setStatus] = useState<ConnectionStatus>(initialStatus ?? "disconnected");
  const [qr, setQr] = useState<string | null>(null);
  const [qrExpiresAt, setQrExpiresAt] = useState<number | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [useMobilePairing, setUseMobilePairing] = useState(isMobileDevice());
  const [pairingPhone, setPairingPhone] = useState("");
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingLoading, setPairingLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const provider = useRef(createQrProvider(channelId));
  useEffect(() => {
    provider.current = createQrProvider(channelId);
  }, [channelId]);

  const secondsLeft = useCountdown(qrExpiresAt);

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
      setQrExpiresAt(data.qrExpiresAt);
      if (data.pairingCode) setPairingCode(data.pairingCode);
      if (data.phoneNumber) setPhoneNumber(data.phoneNumber);

      if (data.status === "connected") {
        stopPoll();
        onConnected?.(data.phoneNumber ?? "");
      }
      if (data.status === "disconnected" || data.status === "expired") {
        stopPoll();
        if (data.status === "disconnected") onDisconnected?.();
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

  useEffect(() => {
    let cancelled = false;
    const check = () =>
      provider.current
        .checkHealth()
        .then((ok) => {
          if (!cancelled) setApiOnline(ok);
        })
        .catch((error) => {
          if (!cancelled) {
            setApiOnline(false);
            setLastError(formatWhatsAppApiError(error));
          }
        });
    check();
    const timer = setInterval(check, 8000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [channelId]);

  useEffect(() => {
    if (
      apiOnline &&
      ["qr_pending", "reconnecting", "connecting"].includes(status) &&
      !pollRef.current
    ) {
      startPoll();
    }
  }, [apiOnline, status, startPoll]);

  useEffect(() => {
    if (
      initialStatus &&
      ["connected", "qr_pending", "reconnecting", "connecting"].includes(initialStatus)
    ) {
      startPoll();
    }
    return stopPoll;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleConnect() {
    setLoading(true);
    setLastError(null);
    setPairingCode(null);
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

  async function handleRequestPairing() {
    const digits = pairingPhone.replace(/\D/g, "");
    if (digits.length < 10) {
      setLastError("Informe o número com DDI e DDD (ex: 55 22 99999-8888).");
      return;
    }
    setPairingLoading(true);
    setLastError(null);
    try {
      const code = await provider.current.requestPairingCode(digits);
      setPairingCode(code);
    } catch (error) {
      setLastError(formatWhatsAppApiError(error));
    } finally {
      setPairingLoading(false);
    }
  }

  async function handleDisconnect() {
    setLoading(true);
    try {
      await provider.current.disconnect();
      setStatus("disconnected");
      setQr(null);
      setPairingCode(null);
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
  const isWaiting = status === "qr_pending" || status === "connecting";
  const formattedCountdown = useMemo(() => {
    if (secondsLeft === null) return null;
    const m = Math.floor(secondsLeft / 60);
    const s = secondsLeft % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }, [secondsLeft]);

  return (
    <div className="space-y-5">
      {lastError && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
          <p className="text-red-800">{lastError}</p>
        </div>
      )}

      <div className="flex items-center gap-3">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
            STATUS_COLOR[status],
          )}
        >
          {isWaiting && <Loader2 className="h-3 w-3 animate-spin" />}
          {status === "connected" && <CheckCircle2 className="h-3 w-3" />}
          {status === "reconnecting" && <Loader2 className="h-3 w-3 animate-spin" />}
          {(status === "error" || status === "expired") && <TriangleAlert className="h-3 w-3" />}
          {status === "disconnected" && <WifiOff className="h-3 w-3" />}
          {STATUS_LABEL[status]}
        </span>
        {phoneNumber && status === "connected" && (
          <Badge variant="outline" className="font-mono text-xs">
            +{phoneNumber}
          </Badge>
        )}
      </div>

      {isWaiting && (
        <div className="space-y-4 rounded-xl border bg-white p-6 shadow-sm">
          <div className="flex justify-center gap-2 rounded-lg bg-muted p-1 text-sm">
            <button
              type="button"
              onClick={() => setUseMobilePairing(false)}
              className={cn(
                "flex-1 rounded-md py-1.5 font-medium",
                !useMobilePairing ? "bg-white shadow-sm" : "text-muted-foreground",
              )}
            >
              QR Code
            </button>
            <button
              type="button"
              onClick={() => setUseMobilePairing(true)}
              className={cn(
                "flex-1 rounded-md py-1.5 font-medium",
                useMobilePairing ? "bg-white shadow-sm" : "text-muted-foreground",
              )}
            >
              Código por número
            </button>
          </div>

          {!useMobilePairing ? (
            <div className="flex flex-col items-center gap-4">
              {qr ? (
                <>
                  <img src={qr} alt="QR Code WhatsApp" className="h-56 w-56 rounded-lg" />
                  <p className="max-w-xs text-center text-sm text-muted-foreground">
                    Abra o WhatsApp em outro celular → <strong>Aparelhos conectados</strong> →{" "}
                    <strong>Conectar aparelho</strong> e escaneie o código acima.
                  </p>
                </>
              ) : (
                <div className="flex flex-col items-center gap-3 py-6">
                  <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Gerando QR Code...</p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <Smartphone className="h-8 w-8 text-muted-foreground" />
              {!pairingCode ? (
                <div className="flex w-full max-w-xs flex-col gap-2">
                  <Input
                    placeholder="Ex: 5522999998888"
                    value={pairingPhone}
                    onChange={(e) => setPairingPhone(e.target.value)}
                    inputMode="numeric"
                  />
                  <Button
                    onClick={handleRequestPairing}
                    disabled={pairingLoading || !qr}
                    className="gap-2"
                  >
                    {pairingLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Gerar código
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">
                    Use o número (com DDI e DDD) do celular onde o WhatsApp está instalado.
                  </p>
                </div>
              ) : (
                <>
                  <div className="rounded-lg border bg-muted/40 px-6 py-3 font-mono text-2xl tracking-[0.3em]">
                    {pairingCode}
                  </div>
                  <p className="max-w-xs text-center text-sm text-muted-foreground">
                    No WhatsApp deste celular: <strong>Aparelhos conectados</strong> →{" "}
                    <strong>Conectar com número</strong> e digite o código acima.
                  </p>
                </>
              )}
            </div>
          )}

          {formattedCountdown && (
            <p className="text-center text-xs text-muted-foreground">
              Expira em {formattedCountdown}
            </p>
          )}
        </div>
      )}

      {status === "expired" && (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-orange-200 bg-orange-50 p-6 text-center">
          <TriangleAlert className="h-6 w-6 text-orange-600" />
          <p className="text-sm text-orange-900">O código expirou antes de ser usado.</p>
          <Button size="sm" onClick={handleConnect} disabled={loading} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Tentar novamente
          </Button>
        </div>
      )}

      {status === "connected" && (
        <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
          <Wifi className="h-5 w-5 text-green-600" />
          <div>
            <p className="text-sm font-medium text-green-900">WhatsApp conectado</p>
            {phoneNumber && <p className="text-xs text-green-700">Número: +{phoneNumber}</p>}
            <p className="text-xs text-green-700">
              Mensagens serão recebidas automaticamente na Caixa de Entrada.
            </p>
          </div>
        </div>
      )}

      {status === "reconnecting" && (
        <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          <div>
            <p className="text-sm font-medium text-blue-900">Reconectando...</p>
            <p className="text-xs text-blue-700">
              A conexão caiu. Tentando reconectar automaticamente.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {!isActive && !isWaiting && status !== "expired" && (
          <Button
            onClick={handleConnect}
            disabled={loading || apiOnline === false}
            className="gap-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <QrCode className="h-4 w-4" />
            )}
            Conectar meu WhatsApp
          </Button>
        )}
        {(isActive || isWaiting) && (
          <Button
            variant="destructive"
            onClick={handleDisconnect}
            disabled={loading}
            className="gap-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PhoneOff className="h-4 w-4" />
            )}
            Desconectar
          </Button>
        )}
      </div>
    </div>
  );
}
