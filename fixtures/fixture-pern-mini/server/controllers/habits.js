const pool = require("../db");
// Bare directory import: resolves to ../lib/index.mjs.
const { formatFrequency } = require("../lib");

class HabitService {
  async list(userId) {
    const result = await pool.query("SELECT * FROM habits WHERE user_id = $1", [userId]);
    return result.rows;
  }

  async create(userId, title) {
    const result = await pool.query(
      "INSERT INTO habits (user_id, title) VALUES ($1, $2) RETURNING id",
      [userId, title]
    );
    return result.rows[0].id;
  }
}

const service = new HabitService();

async function listHabits(req, res) {
  const rows = await service.list(req.user.id);
  res.json({ habits: rows });
}

async function createHabit(req, res) {
  const id = await service.create(req.user.id, req.body.title);
  res.status(201).json({ id });
}

module.exports = { listHabits, createHabit, HabitService };
