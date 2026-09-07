// ============================================================
// KageBunshin MCP — Web Config Routes
// Express routes for configuration UI and API
// ============================================================

import { Router, Request, Response } from "express";
import * as path from "path";
import * as fs from "fs";
import { ConfigStore } from "../core/config-store";

export function createConfigRoutes(configStore: ConfigStore): Router {
  const router = Router();

  // Serve the configuration HTML page
  router.get("/", (_req: Request, res: Response) => {
    const htmlPath = path.join(__dirname, "config.html");
    const html = fs.readFileSync(htmlPath, "utf-8");
    res.type("html").send(html);
  });

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

  return router;
}
