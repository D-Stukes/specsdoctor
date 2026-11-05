const express = require("express");
const { createUser, getUser } = require("../controllers/users");
const { requireAuth } = require("../middleware/auth");

const router = express.Router();

router.post("/", requireAuth, createUser);
router.get("/:id", getUser);

// Inline handler: no separate controller function to point to.
router.get("/:id/ping", (req, res) => {
  res.json({ ok: true });
});

module.exports = router;
