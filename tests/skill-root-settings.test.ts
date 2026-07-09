import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SkillRootSettingsStore } from "../src/main/skill-root-settings.js";

const tempDirs: string[] = [];

describe("SkillRootSettingsStore", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("saves normalized custom skill roots with stable ids", async () => {
    const root = await makeTempDir();
    const settingsPath = path.join(root, "root-settings.json");
    const customRoot = path.join(root, "custom-skills");
    await fs.mkdir(customRoot, { recursive: true });

    const store = new SkillRootSettingsStore(settingsPath);
    const saved = await store.save({
      customRoots: [
        { path: customRoot, label: "  Team skills  ", enabled: false },
        { path: `${customRoot}${path.sep}` },
        { path: "   " }
      ]
    });
    const reloaded = await store.read();

    expect(saved.customRoots).toHaveLength(1);
    expect(saved.customRoots[0]).toMatchObject({
      id: expect.any(String),
      path: path.resolve(customRoot),
      label: "Team skills",
      enabled: false
    });
    expect(reloaded).toEqual(saved);
  });
});

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "skill-root-settings-"));
  tempDirs.push(dir);
  return dir;
}
