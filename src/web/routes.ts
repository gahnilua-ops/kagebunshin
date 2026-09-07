// ============================================================
// KageBunshin MCP — Web Config Routes
// Express routes for configuration UI and API
// ============================================================

import { Router, Request, Response } from "express";
import * as path from "path";
import * as fs from "fs";
import { ConfigStore } from "../core/config-store";

// Read HTML from source directory (not dist, since HTML isn't compiled)
function getConfigHtml(): string {
  // __dirname when running from dist/web = project/dist/web
  // We want project/src/web/config.html
  const projectRoot = path.resolve(__dirname, "..", "..");
  const srcPath = path.join(projectRoot, "src", "web", "config.html");

  if (fs.existsSync(srcPath)) {
    return fs.readFileSync(srcPath, "utf-8");
  }
  return "<h1>Config UI not found</h1><p>Expected at: " + srcPath + "</p>";
}

export function createConfigRoutes(configStore: ConfigStore): Router {
  const router = Router();

  // GET /api/config — Return current config
  router.get("/api/config", (_req: Request, res: Response) => {
    res.json(configStore.getAll());
  });

  // PUT /api/config — Update config
  router.put("/api/config", (req: Request, res: Response) => {
    try {
      const updated = configStore.update(req.body);
      res.json({ success: true, config: updated });
    } catch (err) {
      res.status(400).json({
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  });

  // POST /api/config/reset — Reset to defaults
  router.post("/api/config/reset", (_req: Request, res: Response) => {
    const config = configStore.reset();
    res.json({ success: true, config });
  });

  // POST /api/chat — Send a test message to the configured provider
  router.post("/api/chat", async (req: Request, res: Response) => {
    try {
      const { message, provider, apiKey, model, baseUrl } = req.body;

      if (!message) {
        res.status(400).json({ error: "Message is required" });
        return;
      }

      // Use provided values or fall back to stored config
      const config = configStore.getAll();
      const prov = provider || config.provider;
      const key = apiKey || config.apiKey;
      const mdl = model || config.model;

      if (!key) {
        res.status(400).json({ error: "No API key configured for this provider" });
        return;
      }

      // Provider base URLs
      const urls: Record<string, string> = {
        openrouter: "https://openrouter.ai/api/v1",
        groq: "https://api.groq.com/openai/v1",
        nvidia: "https://integrate.api.nvidia.com/v1",
        opencode: "https://opencode.ai/zen/go/v1",
      };
      const url = (baseUrl || urls[prov] || urls.openrouter) + "/chat/completions";

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: mdl,
          messages: [{ role: "user", content: message }],
          max_tokens: 1024,
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        res.status(response.status).json({ error: `Provider error (${response.status}): ${errBody}` });
        return;
      }

      const data = await response.json() as any;
      const content = data.choices?.[0]?.message?.content ?? "No response";
      const usage = data.usage ?? {};

      res.json({
        content,
        model: mdl,
        provider: prov,
        usage: {
          promptTokens: usage.prompt_tokens ?? 0,
          completionTokens: usage.completion_tokens ?? 0,
          totalTokens: (usage.prompt_tokens ?? 0) + (usage.completion_tokens ?? 0),
        },
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
    }
  });



  // POST /api/restart — Restart the KageBunshin server
  router.post("/api/restart", (_req: Request, res: Response) => {
    res.json({ success: true, message: "Server restarting..." });

    const { spawn, execSync } = require("child_process");

    setTimeout(() => {
      const port = configStore.get("port") || 3456;
      const myPid = process.pid;

      // Kill whatever is on the port (old server), then start fresh
      try {
        const pids = execSync(`lsof -ti:${port}`, { encoding: "utf-8" })
          .trim().split("\n").filter(Boolean);
        for (const pid of pids) {
          if (pid !== String(myPid)) {
            try { process.kill(Number(pid), "SIGKILL"); } catch {}
          }
        }
      } catch {}

      // Also kill our own process group children
      try { process.kill(-myPid, "SIGKILL"); } catch {}

      // Small delay to let port free up
      setTimeout(() => {
        const child = spawn(process.execPath, process.argv.slice(1), {
          cwd: process.cwd(),
          detached: true,
          stdio: "ignore",
        });
        child.unref();
        console.log("[KageBunshin] Restarted with PID:", child.pid);

        // Exit current process
        process.exit(0);
      }, 500);
    }, 300);
  });

  // Serve the configuration HTML page (must be last - catch-all)
  router.get("/", (_req: Request, res: Response) => {
    res.type("html").send(getConfigHtml());
  });
  return router;
}
