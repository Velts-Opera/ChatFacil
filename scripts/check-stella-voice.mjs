import { readFileSync } from "node:fs";

const server = readFileSync("src/lib/stella-voice.server.ts", "utf8");
const client = readFileSync("src/components/stella-voice-panel.tsx", "utf8");
const start = readFileSync("src/start.ts", "utf8");

function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`Missing Stella invariant: ${label}`);
}

function forbidText(text, needle, label) {
  if (text.includes(needle)) throw new Error(`Unsafe Stella invariant: ${label}`);
}

requireText(server, ".middleware([requireSupabaseAuth])", "authenticated server function");
requireText(server, 'rpc("is_super_admin")', "server-side super-admin authorization");
requireText(server, 'canPublishSources: ["microphone"]', "microphone-only publish grant");
requireText(server, "canPublishData: false", "data publishing disabled");
requireText(server, "canUpdateOwnMetadata: false", "metadata mutation disabled");
requireText(server, 'agentName: STELLA_AGENT_NAME', "explicit Stella agent dispatch");
requireText(server, 'const STELLA_AGENT_NAME = "velts-bad"', "fixed production agent name");
requireText(server, 'const STELLA_IDENTITY = "velts"', "fixed authorized identity");
requireText(server, '"Cache-Control": "no-store, private"', "sensitive token response not cached");
forbidText(server, "VITE_LIVEKIT_API_SECRET", "secret must never be client-prefixed");
forbidText(server, "apiSecret,", "API secret must never be returned in response");

requireText(
  client,
  "livekit-client@2.21.0/dist/livekit-client.umd.min.js",
  "pinned official LiveKit browser client",
);
requireText(client, "setMicrophoneEnabled(true)", "microphone publication");
forbidText(client, "setCameraEnabled", "camera publication forbidden");
forbidText(client, "enableCameraAndMicrophone", "camera+microphone helper forbidden");
forbidText(client, "participantToken}", "token must not be rendered in JSX");

requireText(start, "createCsrfMiddleware", "CSRF middleware installed");
requireText(start, 'ctx.handlerType === "serverFn"', "CSRF applies to server functions");

console.log("Stella voice security invariants passed.");
