const router = require("express").Router();
const requireAuth = require("../middleware/auth");
const { listHabits, createHabit } = require("../controllers/habits");

router.get("/", requireAuth, listHabits);
router.post("/", requireAuth, createHabit);

module.exports = router;
