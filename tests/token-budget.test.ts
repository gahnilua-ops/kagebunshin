import { TokenBudget, estimateInputTokens } from "../src/core/token-budget";

describe("estimateInputTokens", () => {
  it("returns 0 for empty input", () => {
    expect(estimateInputTokens("")).toBe(0);
  });

  it("estimates ~4 chars per token, rounded up", () => {
    expect(estimateInputTokens("abcd")).toBe(1); // 4/4 = 1
    expect(estimateInputTokens("abcde")).toBe(2); // 5/4 = 1.25 -> ceil 2
    expect(estimateInputTokens("a")).toBe(1); // ceil(0.25) = 1
  });
});

describe("TokenBudget", () => {
  it("starts with zero usage and reports the full limit as remaining", () => {
    const b = new TokenBudget(1000);
    expect(b.used).toBe(0);
    expect(b.limit).toBe(1000);
    expect(b.remaining()).toBe(1000);
    expect(b.exhausted()).toBe(false);
  });

  it("affords a call within the limit and accumulates spend", () => {
    const b = new TokenBudget(1000);
    expect(b.canAfford(600)).toBe(true);
    b.spend(600);
    expect(b.used).toBe(600);
    expect(b.remaining()).toBe(400);
    expect(b.canAfford(400)).toBe(true);
    expect(b.canAfford(401)).toBe(false);
  });

  it("clamps negative spend and reports exhaustion at the limit", () => {
    const b = new TokenBudget(100);
    b.spend(100);
    expect(b.exhausted()).toBe(true);
    b.spend(-50); // must not go negative
    expect(b.used).toBe(100);
    expect(b.canAfford(1)).toBe(false);
    expect(b.remaining()).toBe(0);
  });

  it("blocks a call whose estimate would breach the cap", () => {
    const b = new TokenBudget(50);
    b.spend(40);
    // used(40) + estimate(11) = 51 > 50 -> not affordable
    expect(b.canAfford(11)).toBe(false);
    // used(40) + estimate(10) = 50 <= 50 -> affordable (boundary inclusive)
    expect(b.canAfford(10)).toBe(true);
  });
});
