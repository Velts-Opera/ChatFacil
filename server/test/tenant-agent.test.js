import test from "node:test";
import assert from "node:assert/strict";
import { createTenantAgent } from "../lib/tenant-agent.js";

test("tenant agent stays disabled until Supabase server access is configured", () => {
  const agent = createTenantAgent({
    supabaseUrl: "https://example.supabase.co",
    serviceRoleKey: "",
    geminiApiKey: "",
  });

  assert.equal(agent.enabled, false);
  assert.deepEqual(agent.describe(), {
    enabled: false,
    persistenceEnabled: false,
    aiEnabled: false,
    hasSupabaseKey: false,
    hasGeminiKey: false,
    model: "gemini-1.5-flash",
  });
});

test("duas mensagens quase simultâneas do mesmo contato não criam conversas/contatos duplicados", async () => {
  const channelId = "chan-1";
  const companyId = "company-1";
  let contactCreated = 0;
  let conversationCreated = 0;
  const messages = [];

  const fetchImpl = async (url, init = {}) => {
    const u = new URL(String(url));
    const path = u.pathname + u.search;
    const method = init.method ?? "GET";
    const json = (body, status = 200) =>
      status === 204
        ? new Response(null, { status })
        : new Response(JSON.stringify(body), {
            status,
            headers: { "content-type": "application/json" },
          });

    if (path.startsWith("/rest/v1/channels?")) {
      return json([
        {
          id: channelId,
          company_id: companyId,
          agent_id: null,
          provider: "qr_code",
          ai_enabled: true,
          auto_reply_enabled: false,
          human_handoff_enabled: true,
          handoff_when_unknown: false,
        },
      ]);
    }
    if (path.startsWith("/rest/v1/companies?")) return json([{ name: "Empresa Teste" }]);
    if (path.startsWith("/rest/v1/ai_agent_settings?")) return json([]);
    if (path.startsWith("/rest/v1/messages?") && method === "GET") return json([]);
    if (path.startsWith("/rest/v1/contacts?") && method === "GET") {
      // Simula: o segundo processamento só enxerga o contato criado pelo primeiro
      // por causa do lock ter serializado as chamadas.
      return json(contactCreated > 0 ? [{ id: "contact-1" }] : []);
    }
    if (path.startsWith("/rest/v1/contacts") && method === "POST") {
      contactCreated += 1;
      return json({ id: "contact-1" });
    }
    if (path.startsWith("/rest/v1/contacts") && method === "PATCH") return json(null, 204);
    if (path.startsWith("/rest/v1/conversations?") && method === "GET") {
      return json(
        conversationCreated > 0 ? [{ id: "conv-1", unread_count: 0, ai_handling: true }] : [],
      );
    }
    if (path.startsWith("/rest/v1/conversations") && method === "POST") {
      conversationCreated += 1;
      return json({ id: "conv-1", unread_count: 0, ai_handling: true });
    }
    if (path.startsWith("/rest/v1/conversations") && method === "PATCH") return json(null, 204);
    if (path.startsWith("/rest/v1/messages") && method === "POST") {
      const body = JSON.parse(init.body);
      messages.push(body);
      return json({ id: `msg-${messages.length}` });
    }
    throw new Error(`chamada inesperada: ${method} ${path}`);
  };

  const agent = createTenantAgent({
    supabaseUrl: "https://example.supabase.co",
    serviceRoleKey: "service-role-placeholder",
    geminiApiKey: "", // auto_reply desabilitado no canal já barra a IA; foco aqui é a serialização
    fetchImpl,
  });

  await Promise.all([
    agent.processMessage({
      channelId,
      waId: "5522999998888",
      pushName: "Cliente",
      content: "oi",
      messageId: "m1",
      timestamp: new Date().toISOString(),
    }),
    agent.processMessage({
      channelId,
      waId: "5522999998888",
      pushName: "Cliente",
      content: "tudo bem?",
      messageId: "m2",
      timestamp: new Date().toISOString(),
    }),
  ]);

  assert.equal(contactCreated, 1, "não deve criar dois contatos para o mesmo waId em corrida");
  assert.equal(
    conversationCreated,
    1,
    "não deve criar duas conversas abertas para o mesmo contato em corrida",
  );
});

