import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  BulkImportSummary,
  GitHubDiscoveryResult,
  GitHubSkillCandidate,
  SkillIssue,
  SkillRecord,
  SkillSource
} from "../shared/types.js";
import { getImportedSkillsRoot } from "./paths.js";
import { setSkillDirectoryPhysicalStatus } from "./physical-skill-status.js";
import { buildSkillId } from "./skill-scanner.js";
import { parseFrontmatter } from "./skill-frontmatter.js";
import { buildSkillSummaryZh } from "./skill-summary.js";

type LocalImportRoot = {
  source: Exclude<SkillSource, "imported">;
  path: string;
};

const MANIFEST_FILE = ".codex-skills-manager.json";
const GITHUB_API_ROOT = "https://api.github.com";
const MAX_GITHUB_FILES = 200;
const MAX_GITHUB_FILE_BYTES = 5 * 1024 * 1024;
const MAX_GITHUB_TOTAL_BYTES = 25 * 1024 * 1024;
const MAX_GITHUB_DISCOVERY_CANDIDATES = 80;

type GitHubSkillSpec = {
  owner: string;
  repo: string;
  ref?: string;
  path: string;
  sourceUrl: string;
  mode: "repository" | "tree" | "skill-file" | "raw-skill-file";
};

type GitHubDownloadState = {
  files: number;
  bytes: number;
  rootPath: string;
};

type GitHubContentItem = {
  type: string;
  name: string;
  path: string;
  download_url?: string | null;
  size?: number;
};

type GitHubTreeResponse = {
  tree?: Array<{
    path: string;
    type: string;
  }>;
  truncated?: boolean;
};

type GitHubRepositoryResponse = {
  default_branch?: string;
};

export class SkillImporter {
  constructor(private readonly importsRoot = getImportedSkillsRoot()) {}

  async importFolder(folderPath: string): Promise<SkillRecord> {
    const sourcePath = path.resolve(folderPath);

    if (!path.isAbsolute(sourcePath)) {
      throw new Error("导入路径必须是绝对路径。");
    }

    const sourceStat = await fs.stat(sourcePath);
    if (!sourceStat.isDirectory()) {
      throw new Error("导入路径必须是文件夹。");
    }

    const skillMdPath = path.join(sourcePath, "SKILL.md");
    const markdown = await fs.readFile(skillMdPath, "utf8").catch(() => {
      throw new Error("导入的文件夹必须包含 SKILL.md。");
    });

    const frontmatter = parseFrontmatter(markdown);
    if (!frontmatter.valid || !frontmatter.name) {
      throw new Error("导入的 SKILL.md 必须包含有效的头部元信息和 name 字段。");
    }

    await fs.mkdir(this.importsRoot, { recursive: true });
    const targetPath = await this.getAvailableTargetPath(frontmatter.name, sourcePath);

    if (isSameOrInside(sourcePath, this.importsRoot)) {
      throw new Error("不能从托管导入目录再次导入技能。");
    }

    await copyDirectorySafely(sourcePath, targetPath);
    await fs.rename(path.join(targetPath, "SKILL.md"), path.join(targetPath, "SKILL.md.disabled"));

    return {
      id: buildSkillId("imported", targetPath),
      name: frontmatter.name.trim(),
      description: frontmatter.description?.trim() ?? "",
      summaryZh: buildSkillSummaryZh({
        name: frontmatter.name.trim(),
        description: frontmatter.description?.trim() ?? "",
        source: "imported",
        valid: true,
        issues: []
      }),
      path: targetPath,
      source: "imported",
      status: "disabled",
      readonly: false,
      valid: true,
      issues: [],
      hash: shortHash(targetPath),
      lastScannedAt: new Date().toISOString()
    };
  }

