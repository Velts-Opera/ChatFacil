// Depois de um restart/deploy, um canal pode ter ficado gravado em estado
// não-terminal (connecting, qr_pending, reconnecting) sem sessão Baileys viva
// correspondente. Essa função devolve o DB à realidade: não-terminal + sem
// sessão restaurada = disconnected, com motivo explicado para a UI.
const NON_TERMINAL = new Set(["connecting", "qr_pending", "reconnecting"]);

export async function reconcileGhostChannels({
  staleChannels,
  restoredChannelIds,
  updateChannel,
  logger,
}) {
  const reconciled = [];
  const failed = [];

  for (const channel of staleChannels) {
    if (!NON_TERMINAL.has(channel.status)) continue;
    if (restoredChannelIds.has(channel.id)) continue;

    try {
      await updateChannel(channel.id, {
        status: "disconnected",
        last_error:
          "A conexão foi interrompida por um reinício do serviço. Gere um novo QR para conectar novamente.",
      });
      reconciled.push(channel.id);
    } catch (error) {
      failed.push(channel.id);
      logger?.error?.(
        { error, channelId: channel.id },
        "Falha ao reconciliar estado fantasma no boot",
      );
    }
  }

  return { reconciled, failed };
}
