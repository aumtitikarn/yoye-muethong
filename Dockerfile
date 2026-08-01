# Stage 1: Install dependencies
FROM node:22-slim AS deps
# ลง openssl สำหรับ Prisma
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
# Prisma schema + config, so this stage stays self-contained if install ever
# grows a postinstall step.
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
RUN npm install --legacy-peer-deps

# Stage 2: Build
FROM node:22-slim AS builder
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# สั่งเจน Prisma ดักไว้ก่อน
# prisma.config.ts อ่าน DATABASE_URL แต่ generate ไม่ได้ต่อ DB จริง
# เลยใส่ค่าหลอกไว้ให้ผ่าน (ตัว build จริงใช้ ARG ข้างล่าง)
RUN DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public" \
    npx prisma generate

ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL

ARG NEXT_PUBLIC_URL
ENV NEXT_PUBLIC_URL=$NEXT_PUBLIC_URL

ARG NEXT_PUBLIC_FILES_URL_BASE
ENV NEXT_PUBLIC_FILES_URL_BASE=$NEXT_PUBLIC_FILES_URL_BASE

ARG NEXT_PUBLIC_OMISE_PUBLIC_KEY
ENV NEXT_PUBLIC_OMISE_PUBLIC_KEY=$NEXT_PUBLIC_OMISE_PUBLIC_KEY

# /reviews กับ /api/v1/public/reviews/stats prerender จาก DB ตอน build
ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL

# 🔥 จุดสำคัญ: ขยับเพดาน RAM ขึ้นมาหน่อย และเปิดโหมดประหยัดพลังงานของ Next.js ยัดเข้าไปตอน Build ตรงๆ
ENV NODE_OPTIONS="--max-old-space-size=1536"

RUN npm run build

# Stage 3: Runner
FROM node:22-slim AS runner
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Prisma schema + config + CLI for running migrations from this image
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/.bin/prisma ./node_modules/.bin/prisma

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