  async importGitHubUrl(githubUrl: string): Promise<SkillRecord> {
    const spec = parseGitHubSkillUrl(githubUrl);
    const markdown = await readGitHubSkillMarkdown(spec);
    const frontmatter = parseFrontmatter(markdown);

    if (!frontmatter.valid || !frontmatter.name) {
      throw new Error("GitHub 链接中的 SKILL.md 必须包含有效的头部元信息和 name 字段。");
    }

    await fs.mkdir(this.importsRoot, { recursive: true });
    const targetPath = await this.getAvailableTargetPath(frontmatter.name, spec.sourceUrl);

    try {
      await downloadGitHubDirectory(spec, targetPath);

      const activePath = path.join(targetPath, "SKILL.md");
      const disabledPath = path.join(targetPath, "SKILL.md.disabled");
      if (!(await exists(activePath))) {
        throw new Error("GitHub 链接必须指向包含 SKILL.md 的目录。");
      }

      await fs.rename(activePath, disabledPath);
      await fs.writeFile(
        path.join(targetPath, MANIFEST_FILE),
        `${JSON.stringify(
          {
            source: "github",
            sourceUrl: spec.sourceUrl,
            repository: `${spec.owner}/${spec.repo}`,
            ref: spec.ref,
            path: spec.path,
            originalName: frontmatter.name.trim(),
            importedAt: new Date().toISOString()
          },
          null,
          2
        )}\n`,
        "utf8"
      );
    } catch (error) {
      await fs.rm(targetPath, { recursive: true, force: true });
      throw error;
    }

    return {
      id: buildSkillId("imported", targetPath),
      name: frontmatter.name.trim(),
      description: frontmatter.description?.trim() ?? "",
      summaryZh: buildSkillSummaryZh({
        name: frontmatter.name.trim(),
        description: frontmatter.description?.trim() ?? "",
        source: "imported",
        valid: true,
        issues: []
      }),
      path: targetPath,
      source: "imported",
      status: "disabled",
      readonly: false,
      valid: true,
      issues: [],
      hash: shortHash(spec.sourceUrl),
      lastScannedAt: new Date().toISOString()
    };
  }

  async discoverGitHubSkills(githubUrl: string, signal?: AbortSignal): Promise<GitHubDiscoveryResult> {
    const spec = parseGitHubSkillUrl(githubUrl);
    throwIfAborted(signal, "GitHub 识别已取消。");
    const ref = spec.ref ?? (await fetchGitHubDefaultBranch(spec, signal));
    const resolvedSpec: GitHubSkillSpec = { ...spec, ref };
    const candidates = await discoverGitHubSkillCandidates(resolvedSpec, signal);

    return {
      input: githubUrl,
      repository: `${resolvedSpec.owner}/${resolvedSpec.repo}`,
      ref,
      rootPath: resolvedSpec.path,
      sourceUrl: githubRepositorySourceUrl(resolvedSpec),
      candidates
    };
  }

  async importLocalSkills(roots: LocalImportRoot[]): Promise<BulkImportSummary> {
    await fs.mkdir(this.importsRoot, { recursive: true });
    const managedSources = await this.readManagedSources();
    const summary: BulkImportSummary = { imported: 0, synced: 0, skipped: 0, failed: 0, failures: [] };

    for (const root of roots) {
      if (!(await exists(root.path))) {
        continue;
      }

      const sourcePaths = await collectImportableSkillDirectories(root.path);

      for (const sourcePath of sourcePaths) {
        const normalizedSourcePath = normalizePath(sourcePath);

        const managedPath = managedSources.get(normalizedSourcePath);
        if (managedPath) {
          await syncManagedCopyStatus(sourcePath, managedPath);
          summary.synced += 1;
          continue;
        }

        try {
          const markdownPath = await findSkillMarkdown(sourcePath);
          if (!markdownPath) {
            summary.skipped += 1;
            continue;
          }

          const markdown = await fs.readFile(markdownPath, "utf8");
          const frontmatter = parseFrontmatter(markdown);
          const name = frontmatter.name?.trim() || path.basename(sourcePath);
          const targetPath = await this.getAvailableManagedTargetPath(root.source, name, sourcePath);

          await copyDirectorySafely(sourcePath, targetPath);

          await this.writeManagedManifest(targetPath, {
            source: root.source,
            sourcePath,
            originalName: name
          });

          managedSources.set(normalizedSourcePath, targetPath);
          summary.imported += 1;
        } catch (error) {
          summary.failed += 1;
          summary.failures.push({
            path: sourcePath,
            reason: error instanceof Error ? error.message : "未知错误"
          });
        }
      }
    }

    return summary;
  }

