import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { CheckCircle2, Copy, ExternalLink, Loader2, QrCode, ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

type SignupStatus = "pending" | "authorizing" | "completed" | "expired" | "error";

type MetaConfig = {
  app_id: string;
  configuration_id: string;
  graph_version: string;
};

type StatusResponse = {
  ok?: boolean;
  status?: SignupStatus;
  expires_at?: string;
  last_error?: string | null;
  meta?: MetaConfig;
  error?: string;
};

type SessionInfo = {
  wabaId: string;
  phoneNumberId: string;
};

type FacebookLoginResponse = {
  authResponse?: { code?: string };
  status?: string;
};

type FacebookSdk = {
  init: (options: { appId: string; cookie: boolean; xfbml: boolean; version: string }) => void;
  login: (
    callback: (response: FacebookLoginResponse) => void,
    options: Record<string, unknown>,
  ) => void;
};

declare global {
  interface Window {
    FB?: FacebookSdk;
    fbAsyncInit?: () => void;
  }
}

let facebookSdkPromise: Promise<FacebookSdk> | null = null;

function loadFacebookSdk(meta: MetaConfig) {
  if (window.FB) {
    window.FB.init({ appId: meta.app_id, cookie: true, xfbml: false, version: meta.graph_version });
    return Promise.resolve(window.FB);
  }
  if (facebookSdkPromise) return facebookSdkPromise;

  facebookSdkPromise = new Promise<FacebookSdk>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("A Meta não carregou o SDK de autorização.")), 15_000);
    window.fbAsyncInit = () => {
      if (!window.FB) {
        window.clearTimeout(timeout);
        reject(new Error("SDK da Meta indisponível."));
        return;
      }
      window.FB.init({ appId: meta.app_id, cookie: true, xfbml: false, version: meta.graph_version });
      window.clearTimeout(timeout);
      resolve(window.FB);
    };

    if (!document.getElementById("facebook-jssdk")) {
      const script = document.createElement("script");
      script.id = "facebook-jssdk";
      script.async = true;
      script.defer = true;
      script.crossOrigin = "anonymous";
      script.src = "https://connect.facebook.net/pt_BR/sdk.js";
      script.onerror = () => {
        window.clearTimeout(timeout);
        facebookSdkPromise = null;
        reject(new Error("Não foi possível carregar o SDK da Meta."));
      };
      document.head.appendChild(script);
    }
  });

  return facebookSdkPromise;
}

async function invokeEmbeddedSignup(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("whatsapp-embedded-signup", { body });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data;
}

function isFacebookOrigin(origin: string) {
  try {
    const hostname = new URL(origin).hostname;
    return hostname === "facebook.com" || hostname.endsWith(".facebook.com");
  } catch {
    return false;
  }
}

export function MetaEmbeddedSignup({ token, onComplete }: {
  token: string;
  onComplete?: (channelId?: string) => void | Promise<void>;
}) {
  const [status, setStatus] = useState<SignupStatus>("pending");
  const [meta, setMeta] = useState<MetaConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [authCode, setAuthCode] = useState<string | null>(null);
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const completionStarted = useRef(false);

  const loadStatus = useCallback(async () => {
    const data = await invokeEmbeddedSignup({ action: "status", token }) as StatusResponse;
    setStatus(data.status ?? "error");
    setMeta(data.meta ?? null);
    setError(data.last_error ?? null);
    return data;
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    loadStatus()
      .then((data) => {
        if (!cancelled && data.status === "completed") onComplete?.();
      })
      .catch((cause) => {
        if (!cancelled) {
          setStatus("error");
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loadStatus, onComplete]);

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (!isFacebookOrigin(event.origin)) return;
      let payload = event.data;
      if (typeof payload === "string") {
        try { payload = JSON.parse(payload); } catch { return; }
      }
      if (payload?.type !== "WA_EMBEDDED_SIGNUP") return;
      if (payload.event === "FINISH") {
        const wabaId = payload.data?.waba_id;
        const phoneNumberId = payload.data?.phone_number_id;
        if (wabaId && phoneNumberId) setSessionInfo({ wabaId, phoneNumberId });
      } else if (payload.event === "ERROR") {
        setStatus("error");
        setError(payload.data?.error_message || "A Meta não concluiu o onboarding.");
      }
    };
    window.addEventListener("message", listener);
    return () => window.removeEventListener("message", listener);
  }, []);

  useEffect(() => {
    if (!authCode || !sessionInfo || completionStarted.current) return;
    completionStarted.current = true;
    setStatus("authorizing");
    setError(null);

    invokeEmbeddedSignup({
      action: "complete",
      token,
      code: authCode,
      waba_id: sessionInfo.wabaId,
      phone_number_id: sessionInfo.phoneNumberId,
    })
      .then(async (data) => {
        setStatus("completed");
        await onComplete?.(data?.channel_id);
      })
      .catch((cause) => {
        completionStarted.current = false;
        setStatus("error");
        setError(cause instanceof Error ? cause.message : String(cause));
      });
  }, [authCode, onComplete, sessionInfo, token]);

  async function launch() {
    if (!meta) return;
    setLoading(true);
    setError(null);
    try {
      const sdk = await loadFacebookSdk(meta);
      sdk.login((response) => {
        const code = response.authResponse?.code;
        if (!code) {
          setLoading(false);
          if (response.status !== "connected") setError("Autorização cancelada ou não concluída.");
          return;
        }
        setAuthCode(code);
        setLoading(false);
      }, {
        config_id: meta.configuration_id,
        response_type: "code",
        override_default_response_type: true,
        extras: { setup: {}, featureType: "", sessionInfoVersion: "3" },
      });
    } catch (cause) {
      setLoading(false);
      setStatus("error");
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  if (loading && !meta) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Validando onboarding...</div>;
  }

  if (status === "completed") {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
        <div className="flex items-center gap-2 font-medium"><CheckCircle2 className="h-5 w-5" />WhatsApp conectado</div>
        <p className="mt-1 text-sm">A autorização oficial foi concluída e o canal já está vinculado à empresa correta.</p>
      </div>
    );
  }

  const unavailable = status === "expired" || status === "authorizing";
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border bg-card p-5">
        <ShieldCheck className="mt-0.5 h-5 w-5 text-primary" />
        <div>
          <h2 className="font-medium">Conexão oficial com a Meta</h2>
          <p className="mt-1 text-sm text-muted-foreground">Você será direcionado ao fluxo oficial para escolher a empresa, a WABA e o número do WhatsApp.</p>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />{error}
        </div>
      )}

      <Button className="w-full" size="lg" disabled={!meta || unavailable || loading} onClick={launch}>
        {(loading || status === "authorizing") && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {status === "expired" ? "Link expirado" : status === "authorizing" ? "Concluindo autorização..." : "Conectar WhatsApp"}
      </Button>
    </div>
  );
}

