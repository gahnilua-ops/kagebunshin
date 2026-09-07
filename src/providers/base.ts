// ============================================================
// KageBunshin MCP — Base OpenAI-Compatible Provider
// Shared HTTP logic for OpenAI-compatible APIs
// ============================================================

import { LLMProvider, ChatMessage, ChatCompletionResponse } from "./index";

interface OpenAIChoice {
  message: {
    content: string;
  };
}

interface OpenAIResponse {
  choices: OpenAIChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
  };
}

export class BaseOpenAIProvider implements LLMProvider {
  readonly name: string;
  readonly baseUrl: string;
  private apiKey: string;

  constructor(name: string, baseUrl: string, apiKey: string) {
    this.name = name;
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  async chat(
    model: string,
    messages: ChatMessage[],
    maxTokens: number
  ): Promise<ChatCompletionResponse> {
    const url = `${this.baseUrl}/chat/completions`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `${this.name} API error (${response.status}): ${errorBody}`
      );
    }

    const data = (await response.json()) as OpenAIResponse;
    const content = data.choices?.[0]?.message?.content ?? "";

    return {
      content,
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens:
          (data.usage?.prompt_tokens ?? 0) +
          (data.usage?.completion_tokens ?? 0),
      },
    };
  }
}