  private async getAvailableTargetPath(skillName: string, sourcePath: string): Promise<string> {
    const safeName = toSafeDirectoryName(skillName);
    const basePath = path.join(this.importsRoot, safeName);

    if (!(await exists(basePath))) {
      return basePath;
    }

    const hashedPath = path.join(this.importsRoot, `${safeName}-${shortHash(sourcePath)}`);
    if (!(await exists(hashedPath))) {
      return hashedPath;
    }

    for (let index = 2; index < 1000; index += 1) {
      const candidate = path.join(this.importsRoot, `${safeName}-${shortHash(sourcePath)}-${index}`);
      if (!(await exists(candidate))) {
        return candidate;
      }
    }

    throw new Error("找不到可用的导入目标目录。");
  }

  private async getAvailableManagedTargetPath(
    source: Exclude<SkillSource, "imported">,
    skillName: string,
    sourcePath: string
  ): Promise<string> {
    const safeName = `${source}-${toSafeDirectoryName(skillName)}`;
    const basePath = path.join(this.importsRoot, safeName);

    if (!(await exists(basePath))) {
      return basePath;
    }

    const hashedPath = path.join(this.importsRoot, `${safeName}-${shortHash(sourcePath)}`);
    if (!(await exists(hashedPath))) {
      return hashedPath;
    }

    for (let index = 2; index < 1000; index += 1) {
      const candidate = path.join(this.importsRoot, `${safeName}-${shortHash(sourcePath)}-${index}`);
      if (!(await exists(candidate))) {
        return candidate;
      }
    }

    throw new Error("找不到可用的托管目标目录。");
  }

  private async readManagedSources(): Promise<Map<string, string>> {
    const sourcePaths = new Map<string, string>();

    if (!(await exists(this.importsRoot))) {
      return sourcePaths;
    }

    const entries = await fs.readdir(this.importsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      try {
        const raw = await fs.readFile(path.join(this.importsRoot, entry.name, MANIFEST_FILE), "utf8");
        const parsed = JSON.parse(raw) as { sourcePath?: string };
        if (parsed.sourcePath) {
          sourcePaths.set(normalizePath(parsed.sourcePath), path.join(this.importsRoot, entry.name));
        }
      } catch {
        continue;
      }
    }

    return sourcePaths;
  }

  private async writeManagedManifest(
    targetPath: string,
    manifest: { source: Exclude<SkillSource, "imported">; sourcePath: string; originalName: string }
  ): Promise<void> {
    await fs.writeFile(
      path.join(targetPath, MANIFEST_FILE),
      `${JSON.stringify({ ...manifest, importedAt: new Date().toISOString() }, null, 2)}\n`,
      "utf8"
    );
  }
}

async function syncManagedCopyStatus(sourcePath: string, targetPath: string): Promise<void> {
  const sourceActivePath = path.join(sourcePath, "SKILL.md");
  const sourceDisabledPath = path.join(sourcePath, "SKILL.md.disabled");

  if (await exists(sourceActivePath)) {
    await setSkillDirectoryPhysicalStatus(targetPath, "enabled");
    return;
  }

  if (await exists(sourceDisabledPath)) {
    await setSkillDirectoryPhysicalStatus(targetPath, "disabled");
  }
}

function normalizeGitHubInput(input: string): string {
  const trimmed = input.trim();
  const markdownLink = /^\[[^\]]+]\((https?:\/\/(?:www\.)?(?:github\.com|raw\.githubusercontent\.com)\/[^)\s]+)\)$/i.exec(
    trimmed
  );
  if (markdownLink) {
    return markdownLink[1];
  }

  const shortRepository = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(trimmed);
  if (shortRepository) {
    return `https://github.com/${shortRepository[1]}/${shortRepository[2]}`;
  }

  return trimmed;
}

