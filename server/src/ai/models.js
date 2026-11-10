// Model choices and prices. Technical Design §4a "Models and expected cost".
// Model IDs and prices are config values, not code - kept in one small file
// so they're easy to find and change without touching stage logic.

export const MODELS = {
  analyst: "claude-haiku-5-5",
  referenceProse: "claude-haiku-5-5",
  narrative: "claude-sonnet-5-5",
  claimCheck: "claude-haiku-5-5",
  grouper: "claude-haiku-5-5",
  translator: "claude-haiku-5-5",
  chat: "claude-sonnet-5-5",
  userGuide: "claude-haiku-5-5",
};

// $ per million tokens.
export const PRICES = {
  "claude-haiku-5-5": { input: 0.1, output: 0.5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
};

export const MAX_OUTPUT_TOKENS = {
  analyst: 2000,
  architect: 6000,
  writer: 4000,
  claimCheck: 1500,
  grouper: 2500,
  tour: 2500,
  translator: 4000,
  chat: 1500,
  explorer: 3000,
  userGuide: 2000,
};

export function estimateCostUsd(model, inputTokens, outputTokens) {
  const price = PRICES[model];
  if (!price) throw new Error(`No price configured for model ${model}`);
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}
