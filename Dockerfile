# Base stage with dependencies
FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV COREPACK_HOME="/pnpm/corepack"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl

COPY package.json pnpm-lock.yaml .npmrc ./
RUN corepack install
COPY prisma ./prisma/

# Dependencies stage
FROM base AS dependencies

RUN --mount=type=cache,id=aihn-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store

# Build stage
FROM base AS build

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client and build
RUN pnpm exec prisma generate && \
    pnpm run build

# Production dependencies stage
FROM base AS prod-dependencies

RUN --mount=type=cache,id=aihn-pnpm-store,target=/pnpm/store \
    pnpm install --prod --frozen-lockfile --store-dir=/pnpm/store && \
    pnpm exec prisma generate

# Production stage
FROM base AS production

WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nestjs -u 1001 && \
    mkdir -p /app/storage && \
    chown nestjs:nodejs /app/storage

# Set ownership during copy instead of duplicating dependency layers with chown.
COPY --chown=nestjs:nodejs --from=build /app/dist ./dist
COPY --chown=nestjs:nodejs --from=prod-dependencies /app/node_modules ./node_modules

USER nestjs

EXPOSE 3000

CMD ["node", "dist/src/main"]
