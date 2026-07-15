export function extractText(message) {
  return (
    message?.conversation ??
    message?.extendedTextMessage?.text ??
    message?.imageMessage?.caption ??
    message?.videoMessage?.caption ??
    '[mídia]'
  );
}

export function toJid(to) {
  if (!to) return to;
  if (to.includes('@')) return to;
  return `${to.replace(/\D/g, '')}@s.whatsapp.net`;
}

const AUTH_RESET_REASONS = new Set([
  401, // loggedOut
  403, // forbidden
  411, // multideviceMismatch
  440, // connectionReplaced
  500, // badSession
]);

export function hasStaleUnregisteredCredentials(creds) {
  return creds?.registered === false && Boolean(creds?.me?.id);
}

export function shouldResetAuth(reason) {
  return AUTH_RESET_REASONS.has(reason);
}
