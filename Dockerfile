# syntax=docker/dockerfile:1

ARG BUN_VERSION=1.3.9

FROM oven/bun:${BUN_VERSION}-slim AS bun

FROM node:24-bookworm-slim AS runtime
WORKDIR /app

FROM runtime AS build-base

COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
RUN ln -s /usr/local/bin/bun /usr/local/bin/bunx

RUN apt-get update -qq \
    && apt-get install -qq --no-install-recommends \
    build-essential \
    ca-certificates \
    g++ \
    openssl \
    python3 \
    && rm -rf /var/lib/apt/lists/*

# Install from workspace manifests so source-only changes do not invalidate dependencies.
FROM build-base AS dependencies
COPY package.json bun.lock bunfig.toml ./
COPY --parents apps/**/package.json packages/**/package.json ./
COPY patches ./patches
RUN --mount=type=cache,id=botflow-bun,target=/root/.bun/install/cache,sharing=locked \
    node -e 'const fs=require("node:fs");const p=JSON.parse(fs.readFileSync("package.json","utf8"));delete p.scripts.postinstall;delete p.scripts.prepare;fs.writeFileSync("package.json",JSON.stringify(p,null,2)+"\n")' \
    && SENTRYCLI_SKIP_DOWNLOAD=1 bun install --frozen-lockfile

# Prisma CLI and its production dependency closure are installed separately for the Builder image.
FROM dependencies AS prisma-dependencies
RUN --mount=type=cache,id=botflow-bun,target=/root/.bun/install/cache,sharing=locked \
    rm -rf node_modules \
    && SENTRYCLI_SKIP_DOWNLOAD=1 bun install --frozen-lockfile --production --filter '@typebot.io/prisma'

FROM dependencies AS builder
ARG SCOPE
COPY . .
RUN cd packages/env && bun run compile && bunx nx db:generate prisma
RUN bunx nx sync
RUN SKIP_ENV_CHECK=true DATABASE_URL=postgresql:// NEXT_PUBLIC_VIEWER_URL=http://localhost bunx nx build ${SCOPE}
RUN DATABASE_URL=postgresql:// bunx nx db:generate prisma

# ================== RELEASE ======================

FROM runtime AS release
ARG SCOPE
ENV SCOPE=${SCOPE}
COPY --from=builder --chown=node:node /app/apps/${SCOPE}/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/${SCOPE}/.next/static ./apps/${SCOPE}/.next/static
COPY --from=builder --chown=node:node /app/apps/${SCOPE}/public ./apps/${SCOPE}/public
COPY --from=builder \
    /app/node_modules/next-runtime-env \
    /app/node_modules/chalk \
    /app/node_modules/ansi-styles \
    /app/node_modules/color-convert \
    /app/node_modules/color-name \
    /app/node_modules/supports-color \
    /app/node_modules/has-flag \
    ./node_modules/


COPY scripts/${SCOPE}-entrypoint.sh ./
RUN chmod +x ./${SCOPE}-entrypoint.sh
USER node
ENTRYPOINT ./${SCOPE}-entrypoint.sh

EXPOSE 3000
ENV PORT=3000

FROM release AS builder-release
COPY --from=builder /app/packages/prisma/postgresql ./packages/prisma/postgresql
COPY --from=builder /app/packages/prisma/prisma.config.ts ./packages/prisma/prisma.config.ts
COPY --from=prisma-dependencies /app/node_modules ./node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma/client ./node_modules/@prisma/client
