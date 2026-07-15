import test from 'node:test';
import assert from 'node:assert/strict';
import { createTenantAgent } from '../lib/tenant-agent.js';

test('tenant agent stays disabled until Supabase server access is configured', () => {
  const agent = createTenantAgent({
    supabaseUrl: 'https://example.supabase.co',
    serviceRoleKey: '',
    geminiApiKey: '',
  });

  assert.equal(agent.enabled, false);
  assert.deepEqual(agent.describe(), {
    enabled: false,
    persistenceEnabled: false,
    aiEnabled: false,
    hasSupabaseKey: false,
    hasGeminiKey: false,
    model: 'gemini-1.5-flash',
  });
});

test('tenant agent reports direct mode readiness without exposing secrets', () => {
  const agent = createTenantAgent({
    supabaseUrl: 'https://example.supabase.co',
    serviceRoleKey: 'service-role-placeholder',
    geminiApiKey: 'gemini-placeholder',
  });

  assert.equal(agent.enabled, true);
  assert.deepEqual(agent.describe(), {
    enabled: true,
    persistenceEnabled: true,
    aiEnabled: true,
    hasSupabaseKey: true,
    hasGeminiKey: true,
    model: 'gemini-1.5-flash',
  });
});

test('tenant agent persists inbound data and hands off when the AI key is absent', async () => {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(input);
    const method = init.method ?? 'GET';
    const table = url.pathname.split('/rest/v1/')[1];
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ method, table, search: url.search, body, headers: init.headers });

    if (method === 'GET' && table === 'channels') {
      return jsonResponse([{
        id: 'channel-a',
        company_id: 'company-a',
        provider: 'qr_code',
        ai_enabled: true,
        auto_reply_enabled: true,
        human_handoff_enabled: true,
        handoff_when_unknown: true,
      }]);
    }
    if (method === 'GET' && table === 'companies') {
      return jsonResponse([{ name: 'Clínica A', communication_tone: 'profissional' }]);
    }
    if (method === 'GET' && table === 'messages') return jsonResponse([]);
    if (method === 'GET' && table === 'contacts') return jsonResponse([]);
    if (method === 'POST' && table === 'contacts') return jsonResponse([{ id: 'contact-a' }]);
    if (method === 'GET' && table === 'conversations') return jsonResponse([]);
    if (method === 'POST' && table === 'conversations') {
      return jsonResponse([{ id: 'conversation-a', ai_handling: true }]);
    }
    if (method === 'POST' && table === 'messages') return jsonResponse([{ id: 'message-in-a' }]);
    if (method === 'PATCH' && table === 'conversations') return jsonResponse(null);
    if (method === 'POST' && table === 'ai_interactions') return jsonResponse(null);

    throw new Error(`Unexpected request: ${method} ${url}`);
  };

  const agent = createTenantAgent({
    supabaseUrl: 'https://example.supabase.co',
    serviceRoleKey: 'sb_secret_placeholder',
    geminiApiKey: '',
    fetchImpl,
  });

  assert.equal(agent.enabled, true);
  assert.equal(agent.describe().aiEnabled, false);

  const result = await agent.processMessage({
    channelId: 'channel-a',
    waId: '5522999999999',
    rawJid: '5522999999999@s.whatsapp.net',
    pushName: 'Maria',
    content: 'Quero agendar',
    messageId: 'wa-message-a',
    timestamp: '2026-07-15T12:00:00.000Z',
  });

  assert.equal(result, null);
  assert.equal(calls[0].headers.apikey, 'sb_secret_placeholder');
  assert.equal(calls[0].headers.Authorization, undefined);
  assert.ok(calls.some((call) => call.method === 'POST' && call.table === 'contacts' && call.body.company_id === 'company-a'));
  assert.ok(calls.some((call) => call.method === 'POST' && call.table === 'conversations' && call.body.company_id === 'company-a'));
  assert.ok(calls.some((call) => call.method === 'POST' && call.table === 'messages' && call.body.company_id === 'company-a'));

  const handoff = calls.find((call) => call.method === 'PATCH' && call.table === 'conversations');
  assert.match(handoff.search, /company_id=eq\.company-a/);
  assert.equal(handoff.body.status, 'pendente');
  assert.equal(handoff.body.ai_handling, false);
  assert.equal(handoff.body.handoff_reason, 'GEMINI_API_KEY ausente');

  const interaction = calls.find((call) => call.method === 'POST' && call.table === 'ai_interactions');
  assert.equal(interaction.body.company_id, 'company-a');
  assert.equal(interaction.body.status, 'error');
});

function jsonResponse(value) {
  return new Response(value === null ? '' : JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
