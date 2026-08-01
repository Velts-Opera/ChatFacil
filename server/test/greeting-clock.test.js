import test from "node:test";
import assert from "node:assert/strict";
import { greetingForSaoPaulo } from "../lib/greeting-clock.js";

// América/São Paulo é UTC-3 o ano todo desde o fim do horário de verão no Brasil.
test("madrugada/manhã (05:00–11:59 em SP) -> Bom dia", () => {
  assert.equal(greetingForSaoPaulo(new Date("2026-03-10T08:00:00-03:00")), "Bom dia");
  assert.equal(greetingForSaoPaulo(new Date("2026-03-10T05:00:00-03:00")), "Bom dia");
  assert.equal(greetingForSaoPaulo(new Date("2026-03-10T11:59:00-03:00")), "Bom dia");
});

test("tarde (12:00–17:59 em SP) -> Boa tarde", () => {
  assert.equal(greetingForSaoPaulo(new Date("2026-03-10T12:00:00-03:00")), "Boa tarde");
  assert.equal(greetingForSaoPaulo(new Date("2026-03-10T17:59:00-03:00")), "Boa tarde");
});

test("noite/madrugada (18:00–04:59 em SP) -> Boa noite", () => {
  assert.equal(greetingForSaoPaulo(new Date("2026-03-10T18:00:00-03:00")), "Boa noite");
  assert.equal(greetingForSaoPaulo(new Date("2026-03-10T23:30:00-03:00")), "Boa noite");
  assert.equal(greetingForSaoPaulo(new Date("2026-03-10T04:59:00-03:00")), "Boa noite");
});

test("usa o fuso de SP mesmo quando o servidor roda em outro fuso (UTC)", () => {
  // 10:00 UTC = 07:00 em SP -> ainda manhã, apesar de já ser passado o meio-dia em fusos do leste.
  assert.equal(greetingForSaoPaulo(new Date("2026-03-10T10:00:00Z")), "Bom dia");
});
