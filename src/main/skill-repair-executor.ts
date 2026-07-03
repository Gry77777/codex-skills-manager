import { promises as fs } from "node:fs";
import path from "node:path";
import type { RegistryFile, SkillRepairAction, SkillRepairSummary } from "../shared/types.js";
import { getRegistryPath } from "./paths.js";
import { parseFrontmatter } from "./skill-frontmatter.js";
import type { SkillRepairOperation, SkillRepairPlan, SkillRepairPlanItem } from "./skill-repair-plan.js";

export class SkillRepairExecutor {
  constructor(private readonly registryPath = getRegistryPath()) {}

  async execute(plan: SkillRepairPlan): Promise<SkillRepairSummary> {
    const summary: SkillRepairSummary = { checked: plan.checked, repaired: 0, skipped: 0, failed: 0, actions: [] };
    const registryRecordsToRemove = new Set<string>();

    for (const item of plan.items) {
      if (item.skip || item.operations.length === 0) {
        this.addAction(summary, {
          path: item.record.path,
          action: item.action,
          status: "skipped",
          message: item.message
        });
        continue;
      }

      try {
        await this.executeItem(item, registryRecordsToRemove);
        this.addAction(summary, {
          path: item.record.path,
          action: item.action,
          status: "repaired",
          message: item.message
        });
      } catch (error) {
        this.addAction(summary, {
          path: item.record.path,
          action: item.action,
          status: "failed",
          message: error instanceof Error ? error.message : "未知错误"
        });
      }
    }

    if (registryRecordsToRemove.size > 0) {
      await this.removeRegistryRecords(registryRecordsToRemove);
    }

    return summary;
  }

  private async executeItem(item: SkillRepairPlanItem, registryRecordsToRemove: Set<string>): Promise<void> {
    for (const operation of item.operations) {
      await this.executeOperation(operation, registryRecordsToRemove);
    }
  }

  private async executeOperation(operation: SkillRepairOperation, registryRecordsToRemove: Set<string>): Promise<void> {
    if (operation.type === "remove-registry-record") {
      registryRecordsToRemove.add(operation.id);
      return;
    }

    if (operation.type === "rename-file") {
      await this.renameFile(operation.from, operation.to);
      return;
    }

    await this.prependFrontmatter(operation.filePath, operation.name, operation.description);
  }

  private async renameFile(from: string, to: string): Promise<void> {
    const source = path.resolve(from);
    const target = path.resolve(to);

    if (!(await exists(source))) {
      throw new Error(`找不到要修复的文件：${source}`);
    }

    if (await exists(target)) {
      throw new Error(`备份文件已经存在：${target}`);
    }

    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.rename(source, target);
  }

  private async prependFrontmatter(filePath: string, name: string, description: string): Promise<void> {
    const markdown = await fs.readFile(filePath, "utf8");
    const frontmatter = parseFrontmatter(markdown);
    if (frontmatter.valid && frontmatter.name?.trim()) {
      return;
    }

    const repaired = `---\nname: ${name}\ndescription: ${description}\n---\n\n${markdown}`;
    await fs.writeFile(filePath, repaired, "utf8");
  }

  private async removeRegistryRecords(ids: Set<string>): Promise<void> {
    let registry: RegistryFile;
    try {
      registry = JSON.parse(await fs.readFile(this.registryPath, "utf8")) as RegistryFile;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      throw error;
    }

    for (const id of ids) {
      delete registry.records[id];
    }

    await fs.writeFile(this.registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  }

  private addAction(summary: SkillRepairSummary, action: SkillRepairAction): void {
    summary.actions.push(action);
    if (action.status === "repaired") {
      summary.repaired += 1;
    } else if (action.status === "failed") {
      summary.failed += 1;
    } else {
      summary.skipped += 1;
    }
  }
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
