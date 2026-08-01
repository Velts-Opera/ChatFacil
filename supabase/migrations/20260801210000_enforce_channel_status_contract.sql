-- Etapa 4: contrato único de estados.
ALTER TABLE public.channels
  ADD CONSTRAINT channels_status_check
  CHECK (status IN ('connecting','qr_pending','connected','reconnecting','expired','disconnected','error'));
