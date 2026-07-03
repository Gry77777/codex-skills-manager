import { promises as fs } from "node:fs";
import path from "node:path";
import type { SkillRecord } from "../shared/types.js";
import {
  getPrimarySkillMarkdown,
  hasUsableFrontmatter,
  readSkillDiskState,
  type SkillMarkdownFile
} from "./skill-disk-state.js";
import { buildFrontmatterPatch, type SkillRepairPlan, type SkillRepairPlanItem } from "./skill-repair-plan.js";

export class SkillRepairPlanner {
  async plan(records: SkillRecord[]): Promise<SkillRepairPlan> {
    const items: SkillRepairPlanItem[] = [];
    const visitedPaths = new Set<string>();

    for (const record of records) {
      const hasPathMissingIssue = record.issues.some((issue) => issue.code === "path-missing");
      if (hasPathMissingIssue) {
        items.push({
          record,
          action: "清理失效记录",
          message: "技能路径已经不存在，将从管理器 registry 中移除；不会删除任何技能目录。",
          operations: [{ type: "remove-registry-record", id: record.id }]
        });
        continue;
      }

      const normalizedPath = path.resolve(record.path).toLowerCase();
      if (visitedPaths.has(normalizedPath)) {
        continue;
      }
      visitedPaths.add(normalizedPath);

      const state = await readSkillDiskState(record.path);
      if (state.kind === "path-missing") {
        items.push({
          record,
          action: "跳过缺失路径",
          message: "技能目录不存在，但当前记录不是可清理的 registry 失效记录。",
          operations: [],
          skip: true
        });
        continue;
      }

      if (state.kind === "missing") {
        items.push({
          record,
          action: "缺少 SKILL.md",
          message: "目录中没有 SKILL.md 或 SKILL.md.disabled，无法安全自动生成技能入口。",
          operations: [],
          skip: true
        });
        continue;
      }

      if (state.kind === "conflict") {
        items.push(await this.planConflictRepair(record, state.active, state.disabled));
        continue;
      }

      const primary = getPrimarySkillMarkdown(state);
      if (primary && !hasUsableFrontmatter(primary)) {
        items.push(this.planFrontmatterRepair(record, primary));
        continue;
      }

      if (record.issues.length > 0 && record.issues.every((issue) => issue.code === "duplicate-name")) {
        items.push({
          record,
          action: "同名技能",
          message: "同名技能可以分别管理，一键修复不会自动改名，避免破坏触发规则。",
          operations: [],
          skip: true
        });
      }
    }

    return { checked: records.length, items };
  }

  private async planConflictRepair(
    record: SkillRecord,
    active: SkillMarkdownFile | null,
    disabled: SkillMarkdownFile | null
  ): Promise<SkillRepairPlanItem> {
    if (!active || !disabled) {
      return {
        record,
        action: "SKILL.md 冲突",
        message: "冲突状态发生变化，请刷新后重试。",
        operations: [],
        skip: true
      };
    }

    if (hasUsableFrontmatter(active)) {
      const backup = await nextBackupPath(disabled.path);
      return {
        record,
        action: "解决 SKILL.md 冲突",
        message: `同时存在 SKILL.md 和 SKILL.md.disabled，将保留启用文件并把关闭文件备份为 ${path.basename(backup)}。`,
        operations: [{ type: "rename-file", from: disabled.path, to: backup }]
      };
    }

    if (hasUsableFrontmatter(disabled)) {
      const backup = await nextBackupPath(active.path);
      return {
        record,
        action: "解决 SKILL.md 冲突",
        message: `启用文件头部无效，将备份为 ${path.basename(backup)}，并恢复 SKILL.md.disabled 为 SKILL.md。`,
        operations: [
          { type: "rename-file", from: active.path, to: backup },
          { type: "rename-file", from: disabled.path, to: active.path }
        ]
      };
    }

    const backup = await nextBackupPath(disabled.path);
    const patch = buildFrontmatterPatch(record);
    return {
      record,
      action: "解决 SKILL.md 冲突",
      message: `两个文件头部都无效，将保留 SKILL.md、备份 SKILL.md.disabled 为 ${path.basename(backup)}，并补齐 SKILL.md frontmatter。`,
      operations: [
        { type: "rename-file", from: disabled.path, to: backup },
        { type: "prepend-frontmatter", filePath: active.path, ...patch }
      ]
    };
  }

  private planFrontmatterRepair(record: SkillRecord, file: SkillMarkdownFile): SkillRepairPlanItem {
    return {
      record,
      action: "补齐 frontmatter",
      message: `${file.fileName} 缺少有效 name，将在文件顶部补齐标准头部。`,
      operations: [{ type: "prepend-frontmatter", filePath: file.path, ...buildFrontmatterPatch(record) }]
    };
  }
}

async function nextBackupPath(targetPath: string): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const first = `${targetPath}.backup-${stamp}`;
  if (!(await exists(first))) {
    return first;
  }

  for (let index = 2; index < 100; index += 1) {
    const candidate = `${first}-${index}`;
    if (!(await exists(candidate))) {
      return candidate;
    }
  }

  throw new Error("无法生成可用的备份文件名。");
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
