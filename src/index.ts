#!/usr/bin/env node
// ============================================================
// KageBunshin MCP Server
// Multi-agent AI code improvement pipeline
// By Gahni (Isagani Goloso)
//
// Modes:
//   HTTP/SSE  — default, for Kai 9000 and remote MCP clients
//   stdio     — MCP_STDIO=1, for local Claude Desktop etc
//   CLI       — node dist/index.js <project-root> [flags]
// ============================================================

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import express, { Request, Response } from "express";
import cors from "cors";
import { z } from "zod";
import { runKageBunshin } from "./core/orchestrator";
import { KageBunshinConfig } from "./core/types";

// ── DEFAULT CONFIG ────────────────────────────────────────

const DEFAULT_CONFIG: Partial<KageBunshinConfig> = {
  model: "claude-sonnet-4-6",
  maxConcurrentClones: 10,
  dryRunApproval: false,   // false by default in server mode — Kai controls approval
  skipDeploy: false,
  gitBranch: "main",
  commitMessage: "chore: KageBunshin AI improvements",
  ignorePatterns: [],
  tierThresholds: {
    tier1MaxLines: 50,
    tier2MaxLines: 200,
  },
};

// ── TOOL SCHEMAS ─────────────────────────────────────────

const RunSchema = z.object({
  projectRoot: z.string().describe("Absolute path to the project root"),
  anthropicApiKey: z.string().optional(),
  dryRunApproval: z.boolean().optional().default(false),
  skipDeploy: z.boolean().optional().default(false),
  gitBranch: z.string().optional().default("main"),
  commitMessage: z.string().optional(),
  ignorePatterns: z.array(z.string()).optional().default([]),
  maxConcurrentClones: z.number().optional().default(10),
});

const ScanOnlySchema = z.object({
  projectRoot: z.string(),
  anthropicApiKey: z.string().optional(),
});

// ── MCP SERVER FACTORY ────────────────────────────────────

function createMCPServer(): Server {
  const server = new Server(
    { name: "kagebunshin-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "kagebunshin_run",
        description:
          "Full KageBunshin pipeline: deploy AI clones to scan all project files in parallel, synthesize improvements, execute changes, validate with npm build, git push, and vercel --prod deploy.",
        inputSchema: {
          type: "object",
          properties: {
            projectRoot: { type: "string", description: "Absolute path to project root on the server" },
            dryRunApproval: { type: "boolean", description: "Pause for approval before writing changes (default: false)" },
            skipDeploy: { type: "boolean", description: "Stop after build validation, skip git/vercel (default: false)" },
            gitBranch: { type: "string", description: "Git branch to push to (default: main)" },
            commitMessage: { type: "string", description: "Git commit message" },
            ignorePatterns: { type: "array", items: { type: "string" }, description: "Additional glob patterns to ignore" },
            maxConcurrentClones: { type: "number", description: "Max parallel clone API calls (default: 10)" },
          },
          required: ["projectRoot"],
        },
      },
      {
        name: "kagebunshin_scan",
        description:
          "Scan-only mode: deploy AI clones to analyze all project files and return a full report of issues and suggestions. No files are modified.",
        inputSchema: {
          type: "object",
          properties: {
            projectRoot: { type: "string", description: "Absolute path to project root on the server" },
          },
          required: ["projectRoot"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      if (name === "kagebunshin_run") {
        const input = RunSchema.parse(args);
        const config: KageBunshinConfig = {
          ...DEFAULT_CONFIG,
          ...input,
          anthropicApiKey: input.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY ?? "",
          tierThresholds: DEFAULT_CONFIG.tierThresholds!,
        } as KageBunshinConfig;

        const result = await runKageBunshin(config);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      if (name === "kagebunshin_scan") {
        const input = ScanOnlySchema.parse(args);
        const config: KageBunshinConfig = {
          ...DEFAULT_CONFIG,
          ...input,
          anthropicApiKey: input.anthropicApiKey ?? process.env.ANTHROPIC_API_KEY ?? "",
          skipDeploy: true,
          dryRunApproval: false,
          tierThresholds: DEFAULT_CONFIG.tierThresholds!,
        } as KageBunshinConfig;

        const result = await runKageBunshin(config);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      throw new Error(`Unknown tool: ${name}`);
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  });

  return server;
}

// ── HTTP/SSE MODE (default — for Kai 9000) ───────────────

async function runHTTPServer(): Promise<void> {
  const PORT = parseInt(process.env.PORT ?? "3456");
  const API_KEY = process.env.KB_API_KEY; // optional bearer token auth

  const app = express();
  app.use(cors());
  app.use(express.json());

  // Auth middleware
  const authMiddleware = (req: Request, res: Response, next: Function) => {
    if (!API_KEY) return next(); // no auth configured = open
    const bearer = req.headers.authorization?.replace("Bearer ", "");
    if (bearer !== API_KEY) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    next();
  };

  // Health check
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", server: "kagebunshin-mcp", version: "0.1.0" });
  });

  // SSE endpoint — each connection gets its own MCP server instance
  app.get("/sse", authMiddleware, async (req: Request, res: Response) => {
    console.log(`[KageBunshin] SSE client connected: ${req.ip}`);

    const server = createMCPServer();
    const transport = new SSEServerTransport("/messages", res);
    await server.connect(transport);

    req.on("close", () => {
      console.log(`[KageBunshin] SSE client disconnected: ${req.ip}`);
    });
  });

  // Message endpoint — SSE transport posts messages here
  app.post("/messages", authMiddleware, async (req: Request, res: Response) => {
    // SSEServerTransport handles this internally via the paired /sse connection
    res.status(200).json({ ok: true });
  });

  app.listen(PORT, () => {
    console.log(`🍃 KageBunshin MCP server running`);
    console.log(`   SSE endpoint : http://localhost:${PORT}/sse`);
    console.log(`   Health check : http://localhost:${PORT}/health`);
    console.log(`   Auth         : ${API_KEY ? "Bearer token enabled" : "open (set KB_API_KEY to enable)"}`);
  });
}

// ── STDIO MODE (for Claude Desktop / local MCP) ──────────

async function runStdioServer(): Promise<void> {
  const server = createMCPServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("🍃 KageBunshin MCP running on stdio");
}

// ── CLI MODE ──────────────────────────────────────────────

async function runCLI(): Promise<void> {
  const args = process.argv.slice(2);
  const projectRoot = args[0];

  if (!projectRoot) {
    console.error("Usage: kagebunshin <project-root> [--scan-only] [--skip-deploy] [--no-approval]");
    process.exit(1);
  }

  const config: KageBunshinConfig = {
    ...DEFAULT_CONFIG,
    projectRoot,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
    dryRunApproval: !args.includes("--no-approval"),
    skipDeploy: args.includes("--skip-deploy") || args.includes("--scan-only"),
    tierThresholds: DEFAULT_CONFIG.tierThresholds!,
  } as KageBunshinConfig;

  const result = await runKageBunshin(config);
  console.log("\n📊 Final Result:");
  console.log(JSON.stringify(result, null, 2));
}

// ── ENTRY POINT ───────────────────────────────────────────

if (process.env.MCP_STDIO === "1") {
  runStdioServer().catch(console.error);
} else if (process.argv[2] && !process.argv[2].startsWith("--")) {
  runCLI().catch((err) => { console.error("Fatal:", err); process.exit(1); });
} else {
  runHTTPServer().catch(console.error);
}
