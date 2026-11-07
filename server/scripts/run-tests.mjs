// `npm test`: runs the suite against its own database (docsync_test), never
// the dev database, because several tests delete rows from the runs table.
// Creates the database on first use. Override with TEST_DATABASE_URL.
import { spawnSync } from "node:child_process";
import pg from "pg";

const testUrl = process.env.TEST_DATABASE_URL ?? "postgres://localhost:5432/docsync_test";
const dbName = new URL(testUrl).pathname.slice(1);
if (!/^[A-Za-z0-9_]+$/.test(dbName)) throw new Error(`Unsafe test database name: ${dbName}`);
if (dbName === "docsync_dev") throw new Error("Refusing to run tests against docsync_dev");

const adminUrl = new URL(testUrl);
adminUrl.pathname = "/postgres";
const admin = new pg.Client({ connectionString: adminUrl.toString() });
await admin.connect();
const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
if (rowCount === 0) await admin.query(`CREATE DATABASE ${dbName}`);
await admin.end();

// Start every invocation from empty run data: leftover runs from the last invocation would count
// against the runs-per-hour limit and break the first test that starts a run.
const testDb = new pg.Client({ connectionString: testUrl });
await testDb.connect();
const { rows: tables } = await testDb.query("SELECT to_regclass('public.runs') AS runs");
if (tables[0].runs) await testDb.query("TRUNCATE runs, repos CASCADE");
await testDb.end();

const result = spawnSync(process.execPath, ["--test", "--test-timeout=120000", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: testUrl },
});
process.exit(result.status ?? 1);
