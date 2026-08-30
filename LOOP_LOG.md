# KageBunshin Heartbeat Loop Log

## Tick 20260829T204639
Task: Bootstrap jest+ts-jest test harness and add dependency-graph.ts unit tests (incl. 3-file circular-import cycle)
Branch: auto/tick-20260829T204639
Result: DONE
Build: PASS
Notes: package.json already declared "test":"jest" with jest+ts-jest devDeps, but the harness was never wired up (no jest config, no tests dir) — so it had zero coverage. Added jest.config.js (ts-jest, isolatedModules) and tests/dependency-graph.test.ts (6 tests, all passing: JEST_EXIT=0, BUILD_EXIT=0). This directly covers backlog #1 (union-find cluster assignment does NOT deadlock on a 3-file cycle and correctly merges it into one cluster) and #6 (basic unit tests for dependency-graph.ts). Discovered gap, NOT fixed this tick (separate task): dependency-graph.ts IMPORT_PATTERNS does not extract bare side-effect imports `import "./x";`, so those edges are dropped from the graph and could mis-cluster real code — candidate for a future tick (extend IMPORT_PATTERNS + add a regression test).

## Tick 20260830T094304
Task: Add TokenBudget module + unit tests (Tick #2-A: first half of backlog #2 per-clone token/cost budget cap)
Branch: auto/tick-20260830T094304
Result: DONE
Build: PASS
Tests: PASS (12 total: 6 dependency-graph + 6 token-budget)
Notes: Created src/core/token-budget.ts (TokenBudget class + estimateInputTokens helper, pure/testable, no Anthropic dep) and tests/token-budget.test.ts (6 tests: starts-at-0, canAfford within limit, spend accumulates, clamp-negative + exhaustion, boundary-inclusive). Branched from auto/tick-20260829T204639 so the jest harness carried forward. Next: Tick #2-B — wire cloneTokenBudget through types.ts -> clone.ts (scan/dryRun/execute guards + spend) -> orchestrator.ts (one budget per file across phases) -> index.ts (DEFAULT_CONFIG + RunSchema). Do NOT reuse the incoherent work parked in stash@{0} (it imports nonexistent clone.ts exports).
