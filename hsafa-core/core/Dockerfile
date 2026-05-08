FROM node:20-alpine AS base

RUN apk add --no-cache openssl

WORKDIR /app

# --- Dependencies ---
FROM base AS dependencies

COPY package.json ./
COPY prisma ./prisma

# Install ALL dependencies (including dev) for build
RUN npm install --ignore-scripts && npx prisma generate

# --- Development (local docker-compose) ---
FROM base AS development

COPY --from=dependencies /app/node_modules ./node_modules
COPY . ./

EXPOSE 3001

CMD ["npm", "run", "dev"]

# --- Builder ---
FROM base AS builder

COPY --from=dependencies /app/node_modules ./node_modules
COPY . ./

RUN npx tsc

# --- Production ---
FROM base AS production

ENV NODE_ENV=production
ENV BUILD_TIME="2026-05-08T13:44:00Z"

COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
# Prisma generated client (db.ts imports from ../../prisma/generated/client/)
COPY --from=dependencies /app/prisma/generated ./prisma/generated
# Prisma schema + migrations (for prisma migrate deploy)
COPY --from=builder /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=builder /app/prisma/migrations ./prisma/migrations

EXPOSE 3001

CMD ["node", "dist/index.js"]
