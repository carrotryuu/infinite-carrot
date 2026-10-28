FROM node:22-bookworm-slim AS runtime-base
RUN apt-get update && apt-get install --yes --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*

FROM runtime-base AS build
WORKDIR /app
RUN npm install --global pnpm@10.11.0
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc ./
COPY apps/web/package.json apps/web/package.json
COPY apps/server/package.json apps/server/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM runtime-base AS server
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000
CMD ["sh", "-c", "node apps/server/node_modules/prisma/build/index.js migrate deploy --schema apps/server/prisma/schema.prisma && exec node apps/server/dist/main.js"]

FROM node:22-bookworm-slim AS worker
RUN apt-get update && apt-get install --yes --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
CMD ["node", "apps/worker/dist/main.js"]

FROM nginx:1.28-alpine AS web
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
