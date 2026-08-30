// ============================================================
// KageBunshin MCP — Token Budget
// Per-clone (per-file) token cap so one runaway file analysis
// can't blow the whole tick's API spend across scan / dry-run /
// execute phases.
// ============================================================

// Rough heuristic: ~4 characters per token for typical source code.
// Used only for a pre-call guard against the cap, not for billing.
export function estimateInputTokens(content: string): number {
  if (!content) return 0;
  return Math.ceil(content.length / 4);
}

export class TokenBudget {
  used = 0;

  constructor(public readonly limit: number) {}

  remaining(): number {
    return Math.max(0, this.limit - this.used);
  }

  exhausted(): boolean {
    return this.used >= this.limit;
  }

  // Can we afford a call expected to consume ~`estimate` more tokens
  // without breaching the cap?
  canAfford(estimate: number): boolean {
    return this.used + estimate <= this.limit;
  }

  // Record tokens actually consumed by a completed API call.
  spend(amount: number): void {
    if (amount > 0) this.used += amount;
  }
}
