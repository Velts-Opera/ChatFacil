// Mesma regra usada pelo agente (server/lib/greeting-clock.js), reimplementada aqui
// porque o frontend (Vite/browser) não importa código do server/.
export function greetingForSaoPaulo(
  date: Date = new Date(),
): "Bom dia" | "Boa tarde" | "Boa noite" {
  const hour = Number(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour: "numeric",
      hour12: false,
    }).format(date),
  );
  if (hour >= 5 && hour < 12) return "Bom dia";
  if (hour >= 12 && hour < 18) return "Boa tarde";
  return "Boa noite";
}
