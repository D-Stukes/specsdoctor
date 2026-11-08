// The guide's ears: a local, self-hosted VoiceStudio server first (push-to-talk - click the mic to
// start, click again to stop and transcribe what you said), falling back to the browser's built-in
// speech recognition when VoiceStudio isn't running (free, built in, but the audio goes to the
// browser vendor's own recognition service - no such round trip when VoiceStudio is used).

import { VOICESTUDIO_BASE, voiceStudioAvailable } from "./voicestudio-client.js";

const Recognition = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export const voiceInputAvailable = () => Boolean(navigator.mediaDevices?.getUserMedia) || Boolean(Recognition);

function listenViaBrowser({ onResult, onEnd, onError }) {
  if (!Recognition) {
    onError?.("This browser can't listen for speech. Type your question instead.");
    return () => {};
  }
  const recognizer = new Recognition();
  recognizer.lang = "en-US";
  recognizer.interimResults = false;
  recognizer.maxAlternatives = 1;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    onEnd?.();
  };
  recognizer.onresult = (e) => {
    const text = e.results?.[0]?.[0]?.transcript ?? "";
    if (text.trim()) onResult?.(text.trim());
  };
  recognizer.onerror = (e) => {
    if (done) return; // a deliberate stop() fires onerror too; onend's `done` guard already covers it
    onError?.(e.error === "not-allowed" || e.error === "service-not-allowed" ? "Microphone access was blocked." : "Didn't catch that. Try again, or type it.");
  };
  recognizer.onend = finish;
  try {
    recognizer.start();
  } catch {
    finish();
  }
  return () => {
    done = true;
    try {
      recognizer.stop();
    } catch {
      // already stopped
    }
  };
}

/** Records until stopped, then sends the clip to VoiceStudio's transcription endpoint. */
function listenViaVoiceStudio({ onResult, onEnd, onError }) {
  let recorder = null;
  let stream = null;
  let cancelled = false;

  navigator.mediaDevices
    .getUserMedia({ audio: true })
    .then((s) => {
      if (cancelled) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = s;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "";
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (cancelled) {
          onEnd?.();
          return;
        }
        try {
          const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
          const form = new FormData();
          form.append("file", blob, "question.webm");
          form.append("model", "whisper-1");
          const res = await fetch(`${VOICESTUDIO_BASE}/transcriptions`, { method: "POST", body: form, signal: AbortSignal.timeout(20000) });
          if (!res.ok) throw new Error(`VoiceStudio transcription ${res.status}`);
          const { text } = await res.json();
          if (text?.trim()) onResult?.(text.trim());
          else onError?.("Didn't catch that. Try again, or type it.");
        } catch {
          onError?.("Could not reach the local voice service. Try again, or type it.");
        } finally {
          onEnd?.();
        }
      };
      recorder.start();
    })
    .catch(() => {
      if (!cancelled) {
        onError?.("Microphone access was blocked.");
        onEnd?.();
      }
    });

  return () => {
    if (recorder && recorder.state !== "inactive") {
      recorder.stop(); // triggers onstop above, which transcribes and sends
    } else {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
    }
  };
}

/**
 * Listens for one spoken question. Calls onResult(text) with the final transcript, onEnd() once
 * listening stops for any reason, and onError(message) if it couldn't listen at all or misheard.
 * Returns a function that stops listening early (VoiceStudio: stops recording and transcribes
 * what was said so far; browser: aborts without a result).
 */
export function listen({ onResult, onEnd, onError }) {
  if (!navigator.mediaDevices?.getUserMedia) return listenViaBrowser({ onResult, onEnd, onError });

  let cancelled = false;
  let inner = null;
  voiceStudioAvailable().then((available) => {
    if (cancelled) {
      onEnd?.();
      return;
    }
    inner = available ? listenViaVoiceStudio({ onResult, onEnd, onError }) : listenViaBrowser({ onResult, onEnd, onError });
  });

  return () => {
    if (inner) inner();
    else cancelled = true; // stopped before the availability check resolved: nothing started yet
  };
}
