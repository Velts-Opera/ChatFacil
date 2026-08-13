# ChatFácil no seu PC, sem mensalidade

Esta opção mantém o painel na Vercel e o banco no Supabase, mas executa a conexão do WhatsApp no seu próprio computador. O Cloudflare Tunnel publica `https://api.veltsapp.com` sem abrir portas no roteador e sem exigir cartão.

## O que continua gratuito

- servidor do WhatsApp: seu computador;
- endereço HTTPS: Cloudflare Tunnel no domínio `veltsapp.com`;
- painel: Vercel, dentro dos limites gratuitos;
- banco e autenticação: Supabase, dentro dos limites gratuitos.

A API de inteligência artificial pode ter cobrança própria. É possível deixar `AI_API_KEY` vazia para testar conexão, QR Code e recebimento de mensagens sem chamadas de IA.

## Instalação

1. No Railway, abra o serviço antigo e copie os valores da aba **Variables**. Não envie as chaves em conversas nem as coloque no GitHub.
2. Atualize esta pasta com a branch que contém a hospedagem local.
3. Dê dois cliques em `INSTALAR_CHATFACIL_LOCAL.cmd`.
4. Quando solicitado, cole os valores do Supabase. A chave de IA é opcional.
5. Confirme que o serviço do Cloudflare Tunnel chamado `ChatFacil` está íntegro.
6. Confirme que a rota `api.veltsapp.com` aponta para `http://localhost:3001`.
7. Teste `https://api.veltsapp.com/health` no navegador.

O instalador também cria um atalho na pasta de inicialização do Windows. Assim, o servidor volta sozinho quando você entra no Windows.

## Ligar o painel ao novo endereço

Na Vercel, abra o projeto do ChatFácil e acesse **Settings > Environment Variables**:

1. altere `VITE_WA_API_URL` para `https://api.veltsapp.com`, sem barra no final;
2. aplique em **Production**, **Preview** e **Development**;
3. faça um novo deploy em **Deployments > Redeploy**.

Depois, abra o ChatFácil e gere um novo QR Code. As sessões do volume antigo do Railway não ficam disponíveis no computador, então cada número precisa ser conectado novamente uma vez.

## Atalhos

- `INICIAR_CHATFACIL_LOCAL.cmd`: inicia o servidor e mostra o endereço público;
- `PARAR_CHATFACIL_LOCAL.cmd`: encerra o servidor local;
- `CONFIGURAR_CHATFACIL_LOCAL.cmd`: troca chaves, URL do painel ou provedor de IA;
- `ATIVAR_INICIO_AUTOMATICO_CHATFACIL.cmd`: recria o início automático.

Os logs ficam em `server/.runtime/bridge.log` e `server/.runtime/bridge-error.log`. As sessões ficam em `server/data/whatsapp-sessions`; faça backup dessa pasta para evitar reler os QR Codes.

## Limitações

- o WhatsApp fica offline se o PC desligar, dormir, perder internet ou sair da conta do Windows;
- o endereço público depende do serviço do Cloudflare Tunnel estar ativo no Windows;
- essa solução é adequada para testes e uso leve; para operação comercial crítica, use um servidor pago com monitoramento e backup.

Documentação oficial: [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/).
