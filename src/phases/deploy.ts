// ============================================================
// KageBunshin MCP — Deploy Phase
// Git commit + push only (Vercel removed — git is the sole deploy path)
// ============================================================

import { execFile } from "child_process";
import { promisify } from "util";

interface ExecError extends Error {
  stdout?: string;
  stderr?: string;
}
import { DeployResult } from "../core/types";

const execFileAsync = promisify(execFile);

export async function runGitDeploy(
  projectRoot: string,
  branch: string,
  commitMessage: string
): Promise<Pick<DeployResult, "gitSuccess" | "gitOutput">> {
  try {
    // Stage all changes
    await execFileAsync("git", ["add", "-A"], { cwd: projectRoot });

    // Commit (uses execFile — no shell interpolation, safe from injection)
    const { stdout: commitOut } = await execFileAsync(
      "git",
      ["commit", "-m", commitMessage],
      { cwd: projectRoot }
    );

    // Push
    const { stdout: pushOut } = await execFileAsync(
      "git",
      ["push", "origin", branch],
      { cwd: projectRoot, timeout: 60_000 }
    );

    return {
      gitSuccess: true,
      gitOutput: commitOut + pushOut,
    };
  } catch (err: unknown) {
    const e = (err instanceof Error ? err : {}) as ExecError;
    const output = (e.stdout ?? "") + (e.stderr ?? "");

    // "nothing to commit" is not a failure
    if (output.includes("nothing to commit")) {
      return { gitSuccess: true, gitOutput: "Nothing to commit." };
    }

    return { gitSuccess: false, gitOutput: output };
  }
}
