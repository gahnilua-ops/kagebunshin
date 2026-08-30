// ============================================================
// KageBunshin MCP — The Clone
// One Claude instance per file — scan, report, or execute
// ============================================================

import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as crypto from "crypto";
import {
  ProjectFile,
  CloneReport,
  DiffBlock,
  KageBunshinConfig,
  Issue,
  Suggestion,
} from "../core/types";
import { TokenBudget, estimateInputTokens } from "../core/token-budget";

const client = new Anthropic();

// Per-phase response token ceilings - mirror the max_tokens sent to the API,
// used to estimate whether a call would breach the per-clone token budget.
const SCAN_MAX_OUTPUT = 1024;
const DRYRUN_MAX_OUTPUT = 4096;
const EXECUTE_MAX_OUTPUT = 4096;

// ── PHASE 1: SCAN ─────────────────────────────────────────
export async function cloneScan(
  file: ProjectFile,
  config: KageBunshinConfig,
  budget: TokenBudget
): Promise<CloneReport> {
  const cloneId = makeCloneId(file.path);
  const start = Date.now();

  const content = tryRead(file.absPath);
  if (!content) {
    return emptyReport(cloneId, file, start);
  }

  const scanEstimate = estimateInputTokens(content) + SCAN_MAX_OUTPUT;
  if (!budget.canAfford(scanEstimate)) {
    console.warn(`[Clone ${cloneId}] Token budget exhausted (${budget.used}/${budget.limit}) - skipping scan for ${file.path}`);
    return emptyReport(cloneId, file, start);
  }

  const prompt = buildScanPrompt(file, content);

  try {
    const response = await client.messages.create({
      model: config.model,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const text = extractText(response);
    const parsed = parseScanResponse(text);
    budget.spend(response.usage.input_tokens + response.usage.output_tokens);

    return {
      cloneId,
      file: file.path,
      tier: file.tier,
      issues: parsed.issues,
      suggestions: parsed.suggestions,
      confidence: parsed.confidence,
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      durationMs: Date.now() - start,
    };
  } catch (err) {
    console.error(`[Clone ${cloneId}] Scan failed for ${file.path}:`, err);
    return emptyReport(cloneId, file, start);
  }
}

// ── PHASE 2: DRY RUN ──────────────────────────────────────
export async function cloneDryRun(
  file: ProjectFile,
  report: CloneReport,
  config: KageBunshinConfig,
  budget: TokenBudget
): Promise<DiffBlock | null> {
  const content = tryRead(file.absPath);
  if (!content) return null;

  const dryRunEstimate = estimateInputTokens(content) + DRYRUN_MAX_OUTPUT;
  if (!budget.canAfford(dryRunEstimate)) {
    console.warn(`[Clone ${report.cloneId}] Token budget exhausted (${budget.used}/${budget.limit}) - skipping dry run for ${file.path}`);
    return null;
  }

  const prompt = buildExecutePrompt(file, content, report, true);

  try {
    const response = await client.messages.create({
      model: config.model,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const text = extractText(response);
    const proposed = extractCodeBlock(text);

    if (!proposed || proposed.trim() === content.trim()) return null;

    budget.spend(response.usage.input_tokens + response.usage.output_tokens);

    return {
      cloneId: report.cloneId,
      file: file.path,
      originalContent: content,
      proposedContent: proposed,
      linesChanged: diffLines(content, proposed),
      confidence: report.confidence,
    };
  } catch (err) {
    console.error(`[Clone ${report.cloneId}] Dry run failed:`, err);
    return null;
  }
}

// ── PHASE 3: EXECUTE ──────────────────────────────────────
export async function cloneExecute(
  file: ProjectFile,
  report: CloneReport,
  config: KageBunshinConfig,
  budget: TokenBudget
): Promise<{ success: boolean; linesChanged: number[] }> {
  const content = tryRead(file.absPath);
  if (!content) return { success: false, linesChanged: [] };

  const execEstimate = estimateInputTokens(content) + EXECUTE_MAX_OUTPUT;
  if (!budget.canAfford(execEstimate)) {
    console.warn(`[Clone ${report.cloneId}] Token budget exhausted (${budget.used}/${budget.limit}) - skipping execute for ${file.path}`);
    return { success: false, linesChanged: [] };
  }

  const prompt = buildExecutePrompt(file, content, report, false);

  try {
    const response = await client.messages.create({
      model: config.model,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const text = extractText(response);
    const newContent = extractCodeBlock(text);

    if (!newContent || newContent.trim() === content.trim()) {
      return { success: true, linesChanged: [] };
    }

    // Backup original
    fs.writeFileSync(`${file.absPath}.bak`, content, "utf-8");

    // Write improved version
    fs.writeFileSync(file.absPath, newContent, "utf-8");

    budget.spend(response.usage.input_tokens + response.usage.output_tokens);

    const changed = diffLines(content, newContent);
    return { success: true, linesChanged: changed };
  } catch (err) {
    console.error(`[Clone ${report.cloneId}] Execute failed:`, err);
    return { success: false, linesChanged: [] };
  }
}

// ── PROMPTS ───────────────────────────────────────────────

function buildScanPrompt(file: ProjectFile, content: string): string {
  return `You are a code analysis agent assigned to review ONE file.

FILE: ${file.path}
IMPORTS: ${file.imports.join(", ") || "none"}
IMPORTED BY: ${file.importedBy.join(", ") || "none"}

CONTENT:
\`\`\`${file.ext.replace(".", "")}
${content}
\`\`\`

Analyze this file and respond ONLY with valid JSON in this exact format:
{
  "issues": [
    {
      "line": 42,
      "type": "bug|performance|security|style|dead-code",
      "severity": "low|medium|high|critical",
      "description": "..."
    }
  ],
  "suggestions": [
    {
      "type": "refactor|optimize|fix|cleanup",
      "description": "...",
      "priority": 1
    }
  ],
  "confidence": 0.85
}

Rules:
- confidence is your certainty that improvements are needed (0.0-1.0)
- Only report real issues, not nitpicks
- Priority 1 = most important
- No preamble, no markdown, just the JSON object`;
}

function buildExecutePrompt(
  file: ProjectFile,
  content: string,
  report: CloneReport,
  dryRun: boolean
): string {
  const issueList = report.issues
    .map((i) => `- [${i.severity}] Line ${i.line ?? "?"}: ${i.description}`)
    .join("\n");

  const suggList = report.suggestions
    .sort((a, b) => a.priority - b.priority)
    .map((s) => `- [${s.type}] ${s.description}`)
    .join("\n");

  return `You are a code improvement agent. ${dryRun ? "PROPOSE" : "APPLY"} improvements to this file.

FILE: ${file.path}
IMPORTS: ${file.imports.join(", ") || "none"}

KNOWN ISSUES:
${issueList || "none"}

SUGGESTIONS:
${suggList || "none"}

ORIGINAL CONTENT:
\`\`\`${file.ext.replace(".", "")}
${content}
\`\`\`

Rules:
- Return ONLY the complete improved file content inside a single code block
- Preserve all existing functionality — do NOT break imports or exports
- Do not change function signatures unless fixing a bug
- Do not add new dependencies
- If no improvements are needed, return the original content unchanged
- No explanation, no preamble — just the code block`;
}

// ── HELPERS ───────────────────────────────────────────────

function makeCloneId(filePath: string): string {
  return "clone_" + crypto.createHash("md5").update(filePath).digest("hex").slice(0, 6);
}

function tryRead(absPath: string): string | null {
  try {
    return fs.readFileSync(absPath, "utf-8");
  } catch {
    return null;
  }
}

function extractText(response: Anthropic.Message): string {
  return response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as Anthropic.TextBlock).text)
    .join("");
}

function extractCodeBlock(text: string): string | null {
  const match = text.match(/```(?:\w+)?\n([\s\S]*?)```/);
  return match ? match[1] : null;
}

function parseScanResponse(text: string): {
  issues: Issue[];
  suggestions: Suggestion[];
  confidence: number;
} {
  try {
    const clean = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean);
    return {
      issues: parsed.issues ?? [],
      suggestions: parsed.suggestions ?? [],
      confidence: parsed.confidence ?? 0.5,
    };
  } catch {
    return { issues: [], suggestions: [], confidence: 0 };
  }
}

function diffLines(original: string, modified: string): number[] {
  const origLines = original.split("\n");
  const modLines = modified.split("\n");
  const changed: number[] = [];

  const maxLen = Math.max(origLines.length, modLines.length);
  for (let i = 0; i < maxLen; i++) {
    if (origLines[i] !== modLines[i]) {
      changed.push(i + 1);
    }
  }
  return changed;
}

function emptyReport(
  cloneId: string,
  file: ProjectFile,
  start: number
): CloneReport {
  return {
    cloneId,
    file: file.path,
    tier: file.tier,
    issues: [],
    suggestions: [],
    confidence: 0,
    tokensUsed: 0,
    durationMs: Date.now() - start,
  };
}
