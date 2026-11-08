import { parse as parseSql } from "pgsql-ast-parser";

function offsetToLine(source, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i += 1) {
    if (source[i] === "\n") line += 1;
  }
  return line;
}

/**
 * Splits SQL into statements at top-level semicolons, ignoring semicolons in
 * comments, quoted strings and dollar-quoted bodies. Returns [{ text, offset }].
 */
function splitStatements(source) {
  const out = [];
  let start = 0;
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === "-" && next === "-") {
      while (i < source.length && source[i] !== "\n") i += 1;
    } else if (ch === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      i = end === -1 ? source.length : end + 2;
    } else if (ch === "'" || ch === '"') {
      i += 1;
      while (i < source.length && source[i] !== ch) i += 1;
      i += 1;
    } else if (ch === "$") {
      const tag = /^\$[A-Za-z_]*\$/.exec(source.slice(i));
      if (tag) {
        const end = source.indexOf(tag[0], i + tag[0].length);
        i = end === -1 ? source.length : end + tag[0].length;
      } else {
        i += 1;
      }
    } else if (ch === ";") {
      out.push({ text: source.slice(start, i + 1), offset: start });
      i += 1;
      start = i;
    } else {
      i += 1;
    }
  }
  if (start < source.length) out.push({ text: source.slice(start), offset: start });
  return out;
}

const CREATE_TABLE_START = /^(?:\s|--[^\n]*\n|\/\*[\s\S]*?\*\/)*create\s+(?:(?:global\s+|local\s+)?(?:temp|temporary)\s+|unlogged\s+)?table\b/i;

/**
 * SQL CREATE TABLE extraction, via pgsql-ast-parser (§2 "Schemas" row).
 * Statements are parsed one at a time and only CREATE TABLE ones, so
 * psql-only lines, CREATE DATABASE or an unparseable INSERT elsewhere in
 * the file don't throw away the tables that do parse; each statement that
 * fails is flagged with its own line.
 * Returns { tables: [{ id, format: 'sql', source, columns }], flaggedPatterns }.
 */
export function parseSqlTables(path, source) {
  const tables = [];
  const flaggedPatterns = [];

  for (const { text, offset } of splitStatements(source)) {
    if (!CREATE_TABLE_START.test(text)) continue;
    let statements;
    try {
      statements = parseSql(text, { locationTracking: true });
    } catch {
      const leading = text.length - text.trimStart().length;
      flaggedPatterns.push({ line: offsetToLine(source, offset + leading), pattern: "sql_parse_error" });
      continue;
    }
    for (const stmt of statements) {
      if (stmt.type !== "create table") continue;
      const startLine = offsetToLine(source, offset + stmt._location.start);
      const endLine = offsetToLine(source, offset + stmt._location.end);
      const tablePrimaryKey = new Set(
        (stmt.constraints ?? []).filter((con) => con.type === "primary key").flatMap((con) => con.columns.map((col) => col.name))
      );
      const columns = stmt.columns
        .filter((c) => c.kind === "column")
        .map((c) => ({
          name: c.name.name,
          type: c.dataType?.name ?? null,
          nullable: !tablePrimaryKey.has(c.name.name) && !(c.constraints ?? []).some((con) => con.type === "not null" || con.type === "primary key"),
        }));
      tables.push({
        id: `tbl:${stmt.name.name}`,
        format: "sql",
        source: { path, start_line: startLine, end_line: endLine },
        columns,
      });
    }
  }
  return { tables, flaggedPatterns };
}

const PRISMA_SCALAR_TYPES = new Set(["String", "Int", "Boolean", "DateTime", "Float", "Json", "Bytes", "BigInt", "Decimal"]);

/**
 * Minimal Prisma schema parser: pulls `model Name { field Type ... }`
 * blocks and their scalar fields (§2 "Schemas" row). Relation fields
 * (whose type is another model, or that carry @relation) are skipped -
 * we only need column-shaped facts here, not the full relation graph.
 */
export function parsePrismaTables(path, source) {
  const lines = source.split("\n");
  const tables = [];
  let current = null;

  lines.forEach((line, idx) => {
    const lineNo = idx + 1;
    const modelMatch = /^\s*model\s+(\w+)\s*\{/.exec(line);
    if (modelMatch) {
      current = { id: `tbl:${modelMatch[1]}`, format: "prisma", startLine: lineNo, columns: [] };
      return;
    }
    if (current && /^\s*\}/.test(line)) {
      tables.push({
        id: current.id,
        format: "prisma",
        source: { path, start_line: current.startLine, end_line: lineNo },
        columns: current.columns,
      });
      current = null;
      return;
    }
    if (current) {
      const fieldMatch = /^\s*(\w+)\s+(\w+)(\?)?(\[\])?/.exec(line);
      if (fieldMatch && PRISMA_SCALAR_TYPES.has(fieldMatch[2])) {
        current.columns.push({ name: fieldMatch[1], type: fieldMatch[2], nullable: Boolean(fieldMatch[3]) });
      }
    }
  });

  return { tables, flaggedPatterns: [] };
}
