import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the Next.js route/dev indicator (floating N) so review shots stay clean.
  devIndicators: false,
  images: {
    // Stored company logos can live on any host already saved in the database.
    remotePatterns: [
      { protocol: "https", hostname: "*" },
      { protocol: "http", hostname: "*" },
    ],
  },
  // Dev HMR and the RSC debug channel are blocked for 127.0.0.1 unless it is
  // listed. Without this, `next dev` serves HTML at that host but never
  // hydrates, so the globe stays on "Loading globe".
  allowedDevOrigins: ["127.0.0.1"],
  // postgres.js publishes a workerd build. Leave it external so the Next
  // bundler does not load that build while collecting the pipeline route,
  // and so a deploy with no database URL never has to initialize the client.
  serverExternalPackages: ["postgres"],
  // The SQLite file isn't reachable by Next's static import tracing (it's opened
  // via a runtime fs path in lib/db/client.ts), so it has to be listed explicitly
  // or Vercel's serverless functions won't have it bundled.
  async redirects() {
    return [
      { source: "/news", destination: "/signals?type=press", permanent: true },
      { source: "/sources", destination: "/signals/sources", permanent: true },
      { source: "/alumni", destination: "/map/network", permanent: true },
      { source: "/pipeline", destination: "/work/pipeline", permanent: true },
      { source: "/founder/discover", destination: "/founders", permanent: false },
      { source: "/startup/discover", destination: "/companies", permanent: false },
      { source: "/hotspots", destination: "/map/hotspots", permanent: false },
      { source: "/founder/network", destination: "/map/network", permanent: false },
      { source: "/founder/shortlist", destination: "/work/shortlist", permanent: false },
      { source: "/shortlist", destination: "/work/shortlist", permanent: false },
      { source: "/startup/pipeline", destination: "/work/pipeline", permanent: false },
      { source: "/startup/verification", destination: "/work/verify", permanent: false },
    ];
  },
  outputFileTracingIncludes: {
    // The database is opened by a runtime path, and better-sqlite3 picks a
    // prebuild for the deploy architecture. Include both explicitly so a
    // Vercel function is not missing the file the tracer did not follow.
    "/**": ["./data/campus-universe.db", "./node_modules/better-sqlite3/prebuilds/**/*"],
  },
};

export default nextConfig;