export function MetaOnboardingLink({ onComplete }: {
  onComplete?: () => void | Promise<void>;
}) {
  const [creating, setCreating] = useState(false);
  const [onboardingUrl, setOnboardingUrl] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const completed = useRef(false);

  async function createLink() {
    setCreating(true);
    try {
      const data = await invokeEmbeddedSignup({ action: "create" });
      const url = `${window.location.origin}/onboarding/${encodeURIComponent(data.onboarding_token)}`;
      const qr = await QRCode.toDataURL(url, { width: 280, margin: 2, errorCorrectionLevel: "M" });
      setOnboardingUrl(url);
      setQrDataUrl(qr);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : "Não foi possível criar o onboarding.");
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    if (!onboardingUrl || completed.current) return;
    const token = decodeURIComponent(onboardingUrl.split("/").pop() ?? "");
    const poll = window.setInterval(() => {
      invokeEmbeddedSignup({ action: "status", token })
        .then(async (data) => {
          if (data?.status !== "completed" || completed.current) return;
          completed.current = true;
          window.clearInterval(poll);
          toast.success("WhatsApp conectado pela Meta.");
          await onComplete?.();
        })
        .catch(() => undefined);
    }, 4_000);
    return () => window.clearInterval(poll);
  }, [onComplete, onboardingUrl]);

  async function copyLink() {
    if (!onboardingUrl) return;
    await navigator.clipboard.writeText(onboardingUrl);
    toast.success("Link de onboarding copiado.");
  }

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary"><QrCode className="h-5 w-5" /></div>
        <div className="flex-1">
          <h2 className="font-medium">Onboarding oficial por QR Code</h2>
          <p className="mt-1 text-sm text-muted-foreground">O QR abre uma página segura; a autorização e a conexão acontecem no Embedded Signup da Meta.</p>
        </div>
      </div>

      {!onboardingUrl ? (
        <Button className="mt-4" onClick={createLink} disabled={creating}>
          {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
          Gerar QR de onboarding
        </Button>
      ) : (
        <div className="mt-5 grid gap-5 md:grid-cols-[280px_1fr] md:items-center">
          {qrDataUrl && <img src={qrDataUrl} alt="QR Code do onboarding oficial da Meta" className="h-[280px] w-[280px] rounded-lg border bg-white" />}
          <div className="space-y-3">
            <p className="text-sm">Escaneie com o celular do responsável pela conta Meta. O link é temporário e de uso único.</p>
            <div className="break-all rounded-lg bg-muted p-3 font-mono text-xs">{onboardingUrl}</div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={copyLink}><Copy className="mr-2 h-4 w-4" />Copiar link</Button>
              <Button variant="outline" asChild><a href={onboardingUrl} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Abrir onboarding</a></Button>
              <Button variant="ghost" onClick={createLink} disabled={creating}>Gerar outro</Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
