-- Reativa os canais QR "aposentados" pela migration retire_legacy_qr_channels.
-- O fluxo QR volta a ser o caminho principal (Etapa 3).
UPDATE public.channels
SET status = 'disconnected', last_error = NULL
WHERE provider = 'qr_code' AND last_error ILIKE '%legado%desativado%';
