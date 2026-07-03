import { getAiProviderPreset } from "../shared/ai-providers.js";
import type { AiProtocol } from "../shared/types.js";
import type { ResolvedAiSettings } from "./ai-settings.js";

export type AiChatMessage = {
  role: "system" | "user";
  content: string;
};

type AiClient = {
  complete(messages: AiChatMessage[], signal?: AbortSignal): Promise<string>;
};

type OpenAiChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
};

type AnthropicMessagesResponse = {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  error?: {
    message?: string;
  };
};

export function createAiClient(settings: ResolvedAiSettings): AiClient {
  const protocol = getAiProviderPreset(settings.provider).protocol;
  if (protocol === "anthropic-messages") {
    return new AnthropicMessagesClient(settings);
  }

  return new OpenAiCompatibleClient(settings);
}

class OpenAiCompatibleClient implements AiClient {
  constructor(private readonly settings: ResolvedAiSettings) {}

  async complete(messages: AiChatMessage[], signal?: AbortSignal): Promise<string> {
    const providerLabel = getAiProviderPreset(this.settings.provider).label;
    const response = await fetch(`${this.settings.baseUrl}/chat/completions`, {
      method: "POST",
      signal,
      headers: {
        Authorization: `Bearer ${this.settings.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.settings.model,
        messages,
        temperature: 0.2,
        max_tokens: 900,
        stream: false
      })
    });

    const data = await readJsonResponse<OpenAiChatCompletionResponse>(response, providerLabel);
    if (!response.ok) {
      throw new Error(data.error?.message || `${providerLabel} 请求失败：${response.status} ${response.statusText}`);
    }

    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error(`${providerLabel} 没有返回可用内容。`);
    }

    return content;
  }
}

class AnthropicMessagesClient implements AiClient {
  constructor(private readonly settings: ResolvedAiSettings) {}

  async complete(messages: AiChatMessage[], signal?: AbortSignal): Promise<string> {
    const providerLabel = getAiProviderPreset(this.settings.provider).label;
    const response = await fetch(resolveAnthropicMessagesUrl(this.settings.baseUrl), {
      method: "POST",
      signal,
      headers: {
        "x-api-key": this.settings.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: this.settings.model,
        system: messages
          .filter((message) => message.role === "system")
          .map((message) => message.content)
          .join("\n\n"),
        messages: messages
          .filter((message) => message.role !== "system")
          .map((message) => ({ role: "user", content: message.content })),
        temperature: 0.2,
        max_tokens: 900,
        stream: false
      })
    });

    const data = await readJsonResponse<AnthropicMessagesResponse>(response, providerLabel);
    if (!response.ok) {
      throw new Error(data.error?.message || `${providerLabel} 请求失败：${response.status} ${response.statusText}`);
    }

    const content = data.content
      ?.map((part) => (part.type === "text" || !part.type ? part.text?.trim() : ""))
      .filter(Boolean)
      .join("\n")
      .trim();
    if (!content) {
      throw new Error(`${providerLabel} 没有返回可用内容。`);
    }

    return content;
  }
}

async function readJsonResponse<T>(response: Response, providerLabel: string): Promise<T> {
  const raw = await response.text();
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`${providerLabel} 返回了无法解析的响应：${raw.slice(0, 180)}`);
  }
}

function resolveAnthropicMessagesUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, "");
  if (/\/v1\/messages$/i.test(normalized)) {
    return normalized;
  }

  if (/\/v1$/i.test(normalized)) {
    return `${normalized}/messages`;
  }

  return `${normalized}/v1/messages`;
}

export function getProtocolLabel(protocol: AiProtocol): string {
  return protocol === "anthropic-messages" ? "Anthropic Messages" : "OpenAI Chat Completions";
}
