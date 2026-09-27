// Free hosted store for the user pipeline. SQLite on Vercel is read-only.
// A Postgres URL (Neon or Supabase from the Vercel Marketplace) is preferred.
// Upstash Redis REST credentials are the fallback hosted store. With neither
// set, the API reports the store as unconfigured and the browser keeps entries
// in localStorage.

import { parseState, type UserPipelineState } from "../domain/user-pipeline";

type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => PromiseLike<unknown>;

const REDIS_KEY = "scout-user-pipeline";
const ROW_ID = "default";

export type PipelineBackend = "postgres" | "upstash";

const POSTGRES_KEYS = ["POSTGRES_URL", "DATABASE_URL", "POSTGRES_URL_NON_POOLING", "DATABASE_URL_UNPOOLED", "POSTGRES_PRISMA_URL"];

function postgresUrl(): string | null {
  for (const key of POSTGRES_KEYS) {
    const value = process.env[key]?.trim();
    if (value && /^postgres(ql)?:\/\//i.test(value)) return value;
  }
  return null;
}

function upstashCreds(): { url: string; token: string } | null {
  const url = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL)?.trim();
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN)?.trim();
  if (!url || !token) return null;
  return { url: url.replace(/\/$/, ""), token };
}

export function pipelineBackend(): PipelineBackend | null {
  if (postgresUrl()) return "postgres";
  if (upstashCreds()) return "upstash";
  return null;
}

const globalStore = globalThis as unknown as { __scoutPipelineSql?: Sql };

async function sqlClient(url: string): Promise<Sql> {
  const existing = globalStore.__scoutPipelineSql;
  if (existing) return existing;
  const { default: connect } = await import("postgres");
  const local = /localhost|127\.0\.0\.1/.test(url);
  const sql = connect(url, {
    ssl: local ? false : "require",
    max: 1,
    idle_timeout: 5,
    connect_timeout: 15,
    prepare: false,
  }) as unknown as Sql;
  globalStore.__scoutPipelineSql = sql;
  return sql;
}

async function ensureTable(sql: Sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS scout_user_pipeline (
      id text PRIMARY KEY,
      payload text NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `;
}

async function readPostgres(): Promise<UserPipelineState | null> {
  const url = postgresUrl();
  if (!url) return null;
  const sql = await sqlClient(url);
  await ensureTable(sql);
  const rows = (await sql`SELECT payload FROM scout_user_pipeline WHERE id = ${ROW_ID}`) as { payload: string }[];
  if (!rows[0]?.payload) return null;
  return parseState(JSON.parse(rows[0].payload));
}

async function writePostgres(state: UserPipelineState): Promise<void> {
  const url = postgresUrl();
  if (!url) throw new Error("Postgres is not configured");
  const sql = await sqlClient(url);
  await ensureTable(sql);
  const payload = JSON.stringify(state);
  await sql`
    INSERT INTO scout_user_pipeline (id, payload, updated_at)
    VALUES (${ROW_ID}, ${payload}, now())
    ON CONFLICT (id) DO UPDATE SET payload = excluded.payload, updated_at = now()
  `;
}

async function redisCommand(args: (string | number)[]): Promise<unknown> {
  const creds = upstashCreds();
  if (!creds) throw new Error("Upstash is not configured");
  const res = await fetch(creds.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${creds.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`);
  const data = (await res.json()) as { result?: unknown; error?: string };
  if (data.error) throw new Error(data.error);
  return data.result;
}

async function readRedis(): Promise<UserPipelineState | null> {
  const result = await redisCommand(["GET", REDIS_KEY]);
  if (typeof result !== "string" || !result) return null;
  return parseState(JSON.parse(result));
}

async function writeRedis(state: UserPipelineState): Promise<void> {
  await redisCommand(["SET", REDIS_KEY, JSON.stringify(state)]);
}

export async function readPipeline(): Promise<UserPipelineState | null> {
  if (pipelineBackend() === "postgres") return readPostgres();
  if (pipelineBackend() === "upstash") return readRedis();
  return null;
}

export async function writePipeline(state: UserPipelineState): Promise<void> {
  if (pipelineBackend() === "postgres") return writePostgres(state);
  if (pipelineBackend() === "upstash") return writeRedis(state);
  throw new Error("No pipeline store is configured");
}
