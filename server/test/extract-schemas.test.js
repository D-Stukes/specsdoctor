import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSqlTables } from "../src/scanner/extract-schemas.js";

const PERN_AUTH_SQL = `CREATE DATABASE authtodolist;

CREATE TABLE users(
  user_id UUID DEFAULT uuid_generate_v4(),
  user_name VARCHAR(255) NOT NULL,
  user_email VARCHAR(255) NOT NULL UNIQUE,
  PRIMARY KEY (user_id)
);

CREATE TABLE todos(
  todo_id SERIAL,
  user_id UUID,
  description VARCHAR(255) NOT NULL,
  PRIMARY KEY (todo_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id)
);

--fake users data
INSERT INTO users (user_name, user_email) VALUES ('henry', 'henryly213@gmail.com');
`;

test("tables parse even when the file also has CREATE DATABASE and INSERTs", () => {
  const { tables, flaggedPatterns } = parseSqlTables("server/database.sql", PERN_AUTH_SQL);
  assert.deepEqual(tables.map((t) => t.id), ["tbl:users", "tbl:todos"]);
  assert.deepEqual(flaggedPatterns, []);
  assert.deepEqual(tables[0].source, { path: "server/database.sql", start_line: 3, end_line: 8 });
  assert.equal(tables[1].source.start_line, 10);
});

test("one broken CREATE TABLE is flagged with its own line and does not drop the others", () => {
  const sql = `CREATE TABLE a (id int);\n\nCREATE TABLE b (id int,, oops);\n\nCREATE TABLE c (id int);\n`;
  const { tables, flaggedPatterns } = parseSqlTables("x.sql", sql);
  assert.deepEqual(tables.map((t) => t.id), ["tbl:a", "tbl:c"]);
  assert.deepEqual(flaggedPatterns, [{ line: 3, pattern: "sql_parse_error" }]);
});

test("semicolons inside strings, comments and dollar quotes don't split statements", () => {
  const sql = `-- a; comment\nCREATE TABLE t (note text DEFAULT 'a;b');\nCREATE FUNCTION f() RETURNS int AS $$ SELECT 1; $$ LANGUAGE sql;\nCREATE TABLE u (id int);\n`;
  const { tables, flaggedPatterns } = parseSqlTables("x.sql", sql);
  assert.deepEqual(tables.map((t) => t.id), ["tbl:t", "tbl:u"]);
  assert.deepEqual(flaggedPatterns, []);
});
