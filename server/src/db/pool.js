import pg from "pg";

const { Pool } = pg;

let pool;

export function getPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    // Hosted Postgres (e.g. Supabase) needs SSL; local Postgres doesn't.
    const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString) || !connectionString.includes("@");
    const ssl = process.env.DATABASE_SSL === "false" || isLocal ? false : { rejectUnauthorized: false };
    pool = new Pool({ connectionString, ssl, max: Number(process.env.DATABASE_POOL_MAX) || 5 });
    if (process.env.VERCEL) {
      // On Vercel, let idle connections close cleanly between requests.
      import("@vercel/functions").then((m) => m.attachDatabasePool?.(pool)).catch(() => {});
    }
  }
  return pool;
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
