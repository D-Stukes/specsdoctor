// The guide's voice: a local, self-hosted VoiceStudio server first (better quality; see
// voicestudio-client.js), falling back to the browser's built-in speech synthesis when
// VoiceStudio isn't running - free, built in, but voice quality varies by browser and OS.

import { VOICESTUDIO_BASE, voiceStudioAvailable } from "./voicestudio-client.js";

export const speechAvailable = () => typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";

let currentCancel = null; // the active speak() call's own cleanup, whichever backend it's using

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

/** Speaks text; calls onEnd when finished or if speech fails. Returns a function that cancels it. */
export function speak(text, { rate = 1, onEnd }) {
  cancelSpeech();
  let cancelled = false;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    onEnd?.();
  };

  (async () => {
    const useVoiceStudio = await voiceStudioAvailable();
    if (cancelled) return;
    if (!useVoiceStudio) {
      currentCancel = speakViaBrowser(text, rate, finish);
      return;
    }
    try {
      const res = await fetch(`${VOICESTUDIO_BASE}/speech`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: text, voice: "default", response_format: "mp3" }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`VoiceStudio TTS ${res.status}`);
      const blob = await res.blob();
      if (cancelled) return;
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
        if (!cancelled) currentCancel = speakViaBrowser(text, rate, finish);
      };
      currentCancel = () => {
        audio.pause();
        cleanup();
      };
      await audio.play();
    } catch {
      if (!cancelled) currentCancel = speakViaBrowser(text, rate, finish);
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
