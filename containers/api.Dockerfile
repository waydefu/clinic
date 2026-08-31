FROM node:24.14.0-bookworm-slim AS build
WORKDIR /workspace
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY apps/api/package.json apps/api/package.json
RUN CI=true corepack pnpm install --frozen-lockfile
COPY packages/contracts packages/contracts
COPY packages/domain packages/domain
COPY apps/api apps/api
RUN corepack pnpm --filter @beauessence/contracts build \
 && corepack pnpm --filter @beauessence/domain build \
 && corepack pnpm --filter @beauessence/api build \
 && corepack pnpm --filter @beauessence/api deploy --prod --legacy /runtime

FROM node:24.14.0-bookworm-slim
ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0 ALLOW_NON_LOOPBACK_BIND=true
WORKDIR /app
COPY --from=build /runtime/ ./
USER node
CMD ["node", "dist/main.js"]
