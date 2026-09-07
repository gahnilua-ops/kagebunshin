#!/usr/bin/env node
// ============================================================
// KageBunshin MCP Server
// Multi-agent AI code improvement pipeline
// By Gahni (Isagani Goloso)
//
// Modes:
//   HTTP (Streamable) — default, for Kai 9000 and remote MCP clients
//   stdio             — MCP_STDIO=1, for local Claude Desktop etc
//   CLI               — node dist/index.js <project-root> [flags]
// ============================================================

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import express, { Request, Response } from "express";
import cors from "cors";
import { z } from "zod";
import { runKageBunshin } from "./core/orchestrator";
import { KageBunshinConfig, ProviderName } from "./core/types";
import { getAvailableProviders } from "./providers/factory";
import { ConfigStore } from "./core/config-store";
import { createConfigRoutes } from "./web/routes";

// ── DEFAULT CONFIG ────────────────────────────────────────

const DEFAULT_CONFIG: Partial<KageBunshinConfig> = {
  provider: (process.env.DEFAULT_PROVIDER as ProviderName) ?? "openrouter",
  model: process.env.DEFAULT_MODEL ?? "meta-llama/llama-3.1-8b-instruct",
  maxConcurrentClones: 10,
  cloneTokenBudget: 30000,
  dryRunApproval: false,
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
  provider: z.enum(["openrouter", "groq", "nvidia", "opencode"]).optional().default("openrouter"),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional().describe("Custom base URL override"),
  model: z.string().optional().describe("Model ID to use (provider-specific)"),
  dryRunApproval: z.boolean().optional().default(false),
  skipDeploy: z.boolean().optional().default(false),
  gitBranch: z.string().optional().default("main"),
  commitMessage: z.string().optional(),
  ignorePatterns: z.array(z.string()).optional().default([]),
  maxConcurrentClones: z.number().optional().default(10),
  cloneTokenBudget: z.number().optional().default(30000),
});

const ScanOnlySchema = z.object({
  projectRoot: z.string(),
  provider: z.enum(["openrouter", "groq", "nvidia", "opencode"]).optional().default("openrouter"),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  model: z.string().optional(),
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
          "Full KageBunshin pipeline: deploy AI clones to scan all project files in parallel, synthesize improvements, execute changes, validate with npm build, git push.",
        inputSchema: {
          type: "object",
          properties: {
            projectRoot: { type: "string", description: "Absolute path to project root on the server" },
            provider: {
              type: "string",
              enum: ["openrouter", "groq", "nvidia", "opencode"],
              description: "AI provider to use (default: openrouter)",
            },
            apiKey: { type: "string", description: "API key for the selected provider (or set via env var)" },
            baseUrl: { type: "string", description: "Custom base URL override" },
            model: { type: "string", description: "Model ID to use (provider-specific, e.g., 'anthropic/claude-sonnet-4' for openrouter)" },
            dryRunApproval: { type: "boolean", description: "Pause for approval before writing changes (default: false)" },
            skipDeploy: { type: "boolean", description: "Stop after build validation, skip git deploy (default: false)" },
            gitBranch: { type: "string", description: "Git branch to push to (default: main)" },
            commitMessage: { type: "string", description: "Git commit message" },
            ignorePatterns: { type: "array", items: { type: "string" }, description: "Additional glob patterns to ignore" },
            maxConcurrentClones: { type: "number", description: "Max parallel clone API calls (default: 10)" },
            cloneTokenBudget: { type: "number", description: "Per-clone (per-file) token ceiling to cap runaway API spend (default: 30000)" },
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
            provider: {
              type: "string",
              enum: ["openrouter", "groq", "nvidia", "opencode"],
              description: "AI provider to use (default: openrouter)",
            },
            apiKey: { type: "string", description: "API key for the selected provider" },
            baseUrl: { type: "string", description: "Custom base URL override" },
            model: { type: "string", description: "Model ID to use" },
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
          apiKey: input.apiKey ?? resolveApiKey(input.provider),
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
          apiKey: input.apiKey ?? resolveApiKey(input.provider),
          skipDeploy: true,
          dryRunApproval: false,
          tierThresholds: DEFAULT_CONFIG.tierThresholds!,
        } as KageBunshinConfig;

        const result = await runKageBunshin(config);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }

      throw new Error(`Unknown tool: ${name}`);
    } catch (err: unknown) {
      return {
        content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  });

  return server;
}

// ── HELPERS ──────────────────────────────────────────────

/** Resolve API key from env vars based on provider */
function resolveApiKey(provider: string): string {
  const envKeyMap: Record<string, string> = {
    openrouter: "OPENROUTER_API_KEY",
    groq: "GROQ_API_KEY",
    nvidia: "NVIDIA_API_KEY",
    opencode: "OPENCODE_API_KEY",
  };
  const envKey = envKeyMap[provider] ?? "AI_API_KEY";
  return process.env[envKey] ?? "";
}

// ── HTTP (Streamable) MODE (default — for Kai 9000) ──────

