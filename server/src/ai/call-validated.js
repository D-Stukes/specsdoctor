import { callStructured } from "./client.js";

/**
 * §4a "malformed model output: one retry, then failure". Structured outputs
 * usually return schema-valid JSON, but a real run produced an overview page
 * that broke the page/1 contract (1 of 6). Calls again once when `validate`
 * rejects the first answer; each attempt reserves and records its own cost.
 * The caller still validates the returned value, so a second bad answer
 * becomes the usual stage failure.
 */
export async function callValidated(options, validate, call = callStructured) {
  const first = await call(options);
  if (options.stub || validate(first.parsed)) return first;
  const second = await call(options);
  return { ...second, costUsd: first.costUsd + second.costUsd };
}
