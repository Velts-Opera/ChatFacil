// Fish Audio TTS (https://docs.fish.audio) — gera a voz feminina de atendimento.
// A chave vem do secret FISH_AUDIO_API_KEY. A voz padrão vem de FISH_AUDIO_VOICE_ID
// (reference_id de um modelo de voz feminina pt-BR escolhido em https://fish.audio),
// podendo ser sobrescrita por canal em channels.voice_reference_id.

export function fishAudioConfigured() {
  return Boolean(Deno.env.get("FISH_AUDIO_API_KEY"));
}

export async function synthesizeSpeech(text: string, referenceId?: string | null): Promise<
  { ok: true; audio: Uint8Array; mimeType: string } | { ok: false; error: string }
> {
  const apiKey = Deno.env.get("FISH_AUDIO_API_KEY");
  if (!apiKey) return { ok: false, error: "FISH_AUDIO_API_KEY não configurada nos secrets." };

  const voiceId = referenceId?.trim() || Deno.env.get("FISH_AUDIO_VOICE_ID")?.trim() || null;
  const model = Deno.env.get("FISH_AUDIO_TTS_MODEL") ?? "s1";

  const body: Record<string, unknown> = {
    text,
    format: "mp3",
    mp3_bitrate: 64,
    normalize: true,
    latency: "normal",
    chunk_length: 200,
  };
  if (voiceId) body.reference_id = voiceId;

  const res = await fetch("https://api.fish.audio/v1/tts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      model,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    return { ok: false, error: `Fish Audio HTTP ${res.status}: ${errText.slice(0, 300)}` };
  }

  const audio = new Uint8Array(await res.arrayBuffer());
  if (audio.byteLength === 0) return { ok: false, error: "Fish Audio retornou áudio vazio." };
  return { ok: true, audio, mimeType: "audio/mpeg" };
}
