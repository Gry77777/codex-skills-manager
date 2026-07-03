import { promises as fs } from "node:fs";
import path from "node:path";
import { parseFrontmatter, type Frontmatter } from "./skill-frontmatter.js";

export type SkillDiskKind = "enabled" | "disabled" | "conflict" | "missing" | "path-missing";

export type SkillMarkdownFile = {
  path: string;
  fileName: "SKILL.md" | "SKILL.md.disabled";
  markdown: string;
  frontmatter: Frontmatter;
};

export type SkillDiskState = {
  directory: string;
  activePath: string;
  disabledPath: string;
  kind: SkillDiskKind;
  active: SkillMarkdownFile | null;
  disabled: SkillMarkdownFile | null;
};

export async function readSkillDiskState(skillPath: string): Promise<SkillDiskState> {
  const directory = path.resolve(skillPath);
  const activePath = path.join(directory, "SKILL.md");
  const disabledPath = path.join(directory, "SKILL.md.disabled");

  if (!(await isDirectory(directory))) {
    return {
      directory,
      activePath,
      disabledPath,
      kind: "path-missing",
      active: null,
      disabled: null
    };
  }

  const [active, disabled] = await Promise.all([
    readSkillMarkdown(activePath, "SKILL.md"),
    readSkillMarkdown(disabledPath, "SKILL.md.disabled")
  ]);

  let kind: SkillDiskKind = "missing";
  if (active && disabled) {
    kind = "conflict";
  } else if (active) {
    kind = "enabled";
  } else if (disabled) {
    kind = "disabled";
  }

  return {
    directory,
    activePath,
    disabledPath,
    kind,
    active,
    disabled
  };
}

export function getPrimarySkillMarkdown(state: SkillDiskState): SkillMarkdownFile | null {
  return state.active ?? state.disabled;
}

export function hasUsableFrontmatter(file: SkillMarkdownFile | null): boolean {
  return Boolean(file?.frontmatter.valid && file.frontmatter.name?.trim());
}

async function readSkillMarkdown(
  filePath: string,
  fileName: SkillMarkdownFile["fileName"]
): Promise<SkillMarkdownFile | null> {
  try {
    const markdown = await fs.readFile(filePath, "utf8");
    return {
      path: filePath,
      fileName,
      markdown,
      frontmatter: parseFrontmatter(markdown)
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

async function isDirectory(targetPath: string): Promise<boolean> {
  try {
    return (await fs.stat(targetPath)).isDirectory();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }

    throw error;
  }
}
