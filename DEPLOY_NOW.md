# Deploy rápido — ChatFácil

1. Aplique as migrações com `npx supabase db push`.
2. Configure no Railway as seis variáveis descritas em [`DEPLOY_RAILWAY.md`](./DEPLOY_RAILWAY.md) e monte o volume `/data`.
3. Faça o deploy do serviço Railway a partir de `server/Dockerfile`.
4. Configure `VITE_WA_API_URL` no Vercel e publique o frontend.
5. Execute `npm run typecheck`, `npm test` e `npm run build`.

A arquitetura e as garantias de isolamento estão em [`ARQUITETURA_MULTITENANT.md`](./ARQUITETURA_MULTITENANT.md).
