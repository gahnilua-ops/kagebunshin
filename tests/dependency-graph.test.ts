import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { buildDependencyGraph, getExecutionOrder } from "../src/core/dependency-graph";
import { KageBunshinConfig, ProjectFile } from "../src/core/types";

function makeConfig(root: string): KageBunshinConfig {
  return {
    projectRoot: root,
    anthropicApiKey: "test",
    model: "test",
    maxConcurrentClones: 1,
    dryRunApproval: false,
    skipDeploy: true,
    gitBranch: "main",
    commitMessage: "test",
    ignorePatterns: [],
    tierThresholds: { tier1MaxLines: 50, tier2MaxLines: 200 },
  };
}

function mk(
  p: string,
  imports: string[],
  importedBy: string[]
): ProjectFile {
  return {
    path: p,
    absPath: "/x/" + p,
    size: 10,
    lines: 2,
    ext: ".ts",
    tier: 1,
    cluster: -1,
    imports,
    importedBy,
  };
}

describe("buildDependencyGraph — circular imports", () => {
  let tmpDir: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "kb-dg-"));
    // a -> b -> c -> a  forms a 3-file cycle; standalone is unconnected.
    // Named imports are used so the extractor actually records the edges
    // (bare side-effect imports `import "./x";` are NOT yet parsed — see log).
    fs.writeFileSync(path.join(tmpDir, "a.ts"), "import { b } from \"./b\";\nconst x = 1;\n");
    fs.writeFileSync(path.join(tmpDir, "b.ts"), "import { c } from \"./c\";\nconst y = 2;\n");
    fs.writeFileSync(path.join(tmpDir, "c.ts"), "import { a } from \"./a\";\nconst z = 3;\n");
    fs.writeFileSync(path.join(tmpDir, "standalone.ts"), "const w = 4;\n");
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("completes without deadlocking on a 3-file circular import", async () => {
    const files = await buildDependencyGraph(makeConfig(tmpDir));
    expect(files.length).toBe(4);
  });

  it("assigns all 3 cyclically-imported files to the SAME cluster", async () => {
    const files = await buildDependencyGraph(makeConfig(tmpDir));
    const cycle = files.filter((f) => ["a.ts", "b.ts", "c.ts"].includes(f.path));
    expect(new Set(cycle.map((f) => f.cluster)).size).toBe(1);
  });

  it("keeps an unconnected file in a separate cluster", async () => {
    const files = await buildDependencyGraph(makeConfig(tmpDir));
    const standalone = files.find((f) => f.path === "standalone.ts")!;
    const cycleCluster = files.find((f) => f.path === "a.ts")!.cluster;
    expect(standalone.cluster).not.toBe(cycleCluster);
  });
});

describe("getExecutionOrder", () => {
  it("places independent (single-file) clusters in one parallel batch", () => {
    const files = [
      mk("indep1.ts", [], []),
      mk("indep2.ts", [], []),
      mk("indep3.ts", [], []),
    ];
    files.forEach((f, i) => (f.cluster = i));
    const order = getExecutionOrder(files);
    expect(order[0].map((f) => f.path).sort()).toEqual([
      "indep1.ts",
      "indep2.ts",
      "indep3.ts",
    ]);
  });

  it("groups a dependent cluster and orders imported-first", () => {
    const a = mk("a.ts", ["b.ts"], []);
    const b = mk("b.ts", [], ["a.ts"]);
    a.cluster = 0;
    b.cluster = 0;
    const order = getExecutionOrder([a, b]);
    expect(order.length).toBe(1);
    expect(order[0][0].path).toBe("b.ts"); // b is imported by a -> foundation first
  });

  it("keeps a 3-file cycle as a single dependent group", () => {
    const a = mk("a.ts", ["b.ts"], ["c.ts"]);
    const b = mk("b.ts", ["c.ts"], ["a.ts"]);
    const c = mk("c.ts", ["a.ts"], ["b.ts"]);
    [a, b, c].forEach((f) => (f.cluster = 0));
    const order = getExecutionOrder([a, b, c]);
    expect(order.length).toBe(1);
    expect(order[0].length).toBe(3);
  });
});
