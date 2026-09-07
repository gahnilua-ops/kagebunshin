// ============================================================
// KageBunshin MCP — Build Phase
// Runs npm run build, parses errors, traces blame
// ============================================================

import { exec } from "child_process";
import { promisify } from "util";

interface ExecError extends Error {
  stdout?: string;
  stderr?: string;
}
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
  } catch (err: unknown) {
    const e = (err instanceof Error ? err : {}) as ExecError;
    const output = (e.stdout ?? "") + (e.stderr ?? "");
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

// Matches source-file paths from tsc / webpack / vite / stack-trace output:
//   ./src/foo.ts(12,5): error TS2345
//   src/foo.ts:12:5 - error TS2345        (tsc default format)
//   ERROR in ./src/bar.js                 (webpack)
//   at fn (/abs/proj/src/baz.ts:10:3)     (stack traces)
// Leading ./, ../ or / is optional so bare `src/...` paths are also captured.
const FILE_PATTERN =
  /((?:\.\.?\/|\/)?[\w@./\\-]+\.(?:ts|tsx|js|jsx|mjs|cjs))(?::\d+(?::\d+)?)?/g;

export function parseBuildErrors(
  errorLines: string[],
  blameMap: BlameMap
): string[] {
  const suspects = new Set<string>();

  for (const line of errorLines) {
    let match;
    FILE_PATTERN.lastIndex = 0;
    while ((match = FILE_PATTERN.exec(line)) !== null) {
      const raw = match[1]
        .replace(/^\.\//, "")
        .replace(/^\.\.\//, "")
        .replace(/\\/g, "/");

      // Resolve to the canonical blame key. A build error may report an
      // absolute or nested path; match by exact key first, then by suffix
      // (the path ends with a known relative blame key) so we still blame
      // the right file.
      let key: string | undefined = blameMap[raw] ? raw : undefined;
      if (!key) {
        key = Object.keys(blameMap).find((k) => raw.endsWith(k));
      }
      if (key) {
        suspects.add(key);
      }
    }
  }

  // If we couldn't trace to specific files, return lowest-confidence clones
  // as a fallback so the caller still has something to surface.
  if (suspects.size === 0) {
    const byConfidence = Object.entries(blameMap)
      .sort(([, a], [, b]) => a.confidence - b.confidence)
      .slice(0, 3)
      .map(([file]) => file);

    return byConfidence;
  }

  return Array.from(suspects);
}
