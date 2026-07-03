import {
  AlertCircle,
  Archive,
  Bot,
  Boxes,
  BrainCircuit,
  Brush,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Cloud,
  Code2,
  Cpu,
  Database,
  Eye,
  EyeOff,
  ExternalLink,
  FileCode2,
  FileInput,
  FileText,
  FolderOpen,
  Github,
  Globe2,
  KeyRound,
  Layers3,
  LockKeyhole,
  Network,
  Package,
  Puzzle,
  RefreshCw,
  Rocket,
  Search,
  ServerCog,
  ShieldCheck,
  Sparkles,
  SquareTerminal,
  Workflow,
  Wrench,
  X,
  type LucideIcon
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { AI_PROVIDER_PRESETS, getAiProtocolLabel, getAiProviderPreset } from "../../shared/ai-providers";
import type {
  AiAnalysisCacheView,
  AiBatchAnalysisResult,
  AiBatchAnalysisProgress,
  AiConnectionTestResult,
  AiSettingsInput,
  AiSettingsView,
  AiSkillAnalysis,
  AiSkillAnalysisRecord,
  GitHubDiscoveryResult,
  GitHubSkillCandidate,
  MarketplaceSearchResult,
  MarketplaceSkill,
  MarketplaceSource,
  SettableSkillStatus,
  SkillRecord,
  SkillSource,
  SkillStatus
} from "../../shared/types";

type SourceFilter = "all" | SkillSource;
type StatusFilter = "all" | SkillStatus | "effective";
type SortMode = "smart" | "heat" | "usage" | "name" | "source" | "status" | "issues" | "updated";
type SkillUsageAction = "views" | "toggles" | "analyses";
type SkillUsageStats = {
  views: number;
  toggles: number;
  analyses: number;
  lastUsedAt?: string;
};
type ConfirmTone = "repair" | "enable" | "disable" | "warning";

type ConfirmDialogRequest = {
  tone: ConfirmTone;
  eyebrow: string;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  facts?: string[];
};

const pageSizeOptions = [12, 24, 48];
const usageStatsStorageKey = "codex-skills-manager:skill-usage-stats";
const defaultAiProviderPreset = getAiProviderPreset("minimax");
const defaultAiSettingsForm: AiSettingsInput = {
  enabled: false,
  provider: defaultAiProviderPreset.id,
  baseUrl: defaultAiProviderPreset.defaultBaseUrl,
  model: defaultAiProviderPreset.defaultModel,
  apiKey: ""
};

function createOperationId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const sortLabels: Record<SortMode, string> = {
  smart: "智能优先",
  heat: "热度优先",
  usage: "使用量优先",
  name: "按名称",
  source: "按来源",
  status: "按状态",
  issues: "问题优先",
  updated: "最近扫描"
};

const sourceLabels: Record<SkillSource, string> = {
  "codex-local": ".codex",
  "agent-local": ".agents",
  imported: "已导入"
};

const statusLabels: Record<SkillStatus, string> = {
  enabled: "已打开",
  disabled: "已关闭",
  quarantined: "已隔离",
  invalid: "无效"
};

const issueLabels: Record<string, string> = {
  "missing-skill-md": "缺少 SKILL.md",
  "invalid-frontmatter": "头部元信息无效",
  "duplicate-name": "名称重复",
  "path-missing": "路径不存在",
  "unsafe-import-path": "导入路径不安全",
  "skill-md-conflict": "SKILL.md 冲突"
};

function getSourceLabel(skill: SkillRecord): string {
  if (skill.source === "codex-local" && /[\\\/]\.system[\\\/]/.test(skill.path)) {
    return ".codex 系统";
  }

  return sourceLabels[skill.source];
}

type SkillVisualTone =
  | "ai"
  | "api"
  | "browser"
  | "cloud"
  | "code"
  | "data"
  | "design"
  | "docs"
  | "github"
  | "package"
  | "security"
  | "server"
  | "system"
  | "workflow";

type SkillVisual = {
  Icon: LucideIcon;
  label: string;
  tone: SkillVisualTone;
};

function getSkillVisual(skill: SkillRecord): SkillVisual {
  const haystack = `${skill.name} ${skill.description} ${skill.summaryZh} ${skill.path}`.toLowerCase();
  const match = (pattern: RegExp): boolean => pattern.test(haystack);

  if (skill.source === "codex-local" && /[\\\/]\.system[\\\/]/.test(skill.path)) {
    return { Icon: Cpu, label: "系统技能", tone: "system" };
  }

  if (match(/\b(browser|chrome|playwright|devtools|web|viewport|screenshot|dom)\b/)) {
    return { Icon: Globe2, label: "浏览器和网页", tone: "browser" };
  }

  if (match(/\b(git|github|repo|pr|issue|branch|commit)\b/)) {
    return { Icon: Github, label: "GitHub 协作", tone: "github" };
  }

  if (match(/\b(api|interface|sdk|rest|graphql|endpoint|openai|anthropic|minimax|gemini|qwen|kimi)\b/)) {
    return { Icon: Code2, label: "API 和接口", tone: "api" };
  }

  if (match(/\b(azure|cloud|storage|eventhub|cosmos|keyvault|aws|gcp|deploy|serverless)\b/)) {
    return { Icon: Cloud, label: "云服务", tone: "cloud" };
  }

  if (match(/\b(database|sql|kql|vector|chroma|faiss|pinecone|qdrant|blob|cosmos)\b/)) {
    return { Icon: Database, label: "数据能力", tone: "data" };
  }

  if (match(/\b(security|auth|identity|secret|key|token|credential|password|1password)\b/)) {
    return { Icon: LockKeyhole, label: "安全凭据", tone: "security" };
  }

  if (match(/\b(frontend|ui|ux|design|icon|image|visual|component|react|css)\b/)) {
    return { Icon: Brush, label: "界面设计", tone: "design" };
  }

  if (match(/\b(doc|docs|markdown|pdf|docx|xlsx|pptx|notion|obsidian|readme|adr)\b/)) {
    return { Icon: FileText, label: "文档处理", tone: "docs" };
  }

  if (match(/\b(ai|agent|assistant|chat|prompt|model|mcp|llm|copilot)\b/)) {
    return { Icon: Bot, label: "AI Agent", tone: "ai" };
  }

  if (match(/\b(test|review|quality|diagnose|debug|trace|error|recovery)\b/)) {
    return { Icon: ShieldCheck, label: "测试诊断", tone: "security" };
  }

  if (match(/\b(devops|docker|ci|cd|automation|server|runtime|infra)\b/)) {
    return { Icon: ServerCog, label: "工程运维", tone: "server" };
  }

  if (match(/\b(cli|terminal|shell|bash|node|python|rust|command|script|code)\b/)) {
    return { Icon: SquareTerminal, label: "命令与代码", tone: "code" };
  }

  if (match(/\b(plugin|skill|install|package|import|bundle|npm)\b/)) {
    return { Icon: Package, label: "插件和包", tone: "package" };
  }

  if (match(/\b(plan|workflow|handoff|dispatch|orchestr|pipeline|task)\b/)) {
    return { Icon: Workflow, label: "流程编排", tone: "workflow" };
  }

  if (match(/\b(research|search|arxiv|paper)\b/)) {
    return { Icon: Search, label: "检索研究", tone: "browser" };
  }

  if (match(/\b(app|element|layout|framework|module)\b/)) {
    return { Icon: Layers3, label: "应用模块", tone: "design" };
  }

  if (match(/\b(file|template|schema)\b/)) {
    return { Icon: FileCode2, label: "代码文件", tone: "code" };
  }

  if (match(/\b(open|launch|start|quickstart)\b/)) {
    return { Icon: Rocket, label: "启动引导", tone: "workflow" };
  }

  if (match(/\b(puzzle|extension|integration)\b/)) {
    return { Icon: Puzzle, label: "扩展集成", tone: "package" };
  }

  if (match(/\b(network|route|proxy|gateway)\b/)) {
    return { Icon: Network, label: "网络接入", tone: "api" };
  }

  return { Icon: Boxes, label: "通用技能", tone: "system" };
}

function getSourceMark(source: SkillSource): string {
  if (source === "codex-local") {
    return "C";
  }

  if (source === "agent-local") {
    return "A";
  }

  return "M";
}

type SkillMarkdownSummary = {
  overview: string;
  highlights: string[];
  sections: string[];
  stats: {
    sections: number;
    bullets: number;
    codeBlocks: number;
  };
};

function summarizeSkillMarkdown(markdown: string, skill: SkillRecord): SkillMarkdownSummary {
  const body = stripFrontmatter(markdown);
  const plainText = stripMarkdownSyntax(body);
  const haystack = `${skill.name} ${skill.description} ${plainText}`.toLowerCase();
  const headings = extractHeadings(body);
  const bullets = extractBullets(body);
  const highlights = inferSkillHighlights(haystack, body);
  const codeBlocks = (body.match(/```/g)?.length ?? 0) / 2;

  return {
    overview: buildSkillOverview(skill, headings.length, bullets.length, codeBlocks),
    highlights,
    sections: headings.slice(0, 5),
    stats: {
      sections: headings.length,
      bullets: bullets.length,
      codeBlocks: Math.floor(codeBlocks)
    }
  };
}

function stripFrontmatter(markdown: string): string {
  if (!markdown.startsWith("---")) {
    return markdown;
  }

  const end = markdown.indexOf("\n---", 3);
  return end === -1 ? markdown : markdown.slice(end + 4);
}

function stripMarkdownSyntax(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[[^\]]+]\([^)]*\)/g, " ")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractHeadings(markdown: string): string[] {
  return Array.from(markdown.matchAll(/^#{1,3}\s+(.+)$/gm))
    .map((match) => normalizeSnippet(match[1]))
    .filter(Boolean);
}

function extractBullets(markdown: string): string[] {
  return markdown
    .split(/\r?\n/)
    .filter((line) => /^\s*[-*+]\s+/.test(line))
    .map((line) => normalizeSnippet(line.replace(/^\s*[-*+]\s+/, "")))
    .filter(Boolean);
}

function normalizeSnippet(value: string): string {
  return value
    .replace(/[`*_#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function compactLabel(value: string, maxLength = 28): string {
  const normalized = normalizeSnippet(value);
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}...` : normalized;
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

function formatDate(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return "未知时间";
  }

  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(new Date(timestamp));
}

function isConcreteMarketplaceSkill(skill: MarketplaceSkill): boolean {
  return skill.installUrl.includes("/tree/") && skill.sourceName !== "GitHub Topic";
}

function normalizeUsageStats(value: unknown): SkillUsageStats {
  if (!value || typeof value !== "object") {
    return { views: 0, toggles: 0, analyses: 0 };
  }

  const stats = value as Partial<SkillUsageStats>;
  return {
    views: Number.isFinite(stats.views) ? Math.max(0, Number(stats.views)) : 0,
    toggles: Number.isFinite(stats.toggles) ? Math.max(0, Number(stats.toggles)) : 0,
    analyses: Number.isFinite(stats.analyses) ? Math.max(0, Number(stats.analyses)) : 0,
    lastUsedAt: typeof stats.lastUsedAt === "string" ? stats.lastUsedAt : undefined
  };
}

function readSkillUsageStats(): Record<string, SkillUsageStats> {
  if (typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(usageStatsStorageKey);
    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(parsed).map(([id, stats]) => [id, normalizeUsageStats(stats)]));
  } catch {
    return {};
  }
}

function saveSkillUsageStats(stats: Record<string, SkillUsageStats>): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(usageStatsStorageKey, JSON.stringify(stats));
  } catch {
    // Usage ranking is a convenience signal. If localStorage is unavailable, keep the app usable.
  }
}

function getLastUsedTime(stats?: SkillUsageStats): number {
  const timestamp = Date.parse(stats?.lastUsedAt ?? "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getUsageScore(stats?: SkillUsageStats): number {
  if (!stats) {
    return 0;
  }

  return stats.views + stats.toggles * 4 + stats.analyses * 3;
}

function getFreshAiRecord(
  skill: SkillRecord,
  aiAnalysisRecords: Record<string, AiSkillAnalysisRecord>
): AiSkillAnalysisRecord | null {
  const record = aiAnalysisRecords[skill.id];
  return record?.skillHash === skill.hash ? record : null;
}

function getRecencyScore(lastUsedAt?: string): number {
  if (!lastUsedAt) {
    return 0;
  }

  const timestamp = Date.parse(lastUsedAt);
  if (!Number.isFinite(timestamp)) {
    return 0;
  }

  const ageDays = (Date.now() - timestamp) / 86_400_000;
  if (ageDays <= 1) {
    return 14;
  }

  if (ageDays <= 7) {
    return 9;
  }

  if (ageDays <= 30) {
    return 4;
  }

  return 1;
}

function getKeywordScore(skill: SkillRecord): number {
  const haystack = `${skill.name} ${skill.description} ${skill.summaryZh}`.toLowerCase();
  const patterns = [
    /\b(agent|assistant|mcp|llm|prompt|ai)\b/,
    /\b(browser|chrome|playwright|devtools|web)\b/,
    /\b(api|sdk|rest|graphql|interface)\b/,
    /\b(git|github|repo|pr|issue)\b/,
    /\b(frontend|ui|react|component|design)\b/,
    /\b(test|debug|review|quality|trace)\b/,
    /\b(search|research|docs|markdown)\b/
  ];

  return patterns.reduce((score, pattern) => score + (pattern.test(haystack) ? 3 : 0), 0);
}

function getAiPriorityScore(record: AiSkillAnalysisRecord | null): number {
  if (!record) {
    return 0;
  }

  const recommendationScore: Record<AiSkillAnalysis["enableRecommendation"], number> = {
    enable: 18,
    "review-first": 7,
    "keep-disabled": -12
  };
  const riskScore: Record<AiSkillAnalysis["riskLevel"], number> = {
    low: 10,
    medium: 1,
    high: -16
  };

  return (
    recommendationScore[record.analysis.enableRecommendation] +
    riskScore[record.analysis.riskLevel] +
    Math.min(8, record.analysis.useCases.length * 2) +
    Math.min(6, record.analysis.tags.length)
  );
}

function getHeatScore(
  skill: SkillRecord,
  aiAnalysisRecords: Record<string, AiSkillAnalysisRecord>,
  usageStats: Record<string, SkillUsageStats>
): number {
  const stats = usageStats[skill.id];
  const aiRecord = getFreshAiRecord(skill, aiAnalysisRecords);
  const sourceScore: Record<SkillSource, number> = {
    "codex-local": 4,
    "agent-local": 6,
    imported: 8
  };

  return (
    (skill.valid ? 30 : -80) +
    (skill.status === "enabled" ? 24 : skill.status === "disabled" ? -4 : -28) +
    (skill.issues.length === 0 ? 12 : -skill.issues.length * 14) +
    sourceScore[skill.source] +
    getKeywordScore(skill) +
    getAiPriorityScore(aiRecord) +
    getUsageScore(stats) * 5 +
    getRecencyScore(stats?.lastUsedAt)
  );
}

function getPopularityScore(
  skill: SkillRecord,
  aiAnalysisRecords: Record<string, AiSkillAnalysisRecord>,
  usageStats: Record<string, SkillUsageStats>
): number {
  const stats = usageStats[skill.id];
  const aiRecord = getFreshAiRecord(skill, aiAnalysisRecords);

  return (
    getUsageScore(stats) * 10 +
    getRecencyScore(stats?.lastUsedAt) * 2 +
    getKeywordScore(skill) * 2 +
    getAiPriorityScore(aiRecord) +
    (skill.status === "enabled" ? 10 : 0) +
    (skill.valid ? 8 : -40) -
    skill.issues.length * 6
  );
}

function compareByName(left: SkillRecord, right: SkillRecord): number {
  return left.name.localeCompare(right.name) || left.source.localeCompare(right.source) || left.path.localeCompare(right.path);
}

function compareSkills(
  left: SkillRecord,
  right: SkillRecord,
  sortMode: SortMode,
  aiAnalysisRecords: Record<string, AiSkillAnalysisRecord>,
  usageStats: Record<string, SkillUsageStats>
): number {
  if (sortMode === "smart") {
    return (
      getHeatScore(right, aiAnalysisRecords, usageStats) - getHeatScore(left, aiAnalysisRecords, usageStats) ||
      Number(right.status === "enabled") - Number(left.status === "enabled") ||
      compareByName(left, right)
    );
  }

  if (sortMode === "heat") {
    return (
      getPopularityScore(right, aiAnalysisRecords, usageStats) -
        getPopularityScore(left, aiAnalysisRecords, usageStats) ||
      compareByName(left, right)
    );
  }

  if (sortMode === "usage") {
    const leftStats = usageStats[left.id];
    const rightStats = usageStats[right.id];
    return (
      getUsageScore(rightStats) - getUsageScore(leftStats) ||
      getLastUsedTime(rightStats) - getLastUsedTime(leftStats) ||
      compareByName(left, right)
    );
  }

  if (sortMode === "source") {
    return (
      left.source.localeCompare(right.source) ||
      left.name.localeCompare(right.name) ||
      left.path.localeCompare(right.path)
    );
  }

  if (sortMode === "status") {
    return (
      getStatusRank(left.status) - getStatusRank(right.status) ||
      left.name.localeCompare(right.name) ||
      left.path.localeCompare(right.path)
    );
  }

  if (sortMode === "issues") {
    return (
      right.issues.length - left.issues.length ||
      Number(!left.valid) - Number(!right.valid) ||
      left.name.localeCompare(right.name)
    );
  }

  if (sortMode === "updated") {
    return Date.parse(right.lastScannedAt) - Date.parse(left.lastScannedAt) || left.name.localeCompare(right.name);
  }

  return compareByName(left, right);
}

function getStatusRank(status: SkillStatus): number {
  const rank: Record<SkillStatus, number> = {
    enabled: 0,
    disabled: 1,
    quarantined: 2,
    invalid: 3
  };

  return rank[status];
}

function buildSkillOverview(skill: SkillRecord, sectionCount: number, bulletCount: number, codeBlockCount: number): string {
  const parts = [skill.summaryZh];
  const structure: string[] = [];

  if (sectionCount > 0) {
    structure.push(`${sectionCount} 个章节`);
  }

  if (bulletCount > 0) {
    structure.push(`${bulletCount} 条要点`);
  }

  if (codeBlockCount > 0) {
    structure.push(`${codeBlockCount} 段示例/代码块`);
  }

  if (structure.length > 0) {
    parts.push(`文档结构包含 ${structure.join("、")}。`);
  }

  return parts.join(" ");
}

function inferSkillHighlights(haystack: string, markdown: string): string[] {
  const highlights: string[] = [];
  const add = (condition: boolean, text: string): void => {
    if (condition && !highlights.includes(text)) {
      highlights.push(text);
    }
  };

  add(/ai|chatbot|assistant|conversation|prompt|message/.test(haystack), "适合 AI 对话、助手界面、消息流、提示输入等场景。");
  add(/\b(api|interface|sdk|module|contract|endpoint)\b/.test(haystack), "重点关注接口边界、SDK 使用方式和模块职责。");
  add(/\b(frontend|ui|ux|react|component|browser|web)\b/.test(haystack), "偏向前端体验、组件组织、页面交互或浏览器端实现。");
  add(/\b(test|testing|e2e|playwright|verify|validation)\b/.test(haystack), "包含测试、验证或回归检查相关流程。");
  add(/\b(debug|diagnose|trace|error|logs?|recovery)\b/.test(haystack), "适合排查错误、分析运行痕迹或恢复失败流程。");
  add(/\b(git|github|issue|pr|branch|review)\b/.test(haystack), "覆盖 GitHub、代码审查、Issue、PR 或协作流程。");
  add(/\b(security|threat|attack|vulnerability|scan)\b/.test(haystack), "面向安全扫描、威胁分析、漏洞定位或修复验证。");
  add(/\b(import|install|plugin|skill|mcp)\b/.test(haystack), "涉及技能、插件、MCP 或本地能力的安装与维护。");
  add(/use when|when the user|trigger/i.test(markdown), "文档里包含触发场景说明，可帮助判断什么时候应该调用该 skill。");
  add(/```/.test(markdown), "文档包含示例或命令片段，适合按步骤执行。");

  return highlights.slice(0, 4);
}

function getSkillsApi(): Window["skills"] {
  if (!window.skills) {
    throw new Error("应用桥接未加载，请重启应用。");
  }

  const requiredMethods: Array<keyof Window["skills"]> = [
    "scan",
    "list",
    "setStatus",
    "importFolder",
    "importGitHubUrl",
    "discoverGitHubSkills",
    "cancelGitHubDiscovery",
    "importGitHubUrls",
    "searchMarketplace",
    "importLocalSkills",
    "repairBrokenSkills",
    "selectFolder",
    "revealInExplorer",
    "readSkillMd"
  ];
  const missingMethods = requiredMethods.filter((method) => typeof window.skills[method] !== "function");
  if (missingMethods.length > 0) {
    throw new Error(
      `当前窗口的 Skills 桥接版本过旧，缺少 ${missingMethods.join("、")}。请完全退出并重新打开应用。`
    );
  }

  return window.skills;
}

function getAiApi(): Window["ai"] {
  if (!window.ai) {
    throw new Error("AI 桥接未加载，请重启应用。");
  }

  const requiredMethods: Array<keyof Window["ai"]> = [
    "getSettings",
    "saveSettings",
    "testConnection",
    "analyzeSkill",
    "getAnalysisCache",
    "analyzeSkills",
    "cancelAnalyzeSkills",
    "onAnalyzeSkillsProgress"
  ];
  const missingMethods = requiredMethods.filter((method) => typeof window.ai[method] !== "function");
  if (missingMethods.length > 0) {
    throw new Error(
      `当前窗口的 AI 桥接版本过旧，缺少 ${missingMethods.join("、")}。请完全退出并重新打开应用，或运行最新打包文件。`
    );
  }

  return window.ai;
}

export function App(): JSX.Element {
  const [skills, setSkills] = useState<SkillRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [skillMd, setSkillMd] = useState("");
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("smart");
  const [usageStats, setUsageStats] = useState<Record<string, SkillUsageStats>>(() => readSkillUsageStats());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(24);
  const [isLoading, setIsLoading] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [isImportingGitHub, setIsImportingGitHub] = useState(false);
  const [isDiscoveringGitHub, setIsDiscoveringGitHub] = useState(false);
  const [isGitHubDialogOpen, setIsGitHubDialogOpen] = useState(false);
  const [githubUrlInput, setGithubUrlInput] = useState("");
  const [githubDiscovery, setGithubDiscovery] = useState<GitHubDiscoveryResult | null>(null);
  const [selectedGitHubCandidateIds, setSelectedGitHubCandidateIds] = useState<string[]>([]);
  const [isMarketplaceOpen, setIsMarketplaceOpen] = useState(false);
  const [marketplaceQuery, setMarketplaceQuery] = useState("");
  const [marketplaceSourceFilter, setMarketplaceSourceFilter] = useState("all");
  const [marketplaceResult, setMarketplaceResult] = useState<MarketplaceSearchResult | null>(null);
  const [isSearchingMarketplace, setIsSearchingMarketplace] = useState(false);
  const [marketplaceInstallingId, setMarketplaceInstallingId] = useState<string | null>(null);
  const [isManagingLocal, setIsManagingLocal] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [aiSettings, setAiSettings] = useState<AiSettingsView | null>(null);
  const [aiSettingsForm, setAiSettingsForm] = useState<AiSettingsInput>(defaultAiSettingsForm);
  const [isAiSettingsOpen, setIsAiSettingsOpen] = useState(false);
  const [isSavingAiSettings, setIsSavingAiSettings] = useState(false);
  const [isTestingAiConnection, setIsTestingAiConnection] = useState(false);
  const [aiTestResult, setAiTestResult] = useState<AiConnectionTestResult | null>(null);
  const [aiAnalysisRecords, setAiAnalysisRecords] = useState<Record<string, AiSkillAnalysisRecord>>({});
  const [isAnalyzingPage, setIsAnalyzingPage] = useState(false);
  const [aiAnalysisProgress, setAiAnalysisProgress] = useState<AiBatchAnalysisProgress | null>(null);
  const [pendingAiAnalysisSkills, setPendingAiAnalysisSkills] = useState<SkillRecord[] | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const githubDiscoveryRequestIdRef = useRef<string | null>(null);
  const aiAnalysisRequestIdRef = useRef<string | null>(null);
  const confirmResolverRef = useRef<((confirmed: boolean) => void) | null>(null);

  const selectedSkill = useMemo(
    () => skills.find((skill) => skill.id === selectedId) ?? null,
    [selectedId, skills]
  );

  const filteredSkills = useMemo(() => {
    const query = search.trim().toLowerCase();

    return skills.filter((skill) => {
      const matchesSearch =
        query.length === 0 ||
        skill.name.toLowerCase().includes(query) ||
        skill.description.toLowerCase().includes(query) ||
        skill.summaryZh.toLowerCase().includes(query) ||
        skill.path.toLowerCase().includes(query);

      const matchesSource = sourceFilter === "all" || skill.source === sourceFilter;
      const matchesStatus =
        statusFilter === "all" ||
        skill.status === statusFilter ||
        (statusFilter === "effective" && skill.status === "enabled" && skill.valid);

      return matchesSearch && matchesSource && matchesStatus;
    });
  }, [skills, search, sourceFilter, statusFilter]);

  const sortedSkills = useMemo(() => {
    return [...filteredSkills].sort((left, right) =>
      compareSkills(left, right, sortMode, aiAnalysisRecords, usageStats)
    );
  }, [aiAnalysisRecords, filteredSkills, sortMode, usageStats]);

  const counts = useMemo(() => {
    return {
      total: skills.length,
      enabled: skills.filter((skill) => skill.status === "enabled" && skill.valid).length,
      disabled: skills.filter((skill) => skill.status === "disabled").length,
      imported: skills.filter((skill) => skill.source === "imported").length,
      invalid: skills.filter((skill) => !skill.valid).length
    };
  }, [skills]);

  const hasActiveFilters = search.trim().length > 0 || sourceFilter !== "all" || statusFilter !== "all";
  const activeFilterCount =
    Number(search.trim().length > 0) + Number(sourceFilter !== "all") + Number(statusFilter !== "all");

  const totalPages = Math.max(1, Math.ceil(sortedSkills.length / pageSize));
  const paginatedSkills = useMemo(() => {
    const start = (page - 1) * pageSize;
    return sortedSkills.slice(start, start + pageSize);
  }, [sortedSkills, page, pageSize]);
  const rangeStart = sortedSkills.length === 0 ? 0 : (page - 1) * pageSize + 1;
  const rangeEnd = Math.min(page * pageSize, sortedSkills.length);

  useEffect(() => {
    void loadSkills();
    void loadAiSettings();
    void loadAiAnalysisCache();
  }, []);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    try {
      unsubscribe = getAiApi().onAnalyzeSkillsProgress((progress) => {
        setAiAnalysisProgress(progress);
        const record = progress.record;
        if (record) {
          setAiAnalysisRecords((current) => ({ ...current, [record.skillId]: record }));
        }
      });
    } catch (progressError) {
      setError(progressError instanceof Error ? progressError.message : "订阅 AI 识别进度失败。");
    }

    return () => {
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    function handleSearchShortcut(event: KeyboardEvent): void {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      if (event.key === "Escape") {
        if (confirmDialog) {
          resolveConfirmDialog(false);
          return;
        }

        if (isGitHubDialogOpen) {
          closeGitHubImportDialog();
          return;
        }

        if (isMarketplaceOpen) {
          closeMarketplace();
          return;
        }

        if (search.trim().length > 0) {
          setSearch("");
          return;
        }

        if (selectedId) {
          setSelectedId(null);
        }
      }
    }

    window.addEventListener("keydown", handleSearchShortcut);
    return () => window.removeEventListener("keydown", handleSearchShortcut);
  }, [
    confirmDialog,
    isDiscoveringGitHub,
    isGitHubDialogOpen,
    isImportingGitHub,
    isMarketplaceOpen,
    isSearchingMarketplace,
    marketplaceInstallingId,
    search,
    selectedId
  ]);

  useEffect(() => {
    return () => {
      confirmResolverRef.current?.(false);
      confirmResolverRef.current = null;
    };
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, sourceFilter, statusFilter, pageSize, sortMode]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  useEffect(() => {
    if (!selectedSkill) {
      setSkillMd("");
      return;
    }

    let isCancelled = false;
    getSkillsApi()
      .readSkillMd(selectedSkill.id)
      .then((content) => {
        if (!isCancelled) {
          setSkillMd(content);
        }
      })
      .catch((readError: unknown) => {
        if (!isCancelled) {
          setSkillMd(readError instanceof Error ? readError.message : "无法读取 SKILL.md。");
        }
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedSkill]);

  async function loadSkills(): Promise<void> {
    setIsLoading(true);
    setError(null);
    setNotice(null);

    try {
      setSkills(await getSkillsApi().scan());
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "扫描技能失败。");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadAiSettings(): Promise<void> {
    try {
      const settings = await getAiApi().getSettings();
      setAiSettings(settings);
      setAiSettingsForm({
        enabled: settings.enabled,
        provider: settings.provider,
        baseUrl: settings.baseUrl,
        model: settings.model,
        apiKey: ""
      });
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : "读取 AI 设置失败。");
    }
  }

  async function loadAiAnalysisCache(): Promise<void> {
    try {
      const cache = await getAiApi().getAnalysisCache();
      setAiAnalysisRecords(cache.records);
    } catch (cacheError) {
      setError(cacheError instanceof Error ? cacheError.message : "读取 AI 识别缓存失败。");
    }
  }

  function openAiSettings(): void {
    setAiTestResult(null);
    setAiSettingsForm({
      enabled: aiSettings?.enabled ?? defaultAiSettingsForm.enabled,
      provider: aiSettings?.provider ?? defaultAiSettingsForm.provider,
      baseUrl: aiSettings?.baseUrl ?? defaultAiSettingsForm.baseUrl,
      model: aiSettings?.model ?? defaultAiSettingsForm.model,
      apiKey: ""
    });
    setIsAiSettingsOpen(true);
  }

  function updateAiSettingsForm(patch: Partial<AiSettingsInput>): void {
    setAiSettingsForm((current) => {
      if (patch.provider && patch.provider !== current.provider) {
        const preset = getAiProviderPreset(patch.provider);
        return {
          ...current,
          ...patch,
          baseUrl: preset.defaultBaseUrl,
          model: preset.defaultModel,
          apiKey: "",
          clearApiKey: false
        };
      }

      return { ...current, ...patch };
    });
    setAiTestResult(null);
  }

  async function saveAiSettings(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsSavingAiSettings(true);
    setError(null);
    setNotice(null);

    try {
      const saved = await getAiApi().saveSettings(aiSettingsForm);
      setAiSettings(saved);
      setAiSettingsForm({
        enabled: saved.enabled,
        provider: saved.provider,
        baseUrl: saved.baseUrl,
        model: saved.model,
        apiKey: ""
      });
      setIsAiSettingsOpen(false);
      setNotice(saved.enabled ? `${getAiProviderPreset(saved.provider).label} AI 设置已保存。` : "AI 识别已关闭。");
    } catch (settingsError) {
      setError(settingsError instanceof Error ? settingsError.message : "保存 AI 设置失败。");
    } finally {
      setIsSavingAiSettings(false);
    }
  }

  async function testAiConnection(): Promise<void> {
    setIsTestingAiConnection(true);
    setAiTestResult(null);
    setError(null);

    try {
      const result = await getAiApi().testConnection(aiSettingsForm);
      setAiTestResult(result);
    } catch (testError) {
      setAiTestResult({
        ok: false,
        message: testError instanceof Error ? testError.message : "AI API 测试失败。"
      });
    } finally {
      setIsTestingAiConnection(false);
    }
  }

  async function analyzeCurrentPageSkills(): Promise<void> {
    if (!aiSettings?.enabled || !aiSettings.hasApiKey) {
      setNotice(null);
      setError("请先配置并启用 AI 接入，然后再识别技能。");
      setIsAiSettingsOpen(true);
      return;
    }

    const targetSkills = paginatedSkills.filter((skill) => skill.valid);
    if (targetSkills.length === 0) {
      setError("当前页没有可识别的有效技能。");
      return;
    }

    const uncachedSkills = getUncachedAiSkills(targetSkills);
    if (uncachedSkills.length === 0) {
      setError(null);
      setNotice("当前页技能都有最新 AI 识别缓存，无需再次调用外部模型。");
      return;
    }

    setError(null);
    setNotice(null);
    setPendingAiAnalysisSkills(targetSkills);
  }

  function closeAiAnalysisConfirm(): void {
    if (!isAnalyzingPage) {
      setPendingAiAnalysisSkills(null);
    }
  }

  async function confirmAiAnalysis(): Promise<void> {
    const targetSkills = pendingAiAnalysisSkills ?? [];
    setPendingAiAnalysisSkills(null);
    await runAiAnalysis(getUncachedAiSkills(targetSkills));
  }

  async function runAiAnalysis(targetSkills: SkillRecord[]): Promise<void> {
    if (targetSkills.length === 0) {
      return;
    }

    const requestId = createOperationId("ai-analysis");
    aiAnalysisRequestIdRef.current = requestId;
    setIsAnalyzingPage(true);
    setAiAnalysisProgress({
      stage: "preparing",
      total: targetSkills.length,
      completed: 0,
      analyzed: 0,
      skipped: 0,
      failed: 0,
      message: "正在准备发送当前页技能给已配置的 AI 模型。"
    });
    setError(null);
    setNotice(null);

    try {
      const result = await getAiApi().analyzeSkills(targetSkills.map((skill) => skill.id), requestId);
      if (aiAnalysisRequestIdRef.current !== requestId) {
        return;
      }
      applyAiBatchResult(result);
      for (const record of result.analyzed) {
        recordSkillUsage(record.skillId, "analyses");
      }
      setNotice(`AI 识别完成：新增 ${result.analyzed.length} 个，跳过 ${result.skipped.length} 个，失败 ${result.failed.length} 个。`);
      if (result.failed.length > 0) {
        setError(result.failed.map((item) => item.reason).join("；"));
      }
    } catch (analysisError) {
      if (aiAnalysisRequestIdRef.current !== requestId) {
        return;
      }
      setError(analysisError instanceof Error ? analysisError.message : "AI 批量识别失败。");
    } finally {
      if (aiAnalysisRequestIdRef.current === requestId) {
        aiAnalysisRequestIdRef.current = null;
        setIsAnalyzingPage(false);
      }
    }
  }

  async function cancelAiAnalysis(): Promise<void> {
    const requestId = aiAnalysisRequestIdRef.current;
    aiAnalysisRequestIdRef.current = null;
    setIsAnalyzingPage(false);
    setAiAnalysisProgress((current) =>
      current
        ? {
            ...current,
            stage: "complete",
            message: "已停止 AI 识别。已完成的识别结果会保留，未开始的技能不会继续调用外部模型。"
          }
        : current
    );
    setNotice("已停止 AI 识别。已完成的结果已保留。");

    if (requestId) {
      try {
        await getAiApi().cancelAnalyzeSkills(requestId);
      } catch {
        // The request may already have finished between the click and the IPC call.
      }
    }
  }

  function getUncachedAiSkills(targetSkills: SkillRecord[]): SkillRecord[] {
    return targetSkills.filter((skill) => aiAnalysisRecords[skill.id]?.skillHash !== skill.hash);
  }

  function applyAiBatchResult(result: AiBatchAnalysisResult): void {
    if (result.analyzed.length === 0) {
      return;
    }

    setAiAnalysisRecords((current) => {
      const next = { ...current };
      for (const record of result.analyzed) {
        next[record.skillId] = record;
      }
      return next;
    });
  }

  function recordSkillUsage(skillId: string, action: SkillUsageAction): void {
    setUsageStats((current) => {
      const previous = current[skillId] ?? { views: 0, toggles: 0, analyses: 0 };
      const nextRecord: SkillUsageStats = {
        ...previous,
        [action]: previous[action] + 1,
        lastUsedAt: new Date().toISOString()
      };
      const next = { ...current, [skillId]: nextRecord };
      saveSkillUsageStats(next);
      return next;
    });
  }

  function clearFilters(): void {
    setSearch("");
    setSourceFilter("all");
    setStatusFilter("all");
    setPage(1);
  }

  function requestConfirm(request: ConfirmDialogRequest): Promise<boolean> {
    confirmResolverRef.current?.(false);

    return new Promise((resolve) => {
      confirmResolverRef.current = resolve;
      setConfirmDialog(request);
    });
  }

  function resolveConfirmDialog(confirmed: boolean): void {
    const resolve = confirmResolverRef.current;
    confirmResolverRef.current = null;
    setConfirmDialog(null);
    resolve?.(confirmed);
  }

  async function setStatus(skill: SkillRecord, status: SettableSkillStatus): Promise<void> {
    const previous = skills;
    setNotice(null);
    setSkills((current) => current.map((item) => (item.id === skill.id ? { ...item, status } : item)));

    try {
      const updated = await getSkillsApi().setStatus(skill.id, status);
      setSkills((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      recordSkillUsage(skill.id, "toggles");
    } catch (statusError) {
      setSkills(previous);
      setError(statusError instanceof Error ? statusError.message : "更新技能状态失败。");
    }
  }

  async function importSkill(): Promise<void> {
    setIsImporting(true);
    setError(null);
    setNotice(null);

    try {
      const folderPath = await getSkillsApi().selectFolder();
      if (!folderPath) {
        return;
      }

      await getSkillsApi().importFolder(folderPath);
      setSkills(await getSkillsApi().scan());
      setStatusFilter("disabled");
      setNotice("已导入，默认关闭。");
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "导入技能失败。");
    } finally {
      setIsImporting(false);
    }
  }

  function openMarketplace(): void {
    setIsMarketplaceOpen(true);
    setError(null);
    setNotice(null);
    if (!marketplaceResult && !isSearchingMarketplace) {
      void searchMarketplace("");
    }
  }

  function closeMarketplace(): void {
    if (marketplaceInstallingId) {
      return;
    }

    setIsMarketplaceOpen(false);
  }

  async function searchMarketplace(query = marketplaceQuery): Promise<void> {
    setIsSearchingMarketplace(true);
    setError(null);
    setNotice(null);

    try {
      const result = await getSkillsApi().searchMarketplace({ query, limit: 96 });
      setMarketplaceResult(result);
    } catch (marketplaceError) {
      setError(marketplaceError instanceof Error ? marketplaceError.message : "搜索技能广场失败。");
    } finally {
      setIsSearchingMarketplace(false);
    }
  }

  async function installMarketplaceSkill(skill: MarketplaceSkill): Promise<void> {
    if (isConcreteMarketplaceSkill(skill)) {
      setMarketplaceInstallingId(skill.id);
      setError(null);
      setNotice(null);

      try {
        await importGitHubCandidateUrls([skill.installUrl]);
        setIsMarketplaceOpen(false);
      } finally {
        setMarketplaceInstallingId(null);
      }
      return;
    }

    await installMarketplaceUrl(skill.id, skill.installUrl);
  }

  async function installMarketplaceSource(source: MarketplaceSource): Promise<void> {
    if (!source.url.startsWith("https://github.com/")) {
      window.open(source.url, "_blank", "noopener,noreferrer");
      return;
    }

    setMarketplaceSourceFilter(source.id);
    setNotice(`已切换到「${source.name}」来源。这里使用本地索引立即展示，安装具体技能时才会读取并校验 SKILL.md。`);
  }

  async function installMarketplaceUrl(id: string, url: string): Promise<void> {
    setMarketplaceInstallingId(id);
    setError(null);
    setNotice(null);

    const requestId = createOperationId("marketplace-discovery");
    githubDiscoveryRequestIdRef.current = requestId;

    try {
      const discovery = await getSkillsApi().discoverGitHubSkills(url, requestId);
      if (githubDiscoveryRequestIdRef.current !== requestId) {
        return;
      }

      const validCandidates = discovery.candidates.filter((candidate) => candidate.valid);
      if (validCandidates.length === 0) {
        setError("这个来源里没有识别到可导入的 SKILL.md。可以打开来源页面手动确认目录结构。");
        return;
      }

      if (validCandidates.length === 1) {
        await importGitHubCandidateUrls([validCandidates[0].sourceUrl]);
        setIsMarketplaceOpen(false);
        return;
      }

      setGithubUrlInput(url);
      setGithubDiscovery(discovery);
      setSelectedGitHubCandidateIds(validCandidates.map((candidate) => candidate.id));
      setIsGitHubDialogOpen(true);
      setIsMarketplaceOpen(false);
      setNotice(`技能广场识别到 ${validCandidates.length} 个可导入技能，请确认选择后导入。`);
    } catch (marketplaceError) {
      if (githubDiscoveryRequestIdRef.current !== requestId) {
        return;
      }
      setError(marketplaceError instanceof Error ? marketplaceError.message : "安装技能广场条目失败。");
    } finally {
      if (githubDiscoveryRequestIdRef.current === requestId) {
        githubDiscoveryRequestIdRef.current = null;
      }
      setMarketplaceInstallingId(null);
    }
  }

  function openGitHubImportDialog(): void {
    setGithubUrlInput("");
    setGithubDiscovery(null);
    setSelectedGitHubCandidateIds([]);
    setError(null);
    setNotice(null);
    setIsGitHubDialogOpen(true);
  }

  function closeGitHubImportDialog(): void {
    if (isDiscoveringGitHub) {
      void cancelGitHubDiscovery();
      return;
    }

    if (isImportingGitHub) {
      return;
    }

    setIsGitHubDialogOpen(false);
    setGithubUrlInput("");
    setGithubDiscovery(null);
    setSelectedGitHubCandidateIds([]);
  }

  async function cancelGitHubDiscovery(): Promise<void> {
    const requestId = githubDiscoveryRequestIdRef.current;
    githubDiscoveryRequestIdRef.current = null;
    setIsDiscoveringGitHub(false);
    setIsGitHubDialogOpen(false);
    setGithubUrlInput("");
    setGithubDiscovery(null);
    setSelectedGitHubCandidateIds([]);
    setNotice("已取消 GitHub 技能识别。");

    if (requestId) {
      try {
        await getSkillsApi().cancelGitHubDiscovery(requestId);
      } catch {
        // The request may already have finished between the click and the IPC call.
      }
    }
  }

  function updateGitHubUrlInput(value: string): void {
    setGithubUrlInput(value);
    setGithubDiscovery(null);
    setSelectedGitHubCandidateIds([]);
  }

  async function submitGitHubImport(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (githubDiscovery) {
      await importSelectedGitHubSkills();
      return;
    }

    const githubUrl = githubUrlInput.trim();

    if (!githubUrl) {
      setError("请先粘贴 GitHub 仓库、文件夹或 SKILL.md 链接。");
      return;
    }

    setIsDiscoveringGitHub(true);
    setError(null);
    setNotice(null);

    const requestId = createOperationId("github-discovery");
    githubDiscoveryRequestIdRef.current = requestId;

    try {
      const discovery = await getSkillsApi().discoverGitHubSkills(githubUrl, requestId);
      if (githubDiscoveryRequestIdRef.current !== requestId) {
        return;
      }
      const validCandidates = discovery.candidates.filter((candidate) => candidate.valid);

      if (validCandidates.length === 0) {
        setError("这个 GitHub 链接里没有找到可导入的 SKILL.md。请粘贴更具体的 skill 文件夹，或换一个仓库。");
        setGithubDiscovery(discovery);
        return;
      }

      if (validCandidates.length === 1) {
        await importGitHubCandidateUrls([validCandidates[0].sourceUrl]);
        return;
      }

      setGithubDiscovery(discovery);
      setSelectedGitHubCandidateIds(validCandidates.map((candidate) => candidate.id));
      setNotice(`已识别到 ${validCandidates.length} 个可导入技能。确认选择后再导入，导入后默认关闭。`);
    } catch (githubError) {
      if (githubDiscoveryRequestIdRef.current !== requestId) {
        return;
      }
      setError(githubError instanceof Error ? githubError.message : "识别 GitHub 技能失败。");
    } finally {
      if (githubDiscoveryRequestIdRef.current === requestId) {
        githubDiscoveryRequestIdRef.current = null;
        setIsDiscoveringGitHub(false);
      }
    }
  }

  async function importSelectedGitHubSkills(): Promise<void> {
    if (!githubDiscovery) {
      return;
    }

    const selectedCandidates = githubDiscovery.candidates.filter(
      (candidate) => candidate.valid && selectedGitHubCandidateIds.includes(candidate.id)
    );

    if (selectedCandidates.length === 0) {
      setError("请至少选择一个可导入的 GitHub 技能。");
      return;
    }

    await importGitHubCandidateUrls(selectedCandidates.map((candidate) => candidate.sourceUrl));
  }

  async function importGitHubCandidateUrls(sourceUrls: string[]): Promise<void> {
    setIsImportingGitHub(true);
    setError(null);
    setNotice(null);

    try {
      const imported = await getSkillsApi().importGitHubUrls(sourceUrls);
      setSkills(await getSkillsApi().scan());
      setSourceFilter("imported");
      setStatusFilter("disabled");
      setGithubUrlInput("");
      setGithubDiscovery(null);
      setSelectedGitHubCandidateIds([]);
      setIsGitHubDialogOpen(false);
      setNotice(`已从 GitHub 导入 ${imported.length} 个技能。远程导入默认关闭，打开后即可使用。`);
    } catch (githubError) {
      setError(githubError instanceof Error ? githubError.message : "从 GitHub 导入技能失败。");
    } finally {
      setIsImportingGitHub(false);
    }
  }

  function toggleGitHubCandidate(candidateId: string): void {
    setSelectedGitHubCandidateIds((current) =>
      current.includes(candidateId) ? current.filter((id) => id !== candidateId) : [...current, candidateId]
    );
  }

  function selectAllGitHubCandidates(): void {
    if (!githubDiscovery) {
      return;
    }

    setSelectedGitHubCandidateIds(githubDiscovery.candidates.filter((candidate) => candidate.valid).map((candidate) => candidate.id));
  }

  function clearGitHubCandidateSelection(): void {
    setSelectedGitHubCandidateIds([]);
  }

  async function importLocalSkills(): Promise<void> {
    setIsManagingLocal(true);
    setError(null);
    setNotice(null);

    try {
      const summary = await getSkillsApi().importLocalSkills();
      setSkills(await getSkillsApi().scan());
      setSourceFilter("imported");
      setStatusFilter("all");
      setNotice(
        `整理完成：新增 ${summary.imported} 个，同步 ${summary.synced} 个，跳过 ${summary.skipped} 个，失败 ${summary.failed} 个。已导入的技能会保留原始开关状态，不会关闭原技能。`
      );
    } catch (manageError) {
      setError(manageError instanceof Error ? manageError.message : "整理本机技能失败。");
    } finally {
      setIsManagingLocal(false);
    }
  }

  async function repairBrokenSkills(): Promise<void> {
    const confirmed = await requestConfirm({
      tone: "repair",
      eyebrow: "一键修复",
      title: "确认自动修复可处理的问题？",
      description: "会清理失效记录、补齐缺失 frontmatter，并把冲突文件改成备份名；不会删除任何技能目录。",
      confirmLabel: "开始修复",
      cancelLabel: "取消",
      facts: ["清理失效 registry 记录", "补齐缺失 frontmatter", "冲突文件改成备份名", "不会删除技能目录"]
    });
    if (!confirmed) {
      return;
    }

    setIsRepairing(true);
    setError(null);
    setNotice(null);

    try {
      const summary = await getSkillsApi().repairBrokenSkills();
      setSkills(await getSkillsApi().scan());
      setStatusFilter(summary.failed > 0 ? "invalid" : "all");
      setNotice(
        `修复完成：检查 ${summary.checked} 个，修复 ${summary.repaired} 项，跳过 ${summary.skipped} 项，失败 ${summary.failed} 项。`
      );
    } catch (repairError) {
      setError(repairError instanceof Error ? repairError.message : "一键修复失败。");
    } finally {
      setIsRepairing(false);
    }
  }

  return (
    <main className="app-shell">
      <aside className="side-rail" aria-label="主导航">
        <span className="rail-mark">C</span>
        <button type="button" aria-label="技能中心" className="rail-button active">
          <Archive aria-hidden="true" size={17} />
        </button>
        <button type="button" aria-label="技能广场" className="rail-button" onClick={openMarketplace}>
          <Package aria-hidden="true" size={17} />
        </button>
        <button type="button" aria-label="搜索技能" className="rail-button" onClick={() => searchInputRef.current?.focus()}>
          <Search aria-hidden="true" size={17} />
        </button>
        <button type="button" aria-label="刷新" className="rail-button" onClick={() => void loadSkills()}>
          <RefreshCw aria-hidden="true" size={17} />
        </button>
      </aside>

      <div className="app-main">
      <section className="control-panel" aria-labelledby="page-title">
        <div className="toolbar">
          <div className="toolbar-copy">
            <span className="eyebrow">本机 Skills 控制台</span>
          <h1 id="page-title">Codex 技能管理器</h1>
          <p>直接管理本机技能，也可以导入文件夹统一整理。</p>
          </div>
          <div className="toolbar-actions">
            <button className="button secondary" type="button" onClick={() => void loadSkills()} disabled={isLoading}>
              <RefreshCw aria-hidden="true" size={17} />
              寻找本地技能
            </button>
            <button
              className="button secondary repair-button"
              type="button"
              onClick={() => void repairBrokenSkills()}
              disabled={isRepairing}
            >
              <Wrench aria-hidden="true" size={17} />
              一键修复
            </button>
            <button
              className="button primary"
              type="button"
              onClick={() => void importLocalSkills()}
              disabled={isManagingLocal}
            >
              <Archive aria-hidden="true" size={17} />
              整理本机技能
            </button>
            <button className="button secondary" type="button" onClick={() => void importSkill()} disabled={isImporting}>
              <FileInput aria-hidden="true" size={17} />
              导入单个文件夹
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={openGitHubImportDialog}
              disabled={isImportingGitHub}
            >
              <Github aria-hidden="true" size={17} />
              从 GitHub 导入
            </button>
            <button className="button secondary" type="button" onClick={openMarketplace}>
              <Package aria-hidden="true" size={17} />
              技能广场
            </button>
            <button className="button secondary ai-toolbar-button" type="button" onClick={openAiSettings}>
              <BrainCircuit aria-hidden="true" size={17} />
              {aiSettings?.enabled && aiSettings.hasApiKey
                ? `${getAiProviderPreset(aiSettings.provider).label} 已启用`
                : "AI 接入"}
            </button>
          </div>
        </div>

        <section className="summary-grid" aria-label="技能概览">
          <Metric label="总数" value={counts.total} total={counts.total} tone="neutral" />
          <Metric label="已打开" value={counts.enabled} total={counts.total} tone="enabled" />
          <Metric label="有问题" value={counts.invalid} total={counts.total} tone="warning" />
        </section>

        <section className="filters" aria-label="筛选">
          <label className="search-field">
            <Search aria-hidden="true" size={18} />
            <span className="sr-only">搜索技能</span>
            <input
              ref={searchInputRef}
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索名称、作用、描述或路径"
            />
            <kbd className="search-shortcut">Ctrl K</kbd>
          </label>

          <label>
            <span>来源</span>
            <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as SourceFilter)}>
              <option value="all">全部来源</option>
              <option value="codex-local">.codex</option>
              <option value="agent-local">.agents</option>
              <option value="imported">已导入</option>
            </select>
          </label>

          <label>
            <span>状态</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
              <option value="all">全部状态</option>
              <option value="effective">仅有效启用</option>
              <option value="enabled">已打开</option>
              <option value="disabled">已关闭</option>
              <option value="invalid">无效</option>
              <option value="quarantined">已隔离</option>
            </select>
          </label>
        </section>

        <section className="quick-filters" aria-label="快速筛选">
          <QuickFilterButton label="全部" count={counts.total} active={statusFilter === "all"} onClick={() => setStatusFilter("all")} />
          <QuickFilterButton
            label="可使用"
            count={counts.enabled}
            active={statusFilter === "effective"}
            onClick={() => setStatusFilter("effective")}
          />
          <QuickFilterButton
            label="已关闭"
            count={counts.disabled}
            active={statusFilter === "disabled"}
            onClick={() => setStatusFilter("disabled")}
          />
          <QuickFilterButton
            label="有问题"
            count={counts.invalid}
            active={statusFilter === "invalid"}
            onClick={() => setStatusFilter("invalid")}
          />
        </section>
      </section>

      {error ? (
        <div className="banner" role="alert">
          <AlertCircle aria-hidden="true" size={18} />
          <span>{error}</span>
          <button type="button" aria-label="关闭错误提示" onClick={() => setError(null)}>
            <X aria-hidden="true" size={16} />
          </button>
        </div>
      ) : null}

      {notice ? (
        <div className="banner success" role="status">
          <CheckCircle2 aria-hidden="true" size={18} />
          <span>{notice}</span>
          <button type="button" aria-label="关闭提示" onClick={() => setNotice(null)}>
            <X aria-hidden="true" size={16} />
          </button>
        </div>
      ) : null}

      <section className="dashboard-layout">
        <section className="dashboard-panel dashboard-panel-installed" aria-label="已安装 Skills">
          <SkillsGrid
            skills={paginatedSkills}
            totalCount={sortedSkills.length}
            rangeStart={rangeStart}
            rangeEnd={rangeEnd}
            page={page}
            pageSize={pageSize}
            totalPages={totalPages}
            sortMode={sortMode}
            activeFilterCount={activeFilterCount}
            hasActiveFilters={hasActiveFilters}
            selectedId={selectedId}
            isLoading={isLoading}
            aiAnalysisRecords={aiAnalysisRecords}
            isAnalyzingPage={isAnalyzingPage}
            aiAnalysisProgress={aiAnalysisProgress}
            onSelect={(id) => {
              setSelectedId(id);
              recordSkillUsage(id, "views");
            }}
            onStatusChange={setStatus}
            onAnalyzePage={analyzeCurrentPageSkills}
            onCancelAnalysis={() => void cancelAiAnalysis()}
            onRequestConfirm={requestConfirm}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            onSortModeChange={setSortMode}
            onClearFilters={clearFilters}
          />
        </section>
      </section>

      {selectedSkill ? (
        <SkillDetails
          skill={selectedSkill}
          markdown={skillMd}
          aiSettings={aiSettings}
          aiRecord={
            aiAnalysisRecords[selectedSkill.id]?.skillHash === selectedSkill.hash ? aiAnalysisRecords[selectedSkill.id] : null
          }
          onClose={() => setSelectedId(null)}
          onOpenAiSettings={openAiSettings}
          onAnalysisSaved={(record) => {
            setAiAnalysisRecords((current) => ({ ...current, [record.skillId]: record }));
            recordSkillUsage(record.skillId, "analyses");
          }}
          onReveal={(skill) => void getSkillsApi().revealInExplorer(skill.id)}
        />
      ) : null}

      {isGitHubDialogOpen ? (
        <GitHubImportDialog
          value={githubUrlInput}
          discovery={githubDiscovery}
          selectedCandidateIds={selectedGitHubCandidateIds}
          isDiscovering={isDiscoveringGitHub}
          isImporting={isImportingGitHub}
          onChange={updateGitHubUrlInput}
          onToggleCandidate={toggleGitHubCandidate}
          onSelectAll={selectAllGitHubCandidates}
          onClearSelection={clearGitHubCandidateSelection}
          onCancel={closeGitHubImportDialog}
          onSubmit={submitGitHubImport}
        />
      ) : null}

      {isMarketplaceOpen ? (
        <MarketplaceDialog
          query={marketplaceQuery}
          sourceFilter={marketplaceSourceFilter}
          result={marketplaceResult}
          isSearching={isSearchingMarketplace}
          installingId={marketplaceInstallingId}
          onQueryChange={setMarketplaceQuery}
          onSourceFilterChange={setMarketplaceSourceFilter}
          onSearch={() => void searchMarketplace()}
          onClose={closeMarketplace}
          onInstallSkill={(skill) => void installMarketplaceSkill(skill)}
          onInstallSource={(source) => void installMarketplaceSource(source)}
        />
      ) : null}

      {confirmDialog ? (
        <AppConfirmDialog
          request={confirmDialog}
          onCancel={() => resolveConfirmDialog(false)}
          onConfirm={() => resolveConfirmDialog(true)}
        />
      ) : null}

      {pendingAiAnalysisSkills ? (
        <AiAnalysisConfirmDialog
          skills={pendingAiAnalysisSkills}
          cachedCount={
            pendingAiAnalysisSkills.filter((skill) => aiAnalysisRecords[skill.id]?.skillHash === skill.hash).length
          }
          onCancel={closeAiAnalysisConfirm}
          onConfirm={() => void confirmAiAnalysis()}
        />
      ) : null}

      {isAiSettingsOpen ? (
        <AiSettingsDialog
          settings={aiSettings}
          form={aiSettingsForm}
          isSaving={isSavingAiSettings}
          isTesting={isTestingAiConnection}
          testResult={aiTestResult}
          onChange={updateAiSettingsForm}
          onCancel={() => setIsAiSettingsOpen(false)}
          onTest={() => void testAiConnection()}
          onSubmit={saveAiSettings}
        />
      ) : null}
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
  total,
  tone
}: {
  label: string;
  value: number;
  total: number;
  tone: "neutral" | "enabled" | "disabled" | "managed" | "warning";
}): JSX.Element {
  const ratio = total > 0 ? Math.max(0, Math.min(100, Math.round((value / total) * 100))) : 0;
  const displayRatio = tone === "neutral" && value > 0 ? 100 : ratio;

  return (
    <div
      className="metric"
      data-tone={tone}
      style={{ "--metric-ratio": `${displayRatio}%` } as CSSProperties}
      aria-label={`${label} ${value}，占比 ${displayRatio}%`}
    >
      <div className="metric-copy">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="metric-visual" aria-hidden="true">
        <div className="metric-ring">
          <span>{displayRatio}%</span>
        </div>
        <div className="metric-bar">
          <i />
        </div>
      </div>
    </div>
  );
}

function QuickFilterButton({
  label,
  count,
  active,
  onClick
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}): JSX.Element {
  return (
    <button className={`quick-filter ${active ? "active" : ""}`} type="button" aria-pressed={active} onClick={onClick}>
      <span>{label}</span>
      <strong>{count}</strong>
    </button>
  );
}

function SkillsGrid({
  skills,
  totalCount,
  rangeStart,
  rangeEnd,
  page,
  pageSize,
  totalPages,
  sortMode,
  activeFilterCount,
  hasActiveFilters,
  selectedId,
  isLoading,
  aiAnalysisRecords,
  isAnalyzingPage,
  aiAnalysisProgress,
  onSelect,
  onStatusChange,
  onAnalyzePage,
  onCancelAnalysis,
  onRequestConfirm,
  onPageChange,
  onPageSizeChange,
  onSortModeChange,
  onClearFilters
}: {
  skills: SkillRecord[];
  totalCount: number;
  rangeStart: number;
  rangeEnd: number;
  page: number;
  pageSize: number;
  totalPages: number;
  sortMode: SortMode;
  activeFilterCount: number;
  hasActiveFilters: boolean;
  selectedId: string | null;
  isLoading: boolean;
  aiAnalysisRecords: Record<string, AiSkillAnalysisRecord>;
  isAnalyzingPage: boolean;
  aiAnalysisProgress: AiBatchAnalysisProgress | null;
  onSelect: (id: string) => void;
  onStatusChange: (skill: SkillRecord, status: SettableSkillStatus) => Promise<void>;
  onAnalyzePage: () => Promise<void>;
  onCancelAnalysis: () => void;
  onRequestConfirm: (request: ConfirmDialogRequest) => Promise<boolean>;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onSortModeChange: (sortMode: SortMode) => void;
  onClearFilters: () => void;
}): JSX.Element {
  const [isApplyingPageAction, setIsApplyingPageAction] = useState(false);
  const actionableSkills = skills.filter(canBulkToggleSkill);
  const enabledSkills = actionableSkills.filter((skill) => skill.status === "enabled");
  const disabledSkills = actionableSkills.filter((skill) => skill.status === "disabled");
  const blockedSkills = skills.filter((skill) => !canBulkToggleSkill(skill));
  const issueCount = skills.filter((skill) => skill.issues.length > 0).length;

  async function applyPageStatus(targetSkills: SkillRecord[], status: SettableSkillStatus): Promise<void> {
    if (targetSkills.length === 0 || isApplyingPageAction) {
      return;
    }

    const actionLabel = status === "enabled" ? "打开" : "关闭";
    const confirmed = await onRequestConfirm({
      tone: status === "enabled" ? "enable" : "disable",
      eyebrow: status === "enabled" ? "批量打开" : "批量关闭",
      title: `确认${actionLabel}当前页 ${targetSkills.length} 个技能？`,
      description: "这会直接重命名对应的 SKILL.md / SKILL.md.disabled 文件，让 Codex 原生加载状态真正改变。",
      confirmLabel: `${actionLabel}当前页`,
      cancelLabel: "取消",
      facts: [`将处理 ${targetSkills.length} 个有效技能`, "无效或隔离技能会自动跳过", "不会删除技能目录"]
    });
    if (!confirmed) {
      return;
    }

    setIsApplyingPageAction(true);
    try {
      for (const skill of targetSkills) {
        await onStatusChange(skill, status);
      }
    } finally {
      setIsApplyingPageAction(false);
    }
  }

  if (isLoading) {
    return <SkillGridSkeleton />;
  }

  if (skills.length === 0) {
    return (
      <div className="table-state">
        <FolderOpen aria-hidden="true" size={30} />
        <strong>没有符合当前筛选条件的技能</strong>
        <span>可以调整筛选条件，或导入一个包含 SKILL.md 的文件夹。</span>
      </div>
    );
  }

  return (
    <section className="skills-area" aria-label="技能列表">
      <div className="list-header">
        <div>
          <h2>已安装 Skills</h2>
          <p>
            显示 {rangeStart}-{rangeEnd}，共 {totalCount} 个
            {activeFilterCount > 0 ? ` · 已启用 ${activeFilterCount} 个筛选` : ""}
          </p>
        </div>
        <div className="list-tools">
          <div className="list-bulk-actions" aria-label="本页批量操作">
            <span>
              本页 {actionableSkills.length} 可操作
              {blockedSkills.length > 0 ? ` / 跳过 ${blockedSkills.length}` : ""}
              {issueCount > 0 ? ` / 问题 ${issueCount}` : ""}
            </span>
            <button
              className="mini-action"
              type="button"
              disabled={disabledSkills.length === 0 || isApplyingPageAction}
              onClick={() => void applyPageStatus(disabledSkills, "enabled")}
            >
              打开关闭项
            </button>
            <button
              className="mini-action secondary"
              type="button"
              disabled={enabledSkills.length === 0 || isApplyingPageAction}
              onClick={() => void applyPageStatus(enabledSkills, "disabled")}
            >
              关闭打开项
            </button>
            <button className="mini-action ai-mini-action" type="button" disabled={isAnalyzingPage} onClick={() => void onAnalyzePage()}>
              {isAnalyzingPage ? "AI 识别中" : "AI 识别本页"}
            </button>
          </div>
          {hasActiveFilters ? (
            <button className="text-button" type="button" onClick={onClearFilters}>
              清空筛选
            </button>
          ) : null}
          <label className="sort-control">
            <span>排序</span>
            <select value={sortMode} onChange={(event) => onSortModeChange(event.target.value as SortMode)}>
              {(Object.keys(sortLabels) as SortMode[]).map((mode) => (
                <option key={mode} value={mode}>
                  {sortLabels[mode]}
                </option>
              ))}
            </select>
          </label>
          <label className="page-size">
            <span>每页</span>
            <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <AiBatchProgressPanel progress={aiAnalysisProgress} isActive={isAnalyzingPage} onCancel={onCancelAnalysis} />

      <div className="skill-grid" role="list">
        {skills.map((skill, index) => (
          <SkillCard
            key={skill.id}
            skill={skill}
            index={index}
            isSelected={selectedId === skill.id}
            aiRecord={aiAnalysisRecords[skill.id]?.skillHash === skill.hash ? aiAnalysisRecords[skill.id] : null}
            onSelect={onSelect}
            onStatusChange={onStatusChange}
          />
        ))}
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
    </section>
  );
}

function AiBatchProgressPanel({
  progress,
  isActive,
  onCancel
}: {
  progress: AiBatchAnalysisProgress | null;
  isActive: boolean;
  onCancel: () => void;
}): JSX.Element | null {
  if (!progress) {
    return null;
  }

  const percent = progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
  const stageLabel: Record<AiBatchAnalysisProgress["stage"], string> = {
    preparing: "准备中",
    analyzing: "识别中",
    analyzed: "已识别",
    skipped: "已跳过",
    failed: "失败",
    complete: "已完成"
  };
  const currentLabel = progress.currentSkillName ?? progress.currentSkillId ?? "等待下一个技能";

  return (
    <section
      className={`ai-batch-progress ${isActive ? "active" : ""} stage-${progress.stage}`}
      aria-live="polite"
      aria-busy={isActive}
    >
      <div className="ai-batch-progress-main">
        <div className="ai-batch-copy">
          <span>{stageLabel[progress.stage]}</span>
          <h3>AI 识别技能内容</h3>
          <p>
            读取 SKILL.md 后生成中文作用、标签、风险提示和启用建议；只更新管理器里的识别缓存，不会自动打开或关闭技能。
          </p>
        </div>
        <div className="ai-batch-current">
          <span>当前</span>
          <strong title={currentLabel}>{currentLabel}</strong>
        </div>
      </div>
      <div
        className="ai-batch-meter"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.completed}
        aria-label="AI 识别进度"
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      <div className="ai-batch-footer">
        <span>{progress.message}</span>
        <div className="ai-batch-stats" aria-label="AI 识别统计">
          <strong>{percent}%</strong>
          <span>{progress.completed}/{progress.total}</span>
          <span>新增 {progress.analyzed}</span>
          <span>跳过 {progress.skipped}</span>
          <span>失败 {progress.failed}</span>
          {isActive ? (
            <button className="ai-batch-cancel" type="button" onClick={onCancel}>
              停止识别
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function SkillGridSkeleton(): JSX.Element {
  return (
    <section className="skills-area" aria-label="技能列表加载中" aria-busy="true">
      <div className="list-header">
        <div>
          <div className="skeleton-line skeleton-title" />
          <div className="skeleton-line skeleton-subtitle" />
        </div>
        <div className="skeleton-control" />
      </div>
      <div className="skill-grid skeleton-grid">
        {Array.from({ length: 8 }).map((_item, index) => (
          <div key={index} className="skill-card skeleton-card">
            <div className="skeleton-card-head">
              <div className="skeleton-avatar" />
              <div className="skeleton-stack">
                <div className="skeleton-line skeleton-pill" />
                <div className="skeleton-line skeleton-name" />
              </div>
              <div className="skeleton-switch" />
            </div>
            <div className="skeleton-line skeleton-purpose" />
            <div className="skeleton-line skeleton-purpose short" />
            <div className="skeleton-line skeleton-path" />
          </div>
        ))}
      </div>
    </section>
  );
}

function canBulkToggleSkill(skill: SkillRecord): boolean {
  return skill.valid && (skill.status === "enabled" || skill.status === "disabled");
}

function SkillAvatar({ skill, detail = false }: { skill: SkillRecord; detail?: boolean }): JSX.Element {
  const visual = getSkillVisual(skill);
  const Icon = visual.Icon;

  return (
    <div
      className={`skill-avatar avatar-${skill.source} avatar-tone-${visual.tone} ${detail ? "detail-avatar" : ""}`}
      title={visual.label}
      aria-hidden="true"
    >
      <Icon size={detail ? 22 : 18} strokeWidth={2.2} />
      <span className="avatar-source-mark">{getSourceMark(skill.source)}</span>
    </div>
  );
}

function SkillCard({
  skill,
  index,
  isSelected,
  aiRecord,
  onSelect,
  onStatusChange
}: {
  skill: SkillRecord;
  index: number;
  isSelected: boolean;
  aiRecord: AiSkillAnalysisRecord | null;
  onSelect: (id: string) => void;
  onStatusChange: (skill: SkillRecord, status: SettableSkillStatus) => Promise<void>;
}): JSX.Element {
  const visual = getSkillVisual(skill);
  const summary = aiRecord?.analysis.summaryZh ?? skill.summaryZh;

  return (
    <article
      className={`skill-card status-card-${skill.status} ${isSelected ? "selected" : ""}`}
      style={{ "--card-index": String(index) } as CSSProperties}
      role="listitem"
      tabIndex={0}
      aria-label={`${skill.name}，${statusLabels[skill.status]}`}
      onClick={() => onSelect(skill.id)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(skill.id);
        }
      }}
    >
      <div className="skill-card-topline">
        <div className="skill-card-type">
          <SkillAvatar skill={skill} />
          <div className="skill-card-kicker">
            <span className={`source-pill source-${skill.source}`}>{getSourceLabel(skill)}</span>
            <span className="skill-visual-label">{visual.label}</span>
          </div>
        </div>
        <div className="skill-card-action" onClick={(event) => event.stopPropagation()}>
          <SkillUsageSwitch skill={skill} onStatusChange={onStatusChange} />
        </div>
      </div>

      <div className="skill-card-name-row">
        <h3 title={skill.name}>{skill.name}</h3>
        {skill.valid && skill.status === "enabled" ? <CheckCircle2 aria-hidden="true" size={15} /> : null}
      </div>

      <div className="skill-purpose">
        <span>作用</span>
        <p>{summary}</p>
      </div>

      {aiRecord ? <SkillCardAiInsight record={aiRecord} /> : null}

      <div className="skill-card-footer">
        <span className={`status-pill status-${skill.status}`}>{statusLabels[skill.status]}</span>
        <span className={`issue-pill ${skill.issues.length > 0 ? "has-issues" : ""}`}>问题 {skill.issues.length}</span>
      </div>

      <div className="skill-card-path" title={skill.path}>
        <span>路径</span>
        <code>{skill.path}</code>
      </div>
    </article>
  );
}

function SkillCardAiInsight({ record }: { record: AiSkillAnalysisRecord }): JSX.Element {
  const riskLabel: Record<AiSkillAnalysis["riskLevel"], string> = {
    low: "低风险",
    medium: "中风险",
    high: "高风险"
  };
  const recommendationLabel: Record<AiSkillAnalysis["enableRecommendation"], string> = {
    enable: "可打开",
    "keep-disabled": "保持关闭",
    "review-first": "先审查"
  };
  const visibleTags = record.analysis.tags.slice(0, 3);

  return (
    <div className="skill-card-ai">
      <div className="skill-card-ai-row">
        <span className={`ai-risk ai-risk-${record.analysis.riskLevel}`}>{riskLabel[record.analysis.riskLevel]}</span>
        <span>{recommendationLabel[record.analysis.enableRecommendation]}</span>
      </div>
      {visibleTags.length > 0 ? (
        <div className="skill-card-ai-tags">
          {visibleTags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  onPageChange
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}): JSX.Element {
  const pages = getVisiblePages(page, totalPages);

  return (
    <nav className="pagination" aria-label="分页">
      <button
        className="page-button icon-page-button"
        type="button"
        aria-label="上一页"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft aria-hidden="true" size={16} />
      </button>
      <div className="page-numbers">
        {pages.map((item, index) =>
          item === "…" ? (
            <span key={`ellipsis-${index}`} className="page-ellipsis">
              ...
            </span>
          ) : (
            <button
              key={item}
              className={`page-button ${item === page ? "active" : ""}`}
              type="button"
              aria-current={item === page ? "page" : undefined}
              onClick={() => onPageChange(item)}
            >
              {item}
            </button>
          )
        )}
      </div>
      <button
        className="page-button icon-page-button"
        type="button"
        aria-label="下一页"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        <ChevronRight aria-hidden="true" size={16} />
      </button>
    </nav>
  );
}

function getVisiblePages(page: number, totalPages: number): Array<number | "…"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_item, index) => index + 1);
  }

  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  const visible = [...pages].filter((item) => item >= 1 && item <= totalPages).sort((a, b) => a - b);
  const result: Array<number | "…"> = [];

  for (const item of visible) {
    const previous = result[result.length - 1];
    if (typeof previous === "number" && item - previous > 1) {
      result.push("…");
    }
    result.push(item);
  }

  return result;
}

function SkillUsageSwitch({
  skill,
  onStatusChange
}: {
  skill: SkillRecord;
  onStatusChange: (skill: SkillRecord, status: SettableSkillStatus) => Promise<void>;
}): JSX.Element {
  const canToggle = skill.valid && skill.status !== "quarantined" && skill.status !== "invalid";
  const isEnabled = skill.status === "enabled";

  if (!canToggle) {
    return <span className="blocked-switch">{statusLabels[skill.status]}</span>;
  }

  return (
    <button
      className={`usage-switch ${isEnabled ? "is-on" : "is-off"}`}
      type="button"
      role="switch"
      aria-checked={isEnabled}
      aria-label={`${isEnabled ? "关闭" : "打开"} ${skill.name}`}
      onClick={() => void onStatusChange(skill, isEnabled ? "disabled" : "enabled")}
    >
      <span className="usage-track" aria-hidden="true">
        <span className="usage-knob" />
      </span>
      <span className="usage-label">{isEnabled ? "已打开" : "已关闭"}</span>
    </button>
  );
}

function AppConfirmDialog({
  request,
  onCancel,
  onConfirm
}: {
  request: ConfirmDialogRequest;
  onCancel: () => void;
  onConfirm: () => void;
}): JSX.Element {
  const toneIcon: Record<ConfirmTone, JSX.Element> = {
    repair: <Wrench aria-hidden="true" size={24} />,
    enable: <Archive aria-hidden="true" size={24} />,
    disable: <Archive aria-hidden="true" size={24} />,
    warning: <AlertCircle aria-hidden="true" size={24} />
  };
  const toneNote: Record<ConfirmTone, string> = {
    repair: "修复只处理可自动恢复的问题，不会删除原始技能目录。",
    enable: "打开后 Codex 后续启动扫描时会重新看到这些技能。",
    disable: "关闭后会保留目录，仅让 SKILL.md 暂时不被 Codex 加载。",
    warning: "请确认影响范围后再继续。"
  };

  return (
    <div className="modal-backdrop app-confirm-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        className={`app-confirm-dialog tone-${request.tone}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-confirm-title"
        aria-describedby="app-confirm-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="app-confirm-topline" aria-hidden="true" />
        <div className="app-confirm-header">
          <div className="app-confirm-icon" aria-hidden="true">
            {toneIcon[request.tone]}
          </div>
          <div>
            <span>{request.eyebrow}</span>
            <h2 id="app-confirm-title">{request.title}</h2>
            <p id="app-confirm-description">{request.description}</p>
          </div>
          <button className="icon-button" type="button" aria-label="关闭确认弹窗" onClick={onCancel}>
            <X aria-hidden="true" size={18} />
          </button>
        </div>

        {request.facts?.length ? (
          <div className="app-confirm-facts" aria-label="操作影响">
            {request.facts.map((fact) => (
              <div key={fact}>
                <CheckCircle2 aria-hidden="true" size={15} />
                <span>{fact}</span>
              </div>
            ))}
          </div>
        ) : null}

        <div className="app-confirm-note">
          <AlertCircle aria-hidden="true" size={17} />
          <span>{toneNote[request.tone]}</span>
        </div>

        <div className="app-confirm-actions">
          <button className="button secondary" type="button" onClick={onCancel}>
            {request.cancelLabel ?? "取消"}
          </button>
          <button className="button primary" type="button" onClick={onConfirm} autoFocus>
            {request.tone === "repair" ? <Wrench aria-hidden="true" size={17} /> : <CheckCircle2 aria-hidden="true" size={17} />}
            {request.confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}

function AiAnalysisConfirmDialog({
  skills,
  cachedCount,
  onCancel,
  onConfirm
}: {
  skills: SkillRecord[];
  cachedCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}): JSX.Element {
  const totalCount = skills.length;
  const analyzeCount = Math.max(0, totalCount - cachedCount);

  return (
    <div className="modal-backdrop ai-confirm-backdrop" role="presentation" onMouseDown={onCancel}>
      <section
        className="ai-confirm-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-confirm-title"
        aria-describedby="ai-confirm-description"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="ai-confirm-header">
          <div className="ai-confirm-icon" aria-hidden="true">
            <BrainCircuit size={24} />
          </div>
          <div>
            <span>AI 接入</span>
            <h2 id="ai-confirm-title">识别当前页技能</h2>
            <p id="ai-confirm-description">
              AI 会读取每个 SKILL.md，生成中文作用、标签、风险提示和启用建议，方便你判断哪些技能适合打开。
            </p>
          </div>
          <button className="icon-button" type="button" aria-label="关闭 AI 识别确认" onClick={onCancel}>
            <X aria-hidden="true" size={18} />
          </button>
        </div>

        <div className="ai-confirm-metrics" aria-label="本次 AI 识别统计">
          <div>
            <span>本页有效技能</span>
            <strong>{totalCount}</strong>
          </div>
          <div>
            <span>需要调用 AI</span>
            <strong>{analyzeCount}</strong>
          </div>
          <div>
            <span>直接复用缓存</span>
            <strong>{cachedCount}</strong>
          </div>
        </div>

        <div className="ai-confirm-checks">
          <div>
            <CheckCircle2 aria-hidden="true" size={16} />
            <span>只更新管理器的 AI 识别缓存。</span>
          </div>
          <div>
            <CheckCircle2 aria-hidden="true" size={16} />
            <span>已有最新缓存的技能会自动跳过。</span>
          </div>
          <div>
            <CheckCircle2 aria-hidden="true" size={16} />
            <span>识别过程中会显示实时进度和当前技能。</span>
          </div>
        </div>

        <div className="ai-confirm-warning">
          <AlertCircle aria-hidden="true" size={17} />
          <span>不会自动打开或关闭技能，也不会修改原始 SKILL.md 文件。</span>
        </div>

        <div className="ai-confirm-actions">
          <button className="button secondary" type="button" onClick={onCancel}>
            先不识别
          </button>
          <button className="button primary" type="button" onClick={onConfirm} autoFocus>
            <Sparkles aria-hidden="true" size={17} />
            开始识别 {analyzeCount} 个
          </button>
        </div>
      </section>
    </div>
  );
}

function MarketplaceDialog({
  query,
  sourceFilter,
  result,
  isSearching,
  installingId,
  onQueryChange,
  onSourceFilterChange,
  onSearch,
  onClose,
  onInstallSkill,
  onInstallSource
}: {
  query: string;
  sourceFilter: string;
  result: MarketplaceSearchResult | null;
  isSearching: boolean;
  installingId: string | null;
  onQueryChange: (query: string) => void;
  onSourceFilterChange: (sourceId: string) => void;
  onSearch: () => void;
  onClose: () => void;
  onInstallSkill: (skill: MarketplaceSkill) => void;
  onInstallSource: (source: MarketplaceSource) => void;
}): JSX.Element {
  const isBusy = isSearching || Boolean(installingId);
  const sources = result?.sources ?? [];
  const items = result?.items ?? [];
  const selectedSource = sources.find((source) => source.id === sourceFilter);
  const visibleItems = selectedSource ? items.filter((item) => item.sourceName === selectedSource.name) : items;
  const totalStars = items.reduce((total, item) => total + (item.stars ?? 0), 0);

  function submitSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSearch();
  }

  return (
    <div className="modal-backdrop marketplace-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="marketplace-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="marketplace-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="marketplace-header">
          <div className="marketplace-title">
            <div className="marketplace-icon" aria-hidden="true">
              <Sparkles size={22} />
            </div>
            <div>
              <span>在线 Skills 广场</span>
              <h2 id="marketplace-title">发现并导入网上技能</h2>
              <p>先识别 SKILL.md，再复制到托管目录；导入后默认关闭，由你手动打开。</p>
            </div>
          </div>
          <div className="marketplace-header-stats" aria-label="技能广场概览">
            <span>
              <strong>{sources.length}</strong>
              来源
            </span>
            <span>
              <strong>{items.length}</strong>
              候选
            </span>
            <span>
              <strong>{formatCompactNumber(totalStars)}</strong>
              Stars
            </span>
          </div>
          <button className="icon-button" type="button" aria-label="关闭技能广场" onClick={onClose} disabled={Boolean(installingId)}>
            <X aria-hidden="true" size={18} />
          </button>
        </div>

        <form className="marketplace-search" onSubmit={submitSearch}>
          <label className="marketplace-search-field">
            <Search aria-hidden="true" size={18} />
            <span className="sr-only">搜索网上技能</span>
            <input
              autoFocus
              type="search"
              value={query}
              placeholder="搜索浏览器、GitHub、PDF、DevOps、research..."
              onChange={(event) => onQueryChange(event.target.value)}
              disabled={isBusy}
            />
          </label>
          <button className="button primary" type="submit" disabled={isBusy}>
            <Search aria-hidden="true" size={17} />
            {isSearching ? (items.length > 0 ? "刷新中..." : "搜索中...") : "搜索"}
          </button>
        </form>

        <div className="marketplace-safety-strip" role="note">
          <ShieldCheck aria-hidden="true" size={16} />
          <span>所有在线技能都会先识别 `SKILL.md`，安装到托管目录后保持关闭，不会自动启用或执行脚本。</span>
        </div>

        <div className="marketplace-body">
          <section className="marketplace-sources" aria-label="内置技能来源">
            <div className="marketplace-section-title">
              <h3>内置来源</h3>
              <button
                className={`marketplace-filter-pill ${sourceFilter === "all" ? "active" : ""}`}
                type="button"
                onClick={() => onSourceFilterChange("all")}
                disabled={isBusy}
              >
                全部来源
              </button>
            </div>
            <div className="marketplace-source-grid">
              {sources.map((source) => (
                <MarketplaceSourceCard
                  key={source.id}
                  source={source}
                  isBusy={isBusy}
                  isInstalling={installingId === source.id}
                  isActive={sourceFilter === source.id}
                  onInstall={() => onInstallSource(source)}
                />
              ))}
            </div>
          </section>

          <section className="marketplace-results" aria-label="在线技能搜索结果">
            <div className="marketplace-section-title">
              <h3>在线技能结果</h3>
              <span>
                {isSearching
                  ? visibleItems.length > 0
                    ? "正在后台刷新..."
                    : "正在快速索引技能仓库..."
                  : result
                    ? `找到 ${visibleItems.length} 个候选`
                    : "打开后会自动加载热门技能"}
              </span>
            </div>

            {visibleItems.length > 0 ? (
              <div className="marketplace-result-grid" role="list">
                {visibleItems.map((skill) => (
                  <MarketplaceSkillCard
                    key={skill.id}
                    skill={skill}
                    isBusy={isBusy}
                    isInstalling={installingId === skill.id}
                    onInstall={() => onInstallSkill(skill)}
                  />
                ))}
              </div>
            ) : (
              <div className="marketplace-empty" role="status">
                <Package aria-hidden="true" size={28} />
                <strong>{isSearching ? "正在搜索..." : "暂无搜索结果"}</strong>
                <span>换一个关键词，或直接从内置来源识别 GitHub 仓库。</span>
              </div>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}

function MarketplaceSourceCard({
  source,
  isBusy,
  isInstalling,
  isActive,
  onInstall
}: {
  source: MarketplaceSource;
  isBusy: boolean;
  isInstalling: boolean;
  isActive: boolean;
  onInstall: () => void;
}): JSX.Element {
  const canInstall = source.url.startsWith("https://github.com/");
  const sourceIcon = source.kind === "codex" ? <Code2 aria-hidden="true" size={18} /> : source.kind === "github-topic" ? <Github aria-hidden="true" size={18} /> : <Globe2 aria-hidden="true" size={18} />;

  return (
    <article className={`marketplace-source-card ${isActive ? "active" : ""}`}>
      <div className="marketplace-source-head">
        <span className={`marketplace-source-icon source-kind-${source.kind}`}>{sourceIcon}</span>
        <div>
          <strong>{source.name}</strong>
          <small>{source.kind === "codex" ? "Codex 精选" : source.kind === "github-topic" ? "GitHub 发现" : "跨 Agent 目录"}</small>
        </div>
      </div>
      <div className="marketplace-source-copy">
        <p>{source.description}</p>
      </div>
      <div className="marketplace-tags">
        {source.tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
      <button className="mini-action" type="button" onClick={onInstall} disabled={isBusy || isActive}>
        {canInstall ? <Github aria-hidden="true" size={15} /> : <ExternalLink aria-hidden="true" size={15} />}
        {isInstalling ? "处理中..." : canInstall ? (isActive ? "正在查看" : "查看已索引") : "打开网站"}
      </button>
    </article>
  );
}

function MarketplaceSkillCard({
  skill,
  isBusy,
  isInstalling,
  onInstall
}: {
  skill: MarketplaceSkill;
  isBusy: boolean;
  isInstalling: boolean;
  onInstall: () => void;
}): JSX.Element {
  return (
    <article className="marketplace-skill-card" role="listitem">
      <div className="marketplace-skill-head">
        <span className="marketplace-skill-icon">
          <Github aria-hidden="true" size={18} />
        </span>
        <div>
          <strong title={skill.name}>{skill.name}</strong>
          <span>{skill.sourceName}</span>
        </div>
      </div>
      <p>{skill.description}</p>
      <div className="marketplace-skill-meta">
        {typeof skill.stars === "number" ? <span>{formatCompactNumber(skill.stars)} stars</span> : null}
        {skill.language ? <span>{skill.language}</span> : null}
        {skill.updatedAt ? <span>{formatDate(skill.updatedAt)}</span> : null}
      </div>
      {skill.tags.length > 0 ? (
        <div className="marketplace-tags">
          {skill.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      ) : null}
      <div className="marketplace-skill-actions">
        <button className="mini-action" type="button" onClick={onInstall} disabled={isBusy}>
          <Archive aria-hidden="true" size={15} />
          {isInstalling ? (isConcreteMarketplaceSkill(skill) ? "安装中..." : "识别中...") : "安装"}
        </button>
        <button
          className="text-button"
          type="button"
          onClick={() => window.open(skill.sourceUrl, "_blank", "noopener,noreferrer")}
          disabled={isBusy}
        >
          查看来源
        </button>
      </div>
    </article>
  );
}

function GitHubImportDialog({
  value,
  discovery,
  selectedCandidateIds,
  isDiscovering,
  isImporting,
  onChange,
  onToggleCandidate,
  onSelectAll,
  onClearSelection,
  onCancel,
  onSubmit
}: {
  value: string;
  discovery: GitHubDiscoveryResult | null;
  selectedCandidateIds: string[];
  isDiscovering: boolean;
  isImporting: boolean;
  onChange: (value: string) => void;
  onToggleCandidate: (candidateId: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  onCancel: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}): JSX.Element {
  const validCandidates = discovery?.candidates.filter((candidate) => candidate.valid) ?? [];
  const selectedCount = validCandidates.filter((candidate) => selectedCandidateIds.includes(candidate.id)).length;
  const isBusy = isDiscovering || isImporting;
  const canSubmit = discovery ? selectedCount > 0 && !isBusy : value.trim().length > 0 && !isBusy;

  return (
    <div className="modal-backdrop github-import-backdrop" role="presentation" onMouseDown={onCancel}>
      <form
        className="github-import-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="github-import-title"
        aria-describedby="github-import-description"
        onSubmit={(event) => void onSubmit(event)}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="github-import-header">
          <div className="github-import-icon" aria-hidden="true">
            <Github size={22} />
          </div>
          <div>
            <h2 id="github-import-title">从 GitHub 导入技能</h2>
            <p id="github-import-description">粘贴公开仓库、Markdown 链接、skill 文件夹、SKILL.md 文件或 raw 链接。</p>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label="关闭 GitHub 导入"
            onClick={onCancel}
            disabled={isImporting}
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>

        <label className="github-import-field">
          <span>GitHub 链接</span>
          <input
            autoFocus
            type="text"
            value={value}
            placeholder="[owner/repo](https://github.com/owner/repo) 或 https://github.com/owner/repo"
            onChange={(event) => onChange(event.target.value)}
            disabled={isBusy}
          />
        </label>

        <div className="github-import-help">
          <span>支持 Markdown 链接</span>
          <span>支持 owner/repo</span>
          <span>支持仓库根目录</span>
          <span>支持 tree 文件夹</span>
          <span>支持 blob/SKILL.md</span>
          <span>支持 raw/SKILL.md</span>
        </div>

        {discovery ? (
          <GitHubCandidatePicker
            discovery={discovery}
            selectedCandidateIds={selectedCandidateIds}
            isBusy={isBusy}
            onToggleCandidate={onToggleCandidate}
            onSelectAll={onSelectAll}
            onClearSelection={onClearSelection}
          />
        ) : null}

        <div className="github-import-note">
          {discovery
            ? "只会导入勾选的有效技能；导入内容会复制到托管目录，默认保持关闭。"
            : "会先识别仓库内的 SKILL.md；找到多个技能时可勾选后批量导入。"}
        </div>

        <div className="github-import-actions">
          <button className="button secondary" type="button" onClick={onCancel} disabled={isImporting}>
            {isDiscovering ? "停止识别" : "取消"}
          </button>
          <button className="button primary" type="submit" disabled={!canSubmit}>
            <Github aria-hidden="true" size={17} />
            {discovery
              ? isImporting
                ? "正在导入..."
                : `导入选中 ${selectedCount} 个`
              : isDiscovering
                ? "正在识别..."
                : "识别并导入"}
          </button>
        </div>
      </form>
    </div>
  );
}

function GitHubCandidatePicker({
  discovery,
  selectedCandidateIds,
  isBusy,
  onToggleCandidate,
  onSelectAll,
  onClearSelection
}: {
  discovery: GitHubDiscoveryResult;
  selectedCandidateIds: string[];
  isBusy: boolean;
  onToggleCandidate: (candidateId: string) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
}): JSX.Element {
  const validCandidates = discovery.candidates.filter((candidate) => candidate.valid);
  const invalidCount = discovery.candidates.length - validCandidates.length;
  const selectedCount = validCandidates.filter((candidate) => selectedCandidateIds.includes(candidate.id)).length;

  return (
    <section className="github-candidates" aria-label="识别到的 GitHub 技能">
      <div className="github-candidates-toolbar">
        <div>
          <strong>{discovery.repository}</strong>
          <span>
            {discovery.ref} · 找到 {validCandidates.length} 个可导入技能
            {invalidCount > 0 ? `，${invalidCount} 个无效` : ""}
          </span>
        </div>
        <div className="github-selection-actions">
          <button type="button" onClick={onSelectAll} disabled={isBusy || validCandidates.length === 0}>
            全选
          </button>
          <button type="button" onClick={onClearSelection} disabled={isBusy || selectedCount === 0}>
            清空
          </button>
        </div>
      </div>

      <div className="github-candidate-list" role="list">
        {discovery.candidates.map((candidate) => (
          <GitHubCandidateItem
            key={candidate.id}
            candidate={candidate}
            checked={selectedCandidateIds.includes(candidate.id)}
            disabled={isBusy || !candidate.valid}
            onToggle={() => onToggleCandidate(candidate.id)}
          />
        ))}
      </div>
    </section>
  );
}

function GitHubCandidateItem({
  candidate,
  checked,
  disabled,
  onToggle
}: {
  candidate: GitHubSkillCandidate;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}): JSX.Element {
  return (
    <label className={`github-candidate-item ${candidate.valid ? "" : "invalid"}`} role="listitem">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onToggle} />
      <span className="github-candidate-copy">
        <strong>{candidate.name}</strong>
        <span>{candidate.description || "暂无描述"}</span>
        <code>{candidate.path || "/"}</code>
        {candidate.issues.length > 0 ? (
          <em>{candidate.issues.map((issue) => issue.message).join("；")}</em>
        ) : null}
      </span>
    </label>
  );
}

function AiSettingsDialog({
  settings,
  form,
  isSaving,
  isTesting,
  testResult,
  onChange,
  onCancel,
  onTest,
  onSubmit
}: {
  settings: AiSettingsView | null;
  form: AiSettingsInput;
  isSaving: boolean;
  isTesting: boolean;
  testResult: AiConnectionTestResult | null;
  onChange: (patch: Partial<AiSettingsInput>) => void;
  onCancel: () => void;
  onTest: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
}): JSX.Element {
  const isBusy = isSaving || isTesting;
  const hasSavedKey = Boolean(settings?.hasApiKey);
  const selectedPreset = getAiProviderPreset(form.provider);
  const settingsProvider = settings ? getAiProviderPreset(settings.provider) : null;
  const providerChanged = Boolean(settings && settings.provider !== form.provider);
  const modelListId = `ai-model-suggestions-${selectedPreset.id}`;
  const [isApiKeyVisible, setIsApiKeyVisible] = useState(false);

  return (
    <div className="modal-backdrop ai-settings-backdrop" role="presentation" onMouseDown={onCancel}>
      <form
        className="ai-settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-settings-title"
        aria-describedby="ai-settings-description"
        onSubmit={(event) => void onSubmit(event)}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="ai-settings-header">
          <div className="ai-settings-icon" aria-hidden="true">
            <BrainCircuit size={22} />
          </div>
          <div>
            <h2 id="ai-settings-title">AI 接入中心</h2>
            <p id="ai-settings-description">选择模型厂商或中转站，用于总结、打标签、风险提示和 skill 管理建议。</p>
          </div>
          <button className="icon-button" type="button" aria-label="关闭 AI 接入中心" onClick={onCancel} disabled={isBusy}>
            <X aria-hidden="true" size={18} />
          </button>
        </div>

        <label className="ai-toggle-row">
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(event) => onChange({ enabled: event.target.checked })}
            disabled={isBusy}
          />
          <span>
            <strong>启用 AI 识别增强</strong>
            <small>关闭后不会调用外部 AI，基础扫描、导入和开关仍可使用。</small>
          </span>
        </label>

        <section className="ai-provider-panel" aria-label="AI 厂商和中转站">
          <div className="ai-provider-heading">
            <div>
              <strong>选择接入方式</strong>
              <span>可选官方 API，也可以接 One API、LiteLLM、New API、OpenRouter 等中转站。</span>
            </div>
            <em>{getAiProtocolLabel(selectedPreset.protocol)}</em>
          </div>
          <div className="ai-provider-grid" role="list">
            {AI_PROVIDER_PRESETS.map((preset) => (
              <button
                key={preset.id}
                className={`ai-provider-card ${form.provider === preset.id ? "selected" : ""} ${preset.isCustom ? "custom" : ""}`}
                type="button"
                role="listitem"
                aria-pressed={form.provider === preset.id}
                onClick={() => onChange({ provider: preset.id })}
                disabled={isBusy}
              >
                <span>{preset.label}</span>
                <small>{preset.isCustom ? "自定义中转" : getAiProtocolLabel(preset.protocol)}</small>
              </button>
            ))}
          </div>
        </section>

        <div className="ai-provider-note">
          <BrainCircuit aria-hidden="true" size={17} />
          <span>{selectedPreset.helpText}</span>
        </div>

        <div className="ai-settings-grid">
          <label className="ai-settings-field">
            <span>Base URL</span>
            <input
              type="url"
              value={form.baseUrl}
              onChange={(event) => onChange({ baseUrl: event.target.value })}
              placeholder={selectedPreset.defaultBaseUrl}
              disabled={isBusy}
            />
          </label>
          <label className="ai-settings-field">
            <span>模型</span>
            <input
              type="text"
              value={form.model}
              onChange={(event) => onChange({ model: event.target.value })}
              placeholder={selectedPreset.defaultModel}
              list={modelListId}
              disabled={isBusy}
            />
            <datalist id={modelListId}>
              {selectedPreset.modelSuggestions.map((model) => (
                <option key={model} value={model} />
              ))}
            </datalist>
          </label>
        </div>

        <label className="ai-settings-field">
          <span>{selectedPreset.apiKeyLabel}</span>
          <div className="ai-key-input">
            <KeyRound aria-hidden="true" size={17} />
            <input
              type={isApiKeyVisible ? "text" : "password"}
              value={form.apiKey ?? ""}
              onChange={(event) => onChange({ apiKey: event.target.value, clearApiKey: false })}
              placeholder={
                hasSavedKey && !providerChanged
                  ? `已保存 ${settingsProvider?.apiKeyLabel ?? "API Key"}，留空则保持不变`
                  : `粘贴 ${selectedPreset.apiKeyLabel}`
              }
              disabled={isBusy}
            />
            <button
              className="ai-key-visibility"
              type="button"
              aria-label={isApiKeyVisible ? "隐藏 API Key" : "显示 API Key"}
              aria-pressed={isApiKeyVisible}
              onClick={() => setIsApiKeyVisible((current) => !current)}
              disabled={isBusy}
            >
              {isApiKeyVisible ? <EyeOff aria-hidden="true" size={15} /> : <Eye aria-hidden="true" size={15} />}
            </button>
          </div>
        </label>

        {providerChanged ? (
          <div className="ai-provider-warning">
            已切换到 {selectedPreset.label}，请填写对应的 API Key；旧 Key 不会被用于新厂商。
          </div>
        ) : null}

        {hasSavedKey && !providerChanged ? (
          <label className="ai-clear-key">
            <input
              type="checkbox"
              checked={Boolean(form.clearApiKey)}
              onChange={(event) => onChange({ clearApiKey: event.target.checked, apiKey: "" })}
              disabled={isBusy}
            />
            清除已保存的 API Key
          </label>
        ) : null}

        <div className="ai-security-note">
          API Key 只保存在本机用户数据目录；应用不会把它写入源码、README、日志或分发包。
          {settings?.keyStorage === "safe-storage" ? " 当前使用 Electron safeStorage 加密。" : null}
        </div>

        {testResult ? (
          <div className={`ai-test-result ${testResult.ok ? "success" : "failed"}`} role="status">
            {testResult.message}
          </div>
        ) : null}

        <div className="ai-settings-actions">
          <button className="button secondary" type="button" onClick={onCancel} disabled={isBusy}>
            取消
          </button>
          <button className="button secondary" type="button" onClick={onTest} disabled={isBusy}>
            <Sparkles aria-hidden="true" size={17} />
            {isTesting ? "测试中..." : "测试连接"}
          </button>
          <button className="button primary" type="submit" disabled={isBusy}>
            {isSaving ? "保存中..." : "保存设置"}
          </button>
        </div>
      </form>
    </div>
  );
}

function AiAnalysisResult({ analysis }: { analysis: AiSkillAnalysis }): JSX.Element {
  const riskLabel: Record<AiSkillAnalysis["riskLevel"], string> = {
    low: "低风险",
    medium: "中风险",
    high: "高风险"
  };
  const recommendationLabel: Record<AiSkillAnalysis["enableRecommendation"], string> = {
    enable: "建议可打开",
    "keep-disabled": "建议保持关闭",
    "review-first": "建议先审查"
  };

  return (
    <div className="ai-analysis-result">
      <p>{analysis.summaryZh}</p>
      <div className="ai-analysis-badges">
        <span className={`risk-${analysis.riskLevel}`}>{riskLabel[analysis.riskLevel]}</span>
        <span>{recommendationLabel[analysis.enableRecommendation]}</span>
        <span>置信度 {Math.round(analysis.confidence * 100)}%</span>
      </div>
      <AiAnalysisList title="适用场景" items={analysis.useCases} />
      <AiAnalysisList title="风险提示" items={analysis.risks} />
      <AiAnalysisList title="依赖能力" items={analysis.dependencies} emptyText="未识别到明确依赖" />
      <AiAnalysisList title="管理建议" items={analysis.managementAdvice} />
      {analysis.tags.length > 0 ? (
        <div className="ai-tag-list" aria-label="AI 标签">
          {analysis.tags.map((tag) => (
            <span key={tag}>{tag}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function AiAnalysisList({
  title,
  items,
  emptyText
}: {
  title: string;
  items: string[];
  emptyText?: string;
}): JSX.Element | null {
  if (items.length === 0 && !emptyText) {
    return null;
  }

  return (
    <div className="ai-analysis-list">
      <strong>{title}</strong>
      {items.length > 0 ? (
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <span>{emptyText}</span>
      )}
    </div>
  );
}

function SkillDetails({
  skill,
  markdown,
  aiSettings,
  aiRecord,
  onClose,
  onOpenAiSettings,
  onAnalysisSaved,
  onReveal
}: {
  skill: SkillRecord | null;
  markdown: string;
  aiSettings: AiSettingsView | null;
  aiRecord: AiSkillAnalysisRecord | null;
  onClose: () => void;
  onOpenAiSettings: () => void;
  onAnalysisSaved: (record: AiSkillAnalysisRecord) => void;
  onReveal: (skill: SkillRecord) => void;
}): JSX.Element | null {
  const [aiAnalysis, setAiAnalysis] = useState<AiSkillAnalysis | null>(aiRecord?.analysis ?? null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysisError, setAiAnalysisError] = useState<string | null>(null);

  useEffect(() => {
    setAiAnalysis(aiRecord?.analysis ?? null);
    setAiAnalysisError(null);
    setIsAnalyzing(false);
  }, [aiRecord, skill?.id]);

  if (!skill) {
    return null;
  }

  const contentSummary = summarizeSkillMarkdown(markdown, skill);

  const visibleSections = contentSummary.sections.slice(0, 4);
  const hiddenSectionCount = Math.max(0, contentSummary.stats.sections - visibleSections.length);
  const canAnalyzeWithAi = Boolean(aiSettings?.enabled && aiSettings.hasApiKey);
  const activeAiProvider = getAiProviderPreset(aiSettings?.provider ?? defaultAiSettingsForm.provider);

  async function analyzeWithAi(): Promise<void> {
    if (!skill) {
      return;
    }

    setIsAnalyzing(true);
    setAiAnalysisError(null);

    try {
      const analysis = await getAiApi().analyzeSkill({
        skill: {
          id: skill.id,
          name: skill.name,
          description: skill.description,
          summaryZh: skill.summaryZh,
          source: skill.source,
            status: skill.status,
            valid: skill.valid,
            issues: skill.issues,
            hash: skill.hash
          },
          markdown
      });
      setAiAnalysis(analysis);
      onAnalysisSaved({
        skillId: skill.id,
        skillHash: skill.hash,
        analysis,
        analyzedAt: new Date().toISOString(),
        provider: aiSettings?.provider ?? defaultAiSettingsForm.provider,
        model: aiSettings?.model ?? defaultAiSettingsForm.model
      });
    } catch (analysisError) {
      setAiAnalysisError(analysisError instanceof Error ? analysisError.message : "AI 分析失败。");
    } finally {
      setIsAnalyzing(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <aside
        key={skill.id}
        className="details details-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`${skill.name} 详情`}
        onMouseDown={(event) => event.stopPropagation()}
      >
      <div className="details-header">
        <div className="details-title-row">
          <SkillAvatar skill={skill} detail />
          <div className="details-title-copy">
            <div className="details-title-meta">
              <span className={`status-pill status-${skill.status}`}>{statusLabels[skill.status]}</span>
              <span className={`source-pill source-${skill.source}`}>{getSourceLabel(skill)}</span>
              <span className={`issue-pill ${skill.issues.length > 0 ? "has-issues" : ""}`}>
                问题 {skill.issues.length}
              </span>
            </div>
            <h2>{skill.name}</h2>
          </div>
        </div>
        <div className="details-actions">
          <button className="button secondary details-open-button" type="button" onClick={() => onReveal(skill)}>
            <ExternalLink aria-hidden="true" size={15} />
            打开位置
          </button>
          <button className="icon-button" type="button" aria-label="关闭详情" onClick={onClose} autoFocus>
            <X aria-hidden="true" size={18} />
          </button>
        </div>
      </div>

      <section className="skill-brief" aria-label="技能内容摘要">
        <div className="brief-heading">
          <h3>内容摘要</h3>
          <div className="brief-stats" aria-label="文档结构统计">
            <span>{contentSummary.stats.sections} 章</span>
            <span>{contentSummary.stats.bullets} 要点</span>
            <span>{contentSummary.stats.codeBlocks} 示例</span>
          </div>
        </div>
        <p>{contentSummary.overview}</p>
        {contentSummary.highlights.length > 0 ? (
          <ul className="brief-list">
            {contentSummary.highlights.map((highlight) => (
              <li key={highlight}>{highlight}</li>
            ))}
          </ul>
        ) : null}
        {contentSummary.sections.length > 0 ? (
          <div className="section-chips" aria-label="SKILL.md 章节">
            {visibleSections.map((section) => (
              <span key={section} title={section}>
                {compactLabel(section)}
              </span>
            ))}
            {hiddenSectionCount > 0 ? <span title={`还有 ${hiddenSectionCount} 个章节`}>+{hiddenSectionCount}</span> : null}
          </div>
        ) : null}
      </section>

      <section className="ai-analysis-panel" aria-label="AI 分析">
        <div className="ai-analysis-heading">
          <div>
            <span>{activeAiProvider.label}</span>
            <h3>技能管理建议</h3>
          </div>
          {canAnalyzeWithAi ? (
            <button className="button secondary details-open-button" type="button" onClick={() => void analyzeWithAi()} disabled={isAnalyzing}>
              <Sparkles aria-hidden="true" size={15} />
              {isAnalyzing ? "分析中..." : aiAnalysis ? "重新分析" : "开始分析"}
            </button>
          ) : (
            <button className="button secondary details-open-button" type="button" onClick={onOpenAiSettings}>
              <KeyRound aria-hidden="true" size={15} />
              配置 API
            </button>
          )}
        </div>
        {!canAnalyzeWithAi ? (
          <p className="ai-analysis-empty">配置 AI API 或中转站后，可以生成中文摘要、风险提示、依赖识别和启用建议。</p>
        ) : null}
        {aiAnalysisError ? <p className="ai-analysis-error">{aiAnalysisError}</p> : null}
        {aiAnalysis ? <AiAnalysisResult analysis={aiAnalysis} /> : null}
      </section>

      <section className="details-info" aria-label="技能基础信息">
        <div className="info-card info-card-wide">
          <span>中文作用</span>
          <p>{skill.summaryZh}</p>
        </div>
        {skill.description ? (
          <details className="description-panel">
            <summary>
              <span>原始说明</span>
              <strong>展开查看</strong>
            </summary>
            <p>{skill.description}</p>
          </details>
        ) : null}
        <div className="info-card">
          <span>来源</span>
          <p>{getSourceLabel(skill)}</p>
        </div>
        <div className="info-card info-card-wide">
          <span>路径</span>
          <code>{skill.path}</code>
        </div>
        <div className="info-card info-card-wide">
          <span>哈希</span>
          <code>{skill.hash || "不可用"}</code>
        </div>
      </section>

      {skill.issues.length > 0 ? (
        <section className="issues" aria-label="校验问题">
          <h3>问题</h3>
          <ul>
            {skill.issues.map((issue) => (
              <li key={`${issue.code}-${issue.message}`}>
                <strong>{issueLabels[issue.code] ?? issue.code}</strong>
                <span>{issue.message}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <details className="markdown-view" aria-label="SKILL.md 预览">
        <summary>
          <span>完整 SKILL.md</span>
          <strong>{markdown ? `${markdown.length.toLocaleString()} 字符` : "加载中"}</strong>
        </summary>
        <pre>{markdown || "加载中..."}</pre>
      </details>
      </aside>
    </div>
  );
}
