Deno.serve(() => new Response(JSON.stringify({ error: "Canal QR legado desativado. Use a conexão oficial da Meta." }), { status: 410, headers: { "content-type": "application/json" } }));
