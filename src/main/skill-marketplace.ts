import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { MarketplaceSearchInput, MarketplaceSearchResult, MarketplaceSkill, MarketplaceSource } from "../shared/types.js";
import { getMarketplaceCachePath } from "./paths.js";

const DEFAULT_LIMIT = 72;
const MAX_LIMIT = 120;
const CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_INDEXED_SKILLS_PER_SOURCE = 64;

type IndexedGitHubSource = MarketplaceSource & {
  owner: string;
  repo: string;
};

const indexedGitHubSources: IndexedGitHubSource[] = [
  {
    id: "composio-awesome-codex-skills",
    name: "Composio Awesome Codex Skills",
    description: "Codex 专用精选仓库，适合优先浏览和导入。",
    url: "https://github.com/ComposioHQ/awesome-codex-skills",
    kind: "codex",
    tags: ["Codex", "精选", "GitHub"],
    owner: "ComposioHQ",
    repo: "awesome-codex-skills"
  },
  {
    id: "voltagent-awesome-agent-skills",
    name: "VoltAgent Awesome Agent Skills",
    description: "社区维护的跨 Agent skills 列表，适合补充发现。",
    url: "https://github.com/VoltAgent/awesome-agent-skills",
    kind: "cross-agent",
    tags: ["社区", "跨平台", "GitHub"],
    owner: "VoltAgent",
    repo: "awesome-agent-skills"
  },
  {
    id: "awesome-claude-skills",
    name: "Awesome Claude Skills",
    description: "大量 Claude Code skills，很多 `SKILL.md` 可以直接导入 Codex 使用。",
    url: "https://github.com/travisvn/awesome-claude-skills",
    kind: "cross-agent",
    tags: ["Claude", "跨平台", "GitHub"],
    owner: "travisvn",
    repo: "awesome-claude-skills"
  }
];

const websiteSources: MarketplaceSource[] = [
  {
    id: "awesome-skills",
    name: "Awesome Skills",
    description: "跨 Agent 技能目录，适合发现 Claude Code、Codex、Cursor、Gemini CLI 技能。",
    url: "https://www.awesomeskills.dev/en",
    kind: "cross-agent",
    tags: ["目录", "跨平台", "搜索"]
  },
  {
    id: "github-topic-codex-skill",
    name: "GitHub Topic: codex-skill",
    description: "直接从 GitHub topic 搜索公开 Codex skills，噪声较高但更新快。",
    url: "https://github.com/topics/codex-skill",
    kind: "github-topic",
    tags: ["最新", "GitHub", "Topic"]
  }
];

const marketplaceSources: MarketplaceSource[] = [...indexedGitHubSources, ...websiteSources];

type GitHubRepository = {
  full_name: string;
  html_url: string;
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  updated_at: string;
  default_branch: string;
  language: string | null;
  topics?: string[];
};

type GitHubSearchRepository = GitHubRepository;

type GitHubSearchResponse = {
  items?: GitHubSearchRepository[];
};

type GitHubTreeResponse = {
  truncated?: boolean;
  tree?: Array<{
    path: string;
    type: "blob" | "tree" | string;
    size?: number;
  }>;
};

type CachedIndex = {
  fetchedAt: number;
  items: MarketplaceSkill[];
};

type MarketplaceCacheFile = {
  version: 1;
  fetchedAt: number;
  items: MarketplaceSkill[];
};

export class SkillMarketplace {
  private cachedIndex: CachedIndex | null = null;
  private readonly cachedSearchResults = new Map<string, MarketplaceSearchResult>();
  private readonly cachePath = getMarketplaceCachePath();

  async search(input: MarketplaceSearchInput = {}): Promise<MarketplaceSearchResult> {
    const query = normalizeQuery(input.query);
    const limit = normalizeLimit(input.limit);
    const cacheKey = `${query}:${limit}`;
    const cachedSearch = this.cachedSearchResults.get(cacheKey);
    if (cachedSearch) {
      return cachedSearch;
    }

    const topicLimit = query ? Math.min(36, limit) : 0;
    const [indexedSkills, topicSkills] = await Promise.all([
      this.getIndexedSkills(),
      topicLimit > 0 ? searchGitHubTopicSkills(query, topicLimit) : Promise.resolve([])
    ]);
    const items = mergeMarketplaceItems([...filterMarketplaceSkills(indexedSkills, query), ...topicSkills])
      .sort(compareMarketplaceSkills)
      .slice(0, limit);

    const result = {
      sources: marketplaceSources,
      items,
      fetchedAt: new Date().toISOString()
    };
    this.cachedSearchResults.set(cacheKey, result);
    return result;
  }

