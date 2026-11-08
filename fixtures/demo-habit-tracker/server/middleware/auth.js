/** Rejects requests that don't say who they are. */
module.exports = function requireAuth(req, res, next) {
  const userId = req.header("x-user-id");
  if (!userId) return res.status(401).json({ error: "sign in first" });
  req.userId = userId;
  next();
};
