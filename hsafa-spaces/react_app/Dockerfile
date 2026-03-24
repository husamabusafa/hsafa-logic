# Build stage
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_HSAFA_GATEWAY_URL
ARG VITE_HSAFA_PUBLIC_KEY
ARG VITE_API_URL

RUN npm run build

# Serve stage
FROM node:22-alpine AS production
WORKDIR /app

RUN npm install -g serve

COPY --from=build /app/dist ./dist

EXPOSE 3000
CMD ["serve", "-s", "dist", "-l", "3000"]
