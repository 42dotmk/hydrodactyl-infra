# Status board for the 42.mk LAN game servers (lan.apps.42.mk). Built by Dokploy from this repo.
FROM node:24-alpine
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY servers.json ./
COPY src ./src
COPY public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -q -O /dev/null http://127.0.0.1:3000/healthz || exit 1
CMD ["node", "src/main.js"]
