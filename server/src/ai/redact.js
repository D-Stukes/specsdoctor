// SEC-5: strip likely secrets from any text before it reaches a model.
const PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /\b(AKIA|ASIA)[0-9A-Z]{16}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g,
  /\b(sk|rk|pk)_(live|test)_[A-Za-z0-9]{16,}\b/g,
  /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
];

// Quoted literals of 32+ chars with no whitespace and mixed letters/digits
// look like keys, not prose or identifiers.
const LONG_LITERAL = /(["'`])([A-Za-z0-9+/=_-]{32,})\1/g;

export function redactSecrets(text) {
  let out = text;
  for (const re of PATTERNS) out = out.replace(re, "[REDACTED]");
  return out.replace(LONG_LITERAL, (match, quote, body) =>
    /[A-Za-z]/.test(body) && /[0-9]/.test(body) ? `${quote}[REDACTED]${quote}` : match
  );
}
