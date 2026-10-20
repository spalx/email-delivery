# Stage 1: Build
FROM node:24-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git libc6-compat tzdata

COPY ./app/package.json ./app/pnpm-lock.yaml ./app/pnpm-workspace.yaml ./

RUN --mount=type=cache,target=/root/.pnpm-store,id=pnpm-store \
    npm install -g "$(node -p "require('./package.json').packageManager")" && \
    pnpm install --frozen-lockfile --store=/root/.pnpm-store

COPY ./app .

RUN pnpm build

# Stage 2: Production dependencies (the builder keeps the dev dependencies for the dev target)
FROM builder AS prod-deps

RUN --mount=type=cache,target=/root/.pnpm-store,id=pnpm-store \
    pnpm prune --prod --store-dir=/root/.pnpm-store

# Stage 3: Production
FROM node:24-alpine AS production

WORKDIR /app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY ./app/package.json ./

CMD ["node", "dist/index.js"]
