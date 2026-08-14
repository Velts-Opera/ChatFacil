update public.channels
set status='disconnected',
    last_error='Canal legado QR desativado: use WhatsApp oficial Meta Cloud API.',
    updated_at=now()
where provider <> 'meta_cloud_api' and status <> 'disconnected';
