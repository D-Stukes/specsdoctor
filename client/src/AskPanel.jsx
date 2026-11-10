import { useEffect, useMemo, useRef, useState } from "react";
import { endpointChoices, nodeTitle } from "./map-model.js";
import { speak, cancelSpeech, speechAvailable } from "./speech.js";
import { listen, voiceInputAvailable } from "./voice-input.js";

/** Plain words to speak aloud: strips the Markdown marks RichText renders, so the guide doesn't read out "star star" or backticks. */
function speakable(text) {
  return text.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/^\s*[-•*]\s+/gm, "").replace(/^\s*\d+[.)]\s+/gm, "");
}

async function ask(runId, question, history) {
  const res = await fetch(`/api/runs/${runId}/ask`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question, history }) });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) window.dispatchEvent(new Event("docsync:signed-out"));
  if (!res.ok) throw new Error(body?.error?.message ?? "The assistant could not answer right now.");
  return body;
}

/** Just enough Markdown for an answer: paragraphs, numbered and bulleted lists, **bold** and `code`. Built as React elements, never as HTML. */
function inline(text, keyBase) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean).map((part, i) => {
    if (part.startsWith("**")) return <strong key={`${keyBase}-${i}`}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`")) return <code key={`${keyBase}-${i}`} className="ask-code">{part.slice(1, -1)}</code>;
    return part;
  });
}
export function RichText({ text }) {
  const blocks = [];
  let list = null;
  text.split("\n").forEach((raw, i) => {
    const line = raw.trimEnd();
    const num = /^\s*(\d+)[.)]\s+(.*)$/.exec(line);
    const bullet = /^\s*[-•*]\s+(.*)$/.exec(line);
    if (num || bullet) {
      const ordered = Boolean(num);
      if (!list || list.ordered !== ordered) {
        list = { ordered, items: [] };
        blocks.push(list);
      }
      list.items.push((num ?? bullet)[ordered ? 2 : 1]);
    } else {
      list = null;
      if (line.trim()) blocks.push({ p: line });
    }
  });
  return blocks.map((b, i) =>
    b.p !== undefined ? (
      <p key={i}>{inline(b.p, i)}</p>
    ) : b.ordered ? (
      <ol key={i}>{b.items.map((t, j) => <li key={j}>{inline(t, `${i}-${j}`)}</li>)}</ol>
    ) : (
      <ul key={i}>{b.items.map((t, j) => <li key={j}>{inline(t, `${i}-${j}`)}</li>)}</ul>
    )
  );
}

export default function AskPanel({ runId, graph, plain, onClose, onSelectSource, onOpenPage }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const voiceSupported = useMemo(speechAvailable, []);
  const micSupported = useMemo(voiceInputAvailable, []);
  const [voiceOn, setVoiceOn] = useState(voiceSupported);
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState(null);
  const endRef = useRef(null);
  const stopListenRef = useRef(null);
  const lastAnnounced = useRef(-1);

  const suggestions = useMemo(() => {
    const first = endpointChoices(graph)[0];
    return [
      "What does this app do, in simple words?",
      "What should I read first?",
      first ? `What happens when someone does "${nodeTitle(first, plain)}"?` : "What are the main parts?",
      "Where does the app keep its data?",
    ];
  }, [graph, plain]);

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" });
  }, [messages, busy]);

  // The guide speaks the newest answer aloud and flies the map to its first source - idea 4,
  // "talk to the guide" (LOG.md). Both ride the same Voice toggle, so a reader who turns it off
  // gets the plain chat panel back with no camera jumps.
  useEffect(() => {
    const i = messages.length - 1;
    if (i < 0 || i === lastAnnounced.current) return;
    const m = messages[i];
    if (m.role !== "assistant") return;
    lastAnnounced.current = i;
    if (!voiceOn) return;
    if (!m.error && m.sources?.length > 0) onSelectSource(m.sources[0].id);
    if (voiceSupported && !m.error && m.content) speak(speakable(m.content), { rate: 1 });
  }, [messages, voiceOn, voiceSupported, onSelectSource]);

  useEffect(
    () => () => {
      stopListenRef.current?.();
      cancelSpeech();
    },
    []
  );

  function toggleMic() {
    if (listening) {
      stopListenRef.current?.();
      setListening(false);
      return;
    }
    setMicError(null);
    cancelSpeech();
    setListening(true);
    // Dictation, not auto-submit: the box fills in live as the guide listens (interim results,
    // where the browser's own speech API supports them) or once transcription finishes
    // (VoiceStudio), and the user reviews and sends it themselves - same as typing.
    stopListenRef.current = listen({
      onInterim: (text) => setInput(text),
      onResult: (text) => setInput(text),
      onEnd: () => setListening(false),
      onError: (message) => {
        setMicError(message);
        setListening(false);
      },
    });
  }

  async function send(text) {
    const question = text.trim();
    if (!question || busy) return;
    const history = messages.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { role: "user", content: question }]);
    setInput("");
    setBusy(true);
    try {
      const r = await ask(runId, question, history);
      setMessages((m) => [...m, { role: "assistant", content: r.answer, sources: r.sources, warnings: r.warnings, mode: r.mode }]);
    } catch (err) {
      setMessages((m) => [...m, { role: "assistant", content: err.message, error: true }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="ask" aria-label="Ask this repo">
      <div className="ask-head">
        <h2>Ask this repo</h2>
        {voiceSupported && (
          <label className="map-check ask-voice-check" title="Speak answers aloud and fly the map to their first source">
            <input type="checkbox" checked={voiceOn} onChange={(e) => { setVoiceOn(e.target.checked); if (!e.target.checked) cancelSpeech(); }} /> Voice
          </label>
        )}
        <button type="button" onClick={onClose} aria-label="Close the assistant">
          ✕
        </button>
      </div>
      <p className="ask-note">Answers come from what the code parser found and the saved pages, with the sources shown. It can't see the source files or run the app.</p>

      <div className="ask-log" aria-live="polite">
        {messages.length === 0 && (
          <div className="ask-suggest">
            {suggestions.map((s) => (
              <button key={s} type="button" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`ask-msg ask-${m.role} ${m.error ? "ask-error" : ""}`}>
            {m.role === "user" ? <p>{m.content}</p> : m.error ? <p>{m.content}</p> : <RichText text={m.content} />}
            {m.mode === "stub" && <p className="ask-small">AI answers are off in this setup; these are the closest matches.</p>}
            {m.warnings?.length > 0 && <p className="ask-warn">Names in this answer that are not in the code facts: {m.warnings.join(", ")}. Treat them with care.</p>}
            {m.role === "assistant" && !m.error && m.mode === "model" && m.sources?.length === 0 && <p className="ask-warn">No source was cited for this answer.</p>}
            {m.sources?.length > 0 && (
              <div className="ask-sources">
                <span className="ask-small">Sources:</span>
                {m.sources.map((s) => (
                  <button key={s.id} type="button" className="ask-source" title={s.where ?? ""} onClick={() => (s.kind === "page" ? onOpenPage(s.id.slice(5)) : onSelectSource(s.id))}>
                    {s.label}
                    {s.where && <span className="ask-where">{s.where}</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && <p className="ask-small">Looking it up…</p>}
        <div ref={endRef} />
      </div>

      <form
        className="ask-form"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <label className="ask-label" htmlFor="ask-input">
          Your question
        </label>
        <textarea id="ask-input" value={input} maxLength={500} rows={2} placeholder={listening ? "Listening…" : "Ask anything about how this app works"} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }} />
        <div className="ask-form-buttons">
          {micSupported && (
            <button type="button" className={`ask-mic ${listening ? "ask-mic-active" : ""}`} onClick={toggleMic} disabled={busy} aria-pressed={listening} aria-label={listening ? "Stop listening" : "Speak your question"} title={listening ? "Stop listening" : "Speak your question"}>
              {listening ? "● Listening" : "🎤"}
            </button>
          )}
          <button type="submit" className="btn-primary" style={{ width: "auto" }} disabled={busy || !input.trim()}>
            Ask
          </button>
        </div>
        {micError && <p className="ask-warn">{micError}</p>}
      </form>
    </aside>
  );
}
