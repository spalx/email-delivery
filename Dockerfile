# Stage 1: Build
FROM node:24-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git libc6-compat tzdata

COPY ./app/package.json ./app/pnpm-lock.yaml ./app/pnpm-workspace.yaml ./

RUN --mount=type=cache,target=/root/.pnpm-store,id=pnpm-store \
    npm install -g pnpm && \
    pnpm install --store=/root/.pnpm-store

COPY ./app .

RUN pnpm build

# Stage 2: Production
FROM node:24-alpine AS production

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY ./app/package.json ./

CMD ["node", "dist/index.js"]
