// The browser's built-in speech recognition (free; availability and accuracy vary by browser and OS,
// and the audio is sent to the browser vendor's own recognition service - there is no server-side
// speech-to-text here). Mirrors speech.js's shape (available / start / stop) for the "ears" half of
// idea 4 ("talk to the guide"); speech.js remains the "mouth".

const Recognition = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export const voiceInputAvailable = () => Boolean(Recognition);

/**
 * Listens for one spoken question. Calls onResult(text) with the final transcript, onEnd() once
 * listening stops for any reason, and onError(message) if it couldn't listen at all or misheard.
 * Returns a function that stops listening early.
 */
export function listen({ onResult, onEnd, onError }) {
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
