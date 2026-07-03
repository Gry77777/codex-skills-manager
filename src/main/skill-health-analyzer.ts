import type { SkillIssue, SkillStatus } from "../shared/types.js";
import { getPrimarySkillMarkdown, hasUsableFrontmatter, type SkillDiskState } from "./skill-disk-state.js";
import type { Frontmatter } from "./skill-frontmatter.js";

export type SkillHealth = {
  status: SkillStatus;
  valid: boolean;
  issues: SkillIssue[];
  frontmatter: Frontmatter | null;
};

export function analyzeSkillHealth(state: SkillDiskState): SkillHealth {
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

  const hasBlockingIssue = issues.some((issue) => issue.code !== "duplicate-name");

  return {
    status: hasBlockingIssue ? "invalid" : state.kind === "disabled" ? "disabled" : "enabled",
    valid: !hasBlockingIssue,
    issues,
    frontmatter: primary?.frontmatter ?? null
  };
}
