import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The SQLite file isn't reachable by Next's static import tracing (it's opened
  // via a runtime fs path in lib/db/client.ts), so it has to be listed explicitly
  // or Vercel's serverless functions won't have it bundled.
  outputFileTracingIncludes: {
    "/**": ["./data/campus-universe.db"],
  },
};

export default nextConfig;
