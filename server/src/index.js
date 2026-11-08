import { fileURLToPath } from "node:url";
import path from "node:path";
import { existsSync } from "node:fs";
import express from "express";
import cookieParser from "cookie-parser";
import { sessionRouter } from "./routes/session.js";
import { healthRouter } from "./routes/health.js";
import { runsRouter } from "./routes/runs.js";
import { findingsRouter } from "./routes/findings.js";
import { requireSession } from "./auth.js";
import { recoverInterruptedRuns, tryStartNext } from "./runner/queue.js";
import { startRetentionJob } from "./runner/retention.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  // No auth required: SS4d.
  app.use("/api", healthRouter);
  app.use("/api", sessionRouter);

  // Every other /api route needs the session cookie (SEC-8).
  app.use("/api", requireSession, runsRouter);
  app.use("/api", requireSession, findingsRouter);

  const clientDist = path.join(__dirname, "..", "..", "client", "dist");
  if (existsSync(clientDist)) {
    app.use(express.static(clientDist));
    app.get(/^\/(?!api).*/, (req, res) => {
      res.sendFile(path.join(clientDist, "index.html"));
    });
  }

  return app;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = process.env.PORT || 4000;
  // §4a restart recovery: any run stuck 'running' from before this boot
  // can't be resumed - mark it failed, then let the queue pick up whatever
  // was still 'queued'.
  recoverInterruptedRuns()
    .then((recovered) => {
      if (recovered.length > 0) console.log(`Recovered ${recovered.length} interrupted run(s): ${recovered.join(", ")}`);
      return tryStartNext();
    })
    .catch((err) => console.error("startup recovery failed:", err));

  createApp().listen(port, () => {
    console.log(`DocSync server listening on ${port}`);
    startRetentionJob();
  });
}
