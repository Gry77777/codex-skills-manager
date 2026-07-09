import { promises as fs } from "node:fs";
import path from "node:path";
import type { SkillIssue, SkillStatus } from "../shared/types.js";
import { getPrimarySkillMarkdown, hasUsableFrontmatter, type SkillDiskState } from "./skill-disk-state.js";
import type { Frontmatter } from "./skill-frontmatter.js";

export type SkillHealth = {
  status: SkillStatus;
  valid: boolean;
  issues: SkillIssue[];
  frontmatter: Frontmatter | null;
};

const nonBlockingIssueCodes = new Set<SkillIssue["code"]>([
  "duplicate-name",
  "missing-description",
  "missing-reference",
  "nested-skill"
]);

export async function analyzeSkillHealth(state: SkillDiskState): Promise<SkillHealth> {
  const primary = getPrimarySkillMarkdown(state);
  const issues: SkillIssue[] = [];

  if (state.kind === "path-missing") {
    return {
      status: "invalid",
      valid: false,
      issues: [{ code: "path-missing", message: "这个技能路径已经不存在。" }],
      frontmatter: null
    };
  }

  if (state.kind === "missing") {
    return {
      status: "invalid",
      valid: false,
      issues: [{ code: "missing-skill-md", message: "这个目录缺少 SKILL.md 或 SKILL.md.disabled。" }],
      frontmatter: null
    };
  }

  if (state.kind === "conflict") {
    issues.push({
      code: "skill-md-conflict",
      message: "这个技能同时存在 SKILL.md 和 SKILL.md.disabled，当前状态不明确，需要先修复冲突。"
    });
  }

  if (!hasUsableFrontmatter(primary)) {
    issues.push({
      code: "invalid-frontmatter",
      message: `${primary?.fileName ?? "SKILL.md"} 的头部元信息至少需要包含 name 字段。`
    });
  }

  if (primary?.frontmatter.valid && !primary.frontmatter.description?.trim()) {
    issues.push({
      code: "missing-description",
      message: `${primary.fileName} 的 description 为空，技能列表里会缺少用途说明。`
    });
  }

  if (isUnsafeSkillPath(state.directory)) {
    issues.push({
      code: "unsafe-skill-path",
      message: `技能目录名包含不安全片段：${path.basename(state.directory)}。`
    });
  }

  if (primary) {
    issues.push(...(await findMissingLocalReferences(primary.markdown, state.directory)));
  }

  const hasBlockingIssue = issues.some((issue) => !nonBlockingIssueCodes.has(issue.code));

  return {
    status: hasBlockingIssue ? "invalid" : state.kind === "disabled" ? "disabled" : "enabled",
    valid: !hasBlockingIssue,
    issues,
    frontmatter: primary?.frontmatter ?? null
  };
}

function isUnsafeSkillPath(directory: string): boolean {
  const baseName = path.basename(directory);
  return /[<>:"|?*]/.test(baseName) || /%2f|%5c/i.test(baseName) || /[\u0000-\u001f]/.test(baseName);
}

async function findMissingLocalReferences(markdown: string, directory: string): Promise<SkillIssue[]> {
  const references = extractLocalReferences(markdown);
  const missing: SkillIssue[] = [];

  for (const reference of references) {
    const targetPath = path.resolve(directory, reference);
    if (!isInside(directory, targetPath) || !(await exists(targetPath))) {
      missing.push({
        code: "missing-reference",
        message: `SKILL.md 引用了不存在的本地文件：${reference.replace(/\\/g, "/")}`
      });
    }
  }

  return missing;
}

function extractLocalReferences(markdown: string): string[] {
  const references = new Set<string>();
  const searchableMarkdown = markdown.replace(/```[\s\S]*?```/g, "");
  const markdownLinkPattern = /!?\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let match: RegExpExecArray | null;

  while ((match = markdownLinkPattern.exec(searchableMarkdown))) {
    addReference(references, match[1]);
  }

  const codeReferencePattern = /`((?:references|scripts|assets|templates)[/\\][^`\s]+)`/gi;
  while ((match = codeReferencePattern.exec(searchableMarkdown))) {
    addReference(references, match[1]);
  }

  return [...references].sort();
}

function addReference(references: Set<string>, rawReference: string): void {
  const withoutAnchor = rawReference.split("#")[0]?.trim();
  if (!withoutAnchor || isPlaceholderReference(withoutAnchor) || isExternalReference(withoutAnchor) || path.isAbsolute(withoutAnchor)) {
    return;
  }

  references.add(withoutAnchor.replace(/\\/g, path.sep).replace(/\//g, path.sep));
}

function isPlaceholderReference(reference: string): boolean {
  return (
    reference === "path" ||
    reference.startsWith("..") ||
    /[<>{}]/.test(reference) ||
    /(^|[/\\])(?:your-|example|sample|placeholder)/i.test(reference)
  );
}

function isExternalReference(reference: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(reference) || reference.startsWith("#");
}

function isInside(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
