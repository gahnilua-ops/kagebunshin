import { parseBuildErrors } from "../src/phases/build";
import { BlameMap } from "../src/core/types";

function blame(files: string[]): BlameMap {
  const map: BlameMap = {};
  files.forEach((f, i) => {
    map[f] = { cloneId: `clone-${i}`, linesChanged: [1], confidence: 0.5 + i * 0.1 };
  });
  return map;
}

describe("parseBuildErrors", () => {
  it("captures a single file from the tsc (line,col) paren format", () => {
    const lines = ["./src/a.ts(1,2): error TS2322: Type 'X' is not assignable."];
    const result = parseBuildErrors(lines, blame(["src/a.ts"]));
    expect(result).toContain("src/a.ts");
  });

  it("captures MULTIPLE files from the tsc :line:col format (multi-file failure)", () => {
    const lines = [
      "src/a.ts:1:2 - error TS2322: Type 'X' is not assignable to type 'Y'.",
      "src/b.ts:5:1 - error TS2304: Cannot find name 'z'.",
      "src/c.ts:9:3 - error TS2345: Argument of type 'number' is not assignable.",
    ];
    // c.ts is intentionally NOT in the blame map, so it must be excluded.
    const result = parseBuildErrors(lines, blame(["src/a.ts", "src/b.ts"]));
    expect(result.sort()).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("captures multiple files from webpack 'ERROR in ...' output", () => {
    const lines = [
      "ERROR in ./src/x.ts",
      "ERROR in ./src/y.ts 9:1",
      "Module not found: ./src/z.ts",
    ];
    const result = parseBuildErrors(lines, blame(["src/x.ts", "src/y.ts", "src/z.ts"]));
    expect(result.sort()).toEqual(["src/x.ts", "src/y.ts", "src/z.ts"]);
  });

  it("resolves absolute stack-trace paths to relative blame keys via suffix match", () => {
    const lines = ["    at Object.<anonymous> (/home/dev/proj/src/a.ts:10:3)"];
    const result = parseBuildErrors(lines, blame(["src/a.ts"]));
    expect(result).toEqual(["src/a.ts"]);
  });

  it("falls back to the 3 lowest-confidence clones (capped) when nothing is traced", () => {
    const lines = ["error TS2307: Cannot find module 'lost'."];
    const map: BlameMap = {
      "src/low.ts": { cloneId: "c1", linesChanged: [], confidence: 0.2 },
      "src/high.ts": { cloneId: "c2", linesChanged: [], confidence: 0.9 },
      "src/mid.ts": { cloneId: "c3", linesChanged: [], confidence: 0.5 },
      "src/top.ts": { cloneId: "c4", linesChanged: [], confidence: 0.99 },
    };
    // Only the 3 lowest-confidence clones are returned; src/top.ts (0.99) is capped out.
    const result = parseBuildErrors(lines, map);
    expect(result.sort()).toEqual(["src/high.ts", "src/low.ts", "src/mid.ts"]);
  });
});
