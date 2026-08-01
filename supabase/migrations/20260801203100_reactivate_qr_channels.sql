-- Etapa 3: fluxo QR volta a ser o caminho principal de conexão.
UPDATE public.channels
SET status = 'disconnected', last_error = NULL
WHERE provider = 'qr_code' AND last_error ILIKE '%legado%desativado%';
