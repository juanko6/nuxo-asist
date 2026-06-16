# Contexto de build: la raíz del monorepo (ver docker-compose.yml)

FROM node:22-alpine AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY frontend/package.json frontend/
COPY backend/package.json backend/
RUN pnpm install --frozen-lockfile --filter asist-employed-web
COPY frontend frontend
# VITE_API_URL no se define: el cliente usa /api/v1 (mismo origen vía nginx)
RUN pnpm --filter asist-employed-web build

# nginx sirve la SPA y proxyea /api al backend
FROM nginx:alpine AS runtime
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
