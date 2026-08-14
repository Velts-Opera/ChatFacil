-- Etapa 4: contrato único de estados. Sem constraint, qualquer string vira "status"
-- e a UI não tem garantia do que pode receber — é uma das causas dos estados fantasma.
ALTER TABLE public.channels
  ADD CONSTRAINT channels_status_check
  CHECK (status IN ('connecting','qr_pending','connected','reconnecting','expired','disconnected','error'));
