import { describe, expect, it, vi } from "vitest";
import { SkillsController } from "../src/main/skills-controller.js";
import type { SkillRecord } from "../src/shared/types.js";

describe("SkillsController", () => {
  it("keeps successful GitHub imports when a later candidate fails", async () => {
    const controller = new SkillsController();
    const importedSkill = record("imported-one");
    let calls = 0;

    vi.spyOn(controller, "scan").mockResolvedValue([importedSkill]);
    Object.defineProperty(controller, "importer", {
      value: {
        importGitHubUrl: vi.fn(async () => {
          calls += 1;
          if (calls === 2) {
            throw new Error("403 rate limit exceeded");
          }

          return importedSkill;
        })
      }
    });

    const imported = await controller.importGitHubUrls([
      "https://github.com/acme/repo/tree/main/skills/one",
      "https://github.com/acme/repo/tree/main/skills/two"
    ]);

    expect(imported).toEqual([importedSkill]);
    expect(controller.scan).toHaveBeenCalledOnce();
  });

  it("fails a GitHub import batch when no candidate can be imported", async () => {
    const controller = new SkillsController();

    vi.spyOn(controller, "scan").mockResolvedValue([]);
    Object.defineProperty(controller, "importer", {
      value: {
        importGitHubUrl: vi.fn(async () => {
          throw new Error("403 rate limit exceeded");
        })
      }
    });

    await expect(controller.importGitHubUrls(["https://github.com/acme/repo"])).rejects.toThrow("403 rate limit exceeded");
    expect(controller.scan).not.toHaveBeenCalled();
  });
});

function record(id: string): SkillRecord {
  return {
    id,
    name: id,
    description: "",
    summaryZh: "",
    path: `C:\\tmp\\${id}`,
    source: "imported",
    status: "disabled",
    readonly: false,
    valid: true,
    issues: [],
    hash: id,
    lastScannedAt: "2026-07-04T00:00:00.000Z"
  };
}
