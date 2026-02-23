FROM node:20-alpine AS base

RUN apk add --no-cache openssl

WORKDIR /app

# ─── dependencies ────────────────────────────────────────────────────────────
FROM base AS dependencies

COPY package.json ./
COPY prisma ./prisma

# Use npm for a flat node_modules (no pnpm symlink issues in Docker)
RUN npm install --legacy-peer-deps && npx prisma generate

# ─── development ─────────────────────────────────────────────────────────────
FROM base AS development

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

EXPOSE 3001

CMD ["npx", "tsx", "watch", "src/index.ts"]

# ─── builder ─────────────────────────────────────────────────────────────────
FROM base AS builder

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

RUN npm run build

# ─── production ──────────────────────────────────────────────────────────────
FROM base AS production

ENV NODE_ENV=production

COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

EXPOSE 3001

CMD ["node", "dist/index.js"]
