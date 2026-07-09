import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { SkillIssue, SkillRecord, SkillScanResult, SkillSource, SkillSourceDiagnostic } from "../shared/types.js";
import type { SkillRoots } from "./paths.js";
import { getPrimarySkillMarkdown, readSkillDiskState } from "./skill-disk-state.js";
import { analyzeSkillHealth } from "./skill-health-analyzer.js";
import { buildSkillSummaryZh } from "./skill-summary.js";
export { parseFrontmatter } from "./skill-frontmatter.js";

type ScanRoot = {
  source: SkillSource;
  path: string;
};

type RootScanResult = {
  skills: SkillRecord[];
  diagnostic: SkillSourceDiagnostic;
};

const sourcePriority: Record<SkillSource, number> = {
  imported: 5,
  "codex-local": 4,
  "agent-local": 3,
  "superpowers-local": 2,
  "plugin-cache": 1
};

export class SkillScanner {
  constructor(private readonly roots: SkillRoots) {}

  async scan(): Promise<SkillRecord[]> {
    return (await this.scanWithDiagnostics()).skills;
  }

  async scanWithDiagnostics(): Promise<SkillScanResult> {
    const now = new Date().toISOString();
    const roots: ScanRoot[] = [
      { source: "codex-local", path: this.roots.codexLocal },
      { source: "agent-local", path: this.roots.agentLocal },
      { source: "superpowers-local", path: this.roots.superpowersLocal },
      { source: "plugin-cache", path: this.roots.pluginCache },
      { source: "imported", path: this.roots.imported }
    ];

    const rootResults = await Promise.all(roots.map((root) => this.scanRoot(root, now)));
    const skills = markNameConflicts(rootResults.flatMap((result) => result.skills));

    return {
      skills,
      diagnostics: {
        roots: rootResults.map((result) => result.diagnostic),
        totalScanned: skills.length,
        totalInvalid: skills.filter((skill) => !skill.valid).length,
        lastScannedAt: now
      }
    };
  }

  private async scanRoot(root: ScanRoot, now: string): Promise<RootScanResult> {
    if (!(await exists(root.path))) {
      return {
        skills: [],
        diagnostic: emptyDiagnostic(root, now, false)
      };
    }

    try {
      const entries = await fs.readdir(root.path, { withFileTypes: true });
      const directories = entries.filter((entry) => entry.isDirectory());
      const skillDirectories = (
        await Promise.all(
          directories.map(async (entry) => {
            const entryPath = path.join(root.path, entry.name);
            const nestedSkillDirectories = await collectSkillDirectories(entryPath);
            return nestedSkillDirectories.length > 0 ? nestedSkillDirectories : [entryPath];
          })
        )
      ).flat();
      const records = markNestedSkillIssues(await Promise.all(
        skillDirectories.map((skillPath) => this.scanSkillDirectory(root.source, skillPath, now))
      ));

      return {
        skills: records,
        diagnostic: {
          ...emptyDiagnostic(root, now, true),
          scannedCount: records.length,
          invalidCount: records.filter((record) => !record.valid).length,
          issueCount: records.reduce((count, record) => count + record.issues.length, 0)
        }
      };
    } catch (error) {
      return {
        skills: [],
        diagnostic: {
          ...emptyDiagnostic(root, now, true),
          error: error instanceof Error ? error.message : "Unknown scan error"
        }
      };
    }
  }

  private async scanSkillDirectory(source: SkillSource, skillPath: string, now: string): Promise<SkillRecord> {
    const diskState = await readSkillDiskState(skillPath);
    const health = await analyzeSkillHealth(diskState);
    const primary = getPrimarySkillMarkdown(diskState);
    const name = primary?.frontmatter.name?.trim() || path.basename(skillPath);
    const description = primary?.frontmatter.description?.trim() || "";
    const hash = diskState.kind === "path-missing" ? "" : await hashDirectory(skillPath);

    return {
      id: buildSkillId(source, skillPath),
      name,
      description,
      summaryZh: buildSkillSummaryZh({ name, description, source, valid: health.valid, issues: health.issues }),
      path: skillPath,
      source,
      status: health.status,
      readonly: isReadOnlySource(source),
      canSetStatus: canSetSourceStatus(source),
      managementNote: getSourceManagementNote(source),
      valid: health.valid,
      issues: health.issues,
      hash,
      lastScannedAt: now
    };
  }
}