test("tenant agent reports direct mode readiness without exposing secrets", () => {
  const agent = createTenantAgent({
    supabaseUrl: "https://example.supabase.co",
    serviceRoleKey: "service-role-placeholder",
    geminiApiKey: "gemini-placeholder",
  });

  assert.equal(agent.enabled, true);
  assert.deepEqual(agent.describe(), {
    enabled: true,
    persistenceEnabled: true,
    aiEnabled: true,
    hasSupabaseKey: true,
    hasGeminiKey: true,
    model: "gemini-1.5-flash",
  });
});

test("tenant agent persists inbound data and hands off when the AI key is absent", async () => {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input);
    const method = init.method ?? "GET";
    const table = url.pathname.split("/rest/v1/")[1];
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method, table, search: url.search, body, headers: init.headers });

    if (method === "GET" && table === "channels") {
      return jsonResponse([
        {
          id: "channel-a",
          company_id: "company-a",
          provider: "qr_code",
          ai_enabled: true,
          auto_reply_enabled: true,
          human_handoff_enabled: true,
          handoff_when_unknown: true,
        },
      ]);
    }
    if (method === "GET" && table === "companies") {
      return jsonResponse([{ name: "Clínica A", communication_tone: "profissional" }]);
    }
    if (method === "GET" && table === "ai_agent_settings") {
      return jsonResponse([
        { id: "agent-a", company_id: "company-a", is_enabled: true, agent_name: "Bia" },
      ]);
    }
    if (method === "GET" && table === "messages") return jsonResponse([]);
    if (method === "GET" && table === "contacts") return jsonResponse([]);
    if (method === "POST" && table === "contacts") return jsonResponse([{ id: "contact-a" }]);
    if (method === "GET" && table === "conversations") return jsonResponse([]);
    if (method === "POST" && table === "conversations") {
      return jsonResponse([{ id: "conversation-a", ai_handling: true }]);
    }
    if (method === "POST" && table === "messages") return jsonResponse([{ id: "message-in-a" }]);
    if (method === "PATCH" && table === "conversations") return jsonResponse(null);
    if (method === "POST" && table === "ai_interactions") return jsonResponse(null);

    throw new Error(`Unexpected request: ${method} ${url}`);
  };

  const agent = createTenantAgent({
    supabaseUrl: "https://example.supabase.co",
    serviceRoleKey: "sb_secret_placeholder",
    geminiApiKey: "",
    fetchImpl,
  });

  assert.equal(agent.enabled, true);
  assert.equal(agent.describe().aiEnabled, false);

  const result = await agent.processMessage({
    channelId: "channel-a",
    waId: "5522999999999",
    rawJid: "5522999999999@s.whatsapp.net",
    pushName: "Maria",
    content: "Quero agendar",
    messageId: "wa-message-a",
    timestamp: "2026-07-15T12:00:00.000Z",
  });

  assert.equal(result, null);
  assert.equal(calls[0].headers.apikey, "sb_secret_placeholder");
  assert.equal(calls[0].headers.Authorization, undefined);
  assert.ok(
    calls.some(
      (call) =>
        call.method === "POST" && call.table === "contacts" && call.body.company_id === "company-a",
    ),
  );
  assert.ok(
    calls.some(
      (call) =>
        call.method === "POST" &&
        call.table === "conversations" &&
        call.body.company_id === "company-a",
    ),
  );
  assert.ok(
    calls.some(
      (call) =>
        call.method === "POST" && call.table === "messages" && call.body.company_id === "company-a",
    ),
  );

  const handoff = calls.find((call) => call.method === "PATCH" && call.table === "conversations");
  assert.match(handoff.search, /company_id=eq\.company-a/);
  assert.equal(handoff.body.status, "pendente");
  assert.equal(handoff.body.ai_handling, false);
  assert.equal(handoff.body.handoff_reason, "GEMINI_API_KEY ausente");

  const interaction = calls.find(
    (call) => call.method === "POST" && call.table === "ai_interactions",
  );
  assert.equal(interaction.body.company_id, "company-a");
  assert.equal(interaction.body.status, "error");
});

function jsonResponse(value) {
  return new Response(value === null ? "" : JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
