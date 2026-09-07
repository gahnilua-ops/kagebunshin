// ============================================================
// KageBunshin MCP — Provider Factory
// Creates provider instances for OpenRouter, Groq, NVIDIA, OpenCode
// ============================================================

import { BaseOpenAIProvider } from "./base";

export type ProviderName = "openrouter" | "groq" | "nvidia" | "opencode";

export interface ProviderConfig {
  /** API key for the provider */
  apiKey: string;

  /** Custom base URL override (optional) */
  baseUrl?: string;
}

/** Base URLs for each provider */
export const PROVIDER_URLS: Record<ProviderName, string> = {
  openrouter: "https://openrouter.ai/api/v1",
  groq: "https://api.groq.com/openai/v1",
  nvidia: "https://integrate.api.nvidia.com/v1",
  opencode: "https://opencode.ai/zen/go/v1",
};

/** Recommended models per provider */
export const RECOMMENDED_MODELS: Record<ProviderName, string[]> = {
  openrouter: [
    "meta-llama/llama-3.1-8b-instruct",
    "openai/gpt-4o",
    "meta-llama/llama-3.1-70b-instruct",
    "google/gemini-2.0-flash-001",
  ],
  groq: [
    "llama-3.3-70b-versatile",
    "mixtral-8x7b-32768",
    "gemma2-9b-it",
    "meta-llama/llama-4-maverick-17b-128e-instruct",
  ],
  nvidia: [
    "nvidia/llama-3.1-nemotron-70b-instruct",
    "meta/llama-3.1-70b-instruct",
    "mistralai/mixtral-8x22b-instruct-v0.1",
  ],
  opencode: [
    "kimi-k2.7-code",
    "claude-sonnet-4",
    "gpt-4o",
  ],
};

/**
 * Create a provider instance.
 * @param provider - Provider name
 * @param config - API key and optional base URL override
 * @returns BaseOpenAIProvider instance
 */
export function createProvider(
  provider: ProviderName,
  config: ProviderConfig
): BaseOpenAIProvider {
  const baseUrl = config.baseUrl ?? PROVIDER_URLS[provider];
  return new BaseOpenAIProvider(provider, baseUrl, config.apiKey);
}

/**
 * Get available provider names.
 */
export function getAvailableProviders(): ProviderName[] {
  return Object.keys(PROVIDER_URLS) as ProviderName[];
}
