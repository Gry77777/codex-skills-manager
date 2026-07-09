import { contextBridge, ipcRenderer } from "electron";
import type {
  AiApi,
  AiSettingsInput,
  AiSkillAnalysisInput,
  MarketplaceSearchInput,
  SettableSkillStatus,
  SkillRecord,
  SkillScanResult,
  SkillsApi
} from "../shared/types.js";

const skills: SkillsApi = {
  scanWithDiagnostics: (): Promise<SkillScanResult> => ipcRenderer.invoke("skills:scanWithDiagnostics"),
  scan: (): Promise<SkillRecord[]> => ipcRenderer.invoke("skills:scan"),
  list: (): Promise<SkillRecord[]> => ipcRenderer.invoke("skills:list"),
  setStatus: (id: string, status: SettableSkillStatus): Promise<SkillRecord> =>
    ipcRenderer.invoke("skills:setStatus", id, status),
  importFolder: (folderPath: string): Promise<SkillRecord> => ipcRenderer.invoke("skills:importFolder", folderPath),
  importGitHubUrl: (githubUrl: string): Promise<SkillRecord> => ipcRenderer.invoke("skills:importGitHubUrl", githubUrl),
  discoverGitHubSkills: (githubUrl: string, requestId?: string) => ipcRenderer.invoke("skills:discoverGitHubSkills", githubUrl, requestId),
  cancelGitHubDiscovery: (requestId: string) => ipcRenderer.invoke("skills:cancelGitHubDiscovery", requestId),
  importGitHubUrls: (githubUrls: string[]) => ipcRenderer.invoke("skills:importGitHubUrls", githubUrls),
  searchMarketplace: (input?: MarketplaceSearchInput) => ipcRenderer.invoke("skills:searchMarketplace", input),
  refreshMarketplaceSource: (sourceId: string, input?: MarketplaceSearchInput) =>
    ipcRenderer.invoke("skills:refreshMarketplaceSource", sourceId, input),
  importLocalSkills: () => ipcRenderer.invoke("skills:importLocalSkills"),
  repairBrokenSkills: () => ipcRenderer.invoke("skills:repairBrokenSkills"),
  selectFolder: (): Promise<string | null> => ipcRenderer.invoke("skills:selectFolder"),
  revealInExplorer: (id: string): Promise<void> => ipcRenderer.invoke("skills:revealInExplorer", id),
  readSkillMd: (id: string): Promise<string> => ipcRenderer.invoke("skills:readSkillMd", id)
};

contextBridge.exposeInMainWorld("skills", skills);

const ai: AiApi = {
  getSettings: () => ipcRenderer.invoke("ai:getSettings"),
  saveSettings: (settings: AiSettingsInput) => ipcRenderer.invoke("ai:saveSettings", settings),
  testConnection: (settings?: AiSettingsInput) => ipcRenderer.invoke("ai:testConnection", settings),
  analyzeSkill: (input: AiSkillAnalysisInput) => ipcRenderer.invoke("ai:analyzeSkill", input),
  getAnalysisCache: () => ipcRenderer.invoke("ai:getAnalysisCache"),
  analyzeSkills: (skillIds: string[], requestId?: string) => ipcRenderer.invoke("ai:analyzeSkills", skillIds, requestId),
  cancelAnalyzeSkills: (requestId: string) => ipcRenderer.invoke("ai:cancelAnalyzeSkills", requestId),
  onAnalyzeSkillsProgress: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: Parameters<typeof callback>[0]): void => {
      callback(progress);
    };
    ipcRenderer.on("ai:analyzeSkillsProgress", listener);
    return () => ipcRenderer.removeListener("ai:analyzeSkillsProgress", listener);
  }
};

contextBridge.exposeInMainWorld("ai", ai);
