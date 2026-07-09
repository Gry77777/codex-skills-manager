export type SkillSource = "codex-local" | "agent-local" | "superpowers-local" | "plugin-cache" | "imported";

export type SkillStatus = "enabled" | "disabled" | "quarantined" | "invalid";

export type SkillIssueCode =
  | "missing-skill-md"
  | "invalid-frontmatter"
  | "duplicate-name"
  | "path-missing"
  | "unsafe-import-path"
  | "skill-md-conflict";

export type SkillIssue = {
  code: SkillIssueCode;
  message: string;
};

export type SkillConflictRole = "primary" | "shadowed";

export type SkillConflict = {
  name: string;
  role: SkillConflictRole;
  primarySkillId: string;
  primarySource: SkillSource;
  sourcePriority: number;
  relatedSkillIds: string[];
};

export type SkillRecord = {
  id: string;
  name: string;
  description: string;
  summaryZh: string;
  path: string;
  source: SkillSource;
  status: SkillStatus;
  readonly: boolean;
  canSetStatus: boolean;
  managementNote?: string;
  valid: boolean;
  issues: SkillIssue[];
  conflict?: SkillConflict;
  hash: string;
  lastScannedAt: string;
};

export type SkillSourceDiagnostic = {
  source: SkillSource;
  path: string;
  exists: boolean;
  scannedCount: number;
  invalidCount: number;
  issueCount: number;
  lastScannedAt: string;
  error?: string;
};

export type SkillScanDiagnostics = {
  roots: SkillSourceDiagnostic[];
  totalScanned: number;
  totalInvalid: number;
  lastScannedAt: string;
};

export type SkillScanResult = {
  skills: SkillRecord[];
  diagnostics: SkillScanDiagnostics;
};

export type RegistryFile = {
  version: 1;
  records: Record<string, RegistryState>;
};

export type RegistryState = {
  id: string;
  path: string;
  source: SkillSource;
  status: SkillStatus;
  hash?: string;
  lastSeenAt?: string;
};

export type SettableSkillStatus = Extract<SkillStatus, "enabled" | "disabled">;

export type BulkImportFailure = {
  path: string;
  reason: string;
};

export type BulkImportSummary = {
  imported: number;
  synced: number;
  skipped: number;
  failed: number;
  failures: BulkImportFailure[];
};

export type SkillRepairAction = {
  path: string;
  action: string;
  status: "repaired" | "skipped" | "failed";
  message: string;
};

export type SkillRepairSummary = {
  checked: number;
  repaired: number;
  skipped: number;
  failed: number;
  actions: SkillRepairAction[];
};

export type GitHubSkillCandidate = {
  id: string;
  name: string;
  description: string;
  repository: string;
  ref: string;
  path: string;
  sourceUrl: string;
  valid: boolean;
  issues: SkillIssue[];
};

export type GitHubDiscoveryResult = {
  input: string;
  repository: string;
  ref: string;
  rootPath: string;
  sourceUrl: string;
  candidates: GitHubSkillCandidate[];
};

export type MarketplaceSourceKind = "codex" | "cross-agent" | "github-topic";

export type MarketplaceSource = {
  id: string;
  name: string;
  description: string;
  url: string;
  kind: MarketplaceSourceKind;
  tags: string[];
};

export type MarketplaceSourceStatus = "external" | "not-indexed" | "indexing" | "ready" | "empty" | "error";

export type MarketplaceSourceView = MarketplaceSource & {
  status: MarketplaceSourceStatus;
  indexedCount: number;
  canIndex: boolean;
  lastIndexedAt?: string;
  error?: string;
};

export type MarketplaceSkill = {
  id: string;
  name: string;
  description: string;
  repository: string;
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  installUrl: string;
  stars?: number;
  forks?: number;
  updatedAt?: string;
  language?: string;
  tags: string[];
};

export type MarketplaceSearchInput = {
  query?: string;
  sourceId?: string;
  source?: "all" | "github-topic";
  limit?: number;
};

export type MarketplaceSearchResult = {
  sources: MarketplaceSourceView[];
  items: MarketplaceSkill[];
  fetchedAt: string;
};

export type AiProtocol = "openai-chat-completions" | "anthropic-messages";

export type AiProvider =
  | "minimax"
  | "openai"
  | "anthropic"
  | "gemini"
  | "deepseek"
  | "qwen"
  | "kimi"
  | "groq"
  | "mistral"
  | "xai"
  | "openrouter"
  | "siliconflow"
  | "custom-openai-compatible"
  | "custom-anthropic-compatible";

