UPDATE public.channels
SET status = 'disconnected',
    last_error = 'Canal legado QR desativado: use WhatsApp oficial Meta Cloud API.',
    updated_at = now()
WHERE provider <> 'meta_cloud_api'
  AND status <> 'disconnected';
