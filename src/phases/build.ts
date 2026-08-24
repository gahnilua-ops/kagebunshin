// ============================================================
// KageBunshin MCP — Build Phase
// Runs npm run build, parses errors, traces blame
// ============================================================

import { exec } from "child_process";
import { promisify } from "util";
import { BuildResult, BlameMap } from "../core/types";

const execAsync = promisify(exec);

export async function runBuild(projectRoot: string): Promise<BuildResult> {
  try {
    const { stdout, stderr } = await execAsync("npm run build", {
      cwd: projectRoot,
      timeout: 120_000, // 2 min max
    });

    const output = stdout + stderr;
    return {
      success: true,
      output,
      errorLines: [],
      suspectedFiles: [],
    };
  } catch (err: any) {
    const output = (err.stdout ?? "") + (err.stderr ?? "");
    const errorLines = extractErrorLines(output);
    return {
      success: false,
      output,
      errorLines,
      suspectedFiles: [],
    };
  }
}

function extractErrorLines(output: string): string[] {
  return output
    .split("\n")
    .filter(
      (line) =>
        line.includes("error") ||
        line.includes("Error") ||
        line.includes("ERROR") ||
        line.match(/\s+at\s+/) // stack trace lines
    )
    .map((l) => l.trim())
    .filter(Boolean);
}

export function parseBuildErrors(
  errorLines: string[],
  blameMap: BlameMap
): string[] {
  const suspects = new Set<string>();

  // Try to extract file paths from error lines
  // Common patterns: ./src/foo.ts(12,5): error TS2345
  // or: ERROR in ./src/bar.js
  const filePattern = /([./\\][\w./\\-]+\.(ts|tsx|js|jsx|mjs|cjs))/g;

  for (const line of errorLines) {
    let match;
    filePattern.lastIndex = 0;
    while ((match = filePattern.exec(line)) !== null) {
      const filePath = match[1]
        .replace(/^\.\//, "")
        .replace(/\\/g, "/");

      // Check if this file was touched by a clone
      if (blameMap[filePath]) {
        suspects.add(filePath);
      }
    }
  }

  // If we couldn't trace to specific files, return lowest-confidence clones
  if (suspects.size === 0) {
    const byConfidence = Object.entries(blameMap)
      .sort(([, a], [, b]) => a.confidence - b.confidence)
      .slice(0, 3)
      .map(([file]) => file);

    return byConfidence;
  }

  return Array.from(suspects);
}
