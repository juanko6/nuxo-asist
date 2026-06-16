# Contexto de build: la raíz del monorepo (ver docker-compose.yml)

FROM node:22-alpine AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# Dependencias completas (incluye dev) para compilar TypeScript.
# Esta etapa también sirve para el servicio puntual de seed (target: build).
FROM base AS build
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN pnpm install --frozen-lockfile --filter asist-employed-api
COPY backend/tsconfig.json backend/tsconfig.build.json backend/
COPY backend/src backend/src
COPY backend/scripts backend/scripts
COPY backend/migrations backend/migrations
COPY docs/openapi.yaml docs/openapi.yaml
RUN pnpm --filter asist-employed-api build

# Solo dependencias de producción
FROM base AS prod-deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN pnpm install --prod --frozen-lockfile --filter asist-employed-api

# Imagen final: dist + deps de producción + migraciones + contrato OpenAPI.
# El layout replica el del repo porque dist/ resuelve ../migrations y ../../docs
# relativos a sí mismo (migrate.ts y app.ts).
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/backend/node_modules ./backend/node_modules
COPY --from=build /app/backend/dist ./backend/dist
COPY backend/package.json ./backend/
COPY backend/migrations ./backend/migrations
COPY docs/openapi.yaml ./docs/openapi.yaml
USER node
EXPOSE 3000
WORKDIR /app/backend
CMD ["node", "dist/server.js"]
