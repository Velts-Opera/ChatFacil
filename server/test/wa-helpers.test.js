import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractText, toJid } from '../lib/wa-helpers.js';

// ── extractText ──────────────────────────────────────────────────────────────

test('extractText: conversation', () => {
  assert.equal(extractText({ conversation: 'olá' }), 'olá');
});

test('extractText: extendedTextMessage.text', () => {
  assert.equal(extractText({ extendedTextMessage: { text: 'texto estendido' } }), 'texto estendido');
});

test('extractText: imageMessage.caption', () => {
  assert.equal(extractText({ imageMessage: { caption: 'legenda da imagem' } }), 'legenda da imagem');
});

test('extractText: videoMessage.caption', () => {
  assert.equal(extractText({ videoMessage: { caption: 'legenda do vídeo' } }), 'legenda do vídeo');
});

test('extractText: mídia fallback quando message é null', () => {
  assert.equal(extractText(null), '[mídia]');
});

test('extractText: mídia fallback quando message é undefined', () => {
  assert.equal(extractText(undefined), '[mídia]');
});

test('extractText: mídia fallback para tipo sem texto (stickerMessage)', () => {
  assert.equal(extractText({ stickerMessage: {} }), '[mídia]');
});

test('extractText: mídia fallback para audioMessage', () => {
  assert.equal(extractText({ audioMessage: {} }), '[mídia]');
});

// ── toJid ────────────────────────────────────────────────────────────────────

test('toJid: número puro recebe @s.whatsapp.net', () => {
  assert.equal(toJid('5511999999999'), '5511999999999@s.whatsapp.net');
});

test('toJid: número com chars não-numéricos é limpo e recebe @s.whatsapp.net', () => {
  assert.equal(toJid('+55 11 99999-9999'), '5511999999999@s.whatsapp.net');
});

test('toJid: JID @s.whatsapp.net já completo é preservado', () => {
  assert.equal(toJid('5511999999999@s.whatsapp.net'), '5511999999999@s.whatsapp.net');
});

test('toJid: JID @lid é preservado sem alteração', () => {
  assert.equal(toJid('5511999999999@lid'), '5511999999999@lid');
});

test('toJid: JID @g.us é preservado sem alteração', () => {
  assert.equal(toJid('123456789@g.us'), '123456789@g.us');
});
