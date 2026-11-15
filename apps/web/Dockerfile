# Built from the repo ROOT as build context: `docker build -f apps/web/Dockerfile .`
#
# Next's `output: "standalone"` (next.config.ts) traces exactly the files the server needs and
# bundles its own minimal node_modules, including the transpiled `@kitchenos/ui`/`@kitchenos/shared`
# workspace packages (via `transpilePackages`) — so unlike the API image, this one doesn't need the
# whole monorepo copied in, just the standalone output plus the static assets and public files
# Next deliberately leaves out of it.
FROM node:20-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS build
# Next.js inlines every NEXT_PUBLIC_* value into the compiled output at build time, not read at
# container-run time — the browser needs it before any server code runs, so there's nowhere else
# for it to come from. Passing it only to `docker run` (as plain server env vars normally work)
# has no effect: the value baked in here is whatever this build arg was when the image was built.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter "@kitchenos/web..." run --if-present build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Monorepo builds trace with the workspace path preserved, so the standalone server.js lands at
# apps/web/server.js inside this output, not at its root.
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
EXPOSE 3000
USER node
CMD ["node", "apps/web/server.js"]
