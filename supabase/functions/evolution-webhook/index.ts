Deno.serve(() => new Response(
  JSON.stringify({ error: "Integração legada desativada. Use WhatsApp oficial Meta Cloud API." }),
  { status: 410, headers: { "content-type": "application/json" } },
));
