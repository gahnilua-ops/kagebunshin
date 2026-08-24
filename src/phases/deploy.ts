// ============================================================
// KageBunshin MCP — Deploy Phase
// Git commit + push, then Vercel --prod
// ============================================================

import { exec } from "child_process";
import { promisify } from "util";
import { DeployResult } from "../core/types";

const execAsync = promisify(exec);

export async function runGitDeploy(
  projectRoot: string,
  branch: string,
  commitMessage: string
): Promise<Pick<DeployResult, "gitSuccess" | "gitOutput">> {
  try {
    // Stage all changes
    await execAsync("git add -A", { cwd: projectRoot });

    // Commit
    const { stdout: commitOut } = await execAsync(
      `git commit -m "${commitMessage}"`,
      { cwd: projectRoot }
    );

    // Push
    const { stdout: pushOut } = await execAsync(
      `git push origin ${branch}`,
      { cwd: projectRoot, timeout: 60_000 }
    );

    return {
      gitSuccess: true,
      gitOutput: commitOut + pushOut,
    };
  } catch (err: any) {
    const output = (err.stdout ?? "") + (err.stderr ?? "");

    // "nothing to commit" is not a failure
    if (output.includes("nothing to commit")) {
      return { gitSuccess: true, gitOutput: "Nothing to commit." };
    }

    return { gitSuccess: false, gitOutput: output };
  }
}

export async function runVercelDeploy(
  projectRoot: string
): Promise<Pick<DeployResult, "vercelSuccess" | "vercelOutput" | "vercelUrl">> {
  try {
    const { stdout, stderr } = await execAsync("vercel --prod --yes", {
      cwd: projectRoot,
      timeout: 180_000, // 3 min for vercel deploy
    });

    const output = stdout + stderr;

    // Extract deploy URL from vercel output
    const urlMatch = output.match(/https:\/\/[\w.-]+\.vercel\.app/);
    const vercelUrl = urlMatch ? urlMatch[0] : undefined;

    return {
      vercelSuccess: true,
      vercelOutput: output,
      vercelUrl,
    };
  } catch (err: any) {
    const output = (err.stdout ?? "") + (err.stderr ?? "");
    return {
      vercelSuccess: false,
      vercelOutput: output,
    };
  }
}
