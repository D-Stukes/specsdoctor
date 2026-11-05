import express from "express";
import crypto from "node:crypto";
import {
  createSessionToken,
  setSessionCookie,
  isLoginRateLimited,
  recordLoginFailure,
  clearLoginFailures,
} from "../auth.js";

export const sessionRouter = express.Router();

function timingSafeEqualStrings(a, b) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

// POST /api/session - exchange the access code for a signed, HTTP-only
// cookie. Technical Design SS4d. The only route that doesn't require the
// cookie itself (SS4e SEC-8).
sessionRouter.post("/session", (req, res) => {
  const ip = req.ip;
  if (isLoginRateLimited(ip)) {
    return res.status(429).json({ error: { code: "rate_limited", message: "Too many attempts, try again later" } });
  }

  const { code } = req.body ?? {};
  const expected = process.env.ACCESS_CODE;
  if (!expected) {
    return res.status(500).json({ error: { code: "server_misconfigured", message: "ACCESS_CODE is not set" } });
  }

  if (typeof code !== "string" || !timingSafeEqualStrings(code, expected)) {
    recordLoginFailure(ip);
    return res.status(401).json({ error: { code: "bad_code", message: "Incorrect access code" } });
  }

  clearLoginFailures(ip);
  setSessionCookie(res, createSessionToken());
  res.status(204).end();
});
