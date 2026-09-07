// ============================================================
// KageBunshin MCP — Provider Interface
// Unified abstraction for OpenAI-compatible LLM APIs
// ============================================================

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionResponse {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface LLMProvider {
  /** Provider name for logging */
  readonly name: string;

  /** Base API URL */
  readonly baseUrl: string;

  /** Send a chat completion request */
  chat(
    model: string,
    messages: ChatMessage[],
    maxTokens: number
  ): Promise<ChatCompletionResponse>;
}
