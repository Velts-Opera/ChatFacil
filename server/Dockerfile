FROM node:22-slim

WORKDIR /app

# Build context é a raiz do repo — copiar explicitamente de server/
COPY server/package.json ./
COPY server/package-lock.json ./
RUN npm install --omit=dev

COPY server/ .

RUN mkdir -p /data

EXPOSE 3001

ENV NODE_ENV=production \
    SESSION_DATA_PATH=/data

CMD ["node", "whatsapp-bridge.js"]
