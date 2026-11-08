// The browser's built-in speech synthesis (free; voice quality varies by browser and OS).

export const speechAvailable = () => typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";

let current = null; // keep a reference: some browsers drop an utterance that gets garbage-collected mid-speech

/** Speaks text; calls onEnd when finished or if speech fails. Returns a function that cancels it. */
export function speak(text, { rate = 1, onEnd }) {
  cancelSpeech();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = rate;
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    onEnd?.();
  };
  utterance.onend = finish;
  utterance.onerror = finish;
  current = utterance;
  window.speechSynthesis.speak(utterance);
  return () => {
    done = true;
    cancelSpeech();
  };
}

export function cancelSpeech() {
  if (speechAvailable()) window.speechSynthesis.cancel();
  current = null;
}
