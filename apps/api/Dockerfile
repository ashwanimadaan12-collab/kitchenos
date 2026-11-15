# Built from the repo ROOT as build context (needs the whole pnpm workspace, not just this
# folder): `docker build -f apps/api/Dockerfile .`
#
# This copies the whole built monorepo into the runtime image rather than trying to cherry-pick
# a pruned node_modules (e.g. via `pnpm deploy`) — deliberately, because this repo's .gitignore
# excludes both `dist/` and `packages/database/generated/` (the compiled output and the generated
# Prisma client), and pnpm's file-selection for a prod deploy follows exactly that ignore list.
# A pruned deploy would silently ship without its own compiled code. Copying everything keeps
# pnpm's node_modules symlinks (which point within the copied tree) intact and guarantees nothing
# needed at runtime gets left behind, at the cost of a larger image than a fully-optimized
# multi-stage prune would produce — a reasonable tradeoff to get a correct image first.
FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter "@kitchenos/api..." run --if-present build

FROM node:20-alpine AS runner
RUN corepack enable
WORKDIR /repo
ENV NODE_ENV=production
COPY --from=build /repo /repo
EXPOSE 4000
USER node
CMD ["node", "apps/api/dist/main.js"]
