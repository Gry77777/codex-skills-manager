import type { AiProvider, AiProviderPreset } from "./types.js";
import type { AiProtocol } from "./types.js";

export const DEFAULT_AI_PROVIDER: AiProvider = "minimax";

export const AI_PROVIDER_PRESETS: AiProviderPreset[] = [
  {
    id: "minimax",
    label: "MiniMax",
    protocol: "openai-chat-completions",
    defaultBaseUrl: "https://api.minimaxi.com/v1",
    defaultModel: "MiniMax-M3",
    modelSuggestions: ["MiniMax-M3"],
    apiKeyLabel: "MiniMax API Key",
    helpText: "适合继续使用你当前的 MiniMax API Key。"
  },
  {
    id: "openai",
    label: "OpenAI",
    protocol: "openai-chat-completions",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4.1-mini",
    modelSuggestions: ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini", "gpt-4o"],
    apiKeyLabel: "OpenAI API Key",
    helpText: "使用 OpenAI Chat Completions 兼容接口。"
  },
  {
    id: "anthropic",
    label: "Anthropic Claude",
    protocol: "anthropic-messages",
    defaultBaseUrl: "https://api.anthropic.com",
    defaultModel: "claude-sonnet-4-5",
    modelSuggestions: ["claude-sonnet-4-5", "claude-opus-4-1", "claude-haiku-4-5"],
    apiKeyLabel: "Anthropic API Key",
    helpText: "使用 Claude Messages API，适合直接接 Anthropic 或 Claude 兼容服务。"
  },
  {
    id: "gemini",
    label: "Google Gemini",
    protocol: "openai-chat-completions",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    defaultModel: "gemini-2.5-flash",
    modelSuggestions: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
    apiKeyLabel: "Gemini API Key",
    helpText: "走 Gemini 官方 OpenAI 兼容入口。"
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    protocol: "openai-chat-completions",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    modelSuggestions: ["deepseek-chat", "deepseek-reasoner"],
    apiKeyLabel: "DeepSeek API Key",
    helpText: "DeepSeek OpenAI 兼容接口。"
  },
  {
    id: "qwen",
    label: "Qwen / 阿里云百炼",
    protocol: "openai-chat-completions",
    defaultBaseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-plus",
    modelSuggestions: ["qwen-plus", "qwen-max", "qwen-turbo", "qwen3-coder-plus"],
    apiKeyLabel: "DashScope API Key",
    helpText: "阿里云百炼 DashScope OpenAI 兼容接口。"
  },
  {
    id: "kimi",
    label: "Kimi / Moonshot",
    protocol: "openai-chat-completions",
    defaultBaseUrl: "https://api.moonshot.ai/v1",
    defaultModel: "moonshot-v1-8k",
    modelSuggestions: ["moonshot-v1-8k", "moonshot-v1-32k", "moonshot-v1-128k", "kimi-k2-0905-preview"],
    apiKeyLabel: "Moonshot API Key",
    helpText: "Moonshot Kimi OpenAI 兼容接口。"
  },
  {
    id: "groq",
    label: "Groq",
    protocol: "openai-chat-completions",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "llama-3.3-70b-versatile",
    modelSuggestions: ["llama-3.3-70b-versatile", "openai/gpt-oss-120b", "qwen/qwen3-32b"],
    apiKeyLabel: "Groq API Key",
    helpText: "Groq OpenAI 兼容接口，适合快速推理。"
  },
  {
    id: "mistral",
    label: "Mistral",
    protocol: "openai-chat-completions",
    defaultBaseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-small-latest",
    modelSuggestions: ["mistral-small-latest", "mistral-medium-latest", "codestral-latest"],
    apiKeyLabel: "Mistral API Key",
    helpText: "Mistral Chat Completions 兼容接口。"
  },
  {
    id: "xai",
    label: "xAI",
    protocol: "openai-chat-completions",
    defaultBaseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-4",
    modelSuggestions: ["grok-4", "grok-3", "grok-3-mini"],
    apiKeyLabel: "xAI API Key",
    helpText: "xAI Chat Completions 接口。"
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    protocol: "openai-chat-completions",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4.1-mini",
    modelSuggestions: ["openai/gpt-4.1-mini", "anthropic/claude-sonnet-4.5", "google/gemini-2.5-flash"],
    apiKeyLabel: "OpenRouter API Key",
    helpText: "一个 Key 路由多家模型，适合统一管理不同供应商。"
  },
  {
    id: "siliconflow",
    label: "SiliconFlow",
    protocol: "openai-chat-completions",
    defaultBaseUrl: "https://api.siliconflow.cn/v1",
    defaultModel: "Qwen/Qwen3-32B",
    modelSuggestions: ["Qwen/Qwen3-32B", "deepseek-ai/DeepSeek-V3", "Pro/zai-org/GLM-4.7"],
    apiKeyLabel: "SiliconFlow API Key",
    helpText: "硅基流动 OpenAI 兼容接口，适合国内中转和模型聚合。"
  },
  {
    id: "custom-openai-compatible",
    label: "自定义 OpenAI 兼容中转站",
    protocol: "openai-chat-completions",
    defaultBaseUrl: "https://your-proxy.example.com/v1",
    defaultModel: "your-model-name",
    modelSuggestions: ["your-model-name", "gpt-4.1-mini", "claude-sonnet-4-5"],
    apiKeyLabel: "中转站 API Key",
    helpText: "适合 One API、LiteLLM、New API、OpenRouter 类网关，手动填写 Base URL 和模型名。",
    isCustom: true
  },
  {
    id: "custom-anthropic-compatible",
    label: "自定义 Anthropic 兼容中转站",
    protocol: "anthropic-messages",
    defaultBaseUrl: "https://your-proxy.example.com",
    defaultModel: "claude-sonnet-4-5",
    modelSuggestions: ["claude-sonnet-4-5", "claude-3-5-sonnet-latest"],
    apiKeyLabel: "中转站 API Key",
    helpText: "适合暴露 Anthropic Messages API 的网关，Base URL 不要包含 /v1/messages。",
    isCustom: true
  }
];

export function getAiProviderPreset(provider: AiProvider): AiProviderPreset {
  return AI_PROVIDER_PRESETS.find((preset) => preset.id === provider) ?? AI_PROVIDER_PRESETS[0];
}

export function normalizeAiProvider(value: unknown): AiProvider {
  if (value === "minimax-openai-compatible") {
    return "minimax";
  }

  return AI_PROVIDER_PRESETS.some((preset) => preset.id === value) ? (value as AiProvider) : DEFAULT_AI_PROVIDER;
}

export function getAiProtocolLabel(protocol: AiProtocol): string {
  return protocol === "anthropic-messages" ? "Anthropic Messages" : "OpenAI Chat Completions";
}
