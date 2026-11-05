// Resolved via the bare directory import "./lib" (index.js/.mjs resolution).
export * from "./format.mjs";
export { DEFAULT_FREQUENCY as fallbackFrequency } from "./format.mjs";

// Anonymous default export: the Scanner records this item's name as "default".
export default function (title) {
  return title.toLowerCase();
}