export function buildSkillId(source: SkillSource, absolutePath: string): string {
  return crypto.createHash("sha256").update(`${source}:${path.resolve(absolutePath)}`).digest("hex");
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function collectSkillDirectories(candidatePath: string, depth = 0): Promise<string[]> {
  const results: string[] = [];

  if (await hasSkillMarkdown(candidatePath)) {
    results.push(candidatePath);
  }

  if (depth >= 4) {
    return results;
  }

  let entries;
  try {
    entries = await fs.readdir(candidatePath, { withFileTypes: true });
  } catch {
    return [];
  }

  const directories = entries.filter((entry) => entry.isDirectory() && entry.name !== ".git" && entry.name !== "node_modules");
  const nested = await Promise.all(
    directories.map((entry) => collectSkillDirectories(path.join(candidatePath, entry.name), depth + 1))
  );

  return [...new Set([...results, ...nested.flat()])];
}

function isReadOnlySource(source: SkillSource): boolean {
  return source !== "imported" && source !== "superpowers-local";
}

function canSetSourceStatus(source: SkillSource): boolean {
  return source !== "plugin-cache";
}

function getSourceManagementNote(source: SkillSource): string | undefined {
  if (source === "superpowers-local") {
    return "Superpowers 技能属于高级工作流能力，开关后建议重新打开 Codex 会话。";
  }

  if (source === "plugin-cache") {
    return "插件缓存由 Codex 插件管理，当前仅展示，不允许在这里开关。";
  }

  return undefined;
}

function emptyDiagnostic(root: ScanRoot, lastScannedAt: string, exists: boolean): SkillSourceDiagnostic {
  return {
    source: root.source,
    path: root.path,
    exists,
    scannedCount: 0,
    invalidCount: 0,
    issueCount: 0,
    lastScannedAt
  };
}

function markNestedSkillIssues(skills: SkillRecord[]): SkillRecord[] {
  return skills.map((skill) => {
    const nestedUnder = skills.find((candidate) => candidate.id !== skill.id && isInside(candidate.path, skill.path));
    const childSkills = skills.filter((candidate) => candidate.id !== skill.id && isInside(skill.path, candidate.path));

    if (!nestedUnder && childSkills.length === 0) {
      return skill;
    }

    const messages: string[] = [];
    if (nestedUnder) {
      messages.push(`这个技能位于另一个技能目录内：${nestedUnder.name}。`);
    }
    if (childSkills.length > 0) {
      messages.push(`这个技能目录内还包含 ${childSkills.length} 个子技能目录。`);
    }

    return {
      ...skill,
      issues: [
        ...skill.issues,
        ...messages.map((message) => ({
          code: "nested-skill" as const,
          message
        }))
      ]
    };
  });
}

function isInside(parentPath: string, childPath: string): boolean {
  const relative = path.relative(path.resolve(parentPath), path.resolve(childPath));
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function hasSkillMarkdown(skillPath: string): Promise<boolean> {
  return (await exists(path.join(skillPath, "SKILL.md"))) || (await exists(path.join(skillPath, "SKILL.md.disabled")));
}

async function hashDirectory(directory: string): Promise<string> {
  const hash = crypto.createHash("sha256");

  async function walk(current: string): Promise<void> {
    const entries = await fs.readdir(current, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === "node_modules") {
        continue;
      }

      const entryPath = path.join(current, entry.name);
      const relative = path.relative(directory, entryPath);
      hash.update(relative);

      if (entry.isDirectory()) {
        await walk(entryPath);
      } else if (entry.isFile()) {
        hash.update(await fs.readFile(entryPath));
      }
    }
  }

  await walk(directory);
  return hash.digest("hex");
}

function markNameConflicts(skills: SkillRecord[]): SkillRecord[] {
  const byName = new Map<string, SkillRecord[]>();

  for (const skill of skills) {
    const key = skill.name.trim().toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), skill]);
  }

  return skills.map((skill) => {
    const duplicates = byName.get(skill.name.trim().toLowerCase()) ?? [];
    if (duplicates.length <= 1) {
      return skill;
    }

    const ordered = [...duplicates].sort(compareConflictPriority);
    const primary = ordered[0];
    const relatedSkillIds = ordered.map((duplicate) => duplicate.id);
    const role = skill.id === primary.id ? "primary" : "shadowed";
    const message =
      role === "primary"
        ? `发现 ${duplicates.length} 个同名技能“${skill.name}”，当前按来源优先级使用 ${getSourceName(skill.source)}。`
        : `发现同名技能“${skill.name}”，当前记录被 ${getSourceName(primary.source)} 来源覆盖。`;

    return {
      ...skill,
      conflict: {
        name: skill.name,
        role,
        primarySkillId: primary.id,
        primarySource: primary.source,
        sourcePriority: sourcePriority[skill.source],
        relatedSkillIds
      },
      issues: [
        ...skill.issues.filter((issue) => issue.code !== "duplicate-name"),
        {
          code: "duplicate-name",
          message
        }
      ]
    };
  });
}

function compareConflictPriority(left: SkillRecord, right: SkillRecord): number {
  return (
    Number(right.valid) - Number(left.valid) ||
    sourcePriority[right.source] - sourcePriority[left.source] ||
    left.path.localeCompare(right.path)
  );
}

function getSourceName(source: SkillSource): string {
  const labels: Record<SkillSource, string> = {
    imported: "已导入",
    "codex-local": ".codex",
    "agent-local": ".agents",
    "superpowers-local": "Superpowers",
    "plugin-cache": "插件缓存"
  };

  return labels[source];
}
