/**
 * Requires a signed-in session before letting a request through.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {void}
 */
function requireAuth(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ error: { code: "unauthenticated", message: "Sign in required" } });
  }
  next();
}

module.exports.requireAuth = requireAuth;
