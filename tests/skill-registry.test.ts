import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SkillRegistry } from "../src/main/skill-registry.js";
import type { SkillRecord } from "../src/shared/types.js";

const tempDirs: string[] = [];

describe("SkillRegistry", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("uses scanned physical status after rescan", async () => {
    const registry = new SkillRegistry(await registryPath());
    const scanned = [record({ id: "one", status: "enabled" })];

    await registry.list(scanned);
    await registry.setStatus(scanned, "one", "disabled");
    const [afterRescan] = await registry.list([record({ id: "one", status: "enabled", hash: "changed" })]);

    expect(afterRescan.status).toBe("enabled");
    expect(afterRescan.hash).toBe("changed");
  });

  it("marks persisted records as path-missing when no scan result exists", async () => {
    const registry = new SkillRegistry(await registryPath());
    await registry.list([record({ id: "missing-later", path: "C:\\missing-later" })]);

    const [missing] = await registry.list([]);

    expect(missing.valid).toBe(false);
    expect(missing.status).toBe("invalid");
    expect(missing.issues[0]?.code).toBe("path-missing");
  });

  it("does not override scanned imported status", async () => {
    const registry = new SkillRegistry(await registryPath());
    const [imported] = await registry.list([record({ id: "imported", source: "imported", status: "enabled" })]);

    expect(imported.status).toBe("enabled");
  });
});

async function registryPath(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "skills-registry-"));
  tempDirs.push(dir);
  return path.join(dir, "registry.json");
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
    valid: true,
    issues: [],
    hash: "hash",
    lastScannedAt: "2026-07-02T00:00:00.000Z",
    ...overrides
  };
}