function parseGitHubSkillUrl(input: string): GitHubSkillSpec {
  const normalizedInput = normalizeGitHubInput(input);
  let url: URL;
  try {
    url = new URL(normalizedInput);
  } catch {
    throw new Error("请输入有效的 GitHub 链接。");
  }

  if (url.hostname === "raw.githubusercontent.com") {
    const segments = pathSegments(url);
    const [owner, repo, ref, ...filePathParts] = segments;
    const filePath = filePathParts.join("/");

    if (!owner || !repo || !ref || !filePath.endsWith("SKILL.md")) {
      throw new Error("raw.githubusercontent.com 链接必须指向 SKILL.md。");
    }

    return {
      owner,
      repo,
      ref,
      path: path.posix.dirname(filePath) === "." ? "" : path.posix.dirname(filePath),
      sourceUrl: normalizeGitHubSourceUrl(normalizedInput),
      mode: "raw-skill-file"
    };
  }

  if (url.hostname !== "github.com" && url.hostname !== "www.github.com") {
    throw new Error("当前只支持 github.com 或 raw.githubusercontent.com 链接。");
  }

  const segments = pathSegments(url);
  const [owner, repo, kind, ref, ...targetPathParts] = segments;

  if (!owner || !repo) {
    throw new Error("GitHub 链接必须包含 owner 和 repo。");
  }

  if (!kind) {
    return {
      owner,
      repo,
      path: "",
      sourceUrl: normalizeGitHubSourceUrl(normalizedInput),
      mode: "repository"
    };
  }

  if (kind === "tree") {
    return {
      owner,
      repo,
      ref,
      path: targetPathParts.join("/"),
      sourceUrl: normalizeGitHubSourceUrl(normalizedInput),
      mode: "tree"
    };
  }

  if (kind === "blob") {
    const filePath = targetPathParts.join("/");
    if (!ref || !filePath.endsWith("SKILL.md")) {
      throw new Error("GitHub 文件链接必须指向 SKILL.md。");
    }

    return {
      owner,
      repo,
      ref,
      path: path.posix.dirname(filePath) === "." ? "" : path.posix.dirname(filePath),
      sourceUrl: normalizeGitHubSourceUrl(normalizedInput),
      mode: "skill-file"
    };
  }

  throw new Error("请粘贴 GitHub 仓库、文件夹，或 SKILL.md 文件链接。");
}

async function discoverGitHubSkillCandidates(spec: GitHubSkillSpec, signal?: AbortSignal): Promise<GitHubSkillCandidate[]> {
  throwIfAborted(signal, "GitHub 识别已取消。");
  if (spec.mode === "skill-file" || spec.mode === "raw-skill-file") {
    const directCandidate = await buildGitHubSkillCandidate(spec, spec.path, signal);
    return directCandidate ? [directCandidate] : [];
  }

  if (spec.mode === "tree" && spec.path) {
    const directCandidate = await buildGitHubSkillCandidate(spec, spec.path, signal);
    if (directCandidate) {
      return [directCandidate];
    }
  }

  const tree = await fetchGitHubTree(spec, signal);
  const skillDirectories = uniqueGitHubSkillDirectories(tree, spec.path).slice(0, MAX_GITHUB_DISCOVERY_CANDIDATES);
  return skillDirectories.map((skillPath) => buildFastGitHubSkillCandidate(spec, skillPath)).sort(compareGitHubCandidates);
}

function buildFastGitHubSkillCandidate(spec: GitHubSkillSpec, skillDirectoryPath: string): GitHubSkillCandidate {
  const fallbackName = path.posix.basename(skillDirectoryPath) || spec.repo;

  return {
    id: shortHash(`${spec.owner}/${spec.repo}:${spec.ref ?? ""}:${skillDirectoryPath}`),
    name: humanizeGitHubSkillName(fallbackName),
    description: "已发现 SKILL.md，导入时会完整读取并校验技能说明。",
    repository: `${spec.owner}/${spec.repo}`,
    ref: spec.ref ?? "",
    path: skillDirectoryPath,
    sourceUrl: githubTreeSourceUrl(spec, skillDirectoryPath),
    valid: true,
    issues: []
  };
}
async function buildGitHubSkillCandidate(
  spec: GitHubSkillSpec,
  skillDirectoryPath: string,
  signal?: AbortSignal
): Promise<GitHubSkillCandidate | null> {
  const skillPath = joinGitHubPath(skillDirectoryPath, "SKILL.md");
  const item = await fetchGitHubContentOrNull(spec, skillPath, signal);

  if (!item || Array.isArray(item) || item.type !== "file" || !item.download_url) {
    return null;
  }

  const markdown = await fetchGitHubText(item.download_url, signal);
  const frontmatter = parseFrontmatter(markdown);
  const issues: SkillIssue[] = [];
  if (!frontmatter.valid || !frontmatter.name) {
    issues.push({
      code: "invalid-frontmatter",
      message: "GitHub 链接中的 SKILL.md 缺少有效的 name 或 frontmatter。"
    });
  }

  const name = frontmatter.name?.trim() || path.posix.basename(skillDirectoryPath) || spec.repo;

  return {
    id: shortHash(`${spec.owner}/${spec.repo}:${spec.ref ?? ""}:${skillDirectoryPath}`),
    name,
    description: frontmatter.description?.trim() ?? "",
    repository: `${spec.owner}/${spec.repo}`,
    ref: spec.ref ?? "",
    path: skillDirectoryPath,
    sourceUrl: githubTreeSourceUrl(spec, skillDirectoryPath),
    valid: issues.length === 0,
    issues
  };
}