export type AiProviderPreset = {
  id: AiProvider;
  label: string;
  protocol: AiProtocol;
  defaultBaseUrl: string;
  defaultModel: string;
  modelSuggestions: string[];
  apiKeyLabel: string;
  helpText: string;
  isCustom?: boolean;
};

export type AiKeyStorage = "safe-storage" | "base64-fallback" | "none";

export type AiSettingsView = {
  enabled: boolean;
  provider: AiProvider;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  keyStorage: AiKeyStorage;
  updatedAt?: string;
};

export type AiSettingsInput = {
  enabled: boolean;
  provider: AiProvider;
  baseUrl: string;
  model: string;
  apiKey?: string;
  clearApiKey?: boolean;
};

export type AiConnectionTestResult = {
  ok: boolean;
  message: string;
  model?: string;
};

export type AiSkillAnalysisInput = {
  skill: Pick<
    SkillRecord,
    "id" | "name" | "description" | "summaryZh" | "source" | "status" | "valid" | "issues" | "hash"
  >;
  markdown: string;
};

export type AiRiskLevel = "low" | "medium" | "high";

export type AiSkillAnalysis = {
  summaryZh: string;
  useCases: string[];
  tags: string[];
  riskLevel: AiRiskLevel;
  risks: string[];
  dependencies: string[];
  managementAdvice: string[];
  enableRecommendation: "enable" | "keep-disabled" | "review-first";
  confidence: number;
};

export type AiSkillAnalysisRecord = {
  skillId: string;
  skillHash: string;
  analysis: AiSkillAnalysis;
  analyzedAt: string;
  provider: AiProvider;
  model: string;
};

export type AiAnalysisCacheView = {
  records: Record<string, AiSkillAnalysisRecord>;
};

export type AiBatchAnalysisResult = {
  analyzed: AiSkillAnalysisRecord[];
  skipped: Array<{
    skillId: string;
    reason: string;
  }>;
  failed: Array<{
    skillId: string;
    reason: string;
  }>;
};

export type AiBatchAnalysisProgress = {
  requestId?: string;
  stage: "preparing" | "analyzing" | "analyzed" | "skipped" | "failed" | "complete";
  total: number;
  completed: number;
  analyzed: number;
  skipped: number;
  failed: number;
  currentSkillId?: string;
  currentSkillName?: string;
  message: string;
  record?: AiSkillAnalysisRecord;
};

export type SkillsApi = {
  scanWithDiagnostics: () => Promise<SkillScanResult>;
  scan: () => Promise<SkillRecord[]>;
  list: () => Promise<SkillRecord[]>;
  setStatus: (id: string, status: SettableSkillStatus) => Promise<SkillRecord>;
  importFolder: (folderPath: string) => Promise<SkillRecord>;
  importGitHubUrl: (githubUrl: string) => Promise<SkillRecord>;
  discoverGitHubSkills: (githubUrl: string, requestId?: string) => Promise<GitHubDiscoveryResult>;
  cancelGitHubDiscovery: (requestId: string) => Promise<void>;
  importGitHubUrls: (githubUrls: string[]) => Promise<SkillRecord[]>;
  searchMarketplace: (input?: MarketplaceSearchInput) => Promise<MarketplaceSearchResult>;
  refreshMarketplaceSource: (sourceId: string, input?: MarketplaceSearchInput) => Promise<MarketplaceSearchResult>;
  importLocalSkills: () => Promise<BulkImportSummary>;
  repairBrokenSkills: () => Promise<SkillRepairSummary>;
  selectFolder: () => Promise<string | null>;
  revealInExplorer: (id: string) => Promise<void>;
  readSkillMd: (id: string) => Promise<string>;
};

export type AiApi = {
  getSettings: () => Promise<AiSettingsView>;
  saveSettings: (settings: AiSettingsInput) => Promise<AiSettingsView>;
  testConnection: (settings?: AiSettingsInput) => Promise<AiConnectionTestResult>;
  analyzeSkill: (input: AiSkillAnalysisInput) => Promise<AiSkillAnalysis>;
  getAnalysisCache: () => Promise<AiAnalysisCacheView>;
  analyzeSkills: (skillIds: string[], requestId?: string) => Promise<AiBatchAnalysisResult>;
  cancelAnalyzeSkills: (requestId: string) => Promise<void>;
  onAnalyzeSkillsProgress: (callback: (progress: AiBatchAnalysisProgress) => void) => () => void;
};
