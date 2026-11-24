#!/bin/sh
# Brings the database up to date, then starts the API.
#
# Without this the container would start against whatever schema the database
# happens to have: on a first deploy that is an empty database, and the app
# boots happily and then fails on every single query. Migrations have to run
# before the server accepts a request, and the only moment guaranteed to happen
# on every deploy is here.
#
# prisma and tsx are called by path rather than through pnpm so this works as
# the unprivileged `node` user, with no package manager cache to write to.
# Both live under packages/database/node_modules because the image installs dev
# dependencies — do not add --prod to the install in the Dockerfile.
set -e

echo "[entrypoint] Applying database migrations..."
packages/database/node_modules/.bin/prisma migrate deploy \
  --schema packages/database/prisma/schema.prisma

# The permission catalogue has to exist before the first signup: a new org's
# admin role is built by reading that table, so an unseeded database makes
# signup fail with nothing on screen to explain why. The seed inserts with
# skipDuplicates, so running it on every boot changes nothing after the first.
echo "[entrypoint] Seeding the permission catalogue (no-op if already there)..."
packages/database/node_modules/.bin/tsx packages/database/prisma/seed-production.ts

echo "[entrypoint] Database ready. Starting API..."
exec node apps/api/dist/main.js