function uniqueGitHubSkillDirectories(tree: GitHubTreeResponse, rootPath: string): string[] {
  const directories = new Set<string>();

  for (const item of tree.tree ?? []) {
    if (item.type !== "blob" || !item.path.endsWith("/SKILL.md")) {
      continue;
    }

    const directoryPath = path.posix.dirname(item.path) === "." ? "" : path.posix.dirname(item.path);
    if (isSameOrInsideGitHubPath(directoryPath, rootPath)) {
      directories.add(directoryPath);
    }
  }

  return [...directories];
}

function isSameOrInsideGitHubPath(candidate: string, parent: string): boolean {
  const normalizedCandidate = trimGitHubPath(candidate);
  const normalizedParent = trimGitHubPath(parent);

  return (
    normalizedParent === "" ||
    normalizedCandidate === normalizedParent ||
    normalizedCandidate.startsWith(`${normalizedParent}/`)
  );
}

function compareGitHubCandidates(left: GitHubSkillCandidate, right: GitHubSkillCandidate): number {
  return (
    githubSkillPathRank(left.path) - githubSkillPathRank(right.path) ||
    left.name.localeCompare(right.name) ||
    left.path.localeCompare(right.path)
  );
}

function throwIfAborted(signal: AbortSignal | undefined, message: string): void {
  if (signal?.aborted) {
    throw new Error(message);
  }
}

function githubSkillPathRank(candidatePath: string): number {
  if (candidatePath.startsWith(".claude/skills/")) {
    return 0;
  }

  if (candidatePath.includes("/skills/") || candidatePath.startsWith("skills/")) {
    return 1;
  }

  return 2;
}

async function readGitHubSkillMarkdown(spec: GitHubSkillSpec): Promise<string> {
  const skillPath = joinGitHubPath(spec.path, "SKILL.md");
  const item = await fetchGitHubContent(spec, skillPath);

  if (Array.isArray(item) || item.type !== "file" || !item.download_url) {
    throw new Error("GitHub 链接必须指向包含 SKILL.md 的目录。");
  }

  return fetchGitHubText(item.download_url);
}

async function downloadGitHubDirectory(spec: GitHubSkillSpec, targetPath: string): Promise<void> {
  await fs.mkdir(targetPath, { recursive: true });
  await downloadGitHubContent(spec, spec.path, targetPath, { files: 0, bytes: 0, rootPath: path.resolve(targetPath) });
}

async function downloadGitHubContent(
  spec: GitHubSkillSpec,
  contentPath: string,
  targetPath: string,
  state: GitHubDownloadState
): Promise<void> {
  const item = await fetchGitHubContent(spec, contentPath);

  if (Array.isArray(item)) {
    await fs.mkdir(targetPath, { recursive: true });
    for (const child of item) {
      const childTarget = path.join(targetPath, child.name);
      if (!isSameOrInside(childTarget, state.rootPath)) {
        throw new Error("GitHub skill 包含不安全的文件路径。");
      }

      if (child.type === "dir") {
        await downloadGitHubContent(spec, child.path, childTarget, state);
        continue;
      }

      if (child.type === "file") {
        await downloadGitHubFile(child, childTarget, state);
        continue;
      }

      throw new Error("GitHub skill 中不支持符号链接、子模块或特殊文件。");
    }
    return;
  }

  if (item.type !== "file") {
    throw new Error("GitHub 链接必须指向文件夹或 SKILL.md。");
  }

  await downloadGitHubFile(item, path.join(targetPath, item.name), state);
}

