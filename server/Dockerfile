# ChatFacil WhatsApp Bridge — imagem para Railway/Render/Fly/VPS.
# As sessões Baileys ficam em /data/sessions: monte um volume persistente
# nesse caminho para que os tenants não precisem escanear QR após restart.
FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production \
    PORT=3001 \
    BRIDGE_HOST=0.0.0.0 \
    SESSIONS_DIR=/data/sessions

RUN mkdir -p /data/sessions

EXPOSE 3001

CMD ["node", "whatsapp-bridge.js"]
