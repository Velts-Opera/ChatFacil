export type AiProviderEnvironment = {
  AI_PROVIDER?: string;
  AI_BASE_URL?: string;
  AI_MODEL?: string;
  AI_API_KEY?: string;
  OPENAI_MODEL?: string;
  OPENAI_API_KEY?: string;
};

export type AiProviderConfig = {
  provider: string;
  model: string;
  apiKey: string;
  chatCompletionsUrl: string;
};

export function isAiAutoReplyEnabled(channel: { ai_enabled?: boolean | null; auto_reply_enabled?: boolean | null }): boolean {
  return channel.ai_enabled === true && channel.auto_reply_enabled === true;
}

export function resolveAiProviderConfig(env: AiProviderEnvironment): AiProviderConfig {
  const provider = env.AI_PROVIDER?.trim().toLowerCase() || "openai";
  const apiKey = env.AI_API_KEY?.trim() || env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("AI_API_KEY ausente");

  const explicitBaseUrl = env.AI_BASE_URL?.trim();
  if (provider !== "openai" && !explicitBaseUrl) {
    throw new Error("AI_BASE_URL obrigatória para provedores diferentes de OpenAI");
  }

  const baseUrl = explicitBaseUrl || "https://api.openai.com/v1";
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error("AI_BASE_URL inválida");
  }

  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("AI_BASE_URL deve ser uma URL HTTPS sem credenciais, query ou fragmento");
  }

  const normalizedPath = parsed.pathname.replace(/\/+$/, "");
  if (provider === "alibaba" && !normalizedPath.endsWith("/compatible-mode/v1")) {
    throw new Error("AI_BASE_URL da Alibaba deve terminar em /compatible-mode/v1");
  }

  parsed.pathname = `${normalizedPath}/chat/completions`;

  return {
    provider,
    model: env.AI_MODEL?.trim() || env.OPENAI_MODEL?.trim() || (provider === "alibaba" ? "qwen-plus" : "gpt-4o-mini"),
    apiKey,
    chatCompletionsUrl: parsed.toString(),
  };
}