async function downloadGitHubFile(item: GitHubContentItem, targetPath: string, state: GitHubDownloadState): Promise<void> {
  if (!item.download_url) {
    throw new Error(`无法下载 GitHub 文件：${item.path}`);
  }

  if ((item.size ?? 0) > MAX_GITHUB_FILE_BYTES) {
    throw new Error(`GitHub 文件过大：${item.path}`);
  }

  state.files += 1;
  if (state.files > MAX_GITHUB_FILES) {
    throw new Error("GitHub skill 文件数量过多，请只导入单个 skill 文件夹。");
  }

  const bytes = await fetchGitHubBytes(item.download_url);
  state.bytes += bytes.byteLength;

  if (bytes.byteLength > MAX_GITHUB_FILE_BYTES || state.bytes > MAX_GITHUB_TOTAL_BYTES) {
    throw new Error("GitHub skill 内容过大，请只导入单个轻量 skill 文件夹。");
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, Buffer.from(bytes));
}

async function fetchGitHubContent(
  spec: GitHubSkillSpec,
  contentPath: string,
  signal?: AbortSignal
): Promise<GitHubContentItem | GitHubContentItem[]> {
  const response = await fetch(githubContentApiUrl(spec, contentPath), {
    signal,
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "CodexSkillsManager"
    }
  });

  if (!response.ok) {
    throw new Error(`读取 GitHub 内容失败：${response.status} ${response.statusText}`);
  }

  return (await response.json()) as GitHubContentItem | GitHubContentItem[];
}

async function fetchGitHubContentOrNull(
  spec: GitHubSkillSpec,
  contentPath: string,
  signal?: AbortSignal
): Promise<GitHubContentItem | GitHubContentItem[] | null> {
  const response = await fetch(githubContentApiUrl(spec, contentPath), {
    signal,
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "CodexSkillsManager"
    }
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`读取 GitHub 内容失败：${response.status} ${response.statusText}`);
  }

  return (await response.json()) as GitHubContentItem | GitHubContentItem[];
}

async function fetchGitHubTree(spec: GitHubSkillSpec, signal?: AbortSignal): Promise<GitHubTreeResponse> {
  if (!spec.ref) {
    throw new Error("缺少 GitHub 分支信息，无法识别仓库内的技能。");
  }

  const response = await fetch(githubTreeApiUrl(spec), {
    signal,
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "CodexSkillsManager"
    }
  });

  if (!response.ok) {
    throw new Error(`读取 GitHub 仓库文件树失败：${response.status} ${response.statusText}`);
  }

  const tree = (await response.json()) as GitHubTreeResponse;
  if (tree.truncated) {
    throw new Error("GitHub 仓库文件树过大，无法完整识别技能；请粘贴更具体的 skills 文件夹链接。");
  }

  return tree;
}

async function fetchGitHubDefaultBranch(spec: GitHubSkillSpec, signal?: AbortSignal): Promise<string> {
  const url = new URL(`${GITHUB_API_ROOT}/repos/${encodeURIComponent(spec.owner)}/${encodeURIComponent(spec.repo)}`);
  const response = await fetch(url, {
    signal,
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "CodexSkillsManager"
    }
  });

  if (!response.ok) {
    throw new Error(`读取 GitHub 仓库信息失败：${response.status} ${response.statusText}`);
  }

  const repository = (await response.json()) as GitHubRepositoryResponse;
  if (!repository.default_branch) {
    throw new Error("无法识别 GitHub 仓库默认分支。");
  }

  return repository.default_branch;
}

async function fetchGitHubText(url: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(url, { signal, headers: { "User-Agent": "CodexSkillsManager" } });
  if (!response.ok) {
    throw new Error(`下载 GitHub 文件失败：${response.status} ${response.statusText}`);
  }

  return response.text();
}

async function fetchGitHubBytes(url: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(url, { signal, headers: { "User-Agent": "CodexSkillsManager" } });
  if (!response.ok) {
    throw new Error(`下载 GitHub 文件失败：${response.status} ${response.statusText}`);
  }

  return response.arrayBuffer();
}

function githubTreeApiUrl(spec: GitHubSkillSpec): string {
  const ref = encodeURIComponent(spec.ref ?? "HEAD");
  const url = new URL(`${GITHUB_API_ROOT}/repos/${encodeURIComponent(spec.owner)}/${encodeURIComponent(spec.repo)}/git/trees/${ref}`);
  url.searchParams.set("recursive", "1");
  return url.toString();
}

