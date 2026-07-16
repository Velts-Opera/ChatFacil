export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function bearerToken(authorization) {
  const match = /^Bearer\s+(.+)$/i.exec(String(authorization ?? "").trim());
  if (!match?.[1]) {
    throw new ApiError(
      401,
      "AUTH_REQUIRED",
      "Autenticação obrigatória. Envie Authorization: Bearer <token>.",
    );
  }
  return match[1];
}

export function errorPayload(error) {
  const status = Number(error?.status) || 500;
  const code = error?.code || "INTERNAL_ERROR";
  const message =
    status >= 500
      ? error instanceof ApiError
        ? error.message
        : error?.publicMessage || "Falha interna ao processar a operação do WhatsApp."
      : error?.message || "Não foi possível concluir a operação.";
  return { status, body: { error: { code, message } } };
}
