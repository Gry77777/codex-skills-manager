import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AiAnalysisCache } from "../src/main/ai-analysis-cache.js";
import type { AiSkillAnalysisRecord } from "../src/shared/types.js";

describe("AiAnalysisCache", () => {
  it("stores analysis records and overwrites stale records by skill id", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "ai-analysis-cache-"));
    const cache = new AiAnalysisCache(path.join(root, "cache.json"));
    const record = createRecord("skill-1", "hash-1", "old summary");

    await cache.set(record);
    expect(await cache.get("skill-1")).toEqual(record);

    const updated = createRecord("skill-1", "hash-2", "new summary");
    await cache.setMany([updated]);

    const view = await cache.read();
    expect(view.records["skill-1"]).toEqual(updated);
    expect(Object.keys(view.records)).toEqual(["skill-1"]);
  });
});

function createRecord(skillId: string, skillHash: string, summaryZh: string): AiSkillAnalysisRecord {
  return {
    skillId,
    skillHash,
    analyzedAt: "2026-07-03T00:00:00.000Z",
    provider: "minimax",
    model: "MiniMax-M3",
    analysis: {
      summaryZh,
      useCases: ["test"],
      tags: ["tag"],
      riskLevel: "low",
      risks: ["none"],
      dependencies: [],
      managementAdvice: ["review"],
      enableRecommendation: "review-first",
      confidence: 0.8
    }
  };
}
