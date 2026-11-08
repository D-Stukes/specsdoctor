// The guide's voice: a local, self-hosted VoiceStudio server first (better quality; see
// voicestudio-client.js), falling back to the browser's built-in speech synthesis when
// VoiceStudio isn't running - free, built in, but voice quality varies by browser and OS.

import { VOICESTUDIO_BASE, voiceStudioAvailable } from "./voicestudio-client.js";

// A chosen voice profile. Measured against this engine (VoiceStudio's default, OmniVoice, on
// this machine's Apple Silicon/MPS path): a realistic one-line narration takes ~16-17s even
// warm, cloned voice or not - the engine itself is slow for longer text here, not the voice.
// prefetch() hides as much of that as the previous line's own playback time covers; speak()'s
// onStart callback tells the caller when it couldn't hide all of it, so the UI can show the wait
// as the guide composing rather than silence.
const VOICE = "brit butler";
const SPEECH_TIMEOUT_MS = 30000; // observed up to ~17.5s for a two-sentence line; leave real headroom

export const speechAvailable = () => typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";

let currentCancel = null; // the active speak() call's own cleanup, whichever backend it's using

// text -> Promise<Blob|null>, for lines fetched ahead of when they're actually spoken.
// Small and short-lived by construction (callers prefetch one line ahead, then consume it), but
// capped as a safety net against a caller that prefetches without ever consuming.
const prefetchCache = new Map();
const MAX_PREFETCH_ENTRIES = 5;

async function fetchSpeechBlob(text) {
  const res = await fetch(`${VOICESTUDIO_BASE}/speech`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input: text, voice: VOICE, response_format: "mp3" }),
    signal: AbortSignal.timeout(SPEECH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`VoiceStudio TTS ${res.status}`);
  return res.blob();
}

/** Starts synthesizing a line before it's needed, so speak() can skip straight to playback when it's actually called. Safe to call for a line that never gets spoken - it just goes unused. */
export function prefetch(text) {
  if (!text || prefetchCache.has(text)) return;
  if (prefetchCache.size >= MAX_PREFETCH_ENTRIES) prefetchCache.delete(prefetchCache.keys().next().value);
  const promise = voiceStudioAvailable()
    .then((ok) => (ok ? fetchSpeechBlob(text) : null))
    .catch(() => null);
  prefetchCache.set(text, promise);
}

function speakViaBrowser(text, rate, finish) {
  if (!speechAvailable()) {
    finish();
    return () => {};
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = rate;
  utterance.onend = finish;
  utterance.onerror = finish;
  window.speechSynthesis.speak(utterance);
  return () => window.speechSynthesis.cancel();
}

function playBlob(blob, rate, finish, onFailed) {
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.playbackRate = rate;
  const cleanup = () => URL.revokeObjectURL(url);
  audio.onended = () => {
    cleanup();
    finish();
  };
  audio.onerror = () => {
    cleanup();
    onFailed();
  };
  audio.play();
  return () => {
    audio.pause();
    cleanup();
  };
}

/**
 * Speaks text. onStart fires right when audio actually begins (immediately for the browser
 * fallback or a prefetch hit; after however long synthesis took otherwise) - callers use the gap
 * between calling speak() and onStart firing to show the wait as the guide composing, not
 * silence. onEnd fires when finished or if speech fails. Returns a function that cancels it.
 */
export function speak(text, { rate = 1, onStart, onEnd }) {
  cancelSpeech();
  let cancelled = false;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    onEnd?.();
  };
  const fallback = () => {
    if (cancelled) return;
    onStart?.();
    currentCancel = speakViaBrowser(text, rate, finish);
  };

  (async () => {
    if (prefetchCache.has(text)) {
      const pending = prefetchCache.get(text);
      prefetchCache.delete(text);
      const blob = await pending;
      if (cancelled) return;
      if (blob) {
        onStart?.();
        currentCancel = playBlob(blob, rate, finish, fallback);
        return;
      }
      // prefetch failed (VoiceStudio unavailable or errored) - fall through to the normal path below
    }

    const useVoiceStudio = await voiceStudioAvailable();
    if (cancelled) return;
    if (!useVoiceStudio) return fallback();
    try {
      const blob = await fetchSpeechBlob(text);
      if (cancelled) return;
      onStart?.();
      currentCancel = playBlob(blob, rate, finish, fallback);
    } catch {
      fallback();
    }
  })();

  return () => {
    cancelled = true;
    done = true;
    currentCancel?.();
    currentCancel = null;
  };
}

export function cancelSpeech() {
  currentCancel?.();
  currentCancel = null;
  if (speechAvailable()) window.speechSynthesis.cancel();
}
