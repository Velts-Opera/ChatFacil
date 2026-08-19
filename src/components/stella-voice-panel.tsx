import { useEffect, useRef, useState } from "react";
import { AudioLines, Mic, PhoneOff, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createStellaVoiceSession } from "@/lib/stella-voice.functions";

const LIVEKIT_CLIENT_SRC =
  "https://cdn.jsdelivr.net/npm/livekit-client@2.21.0/dist/livekit-client.umd.min.js";

type RemoteAudioTrack = {
  kind: string;
  attach: () => HTMLMediaElement;
};

type LiveKitRoom = {
  on: (event: string, callback: (...args: unknown[]) => void) => LiveKitRoom;
  connect: (serverUrl: string, token: string, options?: { autoSubscribe?: boolean }) => Promise<void>;
  startAudio: () => Promise<void>;
  disconnect: () => Promise<void>;
  localParticipant: {
    setMicrophoneEnabled: (enabled: boolean) => Promise<unknown>;
  };
};

type LiveKitClientNamespace = {
  Room: new () => LiveKitRoom;
  RoomEvent: {
    TrackSubscribed: string;
    Disconnected: string;
  };
  Track: {
    Kind: {
      Audio: string;
    };
  };
};

declare global {
  interface Window {
    LivekitClient?: LiveKitClientNamespace;
  }
}

let liveKitLoader: Promise<LiveKitClientNamespace> | null = null;

function loadLiveKitClient(): Promise<LiveKitClientNamespace> {
  if (typeof window === "undefined") return Promise.reject(new Error("Navegador indisponivel."));
  if (window.LivekitClient) return Promise.resolve(window.LivekitClient);
  if (liveKitLoader) return liveKitLoader;

  liveKitLoader = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${LIVEKIT_CLIENT_SRC}"]`);
    const script = existing ?? document.createElement("script");

    const finish = () => {
      if (window.LivekitClient) resolve(window.LivekitClient);
      else reject(new Error("O cliente de voz nao carregou."));
    };

    script.addEventListener("load", finish, { once: true });
    script.addEventListener(
      "error",
      () => reject(new Error("Nao foi possivel carregar o cliente de voz.")),
      { once: true },
    );

    if (!existing) {
      script.src = LIVEKIT_CLIENT_SRC;
      script.async = true;
      script.crossOrigin = "anonymous";
      document.head.appendChild(script);
    }
  });

  return liveKitLoader;
}

type VoiceState = "idle" | "connecting" | "connected" | "error";

export function StellaVoicePanel() {
  const [state, setState] = useState<VoiceState>("idle");
  const [message, setMessage] = useState("Pronta para uma conversa privada por voz.");
  const roomRef = useRef<LiveKitRoom | null>(null);
  const audioHostRef = useRef<HTMLDivElement | null>(null);

  async function disconnect() {
    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
      try {
        await room.localParticipant.setMicrophoneEnabled(false);
      } catch {
        // The room may already be disconnected.
      }
      try {
        await room.disconnect();
      } catch {
        // Nothing else to clean up.
      }
    }
    audioHostRef.current?.replaceChildren();
    setState("idle");
    setMessage("Sessao encerrada.");
  }

  useEffect(() => {
    return () => {
      const room = roomRef.current;
      roomRef.current = null;
      if (room) void room.disconnect();
      audioHostRef.current?.replaceChildren();
    };
  }, []);

  async function connect() {
    if (state === "connecting" || state === "connected") return;
    setState("connecting");
    setMessage("Criando sessao privada...");

    try {
      const [credentials, sdk] = await Promise.all([createStellaVoiceSession(), loadLiveKitClient()]);
      if (!credentials.ok) throw new Error(credentials.error);

      const room = new sdk.Room();
      roomRef.current = room;

      room.on(sdk.RoomEvent.TrackSubscribed, (...args: unknown[]) => {
        const track = args[0] as RemoteAudioTrack | undefined;
        if (!track || track.kind !== sdk.Track.Kind.Audio) return;
        const element = track.attach();
        element.autoplay = true;
        element.controls = false;
        audioHostRef.current?.replaceChildren(element);
        setMessage("Stella esta falando e ouvindo voce.");
      });

      room.on(sdk.RoomEvent.Disconnected, () => {
        roomRef.current = null;
        audioHostRef.current?.replaceChildren();
        setState("idle");
        setMessage("Sessao encerrada.");
      });

      await room.connect(credentials.serverUrl, credentials.participantToken, { autoSubscribe: true });
      try {
        await room.startAudio();
      } catch {
        // Audio can still start when the first remote track is attached.
      }
      await room.localParticipant.setMicrophoneEnabled(true);

      setState("connected");
      setMessage("Conectada. Fale normalmente com a Stella.");
    } catch (error) {
      const room = roomRef.current;
      roomRef.current = null;
      if (room) {
        try {
          await room.disconnect();
        } catch {
          // Ignore cleanup errors and surface the original failure.
        }
      }
      audioHostRef.current?.replaceChildren();
      setState("error");
      setMessage(error instanceof Error ? error.message : "Falha ao conectar com a Stella.");
    }
  }

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <AudioLines className="h-5 w-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg font-bold">Stella · voz privada</h2>
              <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-1 text-[11px] font-semibold text-success">
                <ShieldCheck className="h-3 w-3" /> somente admin
              </span>
            </div>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Conversa direta com a Stella. O navegador publica somente o microfone; camera e dados
              ficam desabilitados pelo token da sessao.
            </p>
            <p
              className={`mt-2 text-sm font-medium ${
                state === "error" ? "text-destructive" : state === "connected" ? "text-success" : "text-muted-foreground"
              }`}
            >
              {message}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 gap-2">
          {state !== "connected" ? (
            <Button onClick={() => void connect()} disabled={state === "connecting"}>
              <Mic className="mr-2 h-4 w-4" />
              {state === "connecting" ? "Conectando..." : "Falar com Stella"}
            </Button>
          ) : (
            <Button variant="destructive" onClick={() => void disconnect()}>
              <PhoneOff className="mr-2 h-4 w-4" /> Encerrar
            </Button>
          )}
        </div>
      </div>
      <div ref={audioHostRef} className="hidden" aria-hidden="true" />
    </section>
  );
}