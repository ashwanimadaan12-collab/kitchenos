import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@kitchenos/ui", "@kitchenos/shared"],
  reactStrictMode: true,
  // Produces a self-contained `.next/standalone` build (server + only the node_modules it
  // actually needs) — the production Dockerfile copies just that output instead of the whole
  // monorepo's node_modules, which is what keeps the final image small.
  output: "standalone",
};

export default nextConfig;