async function runHTTPServer(): Promise<void> {
  const PORT = parseInt(process.env.PORT ?? "3456");
  const API_KEY = process.env.KB_API_KEY; // optional bearer token auth

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "10mb" }));

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
    res.json({
      status: "ok",
      server: "kagebunshin-mcp",
      version: "0.2.0",
      providers: getAvailableProviders(),
    });
  });

  // Streamable HTTP — one MCP server + transport per client session
  const transports = new Map<string, StreamableHTTPServerTransport>();

  const handleMcpRequest = async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    let transport: StreamableHTTPServerTransport | undefined;
    if (sessionId) {
      transport = transports.get(sessionId);
      if (!transport) {
        res.status(404).json({
          jsonrpc: "2.0",
          error: { code: -32001, message: `Unknown session: ${sessionId}` },
          id: null,
        });
        return;
      }
    } else {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: true,
        onsessioninitialized: (sid) => {
          transports.set(sid, transport!);
          console.log(`[KageBunshin] MCP session initialized: ${sid}`);
        },
      });
      transport.onclose = () => {
        if (transport!.sessionId) transports.delete(transport!.sessionId);
      };
      const server = createMCPServer();
      await server.connect(transport);
    }

    try {
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error("[KageBunshin] MCP request error:", err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: `Internal error: ${(err as Error).message}` },
          id: null,
        });
      }
    }
  };

  app.post("/mcp", authMiddleware, handleMcpRequest);
  app.get("/mcp", authMiddleware, handleMcpRequest);
  app.delete("/mcp", authMiddleware, async (req: Request, res: Response) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (sessionId) {
      const transport = transports.get(sessionId);
      if (transport) {
        await transport.close();
        transports.delete(sessionId);
        console.log(`[KageBunshin] MCP session closed: ${sessionId}`);
      }
    }
    res.status(200).json({ ok: true });
  });

  // Config UI and API routes
  const configStore = new ConfigStore(process.cwd());
  app.use("/", createConfigRoutes(configStore));

  app.listen(PORT, () => {
    console.log(`🍃 KageBunshin MCP server running`);
    console.log(`   MCP endpoint  : http://localhost:${PORT}/mcp`);
    console.log(`   Health check  : http://localhost:${PORT}/health`);
    console.log(`   Config UI     : http://localhost:${PORT}/`);
    console.log(`   Auth          : ${API_KEY ? "Bearer token enabled" : "open (set KB_API_KEY to enable)"}`);
    console.log(`   Providers     : ${getAvailableProviders().join(", ")}`);
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

function parseCliArgs(args: string[]): { projectRoot: string; flags: Record<string, string | boolean> } {
  const projectRoot = args[0];
  const flags: Record<string, string | boolean> = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--scan-only" || arg === "--skip-deploy" || arg === "--no-approval") {
      flags[arg.slice(2)] = true;
    } else if (arg === "--provider" && args[i + 1]) {
      flags.provider = args[++i];
    } else if (arg === "--model" && args[i + 1]) {
      flags.model = args[++i];
    } else if (arg === "--api-key" && args[i + 1]) {
      flags["api-key"] = args[++i];
    }
  }

  return { projectRoot, flags };
}

async function runCLI(): Promise<void> {
  const args = process.argv.slice(2);
  const { projectRoot, flags } = parseCliArgs(args);

  if (!projectRoot) {
    console.error("Usage: kagebunshin <project-root> [options]");
    console.error("");
    console.error("Options:");
    console.error("  --provider <name>   AI provider (openrouter, groq, nvidia, opencode)");
    console.error("  --model <id>        Model ID (provider-specific)");
    console.error("  --api-key <key>     API key for the provider");
    console.error("  --scan-only         Skip deploy, scan only");
    console.error("  --skip-deploy       Stop after build validation");
    console.error("  --no-approval       Skip human approval prompt");
    console.error("");
    console.error("Environment variables:");
    console.error("  OPENROUTER_API_KEY  API key for OpenRouter");
    console.error("  GROQ_API_KEY        API key for Groq");
    console.error("  NVIDIA_API_KEY      API key for NVIDIA");
    console.error("  OPENCODE_API_KEY    API key for OpenCode");
    process.exit(1);
  }

  const provider = (flags.provider as ProviderName) ?? "openrouter";

  const config: KageBunshinConfig = {
    ...DEFAULT_CONFIG,
    projectRoot,
    provider,
    apiKey: (flags["api-key"] as string) ?? resolveApiKey(provider),
    model: (flags.model as string) ?? DEFAULT_CONFIG.model!,
    dryRunApproval: !flags["no-approval"],
    skipDeploy: !!flags["scan-only"] || !!flags["skip-deploy"],
    tierThresholds: DEFAULT_CONFIG.tierThresholds!,
  } as KageBunshinConfig;

  console.log(`🍃 KageBunshin using ${config.provider} (${config.model})`);

  const result = await runKageBunshin(config);
  console.log("\n📊 Final Result:");
  console.log(JSON.stringify(result, null, 2));
}

// ── ENTRY POINT ───────────────────────────────────────────

if (process.env.MCP_STDIO === "1") {
  runStdioServer().catch(console.error);
} else if (process.argv[2] && !process.argv[2].startsWith("--") && process.argv[2] !== "server") {
  runCLI().catch((err) => { console.error("Fatal:", err); process.exit(1); });
} else {
  runHTTPServer().catch(console.error);
}
