import { promises as fs } from "node:fs";
import path from "node:path";
import type { AiAnalysisCacheView, AiSkillAnalysisRecord } from "../shared/types.js";
import { getAiAnalysisCachePath } from "./paths.js";

type StoredAiAnalysisCache = {
  version: 1;
  records: Record<string, AiSkillAnalysisRecord>;
};

export class AiAnalysisCache {
  constructor(private readonly cachePath = getAiAnalysisCachePath()) {}

  async read(): Promise<AiAnalysisCacheView> {
    const cache = await this.readStored();
    return { records: cache.records };
  }

  async get(skillId: string): Promise<AiSkillAnalysisRecord | null> {
    const cache = await this.readStored();
    return cache.records[skillId] ?? null;
  }

  async set(record: AiSkillAnalysisRecord): Promise<void> {
    const cache = await this.readStored();
    cache.records[record.skillId] = record;
    await this.writeStored(cache);
  }

  async setMany(records: AiSkillAnalysisRecord[]): Promise<void> {
    const cache = await this.readStored();
    for (const record of records) {
      cache.records[record.skillId] = record;
    }

    await this.writeStored(cache);
  }

  private async readStored(): Promise<StoredAiAnalysisCache> {
    try {
      const raw = await fs.readFile(this.cachePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<StoredAiAnalysisCache>;
      return {
        version: 1,
        records: parsed.records && typeof parsed.records === "object" ? parsed.records : {}
      };
    } catch {
      return { version: 1, records: {} };
    }
  }

  private async writeStored(cache: StoredAiAnalysisCache): Promise<void> {
    await fs.mkdir(path.dirname(this.cachePath), { recursive: true });
    await fs.writeFile(this.cachePath, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
  }
}
