import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SkillRepairer } from "../src/main/skill-repairer.js";
import type { RegistryFile, SkillRecord } from "../src/shared/types.js";

const tempDirs: string[] = [];

describe("SkillRepairer", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("repairs missing frontmatter by prepending a safe header", async () => {
    const root = await makeTempDir();
    const skillPath = path.join(root, "broken-skill");
    await fs.mkdir(skillPath, { recursive: true });
    await fs.writeFile(path.join(skillPath, "SKILL.md"), "# Broken skill\n\nUse carefully.\n", "utf8");

    const repairer = new SkillRepairer(path.join(root, "registry.json"));
    const summary = await repairer.repair([
      record({
        id: "broken",
        name: "broken-skill",
        path: skillPath,
        status: "invalid",
        valid: false,
        issues: [{ code: "invalid-frontmatter", message: "missing name" }]
      })
    ]);

    const repaired = await fs.readFile(path.join(skillPath, "SKILL.md"), "utf8");
    expect(summary.repaired).toBe(1);
    expect(repaired.startsWith("---\nname: broken-skill\ndescription:")).toBe(true);
  });

  it("resolves SKILL.md and SKILL.md.disabled conflicts by backing up the disabled file when active is valid", async () => {
    const root = await makeTempDir();
    const skillPath = path.join(root, "conflict-skill");
    await writeSkillFile(skillPath, "SKILL.md", "conflict-skill", "active");
    await writeSkillFile(skillPath, "SKILL.md.disabled", "conflict-skill", "disabled");

    const repairer = new SkillRepairer(path.join(root, "registry.json"));
    const summary = await repairer.repair([
      record({
        id: "conflict",
        name: "conflict-skill",
        path: skillPath,
        status: "invalid",
        valid: false,
        issues: [{ code: "skill-md-conflict", message: "conflict" }]
      })
    ]);

    const files = await fs.readdir(skillPath);
    expect(summary.repaired).toBe(1);
    expect(files).toContain("SKILL.md");
    expect(files).not.toContain("SKILL.md.disabled");
    expect(files.some((file) => file.startsWith("SKILL.md.disabled.backup-"))).toBe(true);
  });

  it("restores the disabled file when the active file in a conflict is invalid", async () => {
    const root = await makeTempDir();
    const skillPath = path.join(root, "restore-disabled");
    await fs.mkdir(skillPath, { recursive: true });
    await fs.writeFile(path.join(skillPath, "SKILL.md"), "# invalid\n", "utf8");
    await writeSkillFile(skillPath, "SKILL.md.disabled", "restore-disabled", "usable");

    const repairer = new SkillRepairer(path.join(root, "registry.json"));
    const summary = await repairer.repair([
      record({
        id: "restore",
        name: "restore-disabled",
        path: skillPath,
        status: "invalid",
        valid: false,
        issues: [{ code: "skill-md-conflict", message: "conflict" }]
      })
    ]);

    const active = await fs.readFile(path.join(skillPath, "SKILL.md"), "utf8");
    const files = await fs.readdir(skillPath);
    expect(summary.repaired).toBe(1);
    expect(active).toContain("name: restore-disabled");
    expect(files).not.toContain("SKILL.md.disabled");
    expect(files.some((file) => file.startsWith("SKILL.md.backup-"))).toBe(true);
  });

  it("removes path-missing records from registry without deleting any directory", async () => {
    const root = await makeTempDir();
    const registryPath = path.join(root, "registry.json");
    const missingPath = path.join(root, "already-deleted");
    const registry: RegistryFile = {
      version: 1,
      records: {
        missing: {
          id: "missing",
          path: missingPath,
          source: "codex-local",
          status: "enabled",
          hash: "old",
          lastSeenAt: "2026-07-02T00:00:00.000Z"
        }
      }
    };
    await fs.writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`, "utf8");

    const repairer = new SkillRepairer(registryPath);
    const summary = await repairer.repair([
      record({
        id: "missing",
        path: missingPath,
        status: "invalid",
        valid: false,
        issues: [{ code: "path-missing", message: "missing" }]
      })
    ]);

    const repairedRegistry = JSON.parse(await fs.readFile(registryPath, "utf8")) as RegistryFile;
    expect(summary.repaired).toBe(1);
    expect(repairedRegistry.records.missing).toBeUndefined();
  });

  it("skips directories that contain neither SKILL.md nor SKILL.md.disabled", async () => {
    const root = await makeTempDir();
    const skillPath = path.join(root, "empty-skill");
    await fs.mkdir(skillPath, { recursive: true });

    const repairer = new SkillRepairer(path.join(root, "registry.json"));
    const summary = await repairer.repair([
      record({
        id: "empty",
        name: "empty-skill",
        path: skillPath,
        status: "invalid",
        valid: false,
        issues: [{ code: "missing-skill-md", message: "missing" }]
      })
    ]);

    expect(summary.repaired).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(await fs.readdir(skillPath)).toEqual([]);
  });
});

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "skill-repairer-"));
  tempDirs.push(dir);
  return dir;
}

async function writeSkillFile(skillPath: string, fileName: string, name: string, description: string): Promise<void> {
  await fs.mkdir(skillPath, { recursive: true });
  await fs.writeFile(
    path.join(skillPath, fileName),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`,
    "utf8"
  );
}

function record(overrides: Partial<SkillRecord>): SkillRecord {
  return {
    id: "skill",
    name: "skill",
    description: "description",
    summaryZh: "用于测试。",
    path: "C:\\skill",
    source: "codex-local",
    status: "enabled",
    readonly: true,
    canSetStatus: true,
    valid: true,
    issues: [],
    hash: "hash",
    lastScannedAt: "2026-07-02T00:00:00.000Z",
    ...overrides
  };
}
