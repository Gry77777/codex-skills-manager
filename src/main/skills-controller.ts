import { dialog, shell } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import type {
  BulkImportSummary,
  GitHubDiscoveryResult,
  MarketplaceSearchInput,
  MarketplaceSearchResult,
  SettableSkillStatus,
  SkillRecord,
  SkillRepairSummary
} from "../shared/types.js";
import { getSkillRoots } from "./paths.js";
import { setPhysicalSkillStatus } from "./physical-skill-status.js";
import { getPrimarySkillMarkdown, readSkillDiskState } from "./skill-disk-state.js";
import { SkillImporter } from "./skill-importer.js";
import { SkillMarketplace } from "./skill-marketplace.js";
import { SkillRepairer } from "./skill-repairer.js";
import { SkillRegistry } from "./skill-registry.js";
import { SkillScanner } from "./skill-scanner.js";

const GITHUB_IMPORT_CONCURRENCY = 3;

export class SkillsController {
  private readonly scanner = new SkillScanner(getSkillRoots());
  private readonly registry = new SkillRegistry();
  private readonly importer = new SkillImporter();
  private readonly marketplace = new SkillMarketplace();
  private readonly repairer = new SkillRepairer();

  async scan(): Promise<SkillRecord[]> {
    return this.registry.list(await this.scanner.scan());
  }

  async list(): Promise<SkillRecord[]> {
    return this.scan();
  }

  async setStatus(id: string, status: SettableSkillStatus): Promise<SkillRecord> {
    assertStatus(status);
    const records = await this.scan();
    const target = records.find((record) => record.id === id);

    if (!target) {
      throw new Error("没有找到这个技能。");
    }

    if (!target.valid) {
      throw new Error("无效的技能不能打开或关闭。");
    }

    if (!target.canSetStatus) {
      throw new Error(target.managementNote ?? "这个技能来源不允许在这里开关。");
    }

    await setPhysicalSkillStatus(target, status);
    const updatedRecords = await this.scan();
    const updated = updatedRecords.find((record) => record.id === id);

    if (!updated) {
      throw new Error("技能状态已更新，但重新扫描时没有找到这个技能。");
    }

    return updated;
  }

  async importFolder(folderPath: string): Promise<SkillRecord> {
    if (typeof folderPath !== "string" || folderPath.trim() === "") {
      throw new Error("请选择要导入的文件夹。");
    }

    const imported = await this.importer.importFolder(folderPath);
    await this.scan();
    return imported;
  }

  async importGitHubUrl(githubUrl: string): Promise<SkillRecord> {
    if (typeof githubUrl !== "string" || githubUrl.trim() === "") {
      throw new Error("请输入要导入的 GitHub 链接。");
    }

    const imported = await this.importer.importGitHubUrl(githubUrl);
    await this.scan();
    return imported;
  }

  async discoverGitHubSkills(githubUrl: string, signal?: AbortSignal): Promise<GitHubDiscoveryResult> {
    if (typeof githubUrl !== "string" || githubUrl.trim() === "") {
      throw new Error("请输入要识别的 GitHub 链接。");
    }

    return this.importer.discoverGitHubSkills(githubUrl, signal);
  }

  async importGitHubUrls(githubUrls: string[]): Promise<SkillRecord[]> {
    if (!Array.isArray(githubUrls) || githubUrls.length === 0) {
      throw new Error("请选择要导入的 GitHub 技能。");
    }

    if (githubUrls.length > 50) {
      throw new Error("一次最多导入 50 个 GitHub 技能。");
    }

    const results = await mapWithConcurrency(githubUrls, GITHUB_IMPORT_CONCURRENCY, async (githubUrl) => {
      if (typeof githubUrl !== "string" || githubUrl.trim() === "") {
        throw new Error("GitHub 技能链接无效。");
      }

      return this.importer.importGitHubUrl(githubUrl);
    });
    const imported = results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
    const failures = results.flatMap((result) =>
      result.status === "rejected" ? [result.reason instanceof Error ? result.reason.message : "导入 GitHub 技能失败。"] : []
    );

    if (imported.length === 0) {
      throw new Error(failures[0] ?? "从 GitHub 导入技能失败。");
    }

    await this.scan();
    return imported;
  }

  async searchMarketplace(input?: MarketplaceSearchInput): Promise<MarketplaceSearchResult> {
    return this.marketplace.search(input);
  }

  async refreshMarketplaceSource(sourceId: string, input?: MarketplaceSearchInput): Promise<MarketplaceSearchResult> {
    if (typeof sourceId !== "string" || sourceId.trim() === "") {
      throw new Error("缺少要刷新的技能广场来源。");
    }

    return this.marketplace.refreshSource(sourceId, input);
  }

  async importLocalSkills(): Promise<BulkImportSummary> {
    const roots = getSkillRoots();
    const summary = await this.importer.importLocalSkills([
      { source: "codex-local", path: roots.codexLocal },
      { source: "agent-local", path: roots.agentLocal }
    ]);

    await this.scan();
    return summary;
  }

  async repairBrokenSkills(): Promise<SkillRepairSummary> {
    const records = await this.scan();
    const summary = await this.repairer.repair(records);
    await this.scan();
    return summary;
  }

  async selectFolder(): Promise<string | null> {
    const result = await dialog.showOpenDialog({
      title: "选择技能文件夹",
      properties: ["openDirectory"]
    });

    return result.canceled ? null : result.filePaths[0] ?? null;
  }

  async revealInExplorer(id: string): Promise<void> {
    const skill = await this.findSkill(id);
    await shell.openPath(skill.path);
  }

  async readSkillMd(id: string): Promise<string> {
    const skill = await this.findSkill(id);
    const diskState = await readSkillDiskState(skill.path);
    const markdown = getPrimarySkillMarkdown(diskState);
    if (!markdown) {
      throw new Error("找不到 SKILL.md 或 SKILL.md.disabled，无法读取技能内容。");
    }

    return fs.readFile(markdown.path, "utf8");
  }

  private async findSkill(id: string): Promise<SkillRecord> {
    if (typeof id !== "string" || id.trim() === "") {
      throw new Error("缺少技能标识。");
    }

    const skills = await this.list();
    const skill = skills.find((record) => record.id === id);

    if (!skill) {
      throw new Error("没有找到这个技能。");
    }

    return skill;
  }
}

function assertStatus(status: string): asserts status is SettableSkillStatus {
  if (status !== "enabled" && status !== "disabled") {
    throw new Error("不支持的技能状态。");
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<Array<PromiseSettledResult<R>>> {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      try {
        results[currentIndex] = {
          status: "fulfilled",
          value: await mapper(items[currentIndex], currentIndex)
        };
      } catch (error) {
        results[currentIndex] = {
          status: "rejected",
          reason: error
        };
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
