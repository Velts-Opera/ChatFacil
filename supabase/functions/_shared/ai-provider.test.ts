import assert from "node:assert/strict";
import test from "node:test";

import { AI_REQUEST_TIMEOUT_MS, isAiAutoReplyEnabled, parseRetryAfterMs, resolveAiProviderConfig } from "./ai-provider.ts";

test("limita a chamada de IA para o webhook responder antes do timeout externo", () => {
  assert.equal(AI_REQUEST_TIMEOUT_MS, 15_000);
});

test("interpreta Retry-After em segundos e data HTTP", () => {
  assert.equal(parseRetryAfterMs("1.5"), 1500);
  assert.equal(parseRetryAfterMs("Wed, 22 Jul 2026 03:00:02 GMT", Date.parse("Wed, 22 Jul 2026 03:00:00 GMT")), 2000);
  assert.equal(parseRetryAfterMs("inválido"), null);
});

test("exige os dois controles do canal para responder com IA", () => {
  assert.equal(isAiAutoReplyEnabled({ ai_enabled: true, auto_reply_enabled: true }), true);
  assert.equal(isAiAutoReplyEnabled({ ai_enabled: true, auto_reply_enabled: false }), false);
  assert.equal(isAiAutoReplyEnabled({ ai_enabled: false, auto_reply_enabled: true }), false);
  assert.equal(isAiAutoReplyEnabled({ ai_enabled: false, auto_reply_enabled: false }), false);
});

test("monta o endpoint OpenAI-compatible do Alibaba para qwen-plus", () => {
  const config = resolveAiProviderConfig({
    AI_PROVIDER: "alibaba",
    AI_BASE_URL: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    AI_MODEL: "qwen-plus",
    AI_API_KEY: "test-only-key",
  });

  assert.equal(config.provider, "alibaba");
  assert.equal(config.model, "qwen-plus");
  assert.equal(config.chatCompletionsUrl, "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions");
});

test("remove barras finais antes de acrescentar /chat/completions", () => {
  const config = resolveAiProviderConfig({
    AI_PROVIDER: "alibaba",
    AI_BASE_URL: "https://dashscope.aliyuncs.com/compatible-mode/v1///",
    AI_API_KEY: "test-only-key",
  });

  assert.equal(config.model, "qwen-plus");
  assert.equal(config.chatCompletionsUrl, "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions");
});

test("aceita endpoint regional com WorkspaceId do Model Studio", () => {
  const config = resolveAiProviderConfig({
    AI_PROVIDER: "alibaba",
    AI_BASE_URL: "https://workspace-id.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
    AI_API_KEY: "test-only-key",
  });

  assert.equal(config.chatCompletionsUrl, "https://workspace-id.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions");
});

test("recusa Alibaba sem AI_BASE_URL para não enviar a chave ao endpoint errado", () => {
  assert.throws(
    () => resolveAiProviderConfig({ AI_PROVIDER: "alibaba", AI_API_KEY: "test-only-key" }),
    /AI_BASE_URL obrigatória/,
  );
});

test("recusa endpoint Alibaba fora de /compatible-mode/v1", () => {
  assert.throws(
    () => resolveAiProviderConfig({
      AI_PROVIDER: "alibaba",
      AI_BASE_URL: "https://dashscope.aliyuncs.com/api/v1",
      AI_API_KEY: "test-only-key",
    }),
    /compatible-mode\/v1/,
  );
});

test("recusa host externo mesmo com o caminho compatible-mode correto", () => {
  assert.throws(
    () => resolveAiProviderConfig({
      AI_PROVIDER: "alibaba",
      AI_BASE_URL: "https://example.com/compatible-mode/v1",
      AI_API_KEY: "test-only-key",
    }),
    /host oficial aliyuncs\.com/,
  );
});

test("recusa domínio parecido que não pertence ao Alibaba", () => {
  assert.throws(
    () => resolveAiProviderConfig({
      AI_PROVIDER: "alibaba",
      AI_BASE_URL: "https://dashscope.aliyuncs.com.example/compatible-mode/v1",
      AI_API_KEY: "test-only-key",
    }),
    /host oficial aliyuncs\.com/,
  );
});

test("recusa porta customizada no endpoint Alibaba", () => {
  assert.throws(
    () => resolveAiProviderConfig({
      AI_PROVIDER: "alibaba",
      AI_BASE_URL: "https://dashscope.aliyuncs.com:8443/compatible-mode/v1",
      AI_API_KEY: "test-only-key",
    }),
    /URL HTTPS/,
  );
});

test("recusa URL sem HTTPS", () => {
  assert.throws(
    () => resolveAiProviderConfig({
      AI_PROVIDER: "alibaba",
      AI_BASE_URL: "http://dashscope.aliyuncs.com/compatible-mode/v1",
      AI_API_KEY: "test-only-key",
    }),
    /URL HTTPS/,
  );
});

test("mantém compatibilidade retroativa com OpenAI", () => {
  const config = resolveAiProviderConfig({ OPENAI_API_KEY: "test-only-key", OPENAI_MODEL: "gpt-test" });

  assert.equal(config.provider, "openai");
  assert.equal(config.model, "gpt-test");
  assert.equal(config.chatCompletionsUrl, "https://api.openai.com/v1/chat/completions");
});