  private async getIndexedSkills(): Promise<MarketplaceSkill[]> {
    if (this.cachedIndex && Date.now() - this.cachedIndex.fetchedAt < CACHE_TTL_MS) {
      return this.cachedIndex.items;
    }

    const diskCache = await this.readDiskCache();
    if (diskCache && Date.now() - diskCache.fetchedAt < CACHE_TTL_MS) {
      this.cachedIndex = diskCache;
      return diskCache.items;
    }

    const settled = await Promise.allSettled(indexedGitHubSources.map((source) => indexGitHubSkillSource(source)));
    const items = settled.flatMap((result) => (result.status === "fulfilled" ? result.value : []));
    this.cachedIndex = {
      fetchedAt: Date.now(),
      items
    };
    await this.writeDiskCache(this.cachedIndex);
    return items;
  }

  private async readDiskCache(): Promise<CachedIndex | null> {
    try {
      const cache = JSON.parse(await fs.readFile(this.cachePath, "utf8")) as MarketplaceCacheFile;
      if (cache.version !== 1 || !Array.isArray(cache.items) || !Number.isFinite(cache.fetchedAt)) {
        return null;
      }

      return {
        fetchedAt: cache.fetchedAt,
        items: cache.items
      };
    } catch {
      return null;
    }
  }

  private async writeDiskCache(cache: CachedIndex): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.cachePath), { recursive: true });
      await fs.writeFile(
        this.cachePath,
        `${JSON.stringify({ version: 1, fetchedAt: cache.fetchedAt, items: cache.items }, null, 2)}\n`,
        "utf8"
      );
    } catch {
      // The marketplace can still work without a persisted cache.
    }
  }
}

async function indexGitHubSkillSource(source: IndexedGitHubSource): Promise<MarketplaceSkill[]> {
  const repository = await fetchGitHubRepository(source.owner, source.repo);
  const tree = await fetchGitHubTree(source.owner, source.repo, repository.default_branch);
  return uniqueSkillMarkdownPaths(tree)
    .sort(compareSkillMarkdownPath)
    .slice(0, MAX_INDEXED_SKILLS_PER_SOURCE)
    .map((skillMarkdownPath) => toIndexedMarketplaceSkill(source, repository, skillMarkdownPath));
}

function toIndexedMarketplaceSkill(
  source: IndexedGitHubSource,
  repository: GitHubRepository,
  skillMarkdownPath: string
): MarketplaceSkill {
  const skillDirectory = path.posix.dirname(skillMarkdownPath) === "." ? "" : path.posix.dirname(skillMarkdownPath);
  const fallbackName = path.posix.basename(skillDirectory) || repository.full_name;
  const name = humanizeSkillName(fallbackName);
  const description = repository.description?.trim() || "已发现 SKILL.md。安装前会重新读取并校验技能说明。";

  return {
    id: shortHash(`${repository.full_name}:${repository.default_branch}:${skillDirectory}`),
    name,
    description,
    repository: repository.full_name,
    sourceName: source.name,
    sourceUrl: githubTreeUrl(repository.html_url, repository.default_branch, skillDirectory),
    installUrl: githubTreeUrl(repository.html_url, repository.default_branch, skillDirectory),
    stars: repository.stargazers_count,
    forks: repository.forks_count,
    updatedAt: repository.updated_at,
    language: repository.language ?? undefined,
    tags: inferTags(`${name} ${description} ${skillDirectory} ${source.tags.join(" ")}`)
  };
}

async function searchGitHubTopicSkills(query: string, limit: number): Promise<MarketplaceSkill[]> {
  const perPage = Math.min(limit, 30);
  const searches = [
    buildGitHubSearchQuery(query, "codex-skill"),
    buildGitHubSearchQuery(query, "codex-skills"),
    buildGitHubSearchQuery(query, "claude-code-skill"),
    buildGitHubSearchQuery(query, "agent-skills")
  ];
  const responses = await Promise.allSettled(searches.map((searchQuery) => fetchGitHubRepositories(searchQuery, perPage)));
  const repositories = new Map<string, GitHubSearchRepository>();

  for (const response of responses) {
    if (response.status !== "fulfilled") {
      continue;
    }

    for (const repo of response.value) {
      repositories.set(repo.full_name.toLowerCase(), repo);
    }
  }

  return [...repositories.values()]
    .sort((left, right) => right.stargazers_count - left.stargazers_count || left.full_name.localeCompare(right.full_name))
    .slice(0, limit)
    .map(toTopicMarketplaceSkill);
}

function buildGitHubSearchQuery(query: string, topic: string): string {
  const base = query ? `${query} topic:${topic}` : `topic:${topic}`;
  return `${base} archived:false`;
}

async function fetchGitHubRepositories(query: string, perPage: number): Promise<GitHubSearchRepository[]> {
  const url = new URL("https://api.github.com/search/repositories");
  url.searchParams.set("q", query);
  url.searchParams.set("sort", "stars");
  url.searchParams.set("order", "desc");
  url.searchParams.set("per_page", String(perPage));

  const payload = await fetchGitHubJson<GitHubSearchResponse>(url);
  return payload.items ?? [];
}

