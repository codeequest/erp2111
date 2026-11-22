# One image for the API and the web app (pnpm monorepo).
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@11.1.3 --activate
ENV CI=true

WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile

# Next.js resolves its /api rewrite at build time: inside Docker the API is "api".
ENV API_URL=http://api:4000
RUN pnpm build
