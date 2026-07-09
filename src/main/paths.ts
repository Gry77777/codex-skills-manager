import os from "node:os";
import path from "node:path";

export type SkillRoots = {
  codexLocal: string;
  agentLocal: string;
  superpowersLocal: string;
  pluginCache: string;
  imported: string;
};

export function getAppDataRoot(): string {
  return process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
}

export function getStateRoot(): string {
  return path.join(getAppDataRoot(), "CodexSkillsManager");
}

export function getRegistryPath(): string {
  return path.join(getStateRoot(), "registry.json");
}

export function getAiSettingsPath(): string {
  return path.join(getStateRoot(), "ai-settings.json");
}

export function getAiAnalysisCachePath(): string {
  return path.join(getStateRoot(), "ai-analysis-cache.json");
}

export function getMarketplaceCachePath(): string {
  return path.join(getStateRoot(), "marketplace-cache.json");
}

export function getSkillScanCachePath(): string {
  return path.join(getStateRoot(), "scan-cache.json");
}

export function getImportedSkillsRoot(): string {
  return path.join(getStateRoot(), "imported-skills");
}

export function getSkillRoots(): SkillRoots {
  const home = os.homedir();

  return {
    codexLocal: path.join(home, ".codex", "skills"),
    agentLocal: path.join(home, ".agents", "skills"),
    superpowersLocal: path.join(home, ".codex", "superpowers", "skills"),
    pluginCache: path.join(home, ".codex", "plugins", "cache"),
    imported: getImportedSkillsRoot()
  };
}
