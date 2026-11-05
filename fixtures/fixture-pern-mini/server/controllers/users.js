const pool = require("../db");

const sessionSecret = process.env["SESSION_SECRET"];

/**
 * Creates a user from the request body.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
const createUser = async (req, res) => {
  const { email, name } = req.body;
  const result = await pool.query(
    "INSERT INTO users (email, name) VALUES ($1, $2) RETURNING id",
    [email, name]
  );
  res.status(201).json({ id: result.rows[0].id });
};

/**
 * Looks up a user by ID.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
function getUser(req, res) {
  res.json({ id: req.params.id, sessionSecretConfigured: Boolean(sessionSecret) });
}

module.exports.createUser = createUser;
module.exports.getUser = getUser;