function githubContentApiUrl(spec: GitHubSkillSpec, contentPath: string): string {
  const encodedPath = encodeGitHubPath(contentPath);
  const url = new URL(`${GITHUB_API_ROOT}/repos/${encodeURIComponent(spec.owner)}/${encodeURIComponent(spec.repo)}/contents/${encodedPath}`);

  if (spec.ref) {
    url.searchParams.set("ref", spec.ref);
  }

  return url.toString();
}

function githubRepositorySourceUrl(spec: GitHubSkillSpec): string {
  const url = new URL(`https://github.com/${encodeURIComponent(spec.owner)}/${encodeURIComponent(spec.repo)}`);
  return url.toString();
}

function githubTreeSourceUrl(spec: GitHubSkillSpec, skillDirectoryPath: string): string {
  const ref = spec.ref ?? "HEAD";
  const encodedPath = encodeGitHubPath(skillDirectoryPath);
  const base = `https://github.com/${encodeURIComponent(spec.owner)}/${encodeURIComponent(spec.repo)}/tree/${encodeURIComponent(ref)}`;
  return encodedPath ? `${base}/${encodedPath}` : base;
}

function encodeGitHubPath(value: string): string {
  return value
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function joinGitHubPath(...parts: string[]): string {
  return parts
    .flatMap((part) => part.split("/"))
    .filter(Boolean)
    .join("/");
}

function trimGitHubPath(value: string): string {
  return value
    .split("/")
    .filter(Boolean)
    .join("/");
}

function pathSegments(url: URL): string[] {
  return url.pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => decodeURIComponent(segment));
}

function normalizeGitHubSourceUrl(value: string): string {
  const url = new URL(value.trim());
  url.hash = "";
  url.search = "";
  return url.toString();
}

function toSafeDirectoryName(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return normalized || "imported-skill";
}

function humanizeGitHubSkillName(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function shortHash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 8);
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function findSkillMarkdown(skillPath: string): Promise<string | null> {
  const activePath = path.join(skillPath, "SKILL.md");
  const disabledPath = path.join(skillPath, "SKILL.md.disabled");

  if (await exists(activePath)) {
    return activePath;
  }

  if (await exists(disabledPath)) {
    return disabledPath;
  }

  return null;
}

async function collectImportableSkillDirectories(rootPath: string, depth = 0): Promise<string[]> {
  const results: string[] = [];
  const entries = await fs.readdir(rootPath, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const entryPath = path.join(rootPath, entry.name);
    if (await findSkillMarkdown(entryPath)) {
      results.push(entryPath);
      continue;
    }

    if (depth >= 4) {
      continue;
    }

    results.push(...(await collectImportableSkillDirectories(entryPath, depth + 1)));
  }

  return results;
}

function normalizePath(targetPath: string): string {
  return path.resolve(targetPath).toLowerCase();
}

function isSameOrInside(candidate: string, parent: string): boolean {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === "" || (!!relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

async function copyDirectorySafely(source: string, target: string): Promise<void> {
  const sourceRoot = path.resolve(source);
  const targetRoot = path.resolve(target);

  async function copy(currentSource: string, currentTarget: string): Promise<void> {
    const stat = await fs.lstat(currentSource);

    if (stat.isSymbolicLink()) {
      throw new Error("导入的技能中不允许包含符号链接。");
    }

    if (stat.isDirectory()) {
      await fs.mkdir(currentTarget, { recursive: true });
      const entries = await fs.readdir(currentSource);

      for (const entry of entries) {
        const nextSource = path.join(currentSource, entry);
        const nextTarget = path.join(currentTarget, entry);
        const resolvedTarget = path.resolve(nextTarget);

        if (!isSameOrInside(resolvedTarget, targetRoot)) {
          throw new Error("检测到不安全的导入路径。");
        }

        await copy(nextSource, nextTarget);
      }
      return;
    }

    if (stat.isFile()) {
      const relative = path.relative(sourceRoot, currentSource);
      const resolvedTarget = path.resolve(targetRoot, relative);

      if (!isSameOrInside(resolvedTarget, targetRoot)) {
        throw new Error("检测到不安全的导入路径。");
      }

      await fs.copyFile(currentSource, resolvedTarget);
    }
  }

  await copy(sourceRoot, targetRoot);
}
