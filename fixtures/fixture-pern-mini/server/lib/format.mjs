/**
 * Formats a habit frequency for display.
 * @param {string} frequency
 * @returns {string}
 */
export function formatFrequency(frequency) {
  return frequency.charAt(0).toUpperCase() + frequency.slice(1);
}

export const DEFAULT_FREQUENCY = "daily";

export default function formatHabitTitle(title) {
  return title.trim();
}
