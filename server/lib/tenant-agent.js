const DEFAULT_MODEL = 'gemini-1.5-flash';

function cleanPhone(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function encode(value) {
  return encodeURIComponent(String(value));
}

export function createTenantAgent({
  supabaseUrl,
  serviceRoleKey,
  geminiApiKey,
  model = DEFAULT_MODEL,
  logger,
  fetchImpl = globalThis.fetch,
}) {
  const baseUrl = String(supabaseUrl ?? '').replace(/\/$/, '');
  const enabled = Boolean(baseUrl && serviceRoleKey);
  const aiEnabled = Boolean(geminiApiKey);

  if (typeof fetchImpl !== 'function') {
    throw new TypeError('fetchImpl deve ser uma função');
  }

  async function request(tablePath, init = {}) {
    if (!baseUrl || !serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY não configurada');
    const authorization = serviceRoleKey.startsWith('sb_secret_')
      ? {}
      : { Authorization: `Bearer ${serviceRoleKey}` };
    const response = await fetchImpl(`${baseUrl}/rest/v1/${tablePath}`, {
      ...init,
      headers: {
        apikey: serviceRoleKey,
        ...authorization,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!response.ok) throw new Error(`Supabase ${response.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
    return body;
  }

  async function getOne(path, init = {}) {
    const rows = await request(path, init);
    return Array.isArray(rows) ? (rows[0] ?? null) : rows;
  }

  async function updateChannel(channelId, values) {
    await request(`channels?id=eq.${encode(channelId)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ ...values, updated_at: new Date().toISOString() }),
    });
  }

  async function upsertContactAndConversation(channel, { waId, pushName, content }) {
    const now = new Date().toISOString();
    const phone = cleanPhone(waId);
    const name = String(pushName || phone || 'Contato').trim();
    let contact = await getOne(
      `contacts?select=id&company_id=eq.${encode(channel.company_id)}&channel_id=eq.${encode(channel.id)}&wa_id=eq.${encode(phone)}&limit=1`,
    );

    if (!contact) {
      contact = await getOne('contacts', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          company_id: channel.company_id,
          channel_id: channel.id,
          name,
          profile_name: name,
          phone,
          wa_id: phone,
          source: 'whatsapp_qr',
          last_interaction_at: now,
        }),
      });
    } else {
      await request(`contacts?id=eq.${encode(contact.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ name, profile_name: name, phone, last_interaction_at: now, updated_at: now }),
      });
    }

    let conversation = await getOne(
      `conversations?select=id,unread_count,ai_handling&company_id=eq.${encode(channel.company_id)}&channel_id=eq.${encode(channel.id)}&contact_id=eq.${encode(contact.id)}&status=neq.resolvida&limit=1`,
    );
    if (!conversation) {
      conversation = await getOne('conversations', {
        method: 'POST',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({
          company_id: channel.company_id,
          channel_id: channel.id,
          contact_id: contact.id,
          channel: 'whatsapp',
          status: 'aberta',
          ai_handling: channel.auto_reply_enabled === true,
          last_message: content,
          last_message_direction: 'inbound',
          unread_count: 1,
          last_message_at: now,
        }),
      });
    } else {
      await request(`conversations?id=eq.${encode(conversation.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({
          status: 'aberta',
          last_message: content,
          last_message_direction: 'inbound',
          unread_count: Number(conversation.unread_count ?? 0) + 1,
          last_message_at: now,
          updated_at: now,
        }),
      });
    }
    return {
      contactId: contact.id,
      conversationId: conversation.id,
      aiHandling: conversation.ai_handling !== false,
    };
  }

  async function saveMessage({ channel, conversationId, contactId, content, direction, senderType, messageId, timestamp }) {
    const result = await getOne('messages', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        company_id: channel.company_id,
        channel_id: channel.id,
        conversation_id: conversationId,
        contact_id: contactId,
        direction,
        sender_type: senderType,
        content,
        message_type: 'text',
        status: direction === 'inbound' ? 'received' : 'sent',
        meta_message_id: messageId ?? null,
        created_at: timestamp ?? new Date().toISOString(),
      }),
    });
    return result;
  }

  async function buildAgentPrompt(channel, conversationId, content) {
    const knowledge = await request(
      `ai_knowledge_items?select=title,content&company_id=eq.${encode(channel.company_id)}&is_active=eq.true&or=(channel_id.is.null,channel_id.eq.${encode(channel.id)})&limit=50`,
    );
    const quickReplies = await request(
      `quick_replies?select=title,message&company_id=eq.${encode(channel.company_id)}&is_active=eq.true&limit=20`,
    );
    const history = await request(
      `messages?select=direction,content&conversation_id=eq.${encode(conversationId)}&order=created_at.desc&limit=8`,
    );
    const knowledgeText = knowledge.length
      ? knowledge.map((item) => `## ${item.title}\n${item.content}`).join('\n\n')
      : 'Nenhuma base de conhecimento cadastrada.';
    const quickRepliesText = quickReplies.length
      ? `\n\nRespostas rápidas:\n${quickReplies.map((item) => `- ${item.title}: ${item.message}`).join('\n')}`
      : '';
    const historyText = history
      .reverse()
      .slice(0, -1)
      .map((item) => `${item.direction === 'inbound' ? 'Cliente' : 'Agente'}: ${item.content}`)
      .join('\n');
    const tone = channel.communication_tone || 'profissional';
    return `Você é o agente de atendimento exclusivo da empresa "${channel.company_name || 'empresa'}".\n\nTom: ${tone}.\nServiços: ${channel.services_description || 'não informado'}.\nHorário: ${channel.business_hours || 'não informado'}.\n\nBase de conhecimento:\n${knowledgeText}${quickRepliesText}\n\nHistórico:\n${historyText}\n\nRegras:\n- Responda em PT-BR, em no máximo 3 frases curtas.\n- Use apenas dados da empresa e da base.\n- Não invente preço, horário ou disponibilidade.\n- Se precisar de uma pessoa, diga que vai transferir para um atendente.\n\nMensagem atual do cliente:\n${content}`;
  }

  async function loadChannel(channelId) {
    const channel = await getOne(
      `channels?select=id,company_id,name,provider,ai_enabled,auto_reply_enabled,human_handoff_enabled,handoff_when_unknown,greeting_message,out_of_hours_message,business_hours&provider=eq.qr_code&id=eq.${encode(channelId)}&limit=1`,
    );
    if (!channel) throw new Error(`Canal QR ${channelId} não encontrado`);
    const company = await getOne(
      `companies?select=name,communication_tone,services_description,business_hours&id=eq.${encode(channel.company_id)}&limit=1`,
    );
    return {
      ...channel,
      company_name: company?.name,
      communication_tone: company?.communication_tone,
      services_description: company?.services_description,
      business_hours: company?.business_hours || channel.business_hours,
    };
  }

  async function generateReply(channel, conversationId, content) {
    if (!geminiApiKey) return null;
    const prompt = await buildAgentPrompt(channel, conversationId, content);
    const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiApiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4, maxOutputTokens: 400 } }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Gemini ${response.status}: ${JSON.stringify(body)}`);
    return body?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || null;
  }

  async function saveAiInteraction(channel, conversationId, values) {
    await request('ai_interactions', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        company_id: channel.company_id,
        channel_id: channel.id,
        conversation_id: conversationId,
        model,
        ...values,
      }),
    });
  }

  async function handoffConversation(channel, conversationId, reason) {
    if (!channel.human_handoff_enabled) return;
    await request(`conversations?id=eq.${encode(conversationId)}&company_id=eq.${encode(channel.company_id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        status: 'pendente',
        ai_handling: false,
        handoff_reason: reason,
        updated_at: new Date().toISOString(),
      }),
    });
  }

  async function processMessage({ channelId, waId, rawJid, pushName, content, messageId, timestamp }) {
    const channel = await loadChannel(channelId);
    if (!channel) throw new Error(`Canal QR ${channelId} não encontrado`);
    if (messageId) {
      const existing = await getOne(`messages?select=id&company_id=eq.${encode(channel.company_id)}&channel_id=eq.${encode(channelId)}&meta_message_id=eq.${encode(messageId)}&limit=1`);
      if (existing) return null;
    }
    const { contactId, conversationId, aiHandling } = await upsertContactAndConversation(channel, { waId, pushName, content });
    const inbound = await saveMessage({ channel, conversationId, contactId, content, direction: 'inbound', senderType: 'contact', messageId, timestamp });
    if (!channel.ai_enabled || !channel.auto_reply_enabled || !aiHandling) return null;

    if (!geminiApiKey) {
      await handoffConversation(channel, conversationId, 'GEMINI_API_KEY ausente');
      await saveAiInteraction(channel, conversationId, {
        inbound_message_id: inbound?.id ?? null,
        status: 'error',
        input: content,
        error_message: 'GEMINI_API_KEY ausente',
      });
      return null;
    }

    let reply;
    try {
      reply = await generateReply(channel, conversationId, content);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger?.error?.({ error, channelId, conversationId }, '[tenant-agent] Falha ao gerar resposta');
      await handoffConversation(channel, conversationId, 'Falha ao gerar resposta da IA');
      await saveAiInteraction(channel, conversationId, {
        inbound_message_id: inbound?.id ?? null,
        status: 'error',
        input: content,
        error_message: errorMessage,
      });
      return null;
    }

    if (!reply) {
      if (channel.handoff_when_unknown) {
        await handoffConversation(channel, conversationId, 'IA não respondeu com segurança');
      }
      await saveAiInteraction(channel, conversationId, {
        inbound_message_id: inbound?.id ?? null,
        status: 'error',
        input: content,
        error_message: 'IA não retornou uma resposta',
      });
      return null;
    }

    const outbound = await saveMessage({ channel, conversationId, contactId, content: reply, direction: 'outbound', senderType: 'ai' });
    const needsHuman = channel.human_handoff_enabled && /atendente|humano|transfer/i.test(reply);
    await request(`conversations?id=eq.${encode(conversationId)}&company_id=eq.${encode(channel.company_id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        last_message: reply,
        last_message_direction: 'outbound',
        last_message_at: new Date().toISOString(),
        ai_handling: !needsHuman,
        ...(needsHuman ? { status: 'pendente', handoff_reason: 'ai_requested_human' } : {}),
        updated_at: new Date().toISOString(),
      }),
    });
    await saveAiInteraction(channel, conversationId, {
      inbound_message_id: inbound?.id ?? null,
      outbound_message_id: outbound?.id ?? null,
      status: 'completed',
      input: content,
      output: reply,
    });
    return { to: rawJid || `${cleanPhone(waId)}@s.whatsapp.net`, reply };
  }

  return {
    enabled,
    updateChannel,
    processMessage,
    describe() {
      return {
        enabled,
        persistenceEnabled: enabled,
        aiEnabled,
        hasSupabaseKey: Boolean(serviceRoleKey),
        hasGeminiKey: Boolean(geminiApiKey),
        model,
      };
    },
  };
}
