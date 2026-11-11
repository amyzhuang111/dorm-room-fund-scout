# Runtime corpus packaging fix

Production verification of the LSE import found that static totals contained the new companies but live database queries did not. Vercel sets VERCEL during its build as well as at runtime. The database client consequently opened a temporary copy during ingestion; Next.js file tracing still bundled the older seed under data/campus-universe.db.

The prebuild now creates an isolated data/runtime/campus-universe.db artifact, runs every ingestion and snapshot step against that same explicit path, checkpoints SQLite, and verifies that the committed seed did not change. Serverless output tracing includes this prepared database. Live requests copy it into their writable temporary location. Deployments missing the prepared artifact fail explicitly instead of silently serving the old seed.

CI now builds with VERCEL=1, checks both LSE route traces, opens a fresh runtime database from the packaged artifact, reconciles all published counts, and runs the existing desktop/mobile browser journey. No database binary is committed and no SQL cutover is implied.
