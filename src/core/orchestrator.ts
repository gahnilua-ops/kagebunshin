// ============================================================
// KageBunshin MCP — The Original (Orchestrator)
// Deploys clones, synthesizes knowledge, controls all phases
// ============================================================

import * as readline from "readline";
import {
  KageBunshinConfig,
  KageBunshinResult,
  CloneReport,
  DiffBlock,
  BlameMap,
  ProjectFile,
} from "./types";
import { buildDependencyGraph, getExecutionOrder } from "./dependency-graph";
import { cloneScan, cloneDryRun, cloneExecute } from "../clones/clone";
import { runBuild, parseBuildErrors } from "../phases/build";
import { runGitDeploy, runVercelDeploy } from "../phases/deploy";

export async function runKageBunshin(
  config: KageBunshinConfig
): Promise<KageBunshinResult> {
  const startTime = Date.now();
  let totalTokens = 0;
  const blameMap: BlameMap = {};

  log("🍃 KageBunshin awakens...");
  log(`📁 Project root: ${config.projectRoot}`);

  // ── PHASE 0: DEPENDENCY GRAPH ─────────────────────────
  log("\n⚡ Phase 0: Building dependency graph...");
  const allFiles = await buildDependencyGraph(config);
  const executionOrder = getExecutionOrder(allFiles);

  const totalFiles = allFiles.length;
  const clusters = new Set(allFiles.map((f) => f.cluster)).size;
  log(`   ${totalFiles} files across ${clusters} dependency clusters`);
  log(`   Tier breakdown: ${tierSummary(allFiles)}`);

  // ── PHASE 1: SCAN (parallel where safe) ───────────────
  log("\n🔍 Phase 1: Deploying scan clones...");
  const scanReports = new Map<string, CloneReport>();

  for (const batch of executionOrder) {
    const batchLabel =
      batch.length === 1
        ? `  [independent] ${batch[0].path}`
        : `  [cluster-${batch[0].cluster}] ${batch.length} files (sequential)`;
    log(batchLabel);

    if (batch.length === 1 || isIndependentBatch(batch, executionOrder)) {
      // True parallel
      const results = await Promise.all(batch.map((f) => cloneScan(f, config)));
      for (const r of results) {
        scanReports.set(r.file, r);
        totalTokens += r.tokensUsed;
      }
    } else {
      // Sequential within cluster
      for (const file of batch) {
        const report = await cloneScan(file, config);
        scanReports.set(report.file, report);
        totalTokens += report.tokensUsed;
      }
    }
  }

  // ── PHASE 2: SYNTHESIZE (The Original gains knowledge) ─
  log("\n🧠 Phase 2: Original synthesizing all clone reports...");
  const totalIssues = Array.from(scanReports.values()).reduce(
    (sum, r) => sum + r.issues.length,
    0
  );
  const actionableFiles = Array.from(scanReports.values()).filter(
    (r) => r.issues.length > 0 || r.suggestions.length > 0
  );
  log(`   ${totalIssues} issues found across ${actionableFiles.length} files`);

  if (actionableFiles.length === 0) {
    log("   ✅ No improvements needed. Project is clean!");
    return buildResult("VALIDATE", allFiles, 0, totalIssues, blameMap, startTime, totalTokens);
  }

  // ── PHASE 3: DRY RUN ──────────────────────────────────
  log("\n📋 Phase 3: Dry run — generating proposed diffs...");
  const diffs: DiffBlock[] = [];

  for (const report of actionableFiles) {
    const file = allFiles.find((f) => f.path === report.file);
    if (!file) continue;

    const diff = await cloneDryRun(file, report, config);
    if (diff) diffs.push(diff);
  }

  log(`   ${diffs.length} files have proposed changes`);

  if (diffs.length === 0) {
    log("   ✅ Clones agreed no changes were needed after dry run.");
    return buildResult("DRY_RUN", allFiles, 0, totalIssues, blameMap, startTime, totalTokens);
  }

  // Print diff summary
  for (const diff of diffs) {
    log(`   📝 ${diff.file} — ${diff.linesChanged.length} lines changed (confidence: ${(diff.confidence * 100).toFixed(0)}%)`);
  }

  // ── HUMAN APPROVAL GATE ───────────────────────────────
  if (config.dryRunApproval) {
    const approved = await askApproval(
      `\n❓ Proceed with executing ${diffs.length} file changes? (y/n): `
    );
    if (!approved) {
      log("   ⛔ Execution cancelled by user.");
      return buildResult("DRY_RUN", allFiles, 0, totalIssues, blameMap, startTime, totalTokens);
    }
  }

  // ── PHASE 4: EXECUTE ──────────────────────────────────
  log("\n⚡ Phase 4: Deploying execution clones...");
  let filesModified = 0;

  for (const diff of diffs) {
    const file = allFiles.find((f) => f.path === diff.file);
    const report = scanReports.get(diff.file);
    if (!file || !report) continue;

    const result = await cloneExecute(file, report, config);

    if (result.success && result.linesChanged.length > 0) {
      filesModified++;
      blameMap[diff.file] = {
        cloneId: diff.cloneId,
        linesChanged: result.linesChanged,
        confidence: diff.confidence,
      };
      log(`   ✅ ${diff.file} improved (${result.linesChanged.length} lines)`);
    }
  }

  // ── PHASE 5: BUILD VALIDATION ─────────────────────────
  log("\n🔨 Phase 5: Running npm run build...");
  const buildResult_ = await runBuild(config.projectRoot);

  if (!buildResult_.success) {
    log("   ❌ Build failed! Analysing blame map...");
    const suspects = parseBuildErrors(buildResult_.errorLines, blameMap);
    log(`   🔍 Suspected files: ${suspects.join(", ") || "unknown"}`);

    // Restore .bak files for suspected culprits
    for (const suspect of suspects) {
      const file = allFiles.find((f) => f.path === suspect);
      if (file) {
        restoreBackup(file.absPath);
        log(`   🔄 Restored: ${suspect}`);
      }
    }

    // Retry build
    log("   🔁 Retrying build after restore...");
    const retryResult = await runBuild(config.projectRoot);
    if (!retryResult.success) {
      log("   ❌ Build still failing after restore. Aborting deploy.");
      return buildResult("VALIDATE", allFiles, filesModified, totalIssues, blameMap, startTime, totalTokens, buildResult_);
    }
    log("   ✅ Build recovered after restore.");
  } else {
    log("   ✅ Build passed!");
  }

  if (config.skipDeploy) {
    log("\n⏭️  skipDeploy=true — stopping before git/vercel.");
    return buildResult("VALIDATE", allFiles, filesModified, totalIssues, blameMap, startTime, totalTokens, buildResult_);
  }

  // ── PHASE 6: DEPLOY ───────────────────────────────────
  log("\n🚀 Phase 6: Deploying...");
  const gitResult = await runGitDeploy(
    config.projectRoot,
    config.gitBranch,
    config.commitMessage
  );
  log(gitResult.gitSuccess ? "   ✅ Git push success" : `   ❌ Git failed: ${gitResult.gitOutput}`);

  const vercelResult = await runVercelDeploy(config.projectRoot);
  log(vercelResult.vercelSuccess
    ? `   ✅ Vercel deployed: ${vercelResult.vercelUrl}`
    : `   ❌ Vercel failed: ${vercelResult.vercelOutput}`
  );

  log(`\n🍃 KageBunshin complete — ${filesModified} files improved in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

  return {
    phase: "DEPLOY",
    filesScanned: totalFiles,
    filesModified,
    totalIssuesFound: totalIssues,
    buildResult: buildResult_,
    deployResult: { ...gitResult, ...vercelResult },
    totalTokensUsed: totalTokens,
    totalDurationMs: Date.now() - startTime,
    blameMap,
  };
}

// ── HELPERS ───────────────────────────────────────────────

function log(msg: string): void {
  console.log(msg);
}

function tierSummary(files: ProjectFile[]): string {
  const counts = [0, 0, 0];
  for (const f of files) counts[f.tier - 1]++;
  return `T1:${counts[0]} T2:${counts[1]} T3:${counts[2]}`;
}

function isIndependentBatch(
  batch: ProjectFile[],
  allBatches: ProjectFile[][]
): boolean {
  return allBatches[0] === batch;
}

async function askApproval(question: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

function restoreBackup(absPath: string): void {
  const fs = require("fs");
  const bakPath = `${absPath}.bak`;
  if (fs.existsSync(bakPath)) {
    fs.copyFileSync(bakPath, absPath);
  }
}

function buildResult(
  phase: KageBunshinResult["phase"],
  files: ProjectFile[],
  filesModified: number,
  totalIssues: number,
  blameMap: BlameMap,
  startTime: number,
  totalTokens: number,
  buildRes?: KageBunshinResult["buildResult"]
): KageBunshinResult {
  return {
    phase,
    filesScanned: files.length,
    filesModified,
    totalIssuesFound: totalIssues,
    buildResult: buildRes,
    totalTokensUsed: totalTokens,
    totalDurationMs: Date.now() - startTime,
    blameMap,
  };
}
