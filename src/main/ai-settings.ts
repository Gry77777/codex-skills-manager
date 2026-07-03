import { safeStorage } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { AiKeyStorage, AiProvider, AiSettingsInput, AiSettingsView } from "../shared/types.js";
import { DEFAULT_AI_PROVIDER, getAiProviderPreset, normalizeAiProvider } from "../shared/ai-providers.js";
import { getAiSettingsPath } from "./paths.js";

export const DEFAULT_AI_BASE_URL = getAiProviderPreset(DEFAULT_AI_PROVIDER).defaultBaseUrl;
export const DEFAULT_AI_MODEL = getAiProviderPreset(DEFAULT_AI_PROVIDER).defaultModel;

type StoredAiSettings = {
  version: 1;
  enabled: boolean;
  provider: AiProvider;
  baseUrl: string;
  model: string;
  encryptedApiKey?: string;
  keyStorage?: AiKeyStorage;
  updatedAt: string;
};

export type ResolvedAiSettings = AiSettingsView & {
  apiKey: string;
};

export class AiSettingsStore {
  constructor(private readonly settingsPath = getAiSettingsPath()) {}

  async read(): Promise<AiSettingsView> {
    const stored = await this.readStored();
    return toSettingsView(stored);
  }

  async save(input: AiSettingsInput): Promise<AiSettingsView> {
    const existing = await this.readStored();
    const provider = normalizeAiProvider(input.provider);
    const preset = getAiProviderPreset(provider);
    const baseUrl = normalizeBaseUrl(input.baseUrl || preset.defaultBaseUrl, preset.defaultBaseUrl);
    const model = input.model.trim() || preset.defaultModel;
    const providerChanged = existing.provider !== provider;
    let encryptedApiKey = providerChanged ? undefined : existing.encryptedApiKey;
    let keyStorage = providerChanged ? "none" : existing.keyStorage ?? "none";

    if (input.clearApiKey) {
      encryptedApiKey = undefined;
      keyStorage = "none";
    }

    if (input.apiKey?.trim()) {
      const encrypted = encryptApiKey(input.apiKey.trim());
      encryptedApiKey = encrypted.value;
      keyStorage = encrypted.keyStorage;
    }

    const stored: StoredAiSettings = {
      version: 1,
      enabled: Boolean(input.enabled),
      provider,
      baseUrl,
      model,
      encryptedApiKey,
      keyStorage,
      updatedAt: new Date().toISOString()
    };

    await fs.mkdir(path.dirname(this.settingsPath), { recursive: true });
    await fs.writeFile(this.settingsPath, `${JSON.stringify(stored, null, 2)}\n`, "utf8");
    return toSettingsView(stored);
  }

  async resolve(input?: AiSettingsInput): Promise<ResolvedAiSettings> {
    const stored = await this.readStored();
    let canReuseStoredKey = true;
    const view = input
      ? (() => {
          const provider = normalizeAiProvider(input.provider);
          const preset = getAiProviderPreset(provider);
          canReuseStoredKey = stored.provider === provider;
          return {
          enabled: Boolean(input.enabled),
          provider,
          baseUrl: normalizeBaseUrl(input.baseUrl || stored.baseUrl || preset.defaultBaseUrl, preset.defaultBaseUrl),
          model: input.model.trim() || stored.model || preset.defaultModel,
          hasApiKey: Boolean(input.apiKey?.trim() || (canReuseStoredKey && stored.encryptedApiKey)),
          keyStorage: stored.keyStorage ?? "none",
          updatedAt: stored.updatedAt
          };
        })()
      : toSettingsView(stored);

    const apiKey = input?.apiKey?.trim() || (canReuseStoredKey ? decryptApiKey(stored.encryptedApiKey, stored.keyStorage) : "");
    if (!apiKey) {
      throw new Error(`请先配置 ${getAiProviderPreset(view.provider).apiKeyLabel}。`);
    }

    return { ...view, apiKey };
  }

  private async readStored(): Promise<StoredAiSettings> {
    try {
      const raw = await fs.readFile(this.settingsPath, "utf8");
      const parsed = JSON.parse(raw) as Partial<StoredAiSettings>;
      const provider = normalizeAiProvider(parsed.provider);
      const preset = getAiProviderPreset(provider);
      return {
        version: 1,
        enabled: Boolean(parsed.enabled),
        provider,
        baseUrl: normalizeBaseUrl(parsed.baseUrl || preset.defaultBaseUrl, preset.defaultBaseUrl),
        model: parsed.model?.trim() || preset.defaultModel,
        encryptedApiKey: parsed.encryptedApiKey,
        keyStorage: parsed.keyStorage ?? (parsed.encryptedApiKey ? "base64-fallback" : "none"),
        updatedAt: parsed.updatedAt ?? new Date(0).toISOString()
      };
    } catch {
      return {
        version: 1,
        enabled: false,
        provider: DEFAULT_AI_PROVIDER,
        baseUrl: DEFAULT_AI_BASE_URL,
        model: DEFAULT_AI_MODEL,
        keyStorage: "none",
        updatedAt: new Date(0).toISOString()
      };
    }
  }
}

function normalizeBaseUrl(value: string, fallback = DEFAULT_AI_BASE_URL): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  return trimmed.replace(/\/+$/, "");
}

function toSettingsView(stored: StoredAiSettings): AiSettingsView {
  return {
    enabled: stored.enabled,
    provider: stored.provider,
    baseUrl: stored.baseUrl,
    model: stored.model,
    hasApiKey: Boolean(stored.encryptedApiKey),
    keyStorage: stored.keyStorage ?? "none",
    updatedAt: stored.updatedAt
  };
}

function encryptApiKey(apiKey: string): { value: string; keyStorage: AiKeyStorage } {
  if (safeStorage.isEncryptionAvailable()) {
    return {
      value: safeStorage.encryptString(apiKey).toString("base64"),
      keyStorage: "safe-storage"
    };
  }

  return {
    value: Buffer.from(apiKey, "utf8").toString("base64"),
    keyStorage: "base64-fallback"
  };
}

function decryptApiKey(value?: string, keyStorage?: AiKeyStorage): string {
  if (!value) {
    return "";
  }

  const buffer = Buffer.from(value, "base64");
  if (keyStorage === "safe-storage") {
    return safeStorage.decryptString(buffer);
  }

  return buffer.toString("utf8");
}
