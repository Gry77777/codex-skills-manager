import { promises as fs } from "node:fs";
import path from "node:path";
import type { RegistryFile, RegistryState, SettableSkillStatus, SkillRecord } from "../shared/types.js";
import { getRegistryPath, getStateRoot } from "./paths.js";
import { buildSkillSummaryZh } from "./skill-summary.js";

export class SkillRegistry {
  constructor(private readonly registryPath = getRegistryPath()) {}

  async list(scanned: SkillRecord[]): Promise<SkillRecord[]> {
    const registry = await this.read();
    const merged = mergeRecords(scanned, registry.records);
    await this.writeFromRecords(merged);
    return merged;
  }

  async setStatus(scanned: SkillRecord[], id: string, status: SettableSkillStatus): Promise<SkillRecord> {
    const records = await this.list(scanned);
    const target = records.find((record) => record.id === id);

    if (!target) {
      throw new Error("没有找到这个技能。");
    }

    if (!target.valid) {
      throw new Error("无效的技能不能打开或关闭。");
    }

    const updated = records.map((record) => (record.id === id ? { ...record, status } : record));
    await this.writeFromRecords(updated);
    return updated.find((record) => record.id === id)!;
  }

  async read(): Promise<RegistryFile> {
    try {
      const raw = await fs.readFile(this.registryPath, "utf8");
      const parsed = JSON.parse(raw) as RegistryFile;

      if (parsed.version !== 1 || typeof parsed.records !== "object" || parsed.records === null) {
        return emptyRegistry();
      }

      return parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return emptyRegistry();
      }

      if (error instanceof SyntaxError) {
        await this.backupCorruptRegistry();
        return emptyRegistry();
      }

      throw new Error(`读取技能状态记录失败：${error instanceof Error ? error.message : "未知错误"}`);
    }
  }

  private async writeFromRecords(records: SkillRecord[]): Promise<void> {
    const registry: RegistryFile = {
      version: 1,
      records: Object.fromEntries(records.map((record) => [record.id, toRegistryState(record)]))
    };

    await fs.mkdir(path.dirname(this.registryPath), { recursive: true });
    await fs.writeFile(this.registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  }

  private async backupCorruptRegistry(): Promise<void> {
    try {
      const backupPath = `${this.registryPath}.corrupt-${new Date().toISOString().replace(/[:.]/g, "-")}`;
      await fs.rename(this.registryPath, backupPath);
    } catch {
      // If backup fails, continue with an empty registry so the app remains usable.
    }
  }
}

function emptyRegistry(): RegistryFile {
  return { version: 1, records: {} };
}

function mergeRecords(scanned: SkillRecord[], persisted: Record<string, RegistryState>): SkillRecord[] {
  const seen = new Set<string>();
  const merged = scanned.map((record) => {
    seen.add(record.id);

    return {
      ...record,
      status: record.valid ? record.status : "invalid"
    };
  });

  for (const saved of Object.values(persisted)) {
    if (seen.has(saved.id)) {
      continue;
    }

    merged.push({
      id: saved.id,
      name: path.basename(saved.path),
      description: "",
      summaryZh: buildSkillSummaryZh({
        name: path.basename(saved.path),
        description: "",
        source: saved.source,
        valid: false,
        issues: [{ code: "path-missing", message: "这个技能路径已经不存在。" }]
      }),
      path: saved.path,
      source: saved.source,
      status: "invalid",
      readonly: saved.source !== "imported",
      valid: false,
      issues: [{ code: "path-missing", message: "这个技能路径已经不存在。" }],
      hash: saved.hash ?? "",
      lastScannedAt: saved.lastSeenAt ?? new Date().toISOString()
    });
  }

  return merged.sort((a, b) => a.name.localeCompare(b.name) || a.source.localeCompare(b.source));
}

function toRegistryState(record: SkillRecord): RegistryState {
  return {
    id: record.id,
    path: record.path,
    source: record.source,
    status: record.status,
    hash: record.hash,
    lastSeenAt: record.lastScannedAt
  };
}

export async function ensureStateDirectories(): Promise<void> {
  await fs.mkdir(getStateRoot(), { recursive: true });
}
