import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { setPhysicalSkillStatus } from "../src/main/physical-skill-status.js";
import type { SkillRecord } from "../src/shared/types.js";

const tempDirs: string[] = [];

describe("setPhysicalSkillStatus", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("physically disables a skill by renaming SKILL.md", async () => {
    const skillPath = await makeSkill("toggle-test");

    await setPhysicalSkillStatus(record(skillPath), "disabled");

    expect(await exists(path.join(skillPath, "SKILL.md"))).toBe(false);
    expect(await exists(path.join(skillPath, "SKILL.md.disabled"))).toBe(true);
  });

  it("physically enables a skill by restoring SKILL.md", async () => {
    const skillPath = await makeSkill("toggle-test");
    await fs.rename(path.join(skillPath, "SKILL.md"), path.join(skillPath, "SKILL.md.disabled"));

    await setPhysicalSkillStatus(record(skillPath), "enabled");

    expect(await exists(path.join(skillPath, "SKILL.md"))).toBe(true);
    expect(await exists(path.join(skillPath, "SKILL.md.disabled"))).toBe(false);
  });

  it("rejects ambiguous active and disabled files", async () => {
    const skillPath = await makeSkill("conflict-test");
    await fs.writeFile(path.join(skillPath, "SKILL.md.disabled"), "disabled", "utf8");

    await expect(setPhysicalSkillStatus(record(skillPath), "disabled")).rejects.toThrow("同时存在");
  });
});

async function makeSkill(name: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "physical-skill-"));
  tempDirs.push(root);
  const skillPath = path.join(root, name);
  await fs.mkdir(skillPath, { recursive: true });
  await fs.writeFile(path.join(skillPath, "SKILL.md"), `---\nname: ${name}\n---\n`, "utf8");
  return skillPath;
}

function record(skillPath: string): SkillRecord {
  return {
    id: "id",
    name: "name",
    description: "",
    summaryZh: "用于测试。",
    path: skillPath,
    source: "codex-local",
    status: "enabled",
    readonly: true,
    canSetStatus: true,
    valid: true,
    issues: [],
    hash: "",
    lastScannedAt: "2026-07-02T00:00:00.000Z"
  };
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
