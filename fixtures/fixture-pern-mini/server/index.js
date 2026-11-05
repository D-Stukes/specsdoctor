const express = require("express");
const usersRouter = require("./routes/users");
const habitsRouter = require("./routes/habits");

const app = express();
app.use(express.json());

const apiRouter = express.Router();
apiRouter.use("/users", usersRouter);
apiRouter.use("/habits", habitsRouter);

// Nested mount: apiRouter is mounted under /api, and apiRouter mounts
// usersRouter/habitsRouter under /users and /habits respectively, so the
// full path for e.g. users is /api/users/*.
app.use("/api", apiRouter);

// Dynamic mount prefix: the Scanner cannot resolve this statically, so this
// mount (and everything under it) is flagged dynamic_mount_prefix.
const apiVersion = process.env.API_VERSION || "v1";
app.use(`/${apiVersion}/legacy`, usersRouter);

app.get("/health", async (req, res) => {
  // Dynamic import: lazy-loads the admin panel only if requested.
  if (req.query.admin === "true") {
    const adminPanel = await import("./admin-panel.js");
    return adminPanel.render(req, res);
  }
  res.json({ ok: true });
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`fixture-pern-mini listening on ${port}`);
});

module.exports = app;