async function fetchGitHubRepository(owner: string, repo: string): Promise<GitHubRepository> {
  return fetchGitHubJson<GitHubRepository>(new URL(`https://api.github.com/repos/${owner}/${repo}`));
}

async function fetchGitHubTree(owner: string, repo: string, ref: string): Promise<GitHubTreeResponse> {
  const url = new URL(`https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}`);
  url.searchParams.set("recursive", "1");
  return fetchGitHubJson<GitHubTreeResponse>(url);
}

async function fetchGitHubJson<T>(url: URL): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "codex-skills-manager"
    }
  });

  if (!response.ok) {
    throw new Error(`GitHub 技能广场请求失败：${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

function toTopicMarketplaceSkill(repo: GitHubSearchRepository): MarketplaceSkill {
  return {
    id: shortHash(repo.html_url),
    name: repo.full_name,
    description: repo.description?.trim() || "暂无描述。安装前会继续识别仓库内的 SKILL.md。",
    repository: repo.full_name,
    sourceName: "GitHub Topic",
    sourceUrl: repo.html_url,
    installUrl: repo.html_url,
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    updatedAt: repo.updated_at,
    language: repo.language ?? undefined,
    tags: inferTags(`${repo.full_name} ${repo.description ?? ""} ${(repo.topics ?? []).join(" ")}`)
  };
}

function uniqueSkillMarkdownPaths(tree: GitHubTreeResponse): string[] {
  const paths = new Set<string>();
  for (const item of tree.tree ?? []) {
    if (item.type === "blob" && item.path.endsWith("/SKILL.md")) {
      paths.add(item.path);
    }
  }

  return [...paths];
}

function compareSkillMarkdownPath(left: string, right: string): number {
  return skillPathRank(left) - skillPathRank(right) || left.localeCompare(right);
}

function skillPathRank(value: string): number {
  if (value.startsWith("skills/")) {
    return 0;
  }

  if (value.includes("/skills/")) {
    return 1;
  }

  if (value.startsWith(".claude/skills/")) {
    return 2;
  }

  return 3;
}

function filterMarketplaceSkills(items: MarketplaceSkill[], query: string): MarketplaceSkill[] {
  if (!query) {
    return items;
  }

  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter((item) => {
    const haystack = `${item.name} ${item.description} ${item.repository} ${item.sourceName} ${item.tags.join(" ")}`.toLowerCase();
    return tokens.every((token) => haystack.includes(token));
  });
}

function mergeMarketplaceItems(items: MarketplaceSkill[]): MarketplaceSkill[] {
  const byKey = new Map<string, MarketplaceSkill>();
  for (const item of items) {
    const key = `${item.repository}:${item.installUrl}`.toLowerCase();
    if (!byKey.has(key)) {
      byKey.set(key, item);
    }
  }

  return [...byKey.values()];
}

function compareMarketplaceSkills(left: MarketplaceSkill, right: MarketplaceSkill): number {
  const sourceRank = sourceNameRank(left.sourceName) - sourceNameRank(right.sourceName);
  return sourceRank || (right.stars ?? 0) - (left.stars ?? 0) || left.name.localeCompare(right.name);
}

function sourceNameRank(sourceName: string): number {
  if (/Composio/i.test(sourceName)) {
    return 0;
  }

  if (/VoltAgent|Awesome Claude/i.test(sourceName)) {
    return 1;
  }

  return 2;
}

function inferTags(value: string): string[] {
  const haystack = value.toLowerCase();
  const tags: string[] = [];
  const add = (pattern: RegExp, tag: string): void => {
    if (pattern.test(haystack) && !tags.includes(tag)) {
      tags.push(tag);
    }
  };

  add(/\b(codex|openai)\b/, "codex");
  add(/\b(claude|anthropic)\b/, "claude");
  add(/\b(browser|chrome|playwright|web|scrape)\b/, "browser");
  add(/\b(git|github|repo|pr|issue)\b/, "github");
  add(/\b(pdf|docx|xlsx|pptx|document|markdown)\b/, "docs");
  add(/\b(frontend|ui|react|design|component)\b/, "frontend");
  add(/\b(docker|devops|deploy|ci|cd)\b/, "devops");
  add(/\b(research|search|arxiv|paper)\b/, "research");
  add(/\b(security|auth|secret|scan)\b/, "security");
  add(/\b(agent|mcp|workflow|orchestr)\b/, "agent");

  return tags.slice(0, 5);
}

function humanizeSkillName(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function githubTreeUrl(repositoryUrl: string, ref: string, directory: string): string {
  if (!directory) {
    return repositoryUrl;
  }

  return `${repositoryUrl}/tree/${encodeURIComponent(ref)}/${directory
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`;
}

function normalizeQuery(query: string | undefined): string {
  return typeof query === "string" ? query.trim().slice(0, 80) : "";
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }

  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(Number(limit))));
}

function shortHash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}
