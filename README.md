# 🍃 KageBunshin MCP

> *"The original gains all the knowledge of its clones."*

A multi-agent AI code improvement pipeline inspired by Naruto's **Shadow Clone Jutsu**.

KageBunshin deploys one AI "clone" per file in your project — each clone scans, analyzes, and improves its assigned file in parallel. Supports **OpenRouter, Groq, NVIDIA NIM, and OpenCode** providers with automatic model fallback.

---

## ✨ Features

- **Multi-provider support** — OpenRouter, Groq, NVIDIA NIM, OpenCode
- **Automatic model fallback** — tries 18+ free models when primary fails
- **Web config UI** — premium 3D glassmorphism dashboard at `http://localhost:3456/`
- **Built-in chat** — test providers and models directly from the UI
- **Dependency-aware parallelism** — safe concurrent execution
- **Auto-recovery** — build failures traced and auto-restored
- **Token budget control** — per-file API spend caps
- **Rate limiting** — semaphore + retry with exponential backoff

---

## How It Works

```
Phase 0 — Dependency Graph
  Scans all files, maps imports, assigns dependency clusters

Phase 1 — SCAN (Clone Deployment)
  One AI clone per file analyzes issues and suggestions

Phase 2 — SYNTHESIZE
  Original gains all clone knowledge

Phase 3 — DRY RUN
  Clones generate proposed diffs without writing anything

Phase 4 — EXECUTE
  Clones apply improvements (with .bak backups)

Phase 5 — BUILD VALIDATE
  npm run build → blame map → auto-restore on failure → retry

Phase 6 — DEPLOY
  git add -A && git commit && git push
```

---

## Install

```bash
git clone https://github.com/gahnilua-ops/kagebunshin
cd kagebunshin
npm install
npm run build
```

---

## Usage

### Web Config UI (recommended)

```bash
# Start the server
node dist/index.js server

# Open in browser
open http://localhost:3456/
```

The dashboard lets you:
- Select provider (OpenRouter, Groq, NVIDIA, OpenCode)
- Set API key and model
- Configure pipeline settings
- Test providers with built-in chat
- Restart the server
- Export/import configuration

### CLI Mode

```bash
# Full pipeline
OPENROUTER_API_KEY=sk-... node dist/index.js /path/to/project

# Scan only
OPENROUTER_API_KEY=sk-... node dist/index.js /path/to/project --scan-only

# With specific provider
OPENROUTER_API_KEY=sk-... node dist/index.js /path/to/project --provider groq --model llama-3.3-70b-versatile
```

### MCP Server Mode (stdio)

```bash
MCP_STDIO=1 OPENROUTER_API_KEY=sk-... node dist/index.js
```

### HTTP Server Mode (for MCP clients)

```bash
node dist/index.js server
```

Add to your MCP config:
```json
{
  "mcpServers": {
    "kagebunshin": {
      "url": "http://localhost:3456/mcp"
    }
  }
}
```

---

## Providers

| Provider | Base URL | Free Models |
|---|---|---|
| OpenRouter | `openrouter.ai/api/v1` | ✅ 18+ free models |
| Groq | `api.groq.com/openai/v1` | ✅ Free tier |
| NVIDIA NIM | `integrate.api.nvidia.com/v1` | ✅ Free tier |
| OpenCode | `opencode.ai/zen/go/v1` | ✅ Free tier |

### Recommended Free Models (OpenRouter)

| Model | Best For |
|---|---|
| `google/gemma-4-31b-it:free` | General coding |
| `nvidia/nemotron-3-super-120b-a12b:free` | Complex tasks |
| `cohere/north-mini-code:free` | Code-specific |
| `minimax/minimax-m3:free` | Balanced |

---

## Configuration

| Option | Default | Description |
|---|---|---|
| `provider` | `openrouter` | AI provider |
| `model` | `meta-llama/llama-3.1-8b-instruct` | Model ID |
| `apiKey` | — | Provider API key |
| `projectRoot` | `cwd` | Project directory |
| `maxConcurrentClones` | `10` | Parallel API calls |
| `cloneTokenBudget` | `30000` | Per-file token cap |
| `dryRunApproval` | `false` | Pause before execute |
| `skipDeploy` | `false` | Stop after build |
| `gitBranch` | `main` | Push branch |

### Environment Variables

```bash
OPENROUTER_API_KEY=sk-or-...   # OpenRouter
GROQ_API_KEY=gsk_...           # Groq
NVIDIA_API_KEY=nvapi-...       # NVIDIA
OPENCODE_API_KEY=...           # OpenCode
KB_API_KEY=...                 # Server auth token
PORT=3456                      # HTTP port
```

---

## Safety Features

- **Dependency-aware execution** — files that import each other are never modified in parallel
- **Tier classification** — small files get lightweight clones, complex files get deep analysis
- **Dry run first** — all diffs previewed before any file is touched
- **Backup on write** — every modified file gets a `.bak` before overwrite
- **Blame tracking** — build failures traced to specific clones, auto-restored
- **Token budget** — per-file API spend caps prevent runaway costs
- **Rate limiting** — semaphore + retry with exponential backoff
- **Model fallback** — auto-tries working models when primary fails

---

## Architecture

```
src/
├── core/
│   ├── types.ts              # TypeScript interfaces
│   ├── config-store.ts       # JSON config persistence
│   ├── dependency-graph.ts   # Import scanner + cluster builder
│   ├── orchestrator.ts       # The Original — controls all phases
│   └── token-budget.ts       # Per-clone token caps
├── clones/
│   └── clone.ts              # The Clone — scan, dry run, execute
├── providers/
│   ├── index.ts              # LLMProvider interface
│   ├── base.ts               # OpenAI-compatible HTTP client
│   └── factory.ts            # Provider factory + model lists
├── phases/
│   ├── build.ts              # npm run build + blame parser
│   └── deploy.ts             # git commit + push
├── web/
│   ├── config.html           # Web config dashboard
│   └── routes.ts             # Express routes + API
└── index.ts                  # MCP server + CLI entry point
```

---

## Requirements

- Node.js 18+
- `npm run build` script in target project
- `git` CLI installed
- Provider API key (OpenRouter, Groq, NVIDIA, or OpenCode)

---

## Created By

**Gahni (Isagani Goloso)**
Developer [PH]

*"If it's not KageBunshin, it wouldn't be possible."*

---

## License

MIT
