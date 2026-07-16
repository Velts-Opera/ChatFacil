import express from "express";
import { ApiError, bearerToken, errorPayload } from "./api-error.js";

function requireQrChannel(channel) {
  if (channel.provider !== "qr_code") {
    throw new ApiError(
      409,
      "QR_PROVIDER_REQUIRED",
      "Esta operação é exclusiva de canais com provider qr_code.",
    );
  }
}

export function createWhatsappApp({ gateway, sessionManager, allowedOrigins, logger }) {
  const origins = [
    ...new Set((allowedOrigins ?? []).map((origin) => origin.trim()).filter(Boolean)),
  ];
  if (origins.length === 0)
    throw new Error("ALLOWED_ORIGINS deve conter ao menos um domínio permitido.");
  const app = express();

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && !origins.includes(origin)) {
      return res
        .status(403)
        .json({
          error: {
            code: "CORS_ORIGIN_DENIED",
            message: "Origem não permitida por ALLOWED_ORIGINS.",
          },
        });
    }
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type");
    if (req.method === "OPTIONS") return res.status(204).end();
    return next();
  });
  app.use(express.json({ limit: "64kb" }));

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      service: "chatfacil-whatsapp-api",
      sessions: sessionManager.count,
      uptime: process.uptime(),
    });
  });

  const router = express.Router({ mergeParams: true });
  router.use(async (req, _res, next) => {
    try {
      const token = bearerToken(req.headers.authorization);
      req.whatsappAuth = await gateway.authorizeChannel(token, req.params.channelId);
      next();
    } catch (error) {
      next(error);
    }
  });

  router.post("/connect", async (req, res, next) => {
    try {
      requireQrChannel(req.whatsappAuth.channel);
      const state = await sessionManager.connect(req.params.channelId);
      res.json({ ok: true, ...state });
    } catch (error) {
      next(error);
    }
  });

  router.get("/status", (req, res, next) => {
    try {
      const { channel } = req.whatsappAuth;
      const state =
        channel.provider === "qr_code"
          ? sessionManager.getStatus(channel.id)
          : { status: channel.status, phoneNumber: channel.phone_number ?? null };
      res.json(state);
    } catch (error) {
      next(error);
    }
  });

  router.get("/qr", (req, res, next) => {
    try {
      requireQrChannel(req.whatsappAuth.channel);
      res.json(sessionManager.getQr(req.params.channelId));
    } catch (error) {
      next(error);
    }
  });

  router.post("/disconnect", async (req, res, next) => {
    try {
      requireQrChannel(req.whatsappAuth.channel);
      await sessionManager.disconnect(req.params.channelId, { clearAuth: true });
      res.json({ ok: true, status: "disconnected" });
    } catch (error) {
      next(error);
    }
  });

  router.post("/send", async (req, res, next) => {
    try {
      const { channel, companyId, token } = req.whatsappAuth;
      const message = String(req.body?.message ?? "").trim();
      if (!message) throw new ApiError(400, "MESSAGE_REQUIRED", "message é obrigatória.");
      if (message.length > 4096)
        throw new ApiError(
          400,
          "MESSAGE_TOO_LONG",
          "A mensagem excede o limite de 4096 caracteres.",
        );

      if (channel.provider !== "qr_code") {
        const result = await gateway.sendMetaMessage(token, {
          channel_id: channel.id,
          to: req.body?.to,
          conversation_id: req.body?.conversation_id,
          message,
        });
        return res.json(result);
      }

      const destination = await gateway.resolveDestination({
        companyId,
        channelId: channel.id,
        to: req.body?.to,
        conversationId: req.body?.conversation_id,
      });
      const sent = await sessionManager.send(channel.id, destination.to, message);
      const providerMessageId = sent?.key?.id ?? null;
      const persisted = await gateway.recordQrOutbound({
        channel,
        destination,
        message,
        providerMessageId,
      });
      return res.json({
        ok: true,
        conversation_id: persisted.conversationId,
        message_id: persisted.messageId,
        provider_message_id: providerMessageId,
      });
    } catch (error) {
      return next(error);
    }
  });

  app.use("/api/whatsapp/channels/:channelId", router);
  app.use((_req, res) =>
    res.status(404).json({ error: { code: "ROUTE_NOT_FOUND", message: "Rota não encontrada." } }),
  );
  app.use((error, _req, res, _next) => {
    const payload = errorPayload(error);
    if (payload.status >= 500) logger?.error?.({ error }, "Falha na API do WhatsApp");
    res.status(payload.status).json(payload.body);
  });
  return app;
}
