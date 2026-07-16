FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p /data

EXPOSE 3001

ENV NODE_ENV=production \
    BRIDGE_HOST=0.0.0.0 \
    SESSION_DATA_PATH=/data

CMD ["node", "whatsapp-bridge.js"]
