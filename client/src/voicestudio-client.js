// Shared client for a local, self-hosted VoiceStudio server (github.com/debpalash/voicestudio) -
// the "ears and mouth" upgrade from LOG.md's wow-factor brainstorm. Goes through this app's own
// server (server/src/routes/voice.js), not straight to VoiceStudio: a browser page can't call it
// directly (VoiceStudio sends no CORS header for an arbitrary origin), and the server already
// mediates every other third-party call the same way. Only works when this app is run locally
// alongside VoiceStudio; a deployed/shared run has no VoiceStudio to reach, and speech.js /
// voice-input.js fall back to the browser's own APIs whenever the proxy reports it's unavailable.

export const VOICESTUDIO_BASE = "/api/voice";
const CHECK_TIMEOUT_MS = 2000;

let availability = null; // null = not yet checked; otherwise a cached Promise<boolean>

/** Whether a local VoiceStudio server answers right now. Checked once per page load and cached. */
export function voiceStudioAvailable() {
  if (availability === null) {
    availability = fetch(`${VOICESTUDIO_BASE}/capabilities`, { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) })
      .then((res) => res.ok)
      .catch(() => false);
  }
  return availability;
}
