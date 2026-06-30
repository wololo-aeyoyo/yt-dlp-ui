# syntax=docker/dockerfile:1

# ============================================================
# yt-wololo — Vite + React SPA, served by nginx.
# Stage 1 builds the static bundle; stage 2 serves it and
# proxies /api -> the yt-dlp backend (same-origin, no CORS).
# ============================================================

ARG NODE_VERSION=24-slim
ARG NGINX_VERSION=1.27-alpine

# ------------------------------------------------------------
# Stage 1: build the static assets
# ------------------------------------------------------------
FROM node:${NODE_VERSION} AS builder

WORKDIR /app

# Install deps first for better layer caching.
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    if [ -f package-lock.json ]; then npm ci --no-audit --no-fund; \
    else npm install --no-audit --no-fund; fi

# Build. Empty VITE_API_BASE => the app calls same-origin /api,
# which nginx proxies to the backend (see default.conf.template).
# Override at build time: --build-arg VITE_API_BASE=https://host
ARG VITE_API_BASE=""
ENV VITE_API_BASE=${VITE_API_BASE}

COPY . .
RUN npm run build

# ------------------------------------------------------------
# Stage 2: serve with nginx
# ------------------------------------------------------------
FROM nginx:${NGINX_VERSION} AS runner

# Backend that /api/* is proxied to. Override at runtime:
#   docker run -e BACKEND_URL=http://host.docker.internal:8000 ...
ENV BACKEND_URL=https://yt-dlp.wololoaeyoyo.com

# nginx:alpine auto-runs envsubst on *.template into /etc/nginx/conf.d/
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 8080

# Base image entrypoint renders the template then runs nginx.
