import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SkillScanner } from "../src/main/skill-scanner.js";
import type { SkillRoots } from "../src/main/paths.js";

const tempDirs: string[] = [];

describe("SkillScanner", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("scans codex and agent skill roots without collapsing duplicate names", async () => {
    const root = await makeTempDir();
    const codexRoot = path.join(root, ".codex", "skills");
    const agentRoot = path.join(root, ".agents", "skills");
    const importedRoot = path.join(root, "imports");

    await writeSkill(path.join(codexRoot, "shared-name"), "shared", "Codex skill");
    await writeSkill(path.join(agentRoot, "shared-name"), "shared", "Agent skill");

    const scanner = new SkillScanner(skillRoots({ codexLocal: codexRoot, agentLocal: agentRoot, imported: importedRoot }));
    const skills = await scanner.scan();

    expect(skills).toHaveLength(2);
    expect(new Set(skills.map((skill) => skill.id)).size).toBe(2);
    expect(skills.every((skill) => skill.issues.some((issue) => issue.code === "duplicate-name"))).toBe(true);
  });

  it("marks directories without SKILL.md as invalid", async () => {
    const root = await makeTempDir();
    const codexRoot = path.join(root, ".codex", "skills");
    const invalidPath = path.join(codexRoot, "missing-md");
    await fs.mkdir(invalidPath, { recursive: true });

    const scanner = new SkillScanner(skillRoots({ codexLocal: codexRoot }));
    const [skill] = await scanner.scan();

    expect(skill.valid).toBe(false);
    expect(skill.status).toBe("invalid");
    expect(skill.issues[0]?.code).toBe("missing-skill-md");
    expect(skill.summaryZh).toContain("缺少 SKILL.md");
  });

  it("scans nested grouped skill directories instead of treating the group as a skill", async () => {
    const root = await makeTempDir();
    const codexRoot = path.join(root, ".codex", "skills");
    await writeSkill(path.join(codexRoot, ".system", "imagegen"), "imagegen", "Generate images");

    const scanner = new SkillScanner(skillRoots({ codexLocal: codexRoot }));
    const [skill] = await scanner.scan();

    expect(skill.name).toBe("imagegen");
    expect(skill.path).toContain(path.join(".system", "imagegen"));
    expect(skill.summaryZh).toContain("图片");
  });

  it("keeps scanning inside a skill directory to discover bundled child skills", async () => {
    const root = await makeTempDir();
    const codexRoot = path.join(root, ".codex", "skills");
    const parentPath = path.join(codexRoot, "paper-toolkit");
    const childPath = path.join(parentPath, "docx");
    await writeSkill(parentPath, "paper-toolkit", "Parent skill");
    await writeSkill(childPath, "paper-toolkit-docx", "Child skill");

    const scanner = new SkillScanner(skillRoots({ codexLocal: codexRoot }));
    const skills = await scanner.scan();

    expect(skills.map((skill) => skill.name).sort()).toEqual(["paper-toolkit", "paper-toolkit-docx"]);
    expect(skills.map((skill) => skill.path)).toEqual(expect.arrayContaining([parentPath, childPath]));
  });

  it("scans superpowers and plugin cache roots with source-specific management boundaries", async () => {
    const root = await makeTempDir();
    const superpowersRoot = path.join(root, ".codex", "superpowers", "skills");
    const pluginCacheRoot = path.join(root, ".codex", "plugins", "cache");
    await writeSkill(path.join(superpowersRoot, "test-driven-development"), "test-driven-development", "TDD workflow");
    await writeSkill(
      path.join(pluginCacheRoot, "openai-curated-remote", "codex-security", "0.1.10", "skills", "security-scan"),
      "security-scan",
      "Security scan"
    );

    const scanner = new SkillScanner(skillRoots({
      codexLocal: "missing",
      agentLocal: "missing",
      imported: "missing",
      superpowersLocal: superpowersRoot,
      pluginCache: pluginCacheRoot
    }));
    const skills = await scanner.scan();

    expect(skills.map((skill) => [skill.name, skill.source, skill.readonly]).sort()).toEqual([
      ["security-scan", "plugin-cache", true],
      ["test-driven-development", "superpowers-local", false]
    ]);
  });

  it("treats SKILL.md.disabled as a valid disabled skill", async () => {
    const root = await makeTempDir();
    const codexRoot = path.join(root, ".codex", "skills");
    const skillPath = path.join(codexRoot, "disabled-skill");
    await writeSkill(skillPath, "disabled-skill", "Disabled skill");
    await fs.rename(path.join(skillPath, "SKILL.md"), path.join(skillPath, "SKILL.md.disabled"));

    const scanner = new SkillScanner(skillRoots({ codexLocal: codexRoot }));
    const [skill] = await scanner.scan();

    expect(skill.valid).toBe(true);
    expect(skill.status).toBe("disabled");
    expect(skill.name).toBe("disabled-skill");
    expect(skill.summaryZh).toContain("技能");
  });

  it("marks active and disabled markdown conflicts as invalid", async () => {
    const root = await makeTempDir();
    const codexRoot = path.join(root, ".codex", "skills");
    const skillPath = path.join(codexRoot, "conflict-skill");
    await writeSkill(skillPath, "conflict-skill", "Active skill");
    await fs.writeFile(
      path.join(skillPath, "SKILL.md.disabled"),
      "---\nname: conflict-skill\ndescription: Disabled skill\n---\n",
      "utf8"
    );

    const scanner = new SkillScanner(skillRoots({ codexLocal: codexRoot }));
    const [skill] = await scanner.scan();

    expect(skill.valid).toBe(false);
    expect(skill.status).toBe("invalid");
    expect(skill.issues.some((issue) => issue.code === "skill-md-conflict")).toBe(true);
  });

  it("handles unicode and spaced paths", async () => {
    const root = await makeTempDir();
    const codexRoot = path.join(root, "技能 skills");
    await writeSkill(path.join(codexRoot, "视觉 skill"), "visual-skill", "Unicode path");

    const scanner = new SkillScanner(skillRoots({ codexLocal: codexRoot }));
    const [skill] = await scanner.scan();

    expect(skill.name).toBe("visual-skill");
    expect(skill.valid).toBe(true);
  });
});

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "skills-scanner-"));
  tempDirs.push(dir);
  return dir;
}

function skillRoots(overrides: Partial<SkillRoots>): SkillRoots {
  return {
    codexLocal: "missing",
    agentLocal: "missing",
    superpowersLocal: "missing",
    pluginCache: "missing",
    imported: "missing",
    ...overrides
  };
}

async function writeSkill(skillPath: string, name: string, description: string): Promise<void> {
  await fs.mkdir(skillPath, { recursive: true });
  await fs.writeFile(
    path.join(skillPath, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`,
    "utf8"
  );
}
