import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { getPool, closePool } from "./pool.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "..", "..", "db", "migrations");

/**
 * Applies every migration in db/migrations/ that hasn't run yet, in filename
 * order, tracked in a schema_migrations table. Each file runs in its own
 * transaction so a partial failure doesn't leave the DB half-migrated.
 */
export async function migrate() {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const { rows: applied } = await pool.query("SELECT filename FROM schema_migrations");
  const appliedSet = new Set(applied.map((r) => r.filename));

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const ran = [];
  for (const file of files) {
    if (appliedSet.has(file)) continue;
    const sql = readFileSync(path.join(migrationsDir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
      await client.query("COMMIT");
      ran.push(file);
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`Migration ${file} failed: ${err.message}`, { cause: err });
    } finally {
      client.release();
    }
  }
  return ran;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  migrate()
    .then((ran) => {
      console.log(ran.length ? `Applied: ${ran.join(", ")}` : "Already up to date.");
      return closePool();
    })
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    });
}
