import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createSupabaseGateway } from "../lib/supabase-gateway.js";
import { createWhatsappApp } from "../lib/whatsapp-api.js";

const COMPANY_A = "10000000-0000-4000-8000-000000000001";
const COMPANY_B = "20000000-0000-4000-8000-000000000002";
const CHANNEL_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CHANNEL_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const CHANNEL_MISSING = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function supabaseFetch(input, init = {}) {
  const url = new URL(input);
  if (url.pathname === "/auth/v1/user") {
    const token = new Headers(init.headers).get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (token === "token-a") return Promise.resolve(json({ id: "user-a" }));
    if (token === "token-b") return Promise.resolve(json({ id: "user-b" }));
    return Promise.resolve(json({ message: "invalid token" }, 401));
  }
  if (url.pathname === "/rest/v1/profiles") {
    const id = url.searchParams.get("id");
    if (id === "eq.user-a") return Promise.resolve(json([{ company_id: COMPANY_A }]));
    if (id === "eq.user-b") return Promise.resolve(json([{ company_id: COMPANY_B }]));
    return Promise.resolve(json([]));
  }
  if (url.pathname === "/rest/v1/channels") {
    const id = url.searchParams.get("id");
    if (id === `eq.${CHANNEL_A}`)
      return Promise.resolve(
        json([
          {
            id: CHANNEL_A,
            company_id: COMPANY_A,
            provider: "qr_code",
            status: "connected",
            phone_number: "5511000000001",
          },
        ]),
      );
    if (id === `eq.${CHANNEL_B}`)
      return Promise.resolve(
        json([
          {
            id: CHANNEL_B,
            company_id: COMPANY_B,
            provider: "qr_code",
            status: "connected",
            phone_number: "5511000000002",
          },
        ]),
      );
    return Promise.resolve(json([]));
  }
  throw new Error(`Unexpected Supabase request: ${url}`);
}

function fixture() {
  const gateway = createSupabaseGateway({
    supabaseUrl: "https://project.supabase.co",
    anonKey: "anon-key",
    serviceRoleKey: "service-role-key",
    fetchImpl: supabaseFetch,
  });
  const sessionManager = {
    count: 2,
    getStatus(channelId) {
      return {
        status: "connected",
        phoneNumber: channelId === CHANNEL_A ? "5511000000001" : "5511000000002",
      };
    },
    getQr() {
      return { status: "qr_pending", qr: "data:image/png;base64,qr", phoneNumber: null };
    },
    async connect() {
      return this.getQr();
    },
    async disconnect() {},
  };
  return createWhatsappApp({
    gateway,
    sessionManager,
    allowedOrigins: ["https://app.example.com"],
    logger: { error() {} },
  });
}

async function withServer(run) {
  const server = fixture().listen(0, "::1");
  await once(server, "listening");
  const address = server.address();
  const baseUrl = `http://[::1]:${address.port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("rotas WhatsApp retornam 401 sem Authorization", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/whatsapp/channels/${CHANNEL_A}/status`);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, "AUTH_REQUIRED");
  });
});

test("rotas WhatsApp retornam 401 para token inválido", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/whatsapp/channels/${CHANNEL_A}/status`, {
      headers: { Authorization: "Bearer invalid" },
    });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).error.code, "INVALID_ACCESS_TOKEN");
  });
});

test("isolamento entre duas empresas retorna 403 para cliente A no canal do cliente B", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/whatsapp/channels/${CHANNEL_B}/qr`, {
      headers: { Authorization: "Bearer token-a" },
    });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, "CHANNEL_FORBIDDEN");
  });
});

test("canal inexistente retorna 404 depois de autenticar a empresa", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/whatsapp/channels/${CHANNEL_MISSING}/status`, {
      headers: { Authorization: "Bearer token-a" },
    });
    assert.equal(response.status, 404);
    assert.equal((await response.json()).error.code, "CHANNEL_NOT_FOUND");
  });
});

test("cliente autenticado consulta somente o status do próprio canal", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/whatsapp/channels/${CHANNEL_A}/status`, {
      headers: { Authorization: "Bearer token-a", Origin: "https://app.example.com" },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("access-control-allow-origin"), "https://app.example.com");
    assert.deepEqual(await response.json(), { status: "connected", phoneNumber: "5511000000001" });
  });
});

test("CORS responde OPTIONS e aceita apenas Authorization e Content-Type", async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/whatsapp/channels/${CHANNEL_A}/connect`, {
      method: "OPTIONS",
      headers: { Origin: "https://app.example.com" },
    });
    assert.equal(response.status, 204);
    assert.equal(
      response.headers.get("access-control-allow-headers"),
      "Authorization,Content-Type",
    );
  });
});
