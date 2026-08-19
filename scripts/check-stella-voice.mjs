import { readFileSync } from "node:fs";

const server = readFileSync("src/lib/stella-voice.functions.ts", "utf8");
const client = readFileSync("src/components/stella-voice-panel.tsx", "utf8");
const start = readFileSync("src/start.ts", "utf8");
const publisher = readFileSync("scripts/publish-stella-vercel.ps1", "utf8");

function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`Missing Stella invariant: ${label}`);
}

function forbidText(text, needle, label) {
  if (text.includes(needle)) throw new Error(`Unsafe Stella invariant: ${label}`);
}

function forbidPattern(text, pattern, label) {
  if (pattern.test(text)) throw new Error(`Unsafe Stella invariant: ${label}`);
}

requireText(server, 'createServerFn({ method: "POST" })', "client-safe server function RPC wrapper");
requireText(server, ".middleware([requireSupabaseAuth])", "authenticated server function");
requireText(server, 'rpc("is_super_admin")', "server-side super-admin authorization");
requireText(server, 'canPublishSources: ["microphone"]', "microphone-only publish grant");
requireText(server, "canPublishData: false", "data publishing disabled");
requireText(server, "canUpdateOwnMetadata: false", "metadata mutation disabled");
requireText(server, 'agentName: STELLA_AGENT_NAME', "explicit Stella agent dispatch");
requireText(server, 'const STELLA_AGENT_NAME = "velts-bad"', "fixed production agent name");
requireText(server, 'const STELLA_IDENTITY = "velts"', "fixed authorized identity");
requireText(server, 'const LIVEKIT_PRODUCTION_URL = "wss://veltsapp-j8mqf7tp.livekit.cloud"', "fixed production LiveKit URL");
requireText(server, "configured !== LIVEKIT_PRODUCTION_URL", "reject alternate LiveKit endpoint");
requireText(server, 'jti: crypto.randomUUID()', "unique token identifier");
requireText(server, '"Cache-Control": "no-store, private"', "sensitive token response not cached");
requireText(server, "participantToken: string", "response contract contains only participant token");
requireText(server, "serverUrl: string", "response contract contains LiveKit URL");
forbidText(server, "VITE_LIVEKIT_API_SECRET", "secret must never be client-prefixed");
forbidPattern(server, /return\s*\{[^}]*apiSecret\s*:/s, "API secret must never be returned");
forbidPattern(server, /apiSecret\s*:\s*apiSecret/, "API secret must never be exposed as an object property");

requireText(
  client,
  "livekit-client@2.21.0/dist/livekit-client.umd.min.js",
  "pinned official LiveKit browser client",
);
requireText(client, 'from "@/lib/stella-voice.functions"', "client imports only RPC wrapper");
forbidText(client, "stella-voice.server", "client must never import a .server module");
requireText(client, "setMicrophoneEnabled(true)", "microphone publication");
forbidText(client, "setCameraEnabled", "camera publication forbidden");
forbidText(client, "enableCameraAndMicrophone", "camera+microphone helper forbidden");
forbidText(client, "participantToken}", "token must not be rendered in JSX");

requireText(start, "createCsrfMiddleware", "CSRF middleware installed");
requireText(start, 'ctx.handlerType === "serverFn"', "CSRF applies to server functions");

requireText(publisher, "$ExpectedLiveKitUrl = 'wss://veltsapp-j8mqf7tp.livekit.cloud'", "publisher pins Velts-Bad LiveKit endpoint");
requireText(publisher, "$ExpectedProjectId = 'prj_2bxeLmViz7MPHOA5hTuRe6lJZ1tL'", "publisher targets ChatFacil Vercel project");
requireText(publisher, "Publication must run from [main]", "publisher is main-only");
requireText(publisher, "Local main must exactly match origin/main", "publisher requires exact remote main");
requireText(publisher, "& lk app env -w", "publisher exports credentials using supported LiveKit CLI command");
requireText(publisher, "$previousErrorActionPreference = $ErrorActionPreference", "publisher preserves PowerShell error policy around native CLIs");
requireText(publisher, "$ErrorActionPreference = 'Continue'", "publisher tolerates native stderr warnings on Windows");
requireText(publisher, "$ErrorActionPreference = $previousErrorActionPreference", "publisher restores PowerShell error policy after native CLIs");
requireText(publisher, "if ($url -ne $ExpectedLiveKitUrl)", "publisher rejects a different active LiveKit project");
requireText(publisher, "LIVEKIT_API_KEY' -Value $liveKit.ApiKey -Sensitive $true", "API key stored as sensitive");
requireText(publisher, "LIVEKIT_API_SECRET' -Value $liveKit.ApiSecret -Sensitive $true", "API secret stored as sensitive");
requireText(publisher, "@('env', 'add', $Name, 'production', '--force', '--yes')", "publisher overwrites Vercel env values without delete-then-add gap");
requireText(publisher, "$Value | & $script:VercelCommand @arguments", "credentials are sent to Vercel over stdin instead of argv");
requireText(publisher, "Remove-Item -LiteralPath $tempDir -Recurse -Force", "temporary LiveKit export directory is deleted");
requireText(publisher, "@('deploy', '--prod', '--non-interactive')", "publisher deploys production non-interactively");
forbidText(publisher, "Start-Process -FilePath 'cmd.exe'", "publisher must not depend on cmd.exe input redirection");
forbidText(publisher, "cli-config.yaml", "publisher must not parse LiveKit CLI YAML internals");
forbidPattern(publisher, /Write-Host[^\n]*(ApiSecret|ApiKey)/i, "publisher must never print LiveKit credentials");

console.log("Stella voice security invariants passed.");
