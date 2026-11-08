const pool = require("../db");

/** Lists the signed-in user's habits, newest first. */
async function listHabits(req, res) {
  const { rows } = await pool.query("SELECT id, name, created_at FROM habits WHERE user_id = $1 ORDER BY created_at DESC", [req.userId]);
  res.json(rows);
}

/** Adds a habit for the signed-in user and returns it. */
async function createHabit(req, res) {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "name is required" });
  const { rows } = await pool.query("INSERT INTO habits (user_id, name) VALUES ($1, $2) RETURNING id, name, created_at", [req.userId, name]);
  res.status(201).json(rows[0]);
}

module.exports = { listHabits, createHabit };
