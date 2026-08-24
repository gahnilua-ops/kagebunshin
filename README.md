# 🍃 KageBunshin MCP

> *"The original gains all the knowledge of its clones."*

A multi-agent AI code improvement pipeline inspired by Naruto's **Shadow Clone Jutsu**.

KageBunshin deploys one Claude AI "clone" per file in your project — each clone scans, analyzes, and improves its assigned file in parallel. When done, all knowledge flows back to the original, which validates, builds, and deploys.

---

## How It Works

```
Phase 0 — Dependency Graph
  Scans all files, maps imports, assigns dependency clusters
  Files that import each other → sequential (safe)
  Independent files → true parallel (fast)

Phase 1 — SCAN (Clone Deployment)
  One AI clone per file analyzes issues and suggestions
  Parallel where safe, sequential within clusters

Phase 2 — SYNTHESIZE
  Original gains all clone knowledge
  Builds full project improvement picture

Phase 3 — DRY RUN
  Clones generate proposed diffs without writing anything
  Optional: pause for human approval

Phase 4 — EXECUTE
  Clones apply improvements
  .bak backups created before any write

Phase 5 — BUILD VALIDATE
  npm run build
  If fails → blame map traces culprit files → auto-restore → retry

Phase 6 — DEPLOY
  git add -A && git commit && git push
  vercel --prod
```

---

## Install

```bash
git clone https://github.com/yourusername/kagebunshin-mcp
cd kagebunshin-mcp
npm install
npm run build
```

---

## Usage

### CLI Mode

```bash
# Full pipeline (scan → improve → build → deploy)
ANTHROPIC_API_KEY=sk-... node dist/index.js /path/to/your/project

# Scan only — no changes made
ANTHROPIC_API_KEY=sk-... node dist/index.js /path/to/your/project --scan-only

# Stop after build, skip git/vercel
ANTHROPIC_API_KEY=sk-... node dist/index.js /path/to/your/project --skip-deploy

# Skip approval prompt
ANTHROPIC_API_KEY=sk-... node dist/index.js /path/to/your/project --no-approval
```

### HTTP Server Mode (Streamable HTTP — for Kai 9000 and remote MCP clients)

```bash
# Copy and fill env
cp .env.example .env

# Start the server (default port 3456)
ANTHROPIC_API_KEY=sk-... node dist/index.js
```

Add to your Kai 9000 MCP config:
```json
{
  "mcpServers": {
    "kagebunshin": {
      "url": "http://localhost:3456/mcp",
      "headers": {
        "Authorization": "Bearer your-secret-token-here"
      }
    }
  }
}
```

**Deploy remotely** (Railway, Render, any VPS):
```bash
# Set env vars on your host:
# ANTHROPIC_API_KEY, PORT, KB_API_KEY
# Then point Kai 9000 at:
# https://your-host.railway.app/mcp
```

### stdio Mode (for Claude Desktop / local MCP)

```bash
MCP_STDIO=1 ANTHROPIC_API_KEY=sk-... node dist/index.js
```

### Available MCP Tools

| Tool | Description |
|---|---|
| `kagebunshin_run` | Full pipeline: scan → improve → build → deploy |
| `kagebunshin_scan` | Scan only — report issues without making changes |

---

## Configuration

| Option | Default | Description |
|---|---|---|
| `projectRoot` | required | Absolute path to project |
| `dryRunApproval` | `true` | Pause for approval before writing |
| `skipDeploy` | `false` | Stop after build validation |
| `gitBranch` | `"main"` | Branch to push to |
| `commitMessage` | auto | Git commit message |
| `maxConcurrentClones` | `10` | Max parallel API calls |
| `ignorePatterns` | `[]` | Additional glob ignore patterns |

---

## Safety Features

- **Dependency-aware execution** — files that import each other are never modified in parallel
- **Tier classification** — small files get lightweight clones, complex files get deep analysis
- **Dry run first** — all diffs previewed before any file is touched
- **Backup on write** — every modified file gets a `.bak` before overwrite
- **Blame tracking** — build failures traced to specific clones, auto-restored
- **Human approval gate** — optional pause before execution

---

## Architecture

```
src/
├── core/
│   ├── types.ts              # All TypeScript interfaces
│   ├── dependency-graph.ts   # Import scanner + cluster builder
│   └── orchestrator.ts       # The Original — controls all phases
├── clones/
│   └── clone.ts              # The Clone — scan, dry run, execute
├── phases/
│   ├── build.ts              # npm run build + blame parser
│   └── deploy.ts             # git push + vercel --prod
└── index.ts                  # MCP server + CLI entry point
```

---

## Requirements

- Node.js 18+
- `npm run build` script in target project
- `git` CLI installed
- `vercel` CLI installed (for deploy phase)
- Anthropic API key

---

## Created By

**Gahni (Isagani Goloso)**
Developer [PH]

*"If it's not KageBunshin, it wouldn't be possible."*

---

## License

MIT

