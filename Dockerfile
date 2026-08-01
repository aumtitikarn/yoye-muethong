# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# deps — install node_modules from the lockfile only, so this layer stays
#        cached until package.json / pnpm-lock.yaml actually change.
# ---------------------------------------------------------------------------
FROM node:24-alpine AS deps
# openssl + libc6-compat are needed by the Prisma engine on Alpine.
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---------------------------------------------------------------------------
# builder — generate the Prisma client and build Next.js in standalone mode
# ---------------------------------------------------------------------------
FROM node:24-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# `prisma generate` never connects to the database, so a placeholder URL is
# enough here and keeps this layer independent of the real credentials.
RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public" \
    pnpm exec prisma generate

# `.env` is mounted as a build secret (never written into a layer). Next.js
# reads it while building, which is how the NEXT_PUBLIC_* values get inlined
# into the client bundle, and how any DB-backed page can prerender.
ENV NEXT_TELEMETRY_DISABLED=1
RUN --mount=type=secret,id=dotenv,target=/app/.env,required=false \
    pnpm build

# ---------------------------------------------------------------------------
# runner — minimal image containing only the standalone server output
# ---------------------------------------------------------------------------
FROM node:24-alpine AS runner
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# Prisma's generated client lives outside Next's traced output; copy it too.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
