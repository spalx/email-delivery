# Stage 1: Build
FROM node:24-slim AS builder

RUN apt-get update && apt-get install -y git \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY ./app/package.json ./app/pnpm-lock.yaml ./

RUN --mount=type=cache,target=/root/.pnpm-store,id=pnpm-store \
    npm install -g pnpm && \
    pnpm install --store=/root/.pnpm-store

COPY ./app .

RUN pnpm build

# Stage 2: Production
FROM node:24-slim AS production

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY ./app/package.json ./

CMD ["node", "dist/index.js"]
