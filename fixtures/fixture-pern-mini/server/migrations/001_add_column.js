// Knex-style migration. Not parsed for table facts (the Scanner flags it:
// file listed, AI-read on the data-model page and labeled); Prisma and raw
// SQL CREATE TABLE are the only schema sources the Scanner extracts itself.
exports.up = function up(knex) {
  return knex.schema.alterTable("habits", (table) => {
    table.text("notes").nullable();
  });
};

exports.down = function down(knex) {
  return knex.schema.alterTable("habits", (table) => {
    table.dropColumn("notes");
  });
};
