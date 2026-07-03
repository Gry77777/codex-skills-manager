import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SkillImporter } from "../src/main/skill-importer.js";

const tempDirs: string[] = [];

describe("SkillImporter", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("imports a local skill folder as disabled", async () => {
    const root = await makeTempDir();
    const source = path.join(root, "source skill");
    const imports = path.join(root, "imports");
    await writeSkill(source, "imported skill");
    await fs.writeFile(path.join(source, "notes.txt"), "content", "utf8");

    const importer = new SkillImporter(imports);
    const imported = await importer.importFolder(source);

    expect(imported.status).toBe("disabled");
    expect(imported.source).toBe("imported");
    expect(await fileExists(path.join(imported.path, "SKILL.md"))).toBe(false);
    expect(await fileExists(path.join(imported.path, "SKILL.md.disabled"))).toBe(true);
    expect(await fileExists(path.join(imported.path, "notes.txt"))).toBe(true);
  });

  it("rejects folders without SKILL.md", async () => {
    const root = await makeTempDir();
    const source = path.join(root, "source");
    await fs.mkdir(source, { recursive: true });

    const importer = new SkillImporter(path.join(root, "imports"));

    await expect(importer.importFolder(source)).rejects.toThrow("SKILL.md");
  });

  it("imports a GitHub skill folder as a disabled managed copy", async () => {
    const root = await makeTempDir();
    const imports = path.join(root, "imports");
    const markdown = "---\nname: github-skill\ndescription: GitHub imported skill\n---\nUse it.\n";

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const href = String(url);

        if (href.includes("/contents/skills/github-skill/SKILL.md?")) {
          return jsonResponse({
            type: "file",
            name: "SKILL.md",
            path: "skills/github-skill/SKILL.md",
            download_url: "https://raw.example/SKILL.md",
            size: markdown.length
          });
        }

        if (href.includes("/contents/skills/github-skill?")) {
          return jsonResponse([
            {
              type: "file",
              name: "SKILL.md",
              path: "skills/github-skill/SKILL.md",
              download_url: "https://raw.example/SKILL.md",
              size: markdown.length
            },
            {
              type: "file",
              name: "README.md",
              path: "skills/github-skill/README.md",
              download_url: "https://raw.example/README.md",
              size: 8
            }
          ]);
        }

        if (href === "https://raw.example/SKILL.md") {
          return textResponse(markdown);
        }

        if (href === "https://raw.example/README.md") {
          return textResponse("readme");
        }

        return new Response("not found", { status: 404, statusText: "Not Found" });
      })
    );

    const importer = new SkillImporter(imports);
    const imported = await importer.importGitHubUrl("https://github.com/acme/repo/tree/main/skills/github-skill");

    expect(imported.name).toBe("github-skill");
    expect(imported.status).toBe("disabled");
    expect(imported.source).toBe("imported");
    expect(await fileExists(path.join(imported.path, "SKILL.md"))).toBe(false);
    expect(await fileExists(path.join(imported.path, "SKILL.md.disabled"))).toBe(true);
    expect(await fileExists(path.join(imported.path, "README.md"))).toBe(true);
  });

  it("discovers skills from a repository markdown GitHub link", async () => {
    const root = await makeTempDir();
    const imports = path.join(root, "imports");
    const cliMarkdown = "---\nname: gitnexus-cli\ndescription: Run GitNexus CLI commands\n---\nUse it.\n";
    const debuggingMarkdown =
      "---\nname: gitnexus-debugging\ndescription: Debug GitNexus indexed repositories\n---\nUse it.\n";

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const href = String(url);

        if (href === "https://api.github.com/repos/acme/repo") {
          return jsonResponse({ default_branch: "main" });
        }

        if (href === "https://api.github.com/repos/acme/repo/git/trees/main?recursive=1") {
          return jsonResponse({
            tree: [
              { type: "blob", path: "README.md" },
              { type: "blob", path: ".claude/skills/gitnexus/gitnexus-cli/SKILL.md" },
              { type: "blob", path: ".claude/skills/gitnexus/gitnexus-debugging/SKILL.md" },
              { type: "blob", path: "docs/SKILL.md.disabled" }
            ],
            truncated: false
          });
        }

        if (href.includes("/contents/.claude/skills/gitnexus/gitnexus-cli/SKILL.md?")) {
          return jsonResponse({
            type: "file",
            name: "SKILL.md",
            path: ".claude/skills/gitnexus/gitnexus-cli/SKILL.md",
            download_url: "https://raw.example/gitnexus-cli/SKILL.md",
            size: cliMarkdown.length
          });
        }

        if (href.includes("/contents/.claude/skills/gitnexus/gitnexus-debugging/SKILL.md?")) {
          return jsonResponse({
            type: "file",
            name: "SKILL.md",
            path: ".claude/skills/gitnexus/gitnexus-debugging/SKILL.md",
            download_url: "https://raw.example/gitnexus-debugging/SKILL.md",
            size: debuggingMarkdown.length
          });
        }

        if (href === "https://raw.example/gitnexus-cli/SKILL.md") {
          return textResponse(cliMarkdown);
        }

        if (href === "https://raw.example/gitnexus-debugging/SKILL.md") {
          return textResponse(debuggingMarkdown);
        }

        return new Response("not found", { status: 404, statusText: "Not Found" });
      })
    );

    const importer = new SkillImporter(imports);
    const result = await importer.discoverGitHubSkills("[acme/repo](https://github.com/acme/repo)");

    expect(result.repository).toBe("acme/repo");
    expect(result.ref).toBe("main");
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates.map((candidate) => candidate.name)).toEqual(["Gitnexus Cli", "Gitnexus Debugging"]);
    expect(result.candidates.every((candidate) => candidate.valid)).toBe(true);
    expect(result.candidates.every((candidate) => candidate.description.includes("导入时"))).toBe(true);
    expect(result.candidates[0].sourceUrl).toBe(
      "https://github.com/acme/repo/tree/main/.claude/skills/gitnexus/gitnexus-cli"
    );
    expect(fetch).not.toHaveBeenCalledWith("https://raw.example/gitnexus-cli/SKILL.md", expect.anything());
    expect(fetch).not.toHaveBeenCalledWith("https://raw.example/gitnexus-debugging/SKILL.md", expect.anything());
  });

  it("does not overwrite an existing imported skill folder", async () => {
    const root = await makeTempDir();
    const sourceOne = path.join(root, "source-one");
    const sourceTwo = path.join(root, "source-two");
    const imports = path.join(root, "imports");
    await writeSkill(sourceOne, "same");
    await writeSkill(sourceTwo, "same");

    const importer = new SkillImporter(imports);
    const first = await importer.importFolder(sourceOne);
    const second = await importer.importFolder(sourceTwo);

    expect(first.path).not.toBe(second.path);
  });

  it("bulk imports local skills preserving source status and syncs repeated sources", async () => {
    const root = await makeTempDir();
    const codexRoot = path.join(root, "codex-skills");
    const agentRoot = path.join(root, "agent-skills");
    const imports = path.join(root, "imports");
    await writeSkill(path.join(codexRoot, "codex-one"), "codex-one");
    await writeSkill(path.join(agentRoot, "agent-one"), "agent-one");
    await fs.rename(
      path.join(agentRoot, "agent-one", "SKILL.md"),
      path.join(agentRoot, "agent-one", "SKILL.md.disabled")
    );

    const importer = new SkillImporter(imports);
    const first = await importer.importLocalSkills([
      { source: "codex-local", path: codexRoot },
      { source: "agent-local", path: agentRoot }
    ]);
    const second = await importer.importLocalSkills([
      { source: "codex-local", path: codexRoot },
      { source: "agent-local", path: agentRoot }
    ]);

    expect(first.imported).toBe(2);
    expect(first.synced).toBe(0);
    expect(first.failed).toBe(0);
    expect(second.imported).toBe(0);
    expect(second.synced).toBe(2);
    expect(second.skipped).toBe(0);

    const importedSkillFiles = await findFiles(imports, "SKILL.md.disabled");
    const activeSkillFiles = await findFiles(imports, "SKILL.md");
    const manifests = await findFiles(imports, ".codex-skills-manager.json");

    expect(importedSkillFiles).toHaveLength(1);
    expect(activeSkillFiles).toHaveLength(1);
    expect(manifests).toHaveLength(2);
  });

  it("syncs an existing disabled managed copy back to enabled when the source is enabled", async () => {
    const root = await makeTempDir();
    const codexRoot = path.join(root, "codex-skills");
    const source = path.join(codexRoot, "codex-one");
    const imports = path.join(root, "imports");
    const managed = path.join(imports, "managed-codex-one");
    await writeSkill(source, "codex-one");
    await writeSkill(managed, "codex-one");
    await fs.rename(path.join(managed, "SKILL.md"), path.join(managed, "SKILL.md.disabled"));
    await fs.writeFile(
      path.join(managed, ".codex-skills-manager.json"),
      `${JSON.stringify({ source: "codex-local", sourcePath: source, originalName: "codex-one" }, null, 2)}\n`,
      "utf8"
    );

    const importer = new SkillImporter(imports);
    const summary = await importer.importLocalSkills([{ source: "codex-local", path: codexRoot }]);

    expect(summary.imported).toBe(0);
    expect(summary.synced).toBe(1);
    expect(await fileExists(path.join(managed, "SKILL.md"))).toBe(true);
    expect(await fileExists(path.join(managed, "SKILL.md.disabled"))).toBe(false);
  });

  it("bulk imports skills inside grouped local folders", async () => {
    const root = await makeTempDir();
    const codexRoot = path.join(root, "codex-skills");
    const imports = path.join(root, "imports");
    await writeSkill(path.join(codexRoot, ".system", "imagegen"), "imagegen");
    await writeSkill(path.join(codexRoot, "ok-skills", "browser-trace"), "browser-trace");

    const importer = new SkillImporter(imports);
    const summary = await importer.importLocalSkills([{ source: "codex-local", path: codexRoot }]);

    expect(summary.imported).toBe(2);
    expect(summary.failed).toBe(0);
    expect(await findFiles(imports, "SKILL.md")).toHaveLength(2);
  });
});

async function makeTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "skills-importer-"));
  tempDirs.push(dir);
  return dir;
}

async function writeSkill(skillPath: string, name: string): Promise<void> {
  await fs.mkdir(skillPath, { recursive: true });
  await fs.writeFile(path.join(skillPath, "SKILL.md"), `---\nname: ${name}\ndescription: Imported\n---\n`, "utf8");
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function findFiles(root: string, filename: string): Promise<string[]> {
  const matches: string[] = [];

  async function walk(current: string): Promise<void> {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
      } else if (entry.name === filename) {
        matches.push(entryPath);
      }
    }
  }

  await walk(root);
  return matches;
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}

function textResponse(value: string): Response {
  return new Response(value, {
    status: 200,
    headers: { "Content-Type": "text/plain" }
  });
}
