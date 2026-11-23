// Vercel entry point: the whole Express API runs as one Vercel Function.
// The React client is served as static files from client/dist (see vercel.json).
import { createApp } from "../server/src/index.js";

export default createApp();
