// ============================================================
// KageBunshin MCP — Config Store
// Persists all settings to a JSON file
// ============================================================

import * as fs from "fs";
import * as path from "path";
import { ProviderName } from "./types";

export interface StoredConfig {
  // Workspace
  projectRoot: string;

  // Provider settings
  provider: ProviderName;
  model: string;
  apiKey: string;
  baseUrl?: string;

  // Pipeline settings
  maxConcurrentClones: number;
  cloneTokenBudget: number;
  dryRunApproval: boolean;
  skipDeploy: boolean;

  // Git settings
  gitBranch: string;
  commitMessage: string;

  // Advanced settings
  ignorePatterns: string[];
  tierThresholds: {
    tier1MaxLines: number;
    tier2MaxLines: number;
  };

  // Server settings
  port: number;
  kbApiKey?: string;
}

const DEFAULT_STORED_CONFIG: StoredConfig = {
  projectRoot: process.cwd(),
  provider: "openrouter",
  model: "meta-llama/llama-3.1-8b-instruct",
  apiKey: "",
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
  port: 3456,
};

export class ConfigStore {
  private configPath: string;
  private config: StoredConfig;

  constructor(projectRoot: string) {
    this.configPath = path.join(projectRoot, ".kagebunshin", "config.json");
    this.config = this.load();
  }

  private load(): StoredConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, "utf-8");
        const saved = JSON.parse(raw);
        return { ...DEFAULT_STORED_CONFIG, ...saved };
      }
    } catch (err) {
      console.warn("[ConfigStore] Failed to load config, using defaults:", err);
    }
    return { ...DEFAULT_STORED_CONFIG };
  }

  save(): void {
    const dir = path.dirname(this.configPath);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), "utf-8");
  }

  getAll(): StoredConfig {
    return { ...this.config };
  }

  update(partial: Partial<StoredConfig>): StoredConfig {
    this.config = { ...this.config, ...partial };
    this.save();
    return this.getAll();
  }

  get<K extends keyof StoredConfig>(key: K): StoredConfig[K] {
    return this.config[key];
  }

  set<K extends keyof StoredConfig>(key: K, value: StoredConfig[K]): void {
    this.config[key] = value;
    this.save();
  }

  reset(): StoredConfig {
    this.config = { ...DEFAULT_STORED_CONFIG };
    this.save();
    return this.getAll();
  }
}
