// Duas mensagens do mesmo contato chegando quase juntas (ou um webhook duplicado)
// podem dar corrida em processMessage e gerar duas respostas da IA para o mesmo
// contexto. Serializa por chave (channelId:waId) sem bloquear conversas diferentes.
export function createConversationLock() {
  let queues = new Map();

  function run(key, task) {
    const previous = queues.get(key) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(task);
    queues.set(key, current);
    current
      .finally(() => {
        if (queues.get(key) === current) queues.delete(key);
      })
      .catch(() => {});
    return current;
  }

  return { run };
}
