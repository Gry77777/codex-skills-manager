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

  it("scans configured custom skill roots as manageable custom-local sources", async () => {
    const root = await makeTempDir();
    const customRoot = path.join(root, "custom-skills");
    const disabledRoot = path.join(root, "disabled-skills");
    await writeSkill(path.join(customRoot, "custom-one"), "custom-one", "Custom skill");
    await writeSkill(path.join(disabledRoot, "custom-disabled"), "custom-disabled", "Disabled custom skill");

    const scanner = new SkillScanner(skillRoots({
      customLocal: [
        { id: "custom-root", path: customRoot, label: "Team skills", enabled: true },
        { id: "disabled-root", path: disabledRoot, label: "Disabled skills", enabled: false }
      ]
    }));
    const result = await scanner.scanWithDiagnostics();
    const [skill] = result.skills;

    expect(skill).toMatchObject({
      name: "custom-one",
      source: "custom-local",
      readonly: false,
      canSetStatus: true
    });
    expect(result.diagnostics.roots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "custom-root",
          source: "custom-local",
          path: customRoot,
          scannedCount: 1
        })
      ])
    );
    expect(result.skills.some((record) => record.name === "custom-disabled")).toBe(false);
    expect(result.diagnostics.roots.some((rootDiagnostic) => rootDiagnostic.id === "disabled-root")).toBe(false);
  });

  it("returns scan diagnostics for every configured source root", async () => {
    const root = await makeTempDir();
    const codexRoot = path.join(root, ".codex", "skills");
    const pluginCacheRoot = path.join(root, ".codex", "plugins", "cache");
    const importedRoot = path.join(root, "imports");
    await writeSkill(path.join(codexRoot, "docs"), "docs", "Docs helper");
    await writeSkill(path.join(pluginCacheRoot, "openai", "skills", "security"), "security", "Security helper");

    const scanner = new SkillScanner(skillRoots({
      codexLocal: codexRoot,
      pluginCache: pluginCacheRoot,
      imported: importedRoot
    }));
    const result = await scanner.scanWithDiagnostics();

    expect(result.skills).toHaveLength(2);
    expect(result.diagnostics.totalScanned).toBe(2);
    expect(result.diagnostics.roots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ source: "codex-local", path: codexRoot, exists: true, scannedCount: 1 }),
        expect.objectContaining({ source: "plugin-cache", path: pluginCacheRoot, exists: true, scannedCount: 1 }),
        expect.objectContaining({ source: "imported", path: importedRoot, exists: false, scannedCount: 0 })
      ])
    );
    expect(result.diagnostics.roots.every((rootDiagnostic) => rootDiagnostic.lastScannedAt)).toBe(true);
  });

  it("reuses cached root scan records when the root fingerprint is unchanged", async () => {
    const root = await makeTempDir();
    const codexRoot = path.join(root, ".codex", "skills");
    const cachePath = path.join(root, "scan-cache.json");
    await writeSkill(path.join(codexRoot, "live"), "live", "Live skill");

    const scanner = new SkillScanner(skillRoots({ codexLocal: codexRoot }), { cachePath });
    await scanner.scanWithDiagnostics();

    const rawCache = JSON.parse(await fs.readFile(cachePath, "utf8")) as {
      entries: Record<string, { skills: Array<{ name: string }> }>;
    };
    const codexEntry = Object.values(rawCache.entries).find((entry) => entry.skills[0]?.name === "live");
    expect(codexEntry).toBeDefined();
    codexEntry!.skills[0]!.name = "cached-live";
    await fs.writeFile(cachePath, `${JSON.stringify(rawCache, null, 2)}\n`, "utf8");

    const cached = await scanner.scanWithDiagnostics();
    const codexDiagnostic = cached.diagnostics.roots.find((item) => item.source === "codex-local");

    expect(cached.skills.map((skill) => skill.name)).toContain("cached-live");
    expect(codexDiagnostic?.cacheHit).toBe(true);
  });

  it("invalidates cached root scan records when SKILL.md changes", async () => {
    const root = await makeTempDir();
    const codexRoot = path.join(root, ".codex", "skills");
    const cachePath = path.join(root, "scan-cache.json");
    const skillPath = path.join(codexRoot, "live");
    await writeSkill(skillPath, "live", "Live skill");

    const scanner = new SkillScanner(skillRoots({ codexLocal: codexRoot }), { cachePath });
    await scanner.scanWithDiagnostics();
    await fs.writeFile(path.join(skillPath, "SKILL.md"), "---\nname: changed\ndescription: Changed skill\n---\n", "utf8");

    const rescanned = await scanner.scanWithDiagnostics();
    const codexDiagnostic = rescanned.diagnostics.roots.find((item) => item.source === "codex-local");

    expect(rescanned.skills.map((skill) => skill.name)).toContain("changed");
    expect(codexDiagnostic?.cacheHit).toBe(false);
  });

  it("marks duplicate names with the selected source priority winner and shadowed records", async () => {
    const root = await makeTempDir();
    const codexRoot = path.join(root, ".codex", "skills");
    const agentRoot = path.join(root, ".agents", "skills");
    const pluginCacheRoot = path.join(root, ".codex", "plugins", "cache");
    const importedRoot = path.join(root, "imports");
    await writeSkill(path.join(pluginCacheRoot, "plugin", "skills", "review"), "review", "Plugin review");
    await writeSkill(path.join(agentRoot, "review"), "review", "Agent review");
    await writeSkill(path.join(codexRoot, "review"), "review", "Codex review");
    await writeSkill(path.join(importedRoot, "review"), "review", "Imported review");

    const scanner = new SkillScanner(skillRoots({
      codexLocal: codexRoot,
      agentLocal: agentRoot,
      pluginCache: pluginCacheRoot,
      imported: importedRoot
    }));
    const skills = await scanner.scan();
    const winner = skills.find((skill) => skill.source === "imported");
    const shadowed = skills.filter((skill) => skill.source !== "imported");

    expect(winner?.conflict?.role).toBe("primary");
    expect(winner?.conflict?.sourcePriority).toBe(5);
    expect(winner?.issues.some((issue) => issue.code === "duplicate-name")).toBe(true);
    expect(shadowed).toHaveLength(3);
    expect(shadowed.every((skill) => skill.conflict?.role === "shadowed")).toBe(true);
    expect(shadowed.every((skill) => skill.conflict?.primarySkillId === winner?.id)).toBe(true);
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

  it("flags an empty description as a non-blocking skill quality issue", async () => {
    const root = await makeTempDir();
    const codexRoot = path.join(root, ".codex", "skills");
    const skillPath = path.join(codexRoot, "empty-description");
    await fs.mkdir(skillPath, { recursive: true });
    await fs.writeFile(
      path.join(skillPath, "SKILL.md"),
      "---\nname: empty-description\ndescription:   \n---\n\n# empty-description\n",
      "utf8"
    );

    const scanner = new SkillScanner(skillRoots({ codexLocal: codexRoot }));
    const [skill] = await scanner.scan();

    expect(skill.valid).toBe(true);
    expect(skill.status).toBe("enabled");
    expect(skill.issues.some((issue) => issue.code === "missing-description")).toBe(true);
  });

  it("flags missing relative references in SKILL.md as non-blocking quality issues", async () => {
    const root = await makeTempDir();
    const codexRoot = path.join(root, ".codex", "skills");
    const skillPath = path.join(codexRoot, "missing-reference");
    await fs.mkdir(path.join(skillPath, "references"), { recursive: true });
    await fs.writeFile(path.join(skillPath, "references", "existing.md"), "# Existing\n", "utf8");
    await fs.writeFile(
      path.join(skillPath, "SKILL.md"),
      [
        "---",
        "name: missing-reference",
        "description: Checks links",
        "---",
        "",
        "Read [existing](references/existing.md) and [missing](references/missing.md).",
        "Run `scripts/setup.ps1` before use.",
        "Ignore https://example.com/external.md and #heading."
      ].join("\n"),
      "utf8"
    );

    const scanner = new SkillScanner(skillRoots({ codexLocal: codexRoot }));
    const [skill] = await scanner.scan();

    expect(skill.valid).toBe(true);
    expect(skill.issues.filter((issue) => issue.code === "missing-reference")).toHaveLength(2);
    expect(skill.issues.map((issue) => issue.message).join("\n")).toContain("references/missing.md");
    expect(skill.issues.map((issue) => issue.message).join("\n")).toContain("scripts/setup.ps1");
  });

  it("marks unsafe skill directory names as invalid", async () => {
    const root = await makeTempDir();
    const codexRoot = path.join(root, ".codex", "skills");
    const unsafePath = path.join(codexRoot, "bad%2Fname");
    await writeSkill(unsafePath, "bad-name", "Bad path");

    const scanner = new SkillScanner(skillRoots({ codexLocal: codexRoot }));
    const [skill] = await scanner.scan();

    expect(skill.valid).toBe(false);
    expect(skill.status).toBe("invalid");
    expect(skill.issues.some((issue) => issue.code === "unsafe-skill-path")).toBe(true);
  });

  it("flags bundled child skills under a parent skill as a nested structure issue", async () => {
    const root = await makeTempDir();
    const codexRoot = path.join(root, ".codex", "skills");
    const parentPath = path.join(codexRoot, "toolkit");
    const childPath = path.join(parentPath, "child");
    await writeSkill(parentPath, "toolkit", "Parent skill");
    await writeSkill(childPath, "toolkit-child", "Child skill");

    const scanner = new SkillScanner(skillRoots({ codexLocal: codexRoot }));
    const skills = await scanner.scan();

    expect(skills).toHaveLength(2);
    expect(skills.every((skill) => skill.valid)).toBe(true);
    expect(skills.some((skill) => skill.issues.some((issue) => issue.code === "nested-skill"))).toBe(true);
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
    customLocal: [],
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
