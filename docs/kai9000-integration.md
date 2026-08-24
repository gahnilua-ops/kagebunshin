# Kai 9000 — KageBunshin MCP Integration
# Add this to your Kai 9000 MCP config

# ── OPTION A: Local (running on same machine) ─────────────
# Start the server:
#   cd ~/kagebunshin && npm run build && node dist/index.js
#
# MCP config:
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

# ── OPTION B: Remote (deployed on Railway / Render / VPS) ─
# Deploy kagebunshin-mcp to your host, then:
{
  "mcpServers": {
    "kagebunshin": {
      "url": "https://your-kagebunshin-url.railway.app/mcp",
      "headers": {
        "Authorization": "Bearer your-secret-token-here"
      }
    }
  }
}

# ── AVAILABLE TOOLS ───────────────────────────────────────
# kagebunshin_scan   — analyze all files, return report (no changes)
# kagebunshin_run    — full pipeline: improve → build → git → vercel

# ── EXAMPLE TOOL CALL FROM KAI 9000 ──────────────────────
# {
#   "tool": "kagebunshin_scan",
#   "arguments": {
#     "projectRoot": "/home/gahni/itravelbohol"
#   }
# }
#
# {
#   "tool": "kagebunshin_run",
#   "arguments": {
#     "projectRoot": "/home/gahni/itravelbohol",
#     "skipDeploy": true,
#     "gitBranch": "main",
#     "commitMessage": "chore: KageBunshin AI improvements"
#   }
# }
