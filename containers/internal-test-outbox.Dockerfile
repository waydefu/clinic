FROM node:24.20.0-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e AS build
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY apps/worker/package.json apps/worker/package.json
RUN CI=true corepack pnpm install --frozen-lockfile
COPY packages/contracts packages/contracts
COPY packages/domain packages/domain
COPY apps/worker apps/worker
RUN corepack pnpm --filter @beauessence/contracts build \
 && corepack pnpm --filter @beauessence/domain build \
 && corepack pnpm --filter @beauessence/worker build \
 && corepack pnpm --filter @beauessence/worker deploy --prod --legacy /runtime

FROM node:24.20.0-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e
ARG SOURCE_SHA
RUN node -e 'if (!/^[0-9a-f]{40}$/.test(process.argv[1] ?? "")) process.exit(1)' "$SOURCE_SHA"
LABEL org.opencontainers.image.revision="${SOURCE_SHA}"
ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0
WORKDIR /app
COPY --from=build /runtime/ ./
USER node
CMD ["node", "dist/internal-test-outbox-main.js"]
