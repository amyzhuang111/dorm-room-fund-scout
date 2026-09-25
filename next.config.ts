import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The SQLite file isn't reachable by Next's static import tracing (it's opened
  // via a runtime fs path in lib/db/client.ts), so it has to be listed explicitly
  // or Vercel's serverless functions won't have it bundled.
  outputFileTracingIncludes: {
    // The database is opened by a runtime path, and better-sqlite3 picks a
    // prebuild for the deploy architecture. Include both explicitly so a
    // Vercel function is not missing the file the tracer did not follow.
    "/**": ["./data/campus-universe.db", "./node_modules/better-sqlite3/prebuilds/**/*"],
  },
};

export default nextConfig;
