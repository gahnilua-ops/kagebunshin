// ============================================================
// KageBunshin MCP — Dependency Graph Builder
// Scans all project files, maps imports, assigns clusters
// ============================================================

import * as fs from "fs";
import * as path from "path";
import { glob } from "glob";
import { ProjectFile, KageBunshinConfig, CloneTier } from "./types";

const JS_TS_EXTS = [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"];

// Regex-based import extraction (fast, no full AST needed here)
const IMPORT_PATTERNS = [
  /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g,
  /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

const DEFAULT_IGNORE = [
  "node_modules/**",
  "dist/**",
  "build/**",
  ".git/**",
  "*.min.js",
  "*.map",
  "coverage/**",
];

export async function buildDependencyGraph(
  config: KageBunshinConfig
): Promise<ProjectFile[]> {
  const ignore = [...DEFAULT_IGNORE, ...config.ignorePatterns];

  // 1. Collect all files
  const filePaths = await glob("**/*.*", {
    cwd: config.projectRoot,
    ignore,
    nodir: true,
    absolute: false,
  });

  // 2. Build initial file objects
  const fileMap = new Map<string, ProjectFile>();

  for (const relPath of filePaths) {
    const absPath = path.join(config.projectRoot, relPath);
    let stat: fs.Stats;
    try {
      stat = fs.statSync(absPath);
    } catch {
      continue;
    }

    const content = tryReadFile(absPath);
    const lines = content ? content.split("\n").length : 0;
    const ext = path.extname(relPath).toLowerCase();

    const file: ProjectFile = {
      path: relPath,
      absPath,
      size: stat.size,
      lines,
      ext,
      tier: assignTier(lines, config),
      cluster: -1,       // assigned later
      imports: [],
      importedBy: [],
    };

    // Extract imports for JS/TS files
    if (JS_TS_EXTS.includes(ext) && content) {
      file.imports = extractImports(content, relPath, config.projectRoot, filePaths);
    }

    fileMap.set(relPath, file);
  }

  // 3. Build reverse import map (importedBy)
  for (const [relPath, file] of fileMap) {
    for (const imp of file.imports) {
      const target = fileMap.get(imp);
      if (target && !target.importedBy.includes(relPath)) {
        target.importedBy.push(relPath);
      }
    }
  }

  // 4. Assign clusters via union-find
  const files = Array.from(fileMap.values());
  assignClusters(files);

  return files;
}

function tryReadFile(absPath: string): string | null {
  try {
    return fs.readFileSync(absPath, "utf-8");
  } catch {
    return null;
  }
}

function assignTier(lines: number, config: KageBunshinConfig): CloneTier {
  if (lines <= config.tierThresholds.tier1MaxLines) return 1;
  if (lines <= config.tierThresholds.tier2MaxLines) return 2;
  return 3;
}

function extractImports(
  content: string,
  relPath: string,
  projectRoot: string,
  allFiles: string[]
): string[] {
  const imports: string[] = [];
  const dir = path.dirname(relPath);

  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const importPath = match[1];
      // Only process relative imports
      if (!importPath.startsWith(".")) continue;

      const resolved = resolveImport(importPath, dir, allFiles);
      if (resolved && !imports.includes(resolved)) {
        imports.push(resolved);
      }
    }
  }

  return imports;
}

function resolveImport(
  importPath: string,
  fromDir: string,
  allFiles: string[]
): string | null {
  const base = path.join(fromDir, importPath).replace(/\\/g, "/");

  // Try exact match first
  if (allFiles.includes(base)) return base;

  // Try with extensions
  for (const ext of JS_TS_EXTS) {
    const withExt = base + ext;
    if (allFiles.includes(withExt)) return withExt;

    // Try index files
    const indexFile = path.join(base, `index${ext}`).replace(/\\/g, "/");
    if (allFiles.includes(indexFile)) return indexFile;
  }

  return null;
}

// Union-Find clustering — files connected by imports share a cluster
function assignClusters(files: ProjectFile[]): void {
  const pathToIndex = new Map<string, number>();
  files.forEach((f, i) => pathToIndex.set(f.path, i));

  const parent = files.map((_, i) => i);

  function find(x: number): number {
    if (parent[x] !== x) parent[x] = find(parent[x]);
    return parent[x];
  }

  function union(x: number, y: number): void {
    const px = find(x);
    const py = find(y);
    if (px !== py) parent[px] = py;
  }

  // Union files connected by imports
  for (const file of files) {
    const fileIdx = pathToIndex.get(file.path);
    if (fileIdx === undefined) continue;

    for (const imp of file.imports) {
      const impIdx = pathToIndex.get(imp);
      if (impIdx !== undefined) {
        union(fileIdx, impIdx);
      }
    }
  }

  // Normalize cluster IDs
  const rootToCluster = new Map<number, number>();
  let clusterCounter = 0;

  for (let i = 0; i < files.length; i++) {
    const root = find(i);
    if (!rootToCluster.has(root)) {
      rootToCluster.set(root, clusterCounter++);
    }
    files[i].cluster = rootToCluster.get(root)!;
  }
}

export function getExecutionOrder(files: ProjectFile[]): ProjectFile[][] {
  // Group by cluster
  const clusters = new Map<number, ProjectFile[]>();
  for (const file of files) {
    if (!clusters.has(file.cluster)) clusters.set(file.cluster, []);
    clusters.get(file.cluster)!.push(file);
  }

  // Clusters of size 1 = independent = can run fully parallel
  // Clusters of size > 1 = interdependent = run sequentially within cluster
  const independent: ProjectFile[] = [];
  const dependent: ProjectFile[][] = [];

  for (const [, group] of clusters) {
    if (group.length === 1) {
      independent.push(group[0]);
    } else {
      // Sort by import depth within cluster (imported files first)
      const sorted = sortByDependency(group);
      dependent.push(sorted);
    }
  }

  // Return: first batch = all independents, then each dependent cluster in order
  const result: ProjectFile[][] = [];
  if (independent.length > 0) result.push(independent);
  result.push(...dependent);

  return result;
}

function sortByDependency(files: ProjectFile[]): ProjectFile[] {
  // Files that are imported by others go first (they're the foundation)
  return [...files].sort((a, b) => b.importedBy.length - a.importedBy.length);
}
