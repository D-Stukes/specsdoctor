import express from "express";
import { getPool } from "../db/pool.js";

export const healthRouter = express.Router();

// GET /api/health - no auth. Technical Design SS4d.
healthRouter.get("/health", async (req, res) => {
  let db = false;
  try {
    await getPool().query("SELECT 1");
    db = true;
  } catch {
    db = false;
  }
  res.json({ ok: db, db });
});
