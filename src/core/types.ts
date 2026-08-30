// ============================================================
// KageBunshin MCP — Core Types
// ============================================================

export type CloneTier = 1 | 2 | 3;

export type ClonePhase = "SCAN" | "PLAN" | "DRY_RUN" | "EXECUTE" | "VALIDATE" | "DEPLOY";

export interface ProjectFile {
  path: string;           // relative path from project root
  absPath: string;        // absolute path
  size: number;           // bytes
  lines: number;          // line count
  ext: string;            // file extension
  tier: CloneTier;        // complexity tier (1=simple, 3=complex)
  cluster: number;        // dependency cluster ID
  imports: string[];      // files this file imports
  importedBy: string[];   // files that import this file
}

export interface CloneReport {
  cloneId: string;
  file: string;
  tier: CloneTier;
  issues: Issue[];
  suggestions: Suggestion[];
  confidence: number;     // 0.0 - 1.0
  tokensUsed: number;
  durationMs: number;
}

export interface Issue {
  line?: number;
  type: "bug" | "performance" | "security" | "style" | "dead-code";
  severity: "low" | "medium" | "high" | "critical";
  description: string;
}

export interface Suggestion {
  type: "refactor" | "optimize" | "fix" | "cleanup";
  description: string;
  priority: number;       // 1 (highest) - 5 (lowest)
}

export interface DiffBlock {
  cloneId: string;
  file: string;
  originalContent: string;
  proposedContent: string;
  linesChanged: number[];
  confidence: number;
}

export interface BlameMap {
  [file: string]: {
    cloneId: string;
    linesChanged: number[];
    confidence: number;
  };
}

export interface BuildResult {
  success: boolean;
  output: string;
  errorLines: string[];
  suspectedFiles: string[];   // files blamed for build failure
}

export interface DeployResult {
  gitSuccess: boolean;
  gitOutput: string;
  vercelSuccess: boolean;
  vercelOutput: string;
  vercelUrl?: string;
}

export interface KageBunshinConfig {
  projectRoot: string;
  anthropicApiKey: string;
  model: string;
  maxConcurrentClones: number;
  cloneTokenBudget: number;    // per-clone (per-file) token ceiling to cap runaway API spend
  dryRunApproval: boolean;     // pause for human approval before executing
  skipDeploy: boolean;         // stop after build validation
  gitBranch: string;
  commitMessage: string;
  ignorePatterns: string[];
  tierThresholds: {
    tier1MaxLines: number;     // files below this = tier 1
    tier2MaxLines: number;     // files below this = tier 2, else tier 3
  };
}

export interface KageBunshinResult {
  phase: ClonePhase;
  filesScanned: number;
  filesModified: number;
  totalIssuesFound: number;
  buildResult?: BuildResult;
  deployResult?: DeployResult;
  totalTokensUsed: number;
  totalDurationMs: number;
  blameMap: BlameMap;
}
