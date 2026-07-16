import "dotenv/config";
import pino from "pino";
import { createSupabaseGateway } from "./lib/supabase-gateway.js";
import { createTenantAgent } from "./lib/tenant-agent.js";
import { SessionManager } from "./lib/session-manager.js";
import { createWhatsappApp } from "./lib/whatsapp-api.js";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} é obrigatória.`);
  return value;
}

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });
const port = Number.parseInt(process.env.PORT ?? "3001", 10);
const host = "0.0.0.0";
const gateway = createSupabaseGateway({
  supabaseUrl: required("SUPABASE_URL"),
  anonKey: required("SUPABASE_ANON_KEY"),
  serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
});
const tenantAgent = createTenantAgent({
  supabaseUrl: process.env.SUPABASE_URL,
  serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  geminiApiKey: required("GEMINI_API_KEY"),
  logger,
});
const sessionManager = new SessionManager({
  dataPath: process.env.SESSION_DATA_PATH ?? "/data",
  logger,
  onStateChange: (channelId, values) => gateway.updateChannel(channelId, values),
  onMessage: (message) => tenantAgent.processMessage(message),
});
const app = createWhatsappApp({
  gateway,
  sessionManager,
  allowedOrigins: required("ALLOWED_ORIGINS").split(","),
  logger,
});

const server = app.listen(port, host, () => {
  logger.info({ host, port }, "ChatFacil WhatsApp API iniciada");
  sessionManager
    .restore({ canRestore: (channelId) => gateway.canRestoreChannel(channelId) })
    .then((restored) =>
      logger.info({ restored: restored.length }, "Restauração de sessões concluída"),
    )
    .catch((error) => logger.error({ error }, "Falha na restauração de sessões"));
});

function shutdown(signal) {
  logger.info({ signal }, "Encerrando API do WhatsApp");
  server.close(() => process.exit(0));
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
