import { parse as parseSql } from "pgsql-ast-parser";

function offsetToLine(source, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < source.length; i += 1) {
    if (source[i] === "\n") line += 1;
  }
  return line;
}

/**
 * SQL CREATE TABLE extraction, via pgsql-ast-parser (§2 "Schemas" row).
 * Returns an array of { id, format: 'sql', source, columns }.
 */
export function parseSqlTables(path, source) {
  let statements;
  try {
    statements = parseSql(source, { locationTracking: true });
  } catch {
    return { tables: [], flaggedPatterns: [{ line: 1, pattern: "sql_parse_error" }] };
  }

  const tables = [];
  for (const stmt of statements) {
    if (stmt.type !== "create table") continue;
    const startLine = offsetToLine(source, stmt._location.start);
    const endLine = offsetToLine(source, stmt._location.end);
    const columns = stmt.columns
      .filter((c) => c.kind === "column")
      .map((c) => ({
        name: c.name.name,
        type: c.dataType?.name ?? null,
        nullable: !(c.constraints ?? []).some((con) => con.type === "not null" || con.type === "primary key"),
      }));
    tables.push({
      id: `tbl:${stmt.name.name}`,
      format: "sql",
      source: { path, start_line: startLine, end_line: endLine },
      columns,
    });
  }
  return { tables, flaggedPatterns: [] };
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
