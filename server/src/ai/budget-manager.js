// Budget enforcement (not just reporting). Technical Design §4a.
// One instance per run, held for the run's lifetime by the runner.

const PROTECTED_RESERVE_FRACTION = 0.35; // reserved for Writer + Verifier only

export class BudgetExceededError extends Error {
  constructor(message) {
    super(message);
    this.name = "BudgetExceededError";
  }
}

export class BudgetManager {
  constructor(capUsd) {
    this.capUsd = capUsd;
    this.spentUsd = 0;
    this.reservations = new Map(); // id -> { usd, stage }
    this.nextId = 1;
  }

  get reservedUsd() {
    let total = 0;
    for (const r of this.reservations.values()) total += r.usd;
    return total;
  }

  get protectedReserveUsd() {
    return this.capUsd * PROTECTED_RESERVE_FRACTION;
  }

  /**
   * Reserves the worst case for one model call. `stage` is "writer" or
   * "verifier" to draw from the protected reserve, or any other stage name
   * (analyst, architect, claim_check) to draw only from the unprotected
   * portion. Throws BudgetExceededError if there's no room; the caller is
   * expected to fall back to a deterministic path, not retry.
   */
  reserve(stage, estimatedInputTokens, maxOutputTokens, model, prices) {
    const worstCaseUsd = (estimatedInputTokens * prices.input + maxOutputTokens * prices.output) / 1_000_000;
    const isProtected = stage === "writer" || stage === "verifier";
    const available = isProtected ? this.capUsd - this.spentUsd - this.reservedUsd : this.capUsd - this.spentUsd - this.reservedUsd - this.protectedReserveUsd;

    if (worstCaseUsd > available) {
      throw new BudgetExceededError(`${stage}: cannot reserve $${worstCaseUsd.toFixed(4)}, only $${available.toFixed(4)} available`);
    }

    const id = this.nextId++;
    this.reservations.set(id, { usd: worstCaseUsd, stage });
    return id;
  }

  /** Replaces a reservation with the call's actual cost (from response usage). */
  commit(reservationId, actualUsd) {
    this.reservations.delete(reservationId);
    this.spentUsd += actualUsd;
  }

  /** Releases a reservation without spending anything (the call failed before billing). */
  release(reservationId) {
    this.reservations.delete(reservationId);
  }
}
