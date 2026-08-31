FROM node:24.14.0-bookworm-slim AS build
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/domain/package.json packages/domain/package.json
COPY apps/worker/package.json apps/worker/package.json
RUN CI=true corepack pnpm install --frozen-lockfile
COPY packages/domain packages/domain
COPY apps/worker apps/worker
RUN corepack pnpm --filter @beauessence/domain build \
 && corepack pnpm --filter @beauessence/worker build \
 && corepack pnpm --filter @beauessence/worker deploy --prod --legacy /runtime

FROM node:24.14.0-bookworm-slim
ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0
WORKDIR /app
COPY --from=build /runtime/ ./
USER node
CMD ["node", "dist/calendar-sync/calendar-pilot-main.js"]
