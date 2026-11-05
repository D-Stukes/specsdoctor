import crypto from "node:crypto";

const COOKIE_NAME = "docsync_session";
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 hours, per SS4d POST /api/session

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not set");
  return secret;
}

function sign(payload) {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

/** Builds the signed cookie value: "<expiresAtMs>.<signature>". */
export function createSessionToken() {
  const expiresAt = Date.now() + SESSION_TTL_MS;
  const payload = String(expiresAt);
  return `${payload}.${sign(payload)}`;
}

/** Returns true only if the token is well-formed, correctly signed, and not expired. */
export function verifySessionToken(token) {
  if (typeof token !== "string") return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  const expected = sign(payload);
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return false;
  }
  const expiresAt = Number(payload);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

export function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_MS,
  });
}

/** Requires a valid session cookie on every route that reads or changes saved content (SEC-8). */
export function requireSession(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!verifySessionToken(token)) {
    return res.status(401).json({ error: { code: "unauthenticated", message: "Sign in required" } });
  }
  next();
}

// Login-attempt limiter: 5 failures per 15 minutes, per SEC-9. In-memory is
// fine for the single Render instance this app runs as (SS4a).
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const failuresByIp = new Map();

export function isLoginRateLimited(ip) {
  const entry = failuresByIp.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.windowStart > LOGIN_WINDOW_MS) {
    failuresByIp.delete(ip);
    return false;
  }
  return entry.count >= LOGIN_MAX_ATTEMPTS;
}

export function recordLoginFailure(ip) {
  const entry = failuresByIp.get(ip);
  if (!entry || Date.now() - entry.windowStart > LOGIN_WINDOW_MS) {
    failuresByIp.set(ip, { windowStart: Date.now(), count: 1 });
  } else {
    entry.count += 1;
  }
}

export function clearLoginFailures(ip) {
  failuresByIp.delete(ip);
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
