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

export const AI_REQUEST_TIMEOUT_MS = 15_000;

export function isAiAutoReplyEnabled(channel: { ai_enabled?: boolean | null; auto_reply_enabled?: boolean | null }): boolean {
  return channel.ai_enabled === true && channel.auto_reply_enabled === true;
}

export function parseRetryAfterMs(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}

function isAlibabaModelStudioHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === "dashscope.aliyuncs.com"
    || host === "dashscope-intl.aliyuncs.com"
    || host === "dashscope-us.aliyuncs.com"
    || /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.maas\.aliyuncs\.com$/.test(host);
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

  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port || parsed.search || parsed.hash) {
    throw new Error("AI_BASE_URL deve ser uma URL HTTPS sem credenciais, porta customizada, query ou fragmento");
  }

  const normalizedPath = parsed.pathname.replace(/\/+$/, "");
  if (provider === "alibaba" && (!isAlibabaModelStudioHost(parsed.hostname) || normalizedPath !== "/compatible-mode/v1")) {
    throw new Error("AI_BASE_URL da Alibaba deve usar um host oficial aliyuncs.com e terminar em /compatible-mode/v1");
  }

  parsed.pathname = `${normalizedPath}/chat/completions`;

  return {
    provider,
    model: env.AI_MODEL?.trim() || env.OPENAI_MODEL?.trim() || (provider === "alibaba" ? "qwen-plus" : "gpt-4o-mini"),
    apiKey,
    chatCompletionsUrl: parsed.toString(),
  };
}
