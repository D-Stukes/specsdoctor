// Shared client for a local, self-hosted VoiceStudio server (github.com/debpalash/voicestudio) -
// the "ears and mouth" upgrade from LOG.md's wow-factor brainstorm. Goes through this app's own
// server (server/src/routes/voice.js), not straight to VoiceStudio: a browser page can't call it
// directly (VoiceStudio sends no CORS header for an arbitrary origin), and the server already
// mediates every other third-party call the same way. Only works when this app is run locally
// alongside VoiceStudio; a deployed/shared run has no VoiceStudio to reach, and speech.js /
// voice-input.js fall back to the browser's own APIs whenever the proxy reports it's unavailable.

export const VOICESTUDIO_BASE = "/api/voice";
const CHECK_TIMEOUT_MS = 2000;
const AVAILABILITY_TTL_MS = 10000; // re-probe this often rather than trusting one check for the whole page session

let availability = null; // { promise: Promise<boolean>, expiresAt: number } | null

/**
 * Whether a local VoiceStudio server answers right now. Cached briefly, not for the whole page
 * session - a single check landing while VoiceStudio is mid-restart shouldn't lock every line for
 * the rest of the session onto the browser fallback once it's back up.
 */
export function voiceStudioAvailable() {
  const now = Date.now();
  if (!availability || now > availability.expiresAt) {
    const promise = fetch(`${VOICESTUDIO_BASE}/capabilities`, { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) })
      .then((res) => res.ok)
      .catch(() => false);
    availability = { promise, expiresAt: now + AVAILABILITY_TTL_MS };
  }
  return availability.promise;
}
