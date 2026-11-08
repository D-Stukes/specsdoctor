import express from "express";

// Proxies the browser to a local, self-hosted VoiceStudio server (github.com/debpalash/
// voicestudio), running on the same machine as this dev server. The browser can't call
// VoiceStudio directly - it doesn't send CORS headers for an arbitrary page's origin - so this
// mediates exactly the way the server already mediates every other third-party call. Loopback
// only (SS4e has nothing to say here: no repository data passes through this router, and no key
// is sent - VoiceStudio needs none for a loopback client). Local-only by design: a deployed
// DocSync instance has no VoiceStudio of its own to reach, so these routes simply fail closed
// (502/503) and the client falls back to the browser's own speech APIs.

export const voiceRouter = express.Router();

const VOICESTUDIO_BASE = process.env.VOICESTUDIO_URL || "http://127.0.0.1:3900";
const CHECK_TIMEOUT_MS = 1500;
const SPEECH_TIMEOUT_MS = 15000;
const TRANSCRIBE_TIMEOUT_MS = 20000;

voiceRouter.get("/voice/capabilities", async (req, res) => {
  try {
    const upstream = await fetch(`${VOICESTUDIO_BASE}/.well-known/voicestudio-speech`, { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
    if (!upstream.ok) throw new Error(`capabilities ${upstream.status}`);
    res.json(await upstream.json());
  } catch {
    res.status(503).json({ available: false });
  }
});

voiceRouter.post("/voice/speech", async (req, res) => {
  try {
    const upstream = await fetch(`${VOICESTUDIO_BASE}/v1/audio/speech`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req.body ?? {}),
      signal: AbortSignal.timeout(SPEECH_TIMEOUT_MS),
    });
    if (!upstream.ok) return res.status(502).json({ error: { code: "voicestudio_speech_failed", message: "VoiceStudio could not generate speech." } });
    res.set("content-type", upstream.headers.get("content-type") ?? "audio/mpeg");
    res.send(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    res.status(502).json({ error: { code: "voicestudio_unreachable", message: "Could not reach the local voice service." } });
  }
});

voiceRouter.post("/voice/transcriptions", async (req, res) => {
  try {
    const upstream = await fetch(`${VOICESTUDIO_BASE}/v1/audio/transcriptions`, {
      method: "POST",
      headers: { "content-type": req.headers["content-type"] },
      body: req,
      duplex: "half",
      signal: AbortSignal.timeout(TRANSCRIBE_TIMEOUT_MS),
    });
    if (!upstream.ok) return res.status(502).json({ error: { code: "voicestudio_transcription_failed", message: "VoiceStudio could not transcribe that." } });
    res.json(await upstream.json());
  } catch {
    res.status(502).json({ error: { code: "voicestudio_unreachable", message: "Could not reach the local voice service." } });
  }
});
