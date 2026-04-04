# Build context must be the monorepo root:
#   docker build -t hsafa/scope-postgres:latest -f hsafa-spaces/scope-images/postgres/Dockerfile .
FROM node:20-alpine AS builder

# 1. Build the SDK
WORKDIR /sdk
COPY sdks/hsafa-sdk/package.json sdks/hsafa-sdk/tsconfig.json ./
COPY sdks/hsafa-sdk/src/ src/
RUN npm install && npx tsc

# 2. Build the scope service
WORKDIR /app
COPY hsafa-spaces/scope-images/postgres/package.json hsafa-spaces/scope-images/postgres/tsconfig.json ./
COPY hsafa-spaces/scope-images/postgres/src/ src/

# Remove workspace:* SDK dep (we'll copy it manually), then install remaining deps
RUN sed -i '/"@hsafa\/sdk"/d' package.json && \
    npm install --ignore-scripts && \
    mkdir -p node_modules/@hsafa && \
    cp -r /sdk node_modules/@hsafa/sdk

RUN npx tsc

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/dist dist/
COPY --from=builder /app/node_modules node_modules/
COPY --from=builder /app/package.json .

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
