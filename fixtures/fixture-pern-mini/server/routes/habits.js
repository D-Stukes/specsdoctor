const express = require("express");
const { listHabits, createHabit } = require("../controllers/habits");

const router = express.Router();

function asyncHandler(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
}

router.route("/")
  .get(listHabits)
  .post(asyncHandler(createHabit));

// Dynamic require: the plugin name comes from a variable, not a string
// literal, so the Scanner cannot resolve this import.
const pluginName = process.env.HABITS_PLUGIN || "default-plugin";
const plugin = require(pluginName);

router.use("/plugin", plugin.router);

module.exports = router;
